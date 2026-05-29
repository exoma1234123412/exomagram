import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// AI Rate Limiting — in-memory, per-process
// ---------------------------------------------------------------------------
// Tracks requests per user per hour (max 30) and per org per hour (max 100).
// Returns null when the request is allowed, or a 429 Response when exceeded.
//
// Usage in any AI API route:
//   const limitCheck = await checkAIRateLimit(req);
//   if (limitCheck) return limitCheck;
// ---------------------------------------------------------------------------

const USER_LIMIT_PER_HOUR = 30;
const ORG_LIMIT_PER_HOUR = 100;

interface RateBucket {
  count: number;
  resetAt: number; // epoch ms
}

const userRequests = new Map<string, RateBucket>();
const orgRequests = new Map<string, RateBucket>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOrCreateBucket(
  map: Map<string, RateBucket>,
  key: string,
): RateBucket {
  const now = Date.now();
  const existing = map.get(key);

  if (existing && existing.resetAt > now) {
    return existing;
  }

  // New window — 1 hour from now
  const bucket: RateBucket = { count: 0, resetAt: now + 60 * 60 * 1000 };
  map.set(key, bucket);
  return bucket;
}

function buildLimitResponse(
  limit: number,
  remaining: number,
  resetAt: number,
  scope: "usuario" | "organizacion",
): Response {
  const resetSeconds = Math.ceil((resetAt - Date.now()) / 1000);

  return NextResponse.json(
    {
      error: `Limite de peticiones AI excedido (${scope}). Intenta de nuevo en ${Math.ceil(resetSeconds / 60)} minutos.`,
      retry_after_seconds: resetSeconds,
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(Math.max(remaining, 0)),
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
        "Retry-After": String(resetSeconds),
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Periodic cleanup — avoids unbounded Map growth
// ---------------------------------------------------------------------------

let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 10 * 60 * 1000; // every 10 min

function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, bucket] of userRequests) {
    if (bucket.resetAt <= now) userRequests.delete(key);
  }
  for (const [key, bucket] of orgRequests) {
    if (bucket.resetAt <= now) orgRequests.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check AI rate limits for the current request.
 *
 * @returns `null` if the request is within limits, or a `Response` (429) if
 *          the user or org has exceeded their hourly quota.
 *
 * Authentication is performed via Supabase server-side cookies (same pattern
 * the AI routes already use). If the user cannot be identified the request is
 * rejected with 401; if org membership cannot be resolved, 403.
 */
export async function checkAIRateLimit(
  _request: Request,
): Promise<Response | null> {
  maybeCleanup();

  // --- Authenticate --------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "No autenticado" },
      { status: 401 },
    );
  }

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "Sin organizacion" },
      { status: 403 },
    );
  }

  const userId = user.id;
  const orgId = membership.org_id;

  // --- Check user limit ----------------------------------------------------
  const userBucket = getOrCreateBucket(userRequests, userId);
  if (userBucket.count >= USER_LIMIT_PER_HOUR) {
    console.log(
      JSON.stringify({
        event: "ai_rate_limit_hit",
        scope: "user",
        userId,
        orgId,
        count: userBucket.count,
        limit: USER_LIMIT_PER_HOUR,
        resetAt: new Date(userBucket.resetAt).toISOString(),
      }),
    );
    return buildLimitResponse(
      USER_LIMIT_PER_HOUR,
      0,
      userBucket.resetAt,
      "usuario",
    );
  }

  // --- Check org limit -----------------------------------------------------
  const orgBucket = getOrCreateBucket(orgRequests, orgId);
  if (orgBucket.count >= ORG_LIMIT_PER_HOUR) {
    console.log(
      JSON.stringify({
        event: "ai_rate_limit_hit",
        scope: "org",
        userId,
        orgId,
        count: orgBucket.count,
        limit: ORG_LIMIT_PER_HOUR,
        resetAt: new Date(orgBucket.resetAt).toISOString(),
      }),
    );
    return buildLimitResponse(
      ORG_LIMIT_PER_HOUR,
      0,
      orgBucket.resetAt,
      "organizacion",
    );
  }

  // --- Allowed — increment counters ---------------------------------------
  userBucket.count++;
  orgBucket.count++;

  const userRemaining = USER_LIMIT_PER_HOUR - userBucket.count;
  const orgRemaining = ORG_LIMIT_PER_HOUR - orgBucket.count;

  console.log(
    JSON.stringify({
      event: "ai_request",
      userId,
      orgId,
      userCount: userBucket.count,
      userRemaining,
      orgCount: orgBucket.count,
      orgRemaining,
    }),
  );

  // Return null = "request is allowed, proceed"
  return null;
}

/**
 * Variant for cron / system routes that only need org-level limiting.
 * Authenticates via CRON_SECRET header instead of user cookies.
 *
 * @param orgId - The org to rate-limit against (caller provides it).
 * @returns `null` if allowed, or a `Response` (429) if the org exceeded its quota.
 */
export function checkAIOrgRateLimit(orgId: string): Response | null {
  maybeCleanup();

  const orgBucket = getOrCreateBucket(orgRequests, orgId);
  if (orgBucket.count >= ORG_LIMIT_PER_HOUR) {
    console.log(
      JSON.stringify({
        event: "ai_rate_limit_hit",
        scope: "org_cron",
        orgId,
        count: orgBucket.count,
        limit: ORG_LIMIT_PER_HOUR,
        resetAt: new Date(orgBucket.resetAt).toISOString(),
      }),
    );
    return buildLimitResponse(
      ORG_LIMIT_PER_HOUR,
      0,
      orgBucket.resetAt,
      "organizacion",
    );
  }

  orgBucket.count++;
  const orgRemaining = ORG_LIMIT_PER_HOUR - orgBucket.count;

  console.log(
    JSON.stringify({
      event: "ai_request_cron",
      orgId,
      orgCount: orgBucket.count,
      orgRemaining,
    }),
  );

  return null;
}
