import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// POST /api/log-events
//
// Receives batched client-side events via sendBeacon or fetch.
// Authenticates via Supabase session, then inserts into audit_log.
// Designed for speed — sendBeacon fires on page unload.

interface ClientEvent {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  data?: Record<string, unknown> | null;
  timestamp?: string;
}

// Valid actions we accept from the client.
// We map them to audit_log action types or store as-is.
const ALLOWED_ACTIONS = new Set([
  "entry_created",
  "entry_updated",
  "entry_deleted",
  "closeout_submitted",
  "standup_submitted",
  "reaction_added",
  "reaction_removed",
  "flag_created",
  "flag_resolved",
  "profile_updated",
  "member_joined",
  "member_removed",
  "goal_created",
  "goal_updated",
  "shoutout_given",
  // Extended client-side events
  "page_view",
  "feature_used",
  "button_clicked",
  "dialog_opened",
  "search_performed",
  "filter_applied",
  "timer_started",
  "timer_stopped",
  "ai_interaction",
  "error_occurred",
]);

export async function POST(request: NextRequest) {
  // ── 1. Authenticate via Supabase server client ──────────────
  const serverClient = await createServerSupabase();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // ── 2. Parse body ───────────────────────────────────────────
  let events: ClientEvent[];
  try {
    const body = await request.json();
    events = Array.isArray(body) ? body : body.events ? body.events : [body];
  } catch {
    return NextResponse.json(
      { error: "JSON invalido" },
      { status: 400 }
    );
  }

  if (events.length === 0) {
    return NextResponse.json({ success: true, inserted: 0 });
  }

  // Cap at 50 events per request to prevent abuse
  if (events.length > 50) {
    events = events.slice(0, 50);
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

  // ── 4. Build audit_log rows ─────────────────────────────────
  const rows: {
    org_id: string;
    user_id: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    new_data: Record<string, unknown> | null;
    old_data: null;
    ip_address: string | null;
  }[] = [];
  for (const evt of events) {
    if (!evt.action) continue;

    // Sanitize action — only allow known actions
    const action = ALLOWED_ACTIONS.has(evt.action)
      ? evt.action
      : "feature_used";

    rows.push({
      org_id: orgId,
      user_id: user.id,
      action,
      target_type: evt.targetType ?? null,
      target_id: evt.targetId ?? null,
      new_data: evt.data ?? null,
      old_data: null,
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ success: true, inserted: 0 });
  }

  // ── 5. Batch insert using service-role client ───────────────
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase.from("audit_log").insert(rows);

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
