"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { cn, getTodayMTY, getInitials } from "@/lib/utils";
import { Gauge, AlertTriangle, TrendingDown, Clock } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { TimeEntry, Profile } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberVelocity {
  userId: string;
  name: string;
  avatarUrl: string | null;
  entriesLastHour: number;
  entriesLast2Hours: number;
  entriesToday: number;
  lastEntryAt: string | null;
  hoursInactive: number;
}

interface HourlyBucket {
  hour: number;
  count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentHourMTY(): number {
  const mtyTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Monterrey",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  return parseInt(mtyTime, 10);
}

function getMTYTimestamp(date: Date): { hour: number; minute: number } {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Monterrey",
      hour: "numeric",
      hour12: false,
    }).format(date),
    10
  );
  const minute = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Monterrey",
      minute: "numeric",
    }).format(date),
    10
  );
  return { hour, minute };
}

function minutesSinceInMTY(dateStr: string): number {
  const loggedAt = new Date(dateStr);
  const now = Date.now();
  return (now - loggedAt.getTime()) / 1000 / 60;
}

// ---------------------------------------------------------------------------
// Speedometer SVG Arc Builder
// ---------------------------------------------------------------------------

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpeedometerPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [entries, setEntries] = useState<(TimeEntry & { profiles: Profile })[]>([]);
  const [members, setMembers] = useState<{ user_id: string; profiles: Profile }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(Date.now());
  const supabase = createClient();
  const today = getTodayMTY();

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const [entriesRes, membersRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*, profiles(id, full_name, email, avatar_url)")
        .eq("org_id", orgId)
        .eq("date", today)
        .order("logged_at", { ascending: true }),
      supabase
        .from("org_members")
        .select("user_id, profiles(id, full_name, email, avatar_url)")
        .eq("org_id", orgId),
    ]);

    if (entriesRes.data) setEntries(entriesRes.data as any);
    if (membersRes.data) setMembers(membersRes.data as any);
    setLoading(false);
  }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      return;
    }
    loadData();
  }, [orgLoading, orgId, loadData]);

  // Real-time subscription
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel("speedometer-entries")
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
    return () => { supabase.removeChannel(channel); };
  }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const currentHour = getCurrentHourMTY();
  const teamSize = members.length;
  const maxScale = Math.max(teamSize * 2, 4);

  // Current velocity = entries in last 60 minutes
  const currentVelocity = useMemo(() => {
    return entries.filter((e) => minutesSinceInMTY(e.logged_at) <= 60).length;
  }, [entries, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const expectedVelocity = teamSize; // ~1 entry/hour per person

  // Velocity ratio (0 to 1+)
  const velocityRatio = expectedVelocity > 0 ? currentVelocity / expectedVelocity : 0;

  // Needle angle: gauge goes from -135deg (left) to +135deg (right) = 270deg sweep
  const gaugeStartAngle = -135;
  const gaugeSweep = 270;
  const needleAngle = Math.min(
    gaugeStartAngle + gaugeSweep * Math.min(currentVelocity / maxScale, 1),
    gaugeStartAngle + gaugeSweep
  );

  // Hour-by-hour buckets (7am to current hour)
  const startHour = 7;
  const hourlyBuckets: HourlyBucket[] = useMemo(() => {
    const buckets: HourlyBucket[] = [];
    for (let h = startHour; h <= currentHour; h++) {
      const count = entries.filter((e) => {
        const { hour } = getMTYTimestamp(new Date(e.logged_at));
        return hour === h;
      }).length;
      buckets.push({ hour: h, count });
    }
    return buckets;
  }, [entries, currentHour, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxBucketCount = Math.max(...hourlyBuckets.map((b) => b.count), 1);

  // Per-member velocity
  const memberVelocities: MemberVelocity[] = useMemo(() => {
    const byUser = new Map<string, (TimeEntry & { profiles: Profile })[]>();
    for (const e of entries) {
      const list = byUser.get(e.user_id) ?? [];
      list.push(e);
      byUser.set(e.user_id, list);
    }

    return members.map((m) => {
      const userEntries = byUser.get(m.user_id) ?? [];
      const lastEntry = userEntries.length > 0 ? userEntries[userEntries.length - 1].logged_at : null;
      const entriesLastHour = userEntries.filter((e) => minutesSinceInMTY(e.logged_at) <= 60).length;
      const entriesLast2Hours = userEntries.filter((e) => minutesSinceInMTY(e.logged_at) <= 120).length;

      let hoursInactive = 0;
      if (lastEntry) {
        hoursInactive = Math.floor(minutesSinceInMTY(lastEntry) / 60);
      } else {
        // Never logged today — inactive since work start
        hoursInactive = Math.max(currentHour - startHour, 0);
      }

      const profile = m.profiles as Profile;
      return {
        userId: m.user_id,
        name: profile?.full_name ?? profile?.email ?? "?",
        avatarUrl: profile?.avatar_url ?? null,
        entriesLastHour,
        entriesLast2Hours,
        entriesToday: userEntries.length,
        lastEntryAt: lastEntry,
        hoursInactive,
      };
    }).sort((a, b) => a.entriesToday - b.entriesToday);
  }, [entries, members, currentHour, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Team brake — person contributing least
  const teamBrake = useMemo(() => {
    if (memberVelocities.length === 0) return null;
    // Find person with most hours of inactivity who should be working (hour >= 7)
    if (currentHour < startHour) return null;
    const stopped = memberVelocities
      .filter((m) => m.entriesLast2Hours === 0 && m.hoursInactive >= 1)
      .sort((a, b) => b.hoursInactive - a.hoursInactive);
    return stopped.length > 0 ? stopped[0] : null;
  }, [memberVelocities, currentHour]);

  // ---------------------------------------------------------------------------
  // SVG Constants
  // ---------------------------------------------------------------------------

  const svgSize = 320;
  const cx = svgSize / 2;
  const cy = svgSize / 2 + 20;
  const outerR = 130;
  const innerR = 100;
  const needleLen = 105;

  // Color zone arcs (on the gauge)
  // Red: 0-25%, Amber: 25-50%, Green: 50-75%, Blue: 75-100%+
  const zoneColors = [
    { start: 0, end: 0.25, color: "#ef4444" },    // red
    { start: 0.25, end: 0.5, color: "#f59e0b" },   // amber
    { start: 0.5, end: 0.75, color: "#22c55e" },   // green
    { start: 0.75, end: 1, color: "#3b82f6" },     // blue
  ];

  // Determine current zone color
  const velocityScaleRatio = maxScale > 0 ? currentVelocity / maxScale : 0;
  const currentZoneColor =
    velocityScaleRatio >= 0.75
      ? "#3b82f6"
      : velocityScaleRatio >= 0.5
        ? "#22c55e"
        : velocityScaleRatio >= 0.25
          ? "#f59e0b"
          : "#ef4444";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (orgLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </p>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground font-mono text-xs">
          Primero crea o unete a un equipo.
        </p>
      </div>
    );
  }

  const formatHourLabel = (h: number) => {
    if (h === 0) return "12a";
    if (h < 12) return `${h}a`;
    if (h === 12) return "12p";
    return `${h - 12}p`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
          <Gauge className="w-5 h-5 text-primary" />
          Velocimetro del Equipo
        </h1>
        <p className="text-xs font-mono text-muted-foreground mt-1">
          Velocidad de registro en tiempo real &mdash; actualiza cada 60s
        </p>
      </div>

      {/* Speedometer Gauge */}
      <div className="flex flex-col items-center mb-8">
        <div className="border border-border bg-background p-6">
          <svg
            viewBox={`0 0 ${svgSize} ${svgSize * 0.7}`}
            className="w-full max-w-[420px] h-auto"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <filter id="needle-shadow">
                <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.3" />
              </filter>
            </defs>

            {/* Zone arcs */}
            {zoneColors.map((zone, i) => {
              const arcStart = gaugeStartAngle + gaugeSweep * zone.start;
              const arcEnd = gaugeStartAngle + gaugeSweep * zone.end;
              return (
                <path
                  key={i}
                  d={describeArc(cx, cy, outerR, arcStart, arcEnd)}
                  fill="none"
                  stroke={zone.color}
                  strokeWidth={outerR - innerR}
                  strokeLinecap="butt"
                  opacity={0.2}
                />
              );
            })}

            {/* Active arc (filled up to current velocity) */}
            {currentVelocity > 0 && (
              <path
                d={describeArc(
                  cx,
                  cy,
                  outerR,
                  gaugeStartAngle,
                  gaugeStartAngle + gaugeSweep * Math.min(velocityScaleRatio, 1)
                )}
                fill="none"
                stroke={currentZoneColor}
                strokeWidth={outerR - innerR}
                strokeLinecap="butt"
                opacity={0.6}
                style={{
                  transition: "all 1s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            )}

            {/* Tick marks */}
            {Array.from({ length: maxScale + 1 }, (_, i) => i).map((val) => {
              const angle = gaugeStartAngle + gaugeSweep * (val / maxScale);
              const outerTick = polarToCartesian(cx, cy, outerR + 5, angle);
              const innerTick = polarToCartesian(cx, cy, outerR - 2, angle);
              const labelPos = polarToCartesian(cx, cy, outerR + 18, angle);
              const isMajor = val % Math.max(Math.floor(maxScale / 4), 1) === 0 || val === maxScale;
              return (
                <g key={val}>
                  <line
                    x1={innerTick.x}
                    y1={innerTick.y}
                    x2={outerTick.x}
                    y2={outerTick.y}
                    stroke="currentColor"
                    strokeWidth={isMajor ? 2 : 0.5}
                    className="text-muted-foreground/40"
                  />
                  {isMajor && (
                    <text
                      x={labelPos.x}
                      y={labelPos.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fill-muted-foreground/60"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {val}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Needle */}
            <g
              style={{
                transform: `rotate(${needleAngle}deg)`,
                transformOrigin: `${cx}px ${cy}px`,
                transition: "transform 1s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              filter="url(#needle-shadow)"
            >
              <line
                x1={cx}
                y1={cy}
                x2={cx}
                y2={cy - needleLen}
                stroke={currentZoneColor}
                strokeWidth="3"
                strokeLinecap="round"
              />
              <line
                x1={cx}
                y1={cy}
                x2={cx}
                y2={cy + 15}
                stroke={currentZoneColor}
                strokeWidth="4"
                strokeLinecap="round"
              />
            </g>

            {/* Center hub */}
            <circle cx={cx} cy={cy} r="8" fill={currentZoneColor} opacity="0.8" />
            <circle cx={cx} cy={cy} r="4" className="fill-background" />

            {/* Center number */}
            <text
              x={cx}
              y={cy + 45}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="42"
              fontFamily="monospace"
              fontWeight="bold"
              fill={currentZoneColor}
            >
              {currentVelocity}
            </text>
            <text
              x={cx}
              y={cy + 65}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="9"
              fontFamily="monospace"
              className="fill-muted-foreground/50"
              letterSpacing="0.15em"
            >
              ENTRADAS / HORA
            </text>

            {/* Expected velocity marker */}
            {expectedVelocity > 0 && expectedVelocity <= maxScale && (() => {
              const expectedAngle = gaugeStartAngle + gaugeSweep * (expectedVelocity / maxScale);
              const markerOuter = polarToCartesian(cx, cy, outerR + 8, expectedAngle);
              const markerInner = polarToCartesian(cx, cy, innerR - 5, expectedAngle);
              return (
                <g>
                  <line
                    x1={markerInner.x}
                    y1={markerInner.y}
                    x2={markerOuter.x}
                    y2={markerOuter.y}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="4,2"
                    className="text-muted-foreground/30"
                  />
                </g>
              );
            })()}
          </svg>

          {/* Legend under gauge */}
          <div className="flex items-center justify-center gap-4 mt-2">
            {[
              { label: "Critico", color: "#ef4444" },
              { label: "Bajo", color: "#f59e0b" },
              { label: "Normal", color: "#22c55e" },
              { label: "Optimo", color: "#3b82f6" },
            ].map((z) => (
              <span key={z.label} className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/60">
                <span className="w-2.5 h-2.5 border border-border" style={{ backgroundColor: z.color, opacity: 0.5 }} />
                {z.label}
              </span>
            ))}
          </div>
        </div>

        {/* Velocity vs Expected */}
        <div className="flex items-center gap-6 mt-4">
          <div className="bg-accent/30 border border-border px-4 py-2 text-center">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Actual</p>
            <p className="font-mono tabular-nums tracking-tight text-2xl font-bold" style={{ color: currentZoneColor }}>
              {currentVelocity}
            </p>
          </div>
          <div className="bg-accent/30 border border-border px-4 py-2 text-center">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Esperado</p>
            <p className="font-mono tabular-nums tracking-tight text-2xl font-bold text-muted-foreground">
              {expectedVelocity}
            </p>
          </div>
          <div className="bg-accent/30 border border-border px-4 py-2 text-center">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Ratio</p>
            <p className={cn(
              "font-mono tabular-nums tracking-tight text-2xl font-bold",
              velocityRatio >= 1 ? "text-blue-500" : velocityRatio >= 0.5 ? "text-green-500" : velocityRatio >= 0.25 ? "text-amber-500" : "text-red-500"
            )}>
              {(velocityRatio * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      </div>

      {/* Team Brake */}
      {teamBrake && (
        <div className="mb-8 border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-start gap-3">
            <TrendingDown className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/60 mb-1">
                Freno del equipo
              </p>
              <p className="text-sm font-mono">
                <span className="font-bold text-red-500">{teamBrake.name}</span>{" "}
                <span className="text-muted-foreground">
                  esta frenando al equipo &mdash;{" "}
                  <span className="font-mono tabular-nums">{teamBrake.entriesToday}</span> entradas en las ultimas{" "}
                  <span className="font-mono tabular-nums">{teamBrake.hoursInactive}</span> horas
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Member Velocity Breakdown */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
          Velocidad por persona
        </p>
        <div className="space-y-1">
          {memberVelocities.map((m) => {
            const isStopped = m.entriesLast2Hours === 0 && m.hoursInactive >= 2;
            const isActive = m.entriesLastHour > 0;

            return (
              <div
                key={m.userId}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 border border-border transition-colors duration-200",
                  isStopped && "border-red-500/30 bg-red-500/5",
                  isActive && "border-green-500/20 bg-green-500/3"
                )}
              >
                <Avatar className="w-7 h-7 ring-1 ring-border shrink-0">
                  <AvatarFallback className="text-[10px] font-mono">
                    {getInitials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-mono truncate",
                    isStopped && "text-red-500 font-bold"
                  )}>
                    {m.name}
                  </p>
                </div>

                {/* Status badge */}
                {isStopped ? (
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-500 border border-red-500/40 px-2 py-0.5 bg-red-500/10">
                    Detenido
                  </span>
                ) : isActive ? (
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-green-500 border border-green-500/40 px-2 py-0.5 bg-green-500/10">
                    Activo
                  </span>
                ) : (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 border border-border px-2 py-0.5">
                    Inactivo
                  </span>
                )}

                {/* Entries last hour */}
                <div className="text-center w-14 shrink-0">
                  <p className="font-mono tabular-nums tracking-tight text-sm font-bold">
                    {m.entriesLastHour}
                  </p>
                  <p className="font-mono text-[8px] text-muted-foreground/40 uppercase">1h</p>
                </div>

                {/* Entries today */}
                <div className="text-center w-14 shrink-0">
                  <p className="font-mono tabular-nums tracking-tight text-sm">
                    {m.entriesToday}
                  </p>
                  <p className="font-mono text-[8px] text-muted-foreground/40 uppercase">Hoy</p>
                </div>
              </div>
            );
          })}

          {memberVelocities.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
                <Gauge className="w-8 h-8 text-primary" />
              </div>
              <p className="text-muted-foreground font-mono text-xs">
                No hay miembros en el equipo.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Velocity Timeline (hour-by-hour bar chart) */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
          Linea de velocidad por hora
        </p>
        <div className="border border-border bg-background p-4">
          {hourlyBuckets.length > 0 ? (
            <div className="relative">
              {/* Expected velocity line */}
              {expectedVelocity > 0 && maxBucketCount > 0 && (
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-muted-foreground/30 z-10 pointer-events-none"
                  style={{
                    bottom: `${Math.min((expectedVelocity / Math.max(maxBucketCount, expectedVelocity)) * 100, 100) * 0.8 + 10}%`,
                  }}
                >
                  <span className="absolute -top-3.5 right-0 font-mono text-[8px] text-muted-foreground/40 uppercase">
                    Esperado ({expectedVelocity})
                  </span>
                </div>
              )}

              <div className="flex items-end gap-1" style={{ height: "160px" }}>
                {hourlyBuckets.map((bucket) => {
                  const normalizedMax = Math.max(maxBucketCount, expectedVelocity);
                  const heightPct = normalizedMax > 0 ? (bucket.count / normalizedMax) * 80 : 0;
                  const isGap = bucket.count === 0 && bucket.hour <= currentHour && bucket.hour >= startHour;
                  const barColor =
                    bucket.count === 0
                      ? "bg-red-500/30"
                      : bucket.count >= expectedVelocity
                        ? "bg-blue-500/60"
                        : bucket.count >= expectedVelocity * 0.5
                          ? "bg-green-500/50"
                          : "bg-amber-500/50";

                  return (
                    <div key={bucket.hour} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                      {/* Count label */}
                      <span className="font-mono tabular-nums text-[9px] text-muted-foreground/50">
                        {bucket.count > 0 ? bucket.count : ""}
                      </span>
                      {/* Bar */}
                      <div
                        className={cn(
                          "w-full min-h-[3px] transition-all duration-500",
                          barColor,
                          isGap && "border border-red-500/40 bg-red-500/10 animate-pulse"
                        )}
                        style={{ height: `${Math.max(heightPct, 2)}%` }}
                      />
                      {/* Hour label */}
                      <span className="font-mono text-[8px] text-muted-foreground/40">
                        {formatHourLabel(bucket.hour)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground font-mono text-xs py-8">
              Sin datos de hoy aun.
            </p>
          )}
        </div>
      </div>

      {/* Stopped members call-out */}
      {memberVelocities.filter((m) => m.entriesLast2Hours === 0 && m.hoursInactive >= 2).length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Sin registrar ({memberVelocities.filter((m) => m.entriesLast2Hours === 0 && m.hoursInactive >= 2).length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {memberVelocities
              .filter((m) => m.entriesLast2Hours === 0 && m.hoursInactive >= 2)
              .sort((a, b) => b.hoursInactive - a.hoursInactive)
              .map((m) => (
                <div
                  key={m.userId}
                  className="border border-red-500/30 bg-red-500/5 px-3 py-2 flex items-center gap-3"
                >
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-bold text-red-500 truncate">{m.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground/60">
                      {m.hoursInactive}h sin registrar &mdash; {m.entriesToday} entrada{m.entriesToday !== 1 ? "s" : ""} hoy
                    </p>
                  </div>
                  <Clock className="w-3.5 h-3.5 text-red-500/50 shrink-0" />
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Last update timestamp */}
      <div className="text-center">
        <p className="font-mono text-[9px] text-muted-foreground/30 uppercase tracking-widest">
          Actualizado {new Intl.DateTimeFormat("es-MX", {
            timeZone: "America/Monterrey",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date(tick))}
        </p>
      </div>
    </div>
  );
}
