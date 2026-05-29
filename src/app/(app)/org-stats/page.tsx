// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, EXPECTED_DAILY_HOURS, WORK_HOURS, CATEGORY_COLORS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { subDays } from "date-fns";
import {
  Building2,
  Users,
  Clock,
  Shield,
  TrendingUp,
  AlertTriangle,
  Flame,
  Trophy,
} from "lucide-react";
import { DriftDetection } from "@/components/org/drift-detection";
import { MeetingTax } from "@/components/org/meeting-tax";
import { AntiPatterns } from "@/components/org/anti-patterns";
import { TimezoneOverlap } from "@/components/org/timezone-overlap";

export default function OrgStatsPage() {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const [avgProofPercent, setAvgProofPercent] = useState(0);
  const [avgTrustScore, setAvgTrustScore] = useState(0);
  const [totalFlags, setTotalFlags] = useState(0);
  const [unresolvedFlags, setUnresolvedFlags] = useState(0);
  const [avgStreak, setAvgStreak] = useState(0);
  const [categoryDistribution, setCategoryDistribution] = useState<{ category: WorkCategory; hours: number; percent: number }[]>([]);
  const [hourDistribution, setHourDistribution] = useState<Map<number, number>>(new Map());
  const [topContributors, setTopContributors] = useState<{ name: string; hours: number }[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!membership) { setLoading(false); return; }
      const orgId = membership.org_id;
      setOrgId(orgId);

      const startDate = subDays(new Date(), days).toISOString().split("T")[0];

      const [
        { data: org },
        { data: members },
        { data: entries },
        { data: scores },
        { data: flags },
        { data: streaks },
      ] = await Promise.all([
        supabase.from("organizations").select("name").eq("id", orgId).single(),
        supabase.from("org_members").select("user_id, profiles(full_name)").eq("org_id", orgId)
          ,
        supabase.from("time_entries").select("*").eq("org_id", orgId).gte("date", startDate),
        supabase.from("trust_score_history").select("score").eq("org_id", orgId).gte("date", startDate),
        supabase.from("accountability_flags").select("resolved").eq("org_id", orgId).gte("date", startDate),
        supabase.from("activity_streaks").select("current_streak").eq("org_id", orgId),
      ]);

      setOrgName((org as { name: string })?.name ?? "");
      setMemberCount(members?.length ?? 0);

      const allEntries = entries ?? [];
      setTotalHours(allEntries.length);

      const withProof = allEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
      setAvgProofPercent(allEntries.length > 0 ? Math.round((withProof.length / allEntries.length) * 100) : 0);

      const allScores = scores ?? [];
      setAvgTrustScore(allScores.length > 0 ? Math.round(allScores.reduce((s, x) => s + x.score, 0) / allScores.length) : 0);

      const allFlags = flags ?? [];
      setTotalFlags(allFlags.length);
      setUnresolvedFlags(allFlags.filter((f) => !f.resolved).length);

      const allStreaks = streaks ?? [];
      setAvgStreak(allStreaks.length > 0 ? Math.round(allStreaks.reduce((s, x) => s + x.current_streak, 0) / allStreaks.length) : 0);

      // Category distribution
      const catCounts = new Map<WorkCategory, number>();
      const hourCounts = new Map<number, number>();
      const userHours = new Map<string, number>();

      for (const e of allEntries) {
        catCounts.set(e.category as WorkCategory, (catCounts.get(e.category as WorkCategory) ?? 0) + 1);
        hourCounts.set(e.hour, (hourCounts.get(e.hour) ?? 0) + 1);
        userHours.set(e.user_id, (userHours.get(e.user_id) ?? 0) + 1);
      }

      setCategoryDistribution(
        Array.from(catCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([cat, hours]) => ({
            category: cat,
            hours,
            percent: Math.round((hours / allEntries.length) * 100),
          }))
      );
      setHourDistribution(hourCounts);

      // Top contributors
      const memberMap = new Map(members?.map((m) => [m.user_id, m.profiles?.full_name ?? "?"]) ?? []);
      setTopContributors(
        Array.from(userHours.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([uid, hours]) => ({ name: memberMap.get(uid) ?? "?", hours }))
      );

      setLoading(false);
    }
    load();
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            {orgName || "Organizacion"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Metricas del equipo ({memberCount} miembros)
          </p>
        </div>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="w-4 h-4 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold tabular-nums tracking-tight">{totalHours}h</p>
            <p className="text-[10px] text-muted-foreground">Horas totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Shield className="w-4 h-4 mx-auto text-green-500 mb-1" />
            <p className={cn("text-2xl font-bold tabular-nums tracking-tight", avgProofPercent >= 70 ? "text-green-600" : avgProofPercent >= 40 ? "text-yellow-600" : "text-red-600")}>
              {avgProofPercent}%
            </p>
            <p className="text-[10px] text-muted-foreground">Evidencia</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="w-4 h-4 mx-auto text-blue-500 mb-1" />
            <p className={cn("text-2xl font-bold tabular-nums tracking-tight", avgTrustScore >= 70 ? "text-green-600" : avgTrustScore >= 50 ? "text-yellow-600" : "text-red-600")}>
              {avgTrustScore}
            </p>
            <p className="text-[10px] text-muted-foreground">Trust Score prom.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <AlertTriangle className="w-4 h-4 mx-auto text-orange-500 mb-1" />
            <p className={cn("text-2xl font-bold tabular-nums tracking-tight", unresolvedFlags === 0 ? "text-green-600" : "text-orange-600")}>
              {unresolvedFlags}
            </p>
            <p className="text-[10px] text-muted-foreground">Flags activos</p>
          </CardContent>
        </Card>
      </div>

      {/* Anti-Patterns & Drift */}
      {orgId && (
        <div className="space-y-4 mb-8">
          <AntiPatterns orgId={orgId} days={days} />
          <DriftDetection orgId={orgId} />
        </div>
      )}

      {/* Meeting Tax */}
      {orgId && (
        <div className="mb-8">
          <MeetingTax orgId={orgId} days={days} />
        </div>
      )}

      {/* Timezone Overlap */}
      {orgId && (
        <div className="mb-8">
          <TimezoneOverlap orgId={orgId} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Category Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribucion de trabajo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {categoryDistribution.map(({ category, hours, percent }) => (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <div className={cn("w-3 h-3 rounded-sm", CATEGORY_COLORS[category])} />
                      {CATEGORIES[category].emoji} {CATEGORIES[category].label}
                    </span>
                    <span className="text-muted-foreground">{hours}h ({percent}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", CATEGORY_COLORS[category])} style={{ width: `${percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Activity by Hour */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Actividad por hora</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {WORK_HOURS.map((h) => {
                const count = hourDistribution.get(h) ?? 0;
                const max = Math.max(1, ...Array.from(hourDistribution.values()));
                const pct = (count / max) * 100;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={cn("w-full rounded-t", count === 0 ? "bg-muted/30" : "bg-primary")}
                      style={{ height: `${Math.max(pct, 3)}%`, opacity: Math.max(0.3, pct / 100) }}
                      title={`${h}:00 - ${count} entradas`}
                    />
                    <span className="text-[8px] text-muted-foreground">
                      {h > 12 ? h - 12 : h}{h >= 12 ? "p" : "a"}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Top Contributors */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-500" />
              Mas activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topContributors.map((c, i) => (
                <div key={c.name} className="flex items-center gap-2">
                  <span className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                    i === 0 ? "bg-yellow-100 text-yellow-700" :
                    i === 1 ? "bg-gray-100 text-gray-600" :
                    i === 2 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
                  )}>
                    {i + 1}
                  </span>
                  <span className="text-sm flex-1 truncate">{c.name}</span>
                  <span className="text-xs font-medium">{c.hours}h</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Team Health */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              Salud del equipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-2 bg-accent/40 rounded-xl">
                <p className="text-xl font-bold tabular-nums tracking-tight">{avgStreak}</p>
                <p className="text-[10px] text-muted-foreground">Racha promedio</p>
              </div>
              <div className="text-center p-2 bg-accent/40 rounded-xl">
                <p className={cn("text-xl font-bold tabular-nums tracking-tight", totalFlags === 0 ? "text-green-600" : "text-orange-600")}>
                  {totalFlags}
                </p>
                <p className="text-[10px] text-muted-foreground">Flags totales</p>
              </div>
              <div className="text-center p-2 bg-accent/40 rounded-xl">
                <p className="text-xl font-bold tabular-nums tracking-tight">
                  {memberCount > 0 ? Math.round(totalHours / Math.max(1, days) / memberCount * 10) / 10 : 0}
                </p>
                <p className="text-[10px] text-muted-foreground">h/persona/dia</p>
              </div>
              <div className="text-center p-2 bg-accent/40 rounded-xl">
                <p className="text-xl font-bold tabular-nums tracking-tight">{memberCount}</p>
                <p className="text-[10px] text-muted-foreground">Miembros</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
