"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { cn, getTodayMTY, getInitials } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Play,
  Radio,
  Ghost,
  AlertTriangle,
  Activity,
  Clock,
  Users,
  Shield,
  ShieldOff,
} from "lucide-react";
import type { TimeEntry, Profile, WorkCategory } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TickerEntry {
  id: string;
  loggedAt: string;
  userName: string;
  category: WorkCategory;
  title: string;
  hasProof: boolean;
  isNew?: boolean;
}

interface SilencePeriod {
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMTYTime(date: Date): { hour: number; minute: number; second: number } {
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
  const second = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Monterrey",
      second: "numeric",
    }).format(date),
    10
  );
  return { hour, minute, second };
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const { hour, minute, second } = getMTYTime(d);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function formatDurationShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function minutesSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 1000 / 60;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LiveFlowPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [entries, setEntries] = useState<TickerEntry[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [members, setMembers] = useState<{ user_id: string; profiles: Profile }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(Date.now());
  const [lastEntryTime, setLastEntryTime] = useState<string | null>(null);
  const supabase = createClient();

  // Live tick every second for silence counter
  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load initial data
  useEffect(() => {
    if (!orgId) return;

    async function load() {
      setLoading(true);
      const today = getTodayMTY();

      const [{ data: rawEntries }, { data: rawMembers }] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*, profiles!time_entries_user_id_fkey(full_name, avatar_url)")
          .eq("org_id", orgId!)
          .eq("date", today)
          .order("logged_at", { ascending: false }),
        supabase
          .from("org_members")
          .select("user_id, profiles(id, full_name, avatar_url, email, timezone, work_start_hour, work_end_hour, setup_completed, created_at, updated_at, role)")
          .eq("org_id", orgId!),
      ]);

      const membersList = (rawMembers ?? []) as unknown as { user_id: string; profiles: Profile }[];
      setMembers(membersList);

      const profileMap = new Map<string, Profile>();
      for (const m of membersList) {
        if (m.profiles) profileMap.set(m.user_id, m.profiles);
      }
      setProfiles(profileMap);

      const tickerEntries: TickerEntry[] = (rawEntries ?? []).map((e: any) => ({
        id: e.id,
        loggedAt: e.logged_at,
        userName: e.profiles?.full_name ?? "Desconocido",
        category: e.category as WorkCategory,
        title: e.title,
        hasProof: (e.proof_urls && e.proof_urls.length > 0) || (e.links && e.links.length > 0),
      }));

      setEntries(tickerEntries);
      if (tickerEntries.length > 0) {
        setLastEntryTime(tickerEntries[0].loggedAt);
      }
      setLoading(false);
    }
    load();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time subscription
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`live-flow-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        async (payload) => {
          const newEntry = payload.new as TimeEntry;
          const today = getTodayMTY();
          if (newEntry.date !== today) return;

          // Fetch profile for the user
          let userName = "Desconocido";
          const cached = profiles.get(newEntry.user_id);
          if (cached) {
            userName = cached.full_name ?? "Desconocido";
          } else {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", newEntry.user_id)
              .single();
            userName = profile?.full_name ?? "Desconocido";
          }

          const tickerEntry: TickerEntry = {
            id: newEntry.id,
            loggedAt: newEntry.logged_at,
            userName,
            category: newEntry.category,
            title: newEntry.title,
            hasProof:
              !!(newEntry.proof_urls && newEntry.proof_urls.length > 0) ||
              !!(newEntry.links && newEntry.links.length > 0),
            isNew: true,
          };

          setEntries((prev) => [tickerEntry, ...prev]);
          setLastEntryTime(newEntry.logged_at);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Computed data
  const silenceSeconds = useMemo(() => {
    if (!lastEntryTime) return 0;
    return Math.max(0, Math.floor((tick - new Date(lastEntryTime).getTime()) / 1000));
  }, [lastEntryTime, tick]);

  const silenceLevel = useMemo<"normal" | "warning" | "critical">(() => {
    const mins = silenceSeconds / 60;
    if (mins >= 60) return "critical";
    if (mins >= 30) return "warning";
    return "normal";
  }, [silenceSeconds]);

  const stats = useMemo(() => {
    const total = entries.length;

    // Entries per hour — current rate based on time elapsed today
    const now = new Date();
    const { hour: currentHour, minute: currentMinute } = getMTYTime(now);
    const hoursElapsed = Math.max(1, (currentHour - 7) + currentMinute / 60); // from 7am
    const rate = total > 0 ? (total / hoursElapsed) : 0;

    // Last entry info
    const lastEntry = entries.length > 0 ? entries[0] : null;
    const lastEntryAgo = lastEntry ? minutesSince(lastEntry.loggedAt) : null;

    // Longest silence: find biggest gap between consecutive entries (by logged_at)
    let longestSilence: SilencePeriod | null = null;
    if (entries.length >= 2) {
      const sorted = [...entries].sort(
        (a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()
      );
      for (let i = 1; i < sorted.length; i++) {
        const gap =
          (new Date(sorted[i].loggedAt).getTime() -
            new Date(sorted[i - 1].loggedAt).getTime()) /
          1000 /
          60;
        if (!longestSilence || gap > longestSilence.durationMinutes) {
          longestSilence = {
            startTime: sorted[i - 1].loggedAt,
            endTime: sorted[i].loggedAt,
            durationMinutes: gap,
          };
        }
      }
    }

    // Entries in last 15 minutes (for speed indicator)
    const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
    const recentEntries = entries.filter(
      (e) => new Date(e.loggedAt).getTime() >= fifteenMinAgo
    ).length;

    return { total, rate, lastEntry, lastEntryAgo, longestSilence, recentEntries };
  }, [entries, tick]);

  // Ghosts — members with 0 entries today
  const ghosts = useMemo(() => {
    return members.filter((m) => {
      const profile = m.profiles;
      if (!profile) return false;
      const name = profile.full_name ?? "";
      return !entries.some((e) => e.userName === name);
    });
  }, [entries, members]);

  // Speed bar: entries in last 15 min, broken into 1-min buckets
  const speedBars = useMemo(() => {
    const bars: number[] = [];
    const now = Date.now();
    for (let i = 14; i >= 0; i--) {
      const start = now - (i + 1) * 60 * 1000;
      const end = now - i * 60 * 1000;
      const count = entries.filter((e) => {
        const t = new Date(e.loggedAt).getTime();
        return t >= start && t < end;
      }).length;
      bars.push(count);
    }
    return bars;
  }, [entries, tick]);

  // Loading state
  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  const maxBar = Math.max(1, ...speedBars);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Play className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Flujo Vivo
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              silenceLevel === "critical"
                ? "bg-red-500 animate-pulse"
                : silenceLevel === "warning"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-green-500"
            )}
          />
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            {silenceLevel === "critical"
              ? "Equipo detenido"
              : silenceLevel === "warning"
                ? "Silencio prolongado"
                : "En vivo"}
          </span>
        </div>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Feed en tiempo real de entradas del equipo. El silencio es visible.
      </p>

      {/* Silence counter */}
      <div
        className={cn(
          "border mb-8 p-4 transition-colors duration-500",
          silenceLevel === "critical"
            ? "border-red-500/50 bg-red-500/5"
            : silenceLevel === "warning"
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-border bg-accent/20"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio
              className={cn(
                "w-4 h-4",
                silenceLevel === "critical"
                  ? "text-red-500 animate-pulse"
                  : silenceLevel === "warning"
                    ? "text-amber-500"
                    : "text-green-500"
              )}
            />
            <div>
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60">
                Silencio del equipo
              </span>
              <div
                className={cn(
                  "font-mono text-2xl font-bold tabular-nums tracking-tight",
                  silenceLevel === "critical"
                    ? "text-red-500"
                    : silenceLevel === "warning"
                      ? "text-amber-500"
                      : "text-foreground"
                )}
              >
                {formatDuration(silenceSeconds)}
              </div>
            </div>
          </div>
          {silenceLevel === "critical" && (
            <div className="text-right">
              <span className="font-mono text-xs font-bold text-red-500 uppercase tracking-wider animate-pulse">
                El equipo se detuvo
              </span>
            </div>
          )}
          {silenceLevel === "warning" && (
            <div className="text-right">
              <AlertTriangle className="w-5 h-5 text-amber-500 inline-block" />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Main ticker — 2 columns */}
        <div className="lg:col-span-2">
          {/* Speed indicator */}
          <div className="border border-border mb-4 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                Velocidad (15 min)
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {stats.recentEntries} {stats.recentEntries === 1 ? "entrada" : "entradas"}
              </span>
            </div>
            <div className="flex items-end gap-px h-8">
              {speedBars.map((count, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 transition-all duration-300",
                    count > 0
                      ? "bg-primary"
                      : "bg-muted-foreground/10"
                  )}
                  style={{
                    height: count > 0 ? `${Math.max(15, (count / maxBar) * 100)}%` : "4px",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Live ticker feed */}
          <div className="border border-border">
            <div className="border-b border-border px-3 py-2 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-primary" />
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                Feed en vivo
              </span>
              <span className="font-mono text-[9px] tabular-nums text-muted-foreground/30 ml-auto">
                {entries.length} hoy
              </span>
            </div>

            <div className="max-h-[600px] overflow-y-auto">
              {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-16 h-16 border border-border flex items-center justify-center">
                    <Radio className="w-7 h-7 text-muted-foreground/30" />
                  </div>
                  <p className="font-mono text-xs text-muted-foreground/50">
                    Sin entradas hoy. Silencio total.
                  </p>
                </div>
              ) : (
                entries.map((entry, idx) => {
                  const cat = CATEGORIES[entry.category];
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "border-b border-border/50 px-3 py-2.5 transition-all duration-500",
                        entry.isNew && "animate-ticker-in bg-primary/5",
                        idx === 0 && !entry.isNew && "bg-accent/20"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Timestamp */}
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50 shrink-0 mt-0.5 w-16">
                          {formatTimestamp(entry.loggedAt)}
                        </span>

                        {/* Category dot */}
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full shrink-0 mt-1.5",
                            entry.category === "deep_work" && "bg-violet-500",
                            entry.category === "meeting" && "bg-blue-500",
                            entry.category === "review" && "bg-amber-500",
                            entry.category === "admin" && "bg-slate-400",
                            entry.category === "planning" && "bg-emerald-500",
                            entry.category === "learning" && "bg-pink-500",
                            entry.category === "break" && "bg-green-400",
                            entry.category === "blocked" && "bg-red-500"
                          )}
                        />

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-bold text-foreground">
                              {entry.userName}
                            </span>
                            <span className="text-muted-foreground/30 font-mono text-[10px]">
                              —
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {cat.emoji} {cat.label}
                            </span>
                          </div>
                          <p className="font-mono text-[11px] text-muted-foreground/70 truncate mt-0.5">
                            {entry.title}
                          </p>
                        </div>

                        {/* Proof status */}
                        <div className="shrink-0 mt-0.5">
                          {entry.hasProof ? (
                            <div className="flex items-center gap-1">
                              <Shield className="w-3 h-3 text-green-500" />
                              <span className="font-mono text-[9px] text-green-500/70">
                                con evidencia
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <ShieldOff className="w-3 h-3 text-red-400" />
                              <span className="font-mono text-[9px] text-red-400/70">
                                sin evidencia
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Stats panel */}
          <div className="border border-border">
            <div className="border-b border-border px-3 py-2">
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                Estadísticas hoy
              </span>
            </div>
            <div className="p-3 space-y-3">
              <StatRow
                label="Total entradas"
                value={String(stats.total)}
                icon={<Activity className="w-3 h-3" />}
              />
              <StatRow
                label="Tasa/hora"
                value={stats.rate.toFixed(1)}
                icon={<Clock className="w-3 h-3" />}
              />
              <StatRow
                label="Última entrada"
                value={
                  stats.lastEntry
                    ? `${stats.lastEntry.userName.split(" ")[0]} hace ${formatDurationShort(stats.lastEntryAgo ?? 0)}`
                    : "—"
                }
                icon={<Users className="w-3 h-3" />}
              />
              {stats.longestSilence && (
                <StatRow
                  label="Mayor silencio"
                  value={`${formatDurationShort(stats.longestSilence.durationMinutes)} (${formatTimestamp(stats.longestSilence.startTime)}–${formatTimestamp(stats.longestSilence.endTime)})`}
                  icon={<Radio className="w-3 h-3" />}
                />
              )}
            </div>
          </div>

          {/* Ghosts panel */}
          <div className="border border-border">
            <div className="border-b border-border px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Ghost className="w-3 h-3 text-muted-foreground/40" />
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                  Fantasmas
                </span>
              </div>
              <span className="font-mono text-[10px] tabular-nums text-red-400">
                {ghosts.length}
              </span>
            </div>
            <div className="p-2">
              {ghosts.length === 0 ? (
                <p className="font-mono text-[10px] text-muted-foreground/40 text-center py-3">
                  Todos han registrado hoy.
                </p>
              ) : (
                <div className="space-y-1">
                  {ghosts.map((g) => {
                    const name = g.profiles?.full_name ?? "Desconocido";
                    return (
                      <div
                        key={g.user_id}
                        className="flex items-center gap-2 px-2 py-1.5 border border-border/50 transition-colors hover:border-red-500/20"
                      >
                        <Avatar className="w-5 h-5 ring-1 ring-border">
                          <AvatarFallback className="text-[8px] font-mono bg-red-500/10 text-red-400">
                            {getInitials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-mono text-[10px] text-muted-foreground truncate">
                          {name}
                        </span>
                        <span className="ml-auto font-mono text-[9px] text-red-400/60">
                          0 entradas
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Category breakdown */}
          <div className="border border-border">
            <div className="border-b border-border px-3 py-2">
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                Desglose categorías
              </span>
            </div>
            <div className="p-2">
              <CategoryBreakdown entries={entries} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom status line */}
      <div className="border-t border-border/30 pt-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-muted-foreground/30 tracking-widest uppercase">
            Suscripción activa — Actualización en tiempo real
          </span>
          <span className="font-mono text-[9px] tabular-nums text-muted-foreground/30">
            {getTodayMTY()}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground/40 mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <span className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider block">
          {label}
        </span>
        <span className="font-mono text-xs tabular-nums text-foreground block truncate">
          {value}
        </span>
      </div>
    </div>
  );
}

function CategoryBreakdown({ entries }: { entries: TickerEntry[] }) {
  const counts = useMemo(() => {
    const map = new Map<WorkCategory, number>();
    for (const e of entries) {
      map.set(e.category, (map.get(e.category) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  if (counts.length === 0) {
    return (
      <p className="font-mono text-[10px] text-muted-foreground/40 text-center py-3">
        Sin datos.
      </p>
    );
  }

  const total = entries.length;

  return (
    <div className="space-y-1.5">
      {counts.map(([cat, count]) => {
        const config = CATEGORIES[cat];
        const pct = Math.round((count / total) * 100);
        return (
          <div key={cat} className="flex items-center gap-2">
            <span className="font-mono text-[10px] w-4 text-center">
              {config.emoji}
            </span>
            <div className="flex-1 h-1.5 bg-muted-foreground/10 relative overflow-hidden">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 transition-all duration-500",
                  cat === "deep_work" && "bg-violet-500",
                  cat === "meeting" && "bg-blue-500",
                  cat === "review" && "bg-amber-500",
                  cat === "admin" && "bg-slate-400",
                  cat === "planning" && "bg-emerald-500",
                  cat === "learning" && "bg-pink-500",
                  cat === "break" && "bg-green-400",
                  cat === "blocked" && "bg-red-500"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-[9px] tabular-nums text-muted-foreground/60 w-8 text-right">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
