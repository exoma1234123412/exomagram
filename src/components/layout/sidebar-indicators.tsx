"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Check, X, AlertTriangle } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TimeEntryRow {
  id: string;
  hour: number;
  date: string;
}

interface StandupRow {
  id: string;
  date: string;
  user_id: string;
}

interface AccountabilityFlagRow {
  id: string;
  user_id: string;
  resolved: boolean;
}

interface TrustScoreRow {
  id: string;
  user_id: string;
  score: number;
  date: string;
}

interface LiveStatusRow {
  user_id: string;
  status: string;
  last_heartbeat: string;
}

interface PowerRankingRow {
  user_id: string;
  rank: number;
  total: number;
}

interface PulseResponseRow {
  id: string;
  user_id: string;
  week_of: string;
}

interface JournalRow {
  id: string;
  user_id: string;
  week_of: string;
}

interface MirrorTierRow {
  user_id: string;
  tier: string;
  score: number;
}

interface SidebarData {
  // Timeline: unlogged hours today
  unloggedHours: number;
  timeGapCount: number;

  // Ahora: people online right now
  onlineCount: number;

  // Standup: done today?
  standupDone: boolean;

  // Vigilancia: ghost count
  ghostCount: number;

  // Accountability: unresolved flags for the user
  unresolvedFlagCount: number;

  // Power Rankings: user's current rank & total members
  powerRank: number | null;
  powerRankTotal: number | null;

  // Leaderboard: trust score
  trustScore: number | null;

  // El Espejo: tier letter
  mirrorTier: string | null;

  // Journal: this week's journal written?
  journalDone: boolean;

  // Pulse: this week's pulse answered?
  pulseDone: boolean;

  // Loading state
  loading: boolean;
}

const DEFAULT_DATA: SidebarData = {
  unloggedHours: 0,
  timeGapCount: 0,
  onlineCount: 0,
  standupDone: false,
  ghostCount: 0,
  unresolvedFlagCount: 0,
  powerRank: null,
  powerRankTotal: null,
  trustScore: null,
  mirrorTier: null,
  journalDone: false,
  pulseDone: false,
  loading: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns today's date string in YYYY-MM-DD. */
function todayStr(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/** Returns the Monday of the current ISO week as YYYY-MM-DD. */
function currentWeekMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

/** Returns the current hour (0-23). */
function currentHour(): number {
  return new Date().getHours();
}

/** Check if today is Friday or later in the week (Fri=5, Sat=6, Sun=0). */
function isFridayOrLater(): boolean {
  const day = new Date().getDay();
  return day === 5 || day === 6 || day === 0;
}

/**
 * Calculate unlogged hours. Compares current hour against the expected work
 * window (9-18 by default) and counts slots with no entry.
 */
function computeGaps(
  entries: TimeEntryRow[],
  workStart = 9,
  workEnd: number | null = null
): { unloggedHours: number; gapCount: number } {
  const now = currentHour();
  const effectiveEnd = workEnd ?? Math.min(now, 18);
  if (effectiveEnd <= workStart) return { unloggedHours: 0, gapCount: 0 };

  const loggedHours = new Set(entries.map((e) => e.hour));
  let gaps = 0;
  let inGap = false;
  let gapCount = 0;

  for (let h = workStart; h < effectiveEnd; h++) {
    if (!loggedHours.has(h)) {
      gaps++;
      if (!inGap) {
        gapCount++;
        inGap = true;
      }
    } else {
      inGap = false;
    }
  }

  return { unloggedHours: gaps, gapCount };
}

/** Minutes since a given ISO timestamp. */
function minutesSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 1000 / 60;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const SidebarDataContext = createContext<SidebarData>(DEFAULT_DATA);

export function useSidebarData(): SidebarData {
  return useContext(SidebarDataContext);
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function SidebarIndicators({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SidebarData>(DEFAULT_DATA);
  const supabase = useMemo(() => createClient(), []);

  const fetchAll = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const userId = user.id;

      // Get org membership
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .single<{ org_id: string }>();

      if (!membership) return;

      const orgId = membership.org_id;
      const today = todayStr();
      const weekMonday = currentWeekMonday();

      // Fire all queries in parallel
      const [
        timeEntriesRes,
        standupRes,
        flagsRes,
        trustRes,
        liveStatusRes,
        rankingsRes,
        pulseRes,
        journalRes,
        mirrorRes,
      ] = await Promise.all([
        // 1. Time entries today for this user
        supabase
          .from("time_entries")
          .select("id, hour, date")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .eq("date", today),

        // 2. Standup today for this user
        supabase
          .from("standups")
          .select("id, date, user_id")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .eq("date", today)
          .limit(1),

        // 3. Unresolved accountability flags for this user
        supabase
          .from("accountability_flags")
          .select("id, user_id, resolved")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .eq("resolved", false),

        // 4. Latest trust score
        supabase
          .from("trust_score_history")
          .select("id, user_id, score, date")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .order("date", { ascending: false })
          .limit(1),

        // 5. Live status for org (online count + ghost detection)
        supabase
          .from("live_status")
          .select("user_id, status, last_heartbeat")
          .eq("org_id", orgId),

        // 6. Power rankings (custom view or table)
        supabase
          .from("power_rankings")
          .select("user_id, rank, total")
          .eq("org_id", orgId)
          .eq("user_id", userId)
          .limit(1),

        // 7. Pulse responses this week
        supabase
          .from("pulse_responses")
          .select("id, user_id, week_of")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .gte("week_of", weekMonday)
          .limit(1),

        // 8. Journal entries this week
        supabase
          .from("journal_entries")
          .select("id, user_id, week_of")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .gte("week_of", weekMonday)
          .limit(1),

        // 9. Mirror tier
        supabase
          .from("mirror_tiers")
          .select("user_id, tier, score")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .limit(1),
      ]);

      // ── Process time entries / gaps ──────────────────────────────────
      const entries = (timeEntriesRes.data ?? []) as TimeEntryRow[];
      const { unloggedHours, gapCount } = computeGaps(entries);

      // ── Standup ──────────────────────────────────────────────────────
      const standups = (standupRes.data ?? []) as StandupRow[];
      const standupDone = standups.length > 0;

      // ── Accountability flags ─────────────────────────────────────────
      const flags = (flagsRes.data ?? []) as AccountabilityFlagRow[];
      const unresolvedFlagCount = flags.length;

      // ── Trust score ──────────────────────────────────────────────────
      const trustRows = (trustRes.data ?? []) as TrustScoreRow[];
      const trustScore = trustRows.length > 0 ? trustRows[0].score : null;

      // ── Live status: online count & ghost detection ──────────────────
      const allStatuses = (liveStatusRes.data ?? []) as LiveStatusRow[];
      const HEARTBEAT_STALE_MINUTES = 10;
      const activeStatuses = allStatuses.filter(
        (s) =>
          s.status !== "offline" &&
          minutesSince(s.last_heartbeat) < HEARTBEAT_STALE_MINUTES
      );
      const onlineCount = activeStatuses.length;

      // Ghosts: online but no time entries today
      // We need all today's entries from everyone to detect ghosts properly
      const todayEntryUsers = new Set(entries.map((e) => "self"));
      // For ghosts, we check org-wide: online users who haven't logged anything
      const { data: orgEntriesData } = await supabase
        .from("time_entries")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("date", today);

      const usersWithEntries = new Set(
        (orgEntriesData ?? []).map((e: { user_id: string }) => e.user_id)
      );
      const ghostCount = activeStatuses.filter(
        (s) => !usersWithEntries.has(s.user_id)
      ).length;

      // ── Power rankings ───────────────────────────────────────────────
      const rankings = (rankingsRes.data ?? []) as PowerRankingRow[];
      const powerRank = rankings.length > 0 ? rankings[0].rank : null;
      const powerRankTotal = rankings.length > 0 ? rankings[0].total : null;

      // ── Pulse ────────────────────────────────────────────────────────
      const pulseRows = (pulseRes.data ?? []) as PulseResponseRow[];
      const pulseDone = pulseRows.length > 0;

      // ── Journal ──────────────────────────────────────────────────────
      const journalRows = (journalRes.data ?? []) as JournalRow[];
      const journalDone = journalRows.length > 0;

      // ── Mirror tier ──────────────────────────────────────────────────
      const mirrorRows = (mirrorRes.data ?? []) as MirrorTierRow[];
      const mirrorTier = mirrorRows.length > 0 ? mirrorRows[0].tier : null;

      setData({
        unloggedHours,
        timeGapCount: gapCount,
        onlineCount,
        standupDone,
        ghostCount,
        unresolvedFlagCount,
        powerRank,
        powerRankTotal,
        trustScore,
        mirrorTier,
        journalDone,
        pulseDone,
        loading: false,
      });
    } catch (err) {
      console.error("[SidebarIndicators] Error fetching data:", err);
      setData((prev) => ({ ...prev, loading: false }));
    }
  }, [supabase]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return (
    <SidebarDataContext.Provider value={data}>
      {children}
    </SidebarDataContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicator sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Red number badge (problems, alerts). */
function RedBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute -right-1 -top-1 z-10",
        "flex items-center justify-center",
        "w-4 h-4 rounded-full",
        "bg-red-500 text-white",
        "text-[8px] font-bold leading-none",
        "shadow-sm shadow-red-500/30",
        "transition-opacity duration-300"
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Orange number badge (warnings). */
function OrangeBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute -right-1 -top-1 z-10",
        "flex items-center justify-center",
        "w-4 h-4 rounded-full",
        "bg-orange-500 text-white",
        "text-[8px] font-bold leading-none",
        "shadow-sm shadow-orange-500/30",
        "transition-opacity duration-300"
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Green number badge (live count). */
function GreenBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute -right-1 -top-1 z-10",
        "flex items-center justify-center",
        "w-4 h-4 rounded-full",
        "bg-emerald-500 text-white",
        "text-[8px] font-bold leading-none",
        "shadow-sm shadow-emerald-500/30",
        "animate-pulse",
        "transition-opacity duration-300"
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Simple colored dot indicator. */
function StatusDot({
  color,
  pulse = false,
}: {
  color: "red" | "green" | "orange" | "blue";
  pulse?: boolean;
}) {
  const colorClasses = {
    red: "bg-red-500 shadow-red-500/40",
    green: "bg-emerald-500 shadow-emerald-500/40",
    orange: "bg-orange-500 shadow-orange-500/40",
    blue: "bg-blue-500 shadow-blue-500/40",
  };

  return (
    <span
      className={cn(
        "absolute -right-0.5 -top-0.5 z-10",
        "w-2.5 h-2.5 rounded-full",
        "shadow-sm",
        colorClasses[color],
        pulse && "animate-pulse",
        "transition-opacity duration-300"
      )}
    />
  );
}

/** Tiny icon indicator (check or exclamation). */
function StatusIcon({
  variant,
}: {
  variant: "check" | "exclamation";
}) {
  if (variant === "check") {
    return (
      <span
        className={cn(
          "absolute -right-1 -top-1 z-10",
          "flex items-center justify-center",
          "w-4 h-4 rounded-full",
          "bg-emerald-500 text-white",
          "shadow-sm shadow-emerald-500/30",
          "transition-opacity duration-300"
        )}
      >
        <Check className="w-2.5 h-2.5" strokeWidth={3} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "absolute -right-1 -top-1 z-10",
        "flex items-center justify-center",
        "w-4 h-4 rounded-full",
        "bg-red-500 text-white",
        "shadow-sm shadow-red-500/30",
        "transition-opacity duration-300"
      )}
    >
      <AlertTriangle className="w-2.5 h-2.5" strokeWidth={3} />
    </span>
  );
}

/** Tiny text badge (rank, tier, score). */
function TextBadge({
  text,
  colorClass,
}: {
  text: string;
  colorClass: string;
}) {
  return (
    <span
      className={cn(
        "absolute -right-1 -top-1 z-10",
        "flex items-center justify-center",
        "min-w-[16px] h-4 px-0.5 rounded-full",
        "text-[8px] font-bold leading-none",
        "shadow-sm",
        "transition-opacity duration-300",
        colorClass
      )}
    >
      {text}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier color mapping
// ─────────────────────────────────────────────────────────────────────────────

function tierColorClass(tier: string): string {
  switch (tier.toUpperCase()) {
    case "S":
      return "bg-violet-500 text-white shadow-violet-500/30";
    case "A":
      return "bg-emerald-500 text-white shadow-emerald-500/30";
    case "B":
      return "bg-blue-500 text-white shadow-blue-500/30";
    case "C":
      return "bg-yellow-500 text-white shadow-yellow-500/30";
    case "D":
      return "bg-orange-500 text-white shadow-orange-500/30";
    case "F":
      return "bg-red-500 text-white shadow-red-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Color for trust score numeric display. */
function trustScoreColorClass(score: number): string {
  if (score >= 80) return "bg-emerald-500 text-white shadow-emerald-500/30";
  if (score >= 60) return "bg-blue-500 text-white shadow-blue-500/30";
  if (score >= 40) return "bg-yellow-500 text-white shadow-yellow-500/30";
  if (score >= 20) return "bg-orange-500 text-white shadow-orange-500/30";
  return "bg-red-500 text-white shadow-red-500/30";
}

/** Rank badge color: green for top 3, red for bottom 3, neutral otherwise. */
function rankColorClass(rank: number, total: number): string {
  if (rank <= 3) return "bg-emerald-500 text-white shadow-emerald-500/30";
  if (total - rank < 3) return "bg-red-500 text-white shadow-red-500/30";
  return "bg-muted text-muted-foreground shadow-none";
}

// ─────────────────────────────────────────────────────────────────────────────
// NavIndicator — the per-nav-item indicator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders the appropriate micro-indicator for a given navigation path.
 *
 * Usage: place this inside each nav item `<Link>` as a sibling of the icon,
 * wrapping the icon in a `relative` container.
 *
 * ```tsx
 * <div className="relative">
 *   <item.icon className="w-[18px] h-[18px]" />
 *   <NavIndicator href={item.href} />
 * </div>
 * ```
 */
export function NavIndicator({ href }: { href: string }) {
  const data = useSidebarData();

  if (data.loading) return null;

  switch (href) {
    // ── 1. Timeline (/dashboard) ─────────────────────────────────────
    case "/dashboard": {
      if (data.unloggedHours > 0) {
        return <RedBadge count={data.timeGapCount} />;
      }
      return null;
    }

    // ── 2. Ahora (/now) ──────────────────────────────────────────────
    case "/now": {
      if (data.onlineCount > 0) {
        return <GreenBadge count={data.onlineCount} />;
      }
      return null;
    }

    // ── 3. Standup (/standup) ─────────────────────────────────────────
    case "/standup": {
      return data.standupDone ? (
        <StatusIcon variant="check" />
      ) : (
        <StatusIcon variant="exclamation" />
      );
    }

    // ── 4. Vigilancia (/vigilance) ───────────────────────────────────
    case "/vigilance": {
      if (data.ghostCount > 0) {
        return <RedBadge count={data.ghostCount} />;
      }
      return null;
    }

    // ── 5. Accountability (/accountability) ──────────────────────────
    case "/accountability": {
      if (data.unresolvedFlagCount > 0) {
        return <OrangeBadge count={data.unresolvedFlagCount} />;
      }
      return null;
    }

    // ── 6. Power Rankings (/power-rankings) ──────────────────────────
    case "/power-rankings": {
      if (data.powerRank !== null && data.powerRankTotal !== null) {
        return (
          <TextBadge
            text={`#${data.powerRank}`}
            colorClass={rankColorClass(data.powerRank, data.powerRankTotal)}
          />
        );
      }
      return null;
    }

    // ── 7. Leaderboard (/leaderboard) ────────────────────────────────
    case "/leaderboard": {
      if (data.trustScore !== null) {
        return (
          <TextBadge
            text={String(Math.round(data.trustScore))}
            colorClass={trustScoreColorClass(data.trustScore)}
          />
        );
      }
      return null;
    }

    // ── 8. El Espejo (/mirror) ───────────────────────────────────────
    case "/mirror": {
      if (data.mirrorTier) {
        return (
          <TextBadge
            text={data.mirrorTier.toUpperCase()}
            colorClass={tierColorClass(data.mirrorTier)}
          />
        );
      }
      return null;
    }

    // ── 9. Journal (/journal) ────────────────────────────────────────
    case "/journal": {
      if (isFridayOrLater() && !data.journalDone) {
        return <StatusDot color="red" />;
      }
      return null;
    }

    // ── 10. Pulse (/pulse) ───────────────────────────────────────────
    case "/pulse": {
      if (!data.pulseDone) {
        return <StatusDot color="red" />;
      }
      return null;
    }

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NavItemWithIndicator — convenience wrapper for nav items
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps a nav item icon in a relative container and appends the
 * appropriate NavIndicator. Can be used directly in the NavSection
 * component to add indicator support.
 *
 * ```tsx
 * <NavItemWithIndicator href="/dashboard">
 *   <LayoutDashboard className="w-[18px] h-[18px]" />
 * </NavItemWithIndicator>
 * ```
 */
export function NavItemWithIndicator({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <span className="relative inline-flex">
      {children}
      <NavIndicator href={href} />
    </span>
  );
}
