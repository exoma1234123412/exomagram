"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Skull,
  ShieldAlert,
  Trophy,
  Send,
  Loader2,
  TrendingDown,
  History,
  AlertTriangle,
  Crown,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

interface MemberRanking {
  userId: string;
  profile: Profile | null;
  avgScore: number;
  daysTracked: number;
}

interface SurvivalPlan {
  id: string;
  user_id: string;
  new_data: {
    plan: string;
    month: string;
    avg_score: number;
  };
  created_at: string;
  profile?: Profile;
}

function scoreToGrade(score: number): { letter: string; color: string } {
  if (score >= 80) return { letter: "A", color: "text-green-600 dark:text-green-400" };
  if (score >= 60) return { letter: "B", color: "text-blue-600 dark:text-blue-400" };
  if (score >= 40) return { letter: "C", color: "text-amber-600 dark:text-amber-400" };
  if (score >= 20) return { letter: "D", color: "text-orange-600 dark:text-orange-400" };
  return { letter: "F", color: "text-red-600 dark:text-red-400" };
}

function gradeNumeric(score: number): number {
  if (score >= 80) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  if (score >= 20) return 1;
  return 0;
}

export default function EliminationPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [rankings, setRankings] = useState<MemberRanking[]>([]);
  const [pastResults, setPastResults] = useState<{ month: string; rankings: MemberRanking[]; plans: SurvivalPlan[] }[]>([]);
  const [myPlan, setMyPlan] = useState<SurvivalPlan | null>(null);
  const [planText, setPlanText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const monthStart = startOfMonth(now).toISOString().split("T")[0];
  const monthEnd = endOfMonth(now).toISOString().split("T")[0];

  const loadData = useCallback(async () => {
    if (!orgId) return;

    // Get members
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    if (!members) { setLoading(false); return; }

    const profileMap = new Map<string, Profile>();
    for (const m of members) {
      if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
    }

    // Get trust scores for current month
    const { data: scores } = await supabase
      .from("trust_score_history")
      .select("user_id, score, date")
      .eq("org_id", orgId)
      .gte("date", monthStart)
      .lte("date", monthEnd);

    // Calculate averages for current month
    const scoresByUser = new Map<string, number[]>();
    for (const s of scores ?? []) {
      const list = scoresByUser.get(s.user_id) ?? [];
      list.push(s.score);
      scoresByUser.set(s.user_id, list);
    }

    const currentRankings: MemberRanking[] = members.map((m) => {
      const userScores = scoresByUser.get(m.user_id) ?? [];
      const avg = userScores.length > 0
        ? userScores.reduce((a, b) => a + b, 0) / userScores.length
        : 0;
      return {
        userId: m.user_id,
        profile: profileMap.get(m.user_id) ?? null,
        avgScore: Math.round(avg * 10) / 10,
        daysTracked: userScores.length,
      };
    });

    currentRankings.sort((a, b) => b.avgScore - a.avgScore);
    setRankings(currentRankings);

    // Load survival plans for current month
    const { data: planLogs } = await supabase
      .from("audit_log")
      .select("id, user_id, new_data, created_at")
      .eq("org_id", orgId)
      .eq("action", "entry_created")
      .eq("target_type", "survival_plan")
      .order("created_at", { ascending: false });

    const allPlans: SurvivalPlan[] = (planLogs ?? []).map((l) => ({
      id: l.id,
      user_id: l.user_id,
      new_data: l.new_data as SurvivalPlan["new_data"],
      created_at: l.created_at,
      profile: profileMap.get(l.user_id),
    }));

    const currentPlan = allPlans.find(
      (p) => p.user_id === userId && p.new_data.month === currentMonth
    );
    setMyPlan(currentPlan ?? null);

    // Load past 3 months
    const pastMonthResults: { month: string; rankings: MemberRanking[]; plans: SurvivalPlan[] }[] = [];

    for (let i = 1; i <= 3; i++) {
      const pastDate = subMonths(now, i);
      const pastMonthKey = format(pastDate, "yyyy-MM");
      const pastStart = startOfMonth(pastDate).toISOString().split("T")[0];
      const pastEnd = endOfMonth(pastDate).toISOString().split("T")[0];

      const { data: pastScores } = await supabase
        .from("trust_score_history")
        .select("user_id, score")
        .eq("org_id", orgId)
        .gte("date", pastStart)
        .lte("date", pastEnd);

      if (!pastScores || pastScores.length === 0) continue;

      const pastByUser = new Map<string, number[]>();
      for (const s of pastScores) {
        const list = pastByUser.get(s.user_id) ?? [];
        list.push(s.score);
        pastByUser.set(s.user_id, list);
      }

      const pastRank: MemberRanking[] = Array.from(pastByUser.entries()).map(([uid, sc]) => ({
        userId: uid,
        profile: profileMap.get(uid) ?? null,
        avgScore: Math.round((sc.reduce((a, b) => a + b, 0) / sc.length) * 10) / 10,
        daysTracked: sc.length,
      }));

      pastRank.sort((a, b) => b.avgScore - a.avgScore);

      const monthPlans = allPlans.filter((p) => p.new_data.month === pastMonthKey);

      pastMonthResults.push({
        month: pastMonthKey,
        rankings: pastRank,
        plans: monthPlans,
      });
    }

    setPastResults(pastMonthResults);
    setLoading(false);
  }, [orgId, userId, monthStart, monthEnd, currentMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      return;
    }
    loadData();
  }, [orgLoading, orgId, loadData]);

  async function submitPlan() {
    if (!orgId || !userId || planText.trim().length < 20) return;
    setSubmitting(true);

    const myRank = rankings.find((r) => r.userId === userId);

    await supabase.from("audit_log").insert({
      org_id: orgId,
      user_id: userId,
      action: "entry_created",
      target_type: "survival_plan",
      new_data: {
        plan: planText.trim(),
        month: currentMonth,
        avg_score: myRank?.avgScore ?? 0,
      },
    });

    setPlanText("");
    await loadData();
    setSubmitting(false);
  }

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      </div>
    );
  }

  const dangerUser = rankings.length > 0 ? rankings[rankings.length - 1] : null;
  const isInDanger = dangerUser?.userId === userId;
  const displayMonth = format(now, "MMMM yyyy", { locale: es });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Skull className="w-6 h-6 text-primary" />
          Eliminación Mensual
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          El miembro con el Trust Score promedio más bajo del mes debe presentar un plan de supervivencia.
        </p>
      </div>

      {/* Danger zone alert */}
      {isInDanger && !myPlan && rankings.length > 1 && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
          <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              Estás en la zona de peligro este mes.
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              Presenta tu plan de supervivencia para que el equipo lo vea.
            </p>
          </div>
        </div>
      )}

      {/* Current month rankings */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          Rankings de {displayMonth}
        </h2>

        {rankings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <TrendingDown className="w-7 h-7 text-primary/40" />
            </div>
            <p className="text-sm text-muted-foreground">
              No hay datos de Trust Score este mes todavía.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rankings.map((r, idx) => {
              const isLast = idx === rankings.length - 1 && rankings.length > 1;
              const isFirst = idx === 0;
              const grade = scoreToGrade(r.avgScore);
              const gradeNum = gradeNumeric(r.avgScore);

              return (
                <Card
                  key={r.userId}
                  className={cn(
                    "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
                    isLast && "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10",
                    isFirst && "border-green-300 dark:border-green-800",
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold tabular-nums",
                        isFirst && "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
                        !isFirst && !isLast && "bg-accent/40 text-muted-foreground",
                        isLast && "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
                      )}>
                        {isFirst && <Crown className="w-4 h-4" />}
                        {!isFirst && !isLast && `#${idx + 1}`}
                        {isLast && <Skull className="w-4 h-4" />}
                      </div>
                      <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
                        <AvatarImage src={r.profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(r.profile?.full_name ?? null)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "font-semibold text-sm",
                          isLast && "text-red-700 dark:text-red-400",
                        )}>
                          {r.profile?.full_name ?? "?"}
                          {r.userId === userId && (
                            <span className="text-xs text-muted-foreground font-normal ml-2">(tú)</span>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {r.daysTracked} días registrados
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-lg font-bold tabular-nums tracking-tight">{r.avgScore}</p>
                          <p className="text-[10px] text-muted-foreground">promedio</p>
                        </div>
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black",
                          grade.color,
                          isLast ? "bg-red-100 dark:bg-red-900/30" : "bg-accent/40",
                        )}>
                          {grade.letter}
                        </div>
                      </div>
                    </div>
                    {isLast && (
                      <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Zona de peligro &mdash; debe presentar plan de supervivencia
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Survival plan form (only if in danger zone) */}
      {isInDanger && !myPlan && rankings.length > 1 && (
        <Card className="mb-8 border-2 border-red-300 dark:border-red-800">
          <CardContent className="p-6">
            <h3 className="font-semibold text-sm mb-1 flex items-center gap-2 text-red-700 dark:text-red-400">
              <ShieldAlert className="w-4 h-4" />
              Tu plan de supervivencia
            </h3>
            <p className="text-xs text-muted-foreground/60 mb-3">
              Explica qué vas a hacer diferente el próximo mes para mejorar. Todo el equipo lo verá.
            </p>
            <Textarea
              placeholder="Mi plan para mejorar el próximo mes es..."
              value={planText}
              onChange={(e) => setPlanText(e.target.value)}
              className="min-h-[120px] mb-3"
              maxLength={2000}
              autoComplete="off"
            />
            <div className="flex items-center justify-between">
              <p
                className={cn(
                  "text-xs",
                  planText.length < 20 ? "text-muted-foreground" : "text-green-600"
                )}
              >
                {planText.length}/2000
                {planText.length > 0 && planText.length < 20 && (
                  <span className="ml-2">(mínimo 20 caracteres)</span>
                )}
              </p>
              <Button
                className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0 shadow-lg shadow-blue-600/25 gap-2"
                disabled={planText.trim().length < 20 || submitting}
                onClick={submitPlan}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submitting ? "Enviando..." : "Presentar plan"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* My submitted plan */}
      {myPlan && (
        <Card className="mb-8 border-2 border-primary/20">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <Avatar className="w-10 h-10 ring-2 ring-background shadow-sm">
                <AvatarImage src={myPlan.profile?.avatar_url ?? undefined} />
                <AvatarFallback>
                  {getInitials(myPlan.profile?.full_name ?? null)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-sm">Tu plan de supervivencia</p>
                  <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px]">
                    Score: {myPlan.new_data.avg_score}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground italic">
                  &ldquo;{myPlan.new_data.plan}&rdquo;
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Past months */}
      {pastResults.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <History className="w-4 h-4" />
            Meses anteriores
          </h2>
          <div className="space-y-6">
            {pastResults.map((pm) => {
              const loser = pm.rankings.length > 1 ? pm.rankings[pm.rankings.length - 1] : null;
              const loserPlan = loser ? pm.plans.find((p) => p.user_id === loser.userId) : null;
              const monthLabel = format(new Date(pm.month + "-01"), "MMMM yyyy", { locale: es });

              return (
                <Card key={pm.month} className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-sm mb-3 capitalize">{monthLabel}</h3>

                    {/* Top 3 + bottom */}
                    <div className="space-y-2 mb-3">
                      {pm.rankings.slice(0, 3).map((r, idx) => {
                        const grade = scoreToGrade(r.avgScore);
                        return (
                          <div key={r.userId} className="flex items-center gap-2 text-sm">
                            <span className={cn(
                              "w-5 text-center font-bold tabular-nums text-xs",
                              idx === 0 && "text-amber-600",
                            )}>
                              #{idx + 1}
                            </span>
                            <Avatar className="w-5 h-5 ring-2 ring-background shadow-sm">
                              <AvatarImage src={r.profile?.avatar_url ?? undefined} />
                              <AvatarFallback className="text-[8px]">
                                {getInitials(r.profile?.full_name ?? null)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="flex-1 truncate">{r.profile?.full_name ?? "?"}</span>
                            <span className={cn("font-bold tabular-nums text-xs", grade.color)}>
                              {grade.letter} ({r.avgScore})
                            </span>
                          </div>
                        );
                      })}

                      {pm.rankings.length > 4 && (
                        <p className="text-[10px] text-muted-foreground text-center">
                          ... {pm.rankings.length - 4} más ...
                        </p>
                      )}

                      {/* Bottom person (danger) */}
                      {loser && pm.rankings.length > 3 && (
                        <div className="flex items-center gap-2 text-sm bg-red-50 dark:bg-red-950/20 rounded-lg p-2">
                          <span className="w-5 text-center">
                            <Skull className="w-3.5 h-3.5 text-red-500 mx-auto" />
                          </span>
                          <Avatar className="w-5 h-5 ring-2 ring-background shadow-sm">
                            <AvatarImage src={loser.profile?.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[8px]">
                              {getInitials(loser.profile?.full_name ?? null)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="flex-1 truncate text-red-700 dark:text-red-400 font-medium">
                            {loser.profile?.full_name ?? "?"}
                          </span>
                          <span className="font-bold tabular-nums text-xs text-red-600">
                            {scoreToGrade(loser.avgScore).letter} ({loser.avgScore})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Survival plan if submitted */}
                    {loserPlan && (
                      <div className="bg-accent/40 rounded-xl p-3 mt-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                          Plan de supervivencia
                        </p>
                        <p className="text-sm italic text-muted-foreground">
                          &ldquo;{loserPlan.new_data.plan}&rdquo;
                        </p>
                      </div>
                    )}

                    {loser && !loserPlan && (
                      <div className="bg-red-50 dark:bg-red-950/20 rounded-xl p-3 mt-2 text-center">
                        <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                          No presentó plan de supervivencia
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
