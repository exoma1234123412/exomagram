"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { useAudio } from "@/components/audio/audio-provider";
import type { Profile, WorkCategory, TrustScoreHistory } from "@/lib/types/database";
import { CATEGORIES, CATEGORY_COLORS, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, getInitials } from "@/lib/utils";
import { subDays, format } from "date-fns";
import {
  Trophy,
  Shield,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Activity,
  Ghost,
  ArrowUp,
  ArrowDown,
  Crown,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

const TABS = [
  { id: "current", label: "Rankings" },
  { id: "trends", label: "Tendencias" },
  { id: "compare", label: "Comparar" },
  { id: "team", label: "Equipo" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface MemberRank {
  profile: Profile;
  trustScore: number;
  totalHours: number;
  proofPercent: number;
  streak: number;
  topCategory: WorkCategory | null;
  latePercent: number;
  closeoutPercent: number;
  composite: number;
}

interface TrendEntry {
  profile: Profile;
  scores: { date: string; score: number }[];
  change: number;
  direction: "up" | "down" | "stable";
  currentScore: number;
}

interface TeamStats {
  totalHours: number;
  avgTrustScore: number;
  avgProofRate: number;
  memberCount: number;
  activeToday: number;
  ghostCount: number;
  categoryDistribution: Record<string, number>;
  grade: string;
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function LeaderboardPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();
  const { play } = useAudio();

  const [activeTab, setActiveTab] = useState<TabId>("current");
  const [loading, setLoading] = useState(true);

  // ── Shared data ────────────────────────────────────────
  const [members, setMembers] = useState<{ user_id: string; profile: Profile }[]>([]);
  const [rankings, setRankings] = useState<MemberRank[]>([]);
  const [trendData, setTrendData] = useState<TrendEntry[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);

  // ── Rankings state ─────────────────────────────────────
  const prevRankRef = useRef<number>(-1);

  // ── Trends state ───────────────────────────────────────
  const [trendPeriod, setTrendPeriod] = useState<7 | 14 | 30>(7);

  // ── Compare state ──────────────────────────────────────
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");

  // ═══════════════════════════════════════════════════════
  // LOAD DATA
  // ═══════════════════════════════════════════════════════

  useEffect(() => {
    if (!orgId) return;

    async function load() {
      setLoading(true);

      const today = new Date().toISOString().split("T")[0];
      const start30 = subDays(new Date(), 30).toISOString().split("T")[0];

      // Parallel fetches
      const [membersRes, entriesRes, closeoutsRes, streaksRes, trustHistoryRes, todayEntriesRes] =
        await Promise.all([
          supabase.from("org_members").select("user_id, profiles(*)").eq("org_id", orgId!),
          supabase
            .from("time_entries")
            .select("user_id, category, proof_urls, is_late, date")
            .eq("org_id", orgId!)
            .gte("date", start30)
            .lte("date", today),
          supabase
            .from("daily_closeouts")
            .select("user_id, date")
            .eq("org_id", orgId!)
            .gte("date", start30)
            .lte("date", today),
          supabase
            .from("activity_streaks")
            .select("user_id, current_streak")
            .eq("org_id", orgId!),
          supabase
            .from("trust_score_history")
            .select("user_id, date, score")
            .eq("org_id", orgId!)
            .gte("date", start30)
            .lte("date", today)
            .order("date", { ascending: true }),
          supabase
            .from("time_entries")
            .select("user_id, category, proof_urls")
            .eq("org_id", orgId!)
            .eq("date", today),
        ]);

      const mems = membersRes.data ?? [];
      const entries = entriesRes.data ?? [];
      const closeouts = closeoutsRes.data ?? [];
      const streaks = streaksRes.data ?? [];
      const trustHistory = (trustHistoryRes.data ?? []) as Pick<TrustScoreHistory, "user_id" | "date" | "score">[];
      const todayEntries = todayEntriesRes.data ?? [];

      // Build member list
      const memberList = mems.map((m) => ({
        user_id: m.user_id,
        profile: m.profiles as unknown as Profile,
      }));
      setMembers(memberList);

      // Build maps
      const streakMap = new Map<string, number>();
      for (const s of streaks) streakMap.set(s.user_id, s.current_streak);

      const closeoutMap = new Map<string, number>();
      for (const c of closeouts) closeoutMap.set(c.user_id, (closeoutMap.get(c.user_id) ?? 0) + 1);

      // ── Today entries for rankings ──────────────────
      const todayByUser = new Map<string, typeof todayEntries>();
      for (const e of todayEntries) {
        const arr = todayByUser.get(e.user_id) ?? [];
        arr.push(e);
        todayByUser.set(e.user_id, arr);
      }

      // ── Today trust scores ──────────────────────────
      const todayTrust = new Map<string, number>();
      for (const t of trustHistory) {
        if (t.date === today) todayTrust.set(t.user_id, t.score);
      }
      // Fallback: use most recent score
      for (const t of trustHistory) {
        if (!todayTrust.has(t.user_id)) todayTrust.set(t.user_id, t.score);
      }

      // ═══════ RANKINGS ═══════
      const ranks: MemberRank[] = memberList.map((m) => {
        const userTodayEntries = todayByUser.get(m.user_id) ?? [];
        const hoursToday = userTodayEntries.length;
        const withProof = userTodayEntries.filter(
          (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
        );
        const proofPercent = hoursToday > 0 ? Math.round((withProof.length / hoursToday) * 100) : 0;

        // Category counts (today)
        const catCounts = new Map<WorkCategory, number>();
        for (const e of userTodayEntries) {
          catCounts.set(e.category as WorkCategory, (catCounts.get(e.category as WorkCategory) ?? 0) + 1);
        }
        let topCat: WorkCategory | null = null;
        let topCount = 0;
        for (const [c, n] of catCounts) {
          if (n > topCount) {
            topCat = c;
            topCount = n;
          }
        }

        // Late
        const latePercent = 0; // Today entries don't have is_late in select

        // Closeout in last 7d
        const closeoutCount = closeoutMap.get(m.user_id) ?? 0;
        const closeoutPercent = Math.min(100, Math.round((closeoutCount / 5) * 100));

        const trustScore = todayTrust.get(m.user_id) ?? 0;
        const streak = streakMap.get(m.user_id) ?? 0;

        // Composite: trust_score * 0.5 + hours_logged * 5 + proof_rate * 20
        const composite = trustScore * 0.5 + hoursToday * 5 + (proofPercent / 100) * 20;

        return {
          profile: m.profile,
          trustScore,
          totalHours: hoursToday,
          proofPercent,
          streak,
          topCategory: topCat,
          latePercent,
          closeoutPercent,
          composite,
        };
      });

      ranks.sort((a, b) => b.composite - a.composite);
      setRankings(ranks);

      // ═══════ TRENDS ═══════
      const historyByUser = new Map<string, { date: string; score: number }[]>();
      for (const t of trustHistory) {
        const arr = historyByUser.get(t.user_id) ?? [];
        arr.push({ date: t.date, score: t.score });
        historyByUser.set(t.user_id, arr);
      }

      const trends: TrendEntry[] = memberList.map((m) => {
        const scores = historyByUser.get(m.user_id) ?? [];
        const currentScore = scores.length > 0 ? scores[scores.length - 1].score : 0;
        const oldScore = scores.length > 1 ? scores[0].score : currentScore;
        const change = currentScore - oldScore;
        const direction: "up" | "down" | "stable" =
          change > 2 ? "up" : change < -2 ? "down" : "stable";

        return {
          profile: m.profile,
          scores,
          change,
          direction,
          currentScore,
        };
      });

      trends.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
      setTrendData(trends);

      // ═══════ TEAM STATS ═══════
      const totalHoursAll = entries.length;
      const withProofAll = entries.filter(
        (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
      ).length;
      const avgProofRate = totalHoursAll > 0 ? Math.round((withProofAll / totalHoursAll) * 100) : 0;

      const allTrustScores = memberList
        .map((m) => todayTrust.get(m.user_id) ?? 0)
        .filter((s) => s > 0);
      const avgTrust =
        allTrustScores.length > 0
          ? Math.round(allTrustScores.reduce((a, b) => a + b, 0) / allTrustScores.length)
          : 0;

      const activeTodayCount = new Set(todayEntries.map((e) => e.user_id)).size;
      const ghostCount = memberList.length - activeTodayCount;

      // Category distribution (30d)
      const catDist: Record<string, number> = {};
      for (const e of entries) {
        catDist[e.category] = (catDist[e.category] ?? 0) + 1;
      }

      // Grade
      const grade =
        avgTrust >= 90
          ? "A+"
          : avgTrust >= 80
            ? "A"
            : avgTrust >= 70
              ? "B"
              : avgTrust >= 60
                ? "C"
                : avgTrust >= 50
                  ? "D"
                  : "F";

      setTeamStats({
        totalHours: totalHoursAll,
        avgTrustScore: avgTrust,
        avgProofRate,
        memberCount: memberList.length,
        activeToday: activeTodayCount,
        ghostCount,
        categoryDistribution: catDist,
        grade,
      });

      setLoading(false);
    }

    load();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rank change audio ──────────────────────────────────
  useEffect(() => {
    if (!userId || rankings.length === 0) return;
    const currentRank = rankings.findIndex((r) => r.profile.id === userId);
    if (currentRank === -1) return;
    if (prevRankRef.current >= 0 && currentRank !== prevRankRef.current) {
      if (currentRank < prevRankRef.current) {
        play("rank-up");
      } else {
        play("rank-down");
      }
    }
    prevRankRef.current = currentRank;
  }, [rankings, userId, play]);

  // ── Filtered trends by period ──────────────────────────
  const filteredTrends = useMemo(() => {
    const cutoff = subDays(new Date(), trendPeriod).toISOString().split("T")[0];
    return trendData.map((t) => {
      const filtered = t.scores.filter((s) => s.date >= cutoff);
      const currentScore = filtered.length > 0 ? filtered[filtered.length - 1].score : 0;
      const oldScore = filtered.length > 1 ? filtered[0].score : currentScore;
      const change = currentScore - oldScore;
      const direction: "up" | "down" | "stable" =
        change > 2 ? "up" : change < -2 ? "down" : "stable";
      return { ...t, scores: filtered, change, direction, currentScore };
    }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }, [trendData, trendPeriod]);

  // ── Compare data ───────────────────────────────────────
  const compareDataA = useMemo(
    () => rankings.find((r) => r.profile.id === compareA),
    [rankings, compareA]
  );
  const compareDataB = useMemo(
    () => rankings.find((r) => r.profile.id === compareB),
    [rankings, compareB]
  );

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  if (orgLoading || loading) return <PageSkeleton />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          LEADERBOARD
        </h1>
        <p className="text-xs font-mono text-muted-foreground mt-1">
          Rankings en tiempo real del equipo.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase whitespace-nowrap transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "text-primary border-primary"
                : "text-muted-foreground/50 border-transparent hover:text-muted-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "current" && (
        <RankingsTab rankings={rankings} userId={userId} />
      )}
      {activeTab === "trends" && (
        <TrendsTab
          trends={filteredTrends}
          period={trendPeriod}
          onPeriodChange={setTrendPeriod}
        />
      )}
      {activeTab === "compare" && (
        <CompareTab
          members={members}
          compareA={compareA}
          compareB={compareB}
          onChangeA={setCompareA}
          onChangeB={setCompareB}
          dataA={compareDataA ?? null}
          dataB={compareDataB ?? null}
          rankings={rankings}
        />
      )}
      {activeTab === "team" && teamStats && (
        <TeamTab stats={teamStats} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 1: RANKINGS
// ═══════════════════════════════════════════════════════════

function RankingsTab({ rankings, userId }: { rankings: MemberRank[]; userId: string | null }) {
  if (rankings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 border border-border flex items-center justify-center">
          <Trophy className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          Sin registros, sin ranking. El primer lugar esta vacante.
        </p>
      </div>
    );
  }

  const medalBorders = [
    "border-yellow-500/60",
    "border-gray-400/60",
    "border-amber-700/60",
  ];

  return (
    <div className="space-y-1">
      {/* Header row */}
      <div className="grid grid-cols-[2.5rem_2.5rem_1fr_4rem_3.5rem_3.5rem_3.5rem] gap-3 px-3 py-1.5 font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
        <span>#</span>
        <span></span>
        <span>Miembro</span>
        <span className="text-right">Trust</span>
        <span className="text-right">Horas</span>
        <span className="text-right">Proof</span>
        <span className="text-right">Racha</span>
      </div>

      {rankings.map((r, index) => {
        const isCurrentUser = r.profile.id === userId;
        const isTop3 = index < 3;

        return (
          <div
            key={r.profile.id}
            className={cn(
              "grid grid-cols-[2.5rem_2.5rem_1fr_4rem_3.5rem_3.5rem_3.5rem] gap-3 items-center px-3 py-2.5 border border-border transition-colors duration-200",
              isTop3 && medalBorders[index],
              isCurrentUser && "bg-primary/5 border-primary/20",
              !isTop3 && !isCurrentUser && "hover:border-primary/30"
            )}
          >
            {/* Rank */}
            <div className="font-mono font-bold text-sm tabular-nums text-center">
              {index === 0 ? (
                <Crown className="w-4 h-4 text-yellow-500 mx-auto" />
              ) : index === 1 ? (
                <span className="text-gray-400">{index + 1}</span>
              ) : index === 2 ? (
                <span className="text-amber-700">{index + 1}</span>
              ) : (
                <span className="text-muted-foreground">{index + 1}</span>
              )}
            </div>

            {/* Avatar */}
            <Avatar className="w-7 h-7 ring-1 ring-border">
              <AvatarImage src={r.profile.avatar_url ?? undefined} />
              <AvatarFallback className="text-[9px] font-mono">
                {getInitials(r.profile.full_name)}
              </AvatarFallback>
            </Avatar>

            {/* Name + meta */}
            <div className="min-w-0">
              <p className="font-mono text-sm font-medium truncate">
                {r.profile.full_name ?? r.profile.email}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {r.topCategory && (
                  <span className={cn("text-[9px] font-mono uppercase", CATEGORIES[r.topCategory].color)}>
                    {CATEGORIES[r.topCategory].emoji}
                  </span>
                )}
                {r.streak > 2 && (
                  <span className="text-[9px] font-mono text-orange-500 flex items-center gap-0.5">
                    <Flame className="w-3 h-3" />
                    {r.streak}d
                  </span>
                )}
              </div>
            </div>

            {/* Trust Score */}
            <div className="text-right">
              <span
                className={cn(
                  "font-mono text-lg font-bold tabular-nums tracking-tight",
                  r.trustScore >= 80
                    ? "text-green-600"
                    : r.trustScore >= 60
                      ? "text-primary"
                      : r.trustScore >= 40
                        ? "text-yellow-600"
                        : "text-red-600"
                )}
              >
                {r.trustScore}
              </span>
            </div>

            {/* Hours */}
            <div className="text-right font-mono text-sm tabular-nums tracking-tight text-muted-foreground">
              {r.totalHours}h
            </div>

            {/* Proof % */}
            <div className="text-right">
              <span
                className={cn(
                  "font-mono text-sm tabular-nums tracking-tight",
                  r.proofPercent >= 80
                    ? "text-green-600"
                    : r.proofPercent >= 50
                      ? "text-yellow-600"
                      : "text-muted-foreground"
                )}
              >
                {r.proofPercent}%
              </span>
            </div>

            {/* Streak */}
            <div className="text-right font-mono text-sm tabular-nums tracking-tight">
              {r.streak > 0 ? (
                <span className="text-orange-500">{r.streak}</span>
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </div>
          </div>
        );
      })}

      {/* Scoring methodology */}
      <div className="mt-6 px-3 py-2 border border-border">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
          Composite = trust_score * 0.5 + hours_logged * 5 + proof_rate * 20
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 2: TRENDS
// ═══════════════════════════════════════════════════════════

function TrendsTab({
  trends,
  period,
  onPeriodChange,
}: {
  trends: TrendEntry[];
  period: 7 | 14 | 30;
  onPeriodChange: (p: 7 | 14 | 30) => void;
}) {
  return (
    <div>
      {/* Period selector */}
      <div className="flex items-center gap-1 mb-6">
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mr-2">
          Periodo
        </span>
        {([7, 14, 30] as const).map((p) => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={cn(
              "px-3 py-1 font-mono text-[10px] border transition-colors",
              period === p
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
            )}
          >
            {p}d
          </button>
        ))}
      </div>

      {trends.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <Activity className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Sin datos de tendencia disponibles.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-[2.5rem_1fr_8rem_4rem_4rem] gap-3 px-3 py-1.5 font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            <span></span>
            <span>Miembro</span>
            <span>Tendencia</span>
            <span className="text-right">Score</span>
            <span className="text-right">Cambio</span>
          </div>

          {trends.map((t) => {
            const maxScore = Math.max(...t.scores.map((s) => s.score), 1);

            return (
              <div
                key={t.profile.id}
                className="grid grid-cols-[2.5rem_1fr_8rem_4rem_4rem] gap-3 items-center px-3 py-2.5 border border-border transition-colors duration-200 hover:border-primary/30"
              >
                {/* Direction icon */}
                <div className="flex justify-center">
                  {t.direction === "up" ? (
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  ) : t.direction === "down" ? (
                    <TrendingDown className="w-4 h-4 text-red-600" />
                  ) : (
                    <Minus className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>

                {/* Name */}
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="w-6 h-6 ring-1 ring-border">
                    <AvatarImage src={t.profile.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[8px] font-mono">
                      {getInitials(t.profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-mono text-sm truncate">
                    {t.profile.full_name ?? t.profile.email}
                  </span>
                </div>

                {/* Sparkline (div-based bars) */}
                <div className="flex items-end gap-px h-6">
                  {t.scores.slice(-14).map((s, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 min-w-[3px] transition-all",
                        s.score >= 70
                          ? "bg-green-500"
                          : s.score >= 50
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      )}
                      style={{
                        height: `${Math.max(2, (s.score / maxScore) * 24)}px`,
                      }}
                    />
                  ))}
                  {/* Fill remaining space if less than 14 data points */}
                  {t.scores.length < 14 &&
                    Array.from({ length: Math.max(0, 14 - t.scores.length) }).map((_, i) => (
                      <div key={`empty-${i}`} className="flex-1 min-w-[3px] bg-border" style={{ height: "2px" }} />
                    ))}
                </div>

                {/* Current score */}
                <div className="text-right font-mono text-sm font-bold tabular-nums tracking-tight">
                  {t.currentScore}
                </div>

                {/* Change */}
                <div className="text-right flex items-center justify-end gap-1">
                  {t.change > 0 ? (
                    <ArrowUp className="w-3 h-3 text-green-600" />
                  ) : t.change < 0 ? (
                    <ArrowDown className="w-3 h-3 text-red-600" />
                  ) : null}
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums tracking-tight",
                      t.change > 0
                        ? "text-green-600"
                        : t.change < 0
                          ? "text-red-600"
                          : "text-muted-foreground"
                    )}
                  >
                    {t.change > 0 ? "+" : ""}
                    {t.change}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 3: COMPARE
// ═══════════════════════════════════════════════════════════

function CompareTab({
  members,
  compareA,
  compareB,
  onChangeA,
  onChangeB,
  dataA,
  dataB,
  rankings,
}: {
  members: { user_id: string; profile: Profile }[];
  compareA: string;
  compareB: string;
  onChangeA: (v: string) => void;
  onChangeB: (v: string) => void;
  dataA: MemberRank | null;
  dataB: MemberRank | null;
  rankings: MemberRank[];
}) {
  const metrics = useMemo(() => {
    if (!dataA || !dataB) return [];
    return [
      {
        label: "Trust Score",
        a: dataA.trustScore,
        b: dataB.trustScore,
        format: (v: number) => `${v}`,
      },
      {
        label: "Horas hoy",
        a: dataA.totalHours,
        b: dataB.totalHours,
        format: (v: number) => `${v}h`,
      },
      {
        label: "Proof %",
        a: dataA.proofPercent,
        b: dataB.proofPercent,
        format: (v: number) => `${v}%`,
      },
      {
        label: "Racha",
        a: dataA.streak,
        b: dataB.streak,
        format: (v: number) => `${v}d`,
      },
      {
        label: "Composite",
        a: Math.round(dataA.composite * 10) / 10,
        b: Math.round(dataB.composite * 10) / 10,
        format: (v: number) => `${v}`,
      },
    ];
  }, [dataA, dataB]);

  const overallA = metrics.filter((m) => m.a > m.b).length;
  const overallB = metrics.filter((m) => m.b > m.a).length;

  return (
    <div>
      {/* Dropdowns */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div>
          <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-2">
            Jugador A
          </label>
          <Select value={compareA} onValueChange={(v) => v && onChangeA(v)}>
            <SelectTrigger className="font-mono text-xs">
              <SelectValue placeholder="Seleccionar miembro" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.profile.full_name ?? m.profile.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-2">
            Jugador B
          </label>
          <Select value={compareB} onValueChange={(v) => v && onChangeB(v)}>
            <SelectTrigger className="font-mono text-xs">
              <SelectValue placeholder="Seleccionar miembro" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.profile.full_name ?? m.profile.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Comparison */}
      {dataA && dataB ? (
        <div className="space-y-2">
          {metrics.map((m) => {
            const max = Math.max(m.a, m.b, 1);
            const aWins = m.a > m.b;
            const bWins = m.b > m.a;
            const tie = m.a === m.b;

            return (
              <div key={m.label} className="border border-border p-3">
                <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
                  {m.label}
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                  {/* A value + bar */}
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-mono text-lg font-bold tabular-nums tracking-tight min-w-[3rem]",
                        aWins ? "text-green-600" : "text-muted-foreground"
                      )}
                    >
                      {m.format(m.a)}
                    </span>
                    <div className="flex-1 h-2 bg-accent/30 overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-500",
                          aWins ? "bg-green-500" : "bg-muted-foreground/30"
                        )}
                        style={{ width: `${(m.a / max) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* VS */}
                  <span className="font-mono text-[9px] text-muted-foreground">vs</span>

                  {/* B value + bar */}
                  <div className="flex items-center gap-2 flex-row-reverse">
                    <span
                      className={cn(
                        "font-mono text-lg font-bold tabular-nums tracking-tight min-w-[3rem] text-right",
                        bWins ? "text-green-600" : "text-muted-foreground"
                      )}
                    >
                      {m.format(m.b)}
                    </span>
                    <div className="flex-1 h-2 bg-accent/30 overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-500 ml-auto",
                          bWins ? "bg-green-500" : "bg-muted-foreground/30"
                        )}
                        style={{ width: `${(m.b / max) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Overall winner */}
          <div className="border-2 border-primary/30 p-4 mt-4">
            <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
              Resultado
            </div>
            {overallA === overallB ? (
              <p className="font-mono text-sm font-bold">EMPATE</p>
            ) : (
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                <span className="font-mono text-sm font-bold">
                  {overallA > overallB
                    ? dataA.profile.full_name ?? dataA.profile.email
                    : dataB.profile.full_name ?? dataB.profile.email}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  gana {Math.max(overallA, overallB)}/{metrics.length} metricas
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <Users className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Selecciona dos miembros para comparar.
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 4: TEAM
// ═══════════════════════════════════════════════════════════

function TeamTab({ stats }: { stats: TeamStats }) {
  const totalCatEntries = Object.values(stats.categoryDistribution).reduce(
    (a, b) => a + b,
    0
  );

  const gradeColor =
    stats.grade === "A+" || stats.grade === "A"
      ? "text-green-600"
      : stats.grade === "B"
        ? "text-primary"
        : stats.grade === "C"
          ? "text-yellow-600"
          : "text-red-600";

  return (
    <div>
      {/* Team grade */}
      <div className="border-2 border-primary/30 p-6 mb-8 flex items-center justify-between">
        <div>
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Calificacion del equipo
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Basada en el promedio de Trust Score del equipo
          </p>
        </div>
        <div className={cn("font-mono text-5xl font-bold tabular-nums tracking-tight", gradeColor)}>
          {stats.grade}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <StatBox label="Total horas (30d)" value={`${stats.totalHours}h`} />
        <StatBox label="Trust Score prom." value={`${stats.avgTrustScore}`} />
        <StatBox label="Proof rate prom." value={`${stats.avgProofRate}%`} />
        <StatBox
          label="Miembros"
          value={`${stats.memberCount}`}
          icon={<Users className="w-4 h-4 text-muted-foreground" />}
        />
        <StatBox
          label="Activos hoy"
          value={`${stats.activeToday}`}
          icon={<Activity className="w-4 h-4 text-green-600" />}
        />
        <StatBox
          label="Ghosts hoy"
          value={`${stats.ghostCount}`}
          icon={<Ghost className="w-4 h-4 text-muted-foreground" />}
        />
      </div>

      {/* Category distribution */}
      <div className="mb-8">
        <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Distribucion por categoria (30d)
        </div>

        {/* Bar chart */}
        <div className="space-y-2">
          {Object.entries(stats.categoryDistribution)
            .sort(([, a], [, b]) => b - a)
            .map(([cat, count]) => {
              const pct = totalCatEntries > 0 ? Math.round((count / totalCatEntries) * 100) : 0;
              const catConfig = CATEGORIES[cat as WorkCategory];
              const bgColor = CATEGORY_COLORS[cat] ?? "bg-gray-400";

              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="font-mono text-[10px] w-20 text-muted-foreground uppercase">
                    {catConfig?.emoji ?? cat}
                  </span>
                  <div className="flex-1 h-4 bg-accent/30 overflow-hidden">
                    <div
                      className={cn("h-full transition-all duration-500", bgColor)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs tabular-nums tracking-tight text-muted-foreground w-12 text-right">
                    {pct}%
                  </span>
                  <span className="font-mono text-xs tabular-nums tracking-tight text-muted-foreground w-10 text-right">
                    {count}h
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-accent/30 border border-border p-4">
      <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
        {label}
      </div>
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
          {value}
        </span>
      </div>
    </div>
  );
}
