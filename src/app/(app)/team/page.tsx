"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  LiveStatus,
  LiveStatusType,
  TimeEntry,
} from "@/lib/types/database";
import {
  LIVE_STATUS_CONFIG,
  EXPECTED_DAILY_HOURS,
} from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import {
  Users,
  Search,
  Flame,
  Shield,
  Clock,
  Eye,
  Heart,
  ArrowUpDown,
  CloudSun,
  CloudRain,
  Sun,
  Cloud,
} from "lucide-react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────

interface TeamMember {
  userId: string;
  profile: Profile;
  liveStatus: LiveStatus | null;
  trustScore: number;
  streak: number;
  hoursToday: number;
  proofRateToday: number;
  titleTier: "S" | "A" | "B" | "C" | "D" | "F";
  lastActivity: string | null;
}

type SortKey = "name" | "trust" | "hours" | "streak" | "status";

// ─── Helpers ────────────────────────────────────────────────────

function getTitleTier(trustScore: number): "S" | "A" | "B" | "C" | "D" | "F" {
  if (trustScore >= 95) return "S";
  if (trustScore >= 80) return "A";
  if (trustScore >= 65) return "B";
  if (trustScore >= 50) return "C";
  if (trustScore >= 35) return "D";
  return "F";
}

function tierColor(tier: string): string {
  switch (tier) {
    case "S": return "bg-gradient-to-r from-yellow-400 to-amber-500 text-white";
    case "A": return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
    case "B": return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
    case "C": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    case "D": return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30";
    default: return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
  }
}

function trustColor(score: number): string {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-blue-600 dark:text-blue-400";
  if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function trustBgColor(score: number): string {
  if (score >= 80) return "bg-green-500/15 border-green-500/30";
  if (score >= 60) return "bg-blue-500/15 border-blue-500/30";
  if (score >= 40) return "bg-yellow-500/15 border-yellow-500/30";
  return "bg-red-500/15 border-red-500/30";
}

function statusRingColor(status: LiveStatusType | undefined): string {
  switch (status) {
    case "online": return "ring-green-500";
    case "idle": return "ring-yellow-500";
    case "deep_work": return "ring-violet-500";
    case "in_meeting": return "ring-blue-500";
    case "break": return "ring-green-400";
    case "offline":
    default: return "ring-gray-300 dark:ring-gray-600";
  }
}

function statusOrder(status: LiveStatusType | undefined): number {
  const order: Record<LiveStatusType, number> = {
    online: 0,
    deep_work: 1,
    in_meeting: 2,
    idle: 3,
    break: 4,
    offline: 5,
  };
  return order[status ?? "offline"] ?? 5;
}

function teamMoodWeather(avgTrust: number): {
  icon: React.ReactNode;
  label: string;
} {
  if (avgTrust >= 85) return { icon: <Sun className="w-5 h-5 text-yellow-500" />, label: "Excelente" };
  if (avgTrust >= 70) return { icon: <CloudSun className="w-5 h-5 text-blue-400" />, label: "Bueno" };
  if (avgTrust >= 50) return { icon: <Cloud className="w-5 h-5 text-gray-400" />, label: "Regular" };
  return { icon: <CloudRain className="w-5 h-5 text-gray-500" />, label: "Necesita atenci\u00f3n" };
}

// ─── Page Component ─────────────────────────────────────────────

export default function TeamPage() {
  const supabase = createClient();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("status");
  const [kudosSent, setKudosSent] = useState<Set<string>>(new Set());

  // ── Load org ────────────────────────────────────────────────

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
      if (!membership) return;

      setOrgId(membership.org_id);

      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", membership.org_id)
        .single();
      if (org) setOrgName(org.name);
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load team data ──────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!orgId) return;
    const today = new Date().toISOString().split("T")[0];

    const [
      { data: memberRows },
      { data: statusRows },
      { data: entriesRows },
      { data: streakRows },
      { data: trustRows },
    ] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId),
      supabase
        .from("live_status")
        .select("*")
        .eq("org_id", orgId),
      supabase
        .from("time_entries")
        .select("*")
        .eq("org_id", orgId)
        .eq("date", today),
      supabase
        .from("activity_streaks")
        .select("user_id, current_streak")
        .eq("org_id", orgId),
      supabase
        .from("trust_score_history")
        .select("user_id, score, date")
        .eq("org_id", orgId)
        .order("date", { ascending: false }),
    ]);

    if (!memberRows) {
      setLoading(false);
      return;
    }

    const statusMap = new Map<string, LiveStatus>();
    for (const s of statusRows ?? []) {
      statusMap.set(s.user_id, s);
    }

    const streakMap = new Map<string, number>();
    for (const s of streakRows ?? []) {
      streakMap.set(s.user_id, s.current_streak);
    }

    // Latest trust score per user
    const trustMap = new Map<string, number>();
    for (const t of trustRows ?? []) {
      if (!trustMap.has(t.user_id)) {
        trustMap.set(t.user_id, t.score);
      }
    }

    // Entries today per user
    const entriesByUser = new Map<string, TimeEntry[]>();
    for (const e of entriesRows ?? []) {
      const arr = entriesByUser.get(e.user_id) ?? [];
      arr.push(e);
      entriesByUser.set(e.user_id, arr);
    }

    const teamMembers: TeamMember[] = memberRows.map((m) => {
      const profile = m.profiles as unknown as Profile;
      const liveStatus = statusMap.get(m.user_id) ?? null;
      const trustScore = trustMap.get(m.user_id) ?? 0;
      const streak = streakMap.get(m.user_id) ?? 0;

      const todayEntries = entriesByUser.get(m.user_id) ?? [];
      const hoursToday = todayEntries.length;
      const withProof = todayEntries.filter(
        (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
      );
      const proofRateToday =
        hoursToday > 0 ? Math.round((withProof.length / hoursToday) * 100) : 0;

      // Last activity: latest entry logged_at or last heartbeat
      let lastActivity: string | null = null;
      if (todayEntries.length > 0) {
        const sorted = [...todayEntries].sort(
          (a, b) =>
            new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
        );
        lastActivity = sorted[0].logged_at;
      }
      if (
        liveStatus?.last_heartbeat &&
        (!lastActivity ||
          new Date(liveStatus.last_heartbeat).getTime() >
            new Date(lastActivity).getTime())
      ) {
        lastActivity = liveStatus.last_heartbeat;
      }

      return {
        userId: m.user_id,
        profile,
        liveStatus,
        trustScore,
        streak,
        hoursToday,
        proofRateToday,
        titleTier: getTitleTier(trustScore),
        lastActivity,
      };
    });

    setMembers(teamMembers);
    setLoading(false);
  }, [orgId, supabase]);

  useEffect(() => {
    if (!orgId) return;

    loadData();

    // Real-time subscriptions
    const statusChannel = supabase
      .channel("team_live_status")
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

    const entriesChannel = supabase
      .channel("team_entries_today")
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

    // Refresh every 60s for heartbeat freshness
    const interval = setInterval(loadData, 60000);

    return () => {
      supabase.removeChannel(statusChannel);
      supabase.removeChannel(entriesChannel);
      clearInterval(interval);
    };
  }, [orgId, loadData, supabase]);

  // ── Filtering & Sorting ─────────────────────────────────────

  const filteredAndSorted = useMemo(() => {
    let result = [...members];

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          (m.profile.full_name ?? "").toLowerCase().includes(q) ||
          m.profile.email.toLowerCase().includes(q) ||
          (m.profile.role ?? "").toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return (a.profile.full_name ?? a.profile.email).localeCompare(
            b.profile.full_name ?? b.profile.email
          );
        case "trust":
          return b.trustScore - a.trustScore;
        case "hours":
          return b.hoursToday - a.hoursToday;
        case "streak":
          return b.streak - a.streak;
        case "status":
        default:
          return (
            statusOrder(a.liveStatus?.status) -
            statusOrder(b.liveStatus?.status)
          );
      }
    });

    return result;
  }, [members, searchQuery, sortBy]);

  // ── Stats ───────────────────────────────────────────────────

  const stats = useMemo(() => {
    const counts: Record<string, number> = {
      online: 0,
      deep_work: 0,
      in_meeting: 0,
      idle: 0,
      offline: 0,
    };
    for (const m of members) {
      const s = m.liveStatus?.status ?? "offline";
      if (s === "break") {
        counts.idle += 1;
      } else {
        counts[s] = (counts[s] ?? 0) + 1;
      }
    }
    return counts;
  }, [members]);

  const avgTrust = useMemo(() => {
    if (members.length === 0) return 0;
    const total = members.reduce((acc, m) => acc + m.trustScore, 0);
    return Math.round(total / members.length);
  }, [members]);

  const mood = teamMoodWeather(avgTrust);

  // ── Kudos handler ───────────────────────────────────────────

  async function handleKudos(targetUserId: string) {
    if (kudosSent.has(targetUserId)) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !orgId) return;

    // Find a recent entry from this user to attach the reaction to
    const today = new Date().toISOString().split("T")[0];
    const { data: recentEntry } = await supabase
      .from("time_entries")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("org_id", orgId)
      .eq("date", today)
      .order("hour", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recentEntry) return;

    await supabase.from("entry_reactions").insert({
      entry_id: recentEntry.id,
      user_id: user.id,
      reaction: "impressive",
      comment: "Kudos desde el directorio del equipo",
    });

    setKudosSent((prev) => new Set([...prev, targetUserId]));
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Directorio del equipo
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {orgName && <span className="font-medium text-foreground">{orgName}</span>}
            <span>{members.length} miembro{members.length !== 1 ? "s" : ""}</span>
            <span className="hidden sm:inline">|</span>
            <span className="hidden sm:flex items-center gap-1">
              Trust Score prom.:{" "}
              <span className={cn("font-bold tabular-nums tracking-tight", trustColor(avgTrust))}>
                {avgTrust}
              </span>
            </span>
            <span className="hidden sm:inline">|</span>
            <span className="hidden sm:flex items-center gap-1">
              {mood.icon} {mood.label}
            </span>
          </div>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email o rol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => v && setSortBy(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <ArrowUpDown className="w-4 h-4 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="status">Estado (en l\u00ednea primero)</SelectItem>
            <SelectItem value="name">Nombre</SelectItem>
            <SelectItem value="trust">Trust Score</SelectItem>
            <SelectItem value="hours">Horas hoy</SelectItem>
            <SelectItem value="streak">Racha</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Team Stats Bar */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        {[
          { key: "online", label: "En l\u00ednea", dot: "bg-green-500", count: stats.online },
          { key: "deep_work", label: "Deep Work", dot: "bg-violet-500", count: stats.deep_work },
          { key: "in_meeting", label: "En reuni\u00f3n", dot: "bg-blue-500", count: stats.in_meeting },
          { key: "idle", label: "Inactivo", dot: "bg-yellow-500", count: stats.idle },
          { key: "offline", label: "Desconectado", dot: "bg-gray-400", count: stats.offline },
        ].map((item) => (
          <div
            key={item.key}
            className="bg-accent/40 rounded-xl p-2.5 text-center"
          >
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <span className={cn("w-2 h-2 rounded-full shrink-0", item.dot)} />
              <span className="text-[10px] text-muted-foreground truncate">
                {item.label}
              </span>
            </div>
            <p className="text-lg font-bold tabular-nums tracking-tight">
              {item.count}
            </p>
          </div>
        ))}
      </div>

      {/* Member Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Cargando...
          </p>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Users className="w-7 h-7 text-primary/40" />
          </div>
          <p className="text-sm text-muted-foreground">
            {searchQuery
              ? "No se encontraron miembros con ese filtro."
              : "No hay miembros en el equipo todav\u00eda."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSorted.map((m) => {
            const status = m.liveStatus?.status ?? "offline";
            const statusConfig = LIVE_STATUS_CONFIG[status];
            const hoursPercent = Math.min(
              Math.round((m.hoursToday / EXPECTED_DAILY_HOURS) * 100),
              100
            );
            const alreadyKudos = kudosSent.has(m.userId);

            return (
              <Card
                key={m.userId}
                className={cn(
                  "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
                  status === "offline" && "opacity-60",
                  status === "deep_work" &&
                    "border-violet-200 dark:border-violet-800"
                )}
              >
                <CardContent className="p-4">
                  {/* Top row: Avatar + Name + Status */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="relative">
                      <Avatar
                        className={cn(
                          "w-14 h-14 ring-[3px] shadow-sm",
                          statusRingColor(status)
                        )}
                      >
                        <AvatarImage
                          src={m.profile.avatar_url ?? undefined}
                        />
                        <AvatarFallback className="text-base">
                          {getInitials(m.profile.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-card",
                          statusConfig.dotColor
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold text-sm truncate">
                          {m.profile.full_name ?? m.profile.email}
                        </h3>
                        {/* Tier badge */}
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1.5 py-0 h-4 font-bold shrink-0",
                            tierColor(m.titleTier)
                          )}
                        >
                          {m.titleTier}
                        </Badge>
                      </div>
                      {m.profile.role && (
                        <p className="text-xs text-muted-foreground truncate">
                          {m.profile.role}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 truncate">
                        {m.profile.timezone}
                      </p>
                    </div>
                  </div>

                  {/* Status line */}
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          statusConfig.dotColor,
                          status !== "offline" && "animate-pulse"
                        )}
                      />
                      <span
                        className={cn(
                          "text-xs font-medium",
                          statusConfig.color
                        )}
                      >
                        {statusConfig.label}
                      </span>
                    </div>
                    {m.liveStatus?.current_task && status !== "offline" && (
                      <p className="text-[11px] mt-1 bg-muted/50 px-2 py-1 rounded truncate">
                        {m.liveStatus.current_task}
                      </p>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {/* Trust Score */}
                    <div
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-center",
                        trustBgColor(m.trustScore)
                      )}
                    >
                      <p
                        className={cn(
                          "text-base font-bold tabular-nums tracking-tight",
                          trustColor(m.trustScore)
                        )}
                      >
                        {m.trustScore}
                      </p>
                      <p className="text-[9px] text-muted-foreground">Trust</p>
                    </div>

                    {/* Streak */}
                    <div className="bg-accent/40 rounded-lg px-2 py-1.5 text-center">
                      <p className="text-base font-bold tabular-nums tracking-tight flex items-center justify-center gap-0.5">
                        {m.streak > 0 && (
                          <Flame className="w-3.5 h-3.5 text-orange-500" />
                        )}
                        {m.streak}
                      </p>
                      <p className="text-[9px] text-muted-foreground">Racha</p>
                    </div>

                    {/* Proof rate today */}
                    <div className="bg-accent/40 rounded-lg px-2 py-1.5 text-center">
                      <p className="text-base font-bold tabular-nums tracking-tight flex items-center justify-center gap-0.5">
                        <Shield className="w-3.5 h-3.5 text-green-500" />
                        {m.proofRateToday}%
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        Evidencia
                      </p>
                    </div>
                  </div>

                  {/* Hours today progress bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Horas hoy
                      </span>
                      <span className="text-xs font-semibold tabular-nums tracking-tight">
                        {m.hoursToday}/{EXPECTED_DAILY_HOURS}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          hoursPercent >= 100
                            ? "bg-green-500"
                            : hoursPercent >= 50
                              ? "bg-blue-500"
                              : hoursPercent > 0
                                ? "bg-yellow-500"
                                : "bg-gray-300 dark:bg-gray-600"
                        )}
                        style={{ width: `${hoursPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Last activity */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-3">
                    <span>
                      {m.lastActivity
                        ? `\u00daltima actividad: Hace ${timeAgo(m.lastActivity)}`
                        : "Sin actividad hoy"}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-xl text-xs h-8"
                      render={<Link href={`/member/${m.userId}`} />}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Ver perfil
                    </Button>
                    <Button
                      variant={alreadyKudos ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "rounded-xl text-xs h-8 px-3",
                        alreadyKudos &&
                          "bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0"
                      )}
                      onClick={() => handleKudos(m.userId)}
                      disabled={alreadyKudos}
                    >
                      <Heart
                        className={cn(
                          "w-3.5 h-3.5",
                          alreadyKudos && "fill-white"
                        )}
                      />
                      {alreadyKudos ? "Enviado" : "Kudos"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
