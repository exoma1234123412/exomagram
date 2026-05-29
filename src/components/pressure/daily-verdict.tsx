"use client";

// ═══════════════════════════════════════════════════════════════════════
// PSYCHOLOGICAL TECHNIQUE: End-of-Day Judgment + Loss Aversion
// ═══════════════════════════════════════════════════════════════════════
//
// After 5:30pm, this overlay delivers a VERDICT on the user's day.
// Not a suggestion. Not a nudge. A JUDGMENT.
//
// The framing is intentionally harsh:
// - "DIA PERDIDO" with a skull makes you feel like you wasted 8 hours of life
// - Team comparisons trigger social pain (dorsal anterior cingulate cortex)
// - Projected trust score drop uses loss aversion (losses feel 2x worse than gains)
// - Streak breaking adds sunk cost fallacy to the pressure
// - "Todo tu equipo vera que no cerraste" adds public accountability
//
// The overlay RETURNS every 30 minutes until closeout is done.
// Dismissing it only buys you 30 minutes of peace.
// The rational choice: just do the closeout.

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS, CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Skull,
  AlertTriangle,
  Flame,
  TrendingDown,
  TrendingUp,
  Clock,
  Shield,
  FileCheck,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────

type VerdictLevel = "completo" | "aceptable" | "incompleto" | "perdido";

interface CategoryBreakdown {
  category: WorkCategory;
  count: number;
}

interface TeamComparison {
  totalMembers: number;
  membersAhead: number;
  teamAvgHours: number;
  isTopThree: boolean;
}

interface DayStats {
  hoursLogged: number;
  proofRate: number;
  lateEntries: number;
  categories: CategoryBreakdown[];
  hasCloseout: boolean;
}

interface TrustProjection {
  currentScore: number;
  projectedScore: number;
  direction: "up" | "down" | "stable";
}

interface StreakInfo {
  currentStreak: number;
  willBreak: boolean;
}

const VERDICT_CONFIG: Record<
  VerdictLevel,
  {
    label: string;
    emoji: string;
    color: string;
    bgColor: string;
    borderColor: string;
    iconColor: string;
    icon: typeof Trophy;
  }
> = {
  completo: {
    label: "DÍA COMPLETO",
    emoji: "\uD83C\uDFC6",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/20",
    borderColor: "border-green-200 dark:border-green-800/50",
    iconColor: "text-green-500",
    icon: Trophy,
  },
  aceptable: {
    label: "DÍA ACEPTABLE",
    emoji: "\u26A1",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/20",
    borderColor: "border-yellow-200 dark:border-yellow-800/50",
    iconColor: "text-yellow-500",
    icon: AlertTriangle,
  },
  incompleto: {
    label: "DÍA INCOMPLETO",
    emoji: "\u26A0\uFE0F",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/20",
    borderColor: "border-orange-200 dark:border-orange-800/50",
    iconColor: "text-orange-500",
    icon: AlertTriangle,
  },
  perdido: {
    label: "DÍA PERDIDO",
    emoji: "\uD83D\uDC80",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    borderColor: "border-red-200 dark:border-red-800/50",
    iconColor: "text-red-500",
    icon: Skull,
  },
};

// Reshow interval: 30 minutes
const RESHOW_INTERVAL_MS = 30 * 60 * 1000;

// Verdict trigger hour: 17:30
const TRIGGER_HOUR = 17;
const TRIGGER_MINUTE = 30;

// ─── Helpers ────────────────────────────────────────────────────

function getVerdict(hours: number, proofRate: number): VerdictLevel {
  if (hours >= EXPECTED_DAILY_HOURS && proofRate >= 70) return "completo";
  if (hours >= 6) return "aceptable";
  if (hours >= 3) return "incompleto";
  return "perdido";
}

function getHoursColor(hours: number): string {
  if (hours >= EXPECTED_DAILY_HOURS) return "text-green-600 dark:text-green-400";
  if (hours >= 6) return "text-yellow-600 dark:text-yellow-400";
  if (hours >= 3) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function computeProjectedTrust(
  current: number,
  hoursLogged: number,
  proofRate: number,
  hasCloseout: boolean,
  lateEntries: number
): TrustProjection {
  let delta = 0;

  // Penalties
  if (hoursLogged === 0) delta -= 5;
  else if (hoursLogged < 6) delta -= 3;
  if (proofRate === 0 && hoursLogged > 0) delta -= 3;
  if (!hasCloseout) delta -= 2;
  if (lateEntries > 2) delta -= 2;
  else if (lateEntries > 0) delta -= 1;

  // Bonuses
  if (proofRate === 100 && hoursLogged >= 6) delta += 3;
  if (hasCloseout && hoursLogged >= EXPECTED_DAILY_HOURS) delta += 2;

  const projected = Math.max(0, Math.min(100, current + delta));
  const direction: TrustProjection["direction"] =
    delta > 0 ? "up" : delta < 0 ? "down" : "stable";

  return { currentScore: current, projectedScore: projected, direction };
}

function computeRequiredTomorrow(
  currentScore: number,
  projectedScore: number
): number {
  // If score is dropping, they need more hours tomorrow to recover
  if (projectedScore < currentScore) {
    return Math.min(
      10,
      EXPECTED_DAILY_HOURS + Math.ceil((currentScore - projectedScore) / 2)
    );
  }
  return EXPECTED_DAILY_HOURS;
}

// ─── Component ──────────────────────────────────────────────────

interface DailyVerdictProps {
  onOpenCloseout: () => void;
}

export function DailyVerdict({ onOpenCloseout }: DailyVerdictProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DayStats | null>(null);
  const [teamComparison, setTeamComparison] = useState<TeamComparison | null>(
    null
  );
  const [trustProjection, setTrustProjection] =
    useState<TrustProjection | null>(null);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);

  const dismissedAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  // ─── Data loading ───────────────────────────────────────────

  const loadAllData = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single<{ org_id: string }>();

    if (!membership) {
      setLoading(false);
      return;
    }

    const orgId = membership.org_id;

    // Parallel queries
    const [
      entriesResult,
      closeoutResult,
      trustResult,
      streakResult,
      teamEntriesResult,
      teamMembersResult,
    ] = await Promise.all([
      // User's entries today
      supabase
        .from("time_entries")
        .select("id, category, proof_urls, is_late")
        .eq("user_id", user.id)
        .eq("date", today),

      // Closeout check
      supabase
        .from("daily_closeouts")
        .select("id")
        .eq("user_id", user.id)
        .eq("date", today)
        .limit(1)
        .single(),

      // Trust score (most recent)
      supabase
        .from("trust_score_history")
        .select("score")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .order("date", { ascending: false })
        .limit(1)
        .single(),

      // Streak
      supabase
        .from("activity_streaks")
        .select("current_streak, last_active_date")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .limit(1)
        .single(),

      // Team entries today (for comparison)
      supabase
        .from("time_entries")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("date", today),

      // Team members count
      supabase.from("org_members").select("user_id").eq("org_id", orgId),
    ]);

    // ── Process user stats ──
    const entries = entriesResult.data ?? [];
    const hoursLogged = entries.length;
    const withProof = entries.filter(
      (e) => e.proof_urls && e.proof_urls.length > 0
    ).length;
    const proofRate =
      hoursLogged > 0 ? Math.round((withProof / hoursLogged) * 100) : 0;
    const lateEntries = entries.filter((e) => e.is_late).length;
    const hasCloseout = !!closeoutResult.data;

    // Category breakdown
    const catMap = new Map<WorkCategory, number>();
    for (const entry of entries) {
      const cat = entry.category as WorkCategory;
      catMap.set(cat, (catMap.get(cat) || 0) + 1);
    }
    const categories: CategoryBreakdown[] = Array.from(catMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const dayStats: DayStats = {
      hoursLogged,
      proofRate,
      lateEntries,
      categories,
      hasCloseout,
    };
    setStats(dayStats);

    // ── Process team comparison ──
    const teamEntries = teamEntriesResult.data ?? [];
    const teamMembers = teamMembersResult.data ?? [];
    const totalMembers = teamMembers.length;

    // Count hours per team member
    const memberHoursMap = new Map<string, number>();
    for (const member of teamMembers) {
      memberHoursMap.set(member.user_id, 0);
    }
    for (const entry of teamEntries) {
      memberHoursMap.set(
        entry.user_id,
        (memberHoursMap.get(entry.user_id) || 0) + 1
      );
    }

    const otherMemberHours = Array.from(memberHoursMap.entries())
      .filter(([uid]) => uid !== user.id)
      .map(([, h]) => h);

    const membersAhead = otherMemberHours.filter(
      (h) => h > hoursLogged
    ).length;

    const allHours = Array.from(memberHoursMap.values());
    const teamAvgHours =
      allHours.length > 0
        ? Math.round(
            (allHours.reduce((a, b) => a + b, 0) / allHours.length) * 10
          ) / 10
        : 0;

    // Determine if user is in top 3
    const sortedDesc = [...allHours].sort((a, b) => b - a);
    const userRank = sortedDesc.indexOf(hoursLogged) + 1;
    const isTopThree = userRank <= 3 && totalMembers > 3;

    setTeamComparison({
      totalMembers,
      membersAhead,
      teamAvgHours,
      isTopThree,
    });

    // ── Trust projection ──
    const currentTrust = trustResult.data?.score ?? 50;
    const projection = computeProjectedTrust(
      currentTrust,
      hoursLogged,
      proofRate,
      hasCloseout,
      lateEntries
    );
    setTrustProjection(projection);

    // ── Streak info ──
    const streakData = streakResult.data;
    if (streakData) {
      const willBreak =
        streakData.last_active_date !== today && hoursLogged === 0;
      setStreakInfo({
        currentStreak: streakData.current_streak,
        willBreak,
      });
    } else {
      setStreakInfo({ currentStreak: 0, willBreak: false });
    }

    setLoading(false);
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Time-based trigger logic ─────────────────────────────────

  const shouldShow = useCallback(() => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const isPastTrigger =
      hour > TRIGGER_HOUR ||
      (hour === TRIGGER_HOUR && minute >= TRIGGER_MINUTE);

    if (!isPastTrigger) return false;

    // If already dismissed, check if 30 min have passed
    if (dismissedAtRef.current) {
      const elapsed = Date.now() - dismissedAtRef.current;
      if (elapsed < RESHOW_INTERVAL_MS) return false;
    }

    return true;
  }, []);

  const checkAndShow = useCallback(async () => {
    if (!shouldShow()) return;

    // Quick check: has closeout been done?
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: closeout } = await supabase
      .from("daily_closeouts")
      .select("id")
      .eq("user_id", user.id)
      .eq("date", today)
      .limit(1)
      .single();

    // If closeout is done, don't show
    if (closeout) {
      setOpen(false);
      return;
    }

    await loadAllData();
    setOpen(true);
  }, [shouldShow, today, loadAllData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Initial check
    checkAndShow();

    // Check every minute
    intervalRef.current = setInterval(checkAndShow, 60 * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkAndShow]);

  // ─── Handlers ─────────────────────────────────────────────────

  function handleDismiss() {
    dismissedAtRef.current = Date.now();
    setOpen(false);
  }

  function handleOpenCloseout() {
    setOpen(false);
    onOpenCloseout();
  }

  // ─── Render ───────────────────────────────────────────────────

  if (!stats || loading) return null;

  const verdict = getVerdict(stats.hoursLogged, stats.proofRate);
  const config = VERDICT_CONFIG[verdict];
  const VerdictIcon = config.icon;
  const requiredTomorrow = trustProjection
    ? computeRequiredTomorrow(
        trustProjection.currentScore,
        trustProjection.projectedScore
      )
    : EXPECTED_DAILY_HOURS;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleDismiss();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-0">
        {/* ── Verdict Header ─────────────────────────────────── */}
        <div
          className={cn(
            "px-6 pt-8 pb-6 text-center border-b",
            config.bgColor,
            config.borderColor
          )}
        >
          <div
            className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4",
              "bg-white/60 dark:bg-white/10 shadow-lg",
              config.borderColor,
              "border"
            )}
          >
            <VerdictIcon className={cn("w-8 h-8", config.iconColor)} />
          </div>
          <h2
            className={cn(
              "text-2xl font-black tracking-tight",
              config.color
            )}
          >
            {config.label} {config.emoji}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ── Section 1: Your Stats Today ───────────────────── */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Tus estadísticas de hoy
            </h3>

            <div className="grid grid-cols-3 gap-2.5">
              {/* Hours logged */}
              <div className="bg-accent/40 rounded-xl p-3 text-center">
                <p
                  className={cn(
                    "text-3xl font-black tabular-nums tracking-tight leading-none",
                    getHoursColor(stats.hoursLogged)
                  )}
                >
                  {stats.hoursLogged}
                </p>
                <p className="text-[10px] text-muted-foreground font-medium mt-1">
                  Horas
                </p>
              </div>

              {/* Proof rate */}
              <div className="bg-accent/40 rounded-xl p-3 text-center">
                <p
                  className={cn(
                    "text-3xl font-black tabular-nums tracking-tight leading-none",
                    stats.proofRate >= 70
                      ? "text-green-600 dark:text-green-400"
                      : stats.proofRate >= 40
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-red-600 dark:text-red-400"
                  )}
                >
                  {stats.proofRate}%
                </p>
                <p className="text-[10px] text-muted-foreground font-medium mt-1">
                  Evidencia
                </p>
              </div>

              {/* Late entries */}
              <div className="bg-accent/40 rounded-xl p-3 text-center">
                <p
                  className={cn(
                    "text-3xl font-black tabular-nums tracking-tight leading-none",
                    stats.lateEntries === 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  )}
                >
                  {stats.lateEntries}
                </p>
                <p className="text-[10px] text-muted-foreground font-medium mt-1">
                  Tardías
                </p>
              </div>
            </div>

            {/* Category breakdown mini bars */}
            {stats.categories.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {stats.categories.map(({ category, count }) => {
                  const catConfig = CATEGORIES[category];
                  const percentage =
                    stats.hoursLogged > 0
                      ? Math.round((count / stats.hoursLogged) * 100)
                      : 0;

                  return (
                    <div key={category} className="flex items-center gap-2">
                      <span className="text-xs w-20 truncate text-muted-foreground">
                        {catConfig.emoji} {catConfig.label}
                      </span>
                      <div className="flex-1 h-2 bg-accent/60 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            catConfig.bgColor
                          )}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
                        {count}h
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Section 2: Team Comparison ────────────────────── */}
          {teamComparison && teamComparison.totalMembers > 1 && (
            <section
              className={cn(
                "rounded-xl p-4 border",
                teamComparison.isTopThree
                  ? "bg-green-50/50 dark:bg-green-950/10 border-green-200/60 dark:border-green-800/40"
                  : teamComparison.membersAhead >
                      (teamComparison.totalMembers - 1) / 2
                    ? "bg-red-50/50 dark:bg-red-950/10 border-red-200/60 dark:border-red-800/40"
                    : "bg-yellow-50/50 dark:bg-yellow-950/10 border-yellow-200/60 dark:border-yellow-800/40"
              )}
            >
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" />
                Comparación con el equipo
              </h3>

              {teamComparison.isTopThree ? (
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                  Estuviste en el top 3 hoy
                </p>
              ) : teamComparison.membersAhead > 0 ? (
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Hoy registraste menos que {teamComparison.membersAhead} de{" "}
                  {teamComparison.totalMembers - 1} compañeros
                </p>
              ) : (
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                  Nadie registró más que tú hoy
                </p>
              )}

              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Tú:</span>
                  <span
                    className={cn(
                      "font-bold tabular-nums text-sm",
                      getHoursColor(stats.hoursLogged)
                    )}
                  >
                    {stats.hoursLogged}h
                  </span>
                </div>
                <div className="h-px flex-1 mx-3 bg-border" />
                <div className="flex items-center gap-2">
                  <span className="font-medium">Promedio:</span>
                  <span className="font-bold tabular-nums text-sm text-foreground">
                    {teamComparison.teamAvgHours}h
                  </span>
                </div>
              </div>

              {stats.hoursLogged < teamComparison.teamAvgHours && (
                <p className="text-[10px] text-red-500/80 mt-2 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  Estás{" "}
                  {(teamComparison.teamAvgHours - stats.hoursLogged).toFixed(1)}
                  h por debajo del promedio
                </p>
              )}
            </section>
          )}

          {/* ── Section 3: Trust Score Impact ─────────────────── */}
          {trustProjection && (
            <section
              className={cn(
                "rounded-xl p-4 border",
                trustProjection.direction === "down"
                  ? "bg-red-50/50 dark:bg-red-950/10 border-red-200/60 dark:border-red-800/40"
                  : trustProjection.direction === "up"
                    ? "bg-green-50/50 dark:bg-green-950/10 border-green-200/60 dark:border-green-800/40"
                    : "bg-accent/30 border-border"
              )}
            >
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Impacto en trust score
              </h3>

              <div className="flex items-center gap-3">
                {trustProjection.direction === "down" ? (
                  <TrendingDown className="w-5 h-5 text-red-500 shrink-0" />
                ) : trustProjection.direction === "up" ? (
                  <TrendingUp className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <Shield className="w-5 h-5 text-blue-500 shrink-0" />
                )}

                {trustProjection.direction === "down" ? (
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                    Tu trust score bajará de{" "}
                    <span className="tabular-nums">
                      {trustProjection.currentScore}
                    </span>{" "}
                    a{" "}
                    <span className="tabular-nums">
                      ~{trustProjection.projectedScore}
                    </span>
                  </p>
                ) : trustProjection.direction === "up" ? (
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                    Tu trust score subirá de{" "}
                    <span className="tabular-nums">
                      {trustProjection.currentScore}
                    </span>{" "}
                    a{" "}
                    <span className="tabular-nums">
                      ~{trustProjection.projectedScore}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-foreground">
                    Tu trust score se mantendrá en{" "}
                    <span className="tabular-nums">
                      {trustProjection.currentScore}
                    </span>
                  </p>
                )}
              </div>

              {/* Visual score bar */}
              <div className="mt-3 h-2.5 bg-accent/60 rounded-full overflow-hidden relative">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    trustProjection.projectedScore >= 70
                      ? "bg-green-500"
                      : trustProjection.projectedScore >= 40
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  )}
                  style={{ width: `${trustProjection.projectedScore}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-muted-foreground/60">0</span>
                <span className="text-[9px] text-muted-foreground/60">100</span>
              </div>
            </section>
          )}

          {/* ── Section 4: Streak Status ─────────────────────── */}
          {streakInfo && streakInfo.currentStreak > 0 && (
            <section
              className={cn(
                "rounded-xl p-4 border flex items-center gap-3",
                streakInfo.willBreak
                  ? "bg-red-50/50 dark:bg-red-950/10 border-red-200/60 dark:border-red-800/40"
                  : "bg-orange-50/50 dark:bg-orange-950/10 border-orange-200/60 dark:border-orange-800/40"
              )}
            >
              {streakInfo.willBreak ? (
                <>
                  <span className="text-2xl shrink-0" role="img" aria-label="corazón roto">
                    &#x1F494;
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                      Tu racha de {streakInfo.currentStreak} días se rompió
                      &#x1F494;
                    </p>
                    <p className="text-[10px] text-red-500/70 mt-0.5">
                      Registra al menos una hora para iniciar una nueva racha
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Flame className="w-6 h-6 text-orange-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                      Tu racha de {streakInfo.currentStreak} días continúa
                      &#x1F525;
                    </p>
                    <p className="text-[10px] text-orange-500/70 mt-0.5">
                      Haz tu cierre para asegurar el día
                    </p>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ── Section 5: Mandatory Closeout CTA ────────────── */}
          {!stats.hasCloseout ? (
            <section className="space-y-3">
              <Button
                onClick={handleOpenCloseout}
                className={cn(
                  "w-full h-12 rounded-xl text-white border-0 font-bold text-sm",
                  "bg-gradient-to-r from-blue-600 to-blue-700",
                  "hover:from-blue-700 hover:to-blue-800",
                  "shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40",
                  "transition-all duration-300"
                )}
              >
                <FileCheck className="w-4 h-4 mr-2" />
                Haz tu cierre del día antes de irte
              </Button>

              <div className="bg-red-50/60 dark:bg-red-950/10 border border-red-200/50 dark:border-red-800/30 rounded-xl p-3">
                <p className="text-[11px] text-red-600/80 dark:text-red-400/80 text-center font-medium leading-relaxed">
                  Si no haces el cierre, quedará marcado como faltante para todo
                  el equipo. Tu supervisor recibirá una notificación.
                </p>
              </div>
            </section>
          ) : (
            <section className="flex items-center gap-3 rounded-xl p-4 bg-green-50/50 dark:bg-green-950/10 border border-green-200/60 dark:border-green-800/40">
              <FileCheck className="w-5 h-5 text-green-500 shrink-0" />
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                Ya completaste tu cierre del día
              </p>
            </section>
          )}

          {/* ── Section 6: Tomorrow Preview ──────────────────── */}
          <section className="bg-accent/30 rounded-xl p-4 border border-border">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Mañana
            </h3>
            <p className="text-sm text-foreground">
              Mañana necesitas registrar al menos{" "}
              <span
                className={cn(
                  "font-bold tabular-nums",
                  requiredTomorrow > EXPECTED_DAILY_HOURS
                    ? "text-red-600 dark:text-red-400"
                    : "text-foreground"
                )}
              >
                {requiredTomorrow} horas
              </span>{" "}
              para{" "}
              {trustProjection && trustProjection.direction === "down"
                ? "recuperar tu trust score"
                : "mantener tu trust score"}
              .
            </p>
            {requiredTomorrow > EXPECTED_DAILY_HOURS && (
              <p className="text-[10px] text-red-500/70 mt-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Necesitas {requiredTomorrow - EXPECTED_DAILY_HOURS}h extra para
                compensar hoy
              </p>
            )}
          </section>
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/50">
            Se muestra cada 30 min hasta hacer el cierre
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-xs text-muted-foreground"
          >
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
