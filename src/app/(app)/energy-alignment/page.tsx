"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TimeEntry, WorkCategory } from "@/lib/types/database";
import { cn, getTodayMTY, getInitials, formatHourShort } from "@/lib/utils";
import { CATEGORIES, CATEGORY_COLORS, WORK_HOURS } from "@/lib/constants";
import { format, subDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Zap,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface EnergyHourProfile {
  hour: number;
  avgEnergy: number;
  entries: number;
  dominantCategory: WorkCategory | null;
  categoryCounts: Record<string, number>;
}

interface MisalignmentCallout {
  description: string;
  severity: "high" | "medium";
  count: number;
}

interface PersonAlignment {
  userId: string;
  profile: Profile;
  score: number;
  label: "ALINEADO" | "DESALINEADO" | "DESPERDICIO";
  labelColor: string;
  energyProfile: EnergyHourProfile[];
  peakHours: number[];
  lowHours: number[];
  callouts: MisalignmentCallout[];
  totalEntriesWithEnergy: number;
  alignedEntries: number;
  suggestion: string | null;
}

// ============================================================
// High-value categories = should be done during peak energy
// Low-value categories = should NOT consume peak energy
// ============================================================

const HIGH_VALUE_CATEGORIES: WorkCategory[] = ["deep_work", "review"];
const LOW_VALUE_CATEGORIES: WorkCategory[] = ["admin", "break", "meeting"];

// ============================================================
// Energy color by level
// ============================================================

function getEnergyColor(level: number): string {
  switch (level) {
    case 1: return "bg-red-500";
    case 2: return "bg-orange-500";
    case 3: return "bg-amber-400";
    case 4: return "bg-green-500";
    case 5: return "bg-emerald-400";
    default: return "bg-muted";
  }
}

function getEnergyTextColor(level: number): string {
  switch (level) {
    case 1: return "text-red-500";
    case 2: return "text-orange-500";
    case 3: return "text-amber-400";
    case 4: return "text-green-500";
    case 5: return "text-emerald-400";
    default: return "text-muted-foreground";
  }
}

// ============================================================
// Alignment Calculation Engine
// ============================================================

function computeAlignment(
  entries: TimeEntry[],
  profile: Profile
): PersonAlignment | null {
  // Only entries with energy data
  const withEnergy = entries.filter((e) => e.energy != null && e.energy > 0);
  if (withEnergy.length < 3) return null;

  // Build energy profile by hour
  const hourMap = new Map<number, { energySum: number; count: number; categories: Record<string, number> }>();

  for (const e of withEnergy) {
    if (!hourMap.has(e.hour)) {
      hourMap.set(e.hour, { energySum: 0, count: 0, categories: {} });
    }
    const h = hourMap.get(e.hour)!;
    h.energySum += e.energy!;
    h.count += 1;
    h.categories[e.category] = (h.categories[e.category] || 0) + 1;
  }

  const energyProfile: EnergyHourProfile[] = WORK_HOURS.map((hour) => {
    const data = hourMap.get(hour);
    if (!data || data.count === 0) {
      return { hour, avgEnergy: 0, entries: 0, dominantCategory: null, categoryCounts: {} };
    }
    const avgEnergy = data.energySum / data.count;
    // Find dominant category
    let dominantCategory: WorkCategory | null = null;
    let maxCount = 0;
    for (const [cat, count] of Object.entries(data.categories)) {
      if (count > maxCount) {
        maxCount = count;
        dominantCategory = cat as WorkCategory;
      }
    }
    return { hour, avgEnergy, entries: data.count, dominantCategory, categoryCounts: data.categories };
  });

  // Find peak and low energy hours
  const peakHours = withEnergy
    .filter((e) => e.energy! >= 4)
    .map((e) => e.hour);
  const peakHoursUnique = [...new Set(peakHours)].sort((a, b) => a - b);

  const lowHours = withEnergy
    .filter((e) => e.energy! <= 2)
    .map((e) => e.hour);
  const lowHoursUnique = [...new Set(lowHours)].sort((a, b) => a - b);

  // Calculate alignment score
  let alignedCount = 0;
  let totalScored = 0;

  for (const e of withEnergy) {
    const energy = e.energy!;
    const cat = e.category;

    if (energy >= 4) {
      // Peak energy
      totalScored++;
      if (HIGH_VALUE_CATEGORIES.includes(cat)) {
        alignedCount++; // Good: high-value work during peak
      }
      // If low-value work during peak: no points (bad)
    } else if (energy <= 2) {
      // Low energy
      totalScored++;
      if (!HIGH_VALUE_CATEGORIES.includes(cat)) {
        alignedCount++; // Good: not doing deep work when drained
      }
      // If deep work during low energy: no points (bad - wasted effort)
    } else {
      // Medium energy (3): neutral, still count toward total
      totalScored++;
      alignedCount += 0.5; // Partial credit for mid-energy
    }
  }

  const score = totalScored > 0 ? Math.round((alignedCount / totalScored) * 100) : 0;

  // Determine label
  let label: PersonAlignment["label"];
  let labelColor: string;
  if (score >= 80) {
    label = "ALINEADO";
    labelColor = "text-green-500";
  } else if (score >= 50) {
    label = "DESALINEADO";
    labelColor = "text-amber-500";
  } else {
    label = "DESPERDICIO";
    labelColor = "text-red-500";
  }

  // Generate misalignment callouts
  const callouts: MisalignmentCallout[] = [];

  // Callout: admin/break/meeting during peak energy
  for (const lowCat of LOW_VALUE_CATEGORIES) {
    const peakLowEntries = withEnergy.filter(
      (e) => e.energy! >= 4 && e.category === lowCat
    );
    if (peakLowEntries.length >= 2) {
      const catLabel = CATEGORIES[lowCat]?.label || lowCat;
      callouts.push({
        description: `${peakLowEntries.length} veces hizo ${catLabel} con energía 4-5`,
        severity: "high",
        count: peakLowEntries.length,
      });
    }
  }

  // Callout: deep_work during low energy
  const deepWorkLowEnergy = withEnergy.filter(
    (e) => e.energy! <= 2 && e.category === "deep_work"
  );
  if (deepWorkLowEnergy.length >= 2) {
    callouts.push({
      description: `${deepWorkLowEnergy.length} veces intentó Deep Work con energía 1-2`,
      severity: "high",
      count: deepWorkLowEnergy.length,
    });
  }

  // Callout: review during low energy
  const reviewLowEnergy = withEnergy.filter(
    (e) => e.energy! <= 2 && e.category === "review"
  );
  if (reviewLowEnergy.length >= 2) {
    callouts.push({
      description: `${reviewLowEnergy.length} veces hizo Code Review con energía baja`,
      severity: "medium",
      count: reviewLowEnergy.length,
    });
  }

  // Sort callouts by severity and count
  callouts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    return b.count - a.count;
  });

  // Generate suggestion
  let suggestion: string | null = null;
  const peakEnergyHours = energyProfile
    .filter((h) => h.avgEnergy >= 4 && h.entries >= 2)
    .sort((a, b) => b.avgEnergy - a.avgEnergy);

  if (peakEnergyHours.length > 0) {
    const peakRange = peakEnergyHours.map((h) => formatHourShort(h.hour)).join(", ");
    const currentPeakCategories = peakEnergyHours
      .filter((h) => h.dominantCategory && LOW_VALUE_CATEGORIES.includes(h.dominantCategory))
      .map((h) => CATEGORIES[h.dominantCategory!]?.label || h.dominantCategory);

    if (currentPeakCategories.length > 0) {
      suggestion = `Tu energía máxima es a las ${peakRange}. Deberías hacer Deep Work ahí, no ${currentPeakCategories[0]}.`;
    } else {
      suggestion = `Tu energía máxima es a las ${peakRange}. Protege esas horas para Deep Work.`;
    }
  }

  return {
    userId: profile.id,
    profile,
    score,
    label,
    labelColor,
    energyProfile,
    peakHours: peakHoursUnique,
    lowHours: lowHoursUnique,
    callouts,
    totalEntriesWithEnergy: withEnergy.length,
    alignedEntries: Math.round(alignedCount),
    suggestion,
  };
}

// ============================================================
// Page Component
// ============================================================

export default function EnergyAlignmentPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Load data
  useEffect(() => {
    if (orgLoading || !orgId) return;
    const supabase = createClient();

    async function loadData() {
      setLoading(true);
      const today = getTodayMTY();
      const from = format(subDays(parseISO(today), 14), "yyyy-MM-dd");

      const [entriesRes, profilesRes] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*")
          .eq("org_id", orgId!)
          .gte("date", from)
          .lte("date", today)
          .is("deleted_at", null)
          .order("date", { ascending: true })
          .order("hour", { ascending: true }),
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

  // Compute alignments for each person
  const alignments = useMemo(() => {
    if (entries.length === 0 || Object.keys(profiles).length === 0) return [];

    const results: PersonAlignment[] = [];

    for (const [uid, profile] of Object.entries(profiles)) {
      const userEntries = entries.filter((e) => e.user_id === uid);
      const alignment = computeAlignment(userEntries, profile);
      if (alignment) results.push(alignment);
    }

    // Sort by score ascending (worst first)
    results.sort((a, b) => a.score - b.score);
    return results;
  }, [entries, profiles]);

  // Team insights
  const teamInsights = useMemo(() => {
    if (alignments.length === 0) return null;

    const best = alignments.reduce((a, b) => (a.score > b.score ? a : b));
    const worst = alignments.reduce((a, b) => (a.score < b.score ? a : b));

    // Most common misalignment pattern
    const patternCounts = new Map<string, number>();
    for (const a of alignments) {
      for (const c of a.callouts) {
        const key = c.description.replace(/^\d+ veces /, "");
        patternCounts.set(key, (patternCounts.get(key) || 0) + c.count);
      }
    }
    let commonPattern = "Sin patrón común detectado";
    let commonPatternCount = 0;
    for (const [pattern, count] of patternCounts) {
      if (count > commonPatternCount) {
        commonPattern = pattern;
        commonPatternCount = count;
      }
    }

    const avgScore = Math.round(
      alignments.reduce((sum, a) => sum + a.score, 0) / alignments.length
    );

    return { best, worst, commonPattern, commonPatternCount, avgScore };
  }, [alignments]);

  function toggleCard(id: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────
  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Analizando energía...
        </div>
      </div>
    );
  }

  if (!orgId || !userId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground font-mono text-xs">
          Crea o únete a un equipo desde el Dashboard.
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Zap className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Alineación de Energía
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Compara cuándo reportas alta energía vs qué trabajo haces --- últimos 14 días
        </p>
      </div>

      {/* Team insights */}
      {teamInsights && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="bg-accent/30 border border-border p-3">
            <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
              Score promedio
            </div>
            <div className={cn(
              "font-mono text-2xl tabular-nums tracking-tight",
              teamInsights.avgScore >= 80 ? "text-green-500" :
              teamInsights.avgScore >= 50 ? "text-amber-500" : "text-red-500"
            )}>
              {teamInsights.avgScore}
            </div>
          </div>

          <div className="bg-accent/30 border border-border p-3">
            <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
              Mejor alineación
            </div>
            <div className="font-mono text-sm tabular-nums tracking-tight truncate text-green-500">
              {teamInsights.best.profile.full_name || "---"}
            </div>
            <div className="font-mono text-[10px] tabular-nums text-green-500">
              {teamInsights.best.score}/100
            </div>
          </div>

          <div className={cn("border p-3", teamInsights.worst.score < 50 ? "bg-red-500/5 border-red-500/20" : "bg-accent/30 border-border")}>
            <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
              Peor alineación
            </div>
            <div className="font-mono text-sm tabular-nums tracking-tight truncate text-red-500">
              {teamInsights.worst.profile.full_name || "---"}
            </div>
            <div className="font-mono text-[10px] tabular-nums text-red-500">
              {teamInsights.worst.score}/100
            </div>
          </div>

          <div className="bg-accent/30 border border-border p-3">
            <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
              Patrón común
            </div>
            <div className="font-mono text-[10px] leading-tight text-muted-foreground line-clamp-3">
              {teamInsights.commonPattern}
            </div>
          </div>
        </div>
      )}

      {/* Per-person cards */}
      {alignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
            <Zap className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="font-mono text-sm text-muted-foreground mb-1">
            Sin datos de energía suficientes
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            Se necesitan al menos 3 entradas con datos de energía por persona.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            {alignments.length} persona{alignments.length !== 1 && "s"} con datos de energía
          </div>

          {alignments.map((person) => {
            const isExpanded = expandedCards.has(person.userId);

            return (
              <div
                key={person.userId}
                className={cn(
                  "border transition-colors duration-200 hover:border-primary/30",
                  person.score < 50
                    ? "border-red-500/30"
                    : person.score < 80
                      ? "border-amber-500/30"
                      : "border-border"
                )}
              >
                {/* Card header */}
                <button
                  onClick={() => toggleCard(person.userId)}
                  className="w-full text-left px-4 py-4 cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <Avatar className="w-10 h-10 ring-1 ring-border">
                      <AvatarImage src={person.profile.avatar_url || undefined} />
                      <AvatarFallback className="font-mono text-xs bg-accent">
                        {getInitials(person.profile.full_name)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Name + label */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-sm font-medium truncate">
                          {person.profile.full_name || person.profile.email}
                        </span>
                        <span className={cn(
                          "font-mono text-[10px] font-bold tracking-wider px-2 py-0.5 border",
                          person.label === "ALINEADO" && "text-green-500 bg-green-500/10 border-green-500/30",
                          person.label === "DESALINEADO" && "text-amber-500 bg-amber-500/10 border-amber-500/30",
                          person.label === "DESPERDICIO" && "text-red-500 bg-red-500/10 border-red-500/30",
                        )}>
                          {person.label}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {person.totalEntriesWithEnergy} entradas con energía --- {person.alignedEntries} alineadas
                      </div>
                    </div>

                    {/* Score */}
                    <div className="text-right shrink-0">
                      <div className={cn(
                        "font-mono text-2xl font-bold tabular-nums tracking-tight",
                        person.labelColor
                      )}>
                        {person.score}
                      </div>
                      <div className="font-mono text-[9px] text-muted-foreground tracking-wider">
                        /100
                      </div>
                    </div>

                    {/* Expand toggle */}
                    <div className="shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-4 bg-accent/5">
                    {/* Energy profile bar chart */}
                    <div className="mb-6">
                      <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
                        Perfil de energía por hora (7AM-6PM)
                      </div>
                      <div className="flex items-end gap-1 h-28">
                        {person.energyProfile.map((hp) => {
                          const height = hp.entries > 0
                            ? Math.max(8, (hp.avgEnergy / 5) * 100)
                            : 4;
                          const catColor = hp.dominantCategory
                            ? CATEGORY_COLORS[hp.dominantCategory] || "bg-muted"
                            : "bg-muted";

                          return (
                            <div
                              key={hp.hour}
                              className="flex-1 flex flex-col items-center gap-1"
                            >
                              {/* Energy bar */}
                              <div className="w-full relative group">
                                <div
                                  className={cn(
                                    "w-full transition-all duration-300",
                                    hp.entries > 0 ? getEnergyColor(Math.round(hp.avgEnergy)) : "bg-muted/30"
                                  )}
                                  style={{ height: `${height}px` }}
                                  title={`${formatHourShort(hp.hour)}: Energía ${hp.avgEnergy.toFixed(1)} (${hp.entries} entradas)`}
                                />
                                {/* Category indicator dot */}
                                {hp.dominantCategory && hp.entries > 0 && (
                                  <div
                                    className={cn("w-full h-1.5 mt-0.5", catColor)}
                                    title={CATEGORIES[hp.dominantCategory]?.label || hp.dominantCategory}
                                  />
                                )}
                              </div>
                              {/* Energy value */}
                              {hp.entries > 0 && (
                                <span className={cn(
                                  "font-mono text-[8px] tabular-nums",
                                  getEnergyTextColor(Math.round(hp.avgEnergy))
                                )}>
                                  {hp.avgEnergy.toFixed(1)}
                                </span>
                              )}
                              {/* Hour label */}
                              <span className="font-mono text-[7px] text-muted-foreground tabular-nums">
                                {formatHourShort(hp.hour)}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap items-center gap-3 mt-3 border-t border-border pt-2">
                        <div className="font-mono text-[8px] text-muted-foreground mr-1">Energía:</div>
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div key={level} className="flex items-center gap-1">
                            <div className={cn("w-2 h-2", getEnergyColor(level))} />
                            <span className="font-mono text-[7px] text-muted-foreground">{level}</span>
                          </div>
                        ))}
                        <div className="w-px h-3 bg-border mx-1" />
                        <div className="font-mono text-[8px] text-muted-foreground mr-1">Categoría:</div>
                        {(Object.entries(CATEGORY_COLORS) as [string, string][]).slice(0, 4).map(([cat, color]) => (
                          <div key={cat} className="flex items-center gap-1">
                            <div className={cn("w-2 h-1", color)} />
                            <span className="font-mono text-[7px] text-muted-foreground">
                              {CATEGORIES[cat as WorkCategory]?.emoji || cat}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Category distribution during peak vs low */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                      {/* Peak energy categories */}
                      <div className="border border-border p-3 bg-background">
                        <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                          <TrendingUp className="w-3 h-3 text-green-500" />
                          Categorías en pico (energía 4-5)
                        </div>
                        <PeakCategoryBreakdown entries={entries.filter((e) =>
                          e.user_id === person.userId && e.energy != null && e.energy >= 4
                        )} />
                      </div>

                      {/* Low energy categories */}
                      <div className="border border-border p-3 bg-background">
                        <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                          <TrendingDown className="w-3 h-3 text-red-500" />
                          Categorías en baja (energía 1-2)
                        </div>
                        <PeakCategoryBreakdown entries={entries.filter((e) =>
                          e.user_id === person.userId && e.energy != null && e.energy <= 2
                        )} />
                      </div>
                    </div>

                    {/* Misalignment callouts */}
                    {person.callouts.length > 0 && (
                      <div className="mb-4">
                        <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
                          Desalineaciones detectadas
                        </div>
                        <div className="space-y-1.5">
                          {person.callouts.map((callout, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                "flex items-start gap-2 px-3 py-2 border font-mono text-xs",
                                callout.severity === "high"
                                  ? "bg-red-500/5 border-red-500/20 text-red-500"
                                  : "bg-amber-500/5 border-amber-500/20 text-amber-500"
                              )}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{callout.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggestion */}
                    {person.suggestion && (
                      <div className="border border-primary/20 bg-primary/5 px-3 py-2">
                        <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-primary mb-1">
                          Recomendación
                        </div>
                        <p className="font-mono text-xs text-foreground">
                          {person.suggestion}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 border-t border-border pt-4">
        <p className="font-mono text-[9px] text-muted-foreground text-center tracking-wide">
          ALINEACIÓN DE ENERGÍA --- {entries.filter((e) => e.energy != null).length} ENTRADAS CON ENERGÍA --- {alignments.length} PERSONAS --- ÚLTIMOS 14 DÍAS
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Sub-component: Category Breakdown
// ============================================================

function PeakCategoryBreakdown({ entries }: { entries: TimeEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="font-mono text-[10px] text-muted-foreground">
        Sin datos
      </p>
    );
  }

  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.category] = (counts[e.category] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.length;

  return (
    <div className="space-y-1">
      {sorted.map(([cat, count]) => {
        const pct = Math.round((count / total) * 100);
        const catConfig = CATEGORIES[cat as WorkCategory];
        const barColor = CATEGORY_COLORS[cat] || "bg-muted";

        return (
          <div key={cat} className="flex items-center gap-2">
            <span className={cn(
              "font-mono text-[9px] font-bold w-6 text-center py-0.5",
              catConfig?.bgColor,
              catConfig?.color
            )}>
              {catConfig?.emoji || "??"}
            </span>
            <div className="flex-1 h-2 bg-muted/30 overflow-hidden">
              <div
                className={cn("h-full transition-all duration-500", barColor)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-[9px] tabular-nums text-muted-foreground w-12 text-right">
              {count} ({pct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}
