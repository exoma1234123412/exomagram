"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { WORK_HOURS, CATEGORIES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { TimeEntry, LiveStatus } from "@/lib/types/database";
import type { WorkCategory } from "@/lib/types/database";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Clock,
  Ghost,
  AlertTriangle,
  TrendingDown,
  Flame,
  Shield,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HourSlot {
  hour: number;
  status: "logged" | "gap" | "ghost" | "current" | "future";
  entry?: TimeEntry;
  wasOnline?: boolean;
}

interface GapDay {
  date: string;
  gapCount: number;
  gapHours: number[];
}

interface GapAnalyzerData {
  slots: HourSlot[];
  gapCount: number;
  ghostCount: number;
  coveragePercent: number;
  mostProductiveHour: number | null;
  history: GapDay[];
  currentStreak: number;
  latestTrustScore: number | null;
  habitPattern: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function pastNDaysISO(n: number): string[] {
  const days: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function detectHabitPattern(history: GapDay[]): string | null {
  if (history.length < 3) return null;

  // Build a map of hour -> how many consecutive recent days it appears as gap
  const hourStreaks = new Map<number, number>();

  for (const hour of WORK_HOURS) {
    let consecutive = 0;
    for (const day of history) {
      if (day.gapHours.includes(hour)) {
        consecutive++;
      } else {
        break;
      }
    }
    if (consecutive >= 3) {
      hourStreaks.set(hour, consecutive);
    }
  }

  if (hourStreaks.size === 0) return null;

  const worst = [...hourStreaks.entries()].sort((a, b) => b[1] - a[1])[0];
  return `Has tenido gaps a las ${formatHour(worst[0])} por ${worst[1]} dias seguidos`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GapAnalyzer({ orgId }: { orgId: string }) {
  const supabase = createClient();
  const [data, setData] = useState<GapAnalyzerData | null>(null);
  const [loading, setLoading] = useState(true);

  // ---------- Data fetching ------------------------------------------------

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const today = todayISO();
    const currentHour = new Date().getHours();
    const past7 = pastNDaysISO(7);

    const [
      { data: todayEntries },
      { data: historyEntries },
      { data: liveStatus },
      { data: streakData },
      { data: trustData },
    ] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .eq("date", today)
        .returns<TimeEntry[]>(),
      supabase
        .from("time_entries")
        .select("date, hour")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .in("date", past7),
      supabase
        .from("live_status")
        .select("*")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .limit(1)
        .single<LiveStatus>(),
      supabase
        .from("activity_streaks")
        .select("current_streak")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .limit(1)
        .single<{ current_streak: number }>(),
      supabase
        .from("trust_score_history")
        .select("score")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .order("date", { ascending: false })
        .limit(1)
        .single<{ score: number }>(),
    ]);

    const entries = todayEntries ?? [];
    const loggedHoursMap = new Map<number, TimeEntry>();
    for (const e of entries) {
      loggedHoursMap.set(e.hour, e);
    }

    // Determine hours when user was online — compare live_status window
    const onlineHours = new Set<number>();
    if (liveStatus && liveStatus.status !== "offline") {
      const startedAt = new Date(liveStatus.started_at);
      const lastBeat = new Date(liveStatus.last_heartbeat);
      const startHour = startedAt.toISOString().slice(0, 10) === today
        ? startedAt.getHours()
        : WORK_HOURS[0];
      const endHour = lastBeat.toISOString().slice(0, 10) === today
        ? lastBeat.getHours()
        : currentHour;
      for (let h = startHour; h <= endHour; h++) {
        onlineHours.add(h);
      }
      // Also mark current hour as online if status is not offline
      onlineHours.add(currentHour);
    }

    // Build slots
    const slots: HourSlot[] = WORK_HOURS.map((hour) => {
      const entry = loggedHoursMap.get(hour);
      if (entry) {
        return { hour, status: "logged" as const, entry };
      }
      if (hour === currentHour) {
        return { hour, status: "current" as const, wasOnline: onlineHours.has(hour) };
      }
      if (hour > currentHour) {
        return { hour, status: "future" as const };
      }
      // Past unlogged hour
      const wasOnline = onlineHours.has(hour);
      return {
        hour,
        status: wasOnline ? "ghost" as const : "gap" as const,
        wasOnline,
      };
    });

    const gapCount = slots.filter(
      (s) => s.status === "gap" || s.status === "ghost",
    ).length;
    const ghostCount = slots.filter((s) => s.status === "ghost").length;

    // Coverage: logged vs past work hours
    const pastWorkHours = WORK_HOURS.filter((h) => h < currentHour).length;
    const loggedCount = slots.filter((s) => s.status === "logged").length;
    const coveragePercent =
      pastWorkHours > 0 ? Math.round((loggedCount / pastWorkHours) * 100) : 100;

    // Most productive hour: hour with most entries historically
    const hourCounts = new Map<number, number>();
    for (const e of entries) {
      hourCounts.set(e.hour, (hourCounts.get(e.hour) ?? 0) + 1);
    }
    // Also count from history entries
    for (const e of historyEntries ?? []) {
      hourCounts.set(e.hour, (hourCounts.get(e.hour) ?? 0) + 1);
    }
    let mostProductiveHour: number | null = null;
    let maxCount = 0;
    for (const [hour, count] of hourCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostProductiveHour = hour;
      }
    }

    // Build history
    const historyMap = new Map<string, Set<number>>();
    for (const e of historyEntries ?? []) {
      const set = historyMap.get(e.date) ?? new Set<number>();
      set.add(e.hour);
      historyMap.set(e.date, set);
    }

    const history: GapDay[] = past7.map((date) => {
      const logged = historyMap.get(date) ?? new Set<number>();
      const gaps = WORK_HOURS.filter((h) => !logged.has(h));
      return { date, gapCount: gaps.length, gapHours: gaps };
    });

    const habitPattern = detectHabitPattern(history);

    setData({
      slots,
      gapCount,
      ghostCount,
      coveragePercent,
      mostProductiveHour,
      history,
      currentStreak: streakData?.current_streak ?? 0,
      latestTrustScore: trustData?.score ?? null,
      habitPattern,
    });

    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  // ---------- Projected impact calculations --------------------------------

  const projectedImpact = useMemo(() => {
    if (!data) return null;

    const missingHours = data.gapCount;
    // Each missing hour costs approximately 3-5 trust points
    const trustDrop = Math.min(missingHours * 4, 30);
    const streakAtRisk = data.currentStreak > 0 && data.gapCount > 0;

    return { trustDrop, streakAtRisk };
  }, [data]);

  // ---------- Render -------------------------------------------------------

  if (loading || !data) {
    return (
      <Card>
        <CardContent>
          <div className="flex items-center gap-2 py-8 justify-center">
            <Clock className="h-5 w-5 animate-pulse text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Analizando gaps...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle
            className={cn(
              "h-5 w-5",
              data.gapCount > 0 ? "text-red-500" : "text-green-500",
            )}
          />
          Analisis de Gaps
        </CardTitle>
        <CardDescription>
          Cada hora sin registro es visible para todo el equipo
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ---- 1. Today's Hour Grid ---- */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Mapa del dia — {formatHour(WORK_HOURS[0])} a{" "}
            {formatHour(WORK_HOURS[WORK_HOURS.length - 1] + 1)}
          </h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2">
            {data.slots.map((slot) => (
              <HourSquare key={slot.hour} slot={slot} />
            ))}
          </div>
        </div>

        {/* ---- 2. Gap Statistics ---- */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Estadisticas
          </h3>

          {/* Missing hours */}
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-red-500" />
              <span className="text-sm">
                Horas sin registro hoy
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  data.gapCount > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-green-600 dark:text-green-400",
                )}
              >
                {data.gapCount}
              </span>
              <span className="text-[10px] text-muted-foreground">
                / {EXPECTED_DAILY_HOURS} esperadas
              </span>
            </div>
          </div>

          {/* Ghost hours */}
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <Ghost className="h-4 w-4 text-red-500" />
              <span className="text-sm">
                Horas fantasma (en linea sin registro)
              </span>
            </div>
            <span
              className={cn(
                "text-sm font-bold tabular-nums",
                data.ghostCount > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400",
              )}
            >
              {data.ghostCount}
            </span>
          </div>

          {/* Coverage bar */}
          <div className="rounded-lg bg-muted/40 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Porcentaje de cobertura</span>
              </div>
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  data.coveragePercent >= 80
                    ? "text-green-600 dark:text-green-400"
                    : data.coveragePercent >= 50
                      ? "text-yellow-600 dark:text-yellow-400"
                      : "text-red-600 dark:text-red-400",
                )}
              >
                {data.coveragePercent}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  data.coveragePercent >= 80
                    ? "bg-green-500"
                    : data.coveragePercent >= 50
                      ? "bg-yellow-500"
                      : "bg-red-500",
                )}
                style={{ width: `${Math.min(data.coveragePercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Most productive hour */}
          {data.mostProductiveHour !== null && (
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                <span className="text-sm">Hora mas productiva</span>
              </div>
              <span className="text-sm font-bold tabular-nums">
                {formatHour(data.mostProductiveHour)}
              </span>
            </div>
          )}
        </div>

        {/* ---- 3. Gap History (last 7 days) ---- */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Historial de gaps — ultimos 7 dias
          </h3>

          <div className="grid grid-cols-7 gap-1.5">
            {data.history.map((day) => {
              const dayLabel = new Date(day.date + "T12:00:00").toLocaleDateString(
                "es-MX",
                { weekday: "short" },
              );
              const dayNum = new Date(day.date + "T12:00:00").getDate();
              return (
                <div
                  key={day.date}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg border p-2 transition-colors",
                    day.gapCount === 0 &&
                      "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/40",
                    day.gapCount >= 1 &&
                      day.gapCount <= 2 &&
                      "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40",
                    day.gapCount >= 3 &&
                      "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40",
                  )}
                  title={`${day.date}: ${day.gapCount} gaps`}
                >
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {dayLabel}
                  </span>
                  <span
                    className={cn(
                      "text-lg font-bold tabular-nums leading-tight",
                      day.gapCount === 0 &&
                        "text-green-700 dark:text-green-400",
                      day.gapCount >= 1 &&
                        day.gapCount <= 2 &&
                        "text-yellow-700 dark:text-yellow-400",
                      day.gapCount >= 3 &&
                        "text-red-700 dark:text-red-400",
                    )}
                  >
                    {day.gapCount}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {dayNum}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Habit pattern detection */}
          {data.habitPattern && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/80 dark:bg-amber-950/15 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span className="text-xs text-amber-800 dark:text-amber-300">
                {data.habitPattern}
              </span>
            </div>
          )}
        </div>

        {/* ---- 4. Projected Impact ---- */}
        {projectedImpact && data.gapCount > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Impacto proyectado
            </h3>

            <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50/80 dark:bg-red-950/15 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <span className="text-xs text-red-800 dark:text-red-300">
                  Si no registras las {data.gapCount} hora
                  {data.gapCount !== 1 ? "s" : ""} faltante
                  {data.gapCount !== 1 ? "s" : ""}, tu trust score bajara ~
                  {projectedImpact.trustDrop} puntos
                </span>
              </div>

              {projectedImpact.streakAtRisk && data.currentStreak > 0 && (
                <div className="flex items-start gap-2">
                  <Flame className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                  <span className="text-xs text-red-800 dark:text-red-300">
                    Tu racha de{" "}
                    <span className="font-bold">{data.currentStreak} dia{data.currentStreak !== 1 ? "s" : ""}</span>{" "}
                    se rompera si no registras hoy
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// HourSquare — individual hour cell in the grid
// ---------------------------------------------------------------------------

function HourSquare({ slot }: { slot: HourSlot }) {
  const categoryInfo =
    slot.entry?.category
      ? CATEGORIES[slot.entry.category as WorkCategory]
      : null;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl aspect-square border-2 p-1 transition-all text-center min-h-[72px]",
        // Logged — category color
        slot.status === "logged" && categoryInfo && [
          categoryInfo.bgColor,
          "border-transparent",
        ],
        // Gap (past, unlogged, NOT online) — bright red wound
        slot.status === "gap" && [
          "bg-red-100 dark:bg-red-950/40",
          "border-red-400 dark:border-red-600",
          "shadow-[inset_0_0_12px_rgba(239,68,68,0.25)]",
          "animate-[pulse_3s_ease-in-out_infinite]",
        ],
        // Ghost (past, unlogged, WAS online) — even more aggressive
        slot.status === "ghost" && [
          "bg-red-200 dark:bg-red-900/60",
          "border-red-500 dark:border-red-500",
          "shadow-[inset_0_0_20px_rgba(239,68,68,0.4),0_0_8px_rgba(239,68,68,0.3)]",
          "ring-2 ring-red-400/50 dark:ring-red-500/40",
        ],
        // Current hour — blue outline, pulsing
        slot.status === "current" && [
          "bg-blue-50 dark:bg-blue-950/20",
          "border-blue-400 dark:border-blue-500",
          "animate-[pulse_2s_ease-in-out_infinite]",
          "ring-1 ring-blue-300/50 dark:ring-blue-500/30",
        ],
        // Future — gray empty
        slot.status === "future" && [
          "bg-muted/30",
          "border-border/40",
          "opacity-50",
        ],
      )}
      title={
        slot.entry
          ? `${formatHour(slot.hour)}: ${slot.entry.title}`
          : `${formatHour(slot.hour)}: ${slot.status === "gap" || slot.status === "ghost" ? "Sin registro" : slot.status === "current" ? "Hora actual" : "Futuro"}`
      }
    >
      {/* Hour label */}
      <span
        className={cn(
          "text-[10px] font-semibold tabular-nums leading-none",
          slot.status === "logged" && categoryInfo && categoryInfo.color,
          slot.status === "gap" && "text-red-700 dark:text-red-300",
          slot.status === "ghost" && "text-red-800 dark:text-red-200",
          slot.status === "current" && "text-blue-700 dark:text-blue-300",
          slot.status === "future" && "text-muted-foreground",
        )}
      >
        {formatHour(slot.hour)}
      </span>

      {/* Content per status */}
      {slot.status === "logged" && categoryInfo && (
        <>
          <span className="text-base leading-none mt-0.5">
            {categoryInfo.emoji}
          </span>
          <span
            className={cn(
              "text-[9px] leading-tight truncate max-w-full px-0.5 mt-0.5",
              categoryInfo.color,
            )}
          >
            {slot.entry!.title.length > 12
              ? slot.entry!.title.slice(0, 12) + "..."
              : slot.entry!.title}
          </span>
        </>
      )}

      {slot.status === "gap" && (
        <>
          <Clock className="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5" />
          <span className="text-[9px] font-semibold text-red-600 dark:text-red-400 leading-tight mt-0.5">
            Sin registro
          </span>
        </>
      )}

      {slot.status === "ghost" && (
        <>
          <span className="text-base leading-none mt-0.5">👻</span>
          <span className="text-[9px] font-bold text-red-700 dark:text-red-300 leading-tight mt-0.5">
            En linea
          </span>
          <Badge
            variant="destructive"
            className="absolute -top-1.5 -right-1.5 h-4 px-1 text-[8px]"
          >
            !
          </Badge>
        </>
      )}

      {slot.status === "current" && (
        <>
          <div className="relative mt-0.5">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500 animate-ping" />
          </div>
          <span className="text-[9px] text-blue-600 dark:text-blue-400 font-medium leading-tight mt-0.5">
            Ahora
          </span>
        </>
      )}

      {slot.status === "future" && (
        <span className="text-[9px] text-muted-foreground/50 mt-1">—</span>
      )}
    </div>
  );
}
