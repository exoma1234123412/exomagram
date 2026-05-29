"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { Profile, TimeEntry } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Target,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// COMPARISON ANCHORING — Ambient comparison elements
// ═══════════════════════════════════════════════════════════════
//
// Subtle, lightweight UI fragments designed to be sprinkled
// throughout every page. They leverage ANCHORING BIAS: by always
// showing a higher reference number, your brain perceives your
// own number as inadequate.
//
// Psychological levers:
// - ComparisonTooltip: hover on any stat to see team avg + best
// - BetterThanYou: "X personas tienen mejor ... que tu"
// - ProgressToAverage: micro progress bar showing distance to avg
// - LiveComparison: real-time you-vs-team ticker
// - AnchorNumber: subtle benchmark below every displayed number

// ─── Helpers ────────────────────────────────────────────────

function firstName(name: string | null): string {
  if (!name) return "?";
  return name.split(" ")[0];
}

function formatNum(n: number, unit?: string): string {
  const formatted = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit ? `${formatted}${unit}` : formatted;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── 1. ComparisonTooltip ───────────────────────────────────

interface ComparisonTooltipProps {
  value: number;
  label: string;
  teamAvg: number;
  teamBest: number;
  unit?: string;
  higherIsBetter?: boolean;
  children: React.ReactNode;
}

/**
 * Wraps any number/stat and reveals comparison data on hover.
 * Shows your value vs team average vs team best with a position bar.
 */
export function ComparisonTooltip({
  value,
  label,
  teamAvg,
  teamBest,
  unit = "",
  higherIsBetter = true,
  children,
}: ComparisonTooltipProps) {
  const isAboveAvg = higherIsBetter ? value >= teamAvg : value <= teamAvg;
  const gap = Math.abs(value - teamAvg);

  // Position on a 0..teamBest range
  const rangeMax = Math.max(teamBest, value, teamAvg) || 1;
  const positionPct = clamp((value / rangeMax) * 100, 2, 98);
  const avgPct = clamp((teamAvg / rangeMax) * 100, 2, 98);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="cursor-default inline-flex">
          {children}
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs p-0 bg-popover text-popover-foreground border shadow-lg rounded-xl overflow-hidden"
        >
          <div className="px-3 py-2 space-y-2">
            {/* Label */}
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>

            {/* Values row */}
            <div className="flex items-center gap-3 text-xs">
              <span
                className={cn(
                  "font-bold",
                  isAboveAvg
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                )}
              >
                Tu: {formatNum(value, unit)}
              </span>
              <span className="text-muted-foreground">
                Equipo: {formatNum(teamAvg, unit)}
              </span>
              <span className="text-muted-foreground font-semibold">
                Mejor: {formatNum(teamBest, unit)}
              </span>
            </div>

            {/* Position bar */}
            <div className="relative h-2 bg-muted/60 rounded-full">
              {/* Average marker */}
              <div
                className="absolute top-0 h-full w-px bg-muted-foreground/50"
                style={{ left: `${avgPct}%` }}
              />
              {/* Your position dot */}
              <div
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-background shadow-sm",
                  isAboveAvg ? "bg-green-500" : "bg-red-500"
                )}
                style={{ left: `${positionPct}%` }}
              />
            </div>

            {/* Gap message */}
            {!isAboveAvg && (
              <p className="text-[10px] text-red-600 dark:text-red-400">
                Te faltan {formatNum(gap, unit)} para alcanzar el promedio
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── 2. BetterThanYou ───────────────────────────────────────

interface BetterThanYouProps {
  metric: string;
  yourValue: number;
  orgId: string;
}

interface BetterPerson {
  name: string;
  value: number;
}

/**
 * Subtle inline text: "X personas tienen mejor [metric] que tu".
 * On hover shows the names of people outperforming you.
 */
export function BetterThanYou({ metric, yourValue, orgId }: BetterThanYouProps) {
  const [betterPeople, setBetterPeople] = useState<BetterPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [membersRes, entriesRes] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        .returns<{ user_id: string; profiles: Profile }[]>(),
      supabase
        .from("time_entries")
        .select("user_id, hour")
        .eq("org_id", orgId)
        .eq("date", today)
        .returns<Pick<TimeEntry, "user_id" | "hour">[]>(),
    ]);

    const members = membersRes.data ?? [];
    const entries = entriesRes.data ?? [];

    const hoursByUser = new Map<string, number>();
    for (const e of entries) {
      hoursByUser.set(e.user_id, (hoursByUser.get(e.user_id) ?? 0) + 1);
    }

    const better: BetterPerson[] = [];
    for (const m of members) {
      if (m.user_id === user.id) continue;
      const hours = hoursByUser.get(m.user_id) ?? 0;
      if (hours > yourValue) {
        better.push({
          name: firstName(m.profiles.full_name),
          value: hours,
        });
      }
    }

    better.sort((a, b) => b.value - a.value);
    setBetterPeople(better);
    setLoading(false);
  }, [orgId, yourValue, today]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading || betterPeople.length === 0) return null;

  const namesPreview = betterPeople
    .slice(0, 5)
    .map((p) => `${p.name} (${p.value}h)`)
    .join(", ");
  const remaining = betterPeople.length - 5;
  const fullList =
    remaining > 0 ? `${namesPreview} y ${remaining} mas` : namesPreview;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="cursor-default">
          <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
            <Users className="w-3 h-3" />
            {betterPeople.length}{" "}
            {betterPeople.length === 1 ? "persona tiene" : "personas tienen"}{" "}
            mejor {metric} que tu
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-xs bg-popover text-popover-foreground border shadow-lg rounded-xl"
        >
          <p className="text-xs">{fullList}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── 3. ProgressToAverage ───────────────────────────────────

interface ProgressToAverageProps {
  value: number;
  average: number;
  label?: string;
}

/**
 * Micro progress bar showing your position relative to team average.
 * Gap section is red if below average, green if above.
 */
export function ProgressToAverage({
  value,
  average,
  label,
}: ProgressToAverageProps) {
  const isAbove = value >= average;
  const rangeMax = Math.max(average * 1.5, value * 1.2, 1);
  const valuePct = clamp((value / rangeMax) * 100, 1, 100);
  const avgPct = clamp((average / rangeMax) * 100, 1, 100);

  // The gap fills between your value and the average
  const gapLeft = Math.min(valuePct, avgPct);
  const gapWidth = Math.abs(valuePct - avgPct);

  return (
    <div className="space-y-0.5 w-full">
      {label && (
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
      )}
      <div className="relative h-1.5 bg-muted/40 rounded-full overflow-hidden">
        {/* Your filled portion */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-foreground/20"
          style={{ width: `${valuePct}%` }}
        />

        {/* Gap section — red if below, green if above */}
        {gapWidth > 0.5 && (
          <div
            className={cn(
              "absolute inset-y-0 rounded-full",
              isAbove
                ? "bg-green-500/40"
                : "bg-red-500/50"
            )}
            style={{
              left: `${gapLeft}%`,
              width: `${gapWidth}%`,
            }}
          />
        )}

        {/* Your position dot */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full shadow-sm border border-background",
            isAbove ? "bg-green-500" : "bg-red-500"
          )}
          style={{ left: `${clamp(valuePct - 1, 0, 98)}%` }}
        />

        {/* Average marker line */}
        <div
          className="absolute inset-y-0 w-px bg-muted-foreground/60"
          style={{ left: `${avgPct}%` }}
        />
      </div>

      {/* Labels below */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[9px] tabular-nums font-medium",
            isAbove
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          {formatNum(value)}
        </span>
        <span className="text-[9px] text-muted-foreground tabular-nums">
          Prom: {formatNum(average)}
        </span>
      </div>
    </div>
  );
}

// ─── 4. LiveComparison ──────────────────────────────────────

interface LiveComparisonProps {
  orgId: string;
}

interface ComparisonData {
  yourHours: number;
  teamAvg: number;
  teamBest: number;
  bestName: string | null;
}

const LIVE_REFRESH_MS = 120_000; // 2 minutes

/**
 * Real-time compact "you vs team" ticker.
 * Updates every 2 minutes. Your number turns red if below average.
 */
export function LiveComparison({ orgId }: LiveComparisonProps) {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [membersRes, entriesRes] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        .returns<{ user_id: string; profiles: Profile }[]>(),
      supabase
        .from("time_entries")
        .select("user_id, hour")
        .eq("org_id", orgId)
        .eq("date", today)
        .returns<Pick<TimeEntry, "user_id" | "hour">[]>(),
    ]);

    const members = membersRes.data ?? [];
    const entries = entriesRes.data ?? [];

    const hoursByUser = new Map<string, number>();
    for (const e of entries) {
      hoursByUser.set(e.user_id, (hoursByUser.get(e.user_id) ?? 0) + 1);
    }

    const yourHours = hoursByUser.get(user.id) ?? 0;

    let totalHours = 0;
    let teamBest = 0;
    let bestUserId: string | null = null;

    for (const m of members) {
      const h = hoursByUser.get(m.user_id) ?? 0;
      totalHours += h;
      if (h > teamBest) {
        teamBest = h;
        bestUserId = m.user_id;
      }
    }

    const teamAvg =
      members.length > 0 ? totalHours / members.length : 0;

    const bestMember = members.find((m) => m.user_id === bestUserId);
    const bestName = bestMember
      ? firstName(bestMember.profiles.full_name)
      : null;

    setData({ yourHours, teamAvg, teamBest, bestName });
    setLoading(false);
  }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();

    intervalRef.current = setInterval(loadData, LIVE_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadData]);

  if (loading || !data) {
    return (
      <div className="flex items-center gap-1.5 animate-pulse">
        <div className="w-16 h-3 bg-muted rounded" />
        <div className="w-20 h-3 bg-muted rounded" />
        <div className="w-14 h-3 bg-muted rounded" />
      </div>
    );
  }

  const isAboveAvg = data.yourHours >= data.teamAvg;
  const Icon = isAboveAvg ? TrendingUp : TrendingDown;

  return (
    <div className="inline-flex items-center gap-2 text-[11px] tabular-nums">
      <Icon
        className={cn(
          "w-3 h-3",
          isAboveAvg
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400"
        )}
      />
      <span
        className={cn(
          "font-bold",
          isAboveAvg
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400"
        )}
      >
        Tu: {data.yourHours}h
      </span>
      <span className="text-muted-foreground/60">|</span>
      <span className="text-muted-foreground">
        Promedio: {formatNum(data.teamAvg)}h
      </span>
      <span className="text-muted-foreground/60">|</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="cursor-default">
            <span className="text-muted-foreground font-semibold">
              Mejor: {data.teamBest}h
            </span>
          </TooltipTrigger>
          {data.bestName && (
            <TooltipContent
              side="bottom"
              className="bg-popover text-popover-foreground border shadow-lg rounded-xl"
            >
              <p className="text-xs">
                {data.bestName} lidera hoy
              </p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

// ─── 5. AnchorNumber ────────────────────────────────────────

interface AnchorNumberProps {
  value: number;
  benchmark: number;
  benchmarkLabel?: string;
  children: React.ReactNode;
}

/**
 * Wraps a displayed number and adds a subtle "benchmark" below it.
 * Always shows a higher target so your own number feels inadequate.
 */
export function AnchorNumber({
  value,
  benchmark,
  benchmarkLabel = "Referencia",
  children,
}: AnchorNumberProps) {
  const isBelow = value < benchmark;

  return (
    <div className="inline-flex flex-col items-center">
      {children}
      <span
        className={cn(
          "text-[9px] tabular-nums flex items-center gap-0.5 mt-0.5",
          isBelow
            ? "text-muted-foreground/60"
            : "text-green-600/60 dark:text-green-400/60"
        )}
      >
        <Target className="w-2.5 h-2.5" />
        {benchmarkLabel}: {formatNum(benchmark)}
      </span>
    </div>
  );
}

// ─── 6. ComparisonBadge ─────────────────────────────────────

interface ComparisonBadgeProps {
  value: number;
  teamAvg: number;
  compact?: boolean;
}

/**
 * A tiny badge that shows +X / -X relative to team average.
 * Green for above, red for below. Designed to sit next to any stat.
 */
export function ComparisonBadge({
  value,
  teamAvg,
  compact = false,
}: ComparisonBadgeProps) {
  const diff = value - teamAvg;
  const isAbove = diff >= 0;
  const Icon = isAbove ? TrendingUp : TrendingDown;
  const sign = isAbove ? "+" : "";

  if (Math.abs(diff) < 0.1) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[9px] px-1.5 py-0 h-4 gap-0.5 font-medium tabular-nums",
        isAbove
          ? "text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20"
          : "text-red-700 dark:text-red-400 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20"
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {!compact && (
        <span>
          {sign}
          {formatNum(diff)}
        </span>
      )}
    </Badge>
  );
}

// ─── 7. TeamRankBadge ───────────────────────────────────────

interface TeamRankBadgeProps {
  rank: number;
  total: number;
}

/**
 * Displays your rank within the team as a tiny badge.
 * Bottom half = red, top half = default muted styling.
 */
export function TeamRankBadge({ rank, total }: TeamRankBadgeProps) {
  const isBottomHalf = rank > Math.ceil(total / 2);

  return (
    <span
      className={cn(
        "text-[9px] tabular-nums font-medium flex items-center gap-0.5",
        isBottomHalf
          ? "text-red-600 dark:text-red-400"
          : "text-muted-foreground"
      )}
    >
      <Users className="w-2.5 h-2.5" />
      #{rank} de {total}
    </span>
  );
}

// ─── 8. AmbientComparison ───────────────────────────────────

interface AmbientComparisonProps {
  orgId: string;
}

/**
 * A composite widget that bundles LiveComparison + ProgressToAverage
 * into a single ultra-compact strip. Drop it into any page header
 * or sidebar for persistent ambient pressure.
 */
export function AmbientComparison({ orgId }: AmbientComparisonProps) {
  const [data, setData] = useState<{
    yourHours: number;
    teamAvg: number;
    teamBest: number;
    betterCount: number;
    totalMembers: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [membersRes, entriesRes] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id")
        .eq("org_id", orgId)
        .returns<{ user_id: string }[]>(),
      supabase
        .from("time_entries")
        .select("user_id, hour")
        .eq("org_id", orgId)
        .eq("date", today)
        .returns<Pick<TimeEntry, "user_id" | "hour">[]>(),
    ]);

    const members = membersRes.data ?? [];
    const entries = entriesRes.data ?? [];

    const hoursByUser = new Map<string, number>();
    for (const e of entries) {
      hoursByUser.set(e.user_id, (hoursByUser.get(e.user_id) ?? 0) + 1);
    }

    const yourHours = hoursByUser.get(user.id) ?? 0;
    let totalHours = 0;
    let teamBest = 0;
    let betterCount = 0;

    for (const m of members) {
      const h = hoursByUser.get(m.user_id) ?? 0;
      totalHours += h;
      if (h > teamBest) teamBest = h;
      if (m.user_id !== user.id && h > yourHours) betterCount++;
    }

    const teamAvg =
      members.length > 0 ? totalHours / members.length : 0;

    setData({
      yourHours,
      teamAvg,
      teamBest,
      betterCount,
      totalMembers: members.length,
    });
    setLoading(false);
  }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(loadData, LIVE_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadData]);

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 animate-pulse">
        <div className="w-32 h-4 bg-muted rounded" />
        <div className="w-24 h-1.5 bg-muted rounded-full" />
      </div>
    );
  }

  const isAbove = data.yourHours >= data.teamAvg;
  const gapToExpected = Math.max(0, EXPECTED_DAILY_HOURS - data.yourHours);

  return (
    <div className="flex items-center gap-3 py-1">
      {/* Compact live numbers */}
      <div className="inline-flex items-center gap-1.5 text-[10px] tabular-nums">
        {isAbove ? (
          <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />
        ) : (
          <TrendingDown className="w-3 h-3 text-red-600 dark:text-red-400" />
        )}
        <span
          className={cn(
            "font-bold",
            isAbove
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          {data.yourHours}h
        </span>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-muted-foreground">
          {formatNum(data.teamAvg)}h prom
        </span>
      </div>

      {/* Micro progress bar */}
      <div className="w-20">
        <ProgressToAverage value={data.yourHours} average={data.teamAvg} />
      </div>

      {/* People ahead */}
      {data.betterCount > 0 && (
        <span className="text-[9px] text-muted-foreground/60 flex items-center gap-0.5">
          <Users className="w-2.5 h-2.5" />
          {data.betterCount} por delante
        </span>
      )}

      {/* Gap to expected daily */}
      {gapToExpected > 0 && (
        <span className="text-[9px] text-red-600/60 dark:text-red-400/60 flex items-center gap-0.5">
          <Target className="w-2.5 h-2.5" />
          Faltan {gapToExpected}h
        </span>
      )}
    </div>
  );
}
