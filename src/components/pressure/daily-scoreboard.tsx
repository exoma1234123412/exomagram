"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, LiveStatus, TimeEntry } from "@/lib/types/database";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import {
  Trophy,
  Medal,
  Skull,
  Wifi,
  WifiOff,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// DAILY SCOREBOARD — Compact dashboard widget
// ═══════════════════════════════════════════════════════════════
//
// Makes EVERYONE'S progress (or lack thereof) brutally visible.
// Ranked by hours logged today. Real-time via Supabase subscriptions.
//
// Psychological levers:
// - Rank position creates competitive pressure
// - Red highlights for bottom half shame you into action
// - "Silla Vacia" section with skull emoji for zero-activity members
// - Idle/offline tags during work hours remove plausible deniability
// - Team completion meter creates collective accountability

// ─── Types ───────────────────────────────────────────────────

interface MemberRow {
  userId: string;
  profile: Profile;
  hoursLogged: number;
  hoursWithProof: number;
  totalHours: number;
  liveStatus: LiveStatus | null;
  isCompleted: boolean;
  remaining: number;
  proofRate: number;
  isIdle: boolean;
  isOffline: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────

function firstName(name: string | null) {
  if (!name) return "?";
  return name.split(" ")[0];
}

function isWorkHours(): boolean {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19;
}

function isAfter3pm(): boolean {
  return new Date().getHours() >= 15;
}

function isIdleMoreThan30Min(status: LiveStatus | null): boolean {
  if (!status || status.status !== "idle") return false;
  const idleSince = new Date(status.started_at).getTime();
  const now = Date.now();
  return now - idleSince > 30 * 60 * 1000;
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Trophy className="w-4 h-4 text-yellow-500" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-gray-400" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-700" />;
  return null;
}

function getBarColor(hours: number): string {
  const ratio = hours / EXPECTED_DAILY_HOURS;
  if (ratio >= 1) return "bg-green-500";
  if (ratio >= 0.75) return "bg-blue-500";
  if (ratio >= 0.5) return "bg-yellow-500";
  if (ratio >= 0.25) return "bg-orange-500";
  return "bg-red-500";
}

// ─── Component ───────────────────────────────────────────────

export function DailyScoreboard({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const today = getTodayMTY();

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    // Fetch all data in parallel
    const [membersRes, entriesRes, statusRes] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        ,
      supabase
        .from("time_entries")
        .select("user_id, hour, proof_urls")
        .eq("org_id", orgId)
        .eq("date", today)
,
      supabase
        .from("live_status")
        .select("*")
        .eq("org_id", orgId)
        ,
    ]);

    const members = membersRes.data ?? [];
    const entries = entriesRes.data ?? [];
    const statuses = statusRes.data ?? [];

    const statusMap = new Map<string, LiveStatus>();
    for (const s of statuses) {
      statusMap.set(s.user_id, s);
    }

    const built: MemberRow[] = members.map((m) => {
      const userEntries = entries.filter((e) => e.user_id === m.user_id);
      const withProof = userEntries.filter(
        (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
      );
      const totalHours = userEntries.length;
      const liveStatus = statusMap.get(m.user_id) ?? null;
      const remaining = Math.max(0, EXPECTED_DAILY_HOURS - totalHours);

      return {
        userId: m.user_id,
        profile: m.profiles,
        hoursLogged: totalHours,
        hoursWithProof: withProof.length,
        totalHours,
        liveStatus,
        isCompleted: totalHours >= EXPECTED_DAILY_HOURS,
        remaining,
        proofRate: totalHours > 0 ? withProof.length / totalHours : 0,
        isIdle: isWorkHours() && isIdleMoreThan30Min(liveStatus),
        isOffline:
          isWorkHours() &&
          (liveStatus?.status === "offline" || !liveStatus),
      };
    });

    // Sort descending by hours logged (best first)
    built.sort((a, b) => b.hoursLogged - a.hoursLogged);

    setRows(built);
    setLoading(false);
  }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load + realtime subscription
  useEffect(() => {
    loadData();

    // Subscribe to time_entries changes for real-time updates
    const channel = supabase
      .channel("scoreboard_rt")
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_status",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived data ────────────────────────────────────────

  const completedCount = useMemo(
    () => rows.filter((r) => r.isCompleted).length,
    [rows]
  );
  const totalMembers = rows.length;
  const completionRatio =
    totalMembers > 0 ? completedCount / totalMembers : 0;
  const completionPercent = Math.round(completionRatio * 100);

  const zeroHoursMembers = useMemo(
    () => rows.filter((r) => r.hoursLogged === 0),
    [rows]
  );

  const currentUserRank = useMemo(() => {
    if (!currentUserId) return -1;
    return rows.findIndex((r) => r.userId === currentUserId);
  }, [rows, currentUserId]);

  const isBottomHalf =
    currentUserRank >= 0 && currentUserRank >= Math.ceil(totalMembers / 2);

  const completionMeterRed = isAfter3pm() && completionRatio < 0.5;

  // ─── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 animate-pulse" />
            <p className="text-xs text-muted-foreground animate-pulse">
              Cargando scoreboard...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <AlertTriangle className="w-6 h-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              No hay miembros en la organizacion
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Circular Progress SVG ───────────────────────────────

  const circleRadius = 30;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const circleDashoffset =
    circleCircumference * (1 - completionRatio);

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all duration-300",
        isBottomHalf && "border-red-400 dark:border-red-700"
      )}
    >
      <CardContent className="p-0">
        {/* ── Header: Team Completion Meter ─────────────── */}
        <div
          className={cn(
            "flex items-center gap-4 px-5 py-4 border-b transition-colors duration-300",
            completionMeterRed
              ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
              : "bg-accent/30 border-border/50"
          )}
        >
          {/* Circular progress */}
          <div className="relative w-16 h-16 shrink-0">
            <svg
              className="-rotate-90 w-16 h-16"
              viewBox="0 0 72 72"
            >
              <circle
                cx="36"
                cy="36"
                r={circleRadius}
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                className="text-muted/20"
              />
              <circle
                cx="36"
                cy="36"
                r={circleRadius}
                fill="none"
                strokeWidth="5"
                className={cn(
                  completionMeterRed
                    ? "text-red-500"
                    : completionRatio >= 0.75
                      ? "text-green-500"
                      : completionRatio >= 0.5
                        ? "text-blue-500"
                        : "text-yellow-500"
                )}
                stroke="currentColor"
                strokeDasharray={circleCircumference}
                strokeDashoffset={circleDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={cn(
                  "text-sm font-bold tabular-nums leading-none",
                  completionMeterRed ? "text-red-600" : "text-foreground"
                )}
              >
                {completedCount}/{totalMembers}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold">
                Scoreboard del dia
              </h3>
            </div>
            <p
              className={cn(
                "text-xs mt-0.5",
                completionMeterRed
                  ? "text-red-600 dark:text-red-400 font-medium"
                  : "text-muted-foreground"
              )}
            >
              {completionMeterRed
                ? `Solo ${completionPercent}% completado despues de las 3pm`
                : completedCount === totalMembers
                  ? "Todo el equipo completo"
                  : `${completedCount} de ${totalMembers} completaron sus ${EXPECTED_DAILY_HOURS}h`}
            </p>
          </div>

          {completionMeterRed && (
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 animate-pulse" />
          )}
        </div>

        {/* ── Ranked List ───────────────────────────────── */}
        <div className="divide-y divide-border/40">
          {rows.map((row, index) => {
            const rank = index + 1;
            const isCurrentUser = row.userId === currentUserId;
            const barWidth = Math.min(
              (row.hoursLogged / EXPECTED_DAILY_HOURS) * 100,
              100
            );
            const proofGood = row.proofRate >= 0.7;

            return (
              <div
                key={row.userId}
                className={cn(
                  "flex items-center gap-3 px-5 py-3 transition-all duration-200",
                  "hover:bg-accent/30",
                  isCurrentUser && !isBottomHalf && "bg-blue-50/60 dark:bg-blue-950/15",
                  isCurrentUser && isBottomHalf && "bg-red-50/60 dark:bg-red-950/15",
                )}
              >
                {/* Rank */}
                <div className="w-7 shrink-0 text-center">
                  {getRankIcon(rank) ?? (
                    <span
                      className={cn(
                        "text-xs font-bold tabular-nums",
                        rank <= 3
                          ? "text-amber-600"
                          : "text-muted-foreground"
                      )}
                    >
                      #{rank}
                    </span>
                  )}
                </div>

                {/* Avatar + Name */}
                <div className="flex items-center gap-2 min-w-0 w-24 shrink-0">
                  <Avatar
                    className={cn(
                      "w-7 h-7 ring-1 ring-background",
                      row.hoursLogged === 0 && "opacity-40 grayscale"
                    )}
                  >
                    <AvatarImage
                      src={row.profile.avatar_url ?? undefined}
                    />
                    <AvatarFallback className="text-[9px] font-semibold">
                      {getInitials(row.profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      "text-xs font-semibold truncate",
                      isCurrentUser && "text-primary"
                    )}
                  >
                    {firstName(row.profile.full_name)}
                    {isCurrentUser && (
                      <span className="text-[9px] text-muted-foreground ml-1">
                        (tu)
                      </span>
                    )}
                  </span>
                </div>

                {/* Hours Bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-3 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          getBarColor(row.hoursLogged)
                        )}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-bold tabular-nums w-10 text-right",
                        row.isCompleted
                          ? "text-green-600"
                          : row.hoursLogged >= EXPECTED_DAILY_HOURS * 0.5
                            ? "text-foreground"
                            : "text-red-600"
                      )}
                    >
                      {row.hoursLogged}/{EXPECTED_DAILY_HOURS}h
                    </span>
                  </div>
                </div>

                {/* Proof Rate Dot */}
                <div className="shrink-0" title={`Evidencia: ${Math.round(row.proofRate * 100)}%`}>
                  <div
                    className={cn(
                      "w-2.5 h-2.5 rounded-full",
                      row.hoursLogged === 0
                        ? "bg-gray-300 dark:bg-gray-600"
                        : proofGood
                          ? "bg-green-500"
                          : "bg-red-500"
                    )}
                  />
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-1 shrink-0 min-w-[100px] justify-end">
                  {row.isCompleted ? (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 h-5 gap-0.5 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Completado
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 h-5 gap-0.5 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20"
                    >
                      <Clock className="w-3 h-3" />
                      Faltan {row.remaining}h
                    </Badge>
                  )}

                  {row.isIdle && (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 h-5 gap-0.5 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/20"
                    >
                      <Wifi className="w-3 h-3" />
                      Inactivo
                    </Badge>
                  )}

                  {row.isOffline && !row.isIdle && (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 h-5 gap-0.5 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-950/20"
                    >
                      <WifiOff className="w-3 h-3" />
                      Desconectado
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Silla Vacia (Empty Chair) ─────────────────── */}
        {zeroHoursMembers.length > 0 && (
          <div
            className={cn(
              "px-5 py-3 border-t",
              "bg-red-50/70 dark:bg-red-950/10 border-red-200 dark:border-red-800"
            )}
          >
            <div className="flex items-start gap-2">
              <Skull className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">
                  Silla Vacia — Sin actividad
                </p>
                <p className="text-xs text-red-700 dark:text-red-300">
                  {zeroHoursMembers
                    .map(
                      (m) =>
                        `\u{1F480} ${firstName(m.profile.full_name)}`
                    )
                    .join(", ")}
                </p>
              </div>
              <span className="text-[10px] font-bold text-red-500 tabular-nums shrink-0">
                {zeroHoursMembers.length}{" "}
                {zeroHoursMembers.length === 1 ? "persona" : "personas"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
