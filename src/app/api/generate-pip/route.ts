import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { format, subDays } from "date-fns";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Membership + admin check
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sin organizacion" }, { status: 403 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      { error: "Solo administradores pueden generar PIPs" },
      { status: 403 }
    );
  }

  const orgId = membership.org_id;
  const body = await request.json();
  const targetUserId: string | undefined = body.targetUserId;

  if (!targetUserId) {
    return NextResponse.json(
      { error: "targetUserId requerido" },
      { status: 400 }
    );
  }

  // Verify target is in the same org
  const { data: targetMembership } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", targetUserId)
    .single();

  if (!targetMembership) {
    return NextResponse.json(
      { error: "Usuario no pertenece a la organizacion" },
      { status: 404 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "API key no configurada" },
      { status: 500 }
    );
  }

  const today = new Date();
  const fourteenDaysAgo = format(subDays(today, 14), "yyyy-MM-dd");
  const todayStr = format(today, "yyyy-MM-dd");

  // Query the target user's data for the last 14 days
  const [
    { data: profile },
    { data: entries },
    { data: trustHistory },
    { data: closeouts },
    { data: standups },
    { data: promises },
    { data: reactions },
    { data: flags },
    { data: orgSettings },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", targetUserId)
      .single(),
    supabase
      .from("time_entries")
      .select("date, hour, category, proof_urls, title, is_late")
      .eq("org_id", orgId)
      .eq("user_id", targetUserId)
      .gte("date", fourteenDaysAgo)
      .lte("date", todayStr)
      .is("deleted_at", null)
      .order("date", { ascending: true }),
    supabase
      .from("trust_score_history")
      .select("date, score")
      .eq("org_id", orgId)
      .eq("user_id", targetUserId)
      .gte("date", fourteenDaysAgo)
      .lte("date", todayStr)
      .order("date", { ascending: true }),
    supabase
      .from("daily_closeouts")
      .select("date")
      .eq("org_id", orgId)
      .eq("user_id", targetUserId)
      .gte("date", fourteenDaysAgo)
      .lte("date", todayStr),
    supabase
      .from("standups")
      .select("date")
      .eq("org_id", orgId)
      .eq("user_id", targetUserId)
      .gte("date", fourteenDaysAgo)
      .lte("date", todayStr),
    supabase
      .from("daily_promises")
      .select("title, status, date")
      .eq("org_id", orgId)
      .eq("user_id", targetUserId)
      .gte("date", fourteenDaysAgo)
      .lte("date", todayStr),
    supabase
      .from("entry_reactions")
      .select("reaction, time_entries!inner(user_id, org_id, date)")
      .eq("time_entries.org_id", orgId)
      .eq("time_entries.user_id", targetUserId)
      .gte("time_entries.date", fourteenDaysAgo)
      .lte("time_entries.date", todayStr),
    supabase
      .from("accountability_flags")
      .select("flag_type, date, details, resolved")
      .eq("org_id", orgId)
      .eq("user_id", targetUserId)
      .gte("date", fourteenDaysAgo)
      .lte("date", todayStr)
      .order("date", { ascending: false }),
    supabase
      .from("org_settings")
      .select("expected_daily_hours")
      .eq("org_id", orgId)
      .single(),
  ]);

  const name = profile?.full_name ?? "Desconocido";
  const expectedDaily = orgSettings?.expected_daily_hours ?? 8;

  // Build data summary
  const totalHours = entries?.length ?? 0;
  const hoursWithProof = (entries ?? []).filter(
    (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
  ).length;
  const lateEntries = (entries ?? []).filter((e) => e.is_late).length;
  const proofRate = totalHours > 0 ? Math.round((hoursWithProof / totalHours) * 100) : 0;

  const avgTrust =
    (trustHistory ?? []).length > 0
      ? Math.round(
          (trustHistory ?? []).reduce((sum, t) => sum + t.score, 0) /
            (trustHistory ?? []).length
        )
      : 0;
  const trustTrend = (trustHistory ?? []).map((t) => `${t.date}: ${t.score}`).join(", ");

  const closeoutCount = closeouts?.length ?? 0;
  const standupCount = standups?.length ?? 0;

  const totalPromises = promises?.length ?? 0;
  const deliveredPromises = (promises ?? []).filter(
    (p) => p.status === "delivered"
  ).length;
  const brokenPromises = (promises ?? []).filter(
    (p) => p.status === "broken"
  ).length;

  const suspiciousReactions = (reactions ?? []).filter(
    (r) => r.reaction === "suspicious"
  ).length;
  const impressiveReactions = (reactions ?? []).filter(
    (r) => r.reaction === "impressive"
  ).length;

  const unresolvedFlags = (flags ?? []).filter((f) => !f.resolved);
  const flagSummary = unresolvedFlags
    .map((f) => `${f.flag_type} (${f.date}): ${f.details ?? "sin detalle"}`)
    .join("\n");

  // Category breakdown
  const categoryHours: Record<string, number> = {};
  for (const e of entries ?? []) {
    categoryHours[e.category] = (categoryHours[e.category] ?? 0) + 1;
  }
  const categoryBreakdown = Object.entries(categoryHours)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, hrs]) => `${cat}: ${hrs}h`)
    .join(", ");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Genera un Performance Improvement Plan (PIP) formal y brutal para el siguiente empleado. El PIP es PUBLICO — todo el equipo lo vera.

EMPLEADO: ${name}
PERIODO EVALUADO: Ultimos 14 dias (${fourteenDaysAgo} a ${todayStr})
HORAS ESPERADAS: ${expectedDaily * 10} horas en 14 dias (${expectedDaily}h/dia laboral)

═══ DATOS ═══
Horas registradas: ${totalHours}h (${Math.round((totalHours / (expectedDaily * 10)) * 100)}% del esperado)
Horas con evidencia: ${hoursWithProof}h (${proofRate}% proof rate)
Entradas tardias: ${lateEntries}
Trust Score promedio: ${avgTrust}/100
Tendencia trust: ${trustTrend}
Standups completados: ${standupCount}/10
Cierres de dia: ${closeoutCount}/10
Promesas: ${deliveredPromises} cumplidas, ${brokenPromises} rotas de ${totalPromises} total
Reacciones: ${impressiveReactions} impressive, ${suspiciousReactions} suspicious
Distribucion por categoria: ${categoryBreakdown || "sin datos"}
Flags sin resolver: ${unresolvedFlags.length}
${flagSummary ? `Detalle flags:\n${flagSummary}` : ""}

═══ INSTRUCCIONES ═══
Escribe el PIP en espanol corporativo formal pero BRUTAL. Sin eufemismos. El empleado debe sentir la gravedad de la situacion.

Formato:
1. RESUMEN EJECUTIVO — 2 oraciones demoledoras sobre el rendimiento
2. DEFICIENCIAS CRITICAS — lista de 3-5 deficiencias especificas con numeros concretos
3. OBJETIVOS OBLIGATORIOS — 3-5 objetivos SMART con metricas exactas que debe cumplir
4. PLAZO — 7 dias calendario a partir de hoy (${todayStr})
5. CONSECUENCIAS — que pasa si no se cumplen los objetivos

Reglas:
- Usa NUMEROS CONCRETOS de los datos, no generalidades
- Cada objetivo debe ser medible automaticamente por el sistema
- El tono es Amazon-style: profesional pero sin piedad
- Mencion el nombre completo del empleado
- No uses emojis
- Maximo 500 palabras`,
      },
    ],
  });

  const pipText =
    message.content[0].type === "text" ? message.content[0].text : "";

  if (!pipText) {
    return NextResponse.json(
      { error: "No se pudo generar el PIP" },
      { status: 500 }
    );
  }

  // Save to public_feed as warning with critical urgency
  await supabase.from("public_feed").insert({
    org_id: orgId,
    type: "warning",
    title: `PIP: ${name} — Performance Improvement Plan`,
    body: pipText,
    target_user_id: targetUserId,
    urgency: "critical",
    emoji: null,
    is_ai_generated: true,
  });

  return NextResponse.json({
    success: true,
    pip: pipText,
    target: name,
  });
}
