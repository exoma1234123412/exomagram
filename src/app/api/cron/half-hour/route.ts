import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET /api/cron/half-hour
//
// CLAUDE SURVEILLANCE — Runs every 30 minutes during work hours.
// Scans ALL data sources for anomalies, out-of-ordinary patterns, and
// anything that needs immediate attention. Claude sends messages to
// EVERYONE — private warnings, public feed, team-wide alerts.
//
// This is the heartbeat of the AI-native platform.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  // Check work hours (Monterrey time)
  const now = new Date();
  const mtyTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: "America/Monterrey",
  }).format(now);
  const [mtyHourStr, mtyMinStr] = mtyTime.split(":");
  const mtyHour = parseInt(mtyHourStr);
  const mtyMin = parseInt(mtyMinStr);

  if (mtyHour < 7 || mtyHour > 19) {
    return NextResponse.json({ skipped: true, reason: "Outside work hours", mtyHour });
  }

  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Monterrey" });
  if (dayOfWeek === "Sat" || dayOfWeek === "Sun") {
    return NextResponse.json({ skipped: true, reason: "Weekend" });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(now);
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(
    new Date(now.getTime() - 86400000),
  );

  // Get all orgs
  const { data: orgs } = await supabase.from("organizations").select("id, name");
  const results: Record<string, unknown> = { time: `${mtyHour}:${mtyMin}` };

  for (const org of orgs ?? []) {
    try {
      const orgResult = await runSurveillance(
        anthropic,
        supabase,
        org.id,
        org.name,
        today,
        yesterday,
        mtyHour,
        mtyMin,
        request.url,
      );
      results[`org_${org.id}`] = orgResult;
    } catch (e) {
      results[`error_${org.id}`] = (e as Error).message;
    }
  }

  return NextResponse.json({ success: true, ...results });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runSurveillance(
  anthropic: Anthropic,
  supabase: any,
  orgId: string,
  orgName: string,
  today: string,
  yesterday: string,
  hour: number,
  minute: number,
  requestUrl: string,
) {
  // ============================================================
  // GATHER ALL DATA — maximum context for anomaly detection
  // ============================================================
  const [
    { data: members },
    { data: todayEntries },
    { data: yesterdayEntries },
    { data: todayStandups },
    { data: todayPromises },
    { data: todayCloseouts },
    { data: streaks },
    { data: liveStatus },
    { data: todayFlags },
    { data: todayReactions },
    { data: todayHealth },
    { data: todayFocus },
    { data: todayGit },
    { data: todayComms },
    { data: recentFeed },
    { data: recentNotifs },
    { data: trustScores },
    { data: workProfiles },
    { data: yesterdayAggregates },
    { data: baselines },
    { data: strongCorrelations },
  ] = await Promise.all([
    supabase.from("org_members").select("user_id, role, profiles(full_name, email, work_start_hour, work_end_hour)").eq("org_id", orgId),
    supabase.from("time_entries").select("user_id, hour, category, title, is_late, proof_urls, mood, energy, difficulty, focus_quality, value_rating, stress_level, verification_status").eq("org_id", orgId).eq("date", today).is("deleted_at", null),
    supabase.from("time_entries").select("user_id, hour, category").eq("org_id", orgId).eq("date", yesterday).is("deleted_at", null),
    supabase.from("standups").select("user_id, submitted_at").eq("org_id", orgId).eq("date", today),
    supabase.from("daily_promises").select("user_id, title, status").eq("org_id", orgId).eq("date", today),
    supabase.from("daily_closeouts").select("user_id").eq("org_id", orgId).eq("date", today),
    supabase.from("activity_streaks").select("user_id, current_streak, longest_streak").eq("org_id", orgId),
    supabase.from("live_status").select("user_id, status, current_task, last_heartbeat").eq("org_id", orgId),
    supabase.from("accountability_flags").select("user_id, flag_type, details, resolved").eq("org_id", orgId).eq("date", today),
    supabase.from("entry_reactions").select("entry_id, user_id, reaction").eq("reaction", "suspicious"),
    supabase.from("daily_health").select("user_id, sleep_hours, sleep_quality, stress_morning, mental_clarity, motivation_level").eq("org_id", orgId).eq("date", today),
    supabase.from("focus_sessions").select("user_id, started_at, ended_at, interruption_count, quality_rating, was_completed").eq("org_id", orgId).gte("started_at", `${today}T00:00:00`),
    supabase.from("git_daily_metrics").select("user_id, commits_count, prs_opened, prs_merged, lines_added").eq("org_id", orgId).eq("date", today),
    supabase.from("communication_log").select("user_id, messages_sent, meetings_attended, meeting_minutes").eq("org_id", orgId).eq("date", today),
    supabase.from("public_feed").select("body, created_at, type").eq("org_id", orgId).eq("is_ai_generated", true).gte("created_at", `${today}T00:00:00`).order("created_at", { ascending: false }).limit(10),
    supabase.from("notifications").select("user_id, title, created_at").eq("org_id", orgId).gte("created_at", `${today}T00:00:00`).order("created_at", { ascending: false }).limit(20),
    supabase.from("trust_score_history").select("user_id, score, date").eq("org_id", orgId).gte("date", yesterday).order("date", { ascending: false }),
    supabase.from("ai_work_profiles").select("user_id, profile_data").eq("org_id", orgId),
    // V11 — Yesterday's aggregates for comparison + health enforcement
    supabase.from("daily_aggregates").select("user_id, total_hours, deep_work_hours, ai_score, ai_grade, trust_score").eq("org_id", orgId).eq("date", yesterday),
    // V12 — Personal baselines for personalized anomaly detection
    supabase.from("personal_baselines").select("user_id, avg_daily_hours, stddev_daily_hours, category_distribution, avg_mood, avg_energy, avg_stress, avg_quality_score, avg_proof_rate, avg_trust_score, trust_trend, typical_grade, promise_reliability, standup_rate, closeout_rate, avg_sleep_hours, data_completeness").eq("org_id", orgId).order("computed_date", { ascending: false }),
    // V12 — Strong correlations for context
    supabase.from("correlation_insights").select("user_id, dimension_a, dimension_b, correlation_coefficient, strength, insight").eq("org_id", orgId).in("strength", ["strong_positive", "strong_negative"]).order("computed_date", { ascending: false }).limit(30),
  ]);

  // ============================================================
  // BUILD COMPREHENSIVE STATE for Claude
  // ============================================================
  const standupSet = new Set((todayStandups ?? []).map((s: any) => s.user_id));
  const closeoutSet = new Set((todayCloseouts ?? []).map((c: any) => c.user_id));
  const streakMap = new Map<string, any>((streaks ?? []).map((s: any) => [s.user_id, s]));
  const healthMap = new Map<string, any>((todayHealth ?? []).map((h: any) => [h.user_id, h]));
  const profileMap = new Map<string, Record<string, unknown>>((workProfiles ?? []).map((p: any) => [p.user_id, p.profile_data]));
  const yesterdayAggMap = new Map<string, any>((yesterdayAggregates ?? []).map((a: any) => [a.user_id, a]));
  // V12 — Baselines (take most recent per user)
  const baselineMap = new Map<string, any>();
  for (const b of baselines ?? []) {
    if (!baselineMap.has(b.user_id)) baselineMap.set(b.user_id, b);
  }
  // V12 — Correlations by user
  const correlationMap = new Map<string, any[]>();
  for (const c of strongCorrelations ?? []) {
    if (!c.user_id) continue;
    const list = correlationMap.get(c.user_id) ?? [];
    list.push(c);
    correlationMap.set(c.user_id, list);
  }

  // Track how many notifications each person got today (avoid spam)
  const notifCounts = new Map<string, number>();
  for (const n of recentNotifs ?? []) {
    notifCounts.set(n.user_id, (notifCounts.get(n.user_id) ?? 0) + 1);
  }

  let state = `EQUIPO: ${orgName}\nHORA: ${hour}:${String(minute).padStart(2, "0")} Monterrey\nFECHA: ${today}\n`;
  state += `MENSAJES AI HOY: ${recentFeed?.length ?? 0} públicos, ${recentNotifs?.length ?? 0} privados\n\n`;

  // Recent AI messages (to avoid repetition)
  if (recentFeed && recentFeed.length > 0) {
    state += `ÚLTIMOS MENSAJES PÚBLICOS (NO repetir temas):\n`;
    for (const f of recentFeed.slice(0, 5)) {
      state += `  [${f.type}] "${f.body}" (${f.created_at})\n`;
    }
    state += "\n";
  }

  state += "=== ESTADO POR PERSONA ===\n";

  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string; work_start_hour: number; work_end_hour: number } | null;
    const name = p?.full_name ?? "?";
    const workStart = p?.work_start_hour ?? 8;
    const workEnd = p?.work_end_hour ?? 18;
    const isWithinSchedule = hour >= workStart && hour <= workEnd;

    const userEntries = (todayEntries ?? []).filter((e) => e.user_id === m.user_id);
    const yesterdayUserEntries = (yesterdayEntries ?? []).filter((e) => e.user_id === m.user_id);
    const userPromises = (todayPromises ?? []).filter((pr) => pr.user_id === m.user_id);
    const userFlags = (todayFlags ?? []).filter((f) => f.user_id === m.user_id);
    const userFocus = (todayFocus ?? []).filter((f) => f.user_id === m.user_id);
    const userGit = (todayGit ?? []).find((g) => g.user_id === m.user_id);
    const userComms = (todayComms ?? []).find((c) => c.user_id === m.user_id);
    const live = (liveStatus ?? []).find((l) => l.user_id === m.user_id);
    const streak = streakMap.get(m.user_id);
    const health = healthMap.get(m.user_id);
    const profile = profileMap.get(m.user_id);
    const notifsToday = notifCounts.get(m.user_id) ?? 0;
    const trustToday = (trustScores ?? []).find((t) => t.user_id === m.user_id && t.date === today);
    const trustYesterday = (trustScores ?? []).find((t) => t.user_id === m.user_id && t.date === yesterday);

    // Calculate expected hours by now
    const hoursExpectedByNow = Math.max(0, hour - workStart);
    const hoursLogged = userEntries.length;
    const hourGap = hoursExpectedByNow - hoursLogged;
    const lateCount = userEntries.filter((e) => e.is_late).length;
    const proofCount = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
    const flaggedCount = userEntries.filter((e) => e.verification_status === "flagged").length;

    // Mood/energy trends
    const moods = userEntries.filter((e) => e.mood).map((e) => e.mood as number);
    const energies = userEntries.filter((e) => e.energy).map((e) => e.energy as number);
    const stresses = userEntries.filter((e) => e.stress_level).map((e) => e.stress_level as number);
    const avgMood = moods.length > 0 ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : "?";
    const avgEnergy = energies.length > 0 ? (energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1) : "?";
    const avgStress = stresses.length > 0 ? (stresses.reduce((a, b) => a + b, 0) / stresses.length).toFixed(1) : "?";

    // Categories today
    const catCounts: Record<string, number> = {};
    for (const e of userEntries) catCounts[e.category] = (catCounts[e.category] ?? 0) + 1;
    const catSummary = Object.entries(catCounts).map(([k, v]) => `${k}=${v}`).join(",") || "ninguna";

    state += `\n${name} (horario ${workStart}-${workEnd}, ${isWithinSchedule ? "EN HORARIO" : "FUERA DE HORARIO"}):\n`;
    state += `  Horas: ${hoursLogged}/${hoursExpectedByNow} esperadas (gap=${hourGap}), ayer=${yesterdayUserEntries.length}h\n`;
    state += `  Categorías: ${catSummary}\n`;
    state += `  Evidencia: ${proofCount}/${hoursLogged}, Tardías: ${lateCount}, Flaggeadas: ${flaggedCount}\n`;
    state += `  Standup: ${standupSet.has(m.user_id) ? "sí" : "NO"}, Closeout: ${closeoutSet.has(m.user_id) ? "sí" : "NO"}\n`;
    state += `  Status: ${live?.status ?? "offline"}, Task: "${live?.current_task ?? "?"}", Heartbeat: ${live?.last_heartbeat ?? "nunca"}\n`;
    state += `  Racha: ${streak?.current_streak ?? 0}d (máx ${streak?.longest_streak ?? 0}d)\n`;
    state += `  Ánimo: ${avgMood}/5, Energía: ${avgEnergy}/5, Estrés: ${avgStress}/5\n`;
    state += `  Trust: hoy=${trustToday?.score ?? "?"}, ayer=${trustYesterday?.score ?? "?"}\n`;

    if (userPromises.length > 0) {
      state += `  Promesas: ${userPromises.map((pr) => `"${pr.title}"→${pr.status}`).join(", ")}\n`;
    }
    if (userFlags.length > 0) {
      state += `  FLAGS HOY: ${userFlags.map((f) => `${f.flag_type}${f.resolved ? "(resuelto)" : ""}`).join(", ")}\n`;
    }
    if (health) {
      state += `  Salud: sueño=${health.sleep_hours ?? "?"}h (calidad ${health.sleep_quality ?? "?"}), estrés mañana=${health.stress_morning ?? "?"}, claridad=${health.mental_clarity ?? "?"}, motivación=${health.motivation_level ?? "?"}\n`;
    }
    if (userFocus.length > 0) {
      const completed = userFocus.filter((f) => f.was_completed).length;
      const totalInterruptions = userFocus.reduce((sum, f) => sum + (f.interruption_count ?? 0), 0);
      state += `  Focus: ${userFocus.length} sesiones (${completed} completadas), ${totalInterruptions} interrupciones\n`;
    }
    if (userGit) {
      state += `  Git: ${userGit.commits_count} commits, ${userGit.prs_opened} PRs, +${userGit.lines_added} líneas\n`;
    }
    if (userComms) {
      state += `  Comms: ${userComms.messages_sent} msgs, ${userComms.meetings_attended} reuniones (${userComms.meeting_minutes}min)\n`;
    }
    if (profile) {
      state += `  Perfil AI: ${profile.work_personality ?? "?"}, motivadores: ${(profile.motivators as string[] ?? []).join(",") || "?"}\n`;
    }
    // V11 — Yesterday's aggregate for comparison
    const yAgg = yesterdayAggMap.get(m.user_id);
    if (yAgg) {
      state += `  Ayer (agregado): ${yAgg.total_hours}h, deep=${yAgg.deep_work_hours}, score=${yAgg.ai_score ?? "?"}, trust=${yAgg.trust_score ?? "?"}\n`;
    }
    // V12 — Personal baseline (30-day norm)
    const baseline = baselineMap.get(m.user_id);
    if (baseline) {
      state += `  BASELINE 30d: avg=${baseline.avg_daily_hours ?? "?"}h/d (±${baseline.stddev_daily_hours ?? "?"}), mood=${baseline.avg_mood ?? "?"}, energy=${baseline.avg_energy ?? "?"}, trust=${baseline.avg_trust_score ?? "?"} (${baseline.trust_trend ?? "?"}), grade=${baseline.typical_grade ?? "?"}, proof=${baseline.avg_proof_rate ?? "?"}%, promises=${baseline.promise_reliability ?? "?"}%, data=${baseline.data_completeness ?? "?"}%\n`;
    }
    // V12 — Strong correlations for this person
    const userCorrs = correlationMap.get(m.user_id);
    if (userCorrs && userCorrs.length > 0) {
      state += `  CORRELACIONES: ${userCorrs.slice(0, 3).map((c: any) => `${c.dimension_a}↔${c.dimension_b}=${c.correlation_coefficient > 0 ? "+" : ""}${c.correlation_coefficient}`).join(", ")}\n`;
    }
    // V11 — Health check status
    state += `  Health check: ${healthMap.has(m.user_id) ? "completado" : "PENDIENTE"}\n`;
    state += `  Notificaciones AI hoy: ${notifsToday}\n`;
  }

  // ============================================================
  // ANOMALY DETECTION PROMPT
  // ============================================================
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `Eres el Sistema de Vigilancia AI de Exomagram. Corres cada 30 minutos. Tu trabajo: detectar ANOMALÍAS y generar mensajes que CAMBIEN COMPORTAMIENTO usando psicología conductual avanzada.

${state}

══════════════════════════════════════════════════
ARSENAL PSICOLÓGICO — 30 TÉCNICAS. USA MÍNIMO 1 POR MENSAJE.
══════════════════════════════════════════════════

--- AVERSIÓN Y PÉRDIDA ---
1. LOSS_FRAMING: Enmarca SIEMPRE como pérdida. "PIERDES 5 pts" no "ganas 5".
2. SUNK_COST: "12 días de racha invertidos. ¿Los tiras por 1 hora?"
3. ENDOWMENT: "Tu Trust 87 es TUYO. Lo construiste entrada por entrada."
4. PAIN_OF_PAYING: Costo visceral. "Cada hora vacía = -3 pts. Llevas 4 = -12."

--- PRESIÓN SOCIAL ---
5. SOCIAL_PROOF: "4 de 5 ya registraron. Solo faltas tú."
6. CONTRAST: "[Top]: 6h, 100% evidencia. [Tú]: 1h, 0%."
7. SPOTLIGHT: "TODO el equipo VE tu perfil con 0h."
8. RECIPROCITY: "[Nombre] verificó 3 tuyas. Tú: 0 suyas."
9. COMPETITIVE_AROUSAL: "EXOMAP 5h vs Erik 3h. ¿Quién gana hoy?"
10. SOCIAL_FACILITATION: "Claude monitorea tu deep work en tiempo real."

--- IDENTIDAD Y CONSISTENCIA ---
11. IDENTITY: "Te consideras profesional. Profesionales no dejan 4h sin explicar."
12. COMMITMENT: "Dijiste: '[su promesa]'. Son las 4pm. ¿Dónde está?"
13. COGNITIVE_DISSONANCE: "Dices que tu trabajo importa. 3h sin evidencia dice lo contrario."
14. STATUS_QUO_BIAS: "En este equipo, standup antes de las 9 es lo normal."

--- MOTIVACIÓN Y PROGRESO ---
15. GOAL_GRADIENT: "Te faltan 2h. Al 75%. No pares."
16. PROGRESS_PRINCIPLE: Celebra micro-avances. "Primera hora. Momentum arrancó."
17. FOOT_IN_THE_DOOR: "Solo 1 hora con evidencia. Solo 1. ¿Puedes?"
18. DOOR_IN_THE_FACE: "Necesitas 6h deep work... ok, ¿al menos 3?"

--- TIEMPO Y URGENCIA ---
19. SCARCITY: "Quedan 2h. Tu racha EXPIRA en 3 horas."
20. TEMPORAL_LANDMARKS: Lunes="Nueva semana." Post-mal-día="Ayer D. Hoy reset."
21. PEAK_END_RULE: Último msg del día = pico del día + estado final.
22. PLANNING_FALLACY: "Dices 4h más. Históricamente: 1.2h después de 3pm."
23. HOT_COLD_GAP: "Son las 9. Planifica AHORA. A las 5 no querrás."

--- NARRATIVA Y REFUERZO ---
24. NARRATIVE: "Hace 3 semanas: peor racha. Hoy: 12 días. TU historia."
25. VARIABLE_REINFORCEMENT: Praise impredecible — slot machine. No cada vez.
26. ANCHORING: Su PROPIO pico. "Tu mejor semana: 42h. Esta: 18h."
27. MORAL_LICENSING: "Ayer A+. 60% de días A+ → C al siguiente. No caigas."

--- AVANZADAS ---
28. REACTANCE: Reverse psychology. "No creo que puedas hacer 3h deep work seguidas."
29. LEARNED_HELPLESSNESS_PREVENTION: 3+ días malos → NO piles on → competencia. "Difícil semana, pero tu deep work sigue top."
30. IMPLEMENTATION_INTENTION: "Si no registras antes de 3pm → B a C."

--- CUÁNDO USAR ---
VA BIEN → 27 + 25 | VA MAL → 13 + 1 + 7 | MAÑANA → 23 + 20 + 30
TARDE → 21 + 19 + 22 | SLUMP → 29 + 17 + 16 | COMPETITIVO → 9 + 6
FLOJO → 28 + 18 + 4 | EQUIPO → 10 + 14 + 5

══════════════════════════════════════════════════
ANOMALÍAS A DETECTAR
══════════════════════════════════════════════════

1. HUECOS: esperaba X horas, tiene Y (gap > 2h = crítico)
2. SILENCIO: en horario pero offline/idle, 0 entries
3. MOOD/ENERGY CRASH: < 2 consistente
4. ESTRÉS ALTO: > 4 repetido, stress_morning > 4
5. SUEÑO MALO: < 5h o calidad 1
6. PATRÓN INUSUAL: deep_work habitual → meetings todo el día
7. TRUST CAYENDO: > 10 pts menos que ayer
8. RACHA EN PELIGRO: streak > 7 pero 0h hoy
9. PROMESAS ROTAS: status "broken"
10. FLAGS ACUMULADOS: > 2 sin resolver
11. REUNIÓN EXCESIVA: > 3h meetings
12. ENTRIES RECHAZADAS: flagged por Claude
13. GIT INCONSISTENTE: deep_work pero 0 commits
14. HEARTBEAT MUERTO: online pero > 30 min sin pulso
15. REGRESIÓN VS AYER: 8h ayer → 0 hoy
16. FOCO INTERRUMPIDO: muchas interrupciones
17. HEALTH CHECK PENDIENTE: después de 10am
18. DECLINE VS AYER: ai_score alto ayer, mal hoy
19. DESVIACIÓN DE BASELINE: si hoy difiere > 1 stddev de su BASELINE 30d, señalar
20. CORRELACIÓN ACTIVA: si una persona tiene correlación fuerte (sleep↔productivity) y su sueño fue malo hoy (en health check), PREDECIR mal día
21. PROMISE RELIABILITY CAÍDA: si baseline.promise_reliability > 80% pero hoy rompió promesa, escalar

══════════════════════════════════════════════════
CANAL PÚBLICO — SHAME CON NOMBRES + RECONOCIMIENTO
══════════════════════════════════════════════════

OBLIGATORIO generar si aplica (CON NOMBRE COMPLETO):
- 0h al mediodía — usa CONTRAST con el equipo + LOSS FRAMING
- Entrada rechazada — usa SPOTLIGHT EFFECT
- Promesa rota — usa COMMITMENT & CONSISTENCY ("dijiste que...")
- Sin standup — usa SOCIAL PROOF ("X de Y ya lo hicieron")
- Sin closeout — usa ZEIGARNIK ("tu día quedó incompleto")
- Trust < 50 — usa ENDOWMENT EFFECT + SUNK COST ("lo que construiste se pierde")
- Racha rota — usa SUNK COST ("X días de inversión, perdidos")
- 3+ flags — usa AUTHORITY ("el sistema detectó un patrón preocupante")
- 0 evidencia — usa SOCIAL PROOF ("eres el único sin evidencia")
- Ghost — usa SPOTLIGHT ("el equipo ve tu status como online")
- Meeting > 50% — usa ANCHORING ("tu promedio es Y%, hoy Z%")
- Git vs horas — usa CONTRAST ("Git dice X, tú dices Y")

PÚBLICO POSITIVO (usa VARIABLE REINFORCEMENT — no siempre, sorprende):
- Reconocimiento: usa IDENTITY ("como líder en deep work...")
- Milestones: usa GOAL GRADIENT ("alcanzó su meta de...")
- Datos equipo: usa TEMPORAL LANDMARKS los lunes
- Provocaciones: usa SCARCITY ("quedan X horas para...")

══════════════════════════════════════════════════
CANAL PRIVADO — SOLO SALUD/BIENESTAR + COACHING
══════════════════════════════════════════════════

PRIVADO (nunca exponer públicamente):
- Sueño malo: coaching empático sobre descanso
- Estrés alto: sugerir break, reducir carga
- Mood bajo: check-in, preguntar si necesita algo
- Retos personalizados: usa GOAL GRADIENT + IMPLEMENTATION INTENTIONS
- Tips: usa su perfil de personalidad y motivadores

══════════════════════════════════════════════════
REGLAS ABSOLUTAS
══════════════════════════════════════════════════

- NOMBRES COMPLETOS en público. Siempre. Sin excepción.
- En cada mensaje, INDICA qué técnica psicológica usaste en el campo "psychology"
- NO repitas temas del día (ver ÚLTIMOS MENSAJES)
- Si alguien ya tiene > 5 notificaciones privadas hoy, no más privadas (públicas SÍ)
- NÚMEROS CONCRETOS SIEMPRE — nunca "varios" o "algunos"
- Cada mensaje = 1 ACCIÓN CLARA que la persona debe tomar
- Español mexicano informal, directo, sin corporativismo
- Salud/bienestar NUNCA público
- Si todo está bien: 1 mensaje público con dato interesante del equipo

JSON:
{
  "anomalies_detected": [
    { "person": "nombre", "anomaly": "descripción", "severity": "info|warning|critical", "data": "dato concreto" }
  ],
  "private_messages": [
    {
      "target_name": "nombre",
      "message": "texto directo usando técnica psicológica",
      "reason": "anomalía detectada",
      "psychology": "loss_framing|sunk_cost|endowment|pain_of_paying|social_proof|contrast|spotlight|reciprocity|competitive_arousal|social_facilitation|identity|commitment|cognitive_dissonance|status_quo_bias|goal_gradient|progress_principle|foot_in_the_door|door_in_the_face|scarcity|temporal_landmarks|peak_end_rule|planning_fallacy|hot_cold_gap|narrative|variable_reinforcement|anchoring|moral_licensing|reactance|learned_helplessness_prevention|implementation_intention",
      "urgency": "low|normal|high|critical"
    }
  ],
  "public_messages": [
    {
      "type": "shame|warning|praise|milestone|challenge|team_update|ai_announcement",
      "title": "título corto",
      "body": "texto con nombre completo y datos concretos",
      "target_name": "nombre o null",
      "psychology": "técnica usada",
      "emoji": "1 emoji",
      "urgency": "low|normal|high|critical"
    }
  ],
  "team_health": "green|yellow|red",
  "summary": "1 oración sobre el estado actual"
}

Solo JSON válido. Sin markdown.`,
    }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  let parsed: {
    anomalies_detected?: { person: string; anomaly: string; severity: string; data: string }[];
    private_messages?: { target_name: string; message: string; reason: string; urgency: string }[];
    public_messages?: { type: string; title: string; body: string; target_name: string | null; emoji: string; urgency: string }[];
    team_health?: string;
    summary?: string;
  } | null = null;

  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return { error: "Parse failed", raw_length: text.length };
  }

  const executed = { private: 0, public: 0, anomalies: parsed.anomalies_detected?.length ?? 0 };

  // Execute PRIVATE messages
  for (const msg of parsed.private_messages ?? []) {
    const targetMember = (members ?? []).find((m) => {
      const p = m.profiles as unknown as { full_name: string } | null;
      return p?.full_name?.toLowerCase().includes(msg.target_name?.toLowerCase() ?? "");
    });
    if (targetMember) {
      await supabase.from("notifications").insert({
        user_id: targetMember.user_id,
        org_id: orgId,
        type: msg.urgency === "critical" ? "flag_raised" : "entry_logged",
        title: `AI: ${msg.reason}`,
        body: msg.message,
      });
      executed.private++;
    }
  }

  // Execute PUBLIC messages
  for (const msg of parsed.public_messages ?? []) {
    const targetMember = msg.target_name
      ? (members ?? []).find((m) => {
          const p = m.profiles as unknown as { full_name: string } | null;
          return p?.full_name?.toLowerCase().includes(msg.target_name!.toLowerCase());
        })
      : null;

    await supabase.from("public_feed").insert({
      org_id: orgId,
      type: msg.type || "ai_announcement",
      title: msg.title,
      body: msg.body,
      target_user_id: targetMember?.user_id ?? null,
      urgency: msg.urgency || "normal",
      emoji: msg.emoji || null,
      is_ai_generated: true,
    });
    executed.public++;
  }

  // V11 — Enforce health check: flag at 2pm if not done
  if (hour >= 14) {
    const healthFlagSet = new Set(
      (todayFlags ?? [])
        .filter((f: any) => f.flag_type === "no_health_check")
        .map((f: any) => f.user_id)
    );
    for (const m of members ?? []) {
      if (!healthMap.has(m.user_id) && !healthFlagSet.has(m.user_id)) {
        await supabase.from("accountability_flags").insert({
          user_id: m.user_id,
          org_id: orgId,
          flag_type: "no_health_check",
          date: today,
          details: "No ha completado el health check del día",
        });
      }
    }
  }

  // Store anomalies as AI review for history
  if ((parsed.anomalies_detected?.length ?? 0) > 0) {
    await supabase.from("ai_reviews").insert({
      org_id: orgId,
      date: today,
      review_type: "daily_team",
      findings: {
        anomalies: parsed.anomalies_detected,
        team_health: parsed.team_health,
        scan_time: `${hour}:${String(minute).padStart(2, "0")}`,
      },
      summary: parsed.summary ?? "Scan completado",
      trust_impact: 0,
    });
  }

  return {
    time: `${hour}:${String(minute).padStart(2, "0")}`,
    team_health: parsed.team_health,
    summary: parsed.summary,
    anomalies: executed.anomalies,
    private_sent: executed.private,
    public_posted: executed.public,
  };
}
