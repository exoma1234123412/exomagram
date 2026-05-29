"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LiveStatus, Profile, TimeEntry } from "@/lib/types/database";
import { LIVE_STATUS_CONFIG } from "@/lib/constants";
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import { Ghost, Wifi, WifiOff, AlertTriangle, Eye } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusWithProfile = LiveStatus & { profiles: Profile };

type GhostType = "no_entries" | "fake_deep_work" | "lost_signal";

interface GhostRecord {
  type: GhostType;
  user: Profile;
  status: LiveStatus;
  /** Minutes the person has been online */
  onlineMinutes: number;
  /** Minutes since last heartbeat */
  heartbeatAgoMinutes: number;
  /** Human-readable description */
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minutesSince(dateStr: string) {
  return (Date.now() - new Date(dateStr).getTime()) / 1000 / 60;
}

function formatDuration(minutes: number) {
  if (minutes < 1) return "< 1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GHOST_ONLINE_THRESHOLD_MIN = 60; // 1 hour online with 0 entries
const DEEP_WORK_GAP_MIN = 120; // 2 hours without a deep_work entry
const SIGNAL_LOST_MIN = 15; // 15 min without heartbeat
const LOW_TRANSPARENCY_THRESHOLD = 70; // percentage

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GhostDetector({ orgId }: { orgId: string }) {
  const supabase = createClient();

  const [statuses, setStatuses] = useState<StatusWithProfile[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // ---- Data fetching ---------------------------------------------------------

  const fetchStatuses = useCallback(async () => {
    const { data } = await supabase
      .from("live_status")
      .select("*, profiles(*)")
      .eq("org_id", orgId)
      ;
    setStatuses(data ?? []);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEntries = useCallback(async () => {
    const { data } = await supabase
      .from("time_entries")
      .select("*")
      .eq("org_id", orgId)
      .eq("date", todayISO())
      ;
    setEntries(data ?? []);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function init() {
      await Promise.all([fetchStatuses(), fetchEntries()]);
      setLoading(false);
    }
    init();

    // Real-time subscriptions
    const channel = supabase
      .channel("ghost_detector_rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_status",
          filter: `org_id=eq.${orgId}`,
        },
        () => fetchStatuses(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => fetchEntries(),
      )
      .subscribe();

    // Re-evaluate every 60s so time-based thresholds stay fresh
    const tick = setInterval(() => {
      fetchStatuses();
      fetchEntries();
    }, 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(tick);
    };
  }, [orgId, fetchStatuses, fetchEntries]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Ghost analysis --------------------------------------------------------

  const ghosts = useMemo<GhostRecord[]>(() => {
    const today = todayISO();
    const result: GhostRecord[] = [];

    // Index: entries per user today
    const entriesByUser = new Map<string, TimeEntry[]>();
    for (const e of entries) {
      if (e.date !== today) continue;
      const list = entriesByUser.get(e.user_id) ?? [];
      list.push(e);
      entriesByUser.set(e.user_id, list);
    }

    for (const s of statuses) {
      if (s.status === "offline") continue;
      const profile = s.profiles;
      if (!profile) continue;

      const onlineMin = minutesSince(s.started_at);
      const heartbeatAgo = minutesSince(s.last_heartbeat);
      const userEntries = entriesByUser.get(s.user_id) ?? [];
      const firstName = profile.full_name?.split(" ")[0] ?? "?";

      // 1) Online >1h with 0 entries today
      if (onlineMin >= GHOST_ONLINE_THRESHOLD_MIN && userEntries.length === 0) {
        result.push({
          type: "no_entries",
          user: profile,
          status: s,
          onlineMinutes: onlineMin,
          heartbeatAgoMinutes: heartbeatAgo,
          message: `${firstName} lleva ${formatDuration(onlineMin)} en linea sin registrar ninguna hora`,
        });
        continue; // Don't double-report the same person
      }

      // 2) "deep_work" status but no deep_work entry in the last 2 hours
      if (s.status === "deep_work") {
        const recentDeep = userEntries.some(
          (e) =>
            e.category === "deep_work" &&
            minutesSince(e.logged_at) < DEEP_WORK_GAP_MIN,
        );
        if (!recentDeep) {
          result.push({
            type: "fake_deep_work",
            user: profile,
            status: s,
            onlineMinutes: onlineMin,
            heartbeatAgoMinutes: heartbeatAgo,
            message: `${firstName} dice estar en Deep Work pero no ha registrado nada`,
          });
          continue;
        }
      }

      // 3) Heartbeat stopped >15 min ago but not offline
      if (heartbeatAgo >= SIGNAL_LOST_MIN) {
        result.push({
          type: "lost_signal",
          user: profile,
          status: s,
          onlineMinutes: onlineMin,
          heartbeatAgoMinutes: heartbeatAgo,
          message: `${firstName} dejo de enviar senal hace ${formatDuration(heartbeatAgo)}`,
        });
      }
    }

    return result;
  }, [statuses, entries]);

  // ---- Transparency score ----------------------------------------------------

  const transparencyScore = useMemo(() => {
    const today = todayISO();
    const onlineUsers = statuses.filter((s) => s.status !== "offline");
    if (onlineUsers.length === 0) return 100;

    const entriesByUser = new Set(
      entries.filter((e) => e.date === today).map((e) => e.user_id),
    );
    const loggingCount = onlineUsers.filter((s) =>
      entriesByUser.has(s.user_id),
    ).length;

    return Math.round((loggingCount / onlineUsers.length) * 100);
  }, [statuses, entries]);

  // ---- Icon per ghost type ---------------------------------------------------

  function ghostIcon(type: GhostType) {
    switch (type) {
      case "no_entries":
        return <Ghost className="h-4 w-4 text-muted-foreground" />;
      case "fake_deep_work":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "lost_signal":
        return <WifiOff className="h-4 w-4 text-red-500" />;
    }
  }

  function ghostEmoji(type: GhostType) {
    switch (type) {
      case "no_entries":
        return "\u{1F47B}"; // ghost
      case "fake_deep_work":
        return "\u{1F914}"; // thinking
      case "lost_signal":
        return "\u{1F4E1}"; // satellite
    }
  }

  // ---- Render ----------------------------------------------------------------

  if (loading) {
    return (
      <Card size="sm">
        <CardContent>
          <div className="flex items-center gap-2 py-2">
            <Ghost className="h-4 w-4 animate-pulse text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Escaneando fantasmas...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm">
      {/* Header */}
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span>Detector de Fantasmas</span>
        </CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            {/* Ghost count badge */}
            {ghosts.length > 0 && (
              <Badge variant="destructive" className="tabular-nums">
                <Ghost className="h-3 w-3" />
                {ghosts.length} fantasma{ghosts.length !== 1 && "s"}
              </Badge>
            )}
            {ghosts.length === 0 && (
              <Badge variant="secondary" className="tabular-nums">
                <Wifi className="h-3 w-3" />
                Sin fantasmas
              </Badge>
            )}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Transparency score */}
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            Transparencia del equipo
          </span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  transparencyScore >= LOW_TRANSPARENCY_THRESHOLD
                    ? "bg-green-500"
                    : "bg-red-500",
                )}
                style={{ width: `${Math.min(transparencyScore, 100)}%` }}
              />
            </div>
            <span
              className={cn(
                "text-xs font-bold tabular-nums",
                transparencyScore >= LOW_TRANSPARENCY_THRESHOLD
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {transparencyScore}%
            </span>
          </div>
        </div>

        {/* Ghost list */}
        {ghosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-4 text-center">
            <Wifi className="h-5 w-5 text-green-500" />
            <p className="text-xs font-medium text-muted-foreground">
              Todos en linea estan registrando
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {ghosts.map((ghost) => (
              <GhostRow
                key={`${ghost.type}-${ghost.user.id}`}
                ghost={ghost}
                icon={ghostIcon(ghost.type)}
                emoji={ghostEmoji(ghost.type)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// GhostRow — individual ghost entry
// ---------------------------------------------------------------------------

function GhostRow({
  ghost,
  icon,
  emoji,
}: {
  ghost: GhostRecord;
  icon: React.ReactNode;
  emoji: string;
}) {
  const config = LIVE_STATUS_CONFIG[ghost.status.status];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border/40 bg-muted/30 px-3 py-2.5 transition-colors",
        ghost.type === "no_entries" && "border-amber-200/60 dark:border-amber-800/40",
        ghost.type === "fake_deep_work" && "border-violet-200/60 dark:border-violet-800/40",
        ghost.type === "lost_signal" && "border-red-200/60 dark:border-red-800/40",
      )}
    >
      {/* Ghost avatar */}
      <div className="relative shrink-0">
        <Avatar className="ring-2 ring-background">
          <AvatarImage
            src={ghost.user.avatar_url ?? undefined}
            className="grayscale opacity-50"
          />
          <AvatarFallback className="bg-muted text-muted-foreground grayscale opacity-50 text-[10px] font-semibold">
            {getInitials(ghost.user.full_name)}
          </AvatarFallback>
        </Avatar>
        {/* Ghost overlay emoji */}
        <span className="absolute -bottom-1 -right-1 text-sm leading-none drop-shadow">
          {emoji}
        </span>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-xs font-semibold truncate">
            {ghost.user.full_name?.split(" ")[0] ?? "?"}
          </span>
          <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1.5">
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-1", config.dotColor)} />
            {config.label}
          </Badge>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {ghost.message}
        </p>
        <div className="flex items-center gap-3 pt-0.5">
          <span className="text-[10px] text-muted-foreground/60 tabular-nums flex items-center gap-1">
            <Wifi className="h-2.5 w-2.5" />
            En linea {formatDuration(ghost.onlineMinutes)}
          </span>
          <span className="text-[10px] text-muted-foreground/60 tabular-nums flex items-center gap-1">
            {ghost.heartbeatAgoMinutes >= SIGNAL_LOST_MIN ? (
              <WifiOff className="h-2.5 w-2.5 text-red-400" />
            ) : (
              <Wifi className="h-2.5 w-2.5 text-green-400" />
            )}
            Heartbeat {formatDuration(ghost.heartbeatAgoMinutes)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Re-export the constant so consumers can reference the threshold if needed
export { SIGNAL_LOST_MIN as GHOST_SIGNAL_LOST_THRESHOLD };
