"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, AccountabilityFlag } from "@/lib/types/database";
import { CATEGORIES, FLAG_TYPES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { WorkCategory, FlagType } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Flame,
  Eye,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

interface MemberStats {
  profile: Profile;
  hoursLogged: number;
  hoursWithProof: number;
  lateEntries: number;
  hasCloseout: boolean;
  avgMood: number | null;
  topCategory: WorkCategory | null;
  suspiciousReactions: number;
  flags: AccountabilityFlag[];
  scoreTrend: number[];
  streak: number;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function AccountabilityPage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [memberStats, setMemberStats] = useState<MemberStats[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string }>();
      if (membership) setOrgId(membership.org_id);
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId) return;

    async function loadStats() {
      setLoading(true);

      // Get members
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        .returns<{ user_id: string; profiles: Profile }[]>();

      if (!members) { setLoading(false); return; }

      // Get all entries for this date
      const { data: entries } = await supabase
        .from("time_entries")
        .select("*")
        .eq("org_id", orgId)
        .eq("date", date);

      // Get closeouts
      const { data: closeouts } = await supabase
        .from("daily_closeouts")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("date", date);

      // Get suspicious reactions
      const { data: reactions } = await supabase
        .from("entry_reactions")
        .select("entry_id")
        .eq("reaction", "suspicious");

      // Get accountability flags for this date
      const { data: flags } = await supabase
        .from("accountability_flags")
        .select("*")
        .eq("org_id", orgId)
        .eq("date", date)
        .eq("resolved", false)
        .returns<AccountabilityFlag[]>();

      // Get trust score history (last 7 days)
      const weekAgo = subDays(new Date(date + "T12:00:00"), 7).toISOString().split("T")[0];
      const { data: scoreHistory } = await supabase
        .from("trust_score_history")
        .select("user_id, date, score")
        .eq("org_id", orgId)
        .gte("date", weekAgo)
        .lte("date", date)
        .order("date", { ascending: true });

      // Get streaks
      const { data: streaks } = await supabase
        .from("activity_streaks")
        .select("user_id, current_streak")
        .eq("org_id", orgId);

      const streakMap = new Map(streaks?.map((s) => [s.user_id, s.current_streak]) ?? []);
      const suspiciousEntryIds = new Set(reactions?.map((r) => r.entry_id) ?? []);
      const closeoutUserIds = new Set(closeouts?.map((c) => c.user_id) ?? []);

      const stats: MemberStats[] = members.map((m) => {
        const userEntries = entries?.filter((e) => e.user_id === m.user_id) ?? [];
        const withProof = userEntries.filter((e) => e.proof_urls && e.proof_urls.length > 0);
        const lateOnes = userEntries.filter((e) => e.is_late);
        const moods = userEntries.filter((e) => e.mood).map((e) => e.mood as number);
        const suspicious = userEntries.filter((e) => suspiciousEntryIds.has(e.id));
        const userFlags = flags?.filter((f) => f.user_id === m.user_id) ?? [];
        const userScores = scoreHistory
          ?.filter((s) => s.user_id === m.user_id)
          .map((s) => s.score) ?? [];

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

        return {
          profile: m.profiles,
          hoursLogged: userEntries.length,
          hoursWithProof: withProof.length,
          lateEntries: lateOnes.length,
          hasCloseout: closeoutUserIds.has(m.user_id),
          avgMood: moods.length > 0 ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
          topCategory: topCat,
          suspiciousReactions: suspicious.length,
          flags: userFlags,
          scoreTrend: userScores,
          streak: streakMap.get(m.user_id) ?? 0,
        };
      });

      // Sort: worst accountability first
      stats.sort((a, b) => {
        const scoreA = a.hoursLogged + (a.hasCloseout ? 2 : 0) + a.hoursWithProof;
        const scoreB = b.hoursLogged + (b.hasCloseout ? 2 : 0) + b.hoursWithProof;
        return scoreA - scoreB;
      });

      setMemberStats(stats);
      setLoading(false);
    }

    loadStats();
  }, [orgId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const isToday = date === new Date().toISOString().split("T")[0];
  const displayDate = format(new Date(date + "T12:00:00"), "EEEE, d MMMM yyyy", { locale: es });

  function getTrustScore(s: MemberStats): { score: number; label: string; color: string } {
    const maxHours = EXPECTED_DAILY_HOURS;
    const hoursRatio = Math.min(s.hoursLogged / maxHours, 1);
    const proofRatio = s.hoursLogged > 0 ? s.hoursWithProof / s.hoursLogged : 0;
    const closeoutBonus = s.hasCloseout ? 0.1 : 0;
    const latePenalty = s.hoursLogged > 0 ? (s.lateEntries / s.hoursLogged) * 0.2 : 0;
    const suspiciousPenalty = s.suspiciousReactions * 0.1;

    const raw = (hoursRatio * 0.4 + proofRatio * 0.4 + closeoutBonus) - latePenalty - suspiciousPenalty;
    const score = Math.max(0, Math.min(100, Math.round(raw * 100)));

    if (score >= 80) return { score, label: "Excelente", color: "text-green-600" };
    if (score >= 60) return { score, label: "Bien", color: "text-blue-600" };
    if (score >= 40) return { score, label: "Regular", color: "text-yellow-600" };
    return { score, label: "Bajo", color: "text-red-600" };
  }

  function getScoreTrend(scores: number[]): "up" | "down" | "flat" {
    if (scores.length < 2) return "flat";
    const last = scores[scores.length - 1];
    const prev = scores[scores.length - 2];
    if (last > prev + 5) return "up";
    if (last < prev - 5) return "down";
    return "flat";
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Eye className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Accountability</h1>
        </div>
      </div>
      <p className="text-muted-foreground text-sm mb-6 capitalize">{displayDate}</p>

      {/* Date nav */}
      <div className="flex items-center gap-2 mb-8 bg-card/80 border border-border/50 rounded-2xl p-2 w-fit">
        <Button variant="ghost" size="icon" className="rounded-xl"
          onClick={() => setDate(subDays(new Date(date + "T12:00:00"), 1).toISOString().split("T")[0])}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto" />
        <Button variant="ghost" size="icon" className="rounded-xl"
          onClick={() => {
            const next = new Date(date + "T12:00:00");
            next.setDate(next.getDate() + 1);
            setDate(next.toISOString().split("T")[0]);
          }}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        {!isToday && (
          <Button variant="secondary" size="sm" className="rounded-xl text-xs font-semibold" onClick={() => setDate(new Date().toISOString().split("T")[0])}>
            Hoy
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {memberStats.map((s) => {
            const trust = getTrustScore(s);
            const proofPercent = s.hoursLogged > 0 ? Math.round((s.hoursWithProof / s.hoursLogged) * 100) : 0;
            const trend = getScoreTrend(s.scoreTrend);

            return (
              <Card key={s.profile.id} className={cn(
                "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5",
                s.hoursLogged === 0 && "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/10",
                s.suspiciousReactions > 0 && "border-orange-200 dark:border-orange-900"
              )}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <Avatar className="w-12 h-12 ring-2 ring-background shadow-sm">
                      <AvatarImage src={s.profile.avatar_url ?? undefined} />
                      <AvatarFallback>{getInitials(s.profile.full_name)}</AvatarFallback>
                    </Avatar>

                    {/* Name & role */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">
                          {s.profile.full_name ?? s.profile.email}
                        </h3>
                        {s.streak > 0 && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Flame className="w-3 h-3 text-orange-500" />
                            {s.streak}d
                          </Badge>
                        )}
                        {s.suspiciousReactions > 0 && (
                          <Badge variant="destructive" className="text-[10px]">
                            {s.suspiciousReactions} sospechoso(s)
                          </Badge>
                        )}
                      </div>
                      {s.profile.role && (
                        <p className="text-xs text-muted-foreground">{s.profile.role}</p>
                      )}
                    </div>

                    {/* Trust score with trend */}
                    <div className="text-center min-w-[80px]">
                      <div className="flex items-center justify-center gap-1">
                        <p className={cn("text-2xl font-bold tabular-nums tracking-tight", trust.color)}>{trust.score}</p>
                        {trend === "up" && <TrendingUp className="w-4 h-4 text-green-500" />}
                        {trend === "down" && <TrendingDown className="w-4 h-4 text-red-500" />}
                      </div>
                      <p className={cn("text-[10px] font-medium", trust.color)}>{trust.label}</p>
                      {/* Mini sparkline */}
                      {s.scoreTrend.length > 1 && (
                        <div className="flex items-end gap-px mt-1 justify-center h-3">
                          {s.scoreTrend.map((score, i) => (
                            <div
                              key={i}
                              className={cn(
                                "w-1 rounded-t",
                                score >= 80 ? "bg-green-400" :
                                score >= 60 ? "bg-blue-400" :
                                score >= 40 ? "bg-yellow-400" : "bg-red-400"
                              )}
                              style={{ height: `${Math.max(score / 100 * 12, 2)}px` }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                    <div className="text-center p-2 bg-accent/40 rounded-xl">
                      <p className={cn(
                        "text-lg font-bold",
                        s.hoursLogged >= EXPECTED_DAILY_HOURS ? "text-green-600" :
                        s.hoursLogged >= 4 ? "text-yellow-600" : "text-red-600"
                      )}>
                        {s.hoursLogged}/{EXPECTED_DAILY_HOURS}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Horas</p>
                    </div>

                    <div className="text-center p-2 bg-accent/40 rounded-xl">
                      <p className={cn(
                        "text-lg font-bold",
                        proofPercent >= 80 ? "text-green-600" :
                        proofPercent >= 50 ? "text-yellow-600" : "text-red-600"
                      )}>
                        {proofPercent}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">Con evidencia</p>
                    </div>

                    <div className="text-center p-2 bg-accent/40 rounded-xl">
                      <p className={cn(
                        "text-lg font-bold",
                        s.lateEntries === 0 ? "text-green-600" : "text-orange-600"
                      )}>
                        {s.lateEntries}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Tardias</p>
                    </div>

                    <div className="text-center p-2 bg-accent/40 rounded-xl">
                      {s.hasCloseout ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-500 mx-auto" />
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">Cierre</p>
                    </div>

                    <div className="text-center p-2 bg-accent/40 rounded-xl">
                      {s.topCategory ? (
                        <>
                          <p className="text-lg">{CATEGORIES[s.topCategory].emoji}</p>
                          <p className="text-[10px] text-muted-foreground">{CATEGORIES[s.topCategory].label}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-lg text-muted-foreground">-</p>
                          <p className="text-[10px] text-muted-foreground">Sin datos</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Accountability flags */}
                  {s.flags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {s.flags.map((flag) => {
                        const flagInfo = FLAG_TYPES[flag.flag_type as FlagType];
                        return (
                          <Badge
                            key={flag.id}
                            variant="outline"
                            className={cn(
                              "text-xs",
                              flagInfo.severity === "high"
                                ? "text-red-600 border-red-300 bg-red-50 dark:bg-red-950/20"
                                : flagInfo.severity === "medium"
                                  ? "text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/20"
                                  : "text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20"
                            )}
                          >
                            <span className="mr-1">{flagInfo.emoji}</span>
                            {flagInfo.label}
                            {flag.details && (
                              <span className="ml-1 opacity-70">({flag.details})</span>
                            )}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {/* Warnings (for entries that haven't been flagged yet) */}
                  {s.flags.length === 0 && (s.hoursLogged === 0 || s.suspiciousReactions > 0 || (!s.hasCloseout && !isToday)) && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {s.hoursLogged === 0 && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Sin horas registradas
                        </Badge>
                      )}
                      {!s.hasCloseout && !isToday && (
                        <Badge variant="outline" className="text-xs text-red-600 border-red-300">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Sin cierre del dia
                        </Badge>
                      )}
                      {s.suspiciousReactions > 0 && (
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Marcado como sospechoso por companeros
                        </Badge>
                      )}
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
