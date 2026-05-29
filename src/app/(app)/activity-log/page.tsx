"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  TimeEntry,
  LiveStatus,
  EntryReaction,
  DailyCloseout,
  AccountabilityFlag,
  WorkCategory,
  LiveStatusType,
  ReactionType,
  FlagType,
} from "@/lib/types/database";
import { CATEGORIES, LIVE_STATUS_CONFIG, REACTIONS, FLAG_TYPES } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Radio,
  Filter,
  Clock,
  User,
  Shield,
  MessageSquare,
  Flag,
  AlertTriangle,
  ChevronDown,
  Activity,
  Zap,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventType = "entry" | "status_change" | "reaction" | "closeout" | "flag";

interface ActivityEvent {
  id: string;
  type: EventType;
  timestamp: string;
  userId: string;
  profile: Profile | null;
  description: string;
  detail: string | null;
  category: WorkCategory | null;
  severity: "normal" | "warning" | "danger" | "success";
  raw: unknown;
}

const EVENT_TYPE_CONFIG: Record<
  EventType,
  { label: string; icon: typeof Clock; color: string; bgColor: string }
> = {
  entry: {
    label: "Entrada",
    icon: Clock,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/40",
  },
  status_change: {
    label: "Estado",
    icon: Radio,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/40",
  },
  reaction: {
    label: "Reaccion",
    icon: MessageSquare,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/40",
  },
  closeout: {
    label: "Cierre",
    icon: Shield,
    color: "text-primary",
    bgColor: "bg-violet-100 dark:bg-violet-900/40",
  },
  flag: {
    label: "Flag",
    icon: Flag,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/40",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEventTime(dateStr: string): string {
  try {
    return format(new Date(dateStr), "HH:mm", { locale: es });
  } catch {
    return "--:--";
  }
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 1000 / 60);
  if (diffMin < 1) return "justo ahora";
  if (diffMin < 60) return `hace ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  return `hace ${Math.floor(diffH / 24)}d`;
}

// ---------------------------------------------------------------------------
// Build events from raw data
// ---------------------------------------------------------------------------

function buildEntryEvent(
  entry: TimeEntry,
  profileMap: Map<string, Profile>
): ActivityEvent {
  const profile = profileMap.get(entry.user_id) ?? null;
  const cat = CATEGORIES[entry.category as WorkCategory];
  const name = profile?.full_name ?? profile?.email ?? "Desconocido";
  const hourLabel = `${entry.hour}:00 ${entry.hour < 12 ? "AM" : "PM"}`;

  return {
    id: `entry-${entry.id}`,
    type: "entry",
    timestamp: entry.created_at,
    userId: entry.user_id,
    profile,
    description: `${name} registro ${hourLabel}: ${cat?.label ?? entry.category}`,
    detail: entry.title,
    category: entry.category as WorkCategory,
    severity: entry.is_late ? "warning" : "normal",
    raw: entry,
  };
}

function buildStatusEvent(
  status: LiveStatus & { profiles?: Profile },
  profileMap: Map<string, Profile>
): ActivityEvent {
  const profile =
    status.profiles ?? profileMap.get(status.user_id) ?? null;
  const name = profile?.full_name ?? profile?.email ?? "Desconocido";
  const config = LIVE_STATUS_CONFIG[status.status as LiveStatusType];

  return {
    id: `status-${status.user_id}-${status.started_at}`,
    type: "status_change",
    timestamp: status.started_at,
    userId: status.user_id,
    profile,
    description: `${name} cambio su estado a ${config?.label ?? status.status}`,
    detail: status.current_task,
    category: null,
    severity: "normal",
    raw: status,
  };
}

function buildReactionEvent(
  reaction: EntryReaction & { profiles?: Profile; time_entries?: TimeEntry & { profiles?: Profile } },
  profileMap: Map<string, Profile>,
  entryOwnerMap: Map<string, string>
): ActivityEvent {
  const profile =
    reaction.profiles ?? profileMap.get(reaction.user_id) ?? null;
  const name = profile?.full_name ?? profile?.email ?? "Desconocido";
  const reactionConfig = REACTIONS[reaction.reaction as ReactionType];
  const emoji = reactionConfig?.emoji ?? reaction.reaction;

  const entryOwnerId = entryOwnerMap.get(reaction.entry_id);
  const ownerProfile = entryOwnerId ? profileMap.get(entryOwnerId) : null;
  const ownerName = ownerProfile?.full_name ?? "alguien";

  return {
    id: `reaction-${reaction.id}`,
    type: "reaction",
    timestamp: reaction.created_at,
    userId: reaction.user_id,
    profile,
    description: `${name} reacciono ${emoji} a la entrada de ${ownerName}`,
    detail: reaction.comment,
    category: null,
    severity:
      reaction.reaction === "suspicious" ? "warning" : "success",
    raw: reaction,
  };
}

function buildCloseoutEvent(
  closeout: DailyCloseout,
  profileMap: Map<string, Profile>
): ActivityEvent {
  const profile = profileMap.get(closeout.user_id) ?? null;
  const name = profile?.full_name ?? profile?.email ?? "Desconocido";

  return {
    id: `closeout-${closeout.id}`,
    type: "closeout",
    timestamp: closeout.submitted_at,
    userId: closeout.user_id,
    profile,
    description: `${name} hizo su cierre del dia`,
    detail: closeout.summary,
    category: null,
    severity: "success",
    raw: closeout,
  };
}

function buildFlagEvent(
  flag: AccountabilityFlag,
  profileMap: Map<string, Profile>
): ActivityEvent {
  const profile = profileMap.get(flag.user_id) ?? null;
  const name = profile?.full_name ?? profile?.email ?? "Desconocido";
  const flagInfo = FLAG_TYPES[flag.flag_type as FlagType];

  return {
    id: `flag-${flag.id}`,
    type: "flag",
    timestamp: flag.created_at,
    userId: flag.user_id,
    profile,
    description: `Sistema: Flag generado para ${name} — ${flagInfo?.label ?? flag.flag_type}`,
    detail: flag.details,
    category: null,
    severity: flagInfo?.severity === "high" ? "danger" : "warning",
    raw: flag,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActivityLogPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);

  // Filters
  const [filterPerson, setFilterPerson] = useState<string | null>(null);
  const [filterTypes, setFilterTypes] = useState<Set<EventType>>(
    new Set(["entry", "status_change", "reaction", "closeout", "flag"])
  );
  const [showFilters, setShowFilters] = useState(false);

  // Profiles
  const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);

  // Entry owner map (entry_id -> user_id) for reactions
  const [entryOwnerMap, setEntryOwnerMap] = useState<Map<string, string>>(new Map());

  // Aggregate counters (last hour)
  const [counters, setCounters] = useState({
    entries: 0,
    reactions: 0,
    statusChanges: 0,
  });

  const feedRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // -------------------------------------------------------------------------
  // Load org
  // -------------------------------------------------------------------------
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
        .single();
      if (membership) setOrgId(membership.org_id);
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Load profiles
  // -------------------------------------------------------------------------
  const loadProfiles = useCallback(
    async (oid: string) => {
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", oid)
        ;

      if (members) {
        const map = new Map<string, Profile>();
        const list: Profile[] = [];
        for (const m of members) {
          map.set(m.user_id, m.profiles);
          list.push(m.profiles);
        }
        setProfileMap(map);
        setAllProfiles(list);
        return map;
      }
      return new Map<string, Profile>();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // -------------------------------------------------------------------------
  // Load all events
  // -------------------------------------------------------------------------
  const loadEvents = useCallback(
    async (oid: string, pMap: Map<string, Profile>) => {
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];

      const [
        { data: entries },
        { data: statuses },
        { data: reactions },
        { data: closeouts },
        { data: flags },
      ] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*")
          .eq("org_id", oid)
          .eq("date", today)
          .order("created_at", { ascending: false })
          .limit(200)
          ,
        supabase
          .from("live_status")
          .select("*, profiles(*)")
          .eq("org_id", oid)
          ,
        supabase
          .from("entry_reactions")
          .select("*, profiles(*)")
          .order("created_at", { ascending: false })
          .limit(200)
          ,
        supabase
          .from("daily_closeouts")
          .select("*")
          .eq("org_id", oid)
          .eq("date", today)
          ,
        supabase
          .from("accountability_flags")
          .select("*")
          .eq("org_id", oid)
          .eq("date", today)
          .order("created_at", { ascending: false })
          ,
      ]);

      // Build entry owner map for reactions
      const ownerMap = new Map<string, string>();
      for (const e of entries ?? []) {
        ownerMap.set(e.id, e.user_id);
      }
      setEntryOwnerMap(ownerMap);

      // Build all events
      const allEvents: ActivityEvent[] = [];

      for (const entry of entries ?? []) {
        allEvents.push(buildEntryEvent(entry, pMap));
      }

      for (const status of statuses ?? []) {
        allEvents.push(buildStatusEvent(status, pMap));
      }

      // Filter reactions to only those on entries belonging to this org
      const orgEntryIds = new Set((entries ?? []).map((e) => e.id));
      for (const reaction of reactions ?? []) {
        if (orgEntryIds.has(reaction.entry_id)) {
          allEvents.push(buildReactionEvent(reaction, pMap, ownerMap));
        }
      }

      for (const closeout of closeouts ?? []) {
        allEvents.push(buildCloseoutEvent(closeout, pMap));
      }

      for (const flag of flags ?? []) {
        allEvents.push(buildFlagEvent(flag, pMap));
      }

      // Sort newest first
      allEvents.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setEvents(allEvents);

      // Compute counters (last hour)
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      let entryCt = 0;
      let reactionCt = 0;
      let statusCt = 0;
      for (const ev of allEvents) {
        if (new Date(ev.timestamp).getTime() >= oneHourAgo) {
          if (ev.type === "entry") entryCt++;
          else if (ev.type === "reaction") reactionCt++;
          else if (ev.type === "status_change") statusCt++;
        }
      }
      setCounters({ entries: entryCt, reactions: reactionCt, statusChanges: statusCt });

      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // -------------------------------------------------------------------------
  // Initial load + realtime subscriptions
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!orgId) return;

    let profileMapRef: Map<string, Profile> = new Map();

    async function init() {
      const pMap = await loadProfiles(orgId!);
      profileMapRef = pMap;
      await loadEvents(orgId!, pMap);
    }

    init();

    // Realtime on multiple tables
    const channel = supabase
      .channel("activity_log_feed")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadEvents(orgId!, profileMapRef)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_status",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadEvents(orgId!, profileMapRef)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entry_reactions",
        },
        () => loadEvents(orgId!, profileMapRef)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_closeouts",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadEvents(orgId!, profileMapRef)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "accountability_flags",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadEvents(orgId!, profileMapRef)
      )
      .subscribe();

    // Periodic refresh every 30 seconds
    const interval = setInterval(() => {
      loadEvents(orgId!, profileMapRef);
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [orgId, loadProfiles, loadEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Auto-scroll
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [events, autoScroll]);

  // -------------------------------------------------------------------------
  // Filtered events
  // -------------------------------------------------------------------------
  const filteredEvents = events.filter((ev) => {
    if (!filterTypes.has(ev.type)) return false;
    if (filterPerson && ev.userId !== filterPerson) return false;
    return true;
  });

  // -------------------------------------------------------------------------
  // Toggle filter type
  // -------------------------------------------------------------------------
  function toggleType(type: EventType) {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        // Don't allow removing all
        if (next.size <= 1) return prev;
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Severity styling
  // -------------------------------------------------------------------------
  function getSeverityStyles(severity: ActivityEvent["severity"]) {
    switch (severity) {
      case "danger":
        return "border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/10";
      case "warning":
        return "border-orange-200 dark:border-orange-900/50 bg-orange-50/30 dark:bg-orange-950/10";
      case "success":
        return "border-green-200 dark:border-green-900/50 bg-green-50/30 dark:bg-green-950/10";
      default:
        return "";
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const todayFormatted = format(new Date(), "EEEE, d MMMM yyyy", { locale: es });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* ----------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Activity className="w-6 h-6 text-primary" />
            {isLive && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full animate-ping" />
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Activity Log
          </h1>
          {/* En vivo indicator */}
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] gap-1 cursor-pointer select-none transition-colors",
              isLive
                ? "text-green-600 border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-800"
                : "text-muted-foreground"
            )}
            onClick={() => setIsLive(!isLive)}
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isLive ? "bg-green-500 animate-pulse" : "bg-gray-400"
              )}
            />
            {isLive ? "En vivo" : "Pausado"}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl gap-1.5 text-xs"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-3.5 h-3.5" />
          Filtros
          <ChevronDown
            className={cn(
              "w-3 h-3 transition-transform",
              showFilters && "rotate-180"
            )}
          />
        </Button>
      </div>
      <p className="text-muted-foreground text-sm mb-6 capitalize">
        {todayFormatted}
      </p>

      {/* ----------------------------------------------------------------- */}
      {/* Aggregate counters                                                 */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Entradas (1h)
              </span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {counters.entries}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Reacciones (1h)
              </span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {counters.reactions}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-green-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Estados (1h)
              </span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
              {counters.statusChanges}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Filter bar                                                        */}
      {/* ----------------------------------------------------------------- */}
      {showFilters && (
        <Card className="mb-6 border-border/50">
          <CardContent className="p-4 space-y-4">
            {/* Event type filters */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                Tipo de evento
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  Object.entries(EVENT_TYPE_CONFIG) as [
                    EventType,
                    (typeof EVENT_TYPE_CONFIG)[EventType],
                  ][]
                ).map(([type, config]) => {
                  const Icon = config.icon;
                  const active = filterTypes.has(type);
                  return (
                    <Button
                      key={type}
                      variant={active ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "rounded-xl text-xs gap-1.5 transition-all",
                        active
                          ? ""
                          : "opacity-50 hover:opacity-100"
                      )}
                      onClick={() => toggleType(type)}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {config.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Person filter */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                Persona
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filterPerson === null ? "default" : "outline"}
                  size="sm"
                  className="rounded-xl text-xs gap-1.5"
                  onClick={() => setFilterPerson(null)}
                >
                  <User className="w-3.5 h-3.5" />
                  Todos
                </Button>
                {allProfiles.map((p) => (
                  <Button
                    key={p.id}
                    variant={filterPerson === p.id ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "rounded-xl text-xs gap-1.5 transition-all",
                      filterPerson !== p.id && filterPerson !== null
                        ? "opacity-50 hover:opacity-100"
                        : ""
                    )}
                    onClick={() =>
                      setFilterPerson(filterPerson === p.id ? null : p.id)
                    }
                  >
                    <Avatar className="w-4 h-4">
                      <AvatarImage src={p.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[8px]">
                        {getInitials(p.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    {p.full_name?.split(" ")[0] ?? p.email.split("@")[0]}
                  </Button>
                ))}
              </div>
            </div>

            {/* Active filters summary */}
            {(filterPerson || filterTypes.size < 5) && (
              <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                <span className="text-[10px] text-muted-foreground">
                  Filtros activos:
                </span>
                {filterPerson && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] gap-1 cursor-pointer"
                    onClick={() => setFilterPerson(null)}
                  >
                    {profileMap.get(filterPerson)?.full_name?.split(" ")[0] ?? "?"}
                    <X className="w-2.5 h-2.5" />
                  </Badge>
                )}
                {filterTypes.size < 5 &&
                  Array.from(filterTypes).map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="text-[10px] gap-1"
                    >
                      {EVENT_TYPE_CONFIG[t].label}
                    </Badge>
                  ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] h-5 px-2 ml-auto"
                  onClick={() => {
                    setFilterPerson(null);
                    setFilterTypes(
                      new Set([
                        "entry",
                        "status_change",
                        "reaction",
                        "closeout",
                        "flag",
                      ])
                    );
                  }}
                >
                  Limpiar filtros
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Auto-scroll toggle                                                */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          {filteredEvents.length} evento{filteredEvents.length !== 1 ? "s" : ""}{" "}
          {filterPerson || filterTypes.size < 5 ? "(filtrado)" : "hoy"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "text-[10px] h-6 px-2 gap-1 rounded-lg",
            autoScroll && "text-green-600"
          )}
          onClick={() => setAutoScroll(!autoScroll)}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              autoScroll ? "bg-green-500 animate-pulse" : "bg-gray-400"
            )}
          />
          Auto-scroll {autoScroll ? "activo" : "inactivo"}
        </Button>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Feed                                                              */}
      {/* ----------------------------------------------------------------- */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Cargando actividad...
          </p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground text-sm">
            No hay actividad registrada{" "}
            {filterPerson || filterTypes.size < 5
              ? "con los filtros seleccionados"
              : "todavia hoy"}
            .
          </p>
          {(filterPerson || filterTypes.size < 5) && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-xs"
              onClick={() => {
                setFilterPerson(null);
                setFilterTypes(
                  new Set([
                    "entry",
                    "status_change",
                    "reaction",
                    "closeout",
                    "flag",
                  ])
                );
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <div ref={feedRef} className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
          {filteredEvents.map((ev, idx) => {
            const typeConfig = EVENT_TYPE_CONFIG[ev.type];
            const Icon = typeConfig.icon;
            const catConfig = ev.category
              ? CATEGORIES[ev.category]
              : null;

            // Show time separator when the minute changes
            const prevEvent = idx > 0 ? filteredEvents[idx - 1] : null;
            const currentTime = formatEventTime(ev.timestamp);
            const prevTime = prevEvent
              ? formatEventTime(prevEvent.timestamp)
              : null;
            const showTimeSeparator = currentTime !== prevTime;

            return (
              <div key={ev.id}>
                {/* Time separator */}
                {showTimeSeparator && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="h-px flex-1 bg-border/50" />
                    <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
                      {currentTime}
                    </span>
                    <div className="h-px flex-1 bg-border/50" />
                  </div>
                )}

                {/* Event card */}
                <Card
                  className={cn(
                    "transition-all duration-300 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5",
                    getSeverityStyles(ev.severity),
                    idx === 0 &&
                      isLive &&
                      "ring-1 ring-primary/20 shadow-sm shadow-primary/10"
                  )}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Timeline dot */}
                      <div className="flex flex-col items-center gap-1 pt-0.5">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                            typeConfig.bgColor
                          )}
                        >
                          <Icon
                            className={cn("w-4 h-4", typeConfig.color)}
                          />
                        </div>
                      </div>

                      {/* Avatar */}
                      <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm shrink-0">
                        <AvatarImage
                          src={ev.profile?.avatar_url ?? undefined}
                        />
                        <AvatarFallback className="text-[10px]">
                          {ev.type === "flag"
                            ? "SYS"
                            : getInitials(ev.profile?.full_name ?? null)}
                        </AvatarFallback>
                      </Avatar>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm leading-snug">
                              <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums mr-2">
                                {currentTime}
                              </span>
                              <span
                                className={cn(
                                  ev.severity === "danger" &&
                                    "text-red-600 dark:text-red-400",
                                  ev.severity === "warning" &&
                                    "text-orange-600 dark:text-orange-400"
                                )}
                              >
                                {ev.description}
                              </span>
                            </p>

                            {/* Detail / title */}
                            {ev.detail && (
                              <p className="text-xs text-muted-foreground mt-1 bg-muted/50 px-2 py-1 rounded-md inline-block max-w-full truncate">
                                &ldquo;{ev.detail}&rdquo;
                              </p>
                            )}
                          </div>

                          {/* Badges */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Category color dot */}
                            {catConfig && (
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-[9px] py-0 px-1.5 gap-1",
                                  catConfig.color,
                                  catConfig.bgColor
                                )}
                              >
                                <span
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    catConfig.color.replace("text-", "bg-").split(" ")[0]
                                  )}
                                />
                                {catConfig.label}
                              </Badge>
                            )}

                            {/* Event type badge */}
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] py-0 px-1.5",
                                typeConfig.color
                              )}
                            >
                              {typeConfig.label}
                            </Badge>

                            {/* Severity badge for warnings/flags */}
                            {ev.severity === "danger" && (
                              <Badge
                                variant="destructive"
                                className="text-[9px] py-0 px-1.5 gap-0.5"
                              >
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Alerta
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Relative time */}
                        <p className="text-[10px] text-muted-foreground/50 mt-1">
                          {formatRelativeTime(ev.timestamp)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}

          {/* End of feed */}
          <div className="flex items-center justify-center py-6 gap-2">
            <div className="h-px flex-1 bg-border/30" />
            <span className="text-[10px] text-muted-foreground/40">
              Inicio del dia
            </span>
            <div className="h-px flex-1 bg-border/30" />
          </div>
        </div>
      )}
    </div>
  );
}
