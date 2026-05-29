import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { checkAIRateLimit } from "@/lib/ai-rate-limit";
import { buildTeamContext } from "@/lib/ai-context-builder";

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

  // Build full team context using the shared context builder
  const context = await buildTeamContext(supabase, org_id, { days: 30 });

  const systemPrompt = `Eres el analista de datos de Exomagram. Tienes acceso a TODOS los datos del equipo.
Responde preguntas con datos concretos: nombres, numeros, fechas, porcentajes.
SIEMPRE menciona nombres completos. NUNCA generalices cuando puedes ser especifico.
Responde en espanol. Se directo y brutal con los datos.
Usa formato Markdown para estructurar tu respuesta: negritas, listas, tablas cuando sea apropiado.
Hoy es ${context.today}.

${context.text}`;

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
