import { SupabaseClient } from "@supabase/supabase-js";
import type {
  DailyAggregate,
  TimeEntry,
  AccountabilityFlag,
  ActivityStreak,
  Profile,
  TrustScoreHistory,
} from "@/lib/types/database";

// ============================================================
// AI Context Builder
// ============================================================
// Two modes:
//
// 1. VERBOSE (buildTeamContext) — Full-detail context for complex AI analysis.
//    ~2000+ tokens. Used by ask-claude, claude-brain, and similar routes.
//
// 2. COMPRESSED (buildCompressedUserContext, buildCompressedTeamContext) —
//    Ultra-token-efficient context for high-frequency AI calls.
//    ~500 tokens/user. Pipe-delimited, abbreviation-heavy, skips zeros.
//
// Usage:
//   // Verbose (existing):
//   const ctx = await buildTeamContext(supabase, orgId, { days: 30 });
//
//   // Compressed (new):
//   const ctx = await buildCompressedUserContext(supabase, userId, orgId);
//   // ctx.text  -> ready-to-inject prompt text (~500 tokens)
//   // ctx.tokenEstimate -> rough token count
//   // ctx.dataPoints -> how many data points included

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

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

/** Compressed context output for token-efficient prompts */
export interface AIContext {
  /** The formatted context string for the prompt */
  text: string;
  /** Rough token count (chars / 4) */
  tokenEstimate: number;
  /** How many data points were included */
  dataPoints: number;
}

export interface CompressedUserOptions {
  /** Number of days to look back (default: 7) */
  days?: number;
  /** Include compressed team ranking context (default: false) */
  includeTeam?: boolean;
  /** Number of recent entries to include (default: 3) */
  recentEntries?: number;
}

export interface CompressedTeamOptions {
  /** Number of days to look back (default: 7) */
  days?: number;
  /** Include per-user detail blocks (default: true) */
  includeUserDetails?: boolean;
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
  // Supabase query builders are PromiseLike, not full Promise
  const queries: PromiseLike<{ data: unknown[] | null }>[] = [
    // 0: members
    supabase
      .from("org_members")
      .select("user_id, role, joined_at, profiles(full_name, email, timezone, work_start_hour, work_end_hour)")
      .eq("org_id", orgId),
    // 1: time entries (V11: filter soft-deleted)
    supabase
      .from("time_entries")
      .select("user_id, date, hour, category, title, description, verification_status, proof_urls, is_late, mood, energy, project, output_type, location, quality_score, entry_source, completeness_score, stress_level, focus_quality, difficulty, interruptions, context_switches")
      .eq("org_id", orgId)
      .gte("date", cutoffStr)
      .is("deleted_at", null)
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

  // V12/V15 intelligence layers (always included)
  const v12Queries = await Promise.all([
    supabase
      .from("personal_baselines")
      .select("user_id, avg_daily_hours, stddev_daily_hours, avg_mood, avg_energy, avg_stress, avg_quality_score, avg_proof_rate, avg_trust_score, trust_trend, typical_grade, promise_reliability, category_distribution, data_completeness, avg_sleep_hours, peak_productivity_hours")
      .eq("org_id", orgId)
      .order("computed_date", { ascending: false }),
    supabase
      .from("correlation_insights")
      .select("user_id, dimension_a, dimension_b, correlation_coefficient, strength, insight")
      .eq("org_id", orgId)
      .in("strength", ["strong_positive", "strong_negative"])
      .order("computed_date", { ascending: false })
      .limit(50),
    supabase
      .from("unlogged_hours")
      .select("user_id, date, hour, was_online, dominant_status")
      .eq("org_id", orgId)
      .gte("date", cutoffStr)
      .eq("was_online", true),
    supabase
      .from("nudge_outcomes")
      .select("user_id, nudge_type, psychology_technique, behavior_changed, response_latency_seconds")
      .eq("org_id", orgId)
      .gte("sent_at", cutoffStr + "T00:00:00"),
    supabase
      .from("daily_health")
      .select("user_id, date, sleep_hours, sleep_quality, stress_morning, stress_evening, motivation_level, exercise_minutes")
      .eq("org_id", orgId)
      .gte("date", cutoffStr)
      .order("date", { ascending: false })
      .limit(200),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const baselines = (v12Queries[0].data ?? []) as any[];
  const correlations = (v12Queries[1].data ?? []) as any[];
  const darkHours = (v12Queries[2].data ?? []) as any[];
  const nudgeHistory = (v12Queries[3].data ?? []) as any[];
  const healthData = (v12Queries[4].data ?? []) as any[];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Build lookup maps for V12/V15 data
  const baselineMap = new Map<string, (typeof baselines)[0]>();
  for (const b of baselines) {
    if (!baselineMap.has(b.user_id)) baselineMap.set(b.user_id, b);
  }
  const correlationMap = new Map<string, typeof correlations>();
  for (const c of correlations) {
    if (!c.user_id) continue;
    const list = correlationMap.get(c.user_id) ?? [];
    list.push(c);
    correlationMap.set(c.user_id, list);
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
      lines.push(`  último closeout (${lc.date}): "${((lc.summary as string) ?? "").slice(0, 150)}"`);
    }

    // V12 — Personal baseline (30-day norm)
    const userBaseline = baselineMap.get(userId);
    if (userBaseline) {
      lines.push(`  BASELINE 30d: avg=${userBaseline.avg_daily_hours ?? "?"}h/d (±${userBaseline.stddev_daily_hours ?? "?"}), mood=${userBaseline.avg_mood ?? "?"}, energy=${userBaseline.avg_energy ?? "?"}, stress=${userBaseline.avg_stress ?? "?"}, quality=${userBaseline.avg_quality_score ?? "?"}, trust=${userBaseline.avg_trust_score ?? "?"} (${userBaseline.trust_trend ?? "?"}), grade=${userBaseline.typical_grade ?? "?"}, proof=${userBaseline.avg_proof_rate ?? "?"}%, promises=${userBaseline.promise_reliability ?? "?"}%, data=${userBaseline.data_completeness ?? "?"}%`);
      if (userBaseline.category_distribution) {
        const dist = userBaseline.category_distribution as Record<string, number>;
        const distStr = Object.entries(dist).map(([k, v]) => `${k}=${Math.round(v * 100)}%`).join(" ");
        lines.push(`  CATEGORY MIX: ${distStr}`);
      }
    }

    // V12 — Strong correlations
    const userCorrs = correlationMap.get(userId);
    if (userCorrs && userCorrs.length > 0) {
      lines.push(`  CORRELACIONES: ${userCorrs.slice(0, 4).map((c: Record<string, unknown>) => `${c.dimension_a}↔${c.dimension_b}=${(c.correlation_coefficient as number) > 0 ? "+" : ""}${c.correlation_coefficient} (${c.strength})`).join("; ")}`);
    }

    // V15 — Dark hours (online but unlogged)
    const userDarkHours = darkHours.filter((d: Record<string, unknown>) => d.user_id === userId);
    if (userDarkHours.length > 0) {
      lines.push(`  HORAS OSCURAS (online sin registro, ${days}d): ${userDarkHours.length}h — ${userDarkHours.slice(0, 5).map((d: Record<string, unknown>) => `${d.date} ${d.hour}:00`).join(", ")}${userDarkHours.length > 5 ? "..." : ""}`);
    }

    // V15 — Nudge effectiveness
    const userNudges = nudgeHistory.filter((n: Record<string, unknown>) => n.user_id === userId);
    if (userNudges.length > 0) {
      const worked = userNudges.filter((n: Record<string, unknown>) => n.behavior_changed);
      const avgLatency = worked.length > 0 ? Math.round(worked.reduce((s: number, n: Record<string, unknown>) => s + ((n.response_latency_seconds as number) ?? 0), 0) / worked.length / 60) : null;
      lines.push(`  NUDGES (${days}d): ${userNudges.length} enviados, ${worked.length} efectivos (${userNudges.length > 0 ? Math.round((worked.length / userNudges.length) * 100) : 0}%)${avgLatency ? `, respuesta avg: ${avgLatency}min` : ""}`);
    }

    // V15 — Health trends
    const userHealth = healthData.filter((h: Record<string, unknown>) => h.user_id === userId);
    if (userHealth.length > 0) {
      const avgSleep = userHealth.filter((h: Record<string, unknown>) => h.sleep_hours != null).reduce((s: number, h: Record<string, unknown>) => s + (h.sleep_hours as number), 0) / Math.max(1, userHealth.filter((h: Record<string, unknown>) => h.sleep_hours != null).length);
      const stressDeltas = userHealth.filter((h: Record<string, unknown>) => h.stress_morning != null && h.stress_evening != null).map((h: Record<string, unknown>) => (h.stress_evening as number) - (h.stress_morning as number));
      const avgStressDelta = stressDeltas.length > 0 ? (stressDeltas.reduce((a, b) => a + b, 0) / stressDeltas.length).toFixed(1) : null;
      lines.push(`  SALUD: sleep_avg=${avgSleep.toFixed(1)}h, checks=${userHealth.length}/${days}d${avgStressDelta ? `, stress_delta_avg=${avgStressDelta} (+ = peor al final del día)` : ""}`);
    }

    // Derived metrics
    const deepWorkRatio = totalHours > 0 ? Math.round((userEntries.filter((e: Record<string, unknown>) => e.category === "deep_work").length / totalHours) * 100) : 0;
    const meetingTax = totalHours > 0 ? Math.round((userEntries.filter((e: Record<string, unknown>) => e.category === "meeting").length / totalHours) * 100) : 0;
    const entrySources: Record<string, number> = {};
    for (const e of userEntries) if (e.entry_source) entrySources[e.entry_source] = (entrySources[e.entry_source] ?? 0) + 1;
    const sourceStr = Object.entries(entrySources).map(([k, v]) => `${k}=${v}`).join(" ");
    const avgCompleteness = userEntries.filter((e: Record<string, unknown>) => e.completeness_score != null).length > 0
      ? Math.round(userEntries.filter((e: Record<string, unknown>) => e.completeness_score != null).reduce((s: number, e: Record<string, unknown>) => s + (e.completeness_score as number), 0) / userEntries.filter((e: Record<string, unknown>) => e.completeness_score != null).length)
      : null;
    lines.push(`  DERIVED: deep_work_ratio=${deepWorkRatio}%, meeting_tax=${meetingTax}%, entry_sources=[${sourceStr}]${avgCompleteness != null ? `, completeness_avg=${avgCompleteness}%` : ""}`);

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

// ============================================================
// COMPRESSED CONTEXT BUILDERS
// ============================================================
// Ultra-token-efficient output for high-frequency AI calls.
// ~500 tokens per user, ~300 extra for team overview.
// Pipe-delimited, abbreviation-heavy, skips zero values.

// ---------------------------------------------------------------------------
// buildCompressedUserContext
// ---------------------------------------------------------------------------

export async function buildCompressedUserContext(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  options?: CompressedUserOptions
): Promise<AIContext> {
  const days = options?.days ?? 7;
  const recentCount = options?.recentEntries ?? 3;
  const since = _daysAgo(days);

  // Parallel queries -- fetch everything at once
  const [
    profileRes,
    streakRes,
    trustRes,
    aggregatesRes,
    flagsRes,
    recentRes,
    closeoutsRes,
    standupsRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, timezone, work_start_hour, work_end_hour")
      .eq("id", userId)
      .single(),
    supabase
      .from("activity_streaks")
      .select("current_streak, longest_streak, total_days_logged")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .single(),
    supabase
      .from("trust_score_history")
      .select("score, date")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .gte("date", since)
      .order("date", { ascending: false })
      .limit(days),
    supabase
      .from("daily_aggregates")
      .select("*")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .gte("date", since)
      .order("date", { ascending: false })
      .limit(days),
    supabase
      .from("accountability_flags")
      .select("flag_type, date, resolved")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .gte("date", since)
      .order("date", { ascending: false }),
    supabase
      .from("time_entries")
      .select("title, hour, category, proof_urls, date, mood, energy")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .order("hour", { ascending: false })
      .limit(recentCount),
    supabase
      .from("daily_closeouts")
      .select("date")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .gte("date", since),
    supabase
      .from("standups")
      .select("date")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .gte("date", since),
  ]);

  const profile = profileRes.data as Pick<
    Profile,
    "full_name" | "email" | "timezone" | "work_start_hour" | "work_end_hour"
  > | null;
  const streak = streakRes.data as Pick<
    ActivityStreak,
    "current_streak" | "longest_streak" | "total_days_logged"
  > | null;
  const trustHistory = (trustRes.data ?? []) as Pick<
    TrustScoreHistory,
    "score" | "date"
  >[];
  const aggregates = (aggregatesRes.data ?? []) as DailyAggregate[];
  const flagsList = (flagsRes.data ?? []) as Pick<
    AccountabilityFlag,
    "flag_type" | "date" | "resolved"
  >[];
  const recentEntries = (recentRes.data ?? []) as Pick<
    TimeEntry,
    "title" | "hour" | "category" | "proof_urls" | "date" | "mood" | "energy"
  >[];
  const closeouts = (closeoutsRes.data ?? []) as { date: string }[];
  const standups = (standupsRes.data ?? []) as { date: string }[];

  let dataPoints = 0;
  const cLines: string[] = [];

  // -- USER line --
  const name =
    profile?.full_name ?? profile?.email?.split("@")[0] ?? "Unknown";
  const currentTrust = trustHistory[0]?.score ?? null;
  const prevTrust = trustHistory[1]?.score ?? null;
  const trustTrend =
    currentTrust != null && prevTrust != null
      ? currentTrust > prevTrust
        ? "^"
        : currentTrust < prevTrust
          ? "v"
          : "="
      : "";

  const userParts = [`USER: ${name}`];
  if (streak) {
    userParts.push(`streak:${streak.current_streak}`);
    dataPoints++;
  }
  if (currentTrust != null) {
    userParts.push(`trust:${currentTrust}${trustTrend}`);
    dataPoints++;
  }
  if (profile?.timezone) {
    userParts.push(`tz:${profile.timezone}`);
  }
  cLines.push(userParts.join(" | "));

  // -- LAST Nd summary --
  if (aggregates.length > 0) {
    const totalHours = _sumField(aggregates, "total_hours");
    const avgDaily =
      aggregates.length > 0 ? _round1(totalHours / aggregates.length) : 0;
    const totalProof = _sumField(aggregates, "hours_with_proof");
    const proofPct =
      totalHours > 0 ? Math.round((totalProof / totalHours) * 100) : 0;
    const totalLate = _sumField(aggregates, "late_entries");
    const latePct =
      totalHours > 0 ? Math.round((totalLate / totalHours) * 100) : 0;
    const closeoutCount = closeouts.length;
    const standupCount = standups.length;

    cLines.push(
      `LAST ${days}D: ${_round1(totalHours)}h total | ${avgDaily}h/d avg | proof:${proofPct}% | late:${latePct}% | closeout:${closeoutCount}/${days} | standup:${standupCount}/${days}`
    );
    dataPoints += 6;
  }

  // -- BY DAY --
  if (aggregates.length > 0) {
    const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
    const byDay = aggregates
      .slice()
      .reverse()
      .map((a) => {
        const d = new Date(a.date + "T12:00:00");
        return `${dayNames[d.getDay()]}:${_round1(a.total_hours)}h`;
      })
      .join(" ");
    cLines.push(`BY DAY: ${byDay}`);
    dataPoints += aggregates.length;
  }

  // -- CATEGORIES --
  if (aggregates.length > 0) {
    const totalHours = _sumField(aggregates, "total_hours");
    if (totalHours > 0) {
      const cats: Record<string, number> = {
        deep_work: _sumField(aggregates, "deep_work_hours"),
        meeting: _sumField(aggregates, "meeting_hours"),
        review: _sumField(aggregates, "review_hours"),
        admin: _sumField(aggregates, "admin_hours"),
        planning: _sumField(aggregates, "planning_hours"),
        learning: _sumField(aggregates, "learning_hours"),
        break: _sumField(aggregates, "break_hours"),
        blocked: _sumField(aggregates, "blocked_hours"),
      };
      const catParts = Object.entries(cats)
        .filter(([, h]) => h > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, h]) => `${cat}:${Math.round((h / totalHours) * 100)}%`)
        .join(" ");
      if (catParts) {
        cLines.push(`CATEGORIES: ${catParts}`);
        dataPoints += Object.keys(cats).length;
      }
    }
  }

  // -- FLAGS --
  if (flagsList.length > 0) {
    const unresolvedFlags = flagsList.filter((f) => !f.resolved);
    const flagCounts: Record<string, number> = {};
    for (const f of unresolvedFlags) {
      flagCounts[f.flag_type] = (flagCounts[f.flag_type] || 0) + 1;
    }
    const flagParts = Object.entries(flagCounts)
      .map(([type, count]) => `${type}:${count}`)
      .join(" ");
    if (flagParts) {
      cLines.push(`FLAGS(${days}d): ${flagParts}`);
      dataPoints += unresolvedFlags.length;
    }
  }

  // -- RECENT entries --
  if (recentEntries.length > 0) {
    const recentParts = recentEntries.map((e) => {
      const hasProof = e.proof_urls && e.proof_urls.length > 0;
      const title = _truncate(e.title, 40);
      return `"${title}"(${e.hour}h,${e.category}${hasProof ? ",proof+" : ""})`;
    });
    cLines.push(`RECENT(${recentEntries.length}): ${recentParts.join(" | ")}`);
    dataPoints += recentEntries.length;
  }

  // -- PATTERNS (computed from aggregates) --
  if (aggregates.length >= 3) {
    const patternParts: string[] = [];

    // Weakest day (lowest hours, non-zero)
    const nonZeroDays = aggregates.filter((a) => a.total_hours > 0);
    if (nonZeroDays.length > 0) {
      const weakest = nonZeroDays.reduce((min, a) =>
        a.total_hours < min.total_hours ? a : min
      );
      const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
      const weakDay =
        dayNames[new Date(weakest.date + "T12:00:00").getDay()];
      patternParts.push(`weak_day=${weakDay}`);
    }

    // Average description word count
    if (recentEntries.length > 0) {
      const avgWords = Math.round(
        recentEntries.reduce((s, e) => s + e.title.split(/\s+/).length, 0) /
          recentEntries.length
      );
      patternParts.push(`desc_avg=${avgWords}words`);
    }

    // Proof rate
    const totalHours = _sumField(aggregates, "total_hours");
    const proofHours = _sumField(aggregates, "hours_with_proof");
    if (totalHours > 0) {
      patternParts.push(
        `proof_rate=${Math.round((proofHours / totalHours) * 100)}%`
      );
    }

    // Avg interruptions
    const avgInterruptions = _round1(
      _sumField(aggregates, "total_interruptions") / aggregates.length
    );
    if (avgInterruptions > 0) {
      patternParts.push(`interruptions/d=${avgInterruptions}`);
    }

    if (patternParts.length > 0) {
      cLines.push(`PATTERNS: ${patternParts.join(" ")}`);
      dataPoints += patternParts.length;
    }
  }

  // -- MOOD & ENERGY --
  const moodAggs = aggregates.filter((a) => a.avg_mood != null);
  const energyAggs = aggregates.filter((a) => a.avg_energy != null);
  const stressAggs = aggregates.filter((a) => a.avg_stress != null);

  if (moodAggs.length > 0 || energyAggs.length > 0) {
    const parts: string[] = [];
    if (moodAggs.length > 0) {
      const avgMood = _round1(
        moodAggs.reduce((s, a) => s + (a.avg_mood ?? 0), 0) / moodAggs.length
      );
      const moodTrend =
        moodAggs.length >= 2
          ? (moodAggs[0].avg_mood ?? 0) > (moodAggs[1].avg_mood ?? 0)
            ? "^"
            : (moodAggs[0].avg_mood ?? 0) < (moodAggs[1].avg_mood ?? 0)
              ? "v"
              : "="
          : "";
      parts.push(`MOOD:${avgMood}avg${moodTrend}`);
      dataPoints++;
    }
    if (energyAggs.length > 0) {
      const avgEnergy = _round1(
        energyAggs.reduce((s, a) => s + (a.avg_energy ?? 0), 0) /
          energyAggs.length
      );
      const energyTrend =
        energyAggs.length >= 2
          ? (energyAggs[0].avg_energy ?? 0) > (energyAggs[1].avg_energy ?? 0)
            ? "^"
            : (energyAggs[0].avg_energy ?? 0) <
                (energyAggs[1].avg_energy ?? 0)
              ? "v"
              : "="
          : "";
      parts.push(`ENERGY:${avgEnergy}avg${energyTrend}`);
      dataPoints++;
    }
    if (stressAggs.length > 0) {
      const avgStress = _round1(
        stressAggs.reduce((s, a) => s + (a.avg_stress ?? 0), 0) /
          stressAggs.length
      );
      parts.push(`STRESS:${avgStress}avg`);
      dataPoints++;
    }
    cLines.push(parts.join(" "));
  }

  // -- AI SCORES --
  const scoredDays = aggregates.filter((a) => a.ai_grade != null);
  if (scoredDays.length > 0) {
    const grades = scoredDays.map((a) => a.ai_grade).join(",");
    const avgScore = _round1(
      scoredDays.reduce((s, a) => s + (a.ai_score ?? 0), 0) /
        scoredDays.length
    );
    cLines.push(
      `AI_GRADES(${scoredDays.length}d): ${grades} | avg_score:${avgScore}`
    );
    dataPoints += scoredDays.length;
  }

  // -- GIT (if any commits) --
  const totalCommits = _sumField(aggregates, "git_commits");
  if (totalCommits > 0) {
    const totalGitLines =
      _sumField(aggregates, "git_lines_added") +
      _sumField(aggregates, "git_lines_removed");
    const totalPRs =
      _sumField(aggregates, "git_prs_opened") +
      _sumField(aggregates, "git_prs_merged");
    cLines.push(
      `GIT(${days}d): ${totalCommits}commits | ${totalGitLines}lines | ${totalPRs}prs`
    );
    dataPoints += 3;
  }

  // -- PROMISES --
  const promisesMade = _sumField(aggregates, "promises_made");
  if (promisesMade > 0) {
    const kept = _sumField(aggregates, "promises_kept");
    const broken = _sumField(aggregates, "promises_broken");
    cLines.push(`PROMISES: ${kept}/${promisesMade}kept | ${broken}broken`);
    dataPoints += 2;
  }

  // -- V12: BASELINE (if available) --
  const baselineRes = await supabase
    .from("personal_baselines")
    .select("avg_daily_hours, stddev_daily_hours, avg_trust_score, trust_trend, typical_grade, promise_reliability, data_completeness, avg_mood, avg_energy")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .order("computed_date", { ascending: false })
    .limit(1)
    .single();
  const bl = baselineRes.data as Record<string, unknown> | null;
  if (bl) {
    const blParts: string[] = [];
    if (bl.avg_daily_hours != null) blParts.push(`avg:${bl.avg_daily_hours}h/d`);
    if (bl.stddev_daily_hours != null) blParts.push(`±${bl.stddev_daily_hours}`);
    if (bl.trust_trend) blParts.push(`trust:${bl.trust_trend}`);
    if (bl.typical_grade) blParts.push(`grade:${bl.typical_grade}`);
    if (bl.promise_reliability != null) blParts.push(`prom:${bl.promise_reliability}%`);
    if (bl.data_completeness != null) blParts.push(`data:${bl.data_completeness}%`);
    cLines.push(`BASELINE(30d): ${blParts.join(" | ")}`);
    dataPoints += blParts.length;
  }

  // -- V12: CORRELATIONS --
  const corrRes = await supabase
    .from("correlation_insights")
    .select("dimension_a, dimension_b, correlation_coefficient, strength")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .in("strength", ["strong_positive", "strong_negative"])
    .order("computed_date", { ascending: false })
    .limit(5);
  const corrs = (corrRes.data ?? []) as { dimension_a: string; dimension_b: string; correlation_coefficient: number; strength: string }[];
  if (corrs.length > 0) {
    const corrStr = corrs.map(c => `${c.dimension_a}<>${c.dimension_b}:${c.correlation_coefficient > 0 ? "+" : ""}${c.correlation_coefficient}`).join(" ");
    cLines.push(`CORR: ${corrStr}`);
    dataPoints += corrs.length;
  }

  // -- Include team context if requested --
  if (options?.includeTeam) {
    const teamCtx = await buildCompressedTeamContext(supabase, orgId, {
      days,
      includeUserDetails: false,
    });
    cLines.push("");
    cLines.push(teamCtx.text);
    dataPoints += teamCtx.dataPoints;
  }

  const text = cLines.join("\n");
  return {
    text,
    tokenEstimate: Math.ceil(text.length / 4),
    dataPoints,
  };
}

// ---------------------------------------------------------------------------
// buildCompressedTeamContext
// ---------------------------------------------------------------------------

export async function buildCompressedTeamContext(
  supabase: SupabaseClient,
  orgId: string,
  options?: CompressedTeamOptions
): Promise<AIContext> {
  const days = options?.days ?? 7;
  const includeDetails = options?.includeUserDetails ?? true;
  const since = _daysAgo(days);

  // Fetch org info + members
  const [orgRes, membersRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single(),
    supabase
      .from("org_members")
      .select("user_id, profiles(full_name, email)")
      .eq("org_id", orgId),
  ]);

  const orgName =
    (orgRes.data as { name: string } | null)?.name ?? "Unknown";
  const teamMembers = ((membersRes.data ?? []) as unknown as {
    user_id: string;
    profiles: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
  }[]).map(m => ({
    user_id: m.user_id,
    profiles: Array.isArray(m.profiles) ? m.profiles[0] ?? null : m.profiles,
  }));

  if (teamMembers.length === 0) {
    return {
      text: `TEAM: ${orgName} | 0 members`,
      tokenEstimate: 10,
      dataPoints: 0,
    };
  }

  // Fetch all aggregates for the org in the window
  const { data: allAggregates } = await supabase
    .from("daily_aggregates")
    .select("*")
    .eq("org_id", orgId)
    .gte("date", since)
    .order("date", { ascending: false });

  const orgAggregates = (allAggregates ?? []) as DailyAggregate[];

  // Group aggregates by user
  const byUser = new Map<string, DailyAggregate[]>();
  for (const a of orgAggregates) {
    const existing = byUser.get(a.user_id) ?? [];
    existing.push(a);
    byUser.set(a.user_id, existing);
  }

  // Compute per-user totals
  const userStats = teamMembers.map((m) => {
    const userAggs = byUser.get(m.user_id) ?? [];
    const totalHours = _sumField(userAggs, "total_hours");
    const proofHours = _sumField(userAggs, "hours_with_proof");
    const lateEntries = _sumField(userAggs, "late_entries");
    const closeoutDays = userAggs.filter((a) => a.has_closeout).length;
    const standupDays = userAggs.filter((a) => a.has_standup).length;
    const daysLogged = userAggs.filter((a) => a.total_hours > 0).length;
    const avgTrust = _avgField(
      userAggs.filter((a) => a.trust_score != null),
      "trust_score"
    );
    const deepWorkHours = _sumField(userAggs, "deep_work_hours");
    const meetingHours = _sumField(userAggs, "meeting_hours");
    const memberName =
      m.profiles?.full_name ??
      m.profiles?.email?.split("@")[0] ??
      "?";

    const avgQuality = _avgField(
      userAggs.filter((a) => (a as unknown as Record<string, unknown>).avg_quality_score != null),
      "avg_quality_score" as keyof DailyAggregate
    );

    return {
      userId: m.user_id,
      name: memberName,
      totalHours,
      proofHours,
      lateEntries,
      closeoutDays,
      standupDays,
      daysLogged,
      avgTrust,
      avgQuality,
      deepWorkHours,
      meetingHours,
      aggregates: userAggs,
    };
  });

  // Sort by total hours descending
  userStats.sort((a, b) => b.totalHours - a.totalHours);

  // Compute week label
  const now = new Date();
  const weekNum = _getISOWeekNumber(now);
  const year = now.getFullYear();

  let dataPoints = 0;
  const cLines: string[] = [];

  // -- TEAM header --
  cLines.push(
    `TEAM: ${orgName} | ${teamMembers.length} members | week:${year}-W${String(weekNum).padStart(2, "0")}`
  );
  dataPoints++;

  // -- RANKING --
  const rankingParts = userStats.map(
    (u, i) => `#${i + 1} ${u.name}(${_round1(u.totalHours)}h)`
  );
  cLines.push(`RANKING: ${rankingParts.join(" ")}`);
  dataPoints += userStats.length;

  // -- TEAM AVG --
  const teamTotalHours = userStats.reduce((s, u) => s + u.totalHours, 0);
  const teamCount = userStats.length;
  const teamAvgHours =
    teamCount > 0 ? _round1(teamTotalHours / teamCount) : 0;
  const teamProofHours = userStats.reduce((s, u) => s + u.proofHours, 0);
  const teamProofPct =
    teamTotalHours > 0
      ? Math.round((teamProofHours / teamTotalHours) * 100)
      : 0;
  const teamLatePct =
    teamTotalHours > 0
      ? Math.round(
          (userStats.reduce((s, u) => s + u.lateEntries, 0) /
            teamTotalHours) *
            100
        )
      : 0;
  const teamCloseoutPct =
    teamCount > 0
      ? Math.round(
          (userStats.reduce((s, u) => s + u.closeoutDays, 0) /
            (teamCount * days)) *
            100
        )
      : 0;
  const teamStandupPct =
    teamCount > 0
      ? Math.round(
          (userStats.reduce((s, u) => s + u.standupDays, 0) /
            (teamCount * days)) *
            100
        )
      : 0;

  cLines.push(
    `TEAM AVG: ${teamAvgHours}h/wk | proof:${teamProofPct}% | late:${teamLatePct}% | closeout:${teamCloseoutPct}% | standup:${teamStandupPct}%`
  );
  dataPoints += 5;

  // -- Per-user detail blocks --
  if (includeDetails) {
    cLines.push("");
    for (const u of userStats) {
      const parts: string[] = [`[${u.name}]`];

      parts.push(`${_round1(u.totalHours)}h/${days}d`);

      if (u.daysLogged > 0) {
        parts.push(`${_round1(u.totalHours / u.daysLogged)}h/d`);
      }

      if (u.totalHours > 0) {
        parts.push(
          `proof:${Math.round((u.proofHours / u.totalHours) * 100)}%`
        );
      }

      if (u.avgTrust != null) {
        parts.push(`trust:${Math.round(u.avgTrust)}`);
      }

      if (u.avgQuality != null && u.avgQuality > 0) {
        parts.push(`quality:${Math.round(u.avgQuality)}`);
      }

      if (u.totalHours > 0) {
        const catSplit: [string, number][] = [
          ["dw", u.deepWorkHours],
          ["mtg", u.meetingHours],
        ];
        const catStr = catSplit
          .filter(([, h]) => h > 0)
          .map(
            ([c, h]) =>
              `${c}:${Math.round((h / u.totalHours) * 100)}%`
          )
          .join(",");
        if (catStr) parts.push(catStr);
      }

      parts.push(`co:${u.closeoutDays}/${days}`);
      parts.push(`su:${u.standupDays}/${days}`);

      const moodDays = u.aggregates.filter((a) => a.avg_mood != null);
      if (moodDays.length > 0) {
        const moodAvg = _round1(
          moodDays.reduce((s, a) => s + (a.avg_mood ?? 0), 0) /
            moodDays.length
        );
        parts.push(`mood:${moodAvg}`);
      }

      const energyDays = u.aggregates.filter(
        (a) => a.avg_energy != null
      );
      if (energyDays.length > 0) {
        const energyAvg = _round1(
          energyDays.reduce((s, a) => s + (a.avg_energy ?? 0), 0) /
            energyDays.length
        );
        parts.push(`nrg:${energyAvg}`);
      }

      const flagCount = _sumField(u.aggregates, "flags_raised");
      if (flagCount > 0) {
        parts.push(`flags:${flagCount}`);
      }

      const gradedDays = u.aggregates.filter(
        (a) => a.ai_grade != null
      );
      if (gradedDays.length > 0) {
        const gradesList = gradedDays.map((a) => a.ai_grade).join(",");
        parts.push(`grades:${gradesList}`);
      }

      cLines.push(parts.join(" | "));
      dataPoints += parts.length;
    }
  }

  const text = cLines.join("\n");
  return {
    text,
    tokenEstimate: Math.ceil(text.length / 4),
    dataPoints,
  };
}

// ============================================================
// SPECIALIZED CONTEXT BUILDERS
// ============================================================

/**
 * Builds minimal context for real-time entry validation.
 * ~100 tokens. Just enough for Claude to sanity-check an entry.
 */
export async function buildValidationContext(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<AIContext> {
  const since = _daysAgo(3);

  const [recentRes, streakRes] = await Promise.all([
    supabase
      .from("time_entries")
      .select("title, hour, category, date")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .gte("date", since)
      .order("date", { ascending: false })
      .order("hour", { ascending: false })
      .limit(5),
    supabase
      .from("activity_streaks")
      .select("current_streak")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .single(),
  ]);

  const recent = (recentRes.data ?? []) as Pick<
    TimeEntry,
    "title" | "hour" | "category" | "date"
  >[];
  const currentStreak =
    (streakRes.data as { current_streak: number } | null)
      ?.current_streak ?? 0;

  const recentStr = recent
    .map(
      (e) =>
        `${e.date}@${e.hour}h:${e.category}:"${_truncate(e.title, 30)}"`
    )
    .join("; ");

  const text = `VALIDATION_CTX: streak:${currentStreak} | recent:[${recentStr}]`;
  return {
    text,
    tokenEstimate: Math.ceil(text.length / 4),
    dataPoints: recent.length + 1,
  };
}

/**
 * Builds context for burnout/disengagement risk assessment.
 * Focuses on mood, energy, stress, and work patterns over 14 days.
 */
export async function buildWellbeingContext(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<AIContext> {
  const since = _daysAgo(14);

  const [aggregatesRes, healthRes, profileSnapshotRes] = await Promise.all([
    supabase
      .from("daily_aggregates")
      .select(
        "date, total_hours, avg_mood, avg_energy, avg_stress, avg_focus_quality, total_interruptions, flags_raised, has_closeout, has_standup"
      )
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .gte("date", since)
      .order("date", { ascending: true }),
    supabase
      .from("daily_health")
      .select(
        "date, sleep_hours, sleep_quality, exercise_minutes, mental_clarity, motivation_level, stress_morning, stress_evening"
      )
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .gte("date", since)
      .order("date", { ascending: true }),
    supabase
      .from("ai_profile_snapshots")
      .select("burnout_risk, disengagement_risk, trajectory")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .order("date", { ascending: false })
      .limit(1)
      .single(),
  ]);

  type AggSubset = {
    date: string;
    total_hours: number;
    avg_mood: number | null;
    avg_energy: number | null;
    avg_stress: number | null;
    avg_focus_quality: number | null;
    total_interruptions: number;
    flags_raised: number;
    has_closeout: boolean;
    has_standup: boolean;
  };

  const aggs = (aggregatesRes.data ?? []) as AggSubset[];
  const healthData = (healthRes.data ?? []) as {
    date: string;
    sleep_hours: number | null;
    sleep_quality: number | null;
    exercise_minutes: number;
    mental_clarity: number | null;
    motivation_level: number | null;
    stress_morning: number | null;
    stress_evening: number | null;
  }[];
  const snapshot = profileSnapshotRes.data as {
    burnout_risk: number | null;
    disengagement_risk: number | null;
    trajectory: string | null;
  } | null;

  let dataPoints = 0;
  const cLines: string[] = ["WELLBEING(14d):"];

  // Daily timeline: date|hours|mood|energy|stress
  if (aggs.length > 0) {
    const timeline = aggs.map((a) => {
      const parts = [a.date.slice(5)]; // MM-DD
      parts.push(`${_round1(a.total_hours)}h`);
      if (a.avg_mood != null) parts.push(`m${_round1(a.avg_mood)}`);
      if (a.avg_energy != null) parts.push(`e${_round1(a.avg_energy)}`);
      if (a.avg_stress != null) parts.push(`s${_round1(a.avg_stress)}`);
      return parts.join(",");
    });
    cLines.push(`TIMELINE: ${timeline.join(" | ")}`);
    dataPoints += aggs.length * 4;
  }

  // Health data
  if (healthData.length > 0) {
    const avgSleep = _avgNonNull(healthData.map((h) => h.sleep_hours));
    const avgSleepQ = _avgNonNull(healthData.map((h) => h.sleep_quality));
    const avgExercise = Math.round(
      healthData.reduce((s, h) => s + h.exercise_minutes, 0) / healthData.length
    );
    const avgClarity = _avgNonNull(healthData.map((h) => h.mental_clarity));
    const avgMotivation = _avgNonNull(
      healthData.map((h) => h.motivation_level)
    );

    const healthParts: string[] = [];
    if (avgSleep != null) healthParts.push(`sleep:${avgSleep}h`);
    if (avgSleepQ != null) healthParts.push(`sleepQ:${avgSleepQ}`);
    if (avgExercise > 0)
      healthParts.push(`exercise:${avgExercise}min/d`);
    if (avgClarity != null) healthParts.push(`clarity:${avgClarity}`);
    if (avgMotivation != null)
      healthParts.push(`motivation:${avgMotivation}`);

    if (healthParts.length > 0) {
      cLines.push(`HEALTH: ${healthParts.join(" | ")}`);
      dataPoints += healthParts.length;
    }
  }

  // AI snapshot
  if (snapshot) {
    const snapParts: string[] = [];
    if (snapshot.burnout_risk != null)
      snapParts.push(
        `burnout_risk:${Math.round(snapshot.burnout_risk * 100)}%`
      );
    if (snapshot.disengagement_risk != null)
      snapParts.push(
        `disengage_risk:${Math.round(snapshot.disengagement_risk * 100)}%`
      );
    if (snapshot.trajectory)
      snapParts.push(`trajectory:${snapshot.trajectory}`);
    if (snapParts.length > 0) {
      cLines.push(`AI_SNAPSHOT: ${snapParts.join(" | ")}`);
      dataPoints += snapParts.length;
    }
  }

  const text = cLines.join("\n");
  return {
    text,
    tokenEstimate: Math.ceil(text.length / 4),
    dataPoints,
  };
}

// ============================================================
// Private helpers (prefixed with _ to avoid collision with
// the verbose builder's inline calculations)
// ============================================================

function _daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function _round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function _truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "..." : s;
}

function _sumField<T>(
  arr: T[],
  key: keyof T
): number {
  return arr.reduce(
    (s, item) => {
      const v = item[key];
      return s + (typeof v === "number" ? v : 0);
    },
    0
  );
}

function _avgField<T>(
  arr: T[],
  key: keyof T
): number | null {
  const valid = arr.filter(
    (item) => typeof item[key] === "number" && item[key] != null
  );
  if (valid.length === 0) return null;
  return _round1(
    valid.reduce((s, item) => s + (item[key] as number), 0) / valid.length
  );
}

function _avgNonNull(
  values: (number | null | undefined)[]
): number | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  return _round1(valid.reduce((s, v) => s + v, 0) / valid.length);
}

function _getISOWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
}
