"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, AccountabilityFlag, DailyCloseout } from "@/lib/types/database";
import { CATEGORIES, FLAG_TYPES, EXPECTED_DAILY_HOURS, WORK_HOURS, MOOD_LABELS } from "@/lib/constants";
import type { WorkCategory, FlagType } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  Clock,
  Shield,
  Flame,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Brain,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";

interface ScorePoint {
  date: string;
  score: number;
}

interface MoodPoint {
  date: string;
  mood: number;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function MemberPage() {
  const params = useParams();
  const memberId = params.id as string;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [scoreTrend, setScoreTrend] = useState<ScorePoint[]>([]);
  const [moodTrend, setMoodTrend] = useState<MoodPoint[]>([]);
  const [flags, setFlags] = useState<AccountabilityFlag[]>([]);
  const [closeouts, setCloseouts] = useState<DailyCloseout[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<
    { category: WorkCategory; count: number; percent: number }[]
  >([]);
  const [focusScore, setFocusScore] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const [proofPercent, setProofPercent] = useState(0);
  const [streak, setStreak] = useState(0);
  const [avgEnergy, setAvgEnergy] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      // Get current user's org
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

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
      setOrgId(membership.org_id);

      const twoWeeksAgo = subDays(new Date(), 14).toISOString().split("T")[0];
      const today = new Date().toISOString().split("T")[0];

      // Load all data in parallel
      const [
        { data: profileData },
        { data: entries },
        { data: scores },
        { data: flagData },
        { data: closeoutData },
        { data: streakData },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", memberId).single(),
        supabase
          .from("time_entries")
          .select("*")
          .eq("user_id", memberId)
          .eq("org_id", membership.org_id)
          .gte("date", twoWeeksAgo)
          .lte("date", today)
          .order("date", { ascending: true })
          .order("hour", { ascending: true }),
        supabase
          .from("trust_score_history")
          .select("date, score")
          .eq("user_id", memberId)
          .eq("org_id", membership.org_id)
          .gte("date", twoWeeksAgo)
          .order("date", { ascending: true }),
        supabase
          .from("accountability_flags")
          .select("*")
          .eq("user_id", memberId)
          .eq("org_id", membership.org_id)
          .eq("resolved", false)
          .order("date", { ascending: false })
          .limit(20)
          .returns<AccountabilityFlag[]>(),
        supabase
          .from("daily_closeouts")
          .select("*")
          .eq("user_id", memberId)
          .eq("org_id", membership.org_id)
          .gte("date", twoWeeksAgo)
          .order("date", { ascending: false })
          .limit(10)
          .returns<DailyCloseout[]>(),
        supabase
          .from("activity_streaks")
          .select("current_streak")
          .eq("user_id", memberId)
          .eq("org_id", membership.org_id)
          .limit(1)
          .single(),
      ]);

      setProfile(profileData);
      setScoreTrend(
        scores?.map((s) => ({ date: s.date, score: s.score })) ?? []
      );
      setFlags(flagData ?? []);
      setCloseouts(closeoutData ?? []);
      setStreak(streakData?.current_streak ?? 0);

      const allEntries = entries ?? [];
      setTotalHours(allEntries.length);

      // Proof percent
      const withProof = allEntries.filter(
        (e) => e.proof_urls && e.proof_urls.length > 0
      );
      setProofPercent(
        allEntries.length > 0
          ? Math.round((withProof.length / allEntries.length) * 100)
          : 0
      );

      // Mood trend (daily average)
      const moodByDate = new Map<string, number[]>();
      const energyVals: number[] = [];
      for (const e of allEntries) {
        if (e.mood) {
          const arr = moodByDate.get(e.date) ?? [];
          arr.push(e.mood);
          moodByDate.set(e.date, arr);
        }
        if (e.energy) energyVals.push(e.energy);
      }
      setAvgEnergy(
        energyVals.length > 0
          ? Math.round(
              (energyVals.reduce((a, b) => a + b, 0) / energyVals.length) * 10
            ) / 10
          : 0
      );
      setMoodTrend(
        Array.from(moodByDate.entries()).map(([date, moods]) => ({
          date,
          mood:
            Math.round(
              (moods.reduce((a, b) => a + b, 0) / moods.length) * 10
            ) / 10,
        }))
      );

      // Category breakdown
      const catCounts = new Map<WorkCategory, number>();
      for (const e of allEntries) {
        catCounts.set(e.category, (catCounts.get(e.category) ?? 0) + 1);
      }
      setCategoryBreakdown(
        Array.from(catCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([cat, count]) => ({
            category: cat,
            count,
            percent: Math.round((count / allEntries.length) * 100),
          }))
      );

      // Focus score: % of deep_work hours in contiguous 2+ hour blocks
      const deepWorkByDate = new Map<string, number[]>();
      for (const e of allEntries) {
        if (e.category === "deep_work") {
          const arr = deepWorkByDate.get(e.date) ?? [];
          arr.push(e.hour);
          deepWorkByDate.set(e.date, arr);
        }
      }
      let totalDeep = 0;
      let contiguousDeep = 0;
      for (const [, hours] of deepWorkByDate) {
        hours.sort((a, b) => a - b);
        totalDeep += hours.length;
        let blockLen = 1;
        for (let i = 1; i < hours.length; i++) {
          if (hours[i] === hours[i - 1] + 1) {
            blockLen++;
          } else {
            if (blockLen >= 2) contiguousDeep += blockLen;
            blockLen = 1;
          }
        }
        if (blockLen >= 2) contiguousDeep += blockLen;
      }
      setFocusScore(
        totalDeep > 0 ? Math.round((contiguousDeep / totalDeep) * 100) : 0
      );

      setLoading(false);
    }
    load();
  }, [memberId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-primary/40 animate-pulse" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        Miembro no encontrado
      </div>
    );
  }

  // Score trend direction
  const scoreUp =
    scoreTrend.length >= 2 &&
    scoreTrend[scoreTrend.length - 1].score >
      scoreTrend[scoreTrend.length - 2].score + 3;
  const scoreDown =
    scoreTrend.length >= 2 &&
    scoreTrend[scoreTrend.length - 1].score <
      scoreTrend[scoreTrend.length - 2].score - 3;

  // Mood trend direction
  const moodUp =
    moodTrend.length >= 2 &&
    moodTrend[moodTrend.length - 1].mood >
      moodTrend[moodTrend.length - 2].mood + 0.3;
  const moodDown =
    moodTrend.length >= 2 &&
    moodTrend[moodTrend.length - 1].mood <
      moodTrend[moodTrend.length - 2].mood - 0.3;

  // Burnout risk: declining mood + high hours + declining energy
  const burnoutRisk =
    moodDown &&
    totalHours > EXPECTED_DAILY_HOURS * 10 &&
    avgEnergy < 2.5;

  // 1:1 talking points
  const talkingPoints: string[] = [];
  if (burnoutRisk) talkingPoints.push("Posible riesgo de burnout: animo en descenso con carga alta");
  if (moodDown) talkingPoints.push("El animo ha bajado en los ultimos dias");
  if (scoreDown) talkingPoints.push("Trust score en descenso");
  if (flags.length > 0) talkingPoints.push(`${flags.length} flag(s) sin resolver`);
  if (proofPercent < 50) talkingPoints.push(`Solo ${proofPercent}% de entradas con evidencia`);
  if (focusScore < 40 && totalHours > 0) talkingPoints.push(`Focus score bajo (${focusScore}%) - mucha fragmentacion`);
  if (closeouts.length === 0) talkingPoints.push("No ha hecho cierres de dia recientes");
  const blockers = closeouts.filter((c) => c.blockers && c.blockers.length > 0);
  if (blockers.length > 0) talkingPoints.push(`Reporta blockers en ${blockers.length} cierre(s)`);

  const CATEGORY_COLORS: Record<string, string> = {
    deep_work: "bg-violet-500",
    meeting: "bg-blue-500",
    review: "bg-amber-500",
    admin: "bg-slate-400",
    planning: "bg-emerald-500",
    learning: "bg-pink-500",
    break: "bg-green-400",
    blocked: "bg-red-500",
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link */}
      <Link
        href="/accountability"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a Accountability
      </Link>

      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        <Avatar className="w-16 h-16 ring-4 ring-primary/10 shadow-xl shadow-primary/10">
          <AvatarImage src={profile.avatar_url ?? undefined} />
          <AvatarFallback className="text-lg">
            {getInitials(profile.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {profile.full_name ?? profile.email}
          </h1>
          {profile.role && (
            <p className="text-muted-foreground">{profile.role}</p>
          )}
        </div>
        {streak > 0 && (
          <Badge variant="outline" className="text-sm gap-1">
            <Flame className="w-4 h-4 text-orange-500" />
            {streak} dias
          </Badge>
        )}
      </div>

      {/* Burnout warning */}
      {burnoutRisk && (
        <Card className="mb-8 border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                Posible riesgo de burnout
              </p>
              <p className="text-xs text-red-600/70">
                Animo en descenso, energia baja ({avgEnergy}/5), carga alta ({totalHours}h en 14 dias)
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 1:1 Talking Points */}
      {talkingPoints.length > 0 && (
        <Card className="mb-8 border-violet-200 dark:border-violet-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Puntos para 1:1
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1">
              {talkingPoints.map((point, i) => (
                <li
                  key={i}
                  className="text-sm text-muted-foreground flex items-start gap-2"
                >
                  <span className="text-primary mt-1">•</span>
                  {point}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="w-4 h-4 mx-auto text-primary mb-1" />
            <p className="text-xl font-bold tabular-nums tracking-tight">{totalHours}h</p>
            <p className="text-[10px] text-muted-foreground">14 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Shield className="w-4 h-4 mx-auto text-green-500 mb-1" />
            <p className={cn("text-xl font-bold tabular-nums tracking-tight", proofPercent >= 80 ? "text-green-600" : proofPercent >= 50 ? "text-yellow-600" : "text-red-600")}>
              {proofPercent}%
            </p>
            <p className="text-[10px] text-muted-foreground">Evidencia</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Brain className="w-4 h-4 mx-auto text-blue-500 mb-1" />
            <p className={cn("text-xl font-bold tabular-nums tracking-tight", focusScore >= 60 ? "text-green-600" : focusScore >= 30 ? "text-yellow-600" : "text-red-600")}>
              {focusScore}%
            </p>
            <p className="text-[10px] text-muted-foreground">Focus Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              {moodTrend.length > 0 ? (
                moodUp ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : moodDown ? (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                )
              ) : (
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <p className="text-xl font-bold tabular-nums tracking-tight">
              {moodTrend.length > 0
                ? moodTrend[moodTrend.length - 1].mood
                : "-"}
            </p>
            <p className="text-[10px] text-muted-foreground">Animo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold tabular-nums tracking-tight">{avgEnergy || "-"}</p>
            <p className="text-[10px] text-muted-foreground">Energia prom.</p>
          </CardContent>
        </Card>
      </div>

      {/* Trust Score Trend */}
      {scoreTrend.length > 0 && (
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Trust Score (14 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-20">
              {scoreTrend.map((s) => (
                <div
                  key={s.date}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div
                    className={cn(
                      "w-full rounded-t transition-all duration-500",
                      s.score >= 80
                        ? "bg-green-500"
                        : s.score >= 60
                          ? "bg-blue-500"
                          : s.score >= 40
                            ? "bg-yellow-500"
                            : "bg-red-500"
                    )}
                    style={{
                      height: `${Math.max((s.score / 100) * 72, 4)}px`,
                    }}
                    title={`${s.date}: ${s.score}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-muted-foreground">
                {scoreTrend[0].date}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {scoreTrend[scoreTrend.length - 1].date}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mood Trend */}
      {moodTrend.length > 0 && (
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Animo (14 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-16">
              {moodTrend.map((m) => (
                <div
                  key={m.date}
                  className="flex-1 flex flex-col items-center"
                >
                  <div
                    className={cn(
                      "w-full rounded-t",
                      m.mood >= 4
                        ? "bg-green-400"
                        : m.mood >= 3
                          ? "bg-blue-400"
                          : m.mood >= 2
                            ? "bg-yellow-400"
                            : "bg-red-400"
                    )}
                    style={{
                      height: `${Math.max((m.mood / 5) * 56, 4)}px`,
                    }}
                    title={`${m.date}: ${m.mood}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribucion de trabajo</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos</p>
            ) : (
              <div className="space-y-2">
                {categoryBreakdown.map(({ category, count, percent }) => (
                  <div key={category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span>
                        {CATEGORIES[category].emoji}{" "}
                        {CATEGORIES[category].label}
                      </span>
                      <span className="text-muted-foreground tabular-nums tracking-tight">
                        {count}h ({percent}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          CATEGORY_COLORS[category]
                        )}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Flags */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Flags activos ({flags.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {flags.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sin flags activos
              </p>
            ) : (
              <div className="space-y-2">
                {flags.map((flag) => {
                  const flagInfo = FLAG_TYPES[flag.flag_type as FlagType];
                  return (
                    <div
                      key={flag.id}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span>{flagInfo.emoji}</span>
                      <div>
                        <p className="font-medium">{flagInfo.label}</p>
                        {flag.details && (
                          <p className="text-muted-foreground">
                            {flag.details}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60">
                          {flag.date}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Closeout Blockers */}
      {blockers.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Blockers reportados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {blockers.map((c) => (
                <div key={c.id} className="text-sm border-l-2 border-orange-400 pl-3">
                  <p className="text-xs text-muted-foreground">{c.date}</p>
                  <p>{c.blockers}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
