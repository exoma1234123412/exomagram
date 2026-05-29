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
