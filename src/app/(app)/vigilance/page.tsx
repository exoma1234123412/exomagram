"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  LiveStatus,
  TimeEntry,
  WorkCategory,
} from "@/lib/types/database";
import {
  CATEGORIES,
  WORK_HOURS,
  EXPECTED_DAILY_HOURS,
  LIVE_STATUS_CONFIG,
} from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Eye,
  Flame,
  TrendingUp,
  TrendingDown,
  Shield,
  Clock,
  AlertTriangle,
  Wifi,
  WifiOff,
  Skull,
  RefreshCw,
  Radio,
  Keyboard,
  Mouse,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusWithProfile = LiveStatus & { profiles: Profile };

interface MemberCard {
  profile: Profile;
  liveStatus: StatusWithProfile | null;
  entries: TimeEntry[];
  hoursLogged: number;
  proofPercent: number;
  lateCount: number;
  lastEntry: TimeEntry | null;
  streak: number;
  trustScore: number;
  trustTrend: "up" | "down" | "flat";
  heartbeatMinutesAgo: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function minutesAgo(dateStr: string | null | undefined): number {
  if (!dateStr) return 999;
  return (Date.now() - new Date(dateStr).getTime()) / 1000 / 60;
}

function formatMinutesAgo(minutes: number): string {
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

function getBorderColor(hours: number): string {
  if (hours >= EXPECTED_DAILY_HOURS)
    return "border-green-500 dark:border-green-600";
  if (hours >= 4) return "border-yellow-500 dark:border-yellow-600";
  if (hours > 0) return "border-red-500 dark:border-red-600";
  return "border-zinc-800 dark:border-zinc-700";
}

function getActivityColor(minutesAgo: number): {
  color: string;
  bg: string;
  label: string;
} {
  if (minutesAgo < 2)
    return {
      color: "text-green-500",
      bg: "bg-green-500",
      label: "Activo",
    };
  if (minutesAgo < 5)
    return {
      color: "text-yellow-500",
      bg: "bg-yellow-500",
      label: "Reciente",
    };
  return {
    color: "text-red-500",
    bg: "bg-red-500",
    label: "Inactivo",
  };
}

const HOUR_CATEGORY_COLORS: Record<string, string> = {
  deep_work: "bg-violet-500",
  meeting: "bg-blue-500",
  review: "bg-amber-500",
  admin: "bg-slate-400",
  planning: "bg-emerald-500",
  learning: "bg-pink-500",
  break: "bg-green-400",
  blocked: "bg-red-500",
};

// ---------------------------------------------------------------------------
// Alert types
// ---------------------------------------------------------------------------

interface Alert {
  type: "idle" | "ghost" | "signal_lost";
  icon: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VigilancePage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [cards, setCards] = useState<MemberCard[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const supabase = createClient();
  const refreshTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const today = new Date().toISOString().split("T")[0];

  // ---- Clock tick every second ----
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ---- Load org ----
  useEffect(() => {
    async function loadOrg() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string }>();

      if (membership) setOrgId(membership.org_id);
      else setLoading(false);
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Main data fetch ----
  const fetchData = useCallback(async () => {
    if (!orgId) return;

    // Get members
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id, role, profiles(*)")
      .eq("org_id", orgId)
      .returns<{ user_id: string; role: string; profiles: Profile }[]>();

    if (!members) {
      setLoading(false);
      return;
    }

    // Get live statuses
    const { data: statuses } = await supabase
      .from("live_status")
      .select("*, profiles(*)")
      .eq("org_id", orgId)
      .returns<StatusWithProfile[]>();

    // Get today's entries
    const { data: entries } = await supabase
      .from("time_entries")
      .select("*")
      .eq("org_id", orgId)
      .eq("date", today)
      .returns<TimeEntry[]>();

    // Get streaks
    const { data: streaks } = await supabase
      .from("activity_streaks")
      .select("user_id, current_streak")
      .eq("org_id", orgId);

    // Get trust score history (last 2 days for trend)
    const { data: trustHistory } = await supabase
      .from("trust_score_history")
      .select("user_id, date, score")
      .eq("org_id", orgId)
      .order("date", { ascending: false })
      .limit(members.length * 2);

    const statusMap = new Map<string, StatusWithProfile>();
    for (const s of statuses ?? []) {
      statusMap.set(s.user_id, s);
    }

    const streakMap = new Map<string, number>();
    for (const s of streaks ?? []) {
      streakMap.set(s.user_id, s.current_streak);
    }

    // Build trust score trend per user
    const trustMap = new Map<string, number[]>();
    for (const t of trustHistory ?? []) {
      if (!trustMap.has(t.user_id)) trustMap.set(t.user_id, []);
      trustMap.get(t.user_id)!.push(t.score);
    }

    const nowAlerts: Alert[] = [];

    const builtCards: MemberCard[] = members.map((m) => {
      const status = statusMap.get(m.user_id) ?? null;
      const userEntries = (entries ?? []).filter(
        (e) => e.user_id === m.user_id
      );
      const hoursLogged = userEntries.length;
      const withProof = userEntries.filter(
        (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
      );
      const lateOnes = userEntries.filter((e) => e.is_late);
      const proofPercent =
        hoursLogged > 0
          ? Math.round((withProof.length / hoursLogged) * 100)
          : 0;

      // Last entry (most recent by logged_at)
      const sorted = [...userEntries].sort(
        (a, b) =>
          new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
      );
      const lastEntry = sorted.length > 0 ? sorted[0] : null;

      const streak = streakMap.get(m.user_id) ?? 0;

      // Trust score
      const hoursRatio = Math.min(hoursLogged / EXPECTED_DAILY_HOURS, 1);
      const proofRatio = proofPercent / 100;
      const lateRatio =
        hoursLogged > 0 ? lateOnes.length / hoursLogged : 0;
      const rawTrust =
        hoursRatio * 0.3 + proofRatio * 0.3 + 0.2 - lateRatio * 0.2;
      const trustScore = Math.max(
        0,
        Math.min(100, Math.round(rawTrust * 100))
      );

      // Trust trend
      const scores = trustMap.get(m.user_id) ?? [];
      let trustTrend: "up" | "down" | "flat" = "flat";
      if (scores.length >= 2) {
        if (scores[0] > scores[1] + 3) trustTrend = "up";
        else if (scores[0] < scores[1] - 3) trustTrend = "down";
      }

      const heartbeatMin = minutesAgo(status?.last_heartbeat);

      // Alerts
      const name =
        m.profiles?.full_name?.split(" ")[0] ?? m.profiles?.email ?? "?";

      if (
        status &&
        status.status === "idle" &&
        heartbeatMin > 15
      ) {
        nowAlerts.push({
          type: "idle",
          icon: "\u26a0\ufe0f",
          message: `${name} inactivo hace ${Math.round(heartbeatMin)}m`,
        });
      }

      if (
        status &&
        status.status !== "offline" &&
        hoursLogged === 0
      ) {
        nowAlerts.push({
          type: "ghost",
          icon: "\ud83d\udc7b",
          message: `${name} en linea sin registros`,
        });
      }

      if (
        status &&
        status.status !== "offline" &&
        heartbeatMin > 5
      ) {
        nowAlerts.push({
          type: "signal_lost",
          icon: "\ud83d\udce1",
          message: `${name} senal perdida`,
        });
      }

      return {
        profile: m.profiles,
        liveStatus: status,
        entries: userEntries,
        hoursLogged,
        proofPercent,
        lateCount: lateOnes.length,
        lastEntry,
        streak,
        trustScore,
        trustTrend,
        heartbeatMinutesAgo: heartbeatMin,
      };
    });

    // Sort: online first, then by hours ascending
    const statusOrder: Record<string, number> = {
      online: 0,
      deep_work: 1,
      in_meeting: 2,
      idle: 3,
      break: 4,
      offline: 5,
    };

    builtCards.sort((a, b) => {
      const aStatus = a.liveStatus?.status ?? "offline";
      const bStatus = b.liveStatus?.status ?? "offline";
      const aOnline = aStatus !== "offline" ? 0 : 1;
      const bOnline = bStatus !== "offline" ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return a.hoursLogged - b.hoursLogged;
    });

    setCards(builtCards);
    setAlerts(nowAlerts);
    setLastRefresh(new Date());
    setLoading(false);
  }, [orgId, today, supabase]);

  // ---- Initial load + 30s auto-refresh ----
  useEffect(() => {
    if (!orgId) return;
    fetchData();

    refreshTimerRef.current = setInterval(fetchData, 30000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [orgId, fetchData]);

  // ---- Realtime subscriptions ----
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("vigilance_rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_status",
          filter: `org_id=eq.${orgId}`,
        },
        () => fetchData()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchData, supabase]);

  // ---- Derived stats ----
  const onlineCount = cards.filter(
    (c) => c.liveStatus?.status === "online"
  ).length;
  const idleCount = cards.filter(
    (c) => c.liveStatus?.status === "idle"
  ).length;
  const deepWorkCount = cards.filter(
    (c) => c.liveStatus?.status === "deep_work"
  ).length;
  const offlineCount = cards.filter(
    (c) => !c.liveStatus || c.liveStatus.status === "offline"
  ).length;
  const totalHoursToday = cards.reduce((acc, c) => acc + c.hoursLogged, 0);
  const onlinePeople = cards.filter(
    (c) => c.liveStatus && c.liveStatus.status !== "offline"
  );
  const loggingPeople = onlinePeople.filter((c) => c.hoursLogged > 0);
  const transparencyPercent =
    onlinePeople.length > 0
      ? Math.round((loggingPeople.length / onlinePeople.length) * 100)
      : 0;

  // ---- Current hour (for highlighting past hours) ----
  const currentHour = new Date().getHours();

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-700 animate-pulse flex items-center justify-center">
            <Eye className="w-6 h-6 text-white" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">
            Iniciando vigilancia...
          </p>
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">
          Primero crea o unete a un equipo desde el Dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/* TOP BAR                                                          */}
      {/* ================================================================ */}
      <div className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-border/50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Title + pulsing dot */}
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
              </span>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight uppercase text-foreground">
                Vigilancia en Tiempo Real
              </h1>
            </div>

            {/* Team-wide stats */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
              <Badge
                variant="outline"
                className="gap-1 border-green-300 dark:border-green-800 text-green-700 dark:text-green-400"
              >
                <Wifi className="w-3 h-3" />
                {onlineCount} online
              </Badge>
              {deepWorkCount > 0 && (
                <Badge
                  variant="outline"
                  className="gap-1 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-400"
                >
                  {deepWorkCount} deep work
                </Badge>
              )}
              <Badge
                variant="outline"
                className="gap-1 border-yellow-300 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400"
              >
                {idleCount} idle
              </Badge>
              <Badge
                variant="outline"
                className="gap-1 border-zinc-300 dark:border-zinc-700 text-zinc-500"
              >
                <WifiOff className="w-3 h-3" />
                {offlineCount} offline
              </Badge>
              <div className="h-4 w-px bg-border" />
              <span className="text-muted-foreground">
                Total hoy:{" "}
                <span className="font-bold text-foreground">
                  {totalHoursToday}h
                </span>
              </span>
              <span className="text-muted-foreground">
                Transparencia:{" "}
                <span
                  className={cn(
                    "font-bold",
                    transparencyPercent >= 80
                      ? "text-green-600"
                      : transparencyPercent >= 50
                        ? "text-yellow-600"
                        : "text-red-600"
                  )}
                >
                  {transparencyPercent}%
                </span>
              </span>
              <div className="h-4 w-px bg-border" />
              {/* Clock */}
              <span className="font-mono tabular-nums text-foreground">
                {format(currentTime, "HH:mm:ss")}
              </span>
              {/* Last refresh indicator */}
              <span className="text-muted-foreground/50 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                {format(lastRefresh, "HH:mm:ss")}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        {/* ================================================================ */}
        {/* ALERTS                                                           */}
        {/* ================================================================ */}
        {alerts.length > 0 && (
          <div className="mb-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <h3 className="text-sm font-bold text-red-700 dark:text-red-400">
                Alertas activas ({alerts.length})
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {alerts.map((alert, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className={cn(
                    "text-xs py-1",
                    alert.type === "idle" &&
                      "border-yellow-400 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/20",
                    alert.type === "ghost" &&
                      "border-purple-400 text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20",
                    alert.type === "signal_lost" &&
                      "border-red-400 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20"
                  )}
                >
                  {alert.icon} {alert.message}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* PERSON CARDS GRID                                                */}
        {/* ================================================================ */}
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Eye className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No hay miembros en este equipo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {cards.map((card) => (
              <PersonCard
                key={card.profile.id}
                card={card}
                currentHour={currentHour}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Person Card
// ---------------------------------------------------------------------------

function PersonCard({
  card,
  currentHour,
}: {
  card: MemberCard;
  currentHour: number;
}) {
  const status = card.liveStatus?.status ?? "offline";
  const statusConfig = LIVE_STATUS_CONFIG[status];
  const borderColor = getBorderColor(card.hoursLogged);
  const activityInfo = getActivityColor(card.heartbeatMinutesAgo);
  const isOnline = status !== "offline";
  const progressPercent = Math.min(
    (card.hoursLogged / EXPECTED_DAILY_HOURS) * 100,
    100
  );

  // Build hour slot lookup
  const hourMap = new Map<number, TimeEntry>();
  for (const e of card.entries) {
    hourMap.set(e.hour, e);
  }

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300 border-2",
        borderColor,
        !isOnline && "opacity-60",
        card.hoursLogged === 0 &&
          "bg-zinc-950/5 dark:bg-zinc-950/30"
      )}
    >
      {/* Skull overlay for 0h */}
      {card.hoursLogged === 0 && (
        <div className="absolute top-2 right-2 text-3xl opacity-15 pointer-events-none">
          <Skull className="w-10 h-10" />
        </div>
      )}

      <CardContent className="p-4 space-y-3">
        {/* ---- Row 1: Avatar + name + status ---- */}
        <div className="flex items-start gap-3">
          <div className="relative">
            <Avatar className="w-12 h-12 ring-2 ring-background shadow-md">
              <AvatarImage src={card.profile.avatar_url ?? undefined} />
              <AvatarFallback className="text-sm font-bold bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
                {getInitials(card.profile.full_name)}
              </AvatarFallback>
            </Avatar>
            {/* Status dot */}
            <div
              className={cn(
                "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card",
                statusConfig.dotColor,
                status === "online" && "animate-pulse"
              )}
            />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm truncate">
              {card.profile.full_name ?? card.profile.email}
            </h3>
            {card.profile.role && (
              <p className="text-[10px] text-muted-foreground truncate">
                {card.profile.role}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={cn(
                  "text-[10px] font-semibold",
                  statusConfig.color
                )}
              >
                {statusConfig.label}
              </span>
              {card.liveStatus?.current_task && isOnline && (
                <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                  - {card.liveStatus.current_task}
                </span>
              )}
            </div>
          </div>

          {/* Activity indicator */}
          {isOnline && (
            <div
              className={cn(
                "flex flex-col items-center gap-0.5",
                activityInfo.color
              )}
            >
              <div className="flex items-center gap-1">
                <Mouse className="w-3 h-3" />
                <Keyboard className="w-3 h-3" />
              </div>
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  activityInfo.bg
                )}
              />
              <span className="text-[8px] font-medium">
                {activityInfo.label}
              </span>
            </div>
          )}
        </div>

        {/* ---- Row 2: Heartbeat + hours progress ---- */}
        <div className="space-y-1.5">
          {/* Heartbeat */}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground flex items-center gap-1">
              <Radio className="w-3 h-3" />
              Ultima senal: hace{" "}
              {card.liveStatus
                ? formatMinutesAgo(card.heartbeatMinutesAgo)
                : "N/A"}
            </span>
            <span className="font-semibold">
              {card.hoursLogged}/{EXPECTED_DAILY_HOURS}h
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2.5 bg-muted/30 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                card.hoursLogged >= EXPECTED_DAILY_HOURS
                  ? "bg-gradient-to-r from-green-400 to-green-600"
                  : card.hoursLogged >= 4
                    ? "bg-gradient-to-r from-yellow-400 to-yellow-600"
                    : card.hoursLogged > 0
                      ? "bg-gradient-to-r from-red-400 to-red-600"
                      : "bg-zinc-600"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* ---- Row 3: Hour slots (7am-6pm) ---- */}
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground/60 font-semibold uppercase tracking-wider">
            Horas del dia
          </p>
          <div className="flex gap-0.5">
            {WORK_HOURS.map((hour) => {
              const entry = hourMap.get(hour);
              const isPast = hour < currentHour;
              const isCurrent = hour === currentHour;
              const isEmpty = !entry;
              const bgColor = entry
                ? HOUR_CATEGORY_COLORS[entry.category] ?? "bg-blue-500"
                : isPast
                  ? "bg-zinc-300 dark:bg-zinc-700"
                  : "bg-muted/20 dark:bg-muted/10";

              return (
                <div
                  key={hour}
                  className={cn(
                    "w-full h-4 rounded-sm transition-all",
                    bgColor,
                    entry && "opacity-85 hover:opacity-100",
                    isEmpty && isPast && "opacity-60",
                    isCurrent && "ring-1 ring-foreground/30"
                  )}
                  title={
                    entry
                      ? `${hour}:00 - ${CATEGORIES[entry.category].emoji} ${CATEGORIES[entry.category].label}: ${entry.title}`
                      : `${hour}:00 - ${isPast ? "Sin registro" : "Pendiente"}`
                  }
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[8px] text-muted-foreground/40 tabular-nums">
            <span>7AM</span>
            <span>12PM</span>
            <span>6PM</span>
          </div>
        </div>

        {/* ---- Row 4: Stats grid ---- */}
        <div className="grid grid-cols-4 gap-1.5">
          {/* Proof rate */}
          <div className="text-center p-1.5 bg-accent/30 rounded-lg">
            <div className="flex items-center justify-center gap-0.5">
              <Shield className="w-3 h-3 text-muted-foreground" />
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  card.proofPercent >= 80
                    ? "text-green-600"
                    : card.proofPercent >= 50
                      ? "text-yellow-600"
                      : "text-red-600"
                )}
              >
                {card.proofPercent}%
              </span>
            </div>
            <p className="text-[8px] text-muted-foreground">Evidencia</p>
          </div>

          {/* Late entries */}
          <div className="text-center p-1.5 bg-accent/30 rounded-lg">
            <div className="flex items-center justify-center gap-0.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  card.lateCount === 0
                    ? "text-green-600"
                    : "text-orange-600"
                )}
              >
                {card.lateCount}
              </span>
            </div>
            <p className="text-[8px] text-muted-foreground">Tardias</p>
          </div>

          {/* Streak */}
          <div className="text-center p-1.5 bg-accent/30 rounded-lg">
            <div className="flex items-center justify-center gap-0.5">
              <Flame
                className={cn(
                  "w-3 h-3",
                  card.streak > 0
                    ? "text-orange-500"
                    : "text-muted-foreground"
                )}
              />
              <span className="text-sm font-bold tabular-nums">
                {card.streak}
              </span>
            </div>
            <p className="text-[8px] text-muted-foreground">Racha</p>
          </div>

          {/* Trust score */}
          <div className="text-center p-1.5 bg-accent/30 rounded-lg">
            <div className="flex items-center justify-center gap-0.5">
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  card.trustScore >= 80
                    ? "text-green-600"
                    : card.trustScore >= 60
                      ? "text-blue-600"
                      : card.trustScore >= 40
                        ? "text-yellow-600"
                        : "text-red-600"
                )}
              >
                {card.trustScore}
              </span>
              {card.trustTrend === "up" && (
                <TrendingUp className="w-3 h-3 text-green-500" />
              )}
              {card.trustTrend === "down" && (
                <TrendingDown className="w-3 h-3 text-red-500" />
              )}
            </div>
            <p className="text-[8px] text-muted-foreground">Trust</p>
          </div>
        </div>

        {/* ---- Row 5: Last entry ---- */}
        {card.lastEntry ? (
          <div className="bg-accent/20 rounded-lg px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">
                {CATEGORIES[card.lastEntry.category].emoji}
              </span>
              <span className="text-[10px] font-semibold truncate flex-1">
                {card.lastEntry.title}
              </span>
              <span className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
                {format(new Date(card.lastEntry.logged_at), "HH:mm", {
                  locale: es,
                })}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {CATEGORIES[card.lastEntry.category].label} -{" "}
              {card.lastEntry.hour}:00
            </p>
          </div>
        ) : (
          <div className="bg-red-50 dark:bg-red-950/20 rounded-lg px-2.5 py-2 text-center">
            <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">
              Sin entradas hoy
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
