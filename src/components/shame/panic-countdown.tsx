"use client";

// ===============================================================
// PANIC COUNTDOWN -- PERMANENT LOSS PRESSURE
// ===============================================================
//
// A persistent countdown showing how much time is left before
// the day is marked as a PERMANENT LOSS. Creates artificial
// urgency with real consequences.
//
// States:
//   Hidden   -- more than 2 hours remain OR enough hours logged
//   Warning  -- 2h-1h left, amber treatment
//   Urgent   -- 1h-30min left, red treatment
//   Critical -- <30min left, pulsing red, every-second update
//   Dead     -- past deadline with insufficient hours
//
// Uses useOrg(), getTodayMTY(), ticks every second for countdown.

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getTodayMTY } from "@/lib/utils";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { Clock, Skull, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CountdownPhase = "hidden" | "warning" | "urgent" | "critical" | "dead";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the current Date object in Monterrey timezone.
 *  Falls back to a UTC-6 approximation if Intl timezone support fails.
 */
function getNowMTY(): Date {
  try {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
    );
  } catch {
    // Fallback: UTC-6 approximation (CST, no DST adjustment)
    const now = new Date();
    return new Date(now.getTime() - 6 * 60 * 60 * 1000);
  }
}

/** Get current hour (0-23) in Monterrey timezone.
 *  Falls back to UTC-6 if Intl.DateTimeFormat with timezone fails.
 */
function getMTYHour(): number {
  try {
    const now = new Date();
    const mtyTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Monterrey",
      hour: "numeric",
      hour12: false,
    }).format(now);
    const parsed = parseInt(mtyTime, 10);
    // Intl can return 24 for midnight in some locales — normalise
    return isNaN(parsed) ? getNowMTY().getHours() : parsed % 24;
  } catch {
    return getNowMTY().getHours();
  }
}

/** Check if today is a weekday in MTY timezone. */
function isMTYWeekday(): boolean {
  const now = getNowMTY();
  const day = now.getDay();
  return day !== 0 && day !== 6;
}

/**
 * Calculate milliseconds remaining until a given hour (in MTY timezone).
 * Returns 0 if already past.
 */
function msUntilHourMTY(targetHour: number): number {
  try {
    const now = getNowMTY();
    const target = new Date(now);
    target.setHours(targetHour, 0, 0, 0);
    const diff = target.getTime() - now.getTime();
    return Math.max(0, diff);
  } catch {
    return 0;
  }
}

/**
 * Determine the countdown phase based on remaining milliseconds.
 */
function getPhase(msRemaining: number, hoursLogged: number, isPastDeadline: boolean): CountdownPhase {
  if (isPastDeadline && hoursLogged < EXPECTED_DAILY_HOURS) {
    return "dead";
  }

  // If the user has logged enough hours, hide
  if (hoursLogged >= EXPECTED_DAILY_HOURS) {
    return "hidden";
  }

  const minutesLeft = msRemaining / 60_000;

  if (minutesLeft > 120) return "hidden";
  if (minutesLeft > 60) return "warning";
  if (minutesLeft > 30) return "urgent";
  return "critical";
}

/**
 * Format milliseconds to HH:MM:SS.
 */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Estimate trust score impact for a lost day.
 * Based on typical scoring: missing a full day drops ~5-10 points.
 */
function estimateTrustImpact(hoursLogged: number): number {
  const missing = EXPECTED_DAILY_HOURS - hoursLogged;
  if (missing <= 0) return 0;
  // Rough estimate: ~1 point per missing hour, with floor of 3
  return Math.max(3, Math.round(missing * 1.2));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PanicCountdown() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [workEndHour, setWorkEndHour] = useState(18);
  const [hoursLogged, setHoursLogged] = useState(0);
  const [msRemaining, setMsRemaining] = useState(0);
  const [phase, setPhase] = useState<CountdownPhase>("hidden");
  const [initialized, setInitialized] = useState(false);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -- Load user profile work_end_hour --
  // Default is 18 (6 pm). If query fails or returns null we keep the default.
  useEffect(() => {
    if (!userId) return;
    async function loadProfile() {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("work_end_hour")
          .eq("id", userId)
          .single();
        if (!error && data?.work_end_hour != null) {
          setWorkEndHour(data.work_end_hour);
        }
        // On error or null value: silently keep default of 18
      } catch {
        // Network or unexpected error — keep default of 18
      }
    }
    loadProfile();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Fetch today's logged hours --
  const fetchHours = useCallback(async () => {
    if (!orgId || !userId) return;

    const today = getTodayMTY();

    const { data } = await supabase
      .from("time_entries")
      .select("hour")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", today)
      .is("deleted_at", null);

    // Count unique hours
    const uniqueHours = new Set((data ?? []).map((e) => e.hour));
    setHoursLogged(uniqueHours.size);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Initial load + periodic refresh --
  useEffect(() => {
    if (!orgId || !userId) return;
    fetchHours().then(() => setInitialized(true));
    const interval = setInterval(fetchHours, 60_000);
    return () => clearInterval(interval);
  }, [orgId, userId, fetchHours]);

  // -- Real-time: re-fetch when user logs entries --
  useEffect(() => {
    if (!orgId || !userId) return;

    const channel = supabase
      .channel("panic_countdown_rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          if ((payload.new as { user_id: string }).user_id === userId) {
            fetchHours();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, userId, fetchHours]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Tick every second: update msRemaining and phase --
  useEffect(() => {
    if (!initialized) return;

    function tick() {
      // Not on weekends
      if (!isMTYWeekday()) {
        setPhase("hidden");
        return;
      }

      const remaining = msUntilHourMTY(workEndHour);

      // Grace period: 15 minutes after the deadline before showing "DÍA PERDIDO".
      // People sometimes log their last hour right at the cutoff.
      const GRACE_MS = 15 * 60 * 1000;
      let msPastDeadline = 0;
      if (remaining === 0) {
        try {
          const now = getNowMTY();
          const deadline = new Date(now);
          deadline.setHours(workEndHour, 0, 0, 0);
          msPastDeadline = Math.max(0, now.getTime() - deadline.getTime());
        } catch {
          msPastDeadline = 0;
        }
      }
      const isPastDeadline = remaining === 0 && msPastDeadline > GRACE_MS;

      setMsRemaining(remaining);
      setPhase(getPhase(remaining, hoursLogged, isPastDeadline));
    }

    tick(); // immediate
    tickRef.current = setInterval(tick, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [initialized, workEndHour, hoursLogged]);

  // -- Cleanup --
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // -- Don't render if hidden or not ready --
  if (!initialized || !orgId || !userId) return null;
  if (phase === "hidden") return null;

  const trustImpact = estimateTrustImpact(hoursLogged);
  const missing = EXPECTED_DAILY_HOURS - hoursLogged;

  // -- DEAD state: permanent loss stamp --
  if (phase === "dead") {
    return (
      <div className="w-full border-2 border-red-500 bg-red-950/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <Skull className="w-5 h-5 text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-red-500">
                DÍA PERDIDO
              </span>
              <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-red-500/60">
                PERMANENTE
              </span>
            </div>
            <p className="font-mono text-[11px] text-red-400/80 mt-1 leading-relaxed">
              {hoursLogged}/{EXPECTED_DAILY_HOURS} horas registradas.
              {" "}Tu Trust Score caerá ~{trustImpact} puntos.
              {" "}{missing} hora{missing !== 1 ? "s" : ""} sin registrar = perdida{missing !== 1 ? "s" : ""} permanente{missing !== 1 ? "s" : ""}.
            </p>
          </div>
          <div className="shrink-0 font-mono tabular-nums text-2xl font-black text-red-500">
            00:00:00
          </div>
        </div>
      </div>
    );
  }

  // -- Active countdown states --
  const timerStr = formatCountdown(msRemaining);
  const minutesLeft = msRemaining / 60_000;

  // Visual config per phase
  const phaseConfig: Record<
    "warning" | "urgent" | "critical",
    {
      border: string;
      bg: string;
      timerColor: string;
      textColor: string;
      labelColor: string;
      impactColor: string;
      animation: string;
      borderWidth: string;
    }
  > = {
    warning: {
      border: "border-amber-500/30",
      bg: "bg-amber-950/10",
      timerColor: "text-amber-500",
      textColor: "text-amber-300/80",
      labelColor: "text-amber-400",
      impactColor: "text-amber-500/70",
      animation: "",
      borderWidth: "border",
    },
    urgent: {
      border: "border-red-500/50",
      bg: "bg-red-950/20",
      timerColor: "text-red-500",
      textColor: "text-red-400/80",
      labelColor: "text-red-400",
      impactColor: "text-red-500/70",
      animation: "",
      borderWidth: "border",
    },
    critical: {
      border: "border-red-500",
      bg: "bg-red-950/30",
      timerColor: "text-red-500",
      textColor: "text-red-400",
      labelColor: "text-red-400",
      impactColor: "text-red-500",
      animation: "animate-danger-pulse",
      borderWidth: "border-2",
    },
  };

  const config = phaseConfig[phase];

  // Build urgency message
  let urgencyMessage: string;
  if (phase === "warning") {
    urgencyMessage = `Quedan ${Math.ceil(minutesLeft)} minutos para registrar tu dia. Llevas ${hoursLogged}/${EXPECTED_DAILY_HOURS} horas.`;
  } else if (phase === "urgent") {
    urgencyMessage = `Quedan ${Math.ceil(minutesLeft)} minutos. ${missing} hora${missing !== 1 ? "s" : ""} sin registrar. Trust Score caerá ~${trustImpact} puntos.`;
  } else {
    urgencyMessage = `${Math.ceil(minutesLeft)} MINUTOS. Después: DÍA PERDIDO PERMANENTE. ${hoursLogged} horas. Tu Trust Score caerá ~${trustImpact} puntos.`;
  }

  // Build label
  let phaseLabel: string;
  if (phase === "warning") {
    phaseLabel = "TIEMPO LIMITADO";
  } else if (phase === "urgent") {
    phaseLabel = "URGENTE";
  } else {
    phaseLabel = "CRÍTICO";
  }

  return (
    <div
      className={cn(
        "w-full px-4 py-3",
        config.borderWidth,
        config.border,
        config.bg,
        config.animation
      )}
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="shrink-0">
          {phase === "critical" ? (
            <Skull className={cn("w-5 h-5", config.timerColor)} />
          ) : (
            <AlertTriangle className={cn("w-4 h-4", config.timerColor)} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={cn(
                "font-mono text-[9px] font-bold uppercase tracking-[0.18em]",
                config.labelColor
              )}
            >
              {phaseLabel}
            </span>
            <Clock className={cn("w-3 h-3", config.labelColor)} />
          </div>
          <p className={cn("font-mono text-[11px] leading-relaxed", config.textColor)}>
            {urgencyMessage}
          </p>
          {phase === "critical" && (
            <p className={cn("font-mono text-[11px] mt-0.5", config.impactColor)}>
              0 horas registradas = día perdido permanente en el historial.
            </p>
          )}
        </div>

        {/* Timer */}
        <div
          className={cn(
            "shrink-0 font-mono tabular-nums text-2xl font-black",
            config.timerColor,
            phase === "critical" && "animate-countdown-tick"
          )}
        >
          {timerStr}
        </div>
      </div>
    </div>
  );
}
