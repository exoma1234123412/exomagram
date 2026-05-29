import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/obituarios
// Generates satirical monthly obituaries for each org member
// based on their actual work data from the last 30 days.

export async function POST(request: Request) {
  const authSupabase = await createServerClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: { org_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalido" }, { status: 400 });
  }

  const orgId = body.org_id;
  if (!orgId) {
    return NextResponse.json({ error: "org_id requerido" }, { status: 400 });
  }

  // Verify membership
  const { data: membership } = await authSupabase
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY no configurada" },
      { status: 500 }
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all org members with profiles
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, profiles(full_name)")
    .eq("org_id", orgId);

  if (!members || members.length === 0) {
    return NextResponse.json({ error: "No hay miembros" }, { status: 404 });
  }

  // Last 30 days date range
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];

  // Current month string for storage
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Fetch all data in parallel
  const [
    { data: entries },
    { data: trustScores },
    { data: closeouts },
    { data: flags },
  ] = await Promise.all([
    supabase
      .from("time_entries")
      .select("user_id, category, title, is_late, proof_urls, date, hour, mood, energy")
      .eq("org_id", orgId)
      .gte("date", startDate),
    supabase
      .from("trust_score_history")
      .select("user_id, date, score, hours_logged, hours_with_proof, late_entries, has_closeout")
      .eq("org_id", orgId)
      .gte("date", startDate)
      .order("date"),
    supabase
      .from("daily_closeouts")
      .select("user_id, date, hours_logged, mood")
      .eq("org_id", orgId)
      .gte("date", startDate),
    supabase
      .from("accountability_flags")
      .select("user_id, flag_type, date, details")
      .eq("org_id", orgId)
      .gte("date", startDate),
  ]);

  // Build member name map
  const memberMap = new Map<string, string>();
  for (const m of members) {
    const p = m.profiles as unknown as { full_name: string } | null;
    memberMap.set(m.user_id, p?.full_name ?? "Desconocido");
  }

  // Build data context for each member
  let fullDataBlock = "";
  for (const [userId, name] of memberMap) {
    const userEntries = (entries ?? []).filter((e) => e.user_id === userId);
    const userTrust = (trustScores ?? []).filter((t) => t.user_id === userId);
    const userCloseouts = (closeouts ?? []).filter((c) => c.user_id === userId);
    const userFlags = (flags ?? []).filter((f) => f.user_id === userId);

    const totalHours = userEntries.length;
    const deepWork = userEntries.filter((e) => e.category === "deep_work").length;
    const meetings = userEntries.filter((e) => e.category === "meeting").length;
    const breaks = userEntries.filter((e) => e.category === "break").length;
    const blocked = userEntries.filter((e) => e.category === "blocked").length;
    const lateEntries = userEntries.filter((e) => e.is_late).length;
    const withProof = userEntries.filter(
      (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
    ).length;

    // Most common category
    const catCounts = new Map<string, number>();
    for (const e of userEntries) {
      catCounts.set(e.category, (catCounts.get(e.category) ?? 0) + 1);
    }
    const topCategory = Array.from(catCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];

    // Worst day (fewest hours)
    const dayHours = new Map<string, number>();
    for (const e of userEntries) {
      dayHours.set(e.date, (dayHours.get(e.date) ?? 0) + 1);
    }
    const worstDay = Array.from(dayHours.entries())
      .sort((a, b) => a[1] - b[1])[0];

    // Trust score trend
    const trustScoreValues = userTrust.map((t) => t.score);
    const avgTrust = trustScoreValues.length > 0
      ? Math.round(trustScoreValues.reduce((a, b) => a + b, 0) / trustScoreValues.length)
      : 0;
    const lastTrust = trustScoreValues.length > 0 ? trustScoreValues[trustScoreValues.length - 1] : 0;
    const firstTrust = trustScoreValues.length > 0 ? trustScoreValues[0] : 0;
    const trustTrend = lastTrust - firstTrust;

    // Flag types
    const flagTypes = new Map<string, number>();
    for (const f of userFlags) {
      flagTypes.set(f.flag_type, (flagTypes.get(f.flag_type) ?? 0) + 1);
    }
    const topFlags = Array.from(flagTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Mood trend
    const moods = userEntries.filter((e) => e.mood !== null).map((e) => e.mood as number);
    const avgMood = moods.length > 0 ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : "N/A";

    fullDataBlock += `
=== ${name} ===
- Horas totales: ${totalHours}
- Deep Work: ${deepWork}h | Reuniones: ${meetings}h | Descansos: ${breaks}h | Bloqueado: ${blocked}h
- Categoria principal: ${topCategory ? `${topCategory[0]} (${topCategory[1]}h)` : "N/A"}
- Entradas tardias: ${lateEntries} de ${totalHours} (${totalHours > 0 ? Math.round((lateEntries / totalHours) * 100) : 0}%)
- Con evidencia: ${withProof} de ${totalHours} (${totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0}%)
- Cierres diarios: ${userCloseouts.length}
- Trust Score promedio: ${avgTrust} | Tendencia: ${trustTrend > 0 ? "+" : ""}${trustTrend}
- Peor dia: ${worstDay ? `${worstDay[0]} con solo ${worstDay[1]}h` : "N/A"}
- Flags: ${topFlags.length > 0 ? topFlags.map(([t, c]) => `${t}(${c})`).join(", ") : "ninguna"}
- Mood promedio: ${avgMood}/5
`;
  }

  // Generate all obituaries in a single Claude call
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `Eres un escritor de obituarios satiricos para una plataforma de transparencia laboral. Escribes con humor negro y sarcasmo, pero sin ser cruel ni ofensivo. Tu estilo es dramatico, como un obituario real de periodico pero aplicado a la productividad laboral.

DATOS DE LOS MIEMBROS DEL EQUIPO (ultimos 30 dias):
${fullDataBlock}

INSTRUCCIONES:
- Escribe un obituario satirico para CADA miembro del equipo.
- Cada obituario debe empezar con "Aqui yace..." seguido de algo relacionado con su productividad.
- Cada obituario debe tener 3-5 oraciones.
- Incluye datos especificos de sus metricas (su peor dia, su trust score, su categoria dominante, sus flags).
- El tono es de humor negro pero no cruel. Piensa en un roast comedico, no en bullying.
- Menciona patrones reales: si alguien registra tarde, si alguien vive en reuniones, si alguien no pone evidencia.
- Usa espanol mexicano coloquial con dramatismo de novela.
- NO uses emojis en los textos.

FORMATO DE RESPUESTA (JSON):
[
  {
    "name": "Nombre de la persona",
    "obituary": "Aqui yace..."
  }
]

Responde SOLO con el array JSON, sin markdown, sin backticks, sin texto adicional.`,
        },
      ],
    });

    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";

    let parsed: { name: string; obituary: string }[];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      return NextResponse.json(
        { error: "Error al parsear respuesta de Claude", raw: responseText },
        { status: 500 }
      );
    }

    // Store obituaries in database
    const obituaries: { user_id: string; name: string; content: string; month: string }[] = [];
    for (const item of parsed) {
      // Find user_id by name match
      let targetUserId: string | null = null;
      for (const [uid, name] of memberMap) {
        if (name.toLowerCase() === item.name.toLowerCase() || name.includes(item.name) || item.name.includes(name)) {
          targetUserId = uid;
          break;
        }
      }

      if (!targetUserId) continue;

      // Check if obituary already exists for this month
      const { data: existing } = await supabase
        .from("monthly_obituaries")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("org_id", orgId)
        .eq("month", currentMonth)
        .single();

      if (existing) {
        // Update existing
        await supabase
          .from("monthly_obituaries")
          .update({
            content: item.obituary,
            ai_generated: true,
          })
          .eq("id", existing.id);
      } else {
        // Insert new
        await supabase.from("monthly_obituaries").insert({
          user_id: targetUserId,
          org_id: orgId,
          month: currentMonth,
          content: item.obituary,
          ai_generated: true,
        });
      }

      obituaries.push({
        user_id: targetUserId,
        name: item.name,
        content: item.obituary,
        month: currentMonth,
      });
    }

    return NextResponse.json({ success: true, obituaries, month: currentMonth });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: "Error al generar obituarios", details: message },
      { status: 500 }
    );
  }
}
