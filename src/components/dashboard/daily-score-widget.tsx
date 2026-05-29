"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS, WORK_HOURS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Shield, Clock, Flame, AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";

interface DayScore {
  hoursLogged: number;
  hoursWithProof: number;
  lateEntries: number;
  hasCloseout: boolean;
  hasStandup: boolean;
  score: number;
  missingHours: number[];
  streak: number;
}

export function DailyScoreWidget({ orgId }: { orgId: string }) {
  const [data, setData] = useState<DayScore | null>(null);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const currentHour = new Date().getHours();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: entries }, { data: closeout }, { data: standup }, { data: streakData }] = await Promise.all([
        supabase.from("time_entries").select("hour, proof_urls, is_late").eq("user_id", user.id).eq("date", today),
        supabase.from("daily_closeouts").select("id").eq("user_id", user.id).eq("date", today).limit(1).single(),
        supabase.from("standups").select("id").eq("user_id", user.id).eq("date", today).limit(1).single(),
        supabase.from("activity_streaks").select("current_streak").eq("user_id", user.id).eq("org_id", orgId).limit(1).single(),
      ]);

      const loggedHours = new Set(entries?.map((e) => e.hour) ?? []);
      const withProof = entries?.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length ?? 0;
      const late = entries?.filter((e) => e.is_late).length ?? 0;
      const hoursLogged = entries?.length ?? 0;

      const missing = WORK_HOURS.filter((h) => h < currentHour && !loggedHours.has(h));

      // Calculate score
      const hoursRatio = Math.min(hoursLogged / EXPECTED_DAILY_HOURS, 1);
      const proofRatio = hoursLogged > 0 ? withProof / hoursLogged : 0;
      const lateRatio = hoursLogged > 0 ? late / hoursLogged : 0;
      const standupBonus = standup ? 0.05 : 0;
      const closeoutBonus = closeout ? 0.05 : 0;
      const raw = hoursRatio * 0.4 + proofRatio * 0.35 + standupBonus + closeoutBonus - lateRatio * 0.15;
      const score = Math.max(0, Math.min(100, Math.round(raw * 100)));

      setData({
        hoursLogged,
        hoursWithProof: withProof,
        lateEntries: late,
        hasCloseout: !!closeout,
        hasStandup: !!standup,
        score,
        missingHours: missing,
        streak: streakData?.current_streak ?? 0,
      });
    }
    load();

    // Refresh every 60s
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;

  const scoreColor = data.score >= 80 ? "text-green-600" : data.score >= 50 ? "text-yellow-600" : "text-red-600";
  const scoreBg = data.score >= 80 ? "from-green-500/10" : data.score >= 50 ? "from-yellow-500/10" : "from-red-500/10";
  const proofPercent = data.hoursLogged > 0 ? Math.round((data.hoursWithProof / data.hoursLogged) * 100) : 0;

  return (
    <div className={cn("rounded-xl bg-gradient-to-r to-transparent p-4 mb-8 border transition-all duration-300 hover:shadow-lg hover:shadow-primary/5", scoreBg)}>
      <div className="flex items-center gap-6 flex-wrap">
        {/* Score circle */}
        <div className="relative w-16 h-16 shrink-0">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/20" />
            <circle cx="32" cy="32" r="28" fill="none" strokeWidth="4"
              className={scoreColor}
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - data.score / 100)}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn("text-lg font-bold tabular-nums tracking-tight", scoreColor)}>{data.score}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-5 flex-wrap flex-1">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className={cn("text-sm font-semibold tabular-nums tracking-tight",
              data.hoursLogged >= EXPECTED_DAILY_HOURS ? "text-green-600" :
              data.hoursLogged >= 4 ? "text-foreground" : "text-red-600"
            )}>
              {data.hoursLogged}/{EXPECTED_DAILY_HOURS}h
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Shield className={cn("w-4 h-4", proofPercent >= 80 ? "text-green-500" : "text-yellow-500")} />
            <span className="text-sm font-semibold tabular-nums tracking-tight">{proofPercent}%</span>
            <span className="text-[10px] text-muted-foreground">evidencia</span>
          </div>

          {data.streak > 0 && (
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-semibold tabular-nums tracking-tight">{data.streak}d</span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {data.hasStandup ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            )}
            <span className="text-[10px] text-muted-foreground">Standup</span>
          </div>

          <div className="flex items-center gap-1.5">
            {data.hasCloseout ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : currentHour >= 17 ? (
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            ) : (
              <Clock className="w-4 h-4 text-muted-foreground/40" />
            )}
            <span className="text-[10px] text-muted-foreground">Cierre</span>
          </div>
        </div>

        {/* Missing hours nudge */}
        {data.missingHours.length > 0 && data.missingHours.length <= 4 && (
          <div className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/20 px-3 py-1.5 rounded-lg">
            Faltan: {data.missingHours.map((h) => `${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}`).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
