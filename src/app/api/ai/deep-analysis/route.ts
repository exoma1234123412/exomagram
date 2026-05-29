import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// POST /api/ai/deep-analysis
// AI-powered cross-dimensional data correlation analysis.
// Uses ALL data sources including v10 tables.
// Body: { org_id, analysis_type, period_days? }

type AnalysisType =
  | "health_productivity"
  | "focus_quality"
  | "team_dynamics"
  | "burnout_risk"
  | "optimal_schedule";

export async function POST(request: NextRequest) {
  const serverClient = await createServerSupabase();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { org_id, analysis_type, period_days } = body as {
    org_id: string;
    analysis_type: AnalysisType;
    period_days?: number;
  };

  if (!org_id || !analysis_type) {
    return NextResponse.json(
      { error: "org_id y analysis_type son requeridos" },
      { status: 400 }
    );
  }

  const validTypes: AnalysisType[] = [
    "health_productivity",
    "focus_quality",
    "team_dynamics",
    "burnout_risk",
    "optimal_schedule",
  ];
  if (!validTypes.includes(analysis_type)) {
    return NextResponse.json(
      {
        error: `analysis_type invalido. Validos: ${validTypes.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Verify membership
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Default period: 30 days
  const days = period_days ?? 30;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  // -------------------------------------------------------------------
  // 1. Fetch relevant data based on analysis_type
  // -------------------------------------------------------------------

  // Determine which data sources to fetch
  const needsHealth = [
    "health_productivity",
    "burnout_risk",
    "optimal_schedule",
  ].includes(analysis_type);
  const needsFocus = [
    "health_productivity",
    "focus_quality",
    "burnout_risk",
    "optimal_schedule",
  ].includes(analysis_type);
  const needsComms = [
    "focus_quality",
    "team_dynamics",
  ].includes(analysis_type);
  const needsGit = ["optimal_schedule"].includes(analysis_type);
  const needsReactions = ["team_dynamics"].includes(analysis_type);
  const needsShoutouts = ["team_dynamics"].includes(analysis_type);
  const needsReflections = [
    "team_dynamics",
    "burnout_risk",
  ].includes(analysis_type);
  const needsStreaks = ["burnout_risk"].includes(analysis_type);

  const [
    { data: members },
    { data: entries },
    { data: trustScores },
    { data: healthData },
    { data: focusSessions },
    { data: communicationLogs },
    { data: gitMetrics },
    { data: reactions },
    { data: shoutouts },
    { data: weeklyReflections },
    { data: streaks },
    { data: flags },
  ] = await Promise.all([
    supabase
      .from("org_members")
      .select("user_id, role, profiles(full_name, email)")
      .eq("org_id", org_id),
    supabase
      .from("time_entries")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", startStr)
      .lte("date", endStr),
    supabase
      .from("trust_score_history")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", startStr)
      .lte("date", endStr),
    needsHealth
      ? supabase
          .from("daily_health")
          .select("*")
          .eq("org_id", org_id)
          .gte("date", startStr)
          .lte("date", endStr)
      : Promise.resolve({ data: null }),
    needsFocus
      ? supabase
          .from("focus_sessions")
          .select("*")
          .eq("org_id", org_id)
          .gte("started_at", `${startStr}T00:00:00`)
          .lte("started_at", `${endStr}T23:59:59`)
      : Promise.resolve({ data: null }),
    needsComms
      ? supabase
          .from("communication_log")
          .select("*")
          .eq("org_id", org_id)
          .gte("date", startStr)
          .lte("date", endStr)
      : Promise.resolve({ data: null }),
    needsGit
      ? supabase
          .from("git_daily_metrics")
          .select("*")
          .eq("org_id", org_id)
          .gte("date", startStr)
          .lte("date", endStr)
      : Promise.resolve({ data: null }),
    needsReactions
      ? supabase
          .from("entry_reactions")
          .select("*, time_entries!inner(user_id, org_id, date)")
          .eq("time_entries.org_id", org_id)
          .gte("time_entries.date", startStr)
          .lte("time_entries.date", endStr)
      : Promise.resolve({ data: null }),
    needsShoutouts
      ? supabase
          .from("shoutouts")
          .select("*")
          .eq("org_id", org_id)
          .gte("date", startStr)
          .lte("date", endStr)
      : Promise.resolve({ data: null }),
    needsReflections
      ? supabase
          .from("weekly_reflections")
          .select("*")
          .eq("org_id", org_id)
          .gte("week_start", startStr)
          .lte("week_start", endStr)
      : Promise.resolve({ data: null }),
    needsStreaks
      ? supabase
          .from("activity_streaks")
          .select("*")
          .eq("org_id", org_id)
      : Promise.resolve({ data: null }),
    supabase
      .from("accountability_flags")
      .select("*")
      .eq("org_id", org_id)
      .gte("date", startStr)
      .lte("date", endStr),
  ]);

  // -------------------------------------------------------------------
  // Build name map
  // -------------------------------------------------------------------

  const nameMap = new Map<string, string>();
  for (const m of members ?? []) {
    const p = m.profiles as unknown as {
      full_name: string;
      email: string;
    } | null;
    nameMap.set(m.user_id, p?.full_name ?? p?.email ?? "Desconocido");
  }

  const userIds = (members ?? []).map((m) => m.user_id);

  // -------------------------------------------------------------------
  // 2. Compute per-day or per-person aggregates
  // -------------------------------------------------------------------

  // Helper: aggregate entries by date for a user
  function entriesByDate(userId: string) {
    const byDate = new Map<
      string,
      {
        total: number;
        deepWork: number;
        meetings: number;
        proof: number;
        mood: number[];
        energy: number[];
        difficulty: number[];
        focusQuality: number[];
        valueRating: number[];
        stressLevel: number[];
        interruptions: number;
        contextSwitches: number;
      }
    >();
    for (const e of entries ?? []) {
      if (e.user_id !== userId) continue;
      const d = byDate.get(e.date) ?? {
        total: 0,
        deepWork: 0,
        meetings: 0,
        proof: 0,
        mood: [],
        energy: [],
        difficulty: [],
        focusQuality: [],
        valueRating: [],
        stressLevel: [],
        interruptions: 0,
        contextSwitches: 0,
      };
      d.total++;
      if (e.category === "deep_work") d.deepWork++;
      if (e.category === "meeting") d.meetings++;
      if (e.proof_urls && (e.proof_urls as string[]).length > 0) d.proof++;
      if (e.mood != null) d.mood.push(e.mood as number);
      if (e.energy != null) d.energy.push(e.energy as number);
      if (e.difficulty != null) d.difficulty.push(e.difficulty as number);
      if (e.focus_quality != null)
        d.focusQuality.push(e.focus_quality as number);
      if (e.value_rating != null)
        d.valueRating.push(e.value_rating as number);
      if (e.stress_level != null)
        d.stressLevel.push(e.stress_level as number);
      d.interruptions += (e.interruptions as number) ?? 0;
      d.contextSwitches += (e.context_switches as number) ?? 0;
      byDate.set(e.date, d);
    }
    return byDate;
  }

  // Build per-person data summaries
  const perPersonData: string[] = [];

  for (const uid of userIds) {
    const name = nameMap.get(uid) ?? "Desconocido";
    const ebd = entriesByDate(uid);
    const userEntries = (entries ?? []).filter((e) => e.user_id === uid);
    const totalHours = userEntries.length;
    const deepWork = userEntries.filter(
      (e) => e.category === "deep_work"
    ).length;
    const meetingHours = userEntries.filter(
      (e) => e.category === "meeting"
    ).length;
    const withProof = userEntries.filter(
      (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
    ).length;
    const lateCount = userEntries.filter((e) => e.is_late).length;
    const uniqueDates = new Set(userEntries.map((e) => e.date));

    // Mood/energy averages
    const moods = userEntries
      .map((e) => e.mood as number | null)
      .filter((m): m is number => m != null);
    const avgMood =
      moods.length > 0
        ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1)
        : "N/A";
    const energies = userEntries
      .map((e) => e.energy as number | null)
      .filter((e): e is number => e != null);
    const avgEnergy =
      energies.length > 0
        ? (energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1)
        : "N/A";

    // Trust
    const userTrust = (trustScores ?? []).filter((t) => t.user_id === uid);
    const avgTrust =
      userTrust.length > 0
        ? (
            userTrust.reduce((a, t) => a + t.score, 0) / userTrust.length
          ).toFixed(1)
        : "N/A";

    let line = `${name}: ${totalHours}h en ${uniqueDates.size}d, deep=${deepWork}, meetings=${meetingHours}, proof=${withProof}/${totalHours}, late=${lateCount}, mood=${avgMood}, energy=${avgEnergy}, trust=${avgTrust}`;

    // Flags
    const userFlags = (flags ?? []).filter((f) => f.user_id === uid);
    if (userFlags.length > 0) {
      line += `, flags=${userFlags.length} (${userFlags.map((f) => f.flag_type).join(", ")})`;
    }

    // V10 entry fields aggregates
    const difficulties = userEntries
      .map((e) => e.difficulty as number | null)
      .filter((d): d is number => d != null);
    if (difficulties.length > 0) {
      const avgDiff = (
        difficulties.reduce((a, b) => a + b, 0) / difficulties.length
      ).toFixed(1);
      line += `, difficulty_avg=${avgDiff}`;
    }
    const focusQualities = userEntries
      .map((e) => e.focus_quality as number | null)
      .filter((f): f is number => f != null);
    if (focusQualities.length > 0) {
      const avgFQ = (
        focusQualities.reduce((a, b) => a + b, 0) / focusQualities.length
      ).toFixed(1);
      line += `, focus_quality_avg=${avgFQ}`;
    }
    const valueRatings = userEntries
      .map((e) => e.value_rating as number | null)
      .filter((v): v is number => v != null);
    if (valueRatings.length > 0) {
      const avgVal = (
        valueRatings.reduce((a, b) => a + b, 0) / valueRatings.length
      ).toFixed(1);
      line += `, value_avg=${avgVal}`;
    }
    const stressLevels = userEntries
      .map((e) => e.stress_level as number | null)
      .filter((s): s is number => s != null);
    if (stressLevels.length > 0) {
      const avgStress = (
        stressLevels.reduce((a, b) => a + b, 0) / stressLevels.length
      ).toFixed(1);
      line += `, stress_entry_avg=${avgStress}`;
    }
    const totalInterruptions = userEntries.reduce(
      (a, e) => a + ((e.interruptions as number) ?? 0),
      0
    );
    const totalContextSwitches = userEntries.reduce(
      (a, e) => a + ((e.context_switches as number) ?? 0),
      0
    );
    if (totalInterruptions > 0)
      line += `, interruptions=${totalInterruptions}`;
    if (totalContextSwitches > 0)
      line += `, context_switches=${totalContextSwitches}`;

    // Health data
    if (healthData) {
      const userHealth = healthData.filter((h) => h.user_id === uid);
      if (userHealth.length > 0) {
        const sleepVals = userHealth
          .filter((h) => h.sleep_hours != null)
          .map((h) => h.sleep_hours as number);
        const avgSleep =
          sleepVals.length > 0
            ? (
                sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length
              ).toFixed(1)
            : "N/A";
        const stressVals = userHealth
          .filter((h) => h.stress_morning != null)
          .map((h) => h.stress_morning as number);
        const avgHealthStress =
          stressVals.length > 0
            ? (
                stressVals.reduce((a, b) => a + b, 0) / stressVals.length
              ).toFixed(1)
            : "N/A";
        const motivationVals = userHealth
          .filter((h) => h.motivation_level != null)
          .map((h) => h.motivation_level as number);
        const avgMotivation =
          motivationVals.length > 0
            ? (
                motivationVals.reduce((a, b) => a + b, 0) /
                motivationVals.length
              ).toFixed(1)
            : "N/A";
        const clarityVals = userHealth
          .filter((h) => h.mental_clarity != null)
          .map((h) => h.mental_clarity as number);
        const avgClarity =
          clarityVals.length > 0
            ? (
                clarityVals.reduce((a, b) => a + b, 0) / clarityVals.length
              ).toFixed(1)
            : "N/A";
        const exerciseDays = userHealth.filter(
          (h) => h.exercise_minutes > 0
        ).length;
        const overtimeDays = userHealth.filter(
          (h) => h.worked_overtime
        ).length;
        const personalIssuesDays = userHealth.filter(
          (h) => h.personal_issues
        ).length;

        line += `\n  SALUD: ${userHealth.length} check-ins | sleep=${avgSleep}h | stress=${avgHealthStress}/5 | motivation=${avgMotivation}/5 | clarity=${avgClarity}/5 | ejercicio=${exerciseDays}d | overtime=${overtimeDays}d | personal_issues=${personalIssuesDays}d`;

        // Day-by-day health for trend analysis (burnout_risk needs this)
        if (analysis_type === "burnout_risk") {
          const healthTrend = userHealth
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(
              (h) =>
                `${h.date}: sleep=${h.sleep_hours ?? "?"}, stress=${h.stress_morning ?? "?"}/${h.stress_evening ?? "?"}, motivation=${h.motivation_level ?? "?"}, overtime=${h.worked_overtime ? "si" : "no"}`
            );
          if (healthTrend.length > 0) {
            line += `\n  TENDENCIA SALUD: ${healthTrend.join(" | ")}`;
          }
        }
      }
    }

    // Focus sessions
    if (focusSessions) {
      const userFocus = focusSessions.filter((f) => f.user_id === uid);
      if (userFocus.length > 0) {
        const totalFocusMin = userFocus.reduce(
          (a, f) => a + (f.actual_minutes ?? 0),
          0
        );
        const flowSessions = userFocus.filter(
          (f) => f.flow_state_achieved
        ).length;
        const avgQuality =
          userFocus.filter((f) => f.quality_rating != null).length > 0
            ? (
                userFocus
                  .filter((f) => f.quality_rating != null)
                  .reduce(
                    (a, f) => a + (f.quality_rating as number),
                    0
                  ) /
                userFocus.filter((f) => f.quality_rating != null).length
              ).toFixed(1)
            : "N/A";
        const totalInterruptionsFocus = userFocus.reduce(
          (a, f) => a + f.interruption_count,
          0
        );
        const interruptionSources = userFocus
          .flatMap((f) => f.interruption_sources as string[])
          .reduce(
            (acc, src) => {
              acc[src] = (acc[src] ?? 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          );

        line += `\n  FOCUS: ${userFocus.length} sesiones, ${totalFocusMin}min total, flow=${flowSessions}, quality=${avgQuality}/5, interruptions=${totalInterruptionsFocus}`;
        if (Object.keys(interruptionSources).length > 0) {
          line += `, sources=${Object.entries(interruptionSources)
            .map(([k, v]) => `${k}:${v}`)
            .join(",")}`;
        }

        // Quality decline trend for burnout_risk
        if (analysis_type === "burnout_risk" || analysis_type === "focus_quality") {
          const qualityByWeek = new Map<string, number[]>();
          for (const f of userFocus) {
            if (f.quality_rating == null) continue;
            const weekStart = f.started_at.split("T")[0].slice(0, 7); // YYYY-MM approx
            const arr = qualityByWeek.get(weekStart) ?? [];
            arr.push(f.quality_rating as number);
            qualityByWeek.set(weekStart, arr);
          }
          if (qualityByWeek.size > 1) {
            const trend = Array.from(qualityByWeek.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(
                ([month, vals]) =>
                  `${month}: avg=${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)}`
              );
            line += `\n  TENDENCIA FOCUS QUALITY: ${trend.join(" | ")}`;
          }
        }
      }
    }

    // Communication logs
    if (communicationLogs) {
      const userComms = communicationLogs.filter(
        (c) => c.user_id === uid
      );
      if (userComms.length > 0) {
        const totalMsgs = userComms.reduce(
          (a, c) => a + c.messages_sent,
          0
        );
        const totalMeetingMin = userComms.reduce(
          (a, c) => a + c.meeting_minutes,
          0
        );
        const avgResponseTime =
          userComms.filter((c) => c.response_time_avg_minutes != null)
            .length > 0
            ? (
                userComms
                  .filter((c) => c.response_time_avg_minutes != null)
                  .reduce(
                    (a, c) =>
                      a + (c.response_time_avg_minutes as number),
                    0
                  ) /
                userComms.filter(
                  (c) => c.response_time_avg_minutes != null
                ).length
              ).toFixed(0)
            : "N/A";
        const peopleSets = userComms.flatMap(
          (c) => c.people_interacted_with as string[]
        );
        const uniquePeople = new Set(peopleSets).size;

        line += `\n  COMMS: ${totalMsgs} msgs, ${totalMeetingMin}min meetings, response_time=${avgResponseTime}min, people=${uniquePeople}`;
      }
    }

    // Git metrics
    if (gitMetrics) {
      const userGit = gitMetrics.filter((g) => g.user_id === uid);
      if (userGit.length > 0) {
        const totalCommits = userGit.reduce(
          (a, g) => a + g.commits_count,
          0
        );
        const totalPRs = userGit.reduce(
          (a, g) => a + g.prs_opened + g.prs_merged,
          0
        );
        const totalLines =
          userGit.reduce((a, g) => a + g.lines_added, 0) +
          userGit.reduce((a, g) => a + g.lines_removed, 0);
        line += `\n  GIT: ${totalCommits} commits, ${totalPRs} PRs, ${totalLines} lineas`;
      }
    }

    // Reactions (team_dynamics)
    if (reactions) {
      const received = reactions.filter((r) => {
        const te = r.time_entries as unknown as {
          user_id: string;
        } | null;
        return te?.user_id === uid;
      });
      const given = reactions.filter((r) => r.user_id === uid);
      if (received.length > 0 || given.length > 0) {
        const suspiciousReceived = received.filter(
          (r) => r.reaction === "suspicious"
        ).length;
        const verifiedReceived = received.filter(
          (r) => r.reaction === "verified"
        ).length;
        line += `\n  REACTIONS: received=${received.length} (verified=${verifiedReceived}, suspicious=${suspiciousReceived}), given=${given.length}`;
      }
    }

    // Shoutouts (team_dynamics)
    if (shoutouts) {
      const received = shoutouts.filter(
        (s) => s.to_user_id === uid
      ).length;
      const given = shoutouts.filter(
        (s) => s.from_user_id === uid
      ).length;
      if (received > 0 || given > 0) {
        line += `\n  SHOUTOUTS: received=${received}, given=${given}`;
      }
    }

    // Weekly reflections (team_dynamics, burnout_risk)
    if (weeklyReflections) {
      const userReflections = weeklyReflections.filter(
        (r) => r.user_id === uid
      );
      if (userReflections.length > 0) {
        for (const r of userReflections) {
          const parts: string[] = [];
          if (r.satisfaction != null) parts.push(`satisfaction=${r.satisfaction}/5`);
          if (r.work_life_balance != null)
            parts.push(`balance=${r.work_life_balance}/5`);
          if (r.team_collaboration != null)
            parts.push(`team_collab=${r.team_collaboration}/5`);
          if (r.growth_feeling != null)
            parts.push(`growth=${r.growth_feeling}/5`);
          if (r.biggest_win) parts.push(`win="${r.biggest_win}"`);
          if (r.biggest_struggle)
            parts.push(`struggle="${r.biggest_struggle}"`);
          line += `\n  REFLECTION ${r.week_start}: ${parts.join(", ")}`;
        }
      }
    }

    // Streaks (burnout_risk)
    if (streaks) {
      const userStreak = streaks.find((s) => s.user_id === uid);
      if (userStreak) {
        line += `, streak=${userStreak.current_streak}d, longest=${userStreak.longest_streak}d`;
      }
    }

    // Hourly breakdown for optimal_schedule
    if (analysis_type === "optimal_schedule") {
      const hourBuckets = new Map<
        number,
        {
          count: number;
          deepWork: number;
          mood: number[];
          energy: number[];
          focusQuality: number[];
          valueRating: number[];
        }
      >();
      for (const e of userEntries) {
        const bucket = hourBuckets.get(e.hour) ?? {
          count: 0,
          deepWork: 0,
          mood: [],
          energy: [],
          focusQuality: [],
          valueRating: [],
        };
        bucket.count++;
        if (e.category === "deep_work") bucket.deepWork++;
        if (e.mood != null) bucket.mood.push(e.mood as number);
        if (e.energy != null) bucket.energy.push(e.energy as number);
        if (e.focus_quality != null)
          bucket.focusQuality.push(e.focus_quality as number);
        if (e.value_rating != null)
          bucket.valueRating.push(e.value_rating as number);
        hourBuckets.set(e.hour, bucket);
      }

      if (hourBuckets.size > 0) {
        const hourSummary = Array.from(hourBuckets.entries())
          .sort(([a], [b]) => a - b)
          .map(([hour, b]) => {
            const avgM =
              b.mood.length > 0
                ? (b.mood.reduce((a, c) => a + c, 0) / b.mood.length).toFixed(
                    1
                  )
                : "?";
            const avgE =
              b.energy.length > 0
                ? (
                    b.energy.reduce((a, c) => a + c, 0) / b.energy.length
                  ).toFixed(1)
                : "?";
            const avgFQ =
              b.focusQuality.length > 0
                ? (
                    b.focusQuality.reduce((a, c) => a + c, 0) /
                    b.focusQuality.length
                  ).toFixed(1)
                : "?";
            return `${hour}:00 -> entries=${b.count}, deep=${b.deepWork}, mood=${avgM}, energy=${avgE}, focus=${avgFQ}`;
          });
        line += `\n  POR HORA: ${hourSummary.join(" | ")}`;
      }
    }

    perPersonData.push(line);
  }

  // -------------------------------------------------------------------
  // 3. Build analysis prompt
  // -------------------------------------------------------------------

  const analysisLabels: Record<AnalysisType, string> = {
    health_productivity: "Salud vs Productividad",
    focus_quality: "Calidad de Enfoque",
    team_dynamics: "Dinamicas de Equipo",
    burnout_risk: "Riesgo de Burnout",
    optimal_schedule: "Horario Optimo",
  };

  const prompt = `Eres el Motor de Analisis Profundo de Exomagram. Haces correlaciones cross-dimensionales
que un humano no veria. Eres un data scientist implacable.

TIPO DE ANALISIS: ${analysisLabels[analysis_type]}
PERIODO: ultimos ${days} dias (${startStr} a ${endStr})
PERSONAS: ${userIds.length}

DATOS:
${perPersonData.join("\n\n")}

TOTALES:
- Entries: ${(entries ?? []).length}
- Health check-ins: ${(healthData ?? []).length}
- Focus sessions: ${(focusSessions ?? []).length}
- Git days: ${(gitMetrics ?? []).length}
- Communication logs: ${(communicationLogs ?? []).length}
- Flags: ${(flags ?? []).length}
- Reactions: ${(reactions ?? []).length}
- Shoutouts: ${(shoutouts ?? []).length}
- Reflections: ${(weeklyReflections ?? []).length}

Analiza los datos y encuentra correlaciones, patrones, y anomalias.
Responde EN JSON:
{
  "analysis_type": "${analysis_type}",
  "headline": "El hallazgo mas importante en 1 oracion",
  "correlations_found": [
    {
      "factor_a": "Variable A",
      "factor_b": "Variable B",
      "relationship": "positive|negative|none",
      "strength": 0-100,
      "insight": "Que significa esta correlacion",
      "data_evidence": "Datos especificos que lo respaldan"
    }
  ],
  "anomalies": [
    { "description": "...", "severity": "info|warning|critical", "affected_users": ["..."] }
  ],
  "patterns": [
    { "pattern": "...", "frequency": "daily|weekly|sporadic", "significance": 0-100 }
  ],
  "per_person_insights": [
    { "name": "...", "key_insight": "...", "risk_level": 0-100, "recommendation": "..." }
  ],
  "team_level_insights": "Observaciones a nivel de equipo",
  "recommendations": [
    { "recommendation": "...", "expected_impact": "...", "priority": "alta|media|baja" }
  ],
  "confidence_level": 0-100,
  "data_completeness": 0-100
}

REGLAS:
- Usa datos CONCRETOS. Nombres reales, numeros exactos, porcentajes.
- No inventes correlaciones que no existen en los datos.
- Si los datos son insuficientes, dilo claro en data_completeness.
- Se brutalmente honesto. Sin fluff corporativo.
- Cada insight debe estar respaldado por evidencia del dump de datos.

Solo JSON valido.`;

  // -------------------------------------------------------------------
  // 4. Call Claude, parse, store, return
  // -------------------------------------------------------------------

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
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

    if (!parsed) {
      return NextResponse.json(
        { error: "No se pudo parsear el analisis", raw: text },
        { status: 500 }
      );
    }

    // Store in ai_reviews
    await supabase.from("ai_reviews").insert({
      org_id,
      date: endStr,
      user_id: user.id,
      review_type: "deep_analysis",
      findings: parsed,
      summary: parsed.headline ?? "",
      trust_impact: 0,
    });

    return NextResponse.json({
      success: true,
      analysis: parsed,
      model: "claude-sonnet-4-6",
      period: { start: startStr, end: endStr, days },
      analysis_type,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: "Error al generar analisis", details: errorMessage },
      { status: 500 }
    );
  }
}
