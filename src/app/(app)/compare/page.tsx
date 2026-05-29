"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { CATEGORIES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { subDays } from "date-fns";
import { ArrowLeftRight, Shield, Clock, Flame, Brain, TrendingUp } from "lucide-react";
import { RadarChart } from "@/components/compare/radar-chart";

interface UserStats {
  profile: Profile;
  totalHours: number;
  proofPercent: number;
  latePercent: number;
  deepWorkPercent: number;
  meetingPercent: number;
  avgMood: number | null;
  avgEnergy: number | null;
  topCategory: WorkCategory | null;
  hoursPerDay: number;
  activeDays: number;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function CompareBar({ label, valueA, valueB, suffix, higherIsBetter }: {
  label: string; valueA: number; valueB: number; suffix?: string; higherIsBetter?: boolean;
}) {
  const max = Math.max(valueA, valueB, 1);
  const aWins = higherIsBetter ? valueA > valueB : valueA < valueB;
  const bWins = higherIsBetter ? valueB > valueA : valueB < valueA;
  const tied = valueA === valueB;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className={cn("font-semibold tabular-nums", aWins && !tied && "text-green-600")}>
          {valueA}{suffix}
        </span>
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className={cn("font-semibold tabular-nums", bWins && !tied && "text-green-600")}>
          {valueB}{suffix}
        </span>
      </div>
      <div className="flex gap-1 h-2">
        <div className="flex-1 flex justify-end">
          <div
            className={cn("h-full rounded-l-full transition-all", aWins ? "bg-green-500" : "bg-muted")}
            style={{ width: `${(valueA / max) * 100}%` }}
          />
        </div>
        <div className="flex-1">
          <div
            className={cn("h-full rounded-r-full transition-all", bWins ? "bg-green-500" : "bg-muted")}
            style={{ width: `${(valueB / max) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ComparePage() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [userA, setUserA] = useState<string>("");
  const [userB, setUserB] = useState<string>("");
  const [statsA, setStatsA] = useState<UserStats | null>(null);
  const [statsB, setStatsB] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string }>();
      if (!membership) { setLoading(false); return; }
      setOrgId(membership.org_id);

      const { data: memberData } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", membership.org_id)
        .returns<{ user_id: string; profiles: Profile }[]>();

      const profiles = memberData?.map((m) => m.profiles) ?? [];
      setMembers(profiles);
      if (profiles.length >= 2) {
        setUserA(profiles[0].id);
        setUserB(profiles[1].id);
      }
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId || !userA || !userB) return;

    async function loadStats(userId: string): Promise<UserStats | null> {
      const startDate = subDays(new Date(), 30).toISOString().split("T")[0];
      const { data: entries } = await supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", userId)
        .eq("org_id", orgId!)
        .gte("date", startDate);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (!entries || !profile) return null;

      const totalHours = entries.length;
      const withProof = entries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
      const late = entries.filter((e) => e.is_late).length;
      const deepWork = entries.filter((e) => e.category === "deep_work").length;
      const meetings = entries.filter((e) => e.category === "meeting").length;
      const moods = entries.filter((e) => e.mood).map((e) => e.mood as number);
      const energies = entries.filter((e) => e.energy).map((e) => e.energy as number);
      const dates = new Set(entries.map((e) => e.date));

      const catCounts = new Map<WorkCategory, number>();
      for (const e of entries) catCounts.set(e.category as WorkCategory, (catCounts.get(e.category as WorkCategory) ?? 0) + 1);
      let topCat: WorkCategory | null = null;
      let topCount = 0;
      for (const [c, n] of catCounts) { if (n > topCount) { topCat = c; topCount = n; } }

      return {
        profile: profile as Profile,
        totalHours,
        proofPercent: totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0,
        latePercent: totalHours > 0 ? Math.round((late / totalHours) * 100) : 0,
        deepWorkPercent: totalHours > 0 ? Math.round((deepWork / totalHours) * 100) : 0,
        meetingPercent: totalHours > 0 ? Math.round((meetings / totalHours) * 100) : 0,
        avgMood: moods.length > 0 ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null,
        avgEnergy: energies.length > 0 ? Math.round((energies.reduce((a, b) => a + b, 0) / energies.length) * 10) / 10 : null,
        topCategory: topCat,
        hoursPerDay: dates.size > 0 ? Math.round((totalHours / dates.size) * 10) / 10 : 0,
        activeDays: dates.size,
      };
    }

    async function loadBoth() {
      const [a, b] = await Promise.all([loadStats(userA), loadStats(userB)]);
      setStatsA(a);
      setStatsB(b);
    }
    loadBoth();
  }, [userA, userB, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ArrowLeftRight className="w-6 h-6 text-primary" />
          Comparar miembros
        </h1>
        <p className="text-muted-foreground text-sm">Últimos 30 días — todo visible para el equipo</p>
      </div>

      {/* Selectors */}
      <div className="flex items-center gap-4 mb-8">
        <Select value={userA} onValueChange={(v) => v && setUserA(v)}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ArrowLeftRight className="w-5 h-5 text-muted-foreground shrink-0" />
        <Select value={userB} onValueChange={(v) => v && setUserB(v)}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {statsA && statsB && (
        <>
          {/* Profile headers */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Avatar className="w-12 h-12 ring-2 ring-background shadow-sm">
                <AvatarImage src={statsA.profile.avatar_url ?? undefined} />
                <AvatarFallback>{getInitials(statsA.profile.full_name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{statsA.profile.full_name ?? statsA.profile.email}</p>
                <p className="text-xs text-muted-foreground">{statsA.profile.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="font-semibold">{statsB.profile.full_name ?? statsB.profile.email}</p>
                <p className="text-xs text-muted-foreground">{statsB.profile.role}</p>
              </div>
              <Avatar className="w-12 h-12 ring-2 ring-background shadow-sm">
                <AvatarImage src={statsB.profile.avatar_url ?? undefined} />
                <AvatarFallback>{getInitials(statsB.profile.full_name)}</AvatarFallback>
              </Avatar>
            </div>
          </div>

          {/* Radar Chart */}
          <Card className="mb-6 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardContent className="p-6">
              <RadarChart
                axes={[
                  { label: "Horas", valueA: Math.min(statsA.totalHours / 40 * 100, 100), valueB: Math.min(statsB.totalHours / 40 * 100, 100) },
                  { label: "Evidencia", valueA: statsA.proofPercent, valueB: statsB.proofPercent },
                  { label: "Focus", valueA: statsA.deepWorkPercent, valueB: statsB.deepWorkPercent },
                  { label: "Animo", valueA: (statsA.avgMood ?? 3) * 20, valueB: (statsB.avgMood ?? 3) * 20 },
                  { label: "Puntualidad", valueA: 100 - statsA.latePercent, valueB: 100 - statsB.latePercent },
                  { label: "Actividad", valueA: Math.min(statsA.activeDays / 20 * 100, 100), valueB: Math.min(statsB.activeDays / 20 * 100, 100) },
                ]}
                nameA={statsA.profile.full_name?.split(" ")[0] ?? "A"}
                nameB={statsB.profile.full_name?.split(" ")[0] ?? "B"}
              />
            </CardContent>
          </Card>

          {/* Comparison bars */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardContent className="p-6 space-y-5">
              <CompareBar label="Horas totales" valueA={statsA.totalHours} valueB={statsB.totalHours} suffix="h" higherIsBetter />
              <CompareBar label="Horas/día" valueA={statsA.hoursPerDay} valueB={statsB.hoursPerDay} suffix="h" higherIsBetter />
              <CompareBar label="Evidencia" valueA={statsA.proofPercent} valueB={statsB.proofPercent} suffix="%" higherIsBetter />
              <CompareBar label="Deep work" valueA={statsA.deepWorkPercent} valueB={statsB.deepWorkPercent} suffix="%" higherIsBetter />
              <CompareBar label="Reuniones" valueA={statsA.meetingPercent} valueB={statsB.meetingPercent} suffix="%" higherIsBetter={false} />
              <CompareBar label="Tardías" valueA={statsA.latePercent} valueB={statsB.latePercent} suffix="%" higherIsBetter={false} />
              <CompareBar label="Días activos" valueA={statsA.activeDays} valueB={statsB.activeDays} higherIsBetter />
              {statsA.avgMood !== null && statsB.avgMood !== null && (
                <CompareBar label="Ánimo prom." valueA={statsA.avgMood} valueB={statsB.avgMood} higherIsBetter />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
