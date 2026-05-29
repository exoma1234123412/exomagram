"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, cn } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Flame } from "lucide-react";

// ================================================================
// SHAME STREAK — Consecutive days in last place tracker
// ================================================================
//
// Tracks how many consecutive days each person has been in last
// place (fewest hours logged). If the current user has a shame
// streak >= 2 days, shows a fixed badge near the ranking strip
// that is red, pulsing, and impossible to ignore.
//
// Severity scales with streak length:
//   2 days:  small red text
//   3 days:  medium red, pulsing
//   5+ days: large red, aggressive pulse, "RECORD" if longest ever
//
// Also exports a hook `useShameStreak(userId)` for use on profiles.
//
// Shows on EVERY page as part of the layout.

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

interface ShameStreakData {
  currentStreak: number;
  longestStreak: number;
  isActive: boolean; // streak includes today
}

interface DayRanking {
  date: string;
  lastPlaceUserIds: string[];
}

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

const LOOKBACK_DAYS = 30;
const REFRESH_INTERVAL_MS = 120_000; // 2 minutes

// ----------------------------------------------------------------
// Hook: useShameStreak
// ----------------------------------------------------------------

export function useShameStreak(targetUserId: string | null): {
  streak: ShameStreakData | null;
  loading: boolean;
} {
  const { orgId } = useOrg();
  const supabase = createClient();
  const [streak, setStreak] = useState<ShameStreakData | null>(null);
  const [loading, setLoading] = useState(true);

  const compute = useCallback(async () => {
    if (!orgId || !targetUserId) return;

    const today = getTodayMTY();

    // Build date range for the last N days
    const dates: string[] = [];
    for (let i = 0; i < LOOKBACK_DAYS; i++) {
      const d = new Date(today + "T12:00:00");
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split("T")[0]);
    }
    const oldestDate = dates[dates.length - 1];

    // Fetch all members
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId);

    if (!members || members.length < 2) {
      setStreak({ currentStreak: 0, longestStreak: 0, isActive: false });
      setLoading(false);
      return;
    }

    const memberIds = new Set(members.map((m) => m.user_id));

    // Fetch time_entries for the lookback window
    const { data: entries } = await supabase
      .from("time_entries")
      .select("user_id, date")
      .eq("org_id", orgId)
      .gte("date", oldestDate)
      .lte("date", today);

    // Build hours-per-user-per-day
    const hoursMap = new Map<string, Map<string, number>>();
    for (const e of (entries ?? [])) {
      if (!hoursMap.has(e.date)) hoursMap.set(e.date, new Map());
      const dayMap = hoursMap.get(e.date)!;
      dayMap.set(e.user_id, (dayMap.get(e.user_id) ?? 0) + 1);
    }

    // For each day, determine who was in last place
    const dayRankings: DayRanking[] = [];
    for (const date of dates) {
      const dayMap = hoursMap.get(date) ?? new Map<string, number>();

      // Build list with hours (members who didn't log get 0)
      const memberHours: { userId: string; hours: number }[] = [];
      for (const uid of memberIds) {
        memberHours.push({ userId: uid as string, hours: dayMap.get(uid as string) ?? 0 });
      }

      // Find minimum hours
      const minHours = Math.min(...memberHours.map((m) => m.hours));
      const maxHours = Math.max(...memberHours.map((m) => m.hours));

      // If everyone has the same hours, no one is in last place
      if (minHours === maxHours) {
        dayRankings.push({ date, lastPlaceUserIds: [] });
      } else {
        const lastPlace = memberHours
          .filter((m) => m.hours === minHours)
          .map((m) => m.userId);
        dayRankings.push({ date, lastPlaceUserIds: lastPlace });
      }
    }

    // Calculate consecutive streak for target user (starting from today/yesterday)
    let currentStreak = 0;
    let isActive = false;

    for (let i = 0; i < dayRankings.length; i++) {
      const day = dayRankings[i];
      if (day.lastPlaceUserIds.includes(targetUserId)) {
        currentStreak++;
        if (i === 0) isActive = true;
      } else {
        // If streak hasn't started yet (day 0 was not last place),
        // check if day 1 starts a streak (grace: today might not be over)
        if (i === 0) continue;
        break;
      }
    }

    // Calculate longest-ever streak from the full window
    let longestStreak = 0;
    let tempStreak = 0;
    for (const day of dayRankings) {
      if (day.lastPlaceUserIds.includes(targetUserId)) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    setStreak({ currentStreak, longestStreak, isActive });
    setLoading(false);
  }, [orgId, targetUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load + polling
  useEffect(() => {
    if (!orgId || !targetUserId) return;
    compute();
    const interval = setInterval(compute, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [orgId, targetUserId, compute]);

  // Real-time subscription
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`shame_streak_${targetUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => compute()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, targetUserId, compute]); // eslint-disable-line react-hooks/exhaustive-deps

  return { streak, loading };
}

// ----------------------------------------------------------------
// Component: ShameStreakBadge
// ----------------------------------------------------------------

interface ShameStreakBadgeProps {
  /** Provide a userId to show their streak. Omit to show current user's. */
  userId?: string;
  /** Compact mode for use inside cards/profiles */
  compact?: boolean;
}

export function ShameStreakBadge({ userId, compact = false }: ShameStreakBadgeProps) {
  const { userId: currentUserId } = useOrg();
  const targetId = userId ?? currentUserId;
  const { streak, loading } = useShameStreak(targetId);

  // Don't show if loading, no streak data, or streak < 2
  if (loading || !streak || streak.currentStreak < 2) return null;

  const days = streak.currentStreak;
  const isRecord = streak.currentStreak >= streak.longestStreak && streak.longestStreak >= 5;

  // Severity tiers
  const severity = days >= 5 ? "critical" : days >= 3 ? "high" : "low";

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider font-bold",
          severity === "critical" && "text-red-600 dark:text-red-400",
          severity === "high" && "text-red-600 dark:text-red-400 animate-pulse",
          severity === "low" && "text-red-500 dark:text-red-400/80"
        )}
      >
        <Flame className="w-3 h-3" />
        {days}d ultimo
        {isRecord && " (REC)"}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "w-full border-b font-mono",
        "flex items-center justify-center gap-2 px-4",
        "transition-all duration-300",
        // Severity-based styling
        severity === "low" && [
          "py-1 text-[10px]",
          "bg-red-500/5 border-red-500/20",
          "text-red-600 dark:text-red-400",
        ],
        severity === "high" && [
          "py-1.5 text-[11px]",
          "bg-red-500/10 border-red-500/30",
          "text-red-600 dark:text-red-400",
          "animate-pulse",
        ],
        severity === "critical" && [
          "py-2 text-xs",
          "bg-red-500/15 border-red-500/40",
          "text-red-600 dark:text-red-300",
          "animate-[shame-pulse_1s_ease-in-out_infinite]",
        ]
      )}
    >
      <Flame
        className={cn(
          "shrink-0",
          severity === "low" && "w-3 h-3",
          severity === "high" && "w-3.5 h-3.5",
          severity === "critical" && "w-4 h-4 animate-pulse"
        )}
      />

      <span className="uppercase tracking-wider font-bold">
        RACHA DE VERGUENZA:{" "}
        <span className="font-mono tabular-nums">{days}</span>{" "}
        {days === 1 ? "dia" : "dias"} en ultimo lugar
      </span>

      {isRecord && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 px-1.5 py-0.5",
            "border border-red-500/40 bg-red-500/20",
            "text-[9px] font-bold tracking-[0.2em] uppercase"
          )}
        >
          RECORD
        </span>
      )}

      {/* CSS for critical pulse */}
      <style jsx>{`
        @keyframes shame-pulse {
          0%, 100% {
            background-color: rgb(239 68 68 / 0.15);
            border-color: rgb(239 68 68 / 0.4);
          }
          50% {
            background-color: rgb(239 68 68 / 0.25);
            border-color: rgb(239 68 68 / 0.6);
          }
        }
      `}</style>
    </div>
  );
}
