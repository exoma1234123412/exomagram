import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET /api/cron/half-hour
//
// CLAUDE SURVEILLANCE — Runs every 30 minutes during work hours.
// Scans ALL data sources for anomalies, out-of-ordinary patterns, and
// anything that needs immediate attention. Claude sends messages to
// EVERYONE — private warnings, public feed, team-wide alerts.
//
// This is the heartbeat of the AI-native platform.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  // Check work hours (Monterrey time)
  const now = new Date();
  const mtyTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: "America/Monterrey",
  }).format(now);
  const [mtyHourStr, mtyMinStr] = mtyTime.split(":");
  const mtyHour = parseInt(mtyHourStr);
  const mtyMin = parseInt(mtyMinStr);

  if (mtyHour < 7 || mtyHour > 19) {
    return NextResponse.json({ skipped: true, reason: "Outside work hours", mtyHour });
  }

  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Monterrey" });
  if (dayOfWeek === "Sat" || dayOfWeek === "Sun") {
    return NextResponse.json({ skipped: true, reason: "Weekend" });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(now);
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(
    new Date(now.getTime() - 86400000),
  );

  // Get all orgs
  const { data: orgs } = await supabase.from("organizations").select("id, name");
  const results: Record<string, unknown> = { time: `${mtyHour}:${mtyMin}` };

  for (const org of orgs ?? []) {
    try {
      const orgResult = await runSurveillance(
        anthropic,
        supabase,
        org.id,
        org.name,
        today,
        yesterday,
        mtyHour,
        mtyMin,
        request.url,
      );
      results[`org_${org.id}`] = orgResult;
    } catch (e) {
      results[`error_${org.id}`] = (e as Error).message;
    }
  }

  return NextResponse.json({ success: true, ...results });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runSurveillance(
  anthropic: Anthropic,
  supabase: any,
  orgId: string,
  orgName: string,
  today: string,
  yesterday: string,
  hour: number,
  minute: number,
  requestUrl: string,
) {
  // ============================================================
  // GATHER ALL DATA — maximum context for anomaly detection
  // ============================================================
  const [
    { data: members },
    { data: todayEntries },
    { data: yesterdayEntries },
    { data: todayStandups },
    { data: todayPromises },
    { data: todayCloseouts },
    { data: streaks },
    { data: liveStatus },
    { data: todayFlags },
    { data: todayReactions },
    { data: todayHealth },
    { data: todayFocus },
    { data: todayGit },
    { data: todayComms },
    { data: recentFeed },
    { data: recentNotifs },
    { data: trustScores },
    { data: workProfiles },
  ] = await Promise.all([
    supabase.from("org_members").select("user_id, role, profiles(full_name, email, work_start_hour, work_end_hour)").eq("org_id", orgId),
    supabase.from("time_entries").select("user_id, hour, category, title, is_late, proof_urls, mood, energy, difficulty, focus_quality, value_rating, stress_level, verification_status").eq("org_id", orgId).eq("date", today),
    supabase.from("time_entries").select("user_id, hour, category").eq("org_id", orgId).eq("date", yesterday),
    supabase.from("standups").select("user_id, submitted_at").eq("org_id", orgId).eq("date", today),
    supabase.from("daily_promises").select("user_id, title, status").eq("org_id", orgId).eq("date", today),
    supabase.from("daily_closeouts").select("user_id").eq("org_id", orgId).eq("date", today),
    supabase.from("activity_streaks").select("user_id, current_streak, longest_streak").eq("org_id", orgId),
    supabase.from("live_status").select("user_id, status, current_task, last_heartbeat").eq("org_id", orgId),
    supabase.from("accountability_flags").select("user_id, flag_type, details, resolved").eq("org_id", orgId).eq("date", today),
    supabase.from("entry_reactions").select("entry_id, user_id, reaction").eq("reaction", "suspicious"),
    supabase.from("daily_health").select("user_id, sleep_hours, sleep_quality, stress_morning, mental_clarity, motivation_level").eq("org_id", orgId).eq("date", today),
    supabase.from("focus_sessions").select("user_id, started_at, ended_at, interruption_count, quality_rating, was_completed").eq("org_id", orgId).gte("started_at", `${today}T00:00:00`),
    supabase.from("git_daily_metrics").select("user_id, commits_count, prs_opened, prs_merged, lines_added").eq("org_id", orgId).eq("date", today),
    supabase.from("communication_log").select("user_id, messages_sent, meetings_attended, meeting_minutes").eq("org_id", orgId).eq("date", today),
    supabase.from("public_feed").select("body, created_at, type").eq("org_id", orgId).eq("is_ai_generated", true).gte("created_at", `${today}T00:00:00`).order("created_at", { ascending: false }).limit(10),
    supabase.from("notifications").select("user_id, title, created_at").eq("org_id", orgId).gte("created_at", `${today}T00:00:00`).order("created_at", { ascending: false }).limit(20),
    supabase.from("trust_score_history").select("user_id, score, date").eq("org_id", orgId).gte("date", yesterday).order("date", { ascending: false }),
    supabase.from("ai_work_profiles").select("user_id, profile_data").eq("org_id", orgId),
  ]);

  // ============================================================
  // BUILD COMPREHENSIVE STATE for Claude
  // ============================================================
  const standupSet = new Set((todayStandups ?? []).map((s: any) => s.user_id));
  const closeoutSet = new Set((todayCloseouts ?? []).map((c: any) => c.user_id));
  const streakMap = new Map<string, any>((streaks ?? []).map((s: any) => [s.user_id, s]));
  const healthMap = new Map<string, any>((todayHealth ?? []).map((h: any) => [h.user_id, h]));
  const profileMap = new Map<string, Record<string, unknown>>((workProfiles ?? []).map((p: any) => [p.user_id, p.profile_data]));

  // Track how many notifications each person got today (avoid spam)
  const notifCounts = new Map<string, number>();
  for (const n of recentNotifs ?? []) {
    notifCounts.set(n.user_id, (notifCounts.get(n.user_id) ?? 0) + 1);
  }

  let state = `EQUIPO: ${orgName}\nHORA: ${hour}:${String(minute).padStart(2, "0")} Monterrey\nFECHA: ${today}\n`;
  state += `MENSAJES AI HOY: ${recentFeed?.length ?? 0} públicos, ${recentNotifs?.length ?? 0} privados\n\n`;

  // Recent AI messages (to avoid repetition)
  if (recentFeed && recentFeed.length > 0) {
    state += `ÚLTIMOS MENSAJES PÚBLICOS (NO repetir temas):\n`;
    for (const f of recentFeed.slice(0, 5)) {
      state += `  [${f.type}] "${f.body}" (${f.created_at})\n`;
    }
    state += "\n";
  }

  state += "=== ESTADO POR PERSONA ===\n";

  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string; work_start_hour: number; work_end_hour: number } | null;
    const name = p?.full_name ?? "?";
    const workStart = p?.work_start_hour ?? 8;
    const workEnd = p?.work_end_hour ?? 18;
    const isWithinSchedule = hour >= workStart && hour <= workEnd;

    const userEntries = (todayEntries ?? []).filter((e) => e.user_id === m.user_id);
    const yesterdayUserEntries = (yesterdayEntries ?? []).filter((e) => e.user_id === m.user_id);
    const userPromises = (todayPromises ?? []).filter((pr) => pr.user_id === m.user_id);
    const userFlags = (todayFlags ?? []).filter((f) => f.user_id === m.user_id);
    const userFocus = (todayFocus ?? []).filter((f) => f.user_id === m.user_id);
    const userGit = (todayGit ?? []).find((g) => g.user_id === m.user_id);
    const userComms = (todayComms ?? []).find((c) => c.user_id === m.user_id);
    const live = (liveStatus ?? []).find((l) => l.user_id === m.user_id);
    const streak = streakMap.get(m.user_id);
    const health = healthMap.get(m.user_id);
    const profile = profileMap.get(m.user_id);
    const notifsToday = notifCounts.get(m.user_id) ?? 0;
    const trustToday = (trustScores ?? []).find((t) => t.user_id === m.user_id && t.date === today);
    const trustYesterday = (trustScores ?? []).find((t) => t.user_id === m.user_id && t.date === yesterday);

    // Calculate expected hours by now
    const hoursExpectedByNow = Math.max(0, hour - workStart);
    const hoursLogged = userEntries.length;
    const hourGap = hoursExpectedByNow - hoursLogged;
    const lateCount = userEntries.filter((e) => e.is_late).length;
    const proofCount = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
    const flaggedCount = userEntries.filter((e) => e.verification_status === "flagged").length;

    // Mood/energy trends
    const moods = userEntries.filter((e) => e.mood).map((e) => e.mood as number);
    const energies = userEntries.filter((e) => e.energy).map((e) => e.energy as number);
    const stresses = userEntries.filter((e) => e.stress_level).map((e) => e.stress_level as number);
    const avgMood = moods.length > 0 ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : "?";
    const avgEnergy = energies.length > 0 ? (energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1) : "?";
    const avgStress = stresses.length > 0 ? (stresses.reduce((a, b) => a + b, 0) / stresses.length).toFixed(1) : "?";

    // Categories today
    const catCounts: Record<string, number> = {};
    for (const e of userEntries) catCounts[e.category] = (catCounts[e.category] ?? 0) + 1;
    const catSummary = Object.entries(catCounts).map(([k, v]) => `${k}=${v}`).join(",") || "ninguna";

    state += `\n${name} (horario ${workStart}-${workEnd}, ${isWithinSchedule ? "EN HORARIO" : "FUERA DE HORARIO"}):\n`;
    state += `  Horas: ${hoursLogged}/${hoursExpectedByNow} esperadas (gap=${hourGap}), ayer=${yesterdayUserEntries.length}h\n`;
    state += `  Categorías: ${catSummary}\n`;
    state += `  Evidencia: ${proofCount}/${hoursLogged}, Tardías: ${lateCount}, Flaggeadas: ${flaggedCount}\n`;
    state += `  Standup: ${standupSet.has(m.user_id) ? "sí" : "NO"}, Closeout: ${closeoutSet.has(m.user_id) ? "sí" : "NO"}\n`;
    state += `  Status: ${live?.status ?? "offline"}, Task: "${live?.current_task ?? "?"}", Heartbeat: ${live?.last_heartbeat ?? "nunca"}\n`;
    state += `  Racha: ${streak?.current_streak ?? 0}d (máx ${streak?.longest_streak ?? 0}d)\n`;
    state += `  Ánimo: ${avgMood}/5, Energía: ${avgEnergy}/5, Estrés: ${avgStress}/5\n`;
    state += `  Trust: hoy=${trustToday?.score ?? "?"}, ayer=${trustYesterday?.score ?? "?"}\n`;

    if (userPromises.length > 0) {
      state += `  Promesas: ${userPromises.map((pr) => `"${pr.title}"→${pr.status}`).join(", ")}\n`;
    }
    if (userFlags.length > 0) {
      state += `  FLAGS HOY: ${userFlags.map((f) => `${f.flag_type}${f.resolved ? "(resuelto)" : ""}`).join(", ")}\n`;
    }
    if (health) {
      state += `  Salud: sueño=${health.sleep_hours ?? "?"}h (calidad ${health.sleep_quality ?? "?"}), estrés mañana=${health.stress_morning ?? "?"}, claridad=${health.mental_clarity ?? "?"}, motivación=${health.motivation_level ?? "?"}\n`;
    }
    if (userFocus.length > 0) {
      const completed = userFocus.filter((f) => f.was_completed).length;
      const totalInterruptions = userFocus.reduce((sum, f) => sum + (f.interruption_count ?? 0), 0);
      state += `  Focus: ${userFocus.length} sesiones (${completed} completadas), ${totalInterruptions} interrupciones\n`;
    }
    if (userGit) {
      state += `  Git: ${userGit.commits_count} commits, ${userGit.prs_opened} PRs, +${userGit.lines_added} líneas\n`;
    }
    if (userComms) {
      state += `  Comms: ${userComms.messages_sent} msgs, ${userComms.meetings_attended} reuniones (${userComms.meeting_minutes}min)\n`;
    }
    if (profile) {
      state += `  Perfil AI: ${profile.work_personality ?? "?"}, motivadores: ${(profile.motivators as string[] ?? []).join(",") || "?"}\n`;
    }
    state += `  Notificaciones AI hoy: ${notifsToday}\n`;
  }

  // ============================================================
  // ANOMALY DETECTION PROMPT
  // ============================================================
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `Eres el Sistema de Vigilancia AI de Exomagram. Corres cada 30 minutos. Tu trabajo: detectar ANOMALÍAS, patrones fuera de lo normal, y actuar de inmediato.

${state}

DETECTA ANOMALÍAS — cosas que NO son normales:
1. HUECOS GRANDES: alguien debería tener X horas y tiene Y (gap > 2h = crítico)
2. SILENCIO: alguien en horario pero sin actividad (status offline/idle, 0 entries recientes)
3. MOOD/ENERGY CRASH: ánimo < 2 o energía < 2 consistente (señal de burnout)
4. ESTRÉS ALTO: stress_level > 4 repetido, o stress_morning > 4 en health check
5. SUEÑO MALO: sleep_hours < 5 o sleep_quality = 1 (afecta todo el día)
6. PATRÓN INUSUAL: alguien que normalmente hace deep_work está en meetings todo el día
7. TRUST SCORE CAYENDO: score de hoy < ayer por > 10 puntos
8. RACHA EN PELIGRO: streak > 7 pero hoy lleva 0 horas
9. PROMESAS ROTAS: promesas con status "broken"
10. FLAGS ACUMULADOS: > 2 flags sin resolver hoy
11. REUNIÓN EXCESIVA: > 3h de meetings en un día
12. ENTRIES FLAGGEADAS: entradas rechazadas por Claude
13. INCONSISTENCIAS: dice "deep_work" pero Git tiene 0 commits
14. HEARTBEAT MUERTO: live_status dice "online" pero last_heartbeat > 30 min
15. COMPARACIÓN CON AYER: alguien produjo 8h ayer y hoy lleva 0
16. FOCO INTERRUMPIDO: muchas interrupciones en focus sessions

GENERA MENSAJES. HAY DOS CANALES:

═══════════════════════════════════════════
PUBLIC SHAME — TODO EL EQUIPO VE, CON NOMBRES
═══════════════════════════════════════════
Estas situaciones se exponen PÚBLICAMENTE con nombre completo. Sin anonimizar. Sin suavizar.

SHAME OBLIGATORIO (siempre generar mensaje público si aplica):
1. 0 HORAS AL MEDIODÍA: "[Nombre] lleva 0 horas registradas a las [hora]. El equipo lleva [X] promedio."
2. ENTRADA RECHAZADA POR CLAUDE: "[Nombre] intentó registrar una hora pero Claude la rechazó por falta de especificidad."
3. PROMESA ROTA: "[Nombre] rompió su promesa: '[título]'. Promesas rotas esta semana: [X]."
4. SIN STANDUP A LAS 10AM: "[Nombre] no ha hecho standup. [X]/[Y] del equipo ya lo hicieron."
5. SIN CLOSEOUT AL FINAL DEL DÍA: "[Nombre] no cerró su día. El equipo merece saber qué pasó."
6. TRUST SCORE BAJO 50: "[Nombre] tiene Trust Score de [X]. Nivel crítico."
7. RACHA ROTA: "[Nombre] perdió su racha de [X] días. De vuelta a cero."
8. 3+ FLAGS SIN RESOLVER: "[Nombre] acumula [X] alertas sin resolver hoy."
9. 0 EVIDENCIA EN TODAS LAS ENTRADAS: "[Nombre] registró [X] horas hoy. Ninguna con evidencia."
10. GHOST: "[Nombre] dice estar online pero no ha tenido actividad en [X] minutos."
11. MEETING TAX > 50%: "[Nombre] lleva [X]h en reuniones de [Y]h totales. Más de la mitad del día en juntas."
12. GIT VS HORAS: "[Nombre] dice [X]h de deep work pero tiene 0 commits/PRs hoy."

TAMBIÉN PÚBLICO (positivo + datos de equipo):
- Reconocimiento: "[Nombre] lleva la mejor racha: [X] días"
- Datos en tiempo real: "El equipo lleva [X]h. Promedio: [Y] por persona. Meta: [Z]"
- Provocaciones de equipo: "Solo [X]/[Y] han empezado. ¿Qué pasa?"
- Milestones: "[Nombre] completó todas sus promesas hoy"

═══════════════════════════════════════════
PRIVADO — SOLO EL INDIVIDUO VE
═══════════════════════════════════════════
Estas cosas se comunican en PRIVADO. Son de salud/bienestar, no de rendimiento:

1. Sueño malo (< 5h, calidad 1): coaching privado sobre descanso
2. Estrés alto (> 4): mensaje de apoyo + sugerencia de break
3. Mood bajo (< 2): check-in empático, preguntar si necesita algo
4. Problemas personales flaggeados: solo reconocer, no exponer
5. Tips de mejora personalizados basados en su perfil AI
6. Retos positivos personales: "Llevas 3h deep work, ¿puedes llegar a 4?"

REGLAS ABSOLUTAS:
- NOMBRES COMPLETOS en mensajes públicos. Sin "un miembro" o "alguien". SIEMPRE el nombre.
- NO repitas temas de mensajes anteriores del día (ver ÚLTIMOS MENSAJES)
- Si alguien ya recibió > 5 notificaciones hoy, no le mandes más privadas (pero las públicas SÍ)
- Usa números concretos SIEMPRE — nunca generalidades
- Cada mensaje debe causar una ACCIÓN (no solo informar)
- Si todo está normal: manda UN mensaje público con datos del equipo
- Sé brutalmente directo. Sin corporativismo. Español mexicano informal.
- La salud/bienestar NUNCA se expone públicamente.

JSON:
{
  "anomalies_detected": [
    { "person": "nombre", "anomaly": "descripción", "severity": "info|warning|critical", "data": "dato concreto" }
  ],
  "private_messages": [
    {
      "target_name": "nombre",
      "message": "texto directo",
      "reason": "qué anomalía lo causó",
      "urgency": "low|normal|high|critical"
    }
  ],
  "public_messages": [
    {
      "type": "ai_announcement|warning|praise|milestone|challenge|team_update",
      "title": "título corto",
      "body": "texto",
      "target_name": "nombre o null",
      "emoji": "1 emoji",
      "urgency": "low|normal|high|critical"
    }
  ],
  "team_health": "green|yellow|red",
  "summary": "1 oración sobre el estado actual del equipo"
}

Solo JSON válido. Sin markdown.`,
    }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  let parsed: {
    anomalies_detected?: { person: string; anomaly: string; severity: string; data: string }[];
    private_messages?: { target_name: string; message: string; reason: string; urgency: string }[];
    public_messages?: { type: string; title: string; body: string; target_name: string | null; emoji: string; urgency: string }[];
    team_health?: string;
    summary?: string;
  } | null = null;

  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return { error: "Parse failed", raw_length: text.length };
  }

  const executed = { private: 0, public: 0, anomalies: parsed.anomalies_detected?.length ?? 0 };

  // Execute PRIVATE messages
  for (const msg of parsed.private_messages ?? []) {
    const targetMember = (members ?? []).find((m) => {
      const p = m.profiles as unknown as { full_name: string } | null;
      return p?.full_name?.toLowerCase().includes(msg.target_name?.toLowerCase() ?? "");
    });
    if (targetMember) {
      await supabase.from("notifications").insert({
        user_id: targetMember.user_id,
        org_id: orgId,
        type: msg.urgency === "critical" ? "flag_raised" : "entry_logged",
        title: `AI: ${msg.reason}`,
        body: msg.message,
      });
      executed.private++;
    }
  }

  // Execute PUBLIC messages
  for (const msg of parsed.public_messages ?? []) {
    const targetMember = msg.target_name
      ? (members ?? []).find((m) => {
          const p = m.profiles as unknown as { full_name: string } | null;
          return p?.full_name?.toLowerCase().includes(msg.target_name!.toLowerCase());
        })
      : null;

    await supabase.from("public_feed").insert({
      org_id: orgId,
      type: msg.type || "ai_announcement",
      title: msg.title,
      body: msg.body,
      target_user_id: targetMember?.user_id ?? null,
      urgency: msg.urgency || "normal",
      emoji: msg.emoji || null,
      is_ai_generated: true,
    });
    executed.public++;
  }

  // Store anomalies as AI review for history
  if ((parsed.anomalies_detected?.length ?? 0) > 0) {
    await supabase.from("ai_reviews").insert({
      org_id: orgId,
      date: today,
      review_type: "daily_team",
      findings: {
        anomalies: parsed.anomalies_detected,
        team_health: parsed.team_health,
        scan_time: `${hour}:${String(minute).padStart(2, "0")}`,
      },
      summary: parsed.summary ?? "Scan completado",
      trust_impact: 0,
    });
  }

  return {
    time: `${hour}:${String(minute).padStart(2, "0")}`,
    team_health: parsed.team_health,
    summary: parsed.summary,
    anomalies: executed.anomalies,
    private_sent: executed.private,
    public_posted: executed.public,
  };
}
