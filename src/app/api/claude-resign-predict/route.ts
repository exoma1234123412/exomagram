import Anthropic from "@anthropic-ai/sdk";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/claude-resign-predict
// RESIGNATION PREDICTOR: Analyzes 30 days of data per person and predicts
// who is likely to resign based on behavioral signals.
// ADMIN ONLY in concept — no role preconceptions, everyone judged equally.

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const orgId = body.org_id;

  if (!orgId) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "No service role key" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];

  // Get all org members
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, profiles(full_name)")
    .eq("org_id", orgId);

  if (!members || members.length === 0) {
    return NextResponse.json({ error: "No members found" }, { status: 404 });
  }

  const userIds = members.map((m) => m.user_id);

  // Query all 30-day data in parallel
  const [
    { data: timeEntries },
    { data: standups },
    { data: closeouts },
    { data: promises },
    { data: shoutoutsGiven },
    { data: trustScores },
    { data: insights },
  ] = await Promise.all([
    supabase
      .from("time_entries")
      .select("user_id, date, hour, category, mood, energy")
      .eq("org_id", orgId)
      .gte("date", startDate)
      .lte("date", todayStr)
      .in("user_id", userIds)
      .order("date"),
    supabase
      .from("standups")
      .select("user_id, date, mood")
      .eq("org_id", orgId)
      .gte("date", startDate)
      .lte("date", todayStr)
      .in("user_id", userIds),
    supabase
      .from("daily_closeouts")
      .select("user_id, date, mood")
      .eq("org_id", orgId)
      .gte("date", startDate)
      .lte("date", todayStr)
      .in("user_id", userIds),
    supabase
      .from("daily_promises")
      .select("user_id, date, status")
      .eq("org_id", orgId)
      .gte("date", startDate)
      .lte("date", todayStr)
      .in("user_id", userIds),
    // Shoutouts GIVEN by each person (engagement signal)
    supabase
      .from("shoutouts")
      .select("from_user_id, date")
      .eq("org_id", orgId)
      .gte("date", startDate)
      .lte("date", todayStr)
      .in("from_user_id", userIds),
    supabase
      .from("trust_score_history")
      .select("user_id, date, score")
      .eq("org_id", orgId)
      .gte("date", startDate)
      .lte("date", todayStr)
      .in("user_id", userIds)
      .order("date"),
    supabase
      .from("ai_daily_insights")
      .select("user_id, date, insight")
      .eq("org_id", orgId)
      .gte("date", startDate)
      .lte("date", todayStr)
      .in("user_id", userIds),
  ]);

  // Build behavioral profile per person
  let dataBlock = "";

  for (const m of members) {
    const profile = m.profiles as unknown as { full_name: string } | null;
    const name = profile?.full_name ?? "Desconocido";
    const uid = m.user_id;

    // Time entries analysis
    const userEntries = (timeEntries ?? []).filter((e) => e.user_id === uid);
    const totalHours = userEntries.length;

    // Split into weeks for trend analysis
    const weeklyHours: number[] = [0, 0, 0, 0]; // 4 weeks
    const weeklyMood: number[][] = [[], [], [], []];
    const weeklyEnergy: number[][] = [[], [], [], []];
    const weeklyBlocked: number[] = [0, 0, 0, 0];

    for (const e of userEntries) {
      const entryDate = new Date(e.date + "T12:00:00");
      const daysFromStart = Math.floor(
        (entryDate.getTime() - thirtyDaysAgo.getTime()) / (1000 * 60 * 60 * 24)
      );
      const weekIdx = Math.min(3, Math.floor(daysFromStart / 7));
      weeklyHours[weekIdx]++;
      if (e.mood) weeklyMood[weekIdx].push(e.mood);
      if (e.energy) weeklyEnergy[weekIdx].push(e.energy);
      if (e.category === "blocked" || e.category === "admin_overhead") {
        weeklyBlocked[weekIdx]++;
      }
    }

    const avgWeeklyMood = weeklyMood.map(
      (w) => w.length > 0 ? (w.reduce((a, b) => a + b, 0) / w.length).toFixed(1) : "?"
    );
    const avgWeeklyEnergy = weeklyEnergy.map(
      (w) => w.length > 0 ? (w.reduce((a, b) => a + b, 0) / w.length).toFixed(1) : "?"
    );

    // Standups & closeouts per week
    const userStandups = (standups ?? []).filter((s) => s.user_id === uid);
    const userCloseouts = (closeouts ?? []).filter((c) => c.user_id === uid);
    const weeklyStandups = [0, 0, 0, 0];
    const weeklyCloseouts = [0, 0, 0, 0];

    for (const s of userStandups) {
      const d = new Date(s.date + "T12:00:00");
      const daysFromStart = Math.floor(
        (d.getTime() - thirtyDaysAgo.getTime()) / (1000 * 60 * 60 * 24)
      );
      const weekIdx = Math.min(3, Math.floor(daysFromStart / 7));
      weeklyStandups[weekIdx]++;
    }
    for (const c of userCloseouts) {
      const d = new Date(c.date + "T12:00:00");
      const daysFromStart = Math.floor(
        (d.getTime() - thirtyDaysAgo.getTime()) / (1000 * 60 * 60 * 24)
      );
      const weekIdx = Math.min(3, Math.floor(daysFromStart / 7));
      weeklyCloseouts[weekIdx]++;
    }

    // Promises
    const userPromises = (promises ?? []).filter((p) => p.user_id === uid);
    const totalPromises = userPromises.length;
    const brokenPromises = userPromises.filter((p) => p.status === "broken").length;
    const deliveredPromises = userPromises.filter((p) => p.status === "delivered").length;

    // Shoutouts given (team engagement)
    const userShoutouts = (shoutoutsGiven ?? []).filter(
      (s) => s.from_user_id === uid
    );
    const weeklyShoutouts = [0, 0, 0, 0];
    for (const s of userShoutouts) {
      const d = new Date(s.date + "T12:00:00");
      const daysFromStart = Math.floor(
        (d.getTime() - thirtyDaysAgo.getTime()) / (1000 * 60 * 60 * 24)
      );
      const weekIdx = Math.min(3, Math.floor(daysFromStart / 7));
      weeklyShoutouts[weekIdx]++;
    }

    // Trust scores
    const userTrust = (trustScores ?? []).filter((t) => t.user_id === uid);
    const trustByWeek = [0, 0, 0, 0];
    const trustCountByWeek = [0, 0, 0, 0];
    for (const t of userTrust) {
      const d = new Date(t.date + "T12:00:00");
      const daysFromStart = Math.floor(
        (d.getTime() - thirtyDaysAgo.getTime()) / (1000 * 60 * 60 * 24)
      );
      const weekIdx = Math.min(3, Math.floor(daysFromStart / 7));
      trustByWeek[weekIdx] += t.score;
      trustCountByWeek[weekIdx]++;
    }
    const avgTrustByWeek = trustByWeek.map((sum, i) =>
      trustCountByWeek[i] > 0 ? Math.round(sum / trustCountByWeek[i]) : "?"
    );

    // AI insights grades
    const userInsights = (insights ?? []).filter((i) => i.user_id === uid);
    const grades = userInsights
      .map((i) => (i.insight as Record<string, unknown>)?.grade)
      .filter(Boolean);

    dataBlock += `
=== ${name} ===
HORAS POR SEMANA (sem1 -> sem4, más reciente = sem4):
  Horas: ${weeklyHours.join(" -> ")}
  Mood promedio: ${avgWeeklyMood.join(" -> ")}
  Energía promedio: ${avgWeeklyEnergy.join(" -> ")}
  Horas bloqueado/admin: ${weeklyBlocked.join(" -> ")}

PARTICIPACIÓN POR SEMANA:
  Standups: ${weeklyStandups.join(" -> ")}
  Closeouts: ${weeklyCloseouts.join(" -> ")}
  Shoutouts dados: ${weeklyShoutouts.join(" -> ")}

PROMESAS (30 días): ${totalPromises} total, ${deliveredPromises} cumplidas, ${brokenPromises} rotas

TRUST SCORE PROMEDIO POR SEMANA: ${avgTrustByWeek.join(" -> ")}

GRADES AI: ${grades.length > 0 ? grades.join(", ") : "sin datos"}

TOTAL: ${totalHours}h en 30 días, ${userStandups.length} standups, ${userCloseouts.length} closeouts
`;
  }

  // Call Claude Sonnet for deep analysis
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Eres un sistema de predicción de riesgo de renuncia para una empresa. Analizas datos objetivos de los últimos 30 días de cada persona y predices quién tiene probabilidad de renunciar.

IMPORTANTE: No tienes NINGUNA preconcepción sobre el rol, importancia o posición de nadie. Todos son evaluados exactamente igual basándote solo en los datos. El CEO se evalúa igual que un junior.

SEÑALES DE RIESGO:
1. Tendencia decreciente de horas registradas
2. Mood/energía en declive
3. Menos standups/closeouts con el tiempo (desconexión)
4. Menos shoutouts dados (desconexión del equipo)
5. Más horas "bloqueado" o en admin
6. Promesas rotas aumentando
7. Trust Score en declive

DATOS DE LOS ÚLTIMOS 30 DÍAS (${startDate} a ${todayStr}):
${dataBlock}

Para CADA persona, analiza las tendencias semana a semana y genera:

Responde SOLO JSON válido:
{
  "analysis_date": "${todayStr}",
  "predictions": [
    {
      "name": "nombre completo",
      "resignation_risk": 0-100,
      "risk_level": "low/medium/high/critical",
      "signals": ["señal 1", "señal 2"],
      "prediction": "texto predictivo en 2-3 oraciones. Qué ves en los datos.",
      "recommended_action": "qué debería hacer management. Acción concreta."
    }
  ],
  "team_summary": "resumen general del equipo en 2 oraciones",
  "highest_risk": "nombre de la persona con mayor riesgo y por qué en 1 oración",
  "immediate_actions": ["acción 1 urgente", "acción 2 urgente"]
}`,
      },
    ],
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
      { error: "Parse failed", raw: text },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    model: "claude-sonnet-4-20250514",
    ...parsed,
  });
}
