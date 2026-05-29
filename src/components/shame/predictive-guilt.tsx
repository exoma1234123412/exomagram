"use client";

// ═══════════════════════════════════════════════════════════════
// PREDICTIVE GUILT — PRE-FAILURE PSYCHOLOGICAL PRESSURE
// ═══════════════════════════════════════════════════════════════
//
// Claude predicts BEFORE you fail. Calculates probabilities
// based on your last 14 days of behavior and shows the highest-
// probability prediction as a challenge banner.
//
// Exploits psychological reactance: people hate being told
// they will fail. The challenge framing ("Vas a probarme
// equivocado?") turns the prediction into a dare.
//
// Disappears when the user proves it wrong (e.g., does the
// closeout, logs enough hours, etc.). Refreshes every 30 min.

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import { Brain } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PredictionType = "no_closeout" | "no_standup" | "low_hours" | "broken_promise";

interface Prediction {
  type: PredictionType;
  probability: number; // 0-100
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MIN_PROBABILITY = 40; // Only show if > 40%
const LOOKBACK_DAYS = 14;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentHourMTY(): number {
  const now = new Date();
  const mtyTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Monterrey",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return parseInt(mtyTime, 10);
}

function getDateNDaysAgo(n: number): string {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  );
  now.setDate(now.getDate() - n);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekday(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function getWorkdaysInRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const current = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    if (isWeekday(dateStr)) {
      days.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function buildMessage(type: PredictionType, probability: number): string {
  const pct = Math.round(probability);
  switch (type) {
    case "no_closeout":
      return `Hay un ${pct}% de probabilidad de que no hagas closeout hoy.`;
    case "no_standup":
      return `Hay un ${pct}% de probabilidad de que no hagas standup hoy.`;
    case "low_hours":
      return `Hay un ${pct}% de probabilidad de que registres menos de 6 horas hoy.`;
    case "broken_promise":
      return `Hay un ${pct}% de probabilidad de que rompas una promesa hoy.`;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PredictiveGuilt() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);

  const calculatePredictions = useCallback(async () => {
    if (!orgId || !userId) return;

    const today = getTodayMTY();
    const startDate = getDateNDaysAgo(LOOKBACK_DAYS);
    const yesterday = getDateNDaysAgo(1);

    // Only count workdays in the lookback period (exclude today)
    const workdays = getWorkdaysInRange(startDate, yesterday);
    const workdayCount = workdays.length;

    if (workdayCount === 0) {
      setPrediction(null);
      setLoading(false);
      return;
    }

    // Fetch all historical data in parallel
    const [
      closeoutsRes,
      standupsRes,
      entriesRes,
      promisesRes,
      todayCloseoutRes,
      todayStandupRes,
      todayEntriesRes,
      todayPromisesRes,
    ] = await Promise.all([
      // Historical (last 14 workdays, excluding today)
      supabase
        .from("daily_closeouts")
        .select("date")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .gte("date", startDate)
        .lt("date", today),
      supabase
        .from("standups")
        .select("date")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .gte("date", startDate)
        .lt("date", today),
      supabase
        .from("time_entries")
        .select("date, hour")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .gte("date", startDate)
        .lt("date", today)
        .is("deleted_at", null),
      supabase
        .from("daily_promises")
        .select("status")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .gte("date", startDate)
        .lt("date", today),
      // Today's data (to check if already proven wrong)
      supabase
        .from("daily_closeouts")
        .select("id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("date", today)
        .limit(1)
        .single(),
      supabase
        .from("standups")
        .select("id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("date", today)
        .limit(1)
        .single(),
      supabase
        .from("time_entries")
        .select("hour")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("date", today)
        .is("deleted_at", null),
      supabase
        .from("daily_promises")
        .select("status")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("date", today),
    ]);

    const candidates: Prediction[] = [];

    // ---- P(no closeout today) ----
    // Only predict if user hasn't already done closeout today
    if (!todayCloseoutRes.data) {
      const closeoutDates = new Set(
        (closeoutsRes.data ?? []).map((c) => c.date)
      );
      const closeoutWorkdays = workdays.filter((d) =>
        closeoutDates.has(d)
      ).length;
      const closeoutRate = closeoutWorkdays / workdayCount;
      const pNoCloseout = (1 - closeoutRate) * 100;

      if (pNoCloseout > MIN_PROBABILITY) {
        candidates.push({
          type: "no_closeout",
          probability: pNoCloseout,
          message: buildMessage("no_closeout", pNoCloseout),
        });
      }
    }

    // ---- P(no standup today) ----
    if (!todayStandupRes.data) {
      const standupDates = new Set(
        (standupsRes.data ?? []).map((s) => s.date)
      );
      const standupWorkdays = workdays.filter((d) =>
        standupDates.has(d)
      ).length;
      const standupRate = standupWorkdays / workdayCount;
      const pNoStandup = (1 - standupRate) * 100;

      if (pNoStandup > MIN_PROBABILITY) {
        candidates.push({
          type: "no_standup",
          probability: pNoStandup,
          message: buildMessage("no_standup", pNoStandup),
        });
      }
    }

    // ---- P(< 6 hours today) ----
    // Count unique hours per day to get daily totals
    const hoursByDate = new Map<string, Set<number>>();
    for (const entry of entriesRes.data ?? []) {
      if (!hoursByDate.has(entry.date)) {
        hoursByDate.set(entry.date, new Set());
      }
      hoursByDate.get(entry.date)!.add(entry.hour);
    }

    let daysUnder6 = 0;
    for (const day of workdays) {
      const hours = hoursByDate.get(day)?.size ?? 0;
      if (hours < 6) daysUnder6++;
    }

    const todayHours = todayEntriesRes.data?.length ?? 0;
    const currentHour = getCurrentHourMTY();
    // Only predict low hours if it's past noon and they haven't hit 6 yet
    if (todayHours < 6 && currentHour >= 12) {
      const pLowHours = (daysUnder6 / workdayCount) * 100;
      if (pLowHours > MIN_PROBABILITY) {
        candidates.push({
          type: "low_hours",
          probability: pLowHours,
          message: buildMessage("low_hours", pLowHours),
        });
      }
    }

    // ---- P(broken promise) ----
    const allPromises = promisesRes.data ?? [];
    const totalResolved = allPromises.filter(
      (p) => p.status === "delivered" || p.status === "broken"
    );
    const brokenCount = allPromises.filter(
      (p) => p.status === "broken"
    ).length;

    const todayPromises = todayPromisesRes.data ?? [];
    const hasPendingPromises = todayPromises.some(
      (p) => p.status === "pending"
    );

    if (hasPendingPromises && totalResolved.length > 0) {
      const pBroken = (brokenCount / totalResolved.length) * 100;
      if (pBroken > MIN_PROBABILITY) {
        candidates.push({
          type: "broken_promise",
          probability: pBroken,
          message: buildMessage("broken_promise", pBroken),
        });
      }
    }

    // Pick highest probability
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.probability - a.probability);
      setPrediction(candidates[0]);
    } else {
      setPrediction(null);
    }

    setLoading(false);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Initial load + polling ----
  useEffect(() => {
    if (!orgId || !userId) return;
    calculatePredictions();
    const interval = setInterval(calculatePredictions, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [orgId, userId, calculatePredictions]);

  // ---- Real-time: re-check when user logs entries / closeouts / standups ----
  useEffect(() => {
    if (!orgId || !userId) return;

    const channel = supabase
      .channel("predictive_guilt_rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "daily_closeouts",
          filter: `org_id=eq.${orgId}`,
        },
        () => calculatePredictions()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "standups",
          filter: `org_id=eq.${orgId}`,
        },
        () => calculatePredictions()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => calculatePredictions()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_promises",
          filter: `org_id=eq.${orgId}`,
        },
        () => calculatePredictions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, userId, calculatePredictions]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Don't render ----
  if (loading || !orgId || !userId) return null;
  if (!prediction) return null;

  return (
    <div className="w-full border border-amber-500/30 bg-amber-950/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <Brain className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-mono tabular-nums font-bold text-amber-400">
              PREDICCION //
            </span>{" "}
            {prediction.message.split(/(\d+%)/).map((part, i) =>
              /^\d+%$/.test(part) ? (
                <span
                  key={i}
                  className="font-mono tabular-nums font-bold text-amber-400"
                >
                  {part}
                </span>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
          </p>
          <p className="font-mono text-xs text-amber-300 italic mt-1">
            Vas a probarme equivocado?
          </p>
        </div>
      </div>
    </div>
  );
}
