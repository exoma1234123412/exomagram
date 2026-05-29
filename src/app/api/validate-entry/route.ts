import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";

// POST /api/validate-entry
//
// AI ENTRY VALIDATOR — Claude evaluates entry quality BEFORE submission.
// Blocks vague, lazy, or suspicious entries. Forces specificity.
//
// This is called from the log-entry dialog before the actual insert.
// If Claude says no, the entry does not get saved.

interface ValidateRequest {
  category: WorkCategory;
  title: string;
  description: string;
  hour: number;
  date: string;
  proof_urls: string[];
  recent_entries: {
    title: string;
    description: string;
    category: string;
    hour: number;
    date: string;
  }[];
  /** Optional: recent validation results from previous submissions (client-provided). */
  recent_validations?: {
    title: string;
    approved: boolean;
    quality_score: number;
    issues: string[];
    date: string;
  }[];
}

interface ValidationResult {
  approved: boolean;
  issues: string[];
  suggestions: string[];
  quality_score: number;
  red_flags: string[];
  copycat_score: number;
}

export async function POST(request: Request) {
  // Auth — this is a user-facing route, not cron
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Verify org membership
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  // Fallback if no API key — don't block submissions
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      approved: true,
      issues: [],
      suggestions: [],
      quality_score: 100,
      red_flags: [],
      copycat_score: 0,
    });
  }

  let body: ValidateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { category, title, description, hour, date, proof_urls, recent_entries, recent_validations } = body;

  // Basic validation before calling AI
  if (!category || !title) {
    return NextResponse.json({ error: "category y title son requeridos" }, { status: 400 });
  }

  // Validate category is real
  if (!CATEGORIES[category as WorkCategory]) {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  }

  // Format recent entries for the prompt
  const recentEntriesText =
    recent_entries && recent_entries.length > 0
      ? recent_entries
          .map(
            (e, i) =>
              `${i + 1}. [${e.category}] ${e.title}${e.description ? ` — ${e.description}` : ""} (${e.date} ${e.hour}:00)`
          )
          .join("\n")
      : "No hay entradas recientes.";

  // Build recent validation history context (helps Claude remember previous rejections)
  let validationHistoryText = "";
  if (recent_validations && recent_validations.length > 0) {
    validationHistoryText = recent_validations
      .map(
        (v, i) =>
          `${i + 1}. "${v.title}" → ${v.approved ? "APROBADA" : "RECHAZADA"} (${v.quality_score}/100)${v.issues.length > 0 ? ` Problemas: ${v.issues.join("; ")}` : ""}`
      )
      .join("\n");
  }

  // Fetch user's recent quality scores from server side for additional context
  const { data: recentServerEntries } = await supabase
    .from("time_entries")
    .select("title, category, quality_score, date, hour")
    .eq("user_id", user.id)
    .eq("org_id", membership.org_id)
    .order("date", { ascending: false })
    .order("hour", { ascending: false })
    .limit(10);

  let serverPatternText = "";
  if (recentServerEntries && recentServerEntries.length > 0) {
    const avgScore = recentServerEntries
      .filter((e) => e.quality_score != null)
      .map((e) => e.quality_score as number);
    const avg = avgScore.length > 0 ? Math.round(avgScore.reduce((a, b) => a + b, 0) / avgScore.length) : null;
    serverPatternText = `\nCalidad promedio reciente del usuario: ${avg ?? "sin datos"}/100`;
    serverPatternText += `\nÚltimas 10 entradas guardadas: ${recentServerEntries.map((e) => `[${e.category}] "${e.title}" (${e.quality_score ?? "?"}pts)`).join("; ")}`;
  }

  const categoryLabel = CATEGORIES[category as WorkCategory]?.label ?? category;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Eres el validador de entradas de trabajo de Exomagram. Tu trabajo es RECHAZAR entradas vagas, perezosas o sospechosas.

Evalúa esta entrada:
- Categoría: ${categoryLabel} (${category})
- Título: ${title}
- Descripción: ${description || "(sin descripción)"}
- Hora: ${hour}:00
- Fecha: ${date}
- Evidencia: ${proof_urls && proof_urls.length > 0 ? `Sí (${proof_urls.length} links)` : "No"}

Entradas recientes del mismo usuario (para detectar copias):
${recentEntriesText}
${serverPatternText}
${validationHistoryText ? `\nHistorial de validaciones recientes de esta sesión (rechazos previos = el usuario ya fue advertido):\n${validationHistoryText}` : ""}

Responde SOLO con JSON válido, sin markdown ni backticks:
{
  "approved": true/false,
  "issues": ["lista de problemas encontrados"],
  "suggestions": ["sugerencias específicas para mejorar"],
  "quality_score": 0-100,
  "red_flags": ["frases genéricas detectadas"],
  "copycat_score": 0-100
}

RECHAZA (approved=false) si:
- La descripción tiene menos de 15 palabras Y el título es genérico
- No menciona ningún entregable, acción concreta o resultado específico
- Usa frases genéricas como "trabajé en", "avancé con", "lo de siempre", "hice cosas", "seguí con"
- Es casi idéntica a una entrada reciente (copycat_score > 80)
- La descripción no coincide con la categoría seleccionada (ej: deep_work pero describe una reunión)
- Es imposiblemente vaga para la hora registrada

APRUEBA (approved=true) si:
- Menciona un entregable concreto, una decisión tomada, o un resultado específico
- Es clara sobre QUÉ se hizo, no solo "en qué área"
- Es diferente a entradas recientes
- La categoría coincide con lo descrito

Sé estricto pero justo. Una entrada corta pero específica ("Fix bug #234 en validación de emails") es válida.
Una entrada larga pero vaga ("Estuve trabajando en varias cosas del proyecto durante esta hora") NO es válida.`,
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";

    let parsed: ValidationResult;
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // If parsing fails, approve by default (don't block users due to AI issues)
      return NextResponse.json({
        approved: true,
        issues: [],
        suggestions: [],
        quality_score: 50,
        red_flags: [],
        copycat_score: 0,
      });
    }

    // Ensure the response has the expected shape
    const result: ValidationResult = {
      approved: typeof parsed.approved === "boolean" ? parsed.approved : true,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      quality_score:
        typeof parsed.quality_score === "number"
          ? Math.max(0, Math.min(100, parsed.quality_score))
          : 50,
      red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
      copycat_score:
        typeof parsed.copycat_score === "number"
          ? Math.max(0, Math.min(100, parsed.copycat_score))
          : 0,
    };

    return NextResponse.json(result);
  } catch (err) {
    // If Anthropic API fails, approve by default — never block users due to infra issues
    console.error("[validate-entry] Anthropic API error:", err);
    return NextResponse.json({
      approved: true,
      issues: [],
      suggestions: [],
      quality_score: 100,
      red_flags: [],
      copycat_score: 0,
    });
  }
}
