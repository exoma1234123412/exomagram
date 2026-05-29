"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { CATEGORIES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import {
  format,
  startOfWeek,
  endOfWeek,
  subWeeks,
  eachDayOfInterval,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  Trophy,
  Medal,
  TrendingUp,
  TrendingDown,
  Minus,
  Crown,
  Flame,
  Star,
  Skull,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// --- Types ---

interface MemberPowerRanking {
  profile: Profile;
  rank: number;
  previousRank: number | null;
  powerScore: number;
  totalHours: number;
  proofPercent: number;
  streak: number;
  reactionsReceived: number;
  latePercent: number;
  categoryBreakdown: { category: WorkCategory; count: number }[];
  hotTake: string;
}

interface StoredRankings {
  weekKey: string;
  rankings: { id: string; rank: number }[];
}

interface HistoricalRank {
  weekKey: string;
  rank: number;
}

// --- Helpers ---

function getWeekKey(weekStart: Date): string {
  return format(weekStart, "yyyy-MM-dd");
}

function loadStoredRankings(weekKey: string): StoredRankings | null {
  try {
    const stored = localStorage.getItem(`power-rankings-${weekKey}`);
    if (stored) return JSON.parse(stored) as StoredRankings;
  } catch {
    // ignore parse errors
  }
  return null;
}

function saveRankings(weekKey: string, rankings: { id: string; rank: number }[]) {
  try {
    const data: StoredRankings = { weekKey, rankings };
    localStorage.setItem(`power-rankings-${weekKey}`, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

function loadAllHistoricalRankings(
  memberId: string,
  currentWeekStart: Date,
  weeksBack: number
): HistoricalRank[] {
  const history: HistoricalRank[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const ws = subWeeks(currentWeekStart, i);
    const key = getWeekKey(ws);
    const stored = loadStoredRankings(key);
    if (stored) {
      const entry = stored.rankings.find((r) => r.id === memberId);
      if (entry) {
        history.push({ weekKey: key, rank: entry.rank });
      }
    }
  }
  return history;
}

function generateHotTake(
  member: MemberPowerRanking,
  totalMembers: number
): string {
  const name = member.profile.full_name?.split(" ")[0] ?? "Este miembro";
  const movement =
    member.previousRank !== null ? member.previousRank - member.rank : 0;

  // #1 ranked
  if (member.rank === 1) {
    return `${name} domina la semana con ${member.totalHours}h y ${member.proofPercent}% evidencia. Imparable.`;
  }

  // Last place
  if (member.rank === totalMembers && totalMembers > 1) {
    return `${name} registró solo ${member.totalHours}h esta semana. Necesita reaccionar.`;
  }

  // Big mover up (3+)
  if (movement >= 3) {
    return `${name} subió ${movement} posiciones — gran mejora.`;
  }

  // Big mover down (3+)
  if (movement <= -3) {
    return `${name} cayó ${Math.abs(movement)} posiciones. ¿Qué pasó?`;
  }

  // Mover up
  if (movement >= 1) {
    return `${name} subió ${movement} ${movement === 1 ? "posición" : "posiciones"}. Buen impulso.`;
  }

  // Mover down
  if (movement <= -1) {
    return `${name} bajó ${Math.abs(movement)} ${Math.abs(movement) === 1 ? "posición" : "posiciones"}. Hay que recuperar terreno.`;
  }

  // Same position
  if (member.powerScore >= 80) {
    return `${name} se mantiene firme con un Power Score de ${member.powerScore}. Consistencia pura.`;
  }

  return `${name} se mantiene en la posición #${member.rank}. Sin cambios esta semana.`;
}

// --- Rank movement component ---

function RankMovement({
  current,
  previous,
}: {
  current: number;
  previous: number | null;
}) {
  if (previous === null) {
    return (
      <span className="text-xs text-muted-foreground font-medium">NUEVO</span>
    );
  }

  const diff = previous - current;

  if (diff > 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs font-bold text-emerald-600">
        <ArrowUp className="w-3 h-3" />
        {diff}
      </span>
    );
  }

  if (diff < 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs font-bold text-red-500">
        <ArrowDown className="w-3 h-3" />
        {Math.abs(diff)}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="w-3 h-3" />
    </span>
  );
}

// --- Mini historical chart ---

function RankHistoryChart({
  history,
  totalMembers,
}: {
  history: HistoricalRank[];
  totalMembers: number;
}) {
  if (history.length < 2) {
    return (
      <span className="text-[10px] text-muted-foreground">
        Sin historial suficiente
      </span>
    );
  }

  const maxRank = Math.max(totalMembers, ...history.map((h) => h.rank));
  const chartHeight = 48;
  const chartWidth = 120;
  const step = chartWidth / (history.length - 1);

  const points = history.map((h, i) => {
    const x = i * step;
    // Invert: rank 1 = top, rank N = bottom
    const y = ((h.rank - 1) / (maxRank - 1)) * (chartHeight - 8) + 4;
    return { x, y, rank: h.rank, weekKey: h.weekKey };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className="w-[120px] h-[48px]"
      preserveAspectRatio="none"
    >
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-primary"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3"
          className={cn(
            i === points.length - 1 ? "fill-primary" : "fill-muted-foreground/40"
          )}
        />
      ))}
    </svg>
  );
}

// --- Category segments bar ---

function CategorySegments({
  breakdown,
  total,
}: {
  breakdown: { category: WorkCategory; count: number }[];
  total: number;
}) {
  if (total === 0 || breakdown.length === 0) return null;

  const colorMap: Record<WorkCategory, string> = {
    deep_work: "bg-violet-500",
    meeting: "bg-blue-500",
    review: "bg-amber-500",
    admin: "bg-slate-500",
    planning: "bg-emerald-500",
    learning: "bg-pink-500",
    break: "bg-green-400",
    blocked: "bg-red-500",
  };

  return (
    <div className="flex w-full h-2 rounded-full overflow-hidden gap-px">
      {breakdown.map((b) => {
        const pct = (b.count / total) * 100;
        if (pct < 1) return null;
        return (
          <div
            key={b.category}
            className={cn("rounded-sm", colorMap[b.category])}
            style={{ width: `${pct}%` }}
            title={`${CATEGORIES[b.category].label}: ${b.count}h (${Math.round(pct)}%)`}
          />
        );
      })}
    </div>
  );
}

// === MAIN PAGE ===

export default function PowerRankingsPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [rankings, setRankings] = useState<MemberPowerRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPreviousWeek, setShowPreviousWeek] = useState(false);
  const [previousWeekRankings, setPreviousWeekRankings] = useState<
    MemberPowerRanking[]
  >([]);
  const supabase = createClient();

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd }).filter(
    (d) => d.getDay() !== 0 && d.getDay() !== 6
  );
  const weekDatesStr = weekDays.map((d) => d.toISOString().split("T")[0]);
  const currentWeekKey = getWeekKey(weekStart);
  const previousWeekStart = subWeeks(weekStart, 1);
  const previousWeekKey = getWeekKey(previousWeekStart);

  // Load rankings data
  const loadRankingsForWeek = useCallback(
    async (
      orgIdParam: string,
      dates: string[],
      prevWeekKey: string
    ): Promise<MemberPowerRanking[]> => {
      // Get members
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgIdParam)
        ;

      if (!members || members.length === 0) return [];

      const startDate = dates[0];
      const endDate = dates[dates.length - 1];

      // Get entries for the week
      const { data: entries } = await supabase
        .from("time_entries")
        .select("*")
        .eq("org_id", orgIdParam)
        .gte("date", startDate)
        .lte("date", endDate);

      // Get streaks
      const { data: streaks } = await supabase
        .from("activity_streaks")
        .select("user_id, current_streak")
        .eq("org_id", orgIdParam);

      // Get reactions received per user (count reactions on their entries)
      const entryIds = (entries ?? []).map((e) => e.id);
      let reactionsMap = new Map<string, number>();
      if (entryIds.length > 0) {
        const { data: reactions } = await supabase
          .from("entry_reactions")
          .select("entry_id, reaction")
          .in("entry_id", entryIds.slice(0, 500))
          .in("reaction", ["impressive", "helped_me", "verified"]);

        // Map reaction counts back to entry owners
        for (const r of reactions ?? []) {
          const entry = (entries ?? []).find((e) => e.id === r.entry_id);
          if (entry) {
            reactionsMap.set(
              entry.user_id,
              (reactionsMap.get(entry.user_id) ?? 0) + 1
            );
          }
        }
      }

      const streakMap = new Map<string, number>(
        ((streaks ?? []) as Array<{ user_id: string; current_streak: number }>).map((s) => [s.user_id, s.current_streak])
      );

      const workdays = dates.length;
      const expectedHours = workdays * EXPECTED_DAILY_HOURS;

      // Load previous week's rankings from localStorage for movement
      const prevStored = loadStoredRankings(prevWeekKey);
      const prevRankMap = new Map<string, number>();
      if (prevStored) {
        for (const r of prevStored.rankings) {
          prevRankMap.set(r.id, r.rank);
        }
      }

      // Compute power scores
      const scored = members.map((m) => {
        const userEntries =
          entries?.filter((e) => e.user_id === m.user_id) ?? [];
        const totalHours = userEntries.length;
        const withProof = userEntries.filter(
          (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
        ).length;
        const lateOnes = userEntries.filter((e) => e.is_late).length;
        const proofPercent =
          totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0;
        const latePercent =
          totalHours > 0 ? Math.round((lateOnes / totalHours) * 100) : 0;
        const streak = streakMap.get(m.user_id) ?? 0;
        const reactionsReceived = reactionsMap.get(m.user_id) ?? 0;

        // Category breakdown
        const catCounts = new Map<WorkCategory, number>();
        for (const e of userEntries) {
          catCounts.set(
            e.category as WorkCategory,
            (catCounts.get(e.category as WorkCategory) ?? 0) + 1
          );
        }
        const categoryBreakdown = Array.from(catCounts.entries())
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count);

        // Power Score (composite 0-100):
        // 30% hours, 25% proof, 20% consistency/streak, 15% peer reactions, 10% punctuality
        const hoursRatio =
          expectedHours > 0 ? Math.min(totalHours / expectedHours, 1) : 0;
        const proofRatio = proofPercent / 100;
        const streakScore = Math.min(streak / 10, 1); // 10-day streak = 100%
        const reactionScore = Math.min(reactionsReceived / 10, 1); // 10 reactions = 100%
        const punctualityScore = 1 - latePercent / 100;

        const rawScore =
          hoursRatio * 30 +
          proofRatio * 25 +
          streakScore * 20 +
          reactionScore * 15 +
          punctualityScore * 10;
        const powerScore = Math.max(0, Math.min(100, Math.round(rawScore)));

        return {
          profile: m.profiles,
          powerScore,
          totalHours,
          proofPercent,
          streak,
          reactionsReceived,
          latePercent,
          categoryBreakdown,
          previousRank: prevRankMap.get(m.profiles.id) ?? null,
        };
      });

      // Sort by power score descending
      scored.sort((a, b) => b.powerScore - a.powerScore);

      // Assign ranks and generate hot takes
      const ranked: MemberPowerRanking[] = scored.map((s, i) => {
        const member: MemberPowerRanking = {
          ...s,
          rank: i + 1,
          hotTake: "",
        };
        member.hotTake = generateHotTake(member, scored.length);
        return member;
      });

      return ranked;
    },
    [supabase]
  );

  useEffect(() => {
    if (orgLoading || !orgId) {
      if (!orgLoading && !orgId) setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);

      const ranked = await loadRankingsForWeek(
        orgId!,
        weekDatesStr,
        previousWeekKey
      );

      // Store current rankings
      saveRankings(
        currentWeekKey,
        ranked.map((r) => ({ id: r.profile.id, rank: r.rank }))
      );

      setRankings(ranked);
      setLoading(false);
    }

    load();
  }, [orgLoading, orgId, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load previous week comparison when toggled
  useEffect(() => {
    if (!showPreviousWeek || !orgId) {
      setPreviousWeekRankings([]);
      return;
    }

    async function loadPrev() {
      const prevEnd = endOfWeek(previousWeekStart, { weekStartsOn: 1 });
      const prevDays = eachDayOfInterval({
        start: previousWeekStart,
        end: prevEnd,
      }).filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
      const prevDatesStr = prevDays.map((d) => d.toISOString().split("T")[0]);
      const twoPrevKey = getWeekKey(subWeeks(previousWeekStart, 1));

      const prevRanked = await loadRankingsForWeek(
        orgId!,
        prevDatesStr,
        twoPrevKey
      );
      setPreviousWeekRankings(prevRanked);
    }

    loadPrev();
  }, [showPreviousWeek, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived data
  const playerOfTheWeek = rankings.length > 0 ? rankings[0] : null;

  const freeFall = useMemo(() => {
    if (rankings.length === 0) return null;
    let worst: MemberPowerRanking | null = null;
    let worstDrop = 0;
    for (const r of rankings) {
      if (r.previousRank !== null) {
        const drop = r.rank - r.previousRank;
        if (drop > worstDrop) {
          worstDrop = drop;
          worst = r;
        }
      }
    }
    return worstDrop >= 2 ? worst : null;
  }, [rankings]);

  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM yyyy", { locale: es })}`;

  // Rank badge for top 3
  function RankBadge({ rank }: { rank: number }) {
    if (rank === 1) {
      return (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-lg shadow-yellow-500/30">
          <Crown className="w-5 h-5 text-white" />
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center shadow-lg shadow-gray-400/30">
          <Medal className="w-5 h-5 text-white" />
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center shadow-lg shadow-amber-700/30">
          <Medal className="w-5 h-5 text-white" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
        <span className="text-lg font-bold text-muted-foreground tabular-nums">
          {rank}
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Trophy className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">
          Power Rankings de la Semana
        </h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6 capitalize">
        {weekLabel}
      </p>

      {/* Week navigation */}
      <div className="flex items-center gap-2 mb-8 bg-card/80 border border-border/50 rounded-2xl p-2 w-fit">
        <Button
          variant="outline"
          size="icon"
          className="rounded-xl"
          onClick={() => setWeekStart(subWeeks(weekStart, 1))}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() =>
            setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
          }
        >
          Esta semana
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-xl"
          onClick={() => setWeekStart(subWeeks(weekStart, -1))}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          variant={showPreviousWeek ? "default" : "outline"}
          size="sm"
          className={cn(
            "rounded-xl text-xs",
            showPreviousWeek &&
              "bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0"
          )}
          onClick={() => setShowPreviousWeek(!showPreviousWeek)}
        >
          Comparar semanas
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Cargando...
          </p>
        </div>
      ) : rankings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
            <Trophy className="w-7 h-7 text-primary/40" />
          </div>
          <p className="text-sm text-muted-foreground">
            No hay datos para este período.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* === Jugador de la Semana === */}
          {playerOfTheWeek && (
            <Card className="border-yellow-300/60 dark:border-yellow-700/40 shadow-xl shadow-yellow-500/10 ring-1 ring-yellow-300/30 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-50/50 to-transparent dark:from-yellow-950/20 pointer-events-none" />
              <CardHeader className="pb-2 relative">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  Jugador de la Semana
                </CardTitle>
              </CardHeader>
              <CardContent className="relative">
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <Avatar className="w-20 h-20 ring-4 ring-yellow-400/40 shadow-lg">
                      <AvatarImage
                        src={playerOfTheWeek.profile.avatar_url ?? undefined}
                      />
                      <AvatarFallback className="text-2xl">
                        {getInitials(playerOfTheWeek.profile.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center shadow-md">
                      <span className="text-sm">🏆</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold truncate">
                      {playerOfTheWeek.profile.full_name ??
                        playerOfTheWeek.profile.email}
                    </h3>
                    {playerOfTheWeek.profile.role && (
                      <p className="text-sm text-muted-foreground">
                        {playerOfTheWeek.profile.role}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-300/50">
                        <Star className="w-3 h-3 mr-1" />
                        Power Score: {playerOfTheWeek.powerScore}
                      </Badge>
                      {playerOfTheWeek.streak > 0 && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Flame className="w-3 h-3 text-orange-500" />
                          {playerOfTheWeek.streak} días racha
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 italic">
                      Puntaje más alto: {playerOfTheWeek.totalHours}h
                      registradas, {playerOfTheWeek.proofPercent}% evidencia,{" "}
                      {playerOfTheWeek.reactionsReceived} reacciones recibidas.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* === Caída Libre === */}
          {freeFall && (
            <Card className="border-red-300/60 dark:border-red-800/40 shadow-lg shadow-red-500/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Skull className="w-5 h-5" />
                  Caída Libre
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Avatar className="w-14 h-14 ring-2 ring-red-300/40">
                    <AvatarImage
                      src={freeFall.profile.avatar_url ?? undefined}
                    />
                    <AvatarFallback>
                      {getInitials(freeFall.profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">
                      {freeFall.profile.full_name ?? freeFall.profile.email}
                    </h3>
                    <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <TrendingDown className="w-4 h-4" />
                      Cayó de #{freeFall.previousRank} a #{freeFall.rank} esta
                      semana
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{freeFall.totalHours}h registradas</span>
                      <span>{freeFall.proofPercent}% evidencia</span>
                      <span>Power Score: {freeFall.powerScore}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* === Week-over-week comparison === */}
          {showPreviousWeek && previousWeekRankings.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Comparación semana a semana
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {/* Previous week */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-3">
                      Semana anterior (
                      {format(previousWeekStart, "d MMM", { locale: es })})
                    </p>
                    <div className="space-y-2">
                      {previousWeekRankings.map((r) => (
                        <div
                          key={r.profile.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span className="w-6 text-right font-bold text-muted-foreground tabular-nums">
                            #{r.rank}
                          </span>
                          <Avatar className="w-6 h-6">
                            <AvatarImage
                              src={r.profile.avatar_url ?? undefined}
                            />
                            <AvatarFallback className="text-[10px]">
                              {getInitials(r.profile.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate flex-1">
                            {r.profile.full_name?.split(" ")[0] ??
                              r.profile.email}
                          </span>
                          <span className="tabular-nums font-semibold">
                            {r.powerScore}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Current week */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-3">
                      Esta semana (
                      {format(weekStart, "d MMM", { locale: es })})
                    </p>
                    <div className="space-y-2">
                      {rankings.map((r) => (
                        <div
                          key={r.profile.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span className="w-6 text-right font-bold text-muted-foreground tabular-nums">
                            #{r.rank}
                          </span>
                          <Avatar className="w-6 h-6">
                            <AvatarImage
                              src={r.profile.avatar_url ?? undefined}
                            />
                            <AvatarFallback className="text-[10px]">
                              {getInitials(r.profile.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate flex-1">
                            {r.profile.full_name?.split(" ")[0] ??
                              r.profile.email}
                          </span>
                          <span className="tabular-nums font-semibold">
                            {r.powerScore}
                          </span>
                          <RankMovement
                            current={r.rank}
                            previous={r.previousRank}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* === Ranked Cards === */}
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-primary" />
              Ranking completo
            </h2>
            <div className="space-y-3">
              {rankings.map((r) => (
                <Card
                  key={r.profile.id}
                  className={cn(
                    "transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5",
                    r.rank === 1 &&
                      "border-yellow-300/60 dark:border-yellow-700/40 shadow-lg shadow-yellow-500/10 ring-1 ring-yellow-300/30",
                    r.rank === 2 &&
                      "border-gray-300/60 dark:border-gray-600/40",
                    r.rank === 3 &&
                      "border-amber-400/40 dark:border-amber-800/40",
                    r.rank === rankings.length &&
                      rankings.length > 1 &&
                      "border-red-200 dark:border-red-900/40"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Rank badge + movement */}
                      <div className="flex flex-col items-center gap-1">
                        <RankBadge rank={r.rank} />
                        <RankMovement
                          current={r.rank}
                          previous={r.previousRank}
                        />
                      </div>

                      {/* Avatar */}
                      <Avatar className="w-12 h-12 ring-2 ring-background shadow-sm mt-0.5">
                        <AvatarImage
                          src={r.profile.avatar_url ?? undefined}
                        />
                        <AvatarFallback>
                          {getInitials(r.profile.full_name)}
                        </AvatarFallback>
                      </Avatar>

                      {/* Info block */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">
                            {r.profile.full_name ?? r.profile.email}
                          </h3>
                          {r.profile.role && (
                            <span className="text-xs text-muted-foreground">
                              {r.profile.role}
                            </span>
                          )}
                          {r.streak > 2 && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] gap-1"
                            >
                              <Flame className="w-3 h-3 text-orange-500" />
                              {r.streak}d racha
                            </Badge>
                          )}
                        </div>

                        {/* Mini stat bar */}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          <span className="tabular-nums">
                            {r.totalHours}h
                          </span>
                          <span className="text-muted-foreground/40">|</span>
                          <span
                            className={cn(
                              "tabular-nums",
                              r.proofPercent >= 80
                                ? "text-green-600"
                                : r.proofPercent >= 50
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            )}
                          >
                            {r.proofPercent}% evidencia
                          </span>
                          <span className="text-muted-foreground/40">|</span>
                          <span className="tabular-nums">
                            <Flame className="w-3 h-3 inline text-orange-400" />{" "}
                            {r.streak}d
                          </span>
                          <span className="text-muted-foreground/40">|</span>
                          <span className="tabular-nums">
                            {r.reactionsReceived} reacciones
                          </span>
                        </div>

                        {/* Hot take */}
                        <p className="text-xs italic text-muted-foreground mt-2 bg-accent/40 rounded-lg px-3 py-1.5">
                          {r.rank === 1 && (
                            <Flame className="w-3 h-3 inline text-orange-500 mr-1" />
                          )}
                          {r.rank === rankings.length &&
                            rankings.length > 1 && (
                              <Skull className="w-3 h-3 inline text-red-500 mr-1" />
                            )}
                          &quot;{r.hotTake}&quot;
                        </p>

                        {/* Category segments */}
                        <div className="mt-2">
                          <CategorySegments
                            breakdown={r.categoryBreakdown}
                            total={r.totalHours}
                          />
                          {r.categoryBreakdown.length > 0 && (
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {r.categoryBreakdown.slice(0, 4).map((b) => (
                                <span
                                  key={b.category}
                                  className="text-[10px] text-muted-foreground"
                                >
                                  {CATEGORIES[b.category].emoji}{" "}
                                  {CATEGORIES[b.category].label} ({b.count})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Power Score + History Chart */}
                      <div className="flex flex-col items-center gap-2 min-w-[80px]">
                        <div className="text-center">
                          <p
                            className={cn(
                              "text-3xl font-bold tabular-nums tracking-tight",
                              r.powerScore >= 80
                                ? "text-green-600"
                                : r.powerScore >= 60
                                  ? "text-blue-600"
                                  : r.powerScore >= 40
                                    ? "text-yellow-600"
                                    : "text-red-600"
                            )}
                          >
                            {r.powerScore}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-medium">
                            Power Score
                          </p>
                        </div>
                        <RankHistoryChart
                          history={loadAllHistoricalRankings(
                            r.profile.id,
                            weekStart,
                            8
                          )}
                          totalMembers={rankings.length}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* === Historical Rankings Legend === */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Evolución de posiciones (últimas 8 semanas)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rankings.map((r) => {
                  const history = loadAllHistoricalRankings(
                    r.profile.id,
                    weekStart,
                    8
                  );
                  return (
                    <div
                      key={r.profile.id}
                      className="flex items-center gap-3 p-2 rounded-xl bg-accent/30"
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarImage
                          src={r.profile.avatar_url ?? undefined}
                        />
                        <AvatarFallback className="text-xs">
                          {getInitials(r.profile.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {r.profile.full_name?.split(" ")[0] ??
                            r.profile.email}
                        </p>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          {history.length > 0 ? (
                            history.map((h, i) => (
                              <span key={i} className="tabular-nums">
                                #{h.rank}
                                {i < history.length - 1 && (
                                  <span className="text-muted-foreground/40 mx-0.5">
                                    {"\u2192"}
                                  </span>
                                )}
                              </span>
                            ))
                          ) : (
                            <span>Sin historial</span>
                          )}
                        </div>
                      </div>
                      <RankHistoryChart
                        history={history}
                        totalMembers={rankings.length}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* === Score methodology === */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Power Score</span> = 30% horas
                registradas + 25% evidencia + 20% racha/consistencia + 15%
                reacciones de pares + 10% puntualidad. Los rankings se
                actualizan al cargar la página cada semana. El historial de
                posiciones se guarda localmente.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
