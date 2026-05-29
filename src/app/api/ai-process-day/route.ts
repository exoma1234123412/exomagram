import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/ai-process-day?org_id=xxx&date=yyyy-mm-dd
//
// THE NIGHTLY AI PROCESSOR
// Runs every night. Claude processes the ENTIRE day and produces:
// 1. Structured insights per person (stored, queryable, feeds future Claude calls)
// 2. Updated work profiles per person (personality, patterns, strengths, risks)
// 3. Team dynamics snapshot (relationships, tensions, collaboration quality)
// 4. Predictive signals (burnout risk, disengagement, trajectory)
//
// This is the LEARNING layer — Claude gets smarter about each person over time.

export async function POST(request: Request) {
  // Verify cron secret — this route is a nightly processor called by a scheduler
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Get last 7 days of raw data + all historical profiles
  const sevenDaysAgo = new Date(date + "T12:00:00");
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weekStart = sevenDaysAgo.toISOString().split("T")[0];

  const [
    { data: members },
    { data: entries },
    { data: standups },
    { data: closeouts },
    { data: promises },
    { data: shoutouts },
    { data: github },
    { data: streaks },
    { data: existingProfiles },
    { data: previousInsights },
  ] = await Promise.all([
    supabase.from("org_members").select("user_id, role, profiles(full_name, email)").eq("org_id", orgId),
    supabase.from("time_entries").select("*").eq("org_id", orgId).gte("date", weekStart).lte("date", date).order("date").order("hour"),
    supabase.from("standups").select("*").eq("org_id", orgId).gte("date", weekStart),
    supabase.from("daily_closeouts").select("*").eq("org_id", orgId).gte("date", weekStart),
    supabase.from("daily_promises").select("*").eq("org_id", orgId).gte("date", weekStart),
    supabase.from("shoutouts").select("*").eq("org_id", orgId).gte("date", weekStart),
    supabase.from("github_events").select("*").eq("org_id", orgId).gte("date", weekStart),
    supabase.from("activity_streaks").select("*").eq("org_id", orgId),
    supabase.from("ai_work_profiles").select("*").eq("org_id", orgId),
    supabase.from("ai_daily_insights").select("*").eq("org_id", orgId).eq("date", date),
  ]);

  // Build context per person
  const results: Array<Record<string, unknown>> = [];

  for (const member of members ?? []) {
    const profile = member.profiles as unknown as { full_name: string; email: string } | null;
    const name = profile?.full_name ?? "?";
    const userId = member.user_id;

    const userEntries = (entries ?? []).filter((e) => e.user_id === userId);
    const todayEntries = userEntries.filter((e) => e.date === date);
    const userStandups = (standups ?? []).filter((s) => s.user_id === userId);
    const userCloseouts = (closeouts ?? []).filter((c) => c.user_id === userId);
    const userPromises = (promises ?? []).filter((p) => p.user_id === userId);
    const userShoutouts = (shoutouts ?? []).filter((s) => s.to_user_id === userId);
    const userGithub = (github ?? []).filter((g) => g.user_id === userId);
    const userStreak = (streaks ?? []).find((s) => s.user_id === userId);
    const existingProfile = (existingProfiles ?? []).find((p) => p.user_id === userId);

    // Build day-by-day breakdown
    const byDate = new Map<string, typeof userEntries>();
    for (const e of userEntries) {
      const list = byDate.get(e.date) ?? [];
      list.push(e);
      byDate.set(e.date, list);
    }

    let weekData = "";
    for (const [d, dayEntries] of byDate) {
      if (!dayEntries) continue;
      const deepWork = dayEntries.filter((e: any) => e.category === "deep_work").length;
      const meetings = dayEntries.filter((e: any) => e.category === "meeting").length;
      const proof = dayEntries.filter((e: any) => e.proof_urls?.length > 0).length;
      const late = dayEntries.filter((e: any) => e.is_late).length;
      const titles = dayEntries.map((e: any) => `"${e.title}"`).join("; ");
      weekData += `${d}: ${dayEntries.length}h (deep=${deepWork} meet=${meetings} proof=${proof}/${dayEntries.length} late=${late}) ${titles}\n`;
    }

    const previousProfileData = existingProfile?.profile_data
      ? `PERFIL ANTERIOR:\n${JSON.stringify(existingProfile.profile_data, null, 2)}\n`
      : "PERFIL: Primera vez analizando a esta persona.\n";

    const standup = userStandups.find((s: any) => s.date === date);
    const closeout = userCloseouts.find((c: any) => c.date === date);
    const dayPromises = userPromises.filter((p: any) => p.date === date);

    const context = `PERSONA: ${name}
${previousProfileData}
DATOS DE LA SEMANA:
${weekData}
STANDUP DE HOY: ${standup ? `Ayer="${standup.yesterday}" Hoy="${standup.today_plan}" Blockers="${standup.blockers ?? "ninguno"}"` : "NO HIZO"}
CLOSEOUT DE HOY: ${closeout ? `"${closeout.summary}"` : "NO HIZO"}
PROMESAS HOY: ${dayPromises.map((p: any) => `"${p.title}"→${p.status}`).join(", ") || "ninguna"}
SHOUTOUTS RECIBIDOS: ${userShoutouts.length}
GITHUB: ${userGithub.length} eventos
RACHA: ${userStreak?.current_streak ?? 0} días`;

    // Ask Claude to process this person's day
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `Eres el sistema de inteligencia de Exomagram. Procesa el día de ${name} y genera datos ESTRUCTURADOS que alimentarán futuras decisiones de AI.

${context}

Genera JSON con EXACTAMENTE esta estructura:
{
  "daily_insight": {
    "grade": "A/B/C/D/F",
    "score": 0-100,
    "productive_hours": número,
    "wasted_hours": número,
    "one_line": "resumen en 1 oración directa",
    "top_achievement": "lo mejor que hizo hoy o null",
    "biggest_concern": "lo peor o null",
    "standup_consistency": 0-100,
    "promise_reliability": 0-100,
    "evidence_quality": 0-100
  },
  "profile_update": {
    "work_personality": "1 oración que define su estilo de trabajo",
    "chronotype": "morning_person/afternoon_person/irregular",
    "consistency_score": 0-100,
    "autonomy_level": "high/medium/low",
    "communication_style": "proactive/reactive/silent",
    "strengths": ["máx 3"],
    "weaknesses": ["máx 3"],
    "motivators": ["qué lo mueve"],
    "risk_factors": ["qué lo puede hacer fallar"],
    "optimal_work_hours": "rango de horas donde es más productivo",
    "meeting_tolerance": "high/medium/low"
  },
  "predictive_signals": {
    "burnout_risk": 0-100,
    "disengagement_risk": 0-100,
    "trajectory": "improving/stable/declining",
    "days_until_concern": número o null,
    "early_warning": "señal temprana o null"
  },
  "relationship_signals": {
    "team_integration": 0-100,
    "gives_help": true/false,
    "receives_help": true/false,
    "potential_conflicts": ["nombre de persona y por qué" o vacío],
    "best_collaborator": "nombre o null"
  },
  "tomorrow_recommendation": "qué debería hacer mañana basado en hoy"
}

Responde SOLO JSON válido.`,
      }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    let parsed;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    } catch { parsed = null; }

    if (!parsed) {
      results.push({ name, error: "parse_failed" });
      continue;
    }

    // Store daily insight
    await supabase.from("ai_daily_insights").upsert({
      user_id: userId,
      org_id: orgId,
      date,
      insight: parsed.daily_insight,
      predictive: parsed.predictive_signals,
      relationships: parsed.relationship_signals,
      recommendation: parsed.tomorrow_recommendation,
    }, { onConflict: "user_id,org_id,date" });

    // Update work profile (accumulates over time)
    await supabase.from("ai_work_profiles").upsert({
      user_id: userId,
      org_id: orgId,
      profile_data: parsed.profile_update,
      last_updated: date,
    }, { onConflict: "user_id,org_id" });

    results.push({
      name,
      grade: parsed.daily_insight?.grade,
      score: parsed.daily_insight?.score,
      burnout_risk: parsed.predictive_signals?.burnout_risk,
      trajectory: parsed.predictive_signals?.trajectory,
    });
  }

  // Generate team dynamics snapshot
  const teamMessage = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Basándote en estos resultados individuales del día ${date}:
${JSON.stringify(results, null, 2)}

Y estos shoutouts de la semana:
${(shoutouts ?? []).map((s: any) => {
  const from = (members ?? []).find((m: any) => m.user_id === s.from_user_id);
  const to = (members ?? []).find((m: any) => m.user_id === s.to_user_id);
  const fromName = (from?.profiles as any)?.full_name ?? "?";
  const toName = (to?.profiles as any)?.full_name ?? "?";
  return `${fromName} → ${toName}: "${s.message}"`;
}).join("\n")}

Genera un snapshot de dinámicas del equipo. JSON:
{
  "team_health": 0-100,
  "collaboration_quality": 0-100,
  "top_performer": "nombre",
  "needs_attention": "nombre o null",
  "team_mood": "positive/neutral/negative",
  "key_pattern": "1 oración sobre el patrón más importante del equipo hoy",
  "action_needed": "1 acción que management debería tomar o null"
}

Solo JSON.`,
    }],
  });

  const teamText = teamMessage.content[0].type === "text" ? teamMessage.content[0].text : "";
  let teamParsed;
  try {
    const match = teamText.match(/\{[\s\S]*\}/);
    teamParsed = match ? JSON.parse(match[0]) : null;
  } catch { teamParsed = null; }

  if (teamParsed) {
    await supabase.from("ai_reviews").insert({
      org_id: orgId,
      date,
      review_type: "daily_team",
      findings: { type: "team_dynamics", ...teamParsed },
      summary: teamParsed.key_pattern,
    });
  }

  return NextResponse.json({
    date,
    people_processed: results.length,
    results,
    team: teamParsed,
  });
}
