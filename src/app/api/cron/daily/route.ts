import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET /api/cron/daily — Run daily at midnight
// Generates flags, sends Slack digest, updates streaks
// Call this from Vercel Cron or an external scheduler
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Use Monterrey timezone for correct date calculation
  const mtyNow = new Date();
  const mtyDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(mtyNow);
  const mtyYesterday = new Date(mtyDateStr + "T12:00:00");
  mtyYesterday.setDate(mtyYesterday.getDate() - 1);
  const date = mtyYesterday.toISOString().split("T")[0];

  const results: Record<string, unknown> = { date };

  const cronHeaders = { Authorization: `Bearer ${process.env.CRON_SECRET}` };

  // 1. Generate flags via the flags API
  try {
    const flagsRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(request.url).origin : "http://localhost:3000"}/api/flags/generate?date=${date}`,
      { method: "POST", headers: cronHeaders }
    );
    results.flags = await flagsRes.json();
  } catch (e) {
    results.flags_error = (e as Error).message;
  }

  // Fetch orgs once and reuse across all steps
  const { data: orgs } = await supabase.from("organizations").select("id");
  const orgList = orgs ?? [];

  // 2. Send Slack digest if webhook is configured
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    try {
      for (const org of orgList) {
        await fetch(
          `${new URL(request.url).origin}/api/slack/webhook`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...cronHeaders },
            body: JSON.stringify({ webhook_url: slackWebhook, org_id: org.id, date }),
          }
        );
      }
      results.slack = "sent";
    } catch (e) {
      results.slack_error = (e as Error).message;
    }
  }

  // 3. Run AI review
  try {
    for (const org of orgList) {
      await fetch(
        `${new URL(request.url).origin}/api/ai-review?org_id=${org.id}&date=${date}`,
        { method: "POST", headers: cronHeaders }
      );
    }
    results.ai_review = "completed";
  } catch (e) {
    results.ai_review_error = (e as Error).message;
  }

  // 4. Run AI Audit (grades everyone A-F, impacts trust score)
  try {
    for (const org of orgList) {
      await fetch(
        `${new URL(request.url).origin}/api/ai-audit?org_id=${org.id}&date=${date}`,
        { method: "POST", headers: cronHeaders }
      );
    }
    results.ai_audit = "completed";
  } catch (e) {
    results.ai_audit_error = (e as Error).message;
  }

  // 5. AI Process Day — generate insights, update profiles, predict signals
  try {
    for (const org of orgList) {
      await fetch(
        `${new URL(request.url).origin}/api/ai-process-day?org_id=${org.id}&date=${date}`,
        { method: "POST", headers: cronHeaders }
      );
    }
    results.ai_process_day = "completed";
  } catch (e) {
    results.ai_process_day_error = (e as Error).message;
  }

  // 6. Generate weekly summary (every Sunday)
  const mtyDay = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Monterrey" }).format(mtyNow);
  const isSunday = mtyDay === "Sun";
  if (isSunday) {
    try {
      const lastMonday = new Date();
      lastMonday.setDate(lastMonday.getDate() - 6);
      const weekStart = lastMonday.toISOString().split("T")[0];
      for (const org of orgList) {
        await fetch(
          `${new URL(request.url).origin}/api/weekly-summary/generate?org_id=${org.id}&week_start=${weekStart}`,
          { method: "POST", headers: cronHeaders }
        );
      }
      results.weekly_summary = "generated";
    } catch (e) {
      results.weekly_summary_error = (e as Error).message;
    }
  }

  // 7. V11 — Generate daily aggregates for yesterday
  try {
    for (const org of orgList) {
      await generateDailyAggregates(supabase, org.id, date);
    }
    results.daily_aggregates = "generated";
  } catch (e) {
    results.daily_aggregates_error = (e as Error).message;
  }

  // 8. V11 — Generate weekly aggregates (every Sunday)
  if (isSunday) {
    try {
      const lastMonday = new Date(date + "T12:00:00");
      lastMonday.setDate(lastMonday.getDate() - (lastMonday.getDay() + 6) % 7);
      const weekStart = lastMonday.toISOString().split("T")[0];
      for (const org of orgList) {
        await generateWeeklyAggregates(supabase, org.id, weekStart);
      }
      results.weekly_aggregates = "generated";
    } catch (e) {
      results.weekly_aggregates_error = (e as Error).message;
    }
  }

  // 9. V11 — Enforce weekly reflections (flag on Fridays if missing)
  const isFriday = mtyDay === "Fri";
  if (isFriday) {
    try {
      for (const org of orgList) {
        await enforceWeeklyReflections(supabase, org.id, date);
      }
      results.weekly_reflection_enforcement = "completed";
    } catch (e) {
      results.weekly_reflection_error = (e as Error).message;
    }
  }

  // 10. V12 — Compute personal baselines (rolling 30-day)
  try {
    for (const org of orgList) {
      await computePersonalBaselines(supabase, org.id, date);
    }
    results.baselines = "computed";
  } catch (e) {
    results.baselines_error = (e as Error).message;
  }

  // 11. V12 — Compute correlation insights (weekly on Sundays)
  if (isSunday) {
    try {
      for (const org of orgList) {
        await computeCorrelationInsights(supabase, org.id, date);
      }
      results.correlations = "computed";
    } catch (e) {
      results.correlations_error = (e as Error).message;
    }
  }

  // 12. V12 — Meeting cross-validation
  try {
    for (const org of orgList) {
      await crossValidateMeetings(supabase, org.id, date);
    }
    results.meeting_validation = "completed";
  } catch (e) {
    results.meeting_validation_error = (e as Error).message;
  }

  return NextResponse.json({ success: true, ...results });
}

// ============================================================
// V11 — Daily aggregate generator
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateDailyAggregates(supabase: any, orgId: string, date: string) {
  const [
    { data: members },
    { data: entries },
    { data: standups },
    { data: closeouts },
    { data: healthChecks },
    { data: promises },
    { data: trustScores },
    { data: aiInsights },
    { data: gitMetrics },
    { data: commsLogs },
    { data: focusSessions },
    { data: flags },
    { data: reactions },
  ] = await Promise.all([
    supabase.from("org_members").select("user_id").eq("org_id", orgId),
    supabase.from("time_entries").select("*").eq("org_id", orgId).eq("date", date).is("deleted_at", null),
    supabase.from("standups").select("user_id").eq("org_id", orgId).eq("date", date),
    supabase.from("daily_closeouts").select("user_id").eq("org_id", orgId).eq("date", date),
    supabase.from("daily_health").select("user_id").eq("org_id", orgId).eq("date", date),
    supabase.from("daily_promises").select("user_id, status").eq("org_id", orgId).eq("date", date),
    supabase.from("trust_score_history").select("user_id, score").eq("org_id", orgId).eq("date", date),
    supabase.from("ai_daily_insights").select("user_id, grade, score").eq("org_id", orgId).eq("date", date),
    supabase.from("git_daily_metrics").select("*").eq("org_id", orgId).eq("date", date),
    supabase.from("communication_log").select("*").eq("org_id", orgId).eq("date", date),
    supabase.from("focus_sessions").select("*").eq("org_id", orgId).gte("started_at", `${date}T00:00:00`).lte("started_at", `${date}T23:59:59`),
    supabase.from("accountability_flags").select("user_id, resolved").eq("org_id", orgId).eq("date", date),
    supabase.from("entry_reactions").select("entry_id, reaction"),
  ]);

  const standupSet = new Set((standups ?? []).map((s: { user_id: string }) => s.user_id));
  const closeoutSet = new Set((closeouts ?? []).map((c: { user_id: string }) => c.user_id));
  const healthSet = new Set((healthChecks ?? []).map((h: { user_id: string }) => h.user_id));
  const entryIds = new Set((entries ?? []).map((e: { id: string }) => e.id));

  for (const member of members ?? []) {
    const userId = member.user_id;
    const ue = (entries ?? []).filter((e: { user_id: string }) => e.user_id === userId);
    const userPromises = (promises ?? []).filter((p: { user_id: string }) => p.user_id === userId);
    const userTrust = (trustScores ?? []).find((t: { user_id: string }) => t.user_id === userId);
    const userAi = (aiInsights ?? []).find((a: { user_id: string }) => a.user_id === userId);
    const userGit = (gitMetrics ?? []).find((g: { user_id: string }) => g.user_id === userId);
    const userComms = (commsLogs ?? []).find((c: { user_id: string }) => c.user_id === userId);
    const userFocus = (focusSessions ?? []).filter((f: { user_id: string }) => f.user_id === userId);
    const userFlags = (flags ?? []).filter((f: { user_id: string }) => f.user_id === userId);

    // Category counts
    const catCount = (cat: string) => ue.filter((e: { category: string }) => e.category === cat).length;

    // Averages helper
    const avg = (field: string) => {
      const vals = ue.filter((e: Record<string, unknown>) => e[field] != null).map((e: Record<string, unknown>) => e[field] as number);
      return vals.length > 0 ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10 : null;
    };

    // Collaborators & projects
    const allCollabs = new Set<string>();
    const allProjects = new Set<string>();
    for (const e of ue) {
      for (const c of (e.collaborators ?? [])) allCollabs.add(c);
      if (e.project) allProjects.add(e.project);
    }

    // Reactions for this user's entries
    const userEntryIds = new Set(ue.map((e: { id: string }) => e.id));
    const userReactions = (reactions ?? []).filter((r: { entry_id: string }) => userEntryIds.has(r.entry_id));

    await supabase.from("daily_aggregates").upsert({
      user_id: userId,
      org_id: orgId,
      date,
      total_hours: ue.length,
      deep_work_hours: catCount("deep_work"),
      meeting_hours: catCount("meeting"),
      review_hours: catCount("review"),
      admin_hours: catCount("admin"),
      planning_hours: catCount("planning"),
      learning_hours: catCount("learning"),
      break_hours: catCount("break"),
      blocked_hours: catCount("blocked"),
      hours_with_proof: ue.filter((e: { proof_urls: string[] | null }) => e.proof_urls && e.proof_urls.length > 0).length,
      late_entries: ue.filter((e: { is_late: boolean }) => e.is_late).length,
      flagged_entries: ue.filter((e: { verification_status: string }) => e.verification_status === "flagged").length,
      avg_mood: avg("mood"),
      avg_energy: avg("energy"),
      avg_stress: avg("stress_level"),
      avg_focus_quality: avg("focus_quality"),
      avg_difficulty: avg("difficulty"),
      avg_value_rating: avg("value_rating"),
      avg_confidence: avg("confidence"),
      total_interruptions: ue.reduce((s: number, e: { interruptions: number }) => s + (e.interruptions ?? 0), 0),
      total_context_switches: ue.reduce((s: number, e: { context_switches: number }) => s + (e.context_switches ?? 0), 0),
      unique_collaborators: allCollabs.size,
      unique_projects: allProjects.size,
      client_facing_hours: ue.filter((e: { client_facing: boolean }) => e.client_facing).length,
      async_possible_hours: ue.filter((e: { could_be_async: boolean | null }) => e.could_be_async === true).length,
      has_standup: standupSet.has(userId),
      has_closeout: closeoutSet.has(userId),
      has_health_check: healthSet.has(userId),
      promises_made: userPromises.length,
      promises_kept: userPromises.filter((p: { status: string }) => p.status === "delivered").length,
      promises_broken: userPromises.filter((p: { status: string }) => p.status === "broken").length,
      trust_score: userTrust?.score ?? null,
      ai_grade: userAi?.grade ?? null,
      ai_score: userAi?.score ?? null,
      git_commits: userGit?.commits_count ?? 0,
      git_lines_added: userGit?.lines_added ?? 0,
      git_lines_removed: userGit?.lines_removed ?? 0,
      git_prs_opened: userGit?.prs_opened ?? 0,
      git_prs_merged: userGit?.prs_merged ?? 0,
      messages_sent: userComms?.messages_sent ?? 0,
      meetings_attended: userComms?.meetings_attended ?? 0,
      meeting_minutes: userComms?.meeting_minutes ?? 0,
      focus_sessions_count: userFocus.length,
      focus_sessions_completed: userFocus.filter((f: { was_completed: boolean }) => f.was_completed).length,
      focus_total_interruptions: userFocus.reduce((s: number, f: { interruption_count: number }) => s + (f.interruption_count ?? 0), 0),
      flow_states_achieved: userFocus.filter((f: { flow_state_achieved: boolean }) => f.flow_state_achieved).length,
      flags_raised: userFlags.length,
      flags_resolved: userFlags.filter((f: { resolved: boolean }) => f.resolved).length,
      reactions_verified: userReactions.filter((r: { reaction: string }) => r.reaction === "verified").length,
      reactions_suspicious: userReactions.filter((r: { reaction: string }) => r.reaction === "suspicious").length,
      reactions_impressive: userReactions.filter((r: { reaction: string }) => r.reaction === "impressive").length,
      reactions_helped: userReactions.filter((r: { reaction: string }) => r.reaction === "helped_me").length,
      computed_at: new Date().toISOString(),
    }, { onConflict: "user_id,org_id,date" });
  }
}

// ============================================================
// V11 — Weekly aggregate generator
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateWeeklyAggregates(supabase: any, orgId: string, weekStart: string) {
  const weekEnd = new Date(weekStart + "T12:00:00");
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  const { data: members } = await supabase.from("org_members").select("user_id").eq("org_id", orgId);
  const { data: dailyAggs } = await supabase
    .from("daily_aggregates")
    .select("*")
    .eq("org_id", orgId)
    .gte("date", weekStart)
    .lte("date", weekEndStr);

  const { data: reflections } = await supabase
    .from("weekly_reflections")
    .select("user_id, satisfaction, work_life_balance")
    .eq("org_id", orgId)
    .eq("week_start", weekStart);

  const reflectionMap = new Map<string, { user_id: string; satisfaction: number | null; work_life_balance: number | null }>((reflections ?? []).map((r: { user_id: string; satisfaction: number | null; work_life_balance: number | null }) => [r.user_id, r]));

  for (const member of members ?? []) {
    const userId = member.user_id;
    const days = (dailyAggs ?? []).filter((d: { user_id: string }) => d.user_id === userId);
    if (days.length === 0) continue;

    const sum = (field: string) => days.reduce((s: number, d: Record<string, unknown>) => s + ((d[field] as number) ?? 0), 0);
    const avgField = (field: string) => {
      const vals = days.filter((d: Record<string, unknown>) => d[field] != null).map((d: Record<string, unknown>) => d[field] as number);
      return vals.length > 0 ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10 : null;
    };

    // Grade distribution
    const grades: Record<string, number> = {};
    for (const d of days) {
      if (d.ai_grade) grades[d.ai_grade] = (grades[d.ai_grade] ?? 0) + 1;
    }

    // Trajectory trend from daily ai insights
    const trajectories = days.map((d: Record<string, unknown>) => d.ai_grade).filter(Boolean);
    const aiScores = days.filter((d: Record<string, unknown>) => d.ai_score != null).map((d: Record<string, unknown>) => d.ai_score as number);
    let trajectoryTrend = "stable";
    if (aiScores.length >= 3) {
      const firstHalf = aiScores.slice(0, Math.floor(aiScores.length / 2));
      const secondHalf = aiScores.slice(Math.floor(aiScores.length / 2));
      const avgFirst = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;
      if (avgSecond - avgFirst > 5) trajectoryTrend = "improving";
      else if (avgFirst - avgSecond > 5) trajectoryTrend = "declining";
    }

    const totalPromises = sum("promises_made");
    const keptPromises = sum("promises_kept");
    const reflection = reflectionMap.get(userId);

    await supabase.from("weekly_aggregates").upsert({
      user_id: userId,
      org_id: orgId,
      week_start: weekStart,
      total_hours: sum("total_hours"),
      deep_work_hours: sum("deep_work_hours"),
      meeting_hours: sum("meeting_hours"),
      hours_with_proof: sum("hours_with_proof"),
      late_entries: sum("late_entries"),
      avg_daily_hours: days.length > 0 ? Math.round((sum("total_hours") / days.length) * 10) / 10 : null,
      avg_mood: avgField("avg_mood"),
      avg_energy: avgField("avg_energy"),
      avg_stress: avgField("avg_stress"),
      avg_trust_score: avgField("trust_score"),
      standups_completed: days.filter((d: { has_standup: boolean }) => d.has_standup).length,
      closeouts_completed: days.filter((d: { has_closeout: boolean }) => d.has_closeout).length,
      health_checks_completed: days.filter((d: { has_health_check: boolean }) => d.has_health_check).length,
      days_logged: days.filter((d: { total_hours: number }) => d.total_hours > 0).length,
      total_promises: totalPromises,
      promises_kept: keptPromises,
      promises_broken: sum("promises_broken"),
      promise_reliability: totalPromises > 0 ? Math.round((keptPromises / totalPromises) * 10000) / 100 : null,
      total_commits: sum("git_commits"),
      total_lines_added: sum("git_lines_added"),
      total_prs: sum("git_prs_opened"),
      avg_ai_score: avgField("ai_score"),
      grades: Object.keys(grades).length > 0 ? grades : null,
      trajectory_trend: trajectoryTrend,
      burnout_risk_trend: null, // Computed from ai_profile_history separately
      total_focus_sessions: sum("focus_sessions_count"),
      total_flow_states: sum("flow_states_achieved"),
      total_flags: sum("flags_raised"),
      total_flags_resolved: sum("flags_resolved"),
      has_weekly_reflection: !!reflection,
      reflection_satisfaction: reflection?.satisfaction ?? null,
      reflection_work_life_balance: reflection?.work_life_balance ?? null,
      computed_at: new Date().toISOString(),
    }, { onConflict: "user_id,org_id,week_start" });
  }
}

// ============================================================
// V11 — Weekly reflection enforcement
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enforceWeeklyReflections(supabase: any, orgId: string, date: string) {
  // Get the Monday of this week
  const friday = new Date(date + "T12:00:00");
  const monday = new Date(friday);
  monday.setDate(friday.getDate() - (friday.getDay() + 6) % 7);
  const weekStart = monday.toISOString().split("T")[0];

  const [{ data: members }, { data: reflections }, { data: existingFlags }] = await Promise.all([
    supabase.from("org_members").select("user_id").eq("org_id", orgId),
    supabase.from("weekly_reflections").select("user_id").eq("org_id", orgId).eq("week_start", weekStart),
    supabase.from("accountability_flags").select("user_id, flag_type").eq("org_id", orgId).eq("date", date).eq("flag_type", "no_weekly_reflection"),
  ]);

  const reflectionSet = new Set((reflections ?? []).map((r: { user_id: string }) => r.user_id));
  const existingFlagSet = new Set((existingFlags ?? []).map((f: { user_id: string }) => f.user_id));

  for (const member of members ?? []) {
    if (!reflectionSet.has(member.user_id) && !existingFlagSet.has(member.user_id)) {
      await supabase.from("accountability_flags").insert({
        user_id: member.user_id,
        org_id: orgId,
        flag_type: "no_weekly_reflection",
        date,
        details: `No ha completado la reflexión semanal (semana del ${weekStart})`,
      });
    }
  }
}

// ============================================================
// V12 — Personal baseline computation (rolling 30-day window)
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computePersonalBaselines(supabase: any, orgId: string, date: string) {
  const windowStart = new Date(date + "T12:00:00");
  windowStart.setDate(windowStart.getDate() - 30);
  const windowStartStr = windowStart.toISOString().split("T")[0];

  const { data: members } = await supabase.from("org_members").select("user_id").eq("org_id", orgId);

  // Fetch 30-day aggregates for all members at once
  const { data: aggregates } = await supabase
    .from("daily_aggregates")
    .select("*")
    .eq("org_id", orgId)
    .gte("date", windowStartStr)
    .lte("date", date);

  // Fetch health data for the window
  const { data: healthData } = await supabase
    .from("daily_health")
    .select("user_id, sleep_hours, sleep_quality, exercise_minutes")
    .eq("org_id", orgId)
    .gte("date", windowStartStr)
    .lte("date", date);

  for (const member of members ?? []) {
    const userId = member.user_id;
    const days = (aggregates ?? []).filter((d: { user_id: string }) => d.user_id === userId);
    if (days.length < 3) continue; // Need minimum data

    const daysWithData = days.filter((d: { total_hours: number }) => d.total_hours > 0);
    const health = (healthData ?? []).filter((h: { user_id: string }) => h.user_id === userId);

    // Hours stats
    const hours = daysWithData.map((d: { total_hours: number }) => d.total_hours);
    const avgHours = hours.length > 0 ? hours.reduce((a: number, b: number) => a + b, 0) / hours.length : null;
    const stddevHours = hours.length > 1
      ? Math.sqrt(hours.reduce((s: number, h: number) => s + Math.pow(h - (avgHours ?? 0), 2), 0) / (hours.length - 1))
      : null;
    const sortedHours = [...hours].sort((a: number, b: number) => a - b);
    const medianHours = sortedHours.length > 0 ? sortedHours[Math.floor(sortedHours.length / 2)] : null;

    // Category distribution
    const totalHours = hours.reduce((a: number, b: number) => a + b, 0);
    const catDist: Record<string, number> = {};
    if (totalHours > 0) {
      for (const cat of ["deep_work", "meeting", "review", "admin", "planning", "learning", "break", "blocked"]) {
        const catField = `${cat}_hours` as string;
        const catTotal = daysWithData.reduce((s: number, d: Record<string, number>) => s + (d[catField] ?? 0), 0);
        if (catTotal > 0) catDist[cat] = Math.round((catTotal / totalHours) * 100) / 100;
      }
    }

    // Average helper
    const avgOf = (field: string) => {
      const vals = days.filter((d: Record<string, unknown>) => d[field] != null).map((d: Record<string, unknown>) => d[field] as number);
      return vals.length > 0 ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10 : null;
    };

    // Rate helper (count of true / total)
    const rateOf = (field: string) => {
      const total = days.length;
      const trueCount = days.filter((d: Record<string, unknown>) => d[field] === true).length;
      return total > 0 ? Math.round((trueCount / total) * 10000) / 100 : null;
    };

    // Peak productivity: hours with most deep_work across all days
    // Simplified: use entries data from aggregates
    const hourCounts: Record<number, number> = {};
    // We don't have hourly breakdown in aggregates, so track from entry-level data
    // For now, use the typical_start as first hour with data, typical_end as last
    const startHours = daysWithData.map(() => 8); // Default
    const typicalStart = startHours.length > 0 ? Math.min(...startHours) : null;
    const typicalEnd = 18; // Default

    // Trust trend
    const trustScores = days.filter((d: { trust_score: number | null }) => d.trust_score != null).map((d: { trust_score: number }) => d.trust_score);
    let trustTrend = "stable";
    if (trustScores.length >= 5) {
      const firstHalf = trustScores.slice(0, Math.floor(trustScores.length / 2));
      const secondHalf = trustScores.slice(Math.floor(trustScores.length / 2));
      const avgFirst = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;
      if (avgSecond - avgFirst > 3) trustTrend = "improving";
      else if (avgFirst - avgSecond > 3) trustTrend = "declining";
    }

    // Most common grade
    const gradeCounts: Record<string, number> = {};
    for (const d of days) {
      if (d.ai_grade) gradeCounts[d.ai_grade] = (gradeCounts[d.ai_grade] ?? 0) + 1;
    }
    const typicalGrade = Object.entries(gradeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Promise reliability
    const totalPromises = days.reduce((s: number, d: { promises_made: number }) => s + (d.promises_made ?? 0), 0);
    const keptPromises = days.reduce((s: number, d: { promises_kept: number }) => s + (d.promises_kept ?? 0), 0);
    const promiseReliability = totalPromises > 0 ? Math.round((keptPromises / totalPromises) * 10000) / 100 : null;

    // Health averages
    const avgSleep = health.length > 0
      ? Math.round((health.filter((h: { sleep_hours: number | null }) => h.sleep_hours != null).reduce((s: number, h: { sleep_hours: number }) => s + h.sleep_hours, 0) /
          Math.max(1, health.filter((h: { sleep_hours: number | null }) => h.sleep_hours != null).length)) * 10) / 10
      : null;
    const avgSleepQuality = health.length > 0
      ? Math.round((health.filter((h: { sleep_quality: number | null }) => h.sleep_quality != null).reduce((s: number, h: { sleep_quality: number }) => s + h.sleep_quality, 0) /
          Math.max(1, health.filter((h: { sleep_quality: number | null }) => h.sleep_quality != null).length)) * 10) / 10
      : null;
    const avgExercise = health.length > 0
      ? Math.round((health.reduce((s: number, h: { exercise_minutes: number }) => s + (h.exercise_minutes ?? 0), 0) / health.length) * 10) / 10
      : null;

    // Data completeness: how many of the 30 days had any data
    const completeness = Math.round((daysWithData.length / 30) * 10000) / 100;

    await supabase.from("personal_baselines").upsert({
      user_id: userId,
      org_id: orgId,
      computed_date: date,
      window_days: 30,
      avg_daily_hours: avgHours ? Math.round(avgHours * 10) / 10 : null,
      stddev_daily_hours: stddevHours ? Math.round(stddevHours * 10) / 10 : null,
      median_daily_hours: medianHours,
      category_distribution: Object.keys(catDist).length > 0 ? catDist : null,
      avg_quality_score: avgOf("ai_score"),
      avg_proof_rate: totalHours > 0 ? Math.round((days.reduce((s: number, d: { hours_with_proof: number }) => s + (d.hours_with_proof ?? 0), 0) / totalHours) * 10000) / 100 : null,
      avg_late_rate: totalHours > 0 ? Math.round((days.reduce((s: number, d: { late_entries: number }) => s + (d.late_entries ?? 0), 0) / totalHours) * 10000) / 100 : null,
      avg_mood: avgOf("avg_mood"),
      avg_energy: avgOf("avg_energy"),
      avg_stress: avgOf("avg_stress"),
      avg_focus_quality: avgOf("avg_focus_quality"),
      avg_difficulty: avgOf("avg_difficulty"),
      avg_confidence: avgOf("avg_confidence"),
      typical_start_hour: typicalStart,
      typical_end_hour: typicalEnd,
      peak_productivity_hours: null,
      meeting_heavy_days: null,
      avg_interruptions_per_hour: totalHours > 0 ? Math.round((days.reduce((s: number, d: { total_interruptions: number }) => s + (d.total_interruptions ?? 0), 0) / totalHours) * 10) / 10 : null,
      avg_context_switches_per_hour: totalHours > 0 ? Math.round((days.reduce((s: number, d: { total_context_switches: number }) => s + (d.total_context_switches ?? 0), 0) / totalHours) * 10) / 10 : null,
      avg_daily_collaborators: avgOf("unique_collaborators"),
      standup_rate: rateOf("has_standup"),
      closeout_rate: rateOf("has_closeout"),
      health_check_rate: rateOf("has_health_check"),
      promise_reliability: promiseReliability,
      avg_trust_score: avgOf("trust_score"),
      trust_trend: trustTrend,
      avg_ai_score: avgOf("ai_score"),
      typical_grade: typicalGrade,
      avg_sleep_hours: avgSleep,
      avg_sleep_quality: avgSleepQuality,
      avg_exercise_minutes: avgExercise,
      avg_daily_commits: avgOf("git_commits"),
      avg_daily_lines: avgOf("git_lines_added"),
      avg_daily_prs: avgOf("git_prs_opened"),
      data_completeness: completeness,
      entries_in_window: hours.reduce((a: number, b: number) => a + b, 0),
      days_with_data: daysWithData.length,
    }, { onConflict: "user_id,org_id,computed_date" });
  }
}

// ============================================================
// V12 — Correlation engine (weekly)
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeCorrelationInsights(supabase: any, orgId: string, date: string) {
  const windowStart = new Date(date + "T12:00:00");
  windowStart.setDate(windowStart.getDate() - 30);
  const windowStartStr = windowStart.toISOString().split("T")[0];

  const { data: members } = await supabase.from("org_members").select("user_id").eq("org_id", orgId);
  const { data: aggregates } = await supabase
    .from("daily_aggregates")
    .select("user_id, date, total_hours, deep_work_hours, meeting_hours, avg_mood, avg_energy, avg_stress, ai_score, trust_score, focus_sessions_completed, flow_states_achieved")
    .eq("org_id", orgId)
    .gte("date", windowStartStr)
    .lte("date", date);

  const { data: healthData } = await supabase
    .from("daily_health")
    .select("user_id, date, sleep_hours, sleep_quality, exercise_minutes, stress_morning, motivation_level")
    .eq("org_id", orgId)
    .gte("date", windowStartStr)
    .lte("date", date);

  // Correlation pairs to compute
  const pairs = [
    { a: "sleep_hours", b: "deep_work_hours", label_a: "Horas de sueño", label_b: "Deep work" },
    { a: "sleep_quality", b: "ai_score", label_a: "Calidad de sueño", label_b: "AI Score" },
    { a: "exercise_minutes", b: "avg_mood", label_a: "Ejercicio", label_b: "Ánimo" },
    { a: "stress_morning", b: "total_hours", label_a: "Estrés matutino", label_b: "Horas totales" },
    { a: "motivation_level", b: "deep_work_hours", label_a: "Motivación", label_b: "Deep work" },
    { a: "meeting_hours", b: "deep_work_hours", label_a: "Horas en reuniones", label_b: "Deep work" },
    { a: "avg_mood", b: "ai_score", label_a: "Ánimo", label_b: "AI Score" },
    { a: "avg_energy", b: "deep_work_hours", label_a: "Energía", label_b: "Deep work" },
    { a: "avg_stress", b: "trust_score", label_a: "Estrés", label_b: "Trust Score" },
    { a: "sleep_hours", b: "avg_mood", label_a: "Horas de sueño", label_b: "Ánimo" },
  ];

  // Pearson correlation helper
  function pearson(xs: number[], ys: number[]): { r: number; n: number } | null {
    if (xs.length !== ys.length || xs.length < 5) return null;
    const n = xs.length;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
    const sumX2 = xs.reduce((s, x) => s + x * x, 0);
    const sumY2 = ys.reduce((s, y) => s + y * y, 0);
    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denom === 0) return null;
    return { r: (n * sumXY - sumX * sumY) / denom, n };
  }

  function strengthLabel(r: number): string {
    const abs = Math.abs(r);
    if (abs >= 0.7) return r > 0 ? "strong_positive" : "strong_negative";
    if (abs >= 0.4) return r > 0 ? "moderate_positive" : "moderate_negative";
    return "weak";
  }

  for (const member of members ?? []) {
    const userId = member.user_id;
    const days = (aggregates ?? []).filter((d: { user_id: string }) => d.user_id === userId);
    const userHealth = (healthData ?? []).filter((h: { user_id: string }) => h.user_id === userId);

    // Merge data by date
    const byDate = new Map<string, Record<string, number | null>>();
    for (const d of days) {
      byDate.set(d.date, { ...d });
    }
    for (const h of userHealth) {
      const existing = byDate.get(h.date) ?? {};
      byDate.set(h.date, { ...existing, ...h });
    }

    for (const pair of pairs) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [, data] of byDate) {
        const x = data[pair.a] as number | null | undefined;
        const y = data[pair.b] as number | null | undefined;
        if (x != null && y != null) {
          xs.push(x);
          ys.push(y);
        }
      }

      const result = pearson(xs, ys);
      if (!result) continue;

      const strength = strengthLabel(result.r);
      if (strength === "weak") continue; // Only store meaningful correlations

      await supabase.from("correlation_insights").insert({
        user_id: userId,
        org_id: orgId,
        computed_date: date,
        window_days: 30,
        dimension_a: pair.a,
        dimension_b: pair.b,
        correlation_coefficient: Math.round(result.r * 1000) / 1000,
        sample_size: result.n,
        strength,
        confidence: Math.min(100, Math.round(result.n * 3.3)),
        data_quality: result.n >= 20 ? "high" : result.n >= 10 ? "medium" : "low",
      });
    }
  }
}

// ============================================================
// V12 — Meeting cross-validation
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function crossValidateMeetings(supabase: any, orgId: string, date: string) {
  // Get all meeting entries for the day
  const { data: meetings } = await supabase
    .from("time_entries")
    .select("id, user_id, hour, title, description, collaborators")
    .eq("org_id", orgId)
    .eq("date", date)
    .eq("category", "meeting")
    .is("deleted_at", null);

  if (!meetings || meetings.length < 2) return;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", [...new Set((meetings ?? []).map((m: { user_id: string }) => m.user_id))]);

  const nameMap = new Map<string, string>();
  const idByName = new Map<string, string>();
  for (const p of profiles ?? []) {
    nameMap.set(p.id, p.full_name ?? "?");
    if (p.full_name) idByName.set(p.full_name.toLowerCase(), p.id);
  }

  // Check existing verifications to avoid duplicates
  const { data: existingVerifications } = await supabase
    .from("meeting_verifications")
    .select("entry_id")
    .eq("org_id", orgId);
  const verifiedEntryIds = new Set((existingVerifications ?? []).map((v: { entry_id: string }) => v.entry_id));

  // For each meeting, check if another user logged the same hour as meeting
  for (const meeting of meetings) {
    if (verifiedEntryIds.has(meeting.id)) continue;

    const sameHourMeetings = meetings.filter(
      (m: { user_id: string; hour: number; id: string }) =>
        m.user_id !== meeting.user_id && m.hour === meeting.hour
    );

    if (sameHourMeetings.length > 0) {
      // Mutual meeting found — create verification request
      for (const other of sameHourMeetings) {
        if (verifiedEntryIds.has(other.id)) continue;

        await supabase.from("meeting_verifications").insert({
          entry_id: meeting.id,
          requester_id: meeting.user_id,
          verifier_id: other.user_id,
          org_id: orgId,
          status: "confirmed", // Auto-confirmed since both logged it
        });

        verifiedEntryIds.add(meeting.id);
      }
    } else {
      // No one else logged a meeting at this hour — flag as unverified
      const collaborators = meeting.collaborators as string[] ?? [];
      if (collaborators.length > 0) {
        // Check if any named collaborator has a different category at this hour
        for (const collabName of collaborators) {
          const collabId = idByName.get(collabName.toLowerCase());
          if (!collabId) continue;

          const collabEntry = meetings.find(
            (m: { user_id: string; hour: number }) => m.user_id === collabId && m.hour === meeting.hour
          );
          if (!collabEntry) {
            // Collaborator didn't log meeting at this hour — flag inconsistency
            const { data: existingFlag } = await supabase
              .from("accountability_flags")
              .select("id")
              .eq("user_id", meeting.user_id)
              .eq("org_id", orgId)
              .eq("date", date)
              .eq("flag_type", "suspicious_pattern")
              .limit(1)
              .maybeSingle();

            if (!existingFlag) {
              await supabase.from("accountability_flags").insert({
                user_id: meeting.user_id,
                org_id: orgId,
                flag_type: "suspicious_pattern",
                date,
                details: `Reunión a las ${meeting.hour}:00 con ${collabName}, pero ${collabName} no registró reunión a esa hora`,
              });
            }
          }
        }
      }
    }
  }
}
