"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Shield, Flame, TrendingUp, TrendingDown, Clock, Minus } from "lucide-react";

interface PersonalStats {
  hoursToday: number;
  proofPercent: number;
  trustScore: number | null;
  trustDelta: number;
  streak: number;
  hoursYesterday: number;
}

export function PersonalStatsWidget({ orgId, date }: { orgId: string; date: string }) {
  const [stats, setStats] = useState<PersonalStats | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = date;
      const yesterday = new Date(date + "T12:00:00");
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      const [
        { data: todayEntries },
        { data: yesterdayEntries },
        { data: scoreData },
        { data: streakData },
      ] = await Promise.all([
        supabase
          .from("time_entries")
          .select("proof_urls")
          .eq("user_id", user.id)
          .eq("org_id", orgId)
          .eq("date", today),
        supabase
          .from("time_entries")
          .select("id")
          .eq("user_id", user.id)
          .eq("org_id", orgId)
          .eq("date", yesterdayStr),
        supabase
          .from("trust_score_history")
          .select("score, date")
          .eq("user_id", user.id)
          .eq("org_id", orgId)
          .order("date", { ascending: false })
          .limit(2),
        supabase
          .from("activity_streaks")
          .select("current_streak")
          .eq("user_id", user.id)
          .eq("org_id", orgId)
          .limit(1)
          .single(),
      ]);

      const entries = todayEntries ?? [];
      const withProof = entries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);

      const scores = scoreData ?? [];
      const currentScore = scores.length > 0 ? scores[0].score : null;
      const prevScore = scores.length > 1 ? scores[1].score : null;
      const delta = currentScore !== null && prevScore !== null ? currentScore - prevScore : 0;

      setStats({
        hoursToday: entries.length,
        proofPercent: entries.length > 0 ? Math.round((withProof.length / entries.length) * 100) : 0,
        trustScore: currentScore,
        trustDelta: delta,
        streak: streakData?.current_streak ?? 0,
        hoursYesterday: yesterdayEntries?.length ?? 0,
      });
    }
    load();
  }, [orgId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stats) return null;

  const hoursDelta = stats.hoursToday - stats.hoursYesterday;
  const hoursProgress = Math.min((stats.hoursToday / EXPECTED_DAILY_HOURS) * 100, 100);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
      {/* Hours today */}
      <Card className="group/stat hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-300 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent" />
        <CardContent className="p-4 text-center relative">
          <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-2">
            <Clock className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <p className={cn(
            "text-2xl font-bold tabular-nums tracking-tight",
            stats.hoursToday >= EXPECTED_DAILY_HOURS ? "text-green-600" :
            stats.hoursToday >= 4 ? "text-foreground" : "text-orange-600"
          )}>
            {stats.hoursToday}<span className="text-sm font-medium text-muted-foreground">/{EXPECTED_DAILY_HOURS}</span>
          </p>
          <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Horas hoy</p>
          {/* Progress bar */}
          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${hoursProgress}%` }}
            />
          </div>
          {hoursDelta !== 0 && (
            <span className={cn("text-[10px] flex items-center justify-center gap-0.5 mt-1.5 font-medium", hoursDelta > 0 ? "text-green-600" : "text-red-500")}>
              {hoursDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {hoursDelta > 0 ? "+" : ""}{hoursDelta} vs ayer
            </span>
          )}
        </CardContent>
      </Card>

      {/* Proof rate */}
      <Card className="group/stat hover:shadow-lg hover:shadow-green-500/5 transition-all duration-300 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent" />
        <CardContent className="p-4 text-center relative">
          <div className="w-8 h-8 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-2">
            <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
          <p className={cn(
            "text-2xl font-bold tabular-nums tracking-tight",
            stats.proofPercent >= 80 ? "text-green-600" :
            stats.proofPercent >= 50 ? "text-yellow-600" : "text-red-600"
          )}>
            {stats.hoursToday > 0 ? `${stats.proofPercent}%` : "-"}
          </p>
          <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Evidencia</p>
        </CardContent>
      </Card>

      {/* Trust score */}
      <Card className="group/stat hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent" />
        <CardContent className="p-4 text-center relative">
          <div className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center mx-auto mb-2",
            stats.trustDelta > 3 ? "bg-green-100 dark:bg-green-900/30" :
            stats.trustDelta < -3 ? "bg-red-100 dark:bg-red-900/30" :
            "bg-blue-100 dark:bg-blue-900/30"
          )}>
            {stats.trustDelta > 3 ? (
              <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
            ) : stats.trustDelta < -3 ? (
              <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
            ) : (
              <Minus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          <p className={cn(
            "text-2xl font-bold tabular-nums tracking-tight",
            stats.trustScore === null ? "text-muted-foreground" :
            stats.trustScore >= 80 ? "text-green-600" :
            stats.trustScore >= 60 ? "text-blue-600" :
            stats.trustScore >= 40 ? "text-yellow-600" : "text-red-600"
          )}>
            {stats.trustScore ?? "-"}
          </p>
          <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Trust Score</p>
          {stats.trustDelta !== 0 && stats.trustScore !== null && (
            <span className={cn("text-[10px] font-semibold", stats.trustDelta > 0 ? "text-green-600" : "text-red-500")}>
              {stats.trustDelta > 0 ? "+" : ""}{stats.trustDelta}
            </span>
          )}
        </CardContent>
      </Card>

      {/* Streak */}
      <Card className="group/stat hover:shadow-lg hover:shadow-orange-500/5 transition-all duration-300 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent" />
        <CardContent className="p-4 text-center relative">
          <div className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center mx-auto mb-2",
            stats.streak > 0 ? "bg-orange-100 dark:bg-orange-900/30" : "bg-muted"
          )}>
            <Flame className={cn("w-4 h-4", stats.streak > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground")} />
          </div>
          <p className={cn("text-2xl font-bold tabular-nums tracking-tight", stats.streak > 0 ? "text-orange-600" : "text-muted-foreground")}>
            {stats.streak}
          </p>
          <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Racha</p>
          {stats.streak >= 7 && (
            <Badge variant="outline" className="text-[9px] mt-1 py-0 px-1.5 rounded-md font-semibold">
              {stats.streak >= 30 ? "Legendario" : "En fuego"}
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
