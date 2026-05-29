"use client";

// ═══════════════════════════════════════════════════════════════
// AI MORNING BRIEFING — PERSONALIZED DAILY INTELLIGENCE
// ═══════════════════════════════════════════════════════════════
//
// The FIRST thing every person sees when opening the app each day.
// Full-screen overlay with personalized predictions, alerts, and
// team comparisons based on the last 14 days of data.
//
// Shows ONCE per day (localStorage). z-[96] — above morning shame
// recap (z-[95]).
//
// Sections:
//   1. PREDICCION DEL DIA — day-of-week patterns + failure probabilities
//   2. TU ESTADO — streak, trust score, yesterday summary
//   3. ALERTAS PARA HOY — weakest day, missed closeout, shame streak, declining trust
//   4. EL EQUIPO — team comparison + person to watch

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, cn } from "@/lib/utils";
import { format, parseISO, subDays, getDay } from "date-fns";
import { es } from "date-fns/locale";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Users,
  Shield,
  Flame,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  Profile,
  TimeEntry,
  DailyCloseout,
  TrustScoreHistory,
  ActivityStreak,
} from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "ai_briefing_seen_";
const DISMISS_DELAY_MS = 5000;
const LOOKBACK_DAYS = 14;

// Day names in Spanish
const DAY_NAMES: Record<number, string> = {
  0: "domingos",
  1: "lunes",
  2: "martes",
  3: "miércoles",
  4: "jueves",
  5: "viernes",
  6: "sábados",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BriefingData {
  userName: string;
  todayDayName: string;
  todayFormatted: string;

  // Day-of-week stats (from last 4 same-days)
  avgHoursThisDay: number;
  bestHoursThisDay: number;
  worstHoursThisDay: number;
  failProbability: number; // % chance of < 8 hrs
  closeoutFailProbability: number; // % chance of no closeout
  sameDayCount: number; // how many same-day samples we have

  // Current state
  currentStreak: number;
  trustScore: number;
  trustTrend: "up" | "down" | "stable";
  trustDelta: number; // change over 7 days

  // Yesterday
  yesterdayHours: number;
  yesterdayProofRate: number;
  yesterdayVerdict: "bien" | "mal" | "aceptable" | "sin_datos";

  // Alerts
  isWeakestDay: boolean;
  missedCloseoutYesterday: boolean;
  shameDaysInLastPlace: number;
  trustDeclining: boolean;

  // Team comparison
  teamAvgYesterday: number;
  personToWatch: { name: string; reason: string } | null;
}

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------

function getStorageKey(date: string): string {
  return `${STORAGE_PREFIX}${date}`;
}

function wasBriefingSeen(todayDate: string): boolean {
  try {
    return localStorage.getItem(getStorageKey(todayDate)) === "true";
  } catch {
    return false;
  }
}

function markBriefingSeen(todayDate: string): void {
  try {
    localStorage.setItem(getStorageKey(todayDate), "true");
  } catch {
    // localStorage unavailable
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AIMorningBriefing() {
  const { orgId, userId } = useOrg();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canDismiss, setCanDismiss] = useState(false);
  const [dismissCountdown, setDismissCountdown] = useState(5);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);

  // Check visibility
  useEffect(() => {
    if (!orgId || !userId) return;

    const today = getTodayMTY();
    if (wasBriefingSeen(today)) {
      setVisible(false);
      setLoading(false);
      return;
    }

    setVisible(true);
    fetchBriefingData();
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss countdown — starts when data loads
  useEffect(() => {
    if (!visible || loading) return;

    if (dismissCountdown <= 0) {
      setCanDismiss(true);
      return;
    }

    const timer = setInterval(() => {
      setDismissCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          setCanDismiss(true);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, loading, dismissCountdown]);

  // Fetch all briefing data
  const fetchBriefingData = useCallback(async () => {
    if (!orgId || !userId) return;

    const supabase = createClient();
    const today = getTodayMTY();
    const todayDate = parseISO(today);
    const todayDow = getDay(todayDate); // 0=Sun, 1=Mon...
    const fourteenDaysAgo = format(subDays(todayDate, LOOKBACK_DAYS), "yyyy-MM-dd");
    const yesterday = format(subDays(todayDate, 1), "yyyy-MM-dd");
    const sevenDaysAgo = format(subDays(todayDate, 7), "yyyy-MM-dd");

    // Parallel fetch
    const [
      profileRes,
      entriesRes,
      closeoutsRes,
      streakRes,
      trustHistoryRes,
      teamMembersRes,
      teamEntriesYesterdayRes,
      teamCloseoutsYesterdayRes,
    ] = await Promise.all([
      // User profile
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single(),
      // User's last 14 days of entries
      supabase
        .from("time_entries")
        .select("date, hour, proof_urls, is_late")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .gte("date", fourteenDaysAgo)
        .lte("date", today),
      // User's closeouts last 14 days
      supabase
        .from("daily_closeouts")
        .select("date")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .gte("date", fourteenDaysAgo)
        .lte("date", today),
      // Activity streak
      supabase
        .from("activity_streaks")
        .select("current_streak")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .single(),
      // Trust score history (last 14 days)
      supabase
        .from("trust_score_history")
        .select("date, score")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .gte("date", sevenDaysAgo)
        .order("date", { ascending: false }),
      // All org members for team comparison
      supabase
        .from("org_members")
        .select("user_id, profiles(full_name)")
        .eq("org_id", orgId),
      // Team entries yesterday
      supabase
        .from("time_entries")
        .select("user_id, proof_urls, is_late")
        .eq("org_id", orgId)
        .eq("date", yesterday),
      // Team closeouts yesterday
      supabase
        .from("daily_closeouts")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("date", yesterday),
    ]);

    const profile = profileRes.data;
    const entries = (entriesRes.data ?? []) as Pick<TimeEntry, "date" | "hour" | "proof_urls" | "is_late">[];
    const closeouts = (closeoutsRes.data ?? []) as Pick<DailyCloseout, "date">[];
    const streak = streakRes.data;
    const trustHistory = (trustHistoryRes.data ?? []) as Pick<TrustScoreHistory, "date" | "score">[];
    const teamMembers = teamMembersRes.data ?? [];
    const teamEntriesYesterday = teamEntriesYesterdayRes.data ?? [];
    const teamCloseoutsYesterday = teamCloseoutsYesterdayRes.data ?? [];

    const userName = profile?.full_name?.split(" ")[0] ?? "Usuario";

    // ── Day-of-week analysis (last 4 same-day occurrences) ──
    const sameDayEntries: Record<string, number> = {}; // date -> hours
    const sameDayCloseouts = new Set(closeouts.map((c) => c.date));

    for (const e of entries) {
      const entryDate = parseISO(e.date);
      if (getDay(entryDate) === todayDow && e.date !== today) {
        sameDayEntries[e.date] = (sameDayEntries[e.date] ?? 0) + 1;
      }
    }

    const sameDayHours = Object.values(sameDayEntries);
    const sameDayCount = sameDayHours.length;
    const avgHoursThisDay = sameDayCount > 0
      ? sameDayHours.reduce((a, b) => a + b, 0) / sameDayCount
      : 0;
    const bestHoursThisDay = sameDayCount > 0 ? Math.max(...sameDayHours) : 0;
    const worstHoursThisDay = sameDayCount > 0 ? Math.min(...sameDayHours) : 0;
    const failCount = sameDayHours.filter((h) => h < 8).length;
    const failProbability = sameDayCount > 0
      ? Math.round((failCount / sameDayCount) * 100)
      : 50;

    // Closeout fail probability for this day of week
    const sameDayDates = Object.keys(sameDayEntries);
    const closeoutMissCount = sameDayDates.filter((d) => !sameDayCloseouts.has(d)).length;
    const closeoutFailProbability = sameDayDates.length > 0
      ? Math.round((closeoutMissCount / sameDayDates.length) * 100)
      : 50;

    // ── Weakest day analysis ──
    // Group all entries by day of week and find which day has lowest avg
    const dayOfWeekTotals: Record<number, { total: number; days: Set<string> }> = {};
    for (const e of entries) {
      if (e.date === today) continue;
      const dow = getDay(parseISO(e.date));
      if (!dayOfWeekTotals[dow]) {
        dayOfWeekTotals[dow] = { total: 0, days: new Set() };
      }
      dayOfWeekTotals[dow].total += 1;
      dayOfWeekTotals[dow].days.add(e.date);
    }

    let weakestDay = -1;
    let weakestAvg = Infinity;
    for (const [dow, data] of Object.entries(dayOfWeekTotals)) {
      const avg = data.total / data.days.size;
      if (avg < weakestAvg) {
        weakestAvg = avg;
        weakestDay = Number(dow);
      }
    }

    // ── Trust score ──
    const latestTrust = trustHistory.length > 0 ? trustHistory[0].score : 0;
    const oldestTrust = trustHistory.length > 1 ? trustHistory[trustHistory.length - 1].score : latestTrust;
    const trustDelta = latestTrust - oldestTrust;
    const trustTrend: "up" | "down" | "stable" =
      trustDelta > 2 ? "up" : trustDelta < -2 ? "down" : "stable";

    // ── Yesterday summary ──
    const yesterdayEntries = entries.filter((e) => e.date === yesterday);
    const yesterdayHours = yesterdayEntries.length;
    const yesterdayWithProof = yesterdayEntries.filter(
      (e) => e.proof_urls && e.proof_urls.length > 0
    ).length;
    const yesterdayProofRate = yesterdayHours > 0
      ? Math.round((yesterdayWithProof / yesterdayHours) * 100)
      : 0;
    const yesterdayVerdict: BriefingData["yesterdayVerdict"] =
      yesterdayHours === 0
        ? "sin_datos"
        : yesterdayHours >= 8 && yesterdayProofRate >= 70
        ? "bien"
        : yesterdayHours >= 5
        ? "aceptable"
        : "mal";

    const missedCloseoutYesterday = !closeouts.some((c) => c.date === yesterday);

    // ── Team comparison ──
    // Team hours yesterday per person
    const teamHoursByUser: Record<string, number> = {};
    for (const e of teamEntriesYesterday) {
      teamHoursByUser[e.user_id] = (teamHoursByUser[e.user_id] ?? 0) + 1;
    }
    const teamUserCount = teamMembers.length;
    const totalTeamHours = Object.values(teamHoursByUser).reduce((a, b) => a + b, 0);
    const teamAvgYesterday = teamUserCount > 0 ? totalTeamHours / teamUserCount : 0;

    // Person to watch: find who had best or most notable performance yesterday
    let personToWatch: BriefingData["personToWatch"] = null;
    const closeoutSetYesterday = new Set(teamCloseoutsYesterday.map((c) => c.user_id));

    // Find someone noteworthy (not the current user)
    const otherMembers = teamMembers.filter((m) => m.user_id !== userId);
    if (otherMembers.length > 0) {
      // Find who logged zero hours yesterday
      const zeroLoggers = otherMembers.filter(
        (m) => !teamHoursByUser[m.user_id] || teamHoursByUser[m.user_id] === 0
      );
      if (zeroLoggers.length > 0) {
        const target = zeroLoggers[0];
        const targetProfile = target.profiles as unknown as Profile;
        const targetName = targetProfile?.full_name?.split(" ")[0] ?? "Alguien";
        personToWatch = {
          name: targetName,
          reason: "registró 0 horas ayer",
        };
      } else {
        // Find the most productive person
        let bestUser = otherMembers[0];
        let bestHours = 0;
        for (const m of otherMembers) {
          const hrs = teamHoursByUser[m.user_id] ?? 0;
          if (hrs > bestHours) {
            bestHours = hrs;
            bestUser = m;
          }
        }
        const bestProfile = bestUser.profiles as unknown as Profile;
        const bestName = bestProfile?.full_name?.split(" ")[0] ?? "Alguien";
        if (bestHours > 0) {
          personToWatch = {
            name: bestName,
            reason: `registró ${bestHours}h con el mejor rendimiento del equipo`,
          };
        }
      }
    }

    // ── Shame days (days in last place) ──
    // Approximate: count days in last 7 where this user had fewest hours
    let shameDays = 0;
    // We only have the user's entries, so we can't fully compute this without
    // team data for each day — but we can check from trust history if score is dropping
    // For simplicity, estimate from yesterday: if user had the lowest hours, count it
    const userYesterdayHours = teamHoursByUser[userId] ?? 0;
    const allYesterdayHours = Object.values(teamHoursByUser);
    if (allYesterdayHours.length > 1) {
      const minHours = Math.min(...allYesterdayHours);
      if (userYesterdayHours === minHours && userYesterdayHours < teamAvgYesterday) {
        shameDays = 1; // At least yesterday
      }
    }

    setBriefing({
      userName,
      todayDayName: DAY_NAMES[todayDow] ?? "hoy",
      todayFormatted: format(todayDate, "EEEE d 'de' MMMM, yyyy", { locale: es }),
      avgHoursThisDay,
      bestHoursThisDay,
      worstHoursThisDay,
      failProbability,
      closeoutFailProbability,
      sameDayCount,
      currentStreak: streak?.current_streak ?? 0,
      trustScore: latestTrust,
      trustTrend,
      trustDelta,
      yesterdayHours,
      yesterdayProofRate,
      yesterdayVerdict,
      isWeakestDay: weakestDay === todayDow && sameDayCount > 0,
      missedCloseoutYesterday,
      shameDaysInLastPlace: shameDays,
      trustDeclining: trustTrend === "down",
      teamAvgYesterday,
      personToWatch,
    });

    setLoading(false);
  }, [orgId, userId]);

  // Dismiss handler
  function handleDismiss() {
    const today = getTodayMTY();
    markBriefingSeen(today);
    setVisible(false);
  }

  if (!visible) return null;

  // Format today for header
  let formattedDate = "";
  try {
    const today = getTodayMTY();
    formattedDate = format(parseISO(today), "EEEE d 'de' MMMM, yyyy", {
      locale: es,
    });
    formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
  } catch {
    formattedDate = getTodayMTY();
  }

  // Count alerts
  const alertCount = briefing
    ? [
        briefing.isWeakestDay,
        briefing.missedCloseoutYesterday,
        briefing.shameDaysInLastPlace > 0,
        briefing.trustDeclining,
      ].filter(Boolean).length
    : 0;

  return (
    <div className="fixed inset-0 z-[96] bg-black overflow-y-auto">
      {/* Scanline effect */}
      <div
        className="fixed inset-0 z-[97] pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(100,140,255,0.04) 3px, rgba(100,140,255,0.04) 6px)",
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-[98] max-w-lg mx-auto px-4 sm:px-6 py-8 pb-32 font-mono">
        {/* ═══════ HEADER ═══════ */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 border-2 border-primary/30 flex items-center justify-center bg-primary/5">
              <Brain className="w-8 h-8 text-primary" />
            </div>
          </div>
          <p className="font-mono text-[9px] tracking-[0.25em] uppercase text-primary/40 mb-2">
            Inteligencia artificial
          </p>
          <h1 className="font-mono font-bold uppercase tracking-tight text-xl sm:text-2xl text-gray-200 mb-1">
            BRIEFING DIARIO
          </h1>
          <p className="font-mono text-sm text-muted-foreground">
            {formattedDate}
          </p>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent mt-6" />
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border border-primary/30 bg-primary/5 animate-pulse flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary/60" />
            </div>
            <p className="font-mono text-xs text-primary/40 mt-4 uppercase tracking-wider">
              Analizando tus datos...
            </p>
          </div>
        )}

        {/* Data loaded */}
        {!loading && briefing && (
          <div className="space-y-8">
            {/* ═══════ GREETING ═══════ */}
            <div className="border border-primary/15 bg-primary/5 p-4">
              <p className="text-sm text-gray-300">
                Buenos días,{" "}
                <span className="font-bold text-gray-100">
                  {briefing.userName}
                </span>
                .
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Esto es lo que sé sobre ti y lo que predigo para hoy.
              </p>
            </div>

            {/* ═══════ PREDICCION DEL DIA ═══════ */}
            <section>
              <SectionHeader
                icon={<Eye className="w-4 h-4 text-primary" />}
                title="PREDICCION DEL DIA"
              />

              {briefing.sameDayCount > 0 ? (
                <div className="space-y-3">
                  {/* Day-of-week stats */}
                  <div className="border border-border p-4">
                    <p className="text-sm text-gray-300 mb-3">
                      Los{" "}
                      <span className="font-bold text-gray-100">
                        {briefing.todayDayName}
                      </span>{" "}
                      normalmente registras{" "}
                      <span className="tabular-nums font-bold text-gray-100">
                        {briefing.avgHoursThisDay.toFixed(1)}
                      </span>{" "}
                      hrs. Tu mejor{" "}
                      {briefing.todayDayName.endsWith("s")
                        ? briefing.todayDayName
                        : briefing.todayDayName}{" "}
                      fue{" "}
                      <span className="tabular-nums font-bold text-green-400">
                        {briefing.bestHoursThisDay}
                      </span>{" "}
                      hrs, tu peor{" "}
                      <span className="tabular-nums font-bold text-red-400">
                        {briefing.worstHoursThisDay}
                      </span>{" "}
                      hrs.
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Basado en {briefing.sameDayCount}{" "}
                      {briefing.todayDayName} anteriores
                    </p>
                  </div>

                  {/* Probability boxes */}
                  <div className="grid grid-cols-2 gap-3">
                    <ProbabilityBox
                      label="No cumplir 8 hrs"
                      value={briefing.failProbability}
                    />
                    <ProbabilityBox
                      label="No hacer closeout"
                      value={briefing.closeoutFailProbability}
                    />
                  </div>
                </div>
              ) : (
                <div className="border border-border p-4">
                  <p className="text-sm text-muted-foreground">
                    No hay suficientes datos de{" "}
                    <span className="font-bold text-gray-300">
                      {briefing.todayDayName}
                    </span>{" "}
                    anteriores para generar predicciones.
                  </p>
                </div>
              )}
            </section>

            {/* ═══════ TU ESTADO ═══════ */}
            <section>
              <SectionHeader
                icon={<Shield className="w-4 h-4 text-primary" />}
                title="TU ESTADO"
              />

              <div className="space-y-2">
                {/* Streak */}
                <div className="border border-border p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-500" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                      Racha
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="tabular-nums font-bold text-lg text-gray-200">
                      {briefing.currentStreak}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      días
                    </span>
                  </div>
                </div>
                {briefing.currentStreak > 0 && (
                  <p className="text-xs text-amber-400/80 px-1">
                    Llevas {briefing.currentStreak} días consecutivos. No la rompas.
                  </p>
                )}

                {/* Trust Score */}
                <div className="border border-border p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                      Trust Score
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "tabular-nums font-bold text-lg",
                        briefing.trustScore >= 80
                          ? "text-green-400"
                          : briefing.trustScore >= 60
                          ? "text-amber-400"
                          : "text-red-400"
                      )}
                    >
                      {briefing.trustScore}
                    </span>
                    {briefing.trustTrend === "up" && (
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    )}
                    {briefing.trustTrend === "down" && (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    )}
                    {briefing.trustTrend === "stable" && (
                      <Minus className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground px-1">
                  Tu Trust Score es{" "}
                  <span className="tabular-nums font-bold text-gray-300">
                    {briefing.trustScore}
                  </span>
                  .{" "}
                  {briefing.trustTrend === "up"
                    ? "Subiendo"
                    : briefing.trustTrend === "down"
                    ? "Bajando"
                    : "Estable"}{" "}
                  vs la semana pasada
                  {briefing.trustDelta !== 0 && (
                    <span
                      className={cn(
                        "tabular-nums font-bold ml-1",
                        briefing.trustDelta > 0
                          ? "text-green-400"
                          : "text-red-400"
                      )}
                    >
                      ({briefing.trustDelta > 0 ? "+" : ""}
                      {briefing.trustDelta})
                    </span>
                  )}
                  .
                </p>

                {/* Yesterday */}
                <div className="border border-border p-3">
                  <p className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
                    Ayer
                  </p>
                  {briefing.yesterdayVerdict === "sin_datos" ? (
                    <p className="text-sm text-red-400">
                      No registraste nada ayer.
                    </p>
                  ) : (
                    <p className="text-sm text-gray-300">
                      Ayer registraste{" "}
                      <span
                        className={cn(
                          "tabular-nums font-bold",
                          briefing.yesterdayHours >= 8
                            ? "text-green-400"
                            : briefing.yesterdayHours >= 5
                            ? "text-amber-400"
                            : "text-red-400"
                        )}
                      >
                        {briefing.yesterdayHours}
                      </span>{" "}
                      hrs,{" "}
                      <span
                        className={cn(
                          "tabular-nums font-bold",
                          briefing.yesterdayProofRate >= 70
                            ? "text-green-400"
                            : briefing.yesterdayProofRate >= 40
                            ? "text-amber-400"
                            : "text-red-400"
                        )}
                      >
                        {briefing.yesterdayProofRate}%
                      </span>{" "}
                      con evidencia.{" "}
                      <span
                        className={cn(
                          "font-bold",
                          briefing.yesterdayVerdict === "bien"
                            ? "text-green-400"
                            : briefing.yesterdayVerdict === "aceptable"
                            ? "text-amber-400"
                            : "text-red-400"
                        )}
                      >
                        {briefing.yesterdayVerdict === "bien"
                          ? "Bien."
                          : briefing.yesterdayVerdict === "aceptable"
                          ? "Aceptable."
                          : "Mal."}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* ═══════ ALERTAS PARA HOY ═══════ */}
            {alertCount > 0 && (
              <section>
                <SectionHeader
                  icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
                  title={`ALERTAS PARA HOY (${alertCount})`}
                />

                <div className="border border-amber-500/20 divide-y divide-amber-500/10">
                  {briefing.isWeakestDay && (
                    <AlertRow severity="high">
                      ALERTA: Los {briefing.todayDayName} son tu día más
                      débil históricamente.
                    </AlertRow>
                  )}
                  {briefing.missedCloseoutYesterday && (
                    <AlertRow severity="medium">
                      No hiciste closeout ayer. No repitas hoy.
                    </AlertRow>
                  )}
                  {briefing.shameDaysInLastPlace > 0 && (
                    <AlertRow severity="high">
                      Ayer terminaste en último lugar del equipo.
                    </AlertRow>
                  )}
                  {briefing.trustDeclining && (
                    <AlertRow severity="medium">
                      Tu Trust Score ha bajado{" "}
                      <span className="tabular-nums font-bold text-red-400">
                        {Math.abs(briefing.trustDelta)}
                      </span>{" "}
                      puntos en 7 días.
                    </AlertRow>
                  )}
                </div>
              </section>
            )}

            {/* ═══════ EL EQUIPO ═══════ */}
            <section>
              <SectionHeader
                icon={<Users className="w-4 h-4 text-primary" />}
                title="EL EQUIPO"
              />

              <div className="space-y-3">
                {/* Team vs you */}
                <div className="border border-border p-4">
                  <p className="text-sm text-gray-300">
                    Ayer el equipo promedió{" "}
                    <span className="tabular-nums font-bold text-gray-100">
                      {briefing.teamAvgYesterday.toFixed(1)}
                    </span>{" "}
                    hrs. Tú registraste{" "}
                    <span
                      className={cn(
                        "tabular-nums font-bold",
                        briefing.yesterdayHours >= briefing.teamAvgYesterday
                          ? "text-green-400"
                          : "text-red-400"
                      )}
                    >
                      {briefing.yesterdayHours}
                    </span>
                    .
                  </p>
                </div>

                {/* Person to watch */}
                {briefing.personToWatch && (
                  <div className="border border-primary/15 bg-primary/5 p-4">
                    <p className="text-[9px] tracking-[0.18em] uppercase text-primary/50 mb-2">
                      Persona a observar hoy
                    </p>
                    <p className="text-sm text-gray-300">
                      <span className="font-bold text-gray-100">
                        {briefing.personToWatch.name}
                      </span>{" "}
                      — {briefing.personToWatch.reason}
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* No data edge case */}
        {!loading && !briefing && (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground">
              Sin datos suficientes para generar el briefing.
            </p>
          </div>
        )}

        {/* ═══════ DISMISS BUTTON ═══════ */}
        <div className="fixed bottom-0 left-0 right-0 z-[99] bg-gradient-to-t from-black via-black/95 to-transparent">
          <div className="max-w-lg mx-auto px-4 sm:px-6 py-6">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent mb-4" />

            {!canDismiss ? (
              <div className="text-center space-y-3">
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Puedes continuar en{" "}
                  <span className="tabular-nums font-bold text-primary">
                    {dismissCountdown}
                  </span>
                  ...
                </p>
                <Button
                  disabled
                  className={cn(
                    "w-full font-mono text-sm uppercase tracking-wider",
                    "bg-gray-800 text-gray-600 cursor-not-allowed",
                    "h-12 border border-gray-700"
                  )}
                >
                  Comenzar el día ({dismissCountdown})
                </Button>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Briefing completado
                </p>
                <Button
                  onClick={handleDismiss}
                  className={cn(
                    "w-full font-mono text-sm uppercase tracking-wider",
                    "bg-primary hover:bg-primary/90 text-primary-foreground",
                    "h-12 border border-primary/30",
                    "transition-all duration-200"
                  )}
                >
                  Comenzar el día
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h2 className="font-mono font-bold uppercase tracking-tight text-sm text-gray-300">
        {title}
      </h2>
      <div className="flex-1 h-px bg-gray-800" />
    </div>
  );
}

function ProbabilityBox({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const color =
    value <= 25
      ? "text-green-400"
      : value <= 50
      ? "text-amber-400"
      : value <= 75
      ? "text-red-400"
      : "text-red-500";

  const borderColor =
    value <= 25
      ? "border-green-500/20"
      : value <= 50
      ? "border-amber-500/20"
      : "border-red-500/20";

  return (
    <div className={cn("border bg-black p-4 text-center", borderColor)}>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
        {label}
      </p>
      <p
        className={cn(
          "font-mono text-2xl font-bold tabular-nums tracking-tight",
          color
        )}
      >
        {value}%
      </p>
    </div>
  );
}

function AlertRow({
  children,
  severity,
}: {
  children: React.ReactNode;
  severity: "high" | "medium";
}) {
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <AlertTriangle
        className={cn(
          "w-4 h-4 mt-0.5 shrink-0",
          severity === "high" ? "text-red-500" : "text-amber-500"
        )}
      />
      <p
        className={cn(
          "text-sm",
          severity === "high" ? "text-red-400" : "text-amber-400/90"
        )}
      >
        {children}
      </p>
    </div>
  );
}
