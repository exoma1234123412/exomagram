"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Clock, Flame, CheckCircle2, XCircle } from "lucide-react";

interface TimerData {
  hoursUntilClose: number;
  minutesUntilClose: number;
  hoursUntilMidnight: number;
  minutesUntilMidnight: number;
  currentHourLogged: boolean;
  workdayExpired: boolean;
}

function getMTYNow(): Date {
  // Get current time in Monterrey timezone
  const str = new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" });
  return new Date(str);
}

function computeTimerData(currentHourLogged: boolean): TimerData {
  const now = getMTYNow();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();

  // Hours until 6pm (18:00)
  const closeMinutes = Math.max(0, (18 * 60) - (currentHour * 60 + currentMin));
  const hoursUntilClose = Math.floor(closeMinutes / 60);
  const minutesUntilClose = closeMinutes % 60;
  const workdayExpired = closeMinutes === 0;

  // Hours until midnight (23:59)
  const midnightMinutes = Math.max(0, (24 * 60) - (currentHour * 60 + currentMin));
  const hoursUntilMidnight = Math.floor(midnightMinutes / 60);
  const minutesUntilMidnight = midnightMinutes % 60;

  return {
    hoursUntilClose,
    minutesUntilClose,
    hoursUntilMidnight,
    minutesUntilMidnight,
    currentHourLogged,
    workdayExpired,
  };
}

function getCloseColor(h: number): string {
  if (h >= 4) return "text-emerald-600 dark:text-emerald-400";
  if (h >= 2) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getStreakColor(h: number): string {
  if (h >= 6) return "text-emerald-600 dark:text-emerald-400";
  if (h >= 3) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function ScarcityTimer({ orgId }: { orgId: string }) {
  const { userId } = useOrg();
  const supabase = createClient();
  const [data, setData] = useState<TimerData | null>(null);

  // Check if current hour is logged
  useEffect(() => {
    if (!userId || !orgId) return;

    async function checkCurrentHour() {
      const today = getTodayMTY();
      const now = getMTYNow();
      const currentHour = now.getHours();

      const { count } = await supabase
        .from("time_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("org_id", orgId)
        .eq("date", today)
        .eq("hour", currentHour)
        .is("deleted_at", null);

      setData(computeTimerData((count ?? 0) > 0));
    }

    checkCurrentHour();
  }, [userId, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick every 30 seconds to update countdown
  useEffect(() => {
    if (data === null) return;

    const interval = setInterval(() => {
      setData((prev) => prev ? computeTimerData(prev.currentHourLogged) : null);
    }, 30_000);

    return () => clearInterval(interval);
  }, [data !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;

  const closeTotal = data.hoursUntilClose + data.minutesUntilClose / 60;
  const midnightTotal = data.hoursUntilMidnight + data.minutesUntilMidnight / 60;
  const closeColor = getCloseColor(closeTotal);
  const streakColor = getStreakColor(midnightTotal);
  const urgentClose = closeTotal < 2 && !data.workdayExpired;
  const urgentStreak = midnightTotal < 3;

  return (
    <div className="border border-border p-3 mb-6 font-mono">
      {/* Section label */}
      <div className="palantir-divider text-muted-foreground mb-3">
        Tiempo restante
      </div>

      <div className="space-y-2">
        {/* Time until close */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className={cn("w-3.5 h-3.5 shrink-0", closeColor)} />
            <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Hasta cierre
            </span>
          </div>
          {data.workdayExpired ? (
            <span className="text-sm font-bold tabular-nums tracking-tight text-red-600 dark:text-red-400">
              EXPIRADO
            </span>
          ) : (
            <span
              className={cn(
                "text-sm font-bold tabular-nums tracking-tight",
                closeColor,
                urgentClose && "animate-countdown-tick"
              )}
            >
              {data.hoursUntilClose}h {String(data.minutesUntilClose).padStart(2, "0")}m
            </span>
          )}
        </div>

        {/* Time until streak expires */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className={cn("w-3.5 h-3.5 shrink-0", streakColor)} />
            <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Hasta racha expire
            </span>
          </div>
          <span
            className={cn(
              "text-sm font-bold tabular-nums tracking-tight",
              streakColor,
              urgentStreak && "animate-danger-pulse inline-block px-1 border border-transparent"
            )}
          >
            {data.hoursUntilMidnight}h {String(data.minutesUntilMidnight).padStart(2, "0")}m
          </span>
        </div>

        {/* Current hour status */}
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <div className="flex items-center gap-2">
            {data.currentHourLogged ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="w-3.5 h-3.5 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Hora actual
            </span>
          </div>
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-wide",
              data.currentHourLogged
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {data.currentHourLogged ? "Registrada" : "Sin registrar"}
          </span>
        </div>
      </div>
    </div>
  );
}
