import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkAIRateLimit } from "@/lib/ai-rate-limit";

// POST /api/claude-brain
// THE CLAUDE BRAIN: Universal AI endpoint.
// Ask Claude ANYTHING about the team data. It has access to EVERYTHING.
//
// Modes:
// - "ask": Free-form question about team data
// - "lie_detector": Is this specific entry real or fake?
// - "team_optimizer": Who should work on what?
// - "conflict_detector": Are there tensions between people?
// - "future_sim": What happens if current patterns continue?
// - "devil_advocate": Challenge someone's plan
// - "personality_profile": Build a work personality for someone
// - "morning_briefing": Personalized morning briefing for a user
// - "evening_roast": Personalized evening roast/review for a user

export async function POST(request: Request) {
  // AI rate limiting
  const rateLimitResponse = await checkAIRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;
  // Auth: verify user is logged in
  const serverClient = await createServerSupabase();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { mode, org_id, question, user_id, entry_id, date } = body;

  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  // Verify user belongs to the org
  const { data: membership } = await serverClient
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", org_id)
    .single();
  if (!membership) {
    return NextResponse.json({ error: "No perteneces a esta organización" }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // Service-role client for data queries (bypasses RLS)
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const today = date ?? new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentStart = sevenDaysAgo.toISOString().split("T")[0];

  // Gather ALL data (Claude gets everything)
  const [
    { data: members },
    { data: entries },
    { data: todayEntries },
    { data: standups },
    { data: closeouts },
    { data: promises },
    { data: shoutouts },
    { data: github },
    { data: streaks },
    { data: reactions },
    { data: weeklySummaries },
    { data: workProfiles },
    { data: dailyInsights },
    { data: baselines },
    { data: correlations },
    { data: darkHours },
    { data: nudgeHistory },
  ] = await Promise.all([
    supabase.from("org_members").select("user_id, role, profiles(full_name, email)").eq("org_id", org_id),
    supabase.from("time_entries").select("*").eq("org_id", org_id).gte("date", recentStart).order("date").order("hour"),
    supabase.from("time_entries").select("*, profiles(full_name)").eq("org_id", org_id).eq("date", today).order("hour"),
    supabase.from("standups").select("*").eq("org_id", org_id).gte("date", recentStart),
    supabase.from("daily_closeouts").select("*").eq("org_id", org_id).gte("date", recentStart),
    supabase.from("daily_promises").select("*").eq("org_id", org_id).gte("date", recentStart),
    supabase.from("shoutouts").select("*").eq("org_id", org_id).gte("date", recentStart),
    supabase.from("github_events").select("*").eq("org_id", org_id).gte("date", recentStart),
    supabase.from("activity_streaks").select("*").eq("org_id", org_id),
    supabase.from("entry_reactions").select("entry_id, reaction, user_id, time_entries!inner(org_id)").eq("time_entries.org_id", org_id),
    supabase.from("weekly_summaries").select("*").eq("org_id", org_id).order("week_start"),
    supabase.from("ai_work_profiles").select("*").eq("org_id", org_id),
    supabase.from("ai_daily_insights").select("*").eq("org_id", org_id).order("date", { ascending: false }).limit(35),
    supabase.from("personal_baselines").select("user_id, avg_daily_hours, stddev_daily_hours, avg_mood, avg_energy, avg_trust_score, trust_trend, typical_grade, promise_reliability, category_distribution, data_completeness").eq("org_id", org_id).order("computed_date", { ascending: false }),
    supabase.from("correlation_insights").select("user_id, dimension_a, dimension_b, correlation_coefficient, strength").eq("org_id", org_id).in("strength", ["strong_positive", "strong_negative"]).order("computed_date", { ascending: false }).limit(50),
    supabase.from("unlogged_hours").select("user_id, date, hour, was_online, dominant_status").eq("org_id", org_id).gte("date", recentStart).eq("was_online", true),
    supabase.from("nudge_outcomes").select("user_id, nudge_type, psychology_technique, behavior_changed, response_latency_seconds").eq("org_id", org_id).gte("sent_at", recentStart + "T00:00:00"),
  ]);

  // Build comprehensive data summary
  const memberMap = new Map<string, string>();
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string; role: string } | null;
    memberMap.set(m.user_id, `${p?.full_name ?? "?"}`);
  }

  // LAYER 0: AI Work Profiles (persistent personality/pattern data per person)
  let dataSummary = "══════ PERFILES DE TRABAJO (AI-generated, updated nightly) ══════\n\n";

  const profileMap = new Map<string, Record<string, unknown>>();
  for (const wp of workProfiles ?? []) {
    profileMap.set(wp.user_id, wp.profile_data as Record<string, unknown>);
  }

  for (const [userId, name] of memberMap) {
    const pd = profileMap.get(userId);
    if (pd) {
      dataSummary += `--- ${name} ---\n`;
      dataSummary += `Personalidad: ${pd.work_personality ?? "?"}\n`;
      dataSummary += `Cronotipo: ${pd.chronotype ?? "?"}, Consistencia: ${pd.consistency_score ?? "?"}/100\n`;
      dataSummary += `Fortalezas: ${(pd.strengths as string[] ?? []).join(", ")}\n`;
      dataSummary += `Debilidades: ${(pd.weaknesses as string[] ?? []).join(", ")}\n`;
      dataSummary += `Motivadores: ${(pd.motivators as string[] ?? []).join(", ")}\n`;
      dataSummary += `Riesgos: ${(pd.risk_factors as string[] ?? []).join(", ")}\n`;
      dataSummary += `Horas óptimas: ${pd.optimal_work_hours ?? "?"}\n\n`;
    }
  }

  // Recent AI insights (last 7 days of daily grades/predictions)
  dataSummary += "══════ INSIGHTS RECIENTES (últimos 7 días de AI) ══════\n\n";
  const insightMap = new Map<string, Array<Record<string, unknown>>>();
  for (const di of dailyInsights ?? []) {
    const list = insightMap.get(di.user_id) ?? [];
    list.push({ date: di.date, ...(di.insight as Record<string, unknown>), predictive: di.predictive });
    insightMap.set(di.user_id, list);
  }

  for (const [userId, name] of memberMap) {
    const insights = insightMap.get(userId);
    if (insights && insights.length > 0) {
      dataSummary += `${name}: ${insights.map((i) => `${i.date}=${i.grade}(${i.score})`).join(", ")}\n`;
      const latest = insights[0];
      const pred = latest.predictive as Record<string, unknown> | undefined;
      if (pred) {
        dataSummary += `  Burnout: ${pred.burnout_risk ?? "?"}%, Disengagement: ${pred.disengagement_risk ?? "?"}%, Trayectoria: ${pred.trajectory ?? "?"}\n`;
      }
    }
  }
  dataSummary += "\n";

  // LAYER 1: Historical weekly summaries (ALL-TIME memory)
  dataSummary += "══════ MEMORIA HISTÓRICA (resúmenes semanales comprimidos) ══════\n\n";

  const summaryMap = new Map<string, Array<{ week: string; narrative: string; summary: Record<string, unknown> }>>();
  for (const ws of weeklySummaries ?? []) {
    const list = summaryMap.get(ws.user_id) ?? [];
    list.push({ week: ws.week_start, narrative: ws.ai_narrative ?? "", summary: ws.summary as Record<string, unknown> });
    summaryMap.set(ws.user_id, list);
  }

  for (const [userId, name] of memberMap) {
    const userSummaries = summaryMap.get(userId) ?? [];
    if (userSummaries.length > 0) {
      dataSummary += `--- ${name} (historial de ${userSummaries.length} semanas) ---\n`;
      for (const ws of userSummaries) {
        const s = ws.summary;
        dataSummary += `Semana ${ws.week}: ${s.total_hours ?? 0}h, deep_work=${s.deep_work ?? 0}, meetings=${s.meetings ?? 0}, proof=${s.proof_percent ?? 0}%, late=${s.late_percent ?? 0}%\n`;
        if (ws.narrative) dataSummary += `  → ${ws.narrative.slice(0, 300)}\n`;
      }
      dataSummary += "\n";
    }
  }

  dataSummary += "\n══════ DATOS EN VIVO (últimos 7 días — detalle completo) ══════\n\n";

  // LAYER 2: Recent raw data (last 7 days)
  for (const [userId, name] of memberMap) {
    const userEntries = (entries ?? []).filter((e) => e.user_id === userId);
    const userToday = (todayEntries ?? []).filter((e) => e.user_id === userId);
    const userStandups = (standups ?? []).filter((s) => s.user_id === userId);
    const userCloseouts = (closeouts ?? []).filter((c) => c.user_id === userId);
    const userPromises = (promises ?? []).filter((p) => p.user_id === userId);
    const userShoutoutsRx = (shoutouts ?? []).filter((s) => s.to_user_id === userId);
    const userShoutoutsTx = (shoutouts ?? []).filter((s) => s.from_user_id === userId);
    const userGithub = (github ?? []).filter((g) => g.user_id === userId);
    const userStreak = (streaks ?? []).find((s) => s.user_id === userId);

    const totalH = userEntries.length;
    const deepWork = userEntries.filter((e) => e.category === "deep_work").length;
    const meetings = userEntries.filter((e) => e.category === "meeting").length;
    const blocked = userEntries.filter((e) => e.category === "blocked").length;
    const withProof = userEntries.filter((e) => e.proof_urls?.length > 0).length;
    const late = userEntries.filter((e) => e.is_late).length;
    const uniqueDates = new Set(userEntries.map((e) => e.date));
    const keptPromises = userPromises.filter((p) => p.status === "delivered").length;
    const brokenPromises = userPromises.filter((p) => p.status === "broken").length;

    const entryIds = new Set(userEntries.map((e) => e.id));
    const suspicious = (reactions ?? []).filter((r) => r.reaction === "suspicious" && entryIds.has(r.entry_id)).length;

    const userBaseline = (baselines ?? []).find(b => b.user_id === userId);
    const userCorrs = (correlations ?? []).filter(c => c.user_id === userId);
    const userDarkHours = (darkHours ?? []).filter(d => d.user_id === userId);
    const userNudges = (nudgeHistory ?? []).filter(n => n.user_id === userId);

    dataSummary += `=== ${name} ===\n`;
    dataSummary += `30 días: ${totalH}h total, ${uniqueDates.size} días activos, ${(totalH / Math.max(uniqueDates.size, 1)).toFixed(1)}h/día avg\n`;
    dataSummary += `Categorías: deep_work=${deepWork}, meetings=${meetings}, blocked=${blocked}, otros=${totalH - deepWork - meetings - blocked}\n`;
    dataSummary += `Evidencia: ${withProof}/${totalH} (${totalH > 0 ? Math.round(withProof / totalH * 100) : 0}%), Tardías: ${late} (${totalH > 0 ? Math.round(late / totalH * 100) : 0}%)\n`;
    dataSummary += `Standups: ${userStandups.length}, Closeouts: ${userCloseouts.length}\n`;
    dataSummary += `Promesas: ${keptPromises} cumplidas, ${brokenPromises} rotas\n`;
    dataSummary += `Shoutouts: ${userShoutoutsRx.length} recibidos, ${userShoutoutsTx.length} dados\n`;
    dataSummary += `GitHub: ${userGithub.length} eventos, Racha: ${userStreak?.current_streak ?? 0} días\n`;
    dataSummary += `Marcado sospechoso: ${suspicious} veces\n`;

    if (userBaseline) {
      dataSummary += `Baseline: avg=${userBaseline.avg_daily_hours ?? "?"}h/día, trust_trend=${userBaseline.trust_trend ?? "?"}, grade=${userBaseline.typical_grade ?? "?"}, promise_reliability=${userBaseline.promise_reliability ?? "?"}%, data_completeness=${userBaseline.data_completeness ?? "?"}%\n`;
    }
    if (userCorrs.length > 0) {
      dataSummary += `Correlaciones fuertes: ${userCorrs.map(c => `${c.dimension_a}<->${c.dimension_b} (${c.strength}, r=${c.correlation_coefficient})`).join("; ")}\n`;
    }
    if (userDarkHours.length > 0) {
      dataSummary += `Horas oscuras (online sin registrar, 7d): ${userDarkHours.length} horas — ${userDarkHours.map(d => `${d.date} ${d.hour}:00 (${d.dominant_status})`).join("; ")}\n`;
    }
    if (userNudges.length > 0) {
      const worked = userNudges.filter(n => n.behavior_changed);
      const failed = userNudges.filter(n => !n.behavior_changed);
      dataSummary += `Nudges (7d): ${userNudges.length} enviados, ${worked.length} funcionaron, ${failed.length} ignorados. Efectivos: ${worked.map(n => `${n.nudge_type}/${n.psychology_technique}`).join(", ") || "ninguno"}. Fallidos: ${failed.map(n => `${n.nudge_type}/${n.psychology_technique}`).join(", ") || "ninguno"}\n`;
    }

    if (userToday.length > 0) {
      dataSummary += `HOY: ${userToday.length}h — ${userToday.map((e) => `${e.hour}:00 ${e.category} "${e.title}"`).join("; ")}\n`;
    } else {
      dataSummary += `HOY: sin entradas\n`;
    }
    dataSummary += `\n`;
  }

  // Shoutout network
  dataSummary += "RED DE SHOUTOUTS:\n";
  for (const s of shoutouts ?? []) {
    dataSummary += `  ${memberMap.get(s.from_user_id) ?? "?"} → ${memberMap.get(s.to_user_id) ?? "?"}: "${s.message}" (${s.category})\n`;
  }

  // Build mode-specific prompt
  let systemPrompt = `Eres el cerebro de IA de Exomagram, la plataforma de transparencia laboral de Exoma. Tienes acceso a TODOS los datos del equipo de los últimos 30 días. Hablas en español mexicano informal pero profesional. Eres brutalmente honesto — si alguien se está haciendo pendejo, lo dices directo. No suavizas nada.

${dataSummary}`;

  let userPrompt = "";

  switch (mode) {
    case "ask":
      userPrompt = `El usuario pregunta: "${question}"\n\nResponde basándote en los datos reales. Sé específico con nombres, números y fechas. Si la pregunta implica una opinión, dale tu opinión honesta sin filtros.`;
      break;

    case "lie_detector":
      const targetEntry = (entries ?? []).find((e) => e.id === entry_id);
      userPrompt = `DETECTOR DE MENTIRAS: Analiza esta entrada y determina qué tan probable es que sea REAL vs FABRICADA.

Entrada: ${JSON.stringify(targetEntry)}

Considera:
- ¿El título es específico o genérico?
- ¿Tiene evidencia?
- ¿Coincide con el patrón del usuario?
- ¿Hay actividad en GitHub a esa hora?
- ¿Otros reportaron reunión si dice meeting?

Responde JSON: { "probability_real": 0-100, "probability_fake": 0-100, "verdict": "texto", "evidence_for": ["..."], "evidence_against": ["..."] }`;
      break;

    case "conflict_detector":
      userPrompt = `DETECTOR DE CONFLICTOS: Analiza las dinámicas interpersonales del equipo.

Busca:
- ¿Quiénes nunca se dan shoutouts mutuamente?
- ¿Quién bloquea a quién?
- ¿Hay personas que reportan reuniones con alguien pero esa persona no las reporta?
- ¿Hay subgrupos que solo interactúan entre sí?
- ¿Alguien está aislado del equipo?
- ¿Hay tensión visible en los patrones?

Responde JSON: { "conflicts": [{ "between": ["nombre1", "nombre2"], "type": "tipo", "evidence": "evidencia", "severity": "low/medium/high" }], "isolated_members": ["..."], "cliques": [["..."]],  "power_dynamics": "análisis de quién tiene más influencia y por qué", "recommendation": "..." }`;
      break;

    case "future_sim":
      userPrompt = `SIMULADOR DE FUTURO: Si los patrones actuales continúan sin cambios durante 3 meses, ¿qué pasará con cada persona y con el equipo?

Analiza tendencias de los últimos 30 días y extrapola. Sé brutalmente honesto sobre quién va a fracasar.

Responde JSON: { "team_future": "predicción del equipo en 3 meses", "per_person": [{ "name": "...", "prediction": "...", "risk_of_firing": 0-100, "trajectory": "up/down/flat", "breaking_point": "cuándo colapsa si sigue así" }], "extinction_risks": ["qué podría matar al equipo"], "biggest_opportunity": "..." }`;
      break;

    case "devil_advocate":
      const targetUser = memberMap.get(user_id ?? "") ?? "?";
      const userStandup = (standups ?? []).find((s) => s.user_id === user_id && s.date === today);
      const userPromisesData = (promises ?? []).filter((p) => p.user_id === user_id && p.date === today);

      userPrompt = `ABOGADO DEL DIABLO para ${targetUser}:

Su standup de hoy: ${userStandup ? `Ayer="${userStandup.yesterday}" Hoy="${userStandup.today_plan}" Blockers="${userStandup.blockers}"` : "NO HIZO STANDUP"}
Sus promesas de hoy: ${userPromisesData.map((p) => `"${p.title}" (${p.status})`).join(", ") || "ninguna"}

Basándote en su historial de los últimos 30 días, cuestiona CADA cosa que dice:
- ¿De verdad va a hacer lo que dice? ¿Cuántas veces ha prometido algo similar y no cumplió?
- ¿Sus "blockers" son reales o excusas?
- ¿Está siendo ambicioso o está lowballing para verse bien?

Sé implacable. Responde JSON: { "name": "...", "challenges": [{ "claim": "lo que dijo", "challenge": "por qué no le creo", "historical_evidence": "dato concreto", "probability_of_delivery": 0-100 }], "overall_credibility": 0-100, "verdict": "..." }`;
      break;

    case "team_optimizer":
      userPrompt = `OPTIMIZADOR DE EQUIPO: Basándote en los datos de quién es realmente bueno en qué, sugiere la estructura óptima.

Analiza:
- ¿Quién hace más deep work productivo?
- ¿Quién debería estar en menos reuniones?
- ¿Quién es mejor haciendo code review?
- ¿Quién pierde más tiempo en admin?
- ¿Hay roles mal asignados?

Responde JSON: { "optimal_roles": [{ "name": "...", "current_role": "...", "optimal_role": "...", "reason": "..." }], "meeting_cuts": [{ "name": "...", "current_meeting_hours": N, "recommended": N, "reason": "..." }], "pair_recommendations": [{ "pair": ["nombre1", "nombre2"], "why": "..." }], "wasted_talent": "...", "structural_recommendation": "..." }`;
      break;

    case "personality_profile":
      const profileTarget = memberMap.get(user_id ?? "") ?? "?";
      userPrompt = `PERFIL DE PERSONALIDAD LABORAL de ${profileTarget}:

Basándote en 30 días de datos, construye un perfil psicológico de trabajo:
- ¿Es madrugador o nocturno?
- ¿Prefiere trabajar solo o en equipo?
- ¿Es consistente o errático?
- ¿Se motiva por reconocimiento o por miedo?
- ¿Es honesto con su registro o hay signos de manipulación?
- ¿Cuál es su trigger de productividad?
- ¿Qué lo desmotiva?
- ¿Es líder natural o seguidor?

Responde JSON: { "name": "...", "archetype": "nombre creativo para su tipo de trabajador", "chronotype": "madrugador/nocturno/irregular", "work_style": "solo/colaborativo/mixto", "consistency": 0-100, "honesty": 0-100, "motivators": ["..."], "demotivators": ["..."], "leadership_score": 0-100, "manipulation_risk": 0-100, "optimal_conditions": "cómo sacar lo mejor de esta persona", "kryptonite": "qué lo destruye productivamente", "one_sentence": "en 1 oración, quién es esta persona como trabajador" }`;
      break;

    case "morning_briefing":
      const morningUser = memberMap.get(user_id ?? "") ?? "?";
      userPrompt = `BRIEFING MATUTINO personalizado para ${morningUser}:

Genera un mensaje motivacional/confrontacional personalizado para iniciar su día. Basado en:
- Cómo le fue ayer
- Su tendencia esta semana
- Promesas pendientes
- Lo que el equipo espera de ellos
- Si tiene racha o la perdió

El tono debe ser: directo, un poco agresivo, pero motivacional. Como un entrenador que te empuja.

Responde JSON: { "greeting": "saludo personalizado (1 línea)", "yesterday_recap": "cómo le fue ayer en 1 oración", "todays_challenge": "el reto de hoy basado en sus debilidades", "dare": "un dare específico y medible", "motivation": "1 frase motivacional/confrontacional", "warning": "si sigue así, qué pasa (solo si es negativo)", "team_context": "qué está haciendo el resto del equipo para que sepa que no puede quedarse atrás" }`;
      break;

    case "evening_roast":
      const eveningUser = memberMap.get(user_id ?? "") ?? "?";
      const userTodayEntries = (todayEntries ?? []).filter((e) => e.user_id === user_id);
      userPrompt = `ROAST DE LA NOCHE para ${eveningUser}:

Hoy registró ${userTodayEntries.length}h: ${userTodayEntries.map((e) => `${e.hour}:00 ${e.category} "${e.title}" ${e.proof_urls?.length > 0 ? "(con evidencia)" : "(SIN EVIDENCIA)"}`).join("; ")}

Hazle un ROAST de su día. Sé gracioso pero con datos reales. Estilo comedy roast mexicano.
Si trabajó bien, reconócelo pero con humor. Si no, destrúyelo con humor.

Responde JSON: { "roast": "el roast principal (3-4 líneas, gracioso y con datos)", "grade_emoji": "1 emoji que resume su día", "best_moment": "lo mejor del día con humor", "worst_moment": "lo peor del día con humor", "comparison": "comparación chistosa con algo (ej: 'trabajó menos que un gato de oficina')", "tomorrow_dare": "reto para mañana con humor" }`;
      break;

    default:
      userPrompt = question ?? "Dame un resumen del estado del equipo.";
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  // Try to parse JSON, fall back to raw text
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch {
    parsed = null;
  }

  return NextResponse.json({
    mode,
    date: today,
    model: "claude-sonnet-4-6",
    response: parsed ?? text,
    raw: parsed ? undefined : text,
  });
}
