"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  TrustScoreHistory,
  LiveStatus,
  AccountabilityFlag,
} from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY, timeAgo } from "@/lib/utils";
import { LIVE_STATUS_CONFIG, MOOD_LABELS, ENERGY_LABELS } from "@/lib/constants";
import { subDays, format } from "date-fns";
import {
  Radar,
  Users,
  Ghost,
  AlertTriangle,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Heart,
  Zap,
  Flag,
  Clock,
  Radio,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = "estado" | "trust" | "pulso";

interface MemberEntry {
  user_id: string;
  date: string;
  hour: number;
  logged_at: string;
}

interface MemberState {
  userId: string;
  profile: Profile;
  liveStatus: LiveStatus | null;
  lastEntry: MemberEntry | null;
  entriesToday: number;
  daysInactive: number;
  isGhost: boolean;
  isDeadman: boolean;
  hoursToday: number;
}

interface MemberTrust {
  userId: string;
  profile: Profile;
  history: TrustScoreHistory[];
  currentScore: number;
  delta7d: number;
}

interface MemberPulse {
  userId: string;
  profile: Profile;
  avgMood7d: number | null;
  avgEnergy7d: number | null;
  flagCount: number;
  moodEntries: number;
  energyEntries: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentHourMTY(): number {
  const now = new Date();
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Monterrey",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return parseInt(h, 10);
}

function getMemberSortKey(m: MemberState): number {
  // Deadman alerts first (negative = sort first)
  if (m.isDeadman) return -1000 + m.daysInactive;
  // Then ghosts
  if (m.isGhost) return -500 + m.daysInactive;
  // Then by last activity (most recent first)
  if (m.lastEntry) {
    return new Date(m.lastEntry.logged_at).getTime() * -0.000001;
  }
  return 999;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RadarPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [tab, setTab] = useState<TabId>("estado");
  const [loading, setLoading] = useState(true);

  // Estado tab data
  const [memberStates, setMemberStates] = useState<MemberState[]>([]);

  // Trust tab data
  const [memberTrusts, setMemberTrusts] = useState<MemberTrust[]>([]);

  // Pulso tab data
  const [memberPulses, setMemberPulses] = useState<MemberPulse[]>([]);

  const supabase = createClient();
  const today = useMemo(() => getTodayMTY(), []);

  // ----- Load Estado Tab -----
  const loadEstado = useCallback(async () => {
    if (!orgId) return;

    const currentHour = getCurrentHourMTY();

    const [membersRes, entriesRes, liveRes, latestRes] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId),
      supabase
        .from("time_entries")
        .select("user_id, date, hour, logged_at")
        .eq("org_id", orgId)
        .eq("date", today),
      supabase
        .from("live_status")
        .select("*")
        .eq("org_id", orgId),
      supabase
        .from("time_entries")
        .select("user_id, date, hour, logged_at")
        .eq("org_id", orgId)
        .order("date", { ascending: false })
        .order("hour", { ascending: false }),
    ]);

    const orgMembers = membersRes.data ?? [];
    const todayEntries = (entriesRes.data ?? []) as MemberEntry[];
    const liveStatuses = (liveRes.data ?? []) as LiveStatus[];
    const allEntries = (latestRes.data ?? []) as MemberEntry[];

    // Build maps
    const liveMap = new Map<string, LiveStatus>();
    for (const ls of liveStatuses) liveMap.set(ls.user_id, ls);

    const latestEntryMap = new Map<string, MemberEntry>();
    for (const e of allEntries) {
      if (!latestEntryMap.has(e.user_id)) latestEntryMap.set(e.user_id, e);
    }

    const todayCountMap = new Map<string, number>();
    const todayHoursMap = new Map<string, Set<number>>();
    for (const e of todayEntries) {
      todayCountMap.set(e.user_id, (todayCountMap.get(e.user_id) ?? 0) + 1);
      const hours = todayHoursMap.get(e.user_id) ?? new Set<number>();
      hours.add(e.hour);
      todayHoursMap.set(e.user_id, hours);
    }

    const states: MemberState[] = orgMembers.map((m) => {
      const profile = m.profiles as unknown as Profile;
      const liveStatus = liveMap.get(m.user_id) ?? null;
      const lastEntry = latestEntryMap.get(m.user_id) ?? null;
      const entriesToday = todayCountMap.get(m.user_id) ?? 0;
      const hoursSet = todayHoursMap.get(m.user_id);
      const hoursToday = hoursSet ? hoursSet.size : 0;

      // Days inactive
      let daysInactive = 0;
      if (!lastEntry) {
        daysInactive = 999;
      } else {
        const lastDate = new Date(lastEntry.date + "T12:00:00");
        const todayDate = new Date(today + "T12:00:00");
        daysInactive = Math.floor(
          (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      const isGhost = daysInactive >= 2;

      // Deadman: 4+ hours since last entry during work hours (7-18)
      let isDeadman = false;
      const workStart = profile.work_start_hour ?? 7;
      const workEnd = profile.work_end_hour ?? 18;
      const isInWorkHours = currentHour >= workStart && currentHour < workEnd;

      if (isInWorkHours) {
        if (lastEntry && lastEntry.date === today) {
          const hoursSinceLast = currentHour - (lastEntry.hour + 1);
          if (hoursSinceLast >= 4) isDeadman = true;
        } else if (!lastEntry || lastEntry.date !== today) {
          const hoursSinceStart = currentHour - workStart;
          if (hoursSinceStart >= 4) isDeadman = true;
        }
      }

      return {
        userId: m.user_id,
        profile,
        liveStatus,
        lastEntry,
        entriesToday,
        daysInactive,
        isGhost,
        isDeadman,
        hoursToday,
      };
    });

    states.sort((a, b) => getMemberSortKey(a) - getMemberSortKey(b));
    setMemberStates(states);
  }, [orgId, today, supabase]);

  // ----- Load Trust Tab -----
  const loadTrust = useCallback(async () => {
    if (!orgId) return;

    const startDate = format(subDays(new Date(), 6), "yyyy-MM-dd");

    const [membersRes, trustRes] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId),
      supabase
        .from("trust_score_history")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", startDate)
        .lte("date", today)
        .order("date", { ascending: true }),
    ]);

    const orgMembers = membersRes.data ?? [];
    const trustData = (trustRes.data ?? []) as TrustScoreHistory[];

    const trustByUser = new Map<string, TrustScoreHistory[]>();
    for (const t of trustData) {
      const list = trustByUser.get(t.user_id) ?? [];
      list.push(t);
      trustByUser.set(t.user_id, list);
    }

    const trusts: MemberTrust[] = orgMembers.map((m) => {
      const profile = m.profiles as unknown as Profile;
      const history = trustByUser.get(m.user_id) ?? [];
      const currentScore = history.length > 0 ? history[history.length - 1].score : 0;
      const oldestScore = history.length > 0 ? history[0].score : 0;
      const delta7d = history.length >= 2 ? currentScore - oldestScore : 0;

      return { userId: m.user_id, profile, history, currentScore, delta7d };
    });

    trusts.sort((a, b) => b.currentScore - a.currentScore);
    setMemberTrusts(trusts);
  }, [orgId, today, supabase]);

  // ----- Load Pulso Tab -----
  const loadPulso = useCallback(async () => {
    if (!orgId) return;

    const startDate = format(subDays(new Date(), 6), "yyyy-MM-dd");

    const [membersRes, entriesRes, flagsRes] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId),
      supabase
        .from("time_entries")
        .select("user_id, mood, energy")
        .eq("org_id", orgId)
        .gte("date", startDate)
        .lte("date", today),
      supabase
        .from("accountability_flags")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("resolved", false),
    ]);

    const orgMembers = membersRes.data ?? [];
    const entries = entriesRes.data ?? [];
    const flags = flagsRes.data ?? [];

    const flagCountMap = new Map<string, number>();
    for (const f of flags) {
      flagCountMap.set(f.user_id, (flagCountMap.get(f.user_id) ?? 0) + 1);
    }

    const pulses: MemberPulse[] = orgMembers.map((m) => {
      const profile = m.profiles as unknown as Profile;
      const userEntries = entries.filter((e) => e.user_id === m.user_id);

      const moods = userEntries.filter((e) => e.mood != null).map((e) => e.mood as number);
      const energies = userEntries.filter((e) => e.energy != null).map((e) => e.energy as number);

      const avgMood7d = moods.length > 0 ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
      const avgEnergy7d = energies.length > 0 ? energies.reduce((a, b) => a + b, 0) / energies.length : null;

      return {
        userId: m.user_id,
        profile,
        avgMood7d,
        avgEnergy7d,
        flagCount: flagCountMap.get(m.user_id) ?? 0,
        moodEntries: moods.length,
        energyEntries: energies.length,
      };
    });

    pulses.sort((a, b) => (b.avgMood7d ?? 0) - (a.avgMood7d ?? 0));
    setMemberPulses(pulses);
  }, [orgId, today, supabase]);

  // ----- Load active tab -----
  const loadActiveTab = useCallback(async () => {
    setLoading(true);
    if (tab === "estado") await loadEstado();
    else if (tab === "trust") await loadTrust();
    else if (tab === "pulso") await loadPulso();
    setLoading(false);
  }, [tab, loadEstado, loadTrust, loadPulso]);

  useEffect(() => {
    if (orgLoading || !orgId) {
      if (!orgLoading) setLoading(false);
      return;
    }
    loadActiveTab();
  }, [orgLoading, orgId, loadActiveTab]);

  // Real-time subscription on time_entries
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel("radar-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadActiveTab()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, loadActiveTab, supabase]);

  // ----- Derived stats -----
  const estadoStats = useMemo(() => {
    const total = memberStates.length;
    const ghosts = memberStates.filter((m) => m.isGhost).length;
    const alerts = memberStates.filter((m) => m.isDeadman).length;
    const online = memberStates.filter(
      (m) => !m.isGhost && !m.isDeadman && m.entriesToday > 0
    ).length;
    return { total, ghosts, alerts, online };
  }, [memberStates]);

  // ----- Tabs config -----
  const tabs: { id: TabId; label: string }[] = [
    { id: "estado", label: "Estado" },
    { id: "trust", label: "Trust" },
    { id: "pulso", label: "Pulso" },
  ];

  // ----- Loading / Empty -----
  if (orgLoading || (loading && !memberStates.length && !memberTrusts.length && !memberPulses.length)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Radar className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Radar
        </h1>
        <Badge variant="secondary" className="font-mono text-[9px] bg-accent/30 border border-border text-muted-foreground">
          {memberStates.length || memberTrusts.length || memberPulses.length} operadores
        </Badge>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-6">
        Centro de monitoreo unificado. Estado, confianza y pulso del equipo.
      </p>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border mb-8">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 font-mono text-xs uppercase tracking-wide transition-colors cursor-pointer",
              tab === t.id
                ? "border-b-2 border-primary text-primary font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "estado" && <EstadoTab members={memberStates} stats={estadoStats} loading={loading} />}
      {tab === "trust" && <TrustTab members={memberTrusts} loading={loading} />}
      {tab === "pulso" && <PulsoTab members={memberPulses} loading={loading} />}
    </div>
  );
}

// ===========================================================================
// Tab: Estado
// ===========================================================================

function EstadoTab({
  members,
  stats,
  loading,
}: {
  members: MemberState[];
  stats: { total: number; ghosts: number; alerts: number; online: number };
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Escaneando...
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-accent/30 border border-border p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Equipo
            </span>
          </div>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
            {stats.total}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-3.5 h-3.5 text-green-500" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Activos
            </span>
          </div>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight text-green-600 dark:text-green-400">
            {stats.online}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-4">
          <div className="flex items-center gap-2 mb-1">
            <Ghost className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Fantasmas
            </span>
          </div>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight",
            stats.ghosts > 0 ? "text-amber-600 dark:text-amber-400" : ""
          )}>
            {stats.ghosts}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Alertas
            </span>
          </div>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight",
            stats.alerts > 0 ? "text-red-600 dark:text-red-400" : ""
          )}>
            {stats.alerts}
          </p>
        </div>
      </div>

      {/* Member Grid */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
            <Radar className="w-8 h-8 text-primary/40" />
          </div>
          <p className="text-sm font-mono text-muted-foreground">
            No hay miembros en la organizacion
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <MemberRow key={m.userId} member={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberRow({ member: m }: { member: MemberState }) {
  const statusColor = m.isDeadman
    ? "bg-red-500"
    : m.isGhost
      ? "bg-amber-500"
      : m.liveStatus && m.liveStatus.status !== "offline"
        ? LIVE_STATUS_CONFIG[m.liveStatus.status]?.dotColor ?? "bg-green-500"
        : m.entriesToday > 0
          ? "bg-green-500"
          : "bg-slate-400";

  const statusGlow = m.isDeadman || (m.liveStatus?.status === "online");

  const lastActivityText = m.lastEntry
    ? timeAgo(m.lastEntry.logged_at)
    : "Sin actividad";

  const currentHour = getCurrentHourMTY();
  const isInWorkHours =
    currentHour >= (m.profile.work_start_hour ?? 7) &&
    currentHour < (m.profile.work_end_hour ?? 18);

  return (
    <div
      className={cn(
        "card-palantir p-4 flex items-center gap-3 sm:gap-4",
        m.isDeadman && "animate-danger-pulse border-red-500/40 bg-red-500/5",
        m.isGhost && !m.isDeadman && "border-amber-500/20 bg-amber-500/3"
      )}
    >
      {/* Avatar + status dot */}
      <div className="relative shrink-0">
        <Avatar
          className={cn(
            "w-9 h-9 ring-1 ring-border",
            m.isGhost && "grayscale opacity-60"
          )}
        >
          <AvatarImage src={m.profile.avatar_url ?? undefined} />
          <AvatarFallback className="text-xs font-mono">
            {getInitials(m.profile.full_name)}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
            statusColor,
            statusGlow && "status-dot-active"
          )}
        />
      </div>

      {/* Name + status text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono font-medium truncate">
          {m.profile.full_name ?? m.profile.email}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {m.liveStatus && m.liveStatus.status !== "offline" ? (
            <span className={cn("text-[10px] font-mono", LIVE_STATUS_CONFIG[m.liveStatus.status]?.color)}>
              {LIVE_STATUS_CONFIG[m.liveStatus.status]?.label}
            </span>
          ) : (
            <span className="text-[10px] font-mono text-muted-foreground">
              {isInWorkHours ? (m.entriesToday > 0 ? "Activo" : "Sin entradas") : "Fuera de horario"}
            </span>
          )}
          <span className="text-[8px] text-muted-foreground/30">|</span>
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            {lastActivityText}
          </span>
        </div>
      </div>

      {/* Hours today */}
      <div className="hidden sm:flex flex-col items-center shrink-0">
        <span className="font-mono text-lg font-bold tabular-nums tracking-tight">
          {m.hoursToday}
        </span>
        <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40">
          horas
        </span>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 shrink-0">
        {m.isDeadman && (
          <Badge variant="destructive" className="font-mono text-[9px] gap-1">
            <Radio className="w-3 h-3" />
            ALERTA
          </Badge>
        )}
        {m.isGhost && !m.isDeadman && (
          <Badge
            variant="secondary"
            className="font-mono text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800"
          >
            <Ghost className="w-3 h-3 mr-1" />
            {m.daysInactive === 999 ? "INF" : `${m.daysInactive}d`}
          </Badge>
        )}
        {!m.isGhost && !m.isDeadman && m.entriesToday > 0 && (
          <Badge
            variant="secondary"
            className="font-mono text-[9px] tabular-nums bg-accent/30 border border-border text-muted-foreground"
          >
            {m.entriesToday}e
          </Badge>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Tab: Trust
// ===========================================================================

function TrustTab({
  members,
  loading,
}: {
  members: MemberTrust[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Calculando...
        </div>
      </div>
    );
  }

  // Team average
  const teamAvg =
    members.length > 0
      ? Math.round(
          members.reduce((s, m) => s + m.currentScore, 0) / members.length
        )
      : 0;

  // Generate 7 day labels
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    return format(d, "yyyy-MM-dd");
  });

  return (
    <div>
      {/* Team average */}
      <div className="bg-accent/30 border border-border p-6 mb-8 corner-marks">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-primary" />
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
            Trust Score promedio del equipo
          </span>
        </div>
        <p className="text-4xl font-mono font-bold tabular-nums tracking-tight">
          {teamAvg}
          <span className="text-lg text-muted-foreground font-normal">/100</span>
        </p>
      </div>

      {/* Per-member trust */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-primary/40" />
          </div>
          <p className="text-sm font-mono text-muted-foreground">
            Sin datos de Trust Score
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((m) => (
            <TrustRow key={m.userId} member={m} dayLabels={dayLabels} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrustRow({
  member: m,
  dayLabels,
}: {
  member: MemberTrust;
  dayLabels: string[];
}) {
  // Find score for each day
  const historyMap = new Map(m.history.map((h) => [h.date, h.score]));
  const bars = dayLabels.map((d) => historyMap.get(d) ?? 0);
  const maxScore = Math.max(...bars, 1);

  const TrendIcon = m.delta7d > 0 ? TrendingUp : m.delta7d < 0 ? TrendingDown : Minus;
  const trendColor =
    m.delta7d > 0
      ? "text-green-600 dark:text-green-400"
      : m.delta7d < 0
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  return (
    <div className="card-palantir p-4 flex items-center gap-4">
      {/* Avatar */}
      <Avatar className="w-9 h-9 ring-1 ring-border shrink-0">
        <AvatarImage src={m.profile.avatar_url ?? undefined} />
        <AvatarFallback className="text-xs font-mono">
          {getInitials(m.profile.full_name)}
        </AvatarFallback>
      </Avatar>

      {/* Name */}
      <div className="min-w-0 w-24 sm:w-32 shrink-0">
        <p className="text-sm font-mono font-medium truncate">
          {m.profile.full_name ?? m.profile.email}
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          <TrendIcon className={cn("w-3 h-3", trendColor)} />
          <span className={cn("text-[10px] font-mono tabular-nums", trendColor)}>
            {m.delta7d > 0 ? "+" : ""}
            {m.delta7d}
          </span>
        </div>
      </div>

      {/* 7-day bar chart */}
      <div className="flex-1 flex items-end gap-[3px] h-8">
        {bars.map((score, i) => {
          const height = maxScore > 0 ? (score / maxScore) * 100 : 0;
          const barColor =
            score >= 80
              ? "bg-green-500"
              : score >= 50
                ? "bg-amber-500"
                : score > 0
                  ? "bg-red-500"
                  : "bg-muted-foreground/10";
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full relative" style={{ height: "32px" }}>
                <div
                  className={cn("absolute bottom-0 w-full transition-all", barColor)}
                  style={{ height: `${Math.max(height, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Current score */}
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight",
            m.currentScore >= 80
              ? "text-green-600 dark:text-green-400"
              : m.currentScore >= 50
                ? "text-amber-600 dark:text-amber-400"
                : "text-red-600 dark:text-red-400"
          )}
        >
          {m.currentScore}
        </p>
        <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40">
          trust
        </span>
      </div>
    </div>
  );
}

// ===========================================================================
// Tab: Pulso
// ===========================================================================

function PulsoTab({
  members,
  loading,
}: {
  members: MemberPulse[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Analizando...
        </div>
      </div>
    );
  }

  // Team averages
  const moodsAll = members.filter((m) => m.avgMood7d !== null).map((m) => m.avgMood7d as number);
  const energiesAll = members.filter((m) => m.avgEnergy7d !== null).map((m) => m.avgEnergy7d as number);
  const teamMood = moodsAll.length > 0 ? moodsAll.reduce((a, b) => a + b, 0) / moodsAll.length : null;
  const teamEnergy = energiesAll.length > 0 ? energiesAll.reduce((a, b) => a + b, 0) / energiesAll.length : null;
  const totalFlags = members.reduce((s, m) => s + m.flagCount, 0);

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-accent/30 border border-border p-4 corner-marks">
          <div className="flex items-center gap-2 mb-1">
            <Heart className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Animo
            </span>
          </div>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight",
            teamMood !== null && teamMood >= 4
              ? "text-green-600 dark:text-green-400"
              : teamMood !== null && teamMood >= 3
                ? "text-amber-600 dark:text-amber-400"
                : teamMood !== null
                  ? "text-red-600 dark:text-red-400"
                  : ""
          )}>
            {teamMood !== null ? teamMood.toFixed(1) : "--"}
            <span className="text-sm text-muted-foreground font-normal">/5</span>
          </p>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
            {teamMood !== null ? (MOOD_LABELS[Math.round(teamMood) as 1|2|3|4|5] ?? "") : "Sin datos"}
          </p>
        </div>

        <div className="bg-accent/30 border border-border p-4 corner-marks">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Energia
            </span>
          </div>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight",
            teamEnergy !== null && teamEnergy >= 4
              ? "text-green-600 dark:text-green-400"
              : teamEnergy !== null && teamEnergy >= 3
                ? "text-amber-600 dark:text-amber-400"
                : teamEnergy !== null
                  ? "text-red-600 dark:text-red-400"
                  : ""
          )}>
            {teamEnergy !== null ? teamEnergy.toFixed(1) : "--"}
            <span className="text-sm text-muted-foreground font-normal">/5</span>
          </p>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
            {teamEnergy !== null ? (ENERGY_LABELS[Math.round(teamEnergy) as 1|2|3|4|5] ?? "") : "Sin datos"}
          </p>
        </div>

        <div className="bg-accent/30 border border-border p-4 corner-marks">
          <div className="flex items-center gap-2 mb-1">
            <Flag className="w-3.5 h-3.5 text-red-500" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Flags
            </span>
          </div>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight",
            totalFlags > 0 ? "text-red-600 dark:text-red-400" : ""
          )}>
            {totalFlags}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
            sin resolver
          </p>
        </div>
      </div>

      {/* Per-member pulse */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
            <Activity className="w-8 h-8 text-primary/40" />
          </div>
          <p className="text-sm font-mono text-muted-foreground">
            Sin datos de pulso
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <PulseRow key={m.userId} member={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function PulseRow({ member: m }: { member: MemberPulse }) {
  const moodColor =
    m.avgMood7d !== null && m.avgMood7d >= 4
      ? "text-green-600 dark:text-green-400"
      : m.avgMood7d !== null && m.avgMood7d >= 3
        ? "text-amber-600 dark:text-amber-400"
        : m.avgMood7d !== null
          ? "text-red-600 dark:text-red-400"
          : "text-muted-foreground";

  const energyColor =
    m.avgEnergy7d !== null && m.avgEnergy7d >= 4
      ? "text-green-600 dark:text-green-400"
      : m.avgEnergy7d !== null && m.avgEnergy7d >= 3
        ? "text-amber-600 dark:text-amber-400"
        : m.avgEnergy7d !== null
          ? "text-red-600 dark:text-red-400"
          : "text-muted-foreground";

  return (
    <div className="card-palantir p-4 flex items-center gap-4">
      {/* Avatar */}
      <Avatar className="w-9 h-9 ring-1 ring-border shrink-0">
        <AvatarImage src={m.profile.avatar_url ?? undefined} />
        <AvatarFallback className="text-xs font-mono">
          {getInitials(m.profile.full_name)}
        </AvatarFallback>
      </Avatar>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono font-medium truncate">
          {m.profile.full_name ?? m.profile.email}
        </p>
        <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
          {m.moodEntries + m.energyEntries > 0
            ? `${m.moodEntries + m.energyEntries} datos en 7d`
            : "Sin datos de pulso"}
        </p>
      </div>

      {/* Mood */}
      <div className="flex flex-col items-center shrink-0 w-14">
        <Heart className="w-3.5 h-3.5 text-muted-foreground/40 mb-0.5" />
        <span className={cn("text-base font-mono font-bold tabular-nums tracking-tight", moodColor)}>
          {m.avgMood7d !== null ? m.avgMood7d.toFixed(1) : "--"}
        </span>
        <span className="font-mono text-[7px] tracking-[0.18em] uppercase text-muted-foreground/40">
          animo
        </span>
      </div>

      {/* Energy */}
      <div className="flex flex-col items-center shrink-0 w-14">
        <Zap className="w-3.5 h-3.5 text-muted-foreground/40 mb-0.5" />
        <span className={cn("text-base font-mono font-bold tabular-nums tracking-tight", energyColor)}>
          {m.avgEnergy7d !== null ? m.avgEnergy7d.toFixed(1) : "--"}
        </span>
        <span className="font-mono text-[7px] tracking-[0.18em] uppercase text-muted-foreground/40">
          energia
        </span>
      </div>

      {/* Flags */}
      {m.flagCount > 0 && (
        <Badge variant="destructive" className="font-mono text-[9px] tabular-nums shrink-0">
          {m.flagCount} flag{m.flagCount !== 1 ? "s" : ""}
        </Badge>
      )}
    </div>
  );
}
