import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { checkAIRateLimit } from "@/lib/ai-rate-limit";

// POST /api/ask-claude
// Natural language queries over the team's entire dataset.
// Authenticated via user cookies + org membership (handled by rate limiter).

export async function POST(request: Request) {
  // Rate limit (also authenticates user + resolves org)
  const rateLimitResponse = await checkAIRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key configured" }, { status: 500 });
  }

  let body: { question: string; org_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { question, org_id } = body;
  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  if (!org_id) {
    return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysStr = thirtyDaysAgo.toISOString().split("T")[0];

  // Fetch all relevant team data in parallel
  const [
    { data: members },
    { data: entries },
    { data: trustScores },
    { data: streaks },
    { data: flags },
    { data: closeouts },
    { data: standups },
    { data: promises },
  ] = await Promise.all([
    supabase
      .from("org_members")
      .select("user_id, role, joined_at, profiles(full_name, email, timezone, work_start_hour, work_end_hour)")
      .eq("org_id", org_id),
    supabase
      .from("time_entries")
      .select("user_id, date, hour, category, title, description, verification_status, proof_urls, is_late, mood, energy, project, output_type, location")
      .eq("org_id", org_id)
      .gte("date", thirtyDaysStr)
      .order("date", { ascending: false })
      .order("hour", { ascending: false })
      .limit(3000),
    supabase
      .from("trust_score_history")
      .select("user_id, date, score, hours_logged, hours_with_proof, late_entries, has_closeout")
      .eq("org_id", org_id)
      .gte("date", thirtyDaysStr)
      .order("date", { ascending: false })
      .limit(500),
    supabase
      .from("activity_streaks")
      .select("user_id, current_streak, longest_streak, last_active_date, total_days_logged")
      .eq("org_id", org_id),
    supabase
      .from("accountability_flags")
      .select("user_id, flag_type, date, details, resolved")
      .eq("org_id", org_id)
      .gte("date", thirtyDaysStr)
      .order("date", { ascending: false })
      .limit(500),
    supabase
      .from("daily_closeouts")
      .select("user_id, date, summary, hours_logged, hours_with_proof, mood")
      .eq("org_id", org_id)
      .gte("date", thirtyDaysStr)
      .order("date", { ascending: false })
      .limit(500),
    supabase
      .from("standups")
      .select("user_id, date, yesterday, today_plan, blockers, mood")
      .eq("org_id", org_id)
      .gte("date", thirtyDaysStr)
      .order("date", { ascending: false })
      .limit(500),
    supabase
      .from("daily_promises")
      .select("user_id, date, title, status")
      .eq("org_id", org_id)
      .gte("date", thirtyDaysStr)
      .order("date", { ascending: false })
      .limit(500),
  ]);

  // Build per-person summary data
  const teamData: Record<string, Record<string, unknown>> = {};

  for (const m of members ?? []) {
    const profile = m.profiles as unknown as {
      full_name: string | null;
      email: string;
      timezone: string;
      work_start_hour: number;
      work_end_hour: number;
    } | null;

    const name = profile?.full_name ?? profile?.email ?? "Desconocido";
    const userId = m.user_id;

    // Time entries stats
    const userEntries = (entries ?? []).filter((e) => e.user_id === userId);
    const totalHours = userEntries.length;
    const deepWorkHours = userEntries.filter((e) => e.category === "deep_work").length;
    const meetingHours = userEntries.filter((e) => e.category === "meeting").length;
    const withProof = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
    const lateEntries = userEntries.filter((e) => e.is_late).length;
    const uniqueDays = new Set(userEntries.map((e) => e.date)).size;
    const avgHoursPerDay = uniqueDays > 0 ? (totalHours / uniqueDays).toFixed(1) : "0";

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {};
    for (const e of userEntries) {
      categoryBreakdown[e.category] = (categoryBreakdown[e.category] ?? 0) + 1;
    }

    // Daily breakdown for the last 7 days
    const last7Days: Record<string, number> = {};
    for (const e of userEntries) {
      const d = e.date as string;
      last7Days[d] = (last7Days[d] ?? 0) + 1;
    }

    // Trust scores
    const userTrust = (trustScores ?? []).filter((t) => t.user_id === userId);
    const latestTrust = userTrust.length > 0 ? userTrust[0] : null;
    const trustTrend = userTrust.length >= 7
      ? userTrust.slice(0, 7).map((t) => ({ date: t.date, score: t.score }))
      : userTrust.map((t) => ({ date: t.date, score: t.score }));

    // Streaks
    const userStreak = (streaks ?? []).find((s) => s.user_id === userId);

    // Flags
    const userFlags = (flags ?? []).filter((f) => f.user_id === userId);
    const unresolvedFlags = userFlags.filter((f) => !f.resolved);

    // Closeouts
    const userCloseouts = (closeouts ?? []).filter((c) => c.user_id === userId);

    // Standups
    const userStandups = (standups ?? []).filter((s) => s.user_id === userId);

    // Promises
    const userPromises = (promises ?? []).filter((p) => p.user_id === userId);
    const deliveredPromises = userPromises.filter((p) => p.status === "delivered").length;
    const brokenPromises = userPromises.filter((p) => p.status === "broken").length;

    // Mood/energy averages
    const moods = userEntries.filter((e) => e.mood).map((e) => e.mood as number);
    const energies = userEntries.filter((e) => e.energy).map((e) => e.energy as number);
    const avgMood = moods.length > 0 ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : null;
    const avgEnergy = energies.length > 0 ? (energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1) : null;

    // Projects
    const projects = [...new Set(userEntries.filter((e) => e.project).map((e) => e.project))];

    teamData[name] = {
      role: m.role,
      email: profile?.email,
      timezone: profile?.timezone,
      horario: `${profile?.work_start_hour ?? 9}:00 - ${profile?.work_end_hour ?? 18}:00`,
      ultimos_30_dias: {
        total_horas: totalHours,
        dias_activos: uniqueDays,
        promedio_horas_dia: avgHoursPerDay,
        deep_work_horas: deepWorkHours,
        meeting_horas: meetingHours,
        horas_con_evidencia: withProof,
        porcentaje_evidencia: totalHours > 0 ? `${Math.round((withProof / totalHours) * 100)}%` : "0%",
        entradas_tarde: lateEntries,
        categorias: categoryBreakdown,
        proyectos: projects,
        mood_promedio: avgMood,
        energia_promedio: avgEnergy,
      },
      trust_score: {
        actual: latestTrust?.score ?? null,
        tendencia_7_dias: trustTrend,
      },
      racha: {
        actual: userStreak?.current_streak ?? 0,
        maxima: userStreak?.longest_streak ?? 0,
        ultimo_dia_activo: userStreak?.last_active_date ?? null,
        total_dias_registrados: userStreak?.total_days_logged ?? 0,
      },
      flags: {
        total_30_dias: userFlags.length,
        sin_resolver: unresolvedFlags.length,
        tipos: unresolvedFlags.map((f) => f.flag_type),
        detalle: userFlags.slice(0, 10).map((f) => ({
          tipo: f.flag_type,
          fecha: f.date,
          detalle: f.details,
          resuelto: f.resolved,
        })),
      },
      closeouts: {
        total_30_dias: userCloseouts.length,
        ultimo: userCloseouts.length > 0 ? { fecha: userCloseouts[0].date, resumen: userCloseouts[0].summary } : null,
      },
      standups: {
        total_30_dias: userStandups.length,
        ultimo: userStandups.length > 0
          ? { fecha: userStandups[0].date, plan: userStandups[0].today_plan, blockers: userStandups[0].blockers }
          : null,
      },
      promesas: {
        total: userPromises.length,
        cumplidas: deliveredPromises,
        rotas: brokenPromises,
        porcentaje_cumplimiento: userPromises.length > 0
          ? `${Math.round((deliveredPromises / userPromises.length) * 100)}%`
          : "N/A",
      },
    };
  }

  const today = new Date().toISOString().split("T")[0];

  const systemPrompt = `Eres el analista de datos de Exomagram. Tienes acceso a TODOS los datos del equipo.
Responde preguntas con datos concretos: nombres, numeros, fechas, porcentajes.
SIEMPRE menciona nombres completos. NUNCA generalices cuando puedes ser especifico.
Responde en espanol. Se directo y brutal con los datos.
Usa formato Markdown para estructurar tu respuesta: negritas, listas, tablas cuando sea apropiado.
Hoy es ${today}.

Datos del equipo (ultimos 30 dias):
${JSON.stringify(teamData, null, 2)}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: question.trim() }],
    });

    const answer = message.content[0].type === "text" ? message.content[0].text : "";

    return NextResponse.json({ success: true, answer });
  } catch (err) {
    console.error("Ask Claude error:", err);
    return NextResponse.json(
      { error: "Error al consultar Claude. Intenta de nuevo." },
      { status: 500 },
    );
  }
}
