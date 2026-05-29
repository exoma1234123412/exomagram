import Anthropic from "@anthropic-ai/sdk";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/time-capsule
// TIME CAPSULE: Every Monday, compares what each person PROMISED last Monday
// vs what they ACTUALLY did during the week. Brutal honesty.

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const orgId = body.org_id;

  if (!orgId) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "No service role key" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Calculate last Monday and this Sunday (the week we're reviewing)
  const daysSinceMonday = (today.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysSinceMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);

  const lastMondayStr = lastMonday.toISOString().split("T")[0];
  const lastSundayStr = lastSunday.toISOString().split("T")[0];

  // Get all org members
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, profiles(full_name)")
    .eq("org_id", orgId);

  if (!members || members.length === 0) {
    return NextResponse.json({ error: "No members found" }, { status: 404 });
  }

  const userIds = members.map((m) => m.user_id);

  // Query all data in parallel
  const [
    { data: promises },
    { data: standups },
    { data: timeEntries },
    { data: insights },
  ] = await Promise.all([
    // Promises from last Monday
    supabase
      .from("daily_promises")
      .select("user_id, title, status, date")
      .eq("org_id", orgId)
      .gte("date", lastMondayStr)
      .lte("date", lastSundayStr)
      .in("user_id", userIds),
    // Standups from last Monday (today_plan = what they planned)
    supabase
      .from("standups")
      .select("user_id, today_plan, date, mood")
      .eq("org_id", orgId)
      .gte("date", lastMondayStr)
      .lte("date", lastSundayStr)
      .in("user_id", userIds),
    // Time entries for the whole week
    supabase
      .from("time_entries")
      .select("user_id, date, hour, category, title, mood, energy")
      .eq("org_id", orgId)
      .gte("date", lastMondayStr)
      .lte("date", lastSundayStr)
      .in("user_id", userIds)
      .order("date"),
    // AI daily insights for the week
    supabase
      .from("ai_daily_insights")
      .select("user_id, date, insight, recommendation")
      .eq("org_id", orgId)
      .gte("date", lastMondayStr)
      .lte("date", lastSundayStr)
      .in("user_id", userIds),
  ]);

  // Build context per person
  const capsules: {
    user_id: string;
    name: string;
    promise_vs_reality: string;
  }[] = [];

  for (const m of members) {
    const profile = m.profiles as unknown as { full_name: string } | null;
    const name = profile?.full_name ?? "Desconocido";
    const uid = m.user_id;

    // Promises
    const userPromises = (promises ?? []).filter((p) => p.user_id === uid);
    const promiseBlock = userPromises.length > 0
      ? userPromises.map((p) => `  - "${p.title}" (${p.date}) => ${p.status}`).join("\n")
      : "  (sin promesas registradas)";

    // Standups (plans)
    const userStandups = (standups ?? []).filter((s) => s.user_id === uid);
    const planBlock = userStandups.length > 0
      ? userStandups.map((s) => `  - ${s.date}: "${s.today_plan}" (mood: ${s.mood ?? "?"})`).join("\n")
      : "  (sin standups)";

    // Time entries summary
    const userEntries = (timeEntries ?? []).filter((e) => e.user_id === uid);
    const totalHours = userEntries.length;
    const byCategory = new Map<string, number>();
    for (const e of userEntries) {
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1);
    }
    const categoryBlock = Array.from(byCategory.entries())
      .map(([cat, hrs]) => `${cat}: ${hrs}h`)
      .join(", ");
    const avgMood = userEntries.filter((e) => e.mood).reduce((sum, e) => sum + (e.mood ?? 0), 0) / (userEntries.filter((e) => e.mood).length || 1);
    const avgEnergy = userEntries.filter((e) => e.energy).reduce((sum, e) => sum + (e.energy ?? 0), 0) / (userEntries.filter((e) => e.energy).length || 1);

    // Insights
    const userInsights = (insights ?? []).filter((i) => i.user_id === uid);
    const insightBlock = userInsights.length > 0
      ? userInsights.map((i) => {
          const grade = (i.insight as Record<string, unknown>)?.grade ?? "?";
          return `  - ${i.date}: grade=${grade}, rec="${i.recommendation ?? "ninguna"}"`;
        }).join("\n")
      : "  (sin insights)";

    const personBlock = `=== ${name} ===
PROMESAS DE LA SEMANA:
${promiseBlock}

PLANES DIARIOS (Standups):
${planBlock}

REALIDAD (Time Entries): ${totalHours}h total
  Desglose: ${categoryBlock || "sin registros"}
  Mood promedio: ${avgMood.toFixed(1)}/5, Energía promedio: ${avgEnergy.toFixed(1)}/5

INSIGHTS AI:
${insightBlock}`;

    // Generate capsule with Claude Haiku
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: `Eres el sistema de Time Capsule de una plataforma de accountability laboral. Tu trabajo es comparar lo que alguien PROMETIÓ hacer la semana pasada vs lo que REALMENTE hizo.

IMPORTANTE: No tienes preconcepción sobre el rol de nadie. Todos son juzgados por igual, sin importar si son CEO, junior, o lo que sea.

Semana analizada: ${lastMondayStr} a ${lastSundayStr}

DATOS DE ${name}:
${personBlock}

Genera un mensaje CORTO (2-3 oraciones máximo) en español latinoamericano comparando promesa vs realidad. Sé directo y honesto pero no cruel. Si cumplió, reconócelo. Si no, señálalo con datos.

Formato: texto plano, sin markdown, sin bullets. Como si fuera un mensaje de WhatsApp de un jefe muy directo.

Ejemplo: "Lunes pasado prometiste: 'Terminar el módulo de pagos'. Realidad: registraste 3h de deep work en pagos y 12h en reuniones. El módulo sigue sin terminar."`,
        },
      ],
    });

    const capsuleText =
      message.content[0].type === "text" ? message.content[0].text : "";

    capsules.push({
      user_id: uid,
      name,
      promise_vs_reality: capsuleText.trim(),
    });

    // Store in public_feed
    await supabase.from("public_feed").insert({
      org_id: orgId,
      type: "ai_announcement",
      title: `Time Capsule de ${name}`,
      body: capsuleText.trim(),
      target_user_id: uid,
      urgency: "normal",
      emoji: "📦",
      is_ai_generated: true,
    });
  }

  return NextResponse.json({
    success: true,
    date: todayStr,
    week_reviewed: { from: lastMondayStr, to: lastSundayStr },
    capsules,
  });
}
