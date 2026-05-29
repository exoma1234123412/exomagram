import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { checkAIOrgRateLimit } from "@/lib/ai-rate-limit";

// POST /api/ai-notifications?org_id=xxx
//
// AI NOTIFICATION ENGINE — Claude generates two types of notifications:
//
// 1. PRIVATE (solo tú lo ves) — mensajes personales que incitan acción
//    Psicología: loss aversion, personal accountability, coaching directo
//    Ejemplo: "Llevas 3h sin registrar. Tu score bajará 5 puntos si no actúas."
//
// 2. PUBLIC (todo el equipo lo ve) — feed público que crea presión social
//    Psicología: social proof, peer comparison, public commitment
//    Ejemplo: "Erik acaba de completar su 5ta hora de deep work consecutivo."
//
// Claude decides WHAT to post and WHERE based on current team state.
// The key insight: public praise + private criticism is the most effective combo.

export async function POST(request: Request) {
  // Verify cron secret — this route is called by a scheduler, not end users
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  // AI rate limiting (org-level only for cron routes)
  const rateLimitResponse = checkAIOrgRateLimit(orgId);
  if (rateLimitResponse) return rateLimitResponse;

  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const today = new Date().toISOString().split("T")[0];
  const currentHour = new Date().getHours();

  const [
    { data: members },
    { data: entries },
    { data: standups },
    { data: promises },
    { data: streaks },
    { data: liveStatus },
    { data: profiles },
    { data: recentFeed },
  ] = await Promise.all([
    supabase.from("org_members").select("user_id, role, profiles(full_name, email)").eq("org_id", orgId),
    supabase.from("time_entries").select("user_id, hour, category, proof_urls").eq("org_id", orgId).eq("date", today),
    supabase.from("standups").select("user_id").eq("org_id", orgId).eq("date", today),
    supabase.from("daily_promises").select("user_id, title, status").eq("org_id", orgId).eq("date", today),
    supabase.from("activity_streaks").select("user_id, current_streak").eq("org_id", orgId),
    supabase.from("live_status").select("user_id, status").eq("org_id", orgId),
    supabase.from("ai_work_profiles").select("user_id, profile_data").eq("org_id", orgId).limit(50),
    supabase.from("public_feed").select("id").eq("org_id", orgId).gte("created_at", `${today}T00:00:00`).limit(1),
  ]);

  // Build state
  const standupSet = new Set(standups?.map((s) => s.user_id) ?? []);
  const streakMap = new Map<string, number>((streaks ?? []).map((s) => [s.user_id, s.current_streak]));
  const profileDataMap = new Map<string, Record<string, unknown>>((profiles ?? []).map((p) => [p.user_id, p.profile_data as Record<string, unknown>]));

  let state = `HORA: ${currentHour}:00 Monterrey\nFECHA: ${today}\n\n`;

  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string } | null;
    const name = p?.full_name ?? "?";
    const userEntries = (entries ?? []).filter((e) => e.user_id === m.user_id);
    const hours = userEntries.length;
    const deepWork = userEntries.filter((e) => e.category === "deep_work").length;
    const proof = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
    const hasStandup = standupSet.has(m.user_id);
    const streak = streakMap.get(m.user_id) ?? 0;
    const live = (liveStatus ?? []).find((l) => l.user_id === m.user_id);
    const userPromises = (promises ?? []).filter((pr) => pr.user_id === m.user_id);
    const pd = profileDataMap.get(m.user_id);

    state += `${name}: ${hours}h (deep=${deepWork}, proof=${proof}/${hours}), standup=${hasStandup ? "sí" : "no"}, streak=${streak}d, status=${live?.status ?? "offline"}`;
    state += `, promesas=${userPromises.map((pr) => `${pr.title}→${pr.status}`).join(";") || "ninguna"}`;
    if (pd) state += `, personalidad="${pd.work_personality ?? ""}", motivadores=${(pd.motivators as string[] ?? []).join(",")}`;
    state += "\n";
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `Eres el AI Manager de Exomagram. Son las ${currentHour}:00. Genera notificaciones que CAMBIEN COMPORTAMIENTO usando psicología conductual avanzada.

ESTADO DEL EQUIPO:
${state}

═══ 30 TÉCNICAS PSICOLÓGICAS — USA MÍNIMO 1 POR MENSAJE ═══

--- AVERSIÓN ---
1.LOSS_FRAMING: "PIERDES 5 pts" no "ganas 5" | 2.SUNK_COST: "12 días invertidos. ¿Los tiras?" | 3.ENDOWMENT: "Tu Trust 87 es TUYO" | 4.PAIN_OF_PAYING: "Cada hora vacía = -3 pts"
--- PRESIÓN SOCIAL ---
5.SOCIAL_PROOF: "4/5 ya hicieron. Solo tú faltas" | 6.CONTRAST: "[Top] 6h 100% vs [Tú] 1h 0%" | 7.SPOTLIGHT: "El equipo VE tu 0h" | 8.RECIPROCITY: "Verificó 3 tuyas. Tú: 0 suyas" | 9.COMPETITIVE_AROUSAL: "EXOMAP 5h vs Erik 3h" | 10.SOCIAL_FACILITATION: "Claude monitorea en vivo"
--- IDENTIDAD ---
11.IDENTITY: "Profesionales no dejan 4h sin explicar" | 12.COMMITMENT: "Dijiste: '[promesa]'. ¿Dónde?" | 13.COGNITIVE_DISSONANCE: "Dices que importa. 3h sin evidencia dice lo contrario" | 14.STATUS_QUO_BIAS: "Standup antes de 9 es lo normal aquí"
--- PROGRESO ---
15.GOAL_GRADIENT: "Faltan 2h. Al 75%" | 16.PROGRESS_PRINCIPLE: "Primera hora. Momentum" | 17.FOOT_IN_THE_DOOR: "Solo 1h con evidencia. ¿Puedes?" | 18.DOOR_IN_THE_FACE: "6h deep work... ok, ¿3?"
--- TIEMPO ---
19.SCARCITY: "Racha EXPIRA en 3h" | 20.TEMPORAL_LANDMARKS: "Lunes = reset" | 21.PEAK_END_RULE: último msg = pico+estado | 22.PLANNING_FALLACY: "Dices 4h más. Historial: 1.2h" | 23.HOT_COLD_GAP: "9am: planifica AHORA. 5pm no querrás"
--- NARRATIVA ---
24.NARRATIVE: "Hace 3 sem peor racha. Hoy 12 días. TU historia" | 25.VARIABLE_REINFORCEMENT: praise impredecible=adicción | 26.ANCHORING: "Tu pico: 42h. Esta semana: 18h" | 27.MORAL_LICENSING: "Ayer A+. 60% → C al siguiente"
--- AVANZADAS ---
28.REACTANCE: reverse psych "No creo que puedas 3h deep work" | 29.LEARNED_HELPLESSNESS_PREVENTION: 3+ días malos → no piles on, cambia a competencia | 30.IMPLEMENTATION_INTENTION: "Si no antes de 3pm → B a C"

CUÁNDO:
BIEN→27+25 | MAL→13+1+7 | MAÑANA→23+20+30 | TARDE→21+19+22
SLUMP→29+17+16 | COMPETITIVO→9+6 | FLOJO→28+18+4 | EQUIPO→10+14+5

═══ PUBLIC SHAME — NOMBRES COMPLETOS ═══
Shame OBLIGATORIO si aplica (elige técnica según contexto arriba):
- 0h al mediodía → CONTRAST+SOCIAL_PROOF | Rechazada → SPOTLIGHT+COGNITIVE_DISSONANCE
- Promesa rota → COMMITMENT (cita sus palabras) | Sin standup → SOCIAL_PROOF+STATUS_QUO
- Trust<50 → ENDOWMENT+SUNK_COST | Racha rota → SUNK_COST+NARRATIVE
- 0 evidencia → SOCIAL_PROOF ("único sin") | Ghost → SPOTLIGHT+SOCIAL_FACILITATION
- Meeting>50% → ANCHORING | Git vs horas → CONTRAST+COGNITIVE_DISSONANCE
Positivo → VARIABLE_REINFORCEMENT (no siempre, sorprende)

═══ PRIVADO — SOLO SALUD/BIENESTAR + COACHING ═══
Sueño/estrés/mood: coaching empático. Retos: GOAL_GRADIENT+SCARCITY. Tips: perfil AI.

REGLAS:
- NOMBRES COMPLETOS en público siempre
- En "psychology" indica la técnica usada
- Salud NUNCA público
- Números concretos siempre
- 1 call-to-action por mensaje
- Español mexicano informal, brutal

JSON:
{
  "private_notifications": [
    {
      "target_name": "nombre",
      "message": "texto aplicando técnica",
      "psychology": "loss_framing|sunk_cost|endowment|pain_of_paying|social_proof|contrast|spotlight|reciprocity|competitive_arousal|social_facilitation|identity|commitment|cognitive_dissonance|status_quo_bias|goal_gradient|progress_principle|foot_in_the_door|door_in_the_face|scarcity|temporal_landmarks|peak_end_rule|planning_fallacy|hot_cold_gap|narrative|variable_reinforcement|anchoring|moral_licensing|reactance|learned_helplessness_prevention|implementation_intention",
      "call_to_action": "acción específica",
      "urgency": "low/normal/high/critical"
    }
  ],
  "public_feed": [
    {
      "type": "shame/praise/milestone/challenge/team_update/ai_announcement/warning",
      "title": "título corto",
      "body": "texto con nombre completo",
      "target_name": "nombre o null",
      "psychology": "técnica usada",
      "emoji": "1 emoji",
      "urgency": "low/normal/high/critical"
    }
  ],
  "skipped": ["nombres y razón por la que no necesitan mensaje"]
}

Solo JSON válido.`,
    }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch { parsed = null; }

  if (!parsed) return NextResponse.json({ error: "Parse failed", raw: text }, { status: 500 });

  const executed = { private: 0, public: 0 };

  // Execute PRIVATE notifications
  for (const notif of parsed.private_notifications ?? []) {
    const targetMember = (members ?? []).find((m) => {
      const p = m.profiles as unknown as { full_name: string } | null;
      return p?.full_name?.toLowerCase().includes(notif.target_name?.toLowerCase() ?? "");
    });
    if (targetMember) {
      await supabase.from("notifications").insert({
        user_id: targetMember.user_id,
        org_id: orgId,
        type: notif.urgency === "critical" ? "flag_raised" : "entry_logged",
        title: notif.call_to_action,
        body: notif.message,
      });
      executed.private++;
    }
  }

  // Execute PUBLIC feed
  for (const item of parsed.public_feed ?? []) {
    const targetMember = item.target_name ? (members ?? []).find((m) => {
      const p = m.profiles as unknown as { full_name: string } | null;
      return p?.full_name?.toLowerCase().includes(item.target_name?.toLowerCase() ?? "");
    }) : null;

    await supabase.from("public_feed").insert({
      org_id: orgId,
      type: item.type ?? "ai_announcement",
      title: item.title,
      body: item.body,
      target_user_id: targetMember?.user_id ?? null,
      urgency: item.urgency ?? "normal",
      emoji: item.emoji ?? null,
      is_ai_generated: true,
    });
    executed.public++;
  }

  return NextResponse.json({
    hour: currentHour,
    private_sent: executed.private,
    public_posted: executed.public,
    skipped: parsed.skipped,
  });
}
