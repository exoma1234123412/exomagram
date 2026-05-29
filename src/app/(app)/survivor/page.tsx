"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile, TimeEntry, TrustScoreHistory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Skull,
  Crown,
  Swords,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Trophy,
  Target,
  Calendar,
} from "lucide-react";
import {
  startOfWeek,
  endOfWeek,
  format,
  getDay,
  addDays,
  isWeekend,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";

interface MemberData {
  userId: string;
  profile: Profile | null;
}

interface DailyScore {
  userId: string;
  hoursLogged: number;
  trustScore: number;
  verifiedEntries: number;
  totalEntries: number;
  combined: number;
}

interface EliminationEvent {
  day: number; // 1=Mon..5=Fri
  date: string;
  eliminatedUserId: string | null;
  scores: DailyScore[];
}

export default function SurvivorPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [members, setMembers] = useState<MemberData[]>([]);
  const [eliminations, setEliminations] = useState<EliminationEvent[]>([]);
  const [currentDay, setCurrentDay] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isShowingLastWeek, setIsShowingLastWeek] = useState(false);

  const profileMap = new Map<string, Profile>();
  for (const m of members) {
    if (m.profile) profileMap.set(m.userId, m.profile);
  }

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const now = new Date();
    const todayDay = getDay(now); // 0=Sun..6=Sat
    const showLastWeek = isWeekend(now) || todayDay === 0;
    setIsShowingLastWeek(showLastWeek);

    const referenceDate = showLastWeek ? subWeeks(now, 1) : now;
    const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(referenceDate, { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");

    // Current day of the battle (1-5), clamped
    if (!showLastWeek) {
      const dayNum = getDay(now); // 0=Sun, 1=Mon..6=Sat
      setCurrentDay(Math.min(Math.max(dayNum === 0 ? 5 : dayNum, 1), 5));
    } else {
      setCurrentDay(5); // Show full week results
    }

    // Fetch members
    const { data: orgMembers } = await supabase
      .from("org_members")
      .select("user_id, profiles(id, full_name, avatar_url, email)")
      .eq("org_id", orgId);

    if (!orgMembers || orgMembers.length === 0) {
      setLoading(false);
      return;
    }

    const memberList: MemberData[] = orgMembers.map((m) => ({
      userId: m.user_id,
      profile: m.profiles as unknown as Profile | null,
    }));
    setMembers(memberList);

    // Fetch time entries for the week
    const { data: entries } = await supabase
      .from("time_entries")
      .select("*")
      .eq("org_id", orgId)
      .gte("date", weekStartStr)
      .lte("date", weekEndStr);

    // Fetch trust scores for the week
    const { data: scores } = await supabase
      .from("trust_score_history")
      .select("*")
      .eq("org_id", orgId)
      .gte("date", weekStartStr)
      .lte("date", weekEndStr);

    // Build daily eliminations
    const allEntries = (entries ?? []) as TimeEntry[];
    const allScores = (scores ?? []) as TrustScoreHistory[];
    const aliveSet = new Set(memberList.map((m) => m.userId));
    const eliminationEvents: EliminationEvent[] = [];

    const maxDay = showLastWeek ? 5 : Math.min(Math.max(getDay(now) === 0 ? 5 : getDay(now), 1), 5);

    for (let day = 1; day <= 5; day++) {
      const dayDate = addDays(weekStart, day - 1);
      const dayDateStr = format(dayDate, "yyyy-MM-dd");

      // Calculate scores for alive members on this day
      const dayScores: DailyScore[] = [];

      for (const uid of aliveSet) {
        const userEntries = allEntries.filter(
          (e) => e.user_id === uid && e.date === dayDateStr
        );
        const userTrust = allScores.find(
          (s) => s.user_id === uid && s.date === dayDateStr
        );

        const hoursLogged = userEntries.length;
        const trustScore = userTrust?.score ?? 0;
        const verifiedEntries = userEntries.filter(
          (e) => e.verification_status === "verified"
        ).length;
        const totalEntries = userEntries.length;
        const verificationRate =
          totalEntries > 0 ? (verifiedEntries / totalEntries) * 20 : 0;

        const combined =
          Math.round((hoursLogged * 10 + trustScore + verificationRate) * 10) / 10;

        dayScores.push({
          userId: uid,
          hoursLogged,
          trustScore,
          verifiedEntries,
          totalEntries,
          combined,
        });
      }

      dayScores.sort((a, b) => b.combined - a.combined);

      let eliminatedId: string | null = null;

      // Only eliminate if day has passed (or is today after work hours) and more than 1 alive
      if (day < maxDay && aliveSet.size > 1) {
        const lowest = dayScores[dayScores.length - 1];
        if (lowest) {
          eliminatedId = lowest.userId;
          aliveSet.delete(lowest.userId);
        }
      }

      // On Friday (day 5), eliminate the lowest to crown the last one standing
      if (day === 5 && maxDay === 5 && aliveSet.size > 1) {
        const lowest = dayScores[dayScores.length - 1];
        if (lowest) {
          eliminatedId = lowest.userId;
          aliveSet.delete(lowest.userId);
        }
      }

      eliminationEvents.push({
        day,
        date: dayDateStr,
        eliminatedUserId: eliminatedId,
        scores: dayScores,
      });
    }

    setEliminations(eliminationEvents);
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      return;
    }
    loadData();
  }, [orgLoading, orgId, loadData]);

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  // Determine eliminated users and the survivor
  const eliminatedUserIds = new Set(
    eliminations
      .filter((e) => e.eliminatedUserId)
      .map((e) => e.eliminatedUserId!)
  );
  const aliveMembers = members.filter((m) => !eliminatedUserIds.has(m.userId));
  const isBattleComplete = currentDay >= 5 || (isShowingLastWeek && eliminations.length === 5);
  const survivor =
    isBattleComplete && aliveMembers.length === 1 ? aliveMembers[0] : null;

  // Day names in Spanish
  const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

  // Get the week range label
  const now = new Date();
  const referenceDate = isShowingLastWeek ? subWeeks(now, 1) : now;
  const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 4); // Friday
  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM yyyy", { locale: es })}`;

  // Current standings: gather cumulative scores
  const cumulativeScores = new Map<string, number>();
  for (const elim of eliminations) {
    if (elim.day > currentDay) break;
    for (const s of elim.scores) {
      cumulativeScores.set(s.userId, (cumulativeScores.get(s.userId) ?? 0) + s.combined);
    }
  }

  const standings = members
    .map((m) => ({
      ...m,
      totalScore: cumulativeScores.get(m.userId) ?? 0,
      isEliminated: eliminatedUserIds.has(m.userId),
      isSurvivor: survivor?.userId === m.userId,
    }))
    .sort((a, b) => {
      // Survivor first, then alive, then eliminated
      if (a.isSurvivor && !b.isSurvivor) return -1;
      if (!a.isSurvivor && b.isSurvivor) return 1;
      if (!a.isEliminated && b.isEliminated) return -1;
      if (a.isEliminated && !b.isEliminated) return 1;
      return b.totalScore - a.totalScore;
    });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Swords className="w-6 h-6 text-primary" />
          Battle Royale Semanal
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isShowingLastWeek
            ? `Resultados de la semana pasada (${weekLabel})`
            : `Semana en curso: ${weekLabel}`}
        </p>
      </div>

      {/* Survivor announcement */}
      {survivor && (
        <div className="mb-8 relative overflow-hidden rounded-2xl border-2 border-amber-400 dark:border-amber-500 bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100 dark:from-amber-950/40 dark:via-yellow-950/20 dark:to-amber-950/30 p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(251,191,36,0.15),transparent_70%)]" />
          <div className="relative flex flex-col items-center gap-4 text-center">
            <div className="relative">
              <div className="absolute -inset-3 rounded-full bg-amber-400/20 animate-pulse" />
              <div className="absolute -inset-6 rounded-full bg-amber-400/10 animate-pulse" style={{ animationDelay: "0.5s" }} />
              <Avatar className="w-20 h-20 ring-4 ring-amber-400 shadow-lg shadow-amber-400/30">
                <AvatarImage src={survivor.profile?.avatar_url ?? undefined} />
                <AvatarFallback className="text-xl font-bold bg-amber-100 dark:bg-amber-900 text-amber-700">
                  {getInitials(survivor.profile?.full_name ?? null)}
                </AvatarFallback>
              </Avatar>
              <Crown className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 text-amber-500 drop-shadow-lg" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-amber-600 dark:text-amber-400 font-bold mb-1">
                Sobreviviente de la semana
              </p>
              <p className="text-2xl font-black tracking-tight text-amber-900 dark:text-amber-200">
                {survivor.profile?.full_name ?? "?"}
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                Ultimo en pie con{" "}
                <span className="font-bold tabular-nums">
                  {Math.round(cumulativeScores.get(survivor.userId) ?? 0)}
                </span>{" "}
                puntos acumulados
              </p>
            </div>
            <Trophy className="w-10 h-10 text-amber-400/60" />
          </div>
        </div>
      )}

      {/* Day progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Dia {currentDay} de 5
          </h2>
          <Badge
            className={cn(
              "text-xs",
              isBattleComplete
                ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
            )}
          >
            {isBattleComplete ? "Batalla finalizada" : "En combate"}
          </Badge>
        </div>

        {/* Timeline */}
        <div className="flex gap-1">
          {dayNames.map((name, idx) => {
            const dayNum = idx + 1;
            const elim = eliminations.find((e) => e.day === dayNum);
            const isPast = dayNum < currentDay || isBattleComplete;
            const isCurrent = dayNum === currentDay && !isBattleComplete;
            const isFuture = dayNum > currentDay && !isBattleComplete;
            const eliminated = elim?.eliminatedUserId;
            const eliminatedProfile = eliminated ? profileMap.get(eliminated) : null;

            return (
              <div key={dayNum} className="flex-1">
                <div
                  className={cn(
                    "rounded-xl p-2 text-center transition-all duration-300 border",
                    isPast && eliminated && "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
                    isPast && !eliminated && "bg-accent/40 border-border/50",
                    isCurrent && "bg-primary/5 border-primary/30 ring-2 ring-primary/20",
                    isFuture && "bg-accent/20 border-border/30 opacity-50"
                  )}
                >
                  <p className={cn(
                    "text-[10px] font-semibold mb-1",
                    isCurrent && "text-primary",
                    isFuture && "text-muted-foreground/50"
                  )}>
                    {name.slice(0, 3)}
                  </p>

                  {isPast && eliminated && eliminatedProfile ? (
                    <div className="flex flex-col items-center gap-1">
                      <div className="relative">
                        <Avatar className="w-6 h-6 opacity-50 grayscale ring-2 ring-red-300 dark:ring-red-700">
                          <AvatarImage src={eliminatedProfile.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[8px]">
                            {getInitials(eliminatedProfile.full_name ?? null)}
                          </AvatarFallback>
                        </Avatar>
                        <Skull className="absolute -bottom-1 -right-1 w-3.5 h-3.5 text-red-500" />
                      </div>
                      <p className="text-[8px] text-red-600 dark:text-red-400 font-medium line-through truncate w-full">
                        {eliminatedProfile.full_name?.split(" ")[0] ?? "?"}
                      </p>
                    </div>
                  ) : isPast && !eliminated ? (
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-6 h-6 rounded-full bg-accent/60 flex items-center justify-center">
                        <ShieldCheck className="w-3 h-3 text-muted-foreground/40" />
                      </div>
                      <p className="text-[8px] text-muted-foreground">Sin baja</p>
                    </div>
                  ) : isCurrent ? (
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Flame className="w-3 h-3 text-primary animate-pulse" />
                      </div>
                      <p className="text-[8px] text-primary font-medium">Hoy</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-6 h-6 rounded-full bg-accent/30 flex items-center justify-center">
                        <Target className="w-3 h-3 text-muted-foreground/30" />
                      </div>
                      <p className="text-[8px] text-muted-foreground/40">---</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current standings */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          Clasificación
        </h2>

        {standings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Swords className="w-7 h-7 text-primary/40" />
            </div>
            <p className="text-sm text-muted-foreground">
              No hay participantes esta semana.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {standings.map((s, idx) => {
              const rank = idx + 1;

              return (
                <Card
                  key={s.userId}
                  className={cn(
                    "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
                    s.isEliminated && "opacity-50",
                    s.isSurvivor && "border-amber-300 dark:border-amber-600 shadow-lg shadow-amber-400/10"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {/* Rank */}
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold tabular-nums",
                          s.isSurvivor && "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
                          s.isEliminated && "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
                          !s.isSurvivor && !s.isEliminated && "bg-accent/40 text-muted-foreground"
                        )}
                      >
                        {s.isSurvivor ? (
                          <Crown className="w-4 h-4" />
                        ) : s.isEliminated ? (
                          <Skull className="w-4 h-4" />
                        ) : (
                          `#${rank}`
                        )}
                      </div>

                      {/* Avatar */}
                      <Avatar
                        className={cn(
                          "w-8 h-8 ring-2 shadow-sm",
                          s.isSurvivor && "ring-amber-400",
                          s.isEliminated && "ring-red-300 dark:ring-red-700 grayscale",
                          !s.isSurvivor && !s.isEliminated && "ring-background"
                        )}
                      >
                        <AvatarImage src={s.profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(s.profile?.full_name ?? null)}
                        </AvatarFallback>
                      </Avatar>

                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "font-semibold text-sm",
                            s.isEliminated && "line-through text-red-600 dark:text-red-400",
                            s.isSurvivor && "text-amber-700 dark:text-amber-400"
                          )}
                        >
                          {s.profile?.full_name ?? "?"}
                          {s.userId === userId && (
                            <span className="text-xs text-muted-foreground font-normal ml-2">
                              (tu)
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.isSurvivor && "Sobreviviente"}
                          {s.isEliminated && "Eliminado"}
                          {!s.isSurvivor && !s.isEliminated && "En combate"}
                        </p>
                      </div>

                      {/* Score */}
                      <div className="text-right">
                        <p
                          className={cn(
                            "text-lg font-bold tabular-nums tracking-tight",
                            s.isSurvivor && "text-amber-600 dark:text-amber-400",
                            s.isEliminated && "text-red-500"
                          )}
                        >
                          {Math.round(s.totalScore)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">pts</p>
                      </div>

                      {/* Status badge */}
                      {s.isSurvivor && (
                        <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px]">
                          Campeon
                        </Badge>
                      )}
                      {s.isEliminated && (
                        <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px]">
                          Fuera
                        </Badge>
                      )}
                    </div>

                    {/* Elimination day detail */}
                    {s.isEliminated && (() => {
                      const elimEvent = eliminations.find(
                        (e) => e.eliminatedUserId === s.userId
                      );
                      if (!elimEvent) return null;
                      return (
                        <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/20 text-[10px] text-red-600 dark:text-red-400">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          Eliminado el {dayNames[elimEvent.day - 1]} con{" "}
                          <span className="font-bold tabular-nums">
                            {Math.round(
                              elimEvent.scores.find((sc) => sc.userId === s.userId)
                                ?.combined ?? 0
                            )}
                          </span>{" "}
                          pts ese dia
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Daily breakdown */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Flame className="w-4 h-4" />
          Detalle por dia
        </h2>

        <div className="space-y-3">
          {eliminations
            .filter((e) => e.day <= currentDay || isBattleComplete)
            .map((elim) => {
              const eliminated = elim.eliminatedUserId;

              return (
                <Card
                  key={elim.day}
                  className={cn(
                    "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
                    eliminated && "border-red-200 dark:border-red-800/50"
                  )}
                >
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        {dayNames[elim.day - 1]}
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {format(new Date(elim.date + "T12:00:00"), "d MMM", { locale: es })}
                        </span>
                      </span>
                      {eliminated && (
                        <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] gap-1">
                          <Skull className="w-3 h-3" />
                          Eliminacion
                        </Badge>
                      )}
                      {!eliminated && elim.day <= currentDay && (
                        <Badge className="bg-accent/40 text-muted-foreground text-[10px]">
                          Sin baja
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-1.5">
                      {elim.scores
                        .sort((a, b) => b.combined - a.combined)
                        .map((score) => {
                          const isKilled = score.userId === eliminated;
                          const profile = profileMap.get(score.userId);

                          return (
                            <div
                              key={score.userId}
                              className={cn(
                                "flex items-center gap-2 py-1.5 px-2 rounded-lg text-sm",
                                isKilled && "bg-red-50 dark:bg-red-950/20"
                              )}
                            >
                              {isKilled ? (
                                <Skull className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              ) : (
                                <ShieldCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
                              )}
                              <Avatar className="w-5 h-5 ring-2 ring-background shadow-sm">
                                <AvatarImage src={profile?.avatar_url ?? undefined} />
                                <AvatarFallback className="text-[8px]">
                                  {getInitials(profile?.full_name ?? null)}
                                </AvatarFallback>
                              </Avatar>
                              <span
                                className={cn(
                                  "flex-1 truncate text-xs",
                                  isKilled && "line-through text-red-600 dark:text-red-400"
                                )}
                              >
                                {profile?.full_name ?? "?"}
                                {score.userId === userId && (
                                  <span className="text-muted-foreground ml-1">(tu)</span>
                                )}
                              </span>
                              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                <span className="tabular-nums">
                                  {score.hoursLogged}h
                                </span>
                                <span className="tabular-nums">
                                  TS:{score.trustScore}
                                </span>
                                <span className="tabular-nums">
                                  V:{score.verifiedEntries}/{score.totalEntries}
                                </span>
                              </div>
                              <span
                                className={cn(
                                  "font-bold tabular-nums tracking-tight text-sm min-w-[3rem] text-right",
                                  isKilled
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-foreground"
                                )}
                              >
                                {Math.round(score.combined)}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </div>

      {/* Scoring explanation */}
      <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Formula de puntuacion
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Puntos = (Horas registradas x 10) + Trust Score + (Entradas verificadas / Total entradas x 20).
            Cada dia a medianoche, el participante con la menor puntuacion del dia es eliminado.
            El viernes, el ultimo en pie es coronado campeon de la semana.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
