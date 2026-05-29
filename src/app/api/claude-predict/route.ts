import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/claude-predict?org_id=xxx
// AI PREDICTION ENGINE: Before the day starts, Claude predicts
// who will underperform based on historical patterns.
// If you beat the prediction = bonus points. If Claude was right = shame.

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const today = new Date();
  const dayOfWeek = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][today.getDay()];

  // Get last 14 days of data per person
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const startDate = twoWeeksAgo.toISOString().split("T")[0];

  const [{ data: entries }, { data: members }, { data: closeouts }, { data: standups }] = await Promise.all([
    supabase.from("time_entries").select("user_id, date, hour, category, proof_urls, is_late").eq("org_id", orgId).gte("date", startDate).order("date"),
    supabase.from("org_members").select("user_id, profiles(full_name, role)").eq("org_id", orgId),
    supabase.from("daily_closeouts").select("user_id, date").eq("org_id", orgId).gte("date", startDate),
    supabase.from("standups").select("user_id, date").eq("org_id", orgId).gte("date", startDate),
  ]);

  // Build historical summary per person
  let historyBlock = "";

  for (const m of members ?? []) {
    const profile = m.profiles as unknown as { full_name: string; role: string } | null;
    const name = profile?.full_name ?? "?";
    const userEntries = (entries ?? []).filter((e) => e.user_id === m.user_id);

    // Group by date
    const byDate = new Map<string, typeof userEntries>();
    for (const e of userEntries) {
      const list = byDate.get(e.date) ?? [];
      list.push(e);
      byDate.set(e.date, list);
    }

    const closeoutDates = new Set((closeouts ?? []).filter((c) => c.user_id === m.user_id).map((c) => c.date));
    const standupDates = new Set((standups ?? []).filter((s) => s.user_id === m.user_id).map((s) => s.date));

    historyBlock += `\n=== ${name} (${profile?.role ?? "?"}) ===\n`;

    for (const [date, dayEntries] of Array.from(byDate.entries()).slice(-10)) {
      const dow = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][new Date(date + "T12:00:00").getDay()];
      const hours = dayEntries.length;
      const deepWork = dayEntries.filter((e) => e.category === "deep_work").length;
      const meetings = dayEntries.filter((e) => e.category === "meeting").length;
      const proof = dayEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
      const late = dayEntries.filter((e) => e.is_late).length;
      const hadStandup = standupDates.has(date) ? "sí" : "no";
      const hadCloseout = closeoutDates.has(date) ? "sí" : "no";

      historyBlock += `  ${date} (${dow}): ${hours}h, deep_work=${deepWork}, meetings=${meetings}, proof=${proof}/${hours}, late=${late}, standup=${hadStandup}, closeout=${hadCloseout}\n`;
    }
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `Eres un sistema de predicción de rendimiento laboral. Hoy es ${dayOfWeek}. Basándote en los patrones históricos de cada persona, predice cómo será su día HOY.

HISTORIAL DE LAS ÚLTIMAS 2 SEMANAS:
${historyBlock}

Para cada persona, analiza:
- ¿Cómo se comporta típicamente los ${dayOfWeek}s?
- ¿Hay tendencia a la baja o al alza en sus últimos días?
- ¿Hay patrones de "días malos" después de ciertos días?
- ¿Quién tiene racha positiva y quién negativa?

Sé BRUTALMENTE HONESTO. Si alguien tiene patrón de hacerse pendejo los ${dayOfWeek}s, dilo.

Responde SOLO JSON válido:
{
  "predictions": [
    {
      "name": "nombre",
      "predicted_performance": "excellent/good/mediocre/poor/terrible",
      "confidence": 0-100,
      "predicted_hours": número,
      "predicted_deep_work": número,
      "risk_level": "low/medium/high/critical",
      "prediction": "predicción específica para hoy en 1-2 oraciones. Sé directo.",
      "pattern_detected": "qué patrón histórico estás viendo",
      "will_do_standup": true/false,
      "will_provide_proof": true/false,
      "dare": "un reto específico para esta persona hoy. Ej: 'Apuesto que no logras 4h de deep work seguido.'"
    }
  ],
  "team_prediction": "predicción del equipo en 2 oraciones",
  "biggest_risk": "nombre de la persona con más probabilidad de underperformar y por qué",
  "dark_horse": "nombre de quien podría sorprender positivamente y por qué",
  "day_type": "qué tipo de día será para el equipo basado en patrones"
}`,
    }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch { parsed = null; }

  if (!parsed) return NextResponse.json({ error: "Parse failed", raw: text }, { status: 500 });

  // Save prediction
  await supabase.from("ai_reviews").insert({
    org_id: orgId,
    date: today.toISOString().split("T")[0],
    review_type: "daily_team",
    findings: { type: "prediction", ...parsed },
    summary: parsed.team_prediction,
  });

  return NextResponse.json({ date: today.toISOString().split("T")[0], model: "claude-sonnet-4-6", ...parsed });
}
