"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  TrustScoreHistory,
  DailyPromise,
  Standup,
  AccountabilityFlag,
} from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import { format, subDays, parseISO } from "date-fns";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Users,
  Activity,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface MemberRawData {
  userId: string;
  profile: Profile;
  trustHistory: TrustScoreHistory[];
  promises: DailyPromise[];
  standups: Standup[];
  flags: AccountabilityFlag[];
  hoursPerDay: Map<string, number>;
}

interface ProjectedMetric {
  label: string;
  current: number;
  projected: number;
  unit: string;
  direction: "up" | "down" | "stable";
  isCritical: boolean;
  dailyRate: number;
  history: number[]; // last 14 data points
}

interface MemberProjection {
  userId: string;
  profile: Profile;
  metrics: ProjectedMetric[];
  currentRank: number;
  projectedRank: number;
  isCritical: boolean;
  currentTrustScore: number;
  projectedTrustScore: number;
}

// ============================================================
// Linear Regression
// ============================================================

function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

// ============================================================
// Helpers
// ============================================================

function getLast14Dates(): string[] {
  const today = getTodayMTY();
  const dates: string[] = [];
  for (let i = 13; i >= 0; i--) {
    dates.push(format(subDays(parseISO(today), i), "yyyy-MM-dd"));
  }
  return dates;
}

function getTrendDirection(dailyRate: number): "up" | "down" | "stable" {
  if (dailyRate > 0.05) return "up";
  if (dailyRate < -0.05) return "down";
  return "stable";
}

function TrendIcon({ direction }: { direction: "up" | "down" | "stable" }) {
  if (direction === "up") return <TrendingUp className="w-3 h-3 text-emerald-400" />;
  if (direction === "down") return <TrendingDown className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

// ============================================================
// Component: Mini Trend Chart (div-based)
// ============================================================

function MiniTrendChart({
  history,
  projectedValues,
  declining,
}: {
  history: number[];
  projectedValues: number[];
  declining: boolean;
}) {
  const all = [...history, ...projectedValues];
  const max = Math.max(...all, 1);
  const min = Math.min(...all, 0);
  const range = max - min || 1;

  return (
    <div className="flex items-end gap-px h-8 mt-1">
      {history.map((v, i) => (
        <div
          key={`h-${i}`}
          className={cn(
            "w-1.5 min-h-[2px]",
            declining ? "bg-red-400" : "bg-emerald-400"
          )}
          style={{ height: `${Math.max(8, ((v - min) / range) * 100)}%` }}
        />
      ))}
      {projectedValues.map((v, i) => (
        <div
          key={`p-${i}`}
          className={cn(
            "w-1.5 min-h-[2px] opacity-40",
            declining ? "bg-red-400" : "bg-emerald-400"
          )}
          style={{ height: `${Math.max(8, ((v - min) / range) * 100)}%` }}
        />
      ))}
    </div>
  );
}

// ============================================================
// Component: Metric Row
// ============================================================

function MetricRow({ metric }: { metric: ProjectedMetric }) {
  const declining =
    (metric.label === "Trust Score" && metric.direction === "down") ||
    (metric.label !== "Trust Score" && metric.direction === "up");

  // Generate 6 projected points (every 5 days for 30 days)
  const projectedPoints = Array.from({ length: 6 }, (_, i) => {
    const days = (i + 1) * 5;
    return Math.max(0, metric.current + metric.dailyRate * days);
  });

  return (
    <div className="border-t border-border/50 py-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
            {metric.label}
          </span>
          <TrendIcon direction={metric.direction} />
        </div>
        {metric.isCritical && (
          <span className="font-mono text-[8px] tracking-[0.1em] uppercase text-red-400">
            ALERTA
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-baseline gap-3">
            <div>
              <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider block">
                AHORA
              </span>
              <span className="font-mono tabular-nums font-bold text-sm text-foreground">
                {metric.current.toFixed(metric.unit === "pts" ? 0 : 1)}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground ml-0.5">
                {metric.unit}
              </span>
            </div>
            <div className="text-muted-foreground font-mono text-xs">&rarr;</div>
            <div>
              <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider block">
                30 DIAS
              </span>
              <span
                className={cn(
                  "font-mono tabular-nums font-bold text-sm",
                  declining ? "text-red-400" : "text-emerald-400"
                )}
              >
                {metric.projected.toFixed(metric.unit === "pts" ? 0 : 1)}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground ml-0.5">
                {metric.unit}
              </span>
            </div>
          </div>
        </div>
        <div className="w-28">
          <MiniTrendChart
            history={metric.history}
            projectedValues={projectedPoints}
            declining={declining}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Component: Member Card
// ============================================================

function MemberCard({
  member,
  totalMembers,
}: {
  member: MemberProjection;
  totalMembers: number;
}) {
  return (
    <div
      className={cn(
        "border border-border p-4 transition-colors duration-200 hover:border-primary/30",
        member.isCritical && "border-red-500/50 bg-red-500/5 animate-danger-pulse"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8 ring-1 ring-border">
            <AvatarImage src={member.profile.avatar_url ?? undefined} />
            <AvatarFallback className="font-mono text-[10px] bg-accent">
              {getInitials(member.profile.full_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-mono text-xs font-bold tracking-tight">
              {member.profile.full_name ?? member.profile.email}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
                RANK #{member.currentRank}/{totalMembers}
              </span>
              {member.projectedRank !== member.currentRank && (
                <>
                  <span className="font-mono text-[9px] text-muted-foreground">&rarr;</span>
                  <span
                    className={cn(
                      "font-mono text-[9px] tabular-nums font-bold",
                      member.projectedRank > member.currentRank
                        ? "text-red-400"
                        : "text-emerald-400"
                    )}
                  >
                    #{member.projectedRank}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {member.isCritical && (
          <div className="flex items-center gap-1.5 bg-red-600 text-white font-mono text-[9px] font-bold tracking-[0.1em] uppercase px-2 py-1 animate-danger-pulse">
            <AlertTriangle className="w-3 h-3" />
            TRAYECTORIA CRITICA
          </div>
        )}
      </div>

      {/* Trust Score summary */}
      <div className="flex items-center gap-3 mb-2 px-2 py-1.5 bg-accent/30 border border-border">
        <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
          Trust Score
        </span>
        <span className="font-mono tabular-nums font-bold text-foreground">
          {member.currentTrustScore.toFixed(0)}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">&rarr;</span>
        <span
          className={cn(
            "font-mono tabular-nums font-bold",
            member.projectedTrustScore < member.currentTrustScore
              ? "text-red-400"
              : "text-emerald-400"
          )}
        >
          {member.projectedTrustScore.toFixed(0)}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">en 30d</span>
      </div>

      {/* Metrics */}
      <div>
        {member.metrics.map((m, i) => (
          <MetricRow key={i} metric={m} />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function ProjectionPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [loading, setLoading] = useState(true);
  const [rawData, setRawData] = useState<MemberRawData[]>([]);
  const supabase = createClient();

  useEffect(() => {
    if (orgLoading || !orgId) return;

    async function loadData() {
      const today = getTodayMTY();
      const fourteenAgo = format(subDays(parseISO(today), 14), "yyyy-MM-dd");

      // Fetch org members with profiles
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId!);

      if (!members || members.length === 0) {
        setLoading(false);
        return;
      }

      const userIds = members.map((m) => m.user_id);

      // Parallel queries for last 14 days
      const [
        { data: trustData },
        { data: promiseData },
        { data: standupData },
        { data: flagData },
        { data: entryData },
      ] = await Promise.all([
        supabase
          .from("trust_score_history")
          .select("*")
          .eq("org_id", orgId!)
          .in("user_id", userIds)
          .gte("date", fourteenAgo)
          .order("date", { ascending: true }),
        supabase
          .from("daily_promises")
          .select("*")
          .eq("org_id", orgId!)
          .in("user_id", userIds)
          .gte("date", fourteenAgo),
        supabase
          .from("standups")
          .select("*")
          .eq("org_id", orgId!)
          .in("user_id", userIds)
          .gte("date", fourteenAgo),
        supabase
          .from("accountability_flags")
          .select("*")
          .eq("org_id", orgId!)
          .in("user_id", userIds)
          .gte("date", fourteenAgo),
        supabase
          .from("time_entries")
          .select("user_id, date, hour")
          .eq("org_id", orgId!)
          .in("user_id", userIds)
          .gte("date", fourteenAgo)
          .is("deleted_at", null),
      ]);

      const result: MemberRawData[] = members.map((m) => {
        const profile = (m as any).profiles as Profile;
        const uid = m.user_id;

        // Build hours per day map
        const hoursMap = new Map<string, number>();
        (entryData ?? [])
          .filter((e) => e.user_id === uid)
          .forEach((e) => {
            hoursMap.set(e.date, (hoursMap.get(e.date) ?? 0) + 1);
          });

        return {
          userId: uid,
          profile,
          trustHistory: (trustData ?? []).filter((t) => t.user_id === uid),
          promises: (promiseData ?? []).filter((p) => p.user_id === uid),
          standups: (standupData ?? []).filter((s) => s.user_id === uid),
          flags: (flagData ?? []).filter((f) => f.user_id === uid),
          hoursPerDay: hoursMap,
        };
      });

      setRawData(result);
      setLoading(false);
    }

    loadData();
  }, [orgId, orgLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================
  // Compute projections
  // ============================================================

  const projections: MemberProjection[] = useMemo(() => {
    if (rawData.length === 0) return [];

    const dates = getLast14Dates();

    const projected = rawData.map((member) => {
      const metrics: ProjectedMetric[] = [];

      // 1. Trust Score trend
      const trustValues = dates.map((d) => {
        const entry = member.trustHistory.find((t) => t.date === d);
        return entry?.score ?? null;
      });
      const validTrust = trustValues.filter((v): v is number => v !== null);
      const currentTrust = validTrust.length > 0 ? validTrust[validTrust.length - 1] : 50;
      const trustReg = linearRegression(validTrust.length > 0 ? validTrust : [currentTrust]);
      const trustDailyRate = trustReg.slope;
      const projectedTrust = Math.max(0, Math.min(100, currentTrust + trustDailyRate * 30));

      const trustHistory14 = validTrust.length > 0 ? validTrust : [currentTrust];
      metrics.push({
        label: "Trust Score",
        current: currentTrust,
        projected: projectedTrust,
        unit: "pts",
        direction: getTrendDirection(trustDailyRate),
        isCritical: projectedTrust < 40,
        dailyRate: trustDailyRate,
        history: trustHistory14,
      });

      // 2. Hours trend (avg daily)
      const hoursValues = dates.map((d) => member.hoursPerDay.get(d) ?? 0);
      const avgHours = hoursValues.reduce((a, b) => a + b, 0) / Math.max(hoursValues.length, 1);
      const projectedTotalHours = avgHours * 30;
      const hoursReg = linearRegression(hoursValues);
      const hoursDailyRate = hoursReg.slope;

      metrics.push({
        label: "Horas/día promedio",
        current: avgHours,
        projected: Math.max(0, avgHours + hoursDailyRate * 30),
        unit: "hrs",
        direction: getTrendDirection(hoursDailyRate),
        isCritical: avgHours + hoursDailyRate * 30 < 4,
        dailyRate: hoursDailyRate,
        history: hoursValues,
      });

      // 3. Promise break rate
      const totalPromises = member.promises.length;
      const brokenPromises = member.promises.filter((p) => p.status === "broken").length;
      const brokenRate = totalPromises > 0 ? brokenPromises / totalPromises : 0;
      const promisesPerDay = totalPromises / 14;
      const projectedBroken = brokenPromises + brokenRate * promisesPerDay * 30;

      // Build 14-day promise history
      const promiseHistory = dates.map((d) => {
        return member.promises.filter((p) => p.date === d && p.status === "broken").length;
      });
      const promiseDailyRate = brokenRate * promisesPerDay;

      metrics.push({
        label: "Promesas rotas acumuladas",
        current: brokenPromises,
        projected: Math.round(projectedBroken),
        unit: "",
        direction: promiseDailyRate > 0.05 ? "up" : promiseDailyRate < -0.05 ? "down" : "stable",
        isCritical: projectedBroken > 10,
        dailyRate: promiseDailyRate,
        history: promiseHistory,
      });

      // 4. Standup completion rate
      const standupDates = new Set(member.standups.map((s) => s.date));
      // Count weekdays in last 14 days
      const weekdays = dates.filter((d) => {
        const day = parseISO(d).getDay();
        return day !== 0 && day !== 6;
      });
      const standupsMade = weekdays.filter((d) => standupDates.has(d)).length;
      const standupsMissed = weekdays.length - standupsMade;
      const missRate = weekdays.length > 0 ? standupsMissed / weekdays.length : 0;
      // Project: ~22 weekdays in 30 days
      const projectedMissed = standupsMissed + Math.round(missRate * 22);

      const standupHistory = dates.map((d) => (standupDates.has(d) ? 0 : 1));
      const standupDailyRate = missRate;

      metrics.push({
        label: "Standups perdidos acum.",
        current: standupsMissed,
        projected: projectedMissed,
        unit: "",
        direction: standupDailyRate > 0.15 ? "up" : standupDailyRate < 0.05 ? "down" : "stable",
        isCritical: projectedMissed > 15,
        dailyRate: standupDailyRate,
        history: standupHistory,
      });

      // 5. Flag accumulation rate
      const totalFlags = member.flags.length;
      const flagsPerWeek = totalFlags / 2; // 14 days = 2 weeks
      const projectedFlags = totalFlags + Math.round((flagsPerWeek / 7) * 30);

      const flagHistory = dates.map((d) => {
        return member.flags.filter((f) => f.date === d).length;
      });
      const flagDailyRate = flagsPerWeek / 7;

      metrics.push({
        label: "Flags acumuladas",
        current: totalFlags,
        projected: projectedFlags,
        unit: "",
        direction: flagDailyRate > 0.1 ? "up" : flagDailyRate < 0.01 ? "down" : "stable",
        isCritical: projectedFlags > 20,
        dailyRate: flagDailyRate,
        history: flagHistory,
      });

      // Determine if any metric is critical
      const isCritical =
        projectedTrust < 40 ||
        metrics.some((m) => m.isCritical);

      return {
        userId: member.userId,
        profile: member.profile,
        metrics,
        currentRank: 0, // computed below
        projectedRank: 0,
        isCritical,
        currentTrustScore: currentTrust,
        projectedTrustScore: projectedTrust,
      };
    });

    // Compute rankings
    const sortedByCurrent = [...projected].sort(
      (a, b) => b.currentTrustScore - a.currentTrustScore
    );
    sortedByCurrent.forEach((m, i) => {
      const found = projected.find((p) => p.userId === m.userId);
      if (found) found.currentRank = i + 1;
    });

    const sortedByProjected = [...projected].sort(
      (a, b) => b.projectedTrustScore - a.projectedTrustScore
    );
    sortedByProjected.forEach((m, i) => {
      const found = projected.find((p) => p.userId === m.userId);
      if (found) found.projectedRank = i + 1;
    });

    // Sort: critical first, then by projected trust ascending (worst on top)
    return projected.sort((a, b) => {
      if (a.isCritical && !b.isCritical) return -1;
      if (!a.isCritical && b.isCritical) return 1;
      return a.projectedTrustScore - b.projectedTrustScore;
    });
  }, [rawData]);

  // ============================================================
  // Stats
  // ============================================================

  const criticalCount = projections.filter((p) => p.isCritical).length;
  const avgCurrentTrust =
    projections.length > 0
      ? projections.reduce((s, p) => s + p.currentTrustScore, 0) / projections.length
      : 0;
  const avgProjectedTrust =
    projections.length > 0
      ? projections.reduce((s, p) => s + p.projectedTrustScore, 0) / projections.length
      : 0;

  // ============================================================
  // Render
  // ============================================================

  if (loading || orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 animate-pulse" />
          <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
            Calculando proyecciones...
          </p>
        </div>
      </div>
    );
  }

  if (projections.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase mb-4">
          PROYECCION A 30 DIAS
        </h1>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
            <Activity className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            No hay datos suficientes para proyectar
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Activity className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            PROYECCION A 30 DIAS
          </h1>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          Tendencias de los ultimos 14 dias proyectadas 30 dias al futuro
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px border border-border mb-8">
        <div className="bg-accent/30 border-r border-border p-3">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1">
            MIEMBROS
          </span>
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-mono tabular-nums font-bold text-lg">
              {projections.length}
            </span>
          </div>
        </div>
        <div className="bg-accent/30 border-r border-border p-3">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1">
            TRAYECTORIA CRITICA
          </span>
          <span
            className={cn(
              "font-mono tabular-nums font-bold text-lg",
              criticalCount > 0 ? "text-red-400" : "text-emerald-400"
            )}
          >
            {criticalCount}
          </span>
        </div>
        <div className="bg-accent/30 border-r border-border p-3">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1">
            TRUST ACTUAL
          </span>
          <span className="font-mono tabular-nums font-bold text-lg">
            {avgCurrentTrust.toFixed(0)}
          </span>
        </div>
        <div className="bg-accent/30 p-3">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1">
            TRUST PROYECTADO
          </span>
          <span
            className={cn(
              "font-mono tabular-nums font-bold text-lg",
              avgProjectedTrust < avgCurrentTrust ? "text-red-400" : "text-emerald-400"
            )}
          >
            {avgProjectedTrust.toFixed(0)}
          </span>
        </div>
      </div>

      {/* Critical warning */}
      {criticalCount > 0 && (
        <div className="border border-red-500/30 bg-red-500/5 p-3 mb-8 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="font-mono text-xs text-red-400">
            {criticalCount === 1
              ? "1 miembro en trayectoria critica. Accion inmediata requerida."
              : `${criticalCount} miembros en trayectoria critica. Accion inmediata requerida.`}
          </p>
        </div>
      )}

      {/* Member cards */}
      <div className="space-y-4">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
          PROYECCIONES INDIVIDUALES
        </p>
        {projections.map((member) => (
          <MemberCard
            key={member.userId}
            member={member}
            totalMembers={projections.length}
          />
        ))}
      </div>

      {/* Methodology note */}
      <div className="mt-8 border-t border-border pt-4">
        <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
          Metodologia: Regresion lineal sobre los ultimos 14 dias de datos.
          Las proyecciones asumen que las tendencias actuales se mantienen constantes.
          Los valores criticos se activan cuando el Trust Score proyectado cae debajo de 40,
          las promesas rotas superan 10, o los flags superan 20.
        </p>
      </div>
    </div>
  );
}
