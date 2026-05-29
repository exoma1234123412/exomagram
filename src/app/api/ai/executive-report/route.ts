import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// POST /api/ai/executive-report
// AI-generated executive narrative reports with format variants:
//   narrative — full intelligence-style report
//   executive — shorter KPI + action item focus
//   client    — sanitized, output-focused, no internal dynamics

export async function POST(request: NextRequest) {
  const serverClient = await createServerSupabase();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { org_id, period, date, format } = body as {
    org_id: string;
    period: "daily" | "weekly" | "monthly";
    date?: string;
    format: "narrative" | "executive" | "client";
  };

  if (!org_id || !period || !format) {
    return NextResponse.json(
      { error: "org_id, period y format son requeridos" },
      { status: 400 }
    );
  }

  // Verify membership
  const { data: membership } = await serverClient
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", org_id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "No perteneces a esta organizacion" },
      { status: 403 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // -------------------------------------------------------------------
  // 1. Calculate date range based on period
  // -------------------------------------------------------------------

  const baseDate = date ? new Date(date + "T12:00:00") : new Date();
  let startDate: string;
  let endDate: string;

  switch (period) {
    case "daily": {
      const d = baseDate.toISOString().split("T")[0];
      startDate = d;
      endDate = d;
      break;
    }
    case "weekly": {
      const end = new Date(baseDate);
      const start = new Date(baseDate);
      start.setDate(start.getDate() - 6);
      startDate = start.toISOString().split("T")[0];
      endDate = end.toISOString().split("T")[0];
      break;
    }
    case "monthly": {
      const end = new Date(baseDate);
      const start = new Date(baseDate);
      start.setDate(start.getDate() - 29);
      startDate = start.toISOString().split("T")[0];
      endDate = end.toISOString().split("T")[0];
      break;
    }
  }

  // -------------------------------------------------------------------
  // 2. Fetch ALL data in parallel (service-role client)
  // -------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type R = Record<string, any>;

  const [
    { data: members },
    { data: rawEntries },
    { data: rawTrustScores },
    { data: rawFlags },
    { data: rawCloseouts },
    { data: rawStandups },
    { data: rawPromises },
    { data: rawReactions },
    { data: rawShoutouts },
    { data: rawStreaks },
    { data: rawHealthData },
    { data: rawFocusSessions },
    { data: rawGitMetrics },
    { data: rawWeeklyReflections },
    { data: rawAiInsights },
    { data: rawAchievements },
  ] = await Promise.all([
    supabase
      .from("org_members")
      .select("user_id, role, profiles(full_name, email)")
      .eq("org_id", org_id),
    supabase
      .from("time_entries")
      .select("*, profiles(full_name)")
      .eq("org_id", org_id)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .from("trust_score_history")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .from("accountability_flags")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .from("daily_closeouts")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .from("standups")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .from("daily_promises")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .from("entry_reactions")
      .select("*, time_entries!inner(user_id, org_id, date)")
      .eq("time_entries.org_id", org_id)
      .gte("time_entries.date", startDate)
      .lte("time_entries.date", endDate),
    supabase
      .from("shoutouts")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .from("activity_streaks")
      .select("*")
      .eq("org_id", org_id),
    supabase
      .from("daily_health")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .from("focus_sessions")
      .select("*")
      .eq("org_id", org_id)
      .gte("started_at", `${startDate}T00:00:00`)
      .lte("started_at", `${endDate}T23:59:59`),
    supabase
      .from("git_daily_metrics")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .from("weekly_reflections")
      .select("*")
      .eq("org_id", org_id)
      .gte("week_start", startDate)
      .lte("week_start", endDate),
    supabase
      .from("ai_daily_insights")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .from("achievements")
      .select("*")
      .eq("org_id", org_id)
      .gte("unlocked_at", `${startDate}T00:00:00`)
      .lte("unlocked_at", `${endDate}T23:59:59`),
  ]);

  // Cast to usable types — service role client does not have generated types
  const entries = (rawEntries ?? []) as R[];
  const trustScores = (rawTrustScores ?? []) as R[];
  const flags = (rawFlags ?? []) as R[];
  const closeouts = (rawCloseouts ?? []) as R[];
  const standups = (rawStandups ?? []) as R[];
  const promises = (rawPromises ?? []) as R[];
  const reactions = (rawReactions ?? []) as R[];
  const shoutouts = (rawShoutouts ?? []) as R[];
  const streaks = (rawStreaks ?? []) as R[];
  const healthData = (rawHealthData ?? []) as R[];
  const focusSessions = (rawFocusSessions ?? []) as R[];
  const gitMetrics = (rawGitMetrics ?? []) as R[];
  const weeklyReflections = (rawWeeklyReflections ?? []) as R[];
  const achievements = (rawAchievements ?? []) as R[];

  // -------------------------------------------------------------------
  // 3. Compute aggregate metrics
  // -------------------------------------------------------------------

  const nameMap = new Map<string, string>();
  for (const m of members ?? []) {
    const p = m.profiles as unknown as {
      full_name: string;
      email: string;
    } | null;
    nameMap.set(m.user_id, p?.full_name ?? p?.email ?? "Desconocido");
  }

  const allUserIds = (members ?? []).map((m) => m.user_id);
  const perPersonSummaries: string[] = [];

  for (const uid of allUserIds) {
    const name = nameMap.get(uid) ?? "Desconocido";

    // Time entries
    const userEntries = entries.filter((e) => e.user_id === uid);
    const totalHours = userEntries.length;
    const withProof = userEntries.filter(
      (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
    ).length;
    const lateEntries = userEntries.filter((e) => e.is_late).length;
    const deepWork = userEntries.filter(
      (e) => e.category === "deep_work"
    ).length;
    const meetingHours = userEntries.filter(
      (e) => e.category === "meeting"
    ).length;
    const blockedHours = userEntries.filter(
      (e) => e.category === "blocked"
    ).length;
    const uniqueDates = new Set(userEntries.map((e) => e.date));
    const proofPct =
      totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0;
    const latePct =
      totalHours > 0 ? Math.round((lateEntries / totalHours) * 100) : 0;

    // Mood & energy averages
    const moods = userEntries
      .map((e) => e.mood as number | null)
      .filter((m): m is number => m != null);
    const energies = userEntries
      .map((e) => e.energy as number | null)
      .filter((e): e is number => e != null);
    const avgMood =
      moods.length > 0
        ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1)
        : "N/A";
    const avgEnergy =
      energies.length > 0
        ? (energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1)
        : "N/A";

    // Trust
    const userTrust = trustScores.filter((t) => t.user_id === uid);
    const avgTrust =
      userTrust.length > 0
        ? (
            userTrust.reduce((a, t) => a + t.score, 0) / userTrust.length
          ).toFixed(1)
        : "N/A";

    // Flags
    const userFlags = flags.filter((f) => f.user_id === uid);
    const unresolvedFlags = userFlags.filter((f) => !f.resolved).length;

    // Closeouts
    const userCloseouts = closeouts.filter((c) => c.user_id === uid);
    const closeoutRate =
      uniqueDates.size > 0
        ? Math.round((userCloseouts.length / uniqueDates.size) * 100)
        : 0;

    // Streaks
    const userStreak = streaks.find((s) => s.user_id === uid);

    // Promises
    const userPromises = promises.filter((p) => p.user_id === uid);
    const promisesKept = userPromises.filter(
      (p) => p.status === "delivered"
    ).length;
    const promisesBroken = userPromises.filter(
      (p) => p.status === "broken"
    ).length;

    // Reactions received
    const userReactions = reactions.filter((r) => {
      const te = r.time_entries as unknown as { user_id: string } | null;
      return te?.user_id === uid;
    });

    // Shoutouts
    const userShoutouts = shoutouts.filter(
      (s) => s.to_user_id === uid
    );

    // Achievements
    const userAchievements = achievements.filter(
      (a) => a.user_id === uid
    );

    // Health
    const userHealth = healthData.filter((h) => h.user_id === uid);
    const avgSleep =
      userHealth.length > 0
        ? (
            userHealth
              .filter((h) => h.sleep_hours != null)
              .reduce((a, h) => a + (h.sleep_hours as number), 0) /
            Math.max(
              userHealth.filter((h) => h.sleep_hours != null).length,
              1
            )
          ).toFixed(1)
        : "N/A";
    const avgStress =
      userHealth.length > 0
        ? (
            userHealth
              .filter((h) => h.stress_morning != null)
              .reduce((a, h) => a + (h.stress_morning as number), 0) /
            Math.max(
              userHealth.filter((h) => h.stress_morning != null).length,
              1
            )
          ).toFixed(1)
        : "N/A";
    const avgMotivation =
      userHealth.length > 0
        ? (
            userHealth
              .filter((h) => h.motivation_level != null)
              .reduce((a, h) => a + (h.motivation_level as number), 0) /
            Math.max(
              userHealth.filter((h) => h.motivation_level != null).length,
              1
            )
          ).toFixed(1)
        : "N/A";

    // Focus sessions
    const userFocus = focusSessions.filter(
      (f) => f.user_id === uid
    );
    const totalFocusMin = userFocus.reduce(
      (a, f) => a + (f.actual_minutes ?? 0),
      0
    );
    const flowSessions = userFocus.filter(
      (f) => f.flow_state_achieved
    ).length;
    const avgFocusQuality =
      userFocus.length > 0
        ? (
            userFocus
              .filter((f) => f.quality_rating != null)
              .reduce((a, f) => a + (f.quality_rating as number), 0) /
            Math.max(
              userFocus.filter((f) => f.quality_rating != null).length,
              1
            )
          ).toFixed(1)
        : "N/A";

    // Git
    const userGit = gitMetrics.filter((g) => g.user_id === uid);
    const totalCommits = userGit.reduce((a, g) => a + g.commits_count, 0);
    const totalPRs =
      userGit.reduce((a, g) => a + g.prs_opened, 0) +
      userGit.reduce((a, g) => a + g.prs_merged, 0);
    const totalLinesChanged =
      userGit.reduce((a, g) => a + g.lines_added, 0) +
      userGit.reduce((a, g) => a + g.lines_removed, 0);

    // Standups
    const userStandups = standups.filter((s) => s.user_id === uid);

    // Weekly reflections
    const userReflections = weeklyReflections.filter(
      (r) => r.user_id === uid
    );

    let summary = `
--- ${name} ---
Horas: ${totalHours}h en ${uniqueDates.size} dias (prom ${(totalHours / Math.max(uniqueDates.size, 1)).toFixed(1)}h/dia)
Deep Work: ${deepWork}h (${totalHours > 0 ? Math.round((deepWork / totalHours) * 100) : 0}%) | Reuniones: ${meetingHours}h | Bloqueado: ${blockedHours}h
Proof: ${proofPct}% (${withProof}/${totalHours}) | Late: ${latePct}% (${lateEntries})
Trust avg: ${avgTrust} | Mood avg: ${avgMood} | Energy avg: ${avgEnergy}
Flags: ${userFlags.length} total, ${unresolvedFlags} sin resolver (${userFlags.map((f) => f.flag_type).join(", ") || "ninguno"})
Closeout rate: ${closeoutRate}% | Standups: ${userStandups.length}
Streak: ${userStreak?.current_streak ?? 0}d actual, ${userStreak?.longest_streak ?? 0}d max
Promesas: ${promisesKept} cumplidas, ${promisesBroken} rotas de ${userPromises.length}
Reacciones recibidas: ${userReactions.length} | Shoutouts: ${userShoutouts.length}
Achievements: ${userAchievements.length} (${userAchievements.map((a) => a.achievement_type).join(", ") || "ninguno"})`;

    if (userHealth.length > 0) {
      const exerciseDays = userHealth.filter(
        (h) => h.exercise_minutes > 0
      ).length;
      const overtimeDays = userHealth.filter(
        (h) => h.worked_overtime
      ).length;
      summary += `\nSalud: ${userHealth.length} check-ins | Sleep: ${avgSleep}h | Stress: ${avgStress}/5 | Motivation: ${avgMotivation}/5 | Ejercicio: ${exerciseDays}d | Overtime: ${overtimeDays}d`;
    }

    if (userFocus.length > 0) {
      summary += `\nFocus: ${userFocus.length} sesiones, ${totalFocusMin}min | Flow: ${flowSessions}/${userFocus.length} | Quality: ${avgFocusQuality}/5`;
    }

    if (userGit.length > 0) {
      summary += `\nGit: ${totalCommits} commits, ${totalPRs} PRs, ${totalLinesChanged} lineas cambiadas`;
    }

    if (userReflections.length > 0) {
      for (const r of userReflections) {
        const parts: string[] = [];
        if (r.biggest_win) parts.push(`Win: "${r.biggest_win}"`);
        if (r.biggest_struggle)
          parts.push(`Struggle: "${r.biggest_struggle}"`);
        if (r.satisfaction != null)
          parts.push(`Satisfaccion: ${r.satisfaction}/5`);
        if (r.work_life_balance != null)
          parts.push(`Balance: ${r.work_life_balance}/5`);
        summary += `\nReflexion semana ${r.week_start}: ${parts.join(" | ")}`;
      }
    }

    perPersonSummaries.push(summary);
  }

  // Team-level aggregates
  const totalTeamHours = entries.length;
  const totalWithProof = entries.filter(
    (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
  ).length;
  const teamProofPct =
    totalTeamHours > 0
      ? Math.round((totalWithProof / totalTeamHours) * 100)
      : 0;
  const allTrust = trustScores.map((t) => t.score);
  const teamTrustAvg =
    allTrust.length > 0
      ? (allTrust.reduce((a, b) => a + b, 0) / allTrust.length).toFixed(1)
      : "N/A";
  const totalFlags = flags.length;
  const activeMembers = new Set(
    entries.map((e) => e.user_id)
  ).size;

  // Health aggregates
  const allSleep = healthData
    .filter((h) => h.sleep_hours != null)
    .map((h) => h.sleep_hours as number);
  const avgTeamSleep =
    allSleep.length > 0
      ? (allSleep.reduce((a, b) => a + b, 0) / allSleep.length).toFixed(1)
      : "N/A";
  const allStress = healthData
    .filter((h) => h.stress_morning != null)
    .map((h) => h.stress_morning as number);
  const avgTeamStress =
    allStress.length > 0
      ? (allStress.reduce((a, b) => a + b, 0) / allStress.length).toFixed(1)
      : "N/A";
  const allMotivation = healthData
    .filter((h) => h.motivation_level != null)
    .map((h) => h.motivation_level as number);
  const avgTeamMotivation =
    allMotivation.length > 0
      ? (
          allMotivation.reduce((a, b) => a + b, 0) / allMotivation.length
        ).toFixed(1)
      : "N/A";

  // Focus aggregates
  const totalFocusHours =
    focusSessions.reduce(
      (a, f) => a + (f.actual_minutes ?? 0),
      0
    ) / 60;
  const focusQualities = focusSessions
    .filter((f) => f.quality_rating != null)
    .map((f) => f.quality_rating as number);
  const avgTeamFocusQuality =
    focusQualities.length > 0
      ? (
          focusQualities.reduce((a, b) => a + b, 0) / focusQualities.length
        ).toFixed(1)
      : "N/A";
  const flowRate =
    focusSessions.length > 0
      ? Math.round(
          (focusSessions.filter((f) => f.flow_state_achieved)
            .length /
            focusSessions.length) *
            100
        )
      : 0;

  // Git aggregates
  const totalCommitsTeam = gitMetrics.reduce(
    (a, g) => a + g.commits_count,
    0
  );
  const totalPRsTeam =
    gitMetrics.reduce((a, g) => a + g.prs_opened, 0) +
    gitMetrics.reduce((a, g) => a + g.prs_merged, 0);
  const totalLinesTeam =
    gitMetrics.reduce((a, g) => a + g.lines_added, 0) +
    gitMetrics.reduce((a, g) => a + g.lines_removed, 0);

  // -------------------------------------------------------------------
  // 4. Build format-specific prompt
  // -------------------------------------------------------------------

  const periodLabel =
    period === "daily"
      ? "Diario"
      : period === "weekly"
        ? "Semanal"
        : "Mensual";

  const baseContext = `PERIODO: ${startDate} — ${endDate} (${periodLabel})
EQUIPO: ${allUserIds.length} personas, ${activeMembers} activos

METRICAS GLOBALES:
- Horas totales: ${totalTeamHours}
- Proof rate: ${teamProofPct}%
- Trust promedio: ${teamTrustAvg}
- Flags generados: ${totalFlags}
- Miembros activos: ${activeMembers}/${allUserIds.length}

DATOS DE SALUD DEL EQUIPO:
- Sleep promedio: ${avgTeamSleep}h | Stress promedio: ${avgTeamStress}/5 | Motivation promedio: ${avgTeamMotivation}/5
- Registros de salud: ${healthData.length}

SESIONES DE ENFOQUE:
- Total: ${focusSessions.length} sesiones, ${totalFocusHours.toFixed(1)}h
- Quality promedio: ${avgTeamFocusQuality}/5 | Flow rate: ${flowRate}%

ACTIVIDAD GIT:
- Commits: ${totalCommitsTeam} | PRs: ${totalPRsTeam} | Lineas cambiadas: ${totalLinesTeam}

DATOS POR PERSONA:
${perPersonSummaries.join("\n")}`;

  let prompt: string;

  if (format === "narrative") {
    prompt = `Eres el Director de Inteligencia de Exomagram. Genera un REPORTE NARRATIVO completo del equipo.
Escribe como un analista de inteligencia — factual, directo, sin rodeos. Datos especificos siempre.

${baseContext}

Genera un reporte con estas secciones EN JSON:
{
  "title": "Titulo del reporte",
  "executive_summary": "3-5 oraciones resumen ejecutivo. Lo mas importante primero.",
  "key_findings": [
    { "finding": "...", "severity": "positive|neutral|warning|critical", "data_point": "dato especifico" }
  ],
  "per_person_assessment": [
    { "name": "...", "grade": "A-F", "headline": "1 oracion resumen", "strengths": ["..."], "concerns": ["..."], "trust_trajectory": "up|stable|down" }
  ],
  "team_dynamics": "Analisis de dinamica del equipo — colaboracion, conflictos, patrones",
  "health_wellness_report": "Estado de salud del equipo basado en daily_health data",
  "productivity_analysis": "Deep work, focus sessions, efficiency — donde se pierde tiempo",
  "risk_assessment": [
    { "risk": "...", "probability": "high|medium|low", "impact": "...", "recommendation": "..." }
  ],
  "predictions": [
    { "prediction": "...", "confidence": 0-100, "timeframe": "..." }
  ],
  "action_items": [
    { "action": "...", "priority": "alta|media|baja", "assignee": "manager|persona especifica" }
  ],
  "notable_achievements": ["..."],
  "data_quality_score": 0-100,
  "generated_at": "${new Date().toISOString()}"
}

Se brutalmente honesto. Usa datos concretos, nombres reales, porcentajes exactos. Sin fluff corporativo.
Solo JSON valido.`;
  } else if (format === "executive") {
    prompt = `Eres el Director de Inteligencia de Exomagram. Genera un REPORTE EJECUTIVO conciso.
Enfocate en KPIs clave y acciones inmediatas. Maximo 1 pagina equivalente. Sin narrativa larga.

${baseContext}

Genera el reporte EN JSON:
{
  "title": "Titulo del reporte",
  "executive_summary": "2-3 oraciones. Solo lo critico.",
  "key_findings": [
    { "finding": "...", "severity": "positive|neutral|warning|critical", "data_point": "dato especifico" }
  ],
  "per_person_assessment": [
    { "name": "...", "grade": "A-F", "headline": "1 oracion resumen", "strengths": ["..."], "concerns": ["..."], "trust_trajectory": "up|stable|down" }
  ],
  "team_dynamics": "1-2 oraciones sobre dinamica del equipo",
  "health_wellness_report": "1-2 oraciones sobre salud del equipo",
  "productivity_analysis": "1-2 oraciones sobre productividad",
  "risk_assessment": [
    { "risk": "...", "probability": "high|medium|low", "impact": "...", "recommendation": "..." }
  ],
  "predictions": [
    { "prediction": "...", "confidence": 0-100, "timeframe": "..." }
  ],
  "action_items": [
    { "action": "...", "priority": "alta|media|baja", "assignee": "manager|persona especifica" }
  ],
  "notable_achievements": ["..."],
  "data_quality_score": 0-100,
  "generated_at": "${new Date().toISOString()}"
}

Conciso. Directo. Solo lo que importa. Sin fluff.
Solo JSON valido.`;
  } else {
    // client format
    prompt = `Eres el Director de Reportes de Exomagram. Genera un REPORTE PARA CLIENTE.
Este reporte sera compartido con stakeholders externos. NO incluyas dinamicas internas,
conflictos, ni datos personales sensibles. Enfocate en OUTPUT y ENTREGABLES.

${baseContext}

Genera el reporte EN JSON:
{
  "title": "Titulo del reporte",
  "executive_summary": "3-4 oraciones enfocadas en output del equipo y avance.",
  "key_findings": [
    { "finding": "...", "severity": "positive|neutral|warning|critical", "data_point": "dato especifico" }
  ],
  "per_person_assessment": [
    { "name": "...", "grade": "A-F", "headline": "1 oracion sobre contribucion", "strengths": ["..."], "concerns": ["..."], "trust_trajectory": "up|stable|down" }
  ],
  "team_dynamics": "Capacidad del equipo y colaboracion — sin detalles internos sensibles",
  "health_wellness_report": "Estado general del equipo — sin datos individuales de salud",
  "productivity_analysis": "Output del equipo, velocidad de entrega, calidad",
  "risk_assessment": [
    { "risk": "...", "probability": "high|medium|low", "impact": "...", "recommendation": "..." }
  ],
  "predictions": [
    { "prediction": "...", "confidence": 0-100, "timeframe": "..." }
  ],
  "action_items": [
    { "action": "...", "priority": "alta|media|baja", "assignee": "manager|persona especifica" }
  ],
  "notable_achievements": ["..."],
  "data_quality_score": 0-100,
  "generated_at": "${new Date().toISOString()}"
}

Profesional. Sin shame, sin critica personal. Enfocado en resultados y entregables.
Solo JSON valido.`;
  }

  // -------------------------------------------------------------------
  // 5. Call Claude and parse response
  // -------------------------------------------------------------------

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";

    let parsed;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    } catch {
      parsed = null;
    }

    if (!parsed) {
      return NextResponse.json(
        { error: "No se pudo parsear el reporte", raw: text },
        { status: 500 }
      );
    }

    // Store in ai_reviews
    await supabase.from("ai_reviews").insert({
      org_id,
      date: endDate,
      user_id: user.id,
      review_type: "executive_report",
      findings: parsed,
      summary: parsed.executive_summary ?? "",
      trust_impact: 0,
    });

    return NextResponse.json({
      success: true,
      report: parsed,
      model: "claude-sonnet-4-6",
      period: { start_date: startDate, end_date: endDate },
      format,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: "Error al generar reporte", details: errorMessage },
      { status: 500 }
    );
  }
}
