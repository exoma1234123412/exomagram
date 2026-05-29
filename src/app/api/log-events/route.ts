import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// POST /api/log-events
//
// Receives batched client-side events via sendBeacon or fetch.
// Authenticates via Supabase session, then inserts into event_log.
// Designed for speed — sendBeacon fires on page unload.
//
// Uses event_log (not audit_log) because audit_log has a CHECK constraint
// that only allows a fixed set of actions. event_log is schema-flexible
// for high-volume client-side telemetry.

interface ClientEvent {
  event_type?: string;
  // Legacy field name support (from sendBeacon payloads)
  org_id?: string;
  user_id?: string;
  data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

// Max events per request to prevent abuse
const MAX_EVENTS_PER_REQUEST = 100;

export async function POST(request: NextRequest) {
  // ── 1. Parse body first (sendBeacon can't retry) ────────────
  let events: ClientEvent[];
  try {
    const body = await request.json();
    events = Array.isArray(body) ? body : [body];
  } catch {
    return NextResponse.json(
      { error: "JSON invalido" },
      { status: 400 }
    );
  }

  if (events.length === 0) {
    return NextResponse.json({ success: true, inserted: 0 });
  }

  if (events.length > MAX_EVENTS_PER_REQUEST) {
    events = events.slice(0, MAX_EVENTS_PER_REQUEST);
  }

  // ── 2. Authenticate via Supabase server client ──────────────
  const serverClient = await createServerSupabase();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // ── 3. Get user's org membership ────────────────────────────
  const { data: membership } = await serverClient
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "Sin organizacion" },
      { status: 403 }
    );
  }

  const orgId = membership.org_id;

  // ── 4. Build event_log rows ─────────────────────────────────
  // Server-side enforces user_id and org_id from the session,
  // ignoring any client-sent values (security).
  const rows = events
    .filter((evt) => evt.event_type)
    .map((evt) => ({
      org_id: orgId,
      user_id: user.id,
      event_type: evt.event_type!,
      data: evt.data ?? {},
      metadata: {
        ...(evt.metadata ?? {}),
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
    }));

  if (rows.length === 0) {
    return NextResponse.json({ success: true, inserted: 0 });
  }

  // ── 5. Batch insert using service-role client ───────────────
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase.from("event_log").insert(rows);

    if (error) {
      console.error("[log-events] Insert error:", error.message);
      return NextResponse.json(
        { error: "Error al guardar eventos" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, inserted: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("[log-events] Error:", msg);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
