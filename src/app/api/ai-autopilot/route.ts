import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/ai-autopilot?org_id=xxx
//
// THE AI AUTOPILOT: Claude doesn't just analyze — it MANAGES.
// This endpoint runs every hour and Claude DECIDES what actions to take:
// - Send nudges to specific people
// - Create accountability flags
// - Trigger spot checks
// - Send emails
// - Update trust scores
// - Generate warnings
// - Schedule 1:1s
//
// Claude sees everything and makes decisions autonomously.
// The humans just see the results.

export async function POST(request: Request) {
  // Auth: cron secret (this route is called from /api/cron/hourly)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const today = new Date().toISOString().split("T")[0];
  const currentHour = new Date().getHours();

  // Gather current state
  const [
    { data: members },
    { data: todayEntries },
    { data: liveStatus },
    { data: standups },
    { data: promises },
    { data: streaks },
    { data: recentFlags },
    { data: weeklySummaries },
  ] = await Promise.all([
    supabase.from("org_members").select("user_id, role, profiles(full_name, email)").eq("org_id", orgId),
    supabase.from("time_entries").select("user_id, hour, category, proof_urls, is_late, title").eq("org_id", orgId).eq("date", today),
    supabase.from("live_status").select("user_id, status, current_task, last_heartbeat").eq("org_id", orgId),
    supabase.from("standups").select("user_id").eq("org_id", orgId).eq("date", today),
    supabase.from("daily_promises").select("user_id, title, status").eq("org_id", orgId).eq("date", today),
    supabase.from("activity_streaks").select("user_id, current_streak").eq("org_id", orgId),
    supabase.from("accountability_flags").select("user_id, flag_type, date").eq("org_id", orgId).eq("date", today).eq("resolved", false),
    supabase.from("weekly_summaries").select("user_id, ai_narrative, week_start").eq("org_id", orgId).order("week_start", { ascending: false }).limit(25),
  ]);

  // Build state for Claude
  let state = `HORA ACTUAL: ${currentHour}:00 (Monterrey, México)\nFECHA: ${today}\n\n`;

  const standupSet = new Set(standups?.map((s) => s.user_id) ?? []);
  const streakMap = new Map((streaks ?? []).map((s) => [s.user_id, s.current_streak]));
  const liveMap = new Map((liveStatus ?? []).map((l) => [l.user_id, l]));

  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string; email: string } | null;
    const name = p?.full_name ?? "?";
    const email = p?.email ?? "?";
    const userEntries = (todayEntries ?? []).filter((e) => e.user_id === m.user_id);
    const live = liveMap.get(m.user_id);
    const streak = streakMap.get(m.user_id) ?? 0;
    const userPromises = (promises ?? []).filter((pr) => pr.user_id === m.user_id);
    const userFlags = (recentFlags ?? []).filter((f) => f.user_id === m.user_id);
    const userSummaries = (weeklySummaries ?? []).filter((ws) => ws.user_id === m.user_id);

    state += `=== ${name} (${email}) ===\n`;
    state += `Estado: ${live?.status ?? "offline"} ${live?.current_task ? `— "${live.current_task}"` : ""}\n`;
    state += `Hoy: ${userEntries.length}h registradas\n`;
    state += `Standup: ${standupSet.has(m.user_id) ? "sí" : "NO"}\n`;
    state += `Racha: ${streak} días\n`;
    state += `Promesas: ${userPromises.map((pr) => `"${pr.title}"→${pr.status}`).join(", ") || "ninguna"}\n`;
    state += `Flags hoy: ${userFlags.map((f) => f.flag_type).join(", ") || "ninguna"}\n`;

    if (userEntries.length > 0) {
      const proof = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
      const deepWork = userEntries.filter((e) => e.category === "deep_work").length;
      state += `Detalle: deep_work=${deepWork}, proof=${proof}/${userEntries.length}\n`;
    }

    // Last week summary
    const lastSummary = userSummaries[0];
    if (lastSummary) {
      state += `Semana pasada: ${(lastSummary.ai_narrative ?? "").slice(0, 200)}\n`;
    }
    state += "\n";
  }

  // Ask Claude to DECIDE what to do
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `Eres el AI Manager de Exoma. Son las ${currentHour}:00 en Monterrey, México. Tu trabajo es GESTIONAR al equipo proactivamente. No esperes a que te pregunten — ACTÚA.

ESTADO ACTUAL DEL EQUIPO:
${state}

Basándote en el estado actual, DECIDE qué acciones tomar AHORA MISMO.

ACCIONES DISPONIBLES:
1. "send_notification" — Mandar notificación a alguien (aparece en la app)
2. "create_flag" — Crear un flag de accountability
3. "send_email" — Enviar email a alguien
4. "update_trust" — Ajustar trust score de alguien
5. "create_insight" — Generar un insight para el equipo

REGLAS:
- Si son antes de las 10am y alguien no ha hecho standup, empújalo
- Si es después de las 12pm y alguien tiene 0 horas, escala
- Si alguien está "online" pero sin horas por >2h, es sospechoso
- Si alguien rompió promesas ayer y no ha hecho standup hoy, preocúpate
- Si alguien tiene racha de 0, necesita atención especial
- Sé agresivo pero justo. No micro-manages al que va bien.

Responde SOLO JSON válido:
{
  "situation_assessment": "1-2 oraciones sobre el estado actual del equipo",
  "actions": [
    {
      "type": "send_notification|create_flag|send_email|update_trust|create_insight",
      "target_user": "nombre o 'team'",
      "target_email": "email si aplica",
      "message": "el mensaje/contenido",
      "urgency": "low|medium|high|critical",
      "reason": "por qué tomaste esta decisión"
    }
  ],
  "no_action_needed": ["nombres de personas que van bien y no necesitan intervención"],
  "watch_list": ["nombres de personas que necesitan monitoreo cercano"],
  "next_check_recommendation": "en cuántas horas debería correr de nuevo"
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

  // EXECUTE Claude's decisions
  const executed: string[] = [];

  for (const action of parsed.actions ?? []) {
    try {
      if (action.type === "send_notification") {
        // Find user by name
        const targetMember = (members ?? []).find((m) => {
          const p = m.profiles as unknown as { full_name: string } | null;
          return p?.full_name?.toLowerCase().includes(action.target_user?.toLowerCase() ?? "");
        });
        if (targetMember) {
          await supabase.from("notifications").insert({
            user_id: targetMember.user_id,
            org_id: orgId,
            type: "flag_raised",
            title: "AI Manager",
            body: action.message,
          });
          executed.push(`Notification → ${action.target_user}: ${action.message}`);
        }
      }

      if (action.type === "create_flag") {
        const targetMember = (members ?? []).find((m) => {
          const p = m.profiles as unknown as { full_name: string } | null;
          return p?.full_name?.toLowerCase().includes(action.target_user?.toLowerCase() ?? "");
        });
        if (targetMember) {
          await supabase.from("accountability_flags").insert({
            user_id: targetMember.user_id,
            org_id: orgId,
            flag_type: "suspicious_pattern",
            date: today,
            details: `[AI Autopilot] ${action.message}`,
          });
          executed.push(`Flag → ${action.target_user}: ${action.message}`);
        }
      }

      if (action.type === "create_insight") {
        await supabase.from("ai_reviews").insert({
          org_id: orgId,
          date: today,
          review_type: "daily_team",
          findings: { type: "autopilot_insight", ...action },
          summary: action.message,
        });
        executed.push(`Insight: ${action.message}`);
      }
    } catch (e) {
      executed.push(`FAILED: ${action.type} → ${(e as Error).message}`);
    }
  }

  // Log autopilot run
  await supabase.from("audit_log").insert({
    org_id: orgId,
    user_id: (members ?? [])[0]?.user_id ?? "00000000-0000-0000-0000-000000000000",
    action: "entry_created",
    target_type: "ai_autopilot",
    new_data: {
      hour: currentHour,
      assessment: parsed.situation_assessment,
      actions_decided: parsed.actions?.length ?? 0,
      actions_executed: executed.length,
      watch_list: parsed.watch_list,
    },
  });

  return NextResponse.json({
    hour: currentHour,
    assessment: parsed.situation_assessment,
    actions_executed: executed,
    watch_list: parsed.watch_list,
    no_action_needed: parsed.no_action_needed,
    next_check: parsed.next_check_recommendation,
  });
}
