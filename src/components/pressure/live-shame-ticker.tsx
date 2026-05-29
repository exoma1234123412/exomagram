"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { TimeEntry, Profile, ActivityStreak } from "@/lib/types/database";
import { cn, getInitials } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  Clock,
  TrendingUp,
  AlertTriangle,
  Flame,
  Trophy,
  Target,
  Skull,
  Zap,
  Users,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EntryWithProfile = TimeEntry & { profiles: Profile };

interface MemberSummary {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  totalHours: number;
  entriesCount: number;
  withProof: number;
  latestEntry: string; // ISO timestamp of the most recent log
}

interface TickerItem {
  id: string;
  icon: string;
  message: string;
  variant: "celebration" | "warning" | "danger" | "info" | "record";
  timestamp: number; // for ordering
}

interface LiveShameTickerProps {
  orgId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORKDAY_END_HOUR = 18; // 6 PM cutoff
const REFRESH_INTERVAL_MS = 60_000; // 60 seconds
const COUNTDOWN_TICK_MS = 1_000; // 1 second for countdown

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWorkdayRemaining(): { hours: number; minutes: number; expired: boolean } {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(WORKDAY_END_HOUR, 0, 0, 0);
  const diff = endOfDay.getTime() - now.getTime();
  if (diff <= 0) return { hours: 0, minutes: 0, expired: true };
  const totalMinutes = Math.floor(diff / 60_000);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    expired: false,
  };
}

function buildMemberSummaries(
  entries: EntryWithProfile[],
): Map<string, MemberSummary> {
  const map = new Map<string, MemberSummary>();
  for (const entry of entries) {
    const existing = map.get(entry.user_id);
    const hasProof =
      entry.proof_urls && entry.proof_urls.length > 0 ? 1 : 0;
    if (existing) {
      existing.totalHours += 1;
      existing.entriesCount += 1;
      existing.withProof += hasProof;
      if (entry.logged_at > existing.latestEntry) {
        existing.latestEntry = entry.logged_at;
      }
    } else {
      map.set(entry.user_id, {
        userId: entry.user_id,
        fullName:
          entry.profiles?.full_name ?? "Desconocido",
        avatarUrl: entry.profiles?.avatar_url ?? null,
        totalHours: 1,
        entriesCount: 1,
        withProof: hasProof,
        latestEntry: entry.logged_at ?? entry.created_at,
      });
    }
  }
  return map;
}

function buildTickerItems(
  summaries: Map<string, MemberSummary>,
  currentUserId: string | null,
  streaks: Map<string, ActivityStreak>,
): TickerItem[] {
  const items: TickerItem[] = [];
  const members = Array.from(summaries.values());
  const sorted = [...members].sort((a, b) => b.totalHours - a.totalHours);

  // --- Per-member events ---
  for (const m of members) {
    const firstName = m.fullName.split(" ")[0];

    // Completed full day
    if (m.totalHours >= EXPECTED_DAILY_HOURS) {
      items.push({
        id: `complete-${m.userId}`,
        icon: "\uD83D\uDD25", // fire
        message: `${firstName} acaba de registrar su hora ${m.totalHours} \u2014 dia completo`,
        variant: "celebration",
        timestamp: new Date(m.latestEntry).getTime(),
      });
    }

    // 100% proof
    if (m.entriesCount > 0 && m.withProof === m.entriesCount) {
      items.push({
        id: `proof-${m.userId}`,
        icon: "\u26A1", // zap
        message: `${firstName} tiene 100% evidencia hoy`,
        variant: "celebration",
        timestamp: new Date(m.latestEntry).getTime() - 1,
      });
    }

    // Streak record
    const streak = streaks.get(m.userId);
    if (streak && streak.current_streak > 7) {
      items.push({
        id: `streak-${m.userId}`,
        icon: "\uD83C\uDFC6", // trophy
        message: `${firstName} rompio su record: ${streak.current_streak} dias de racha`,
        variant: "record",
        timestamp: new Date(m.latestEntry).getTime() - 2,
      });
    }
  }

  // --- Team aggregate events ---
  const completedCount = members.filter(
    (m) => m.totalHours >= EXPECTED_DAILY_HOURS,
  ).length;
  const totalMembers = members.length;

  // How many completed
  if (completedCount > 0 && currentUserId) {
    const myHours = summaries.get(currentUserId)?.totalHours ?? 0;
    if (myHours < EXPECTED_DAILY_HOURS) {
      items.push({
        id: "completed-pressure",
        icon: "\u26A0\uFE0F", // warning
        message: `${completedCount} persona${completedCount > 1 ? "s" : ""} ya completaron su dia. Tu llevas ${myHours}/${EXPECTED_DAILY_HOURS}.`,
        variant: "warning",
        timestamp: Date.now() - 100,
      });
    }
  }

  // Team daily percentage
  if (totalMembers > 0) {
    const totalLogged = members.reduce((s, m) => s + m.totalHours, 0);
    const totalExpected = totalMembers * EXPECTED_DAILY_HOURS;
    const pct = Math.round((totalLogged / totalExpected) * 100);
    items.push({
      id: "team-pct",
      icon: "\uD83C\uDFAF", // dart
      message: `El equipo lleva ${pct}% del objetivo diario`,
      variant: pct >= 80 ? "celebration" : pct >= 50 ? "info" : "warning",
      timestamp: Date.now() - 200,
    });
  }

  // Urgency: remaining hours vs your missing entries
  if (currentUserId) {
    const myHours = summaries.get(currentUserId)?.totalHours ?? 0;
    const remaining = getWorkdayRemaining();
    const missing = EXPECTED_DAILY_HOURS - myHours;
    if (!remaining.expired && missing > 0 && remaining.hours <= 3) {
      items.push({
        id: "urgency-deadline",
        icon: "\uD83D\uDC80", // skull
        message: `Quedan ${remaining.hours}h ${remaining.minutes}m de trabajo y te faltan ${missing} entradas`,
        variant: "danger",
        timestamp: Date.now() - 50,
      });
    }
  }

  // Sort by timestamp descending (newest first)
  items.sort((a, b) => b.timestamp - a.timestamp);
  return items;
}

// ---------------------------------------------------------------------------
// Variant Styles
// ---------------------------------------------------------------------------

const variantStyles: Record<
  TickerItem["variant"],
  { bg: string; border: string; text: string; pulse: string }
> = {
  celebration: {
    bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
    border: "border-emerald-500/30",
    text: "text-emerald-700 dark:text-emerald-300",
    pulse: "shadow-emerald-500/40",
  },
  warning: {
    bg: "bg-amber-500/10 dark:bg-amber-500/15",
    border: "border-amber-500/30",
    text: "text-amber-700 dark:text-amber-300",
    pulse: "shadow-amber-500/40",
  },
  danger: {
    bg: "bg-red-500/10 dark:bg-red-500/20",
    border: "border-red-500/40",
    text: "text-red-700 dark:text-red-300",
    pulse: "shadow-red-500/50",
  },
  info: {
    bg: "bg-blue-500/10 dark:bg-blue-500/15",
    border: "border-blue-500/30",
    text: "text-blue-700 dark:text-blue-300",
    pulse: "shadow-blue-500/40",
  },
  record: {
    bg: "bg-violet-500/10 dark:bg-violet-500/15",
    border: "border-violet-500/30",
    text: "text-violet-700 dark:text-violet-300",
    pulse: "shadow-violet-500/40",
  },
};

const variantIcon: Record<TickerItem["variant"], typeof Flame> = {
  celebration: Flame,
  warning: AlertTriangle,
  danger: Skull,
  info: Target,
  record: Trophy,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LiveShameTicker({ orgId }: LiveShameTickerProps) {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  const [items, setItems] = useState<TickerItem[]>([]);
  const [position, setPosition] = useState<{
    rank: number;
    total: number;
    isLast: boolean;
  } | null>(null);
  const [countdown, setCountdown] = useState(getWorkdayRemaining);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const prevItemsRef = useRef<Set<string>>(new Set());

  // ---- Fetch current user ----
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Countdown ticker ----
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getWorkdayRemaining());
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // ---- Data fetching ----
  const fetchData = useCallback(async () => {
    if (!currentUserId) return;

    // Fetch all today's entries for the org
    const { data: entries } = await supabase
      .from("time_entries")
      .select("*, profiles(full_name, avatar_url)")
      .eq("org_id", orgId)
      .eq("date", today)
      .order("created_at", { ascending: false })
      ;

    // Fetch streaks for org members
    const { data: streakData } = await supabase
      .from("activity_streaks")
      .select("*")
      .eq("org_id", orgId)
      ;

    const streaks = new Map<string, ActivityStreak>();
    for (const s of streakData ?? []) {
      streaks.set(s.user_id, s);
    }

    const summaries = buildMemberSummaries(entries ?? []);
    const tickerItems = buildTickerItems(summaries, currentUserId, streaks);

    // Detect new items for animation
    const newIds = new Set(tickerItems.map((i) => i.id));
    const freshIds = new Set<string>();
    for (const id of newIds) {
      if (!prevItemsRef.current.has(id)) {
        freshIds.add(id);
      }
    }
    prevItemsRef.current = newIds;
    if (freshIds.size > 0) {
      setAnimatingIds(freshIds);
      setTimeout(() => setAnimatingIds(new Set()), 700);
    }

    // Calculate position
    const sorted = Array.from(summaries.values()).sort(
      (a, b) => b.totalHours - a.totalHours,
    );
    const myIndex = sorted.findIndex((m) => m.userId === currentUserId);
    if (myIndex >= 0) {
      setPosition({
        rank: myIndex + 1,
        total: sorted.length,
        isLast: myIndex === sorted.length - 1 && sorted.length > 1,
      });
    } else {
      // User hasn't logged anything yet
      setPosition({
        rank: sorted.length + 1,
        total: sorted.length + 1,
        isLast: true,
      });
    }

    setItems(tickerItems);
    setLoading(false);
  }, [currentUserId, orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Initial load + polling ----
  useEffect(() => {
    if (!currentUserId) return;
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [currentUserId, fetchData]);

  // ---- Real-time subscription ----
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel("shame_ticker_rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          // Refetch all data on any new insert
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, orgId, fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Loading state ----
  if (loading) {
    return (
      <Card className="relative overflow-hidden">
        <CardContent className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Zap className="size-4 animate-pulse" />
            <span>Cargando actividad en vivo...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Render ----
  return (
    <Card className="relative overflow-hidden border-2 border-primary/20">
      {/* Animated accent bar */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 animate-pulse" />

      {/* Header */}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="size-4 text-amber-500" />
            Actividad en Vivo
            <Badge variant="destructive" className="text-[10px] uppercase tracking-wider animate-pulse">
              En vivo
            </Badge>
          </CardTitle>

          {/* Countdown */}
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs font-mono font-semibold rounded-full px-3 py-1 border",
              countdown.expired
                ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
                : countdown.hours <= 2
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 animate-pulse"
                  : "bg-muted text-muted-foreground border-border",
            )}
          >
            <Clock className="size-3" />
            {countdown.expired
              ? "Jornada finalizada"
              : `Quedan ${countdown.hours}h ${String(countdown.minutes).padStart(2, "0")}m`}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pb-3">
        {/* Position banner */}
        {position && (
          <div
            className={cn(
              "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium border",
              position.isLast
                ? "bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-300 animate-pulse"
                : position.rank <= 3
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                  : "bg-muted border-border text-foreground",
            )}
          >
            <div className="flex items-center gap-2">
              {position.isLast ? (
                <Skull className="size-4" />
              ) : position.rank <= 3 ? (
                <Trophy className="size-4" />
              ) : (
                <Users className="size-4" />
              )}
              {position.isLast ? (
                <span>Eres el ultimo en horas registradas</span>
              ) : (
                <span>
                  Eres #{position.rank} de {position.total} en horas registradas hoy
                </span>
              )}
            </div>
            <TrendingUp className="size-4 opacity-60" />
          </div>
        )}

        {/* Ticker items */}
        <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
              <Target className="size-8 mb-2 opacity-40" />
              <p className="text-sm">Nadie ha registrado horas hoy.</p>
              <p className="text-xs mt-1">Se el primero.</p>
            </div>
          ) : (
            items.map((item) => {
              const style = variantStyles[item.variant];
              const Icon = variantIcon[item.variant];
              const isNew = animatingIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-all duration-500",
                    style.bg,
                    style.border,
                    style.text,
                    item.variant === "danger" && "shadow-md shadow-red-500/20",
                    item.variant === "celebration" && "shadow-sm shadow-emerald-500/20",
                    isNew && "animate-slide-in-top",
                  )}
                >
                  <span className="text-base leading-none mt-0.5 shrink-0">
                    {item.icon}
                  </span>
                  <span className="text-sm leading-snug font-medium flex-1">
                    {item.message}
                  </span>
                  <Icon
                    className={cn(
                      "size-3.5 mt-0.5 shrink-0 opacity-50",
                      item.variant === "danger" && "animate-pulse",
                    )}
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Recent loggers - avatar row */}
        <RecentLoggers orgId={orgId} />
      </CardContent>

      {/* CSS animations */}
      <style jsx>{`
        @keyframes slide-in-top {
          0% {
            opacity: 0;
            transform: translateY(-16px) scale(0.97);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-slide-in-top {
          animation: slide-in-top 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Recent Loggers (avatar strip with recency)
// ---------------------------------------------------------------------------

function RecentLoggers({ orgId }: { orgId: string }) {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const [loggers, setLoggers] = useState<
    { userId: string; name: string; avatar: string | null; ago: string }[]
  >([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("time_entries")
        .select("user_id, logged_at, profiles(full_name, avatar_url)")
        .eq("org_id", orgId)
        .eq("date", today)
        .order("logged_at", { ascending: false })
        .limit(50);

      if (!data) return;

      // Deduplicate by user, keep latest
      const seen = new Map<
        string,
        { userId: string; name: string; avatar: string | null; loggedAt: string }
      >();
      for (const d of data) {
        if (!seen.has(d.user_id)) {
          seen.set(d.user_id, {
            userId: d.user_id,
            name: d.profiles?.full_name ?? "?",
            avatar: d.profiles?.avatar_url ?? null,
            loggedAt: d.logged_at,
          });
        }
      }

      const now = Date.now();
      setLoggers(
        Array.from(seen.values())
          .sort(
            (a, b) =>
              new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
          )
          .slice(0, 8)
          .map((l) => {
            const diffMin = Math.round(
              (now - new Date(l.loggedAt).getTime()) / 60_000,
            );
            let ago: string;
            if (diffMin < 1) ago = "ahora";
            else if (diffMin < 60) ago = `${diffMin}m`;
            else ago = `${Math.round(diffMin / 60)}h`;
            return {
              userId: l.userId,
              name: l.name,
              avatar: l.avatar,
              ago,
            };
          }),
      );
    }
    load();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loggers.length === 0) return null;

  return (
    <div className="pt-2 border-t border-border/50">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
        Ultimas registros
      </p>
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {loggers.map((l) => (
          <div
            key={l.userId}
            className="flex flex-col items-center gap-1 shrink-0"
          >
            <div className="relative">
              <Avatar size="sm">
                {l.avatar ? (
                  <AvatarImage src={l.avatar} alt={l.name} />
                ) : null}
                <AvatarFallback>{getInitials(l.name)}</AvatarFallback>
              </Avatar>
              {l.ago === "ahora" && (
                <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground font-medium leading-none">
              {l.ago}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
