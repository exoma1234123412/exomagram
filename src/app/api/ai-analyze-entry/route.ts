import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// POST /api/ai-analyze-entry
//
// Runs AFTER an entry is saved. Claude reads every entry and generates
// public analysis stored in the entry's verification_note field.
// If conflicts are detected with other entries at the same hour,
// an accountability flag is created.

interface AnalysisResult {
  quality_grade: string;
  quality_score: number;
  sentiment: string;
  commentary: string;
  conflicts: string[];
  patterns: string[];
  red_flags: string[];
  tags: string[];
}

export async function POST(request: NextRequest) {
  // ── 1. Authenticate user via Supabase server client ──────────────
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

  // ── Verify org membership ────────────────────────────────────────
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

  // ── Graceful fallback if API key missing ─────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { success: false, error: "AI no disponible" },
      { status: 200 }
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Service-role client for writes (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── 2. Fetch the entry with profile join ─────────────────────────
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

  // ── 3. Fetch user's last 5 entries for context ───────────────────
  // ── 4. Fetch other members' entries for SAME hour ────────────────
  const [{ data: recentEntries }, { data: sameHourEntries }] =
    await Promise.all([
      supabase
        .from("time_entries")
        .select(
          "id, date, hour, category, title, description, proof_urls, is_late, minutes_late"
        )
        .eq("user_id", entry.user_id)
        .eq("org_id", org_id)
        .neq("id", entry_id)
        .order("date", { ascending: false })
        .order("hour", { ascending: false })
        .limit(5),

      supabase
        .from("time_entries")
        .select("user_id, category, title, description")
        .eq("org_id", org_id)
        .eq("date", entry.date)
        .eq("hour", entry.hour)
        .neq("user_id", entry.user_id),
    ]);

  // Fetch names for same-hour users
  const sameHourUserIds = [
    ...new Set((sameHourEntries ?? []).map((e) => e.user_id)),
  ];
  const sameHourNames = new Map<string, string>();
  if (sameHourUserIds.length > 0) {
    const { data: sameHourProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", sameHourUserIds);
    for (const p of sameHourProfiles ?? []) {
      sameHourNames.set(p.id, p.full_name ?? "?");
    }
  }

  // ── Build context strings ────────────────────────────────────────
  const proofLinks = entry.proof_urls as string[] | null;
  const proofCount = proofLinks?.length ?? 0;

  const recentEntriesText =
    (recentEntries ?? []).length > 0
      ? (recentEntries ?? [])
          .map(
            (e) =>
              `- ${e.date} ${e.hour}:00 [${e.category}] "${e.title}" evidencia=${(e.proof_urls as string[] | null)?.length ?? 0} tardia=${e.is_late ? "si" : "no"}`
          )
          .join("\n")
      : "Sin entradas recientes";

  const otherEntriesText =
    (sameHourEntries ?? []).length > 0
      ? (sameHourEntries ?? [])
          .map(
            (e) =>
              `- ${sameHourNames.get(e.user_id) ?? "?"}: [${e.category}] "${e.title}"${e.description ? ` — ${e.description}` : ""}`
          )
          .join("\n")
      : "Nadie mas registro en esta hora";

  // ── 5. Call Claude Haiku ─────────────────────────────────────────
  const prompt = `Eres el analista de datos de Exomagram. Analiza esta entrada de trabajo y genera observaciones factuales.

Entrada:
- Autor: ${name}
- Categoria: ${entry.category}
- Titulo: ${entry.title}
- Descripcion: ${entry.description ?? "SIN DESCRIPCION"}
- Hora: ${entry.hour}:00
- Evidencia: ${proofCount} links
- Tardia: ${entry.is_late ? "Si" : "No"} (${entry.minutes_late ?? 0} min)

Entradas recientes del mismo usuario:
${recentEntriesText}

Otras entradas a la misma hora hoy:
${otherEntriesText}

Responde SOLO con JSON:
{
  "quality_grade": "A/B/C/D/F",
  "quality_score": 0-100,
  "sentiment": "positive/neutral/negative",
  "commentary": "Una observacion breve y directa sobre esta entrada (1-2 oraciones)",
  "conflicts": ["lista de conflictos detectados con otras entradas"],
  "patterns": ["patrones detectados comparando con entradas recientes"],
  "red_flags": ["senales de alarma"],
  "tags": ["auto-generated tags like 'backfill', 'vague', 'detailed', 'consistent'"]
}

Solo JSON valido, sin texto adicional.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    const analysis: AnalysisResult | null = match
      ? JSON.parse(match[0])
      : null;

    if (!analysis) {
      return NextResponse.json(
        { error: "No se pudo parsear la respuesta de AI", raw: text },
        { status: 500 }
      );
    }

    // ── 6. Save analysis to verification_note ──────────────────────
    const commentary = analysis.commentary ?? "";
    const grade = analysis.quality_grade ?? "?";
    const score = analysis.quality_score ?? 0;
    const tags = (analysis.tags ?? []).join(", ");

    // Format: "[Grade] Score — Commentary [tags]"
    const verificationNote = `[${grade}] ${score}/100 — ${commentary}${tags ? ` [${tags}]` : ""}`;

    await supabase
      .from("time_entries")
      .update({
        verification_note: verificationNote,
        // V12 — Persist quality score directly on entry
        quality_score: Math.max(0, Math.min(100, score)),
      })
      .eq("id", entry_id);

    // ── 7. Create accountability flags if conflicts detected ───────
    const conflicts = analysis.conflicts ?? [];
    if (conflicts.length > 0) {
      const conflictDetails = conflicts.join("; ");
      // Check for existing flag to avoid duplicates
      const { data: existingFlag } = await supabase
        .from("accountability_flags")
        .select("id")
        .eq("user_id", entry.user_id)
        .eq("org_id", org_id)
        .eq("date", entry.date)
        .eq("flag_type", "suspicious_pattern")
        .limit(1)
        .maybeSingle();

      if (!existingFlag) {
        await supabase.from("accountability_flags").insert({
          user_id: entry.user_id,
          org_id,
          flag_type: "suspicious_pattern",
          date: entry.date,
          details: `Conflictos AI: ${conflictDetails}`,
        });
      }
    }

    // Also flag red_flags if any
    const redFlags = analysis.red_flags ?? [];
    if (redFlags.length > 0) {
      const { data: existingRedFlag } = await supabase
        .from("accountability_flags")
        .select("id")
        .eq("user_id", entry.user_id)
        .eq("org_id", org_id)
        .eq("date", entry.date)
        .eq("flag_type", "low_detail")
        .limit(1)
        .maybeSingle();

      if (!existingRedFlag) {
        await supabase.from("accountability_flags").insert({
          user_id: entry.user_id,
          org_id,
          flag_type: "low_detail",
          date: entry.date,
          details: `Red flags AI: ${redFlags.join("; ")}`,
        });
      }
    }

    return NextResponse.json({ success: true, analysis });
  } catch (err) {
    // Graceful fallback on error — don't break the entry save flow
    const errorMessage =
      err instanceof Error ? err.message : "Error desconocido";
    console.error("[ai-analyze-entry] Error:", errorMessage);
    return NextResponse.json(
      { success: false, error: "Error al analizar entrada", details: errorMessage },
      { status: 500 }
    );
  }
}
