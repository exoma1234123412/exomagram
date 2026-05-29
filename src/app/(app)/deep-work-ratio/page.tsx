"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { cn, getTodayMTY } from "@/lib/utils";
import { format, subDays, parseISO, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import {
  Crosshair,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface MemberRatio {
  userId: string;
  name: string;
  avatarUrl: string | null;
  deepWorkHours: number;
  totalHours: number;
  ratio: number;
  badge: "PROFUNDO" | "MODERADO" | "SUPERFICIAL";
  badgeColor: string;
  dailyRatios: { date: string; ratio: number; deepWork: number; total: number }[];
  thisWeekRatio: number;
  lastWeekRatio: number;
  trend: number;
}

// ============================================================
// Helpers
// ============================================================

function getBadge(ratio: number): { badge: MemberRatio["badge"]; color: string } {
  if (ratio >= 40) return { badge: "PROFUNDO", color: "text-green-500 border-green-500/30 bg-green-500/10" };
  if (ratio >= 20) return { badge: "MODERADO", color: "text-amber-500 border-amber-500/30 bg-amber-500/10" };
  return { badge: "SUPERFICIAL", color: "text-red-500 border-red-500/30 bg-red-500/10" };
}

// ============================================================
// Page
// ============================================================

export default function DeepWorkRatioPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [entries, setEntries] = useState<{ user_id: string; date: string; category: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgLoading || !orgId) return;
    const supabase = createClient();

    async function loadData() {
      setLoading(true);
      const today = getTodayMTY();
      const from = format(subDays(parseISO(today), 13), "yyyy-MM-dd");

      const [entriesRes, profilesRes] = await Promise.all([
        supabase
          .from("time_entries")
          .select("user_id, date, category")
          .eq("org_id", orgId!)
          .gte("date", from)
          .lte("date", today)
          .is("deleted_at", null),
        supabase
          .from("org_members")
          .select("user_id, profiles!inner(id, email, full_name, avatar_url)")
          .eq("org_id", orgId!),
      ]);

      if (entriesRes.data) setEntries(entriesRes.data);

      if (profilesRes.data) {
        const pMap: Record<string, Profile> = {};
        for (const m of profilesRes.data) {
          const p = m.profiles as unknown as Profile;
          if (p) pMap[p.id] = p;
        }
        setProfiles(pMap);
      }

      setLoading(false);
    }

    loadData();
  }, [orgId, orgLoading]);

  // ─────────────────────────────────────────
  // Compute ratios
  // ─────────────────────────────────────────
  const { members, teamAvg, teamThisWeek, teamLastWeek } = useMemo(() => {
    if (entries.length === 0 || Object.keys(profiles).length === 0) {
      return { members: [], teamAvg: 0, teamThisWeek: 0, teamLastWeek: 0 };
    }

    const today = parseISO(getTodayMTY());
    const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const lastWeekStart = subDays(thisWeekStart, 7);
    const lastWeekEnd = subDays(thisWeekStart, 1);

    // Generate 14 dates
    const dates: string[] = [];
    for (let i = 13; i >= 0; i--) {
      dates.push(format(subDays(today, i), "yyyy-MM-dd"));
    }

    // Group entries by user
    const byUser = new Map<string, typeof entries>();
    for (const e of entries) {
      if (!byUser.has(e.user_id)) byUser.set(e.user_id, []);
      byUser.get(e.user_id)!.push(e);
    }

    const result: MemberRatio[] = [];

    for (const [uid, userEntries] of byUser) {
      const profile = profiles[uid];
      if (!profile) continue;

      const deepWorkHours = userEntries.filter((e) => e.category === "deep_work").length;
      const totalHours = userEntries.length;
      const ratio = totalHours > 0 ? (deepWorkHours / totalHours) * 100 : 0;

      // Daily ratios for mini chart
      const dailyRatios = dates.map((d) => {
        const dayEntries = userEntries.filter((e) => e.date === d);
        const dayDeep = dayEntries.filter((e) => e.category === "deep_work").length;
        const dayTotal = dayEntries.length;
        return {
          date: d,
          ratio: dayTotal > 0 ? (dayDeep / dayTotal) * 100 : 0,
          deepWork: dayDeep,
          total: dayTotal,
        };
      });

      // This week vs last week
      const thisWeekEntries = userEntries.filter((e) => {
        const d = parseISO(e.date);
        return isWithinInterval(d, { start: thisWeekStart, end: thisWeekEnd });
      });
      const lastWeekEntries = userEntries.filter((e) => {
        const d = parseISO(e.date);
        return isWithinInterval(d, { start: lastWeekStart, end: lastWeekEnd });
      });

      const twDeep = thisWeekEntries.filter((e) => e.category === "deep_work").length;
      const twTotal = thisWeekEntries.length;
      const lwDeep = lastWeekEntries.filter((e) => e.category === "deep_work").length;
      const lwTotal = lastWeekEntries.length;

      const thisWeekRatio = twTotal > 0 ? (twDeep / twTotal) * 100 : 0;
      const lastWeekRatio = lwTotal > 0 ? (lwDeep / lwTotal) * 100 : 0;

      const { badge, color } = getBadge(ratio);

      result.push({
        userId: uid,
        name: profile.full_name || profile.email,
        avatarUrl: profile.avatar_url,
        deepWorkHours,
        totalHours,
        ratio,
        badge,
        badgeColor: color,
        dailyRatios,
        thisWeekRatio,
        lastWeekRatio,
        trend: thisWeekRatio - lastWeekRatio,
      });
    }

    // Sort by ratio descending
    result.sort((a, b) => b.ratio - a.ratio);

    // Team averages
    const allDeep = entries.filter((e) => e.category === "deep_work").length;
    const allTotal = entries.length;
    const teamAvg = allTotal > 0 ? (allDeep / allTotal) * 100 : 0;

    const allThisWeek = entries.filter((e) => {
      const d = parseISO(e.date);
      return isWithinInterval(d, { start: thisWeekStart, end: thisWeekEnd });
    });
    const allLastWeek = entries.filter((e) => {
      const d = parseISO(e.date);
      return isWithinInterval(d, { start: lastWeekStart, end: lastWeekEnd });
    });

    const twDeepAll = allThisWeek.filter((e) => e.category === "deep_work").length;
    const twTotalAll = allThisWeek.length;
    const lwDeepAll = allLastWeek.filter((e) => e.category === "deep_work").length;
    const lwTotalAll = allLastWeek.length;

    return {
      members: result,
      teamAvg,
      teamThisWeek: twTotalAll > 0 ? (twDeepAll / twTotalAll) * 100 : 0,
      teamLastWeek: lwTotalAll > 0 ? (lwDeepAll / lwTotalAll) * 100 : 0,
    };
  }, [entries, profiles]);

  // ─────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────
  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Calculando ratio deep work...
        </div>
      </div>
    );
  }

  if (!orgId || !userId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground font-mono text-xs">
          Crea o unete a un equipo desde el Dashboard.
        </p>
      </div>
    );
  }

  const teamTrend = teamThisWeek - teamLastWeek;
  const teamBadge = getBadge(teamAvg);

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Crosshair className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Deep Work Ratio
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Porcentaje de horas en deep_work vs total --- meta: &gt;40% --- ultimos 14 dias
        </p>
      </div>

      {/* Team stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Promedio equipo
          </div>
          <div className="font-mono text-2xl tabular-nums tracking-tight">
            {teamAvg.toFixed(1)}%
          </div>
        </div>
        <div className={cn("border p-3", teamBadge.color)}>
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Clasificacion
          </div>
          <div className="font-mono text-lg tabular-nums tracking-tight font-bold">
            {teamBadge.badge}
          </div>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Esta semana
          </div>
          <div className="font-mono text-2xl tabular-nums tracking-tight">
            {teamThisWeek.toFixed(1)}%
          </div>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Tendencia
          </div>
          <div className="flex items-center gap-1.5">
            {teamTrend > 0 ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : teamTrend < 0 ? (
              <TrendingDown className="w-4 h-4 text-red-500" />
            ) : (
              <Minus className="w-4 h-4 text-muted-foreground" />
            )}
            <span
              className={cn(
                "font-mono text-2xl tabular-nums tracking-tight",
                teamTrend > 0 && "text-green-500",
                teamTrend < 0 && "text-red-500"
              )}
            >
              {teamTrend > 0 ? "+" : ""}
              {teamTrend.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="mb-8">
        <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Leaderboard --- Deep Work Ratio
        </div>

        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-mono text-sm text-muted-foreground">
              Sin datos en los ultimos 14 dias
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((m, idx) => (
              <div
                key={m.userId}
                className="border border-border transition-colors duration-200 hover:border-primary/30"
              >
                <div className="px-4 py-3">
                  {/* Top row: rank + name + ratio + badge */}
                  <div className="flex items-center gap-3 mb-3">
                    {/* Rank */}
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums w-5 shrink-0">
                      #{idx + 1}
                    </span>

                    {/* Avatar */}
                    {m.avatarUrl ? (
                      <img
                        src={m.avatarUrl}
                        alt={m.name}
                        className="w-7 h-7 ring-1 ring-border object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 bg-accent border border-border flex items-center justify-center shrink-0">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {m.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-xs font-medium truncate block">
                        {m.name}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        {m.deepWorkHours}h deep / {m.totalHours}h total
                      </span>
                    </div>

                    {/* Ratio */}
                    <div className="text-right shrink-0">
                      <div className="font-mono text-xl tabular-nums tracking-tight font-bold">
                        {m.ratio.toFixed(1)}%
                      </div>
                    </div>

                    {/* Badge */}
                    <span
                      className={cn(
                        "shrink-0 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider border",
                        m.badgeColor
                      )}
                    >
                      {m.badge}
                    </span>
                  </div>

                  {/* Bar */}
                  <div className="mb-3">
                    <div className="w-full h-2 bg-muted overflow-hidden flex">
                      <div
                        className="h-full bg-violet-500 transition-all duration-500"
                        style={{ width: `${Math.min(m.ratio, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="font-mono text-[8px] text-muted-foreground">0%</span>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-violet-500" />
                          <span className="font-mono text-[8px] text-muted-foreground">Deep Work</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-muted" />
                          <span className="font-mono text-[8px] text-muted-foreground">Otro</span>
                        </div>
                      </div>
                      <span className="font-mono text-[8px] text-muted-foreground">100%</span>
                    </div>
                  </div>

                  {/* Trend */}
                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex items-center gap-1.5">
                      {m.trend > 0 ? (
                        <TrendingUp className="w-3 h-3 text-green-500" />
                      ) : m.trend < 0 ? (
                        <TrendingDown className="w-3 h-3 text-red-500" />
                      ) : (
                        <Minus className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span
                        className={cn(
                          "font-mono text-[10px] tabular-nums",
                          m.trend > 0 && "text-green-500",
                          m.trend < 0 && "text-red-500",
                          m.trend === 0 && "text-muted-foreground"
                        )}
                      >
                        {m.trend > 0 ? "+" : ""}
                        {m.trend.toFixed(1)}% vs semana anterior
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      Esta: {m.thisWeekRatio.toFixed(0)}% | Anterior: {m.lastWeekRatio.toFixed(0)}%
                    </span>
                  </div>

                  {/* Daily breakdown: 14 mini columns */}
                  <div>
                    <div className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground mb-1.5">
                      Ratio diario (14 dias)
                    </div>
                    <div className="flex gap-[3px] items-end h-10">
                      {m.dailyRatios.map((dr) => {
                        const dayLabel = format(parseISO(dr.date), "dd", { locale: es });
                        const height = dr.total > 0 ? Math.max(4, (dr.ratio / 100) * 36) : 2;
                        const isHigh = dr.ratio >= 40;
                        const isMed = dr.ratio >= 20 && dr.ratio < 40;
                        return (
                          <div key={dr.date} className="flex-1 flex flex-col items-center gap-0.5">
                            <div
                              className={cn(
                                "w-full transition-all duration-300",
                                dr.total === 0
                                  ? "bg-muted"
                                  : isHigh
                                    ? "bg-violet-500"
                                    : isMed
                                      ? "bg-amber-500"
                                      : "bg-red-500"
                              )}
                              style={{ height: `${height}px` }}
                              title={`${dr.date}: ${dr.ratio.toFixed(0)}% (${dr.deepWork}/${dr.total}h)`}
                            />
                            <span className="font-mono text-[7px] text-muted-foreground tabular-nums">
                              {dayLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-center gap-3 mt-1.5">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-violet-500" />
                        <span className="font-mono text-[7px] text-muted-foreground">&ge;40%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-amber-500" />
                        <span className="font-mono text-[7px] text-muted-foreground">20-40%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-red-500" />
                        <span className="font-mono text-[7px] text-muted-foreground">&lt;20%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border pt-4">
        <p className="font-mono text-[9px] text-muted-foreground text-center tracking-wide">
          DEEP WORK RATIO --- {entries.length} ENTRADAS --- {Object.keys(profiles).length} PERSONAS --- ULTIMOS 14 DIAS
        </p>
      </div>
    </div>
  );
}
