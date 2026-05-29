"use client";

// ═══════════════════════════════════════════════════════════════════════
// PSYCHOLOGICAL TECHNIQUE: Persistent Environmental Cue + Goal Gradient
// ═══════════════════════════════════════════════════════════════════════
//
// A thin bar fixed at the top of the viewport, always visible — like a
// health bar in a video game. Constant visual awareness of your standing.
//
// Why it works:
// - ENVIRONMENTAL CUE: an ever-present reminder activates the
//   "mere exposure effect" — you cannot mentally dissociate from your score
// - GOAL GRADIENT: the filling bar creates urgency as it approaches
//   completion, increasing effort near the finish line
// - LOSS COUNTDOWN: a ticking timer to 6pm triggers time scarcity bias,
//   making every idle minute feel costly
// - SOCIAL COMPARISON: seeing "Equipo: X/Y completados" activates
//   competitive instincts — you do NOT want to be último
// - COMPLETION FLASH: the reward animation at 8h triggers dopamine,
//   reinforcing the logging habit loop

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS, WORK_HOURS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Clock,
  Flame,
  Shield,
  Timer,
  TrendingUp,
  TrendingDown,
  Users,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

type TitleTier = "S" | "A" | "B" | "C" | "D" | "F";

interface StatusData {
  hoursToday: number;
  trustScore: number | null;
  trustDelta: number;
  streak: number;
  tier: TitleTier;
  proofRate: number;
  teamCompleted: number;
  teamTotal: number;
  isLast: boolean;
}

// ─── Tier colors for the dot badge ─────────────────────────────

const TIER_DOT_COLORS: Record<TitleTier, string> = {
  S: "bg-amber-400",
  A: "bg-emerald-500",
  B: "bg-blue-500",
  C: "bg-yellow-500",
  D: "bg-orange-500",
  F: "bg-red-500",
};

const TIER_TEXT_COLORS: Record<TitleTier, string> = {
  S: "text-amber-400",
  A: "text-emerald-400",
  B: "text-blue-400",
  C: "text-yellow-400",
  D: "text-orange-400",
  F: "text-red-400",
};

// ─── Hour bar color logic ──────────────────────────────────────

function getHoursBarColor(hours: number): string {
  if (hours >= EXPECTED_DAILY_HOURS) return "from-green-500 to-green-400";
  if (hours >= 6) return "from-yellow-500 to-yellow-400";
  if (hours >= 4) return "from-orange-500 to-orange-400";
  return "from-red-500 to-red-400";
}

function getHoursTextColor(hours: number): string {
  if (hours >= EXPECTED_DAILY_HOURS) return "text-green-400";
  if (hours >= 6) return "text-yellow-400";
  if (hours >= 4) return "text-orange-400";
  return "text-red-400";
}

// ─── Tier calculation (simplified for bar context) ─────────────

function calculateTierFromScore(
  trustAvg: number,
  proofRate: number,
  streak: number
): TitleTier {
  if (trustAvg > 90 && streak > 14 && proofRate > 90) return "S";
  if (trustAvg > 75 && proofRate > 75 && streak > 7) return "A";
  if (trustAvg > 60 && proofRate > 50) return "B";
  if (trustAvg > 40) return "C";
  if (trustAvg > 25) return "D";
  return "F";
}

// ─── Workday end time ──────────────────────────────────────────

const WORK_END_HOUR = WORK_HOURS[WORK_HOURS.length - 1]; // 18 (6pm)

// ─── Countdown hook ────────────────────────────────────────────

function useCountdown() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const endOfDay = useMemo(() => {
    const d = new Date(now);
    d.setHours(WORK_END_HOUR, 0, 0, 0);
    return d;
  }, [now]);

  const remainingMs = endOfDay.getTime() - now.getTime();
  const isAfterWorkday = remainingMs <= 0;
  const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
  const remainingMinutes = Math.floor(
    (remainingMs % (1000 * 60 * 60)) / (1000 * 60)
  );
  const remainingSeconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

  return {
    isAfterWorkday,
    remainingHours,
    remainingMinutes,
    remainingSeconds,
    remainingMs,
  };
}

// ─── Countdown color based on urgency ──────────────────────────

function getCountdownColor(remainingMs: number): string {
  if (remainingMs <= 0) return "text-red-400";
  const mins = remainingMs / (1000 * 60);
  if (mins < 10) return "text-red-400 animate-pulse";
  if (mins < 30) return "text-red-400";
  if (mins < 60) return "text-orange-400";
  if (mins < 120) return "text-yellow-400";
  return "text-white/80";
}

// ─── Main component ────────────────────────────────────────────

interface PersistentStatusBarProps {
  orgId?: string;
}

export function PersistentStatusBar({ orgId }: PersistentStatusBarProps) {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showProofShield, setShowProofShield] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const prevHoursRef = useRef<number | null>(null);
  const prevProofRef = useRef<number | null>(null);
  const supabase = createClient();

  const countdown = useCountdown();

  // ─── Data fetching ─────────────────────────────────────────

  const fetchData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysStr = thirtyDaysAgo.toISOString().split("T")[0];

    const [
      { data: todayEntries },
      { data: scoreHistory },
      { data: streakData },
      { data: orgMembers },
      { data: allTodayEntries },
    ] = await Promise.all([
      // My today entries
      supabase
        .from("time_entries")
        .select("id, proof_urls")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .eq("date", today),
      // Trust score history (last 2 for delta)
      supabase
        .from("trust_score_history")
        .select("score, date")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .order("date", { ascending: false })
        .limit(2),
      // Streak
      supabase
        .from("activity_streaks")
        .select("current_streak")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .limit(1)
        .single(),
      // Org members count
      supabase
        .from("org_members")
        .select("user_id")
        .eq("org_id", orgId),
      // All org time entries today (for team completion)
      supabase
        .from("time_entries")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("date", today),
    ]);

    const entries = todayEntries ?? [];
    const hoursToday = entries.length;
    const withProof = entries.filter(
      (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
    );
    const proofRate =
      entries.length > 0
        ? Math.round((withProof.length / entries.length) * 100)
        : 0;

    // Trust score
    const scores = scoreHistory ?? [];
    const currentScore = scores.length > 0 ? scores[0].score : null;
    const prevScore = scores.length > 1 ? scores[1].score : null;
    const trustDelta =
      currentScore !== null && prevScore !== null
        ? currentScore - prevScore
        : 0;

    const streak = streakData?.current_streak ?? 0;

    // 30-day trust average for tier (use current score as proxy for bar)
    const trustAvg = currentScore ?? 50;

    const tier = calculateTierFromScore(trustAvg, proofRate, streak);

    // Team completion: count users with >= EXPECTED_DAILY_HOURS entries today
    const members = orgMembers ?? [];
    const teamTotal = members.length;
    const allEntries = allTodayEntries ?? [];

    // Count entries per user
    const userEntryCounts = new Map<string, number>();
    for (const entry of allEntries) {
      userEntryCounts.set(
        entry.user_id,
        (userEntryCounts.get(entry.user_id) ?? 0) + 1
      );
    }
    const completedUsers = Array.from(userEntryCounts.entries()).filter(
      ([, count]) => count >= EXPECTED_DAILY_HOURS
    );
    const teamCompleted = completedUsers.length;

    // Am I last? (incomplete AND everyone else is done)
    const myCompleted = hoursToday >= EXPECTED_DAILY_HOURS;
    const othersCompleted = completedUsers.filter(
      ([uid]) => uid !== user.id
    ).length;
    const othersTotal = teamTotal - 1;
    const isLast = !myCompleted && othersTotal > 0 && othersCompleted >= othersTotal;

    setData({
      hoursToday,
      trustScore: currentScore,
      trustDelta,
      streak,
      tier,
      proofRate,
      teamCompleted,
      teamTotal,
      isLast,
    });
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Initial fetch + polling + realtime ────────────────────

  useEffect(() => {
    fetchData();

    // Refresh every 2 minutes
    const interval = setInterval(fetchData, 2 * 60 * 1000);

    // Realtime subscription for time entries
    const channel = supabase
      .channel("persistent_bar_rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => fetchData()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Completion flash animation ───────────────────────────

  useEffect(() => {
    if (!data) return;

    // 7 -> 8 hour transition: flash green
    if (
      prevHoursRef.current !== null &&
      prevHoursRef.current < EXPECTED_DAILY_HOURS &&
      data.hoursToday >= EXPECTED_DAILY_HOURS
    ) {
      setShowCompletion(true);
      setTimeout(() => setShowCompletion(false), 1500);
    }
    prevHoursRef.current = data.hoursToday;

    // Proof rate hits 100%: shield pulse
    if (
      prevProofRef.current !== null &&
      prevProofRef.current < 100 &&
      data.proofRate === 100 &&
      data.hoursToday > 0
    ) {
      setShowProofShield(true);
      setTimeout(() => setShowProofShield(false), 3000);
    }
    prevProofRef.current = data.proofRate;
  }, [data]);

  // ─── Loading state ────────────────────────────────────────

  if (loading || !data) {
    return (
      <div className="fixed top-0 left-0 right-0 z-40 h-9 bg-black/60 backdrop-blur-xl border-b border-white/5">
        <div className="h-full flex items-center justify-center">
          <div className="w-32 h-2 bg-white/10 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  // ─── Derived values ───────────────────────────────────────

  const hoursProgress = Math.min(
    (data.hoursToday / EXPECTED_DAILY_HOURS) * 100,
    100
  );
  const hoursBarColor = getHoursBarColor(data.hoursToday);
  const hoursText = getHoursTextColor(data.hoursToday);
  const isComplete = data.hoursToday >= EXPECTED_DAILY_HOURS;

  const workdayDone = countdown.isAfterWorkday;
  const countdownColor = getCountdownColor(countdown.remainingMs);

  // ─── Render ───────────────────────────────────────────────

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-40",
        "h-9 bg-black/70 backdrop-blur-xl border-b border-white/[0.06]",
        "transition-all duration-500 select-none",
        showCompletion && "bg-green-900/80 scale-[1.01] border-green-500/30"
      )}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onClick={() => setExpanded((prev) => !prev)}
    >
      {/* ── Desktop layout ─────────────────────────────────── */}
      <div className="h-full max-w-screen-2xl mx-auto px-3 flex items-center gap-4">
        {/* LEFT: Hours progress */}
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-3.5 h-3.5 text-white/40 shrink-0 hidden sm:block" />
          <div className="relative flex items-center">
            {/* Background bar */}
            <div className="absolute inset-0 rounded-full bg-white/[0.06] -mx-1.5 -my-0.5 px-1.5 py-0.5" />
            <div
              className={cn(
                "absolute left-0 top-0 bottom-0 rounded-full -mx-1.5 -my-0.5",
                "bg-gradient-to-r opacity-20 transition-all duration-700",
                hoursBarColor
              )}
              style={{ width: `${hoursProgress}%` }}
            />
            <span
              className={cn(
                "relative text-xs font-bold tabular-nums z-10 px-1.5",
                hoursText
              )}
            >
              {data.hoursToday}/{EXPECTED_DAILY_HOURS}h
            </span>
          </div>
          {/* Thin visual progress bar */}
          <div className="hidden sm:block w-20 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700 bg-gradient-to-r",
                hoursBarColor
              )}
              style={{ width: `${hoursProgress}%` }}
            />
          </div>
        </div>

        {/* CENTER: Trust + Streak + Tier (hidden on mobile unless expanded) */}
        <div
          className={cn(
            "flex items-center gap-3 transition-all duration-300",
            "max-sm:hidden",
            expanded && "max-sm:flex"
          )}
        >
          {/* Trust Score */}
          {data.trustScore !== null && (
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold tabular-nums text-white/90">
                {data.trustScore}
              </span>
              {data.trustDelta !== 0 && (
                <span
                  className={cn(
                    "flex items-center",
                    data.trustDelta > 0
                      ? "text-green-400"
                      : "text-red-400"
                  )}
                >
                  {data.trustDelta > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                </span>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="w-px h-3.5 bg-white/10" />

          {/* Streak */}
          <div className="flex items-center gap-1">
            <Flame
              className={cn(
                "w-3.5 h-3.5",
                data.streak > 0 ? "text-orange-400" : "text-white/20"
              )}
            />
            <span
              className={cn(
                "text-xs font-bold tabular-nums",
                data.streak > 0 ? "text-orange-400" : "text-white/30"
              )}
            >
              {data.streak}
            </span>
          </div>

          {/* Divider */}
          <div className="w-px h-3.5 bg-white/10" />

          {/* Tier badge dot */}
          <div className="flex items-center gap-1">
            <div
              className={cn(
                "w-4 h-4 rounded-full flex items-center justify-center",
                TIER_DOT_COLORS[data.tier]
              )}
            >
              <span className="text-[8px] font-black text-white leading-none">
                {data.tier}
              </span>
            </div>
          </div>

          {/* Proof shield (appears when proof rate = 100%) */}
          {data.proofRate === 100 && data.hoursToday > 0 && (
            <>
              <div className="w-px h-3.5 bg-white/10" />
              <Shield
                className={cn(
                  "w-3.5 h-3.5 text-green-400",
                  showProofShield && "animate-pulse"
                )}
              />
            </>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* RIGHT: Countdown + Team progress */}
        <div className="flex items-center gap-3">
          {/* Último tag */}
          {data.isLast && !isComplete && (
            <span className="text-[10px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/20 uppercase tracking-wider animate-pulse">
              Último
            </span>
          )}

          {/* Live countdown */}
          <div className="flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-white/40 shrink-0" />
            {workdayDone ? (
              <span
                className={cn(
                  "text-xs font-bold",
                  isComplete ? "text-green-400" : "text-red-400"
                )}
              >
                {isComplete ? "Jornada completada" : "Jornada terminada"}
              </span>
            ) : (
              <span
                className={cn(
                  "text-xs font-bold tabular-nums transition-colors duration-300",
                  countdownColor
                )}
              >
                Quedan {countdown.remainingHours}h {String(countdown.remainingMinutes).padStart(2, "0")}m
              </span>
            )}
          </div>

          {/* Team progress (hidden on mobile unless expanded) */}
          <div
            className={cn(
              "flex items-center gap-1.5 transition-all duration-300",
              "max-sm:hidden",
              expanded && "max-sm:flex"
            )}
          >
            <div className="w-px h-3.5 bg-white/10" />
            <Users className="w-3 h-3 text-white/30 shrink-0" />
            <span className="text-[10px] text-white/40 font-medium tabular-nums whitespace-nowrap">
              Equipo: {data.teamCompleted}/{data.teamTotal} completados
            </span>
          </div>
        </div>
      </div>

      {/* ── Mobile expanded overlay ────────────────────────── */}
      <div
        className={cn(
          "sm:hidden overflow-hidden transition-all duration-300",
          "bg-black/80 backdrop-blur-xl border-b border-white/[0.06]",
          expanded ? "max-h-24 py-2.5 px-3" : "max-h-0"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {/* Trust + Streak + Tier */}
          <div className="flex items-center gap-3">
            {data.trustScore !== null && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-white/40 font-medium">
                  Trust
                </span>
                <span className="text-xs font-bold tabular-nums text-white/90">
                  {data.trustScore}
                </span>
                {data.trustDelta !== 0 && (
                  <span
                    className={cn(
                      "flex items-center",
                      data.trustDelta > 0
                        ? "text-green-400"
                        : "text-red-400"
                    )}
                  >
                    {data.trustDelta > 0 ? (
                      <TrendingUp className="w-2.5 h-2.5" />
                    ) : (
                      <TrendingDown className="w-2.5 h-2.5" />
                    )}
                  </span>
                )}
              </div>
            )}

            <div className="w-px h-3 bg-white/10" />

            <div className="flex items-center gap-1">
              <Flame
                className={cn(
                  "w-3 h-3",
                  data.streak > 0 ? "text-orange-400" : "text-white/20"
                )}
              />
              <span
                className={cn(
                  "text-xs font-bold tabular-nums",
                  data.streak > 0 ? "text-orange-400" : "text-white/30"
                )}
              >
                {data.streak}d
              </span>
            </div>

            <div className="w-px h-3 bg-white/10" />

            <div
              className={cn(
                "w-4 h-4 rounded-full flex items-center justify-center",
                TIER_DOT_COLORS[data.tier]
              )}
            >
              <span className="text-[8px] font-black text-white leading-none">
                {data.tier}
              </span>
            </div>

            {data.proofRate === 100 && data.hoursToday > 0 && (
              <>
                <div className="w-px h-3 bg-white/10" />
                <Shield className="w-3 h-3 text-green-400" />
              </>
            )}
          </div>

          {/* Team progress */}
          <div className="flex items-center gap-1.5">
            <Users className="w-3 h-3 text-white/30 shrink-0" />
            <span className="text-[10px] text-white/40 font-medium tabular-nums">
              {data.teamCompleted}/{data.teamTotal}
            </span>
          </div>
        </div>

        {/* Último tag on mobile */}
        {data.isLast && !isComplete && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-[10px] font-bold text-red-400">
              Eres el último sin completar la jornada
            </span>
          </div>
        )}
      </div>

      {/* ── Completion flash overlay ──────────────────────── */}
      {showCompletion && (
        <div className="absolute inset-0 bg-green-400/10 pointer-events-none animate-pulse rounded-none z-50 flex items-center justify-center">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs font-bold text-green-400">
              Jornada completada
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
