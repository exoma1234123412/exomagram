"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, formatHourShort } from "@/lib/utils";
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/constants";
import type { Profile, WorkCategory } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Zap,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Clock,
  ArrowRightLeft,
  Users,
  AlertTriangle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const SWITCH_COST_MINUTES = 23;
const HOURLY_RATE = 50;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface EntrySlim {
  user_id: string;
  date: string;
  hour: number;
  category: WorkCategory;
}

interface SwitchPoint {
  date: string;
  hour: number;
  fromCategory: WorkCategory;
  toCategory: WorkCategory;
}

interface DaySwitches {
  date: string;
  switches: number;
  entries: { hour: number; category: WorkCategory }[];
  switchPoints: SwitchPoint[];
}

interface MemberContextTax {
  userId: string;
  profile: Profile | null;
  totalSwitches: number;
  totalMinutesLost: number;
  totalCost: number;
  switchesPerDay: number;
  days: DaySwitches[];
  switchPoints: SwitchPoint[];
}

interface SwitchPattern {
  pattern: string;
  fromCategory: WorkCategory;
  toCategory: WorkCategory;
  count: number;
  users: Map<string, number>;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function computeSwitches(entries: EntrySlim[]): {
  switchPoints: SwitchPoint[];
  switches: number;
} {
  if (entries.length < 2) return { switchPoints: [], switches: 0 };
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.hour - b.hour;
  });
  const points: SwitchPoint[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    // Only count if consecutive: same day and hour diff = 1, OR next day boundary
    const sameDay = prev.date === curr.date;
    const consecutive = sameDay && curr.hour - prev.hour === 1;
    if (consecutive && prev.category !== curr.category) {
      points.push({
        date: curr.date,
        hour: curr.hour,
        fromCategory: prev.category,
        toCategory: curr.category,
      });
    }
  }
  return { switchPoints: points, switches: points.length };
}

function groupByDay(
  entries: EntrySlim[],
  switchPoints: SwitchPoint[]
): DaySwitches[] {
  const dayMap = new Map<string, { entries: EntrySlim[]; points: SwitchPoint[] }>();
  for (const e of entries) {
    const d = dayMap.get(e.date) ?? { entries: [], points: [] };
    d.entries.push(e);
    dayMap.set(e.date, d);
  }
  for (const sp of switchPoints) {
    const d = dayMap.get(sp.date);
    if (d) d.points.push(sp);
  }
  const result: DaySwitches[] = [];
  for (const [date, data] of dayMap) {
    const sorted = data.entries
      .sort((a, b) => a.hour - b.hour)
      .map((e) => ({ hour: e.hour, category: e.category }));
    result.push({
      date,
      switches: data.points.length,
      entries: sorted,
      switchPoints: data.points,
    });
  }
  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const days = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  return `${days[d.getDay()]} ${d.getDate()}`;
}

function getCategoryBgColor(category: WorkCategory): string {
  return CATEGORY_COLORS[category] ?? "bg-gray-400";
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ContextTaxPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [members, setMembers] = useState<MemberContextTax[]>([]);
  const [patterns, setPatterns] = useState<SwitchPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  /* ---------- data loader ---------- */

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateFrom = sevenDaysAgo.toISOString().split("T")[0];

    // 1. Org members + profiles
    const { data: orgMembers } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    if (!orgMembers) {
      setLoading(false);
      return;
    }

    const profileMap = new Map<string, Profile>();
    const userIds: string[] = [];
    for (const m of orgMembers) {
      userIds.push(m.user_id);
      if (m.profiles)
        profileMap.set(m.user_id, m.profiles as unknown as Profile);
    }

    // 2. Time entries (last 7 days)
    const { data: entries } = await supabase
      .from("time_entries")
      .select("user_id, date, hour, category")
      .eq("org_id", orgId)
      .gte("date", dateFrom)
      .is("deleted_at", null)
      .order("date", { ascending: true })
      .order("hour", { ascending: true });

    if (!entries) {
      setLoading(false);
      return;
    }

    // Group entries per user
    const userEntries = new Map<string, EntrySlim[]>();
    for (const e of entries) {
      const uid = e.user_id as string;
      const arr = userEntries.get(uid) ?? [];
      arr.push({
        user_id: uid,
        date: e.date as string,
        hour: e.hour as number,
        category: e.category as WorkCategory,
      });
      userEntries.set(uid, arr);
    }

    // Compute per-member
    const allPatternCounts = new Map<string, SwitchPattern>();
    const memberResults: MemberContextTax[] = userIds.map((uid) => {
      const ue = userEntries.get(uid) ?? [];
      const { switchPoints, switches } = computeSwitches(ue);
      const days = groupByDay(ue, switchPoints);
      const daysWithEntries = days.filter((d) => d.entries.length > 0).length;
      const switchesPerDay = daysWithEntries > 0 ? switches / daysWithEntries : 0;
      const totalMinutes = switches * SWITCH_COST_MINUTES;
      const totalCost = (totalMinutes / 60) * HOURLY_RATE;

      // Track patterns
      for (const sp of switchPoints) {
        const key = `${sp.fromCategory}->${sp.toCategory}`;
        const existing = allPatternCounts.get(key) ?? {
          pattern: key,
          fromCategory: sp.fromCategory,
          toCategory: sp.toCategory,
          count: 0,
          users: new Map<string, number>(),
        };
        existing.count++;
        existing.users.set(uid, (existing.users.get(uid) ?? 0) + 1);
        allPatternCounts.set(key, existing);
      }

      return {
        userId: uid,
        profile: profileMap.get(uid) ?? null,
        totalSwitches: switches,
        totalMinutesLost: totalMinutes,
        totalCost,
        switchesPerDay,
        days,
        switchPoints,
      };
    });

    // Sort worst switchers first
    memberResults.sort((a, b) => b.totalSwitches - a.totalSwitches);

    // Top patterns sorted by count
    const patternList = Array.from(allPatternCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    setMembers(memberResults);
    setPatterns(patternList);
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- initial load ---------- */

  useEffect(() => {
    if (orgLoading || !orgId) {
      if (!orgLoading) setLoading(false);
      return;
    }
    loadData();
  }, [orgLoading, orgId, loadData]);

  /* ---------- real-time ---------- */

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel("context-tax-entries")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- loading ---------- */

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          CARGANDO...
        </p>
      </div>
    );
  }

  /* ---------- computed ---------- */

  const teamTotalSwitches = members.reduce((s, m) => s + m.totalSwitches, 0);
  const teamTotalMinutes = members.reduce((s, m) => s + m.totalMinutesLost, 0);
  const teamTotalHoursLost = teamTotalMinutes / 60;
  const teamTotalCost = members.reduce((s, m) => s + m.totalCost, 0);
  const membersWithData = members.filter((m) => m.days.some((d) => d.entries.length > 0));
  const totalDaysWithEntries = membersWithData.reduce(
    (s, m) => s + m.days.filter((d) => d.entries.length > 0).length,
    0
  );
  const avgSwitchesPerPersonPerDay =
    membersWithData.length > 0 && totalDaysWithEntries > 0
      ? teamTotalSwitches / totalDaysWithEntries
      : 0;

  // Last 7 days for the mini-columns
  const last7Days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last7Days.push(d.toISOString().split("T")[0]);
  }

  /* ---------- render ---------- */

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <Zap className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Impuesto de Cambio de Contexto
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Cada cambio de categoria entre horas consecutivas cuesta ~23 minutos de productividad.
        Ultimos 7 dias.
      </p>

      {/* Team stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Cambios totales
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight text-red-500 mt-1">
            {teamTotalSwitches}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Tiempo perdido
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight text-red-500 mt-1">
            {teamTotalHoursLost >= 1
              ? `${Math.floor(teamTotalHoursLost)}h ${Math.round(teamTotalMinutes % 60)}m`
              : `${teamTotalMinutes}m`}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Costo total
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight text-red-500 mt-1">
            ${teamTotalCost.toFixed(0)}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Promedio / persona / dia
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight text-red-500 mt-1">
            {avgSwitchesPerPersonPerDay.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Section label */}
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
        Ranking por cambios de contexto &mdash; peor primero
      </p>

      {/* Per-person ranking */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <ArrowRightLeft className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            No hay datos suficientes para calcular cambios de contexto.
          </p>
        </div>
      ) : (
        <div className="space-y-2 mb-8">
          {members.map((m, idx) => {
            const isMe = m.userId === userId;
            const isExpanded = expandedUser === m.userId;
            const hours = Math.floor(m.totalMinutesLost / 60);
            const mins = m.totalMinutesLost % 60;

            return (
              <div
                key={m.userId}
                className="border border-border transition-colors hover:border-primary/30"
              >
                {/* Main row */}
                <button
                  onClick={() =>
                    setExpandedUser(isExpanded ? null : m.userId)
                  }
                  className="w-full text-left p-4 cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    {/* Rank */}
                    <div className="flex flex-col items-center shrink-0 w-8">
                      <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                        #{idx + 1}
                      </span>
                    </div>

                    {/* Avatar */}
                    <Avatar className="w-10 h-10 ring-1 ring-border shrink-0">
                      <AvatarImage
                        src={m.profile?.avatar_url ?? undefined}
                      />
                      <AvatarFallback className="font-mono text-xs">
                        {getInitials(m.profile?.full_name ?? null)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono font-bold tracking-tight text-sm truncate">
                          {m.profile?.full_name ?? "Sin nombre"}
                        </p>
                        {isMe && (
                          <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
                            (tu)
                          </span>
                        )}
                      </div>

                      {/* Stats row */}
                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                          <ArrowRightLeft className="w-3 h-3" />
                          {m.totalSwitches} cambios
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`} perdidos
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                          <Zap className="w-3 h-3" />
                          {m.switchesPerDay.toFixed(1)}/dia
                        </span>
                      </div>

                      {/* 7-day mini columns */}
                      <div className="flex items-end gap-1 mt-2.5">
                        {last7Days.map((date) => {
                          const day = m.days.find((d) => d.date === date);
                          const sw = day?.switches ?? 0;
                          const maxSwitches = 8;
                          const heightPct = Math.min(sw / maxSwitches, 1);
                          const barH = Math.max(heightPct * 24, 2);
                          // intensity: more switches = redder
                          const intensity =
                            sw === 0
                              ? "bg-muted-foreground/20"
                              : sw <= 2
                                ? "bg-amber-500/60"
                                : sw <= 4
                                  ? "bg-orange-500/80"
                                  : "bg-red-500";
                          return (
                            <div
                              key={date}
                              className="flex flex-col items-center gap-0.5"
                              title={`${formatDateShort(date)}: ${sw} cambios`}
                            >
                              <div
                                className={cn("w-3", intensity)}
                                style={{ height: `${barH}px` }}
                              />
                              <span className="font-mono text-[7px] text-muted-foreground">
                                {new Date(date + "T12:00:00").getDate()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Cost + expand */}
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-red-500">
                        ${m.totalCost.toFixed(0)}
                      </p>
                      <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                        perdidos
                      </p>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground mt-1" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground mt-1" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded daily detail */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3">
                    <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
                      Detalle diario
                    </p>
                    {m.days
                      .filter((d) => d.entries.length > 0)
                      .map((day) => (
                        <div key={day.date} className="mb-4 last:mb-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="font-mono text-[10px] font-bold text-foreground">
                              {formatDateShort(day.date)}
                            </p>
                            {day.switches > 0 && (
                              <span className="font-mono text-[9px] text-red-500 tabular-nums">
                                {day.switches} cambios = {day.switches * SWITCH_COST_MINUTES}min = $
                                {(
                                  (day.switches * SWITCH_COST_MINUTES * HOURLY_RATE) /
                                  60
                                ).toFixed(0)}
                              </span>
                            )}
                          </div>

                          {/* Timeline segments */}
                          <div className="flex items-center gap-0">
                            {day.entries.map((entry, eIdx) => {
                              const isSwitch = day.switchPoints.some(
                                (sp) =>
                                  sp.hour === entry.hour &&
                                  sp.toCategory === entry.category
                              );
                              return (
                                <Fragment key={entry.hour}>
                                  {isSwitch && (
                                    <div className="flex flex-col items-center mx-0.5 shrink-0">
                                      <Zap className="w-3 h-3 text-red-500" />
                                    </div>
                                  )}
                                  <div
                                    className={cn(
                                      "h-6 flex-1 min-w-[24px] flex items-center justify-center relative group",
                                      getCategoryBgColor(entry.category)
                                    )}
                                    title={`${formatHourShort(entry.hour)} - ${CATEGORIES[entry.category]?.label ?? entry.category}`}
                                  >
                                    <span className="font-mono text-[7px] text-white font-bold opacity-80">
                                      {CATEGORIES[entry.category]?.emoji ?? "??"}
                                    </span>
                                  </div>
                                </Fragment>
                              );
                            })}
                          </div>

                          {/* Legend for the day */}
                          <div className="flex flex-wrap gap-2 mt-1">
                            {Array.from(
                              new Set(day.entries.map((e) => e.category))
                            ).map((cat) => (
                              <span
                                key={cat}
                                className="flex items-center gap-1 text-[8px] font-mono text-muted-foreground"
                              >
                                <span
                                  className={cn(
                                    "w-2 h-2 inline-block",
                                    getCategoryBgColor(cat)
                                  )}
                                />
                                {CATEGORIES[cat]?.label ?? cat}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}

                    {m.days.filter((d) => d.entries.length > 0).length === 0 && (
                      <p className="font-mono text-[10px] text-muted-foreground">
                        Sin entradas esta semana.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Worst switch patterns */}
      {patterns.length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Patrones de cambio mas costosos
          </p>
          <div className="space-y-1">
            {patterns.map((p) => {
              const worstUser = Array.from(p.users.entries()).sort(
                (a, b) => b[1] - a[1]
              )[0];
              const worstProfile = worstUser
                ? members.find((m) => m.userId === worstUser[0])?.profile
                : null;
              const costPerSwitch = (SWITCH_COST_MINUTES * HOURLY_RATE) / 60;

              return (
                <div
                  key={p.pattern}
                  className="border border-border p-3 flex items-center gap-3"
                >
                  {/* Pattern visualization */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={cn(
                        "w-6 h-6 flex items-center justify-center",
                        getCategoryBgColor(p.fromCategory)
                      )}
                    >
                      <span className="font-mono text-[7px] text-white font-bold">
                        {CATEGORIES[p.fromCategory]?.emoji ?? "??"}
                      </span>
                    </span>
                    <Zap className="w-3 h-3 text-red-500 shrink-0" />
                    <span
                      className={cn(
                        "w-6 h-6 flex items-center justify-center",
                        getCategoryBgColor(p.toCategory)
                      )}
                    >
                      <span className="font-mono text-[7px] text-white font-bold">
                        {CATEGORIES[p.toCategory]?.emoji ?? "??"}
                      </span>
                    </span>
                  </div>

                  {/* Pattern label */}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[11px] font-bold text-foreground truncate">
                      {CATEGORIES[p.fromCategory]?.label ?? p.fromCategory}{" "}
                      &rarr;{" "}
                      {CATEGORIES[p.toCategory]?.label ?? p.toCategory}
                    </p>
                    <p className="font-mono text-[9px] text-muted-foreground">
                      Peor infractor:{" "}
                      {worstProfile?.full_name ?? "Desconocido"} (
                      {worstUser?.[1] ?? 0}x)
                    </p>
                  </div>

                  {/* Count + cost */}
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-bold tabular-nums text-red-500">
                      {p.count}x
                    </p>
                    <p className="font-mono text-[9px] tabular-nums text-muted-foreground">
                      ${(p.count * costPerSwitch).toFixed(0)} total
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Formula explanation */}
      <div className="border border-border p-4 mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Metodologia
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-bold">1 cambio =</span>{" "}
            categoria diferente en hora consecutiva
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-bold">Costo =</span>{" "}
            23 min perdidos por cambio (investigacion real)
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-bold">Dinero =</span>{" "}
            $50/hora x minutos perdidos / 60
          </div>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground mt-3 leading-relaxed">
          Ejemplo: deep_work(9am) &rarr; meeting(10am) &rarr; deep_work(11am) &rarr; admin(12pm) = 3 cambios = 69 min = $57.50
        </p>
      </div>

      {/* Bottom */}
      <div className="text-center py-6 border-t border-border/30">
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60">
          Cada cambio de contexto destruye 23 minutos. El multitasking es una mentira cara.
        </p>
      </div>
    </div>
  );
}
