import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/claude-audit?org_id=xxx&date=yyyy-mm-dd
//
// REAL AI audit using Claude. Not heuristics. Not templates.
// Claude reads every entry, cross-references between people,
// detects bullshit, inconsistencies, and gives brutally honest feedback.

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Gather all data
  const [
    { data: entries },
    { data: members },
    { data: closeouts },
    { data: standups },
    { data: promises },
    { data: githubEvents },
    { data: reactions },
  ] = await Promise.all([
    supabase.from("time_entries").select("*, profiles(full_name, role)").eq("org_id", orgId).eq("date", date).order("user_id").order("hour"),
    supabase.from("org_members").select("user_id, profiles(full_name, role)").eq("org_id", orgId),
    supabase.from("daily_closeouts").select("user_id, summary").eq("org_id", orgId).eq("date", date),
    supabase.from("standups").select("user_id, yesterday, today_plan, blockers").eq("org_id", orgId).eq("date", date),
    supabase.from("daily_promises").select("user_id, title, status").eq("org_id", orgId).eq("date", date),
    supabase.from("github_events").select("user_id, event_type, title, hour").eq("org_id", orgId).eq("date", date),
    supabase.from("entry_reactions").select("entry_id, reaction").eq("reaction", "suspicious"),
  ]);

  // Build context for Claude
  const memberMap = new Map<string, string>();
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string; role: string } | null;
    memberMap.set(m.user_id, `${p?.full_name ?? "?"} (${p?.role ?? "?"})`);
  }

  const suspiciousIds = new Set((reactions ?? []).map((r) => r.entry_id));

  // Build per-person data
  let dataBlock = "";

  for (const [userId, name] of memberMap) {
    const userEntries = (entries ?? []).filter((e) => e.user_id === userId);
    const userGithub = (githubEvents ?? []).filter((g) => g.user_id === userId);
    const userStandup = (standups ?? []).find((s) => s.user_id === userId);
    const userCloseout = (closeouts ?? []).find((c) => c.user_id === userId);
    const userPromises = (promises ?? []).filter((p) => p.user_id === userId);

    dataBlock += `\n=== ${name} ===\n`;

    if (userStandup) {
      dataBlock += `Standup: Ayer="${userStandup.yesterday}" Hoy="${userStandup.today_plan}" Blockers="${userStandup.blockers ?? "ninguno"}"\n`;
    } else {
      dataBlock += `Standup: NO HIZO\n`;
    }

    if (userEntries.length === 0) {
      dataBlock += `Entradas: CERO HORAS REGISTRADAS\n`;
    } else {
      dataBlock += `Entradas (${userEntries.length}h):\n`;
      for (const e of userEntries) {
        const late = e.is_late ? ` [TARDIA ${e.minutes_late}min]` : "";
        const proof = e.proof_urls?.length > 0 ? ` [EVIDENCIA: ${(e.proof_urls as string[]).join(", ")}]` : " [SIN EVIDENCIA]";
        const suspicious = suspiciousIds.has(e.id) ? " [MARCADA SOSPECHOSA POR COMPAÑERO]" : "";
        dataBlock += `  ${e.hour}:00 | ${e.category} | "${e.title}"${late}${proof}${suspicious}\n`;
        if (e.description) dataBlock += `    Detalles: "${e.description}"\n`;
      }
    }

    if (userGithub.length > 0) {
      dataBlock += `GitHub (${userGithub.length} eventos): ${userGithub.map((g) => `${g.event_type}@${g.hour}:00 "${g.title}"`).join("; ")}\n`;
    } else {
      dataBlock += `GitHub: SIN ACTIVIDAD\n`;
    }

    if (userPromises.length > 0) {
      dataBlock += `Promesas: ${userPromises.map((p) => `"${p.title}" → ${p.status}`).join("; ")}\n`;
    }

    if (userCloseout) {
      dataBlock += `Cierre del día: "${userCloseout.summary}"\n`;
    } else {
      dataBlock += `Cierre del día: NO HIZO\n`;
    }
  }

  // Call Claude with the RUTHLESS prompt
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `Eres el Director de Accountability de Exoma. Tu personalidad es una mezcla de Maquiavelo, un drill sergeant, y un detective forense. Tu único objetivo es la VERDAD sobre qué hizo cada persona.

TU FILOSOFÍA:
- Si alguien se está haciendo pendejo, DILO DIRECTAMENTE. No uses eufemismos.
- "Trabajé en cosas" no es trabajar. PRODUCIR es trabajar.
- Estar sentado 8 horas no significa nada si no hay OUTPUT.
- Las reuniones son el refugio de los que no quieren producir.
- Si no hay evidencia, no pasó. Punto.
- Detecta cuando alguien llena horas para "verse bien" pero no produce nada real.
- Cross-referencia TODO: si EXOMAP dice meeting con Erik, Erik DEBE tener la misma meeting.

FECHA: ${date}

DATOS COMPLETOS DEL EQUIPO:
${dataBlock}

ANALIZA CON OJOS DE DETECTIVE:

1. **¿Quién se está haciendo pendejo?** — ¿Hay alguien que registra horas pero no tiene output real? ¿Alguien que pone títulos genéricos que podrían ser inventados? ¿Alguien que "está en reuniones" todo el día como excusa?

2. **Inconsistencias y mentiras** — ¿El standup dice una cosa pero las entradas dicen otra? ¿Alguien dice "deep work en código" pero no tiene UN commit en GitHub? ¿Alguien reporta reunión con X pero X no reporta esa reunión?

3. **Quién realmente PRODUCE** — No quién está más horas, sino quién tiene más OUTPUT real con evidencia. Las horas sin deliverables son horas fantasma.

4. **Eficiencia brutal** — ¿Cuántas de las horas registradas generaron valor real? ¿Cuánto fue desperdicio (reuniones innecesarias, admin que podría automatizarse, "planeación" que es procrastinación disfrazada)?

5. **Dinámicas tóxicas del equipo** — ¿Hay alguien que bloquea a otros? ¿Alguien que genera reuniones innecesarias? ¿Alguien que se esconde detrás del equipo?

6. **Ideas maquiavélicas** — Da ideas creativas y no obvias para mejorar la productividad. Piensa diferente. ¿Qué cambios estructurales eliminarían la posibilidad de hacer bullshit?

RESPONDE EN ESTE FORMATO JSON EXACTO:
{
  "team_verdict": "3-4 oraciones sin filtro sobre el día del equipo. Sé directo, sin miedo.",
  "team_score": 0-100,
  "quien_se_hizo_pendejo": "nombre(s) y por qué, o 'nadie' si todos trabajaron de verdad",
  "people": [
    {
      "name": "nombre",
      "grade": "A/B/C/D/F",
      "score": 0-100,
      "verdict": "2-3 oraciones DIRECTAS. Si se hizo pendejo, dilo. Si fue productivo, reconócelo.",
      "se_hizo_pendejo": true/false,
      "evidencia_de_bullshit": ["pruebas concretas de que no trabajó o mintió"],
      "red_flags": ["problemas específicos con datos"],
      "inconsistencies": ["contradicciones encontradas entre diferentes fuentes"],
      "what_they_actually_did": "en 1 oración, qué REALMENTE produjo esta persona hoy basado en la evidencia",
      "strengths": ["lo que hizo bien, si algo"],
      "coaching": "consejo directo, no genérico. Específico a esta persona y este día.",
      "trust_impact": -20 a +10,
      "efficiency_rating": "alta/media/baja/nula",
      "bullshit_meter": 0-100,
      "hours_that_actually_count": "número de horas con output verificable real",
      "money_wasted": "estimado en USD de horas sin valor (asume $50/hora)"
    }
  ],
  "team_patterns": ["patrones sistémicos del equipo que permiten el bullshit"],
  "toxic_dynamics": ["dinámicas entre personas que destruyen productividad"],
  "machiavelli_ideas": ["3-5 ideas creativas, no obvias, para que sea IMPOSIBLE hacerse pendejo"],
  "structural_changes": ["cambios en procesos/estructura que eliminarían los problemas detectados"],
  "recommendation": "LA acción más importante que el equipo debe tomar MAÑANA",
  "who_deserves_a_raise": "nombre de la persona más productiva y por qué",
  "who_needs_a_talk": "nombre de la persona que necesita una conversación seria y por qué"
}

Responde SOLO con el JSON válido, sin markdown, sin backticks, sin explicación.`,
      },
    ],
  });

  // Parse Claude's response
  const responseText = message.content[0].type === "text" ? message.content[0].text : "";

  let parsed;
  try {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return NextResponse.json({
      error: "Failed to parse Claude response",
      raw_response: responseText,
    }, { status: 500 });
  }

  // Save to ai_reviews
  await supabase.from("ai_reviews").insert({
    org_id: orgId,
    date,
    review_type: "daily_team",
    findings: parsed,
    summary: parsed.team_verdict,
    trust_impact: parsed.people?.reduce((s: number, p: { trust_impact: number }) => s + p.trust_impact, 0) ?? 0,
  });

  return NextResponse.json({
    date,
    model: "claude-sonnet-4-6",
    ...parsed,
  });
}
