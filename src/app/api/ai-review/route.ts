import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/ai-review?org_id=xxx&date=yyyy-mm-dd
// Analyzes entries for suspicious patterns without needing an LLM API key
// Uses rule-based heuristics that catch most gaming attempts
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const supabase = await createClient();
  if (!isCron) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Get all entries for the date
  const { data: entries } = await supabase
    .from("time_entries")
    .select("*, profiles(full_name)")
    .eq("org_id", orgId)
    .eq("date", date)
    .order("user_id")
    .order("hour");

  if (!entries || entries.length === 0) {
    return NextResponse.json({ findings: [], summary: "No hay entradas para analizar." });
  }

  // Get GitHub events for cross-reference
  const { data: githubEvents } = await supabase
    .from("github_events")
    .select("user_id, event_type, hour")
    .eq("org_id", orgId)
    .eq("date", date);

  const findings: Array<{
    type: string;
    severity: "low" | "medium" | "high";
    message: string;
    user_id: string;
    user_name: string;
    entry_ids: string[];
  }> = [];

  // Group by user
  const byUser = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byUser.get(e.user_id) ?? [];
    list.push(e);
    byUser.set(e.user_id, list);
  }

  for (const [userId, userEntries] of byUser) {
    const userName = (userEntries[0] as Record<string, unknown>).profiles
      ? ((userEntries[0] as Record<string, unknown>).profiles as Record<string, unknown>).full_name as string ?? "Unknown"
      : "Unknown";

    // 1. COPY-PASTE DETECTION: Similar titles
    const titles = userEntries.map((e) => e.title.toLowerCase().trim());
    const uniqueTitles = new Set(titles);
    if (titles.length >= 3 && uniqueTitles.size <= Math.ceil(titles.length * 0.3)) {
      findings.push({
        type: "copy_paste",
        severity: "high",
        message: `${userName} tiene ${titles.length} entradas pero solo ${uniqueTitles.size} títulos únicos. Posible copy-paste.`,
        user_id: userId,
        user_name: userName,
        entry_ids: userEntries.map((e) => e.id),
      });
    }

    // 2. GENERIC TITLES: Too short or vague
    const genericEntries = userEntries.filter((e) => {
      const t = e.title.toLowerCase();
      return (
        t.length < 15 ||
        t.includes("trabajando") ||
        t.includes("haciendo cosas") ||
        t.includes("varias cosas") ||
        t.includes("lo mismo") ||
        t.includes("continuando") ||
        t === titles[0] // all same as first
      );
    });
    if (genericEntries.length >= 3) {
      findings.push({
        type: "generic_titles",
        severity: "medium",
        message: `${userName} tiene ${genericEntries.length} entradas con títulos genéricos o vagos.`,
        user_id: userId,
        user_name: userName,
        entry_ids: genericEntries.map((e) => e.id),
      });
    }

    // 3. BULK BACKFILL: All entries logged at the same time
    const logTimes = userEntries.map((e) => new Date(e.logged_at ?? e.created_at).getTime());
    if (logTimes.length >= 4) {
      const span = (Math.max(...logTimes) - Math.min(...logTimes)) / 1000 / 60;
      if (span < 5) {
        findings.push({
          type: "bulk_backfill",
          severity: "high",
          message: `${userName} registró ${userEntries.length} horas en menos de 5 minutos. Probable backfill.`,
          user_id: userId,
          user_name: userName,
          entry_ids: userEntries.map((e) => e.id),
        });
      }
    }

    // 4. SAME CATEGORY ALL DAY: Suspicious if >= 6 hours same category
    if (userEntries.length >= 6) {
      const categories = new Set(userEntries.map((e) => e.category));
      if (categories.size === 1) {
        const cat = [...categories][0];
        if (cat !== "meeting") { // All-day meetings can be legit
          findings.push({
            type: "same_category",
            severity: "medium",
            message: `${userName} reportó ${userEntries.length} horas seguidas de "${cat}". Patrón inusual.`,
            user_id: userId,
            user_name: userName,
            entry_ids: userEntries.map((e) => e.id),
          });
        }
      }
    }

    // 5. NO GITHUB BUT CLAIMS CODING: Says deep_work but no commits
    const codingEntries = userEntries.filter(
      (e) => e.category === "deep_work" || e.category === "review"
    );
    const userGithubEvents = (githubEvents ?? []).filter((g) => g.user_id === userId);
    if (codingEntries.length >= 4 && userGithubEvents.length === 0) {
      findings.push({
        type: "no_github_activity",
        severity: "medium",
        message: `${userName} reportó ${codingEntries.length}h de deep work/review pero no tiene actividad en GitHub hoy.`,
        user_id: userId,
        user_name: userName,
        entry_ids: codingEntries.map((e) => e.id),
      });
    }

    // 6. ALL LATE: Every entry logged late
    const lateEntries = userEntries.filter((e) => e.is_late);
    if (lateEntries.length === userEntries.length && userEntries.length >= 3) {
      findings.push({
        type: "all_late",
        severity: "medium",
        message: `${userName}: 100% de sus entradas fueron registradas tarde. Todas retroactivas.`,
        user_id: userId,
        user_name: userName,
        entry_ids: lateEntries.map((e) => e.id),
      });
    }

    // 7. ZERO EVIDENCE: Many hours, no proof at all
    const withProof = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
    if (userEntries.length >= 6 && withProof.length === 0) {
      findings.push({
        type: "zero_evidence",
        severity: "high",
        message: `${userName} registró ${userEntries.length} horas sin un solo link de evidencia.`,
        user_id: userId,
        user_name: userName,
        entry_ids: userEntries.map((e) => e.id),
      });
    }

    // 8. MOOD/ENERGY FLAT: Same mood & energy every single entry (robotic)
    const moods = userEntries.filter((e) => e.mood).map((e) => e.mood);
    if (moods.length >= 5 && new Set(moods).size === 1) {
      findings.push({
        type: "flat_mood",
        severity: "low",
        message: `${userName} reportó el mismo ánimo (${moods[0]}) en todas sus entradas. Parece automático.`,
        user_id: userId,
        user_name: userName,
        entry_ids: userEntries.map((e) => e.id),
      });
    }
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Generate summary
  const highCount = findings.filter((f) => f.severity === "high").length;
  const medCount = findings.filter((f) => f.severity === "medium").length;
  const summary = findings.length === 0
    ? "No se detectaron patrones sospechosos. Todo parece legítimo."
    : `Se encontraron ${findings.length} hallazgos: ${highCount} críticos, ${medCount} medios. Revisa los detalles.`;

  // Save review
  await supabase.from("ai_reviews").insert({
    org_id: orgId,
    date,
    review_type: "daily_team",
    findings,
    summary,
    trust_impact: -highCount * 5 - medCount * 2,
  });

  return NextResponse.json({ findings, summary });
}
