import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkAIRateLimit } from "@/lib/ai-rate-limit";

// POST /api/productivity-autopsy
//
// When someone has a bad day (< 4 hours logged or trust score < 50),
// Claude performs a detailed PUBLIC AUTOPSY: what went wrong hour by hour,
// where time was lost, what patterns repeat, compared against their best days.

export async function POST(request: Request) {
  // AI rate limiting
  const rateLimitResponse = await checkAIRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  // Auth: verify user is logged in
  const serverClient = await createServerSupabase();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { org_id, target_user_id, date } = await request.json();

  if (!org_id || !target_user_id || !date) {
    return NextResponse.json(
      { error: "org_id, target_user_id, y date son requeridos" },
      { status: 400 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set" },
      { status: 500 },
    );
  }

  // Verify requester membership
  const { data: membership } = await serverClient
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .eq("org_id", org_id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sin organizacion" }, { status: 403 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Service-role client for data queries (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get target user's name
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", target_user_id)
    .single();

  const targetName = targetProfile?.full_name ?? "Usuario";

  // Get target's entries for the bad day
  const { data: badDayEntries } = await supabase
    .from("time_entries")
    .select("*")
    .eq("user_id", target_user_id)
    .eq("org_id", org_id)
    .eq("date", date)
    .order("hour");

  // Get target's trust score for the date
  const { data: trustScore } = await supabase
    .from("trust_score_history")
    .select("score, hours_logged, hours_with_proof, late_entries, has_closeout")
    .eq("user_id", target_user_id)
    .eq("org_id", org_id)
    .eq("date", date)
    .single();

  // Get target's best day in the last 30 days (most hours logged)
  const thirtyDaysAgo = new Date(date + "T12:00:00");
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

  const { data: allRecentEntries } = await supabase
    .from("time_entries")
    .select("*")
    .eq("user_id", target_user_id)
    .eq("org_id", org_id)
    .gte("date", thirtyDaysAgoStr)
    .lte("date", date)
    .order("date")
    .order("hour");

  // Calculate best day and average
  const dayMap = new Map<string, typeof allRecentEntries>();
  for (const entry of allRecentEntries ?? []) {
    const d = entry.date as string;
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d)!.push(entry);
  }

  let bestDay = { date: "N/A", hours: 0, entries: [] as typeof allRecentEntries };
  let totalHoursAllDays = 0;
  let daysWithEntries = 0;

  for (const [d, entries] of dayMap) {
    const hours = entries?.length ?? 0;
    totalHoursAllDays += hours;
    daysWithEntries++;
    if (hours > bestDay.hours) {
      bestDay = { date: d, hours, entries };
    }
  }

  const avgHours = daysWithEntries > 0 ? (totalHoursAllDays / daysWithEntries).toFixed(1) : "0";

  // Get recent flags for pattern detection
  const { data: recentFlags } = await supabase
    .from("accountability_flags")
    .select("flag_type, date, details")
    .eq("user_id", target_user_id)
    .eq("org_id", org_id)
    .gte("date", thirtyDaysAgoStr)
    .order("date", { ascending: false })
    .limit(20);

  // Get closeout for the bad day
  const { data: closeout } = await supabase
    .from("daily_closeouts")
    .select("summary, blockers")
    .eq("user_id", target_user_id)
    .eq("org_id", org_id)
    .eq("date", date)
    .single();

  // Build data for Claude
  let badDayBlock = `=== DIA MALO: ${date} ===\n`;
  badDayBlock += `Horas registradas: ${badDayEntries?.length ?? 0}\n`;
  badDayBlock += `Trust Score: ${trustScore?.score ?? "sin datos"}\n`;

  if (badDayEntries && badDayEntries.length > 0) {
    badDayBlock += "Entradas:\n";
    for (const e of badDayEntries) {
      const late = e.is_late ? ` [TARDIA ${e.minutes_late}min]` : "";
      const proof =
        e.proof_urls && (e.proof_urls as string[]).length > 0
          ? " [CON EVIDENCIA]"
          : " [SIN EVIDENCIA]";
      badDayBlock += `  ${e.hour}:00 | ${e.category} | "${e.title}"${late}${proof}\n`;
      if (e.description) badDayBlock += `    Desc: "${e.description}"\n`;
    }
  } else {
    badDayBlock += "Entradas: CERO HORAS REGISTRADAS\n";
  }

  if (closeout) {
    badDayBlock += `Cierre del dia: "${closeout.summary}"\n`;
    if (closeout.blockers) badDayBlock += `Blockers: "${closeout.blockers}"\n`;
  } else {
    badDayBlock += "Cierre del dia: NO HIZO\n";
  }

  let bestDayBlock = `\n=== MEJOR DIA (referencia): ${bestDay.date} ===\n`;
  bestDayBlock += `Horas registradas: ${bestDay.hours}\n`;
  if (bestDay.entries && bestDay.entries.length > 0) {
    bestDayBlock += "Entradas:\n";
    for (const e of bestDay.entries) {
      bestDayBlock += `  ${e.hour}:00 | ${e.category} | "${e.title}"\n`;
    }
  }

  let flagsBlock = "";
  if (recentFlags && recentFlags.length > 0) {
    flagsBlock = "\n=== FLAGS RECIENTES (30 dias) ===\n";
    for (const f of recentFlags) {
      flagsBlock += `  ${f.date} | ${f.flag_type} | ${f.details ?? ""}\n`;
    }
  }

  // Count bad days in last 30 days for pattern
  const badDaysCount = Array.from(dayMap.values()).filter((entries) => (entries?.length ?? 0) < 4).length;
  const missingDays = 30 - daysWithEntries;

  const statsBlock = `\n=== ESTADISTICAS 30 DIAS ===\n`
    + `Promedio diario: ${avgHours} horas\n`
    + `Dias con < 4 horas: ${badDaysCount}\n`
    + `Dias sin registrar nada: ${missingDays}\n`
    + `Total dias con entradas: ${daysWithEntries}\n`;

  // Call Claude
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Eres un patologo forense de productividad. Realizas AUTOPSIAS detalladas cuando alguien tiene un dia malo en el trabajo. Tu tono es clinico, directo, sin empatia excesiva. Como un medico forense que examina un cadaver: objetivo, preciso, sin juzgar pero sin esconder nada.

PERSONA: ${targetName}
PROMEDIO DIARIO: ${avgHours} horas

${badDayBlock}
${bestDayBlock}
${statsBlock}
${flagsBlock}

REALIZA LA AUTOPSIA. Analiza:

1. **Hora por hora**: Que paso en cada hora del dia laboral (7am-6pm). Donde hay huecos? Que horas estan vacias?
2. **Causa de muerte**: Que mato la productividad? Fue falta de foco, exceso de reuniones, procrastinacion, bloqueos, o simplemente no se presento?
3. **Comparacion con su mejor dia**: Como se ve este dia comparado con su mejor dia? Que falta? Que es diferente?
4. **Patron recurrente**: Esto se repite? Hay un patron en sus dias malos? Siempre es el mismo dia de la semana? Siempre es la misma causa?
5. **Tiempo perdido**: Cuantas horas productivas se perdieron? Estimado en dinero ($50/hr).
6. **Veredicto final**: En 2-3 oraciones, que paso realmente y que deberia cambiar.

RESPONDE EN ESTE FORMATO JSON EXACTO:
{
  "persona": "${targetName}",
  "fecha": "${date}",
  "horas_registradas": numero,
  "horas_esperadas": 8,
  "hora_por_hora": [
    { "hora": 7, "status": "vacia|registrada|parcial", "detalle": "que hizo o 'sin registro'" },
    { "hora": 8, "status": "...", "detalle": "..." }
  ],
  "causa_de_muerte": "parrafo explicando la causa principal de muerte de la productividad",
  "factores_contribuyentes": ["factor 1", "factor 2"],
  "comparacion_mejor_dia": {
    "mejor_dia_fecha": "${bestDay.date}",
    "mejor_dia_horas": ${bestDay.hours},
    "diferencias_clave": ["diferencia 1", "diferencia 2", "diferencia 3"],
    "que_falta": "que tuvo el mejor dia que este no tiene"
  },
  "patron_recurrente": {
    "existe": true/false,
    "descripcion": "descripcion del patron si existe o 'No se detecta patron claro'",
    "frecuencia": "cada cuanto pasa esto"
  },
  "tiempo_perdido": {
    "horas": numero,
    "costo_estimado": "$XXX"
  },
  "veredicto": "2-3 oraciones directas y clinicas sobre que paso",
  "recomendacion": "1 accion concreta para evitar que se repita"
}

Responde SOLO con el JSON valido, sin markdown, sin backticks, sin explicacion. Las horas van de 7 a 18 (7am a 6pm).`,
      },
    ],
  });

  // Parse Claude's response
  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";

  let parsed;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return NextResponse.json(
      { error: "Error parseando respuesta de Claude", raw_response: responseText },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    autopsy: parsed,
    model: "claude-sonnet-4-20250514",
  });
}
