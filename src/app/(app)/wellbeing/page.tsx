"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import type {
  Profile,
  TimeEntry,
  DailyCloseout,
  ActivityStreak,
  TrustScoreHistory,
  AccountabilityFlag,
  WorkCategory,
} from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, subDays, parseISO, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  Heart,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertTriangle,
  Activity,
  Brain,
  Clock,
  FileText,
  Shield,
  Flame,
  Moon,
  Zap,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface MemberWellbeing {
  userId: string;
  profile: Profile;
  burnoutScore: number;
  satisfactionScore: number;
  burnoutFactors: BurnoutFactor[];
  moodTrend: TrendDirection;
  energyTrend: TrendDirection;
  hoursTrend: TrendDirection;
  avgMood: number;
  avgEnergy: number;
  weeklyBurnout: number[]; // 4 weeks
  weeklySatisfaction: number[]; // 4 weeks
  moodDrop: boolean; // rapid mood decline
}

interface BurnoutFactor {
  label: string;
  points: number;
  icon: typeof TrendingDown;
}

type TrendDirection = "up" | "down" | "stable";

// ============================================================
// Calculation helpers
// ============================================================

function calcTrend(values: number[]): TrendDirection {
  if (values.length < 3) return "stable";
  const half = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, half);
  const secondHalf = values.slice(half);
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const diff = avgSecond - avgFirst;
  if (diff > 0.3) return "up";
  if (diff < -0.3) return "down";
  return "stable";
}

function calcDescriptionTrend(entries: TimeEntry[]): TrendDirection {
  if (entries.length < 5) return "stable";
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const half = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, half);
  const secondHalf = sorted.slice(half);
  const avgLenFirst =
    firstHalf.reduce((s, e) => s + (e.description?.length ?? 0), 0) /
    firstHalf.length;
  const avgLenSecond =
    secondHalf.reduce((s, e) => s + (e.description?.length ?? 0), 0) /
    secondHalf.length;
  if (avgLenSecond < avgLenFirst * 0.7) return "down";
  if (avgLenSecond > avgLenFirst * 1.3) return "up";
  return "stable";
}

function calcCategoryShift(entries: TimeEntry[]): boolean {
  if (entries.length < 10) return false;
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const half = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, half);
  const secondHalf = sorted.slice(half);

  const lowValueCats: WorkCategory[] = ["admin", "break", "blocked"];
  const highValueCats: WorkCategory[] = ["deep_work"];

  const firstLowPct =
    firstHalf.filter((e) => lowValueCats.includes(e.category)).length /
    firstHalf.length;
  const secondLowPct =
    secondHalf.filter((e) => lowValueCats.includes(e.category)).length /
    secondHalf.length;
  const firstHighPct =
    firstHalf.filter((e) => highValueCats.includes(e.category)).length /
    firstHalf.length;
  const secondHighPct =
    secondHalf.filter((e) => highValueCats.includes(e.category)).length /
    secondHalf.length;

  return secondLowPct > firstLowPct + 0.1 && secondHighPct < firstHighPct - 0.05;
}

function calcHoursTrend(entries: TimeEntry[]): TrendDirection {
  if (entries.length < 5) return "stable";
  // Group by date, count entries per day
  const byDate = new Map<string, number>();
  for (const e of entries) {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + 1);
  }
  const dailyCounts = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((d) => d[1]);
  return calcTrend(dailyCounts);
}

function calcLateEntryIncrease(entries: TimeEntry[]): boolean {
  if (entries.length < 10) return false;
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const half = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, half);
  const secondHalf = sorted.slice(half);
  const firstLateRate =
    firstHalf.filter((e) => e.is_late).length / firstHalf.length;
  const secondLateRate =
    secondHalf.filter((e) => e.is_late).length / secondHalf.length;
  return secondLateRate > firstLateRate + 0.15;
}

function calcMissingCloseoutIncrease(
  closeouts: DailyCloseout[],
  totalDays: number
): boolean {
  if (totalDays < 10) return false;
  const half = Math.floor(totalDays / 2);
  const closeoutDates = new Set(closeouts.map((c) => c.date));
  // Count closeouts in first and second half of the period
  const today = new Date(getTodayMTY() + "T12:00:00");
  let firstCount = 0;
  let secondCount = 0;
  for (let i = 0; i < totalDays; i++) {
    const d = format(subDays(today, totalDays - 1 - i), "yyyy-MM-dd");
    if (closeoutDates.has(d)) {
      if (i < half) firstCount++;
      else secondCount++;
    }
  }
  const firstRate = firstCount / half;
  const secondRate = secondCount / (totalDays - half);
  return secondRate < firstRate - 0.2;
}

function calcBurnoutScore(
  entries: TimeEntry[],
  closeouts: DailyCloseout[],
  streak: ActivityStreak | null,
  _flags: AccountabilityFlag[]
): { score: number; factors: BurnoutFactor[] } {
  const factors: BurnoutFactor[] = [];

  // 1. Mood trend (last 14 days — use recent entries)
  const last14 = entries.filter((e) => {
    const d = differenceInDays(
      new Date(getTodayMTY() + "T12:00:00"),
      new Date(e.date + "T12:00:00")
    );
    return d <= 14;
  });
  const moods = last14
    .filter((e) => e.mood != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => e.mood!);
  const moodTrend = calcTrend(moods);
  if (moodTrend === "down") {
    factors.push({ label: "Estado de animo en declive", points: 20, icon: TrendingDown });
  } else if (moodTrend === "up") {
    factors.push({ label: "Estado de animo mejorando", points: -10, icon: TrendingUp });
  }

  // 2. Energy trend
  const energies = last14
    .filter((e) => e.energy != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => e.energy!);
  const energyTrend = calcTrend(energies);
  if (energyTrend === "down") {
    factors.push({ label: "Energia en declive", points: 20, icon: Zap });
  } else if (energyTrend === "up") {
    factors.push({ label: "Energia mejorando", points: -10, icon: Zap });
  }

  // 3. Description length trend
  const descTrend = calcDescriptionTrend(entries);
  if (descTrend === "down") {
    factors.push({
      label: "Descripciones mas cortas (desconexion)",
      points: 15,
      icon: FileText,
    });
  }

  // 4. Category shift
  if (calcCategoryShift(entries)) {
    factors.push({
      label: "Menos Deep Work, mas admin/descanso",
      points: 15,
      icon: Brain,
    });
  }

  // 5. Hours trend
  const hoursTrend = calcHoursTrend(entries);
  if (hoursTrend === "down") {
    factors.push({ label: "Horas en declive", points: 10, icon: Clock });
  }

  // 6. Late entry increase
  if (calcLateEntryIncrease(entries)) {
    factors.push({ label: "Aumento de entradas tardias", points: 10, icon: Clock });
  }

  // 7. Missing closeouts increase
  if (calcMissingCloseoutIncrease(closeouts, 30)) {
    factors.push({
      label: "Menos cierres de dia completados",
      points: 10,
      icon: Moon,
    });
  }

  // 8. Streak broken recently
  if (streak && streak.last_active_date) {
    const daysSince = differenceInDays(
      new Date(getTodayMTY() + "T12:00:00"),
      new Date(streak.last_active_date + "T12:00:00")
    );
    if (
      daysSince > 1 &&
      streak.current_streak === 0 &&
      streak.longest_streak >= 5
    ) {
      factors.push({ label: "Racha rota recientemente", points: 5, icon: Flame });
    }
  }

  const rawScore = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.max(0, Math.min(100, rawScore));
  const positiveFactors = factors.filter((f) => f.points > 0);

  return { score, factors: positiveFactors };
}

function calcSatisfactionScore(entries: TimeEntry[]): number {
  if (entries.length === 0) return 50;

  // 1. Average mood (40% weight) — mapped 1-5 => 0-100
  const moods = entries.filter((e) => e.mood != null).map((e) => e.mood!);
  const avgMood = moods.length > 0
    ? moods.reduce((a, b) => a + b, 0) / moods.length
    : 3;
  const moodScore = ((avgMood - 1) / 4) * 100;

  // 2. Average energy (20% weight)
  const energies = entries.filter((e) => e.energy != null).map((e) => e.energy!);
  const avgEnergy = energies.length > 0
    ? energies.reduce((a, b) => a + b, 0) / energies.length
    : 3;
  const energyScore = ((avgEnergy - 1) / 4) * 100;

  // 3. Proof rate (15% weight)
  const withProof = entries.filter(
    (e) => (e.proof_urls && e.proof_urls.length > 0) || (e.links && e.links.length > 0)
  ).length;
  const proofRate = entries.length > 0 ? (withProof / entries.length) * 100 : 0;

  // 4. Description quality — avg word count (15% weight)
  const wordCounts = entries.map((e) =>
    (e.description ?? "").split(/\s+/).filter(Boolean).length
  );
  const avgWords =
    wordCounts.length > 0
      ? wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length
      : 0;
  // Map 0-20 words => 0-100
  const descScore = Math.min(100, (avgWords / 20) * 100);

  // 5. Consistency — low variance in daily hours (10% weight)
  const byDate = new Map<string, number>();
  for (const e of entries) {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + 1);
  }
  const dailyCounts = Array.from(byDate.values());
  const avgDaily =
    dailyCounts.length > 0
      ? dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length
      : 0;
  const variance =
    dailyCounts.length > 1
      ? dailyCounts.reduce((s, c) => s + Math.pow(c - avgDaily, 2), 0) /
        dailyCounts.length
      : 0;
  const stdDev = Math.sqrt(variance);
  // Low stdDev = high consistency score. stdDev 0 = 100, stdDev 3+ = 0
  const consistencyScore = Math.max(0, 100 - (stdDev / 3) * 100);

  const score =
    moodScore * 0.4 +
    energyScore * 0.2 +
    proofRate * 0.15 +
    descScore * 0.15 +
    consistencyScore * 0.1;

  return Math.round(Math.max(0, Math.min(100, score)));
}

function calcWeeklyScores(
  entries: TimeEntry[],
  closeouts: DailyCloseout[],
  streak: ActivityStreak | null,
  flags: AccountabilityFlag[]
): { burnout: number[]; satisfaction: number[] } {
  const today = new Date(getTodayMTY() + "T12:00:00");
  const burnout: number[] = [];
  const satisfaction: number[] = [];

  for (let week = 3; week >= 0; week--) {
    const weekEnd = subDays(today, week * 7);
    const weekStart = subDays(weekEnd, 7);
    const weekEntries = entries.filter((e) => {
      const d = new Date(e.date + "T12:00:00");
      return d >= weekStart && d < weekEnd;
    });
    const weekCloseouts = closeouts.filter((c) => {
      const d = new Date(c.date + "T12:00:00");
      return d >= weekStart && d < weekEnd;
    });
    const { score: bs } = calcBurnoutScore(weekEntries, weekCloseouts, streak, flags);
    const ss = calcSatisfactionScore(weekEntries);
    burnout.push(bs);
    satisfaction.push(ss);
  }

  return { burnout, satisfaction };
}

function detectRapidMoodDrop(entries: TimeEntry[]): boolean {
  // Check if mood dropped 2+ points in last 7 days vs previous 7 days
  const today = new Date(getTodayMTY() + "T12:00:00");
  const last7 = entries.filter((e) => {
    const d = differenceInDays(today, new Date(e.date + "T12:00:00"));
    return d <= 7 && e.mood != null;
  });
  const prev7 = entries.filter((e) => {
    const d = differenceInDays(today, new Date(e.date + "T12:00:00"));
    return d > 7 && d <= 14 && e.mood != null;
  });
  if (last7.length < 2 || prev7.length < 2) return false;
  const avgLast = last7.reduce((s, e) => s + e.mood!, 0) / last7.length;
  const avgPrev = prev7.reduce((s, e) => s + e.mood!, 0) / prev7.length;
  return avgPrev - avgLast >= 1.5;
}

// ============================================================
// Color helpers
// ============================================================

function burnoutColor(score: number): string {
  if (score >= 80) return "text-red-400";
  if (score >= 60) return "text-red-500 dark:text-red-400";
  if (score >= 30) return "text-amber-500 dark:text-amber-400";
  return "text-green-500 dark:text-green-400";
}

function burnoutBgColor(score: number): string {
  if (score >= 80) return "bg-red-500/15 border-red-500/30";
  if (score >= 60) return "bg-red-500/10 border-red-500/20";
  if (score >= 30) return "bg-amber-500/10 border-amber-500/20";
  return "bg-green-500/10 border-green-500/20";
}

function satisfactionColor(score: number): string {
  if (score >= 70) return "text-green-500 dark:text-green-400";
  if (score >= 40) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function TrendIcon({ direction }: { direction: TrendDirection }) {
  if (direction === "up") return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  if (direction === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

// ============================================================
// Mini bar chart component
// ============================================================

function MiniBarChart({
  values,
  colorFn,
  label,
}: {
  values: number[];
  colorFn: (v: number) => string;
  label: string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div>
      <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1.5">
        {label}
      </span>
      <div className="flex items-end gap-1 h-10">
        {values.map((v, i) => {
          const height = Math.max(4, (v / max) * 100);
          const barColorClass =
            v >= 70
              ? colorFn === burnoutColor
                ? "bg-red-500/70"
                : "bg-green-500/70"
              : v >= 40
              ? "bg-amber-500/70"
              : colorFn === burnoutColor
              ? "bg-green-500/70"
              : "bg-red-500/70";
          return (
            <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
              <div
                className={cn("w-full min-w-[6px]", barColorClass)}
                style={{ height: `${height}%` }}
              />
              <span className="font-mono text-[8px] text-muted-foreground tabular-nums">
                {Math.round(v)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="font-mono text-[7px] text-muted-foreground">-4s</span>
        <span className="font-mono text-[7px] text-muted-foreground">hoy</span>
      </div>
    </div>
  );
}

// ============================================================
// Page
// ============================================================

export default function WellbeingPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [members, setMembers] = useState<MemberWellbeing[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCard = (uid: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // --------------------------------------------------------
  // Data loader
  // --------------------------------------------------------

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const today = getTodayMTY();
    const thirtyDaysAgo = format(
      subDays(new Date(today + "T12:00:00"), 30),
      "yyyy-MM-dd"
    );

    // 1. All org members with profiles
    const { data: orgMembers } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    if (!orgMembers || orgMembers.length === 0) {
      setLoading(false);
      return;
    }

    const userIds = orgMembers.map((m) => m.user_id as string);
    const profileMap = new Map<string, Profile>();
    for (const m of orgMembers) {
      if (m.profiles) profileMap.set(m.user_id as string, m.profiles as unknown as Profile);
    }

    // 2. Parallel data fetches
    const [
      { data: allEntries },
      { data: allCloseouts },
      { data: allStreaks },
      { data: allTrustHistory },
      { data: allFlags },
    ] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", thirtyDaysAgo)
        .in("user_id", userIds)
        .order("date", { ascending: true }),
      supabase
        .from("daily_closeouts")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", thirtyDaysAgo)
        .in("user_id", userIds),
      supabase
        .from("activity_streaks")
        .select("*")
        .eq("org_id", orgId)
        .in("user_id", userIds),
      supabase
        .from("trust_score_history")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", thirtyDaysAgo)
        .in("user_id", userIds),
      supabase
        .from("accountability_flags")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", thirtyDaysAgo)
        .in("user_id", userIds),
    ]);

    // Group data by user
    const entriesByUser = new Map<string, TimeEntry[]>();
    const closeoutsByUser = new Map<string, DailyCloseout[]>();
    const streakByUser = new Map<string, ActivityStreak>();
    const flagsByUser = new Map<string, AccountabilityFlag[]>();

    for (const e of (allEntries ?? []) as TimeEntry[]) {
      if (!entriesByUser.has(e.user_id)) entriesByUser.set(e.user_id, []);
      entriesByUser.get(e.user_id)!.push(e);
    }
    for (const c of (allCloseouts ?? []) as DailyCloseout[]) {
      if (!closeoutsByUser.has(c.user_id)) closeoutsByUser.set(c.user_id, []);
      closeoutsByUser.get(c.user_id)!.push(c);
    }
    for (const s of (allStreaks ?? []) as ActivityStreak[]) {
      streakByUser.set(s.user_id, s);
    }
    for (const f of (allFlags ?? []) as AccountabilityFlag[]) {
      if (!flagsByUser.has(f.user_id)) flagsByUser.set(f.user_id, []);
      flagsByUser.get(f.user_id)!.push(f);
    }

    // Calculate wellbeing for each member
    const results: MemberWellbeing[] = [];

    for (const uid of userIds) {
      const profile = profileMap.get(uid);
      if (!profile) continue;

      const entries = entriesByUser.get(uid) ?? [];
      const closeouts = closeoutsByUser.get(uid) ?? [];
      const streak = streakByUser.get(uid) ?? null;
      const flags = flagsByUser.get(uid) ?? [];

      const { score: burnoutScore, factors } = calcBurnoutScore(
        entries,
        closeouts,
        streak,
        flags
      );
      const satisfactionScore = calcSatisfactionScore(entries);

      // Trends
      const last14Entries = entries.filter((e) => {
        const d = differenceInDays(
          new Date(today + "T12:00:00"),
          new Date(e.date + "T12:00:00")
        );
        return d <= 14;
      });
      const moods = last14Entries
        .filter((e) => e.mood != null)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => e.mood!);
      const energies = last14Entries
        .filter((e) => e.energy != null)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => e.energy!);

      const moodTrend = calcTrend(moods);
      const energyTrend = calcTrend(energies);
      const hoursTrend = calcHoursTrend(entries);

      const avgMood =
        moods.length > 0
          ? moods.reduce((a, b) => a + b, 0) / moods.length
          : 0;
      const avgEnergy =
        energies.length > 0
          ? energies.reduce((a, b) => a + b, 0) / energies.length
          : 0;

      const { burnout: weeklyBurnout, satisfaction: weeklySatisfaction } =
        calcWeeklyScores(entries, closeouts, streak, flags);

      const moodDrop = detectRapidMoodDrop(entries);

      results.push({
        userId: uid,
        profile,
        burnoutScore,
        satisfactionScore,
        burnoutFactors: factors,
        moodTrend,
        energyTrend,
        hoursTrend,
        avgMood,
        avgEnergy,
        weeklyBurnout,
        weeklySatisfaction,
        moodDrop,
      });
    }

    // Sort: highest burnout first
    results.sort((a, b) => b.burnoutScore - a.burnoutScore);

    setMembers(results);
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (orgLoading || !orgId) {
      if (!orgLoading) setLoading(false);
      return;
    }
    loadData();
  }, [orgLoading, orgId, loadData]);

  // --------------------------------------------------------
  // Derived stats
  // --------------------------------------------------------

  const teamAvgBurnout = useMemo(() => {
    if (members.length === 0) return 0;
    return Math.round(
      members.reduce((s, m) => s + m.burnoutScore, 0) / members.length
    );
  }, [members]);

  const teamAvgSatisfaction = useMemo(() => {
    if (members.length === 0) return 0;
    return Math.round(
      members.reduce((s, m) => s + m.satisfactionScore, 0) / members.length
    );
  }, [members]);

  const highestRisk = useMemo(
    () => (members.length > 0 ? members[0] : null),
    [members]
  );

  const mostSatisfied = useMemo(
    () =>
      members.length > 0
        ? [...members].sort(
            (a, b) => b.satisfactionScore - a.satisfactionScore
          )[0]
        : null,
    [members]
  );

  const alerts = useMemo(() => {
    const list: {
      type: "burnout" | "satisfaction" | "mood_drop";
      member: MemberWellbeing;
      message: string;
    }[] = [];
    for (const m of members) {
      if (m.burnoutScore >= 70) {
        list.push({
          type: "burnout",
          member: m,
          message: `Riesgo de burnout critico: ${m.burnoutScore}/100`,
        });
      }
      if (m.satisfactionScore < 30) {
        list.push({
          type: "satisfaction",
          member: m,
          message: `Satisfaccion muy baja: ${m.satisfactionScore}/100`,
        });
      }
      if (m.moodDrop) {
        list.push({
          type: "mood_drop",
          member: m,
          message: `Caida rapida de animo en la ultima semana`,
        });
      }
    }
    return list;
  }, [members]);

  // --------------------------------------------------------
  // Loading / empty states
  // --------------------------------------------------------

  if (loading || orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground font-mono text-xs">
          Crea o unete a un equipo desde el Dashboard.
        </p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2.5 mb-8">
          <Heart className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Bienestar del Equipo
          </h1>
        </div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
            <Heart className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            No hay datos suficientes para analizar.
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------
  // Render
  // --------------------------------------------------------

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 bg-grid-palantir min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Heart className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Bienestar del Equipo
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Deteccion de burnout y satisfaccion laboral basada en datos de los ultimos 30 dias
        </p>
      </div>

      {/* ── ALERTS ── */}
      {alerts.length > 0 && (
        <div className="mb-8">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-3">
            Alertas activas
          </span>
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={cn(
                  "border p-3 flex items-center gap-3",
                  alert.type === "burnout"
                    ? "bg-red-500/10 border-red-500/30"
                    : alert.type === "satisfaction"
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-orange-500/10 border-orange-500/30"
                )}
              >
                <AlertTriangle
                  className={cn(
                    "w-4 h-4 shrink-0",
                    alert.type === "burnout"
                      ? "text-red-500"
                      : alert.type === "satisfaction"
                      ? "text-amber-500"
                      : "text-orange-500"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-xs font-bold">
                    {alert.member.profile.full_name ?? "Sin nombre"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground ml-2">
                    {alert.message}
                  </span>
                </div>
                {alert.type === "burnout" && (
                  <span className="font-mono text-lg font-bold tabular-nums text-red-500">
                    {alert.member.burnoutScore}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TEAM OVERVIEW ── */}
      <div className="mb-8">
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-3">
          Resumen del equipo
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Avg burnout */}
          <div className="bg-accent/30 border border-border p-3">
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1">
              Riesgo burnout
            </span>
            <span
              className={cn(
                "font-mono text-2xl font-bold tabular-nums tracking-tight",
                burnoutColor(teamAvgBurnout)
              )}
            >
              {teamAvgBurnout}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">/100</span>
          </div>

          {/* Avg satisfaction */}
          <div className="bg-accent/30 border border-border p-3">
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1">
              Satisfaccion
            </span>
            <span
              className={cn(
                "font-mono text-2xl font-bold tabular-nums tracking-tight",
                satisfactionColor(teamAvgSatisfaction)
              )}
            >
              {teamAvgSatisfaction}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">/100</span>
          </div>

          {/* Highest risk */}
          <div className="bg-accent/30 border border-border p-3">
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1">
              Mayor riesgo
            </span>
            {highestRisk && (
              <>
                <span className="font-mono text-xs font-bold block truncate">
                  {highestRisk.profile.full_name ?? "—"}
                </span>
                <span
                  className={cn(
                    "font-mono text-sm font-bold tabular-nums",
                    burnoutColor(highestRisk.burnoutScore)
                  )}
                >
                  {highestRisk.burnoutScore}
                </span>
              </>
            )}
          </div>

          {/* Most satisfied */}
          <div className="bg-accent/30 border border-border p-3">
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1">
              Mas satisfecho
            </span>
            {mostSatisfied && (
              <>
                <span className="font-mono text-xs font-bold block truncate">
                  {mostSatisfied.profile.full_name ?? "—"}
                </span>
                <span
                  className={cn(
                    "font-mono text-sm font-bold tabular-nums",
                    satisfactionColor(mostSatisfied.satisfactionScore)
                  )}
                >
                  {mostSatisfied.satisfactionScore}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── MEMBER CARDS ── */}
      <div className="mb-8">
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-3">
          Analisis individual ({members.length})
        </span>
        <div className="space-y-3">
          {members.map((member) => {
            const expanded = expandedCards.has(member.userId);
            return (
              <div
                key={member.userId}
                className={cn(
                  "border border-border transition-colors duration-200 hover:border-primary/30",
                  member.burnoutScore >= 70 && "border-red-500/30"
                )}
              >
                {/* Main row */}
                <button
                  onClick={() => toggleCard(member.userId)}
                  className="w-full text-left p-4 flex items-center gap-4 cursor-pointer"
                >
                  {/* Avatar */}
                  <Avatar className="w-10 h-10 ring-1 ring-border shrink-0">
                    <AvatarImage src={member.profile.avatar_url ?? undefined} />
                    <AvatarFallback className="font-mono text-xs bg-accent">
                      {getInitials(member.profile.full_name)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name + indicators */}
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-sm font-bold block truncate">
                      {member.profile.full_name ?? "Sin nombre"}
                    </span>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[9px] text-muted-foreground uppercase">
                          Animo
                        </span>
                        <TrendIcon direction={member.moodTrend} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[9px] text-muted-foreground uppercase">
                          Energia
                        </span>
                        <TrendIcon direction={member.energyTrend} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[9px] text-muted-foreground uppercase">
                          Horas
                        </span>
                        <TrendIcon direction={member.hoursTrend} />
                      </div>
                    </div>
                  </div>

                  {/* Scores */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-center">
                      <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground block">
                        Burnout
                      </span>
                      <span
                        className={cn(
                          "font-mono text-xl font-bold tabular-nums tracking-tight",
                          burnoutColor(member.burnoutScore)
                        )}
                      >
                        {member.burnoutScore}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground block">
                        Satisf.
                      </span>
                      <span
                        className={cn(
                          "font-mono text-xl font-bold tabular-nums tracking-tight",
                          satisfactionColor(member.satisfactionScore)
                        )}
                      >
                        {member.satisfactionScore}
                      </span>
                    </div>
                    {expanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {expanded && (
                  <div className="border-t border-border p-4 space-y-4">
                    {/* Alert factors */}
                    {member.burnoutFactors.length > 0 && (
                      <div>
                        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-2">
                          {member.burnoutScore >= 60
                            ? "Senales de alerta"
                            : "Factores detectados"}
                        </span>
                        <div className="space-y-1">
                          {member.burnoutFactors.map((f, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 py-1"
                            >
                              <f.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="font-mono text-xs">
                                {f.label}
                              </span>
                              <span className="font-mono text-[10px] text-red-500 tabular-nums ml-auto">
                                +{f.points}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {member.moodDrop && (
                      <div className="bg-orange-500/10 border border-orange-500/30 p-2 flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                        <span className="font-mono text-xs">
                          Caida rapida de animo detectada esta semana
                        </span>
                      </div>
                    )}

                    {/* Average mood / energy */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-accent/30 border border-border p-2">
                        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1">
                          Animo promedio (14d)
                        </span>
                        <span className="font-mono text-lg font-bold tabular-nums tracking-tight">
                          {member.avgMood > 0 ? member.avgMood.toFixed(1) : "—"}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          /5
                        </span>
                      </div>
                      <div className="bg-accent/30 border border-border p-2">
                        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1">
                          Energia promedio (14d)
                        </span>
                        <span className="font-mono text-lg font-bold tabular-nums tracking-tight">
                          {member.avgEnergy > 0
                            ? member.avgEnergy.toFixed(1)
                            : "—"}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          /5
                        </span>
                      </div>
                    </div>

                    {/* Weekly trend charts */}
                    <div className="grid grid-cols-2 gap-3">
                      <MiniBarChart
                        values={member.weeklyBurnout}
                        colorFn={burnoutColor}
                        label="Burnout semanal"
                      />
                      <MiniBarChart
                        values={member.weeklySatisfaction}
                        colorFn={satisfactionColor}
                        label="Satisfaccion semanal"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div className="border-t border-border pt-4">
        <p className="font-mono text-[10px] text-muted-foreground text-center">
          Analisis basado en datos de los ultimos 30 dias. Los scores se calculan
          a partir de tendencias de animo, energia, horas, descripciones,
          categorias, puntualidad, cierres y rachas. No se hacen suposiciones
          sobre causas.
        </p>
      </div>
    </div>
  );
}
