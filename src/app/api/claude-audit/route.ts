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

  // Call Claude
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Eres el auditor de transparencia de la empresa Exoma. Tu trabajo es analizar el día de trabajo de cada empleado y dar un veredicto BRUTALMENTE HONESTO. No suavices nada. Si alguien no trabajó, dilo. Si alguien mintió, dilo.

FECHA: ${date}

DATOS DEL EQUIPO:
${dataBlock}

ANALIZA LO SIGUIENTE PARA CADA PERSONA:

1. **Consistencia**: ¿Lo que dicen en el standup coincide con lo que registraron? ¿Las horas de "deep work" tienen commits en GitHub?
2. **Calidad de entradas**: ¿Los títulos son específicos o genéricos/copy-paste? ¿Hay evidencia real?
3. **Cross-referencia**: Si alguien dice "reunión con X", ¿X también reportó esa reunión a la misma hora?
4. **Eficiencia**: ¿Cuánto tiempo fue productivo vs desperdiciado? ¿Demasiadas reuniones? ¿Mucho admin?
5. **Patrones sospechosos**: Entradas tardías, entradas muy similares, backfill masivo, horas sin output.
6. **Promesas**: ¿Cumplió lo que prometió?

RESPONDE EN ESTE FORMATO JSON EXACTO:
{
  "team_verdict": "resumen del día del equipo en 2-3 oraciones brutalmente honestas",
  "team_score": 0-100,
  "people": [
    {
      "name": "nombre",
      "grade": "A/B/C/D/F",
      "score": 0-100,
      "verdict": "1-2 oraciones brutalmente honestas sobre su día",
      "red_flags": ["lista de problemas específicos encontrados"],
      "inconsistencies": ["contradicciones entre lo que dice y lo que hizo"],
      "strengths": ["cosas que hizo bien"],
      "coaching": "1 consejo específico y accionable para mejorar mañana",
      "trust_impact": -20 a +10,
      "efficiency_rating": "alta/media/baja",
      "bullshit_meter": 0-100
    }
  ],
  "team_patterns": ["patrones que afectan a todo el equipo"],
  "recommendation": "1 acción que el equipo debería tomar mañana"
}

Responde SOLO con el JSON, sin markdown ni explicación adicional.`,
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
    model: "claude-sonnet-4-20250514",
    ...parsed,
  });
}
