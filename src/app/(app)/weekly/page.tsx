// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { CATEGORIES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Flame,
  Shield,
  Clock,
} from "lucide-react";

interface WeeklyMemberStats {
  profile: Profile;
  totalHours: number;
  totalWithProof: number;
  totalLate: number;
  closeoutDays: number;
  workDays: number;
  avgHoursPerDay: number;
  topCategory: WorkCategory | null;
  topCategoryCount: number;
  streak: number;
  dailyHours: number[];
}

export default function WeeklyPage() {
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    return startOfWeek(now, { weekStartsOn: 1 });
  });
  const [orgId, setOrgId] = useState<string | null>(null);
  const [stats, setStats] = useState<WeeklyMemberStats[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd }).filter(
    (d) => d.getDay() !== 0 && d.getDay() !== 6
  ); // Mon-Fri
  const weekDatesStr = weekDays.map((d) => d.toISOString().split("T")[0]);

  useEffect(() => {
    async function loadOrg() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (membership) setOrgId(membership.org_id);
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId) return;

    async function loadWeeklyStats() {
      setLoading(true);

      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        ;

      if (!members) {
        setLoading(false);
        return;
      }

      // Get entries for the week
      const { data: entries } = await supabase
        .from("time_entries")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", weekDatesStr[0])
        .lte("date", weekDatesStr[weekDatesStr.length - 1]);

      // Get closeouts for the week
      const { data: closeouts } = await supabase
        .from("daily_closeouts")
        .select("user_id, date")
        .eq("org_id", orgId)
        .gte("date", weekDatesStr[0])
        .lte("date", weekDatesStr[weekDatesStr.length - 1]);

      // Get streaks
      const { data: streaks } = await supabase
        .from("activity_streaks")
        .select("user_id, current_streak")
        .eq("org_id", orgId);

      const streakMap = new Map(
        streaks?.map((s) => [s.user_id, s.current_streak]) ?? []
      );

      const weeklyStats: WeeklyMemberStats[] = members.map((m) => {
        const userEntries =
          entries?.filter((e) => e.user_id === m.user_id) ?? [];
        const withProof = userEntries.filter(
          (e) => e.proof_urls && e.proof_urls.length > 0
        );
        const lateOnes = userEntries.filter((e) => e.is_late);
        const userCloseouts =
          closeouts?.filter((c) => c.user_id === m.user_id) ?? [];

        // Daily hours breakdown
        const dailyHours = weekDatesStr.map(
          (d) => userEntries.filter((e) => e.date === d).length
        );

        // Days that have at least 1 entry
        const activeDays = new Set(userEntries.map((e) => e.date)).size;

        // Top category
        const catCounts = new Map<WorkCategory, number>();
        for (const e of userEntries) {
          catCounts.set(
            e.category as WorkCategory,
            (catCounts.get(e.category as WorkCategory) ?? 0) + 1
          );
        }
        let topCat: WorkCategory | null = null;
        let topCount = 0;
        for (const [c, n] of catCounts) {
          if (n > topCount) {
            topCat = c;
            topCount = n;
          }
        }

        return {
          profile: m.profiles,
          totalHours: userEntries.length,
          totalWithProof: withProof.length,
          totalLate: lateOnes.length,
          closeoutDays: userCloseouts.length,
          workDays: activeDays,
          avgHoursPerDay:
            activeDays > 0
              ? Math.round((userEntries.length / activeDays) * 10) / 10
              : 0,
          topCategory: topCat,
          topCategoryCount: topCount,
          streak: streakMap.get(m.user_id) ?? 0,
          dailyHours,
        };
      });

      weeklyStats.sort((a, b) => b.totalHours - a.totalHours);
      setStats(weeklyStats);
      setLoading(false);
    }

    loadWeeklyStats();
  }, [orgId, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM yyyy", { locale: es })}`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <BarChart3 className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Resumen Semanal</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6 capitalize">{weekLabel}</p>

      {/* Week nav */}
      <div className="flex items-center gap-2 mb-8 bg-card/80 border border-border/50 rounded-2xl p-2 w-fit">
        <Button
          variant="outline"
          size="icon"
          className="rounded-xl"
          onClick={() => setWeekStart(subDays(weekStart, 7))}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
        >
          Esta semana
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-xl"
          onClick={() => {
            const next = new Date(weekStart);
            next.setDate(next.getDate() + 7);
            setWeekStart(next);
          }}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stats.map((s) => {
            const expectedWeeklyHours = weekDatesStr.length * EXPECTED_DAILY_HOURS;
            const proofPercent =
              s.totalHours > 0
                ? Math.round((s.totalWithProof / s.totalHours) * 100)
                : 0;
            const hoursPercent = Math.round(
              (s.totalHours / expectedWeeklyHours) * 100
            );

            return (
              <Card key={s.profile.id} className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-12 h-12 ring-2 ring-background shadow-sm">
                      <AvatarImage src={s.profile.avatar_url ?? undefined} />
                      <AvatarFallback>{getInitials(s.profile.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">
                        {s.profile.full_name ?? s.profile.email}
                      </h3>
                      {s.profile.role && (
                        <p className="text-xs text-muted-foreground">{s.profile.role}</p>
                      )}
                    </div>
                    {s.streak > 0 && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Flame className="w-3 h-3 text-orange-500" />
                        {s.streak} dias
                      </Badge>
                    )}
                  </div>

                  {/* Weekly stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                    <div className="text-center p-2 bg-accent/40 rounded-xl">
                      <p
                        className={cn(
                          "text-lg font-bold",
                          hoursPercent >= 80
                            ? "text-green-600"
                            : hoursPercent >= 50
                              ? "text-yellow-600"
                              : "text-red-600"
                        )}
                      >
                        {s.totalHours}h
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        de {expectedWeeklyHours}h ({hoursPercent}%)
                      </p>
                    </div>

                    <div className="text-center p-2 bg-accent/40 rounded-xl">
                      <p
                        className={cn(
                          "text-lg font-bold",
                          proofPercent >= 80
                            ? "text-green-600"
                            : proofPercent >= 50
                              ? "text-yellow-600"
                              : "text-red-600"
                        )}
                      >
                        {proofPercent}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        <Shield className="w-3 h-3 inline" /> Evidencia
                      </p>
                    </div>

                    <div className="text-center p-2 bg-accent/40 rounded-xl">
                      <p className="text-lg font-bold">{s.avgHoursPerDay}</p>
                      <p className="text-[10px] text-muted-foreground">h/dia promedio</p>
                    </div>

                    <div className="text-center p-2 bg-accent/40 rounded-xl">
                      <p
                        className={cn(
                          "text-lg font-bold",
                          s.totalLate === 0 ? "text-green-600" : "text-orange-600"
                        )}
                      >
                        {s.totalLate}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        <Clock className="w-3 h-3 inline" /> Tardias
                      </p>
                    </div>

                    <div className="text-center p-2 bg-accent/40 rounded-xl">
                      <p className="text-lg font-bold">
                        {s.closeoutDays}/{weekDatesStr.length}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Cierres</p>
                    </div>
                  </div>

                  {/* Daily mini-chart */}
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-2">Horas por dia</p>
                    <div className="flex items-end gap-1 h-16">
                      {weekDatesStr.map((d, i) => {
                        const h = s.dailyHours[i];
                        const pct = Math.min((h / EXPECTED_DAILY_HOURS) * 100, 100);
                        const dayLabel = format(new Date(d + "T12:00:00"), "EEE", {
                          locale: es,
                        });
                        return (
                          <div key={d} className="flex-1 flex flex-col items-center gap-1">
                            <div
                              className={cn(
                                "w-full rounded-t-lg transition-all duration-500",
                                h >= EXPECTED_DAILY_HOURS
                                  ? "bg-gradient-to-t from-green-500 to-emerald-400"
                                  : h >= 4
                                    ? "bg-gradient-to-t from-yellow-500 to-amber-400"
                                    : h > 0
                                      ? "bg-gradient-to-t from-red-500 to-red-400"
                                      : "bg-muted"
                              )}
                              style={{ height: `${Math.max(pct, 4)}%` }}
                              title={`${h}h`}
                            />
                            <span className="text-[9px] text-muted-foreground">
                              {dayLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Top category */}
                  {s.topCategory && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Principal:</span>
                      <Badge variant="secondary" className="text-xs">
                        {CATEGORIES[s.topCategory].emoji}{" "}
                        {CATEGORIES[s.topCategory].label} ({s.topCategoryCount}h)
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
