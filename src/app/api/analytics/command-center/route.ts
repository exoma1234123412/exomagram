import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// ─── Pearson correlation coefficient ────────────────────────────
function pearson(pairs: [number, number][]): number {
  const n = pairs.length;
  if (n < 3) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (const [x, y] of pairs) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }
  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denom === 0) return 0;
  return Math.round(((n * sumXY - sumX * sumY) / denom) * 100) / 100;
}

// ─── Day of week from date string ──────────────────────────────
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
function dayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return DAY_NAMES[d.getDay()];
}

// GET /api/analytics/command-center?org_id=...&start=...&end=...&user_id=...&category=...
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // ── Auth ────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const filterUserId = searchParams.get("user_id") || null;
  const filterCategory = searchParams.get("category") || null;

  if (!orgId || !start || !end) {
    return NextResponse.json({ error: "org_id, start, end requeridos" }, { status: 400 });
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  // ── Parallel queries ───────────────────────────────────────────
  // Build time_entries query
  let entriesQuery = supabase
    .from("time_entries")
    .select("*")
    .eq("org_id", orgId)
    .gte("date", start)
    .lte("date", end);
  if (filterUserId) entriesQuery = entriesQuery.eq("user_id", filterUserId);
  if (filterCategory) entriesQuery = entriesQuery.eq("category", filterCategory);

  // Build trust_score_history query
  let trustQuery = supabase
    .from("trust_score_history")
    .select("*")
    .eq("org_id", orgId)
    .gte("date", start)
    .lte("date", end);
  if (filterUserId) trustQuery = trustQuery.eq("user_id", filterUserId);

  // Build accountability_flags query
  let flagsQuery = supabase
    .from("accountability_flags")
    .select("*")
    .eq("org_id", orgId)
    .gte("date", start)
    .lte("date", end);
  if (filterUserId) flagsQuery = flagsQuery.eq("user_id", filterUserId);

  // Build daily_closeouts query
  let closeoutsQuery = supabase
    .from("daily_closeouts")
    .select("*")
    .eq("org_id", orgId)
    .gte("date", start)
    .lte("date", end);
  if (filterUserId) closeoutsQuery = closeoutsQuery.eq("user_id", filterUserId);

  // Build shoutouts query
  let shoutoutsQuery = supabase
    .from("shoutouts")
    .select("*")
    .eq("org_id", orgId)
    .gte("date", start)
    .lte("date", end);
  if (filterUserId) shoutoutsQuery = shoutoutsQuery.eq("to_user_id", filterUserId);

  // Streaks (no date filter, current state)
  let streaksQuery = supabase
    .from("activity_streaks")
    .select("*")
    .eq("org_id", orgId);
  if (filterUserId) streaksQuery = streaksQuery.eq("user_id", filterUserId);

  // Members with profiles
  const membersQuery = supabase
    .from("org_members")
    .select("user_id, role, profiles(full_name, email)")
    .eq("org_id", orgId);

  const [
    { data: entries },
    { data: trustScores },
    { data: flags },
    { data: closeouts },
    { data: shoutouts },
    { data: streaks },
    { data: members },
  ] = await Promise.all([
    entriesQuery,
    trustQuery,
    flagsQuery,
    closeoutsQuery,
    shoutoutsQuery,
    streaksQuery,
    membersQuery,
  ]);

  const safeEntries = entries ?? [];
  const safeTrust = trustScores ?? [];
  const safeFlags = flags ?? [];
  const safeCloseouts = closeouts ?? [];
  const safeShoutouts = shoutouts ?? [];
  const safeStreaks = streaks ?? [];
  const safeMembers = members ?? [];

  // ── Fetch reactions for the entries ────────────────────────────
  const entryIds = safeEntries.map((e) => e.id);
  let safeReactions: Array<{ id: string; entry_id: string; user_id: string; reaction: string; created_at: string }> = [];
  if (entryIds.length > 0) {
    // Supabase has a limit on `in` filter, batch if needed
    const batchSize = 500;
    const batches: string[][] = [];
    for (let i = 0; i < entryIds.length; i += batchSize) {
      batches.push(entryIds.slice(i, i + batchSize));
    }
    const reactionResults = await Promise.all(
      batches.map((batch) =>
        supabase
          .from("entry_reactions")
          .select("id, entry_id, user_id, reaction, created_at")
          .in("entry_id", batch)
      )
    );
    for (const r of reactionResults) {
      if (r.data) safeReactions = safeReactions.concat(r.data);
    }
  }

  // ── Build member lookup ────────────────────────────────────────
  const memberMap = new Map<string, string>();
  for (const m of safeMembers) {
    const profile = m.profiles as unknown as { full_name: string | null; email: string } | null;
    memberMap.set(m.user_id, profile?.full_name || profile?.email || m.user_id);
  }

  // ── KPIs ───────────────────────────────────────────────────────
  const totalHours = safeEntries.length; // each entry = 1 hour
  const uniqueDates = new Set(safeEntries.map((e) => e.date));
  const uniqueDays = uniqueDates.size;
  const avgHoursPerDay = uniqueDays > 0 ? Math.round((totalHours / uniqueDays) * 10) / 10 : 0;

  const entriesWithProof = safeEntries.filter(
    (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
  ).length;
  const proofRate = totalHours > 0 ? Math.round((entriesWithProof / totalHours) * 1000) / 10 : 0;

  const lateEntries = safeEntries.filter((e) => e.is_late).length;
  const lateRate = totalHours > 0 ? Math.round((lateEntries / totalHours) * 1000) / 10 : 0;

  const trustScoreValues = safeTrust.map((t) => t.score);
  const avgTrustScore = trustScoreValues.length > 0
    ? Math.round(trustScoreValues.reduce((a, b) => a + b, 0) / trustScoreValues.length)
    : 0;

  const moodValues = safeEntries.filter((e) => e.mood != null).map((e) => e.mood as number);
  const avgMood = moodValues.length > 0
    ? Math.round((moodValues.reduce((a, b) => a + b, 0) / moodValues.length) * 10) / 10
    : 0;

  const energyValues = safeEntries.filter((e) => e.energy != null).map((e) => e.energy as number);
  const avgEnergy = energyValues.length > 0
    ? Math.round((energyValues.reduce((a, b) => a + b, 0) / energyValues.length) * 10) / 10
    : 0;

  const totalFlags = safeFlags.length;
  const unresolvedFlags = safeFlags.filter((f) => !f.resolved).length;

  // Closeout rate: how many member-days had a closeout
  const memberUserIds = filterUserId
    ? [filterUserId]
    : safeMembers.map((m) => m.user_id);
  const expectedCloseouts = uniqueDays * memberUserIds.length;
  const closeoutRate = expectedCloseouts > 0
    ? Math.round((safeCloseouts.length / expectedCloseouts) * 1000) / 10
    : 0;

  const streakValues = safeStreaks.map((s) => s.current_streak);
  const avgStreak = streakValues.length > 0
    ? Math.round((streakValues.reduce((a, b) => a + b, 0) / streakValues.length) * 10) / 10
    : 0;

  const totalReactions = safeReactions.length;
  const verifiedReactions = safeReactions.filter((r) => r.reaction === "verified").length;
  const suspiciousReactions = safeReactions.filter((r) => r.reaction === "suspicious").length;
  const totalShoutouts = safeShoutouts.length;

  const entriesWithDescription = safeEntries.filter(
    (e) => e.description && (e.description as string).trim().length > 0
  ).length;
  const detailRate = totalHours > 0
    ? Math.round((entriesWithDescription / totalHours) * 1000) / 10
    : 0;

  const kpis = {
    total_hours: totalHours,
    unique_days: uniqueDays,
    avg_hours_per_day: avgHoursPerDay,
    proof_rate: proofRate,
    late_rate: lateRate,
    avg_trust_score: avgTrustScore,
    avg_mood: avgMood,
    avg_energy: avgEnergy,
    total_flags: totalFlags,
    unresolved_flags: unresolvedFlags,
    closeout_rate: Math.min(closeoutRate, 100),
    avg_streak: avgStreak,
    total_reactions: totalReactions,
    verified_reactions: verifiedReactions,
    suspicious_reactions: suspiciousReactions,
    total_shoutouts: totalShoutouts,
    total_entries_with_description: entriesWithDescription,
    detail_rate: detailRate,
    member_count: memberUserIds.length,
  };

  // ── Trends (daily aggregates) ──────────────────────────────────
  const dailyMap = new Map<string, {
    hours: number;
    proof_hours: number;
    late_count: number;
    trust_scores: number[];
    moods: number[];
    energies: number[];
    entries_count: number;
    flags_count: number;
  }>();

  for (const e of safeEntries) {
    const d = dailyMap.get(e.date) ?? {
      hours: 0, proof_hours: 0, late_count: 0,
      trust_scores: [], moods: [], energies: [],
      entries_count: 0, flags_count: 0,
    };
    d.hours += 1;
    d.entries_count += 1;
    if (e.proof_urls && (e.proof_urls as string[]).length > 0) d.proof_hours += 1;
    if (e.is_late) d.late_count += 1;
    if (e.mood != null) d.moods.push(e.mood as number);
    if (e.energy != null) d.energies.push(e.energy as number);
    dailyMap.set(e.date, d);
  }

  // Merge trust scores into daily
  for (const t of safeTrust) {
    const d = dailyMap.get(t.date);
    if (d) d.trust_scores.push(t.score);
  }

  // Merge flags into daily
  for (const f of safeFlags) {
    const d = dailyMap.get(f.date);
    if (d) d.flags_count += 1;
  }

  const trends = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      hours: d.hours,
      proof_hours: d.proof_hours,
      late_count: d.late_count,
      trust_avg: d.trust_scores.length > 0
        ? Math.round(d.trust_scores.reduce((a, b) => a + b, 0) / d.trust_scores.length)
        : null,
      mood_avg: d.moods.length > 0
        ? Math.round((d.moods.reduce((a, b) => a + b, 0) / d.moods.length) * 10) / 10
        : null,
      energy_avg: d.energies.length > 0
        ? Math.round((d.energies.reduce((a, b) => a + b, 0) / d.energies.length) * 10) / 10
        : null,
      entries_count: d.entries_count,
      flags_count: d.flags_count,
    }));

  // ── Category distribution ──────────────────────────────────────
  const categoryMap = new Map<string, number>();
  for (const e of safeEntries) {
    categoryMap.set(e.category, (categoryMap.get(e.category) ?? 0) + 1);
  }
  const categoryDistribution = Array.from(categoryMap.entries())
    .map(([category, hours]) => ({
      category,
      hours,
      percent: totalHours > 0 ? Math.round((hours / totalHours) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  // ── Hour heatmap ───────────────────────────────────────────────
  const heatmap: Record<string, Record<string, number>> = {};
  for (let h = 0; h < 24; h++) {
    heatmap[String(h)] = { Lun: 0, Mar: 0, "Mié": 0, Jue: 0, Vie: 0, "Sáb": 0, Dom: 0 };
  }
  for (const e of safeEntries) {
    const dow = dayOfWeek(e.date);
    const h = String(e.hour);
    if (heatmap[h] && heatmap[h][dow] !== undefined) {
      heatmap[h][dow] += 1;
    }
  }

  // ── Member stats ───────────────────────────────────────────────
  const memberStatsMap = new Map<string, {
    hours: number;
    proof_count: number;
    late_count: number;
    trust_scores: number[];
    moods: number[];
    energies: number[];
    closeout_count: number;
    unique_dates: Set<string>;
  }>();

  for (const uid of memberUserIds) {
    memberStatsMap.set(uid, {
      hours: 0, proof_count: 0, late_count: 0,
      trust_scores: [], moods: [], energies: [],
      closeout_count: 0, unique_dates: new Set(),
    });
  }

  for (const e of safeEntries) {
    const s = memberStatsMap.get(e.user_id);
    if (!s) continue;
    s.hours += 1;
    s.unique_dates.add(e.date);
    if (e.proof_urls && (e.proof_urls as string[]).length > 0) s.proof_count += 1;
    if (e.is_late) s.late_count += 1;
    if (e.mood != null) s.moods.push(e.mood as number);
    if (e.energy != null) s.energies.push(e.energy as number);
  }

  for (const t of safeTrust) {
    const s = memberStatsMap.get(t.user_id);
    if (s) s.trust_scores.push(t.score);
  }

  for (const c of safeCloseouts) {
    const s = memberStatsMap.get(c.user_id);
    if (s) s.closeout_count += 1;
  }

  // Reactions received per member (via entry ownership)
  const entryOwnerMap = new Map<string, string>();
  for (const e of safeEntries) {
    entryOwnerMap.set(e.id, e.user_id);
  }

  const reactionsReceivedMap = new Map<string, number>();
  const shoutoutsReceivedMap = new Map<string, number>();
  for (const r of safeReactions) {
    const owner = entryOwnerMap.get(r.entry_id);
    if (owner) {
      reactionsReceivedMap.set(owner, (reactionsReceivedMap.get(owner) ?? 0) + 1);
    }
  }
  for (const s of safeShoutouts) {
    shoutoutsReceivedMap.set(s.to_user_id, (shoutoutsReceivedMap.get(s.to_user_id) ?? 0) + 1);
  }

  const flagsByUser = new Map<string, number>();
  for (const f of safeFlags) {
    flagsByUser.set(f.user_id, (flagsByUser.get(f.user_id) ?? 0) + 1);
  }

  const streakByUser = new Map<string, number>();
  for (const s of safeStreaks) {
    streakByUser.set(s.user_id, s.current_streak);
  }

  const memberStats = memberUserIds.map((uid) => {
    const s = memberStatsMap.get(uid)!;
    const memberDays = s.unique_dates.size;
    return {
      user_id: uid,
      name: memberMap.get(uid) ?? uid,
      hours: s.hours,
      proof_rate: s.hours > 0 ? Math.round((s.proof_count / s.hours) * 1000) / 10 : 0,
      late_rate: s.hours > 0 ? Math.round((s.late_count / s.hours) * 1000) / 10 : 0,
      trust_avg: s.trust_scores.length > 0
        ? Math.round(s.trust_scores.reduce((a, b) => a + b, 0) / s.trust_scores.length)
        : 0,
      mood_avg: s.moods.length > 0
        ? Math.round((s.moods.reduce((a, b) => a + b, 0) / s.moods.length) * 10) / 10
        : 0,
      energy_avg: s.energies.length > 0
        ? Math.round((s.energies.reduce((a, b) => a + b, 0) / s.energies.length) * 10) / 10
        : 0,
      flags: flagsByUser.get(uid) ?? 0,
      streak: streakByUser.get(uid) ?? 0,
      closeout_rate: memberDays > 0
        ? Math.round((s.closeout_count / memberDays) * 1000) / 10
        : 0,
      reactions_received: reactionsReceivedMap.get(uid) ?? 0,
      shoutouts_received: shoutoutsReceivedMap.get(uid) ?? 0,
    };
  });

  // ── Correlations ───────────────────────────────────────────────
  // Per-day aggregated data for correlation analysis
  const dailyAgg = Array.from(dailyMap.entries()).map(([, d]) => ({
    hours: d.hours,
    mood: d.moods.length > 0
      ? d.moods.reduce((a, b) => a + b, 0) / d.moods.length
      : null,
    energy: d.energies.length > 0
      ? d.energies.reduce((a, b) => a + b, 0) / d.energies.length
      : null,
    proof_rate: d.hours > 0 ? (d.proof_hours / d.hours) * 100 : null,
    trust: d.trust_scores.length > 0
      ? d.trust_scores.reduce((a, b) => a + b, 0) / d.trust_scores.length
      : null,
  }));

  const moodVsHoursPairs: [number, number][] = dailyAgg
    .filter((d) => d.mood !== null)
    .map((d) => [d.mood!, d.hours]);

  const energyVsProofPairs: [number, number][] = dailyAgg
    .filter((d) => d.energy !== null && d.proof_rate !== null)
    .map((d) => [d.energy!, d.proof_rate!]);

  const hoursVsTrustPairs: [number, number][] = dailyAgg
    .filter((d) => d.trust !== null)
    .map((d) => [d.hours, d.trust!]);

  const correlations = {
    mood_vs_hours: {
      correlation: pearson(moodVsHoursPairs),
      data: moodVsHoursPairs,
    },
    energy_vs_proof: {
      correlation: pearson(energyVsProofPairs),
      data: energyVsProofPairs,
    },
    hours_vs_trust: {
      correlation: pearson(hoursVsTrustPairs),
      data: hoursVsTrustPairs,
    },
  };

  // ── Flag breakdown ─────────────────────────────────────────────
  const flagTypeMap = new Map<string, number>();
  for (const f of safeFlags) {
    flagTypeMap.set(f.flag_type, (flagTypeMap.get(f.flag_type) ?? 0) + 1);
  }
  const flagBreakdown = Array.from(flagTypeMap.entries())
    .map(([type, count]) => ({
      type,
      count,
      percent: totalFlags > 0 ? Math.round((count / totalFlags) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Reaction breakdown ─────────────────────────────────────────
  const reactionTypeMap = new Map<string, number>();
  for (const r of safeReactions) {
    reactionTypeMap.set(r.reaction, (reactionTypeMap.get(r.reaction) ?? 0) + 1);
  }
  const reactionBreakdown = Array.from(reactionTypeMap.entries())
    .map(([type, count]) => ({
      type,
      count,
      percent: totalReactions > 0 ? Math.round((count / totalReactions) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Response ───────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    data: {
      kpis,
      trends,
      category_distribution: categoryDistribution,
      hour_heatmap: heatmap,
      member_stats: memberStats,
      correlations,
      flag_breakdown: flagBreakdown,
      reaction_breakdown: reactionBreakdown,
    },
  });
}
