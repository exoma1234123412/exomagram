import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { WorkCategory, GithubEventType } from "@/lib/types/database";
import { subDays } from "date-fns";

// ---------------------------------------------------------------------------
// Event type → category / title mapping
// ---------------------------------------------------------------------------

const EVENT_MAP: Record<
  GithubEventType,
  { category: WorkCategory; prefix: string }
> = {
  commit: { category: "deep_work", prefix: "Commit" },
  pr_opened: { category: "deep_work", prefix: "PR abierto" },
  pr_merged: { category: "review", prefix: "PR merged" },
  pr_reviewed: { category: "review", prefix: "Code review" },
  issue_opened: { category: "planning", prefix: "Issue creado" },
  issue_closed: { category: "admin", prefix: "Issue cerrado" },
};

// ---------------------------------------------------------------------------
// POST — Generate suggestions from GitHub events
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  const body = await request.json();
  const orgId = membership.org_id;
  const filterUserId: string | undefined = body.user_id;

  // Date range: last 7 days
  const since = subDays(new Date(), 7).toISOString().split("T")[0];

  // 1. Fetch uncaptured GitHub events
  let eventsQuery = supabase
    .from("github_events")
    .select("*")
    .eq("org_id", orgId)
    .gte("date", since)
    .order("date", { ascending: true })
    .order("hour", { ascending: true });

  if (filterUserId) {
    eventsQuery = eventsQuery.eq("user_id", filterUserId);
  }

  const { data: events, error: eventsError } = await eventsQuery;

  if (eventsError) {
    return NextResponse.json(
      { error: "Error al consultar eventos GitHub" },
      { status: 500 }
    );
  }

  if (!events || events.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // 2. Fetch existing time_entries for the same period to avoid duplicates
  let entriesQuery = supabase
    .from("time_entries")
    .select("user_id, date, hour")
    .eq("org_id", orgId)
    .gte("date", since);

  if (filterUserId) {
    entriesQuery = entriesQuery.eq("user_id", filterUserId);
  }

  const { data: existingEntries } = await entriesQuery;

  // Build a set of "user_id|date|hour" for quick lookup
  const existingSet = new Set(
    (existingEntries ?? []).map(
      (e) => `${e.user_id}|${e.date}|${e.hour}`
    )
  );

  // 3. Generate suggestions
  const suggestions = [];

  for (const event of events) {
    const mapping = EVENT_MAP[event.event_type as GithubEventType];
    if (!mapping) continue;

    const eventHour = event.hour ?? 9; // default to 9 if no hour
    const key = `${event.user_id}|${event.date}|${eventHour}`;

    // Skip if a time_entry already exists for that user+date+hour
    if (existingSet.has(key)) continue;

    suggestions.push({
      user_id: event.user_id,
      date: event.date,
      hour: eventHour,
      category: mapping.category,
      title: `${mapping.prefix}: ${event.title}`,
      description: event.repo ? `Repo: ${event.repo}` : null,
      source: "github" as const,
      source_url: event.url ?? null,
      github_event_id: event.id,
    });

    // Add to existing set so we don't suggest duplicates within the same batch
    existingSet.add(key);
  }

  return NextResponse.json({ suggestions });
}

// ---------------------------------------------------------------------------
// PUT — Accept suggestions and create time entries
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  const body = await request.json();
  const entries: {
    user_id: string;
    date: string;
    hour: number;
    category: WorkCategory;
    title: string;
    description?: string | null;
    proof_urls?: string[] | null;
  }[] = body.entries;

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json(
      { error: "Se requiere al menos una entrada" },
      { status: 400 }
    );
  }

  const orgId = membership.org_id;

  // Build rows for insert
  const rows = entries.map((entry) => ({
    user_id: entry.user_id,
    org_id: orgId,
    date: entry.date,
    hour: entry.hour,
    category: entry.category,
    title: entry.title,
    description: entry.description ?? null,
    proof_urls: entry.proof_urls ?? null,
    auto_captured: true,
    verification_status: "unverified" as const,
    is_late: false,
    minutes_late: 0,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("time_entries")
    .insert(rows)
    .select("id");

  if (insertError) {
    return NextResponse.json(
      { error: `Error al crear entradas: ${insertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    created: inserted?.length ?? 0,
  });
}
