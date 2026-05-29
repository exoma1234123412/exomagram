"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Flame, Skull, Trophy, Shield, Clock } from "lucide-react";

const MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

function getNextMilestone(current: number) {
  return MILESTONES.find((m) => m > current) ?? current + 50;
}

function getTimeToMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(23, 59, 59, 999);
  const diff = midnight.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { hours, minutes, seconds, totalMinutes: hours * 60 + minutes };
}

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  hasLoggedToday: boolean;
  teamAvgStreak: number;
  teamMaxStreak: number;
}

export function StreakDanger({ orgId }: { orgId: string }) {
  const [data, setData] = useState<StreakData | null>(null);
  const [countdown, setCountdown] = useState(getTimeToMidnight());
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: streak }, { data: todayEntries }, { data: teamStreaks }] = await Promise.all([
        supabase.from("activity_streaks").select("current_streak, longest_streak")
          .eq("user_id", user.id).eq("org_id", orgId).single(),
        supabase.from("time_entries").select("id")
          .eq("user_id", user.id).eq("date", today).limit(1),
        supabase.from("activity_streaks").select("current_streak")
          .eq("org_id", orgId),
      ]);

      const streaks = teamStreaks?.map((s) => s.current_streak) ?? [];
      const avg = streaks.length > 0 ? Math.round(streaks.reduce((a, b) => a + b, 0) / streaks.length) : 0;
      const max = streaks.length > 0 ? Math.max(...streaks) : 0;

      setData({
        currentStreak: streak?.current_streak ?? 0,
        longestStreak: streak?.longest_streak ?? 0,
        hasLoggedToday: (todayEntries?.length ?? 0) > 0,
        teamAvgStreak: avg,
        teamMaxStreak: max,
      });
    }
    load();
  }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer — ticks every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getTimeToMidnight());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!data || data.currentStreak === 0) return null;

  const nextMilestone = getNextMilestone(data.currentStreak);
  const daysToMilestone = nextMilestone - data.currentStreak;
  const isDanger = !data.hasLoggedToday;
  const isCritical = isDanger && countdown.totalMinutes < 120; // < 2 hours
  const isUrgent = isDanger && countdown.totalMinutes < 60; // < 1 hour

  // Streak tier for visual intensity
  const streakTier = data.currentStreak >= 30 ? "legendary" :
    data.currentStreak >= 14 ? "epic" :
    data.currentStreak >= 7 ? "rare" : "common";

  const tierConfig = {
    legendary: { label: "LEGENDARIO", bg: "from-amber-500/20 to-orange-500/20", border: "border-amber-500/40", text: "text-amber-500" },
    epic: { label: "ÉPICO", bg: "from-purple-500/15 to-pink-500/15", border: "border-purple-500/30", text: "text-purple-400" },
    rare: { label: "EN FUEGO", bg: "from-orange-500/15 to-red-500/15", border: "border-orange-500/30", text: "text-orange-500" },
    common: { label: "ACTIVO", bg: "from-blue-500/10 to-cyan-500/10", border: "border-blue-500/20", text: "text-blue-500" },
  };

  const tier = tierConfig[streakTier];

  return (
    <div className={cn(
      "rounded-xl border p-4 mb-8 transition-all duration-300",
      isDanger
        ? "bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/30"
        : `bg-gradient-to-r ${tier.bg} ${tier.border}`,
      isCritical && "animate-danger-pulse",
      isUrgent && "animate-danger-shake"
    )}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "text-2xl",
            data.currentStreak >= 7 && "animate-streak-fire"
          )}>
            🔥
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("text-2xl font-black tabular-nums tracking-tight",
                isDanger ? "text-red-500" : tier.text
              )}>
                {data.currentStreak}
              </span>
              <span className="text-sm font-semibold text-muted-foreground">días</span>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                isDanger
                  ? "bg-red-500/20 text-red-500"
                  : `bg-${streakTier === "legendary" ? "amber" : streakTier === "epic" ? "purple" : streakTier === "rare" ? "orange" : "blue"}-500/20 ${tier.text}`
              )}>
                {isDanger ? "EN PELIGRO" : tier.label}
              </span>
            </div>
            {data.currentStreak > data.teamAvgStreak && (
              <p className="text-[10px] text-muted-foreground">
                {data.currentStreak - data.teamAvgStreak}d por encima del promedio del equipo
              </p>
            )}
          </div>
        </div>

        {/* Next milestone */}
        <div className="text-right">
          <div className="flex items-center gap-1 justify-end">
            <Trophy className={cn("w-3.5 h-3.5", tier.text)} />
            <span className="text-xs font-semibold tabular-nums">{nextMilestone}d</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            faltan {daysToMilestone}d
          </p>
        </div>
      </div>

      {/* Progress to next milestone */}
      <div className="h-1.5 bg-muted/30 rounded-full mb-3 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-1000",
            isDanger
              ? "bg-gradient-to-r from-red-500 to-orange-500"
              : "bg-gradient-to-r from-blue-500 to-blue-600"
          )}
          style={{ width: `${Math.min(100, ((data.currentStreak % (nextMilestone - (MILESTONES[MILESTONES.indexOf(nextMilestone) - 1] ?? 0))) / daysToMilestone) * 100)}%` }}
        />
      </div>

      {/* Danger zone — countdown to streak death */}
      {isDanger && (
        <div className={cn(
          "rounded-lg p-3 mt-1",
          isCritical
            ? "bg-red-500/15 dark:bg-red-950/40"
            : "bg-yellow-500/10 dark:bg-yellow-950/30"
        )}>
          <div className="flex items-center gap-2 mb-1.5">
            {isCritical ? (
              <Skull className="w-4 h-4 text-red-500 animate-countdown-tick" />
            ) : (
              <Clock className="w-4 h-4 text-yellow-600" />
            )}
            <span className={cn(
              "text-xs font-bold uppercase tracking-wider",
              isCritical ? "text-red-500" : "text-yellow-700 dark:text-yellow-400"
            )}>
              {isCritical ? "RACHA EN PELIGRO CRÍTICO" : "Tu racha muere hoy"}
            </span>
          </div>

          {/* Countdown timer */}
          <div className="flex items-baseline gap-1 mb-2">
            <span className={cn(
              "text-3xl font-black tabular-nums tracking-tight",
              isCritical ? "text-red-500 animate-countdown-tick" : "text-yellow-600 dark:text-yellow-400"
            )}>
              {String(countdown.hours).padStart(2, "0")}:{String(countdown.minutes).padStart(2, "0")}:{String(countdown.seconds).padStart(2, "0")}
            </span>
            <span className={cn(
              "text-xs font-medium",
              isCritical ? "text-red-400" : "text-yellow-600/70"
            )}>
              para registrar
            </span>
          </div>

          {/* Guilt messaging */}
          <p className={cn(
            "text-xs",
            isCritical ? "text-red-400" : "text-yellow-700/70 dark:text-yellow-400/70"
          )}>
            {data.currentStreak >= 30
              ? `Si pierdes tu racha de ${data.currentStreak} días, te tomará MÁS DE UN MES reconstruirla.`
              : data.currentStreak >= 14
              ? `${data.currentStreak} días de trabajo tirados a la basura. ¿De verdad vas a dejar que pase?`
              : data.currentStreak >= 7
              ? `Llevas ${data.currentStreak} días. No lo arruines ahora.`
              : `Registra al menos una hora para mantener tu racha.`
            }
          </p>

          {/* Social comparison knife twist */}
          {data.teamMaxStreak > data.currentStreak && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              La racha más alta del equipo es {data.teamMaxStreak}d. {data.currentStreak >= data.teamAvgStreak ? "Estás por encima del promedio — no caigas." : `Estás ${data.teamAvgStreak - data.currentStreak}d debajo del promedio.`}
            </p>
          )}
        </div>
      )}

      {/* Safe state — still applies pressure */}
      {!isDanger && data.currentStreak >= 7 && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Shield className="w-3.5 h-3.5 text-green-500" />
          <span>Racha protegida hoy — ya registraste. No pierdas el ritmo mañana.</span>
        </div>
      )}
    </div>
  );
}
