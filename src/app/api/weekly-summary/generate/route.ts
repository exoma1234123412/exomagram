import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/weekly-summary/generate?org_id=xxx&week_start=yyyy-mm-dd
// Generates compressed weekly summaries per person using Claude.
// These summaries are stored and used as "memory" for future Claude calls,
// so Claude always has ALL-TIME context without exceeding token limits.
//
// Strategy:
// - Raw data: last 7 days (full detail)
// - Summaries: everything before that (compressed by Claude)
// - Result: Claude sees ALL history in ~50K tokens regardless of time span

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const weekStartParam = searchParams.get("week_start");

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Calculate week range
  const weekStart = weekStartParam ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() - 7); // Last week's Sunday
    return d.toISOString().split("T")[0];
  })();
  const weekEnd = new Date(weekStart + "T12:00:00");
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  const { data: members } = await supabase.from("org_members")
    .select("user_id, profiles(full_name, role)").eq("org_id", orgId);

  const results = [] as { name: string; week: string; hours: number; narrative: string }[];

  for (const member of members ?? []) {
    const profile = member.profiles as unknown as { full_name: string; role: string } | null;
    const name = profile?.full_name ?? "?";
    const role = profile?.role ?? "?";

    // Get all data for this week
    const [
      { data: entries },
      { data: standups },
      { data: closeouts },
      { data: promises },
      { data: github },
      { data: shoutoutsRx },
      { data: reactions },
    ] = await Promise.all([
      supabase.from("time_entries").select("*").eq("user_id", member.user_id).eq("org_id", orgId)
        .gte("date", weekStart).lte("date", weekEndStr).order("date").order("hour"),
      supabase.from("standups").select("*").eq("user_id", member.user_id).eq("org_id", orgId)
        .gte("date", weekStart).lte("date", weekEndStr),
      supabase.from("daily_closeouts").select("*").eq("user_id", member.user_id).eq("org_id", orgId)
        .gte("date", weekStart).lte("date", weekEndStr),
      supabase.from("daily_promises").select("*").eq("user_id", member.user_id).eq("org_id", orgId)
        .gte("date", weekStart).lte("date", weekEndStr),
      supabase.from("github_events").select("*").eq("user_id", member.user_id).eq("org_id", orgId)
        .gte("date", weekStart).lte("date", weekEndStr),
      supabase.from("shoutouts").select("*, profiles:profiles!shoutouts_from_user_id_fkey(full_name)")
        .eq("to_user_id", member.user_id).eq("org_id", orgId)
        .gte("date", weekStart).lte("date", weekEndStr),
      supabase.from("entry_reactions").select("entry_id, reaction"),
    ]);

    // Compute stats
    const totalH = entries?.length ?? 0;
    const deepWork = entries?.filter((e) => e.category === "deep_work").length ?? 0;
    const meetings = entries?.filter((e) => e.category === "meeting").length ?? 0;
    const review = entries?.filter((e) => e.category === "review").length ?? 0;
    const blocked = entries?.filter((e) => e.category === "blocked").length ?? 0;
    const admin = entries?.filter((e) => e.category === "admin").length ?? 0;
    const withProof = entries?.filter((e) => e.proof_urls?.length > 0).length ?? 0;
    const late = entries?.filter((e) => e.is_late).length ?? 0;
    const uniqueDates = new Set(entries?.map((e) => e.date) ?? []);
    const keptPromises = promises?.filter((p) => p.status === "delivered").length ?? 0;
    const brokenPromises = promises?.filter((p) => p.status === "broken").length ?? 0;
    const entryIds = new Set(entries?.map((e) => e.id) ?? []);
    const suspicious = (reactions ?? []).filter((r) => r.reaction === "suspicious" && entryIds.has(r.entry_id)).length;

    // Build day-by-day breakdown for Claude
    const byDate = new Map<string, typeof entries>();
    for (const e of entries ?? []) {
      const list = byDate.get(e.date) ?? [];
      list.push(e);
      byDate.set(e.date, list);
    }

    let dayBreakdown = "";
    for (const [date, dayEntries] of byDate) {
      if (!dayEntries) continue;
      dayBreakdown += `${date}: ${dayEntries.length}h [${dayEntries.map((e) => e.category).join(",")}] titles: ${dayEntries.map((e) => `"${e.title}"`).join("; ")}\n`;
    }

    // Ask Claude to compress into a narrative summary
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001", // Use Haiku for summaries — cheaper
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Comprime la semana laboral de ${name} (${role}) en un resumen DENSO de máximo 200 palabras. Incluye: qué hizo, qué tan productivo fue, red flags, fortalezas, y tu veredicto honesto.

DATOS DE LA SEMANA ${weekStart} a ${weekEndStr}:
Total: ${totalH}h en ${uniqueDates.size} días (${totalH > 0 ? (totalH / Math.max(uniqueDates.size, 1)).toFixed(1) : 0}h/día)
Deep work: ${deepWork}h, Meetings: ${meetings}h, Review: ${review}h, Blocked: ${blocked}h, Admin: ${admin}h
Evidencia: ${withProof}/${totalH} (${totalH > 0 ? Math.round(withProof / totalH * 100) : 0}%)
Tardías: ${late}, Standups: ${standups?.length ?? 0}/5, Closeouts: ${closeouts?.length ?? 0}/5
Promesas: ${keptPromises} cumplidas, ${brokenPromises} rotas
GitHub: ${github?.length ?? 0} eventos, Shoutouts recibidos: ${shoutoutsRx?.length ?? 0}
Marcado sospechoso: ${suspicious} veces

DÍA POR DÍA:
${dayBreakdown || "Sin datos"}

Responde SOLO el resumen narrativo, sin JSON ni formato.`,
      }],
    });

    const narrative = message.content[0].type === "text" ? message.content[0].text : "";

    // Store structured summary + narrative
    const summary = {
      total_hours: totalH,
      days_active: uniqueDates.size,
      avg_hours_per_day: totalH > 0 ? Math.round((totalH / Math.max(uniqueDates.size, 1)) * 10) / 10 : 0,
      deep_work: deepWork,
      meetings,
      review,
      blocked,
      admin,
      proof_percent: totalH > 0 ? Math.round(withProof / totalH * 100) : 0,
      late_percent: totalH > 0 ? Math.round(late / totalH * 100) : 0,
      standups: standups?.length ?? 0,
      closeouts: closeouts?.length ?? 0,
      promises_kept: keptPromises,
      promises_broken: brokenPromises,
      github_events: github?.length ?? 0,
      shoutouts_received: shoutoutsRx?.length ?? 0,
      suspicious_count: suspicious,
    };

    await supabase.from("weekly_summaries").upsert({
      user_id: member.user_id,
      org_id: orgId,
      week_start: weekStart,
      week_end: weekEndStr,
      summary,
      ai_narrative: narrative,
    }, { onConflict: "user_id,org_id,week_start" });

    results.push({ name, week: weekStart, hours: totalH, narrative: narrative.slice(0, 100) + "..." });
  }

  return NextResponse.json({ week: weekStart, summaries_generated: results.length, results });
}
