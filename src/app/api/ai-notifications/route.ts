import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });
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
    supabase.from("ai_work_profiles").select("user_id, profile_data").eq("org_id", orgId),
    supabase.from("public_feed").select("id").eq("org_id", orgId).eq("created_at", `gte.${today}T00:00:00`).limit(1),
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
      content: `Eres el AI Manager de Exoma. Son las ${currentHour}:00. Genera notificaciones que INCITEN ACCIÓN usando psicología conductual.

ESTADO DEL EQUIPO:
${state}

Genera DOS tipos de notificaciones:

PRIVADAS (solo la persona las ve):
- Usa loss aversion: "Tu score bajará X si no..."
- Usa social comparison: "El equipo promedio lleva Xh, tú llevas Y"
- Usa specific deadlines: "Quedan Xh para..."
- Usa su perfil de personalidad para saber qué motiva a cada quien
- Si van BIEN, dale un push positivo pero con reto: "Excelente 5h, ¿puedes llegar a 7?"
- Si van MAL, sé directo pero constructivo: "0 horas a las 2pm. Esto va a tu expediente."

PÚBLICAS (todo el equipo las ve en un feed):
- Praise público: "Erik lleva 4h de deep work consecutivo" (social proof positivo)
- Milestones: "Andres cumplió todas sus promesas hoy" (incentiva a los demás)
- Retos al equipo: "Solo 2 de 5 han hecho standup. ¿Quién falta?"
- NO hagas shame público de individuos. La crítica es privada, el elogio público.
- Announcements: "Hora de deep work. Bloqueen distracciones."

REGLAS PSICOLÓGICAS:
- Praise in public, criticize in private
- Usa números concretos, no generalidades
- Cada notificación debe tener UN call-to-action claro
- Adapta el tono al perfil de personalidad de cada persona
- No mandes notificaciones a quien va bien y no necesita intervención

JSON:
{
  "private_notifications": [
    {
      "target_name": "nombre",
      "message": "texto directo con datos",
      "psychology": "qué principio psicológico usaste",
      "call_to_action": "acción específica",
      "urgency": "low/normal/high/critical"
    }
  ],
  "public_feed": [
    {
      "type": "praise/milestone/challenge/team_update/ai_announcement",
      "title": "título corto",
      "body": "texto del feed",
      "target_name": "nombre o null para team-wide",
      "emoji": "1 emoji relevante",
      "urgency": "low/normal/high"
    }
  ],
  "skipped": ["nombres de personas que no necesitan notificación ahora y por qué"]
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
