import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkAIRateLimit } from "@/lib/ai-rate-limit";

// POST /api/claude-excuses
// Body: { org_id }
// Claude Haiku analyzes the last 30 days of standups (blockers) and closeouts
// looking for RECURRING excuses per person.

export async function POST(request: Request) {
  // AI rate limiting
  const rateLimitResponse = await checkAIRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;
  const authSupabase = await createServerClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { org_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalido" }, { status: 400 });
  }

  const orgId = body.org_id;
  if (!orgId) return NextResponse.json({ error: "org_id requerido" }, { status: 400 });

  // Verify caller is a member
  const { data: membership } = await authSupabase
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];

  // Fetch standups and closeouts for the last 30 days
  const [{ data: standups }, { data: closeouts }, { data: members }] = await Promise.all([
    supabase
      .from("standups")
      .select("user_id, date, blockers, yesterday, today_plan")
      .eq("org_id", orgId)
      .gte("date", startDate)
      .order("date"),
    supabase
      .from("daily_closeouts")
      .select("user_id, date, summary, blockers")
      .eq("org_id", orgId)
      .gte("date", startDate)
      .order("date"),
    supabase
      .from("org_members")
      .select("user_id, profiles(full_name)")
      .eq("org_id", orgId),
  ]);

  const memberMap = new Map<string, string>();
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string } | null;
    memberMap.set(m.user_id, p?.full_name ?? "Desconocido");
  }

  // Build context per person
  let dataBlock = "";
  for (const [userId, name] of memberMap) {
    const userStandups = (standups ?? []).filter((s) => s.user_id === userId);
    const userCloseouts = (closeouts ?? []).filter((c) => c.user_id === userId);

    if (userStandups.length === 0 && userCloseouts.length === 0) continue;

    dataBlock += `\n=== ${name} (${userId}) ===\n`;

    if (userStandups.length > 0) {
      dataBlock += `Standups (${userStandups.length} en 30 dias):\n`;
      for (const s of userStandups) {
        dataBlock += `  ${s.date}: blockers="${s.blockers ?? "ninguno"}" ayer="${s.yesterday}" plan="${s.today_plan}"\n`;
      }
    }

    if (userCloseouts.length > 0) {
      dataBlock += `Closeouts (${userCloseouts.length} en 30 dias):\n`;
      for (const c of userCloseouts) {
        dataBlock += `  ${c.date}: summary="${c.summary}" blockers="${c.blockers ?? "ninguno"}"\n`;
      }
    }
  }

  if (!dataBlock.trim()) {
    return NextResponse.json({
      people: [],
      summary: "No hay datos de standups o closeouts en los ultimos 30 dias.",
    });
  }

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20250414",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Eres un detector de excusas recurrentes. Tu trabajo es analizar los standups (blockers) y closeouts de los ultimos 30 dias y detectar patrones de excusas que se repiten.

DATOS:
${dataBlock}

INSTRUCCIONES:
- Busca frases o temas que se repiten en los blockers y closeouts de cada persona.
- Clasifica cada excusa recurrente como "legit" (bloqueador real) o "suspicious" (posible patron de evasion).
- Una excusa es "suspicious" si: aparece muchas veces sin resolverse, es vaga, o parece pretexto para no avanzar.
- Una excusa es "legit" si: es especifica, cambia con el tiempo, o se puede verificar externamente.
- Para cada persona, da un veredicto general.
- Responde en espanol.

RESPONDE SOLO JSON VALIDO:
{
  "people": [
    {
      "user_id": "uuid",
      "name": "nombre",
      "excuses": [
        {
          "phrase": "frase o tema recurrente",
          "count": numero_de_veces,
          "verdict": "legit" o "suspicious",
          "evidence": "ejemplo concreto con fecha"
        }
      ],
      "overall": "texto resumen de 1-2 oraciones sobre esta persona"
    }
  ],
  "summary": "resumen general del equipo en 2-3 oraciones"
}

Responde SOLO con el JSON, sin markdown, sin backticks.`,
      },
    ],
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : "";

  let parsed;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return NextResponse.json(
      { error: "Error al parsear respuesta de Claude", raw_response: responseText },
      { status: 500 }
    );
  }

  return NextResponse.json({
    model: "claude-haiku-4-5-20250414",
    ...parsed,
  });
}
