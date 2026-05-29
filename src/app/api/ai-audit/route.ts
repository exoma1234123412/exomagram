import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";

// POST /api/ai-audit?org_id=xxx&date=yyyy-mm-dd
// Brutally honest AI audit of each person's day
// Grades everyone A-F and explains why
// This feeds directly into the trust score

const EXPECTED_HOURS = 8;

interface PersonAudit {
  user_id: string;
  name: string;
  grade: "A" | "B" | "C" | "D" | "F";
  score_impact: number; // -20 to +10
  verdict: string; // One brutal sentence
  details: string[]; // Specific callouts
  red_flags: string[];
  strengths: string[];
  hours: number;
  proof_percent: number;
  deep_work_hours: number;
  meeting_hours: number;
  late_percent: number;
  has_standup: boolean;
  has_closeout: boolean;
  promises_delivered: number;
  promises_broken: number;
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Fetch everything we need
  const [
    { data: entries },
    { data: members },
    { data: closeouts },
    { data: standups },
    { data: promises },
    { data: reactions },
  ] = await Promise.all([
    supabase.from("time_entries").select("*, profiles(full_name)").eq("org_id", orgId).eq("date", date),
    supabase.from("org_members").select("user_id, profiles(full_name, role)").eq("org_id", orgId),
    supabase.from("daily_closeouts").select("user_id").eq("org_id", orgId).eq("date", date),
    supabase.from("standups").select("user_id").eq("org_id", orgId).eq("date", date),
    supabase.from("daily_promises").select("user_id, status").eq("org_id", orgId).eq("date", date),
    supabase.from("entry_reactions").select("entry_id, reaction"),
  ]);

  const closeoutSet = new Set(closeouts?.map((c) => c.user_id) ?? []);
  const standupSet = new Set(standups?.map((s) => s.user_id) ?? []);
  const suspiciousEntries = new Set(
    (reactions ?? []).filter((r) => r.reaction === "suspicious").map((r) => r.entry_id)
  );

  const audits: PersonAudit[] = [];

  for (const member of members ?? []) {
    const profile = member.profiles as unknown as { full_name: string; role: string } | null;
    const name = profile?.full_name ?? "?";
    const userEntries = (entries ?? []).filter((e) => e.user_id === member.user_id);
    const hours = userEntries.length;
    const withProof = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
    const lateOnes = userEntries.filter((e) => e.is_late);
    const deepWork = userEntries.filter((e) => e.category === "deep_work");
    const meetings = userEntries.filter((e) => e.category === "meeting");
    const blocked = userEntries.filter((e) => e.category === "blocked");
    const breaks = userEntries.filter((e) => e.category === "break");
    const admin = userEntries.filter((e) => e.category === "admin");
    const hasStandup = standupSet.has(member.user_id);
    const hasCloseout = closeoutSet.has(member.user_id);
    const userPromises = (promises ?? []).filter((p) => p.user_id === member.user_id);
    const promisesDelivered = userPromises.filter((p) => p.status === "delivered").length;
    const promisesBroken = userPromises.filter((p) => p.status === "broken").length;
    const proofPercent = hours > 0 ? Math.round((withProof.length / hours) * 100) : 0;
    const latePercent = hours > 0 ? Math.round((lateOnes.length / hours) * 100) : 0;
    const suspiciousCount = userEntries.filter((e) => suspiciousEntries.has(e.id)).length;

    // Title analysis
    const titles = userEntries.map((e) => e.title);
    const avgTitleLen = titles.length > 0 ? titles.reduce((s, t) => s + t.length, 0) / titles.length : 0;
    const uniqueTitles = new Set(titles.map((t) => t.toLowerCase().trim()));
    const hasDuplicateTitles = titles.length >= 3 && uniqueTitles.size < titles.length * 0.6;

    // Same-hour logging detection (all logged at once = backfill)
    const logTimes = userEntries.map((e) => new Date(e.logged_at ?? e.created_at).getTime());
    const logSpanMinutes = logTimes.length >= 2
      ? (Math.max(...logTimes) - Math.min(...logTimes)) / 1000 / 60
      : 999;
    const bulkBackfill = logTimes.length >= 4 && logSpanMinutes < 10;

    // --- GRADING ALGORITHM ---
    let score = 50; // Start at C
    const details: string[] = [];
    const redFlags: string[] = [];
    const strengths: string[] = [];

    // Hours (max +20, min -25)
    if (hours >= EXPECTED_HOURS) {
      score += 15;
      strengths.push(`${hours}h registradas — cumple con lo esperado`);
    } else if (hours >= 6) {
      score += 5;
      details.push(`${hours}/${EXPECTED_HOURS}h — casi llega pero no es suficiente`);
    } else if (hours >= 3) {
      score -= 10;
      details.push(`Solo ${hours}h registradas — medio día perdido`);
    } else if (hours > 0) {
      score -= 20;
      redFlags.push(`Solo ${hours}h — ¿qué hizo el resto del día?`);
    } else {
      score -= 25;
      redFlags.push("0 HORAS REGISTRADAS — día completamente invisible");
    }

    // Proof (max +15, min -15)
    if (proofPercent === 100 && hours >= 6) {
      score += 15;
      strengths.push("100% de evidencia — impecable");
    } else if (proofPercent >= 70) {
      score += 8;
      strengths.push(`${proofPercent}% evidencia — buen nivel`);
    } else if (proofPercent >= 40) {
      score -= 5;
      details.push(`Solo ${proofPercent}% evidencia — muchas horas sin respaldo`);
    } else if (hours > 0) {
      score -= 15;
      redFlags.push(`${proofPercent}% evidencia — casi todo sin verificar`);
    }

    // Deep work ratio
    if (deepWork.length >= 4) {
      score += 8;
      strengths.push(`${deepWork.length}h de deep work — producción real`);
    } else if (deepWork.length === 0 && hours >= 4) {
      score -= 5;
      details.push("0 horas de deep work — ¿dónde está el output?");
    }

    // Meeting overload
    if (meetings.length >= 5) {
      score -= 8;
      redFlags.push(`${meetings.length}h en reuniones — más hablando que haciendo`);
    } else if (meetings.length >= 3 && deepWork.length < 3) {
      score -= 3;
      details.push("Más reuniones que deep work — prioridades invertidas");
    }

    // Blocked excuse
    if (blocked.length >= 3) {
      score -= 10;
      redFlags.push(`${blocked.length}h "bloqueado" — ¿de verdad no podía hacer NADA más?`);
    }

    // Breaks
    if (breaks.length >= 3) {
      score -= 5;
      details.push(`${breaks.length}h de descanso — generoso con los breaks`);
    }

    // Admin overload
    if (admin.length >= 4) {
      score -= 3;
      details.push(`${admin.length}h de admin — mucho trabajo burocrático`);
    }

    // Late entries
    if (latePercent === 100 && hours >= 3) {
      score -= 12;
      redFlags.push("100% entradas tardías — todo backfilled retroactivamente");
    } else if (latePercent >= 50) {
      score -= 5;
      details.push(`${latePercent}% tardías — registra después, no durante`);
    }

    // Bulk backfill
    if (bulkBackfill) {
      score -= 15;
      redFlags.push(`${hours} entradas registradas en ${Math.round(logSpanMinutes)} minutos — BACKFILL MASIVO`);
    }

    // Title quality
    if (hasDuplicateTitles) {
      score -= 8;
      redFlags.push("Títulos repetidos — copy-paste de entradas");
    }
    if (avgTitleLen < 15 && hours >= 3) {
      score -= 5;
      details.push("Títulos muy cortos y vagos — no se entiende qué hizo");
    }

    // Suspicious reactions from peers
    if (suspiciousCount > 0) {
      score -= suspiciousCount * 5;
      redFlags.push(`${suspiciousCount} entrada(s) marcadas como sospechosas por compañeros`);
    }

    // Standup & closeout
    if (hasStandup) { score += 3; strengths.push("Hizo standup"); }
    else { score -= 3; details.push("No hizo standup"); }

    if (hasCloseout) { score += 3; strengths.push("Hizo cierre del día"); }
    else { score -= 3; details.push("No hizo cierre del día"); }

    // Promises
    if (promisesBroken > 0) {
      score -= promisesBroken * 5;
      redFlags.push(`${promisesBroken} promesa(s) rota(s) — dijo que iba a entregar y no lo hizo`);
    }
    if (promisesDelivered > 0 && promisesBroken === 0) {
      score += promisesDelivered * 2;
      strengths.push(`${promisesDelivered} promesa(s) cumplida(s)`);
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    // Determine grade
    let grade: PersonAudit["grade"];
    if (score >= 85) grade = "A";
    else if (score >= 70) grade = "B";
    else if (score >= 50) grade = "C";
    else if (score >= 30) grade = "D";
    else grade = "F";

    // Generate verdict
    let verdict: string;
    if (grade === "A") {
      verdict = `Día excelente. ${name} entregó resultados reales con evidencia. Así se trabaja.`;
    } else if (grade === "B") {
      verdict = `Buen día para ${name}, pero hay espacio para mejorar en ${redFlags.length > 0 ? "evidencia y puntualidad" : "consistencia"}.`;
    } else if (grade === "C") {
      verdict = `Día mediocre de ${name}. Cumplió lo mínimo pero sin destacar. ¿Esto es todo lo que puede dar?`;
    } else if (grade === "D") {
      verdict = `Día pobre de ${name}. Falta de horas, evidencia, o ambas. Necesita mejorar urgentemente.`;
    } else {
      verdict = `${name} prácticamente no trabajó hoy. ${hours === 0 ? "CERO horas registradas." : `Solo ${hours}h y sin calidad.`} Inaceptable.`;
    }

    // Score impact on trust score
    const scoreImpact = grade === "A" ? 5 : grade === "B" ? 2 : grade === "C" ? -2 : grade === "D" ? -8 : -15;

    audits.push({
      user_id: member.user_id,
      name,
      grade,
      score_impact: scoreImpact,
      verdict,
      details,
      red_flags: redFlags,
      strengths,
      hours,
      proof_percent: proofPercent,
      deep_work_hours: deepWork.length,
      meeting_hours: meetings.length,
      late_percent: latePercent,
      has_standup: hasStandup,
      has_closeout: hasCloseout,
      promises_delivered: promisesDelivered,
      promises_broken: promisesBroken,
    });

    // Save to ai_reviews for history
    await supabase.from("ai_reviews").insert({
      org_id: orgId,
      date,
      user_id: member.user_id,
      review_type: "daily_individual",
      findings: { grade, score_impact: scoreImpact, red_flags: redFlags, details, strengths },
      summary: verdict,
      trust_impact: scoreImpact,
    });
  }

  // Sort: worst grades first
  const gradeOrder: Record<string, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };
  audits.sort((a, b) => gradeOrder[a.grade] - gradeOrder[b.grade]);

  // Team summary
  const avgScore = audits.length > 0
    ? Math.round(audits.reduce((s, a) => s + (gradeOrder[a.grade] * 25), 0) / audits.length)
    : 0;
  const fCount = audits.filter((a) => a.grade === "F").length;
  const aCount = audits.filter((a) => a.grade === "A").length;

  let teamVerdict: string;
  if (avgScore >= 80) {
    teamVerdict = "Día excepcional para el equipo. Producción real, evidencia sólida.";
  } else if (avgScore >= 60) {
    teamVerdict = "Día aceptable pero hay personas arrastrando al equipo hacia abajo.";
  } else if (avgScore >= 40) {
    teamVerdict = "Día mediocre. Demasiadas personas sin output real. Hay que investigar.";
  } else {
    teamVerdict = "Día inaceptable. El equipo no está produciendo. Reunión urgente necesaria.";
  }

  return NextResponse.json({
    date,
    team_verdict: teamVerdict,
    team_avg_score: avgScore,
    a_count: aCount,
    f_count: fCount,
    audits,
  });
}
