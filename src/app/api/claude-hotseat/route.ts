import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkAIRateLimit } from "@/lib/ai-rate-limit";

// POST /api/claude-hotseat?org_id=xxx&user_id=xxx
// THE HOT SEAT: Deep-dive audit of ONE specific person.
// Claude reads EVERYTHING about this person and gives the most thorough,
// uncomfortable, honest analysis possible. Like a performance review from hell.

export async function POST(request: Request) {
  // AI rate limiting
  const rateLimitResponse = await checkAIRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;
  // Auth: verify the requesting user is authenticated and a member of the org
  const authSupabase = await createServerClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const targetUserId = searchParams.get("user_id");
  if (!orgId || !targetUserId) return NextResponse.json({ error: "org_id and user_id required" }, { status: 400 });

  // Verify caller is a member of this org
  const { data: membership } = await authSupabase
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];

  const [
    { data: profile },
    { data: entries },
    { data: closeouts },
    { data: standups },
    { data: promises },
    { data: shoutoutsReceived },
    { data: shoutoutsGiven },
    { data: githubEvents },
    { data: reactions },
    { data: streak },
    { data: teamEntries },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", targetUserId).single(),
    supabase.from("time_entries").select("*").eq("user_id", targetUserId).eq("org_id", orgId).gte("date", startDate).order("date").order("hour"),
    supabase.from("daily_closeouts").select("*").eq("user_id", targetUserId).eq("org_id", orgId).gte("date", startDate),
    supabase.from("standups").select("*").eq("user_id", targetUserId).eq("org_id", orgId).gte("date", startDate),
    supabase.from("daily_promises").select("*").eq("user_id", targetUserId).eq("org_id", orgId).gte("date", startDate),
    supabase.from("shoutouts").select("*, from_profiles:profiles!shoutouts_from_user_id_fkey(full_name)").eq("to_user_id", targetUserId).eq("org_id", orgId).gte("date", startDate),
    supabase.from("shoutouts").select("*").eq("from_user_id", targetUserId).eq("org_id", orgId).gte("date", startDate),
    supabase.from("github_events").select("*").eq("user_id", targetUserId).eq("org_id", orgId).gte("date", startDate),
    supabase.from("entry_reactions").select("entry_id, reaction, user_id"),
    supabase.from("activity_streaks").select("*").eq("user_id", targetUserId).eq("org_id", orgId).single(),
    supabase.from("time_entries").select("user_id, date, category, proof_urls").eq("org_id", orgId).gte("date", startDate),
  ]);

  const name = (profile as { full_name: string } | null)?.full_name ?? "?";
  const role = (profile as { role: string } | null)?.role ?? "?";

  // Build massive context
  let ctx = `PERSONA EN EL HOT SEAT: ${name}\n\n`;

  // Entry stats
  const totalEntries = entries?.length ?? 0;
  const withProof = entries?.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length ?? 0;
  const lateEntries = entries?.filter((e) => e.is_late).length ?? 0;
  const deepWork = entries?.filter((e) => e.category === "deep_work").length ?? 0;
  const meetings = entries?.filter((e) => e.category === "meeting").length ?? 0;
  const blocked = entries?.filter((e) => e.category === "blocked").length ?? 0;
  const uniqueDates = new Set(entries?.map((e) => e.date) ?? []);

  ctx += `ESTADÍSTICAS (últimos 30 días):\n`;
  ctx += `- Total horas: ${totalEntries}\n`;
  ctx += `- Días activos: ${uniqueDates.size}/22 laborales\n`;
  ctx += `- Promedio horas/día: ${uniqueDates.size > 0 ? (totalEntries / uniqueDates.size).toFixed(1) : 0}\n`;
  ctx += `- Deep work: ${deepWork}h (${totalEntries > 0 ? Math.round(deepWork / totalEntries * 100) : 0}%)\n`;
  ctx += `- Reuniones: ${meetings}h (${totalEntries > 0 ? Math.round(meetings / totalEntries * 100) : 0}%)\n`;
  ctx += `- Bloqueado: ${blocked}h\n`;
  ctx += `- Con evidencia: ${withProof}/${totalEntries} (${totalEntries > 0 ? Math.round(withProof / totalEntries * 100) : 0}%)\n`;
  ctx += `- Entradas tardías: ${lateEntries} (${totalEntries > 0 ? Math.round(lateEntries / totalEntries * 100) : 0}%)\n`;
  ctx += `- Standups hechos: ${standups?.length ?? 0}\n`;
  ctx += `- Closeouts hechos: ${closeouts?.length ?? 0}\n`;
  ctx += `- Racha actual: ${(streak as { current_streak: number } | null)?.current_streak ?? 0} días\n`;
  ctx += `- GitHub eventos: ${githubEvents?.length ?? 0}\n`;

  // Promises
  const promisesKept = promises?.filter((p) => p.status === "delivered").length ?? 0;
  const promisesBroken = promises?.filter((p) => p.status === "broken").length ?? 0;
  ctx += `- Promesas cumplidas: ${promisesKept}, rotas: ${promisesBroken}\n`;

  // Shoutouts
  ctx += `- Shoutouts recibidos: ${shoutoutsReceived?.length ?? 0}\n`;
  ctx += `- Shoutouts dados: ${shoutoutsGiven?.length ?? 0}\n`;

  // Suspicious reactions
  const entryIds = new Set(entries?.map((e) => e.id) ?? []);
  const suspicious = (reactions ?? []).filter((r) => r.reaction === "suspicious" && entryIds.has(r.entry_id));
  ctx += `- Entradas marcadas sospechosas: ${suspicious.length}\n`;

  // Day by day breakdown (last 10 days)
  ctx += `\nDÍA POR DÍA (últimos 10 días):\n`;
  const byDate = new Map<string, typeof entries>();
  for (const e of entries ?? []) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }

  const dateEntries = Array.from(byDate.entries()).slice(-10);
  for (const [date, dayEntries] of dateEntries) {
    if (!dayEntries) continue;
    const cats = dayEntries.map((e) => e.category).join(", ");
    const proofs = dayEntries.filter((e) => e.proof_urls?.length > 0).length;
    const titles = dayEntries.map((e) => `"${e.title}"`).join("; ");
    ctx += `  ${date}: ${dayEntries.length}h [${cats}] proof=${proofs} titles=${titles}\n`;
  }

  // Compare to team averages
  const teamByUser = new Map<string, number>();
  for (const e of teamEntries ?? []) {
    teamByUser.set(e.user_id, (teamByUser.get(e.user_id) ?? 0) + 1);
  }
  const teamAvgHours = teamByUser.size > 0
    ? Math.round(Array.from(teamByUser.values()).reduce((a, b) => a + b, 0) / teamByUser.size)
    : 0;

  ctx += `\nCOMPARACIÓN CON EQUIPO:\n`;
  ctx += `- Promedio del equipo: ${teamAvgHours}h en 30 días\n`;
  ctx += `- Esta persona: ${totalEntries}h (${totalEntries > teamAvgHours ? "arriba" : "abajo"} del promedio)\n`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    messages: [{
      role: "user",
      content: `Eres un consultor de rendimiento sin filtros. ${name} está en el HOT SEAT — una auditoría profunda de su trabajo en los últimos 30 días.

${ctx}

Haz el análisis MÁS PROFUNDO y HONESTO posible. Si esta persona se ha estado haciendo pendejo, DILO. Si ha sido excepcional, reconócelo. No suavices NADA.

Analiza:
1. ¿Está persona realmente produce o solo ocupa una silla?
2. ¿Sus horas de "deep work" tienen output real (GitHub, evidencia)?
3. ¿Cumple lo que promete?
4. ¿El equipo lo valora (shoutouts) o lo marca como sospechoso?
5. ¿Tiene tendencia a mejorar o a empeorar?
6. ¿Se esconde en reuniones para no producir?
7. ¿Backfillea entradas o registra a tiempo?
8. Si la empresa tuviera que reducir personal, ¿esta persona sobreviviría al corte? ¿Por qué sí o no?

Responde SOLO JSON:
{
  "name": "${name}",
  "overall_grade": "A/B/C/D/F",
  "overall_score": 0-100,
  "one_line_verdict": "1 oración demoledora o elogiosa sin filtro",
  "detailed_analysis": "3-5 párrafos de análisis profundo. Sé específico con datos. Menciona días concretos, patrones, inconsistencias.",
  "se_hizo_pendejo": true/false,
  "biggest_strength": "lo mejor de esta persona con evidencia",
  "biggest_weakness": "lo peor de esta persona con evidencia",
  "patterns": ["patrones de comportamiento detectados"],
  "red_flags": ["problemas serios con datos específicos"],
  "inconsistencies": ["contradicciones encontradas"],
  "survivability": "si hubiera recorte de personal, ¿sobreviviría? Sí/No y por qué",
  "roi_assessment": "¿El valor que genera justifica su salario? Análisis honesto.",
  "trajectory": "improving/stable/declining — con evidencia",
  "peer_perception": "cómo lo percibe el equipo basado en shoutouts y reacciones",
  "coaching_plan": ["3-5 acciones específicas y medibles para mejorar en los próximos 7 días"],
  "what_to_stop": ["cosas que debe DEJAR de hacer"],
  "what_to_start": ["cosas que debe EMPEZAR a hacer"],
  "prediction_next_week": "predicción de cómo le irá la próxima semana basado en tendencias",
  "hard_truth": "la verdad que nadie le dice pero necesita escuchar"
}`,
    }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch { parsed = null; }

  if (!parsed) return NextResponse.json({ error: "Parse failed", raw: text }, { status: 500 });

  return NextResponse.json({ user_id: targetUserId, model: "claude-sonnet-4-6", ...parsed });
}
