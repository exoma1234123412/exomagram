"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { Flame, Trophy, Zap, Crown } from "lucide-react";

interface StreakEntry {
  profile: Profile;
  currentStreak: number;
  longestStreak: number;
  totalDays: number;
}

function getStreakTitle(streak: number): { title: string; emoji: string; color: string } {
  if (streak >= 100) return { title: "Leyenda", emoji: "👑", color: "text-yellow-500" };
  if (streak >= 60) return { title: "Imparable", emoji: "💎", color: "text-cyan-500" };
  if (streak >= 30) return { title: "Legendario", emoji: "🔥", color: "text-orange-500" };
  if (streak >= 14) return { title: "En fuego", emoji: "⚡", color: "text-yellow-600" };
  if (streak >= 7) return { title: "Consistente", emoji: "🌟", color: "text-blue-500" };
  if (streak >= 3) return { title: "Iniciando", emoji: "🌱", color: "text-green-500" };
  return { title: "Sin racha", emoji: "💤", color: "text-muted-foreground" };
}

export function StreakLeaderboard({ orgId }: { orgId: string }) {
  const [entries, setEntries] = useState<StreakEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        ;

      const { data: streaks } = await supabase
        .from("activity_streaks")
        .select("user_id, current_streak, longest_streak, total_days_logged")
        .eq("org_id", orgId);

      if (!members) { setLoading(false); return; }

      const streakMap = new Map<string, { current_streak: number; longest_streak: number; total_days_logged: number }>(
        streaks?.map((s) => [s.user_id, s as { current_streak: number; longest_streak: number; total_days_logged: number }]) ?? []
      );

      const result: StreakEntry[] = members
        .map((m) => {
          const s = streakMap.get(m.user_id);
          return {
            profile: m.profiles as unknown as Profile,
            currentStreak: s?.current_streak ?? 0,
            longestStreak: s?.longest_streak ?? 0,
            totalDays: s?.total_days_logged ?? 0,
          };
        })
        .sort((a, b) => b.currentStreak - a.currentStreak);

      setEntries(result);
      setLoading(false);
    }
    load();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return null;

  const topStreak = entries[0]?.currentStreak ?? 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-500" />
          Streak Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {entries.map((e, i) => {
            const streakInfo = getStreakTitle(e.currentStreak);
            const isTop = i === 0 && e.currentStreak > 0;
            const barWidth = topStreak > 0 ? (e.currentStreak / topStreak) * 100 : 0;

            return (
              <div
                key={e.profile.id}
                className={cn(
                  "relative flex items-center gap-3 p-2.5 rounded-xl transition-all duration-500",
                  isTop && "bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-950/20 dark:to-yellow-950/20 border border-orange-200/50 dark:border-orange-800/50"
                )}
              >
                {/* Animated bar background */}
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-xl bg-orange-100/50 dark:bg-orange-900/10 transition-all duration-1000 ease-out"
                  style={{ width: `${barWidth}%` }}
                />

                <span className="relative text-sm font-bold text-muted-foreground w-6 text-center">
                  {i === 0 && e.currentStreak > 0 ? (
                    <Crown className="w-4 h-4 text-yellow-500 mx-auto" />
                  ) : (
                    i + 1
                  )}
                </span>

                <Avatar className="relative w-8 h-8">
                  <AvatarImage src={e.profile.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px]">{getInitials(e.profile.full_name)}</AvatarFallback>
                </Avatar>

                <div className="relative flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {e.profile.full_name ?? e.profile.email}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>Record: {e.longestStreak}d</span>
                    <span>Total: {e.totalDays}d</span>
                  </div>
                </div>

                <div className="relative flex items-center gap-1.5">
                  <span className="text-sm">{streakInfo.emoji}</span>
                  <div className="text-right">
                    <p className={cn("text-lg font-bold tabular-nums", e.currentStreak > 0 ? "text-orange-600" : "text-muted-foreground")}>
                      {e.currentStreak}
                    </p>
                    <p className={cn("text-[9px] font-medium", streakInfo.color)}>
                      {streakInfo.title}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
