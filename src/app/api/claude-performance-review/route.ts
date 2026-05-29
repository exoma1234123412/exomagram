import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/claude-performance-review
// Generates a COMPLETE performance review document for one person.
// Body: { org_id, user_id, period: "quarter" }

export async function POST(request: Request) {
  const authSupabase = await createServerClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json();
  const { org_id, user_id, period } = body;

  if (!org_id || !user_id)
    return NextResponse.json(
      { error: "org_id and user_id required" },
      { status: 400 }
    );

  const { data: membership } = await authSupabase
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", org_id)
    .single();
  if (!membership)
    return NextResponse.json(
      { error: "No perteneces a esta organización" },
      { status: 403 }
    );

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "No API key" }, { status: 500 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Determine date range based on period
  const now = new Date();
  const daysBack = period === "quarter" ? 90 : 30;
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - daysBack);
  const startStr = startDate.toISOString().split("T")[0];

  const [
    { data: profile },
    { data: entries },
    { data: closeouts },
    { data: standups },
    { data: promises },
    { data: shoutoutsReceived },
    { data: shoutoutsGiven },
    { data: githubEvents },
    { data: streak },
    { data: teamMembers },
    { data: weeklySummaries },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user_id).single(),
    supabase
      .from("time_entries")
      .select("*")
      .eq("user_id", user_id)
      .eq("org_id", org_id)
      .gte("date", startStr)
      .order("date")
      .order("hour"),
    supabase
      .from("daily_closeouts")
      .select("*")
      .eq("user_id", user_id)
      .eq("org_id", org_id)
      .gte("date", startStr),
    supabase
      .from("standups")
      .select("*")
      .eq("user_id", user_id)
      .eq("org_id", org_id)
      .gte("date", startStr),
    supabase
      .from("daily_promises")
      .select("*")
      .eq("user_id", user_id)
      .eq("org_id", org_id)
      .gte("date", startStr),
    supabase
      .from("shoutouts")
      .select(
        "*, from_profiles:profiles!shoutouts_from_user_id_fkey(full_name)"
      )
      .eq("to_user_id", user_id)
      .eq("org_id", org_id)
      .gte("date", startStr),
    supabase
      .from("shoutouts")
      .select("*")
      .eq("from_user_id", user_id)
      .eq("org_id", org_id)
      .gte("date", startStr),
    supabase
      .from("github_events")
      .select("*")
      .eq("user_id", user_id)
      .eq("org_id", org_id)
      .gte("date", startStr),
    supabase
      .from("activity_streaks")
      .select("*")
      .eq("user_id", user_id)
      .eq("org_id", org_id)
      .single(),
    supabase
      .from("org_members")
      .select("user_id, profiles(full_name)")
      .eq("org_id", org_id),
    supabase
      .from("weekly_summaries")
      .select("*")
      .eq("user_id", user_id)
      .eq("org_id", org_id)
      .gte("week_start", startStr)
      .order("week_start"),
  ]);

  // Get reactions on this user's entries
  const entryIds = (entries ?? []).map((e) => e.id);
  let suspiciousCount = 0;
  let verifiedCount = 0;
  if (entryIds.length > 0) {
    const { data: reactions } = await supabase
      .from("entry_reactions")
      .select("reaction")
      .in("entry_id", entryIds);
    for (const r of reactions ?? []) {
      if (r.reaction === "suspicious") suspiciousCount++;
      if (r.reaction === "verified") verifiedCount++;
    }
  }

  const totalHours = (entries ?? []).length;
  const deepWork = (entries ?? []).filter(
    (e) => e.category === "deep_work"
  ).length;
  const meetings = (entries ?? []).filter(
    (e) => e.category === "meeting"
  ).length;
  const blocked = (entries ?? []).filter(
    (e) => e.category === "blocked"
  ).length;
  const withProof = (entries ?? []).filter(
    (e) => e.proof_urls && e.proof_urls.length > 0
  ).length;
  const lateEntries = (entries ?? []).filter((e) => e.is_late).length;
  const uniqueDates = new Set((entries ?? []).map((e) => e.date));
  const keptPromises = (promises ?? []).filter(
    (p) => p.status === "delivered"
  ).length;
  const brokenPromises = (promises ?? []).filter(
    (p) => p.status === "broken"
  ).length;
  const totalPromises = keptPromises + brokenPromises;

  // Weekly summaries for trajectory
  const weeklyNarratives = (weeklySummaries ?? []).map((ws) => {
    const s = ws.summary as Record<string, unknown>;
    return `Semana ${ws.week_start}: ${s.total_hours ?? 0}h, deep_work=${s.deep_work ?? 0}, proof=${s.proof_percent ?? 0}%, late=${s.late_percent ?? 0}%. ${ws.ai_narrative ? ws.ai_narrative.slice(0, 200) : ""}`;
  });

  const dataSummary = `
PERSONA: ${profile?.full_name ?? profile?.email ?? "Desconocido"}
ROL: ${profile?.role ?? "Sin rol"}
PERIODO: Últimos ${daysBack} días (${startStr} a hoy)

MÉTRICAS CLAVE:
- Total de horas registradas: ${totalHours}h en ${uniqueDates.size} días activos (promedio ${(totalHours / Math.max(uniqueDates.size, 1)).toFixed(1)}h/día)
- Deep Work: ${deepWork}h (${totalHours > 0 ? Math.round((deepWork / totalHours) * 100) : 0}%)
- Reuniones: ${meetings}h (${totalHours > 0 ? Math.round((meetings / totalHours) * 100) : 0}%)
- Bloqueado: ${blocked}h
- Evidencia: ${withProof}/${totalHours} (${totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0}%)
- Entradas tardías: ${lateEntries} (${totalHours > 0 ? Math.round((lateEntries / totalHours) * 100) : 0}%)
- Standups completados: ${(standups ?? []).length}
- Closeouts completados: ${(closeouts ?? []).length}

PROMESAS:
- Cumplidas: ${keptPromises}
- Rotas: ${brokenPromises}
- Ratio: ${totalPromises > 0 ? Math.round((keptPromises / totalPromises) * 100) : 0}%

PERCEPCIÓN DEL EQUIPO:
- Shoutouts recibidos: ${(shoutoutsReceived ?? []).length}
${(shoutoutsReceived ?? []).map((s) => `  - ${(s.from_profiles as Record<string, string>)?.full_name ?? "?"}: "${s.message}" (${s.category})`).join("\n")}
- Shoutouts dados: ${(shoutoutsGiven ?? []).length}
- Marcado sospechoso: ${suspiciousCount} veces
- Verificado por pares: ${verifiedCount} veces

GITHUB:
- Eventos en periodo: ${(githubEvents ?? []).length}

RACHA: ${streak?.current_streak ?? 0} días actual, ${streak?.longest_streak ?? 0} días máxima

TRAYECTORIA SEMANAL:
${weeklyNarratives.join("\n")}
`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Genera un documento de evaluación de desempeño COMPLETO para esta persona. Formato profesional tipo HR.

${dataSummary}

Responde en JSON con EXACTAMENTE esta estructura:
{
  "employee_name": "nombre",
  "period": "descripción del periodo",
  "executive_summary": "2 oraciones máximo. Resumen ejecutivo brutal y directo.",
  "key_metrics": {
    "total_hours": N,
    "evidence_percent": N,
    "deep_work_percent": N,
    "consistency_score": N,
    "late_percent": N
  },
  "strengths": [
    { "title": "fortaleza", "evidence": "dato concreto que lo respalde" }
  ],
  "areas_for_improvement": [
    { "title": "área", "evidence": "dato concreto", "recommendation": "acción específica" }
  ],
  "peer_perception": {
    "shoutouts_received": N,
    "suspicious_flags": N,
    "verified_by_peers": N,
    "summary": "1 oración sobre cómo lo ve el equipo"
  },
  "reliability_score": {
    "promises_kept": N,
    "promises_broken": N,
    "ratio_percent": N,
    "verdict": "1 oración"
  },
  "trajectory": {
    "direction": "improving" | "declining" | "stable",
    "evidence": "datos que lo demuestran",
    "risk_level": "low" | "medium" | "high"
  },
  "recommendation": "promote" | "maintain" | "concern" | "warning",
  "recommendation_detail": "explicación de 2 oraciones",
  "goals_next_quarter": [
    { "goal": "meta específica y medible", "metric": "cómo medir", "target": "número objetivo" }
  ]
}

Solo responde con el JSON. Sin texto adicional. Sé brutalmente honesto con los datos.`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch {
    parsed = null;
  }

  return NextResponse.json({
    success: true,
    review: parsed ?? text,
    raw: parsed ? undefined : text,
    model: "claude-sonnet-4-6",
    period: `${daysBack} days`,
  });
}
