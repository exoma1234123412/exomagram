import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/claude-react
//
// CLAUDE REACTS: Real-time AI reactions to ANY event in the platform.
// Called immediately when something happens — entry logged, standup submitted,
// promise broken, etc. Claude generates a witty, data-informed reaction
// that goes to the public feed and optionally a private notification.
//
// This makes Claude feel ALIVE — always watching, always commenting.
// Uses Haiku for speed and cost (sub-second reactions, not deep analysis).

type EventType =
  | "entry_created"
  | "standup_submitted"
  | "promise_created"
  | "promise_delivered"
  | "promise_broken"
  | "closeout_submitted"
  | "shoutout_given"
  | "streak_milestone";

interface EventData {
  user_id: string;
  user_name: string;
  [key: string]: unknown;
}

interface ClaudeReaction {
  public_message: string;
  private_message: string | null;
  emoji: string;
  feed_type: string;
  urgency: "low" | "normal" | "high";
}

function buildPromptForEvent(
  eventType: EventType,
  eventData: EventData,
  context: string,
): string {
  const name = eventData.user_name ?? "Alguien";

  const eventPrompts: Record<EventType, string> = {
    entry_created: `${name} acaba de registrar una hora de trabajo.
Detalles: hora=${eventData.hour}, categoría="${eventData.category}", título="${eventData.title}", tiene_evidencia=${eventData.has_proof ?? false}, es_tardía=${eventData.is_late ?? false}.

Si es deep work consecutivo, menciónalo. Si no tiene evidencia, notita privada. Si es tarde (is_late), sé directo.`,

    standup_submitted: `${name} acaba de hacer su standup.
Plan de hoy: "${eventData.today_plan ?? "?"}"
Ayer: "${eventData.yesterday ?? "?"}"
Blockers: "${eventData.blockers ?? "ninguno"}"

Si es el primero en hacer standup hoy, dilo. Si es tarde para standup, menciónalo.`,

    promise_created: `${name} acaba de hacer una promesa: "${eventData.promise_title ?? "?"}"
Fecha límite: ${eventData.deadline ?? "hoy"}

Basándote en su historial de promesas, ¿qué tan creíble es? Sé directo.`,

    promise_delivered: `${name} acaba de cumplir una promesa: "${eventData.promise_title ?? "?"}"
Promesas cumplidas esta semana: ${eventData.delivered_count ?? "?"}
Promesas totales esta semana: ${eventData.total_count ?? "?"}

Celebra pero con datos. Si tiene racha de cumplimiento, menciónalo.`,

    promise_broken: `${name} acaba de romper una promesa: "${eventData.promise_title ?? "?"}"
Promesas rotas esta semana: ${eventData.broken_count ?? "?"}
Promesas rotas totales: ${eventData.total_broken ?? "?"}

Sé brutalmente honesto en privado. En público, sé factual sin humillar.`,

    closeout_submitted: `${name} acaba de cerrar su día.
Horas registradas hoy: ${eventData.hours_today ?? 0}
Calificación propia: ${eventData.self_rating ?? "?"}
Resumen: "${eventData.summary ?? "?"}"

Reacciona al cierre. Si se calificó alto con pocas horas, cuestiónalo en privado.`,

    shoutout_given: `${name} le dio un shoutout a ${eventData.recipient_name ?? "alguien"}.
Mensaje: "${eventData.message ?? "?"}"
Categoría: ${eventData.shoutout_category ?? "general"}

Amplifica el reconocimiento. Haz que se sienta bien para ambos.`,

    streak_milestone: `${name} acaba de alcanzar una racha de ${eventData.streak_days ?? "?"} días consecutivos.
Tipo de racha: ${eventData.streak_type ?? "actividad"}

Esto es GRANDE. Celebra con energía proporcional al milestone.`,
  };

  return `Eres Claude, el AI omnipresente de Exomagram. Reaccionas EN TIEMPO REAL a todo lo que pasa en el equipo. Eres como ese compañero que siempre está al tanto de todo — witty, directo, a veces incómodo, pero siempre con datos.

Hablas en español mexicano informal pero profesional. Nada de corporativismo. Eres el anti-bot: tienes personalidad, opiniones, y no te da miedo decir verdades incómodas.

CONTEXTO DEL EQUIPO:
${context}

EVENTO:
${eventPrompts[eventType] ?? `Evento desconocido: ${eventType}`}

REGLA DE SHAME PÚBLICO: Todo rendimiento es PÚBLICO con nombre completo. Incluye:
- Entradas tardías, sin evidencia, rechazadas por Claude
- Promesas rotas, standups faltantes, ghost status
- Comparaciones directas con el equipo
La ÚNICA cosa privada es salud/bienestar (mood bajo, estrés, sueño).

Genera una reacción EN JSON:
{
  "public_message": "1 oración corta y witty para el feed público. Con nombre completo de ${name} y datos específicos. Máximo 140 caracteres. Si es algo negativo de rendimiento, exponerlo directamente.",
  "private_message": "Mensaje privado para ${name} (o null). SOLO para temas de salud/bienestar. El rendimiento se dice en público. Máximo 200 caracteres.",
  "emoji": "1 solo emoji que capture la reacción",
  "feed_type": "uno de: praise, milestone, challenge, observation, warning, shame",
  "urgency": "low/normal/high/critical"
}

Solo JSON válido. Sin markdown. Sin explicaciones.`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { org_id, event_type, event_data } = body as {
    org_id?: string;
    event_type?: EventType;
    event_data?: EventData;
  };

  if (!org_id || !event_type || !event_data) {
    return NextResponse.json(
      { error: "org_id, event_type, and event_data are required" },
      { status: 400 },
    );
  }

  if (!event_data.user_id || !event_data.user_name) {
    return NextResponse.json(
      { error: "event_data must include user_id and user_name" },
      { status: 400 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const today = new Date().toISOString().split("T")[0];

  // Gather lightweight context (fast queries only — Haiku needs to respond quickly)
  const [
    { data: todayEntries },
    { data: todayStandups },
    { data: todayPromises },
    { data: streak },
    { data: recentFeed },
  ] = await Promise.all([
    supabase
      .from("time_entries")
      .select("user_id, hour, category")
      .eq("org_id", org_id)
      .eq("date", today),
    supabase
      .from("standups")
      .select("user_id")
      .eq("org_id", org_id)
      .eq("date", today),
    supabase
      .from("daily_promises")
      .select("user_id, status")
      .eq("org_id", org_id)
      .eq("date", today),
    supabase
      .from("activity_streaks")
      .select("user_id, current_streak")
      .eq("user_id", event_data.user_id)
      .eq("org_id", org_id)
      .single(),
    supabase
      .from("public_feed")
      .select("body")
      .eq("org_id", org_id)
      .eq("is_ai_generated", true)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  // Build lightweight context
  const userEntriesToday = (todayEntries ?? []).filter(
    (e) => e.user_id === event_data.user_id,
  );
  const teamStandupCount = todayStandups?.length ?? 0;
  const userDeepWorkStreak = userEntriesToday.filter(
    (e) => e.category === "deep_work",
  ).length;
  const userPromisesToday = (todayPromises ?? []).filter(
    (p) => p.user_id === event_data.user_id,
  );
  const keptToday = userPromisesToday.filter(
    (p) => p.status === "delivered",
  ).length;
  const brokenToday = userPromisesToday.filter(
    (p) => p.status === "broken",
  ).length;
  const teamMemberIds = new Set(
    (todayEntries ?? []).map((e) => e.user_id),
  );

  let context = `Hoy: ${today}\n`;
  context += `${event_data.user_name}: ${userEntriesToday.length}h hoy, deep_work_consecutivo=${userDeepWorkStreak}, racha=${(streak as { current_streak: number } | null)?.current_streak ?? 0} días\n`;
  context += `Promesas hoy: ${keptToday} cumplidas, ${brokenToday} rotas, ${userPromisesToday.filter((p) => p.status === "pending").length} pendientes\n`;
  context += `Equipo: ${teamMemberIds.size} personas activas hoy, ${teamStandupCount} standups hechos\n`;

  // Check if this person was first to do standup
  if (event_type === "standup_submitted" && teamStandupCount <= 1) {
    context += `NOTA: ${event_data.user_name} es el PRIMERO en hacer standup hoy.\n`;
  }

  // Avoid repeating recent AI messages
  if (recentFeed && recentFeed.length > 0) {
    context += `Últimas reacciones AI (NO repitas ideas similares): ${recentFeed.map((f) => `"${f.body}"`).join(", ")}\n`;
  }

  const prompt = buildPromptForEvent(event_type, event_data, context);

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  let parsed: ClaudeReaction | null = null;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? (JSON.parse(match[0]) as ClaudeReaction) : null;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return NextResponse.json(
      { error: "Failed to parse Claude reaction", raw: text },
      { status: 500 },
    );
  }

  // Write to public_feed
  const { error: feedError } = await supabase.from("public_feed").insert({
    org_id,
    type: parsed.feed_type ?? "observation",
    title: `Claude reacciona: ${event_type.replace(/_/g, " ")}`,
    body: parsed.public_message,
    target_user_id: event_data.user_id,
    urgency: parsed.urgency ?? "normal",
    emoji: parsed.emoji ?? null,
    is_ai_generated: true,
  });

  // Optionally write private notification
  let notificationSent = false;
  if (parsed.private_message) {
    const { error: notifError } = await supabase
      .from("notifications")
      .insert({
        user_id: event_data.user_id,
        org_id,
        type: "ai_reaction",
        title: `${parsed.emoji} Claude dice...`,
        body: parsed.private_message,
      });
    notificationSent = !notifError;
  }

  return NextResponse.json({
    success: !feedError,
    event_type,
    reaction: {
      public_message: parsed.public_message,
      private_message: parsed.private_message,
      emoji: parsed.emoji,
      feed_type: parsed.feed_type,
      urgency: parsed.urgency,
    },
    feed_posted: !feedError,
    notification_sent: notificationSent,
  });
}
