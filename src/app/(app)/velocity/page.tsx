"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { cn, getTodayMTY } from "@/lib/utils";
import { format, subDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Gauge,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface SprintData {
  sprintIndex: number;
  startDate: string;
  endDate: string;
  totalHours: number;
  daysWithData: number;
  avgHoursPerDay: number;
}

interface MemberVelocity {
  userId: string;
  name: string;
  avatarUrl: string | null;
  sprints: SprintData[];
  currentVelocity: number;
  previousVelocity: number;
  delta: number;
  isAccelerating: boolean;
  badge: "MAQUINA" | "ESTABLE" | "LENTO";
  badgeColor: string;
}

// ============================================================
// Helpers
// ============================================================

function getVelocityBadge(velocity: number): { badge: MemberVelocity["badge"]; color: string } {
  if (velocity >= 7) return { badge: "MAQUINA", color: "text-green-500 border-green-500/30 bg-green-500/10" };
  if (velocity >= 5) return { badge: "ESTABLE", color: "text-muted-foreground border-border bg-accent/30" };
  return { badge: "LENTO", color: "text-red-500 border-red-500/30 bg-red-500/10" };
}

// ============================================================
// Page
// ============================================================

export default function VelocityPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [entries, setEntries] = useState<{ user_id: string; date: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgLoading || !orgId) return;
    const supabase = createClient();

    async function loadData() {
      setLoading(true);
      const today = getTodayMTY();
      const from = format(subDays(parseISO(today), 29), "yyyy-MM-dd");

      const [entriesRes, profilesRes] = await Promise.all([
        supabase
          .from("time_entries")
          .select("user_id, date")
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
  // Compute velocity
  // ─────────────────────────────────────────
  const { members, teamAvgVelocity } = useMemo(() => {
    if (entries.length === 0 || Object.keys(profiles).length === 0) {
      return { members: [], teamAvgVelocity: 0 };
    }

    const today = parseISO(getTodayMTY());

    // Build 6 sprints of 5 days each (most recent first in data, but display oldest first)
    // Sprint 0 = oldest (days 25-29 ago), Sprint 5 = newest (days 0-4 ago)
    const sprintRanges: { start: string; end: string }[] = [];
    for (let s = 5; s >= 0; s--) {
      const sprintEndOffset = s * 5;
      const sprintStartOffset = sprintEndOffset + 4;
      sprintRanges.push({
        start: format(subDays(today, sprintStartOffset), "yyyy-MM-dd"),
        end: format(subDays(today, sprintEndOffset), "yyyy-MM-dd"),
      });
    }

    // Group entries by user
    const byUser = new Map<string, typeof entries>();
    for (const e of entries) {
      if (!byUser.has(e.user_id)) byUser.set(e.user_id, []);
      byUser.get(e.user_id)!.push(e);
    }

    const result: MemberVelocity[] = [];

    for (const [uid, userEntries] of byUser) {
      const profile = profiles[uid];
      if (!profile) continue;

      const sprints: SprintData[] = sprintRanges.map((range, idx) => {
        const sprintEntries = userEntries.filter(
          (e) => e.date >= range.start && e.date <= range.end
        );
        const daysSet = new Set(sprintEntries.map((e) => e.date));
        const totalHours = sprintEntries.length;
        const daysWithData = daysSet.size;
        // Average over 5 calendar days (the sprint length)
        const avgHoursPerDay = totalHours / 5;

        return {
          sprintIndex: idx,
          startDate: range.start,
          endDate: range.end,
          totalHours,
          daysWithData,
          avgHoursPerDay,
        };
      });

      const currentVelocity = sprints[sprints.length - 1].avgHoursPerDay;
      const previousVelocity = sprints[sprints.length - 2].avgHoursPerDay;
      const delta = currentVelocity - previousVelocity;
      const isAccelerating = delta > 0;

      const { badge, color } = getVelocityBadge(currentVelocity);

      result.push({
        userId: uid,
        name: profile.full_name || profile.email,
        avatarUrl: profile.avatar_url,
        sprints,
        currentVelocity,
        previousVelocity,
        delta,
        isAccelerating,
        badge,
        badgeColor: color,
      });
    }

    // Sort by current velocity descending
    result.sort((a, b) => b.currentVelocity - a.currentVelocity);

    // Team average
    const totalVelocity = result.reduce((sum, m) => sum + m.currentVelocity, 0);
    const teamAvgVelocity = result.length > 0 ? totalVelocity / result.length : 0;

    return { members: result, teamAvgVelocity };
  }, [entries, profiles]);

  // ─────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────
  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Calculando velocidad...
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

  // Max velocity for chart normalization
  const maxSprintAvg = Math.max(
    1,
    ...members.flatMap((m) => m.sprints.map((s) => s.avgHoursPerDay))
  );

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Gauge className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Velocity Tracker
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Horas productivas por dia, promediadas en sprints de 5 dias --- ultimos 30 dias --- 6 sprints
        </p>
      </div>

      {/* Team stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Velocidad promedio equipo
          </div>
          <div className="font-mono text-2xl tabular-nums tracking-tight">
            {teamAvgVelocity.toFixed(1)}
            <span className="text-sm text-muted-foreground ml-1">h/dia</span>
          </div>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Personas rastreadas
          </div>
          <div className="font-mono text-2xl tabular-nums tracking-tight">
            {members.length}
          </div>
        </div>
        <div className="bg-accent/30 border border-border p-3 col-span-2 sm:col-span-1">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Entradas analizadas
          </div>
          <div className="font-mono text-2xl tabular-nums tracking-tight">
            {entries.length}
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="mb-8">
        <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Leaderboard --- Velocidad actual
        </div>

        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-mono text-sm text-muted-foreground">
              Sin datos en los ultimos 30 dias
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
                  {/* Top row: rank + avatar + name + velocity + badge */}
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
                    </div>

                    {/* Current velocity */}
                    <div className="text-right shrink-0">
                      <div className="font-mono text-xl tabular-nums tracking-tight font-bold">
                        {m.currentVelocity.toFixed(1)}
                        <span className="text-sm text-muted-foreground ml-1 font-normal">h/dia</span>
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

                  {/* Sprint chart: 6 bars + team avg line */}
                  <div className="mb-3">
                    <div className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground mb-1.5">
                      Velocidad por sprint (6 sprints de 5 dias)
                    </div>
                    <div className="relative">
                      {/* Team average line */}
                      <div
                        className="absolute left-0 right-0 border-t border-dashed border-primary/40 z-10"
                        style={{
                          bottom: `${(teamAvgVelocity / maxSprintAvg) * 48 + 16}px`,
                        }}
                      >
                        <span className="absolute right-0 -top-3 font-mono text-[7px] text-primary tabular-nums">
                          eq {teamAvgVelocity.toFixed(1)}
                        </span>
                      </div>

                      <div className="flex gap-2 items-end h-16">
                        {m.sprints.map((s) => {
                          const height = maxSprintAvg > 0
                            ? Math.max(4, (s.avgHoursPerDay / maxSprintAvg) * 48)
                            : 4;
                          const isLast = s.sprintIndex === m.sprints.length - 1;
                          const sprintLabel = `S${s.sprintIndex + 1}`;

                          return (
                            <div key={s.sprintIndex} className="flex-1 flex flex-col items-center gap-1">
                              <span className="font-mono text-[7px] text-muted-foreground tabular-nums">
                                {s.avgHoursPerDay.toFixed(1)}
                              </span>
                              <div
                                className={cn(
                                  "w-full transition-all duration-300",
                                  isLast ? "bg-primary" : "bg-muted-foreground/30"
                                )}
                                style={{ height: `${height}px` }}
                                title={`${sprintLabel}: ${s.avgHoursPerDay.toFixed(1)} h/dia (${s.totalHours}h en ${s.daysWithData} dias)`}
                              />
                              <span className="font-mono text-[7px] text-muted-foreground">
                                {sprintLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Trend + delta */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      {m.delta > 0 ? (
                        <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                      ) : m.delta < 0 ? (
                        <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                      ) : (
                        <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      <span
                        className={cn(
                          "font-mono text-xs tabular-nums font-bold",
                          m.delta > 0 && "text-green-500",
                          m.delta < 0 && "text-red-500",
                          m.delta === 0 && "text-muted-foreground"
                        )}
                      >
                        {m.isAccelerating ? "ACELERANDO" : m.delta < 0 ? "DESACELERANDO" : "ESTABLE"}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "font-mono text-[10px] tabular-nums",
                        m.delta > 0 && "text-green-500",
                        m.delta < 0 && "text-red-500",
                        m.delta === 0 && "text-muted-foreground"
                      )}
                    >
                      {m.delta > 0 ? "+" : ""}
                      {m.delta.toFixed(1)} h/dia vs sprint anterior
                    </span>
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
          VELOCITY TRACKER --- {entries.length} ENTRADAS --- {members.length} PERSONAS --- 6 SPRINTS DE 5 DIAS --- ULTIMOS 30 DIAS
        </p>
      </div>
    </div>
  );
}
