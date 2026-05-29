"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Profile } from "@/lib/types/database";
import { CATEGORIES, WORK_HOURS, CATEGORY_COLORS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { Clock, Flame, TrendingUp, Calendar, Shield, Award, Dna, Zap, GitGraph } from "lucide-react";
import { ACHIEVEMENTS } from "@/lib/constants";
import { WorkDNA } from "@/components/profile/work-dna";
import { EnergyForecast } from "@/components/profile/energy-forecast";
import { ContributionGraph } from "@/components/profile/contribution-graph";

export default function ProfilePage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamAvg, setTeamAvg] = useState<{ proofPercent: number; hoursPerDay: number; latePercent: number } | null>(null);
  const [userComparative, setUserComparative] = useState<{ proofPercent: number; hoursPerDay: number; latePercent: number } | null>(null);
  const [achievements, setAchievements] = useState<string[]>([]);
  const [streak, setStreak] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    if (orgLoading) return;
    if (!userId) { setLoading(false); return; }

    async function load() {
      const [{ data: profileData }, { data: entryData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId!).single(),
        supabase
          .from("time_entries")
          .select("*")
          .eq("user_id", userId!)
          .order("date", { ascending: false })
          .order("hour", { ascending: false })
          .limit(200),
      ]);

      setProfile(profileData);
      setEntries(entryData ?? []);

      if (orgId) {
        // Get team entries for last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split("T")[0];

        const [{ data: teamEntries }, { data: streakData }, { data: achievementData }] = await Promise.all([
          supabase
            .from("time_entries")
            .select("user_id, proof_urls, is_late, date")
            .eq("org_id", orgId)
            .gte("date", startDate),
          supabase
            .from("activity_streaks")
            .select("current_streak")
            .eq("user_id", userId!)
            .eq("org_id", orgId)
            .limit(1)
            .single(),
          supabase
            .from("achievements")
            .select("achievement_type")
            .eq("user_id", userId!)
            .eq("org_id", orgId),
        ]);

        setStreak(streakData?.current_streak ?? 0);
        setAchievements(achievementData?.map((a) => a.achievement_type) ?? []);

        if (teamEntries && teamEntries.length > 0) {
          // Team averages
          const teamWithProof = teamEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
          const teamLate = teamEntries.filter((e) => e.is_late);
          const teamDates = new Set(teamEntries.map((e) => e.date));
          const teamMembers = new Set(teamEntries.map((e) => e.user_id));
          const teamAvgHours = teamDates.size > 0 && teamMembers.size > 0
            ? Math.round((teamEntries.length / teamDates.size / teamMembers.size) * 10) / 10
            : 0;

          setTeamAvg({
            proofPercent: Math.round((teamWithProof.length / teamEntries.length) * 100),
            hoursPerDay: teamAvgHours,
            latePercent: Math.round((teamLate.length / teamEntries.length) * 100),
          });

          // User's own stats
          const myEntries = teamEntries.filter((e) => e.user_id === userId);
          if (myEntries.length > 0) {
            const myWithProof = myEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
            const myLate = myEntries.filter((e) => e.is_late);
            const myDates = new Set(myEntries.map((e) => e.date));
            setUserComparative({
              proofPercent: Math.round((myWithProof.length / myEntries.length) * 100),
              hoursPerDay: myDates.size > 0 ? Math.round((myEntries.length / myDates.size) * 10) / 10 : 0,
              latePercent: Math.round((myLate.length / myEntries.length) * 100),
            });
          }
        }
      }

      setLoading(false);
    }
    load();
  }, [orgLoading, orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">No se encontró el perfil.</p>
      </div>
    );
  }

  // Stats
  const totalHours = entries.length;
  const categoryCount = new Map<WorkCategory, number>();
  const hourCount = new Map<number, number>();
  let totalMood = 0;
  let moodEntries = 0;
  let totalEnergy = 0;
  let energyEntries = 0;
  const dateCounts = new Map<string, number>();

  for (const entry of entries) {
    categoryCount.set(
      entry.category,
      (categoryCount.get(entry.category) ?? 0) + 1
    );
    hourCount.set(entry.hour, (hourCount.get(entry.hour) ?? 0) + 1);
    if (entry.mood) {
      totalMood += entry.mood;
      moodEntries++;
    }
    if (entry.energy) {
      totalEnergy += entry.energy;
      energyEntries++;
    }
    dateCounts.set(entry.date, (dateCounts.get(entry.date) ?? 0) + 1);
  }

  const avgMood = moodEntries > 0 ? (totalMood / moodEntries).toFixed(1) : "-";
  const avgEnergy =
    energyEntries > 0 ? (totalEnergy / energyEntries).toFixed(1) : "-";
  const daysActive = dateCounts.size;

  // Most productive hour
  let peakHour = 9;
  let peakCount = 0;
  for (const [h, c] of hourCount) {
    if (c > peakCount) {
      peakHour = h;
      peakCount = c;
    }
  }
  const peakHourLabel = `${peakHour > 12 ? peakHour - 12 : peakHour}:00 ${peakHour >= 12 ? "PM" : "AM"}`;

  // Category breakdown sorted
  const categoryBreakdown = Array.from(categoryCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({
      category: cat,
      count,
      percent: Math.round((count / totalHours) * 100),
    }));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Profile header */}
      <div className="flex items-center gap-5 mb-10">
        <Avatar className="w-20 h-20 ring-4 ring-primary/10 shadow-xl shadow-primary/10">
          <AvatarImage src={profile.avatar_url ?? undefined} />
          <AvatarFallback className="text-xl font-bold bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/40 dark:to-sky-900/30">
            {getInitials(profile.full_name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {profile.full_name ?? profile.email}
          </h1>
          {profile.role && (
            <p className="text-muted-foreground font-medium mt-0.5">{profile.role}</p>
          )}
          <p className="text-xs text-muted-foreground/50 mt-0.5">{profile.timezone}</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Card className="overflow-hidden relative hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <CardContent className="p-4 text-center relative">
            <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center mx-auto mb-2">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight">{totalHours}</p>
            <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Horas registradas</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden relative hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent" />
          <CardContent className="p-4 text-center relative">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-2">
              <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight">{daysActive}</p>
            <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Días activos</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden relative hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent" />
          <CardContent className="p-4 text-center relative">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight">{avgMood}</p>
            <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Ánimo promedio</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden relative hover:shadow-lg hover:shadow-amber-500/5 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent" />
          <CardContent className="p-4 text-center relative">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-2">
              <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight">{peakHourLabel}</p>
            <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Hora pico</p>
          </CardContent>
        </Card>
      </div>

      {/* Streak & Achievements */}
      {(streak > 0 || achievements.length > 0) && (
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-500" />
              Logros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {streak > 0 && (
                <Badge variant="outline" className="text-sm gap-1 py-1.5 px-3">
                  <Flame className="w-4 h-4 text-orange-500" />
                  {streak} dias de racha
                </Badge>
              )}
              {achievements.map((type) => {
                const ach = ACHIEVEMENTS[type];
                if (!ach) return null;
                return (
                  <Badge key={type} variant="outline" className="text-sm gap-1 py-1.5 px-3" title={ach.description}>
                    <span>{ach.emoji}</span>
                    {ach.label}
                  </Badge>
                );
              })}
              {achievements.length === 0 && streak === 0 && (
                <p className="text-sm text-muted-foreground">Registra horas para desbloquear logros.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparative View - You vs Team */}
      {teamAvg && userComparative && (
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Tu vs Equipo (30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  <Shield className="w-3 h-3 inline" /> Evidencia
                </p>
                <p className={cn(
                  "text-lg font-bold",
                  userComparative.proofPercent >= teamAvg.proofPercent ? "text-green-600" : "text-red-600"
                )}>
                  {userComparative.proofPercent}%
                </p>
                <p className="text-[10px] text-muted-foreground">
                  equipo: {teamAvg.proofPercent}%
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  <Clock className="w-3 h-3 inline" /> h/dia
                </p>
                <p className={cn(
                  "text-lg font-bold",
                  userComparative.hoursPerDay >= teamAvg.hoursPerDay ? "text-green-600" : "text-yellow-600"
                )}>
                  {userComparative.hoursPerDay}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  equipo: {teamAvg.hoursPerDay}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  Tardias
                </p>
                <p className={cn(
                  "text-lg font-bold",
                  userComparative.latePercent <= teamAvg.latePercent ? "text-green-600" : "text-orange-600"
                )}>
                  {userComparative.latePercent}%
                </p>
                <p className="text-[10px] text-muted-foreground">
                  equipo: {teamAvg.latePercent}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category breakdown */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Distribución de trabajo</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryBreakdown.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aún no hay datos. Empieza a registrar horas.
            </p>
          ) : (
            <div className="space-y-3">
              {categoryBreakdown.map(({ category, count, percent }) => (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span>{CATEGORIES[category].emoji}</span>
                      <span className="font-medium">
                        {CATEGORIES[category].label}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {count}h ({percent}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
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

      {/* Hour heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Actividad por hora</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1.5 flex-wrap">
            {WORK_HOURS.map((h) => {
              const count = hourCount.get(h) ?? 0;
              const maxCount = Math.max(...Array.from(hourCount.values()), 1);
              const intensity = count / maxCount;
              return (
                <div key={h} className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center text-xs font-semibold tabular-nums transition-all duration-300",
                      intensity === 0
                        ? "bg-muted/30 text-muted-foreground/40"
                        : intensity < 0.33
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                        : intensity < 0.66
                        ? "bg-blue-300 dark:bg-blue-700/60 text-blue-900 dark:text-blue-100"
                        : "bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-sm shadow-blue-600/20"
                    )}
                  >
                    {count}
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 font-medium">
                    {h > 12 ? h - 12 : h}
                    {h >= 12 ? "p" : "a"}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Contribution Graph */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <GitGraph className="w-5 h-5 text-green-500" />
            Actividad (6 meses)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ContributionGraph entries={entries} />
        </CardContent>
      </Card>

      {/* Work DNA */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Dna className="w-5 h-5 text-primary" />
            Work DNA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WorkDNA entries={entries} />
        </CardContent>
      </Card>

      {/* Energy Forecast */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Pronóstico de Energía
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EnergyForecast entries={entries} />
        </CardContent>
      </Card>
    </div>
  );
}
