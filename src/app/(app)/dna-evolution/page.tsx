"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { TimeEntry } from "@/lib/types/database";
import type { WorkCategory } from "@/lib/types/database";
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dna,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  Users,
} from "lucide-react";

// ─── TYPES ──────────────────────────────────────────────────

interface MemberProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string;
}

interface MonthData {
  monthKey: string; // "2026-05"
  monthLabel: string; // "May 2026"
  totalEntries: number;
  categoryDistribution: Record<WorkCategory, number>; // percentage
  avgDailyHours: number;
  proofRate: number;
  avgMood: number | null;
  avgEnergy: number | null;
  peakHour: number | null;
}

interface MemberDna {
  profile: MemberProfile;
  months: MonthData[];
  driftScore: number;
}

interface Mutation {
  category: string;
  label: string;
  prevPercent: number;
  currPercent: number;
  delta: number;
  type: "category" | "proof";
}

// ─── HELPERS ────────────────────────────────────────────────

const ALL_CATEGORIES = Object.keys(CATEGORIES) as WorkCategory[];

function computeMonthData(
  entries: TimeEntry[],
  monthKey: string,
  monthLabel: string
): MonthData {
  const totalEntries = entries.length;

  // Category distribution
  const categoryCounts: Record<string, number> = {};
  for (const cat of ALL_CATEGORIES) {
    categoryCounts[cat] = 0;
  }
  for (const e of entries) {
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
  }
  const categoryDistribution = {} as Record<WorkCategory, number>;
  for (const cat of ALL_CATEGORIES) {
    categoryDistribution[cat] =
      totalEntries > 0
        ? Math.round((categoryCounts[cat] / totalEntries) * 100)
        : 0;
  }

  // Average daily hours
  const uniqueDates = new Set(entries.map((e) => e.date));
  const avgDailyHours =
    uniqueDates.size > 0
      ? Math.round((totalEntries / uniqueDates.size) * 10) / 10
      : 0;

  // Proof rate
  const withProof = entries.filter(
    (e) => e.proof_urls && e.proof_urls.length > 0
  ).length;
  const proofRate =
    totalEntries > 0 ? Math.round((withProof / totalEntries) * 100) : 0;

  // Mood & Energy averages
  const moods = entries.filter((e) => e.mood != null).map((e) => e.mood!);
  const energies = entries
    .filter((e) => e.energy != null)
    .map((e) => e.energy!);
  const avgMood =
    moods.length > 0
      ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10
      : null;
  const avgEnergy =
    energies.length > 0
      ? Math.round(
          (energies.reduce((a, b) => a + b, 0) / energies.length) * 10
        ) / 10
      : null;

  // Peak hour
  const hourCounts: Record<number, number> = {};
  for (const e of entries) {
    hourCounts[e.hour] = (hourCounts[e.hour] || 0) + 1;
  }
  let peakHour: number | null = null;
  let maxCount = 0;
  for (const [hour, count] of Object.entries(hourCounts)) {
    if (count > maxCount) {
      maxCount = count;
      peakHour = Number(hour);
    }
  }

  return {
    monthKey,
    monthLabel,
    totalEntries,
    categoryDistribution,
    avgDailyHours,
    proofRate,
    avgMood,
    avgEnergy,
    peakHour,
  };
}

function computeDriftScore(months: MonthData[]): number {
  if (months.length < 2) return 0;

  let totalDrift = 0;
  for (let i = 1; i < months.length; i++) {
    const prev = months[i - 1];
    const curr = months[i];
    for (const cat of ALL_CATEGORIES) {
      totalDrift += Math.abs(
        curr.categoryDistribution[cat] - prev.categoryDistribution[cat]
      );
    }
    // Also factor in proof rate changes
    totalDrift += Math.abs(curr.proofRate - prev.proofRate) * 0.5;
  }

  // Normalize: divide by number of transitions, max ~100
  const avgDrift = totalDrift / (months.length - 1);
  return Math.min(100, Math.round(avgDrift));
}

function getMutations(prev: MonthData, curr: MonthData): Mutation[] {
  const mutations: Mutation[] = [];

  for (const cat of ALL_CATEGORIES) {
    const delta =
      curr.categoryDistribution[cat] - prev.categoryDistribution[cat];
    if (Math.abs(delta) >= 5) {
      mutations.push({
        category: cat,
        label: CATEGORIES[cat].label,
        prevPercent: prev.categoryDistribution[cat],
        currPercent: curr.categoryDistribution[cat],
        delta,
        type: "category",
      });
    }
  }

  // Proof rate change
  const proofDelta = curr.proofRate - prev.proofRate;
  if (Math.abs(proofDelta) >= 5) {
    mutations.push({
      category: "proof",
      label: "Evidencia",
      prevPercent: prev.proofRate,
      currPercent: curr.proofRate,
      delta: proofDelta,
      type: "proof",
    });
  }

  // Sort by absolute delta descending
  mutations.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return mutations.slice(0, 6);
}

function formatHourLabel(h: number): string {
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:00 ${suffix}`;
}

function getDriftLabel(score: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (score <= 15)
    return {
      label: "Muy estable",
      color: "text-green-600",
      bgColor: "bg-green-500/10",
    };
  if (score <= 30)
    return {
      label: "Estable",
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
    };
  if (score <= 50)
    return {
      label: "Moderado",
      color: "text-yellow-600",
      bgColor: "bg-yellow-500/10",
    };
  if (score <= 70)
    return {
      label: "Inestable",
      color: "text-orange-600",
      bgColor: "bg-orange-500/10",
    };
  return {
    label: "Muy inestable",
    color: "text-red-600",
    bgColor: "bg-red-500/10",
  };
}

// ─── DNA STRAND COMPONENT ──────────────────────────────────

function DnaStrand({ months }: { months: MonthData[] }) {
  if (months.length === 0) return null;

  return (
    <div className="space-y-1">
      {months.map((month, idx) => {
        // Filter categories with > 0%
        const segments = ALL_CATEGORIES.filter(
          (cat) => month.categoryDistribution[cat] > 0
        );

        return (
          <div key={month.monthKey} className="relative">
            {/* Connecting line to next month */}
            {idx < months.length - 1 && (
              <div className="absolute left-1/2 -bottom-1 w-px h-2 bg-border/60 z-0" />
            )}

            <div className="flex items-center gap-3">
              {/* Month label */}
              <span className="text-xs text-muted-foreground w-20 shrink-0 text-right tabular-nums">
                {month.monthLabel}
              </span>

              {/* DNA bar */}
              <div className="flex-1 flex h-8 rounded-full overflow-hidden bg-accent/30 relative">
                {segments.map((cat, segIdx) => {
                  const pct = month.categoryDistribution[cat];
                  if (pct === 0) return null;
                  const colorClass =
                    CATEGORY_COLORS[cat] || "bg-gray-400";

                  return (
                    <div
                      key={cat}
                      className={cn(
                        colorClass,
                        "h-full transition-all duration-700 ease-in-out relative group/seg",
                        segIdx === 0 && "rounded-l-full",
                        segIdx === segments.length - 1 && "rounded-r-full"
                      )}
                      style={{ width: `${pct}%` }}
                      title={`${CATEGORIES[cat].label}: ${pct}%`}
                    >
                      {/* Tooltip on hover */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/seg:opacity-100 transition-opacity">
                        {pct >= 12 && (
                          <span className="text-[10px] font-bold text-white drop-shadow-md">
                            {pct}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* If no entries */}
                {month.totalEntries === 0 && (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground">
                      Sin datos
                    </span>
                  </div>
                )}
              </div>

              {/* Entry count */}
              <span className="text-xs text-muted-foreground w-10 shrink-0 tabular-nums">
                {month.totalEntries}h
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MUTATIONS LIST ────────────────────────────────────────

function MutationsList({ months }: { months: MonthData[] }) {
  if (months.length < 2) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Se necesitan al menos 2 meses de datos para detectar mutaciones.
      </p>
    );
  }

  const prev = months[months.length - 2];
  const curr = months[months.length - 1];
  const mutations = getMutations(prev, curr);

  if (mutations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <Activity className="w-6 h-6 text-green-500" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Sin cambios significativos entre {prev.monthLabel} y{" "}
          {curr.monthLabel}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">
        Cambios entre {prev.monthLabel} y {curr.monthLabel}:
      </p>
      {mutations.map((m, i) => {
        const isPositive =
          m.type === "proof"
            ? m.delta > 0
            : m.category === "deep_work" ||
                m.category === "planning" ||
                m.category === "learning"
              ? m.delta > 0
              : m.category === "meeting" || m.category === "blocked"
                ? m.delta < 0
                : true;

        return (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl border",
              isPositive
                ? "bg-green-500/5 border-green-500/20"
                : "bg-red-500/5 border-red-500/20"
            )}
          >
            {m.delta > 0 ? (
              <TrendingUp
                className={cn(
                  "w-4 h-4 shrink-0",
                  isPositive ? "text-green-500" : "text-red-500"
                )}
              />
            ) : (
              <TrendingDown
                className={cn(
                  "w-4 h-4 shrink-0",
                  isPositive ? "text-green-500" : "text-red-500"
                )}
              />
            )}
            <p className="text-sm flex-1">
              <span className="font-medium">{m.label}</span> pasó de{" "}
              <span className="font-bold tabular-nums">{m.prevPercent}%</span>{" "}
              a{" "}
              <span className="font-bold tabular-nums">{m.currPercent}%</span>
            </p>
            <Badge
              className={cn(
                "tabular-nums border font-bold",
                isPositive
                  ? "bg-green-500/10 text-green-600 border-green-500/30"
                  : "bg-red-500/10 text-red-600 border-red-500/30"
              )}
            >
              {m.delta > 0 ? "+" : ""}
              {m.delta}%
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

// ─── MONTHLY STATS TABLE ───────────────────────────────────

function MonthlyStatsTable({ months }: { months: MonthData[] }) {
  if (months.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">
              Mes
            </th>
            <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground">
              Hrs/dia
            </th>
            <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground">
              Top categoría
            </th>
            <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground">
              Evidencia
            </th>
            <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">
              Ánimo
            </th>
            <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">
              Hora pico
            </th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => {
            // Find top category
            let topCat: WorkCategory = "deep_work";
            let topPct = 0;
            for (const cat of ALL_CATEGORIES) {
              if (month.categoryDistribution[cat] > topPct) {
                topPct = month.categoryDistribution[cat];
                topCat = cat;
              }
            }

            return (
              <tr
                key={month.monthKey}
                className="border-b border-border/30 last:border-0"
              >
                <td className="py-2.5 px-2 font-medium text-xs">
                  {month.monthLabel}
                </td>
                <td className="py-2.5 px-2 text-center tabular-nums">
                  <span
                    className={cn(
                      "font-bold",
                      month.avgDailyHours >= 7
                        ? "text-green-600"
                        : month.avgDailyHours >= 5
                          ? "text-yellow-600"
                          : "text-red-600"
                    )}
                  >
                    {month.avgDailyHours}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-center">
                  <Badge
                    className={cn(
                      "text-[10px]",
                      CATEGORIES[topCat].bgColor,
                      CATEGORIES[topCat].color
                    )}
                  >
                    {CATEGORIES[topCat].emoji} {topPct}%
                  </Badge>
                </td>
                <td className="py-2.5 px-2 text-center tabular-nums">
                  <span
                    className={cn(
                      "font-bold",
                      month.proofRate >= 80
                        ? "text-green-600"
                        : month.proofRate >= 50
                          ? "text-yellow-600"
                          : "text-red-600"
                    )}
                  >
                    {month.proofRate}%
                  </span>
                </td>
                <td className="py-2.5 px-2 text-center hidden sm:table-cell">
                  {month.avgMood != null ? (
                    <span className="tabular-nums">
                      {month.avgMood.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>
                <td className="py-2.5 px-2 text-center hidden sm:table-cell text-xs text-muted-foreground">
                  {month.peakHour != null ? (
                    <span className="tabular-nums">
                      {formatHourLabel(month.peakHour)}
                    </span>
                  ) : (
                    "--"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── TEAM DNA COMPARISON ───────────────────────────────────

function TeamDnaComparison({
  allMemberDna,
  currentMemberId,
}: {
  allMemberDna: MemberDna[];
  currentMemberId: string | null;
}) {
  // Show each member's latest month DNA side by side
  const membersWithData = allMemberDna.filter((m) => m.months.length > 0);

  if (membersWithData.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Users className="w-8 h-8 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">
          Sin datos de equipo disponibles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {membersWithData.map((member) => {
        const latestMonth = member.months[member.months.length - 1];
        const segments = ALL_CATEGORIES.filter(
          (cat) => latestMonth.categoryDistribution[cat] > 0
        );
        const drift = getDriftLabel(member.driftScore);
        const isSelected = member.profile.id === currentMemberId;

        return (
          <div
            key={member.profile.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl border transition-all duration-300",
              isSelected
                ? "border-primary/30 bg-primary/5"
                : "border-border/50 hover:border-border"
            )}
          >
            {/* Avatar */}
            <Avatar className="ring-2 ring-background shadow-sm" size="sm">
              <AvatarImage src={member.profile.avatar_url ?? undefined} />
              <AvatarFallback className="text-[10px]">
                {getInitials(member.profile.full_name)}
              </AvatarFallback>
            </Avatar>

            {/* Name */}
            <div className="w-20 shrink-0">
              <p className="text-xs font-medium truncate">
                {member.profile.full_name ?? member.profile.email.split("@")[0]}
              </p>
              <p className={cn("text-[10px]", drift.color)}>{drift.label}</p>
            </div>

            {/* DNA bar */}
            <div className="flex-1 flex h-6 rounded-full overflow-hidden bg-accent/30">
              {segments.map((cat, segIdx) => {
                const pct = latestMonth.categoryDistribution[cat];
                if (pct === 0) return null;
                return (
                  <div
                    key={cat}
                    className={cn(
                      CATEGORY_COLORS[cat],
                      "h-full transition-all duration-500",
                      segIdx === 0 && "rounded-l-full",
                      segIdx === segments.length - 1 && "rounded-r-full"
                    )}
                    style={{ width: `${pct}%` }}
                    title={`${CATEGORIES[cat].label}: ${pct}%`}
                  />
                );
              })}
            </div>

            {/* Drift badge */}
            <Badge
              className={cn(
                "text-[10px] tabular-nums border shrink-0",
                drift.bgColor,
                drift.color
              )}
            >
              {member.driftScore}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

// ─── CATEGORY LEGEND ───────────────────────────────────────

function CategoryLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {ALL_CATEGORIES.map((cat) => (
        <div key={cat} className="flex items-center gap-1.5">
          <div
            className={cn("w-3 h-3 rounded-sm", CATEGORY_COLORS[cat])}
          />
          <span className="text-[11px] text-muted-foreground">
            {CATEGORIES[cat].label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────────

export default function DnaEvolutionPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [allMemberDna, setAllMemberDna] = useState<MemberDna[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!orgId || !userId) return;

    async function load() {
      setLoading(true);

      // Get all org members with profiles
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(id, full_name, avatar_url, email)")
        .eq("org_id", orgId!);

      if (!members || members.length === 0) {
        setLoading(false);
        return;
      }

      // Calculate 6-month range
      const now = new Date();
      const sixMonthsAgo = subMonths(startOfMonth(now), 5);
      const rangeStart = format(sixMonthsAgo, "yyyy-MM-dd");
      const rangeEnd = format(endOfMonth(now), "yyyy-MM-dd");

      // Fetch all time entries for the org in the range
      const { data: entries } = await supabase
        .from("time_entries")
        .select("*")
        .eq("org_id", orgId!)
        .gte("date", rangeStart)
        .lte("date", rangeEnd)
        .order("date", { ascending: true });

      const allEntries = entries ?? [];

      // Build month keys
      const monthKeys: { key: string; label: string; start: Date; end: Date }[] =
        [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(startOfMonth(now), i);
        const key = format(monthDate, "yyyy-MM");
        const label = format(monthDate, "MMM yyyy", { locale: es });
        // Capitalize first letter
        const capitalizedLabel =
          label.charAt(0).toUpperCase() + label.slice(1);
        monthKeys.push({
          key,
          label: capitalizedLabel,
          start: startOfMonth(monthDate),
          end: endOfMonth(monthDate),
        });
      }

      // Process each member
      const dnaResults: MemberDna[] = [];

      for (const member of members) {
        const profile = member.profiles as unknown as MemberProfile;
        if (!profile) continue;

        const memberEntries = allEntries.filter(
          (e) => e.user_id === profile.id
        );

        const months: MonthData[] = [];
        for (const mk of monthKeys) {
          const monthEntries = memberEntries.filter((e) => {
            return e.date.startsWith(mk.key);
          });

          // Only include months that have data
          if (monthEntries.length > 0) {
            months.push(computeMonthData(monthEntries, mk.key, mk.label));
          }
        }

        const driftScore = computeDriftScore(months);

        dnaResults.push({
          profile,
          months,
          driftScore,
        });
      }

      // Sort by name
      dnaResults.sort((a, b) =>
        (a.profile.full_name ?? a.profile.email).localeCompare(
          b.profile.full_name ?? b.profile.email
        )
      );

      setAllMemberDna(dnaResults);
      setSelectedMemberId(userId);
      setLoading(false);
    }

    load();
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── COMPUTED ──────────────────────────────────────────────

  const selectedDna = useMemo(
    () => allMemberDna.find((m) => m.profile.id === selectedMemberId) ?? null,
    [allMemberDna, selectedMemberId]
  );

  // ─── RENDER ────────────────────────────────────────────────

  if (orgLoading || loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Cargando...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Dna className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">
          DNA Evolución
        </h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        Cómo han evolucionado los patrones de trabajo de cada persona mes a mes.
      </p>

      {/* Member selector */}
      <section className="mb-8">
        <div className="flex flex-wrap gap-2">
          {allMemberDna.map((member) => {
            const isSelected = member.profile.id === selectedMemberId;
            return (
              <button
                key={member.profile.id}
                onClick={() => setSelectedMemberId(member.profile.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all duration-200",
                  isSelected
                    ? "border-primary bg-primary/5 text-foreground font-medium shadow-sm"
                    : "border-border/50 text-muted-foreground hover:border-border hover:bg-accent/40"
                )}
              >
                <Avatar className="ring-2 ring-background shadow-sm" size="sm">
                  <AvatarImage
                    src={member.profile.avatar_url ?? undefined}
                  />
                  <AvatarFallback className="text-[10px]">
                    {getInitials(member.profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate max-w-[120px]">
                  {member.profile.full_name ??
                    member.profile.email.split("@")[0]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Selected member content */}
      {selectedDna ? (
        selectedDna.months.length > 0 ? (
          <>
            {/* DNA Strand visualization */}
            <section className="mb-8">
              <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Dna className="w-4 h-4 text-primary" />
                    Cadena de DNA Laboral
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DnaStrand months={selectedDna.months} />
                  <div className="pt-3 border-t border-border/30">
                    <CategoryLegend />
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Drift Score */}
            <section className="mb-8">
              <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "w-14 h-14 rounded-xl flex items-center justify-center shrink-0",
                        getDriftLabel(selectedDna.driftScore).bgColor
                      )}
                    >
                      <Activity
                        className={cn(
                          "w-7 h-7",
                          getDriftLabel(selectedDna.driftScore).color
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Drift Score
                      </p>
                      <div className="flex items-baseline gap-3">
                        <p
                          className={cn(
                            "text-4xl font-black tabular-nums tracking-tight",
                            getDriftLabel(selectedDna.driftScore).color
                          )}
                        >
                          {selectedDna.driftScore}
                        </p>
                        <Badge
                          className={cn(
                            "border",
                            getDriftLabel(selectedDna.driftScore).bgColor,
                            getDriftLabel(selectedDna.driftScore).color
                          )}
                        >
                          {getDriftLabel(selectedDna.driftScore).label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedDna.driftScore <= 30
                          ? "Los patrones de trabajo se han mantenido consistentes."
                          : selectedDna.driftScore <= 60
                            ? "Se han detectado cambios moderados en los patrones de trabajo."
                            : "Los patrones de trabajo han cambiado significativamente entre meses."}
                      </p>
                    </div>

                    {/* Drift meter */}
                    <div className="hidden sm:block w-32 shrink-0">
                      <div className="h-3 rounded-full bg-accent/50 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700",
                            selectedDna.driftScore <= 30
                              ? "bg-green-500"
                              : selectedDna.driftScore <= 60
                                ? "bg-yellow-500"
                                : "bg-red-500"
                          )}
                          style={{
                            width: `${Math.min(100, selectedDna.driftScore)}%`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[9px] text-muted-foreground">
                          Estable
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          Inestable
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Key Mutations */}
            <section className="mb-8">
              <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Mutaciones Clave
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MutationsList months={selectedDna.months} />
                </CardContent>
              </Card>
            </section>

            {/* Monthly stats table */}
            <section className="mb-8">
              <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Estadísticas Mensuales
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MonthlyStatsTable months={selectedDna.months} />
                </CardContent>
              </Card>
            </section>
          </>
        ) : (
          /* Empty state for selected member */
          <section className="mb-8">
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Dna className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-sm font-medium">Sin datos disponibles</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Esta persona no tiene entradas registradas en los últimos 6
                    meses.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        )
      ) : null}

      {/* Team-wide DNA comparison */}
      <section className="mb-8">
        <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              DNA del Equipo (mes actual)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TeamDnaComparison
              allMemberDna={allMemberDna}
              currentMemberId={selectedMemberId}
            />
            <div className="pt-3 border-t border-border/30">
              <CategoryLegend />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
