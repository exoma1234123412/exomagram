import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type GroupBy = "person" | "date" | "category" | "day_of_week" | "hour";
type MetricKey =
  | "hours"
  | "proof_rate"
  | "trust_score"
  | "mood"
  | "energy"
  | "flags"
  | "streaks"
  | "closeouts"
  | "reactions"
  | "shoutouts"
  | "categories"
  | "late_rate";

interface ReportRequest {
  org_id: string;
  start_date: string;
  end_date: string;
  metrics: MetricKey[];
  group_by: GroupBy;
  filters: {
    user_ids: string[] | null;
    categories: string[] | null;
  };
  format: "json" | "csv";
  save_as: string | null;
}

// ── GET — list saved reports ────────────────────────────────────
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("org_id");
  if (!orgId) {
    return NextResponse.json({ error: "org_id requerido" }, { status: 400 });
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sin organizacion" }, { status: 403 });
  }

  const { data: reports, error } = await supabase
    .from("saved_reports")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, reports: reports ?? [] });
}

// ── POST — generate a report ───────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body: ReportRequest = await request.json();
  const { org_id, start_date, end_date, metrics, group_by, filters, format, save_as } = body;

  if (!org_id || !start_date || !end_date || !metrics?.length || !group_by) {
    return NextResponse.json({ error: "Campos requeridos faltantes" }, { status: 400 });
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .eq("org_id", org_id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sin organizacion" }, { status: 403 });
  }

  // ── Build time_entries query ──────────────────────────────────
  let entriesQuery = supabase
    .from("time_entries")
    .select("*")
    .eq("org_id", org_id)
    .gte("date", start_date)
    .lte("date", end_date);

  if (filters?.user_ids?.length) {
    entriesQuery = entriesQuery.in("user_id", filters.user_ids);
  }
  if (filters?.categories?.length) {
    entriesQuery = entriesQuery.in("category", filters.categories);
  }

  // ── Parallel queries ─────────────────────────────────────────
  const [
    { data: entries },
    { data: trustHistory },
    { data: closeouts },
    { data: flags },
    { data: streaks },
    { data: reactions },
    { data: shoutouts },
    { data: members },
  ] = await Promise.all([
    entriesQuery,
    supabase
      .from("trust_score_history")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", start_date)
      .lte("date", end_date),
    supabase
      .from("daily_closeouts")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", start_date)
      .lte("date", end_date),
    supabase
      .from("accountability_flags")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", start_date)
      .lte("date", end_date),
    supabase.from("activity_streaks").select("*").eq("org_id", org_id),
    supabase
      .from("entry_reactions")
      .select("*, time_entries!inner(org_id, date, user_id)")
      .eq("time_entries.org_id", org_id)
      .gte("time_entries.date", start_date)
      .lte("time_entries.date", end_date),
    supabase
      .from("shoutouts")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", start_date)
      .lte("date", end_date),
    supabase
      .from("org_members")
      .select("user_id, profiles(full_name, email)")
      .eq("org_id", org_id),
  ]);

  const allEntries = entries ?? [];
  const allTrust = trustHistory ?? [];
  const allCloseouts = closeouts ?? [];
  const allFlags = flags ?? [];
  const allStreaks = streaks ?? [];
  const allReactions = reactions ?? [];
  const allShoutouts = shoutouts ?? [];
  const allMembers = members ?? [];

  // Build user name lookup
  const nameMap: Record<string, string> = {};
  for (const m of allMembers) {
    const profile = m.profiles as Record<string, unknown> | null;
    nameMap[m.user_id] = (profile?.full_name as string) ?? (profile?.email as string) ?? m.user_id;
  }

  // ── Grouping ─────────────────────────────────────────────────
  type GroupKey = string;

  function getGroupKey(entry: Record<string, unknown>): GroupKey {
    switch (group_by) {
      case "person":
        return entry.user_id as string;
      case "date":
        return entry.date as string;
      case "category":
        return entry.category as string;
      case "day_of_week": {
        const d = new Date((entry.date as string) + "T12:00:00");
        return String(d.getDay());
      }
      case "hour":
        return String(entry.hour);
      default:
        return "all";
    }
  }

  function getGroupLabel(key: GroupKey): string {
    switch (group_by) {
      case "person":
        return nameMap[key] ?? key;
      case "date":
        return key;
      case "category":
        return key;
      case "day_of_week": {
        const days = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
        return days[Number(key)] ?? key;
      }
      case "hour":
        return `${key}:00`;
      default:
        return key;
    }
  }

  // Group entries
  const grouped: Record<GroupKey, Record<string, unknown>[]> = {};
  for (const entry of allEntries) {
    const key = getGroupKey(entry as Record<string, unknown>);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry as Record<string, unknown>);
  }

  // Compute metrics per group
  const rows: Record<string, unknown>[] = [];

  for (const [key, groupEntries] of Object.entries(grouped)) {
    const row: Record<string, unknown> = {
      group_key: key,
      group_label: getGroupLabel(key),
    };

    const userIdsInGroup = [...new Set(groupEntries.map((e) => e.user_id as string))];
    const datesInGroup = [...new Set(groupEntries.map((e) => e.date as string))];

    if (metrics.includes("hours")) {
      row.hours = groupEntries.length;
    }

    if (metrics.includes("proof_rate")) {
      const withProof = groupEntries.filter(
        (e) => (e.proof_urls as string[] | null)?.length
      ).length;
      row.proof_rate =
        groupEntries.length > 0
          ? Math.round((withProof / groupEntries.length) * 100)
          : 0;
    }

    if (metrics.includes("trust_score")) {
      const relevant = allTrust.filter((t) => {
        if (group_by === "person") return t.user_id === key;
        if (group_by === "date") return t.date === key;
        return userIdsInGroup.includes(t.user_id) && datesInGroup.includes(t.date);
      });
      const avg =
        relevant.length > 0
          ? Math.round(relevant.reduce((s, t) => s + t.score, 0) / relevant.length)
          : 0;
      row.trust_score = avg;
    }

    if (metrics.includes("mood")) {
      const moods = groupEntries
        .map((e) => e.mood as number | null)
        .filter((m): m is number => m !== null);
      row.mood =
        moods.length > 0
          ? Math.round((moods.reduce((s, m) => s + m, 0) / moods.length) * 10) / 10
          : null;
    }

    if (metrics.includes("energy")) {
      const energies = groupEntries
        .map((e) => e.energy as number | null)
        .filter((e): e is number => e !== null);
      row.energy =
        energies.length > 0
          ? Math.round((energies.reduce((s, e) => s + e, 0) / energies.length) * 10) / 10
          : null;
    }

    if (metrics.includes("flags")) {
      const relevant = allFlags.filter((f) => {
        if (group_by === "person") return f.user_id === key;
        if (group_by === "date") return f.date === key;
        return userIdsInGroup.includes(f.user_id) && datesInGroup.includes(f.date);
      });
      row.flags = relevant.length;
    }

    if (metrics.includes("streaks")) {
      if (group_by === "person") {
        const streak = allStreaks.find((s) => s.user_id === key);
        row.current_streak = streak?.current_streak ?? 0;
        row.longest_streak = streak?.longest_streak ?? 0;
      } else {
        const relevantStreaks = allStreaks.filter((s) => userIdsInGroup.includes(s.user_id));
        const avgCurrent =
          relevantStreaks.length > 0
            ? Math.round(
                relevantStreaks.reduce((s, st) => s + st.current_streak, 0) /
                  relevantStreaks.length
              )
            : 0;
        row.current_streak = avgCurrent;
      }
    }

    if (metrics.includes("closeouts")) {
      const relevant = allCloseouts.filter((c) => {
        if (group_by === "person") return c.user_id === key;
        if (group_by === "date") return c.date === key;
        return userIdsInGroup.includes(c.user_id) && datesInGroup.includes(c.date);
      });
      row.closeouts = relevant.length;
    }

    if (metrics.includes("reactions")) {
      const relevant = allReactions.filter((r) => {
        const entryData = r.time_entries as Record<string, unknown> | null;
        if (!entryData) return false;
        if (group_by === "person") return entryData.user_id === key;
        if (group_by === "date") return entryData.date === key;
        return true;
      });
      row.reactions = relevant.length;
    }

    if (metrics.includes("shoutouts")) {
      const relevant = allShoutouts.filter((s) => {
        if (group_by === "person") return s.to_user_id === key;
        if (group_by === "date") return s.date === key;
        return datesInGroup.includes(s.date);
      });
      row.shoutouts = relevant.length;
    }

    if (metrics.includes("categories")) {
      const catCounts: Record<string, number> = {};
      for (const e of groupEntries) {
        const cat = e.category as string;
        catCounts[cat] = (catCounts[cat] ?? 0) + 1;
      }
      row.categories = catCounts;
    }

    if (metrics.includes("late_rate")) {
      const lateCount = groupEntries.filter((e) => e.is_late === true).length;
      row.late_rate =
        groupEntries.length > 0
          ? Math.round((lateCount / groupEntries.length) * 100)
          : 0;
    }

    rows.push(row);
  }

  // Sort rows
  rows.sort((a, b) => {
    const la = a.group_label as string;
    const lb = b.group_label as string;
    if (group_by === "hour" || group_by === "day_of_week") {
      return Number(a.group_key) - Number(b.group_key);
    }
    return la.localeCompare(lb);
  });

  // ── Summary ──────────────────────────────────────────────────
  const summary: Record<string, unknown> = {
    total_rows: rows.length,
    date_range: { start: start_date, end: end_date },
    filters_applied: {
      user_ids: filters?.user_ids ?? null,
      categories: filters?.categories ?? null,
    },
    total_entries: allEntries.length,
  };

  // Compute totals for numeric columns
  const numericKeys = ["hours", "proof_rate", "trust_score", "flags", "closeouts", "reactions", "shoutouts", "late_rate", "current_streak"];
  for (const nk of numericKeys) {
    const vals = rows.map((r) => r[nk]).filter((v): v is number => typeof v === "number");
    if (vals.length > 0) {
      summary[`total_${nk}`] = vals.reduce((s, v) => s + v, 0);
      summary[`avg_${nk}`] = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
    }
  }

  // ── Save if requested ────────────────────────────────────────
  if (save_as) {
    await supabase.from("saved_reports").insert({
      org_id,
      name: save_as,
      report_type: "performance" as const,
      config: {
        start_date,
        end_date,
        metrics,
        group_by,
        filters,
        format,
      },
      created_by: user.id,
      last_run_at: new Date().toISOString(),
    });
  }

  // ── Return format ────────────────────────────────────────────
  if (format === "csv") {
    const headers: string[] = ["grupo"];
    const metricColumns: string[] = [];

    if (metrics.includes("hours")) { headers.push("horas"); metricColumns.push("hours"); }
    if (metrics.includes("proof_rate")) { headers.push("tasa_evidencia_%"); metricColumns.push("proof_rate"); }
    if (metrics.includes("trust_score")) { headers.push("trust_score"); metricColumns.push("trust_score"); }
    if (metrics.includes("mood")) { headers.push("animo"); metricColumns.push("mood"); }
    if (metrics.includes("energy")) { headers.push("energia"); metricColumns.push("energy"); }
    if (metrics.includes("flags")) { headers.push("flags"); metricColumns.push("flags"); }
    if (metrics.includes("streaks")) { headers.push("racha_actual"); metricColumns.push("current_streak"); }
    if (metrics.includes("closeouts")) { headers.push("closeouts"); metricColumns.push("closeouts"); }
    if (metrics.includes("reactions")) { headers.push("reacciones"); metricColumns.push("reactions"); }
    if (metrics.includes("shoutouts")) { headers.push("shoutouts"); metricColumns.push("shoutouts"); }
    if (metrics.includes("late_rate")) { headers.push("tasa_tardanza_%"); metricColumns.push("late_rate"); }
    if (metrics.includes("categories")) { headers.push("categorias"); metricColumns.push("categories"); }

    const csvRows = rows.map((r) => {
      const cells: string[] = [`"${String(r.group_label).replace(/"/g, '""')}"`];
      for (const col of metricColumns) {
        const val = r[col];
        if (col === "categories" && typeof val === "object" && val !== null) {
          const catStr = Object.entries(val as Record<string, number>)
            .map(([k, v]) => `${k}:${v}`)
            .join(";");
          cells.push(`"${catStr}"`);
        } else {
          cells.push(String(val ?? ""));
        }
      }
      return cells.join(",");
    });

    const csv = [headers.join(","), ...csvRows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=reporte-${start_date}-${end_date}.csv`,
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: rows,
    summary,
    generated_at: new Date().toISOString(),
  });
}

// ── DELETE — delete a saved report ─────────────────────────────
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const reportId = request.nextUrl.searchParams.get("report_id");
  const orgId = request.nextUrl.searchParams.get("org_id");

  if (!reportId || !orgId) {
    return NextResponse.json({ error: "report_id y org_id requeridos" }, { status: 400 });
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sin organizacion" }, { status: 403 });
  }

  const { error } = await supabase
    .from("saved_reports")
    .delete()
    .eq("id", reportId)
    .eq("org_id", orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
