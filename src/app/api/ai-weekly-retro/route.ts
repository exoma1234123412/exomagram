import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";

// POST /api/ai-weekly-retro?org_id=xxx
// Generates a brutal weekly retrospective analyzing the entire week
// Who improved, who declined, who's gaming the system, team patterns

export async function POST(request: Request) {
  // Auth: verify user is logged in
  const serverClient = await createServerSupabase();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  // Service-role client for data queries (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Last 7 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  const start = startDate.toISOString().split("T")[0];
  const end = endDate.toISOString().split("T")[0];

  // Previous 7 days for comparison
  const prevStart = new Date(startDate);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevStartStr = prevStart.toISOString().split("T")[0];

  const [
    { data: entries },
    { data: prevEntries },
    { data: members },
    { data: closeouts },
    { data: standups },
    { data: reviews },
    { data: promises },
    { data: shoutoutsReceived },
  ] = await Promise.all([
    supabase.from("time_entries").select("*").eq("org_id", orgId).gte("date", start).lte("date", end),
    supabase.from("time_entries").select("user_id, category, proof_urls, is_late").eq("org_id", orgId).gte("date", prevStartStr).lt("date", start),
    supabase.from("org_members").select("user_id, profiles(full_name)").eq("org_id", orgId),
    supabase.from("daily_closeouts").select("user_id, date").eq("org_id", orgId).gte("date", start),
    supabase.from("standups").select("user_id, date").eq("org_id", orgId).gte("date", start),
    supabase.from("ai_reviews").select("user_id, findings").eq("org_id", orgId).eq("review_type", "daily_individual").gte("date", start),
    supabase.from("daily_promises").select("user_id, status").eq("org_id", orgId).gte("date", start),
    supabase.from("shoutouts").select("to_user_id").eq("org_id", orgId).gte("date", start),
  ]);

  const weekdays = 5; // Assume 5 work days

  interface MemberRetro {
    name: string;
    role: string;
    user_id: string;
    // This week
    total_hours: number;
    avg_daily_hours: number;
    proof_percent: number;
    late_percent: number;
    deep_work_percent: number;
    meeting_percent: number;
    standup_count: number;
    closeout_count: number;
    promises_kept: number;
    promises_broken: number;
    shoutouts_received: number;
    // Previous week
    prev_hours: number;
    prev_proof_percent: number;
    // Analysis
    trend: "improving" | "declining" | "stable";
    weekly_grade: string;
    callout: string;
    issues: string[];
    wins: string[];
  }

  const retros: MemberRetro[] = [];

  for (const m of members ?? []) {
    const profile = m.profiles as unknown as { full_name: string; role: string } | null;
    const name = profile?.full_name ?? "?";
    const role = profile?.role ?? "";

    const userEntries = (entries ?? []).filter((e) => e.user_id === m.user_id);
    const prevUserEntries = (prevEntries ?? []).filter((e) => e.user_id === m.user_id);
    const hours = userEntries.length;
    const prevHours = prevUserEntries.length;
    const withProof = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
    const prevWithProof = prevUserEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
    const lateOnes = userEntries.filter((e) => e.is_late);
    const deepWork = userEntries.filter((e) => e.category === "deep_work");
    const meetings = userEntries.filter((e) => e.category === "meeting");
    const proofPct = hours > 0 ? Math.round((withProof.length / hours) * 100) : 0;
    const prevProofPct = prevHours > 0 ? Math.round((prevWithProof.length / prevHours) * 100) : 0;
    const latePct = hours > 0 ? Math.round((lateOnes.length / hours) * 100) : 0;
    const standupCount = (standups ?? []).filter((s) => s.user_id === m.user_id).length;
    const closeoutCount = (closeouts ?? []).filter((c) => c.user_id === m.user_id).length;
    const userPromises = (promises ?? []).filter((p) => p.user_id === m.user_id);
    const kept = userPromises.filter((p) => p.status === "delivered").length;
    const broken = userPromises.filter((p) => p.status === "broken").length;
    const shoutouts = (shoutoutsReceived ?? []).filter((s) => s.to_user_id === m.user_id).length;

    // Trend
    const hoursDiff = hours - prevHours;
    const proofDiff = proofPct - prevProofPct;
    const trend: MemberRetro["trend"] =
      (hoursDiff > 5 || proofDiff > 15) ? "improving" :
      (hoursDiff < -5 || proofDiff < -15) ? "declining" : "stable";

    // Grade
    let score = 0;
    score += Math.min(hours / (weekdays * 8), 1) * 30; // hours
    score += (proofPct / 100) * 25; // proof
    score += (standupCount / weekdays) * 10; // standups
    score += (closeoutCount / weekdays) * 10; // closeouts
    score += deepWork.length >= weekdays * 3 ? 10 : (deepWork.length / (weekdays * 3)) * 10; // deep work
    score -= latePct > 50 ? 10 : latePct > 25 ? 5 : 0; // late penalty
    score -= broken * 3; // broken promises
    score += kept * 1; // kept promises
    score = Math.max(0, Math.min(100, Math.round(score)));

    const weeklyGrade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : score >= 30 ? "D" : "F";

    // Issues and wins
    const issues: string[] = [];
    const wins: string[] = [];

    if (hours < weekdays * 6) issues.push(`Solo ${hours}h en la semana (esperadas: ${weekdays * 8}h)`);
    if (proofPct < 40) issues.push(`${proofPct}% evidencia — no se puede verificar su trabajo`);
    if (latePct > 60) issues.push(`${latePct}% entradas tardías — registra retroactivamente`);
    if (meetings.length > hours * 0.5 && hours > 10) issues.push(`${Math.round(meetings.length / hours * 100)}% del tiempo en reuniones`);
    if (standupCount < 3) issues.push(`Solo ${standupCount}/${weekdays} standups — no comunica su plan`);
    if (closeoutCount < 3) issues.push(`Solo ${closeoutCount}/${weekdays} cierres — no rinde cuentas`);
    if (broken > 0) issues.push(`${broken} promesa(s) rota(s)`);
    if (trend === "declining") issues.push(`Tendencia negativa: ${hoursDiff}h vs semana pasada`);

    if (proofPct >= 90) wins.push("Evidencia ejemplar");
    if (deepWork.length >= weekdays * 4) wins.push(`${deepWork.length}h de deep work — alta productividad`);
    if (standupCount >= weekdays) wins.push("Standup todos los días");
    if (closeoutCount >= weekdays) wins.push("Cierre todos los días");
    if (shoutouts >= 2) wins.push(`${shoutouts} shoutouts recibidos del equipo`);
    if (trend === "improving") wins.push(`Mejorando: +${hoursDiff}h vs semana pasada`);
    if (broken === 0 && kept >= 3) wins.push(`${kept} promesas cumplidas, 0 rotas`);

    // Callout
    let callout: string;
    if (weeklyGrade === "A") {
      callout = `Semana excelente de ${name}. Consistente, productivo, y transparente. El estándar a seguir.`;
    } else if (weeklyGrade === "B") {
      callout = `${name} tuvo una buena semana pero le falta ${issues[0] ? issues[0].toLowerCase() : "consistencia"}.`;
    } else if (weeklyGrade === "C") {
      callout = `Semana mediocre de ${name}. Hizo lo mínimo. ${issues.length > 0 ? issues[0] : "Sin destacar en nada."} ¿Esto es todo?`;
    } else if (weeklyGrade === "D") {
      callout = `${name} tuvo una semana pobre. ${issues.slice(0, 2).join(". ")}. Necesita mejorar ya.`;
    } else {
      callout = `${name} está fallando. ${issues.slice(0, 2).join(". ")}. Se necesita una conversación seria.`;
    }

    retros.push({
      name, role, user_id: m.user_id,
      total_hours: hours,
      avg_daily_hours: Math.round((hours / weekdays) * 10) / 10,
      proof_percent: proofPct,
      late_percent: latePct,
      deep_work_percent: hours > 0 ? Math.round((deepWork.length / hours) * 100) : 0,
      meeting_percent: hours > 0 ? Math.round((meetings.length / hours) * 100) : 0,
      standup_count: standupCount,
      closeout_count: closeoutCount,
      promises_kept: kept,
      promises_broken: broken,
      shoutouts_received: shoutouts,
      prev_hours: prevHours,
      prev_proof_percent: prevProofPct,
      trend,
      weekly_grade: weeklyGrade,
      callout,
      issues,
      wins,
    });
  }

  retros.sort((a, b) => {
    const order: Record<string, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };
    return order[a.weekly_grade] - order[b.weekly_grade];
  });

  // Team summary
  const teamHours = retros.reduce((s, r) => s + r.total_hours, 0);
  const teamProof = retros.length > 0 ? Math.round(retros.reduce((s, r) => s + r.proof_percent, 0) / retros.length) : 0;
  const fCount = retros.filter((r) => r.weekly_grade === "F").length;
  const aCount = retros.filter((r) => r.weekly_grade === "A").length;
  const improvingCount = retros.filter((r) => r.trend === "improving").length;
  const decliningCount = retros.filter((r) => r.trend === "declining").length;

  let teamSummary: string;
  if (fCount === 0 && aCount >= retros.length * 0.5) {
    teamSummary = "Semana excepcional. Más de la mitad del equipo con A. Mantener este estándar.";
  } else if (fCount === 0) {
    teamSummary = "Semana aceptable. Nadie reprobó pero hay espacio para mejorar.";
  } else if (fCount <= 1) {
    teamSummary = `Semana irregular. ${fCount} persona reprobó. El resto debe compensar y ayudar.`;
  } else {
    teamSummary = `Semana preocupante. ${fCount} personas reprobaron. Se necesita acción inmediata.`;
  }

  // Save retro
  await supabase.from("ai_reviews").insert({
    org_id: orgId,
    date: end,
    review_type: "weekly_retro",
    findings: { retros, team_hours: teamHours, team_proof: teamProof },
    summary: teamSummary,
  });

  return NextResponse.json({
    period: { start, end },
    team_summary: teamSummary,
    team_hours: teamHours,
    team_avg_proof: teamProof,
    a_count: aCount,
    f_count: fCount,
    improving: improvingCount,
    declining: decliningCount,
    retros,
  });
}
