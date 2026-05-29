"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { Profile } from "@/lib/types/database";
import { CATEGORIES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import { subDays } from "date-fns";
import {
  Trophy,
  Medal,
  Shield,
  Flame,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { StreakLeaderboard } from "@/components/leaderboard/streak-leaderboard";

interface MemberRank {
  profile: Profile;
  trustScore: number;
  totalHours: number;
  proofPercent: number;
  streak: number;
  topCategory: WorkCategory | null;
  latePercent: number;
  closeoutPercent: number;
}

export default function LeaderboardPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const supabase = createClient();
  const [rankings, setRankings] = useState<MemberRank[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<7 | 14 | 30>(7);

  useEffect(() => {
    if (!orgId) return;

    async function load() {
      setLoading(true);

      const endDate = new Date().toISOString().split("T")[0];
      const startDate = subDays(new Date(), period).toISOString().split("T")[0];

      // Get members
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        ;

      if (!members) { setLoading(false); return; }

      // Get entries for period
      const { data: entries } = await supabase
        .from("time_entries")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", startDate)
        .lte("date", endDate);

      // Get closeouts
      const { data: closeouts } = await supabase
        .from("daily_closeouts")
        .select("user_id, date")
        .eq("org_id", orgId)
        .gte("date", startDate)
        .lte("date", endDate);

      // Get streaks
      const { data: streaks } = await supabase
        .from("activity_streaks")
        .select("user_id, current_streak")
        .eq("org_id", orgId);

      const streakMap = new Map<string, number>();
      for (const s of streaks ?? []) {
        streakMap.set(s.user_id, s.current_streak);
      }

      const closeoutMap = new Map<string, number>();
      for (const c of closeouts ?? []) {
        closeoutMap.set(c.user_id, (closeoutMap.get(c.user_id) ?? 0) + 1);
      }

      const workdays = Math.min(period, 5 * Math.ceil(period / 7)); // rough weekdays

      const ranks: MemberRank[] = members.map((m) => {
        const userEntries = (entries ?? []).filter((e) => e.user_id === m.user_id);
        const withProof = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
        const lateOnes = userEntries.filter((e) => e.is_late);
        const totalHours = userEntries.length;
        const proofPercent = totalHours > 0 ? Math.round((withProof.length / totalHours) * 100) : 0;
        const latePercent = totalHours > 0 ? Math.round((lateOnes.length / totalHours) * 100) : 0;
        const closeoutCount = closeoutMap.get(m.user_id) ?? 0;
        const closeoutPercent = workdays > 0 ? Math.round((closeoutCount / workdays) * 100) : 0;

        // Top category
        const catCounts = new Map<WorkCategory, number>();
        for (const e of userEntries) {
          catCounts.set(e.category as WorkCategory, (catCounts.get(e.category as WorkCategory) ?? 0) + 1);
        }
        let topCat: WorkCategory | null = null;
        let topCount = 0;
        for (const [c, n] of catCounts) {
          if (n > topCount) { topCat = c; topCount = n; }
        }

        // Trust score
        const expectedHours = workdays * EXPECTED_DAILY_HOURS;
        const hoursRatio = expectedHours > 0 ? Math.min(totalHours / expectedHours, 1) : 0;
        const proofRatio = proofPercent / 100;
        const lateRatio = latePercent / 100;
        const closeoutRatio = closeoutPercent / 100;

        const raw = hoursRatio * 0.3 + proofRatio * 0.3 + closeoutRatio * 0.2 - lateRatio * 0.2;
        const trustScore = Math.max(0, Math.min(100, Math.round(raw * 100)));

        return {
          profile: m.profiles,
          trustScore,
          totalHours,
          proofPercent,
          streak: streakMap.get(m.user_id) ?? 0,
          topCategory: topCat,
          latePercent,
          closeoutPercent,
        };
      });

      ranks.sort((a, b) => b.trustScore - a.trustScore);
      setRankings(ranks);
      setLoading(false);
    }
    load();
  }, [orgId, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const medalIcons = [
    <Trophy key="1" className="w-5 h-5 text-yellow-500" />,
    <Medal key="2" className="w-5 h-5 text-gray-400" />,
    <Medal key="3" className="w-5 h-5 text-amber-700" />,
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            Leaderboard
          </h1>
          <p className="text-muted-foreground text-sm">
            Ranking de transparencia y accountability del equipo
          </p>
        </div>
        <div className="flex gap-1">
          {([7, 14, 30] as const).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              className={period === p ? "rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0" : "rounded-xl"}
              onClick={() => setPeriod(p)}
            >
              {p}d
            </Button>
          ))}
        </div>
      </div>

      {orgLoading || loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rankings.map((r, index) => (
            <Card key={r.profile.id} className={cn(
              "transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5",
              index === 0 && "border-yellow-300/60 dark:border-yellow-700/40 shadow-xl shadow-yellow-500/10 ring-1 ring-yellow-300/30",
              r.trustScore < 40 && "border-red-200 dark:border-red-900"
            )}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Rank */}
                  <div className="w-10 text-center">
                    {index < 3 ? (
                      medalIcons[index]
                    ) : (
                      <span className="text-lg font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                    )}
                  </div>

                  {/* Avatar */}
                  <Avatar className="w-10 h-10 ring-2 ring-background shadow-sm">
                    <AvatarImage src={r.profile.avatar_url ?? undefined} />
                    <AvatarFallback>{getInitials(r.profile.full_name)}</AvatarFallback>
                  </Avatar>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">
                        {r.profile.full_name ?? r.profile.email}
                      </h3>
                      {r.streak > 2 && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Flame className="w-3 h-3 text-orange-500" />
                          {r.streak}d racha
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{r.totalHours}h registradas</span>
                      <span className={cn(
                        r.proofPercent >= 80 ? "text-green-600" : r.proofPercent >= 50 ? "text-yellow-600" : "text-red-600"
                      )}>
                        <Shield className="w-3 h-3 inline mr-0.5" />
                        {r.proofPercent}% evidencia
                      </span>
                      <span className={cn(
                        r.latePercent <= 10 ? "text-green-600" : "text-orange-600"
                      )}>
                        {r.latePercent}% tardías
                      </span>
                      {r.topCategory && (
                        <span>{CATEGORIES[r.topCategory].emoji} {CATEGORIES[r.topCategory].label}</span>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-center min-w-[70px]">
                    <p className={cn(
                      "text-2xl font-bold tabular-nums tracking-tight",
                      r.trustScore >= 80 ? "text-green-600" :
                      r.trustScore >= 60 ? "text-blue-600" :
                      r.trustScore >= 40 ? "text-yellow-600" : "text-red-600"
                    )}>
                      {r.trustScore}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Trust</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Streak Leaderboard */}
          {orgId && (
            <div className="mt-8">
              <StreakLeaderboard orgId={orgId} />
            </div>
          )}

          {rankings.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                <Trophy className="w-7 h-7 text-primary/40" />
              </div>
              <p className="text-sm text-muted-foreground">No hay datos para este período.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
