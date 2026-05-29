import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/claude-coach?org_id=xxx&user_id=xxx
//
// AI PROACTIVE COACH: Claude analyzes your current state RIGHT NOW
// and gives you a specific, actionable coaching message.
// Called automatically every 2 hours when the app is open.
// Also used for 1:1 meeting prep.

export async function POST(request: Request) {
  const body = await request.json();
  const { org_id, user_id, type } = body;
  // type: "realtime_nudge" | "one_on_one_prep" | "end_of_day" | "weekly_summary_personal"

  if (!org_id || !user_id) return NextResponse.json({ error: "org_id and user_id required" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];
  const currentHour = new Date().getHours();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weekStart = sevenDaysAgo.toISOString().split("T")[0];

  const [
    { data: profile },
    { data: todayEntries },
    { data: weekEntries },
    { data: todayStandup },
    { data: todayPromises },
    { data: streak },
    { data: teamToday },
    { data: weeklySummaries },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user_id).single(),
    supabase.from("time_entries").select("*").eq("user_id", user_id).eq("date", today).order("hour"),
    supabase.from("time_entries").select("category, proof_urls, is_late, date, hour").eq("user_id", user_id).gte("date", weekStart),
    supabase.from("standups").select("*").eq("user_id", user_id).eq("date", today).single(),
    supabase.from("daily_promises").select("*").eq("user_id", user_id).eq("date", today),
    supabase.from("activity_streaks").select("*").eq("user_id", user_id).eq("org_id", org_id).single(),
    supabase.from("time_entries").select("user_id, hour").eq("org_id", org_id).eq("date", today),
    supabase.from("weekly_summaries").select("ai_narrative, week_start, summary").eq("user_id", user_id).eq("org_id", org_id).order("week_start", { ascending: false }).limit(4),
  ]);

  const name = (profile as { full_name: string } | null)?.full_name ?? "?";
  const hoursToday = todayEntries?.length ?? 0;
  const proofToday = todayEntries?.filter((e) => e.proof_urls?.length > 0).length ?? 0;
  const deepWorkToday = todayEntries?.filter((e) => e.category === "deep_work").length ?? 0;
  const meetingsToday = todayEntries?.filter((e) => e.category === "meeting").length ?? 0;
  const hasStandup = !!todayStandup;
  const pendingPromises = (todayPromises ?? []).filter((p) => p.status === "pending");
  const brokenPromises = (todayPromises ?? []).filter((p) => p.status === "broken");
  const currentStreak = (streak as { current_streak: number } | null)?.current_streak ?? 0;

  // Team comparison
  const teamMemberHours = new Map<string, number>();
  for (const e of teamToday ?? []) teamMemberHours.set(e.user_id, (teamMemberHours.get(e.user_id) ?? 0) + 1);
  const teamAvg = teamMemberHours.size > 0 ? Math.round(Array.from(teamMemberHours.values()).reduce((a, b) => a + b, 0) / teamMemberHours.size) : 0;
  const myRank = Array.from(teamMemberHours.values()).sort((a, b) => b - a).indexOf(hoursToday) + 1;
  const teamSize = teamMemberHours.size;

  // Historical context
  const historyContext = (weeklySummaries ?? []).map((ws) => {
    const s = ws.summary as Record<string, unknown>;
    return `Semana ${ws.week_start}: ${s.total_hours ?? 0}h, deep_work=${s.deep_work ?? 0}, proof=${s.proof_percent ?? 0}%. ${(ws.ai_narrative ?? "").slice(0, 150)}`;
  }).join("\n");

  // Week pattern
  const weekDeepWork = (weekEntries ?? []).filter((e) => e.category === "deep_work").length;
  const weekTotal = weekEntries?.length ?? 0;
  const weekProof = (weekEntries ?? []).filter((e) => e.proof_urls?.length > 0).length;

  let promptText = "";

  if (type === "realtime_nudge") {
    promptText = `Eres el coach personal de ${name} en Exoma. Son las ${currentHour}:00. Dale UN mensaje corto, directo, y accionable AHORA MISMO.

ESTADO ACTUAL DE ${name}:
- Hoy: ${hoursToday}h registradas (equipo promedio: ${teamAvg}h)
- Ranking: #${myRank} de ${teamSize}
- Deep work hoy: ${deepWorkToday}h, Reuniones: ${meetingsToday}h
- Evidencia hoy: ${proofToday}/${hoursToday}
- Standup: ${hasStandup ? "sí" : "NO"}
- Promesas pendientes: ${pendingPromises.map((p) => `"${p.title}"`).join(", ") || "ninguna"}
- Promesas rotas: ${brokenPromises.length}
- Racha: ${currentStreak} días
- Esta semana: ${weekTotal}h total, ${weekDeepWork}h deep work, ${weekProof > 0 ? Math.round(weekProof / weekTotal * 100) : 0}% proof

HISTORIAL:
${historyContext || "Sin historial previo"}

${currentHour < 10 ? "Es temprano. Enfócate en arrancar fuerte." : ""}
${currentHour >= 10 && currentHour < 13 ? "Es media mañana. Las mejores horas de deep work." : ""}
${currentHour >= 13 && currentHour < 15 ? "Post-almuerzo. Típicamente baja la energía." : ""}
${currentHour >= 15 && currentHour < 17 ? "Recta final del día. ¿Vas a cumplir?" : ""}
${currentHour >= 17 ? "El día se acaba. Hora de cerrar." : ""}

Responde JSON: { "message": "mensaje corto y directo (máx 2 oraciones)", "urgency": "low/medium/high/critical", "action": "1 acción específica que debe hacer AHORA", "motivation_type": "push/pull/shame/pride" }`;

  } else if (type === "one_on_one_prep") {
    promptText = `Genera una agenda de 1:1 para el manager de ${name}. Basado en datos reales.

DATOS:
- Esta semana: ${weekTotal}h, ${weekDeepWork}h deep work, ${weekProof > 0 ? Math.round(weekProof / weekTotal * 100) : 0}% evidencia
- Hoy: ${hoursToday}h
- Promesas rotas esta semana: ${brokenPromises.length}
- Racha: ${currentStreak} días

HISTORIAL:
${historyContext || "Sin historial previo"}

Genera una agenda ESPECÍFICA con datos. No genérica.

Responde JSON: {
  "agenda_items": [
    { "topic": "tema", "talking_points": ["punto con dato concreto"], "tone": "praise/concern/neutral", "data_backing": "dato específico" }
  ],
  "opening_question": "pregunta para abrir la conversación",
  "hard_question": "la pregunta incómoda que el manager debe hacer",
  "praise_point": "algo específico para reconocer (si hay)",
  "development_area": "área de desarrollo con evidencia",
  "action_items_suggestion": ["acciones medibles para acordar"]
}`;

  } else if (type === "end_of_day") {
    const entries_detail = (todayEntries ?? []).map((e) => `${e.hour}:00 ${e.category} "${e.title}" ${e.proof_urls?.length > 0 ? "✓" : "✗"}`).join("\n");

    promptText = `Hazle a ${name} su cierre del día. Sé honesto, directo, y da una calificación.

HOY:
${entries_detail || "CERO ENTRADAS"}
Standup: ${hasStandup ? "sí" : "no"}
Promesas cumplidas: ${(todayPromises ?? []).filter((p) => p.status === "delivered").length}
Promesas rotas: ${brokenPromises.length}

CONTEXTO SEMANAL: ${weekTotal}h esta semana, ${weekDeepWork}h deep work

Responde JSON: {
  "grade": "A/B/C/D/F",
  "one_liner": "1 oración sin filtro sobre el día",
  "what_went_well": "lo mejor del día",
  "what_sucked": "lo peor del día",
  "tomorrow_focus": "en qué enfocarse mañana",
  "score_change": "+N o -N en trust score",
  "streak_status": "la racha sigue/se rompe",
  "comparison": "cómo se compara con el equipo hoy"
}`;

  } else {
    promptText = `Responde esta pregunta sobre ${name}: ${body.question ?? "¿Cómo va esta persona?"}`;
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: promptText }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch { parsed = null; }

  return NextResponse.json({ type, user_id, response: parsed ?? text });
}
