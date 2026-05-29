import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { WorkCategory, GithubEventType } from "@/lib/types/database";
import { subDays, format, getDay } from "date-fns";

// ---------------------------------------------------------------------------
// Day-of-week labels (Spanish)
// ---------------------------------------------------------------------------

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// ---------------------------------------------------------------------------
// Event type → category mapping (same as github route)
// ---------------------------------------------------------------------------

const EVENT_CATEGORY_MAP: Record<GithubEventType, WorkCategory> = {
  commit: "deep_work",
  pr_opened: "deep_work",
  pr_merged: "review",
  pr_reviewed: "review",
  issue_opened: "planning",
  issue_closed: "admin",
};

const EVENT_PREFIX_MAP: Record<GithubEventType, string> = {
  commit: "Commit",
  pr_opened: "PR abierto",
  pr_merged: "PR merged",
  pr_reviewed: "Code review",
  issue_opened: "Issue creado",
  issue_closed: "Issue cerrado",
};

// ---------------------------------------------------------------------------
// GET — Smart suggestions based on historical patterns
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  const orgId = membership.org_id;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id") ?? user.id;
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];
  const since = format(subDays(new Date(date + "T12:00:00"), 30), "yyyy-MM-dd");

  // ---------------------------------------------------------------------------
  // Parallel queries
  // ---------------------------------------------------------------------------

  const [
    { data: historicalEntries },
    { data: todayEntries },
    { data: liveStatus },
    { data: todayGithubEvents },
  ] = await Promise.all([
    // Last 30 days of entries
    supabase
      .from("time_entries")
      .select("date, hour, category, title")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .gte("date", since)
      .lt("date", date)
      .order("date")
      .order("hour"),
    // Today's entries
    supabase
      .from("time_entries")
      .select("hour, category, title")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", date),
    // Current live status
    supabase
      .from("live_status")
      .select("status, current_task")
      .eq("user_id", userId)
      .maybeSingle(),
    // Today's GitHub events
    supabase
      .from("github_events")
      .select("*")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", date),
  ]);

  const entries = historicalEntries ?? [];
  const todayLogs = todayEntries ?? [];
  const githubEvents = todayGithubEvents ?? [];

  // ---------------------------------------------------------------------------
  // Pattern analysis
  // ---------------------------------------------------------------------------

  // Hours already logged today
  const loggedHoursSet = new Set(todayLogs.map((e) => e.hour));

  // Count category occurrences per hour across all days
  const hourCategoryCounts: Record<number, Record<string, number>> = {};
  // Count titles per category
  const categoryTitleCounts: Record<string, Record<string, number>> = {};
  // Track hours per day-of-week
  const dayOfWeekHours: Record<number, number[]> = {};
  // Track earliest/latest hours per day
  const dailyBounds: Record<string, { min: number; max: number }> = {};

  for (const entry of entries) {
    const hour = entry.hour;
    const category = entry.category as string;
    const dayOfWeek = getDay(new Date(entry.date + "T12:00:00"));

    // Hour → category frequency
    if (!hourCategoryCounts[hour]) hourCategoryCounts[hour] = {};
    hourCategoryCounts[hour][category] = (hourCategoryCounts[hour][category] ?? 0) + 1;

    // Category → title frequency
    if (!categoryTitleCounts[category]) categoryTitleCounts[category] = {};
    const title = entry.title;
    categoryTitleCounts[category][title] = (categoryTitleCounts[category][title] ?? 0) + 1;

    // Day of week hours
    if (!dayOfWeekHours[dayOfWeek]) dayOfWeekHours[dayOfWeek] = [];

    // Daily bounds
    if (!dailyBounds[entry.date]) {
      dailyBounds[entry.date] = { min: hour, max: hour };
    } else {
      dailyBounds[entry.date].min = Math.min(dailyBounds[entry.date].min, hour);
      dailyBounds[entry.date].max = Math.max(dailyBounds[entry.date].max, hour);
    }
  }

  // Count entries per day, grouped by day-of-week
  const dayEntryCounts: Record<number, number[]> = {};
  const datesProcessed = new Set<string>();
  for (const entry of entries) {
    if (datesProcessed.has(entry.date)) continue;
    datesProcessed.add(entry.date);
    const dayOfWeek = getDay(new Date(entry.date + "T12:00:00"));
    if (!dayEntryCounts[dayOfWeek]) dayEntryCounts[dayOfWeek] = [];
  }
  // Count hours per date
  const hoursPerDate: Record<string, number> = {};
  for (const entry of entries) {
    hoursPerDate[entry.date] = (hoursPerDate[entry.date] ?? 0) + 1;
  }
  // Build avg per day of week
  const dayOfWeekDateSets: Record<number, Set<string>> = {};
  for (const entry of entries) {
    const dow = getDay(new Date(entry.date + "T12:00:00"));
    if (!dayOfWeekDateSets[dow]) dayOfWeekDateSets[dow] = new Set();
    dayOfWeekDateSets[dow].add(entry.date);
  }

  const avgHoursPerDay: Record<string, number> = {};
  for (let dow = 0; dow < 7; dow++) {
    const dates = dayOfWeekDateSets[dow];
    if (!dates || dates.size === 0) {
      avgHoursPerDay[DAY_LABELS[dow]] = 0;
      continue;
    }
    let totalHours = 0;
    for (const d of dates) {
      totalHours += hoursPerDate[d] ?? 0;
    }
    avgHoursPerDay[DAY_LABELS[dow]] = Math.round((totalHours / dates.size) * 10) / 10;
  }

  // Typical start/end hour
  const allMins = Object.values(dailyBounds).map((b) => b.min);
  const allMaxs = Object.values(dailyBounds).map((b) => b.max);
  const typicalStart = allMins.length > 0 ? Math.round(allMins.reduce((a, b) => a + b, 0) / allMins.length) : 8;
  const typicalEnd = allMaxs.length > 0 ? Math.round(allMaxs.reduce((a, b) => a + b, 0) / allMaxs.length) : 18;

  // Category by hour (most common category for each hour)
  const categoryByHour: Record<string, string> = {};
  for (const [hourStr, counts] of Object.entries(hourCategoryCounts)) {
    let maxCat = "";
    let maxCount = 0;
    for (const [cat, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxCat = cat;
      }
    }
    categoryByHour[hourStr] = maxCat;
  }

  // Top titles per category (top 3)
  const topTitles: Record<string, string[]> = {};
  for (const [cat, titles] of Object.entries(categoryTitleCounts)) {
    const sorted = Object.entries(titles)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([title]) => title);
    topTitles[cat] = sorted;
  }

  const totalDaysAnalyzed = Object.keys(dailyBounds).length;

  // ---------------------------------------------------------------------------
  // Generate suggestions for missing hours
  // ---------------------------------------------------------------------------

  const missingHours: number[] = [];
  for (let h = typicalStart; h <= typicalEnd; h++) {
    if (!loggedHoursSet.has(h)) {
      missingHours.push(h);
    }
  }

  // GitHub events for unlogged hours
  const githubByHour: Record<number, typeof githubEvents[number]> = {};
  for (const event of githubEvents) {
    const h = event.hour ?? 9;
    if (!loggedHoursSet.has(h)) {
      githubByHour[h] = event;
    }
  }

  // Total days that had entries at each hour (for confidence)
  const totalDaysByHour: Record<number, number> = {};
  const hourDateSets: Record<number, Set<string>> = {};
  for (const entry of entries) {
    if (!hourDateSets[entry.hour]) hourDateSets[entry.hour] = new Set();
    hourDateSets[entry.hour].add(entry.date);
  }
  for (const [h, dates] of Object.entries(hourDateSets)) {
    totalDaysByHour[Number(h)] = dates.size;
  }

  interface Suggestion {
    hour: number;
    category: WorkCategory;
    title: string;
    confidence: number;
    reason: string;
    source: "pattern" | "github";
  }

  const suggestions: Suggestion[] = [];

  for (const hour of missingHours) {
    // Check if there's a GitHub event for this hour
    const githubEvent = githubByHour[hour];
    if (githubEvent) {
      const eventType = githubEvent.event_type as GithubEventType;
      suggestions.push({
        hour,
        category: EVENT_CATEGORY_MAP[eventType] ?? "deep_work",
        title: `${EVENT_PREFIX_MAP[eventType] ?? "Evento"}: ${githubEvent.title}`,
        confidence: 95,
        reason: `Evento GitHub detectado: ${githubEvent.repo}`,
        source: "github",
      });
      continue;
    }

    // Pattern-based suggestion
    const hourCategory = categoryByHour[String(hour)] as WorkCategory | undefined;
    if (hourCategory && totalDaysAnalyzed > 0) {
      const daysWithThisHour = totalDaysByHour[hour] ?? 0;
      const confidence = Math.min(
        Math.round((daysWithThisHour / totalDaysAnalyzed) * 100),
        99
      );

      const suggestedTitle = topTitles[hourCategory]?.[0] ?? hourCategory;

      suggestions.push({
        hour,
        category: hourCategory,
        title: suggestedTitle,
        confidence,
        reason: `Sueles hacer ${hourCategory} a las ${hour}:00 (${daysWithThisHour} de ${totalDaysAnalyzed} días)`,
        source: "pattern",
      });
    }
  }

  // Sort suggestions by hour
  suggestions.sort((a, b) => a.hour - b.hour);

  // ---------------------------------------------------------------------------
  // Expected hours today (based on day-of-week average)
  // ---------------------------------------------------------------------------

  const todayDow = getDay(new Date(date + "T12:00:00"));
  const expectedToday = Math.round(avgHoursPerDay[DAY_LABELS[todayDow]] ?? 8);

  return NextResponse.json({
    patterns: {
      typical_start_hour: typicalStart,
      typical_end_hour: typicalEnd,
      avg_hours_per_day: avgHoursPerDay,
      category_by_hour: categoryByHour,
      top_titles: topTitles,
      total_days_analyzed: totalDaysAnalyzed,
    },
    suggestions,
    gaps: {
      missing_hours: missingHours,
      expected_today: expectedToday,
      logged_today: todayLogs.length,
    },
    live_status: liveStatus ?? null,
  });
}
