import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// POST /api/ai/analyze-entry
// Real-time AI analysis of a single time entry immediately after submission.

export async function POST(request: NextRequest) {
  const serverClient = await createServerSupabase();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { entry_id, org_id } = body as { entry_id: string; org_id: string };

  if (!entry_id || !org_id) {
    return NextResponse.json(
      { error: "entry_id y org_id requeridos" },
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

  // ---------------------------------------------------------------------------
  // 1. Fetch the entry + profile
  // ---------------------------------------------------------------------------
  const { data: entry, error: entryError } = await supabase
    .from("time_entries")
    .select("*")
    .eq("id", entry_id)
    .eq("org_id", org_id)
    .single();

  if (entryError || !entry) {
    return NextResponse.json(
      { error: "Entrada no encontrada" },
      { status: 404 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", entry.user_id)
    .single();

  const name = profile?.full_name ?? profile?.email ?? "Desconocido";

  // ---------------------------------------------------------------------------
  // 2. Fetch all context in parallel
  // ---------------------------------------------------------------------------
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weekStart = sevenDaysAgo.toISOString().split("T")[0];

  const [
    { data: todayEntries },
    { data: crossEntries },
    { data: weekEntries },
    { data: trustHistory },
    { data: workProfile },
    { data: githubEvents },
  ] = await Promise.all([
    // All entries from same user today
    supabase
      .from("time_entries")
      .select(
        "id, hour, category, title, description, mood, energy, proof_urls, is_late, difficulty, focus_quality"
      )
      .eq("user_id", entry.user_id)
      .eq("org_id", org_id)
      .eq("date", entry.date)
      .neq("id", entry_id)
      .order("hour"),

    // Entries from OTHER users at the same hour today
    supabase
      .from("time_entries")
      .select("user_id, category, title, description")
      .eq("org_id", org_id)
      .eq("date", entry.date)
      .eq("hour", entry.hour)
      .neq("user_id", entry.user_id),

    // User's entry patterns last 7 days
    supabase
      .from("time_entries")
      .select(
        "date, hour, category, title, mood, energy, proof_urls, is_late, difficulty, focus_quality, value_rating"
      )
      .eq("user_id", entry.user_id)
      .eq("org_id", org_id)
      .gte("date", weekStart)
      .order("date", { ascending: false }),

    // User's trust score history last 7 days
    supabase
      .from("trust_score_history")
      .select("date, score, hours_logged, hours_with_proof, late_entries")
      .eq("user_id", entry.user_id)
      .eq("org_id", org_id)
      .gte("date", weekStart)
      .order("date", { ascending: false }),

    // User's ai_work_profile
    supabase
      .from("ai_work_profiles")
      .select("profile_data")
      .eq("user_id", entry.user_id)
      .eq("org_id", org_id)
      .single(),

    // GitHub events for same user/date/hour
    supabase
      .from("github_events")
      .select("event_type, repo, title, hour")
      .eq("user_id", entry.user_id)
      .eq("org_id", org_id)
      .eq("date", entry.date),
  ]);

  // ---------------------------------------------------------------------------
  // 3. Fetch names for cross-reference users
  // ---------------------------------------------------------------------------
  const crossUserIds = [
    ...new Set((crossEntries ?? []).map((e) => e.user_id)),
  ];
  const crossNames = new Map<string, string>();
  if (crossUserIds.length > 0) {
    const { data: crossProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", crossUserIds);
    for (const cp of crossProfiles ?? []) {
      crossNames.set(cp.id, cp.full_name ?? "?");
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Build context strings
  // ---------------------------------------------------------------------------

  // Today's other entries summary
  const todaySummary =
    (todayEntries ?? []).length > 0
      ? (todayEntries ?? [])
          .map(
            (e) =>
              `${e.hour}:00 [${e.category}] "${e.title}" mood=${e.mood ?? "?"} energy=${e.energy ?? "?"}`
          )
          .join("\n")
      : "Esta es su primera entrada hoy";

  // Weekly pattern
  const week = weekEntries ?? [];
  const weekCategoryCounts = new Map<string, number>();
  let weekProofCount = 0;
  let weekLateCount = 0;
  let weekMoodSum = 0;
  let weekMoodN = 0;
  for (const r of week) {
    weekCategoryCounts.set(
      r.category,
      (weekCategoryCounts.get(r.category) ?? 0) + 1
    );
    if (r.proof_urls && (r.proof_urls as string[]).length > 0) weekProofCount++;
    if (r.is_late) weekLateCount++;
    if (r.mood) {
      weekMoodSum += r.mood as number;
      weekMoodN++;
    }
  }
  const weekCategories = Array.from(weekCategoryCounts.entries())
    .map(([cat, count]) => `${cat}=${count}`)
    .join(", ");
  const weekProofRate =
    week.length > 0 ? Math.round((weekProofCount / week.length) * 100) : 0;
  const weekAvgMood =
    weekMoodN > 0 ? (weekMoodSum / weekMoodN).toFixed(1) : "N/A";

  const weeklyPattern = `${week.length} entradas en 7 dias. Categorias: ${weekCategories || "ninguna"}. Tasa evidencia: ${weekProofRate}%. Tardias: ${weekLateCount}. Animo promedio: ${weekAvgMood}`;

  // Trust scores
  const trustScores =
    (trustHistory ?? []).length > 0
      ? (trustHistory ?? [])
          .map(
            (t) =>
              `${t.date}: score=${t.score}, horas=${t.hours_logged}, con_evidencia=${t.hours_with_proof}, tardias=${t.late_entries}`
          )
          .join("\n")
      : "Sin historial de trust score";

  // GitHub events
  const githubSummary =
    (githubEvents ?? []).length > 0
      ? (githubEvents ?? [])
          .map(
            (g) =>
              `${g.hour ?? "?"}:00 ${g.event_type} en ${g.repo}: "${g.title}"`
          )
          .join("\n")
      : "Sin actividad GitHub hoy";

  // Cross-reference
  const crossRef =
    (crossEntries ?? []).length > 0
      ? (crossEntries ?? [])
          .map(
            (ce) =>
              `- ${crossNames.get(ce.user_id) ?? "?"}: [${ce.category}] "${ce.title}"${ce.description ? ` — ${ce.description}` : ""}`
          )
          .join("\n")
      : "Nadie mas registro en esta hora";

  // AI work profile
  const profileData = workProfile?.profile_data
    ? JSON.stringify(workProfile.profile_data)
    : "Sin perfil de trabajo AI";

  // Entry details
  const proofLinks = entry.proof_urls as string[] | null;
  const proofCount = proofLinks?.length ?? 0;
  const toolsUsed = (entry.tools_used as string[]) ?? [];

  // ---------------------------------------------------------------------------
  // 5. Call Claude
  // ---------------------------------------------------------------------------
  const prompt = `Eres el Motor de Analisis de Exomagram. Analizas cada entrada de trabajo en tiempo real.
Eres BRUTALMENTE honesto, basado en datos, sin diplomacia corporativa.

ENTRADA A ANALIZAR:
- Persona: ${name}
- Fecha: ${entry.date}, Hora: ${entry.hour}:00
- Categoria: ${entry.category}
- Titulo: "${entry.title}"
- Descripcion: "${entry.description ?? "SIN DESCRIPCION"}"
- Evidencia: ${proofCount > 0 ? (proofLinks ?? []).join(", ") : "NINGUNA"}
- Es tardia: ${entry.is_late ? "Si" : "No"} (${entry.minutes_late ?? 0} min tarde)
- Mood: ${entry.mood ?? "N/A"}/5, Energy: ${entry.energy ?? "N/A"}/5
- Dificultad: ${entry.difficulty ?? "N/A"}/5, Enfoque: ${entry.focus_quality ?? "N/A"}/5
- Output: ${entry.output_type ?? "N/A"}, Herramientas: ${toolsUsed.length > 0 ? toolsUsed.join(", ") : "ninguna"}
- Interrupciones: ${entry.interruptions ?? 0}, Cambios contexto: ${entry.context_switches ?? 0}

CONTEXTO DEL DIA:
- Otras entradas hoy:
${todaySummary}
- Patron de la semana: ${weeklyPattern}
- Trust Score reciente:
${trustScores}
- GitHub hoy:
${githubSummary}

COMPANEROS MISMA HORA:
${crossRef}

PERFIL AI DEL USUARIO:
${profileData}

Responde en JSON:
{
  "quality_score": 0-100,
  "title_analysis": "El titulo es descriptivo o generico?",
  "description_analysis": "La descripcion agrega valor real?",
  "proof_assessment": "La evidencia respalda las horas?",
  "cross_reference": "Coincide con lo que otros reportaron?",
  "pattern_flags": ["lista de patrones sospechosos detectados"],
  "productivity_signal": "positive | neutral | warning | red_flag",
  "insight": "1-2 oraciones de insight principal sobre esta entrada",
  "recommendation": "Accion sugerida para el manager",
  "predicted_day_score": 0-100,
  "github_match": "Las horas coinciden con la actividad de GitHub?"
}

cross_reference y recommendation pueden ser null si no aplican.
github_match puede ser null si no hay datos de GitHub.
Solo JSON valido, sin texto adicional.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    const analysis = match ? JSON.parse(match[0]) : null;

    if (!analysis) {
      return NextResponse.json(
        { error: "No se pudo parsear la respuesta de AI", raw: text },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------------------------
    // 6. Store result in ai_reviews
    // ---------------------------------------------------------------------------
    const qualityScore =
      typeof analysis.quality_score === "number" ? analysis.quality_score : 50;

    // Compute trust_impact from quality_score:
    // 80-100 = +2, 60-79 = +1, 40-59 = 0, 20-39 = -2, 0-19 = -5
    let trustImpact = 0;
    if (qualityScore >= 80) trustImpact = 2;
    else if (qualityScore >= 60) trustImpact = 1;
    else if (qualityScore >= 40) trustImpact = 0;
    else if (qualityScore >= 20) trustImpact = -2;
    else trustImpact = -5;

    await supabase.from("ai_reviews").insert({
      org_id,
      date: entry.date,
      user_id: entry.user_id,
      review_type: "entry_analysis",
      findings: analysis,
      summary: analysis.insight ?? "",
      trust_impact: trustImpact,
    });

    // V12 — Persist quality_score directly on the entry (indexed, queryable)
    await supabase
      .from("time_entries")
      .update({ quality_score: qualityScore })
      .eq("id", entry_id);

    return NextResponse.json({ success: true, analysis });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: "Error al analizar entrada", details: errorMessage },
      { status: 500 }
    );
  }
}
