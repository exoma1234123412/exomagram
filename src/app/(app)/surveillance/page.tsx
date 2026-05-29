"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  TimeEntry,
  LiveStatus,
  WorkCategory,
} from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY, formatHour, timeAgo } from "@/lib/utils";
import {
  CATEGORIES,
  CATEGORY_COLORS,
  LIVE_STATUS_CONFIG,
  MOOD_LABELS,
  ENERGY_LABELS,
} from "@/lib/constants";
import { format, subDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Eye,
  Radio,
  Grid3X3,
  Users,
  Ghost,
  Heart,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface MemberProfile extends Profile {}

interface MemberData {
  userId: string;
  profile: MemberProfile;
  liveStatus: LiveStatus | null;
  entriesToday: TimeEntry[];
  entriesWeek: TimeEntry[];
  lastEntry: TimeEntry | null;
  hoursToday: number;
}

type TabId = "live" | "radar" | "mirror" | "ghosts" | "health";

const TABS: { id: TabId; label: string }[] = [
  { id: "live", label: "Pulso en Vivo" },
  { id: "radar", label: "Radar" },
  { id: "mirror", label: "Espejo" },
  { id: "ghosts", label: "Fantasmas" },
  { id: "health", label: "Salud" },
];

// ============================================================
// Helpers
// ============================================================

function getCurrentHourMTY(): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Monterrey",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  return parseInt(h, 10);
}

function formatMTYTime(): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Monterrey",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function formatMTYDate(): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Monterrey",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

// ============================================================
// Page
// ============================================================

export default function SurveillancePage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("live");
  const [clock, setClock] = useState(formatMTYTime());

  const today = useMemo(() => getTodayMTY(), []);

  // Live clock
  useEffect(() => {
    const interval = setInterval(() => setClock(formatMTYTime()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load all data
  const loadData = useCallback(async () => {
    if (!orgId) return;

    const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

    const [membersRes, todayEntriesRes, weekEntriesRes, liveRes] =
      await Promise.all([
        supabase
          .from("org_members")
          .select("user_id, profiles(*)")
          .eq("org_id", orgId),
        supabase
          .from("time_entries")
          .select("*")
          .eq("org_id", orgId)
          .eq("date", today)
          .is("deleted_at", null)
          .order("logged_at", { ascending: false }),
        supabase
          .from("time_entries")
          .select("*")
          .eq("org_id", orgId)
          .gte("date", sevenDaysAgo)
          .lte("date", today)
          .is("deleted_at", null)
          .order("date", { ascending: false }),
        supabase.from("live_status").select("*").eq("org_id", orgId),
      ]);

    const orgMembers = membersRes.data ?? [];
    const todayEntries = (todayEntriesRes.data ?? []) as TimeEntry[];
    const weekEntries = (weekEntriesRes.data ?? []) as TimeEntry[];
    const liveStatuses = (liveRes.data ?? []) as LiveStatus[];

    const liveMap = new Map<string, LiveStatus>();
    for (const ls of liveStatuses) liveMap.set(ls.user_id, ls);

    // Latest entry per user from week entries
    const latestEntryMap = new Map<string, TimeEntry>();
    for (const e of weekEntries) {
      const existing = latestEntryMap.get(e.user_id);
      if (!existing || e.logged_at > existing.logged_at) {
        latestEntryMap.set(e.user_id, e);
      }
    }

    const memberData: MemberData[] = orgMembers.map((m) => {
      const profile = m.profiles as unknown as MemberProfile;
      const liveStatus = liveMap.get(m.user_id) ?? null;
      const userTodayEntries = todayEntries.filter(
        (e) => e.user_id === m.user_id
      );
      const userWeekEntries = weekEntries.filter(
        (e) => e.user_id === m.user_id
      );
      const lastEntry = latestEntryMap.get(m.user_id) ?? null;
      const hoursToday = new Set(userTodayEntries.map((e) => e.hour)).size;

      return {
        userId: m.user_id,
        profile,
        liveStatus,
        entriesToday: userTodayEntries,
        entriesWeek: userWeekEntries,
        lastEntry,
        hoursToday,
      };
    });

    // Sort: online first, then by hours desc
    memberData.sort((a, b) => {
      const aOnline =
        a.liveStatus && a.liveStatus.status !== "offline" ? 1 : 0;
      const bOnline =
        b.liveStatus && b.liveStatus.status !== "offline" ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return b.hoursToday - a.hoursToday;
    });

    setMembers(memberData);
    setLoading(false);
  }, [orgId, today, supabase]);

  useEffect(() => {
    if (orgLoading || !orgId) {
      if (!orgLoading) setLoading(false);
      return;
    }
    loadData();
  }, [orgLoading, orgId, loadData]);

  // Real-time subscriptions + auto-refresh
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel("surveillance-hub-realtime")
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

    // Auto-refresh every 60s
    const interval = setInterval(() => loadData(), 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [orgId, loadData, supabase]);

  // ---- Loading ----
  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Inicializando vigilancia...
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <Eye className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
              Centro de Vigilancia
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl font-bold tabular-nums tracking-tight text-primary">
              {clock}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_6px] shadow-green-500/60" />
            <span className="font-mono text-[9px] tracking-[0.18em] text-green-500/80 uppercase">
              Monitoreo total del equipo en tiempo real
            </span>
          </div>
          <span className="font-mono text-[9px] text-muted-foreground">|</span>
          <span className="font-mono text-[10px] text-muted-foreground capitalize">
            {formatMTYDate()}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase whitespace-nowrap transition-colors border-b-2 -mb-px cursor-pointer",
              activeTab === tab.id
                ? "text-primary border-primary"
                : "text-muted-foreground/50 border-transparent hover:text-muted-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "live" && (
        <LivePulseTab members={members} />
      )}
      {activeTab === "radar" && (
        <RadarTab members={members} />
      )}
      {activeTab === "mirror" && (
        <MirrorTab members={members} currentUserId={userId} />
      )}
      {activeTab === "ghosts" && (
        <GhostsTab members={members} today={today} />
      )}
      {activeTab === "health" && (
        <HealthTab members={members} />
      )}

      {/* Footer */}
      <div className="text-center py-6 border-t border-border mt-8">
        <p className="font-mono text-[9px] text-muted-foreground/20 uppercase tracking-[0.3em]">
          Centro de vigilancia - Datos en tiempo real - {formatMTYDate()}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// TAB 1: Pulso en Vivo
// ============================================================

function LivePulseTab({ members }: { members: MemberData[] }) {
  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
        Estado actual de cada miembro
      </p>
      {members.length === 0 ? (
        <div className="border border-border p-8 text-center">
          <Users className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="font-mono text-xs text-muted-foreground">
            Sin miembros en el equipo
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Header row */}
          <div className="hidden sm:flex items-center gap-3 px-3 py-1">
            <div className="w-9 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40">
                Miembro
              </span>
            </div>
            <div className="w-20 text-center">
              <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40">
                Estado
              </span>
            </div>
            <div className="w-16 text-center">
              <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40">
                Horas hoy
              </span>
            </div>
            <div className="w-32 text-center">
              <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40">
                Tarea actual
              </span>
            </div>
            <div className="w-16 text-center">
              <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40">
                Ultima act.
              </span>
            </div>
          </div>

          {members.map((m) => {
            const statusConfig = m.liveStatus
              ? LIVE_STATUS_CONFIG[m.liveStatus.status] ??
                LIVE_STATUS_CONFIG.offline
              : LIVE_STATUS_CONFIG.offline;
            const isOnline =
              m.liveStatus && m.liveStatus.status !== "offline";

            return (
              <div
                key={m.userId}
                className="card-palantir flex items-center gap-3 p-3"
              >
                {/* Avatar with status dot */}
                <div className="relative shrink-0">
                  <Avatar className="w-9 h-9 ring-1 ring-border">
                    <AvatarImage
                      src={m.profile.avatar_url ?? undefined}
                    />
                    <AvatarFallback className="text-xs font-mono">
                      {getInitials(m.profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
                      isOnline
                        ? statusConfig.dotColor
                        : "bg-gray-400",
                      isOnline && "status-dot-active"
                    )}
                  />
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-mono font-bold uppercase tracking-tight truncate">
                    {m.profile.full_name ?? m.profile.email}
                  </p>
                  {/* Mobile: inline status */}
                  <div className="sm:hidden flex items-center gap-2 mt-0.5">
                    <span
                      className={cn(
                        "text-[9px] font-mono",
                        isOnline
                          ? statusConfig.color
                          : "text-muted-foreground"
                      )}
                    >
                      {isOnline
                        ? statusConfig.label
                        : "Desconectado"}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
                      {m.hoursToday}h
                    </span>
                  </div>
                </div>

                {/* Status */}
                <div className="hidden sm:block w-20 text-center">
                  <span
                    className={cn(
                      "font-mono text-[10px] font-medium",
                      isOnline
                        ? statusConfig.color
                        : "text-muted-foreground/50"
                    )}
                  >
                    {isOnline ? statusConfig.label : "Offline"}
                  </span>
                </div>

                {/* Hours today */}
                <div className="hidden sm:block w-16 text-center">
                  <span className="font-mono text-sm font-bold tabular-nums tracking-tight">
                    {m.hoursToday}
                  </span>
                </div>

                {/* Current task */}
                <div className="hidden sm:block w-32 text-center">
                  <span className="font-mono text-[10px] text-muted-foreground truncate block">
                    {m.liveStatus?.current_task ?? "--"}
                  </span>
                </div>

                {/* Last activity */}
                <div className="hidden sm:block w-16 text-center">
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {m.lastEntry ? timeAgo(m.lastEntry.logged_at) : "--"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAB 2: Radar (Activity Grid)
// ============================================================

function RadarTab({ members }: { members: MemberData[] }) {
  const hours = Array.from({ length: 10 }, (_, i) => i + 9); // 9-18

  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
        Actividad por hora - ultimos 7 dias
      </p>

      {members.length === 0 ? (
        <div className="border border-border p-8 text-center">
          <Grid3X3 className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="font-mono text-xs text-muted-foreground">
            Sin datos de actividad
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-2">
            {(Object.keys(CATEGORIES) as WorkCategory[]).map((cat) => (
              <div key={cat} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "w-3 h-3 block",
                    CATEGORY_COLORS[cat]
                  )}
                />
                <span className="font-mono text-[8px] text-muted-foreground uppercase">
                  {CATEGORIES[cat].label}
                </span>
              </div>
            ))}
          </div>

          {members.map((m) => (
            <RadarMemberRow
              key={m.userId}
              member={m}
              hours={hours}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RadarMemberRow({
  member: m,
  hours,
}: {
  member: MemberData;
  hours: number[];
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    return format(d, "yyyy-MM-dd");
  });

  const dayLabels = days.map((d) =>
    format(parseISO(d), "EEE", { locale: es }).slice(0, 2).toUpperCase()
  );

  // Build entry map: date-hour -> category
  const grid = new Map<string, WorkCategory>();
  for (const e of m.entriesWeek) {
    const key = `${e.date}-${e.hour}`;
    if (!grid.has(key)) {
      grid.set(key, e.category as WorkCategory);
    }
  }

  return (
    <div className="card-palantir p-3">
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="w-5 h-5 ring-1 ring-border">
          <AvatarImage src={m.profile.avatar_url ?? undefined} />
          <AvatarFallback className="text-[7px] font-mono">
            {getInitials(m.profile.full_name)}
          </AvatarFallback>
        </Avatar>
        <span className="font-mono text-[10px] font-medium truncate">
          {m.profile.full_name ?? m.profile.email}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground ml-auto tabular-nums">
          {m.entriesWeek.length} entradas
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[360px]">
          {/* Hour header */}
          <div className="flex items-center gap-0">
            <div className="w-8 shrink-0" />
            {hours.map((h) => (
              <div
                key={h}
                className="flex-1 text-center font-mono text-[7px] text-muted-foreground"
              >
                {h}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {days.map((day, di) => (
            <div key={day} className="flex items-center gap-0">
              <div className="w-8 shrink-0 font-mono text-[8px] text-muted-foreground text-right pr-1">
                {dayLabels[di]}
              </div>
              {hours.map((h) => {
                const cat = grid.get(`${day}-${h}`);
                const bgColor = cat
                  ? CATEGORY_COLORS[cat] ?? "bg-muted"
                  : "";
                return (
                  <div
                    key={`${day}-${h}`}
                    className={cn(
                      "flex-1 aspect-square m-[1px] border border-border/20",
                      cat ? bgColor : "bg-transparent"
                    )}
                    style={cat ? { opacity: 0.85 } : undefined}
                    title={
                      cat
                        ? `${dayLabels[di]} ${h}:00 - ${CATEGORIES[cat]?.label ?? cat}`
                        : `${dayLabels[di]} ${h}:00 - Sin registro`
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB 3: Espejo (Mirror - Compare)
// ============================================================

function MirrorTab({
  members,
  currentUserId,
}: {
  members: MemberData[];
  currentUserId: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const currentUser = members.find((m) => m.userId === currentUserId);
  const selectedMember = members.find((m) => m.userId === selectedId);
  const otherMembers = members.filter((m) => m.userId !== currentUserId);

  const hours = Array.from({ length: 12 }, (_, i) => i + 7); // 7-18

  // Build hourly map for current user
  const myHourMap = useMemo(() => {
    const map = new Map<number, TimeEntry>();
    if (!currentUser) return map;
    for (const e of currentUser.entriesToday) {
      if (!map.has(e.hour)) map.set(e.hour, e);
    }
    return map;
  }, [currentUser]);

  // Build hourly map for selected user
  const theirHourMap = useMemo(() => {
    const map = new Map<number, TimeEntry>();
    if (!selectedMember) return map;
    for (const e of selectedMember.entriesToday) {
      if (!map.has(e.hour)) map.set(e.hour, e);
    }
    return map;
  }, [selectedMember]);

  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
        Compara tu dia con un companero
      </p>

      {/* Member selector */}
      <div className="mb-6">
        <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1">
          Selecciona miembro
        </label>
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
          className="bg-background border border-border px-3 py-2 font-mono text-xs w-full max-w-xs"
        >
          <option value="">-- Seleccionar --</option>
          {otherMembers.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.profile.full_name ?? m.profile.email}
            </option>
          ))}
        </select>
      </div>

      {!currentUser ? (
        <div className="border border-border p-8 text-center">
          <p className="font-mono text-xs text-muted-foreground">
            No se encontro tu perfil en el equipo
          </p>
        </div>
      ) : !selectedMember ? (
        <div className="border border-border p-8 text-center">
          <Users className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="font-mono text-xs text-muted-foreground">
            Selecciona un miembro para comparar
          </p>
        </div>
      ) : (
        <div>
          {/* Names header */}
          <div className="grid grid-cols-[60px_1fr_1fr] gap-2 mb-2">
            <div />
            <div className="text-center">
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                Tu ({currentUser.hoursToday}h)
              </span>
            </div>
            <div className="text-center">
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                {(selectedMember.profile.full_name ?? "").split(" ")[0]} ({selectedMember.hoursToday}h)
              </span>
            </div>
          </div>

          {/* Hour-by-hour comparison */}
          <div className="space-y-0">
            {hours.map((h) => {
              const myEntry = myHourMap.get(h);
              const theirEntry = theirHourMap.get(h);
              const iWorkedMore = myEntry && !theirEntry;
              const theyWorkedMore = !myEntry && theirEntry;

              return (
                <div
                  key={h}
                  className={cn(
                    "grid grid-cols-[60px_1fr_1fr] gap-2 border-b border-border/30 py-1.5",
                    iWorkedMore && "bg-green-500/5",
                    theyWorkedMore && "bg-red-500/5"
                  )}
                >
                  {/* Hour label */}
                  <div className="font-mono text-[10px] text-muted-foreground tabular-nums text-right pr-2">
                    {formatHour(h)}
                  </div>

                  {/* My entry */}
                  <div className="min-w-0">
                    {myEntry ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "w-2.5 h-2.5 shrink-0",
                            CATEGORY_COLORS[myEntry.category] ?? "bg-muted"
                          )}
                        />
                        <span className="font-mono text-[10px] truncate">
                          {myEntry.title}
                        </span>
                      </div>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground/30">
                        --
                      </span>
                    )}
                  </div>

                  {/* Their entry */}
                  <div className="min-w-0">
                    {theirEntry ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "w-2.5 h-2.5 shrink-0",
                            CATEGORY_COLORS[theirEntry.category] ?? "bg-muted"
                          )}
                        />
                        <span className="font-mono text-[10px] truncate">
                          {theirEntry.title}
                        </span>
                      </div>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground/30">
                        --
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="border border-border p-3">
              <p className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
                Tu resumen
              </p>
              <p className="font-mono text-lg font-bold tabular-nums tracking-tight">
                {currentUser.hoursToday}h
              </p>
              <p className="font-mono text-[9px] text-muted-foreground">
                {currentUser.entriesToday.length} entradas
              </p>
            </div>
            <div className="border border-border p-3">
              <p className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
                {(selectedMember.profile.full_name ?? "").split(" ")[0]}
              </p>
              <p className="font-mono text-lg font-bold tabular-nums tracking-tight">
                {selectedMember.hoursToday}h
              </p>
              <p className="font-mono text-[9px] text-muted-foreground">
                {selectedMember.entriesToday.length} entradas
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAB 4: Fantasmas (Ghost Detection)
// ============================================================

function GhostsTab({
  members,
  today,
}: {
  members: MemberData[];
  today: string;
}) {
  const currentHour = getCurrentHourMTY();

  const ghostMembers = useMemo(() => {
    return members
      .map((m) => {
        const workStart = m.profile.work_start_hour ?? 7;
        const workEnd = m.profile.work_end_hour ?? 18;
        const isInWorkHours =
          currentHour >= workStart && currentHour < workEnd;

        if (!isInWorkHours) return null;

        // Find hours since last entry
        let hoursSinceLastEntry = currentHour - workStart;
        if (m.entriesToday.length > 0) {
          const maxHour = Math.max(...m.entriesToday.map((e) => e.hour));
          hoursSinceLastEntry = currentHour - maxHour;
        } else if (m.lastEntry) {
          // Check if last entry was today
          if (m.lastEntry.date === today) {
            hoursSinceLastEntry = currentHour - m.lastEntry.hour;
          }
        }

        if (hoursSinceLastEntry < 4) return null;

        return {
          ...m,
          hoursSinceLastEntry,
        };
      })
      .filter(Boolean) as (MemberData & { hoursSinceLastEntry: number })[];
  }, [members, currentHour, today]);

  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
        Miembros con 4+ horas sin registrar en horario laboral
      </p>

      {ghostMembers.length === 0 ? (
        <div className="border border-border p-8 text-center">
          <Ghost className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="font-mono text-xs text-muted-foreground">
            Sin fantasmas detectados
          </p>
          <p className="font-mono text-[9px] text-muted-foreground/50 mt-1">
            Todos los miembros activos durante horario laboral
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {ghostMembers.map((m) => (
            <div
              key={m.userId}
              className="card-palantir border-amber-500/20 bg-amber-500/3 p-4 flex items-center gap-4"
            >
              {/* Ghost avatar */}
              <div className="relative shrink-0">
                <Avatar className="w-12 h-12 ring-1 ring-border grayscale opacity-30">
                  <AvatarImage
                    src={m.profile.avatar_url ?? undefined}
                  />
                  <AvatarFallback className="text-sm font-mono">
                    {getInitials(m.profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <Ghost className="absolute -bottom-1 -right-1 w-5 h-5 text-amber-500" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-mono font-bold uppercase tracking-tight">
                  {m.profile.full_name ?? m.profile.email}
                </p>
                <p className="font-mono text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                  Desaparecido hace {m.hoursSinceLastEntry}h
                </p>
                <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
                  Entradas hoy: {m.entriesToday.length} | Horas: {m.hoursToday}
                </p>
              </div>

              {/* Hours badge */}
              <div className="shrink-0 border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center">
                <p className="font-mono text-xl font-bold tabular-nums tracking-tight text-amber-600 dark:text-amber-400">
                  {m.hoursSinceLastEntry}h
                </p>
                <p className="font-mono text-[7px] tracking-[0.18em] uppercase text-amber-500/60">
                  Sin registro
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAB 5: Salud (Health / Mood & Energy)
// ============================================================

function HealthTab({ members }: { members: MemberData[] }) {
  const memberHealth = useMemo(() => {
    return members.map((m) => {
      // Get entries with mood/energy from the week
      const withMood = m.entriesWeek.filter((e) => e.mood !== null);
      const withEnergy = m.entriesWeek.filter((e) => e.energy !== null);

      const avgMood =
        withMood.length > 0
          ? withMood.reduce((s, e) => s + (e.mood ?? 0), 0) / withMood.length
          : null;
      const avgEnergy =
        withEnergy.length > 0
          ? withEnergy.reduce((s, e) => s + (e.energy ?? 0), 0) /
            withEnergy.length
          : null;

      // Trend: compare first half vs second half of the week
      const midpoint = Math.floor(withMood.length / 2);
      let moodTrend: "up" | "down" | "flat" = "flat";
      if (withMood.length >= 4) {
        const firstHalf = withMood.slice(0, midpoint);
        const secondHalf = withMood.slice(midpoint);
        const firstAvg =
          firstHalf.reduce((s, e) => s + (e.mood ?? 0), 0) /
          firstHalf.length;
        const secondAvg =
          secondHalf.reduce((s, e) => s + (e.mood ?? 0), 0) /
          secondHalf.length;
        if (secondAvg - firstAvg > 0.3) moodTrend = "up";
        else if (firstAvg - secondAvg > 0.3) moodTrend = "down";
      }

      const energyMidpoint = Math.floor(withEnergy.length / 2);
      let energyTrend: "up" | "down" | "flat" = "flat";
      if (withEnergy.length >= 4) {
        const firstHalf = withEnergy.slice(0, energyMidpoint);
        const secondHalf = withEnergy.slice(energyMidpoint);
        const firstAvg =
          firstHalf.reduce((s, e) => s + (e.energy ?? 0), 0) /
          firstHalf.length;
        const secondAvg =
          secondHalf.reduce((s, e) => s + (e.energy ?? 0), 0) /
          secondHalf.length;
        if (secondAvg - firstAvg > 0.3) energyTrend = "up";
        else if (firstAvg - secondAvg > 0.3) energyTrend = "down";
      }

      // Declining wellbeing flag
      const isDeclining = moodTrend === "down" || energyTrend === "down";

      return {
        ...m,
        avgMood,
        avgEnergy,
        moodTrend,
        energyTrend,
        isDeclining,
        moodEntries: withMood.length,
        energyEntries: withEnergy.length,
      };
    });
  }, [members]);

  const declining = memberHealth.filter((m) => m.isDeclining);

  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
        Bienestar del equipo - ultimos 7 dias
      </p>

      {/* Alert for declining members */}
      {declining.length > 0 && (
        <div className="border border-red-500/20 bg-red-500/5 p-3 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Heart className="w-3.5 h-3.5 text-red-500" />
            <span className="font-mono text-[10px] font-bold uppercase text-red-600 dark:text-red-400">
              Bienestar en declive
            </span>
          </div>
          <p className="font-mono text-[9px] text-muted-foreground">
            {declining.map((m) => m.profile.full_name ?? m.profile.email).join(", ")}
          </p>
        </div>
      )}

      {memberHealth.length === 0 ? (
        <div className="border border-border p-8 text-center">
          <Heart className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="font-mono text-xs text-muted-foreground">
            Sin datos de salud disponibles
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[1fr_80px_80px_80px_80px_80px] gap-2 px-3 py-1">
            <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Miembro
            </span>
            <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40 text-center">
              Animo prom.
            </span>
            <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40 text-center">
              Tendencia
            </span>
            <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40 text-center">
              Energia prom.
            </span>
            <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40 text-center">
              Tendencia
            </span>
            <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground/40 text-center">
              Registros
            </span>
          </div>

          {memberHealth.map((m) => (
            <div
              key={m.userId}
              className={cn(
                "card-palantir p-3",
                m.isDeclining && "border-red-500/20 bg-red-500/3"
              )}
            >
              <div className="sm:grid sm:grid-cols-[1fr_80px_80px_80px_80px_80px] sm:gap-2 sm:items-center">
                {/* Name */}
                <div className="flex items-center gap-2 min-w-0 mb-2 sm:mb-0">
                  <Avatar className="w-7 h-7 ring-1 ring-border shrink-0">
                    <AvatarImage
                      src={m.profile.avatar_url ?? undefined}
                    />
                    <AvatarFallback className="text-[8px] font-mono">
                      {getInitials(m.profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-mono text-[11px] font-bold uppercase tracking-tight truncate">
                    {m.profile.full_name ?? m.profile.email}
                  </span>
                </div>

                {/* Mobile stats */}
                <div className="grid grid-cols-4 gap-2 sm:hidden mb-1">
                  <div>
                    <span className="font-mono text-[7px] text-muted-foreground uppercase">
                      Animo
                    </span>
                    <p className="font-mono text-sm font-bold tabular-nums">
                      {m.avgMood !== null ? m.avgMood.toFixed(1) : "--"}
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[7px] text-muted-foreground uppercase">
                      Tend.
                    </span>
                    <TrendIcon trend={m.moodTrend} />
                  </div>
                  <div>
                    <span className="font-mono text-[7px] text-muted-foreground uppercase">
                      Energia
                    </span>
                    <p className="font-mono text-sm font-bold tabular-nums">
                      {m.avgEnergy !== null
                        ? m.avgEnergy.toFixed(1)
                        : "--"}
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[7px] text-muted-foreground uppercase">
                      Tend.
                    </span>
                    <TrendIcon trend={m.energyTrend} />
                  </div>
                </div>

                {/* Desktop columns */}
                <div className="hidden sm:block text-center">
                  <span
                    className={cn(
                      "font-mono text-sm font-bold tabular-nums tracking-tight",
                      m.avgMood !== null
                        ? m.avgMood >= 4
                          ? "text-green-600 dark:text-green-400"
                          : m.avgMood >= 3
                            ? ""
                            : "text-red-600 dark:text-red-400"
                        : "text-muted-foreground/30"
                    )}
                  >
                    {m.avgMood !== null ? m.avgMood.toFixed(1) : "--"}
                  </span>
                  {m.avgMood !== null && (
                    <p className="font-mono text-[8px] text-muted-foreground">
                      {MOOD_LABELS[Math.round(m.avgMood)] ?? ""}
                    </p>
                  )}
                </div>

                <div className="hidden sm:flex justify-center">
                  <TrendIcon trend={m.moodTrend} />
                </div>

                <div className="hidden sm:block text-center">
                  <span
                    className={cn(
                      "font-mono text-sm font-bold tabular-nums tracking-tight",
                      m.avgEnergy !== null
                        ? m.avgEnergy >= 4
                          ? "text-green-600 dark:text-green-400"
                          : m.avgEnergy >= 3
                            ? ""
                            : "text-red-600 dark:text-red-400"
                        : "text-muted-foreground/30"
                    )}
                  >
                    {m.avgEnergy !== null
                      ? m.avgEnergy.toFixed(1)
                      : "--"}
                  </span>
                  {m.avgEnergy !== null && (
                    <p className="font-mono text-[8px] text-muted-foreground">
                      {ENERGY_LABELS[Math.round(m.avgEnergy)] ?? ""}
                    </p>
                  )}
                </div>

                <div className="hidden sm:flex justify-center">
                  <TrendIcon trend={m.energyTrend} />
                </div>

                <div className="hidden sm:block text-center">
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {m.moodEntries + m.energyEntries}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Shared: Trend Icon
// ============================================================

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") {
    return (
      <div className="flex items-center gap-0.5">
        <ArrowUp className="w-3 h-3 text-green-500" />
        <span className="font-mono text-[8px] text-green-500 uppercase">
          Mejora
        </span>
      </div>
    );
  }
  if (trend === "down") {
    return (
      <div className="flex items-center gap-0.5">
        <ArrowDown className="w-3 h-3 text-red-500" />
        <span className="font-mono text-[8px] text-red-500 uppercase">
          Baja
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-0.5">
      <Minus className="w-3 h-3 text-muted-foreground/40" />
      <span className="font-mono text-[8px] text-muted-foreground/40 uppercase">
        Estable
      </span>
    </div>
  );
}
