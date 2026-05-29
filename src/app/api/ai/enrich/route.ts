import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// POST /api/ai/enrich
// Batch AI data enrichment. Processes multiple entries to fill in missing
// classification data. Called from cron or manually by authenticated users.

export async function POST(request: NextRequest) {
  // Auth: CRON_SECRET header OR user auth
  const authHeader = request.headers.get("authorization");
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  let orgId: string | null = null;

  if (!isCron) {
    const serverClient = await createServerSupabase();
    const {
      data: { user },
    } = await serverClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const clonedBody = await request.clone().json();
    orgId = clonedBody.org_id ?? null;

    if (!orgId) {
      return NextResponse.json(
        { error: "org_id requerido" },
        { status: 400 }
      );
    }

    // Verify membership
    const { data: membership } = await serverClient
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .single();
    if (!membership) {
      return NextResponse.json(
        { error: "No perteneces a esta organizacion" },
        { status: 403 }
      );
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await request.json();
  const {
    org_id: bodyOrgId,
    date,
    user_id: filterUserId,
    limit: rawLimit,
  } = body as {
    org_id: string;
    date?: string;
    user_id?: string;
    limit?: number;
  };

  // For cron, org_id comes from body
  if (!orgId) orgId = bodyOrgId;
  if (!orgId) {
    return NextResponse.json({ error: "org_id requerido" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];
  const targetDate = date ?? today;
  const limit = rawLimit ?? 50;

  // ---------------------------------------------------------------------------
  // 1. Query entries with MISSING advanced data
  // ---------------------------------------------------------------------------
  let query = supabase
    .from("time_entries")
    .select(
      "id, user_id, date, hour, category, title, description, proof_urls, output_type, difficulty, value_rating, skills_tags, could_be_async"
    )
    .eq("org_id", orgId)
    .eq("date", targetDate)
    .is("output_type", null)
    .is("difficulty", null)
    .order("hour", { ascending: true })
    .limit(limit);

  if (filterUserId) {
    query = query.eq("user_id", filterUserId);
  }

  const { data: entries, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json(
      { error: "Error al buscar entradas", details: fetchError.message },
      { status: 500 }
    );
  }

  if (!entries || entries.length === 0) {
    return NextResponse.json({
      success: true,
      enriched: 0,
      entries: [],
      message: "No hay entradas que necesiten enriquecimiento",
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Fetch profile names for all entry users
  // ---------------------------------------------------------------------------
  const userIds = [...new Set(entries.map((e) => e.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);

  const nameMap = new Map<string, string>();
  for (const p of profiles ?? []) {
    nameMap.set(p.id, p.full_name ?? "?");
  }

  // ---------------------------------------------------------------------------
  // 3. Build ONE batch prompt for Claude with ALL entries
  // ---------------------------------------------------------------------------
  const entriesList = entries
    .map((e) => {
      const proofUrls = e.proof_urls as string[] | null;
      return `[${e.id}] ${nameMap.get(e.user_id) ?? "?"} — ${e.date} ${e.hour}:00 — ${e.category}
  Titulo: "${e.title}"
  Descripcion: "${e.description ?? "sin descripcion"}"
  Evidencia: ${proofUrls && proofUrls.length > 0 ? proofUrls.join(", ") : "ninguna"}`;
    })
    .join("\n\n");

  const prompt = `Eres el Motor de Enriquecimiento de Datos de Exomagram. Tu trabajo es clasificar y completar datos faltantes de entradas de trabajo.

Para CADA entrada, basandote en la categoria, titulo, y descripcion, determina:

ENTRADAS:
${entriesList}

Para cada entrada, responde:
[
  {
    "entry_id": "uuid",
    "output_type": "code|document|design|email|decision|analysis|presentation|communication|review_output|none",
    "difficulty_estimate": 1-5,
    "value_estimate": 1-5,
    "skills_detected": ["skill1", "skill2"],
    "quality_score": 0-100,
    "could_be_async": true/false (solo si es meeting),
    "enrichment_confidence": 0-100
  }
]

Reglas:
- output_type: infiere del titulo y descripcion. PR/commit/deploy -> code. Reunion/call/sync -> communication. Diseno/mockup/UI -> design. Review/code review -> review_output. Correo/email -> email. Analisis/metricas/datos -> analysis. Presentacion/slides -> presentation. Decision/aprobacion -> decision. Si no es claro -> none.
- difficulty_estimate: 1=trivial, 2=sencillo, 3=moderado, 4=complejo, 5=muy complejo.
- value_estimate: 1=bajo impacto, 2=menor, 3=moderado, 4=alto, 5=critico.
- skills_detected: maximo 4 skills relevantes en espanol o ingles tecnico.
- quality_score: calidad de la entrada basada en detalle del titulo y descripcion.
- could_be_async: solo aplica a meetings. true si la reunion pudo haber sido un mensaje. null para otras categorias.
- enrichment_confidence: que tan seguro estas de tus estimaciones.

Solo JSON valido (el array), sin texto adicional.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const match = text.match(/\[[\s\S]*\]/);
    const parsed: Array<{
      entry_id: string;
      output_type?: string;
      difficulty_estimate?: number;
      value_estimate?: number;
      skills_detected?: string[];
      quality_score?: number;
      could_be_async?: boolean | null;
      enrichment_confidence?: number;
    }> = match ? JSON.parse(match[0]) : null;

    if (!parsed || !Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "No se pudo parsear la respuesta de AI", raw: text },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------------------------
    // 4. For each enriched entry, update time_entries (only null/empty fields)
    // ---------------------------------------------------------------------------
    const validOutputTypes = new Set([
      "code",
      "document",
      "design",
      "email",
      "decision",
      "analysis",
      "presentation",
      "communication",
      "review_output",
      "none",
    ]);

    let enrichedCount = 0;
    const enrichedIds: string[] = [];

    for (const suggestion of parsed) {
      const original = entries.find((e) => e.id === suggestion.entry_id);
      if (!original) continue;

      const updates: Record<string, unknown> = {};

      // output_type — only if still null
      if (
        !original.output_type &&
        suggestion.output_type &&
        validOutputTypes.has(suggestion.output_type)
      ) {
        updates.output_type = suggestion.output_type;
      }

      // difficulty — only if still null
      if (original.difficulty === null && suggestion.difficulty_estimate != null) {
        updates.difficulty = Math.max(
          1,
          Math.min(5, Math.round(suggestion.difficulty_estimate))
        );
      }

      // value_rating — only if still null
      if (original.value_rating === null && suggestion.value_estimate != null) {
        updates.value_rating = Math.max(
          1,
          Math.min(5, Math.round(suggestion.value_estimate))
        );
      }

      // skills_tags — only if still empty
      const existingSkills = original.skills_tags as string[] | null;
      if (
        (!existingSkills || existingSkills.length === 0) &&
        suggestion.skills_detected &&
        suggestion.skills_detected.length > 0
      ) {
        updates.skills_tags = suggestion.skills_detected.slice(0, 4);
      }

      // could_be_async — only if still null and category is meeting
      if (
        original.could_be_async === null &&
        original.category === "meeting" &&
        suggestion.could_be_async != null
      ) {
        updates.could_be_async = suggestion.could_be_async;
      }

      // V12 — quality_score (always update to latest AI assessment)
      if (suggestion.quality_score != null) {
        updates.quality_score = Math.max(0, Math.min(100, Math.round(suggestion.quality_score)));
      }

      if (Object.keys(updates).length === 0) continue;

      updates.updated_at = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("time_entries")
        .update(updates)
        .eq("id", original.id)
        .eq("org_id", orgId);

      if (!updateError) {
        enrichedCount++;
        enrichedIds.push(original.id);
      }
    }

    return NextResponse.json({
      success: true,
      enriched: enrichedCount,
      entries: enrichedIds,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: "Error al enriquecer entradas", details: errorMessage },
      { status: 500 }
    );
  }
}
