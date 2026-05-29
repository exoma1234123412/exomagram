"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  TimeEntry,
  LiveStatus,
  AccountabilityFlag,
  DailyCloseout,
  TrustScoreHistory,
  ActivityStreak,
  Standup,
} from "@/lib/types/database";
import { cn, getTodayMTY, timeAgo } from "@/lib/utils";
import { FLAG_TYPES } from "@/lib/constants";
import { format, subDays, differenceInMinutes, differenceInHours, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Bell,
  AlertTriangle,
  AlertOctagon,
  Info,
  Shield,
  Clock,
  User,
  Eye,
  CheckCircle2,
  Filter,
  ChevronDown,
  ExternalLink,
  X,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ============================================================
// Types
// ============================================================

type AlertSeverity = "critical" | "high" | "medium" | "low" | "info";
type AlertType = "flags" | "entries" | "scores" | "team" | "streaks" | "status";

interface AlertItem {
  id: string;
  severity: AlertSeverity;
  type: AlertType;
  message: string;
  userId: string | null;
  userName: string;
  timestamp: string;
  icon: typeof AlertTriangle;
  seen: boolean;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEVERITY_CONFIG: Record<AlertSeverity, { label: string; border: string; bg: string; text: string; badge: string }> = {
  critical: {
    label: "CRITICAL",
    border: "border-2 border-red-500/50",
    bg: "bg-red-500/5",
    text: "text-red-500",
    badge: "bg-red-500 text-white",
  },
  high: {
    label: "HIGH",
    border: "border border-red-500/30",
    bg: "bg-red-500/3",
    text: "text-red-400",
    badge: "bg-red-500/80 text-white",
  },
  medium: {
    label: "MEDIUM",
    border: "border border-amber-500/30",
    bg: "bg-amber-500/3",
    text: "text-amber-400",
    badge: "bg-amber-500/80 text-white",
  },
  low: {
    label: "LOW",
    border: "border border-yellow-500/20",
    bg: "",
    text: "text-yellow-400",
    badge: "bg-yellow-500/80 text-black",
  },
  info: {
    label: "INFO",
    border: "border border-border",
    bg: "",
    text: "text-muted-foreground",
    badge: "bg-muted text-muted-foreground",
  },
};

type DateRange = "today" | "3days" | "7days";

// ============================================================
// Helpers
// ============================================================

function getNowMTY(): Date {
  const str = new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" });
  return new Date(str);
}

function getSeenAlerts(): Set<string> {
  try {
    const stored = localStorage.getItem("exomagram_alerts_seen");
    if (stored) return new Set(JSON.parse(stored));
  } catch {}
  return new Set();
}

function markAlertSeen(id: string) {
  try {
    const seen = getSeenAlerts();
    seen.add(id);
    localStorage.setItem("exomagram_alerts_seen", JSON.stringify([...seen]));
  } catch {}
}

// ============================================================
// Main Page
// ============================================================

export default function AlertsPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [seenAlerts, setSeenAlerts] = useState<Set<string>>(new Set());

  // Filters
  const [severityFilter, setSeverityFilter] = useState<Set<AlertSeverity>>(
    new Set(["critical", "high", "medium", "low", "info"])
  );
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<Set<AlertType>>(
    new Set(["flags", "entries", "scores", "team", "streaks", "status"])
  );
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [showFilters, setShowFilters] = useState(false);

  // Load seen alerts from localStorage
  useEffect(() => {
    setSeenAlerts(getSeenAlerts());
  }, []);

  const loadAlerts = useCallback(async () => {
    if (!orgId) return;

    const today = getTodayMTY();
    const now = getNowMTY();
    const currentHour = now.getHours();
    const yesterday = format(subDays(parseISO(today + "T12:00:00"), 1), "yyyy-MM-dd");
    const sevenDaysAgo = format(subDays(parseISO(today + "T12:00:00"), 7), "yyyy-MM-dd");
    const threeDaysAgo = format(subDays(parseISO(today + "T12:00:00"), 3), "yyyy-MM-dd");

    // Date range for queries
    const rangeStart = dateRange === "today" ? today : dateRange === "3days" ? threeDaysAgo : sevenDaysAgo;

    // Fetch all data in parallel
    const [
      profilesRes,
      flagsRes,
      todayEntriesRes,
      closeoutsRes,
      standupsRes,
      trustHistoryRes,
      liveStatusRes,
      streaksRes,
    ] = await Promise.all([
      // Profiles
      supabase
        .from("org_members")
        .select("user_id, profiles!inner(id, full_name, email, avatar_url)")
        .eq("org_id", orgId),
      // Flags (last 7 days, unresolved)
      supabase
        .from("accountability_flags")
        .select("*")
        .eq("org_id", orgId)
        .eq("resolved", false)
        .gte("date", sevenDaysAgo)
        .order("created_at", { ascending: false }),
      // Time entries for range
      supabase
        .from("time_entries")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", rangeStart)
        .lte("date", today)
        .is("deleted_at", null)
        .order("logged_at", { ascending: false }),
      // Closeouts yesterday
      supabase
        .from("daily_closeouts")
        .select("*")
        .eq("org_id", orgId)
        .eq("date", yesterday),
      // Standups today
      supabase
        .from("standups")
        .select("*")
        .eq("org_id", orgId)
        .eq("date", today),
      // Trust score history (last 7 days)
      supabase
        .from("trust_score_history")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", sevenDaysAgo)
        .order("date", { ascending: true }),
      // Live status
      supabase
        .from("live_status")
        .select("*")
        .eq("org_id", orgId),
      // Activity streaks
      supabase
        .from("activity_streaks")
        .select("*")
        .eq("org_id", orgId),
    ]);

    // Build profiles map
    type ProfileRow = { user_id: string; profiles: Profile };
    const members = (profilesRes.data as unknown as ProfileRow[]) || [];
    const profileMap = new Map<string, Profile>();
    const profilesList: Profile[] = [];
    for (const m of members) {
      if (m.profiles) {
        profileMap.set(m.user_id, m.profiles);
        profilesList.push(m.profiles);
      }
    }
    setProfiles(profilesList);

    const getName = (uid: string) => profileMap.get(uid)?.full_name || profileMap.get(uid)?.email || "Desconocido";

    const allAlerts: AlertItem[] = [];
    let alertCounter = 0;
    const makeId = () => `alert-${++alertCounter}`;

    // ============================================================
    // 1. ACCOUNTABILITY FLAGS (unresolved, last 7 days)
    // ============================================================
    const flags = (flagsRes.data as AccountabilityFlag[]) || [];
    for (const flag of flags) {
      const flagConfig = FLAG_TYPES[flag.flag_type];
      const severityMap: Record<string, AlertSeverity> = { high: "high", medium: "medium", low: "low" };
      const severity = severityMap[flagConfig?.severity || "medium"] || "medium";
      allAlerts.push({
        id: `flag-${flag.id}`,
        severity,
        type: "flags",
        message: `FLAG: ${getName(flag.user_id)} -- ${flagConfig?.label || flag.flag_type} -- ${flag.details || "Sin detalles"}`,
        userId: flag.user_id,
        userName: getName(flag.user_id),
        timestamp: flag.created_at,
        icon: AlertTriangle,
        seen: false,
      });
    }

    // ============================================================
    // 2. TIME ENTRIES analysis (today)
    // ============================================================
    const todayEntries = ((todayEntriesRes.data as TimeEntry[]) || []).filter(e => e.date === today);
    const entriesByUser = new Map<string, TimeEntry[]>();
    for (const entry of todayEntries) {
      const existing = entriesByUser.get(entry.user_id) || [];
      existing.push(entry);
      entriesByUser.set(entry.user_id, existing);
    }

    for (const [uid, profile] of profileMap.entries()) {
      const userEntries = entriesByUser.get(uid) || [];
      const name = getName(uid);

      // No entries by 11am
      if (userEntries.length === 0 && currentHour >= 11) {
        allAlerts.push({
          id: makeId(),
          severity: "critical",
          type: "entries",
          message: `${name} no ha registrado nada -- son las ${currentHour}:${String(now.getMinutes()).padStart(2, "0")}`,
          userId: uid,
          userName: name,
          timestamp: now.toISOString(),
          icon: AlertOctagon,
          seen: false,
        });
      }

      // All entries without proof
      if (userEntries.length > 0) {
        const withoutProof = userEntries.filter(
          (e) => !e.proof_urls || e.proof_urls.length === 0
        );
        if (withoutProof.length === userEntries.length) {
          allAlerts.push({
            id: makeId(),
            severity: "high",
            type: "entries",
            message: `${name} lleva ${userEntries.length} entradas sin evidencia`,
            userId: uid,
            userName: name,
            timestamp: now.toISOString(),
            icon: Shield,
            seen: false,
          });
        }
      }

      // Possible backfilling: 3+ entries within 5 minutes
      if (userEntries.length >= 3) {
        const sorted = [...userEntries].sort(
          (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
        );
        for (let i = 0; i <= sorted.length - 3; i++) {
          const diffMin = differenceInMinutes(
            new Date(sorted[i + 2].logged_at),
            new Date(sorted[i].logged_at)
          );
          if (diffMin <= 5) {
            allAlerts.push({
              id: makeId(),
              severity: "high",
              type: "entries",
              message: `${name} posible backfilling -- ${Math.min(sorted.length, i + 3)} entradas en ${diffMin} min`,
              userId: uid,
              userName: name,
              timestamp: sorted[i].logged_at,
              icon: Clock,
              seen: false,
            });
            break; // one alert per user
          }
        }
      }

      // Entry flagged by Claude
      const flaggedEntries = userEntries.filter(
        (e) => e.verification_status === "flagged"
      );
      for (const fe of flaggedEntries) {
        allAlerts.push({
          id: `flagged-entry-${fe.id}`,
          severity: "medium",
          type: "entries",
          message: `${name} entrada rechazada por Claude: "${fe.title}"`,
          userId: uid,
          userName: name,
          timestamp: fe.logged_at,
          icon: AlertTriangle,
          seen: false,
        });
      }
    }

    // ============================================================
    // 3. DAILY CLOSEOUTS (yesterday)
    // ============================================================
    const closeouts = (closeoutsRes.data as DailyCloseout[]) || [];
    const closeoutUserIds = new Set(closeouts.map((c) => c.user_id));
    for (const [uid] of profileMap.entries()) {
      if (!closeoutUserIds.has(uid)) {
        allAlerts.push({
          id: makeId(),
          severity: "medium",
          type: "entries",
          message: `${getName(uid)} no hizo closeout ayer`,
          userId: uid,
          userName: getName(uid),
          timestamp: yesterday + "T23:59:00Z",
          icon: AlertTriangle,
          seen: false,
        });
      }
    }

    // ============================================================
    // 4. STANDUPS (today)
    // ============================================================
    const standups = (standupsRes.data as Standup[]) || [];
    const standupUserIds = new Set(standups.map((s) => s.user_id));
    if (currentHour >= 10) {
      for (const [uid] of profileMap.entries()) {
        if (!standupUserIds.has(uid)) {
          allAlerts.push({
            id: makeId(),
            severity: "medium",
            type: "entries",
            message: `${getName(uid)} sin standup`,
            userId: uid,
            userName: getName(uid),
            timestamp: today + "T10:00:00Z",
            icon: AlertTriangle,
            seen: false,
          });
        }
      }
    }

    // ============================================================
    // 5. TRUST SCORE HISTORY
    // ============================================================
    const trustHistory = (trustHistoryRes.data as TrustScoreHistory[]) || [];
    const trustByUser = new Map<string, TrustScoreHistory[]>();
    for (const th of trustHistory) {
      const existing = trustByUser.get(th.user_id) || [];
      existing.push(th);
      trustByUser.set(th.user_id, existing);
    }

    for (const [uid, history] of trustByUser.entries()) {
      const sorted = [...history].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const latest = sorted[sorted.length - 1];
      const earliest = sorted[0];

      // Trust score drop of 10+ points in 7 days
      if (sorted.length >= 2 && earliest.score - latest.score >= 10) {
        allAlerts.push({
          id: `trust-drop-${uid}`,
          severity: "high",
          type: "scores",
          message: `${getName(uid)} Trust Score cayo de ${earliest.score} a ${latest.score} en 7 dias`,
          userId: uid,
          userName: getName(uid),
          timestamp: latest.created_at,
          icon: Shield,
          seen: false,
        });
      }

      // Trust score below 50
      if (latest && latest.score < 50) {
        allAlerts.push({
          id: `trust-critical-${uid}`,
          severity: "critical",
          type: "scores",
          message: `${getName(uid)} Trust Score en ${latest.score} -- zona critica`,
          userId: uid,
          userName: getName(uid),
          timestamp: latest.created_at,
          icon: AlertOctagon,
          seen: false,
        });
      }
    }

    // ============================================================
    // 6. LIVE STATUS — online but no entries for 3+ hours
    // ============================================================
    const liveStatuses = (liveStatusRes.data as LiveStatus[]) || [];
    for (const ls of liveStatuses) {
      if (ls.status === "online" || ls.status === "deep_work" || ls.status === "idle") {
        const userEntries = entriesByUser.get(ls.user_id) || [];
        const lastEntry = userEntries.length > 0
          ? userEntries.reduce((a, b) =>
              new Date(a.logged_at) > new Date(b.logged_at) ? a : b
            )
          : null;

        const hoursSinceLastEntry = lastEntry
          ? differenceInHours(now, new Date(lastEntry.logged_at))
          : differenceInHours(now, new Date(ls.started_at));

        if (hoursSinceLastEntry >= 3) {
          allAlerts.push({
            id: `online-idle-${ls.user_id}`,
            severity: "high",
            type: "status",
            message: `${getName(ls.user_id)} online sin registrar hace ${hoursSinceLastEntry} horas`,
            userId: ls.user_id,
            userName: getName(ls.user_id),
            timestamp: ls.last_heartbeat,
            icon: Eye,
            seen: false,
          });
        }
      }
    }

    // ============================================================
    // 7. ACTIVITY STREAKS — broken streak of 5+ days
    // ============================================================
    const streaks = (streaksRes.data as ActivityStreak[]) || [];
    for (const streak of streaks) {
      // If last_active_date is before yesterday and they had a streak of 5+
      if (
        streak.last_active_date &&
        streak.last_active_date < yesterday &&
        streak.current_streak === 0 &&
        streak.longest_streak >= 5
      ) {
        allAlerts.push({
          id: `streak-broken-${streak.user_id}`,
          severity: "medium",
          type: "streaks",
          message: `${getName(streak.user_id)} rompio racha de ${streak.longest_streak} dias`,
          userId: streak.user_id,
          userName: getName(streak.user_id),
          timestamp: (streak.last_active_date || today) + "T23:59:00Z",
          icon: AlertTriangle,
          seen: false,
        });
      }
    }

    // ============================================================
    // 8. TEAM METRICS
    // ============================================================
    if (currentHour >= 14) {
      const totalMembers = profileMap.size;
      if (totalMembers > 0) {
        let totalHoursTeam = 0;
        for (const [, entries] of entriesByUser.entries()) {
          totalHoursTeam += entries.length;
        }
        const avgHours = totalHoursTeam / totalMembers;

        if (avgHours < 5) {
          allAlerts.push({
            id: `team-low-hours-${today}`,
            severity: "critical",
            type: "team",
            message: `Equipo promediando solo ${avgHours.toFixed(1)} hrs -- dia malo`,
            userId: null,
            userName: "EQUIPO",
            timestamp: now.toISOString(),
            icon: AlertOctagon,
            seen: false,
          });
        }

        // Team proof rate
        const allTodayEntries = todayEntries;
        if (allTodayEntries.length > 0) {
          const withProof = allTodayEntries.filter(
            (e) => e.proof_urls && e.proof_urls.length > 0
          ).length;
          const proofRate = Math.round((withProof / allTodayEntries.length) * 100);
          if (proofRate < 40) {
            allAlerts.push({
              id: `team-low-proof-${today}`,
              severity: "high",
              type: "team",
              message: `Evidencia del equipo en ${proofRate}% -- inaceptable`,
              userId: null,
              userName: "EQUIPO",
              timestamp: now.toISOString(),
              icon: Shield,
              seen: false,
            });
          }
        }
      }
    }

    // Mark seen status
    const currentSeen = getSeenAlerts();
    for (const alert of allAlerts) {
      alert.seen = currentSeen.has(alert.id);
    }

    // Sort: severity first, then timestamp (newest first)
    allAlerts.sort((a, b) => {
      const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    setAlerts(allAlerts);
    setLoading(false);
  }, [orgId, supabase, dateRange]);

  // Initial load
  useEffect(() => {
    if (orgLoading) return;
    loadAlerts();
  }, [orgLoading, loadAlerts]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    if (!orgId) return;
    const interval = setInterval(loadAlerts, 120_000);
    return () => clearInterval(interval);
  }, [orgId, loadAlerts]);

  // Real-time subscriptions
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("alerts-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "time_entries", filter: `org_id=eq.${orgId}` },
        () => loadAlerts()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "accountability_flags", filter: `org_id=eq.${orgId}` },
        () => loadAlerts()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_status", filter: `org_id=eq.${orgId}` },
        () => loadAlerts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, supabase, loadAlerts]);

  // Filtered alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (!severityFilter.has(a.severity)) return false;
      if (!typeFilter.has(a.type)) return false;
      if (personFilter && a.userId !== personFilter) return false;
      return true;
    });
  }, [alerts, severityFilter, personFilter, typeFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredAlerts.length;
    const critical = filteredAlerts.filter((a) => a.severity === "critical").length;
    const unresolvedFlags = alerts.filter((a) => a.type === "flags").length;

    // Person with most alerts
    const personCounts = new Map<string, number>();
    for (const a of filteredAlerts) {
      if (a.userName && a.userName !== "EQUIPO") {
        personCounts.set(a.userName, (personCounts.get(a.userName) || 0) + 1);
      }
    }
    let mostAlertsPerson = "--";
    let mostAlertsCount = 0;
    for (const [name, count] of personCounts.entries()) {
      if (count > mostAlertsCount) {
        mostAlertsPerson = name;
        mostAlertsCount = count;
      }
    }

    return { total, critical, unresolvedFlags, mostAlertsPerson, mostAlertsCount };
  }, [filteredAlerts, alerts]);

  function handleMarkSeen(alertId: string) {
    markAlertSeen(alertId);
    setSeenAlerts((prev) => new Set([...prev, alertId]));
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, seen: true } : a))
    );
  }

  function toggleSeverity(sev: AlertSeverity) {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  }

  function toggleType(t: AlertType) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  // Loading state
  if (loading || orgLoading) {
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
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground font-mono text-xs">Sin organizacion</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
              Centro de Alertas
            </h1>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              Feed critico -- todas las fuentes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs gap-1.5"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-3 h-3" />
            Filtros
            <ChevronDown className={cn("w-3 h-3 transition-transform", showFilters && "rotate-180")} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs"
            onClick={() => loadAlerts()}
          >
            Actualizar
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px mb-8 border border-border">
        <div className="bg-accent/30 p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Total alertas
          </div>
          <div className="font-mono text-2xl font-bold tabular-nums tracking-tight mt-1">
            {stats.total}
          </div>
        </div>
        <div className="bg-accent/30 p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-400">
            Criticas
          </div>
          <div className="font-mono text-2xl font-bold tabular-nums tracking-tight mt-1 text-red-500">
            {stats.critical}
          </div>
        </div>
        <div className="bg-accent/30 p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Flags sin resolver
          </div>
          <div className="font-mono text-2xl font-bold tabular-nums tracking-tight mt-1">
            {stats.unresolvedFlags}
          </div>
        </div>
        <div className="bg-accent/30 p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Mas alertas
          </div>
          <div className="font-mono text-sm font-bold tracking-tight mt-1 truncate">
            {stats.mostAlertsPerson}
            {stats.mostAlertsCount > 0 && (
              <span className="text-muted-foreground ml-1">({stats.mostAlertsCount})</span>
            )}
          </div>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="border border-border p-4 mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Filtros activos
            </span>
            <button
              onClick={() => setShowFilters(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Severity */}
          <div>
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-2">
              Severidad
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SEVERITY_CONFIG) as AlertSeverity[]).map((sev) => (
                <button
                  key={sev}
                  onClick={() => toggleSeverity(sev)}
                  className={cn(
                    "font-mono text-[10px] px-2.5 py-1 border transition-colors",
                    severityFilter.has(sev)
                      ? `${SEVERITY_CONFIG[sev].badge}`
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  {SEVERITY_CONFIG[sev].label}
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          <div>
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-2">
              Tipo
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { key: "flags" as AlertType, label: "Flags" },
                  { key: "entries" as AlertType, label: "Entradas" },
                  { key: "scores" as AlertType, label: "Scores" },
                  { key: "team" as AlertType, label: "Equipo" },
                  { key: "streaks" as AlertType, label: "Rachas" },
                  { key: "status" as AlertType, label: "Status" },
                ]
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => toggleType(t.key)}
                  className={cn(
                    "font-mono text-[10px] px-2.5 py-1 border transition-colors",
                    typeFilter.has(t.key)
                      ? "bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Person */}
          <div>
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-2">
              Persona
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setPersonFilter(null)}
                className={cn(
                  "font-mono text-[10px] px-2.5 py-1 border transition-colors",
                  personFilter === null
                    ? "bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                )}
              >
                Todos
              </button>
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPersonFilter(p.id === personFilter ? null : p.id)}
                  className={cn(
                    "font-mono text-[10px] px-2.5 py-1 border transition-colors",
                    personFilter === p.id
                      ? "bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  {p.full_name || p.email}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-2">
              Rango
            </span>
            <div className="flex gap-1.5">
              {(
                [
                  { key: "today" as DateRange, label: "Hoy" },
                  { key: "3days" as DateRange, label: "3 dias" },
                  { key: "7days" as DateRange, label: "7 dias" },
                ]
              ).map((r) => (
                <button
                  key={r.key}
                  onClick={() => setDateRange(r.key)}
                  className={cn(
                    "font-mono text-[10px] px-2.5 py-1 border transition-colors",
                    dateRange === r.key
                      ? "bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Severity summary bar */}
      <div className="flex items-center gap-3 mb-6">
        {(Object.keys(SEVERITY_CONFIG) as AlertSeverity[]).map((sev) => {
          const count = filteredAlerts.filter((a) => a.severity === sev).length;
          if (count === 0) return null;
          return (
            <div key={sev} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "w-2 h-2",
                  sev === "critical" && "bg-red-500 animate-pulse",
                  sev === "high" && "bg-red-400",
                  sev === "medium" && "bg-amber-400",
                  sev === "low" && "bg-yellow-400",
                  sev === "info" && "bg-muted-foreground"
                )}
              />
              <span className="font-mono text-[10px] text-muted-foreground">
                {count} {SEVERITY_CONFIG[sev].label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Alert feed */}
      {filteredAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
            <Bell className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-mono text-xs text-muted-foreground">Sin alertas activas</p>
          <p className="font-mono text-[10px] text-muted-foreground mt-1">
            Todo en orden -- por ahora
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredAlerts.map((alert) => {
            const config = SEVERITY_CONFIG[alert.severity];
            const Icon = alert.icon;

            return (
              <div
                key={alert.id}
                className={cn(
                  "p-3 transition-colors duration-200",
                  config.border,
                  config.bg,
                  alert.severity === "critical" && "animate-pulse",
                  alert.seen && "opacity-50"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Severity badge + icon */}
                  <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                    <Icon className={cn("w-3.5 h-3.5", config.text)} />
                    <span
                      className={cn(
                        "font-mono text-[8px] font-bold px-1.5 py-0.5 tracking-wider",
                        config.badge
                      )}
                    >
                      {config.label}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-mono leading-relaxed break-words">
                      {alert.message}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {timeAgo(alert.timestamp)}
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {alert.type.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {alert.userId && (
                      <Link
                        href={`/deep-profile/${alert.userId}`}
                        className="font-mono text-[9px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 border border-border hover:border-foreground/30 flex items-center gap-1"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        Ver perfil
                      </Link>
                    )}
                    {!alert.seen && (
                      <button
                        onClick={() => handleMarkSeen(alert.id)}
                        className="font-mono text-[9px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 border border-border hover:border-foreground/30 flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Visto
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer info */}
      <div className="mt-8 pt-4 border-t border-border">
        <p className="font-mono text-[9px] text-muted-foreground text-center tracking-wide">
          Auto-refresh cada 2 min -- Suscripciones en tiempo real activas --{" "}
          {format(getNowMTY(), "HH:mm:ss")} CST
        </p>
      </div>
    </div>
  );
}
