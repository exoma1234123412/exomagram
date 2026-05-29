import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// AI Context Builder
// ============================================================
// Builds a compressed, token-efficient text summary of all team
// data for use in Claude prompts. Replaces the ad-hoc manual
// data assembly that was duplicated across ask-claude, claude-brain,
// and other AI routes.
//
// Usage:
//   const ctx = await buildTeamContext(supabase, orgId, { days: 30 });
//   // ctx.text  — ready-to-inject prompt text
//   // ctx.members — Map<userId, name> for lookups

interface BuildOptions {
  /** Number of days of data to fetch. Default 30. */
  days?: number;
  /** Include AI work profiles and daily insights. Default true. */
  includeAIProfiles?: boolean;
  /** Include weekly summaries (historical memory). Default true. */
  includeWeeklySummaries?: boolean;
  /** Include today's detail breakdown. Default true. */
  includeTodayDetail?: boolean;
}

export interface TeamContext {
  /** The full text context, ready for injection into a system prompt. */
  text: string;
  /** Map of user_id -> display name. */
  members: Map<string, string>;
  /** Today's date string (YYYY-MM-DD). */
  today: string;
}

export async function buildTeamContext(
  supabase: SupabaseClient,
  orgId: string,
  options: BuildOptions = {},
): Promise<TeamContext> {
  const {
    days = 30,
    includeAIProfiles = true,
    includeWeeklySummaries = true,
    includeTodayDetail = true,
  } = options;

  const today = new Date().toISOString().split("T")[0];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  // ── Fetch all data in parallel ────────────────────────────────
  const queries: Promise<{ data: unknown[] | null }>[] = [
    // 0: members
    supabase
      .from("org_members")
      .select("user_id, role, joined_at, profiles(full_name, email, timezone, work_start_hour, work_end_hour)")
      .eq("org_id", orgId),
    // 1: time entries
    supabase
      .from("time_entries")
      .select("user_id, date, hour, category, title, description, verification_status, proof_urls, is_late, mood, energy, project, output_type, location, quality_score")
      .eq("org_id", orgId)
      .gte("date", cutoffStr)
      .order("date", { ascending: false })
      .order("hour", { ascending: false })
      .limit(3000),
    // 2: trust scores
    supabase
      .from("trust_score_history")
      .select("user_id, date, score, hours_logged, hours_with_proof, late_entries, has_closeout")
      .eq("org_id", orgId)
      .gte("date", cutoffStr)
      .order("date", { ascending: false })
      .limit(500),
    // 3: streaks
    supabase
      .from("activity_streaks")
      .select("user_id, current_streak, longest_streak, last_active_date, total_days_logged")
      .eq("org_id", orgId),
    // 4: flags
    supabase
      .from("accountability_flags")
      .select("user_id, flag_type, date, details, resolved")
      .eq("org_id", orgId)
      .gte("date", cutoffStr)
      .order("date", { ascending: false })
      .limit(500),
    // 5: closeouts
    supabase
      .from("daily_closeouts")
      .select("user_id, date, summary, hours_logged, hours_with_proof, mood")
      .eq("org_id", orgId)
      .gte("date", cutoffStr)
      .order("date", { ascending: false })
      .limit(500),
    // 6: standups
    supabase
      .from("standups")
      .select("user_id, date, yesterday, today_plan, blockers, mood")
      .eq("org_id", orgId)
      .gte("date", cutoffStr)
      .order("date", { ascending: false })
      .limit(500),
    // 7: promises
    supabase
      .from("daily_promises")
      .select("user_id, date, title, status")
      .eq("org_id", orgId)
      .gte("date", cutoffStr)
      .order("date", { ascending: false })
      .limit(500),
    // 8: shoutouts
    supabase
      .from("shoutouts")
      .select("from_user_id, to_user_id, message, category, date")
      .eq("org_id", orgId)
      .gte("date", cutoffStr)
      .order("date", { ascending: false })
      .limit(200),
  ];

  // Conditional queries
  if (includeAIProfiles) {
    // 9: work profiles
    queries.push(
      supabase
        .from("ai_work_profiles")
        .select("user_id, profile_data")
        .eq("org_id", orgId),
    );
    // 10: daily insights
    queries.push(
      supabase
        .from("ai_daily_insights")
        .select("user_id, date, insight, predictive, grade, score, burnout_risk, disengagement_risk, trajectory")
        .eq("org_id", orgId)
        .order("date", { ascending: false })
        .limit(35),
    );
  }

  if (includeWeeklySummaries) {
    // 11 (or 9/10 depending on above): weekly summaries
    queries.push(
      supabase
        .from("weekly_summaries")
        .select("user_id, week_start, summary, ai_narrative")
        .eq("org_id", orgId)
        .order("week_start", { ascending: false })
        .limit(50),
    );
  }

  const results = await Promise.all(queries);

  // ── Destructure results ───────────────────────────────────────
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const members = (results[0].data ?? []) as any[];
  const entries = (results[1].data ?? []) as any[];
  const trustScores = (results[2].data ?? []) as any[];
  const streaks = (results[3].data ?? []) as any[];
  const flags = (results[4].data ?? []) as any[];
  const closeouts = (results[5].data ?? []) as any[];
  const standups = (results[6].data ?? []) as any[];
  const promises = (results[7].data ?? []) as any[];
  const shoutouts = (results[8].data ?? []) as any[];

  let queryIdx = 9;
  const workProfiles = includeAIProfiles ? (results[queryIdx++]?.data ?? []) as any[] : [];
  const dailyInsights = includeAIProfiles ? (results[queryIdx++]?.data ?? []) as any[] : [];
  const weeklySummaries = includeWeeklySummaries ? (results[queryIdx++]?.data ?? []) as any[] : [];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ── Build member map ──────────────────────────────────────────
  const memberMap = new Map<string, string>();
  const memberProfiles = new Map<string, {
    email: string;
    timezone: string;
    role: string;
    work_start_hour: number;
    work_end_hour: number;
  }>();

  for (const m of members) {
    const profile = m.profiles as { full_name: string | null; email: string; timezone: string; work_start_hour: number; work_end_hour: number } | null;
    const name = profile?.full_name ?? profile?.email ?? "Desconocido";
    memberMap.set(m.user_id, name);
    memberProfiles.set(m.user_id, {
      email: profile?.email ?? "",
      timezone: profile?.timezone ?? "America/Monterrey",
      role: m.role,
      work_start_hour: profile?.work_start_hour ?? 9,
      work_end_hour: profile?.work_end_hour ?? 18,
    });
  }

  // ── Build compressed text output ──────────────────────────────
  const lines: string[] = [];

  // --- AI Profiles layer ---
  if (includeAIProfiles && workProfiles.length > 0) {
    lines.push("══ PERFILES DE TRABAJO (AI-generated) ══");
    for (const wp of workProfiles) {
      const name = memberMap.get(wp.user_id) ?? "?";
      const pd = wp.profile_data as Record<string, unknown>;
      lines.push(
        `${name}: ${pd.work_personality ?? "?"} | cronotipo=${pd.chronotype ?? "?"} | consistencia=${pd.consistency_score ?? "?"}/100 | fortalezas=${(pd.strengths as string[] ?? []).join(",")} | debilidades=${(pd.weaknesses as string[] ?? []).join(",")} | riesgos=${(pd.risk_factors as string[] ?? []).join(",")}`,
      );
    }
    lines.push("");
  }

  // --- AI Insights layer ---
  if (includeAIProfiles && dailyInsights.length > 0) {
    lines.push("══ AI INSIGHTS RECIENTES ══");
    const insightsByUser = new Map<string, typeof dailyInsights>();
    for (const di of dailyInsights) {
      const list = insightsByUser.get(di.user_id) ?? [];
      list.push(di);
      insightsByUser.set(di.user_id, list);
    }
    for (const [userId, insights] of insightsByUser) {
      const name = memberMap.get(userId) ?? "?";
      const grades = insights.map((i: Record<string, unknown>) => `${i.date}=${i.grade}(${i.score})`).join(", ");
      const latest = insights[0] as Record<string, unknown>;
      lines.push(
        `${name}: ${grades} | burnout=${latest.burnout_risk ?? "?"}% deseng=${latest.disengagement_risk ?? "?"}% tray=${latest.trajectory ?? "?"}`,
      );
    }
    lines.push("");
  }

  // --- Weekly summaries layer (compressed) ---
  if (includeWeeklySummaries && weeklySummaries.length > 0) {
    lines.push("══ MEMORIA HISTORICA (resúmenes semanales) ══");
    const summariesByUser = new Map<string, typeof weeklySummaries>();
    for (const ws of weeklySummaries) {
      const list = summariesByUser.get(ws.user_id) ?? [];
      list.push(ws);
      summariesByUser.set(ws.user_id, list);
    }
    for (const [userId, userSummaries] of summariesByUser) {
      const name = memberMap.get(userId) ?? "?";
      lines.push(`--- ${name} (${userSummaries.length} semanas) ---`);
      for (const ws of userSummaries) {
        const s = ws.summary as Record<string, unknown>;
        lines.push(
          `  ${ws.week_start}: ${s.total_hours ?? 0}h dw=${s.deep_work ?? 0} mtg=${s.meetings ?? 0} proof=${s.proof_percent ?? 0}% late=${s.late_percent ?? 0}%`,
        );
      }
    }
    lines.push("");
  }

  // --- Per-person live data ---
  lines.push(`══ DATOS EN VIVO (últimos ${days} días) ══`);

  for (const [userId, name] of memberMap) {
    const prof = memberProfiles.get(userId)!;
    const userEntries = entries.filter((e: Record<string, unknown>) => e.user_id === userId);
    const totalHours = userEntries.length;
    const uniqueDays = new Set(userEntries.map((e: Record<string, unknown>) => e.date)).size;
    const avgHoursPerDay = uniqueDays > 0 ? (totalHours / uniqueDays).toFixed(1) : "0";

    // Category breakdown (compressed)
    const cats: Record<string, number> = {};
    for (const e of userEntries) cats[e.category] = (cats[e.category] ?? 0) + 1;
    const catStr = Object.entries(cats).map(([k, v]) => `${k}=${v}`).join(" ");

    // Proof & late
    const withProof = userEntries.filter((e: Record<string, unknown>) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
    const lateEntries = userEntries.filter((e: Record<string, unknown>) => e.is_late).length;
    const proofPct = totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0;

    // Mood & energy averages
    const moods = userEntries.filter((e: Record<string, unknown>) => e.mood).map((e: Record<string, unknown>) => e.mood as number);
    const energies = userEntries.filter((e: Record<string, unknown>) => e.energy).map((e: Record<string, unknown>) => e.energy as number);
    const avgMood = moods.length > 0 ? (moods.reduce((a: number, b: number) => a + b, 0) / moods.length).toFixed(1) : "-";
    const avgEnergy = energies.length > 0 ? (energies.reduce((a: number, b: number) => a + b, 0) / energies.length).toFixed(1) : "-";

    // Quality scores
    const qualityScores = userEntries.filter((e: Record<string, unknown>) => e.quality_score != null).map((e: Record<string, unknown>) => e.quality_score as number);
    const avgQuality = qualityScores.length > 0 ? Math.round(qualityScores.reduce((a: number, b: number) => a + b, 0) / qualityScores.length) : "-";

    // Projects
    const projects = [...new Set(userEntries.filter((e: Record<string, unknown>) => e.project).map((e: Record<string, unknown>) => e.project as string))];

    // Trust scores
    const userTrust = trustScores.filter((t: Record<string, unknown>) => t.user_id === userId);
    const latestTrust = userTrust.length > 0 ? userTrust[0].score : "-";
    const trustTrend = userTrust.length >= 3
      ? userTrust.slice(0, 3).map((t: Record<string, unknown>) => `${t.date}:${t.score}`).join(",")
      : "";

    // Streak
    const userStreak = streaks.find((s: Record<string, unknown>) => s.user_id === userId);

    // Flags
    const userFlags = flags.filter((f: Record<string, unknown>) => f.user_id === userId);
    const unresolvedFlags = userFlags.filter((f: Record<string, unknown>) => !f.resolved);
    const flagTypes = unresolvedFlags.map((f: Record<string, unknown>) => f.flag_type).join(",");

    // Closeouts & standups
    const userCloseouts = closeouts.filter((c: Record<string, unknown>) => c.user_id === userId);
    const userStandups = standups.filter((s: Record<string, unknown>) => s.user_id === userId);

    // Promises
    const userPromises = promises.filter((p: Record<string, unknown>) => p.user_id === userId);
    const delivered = userPromises.filter((p: Record<string, unknown>) => p.status === "delivered").length;
    const broken = userPromises.filter((p: Record<string, unknown>) => p.status === "broken").length;
    const promiseReliability = userPromises.length > 0 ? Math.round((delivered / userPromises.length) * 100) : "-";

    // Shoutouts
    const rxShoutouts = shoutouts.filter((s: Record<string, unknown>) => s.to_user_id === userId).length;
    const txShoutouts = shoutouts.filter((s: Record<string, unknown>) => s.from_user_id === userId).length;

    // Today's entries
    const todayEntries = userEntries.filter((e: Record<string, unknown>) => e.date === today);
    const todayStr = todayEntries.length > 0
      ? todayEntries.map((e: Record<string, unknown>) => `${e.hour}:00 [${e.category}] "${e.title}"`).join("; ")
      : "sin entradas";

    lines.push(`=== ${name} (${prof.role}) ===`);
    lines.push(`  horario=${prof.work_start_hour}:00-${prof.work_end_hour}:00 tz=${prof.timezone}`);
    lines.push(`  ${days}d: ${totalHours}h en ${uniqueDays} días, ${avgHoursPerDay}h/día avg | ${catStr}`);
    lines.push(`  evidencia=${withProof}/${totalHours} (${proofPct}%) | tardías=${lateEntries} | quality_avg=${avgQuality}`);
    lines.push(`  mood=${avgMood} energy=${avgEnergy} | trust=${latestTrust}${trustTrend ? ` trend=[${trustTrend}]` : ""}`);
    lines.push(`  racha=${userStreak?.current_streak ?? 0}d (max=${userStreak?.longest_streak ?? 0}) | total_días=${userStreak?.total_days_logged ?? 0}`);
    lines.push(`  standups=${userStandups.length} closeouts=${userCloseouts.length}`);
    lines.push(`  promesas: ${delivered} cumplidas, ${broken} rotas (${promiseReliability}% reliability)`);
    lines.push(`  shoutouts: ${rxShoutouts} recibidos, ${txShoutouts} dados`);
    if (unresolvedFlags.length > 0) lines.push(`  FLAGS sin resolver: ${flagTypes}`);
    if (projects.length > 0) lines.push(`  proyectos: ${projects.join(", ")}`);

    if (includeTodayDetail) {
      lines.push(`  HOY: ${todayStr}`);
    }

    // Latest standup
    if (userStandups.length > 0) {
      const ls = userStandups[0] as Record<string, unknown>;
      if (ls.date === today) {
        lines.push(`  standup hoy: plan="${ls.today_plan}" blockers="${ls.blockers ?? "ninguno"}"`);
      }
    }

    // Latest closeout
    if (userCloseouts.length > 0) {
      const lc = userCloseouts[0] as Record<string, unknown>;
      lines.push(`  último closeout (${lc.date}): "${(lc.summary as string).slice(0, 150)}"`);
    }

    lines.push("");
  }

  // --- Shoutout network ---
  if (shoutouts.length > 0) {
    lines.push("══ RED DE SHOUTOUTS ══");
    for (const s of shoutouts.slice(0, 20)) {
      const from = memberMap.get(s.from_user_id) ?? "?";
      const to = memberMap.get(s.to_user_id) ?? "?";
      lines.push(`  ${from} → ${to}: "${s.message}" (${s.category})`);
    }
    lines.push("");
  }

  // --- Unresolved flags summary ---
  const allUnresolved = flags.filter((f: Record<string, unknown>) => !f.resolved);
  if (allUnresolved.length > 0) {
    lines.push("══ FLAGS SIN RESOLVER ══");
    for (const f of allUnresolved.slice(0, 20)) {
      const name = memberMap.get(f.user_id as string) ?? "?";
      lines.push(`  ${name} ${f.date} ${f.flag_type}: ${f.details ?? "-"}`);
    }
    lines.push("");
  }

  return {
    text: lines.join("\n"),
    members: memberMap,
    today,
  };
}
