"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import {
  TrendingDown,
  ArrowDown,
  Clock,
  Flame,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AlertUrgency = "critical" | "high" | "medium" | "low";

interface LossAlert {
  id: string;
  icon: React.ReactNode;
  text: string;
  lossValue: string;
  urgency: AlertUrgency;
  order: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ALERTS = 5;

const URGENCY_ORDER: Record<AlertUrgency, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const ICON_CLASS = "size-3 shrink-0 text-red-400";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getYesterdayMTY(): string {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
  }).format(yesterday);
}

function getCurrentHourMTY(): number {
  const now = new Date();
  const mtyTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Monterrey",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return parseInt(mtyTime, 10);
}

function getWorkHoursRemainingToday(): number {
  const hour = getCurrentHourMTY();
  // Work day ends at 19:00 (7pm)
  const endHour = 19;
  if (hour >= endHour) return 0;
  return endHour - hour;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LossFramingAlerts() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();
  const [alerts, setAlerts] = useState<LossAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const generateAlerts = useCallback(async () => {
    if (!orgId || !userId) return;

    const today = getTodayMTY();
    const yesterday = getYesterdayMTY();
    const generated: LossAlert[] = [];

    // -----------------------------------------------------------------------
    // 1. Trust Score drop
    // -----------------------------------------------------------------------
    const { data: trustScores } = await supabase
      .from("trust_score_history")
      .select("date, score")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .in("date", [today, yesterday])
      .order("date", { ascending: false });

    if (trustScores && trustScores.length >= 2) {
      const todayScore = trustScores.find((s) => s.date === today);
      const yesterdayScore = trustScores.find((s) => s.date === yesterday);
      if (todayScore && yesterdayScore && todayScore.score < yesterdayScore.score) {
        const drop = yesterdayScore.score - todayScore.score;
        const urgency: AlertUrgency = drop >= 10 ? "critical" : drop >= 5 ? "high" : "medium";
        generated.push({
          id: `trust-drop-${today}`,
          icon: <TrendingDown className={ICON_CLASS} />,
          text: `Tu Trust Score CAY\u00D3 ${drop} puntos`,
          lossValue: `-${drop}`,
          urgency,
          order: URGENCY_ORDER[urgency],
        });
      }
    }

    // -----------------------------------------------------------------------
    // 2. Leaderboard position drop
    // -----------------------------------------------------------------------
    const { data: rankings } = await supabase
      .from("power_rankings")
      .select("user_id, rank, updated_at")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(2);

    if (rankings && rankings.length >= 2) {
      const currentRank = rankings[0].rank;
      const previousRank = rankings[1].rank;
      if (currentRank > previousRank) {
        const positionsLost = currentRank - previousRank;
        const urgency: AlertUrgency = positionsLost >= 3 ? "critical" : positionsLost >= 2 ? "high" : "medium";
        generated.push({
          id: `rank-drop-${today}`,
          icon: <ArrowDown className={ICON_CLASS} />,
          text: `Perdiste ${positionsLost} ${positionsLost === 1 ? "posici\u00F3n" : "posiciones"} en el ranking`,
          lossValue: `-${positionsLost}`,
          urgency,
          order: URGENCY_ORDER[urgency],
        });
      }
    }

    // -----------------------------------------------------------------------
    // 3. Hours below target
    // -----------------------------------------------------------------------
    const { data: todayEntries } = await supabase
      .from("time_entries")
      .select("id")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", today)
      .is("deleted_at", null);

    const hoursLogged = todayEntries?.length ?? 0;
    const currentHour = getCurrentHourMTY();
    // Expected hours so far = hours since 7am (work start) up to now, capped at EXPECTED_DAILY_HOURS
    const hoursSinceStart = Math.max(0, Math.min(currentHour - 7, EXPECTED_DAILY_HOURS));

    if (hoursSinceStart > 0 && hoursLogged < hoursSinceStart) {
      const deficit = hoursSinceStart - hoursLogged;
      const urgency: AlertUrgency = deficit >= 4 ? "critical" : deficit >= 2 ? "high" : "medium";
      generated.push({
        id: `hours-deficit-${today}`,
        icon: <Clock className={ICON_CLASS} />,
        text: `Llevas ${deficit} ${deficit === 1 ? "hora" : "horas"} DEBAJO del objetivo`,
        lossValue: `-${deficit}h`,
        urgency,
        order: URGENCY_ORDER[urgency],
      });
    }

    // -----------------------------------------------------------------------
    // 4. Streak at risk
    // -----------------------------------------------------------------------
    const { data: streak } = await supabase
      .from("activity_streaks")
      .select("current_streak, last_active_date")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (streak && streak.current_streak > 0 && hoursLogged === 0) {
      const remainingHours = getWorkHoursRemainingToday();
      if (remainingHours > 0 && streak.last_active_date !== today) {
        const urgency: AlertUrgency = remainingHours <= 2 ? "critical" : remainingHours <= 4 ? "high" : "medium";
        generated.push({
          id: `streak-risk-${today}`,
          icon: <Flame className={ICON_CLASS} />,
          text: `Tu racha de ${streak.current_streak} d\u00EDas MUERE en ${remainingHours}h`,
          lossValue: `${streak.current_streak}d`,
          urgency,
          order: URGENCY_ORDER[urgency],
        });
      }
    }

    // -----------------------------------------------------------------------
    // 5. Undelivered promises
    // -----------------------------------------------------------------------
    const { data: promises } = await supabase
      .from("daily_promises")
      .select("id, status")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", today)
      .eq("status", "pending");

    const pendingCount = promises?.length ?? 0;
    if (pendingCount > 0) {
      const remainingHours = getWorkHoursRemainingToday();
      const urgency: AlertUrgency = remainingHours <= 2 ? "critical" : remainingHours <= 4 ? "high" : "medium";
      generated.push({
        id: `promises-risk-${today}`,
        icon: <ShieldAlert className={ICON_CLASS} />,
        text: `${pendingCount} ${pendingCount === 1 ? "promesa est\u00E1" : "promesas est\u00E1n"} a punto de ROMPERSE`,
        lossValue: `${pendingCount}`,
        urgency,
        order: URGENCY_ORDER[urgency],
      });
    }

    // Sort by urgency (critical first), then take max 5
    generated.sort((a, b) => a.order - b.order);
    setAlerts(generated.slice(0, MAX_ALERTS));
    setLoading(false);
  }, [orgId, userId, supabase]);

  // Initial load + refresh interval
  useEffect(() => {
    if (!orgId || !userId) return;

    generateAlerts();
    const interval = setInterval(generateAlerts, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [orgId, userId, generateAlerts]);

  if (loading || !orgId || !userId) return null;
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="border border-red-500/20 bg-red-950/5 px-3 py-2 flex items-center gap-2"
        >
          {alert.icon}
          <span className="font-mono text-[11px] leading-snug text-foreground flex-1">
            {alert.text}
          </span>
          <span
            className={cn(
              "font-mono tabular-nums font-bold text-[11px] shrink-0",
              alert.urgency === "critical"
                ? "text-red-400 animate-pulse"
                : "text-red-400",
            )}
          >
            {alert.lossValue}
          </span>
        </div>
      ))}
    </div>
  );
}
