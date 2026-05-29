import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/efficiency-audit?org_id=xxx&date=yyyy-mm-dd
//
// This is NOT about working more hours. It's about OUTPUT PER HOUR.
// Someone who ships 3 features in 4 hours is better than someone
// who sits 10 hours doing nothing meaningful.
//
// We measure:
// 1. Deep Work Ratio — % of time in actual production vs overhead
// 2. Context Switch Penalty — how often they jump between categories
// 3. Meeting Tax — % of day eaten by meetings (meetings = -output)
// 4. Output Density — deliverables per hour of deep work
// 5. Proof Density — evidence quality per entry
// 6. Bloat Detection — admin/planning hours that could be eliminated
// 7. Flow State Score — longest uninterrupted deep work streak
// 8. ROI Score — if we paid you $X/hour, what did we get?

const HOURLY_COST = 50; // USD default

export async function POST(request: Request) {
  // Auth: verify user is logged in
  const serverClient = await createServerSupabase();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  // Service-role client for data queries (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [
    { data: entries },
    { data: members },
    { data: githubEvents },
  ] = await Promise.all([
    supabase.from("time_entries").select("*, profiles(full_name, role)").eq("org_id", orgId).eq("date", date).order("hour"),
    supabase.from("org_members").select("user_id, profiles(full_name, role)").eq("org_id", orgId),
    supabase.from("github_events").select("*").eq("org_id", orgId).eq("date", date),
  ]);

  interface EfficiencyAudit {
    user_id: string;
    name: string;
    role: string;
    // Core metrics
    efficiency_score: number; // 0-100
    efficiency_grade: string; // A-F
    deep_work_ratio: number; // 0-100
    context_switches: number;
    flow_state_hours: number; // longest uninterrupted streak
    meeting_tax: number; // % of day in meetings
    overhead_ratio: number; // admin + planning + break as % of total
    output_density: number; // proof items per deep work hour
    // Specific
    total_hours: number;
    productive_hours: number; // deep_work + review only
    overhead_hours: number; // admin + planning + break
    meeting_hours: number;
    blocked_hours: number;
    wasted_cost: number; // $ spent on non-productive time
    // Analysis
    verdict: string;
    improvements: string[];
    waste_sources: string[];
    strengths: string[];
  }

  const audits: EfficiencyAudit[] = [];

  for (const member of members ?? []) {
    const profile = member.profiles as unknown as { full_name: string; role: string } | null;
    const name = profile?.full_name ?? "?";
    const role = profile?.role ?? "";
    const userEntries = (entries ?? []).filter((e) => e.user_id === member.user_id);
    const userGithub = (githubEvents ?? []).filter((g) => g.user_id === member.user_id);

    if (userEntries.length === 0) {
      audits.push({
        user_id: member.user_id, name, role,
        efficiency_score: 0, efficiency_grade: "F",
        deep_work_ratio: 0, context_switches: 0, flow_state_hours: 0,
        meeting_tax: 0, overhead_ratio: 0, output_density: 0,
        total_hours: 0, productive_hours: 0, overhead_hours: 0,
        meeting_hours: 0, blocked_hours: 0, wasted_cost: 0,
        verdict: `${name} no registró horas. Imposible medir eficiencia de algo que no existe.`,
        improvements: ["Registrar horas para poder evaluar eficiencia"],
        waste_sources: ["Día completo sin output visible"],
        strengths: [],
      });
      continue;
    }

    const total = userEntries.length;
    const deepWork = userEntries.filter((e) => e.category === "deep_work");
    const review = userEntries.filter((e) => e.category === "review");
    const meetings = userEntries.filter((e) => e.category === "meeting");
    const admin = userEntries.filter((e) => e.category === "admin");
    const planning = userEntries.filter((e) => e.category === "planning");
    const breaks = userEntries.filter((e) => e.category === "break");
    const blocked = userEntries.filter((e) => e.category === "blocked");
    const learning = userEntries.filter((e) => e.category === "learning");

    const productiveHours = deepWork.length + review.length;
    const overheadHours = admin.length + planning.length + breaks.length;
    const meetingHours = meetings.length;
    const blockedHours = blocked.length;

    // 1. Deep Work Ratio (0-100)
    const deepWorkRatio = Math.round((productiveHours / total) * 100);

    // 2. Context Switches — count category changes between consecutive hours
    const sorted = [...userEntries].sort((a, b) => a.hour - b.hour);
    let contextSwitches = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].category !== sorted[i - 1].category) contextSwitches++;
    }

    // 3. Flow State — longest consecutive deep_work streak
    let maxFlow = 0;
    let currentFlow = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].category === "deep_work") {
        if (i === 0 || sorted[i].hour === sorted[i - 1].hour + 1 && sorted[i - 1].category === "deep_work") {
          currentFlow++;
        } else {
          currentFlow = 1;
        }
        maxFlow = Math.max(maxFlow, currentFlow);
      } else {
        currentFlow = 0;
      }
    }

    // 4. Meeting Tax
    const meetingTax = Math.round((meetingHours / total) * 100);

    // 5. Overhead Ratio
    const overheadRatio = Math.round((overheadHours / total) * 100);

    // 6. Output Density — proof items per productive hour
    const proofCount = userEntries.filter((e) =>
      (e.category === "deep_work" || e.category === "review") &&
      e.proof_urls && (e.proof_urls as string[]).length > 0
    ).length;
    const outputDensity = productiveHours > 0 ? Math.round((proofCount / productiveHours) * 100) / 100 : 0;

    // GitHub density
    const commitsPerDeepWorkHour = deepWork.length > 0 ? userGithub.filter((g) => g.event_type === "commit").length / deepWork.length : 0;

    // WASTED COST
    const wastedHours = blockedHours + breaks.length + (meetingHours > 2 ? meetingHours - 2 : 0);
    const wastedCost = wastedHours * HOURLY_COST;

    // ═══════════════════════════════════════
    // EFFICIENCY SCORE CALCULATION
    // ═══════════════════════════════════════
    let score = 0;

    // Deep work ratio: max 30pts
    score += Math.min(30, Math.round(deepWorkRatio * 0.3));

    // Flow state: max 20pts (4+ hours = full marks)
    score += Math.min(20, maxFlow * 5);

    // Low context switches: max 15pts (0 switches = 15, each switch = -2)
    score += Math.max(0, 15 - contextSwitches * 2);

    // Output density: max 15pts
    score += Math.min(15, Math.round(outputDensity * 15));

    // Low meeting tax: max 10pts (0% = 10, 50%+ = 0)
    score += Math.max(0, 10 - Math.round(meetingTax / 5));

    // Low overhead: max 10pts
    score += Math.max(0, 10 - Math.round(overheadRatio / 5));

    // Penalties
    if (blockedHours >= 3) score -= 10;
    if (breaks.length >= 3) score -= 5;
    if (contextSwitches >= total - 1 && total >= 4) score -= 10; // switching EVERY hour

    score = Math.max(0, Math.min(100, score));

    const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : score >= 30 ? "D" : "F";

    // ANALYSIS
    const improvements: string[] = [];
    const wasteSources: string[] = [];
    const strengths: string[] = [];

    // Improvements
    if (contextSwitches >= 4) {
      improvements.push(`${contextSwitches} cambios de contexto — bloquea tiempo dedicado para cada tipo de trabajo`);
    }
    if (meetingTax > 40) {
      improvements.push(`${meetingTax}% del día en reuniones — rechaza reuniones innecesarias, pide agendas previas`);
    }
    if (maxFlow <= 1 && deepWork.length >= 2) {
      improvements.push("No tuvo bloques de flow state — agrupa las horas de deep work consecutivamente");
    }
    if (admin.length >= 3) {
      improvements.push(`${admin.length}h de admin — automatiza tareas repetitivas, delega lo que puedas`);
    }
    if (deepWork.length > 0 && outputDensity < 0.5) {
      improvements.push("Baja densidad de output — cada hora de deep work debería tener evidencia medible");
    }
    if (planning.length >= 3) {
      improvements.push(`${planning.length}h planeando — la planeación excesiva es procrastinación disfrazada`);
    }

    // Waste sources
    if (blockedHours > 0) {
      wasteSources.push(`${blockedHours}h bloqueado = $${blockedHours * HOURLY_COST} desperdiciados`);
    }
    if (meetingHours > 2) {
      wasteSources.push(`${meetingHours - 2}h de reuniones excesivas = $${(meetingHours - 2) * HOURLY_COST} desperdiciados`);
    }
    if (breaks.length >= 2) {
      wasteSources.push(`${breaks.length}h de breaks = $${breaks.length * HOURLY_COST}`);
    }

    // Strengths
    if (maxFlow >= 3) strengths.push(`${maxFlow}h de flow state ininterrumpido`);
    if (deepWorkRatio >= 60) strengths.push(`${deepWorkRatio}% deep work — muy enfocado`);
    if (contextSwitches <= 2 && total >= 5) strengths.push("Muy pocas interrupciones");
    if (outputDensity >= 0.8) strengths.push("Alta densidad de output con evidencia");
    if (meetingTax <= 15 && total >= 6) strengths.push("Bajo tax de reuniones");
    if (commitsPerDeepWorkHour >= 2) strengths.push(`${commitsPerDeepWorkHour.toFixed(1)} commits/hora de deep work`);

    // Verdict
    let verdict: string;
    if (grade === "A") {
      verdict = `${name} fue extremadamente eficiente. ${maxFlow}h de flow state, ${deepWorkRatio}% deep work, bajo overhead. Este es el estándar.`;
    } else if (grade === "B") {
      verdict = `${name} fue productivo pero tiene margen. ${improvements[0] ?? "Puede optimizar su tiempo."}`;
    } else if (grade === "C") {
      verdict = `${name} trabajó pero no eficientemente. Mucho tiempo en overhead (${overheadRatio}%) y reuniones (${meetingTax}%). Más horas no significan más output.`;
    } else if (grade === "D") {
      verdict = `${name} fue ineficiente. Solo ${productiveHours}h productivas de ${total}h registradas. El resto fue overhead, reuniones o bloqueo. Necesita restructurar su día.`;
    } else {
      verdict = `${name} desperdició su día. ${wastedCost > 0 ? `$${wastedCost} en tiempo no productivo.` : "Sin output real."} Estar sentado no es trabajar.`;
    }

    audits.push({
      user_id: member.user_id, name, role,
      efficiency_score: score, efficiency_grade: grade,
      deep_work_ratio: deepWorkRatio, context_switches: contextSwitches,
      flow_state_hours: maxFlow, meeting_tax: meetingTax,
      overhead_ratio: overheadRatio, output_density: outputDensity,
      total_hours: total, productive_hours: productiveHours,
      overhead_hours: overheadHours, meeting_hours: meetingHours,
      blocked_hours: blockedHours, wasted_cost: wastedCost,
      verdict, improvements, waste_sources: wasteSources, strengths,
    });
  }

  audits.sort((a, b) => a.efficiency_score - b.efficiency_score);

  const teamAvg = audits.length > 0
    ? Math.round(audits.reduce((s, a) => s + a.efficiency_score, 0) / audits.length)
    : 0;
  const totalWaste = audits.reduce((s, a) => s + a.wasted_cost, 0);

  await supabase.from("ai_reviews").insert({
    org_id: orgId, date,
    review_type: "daily_team",
    findings: { type: "efficiency", audits },
    summary: `Efficiency audit: team avg ${teamAvg}/100, $${totalWaste} wasted`,
  });

  return NextResponse.json({
    date,
    team_avg_efficiency: teamAvg,
    total_wasted_cost: totalWaste,
    audits,
  });
}
