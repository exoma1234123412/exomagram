"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/constants";
import type { Profile, WorkCategory } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertTriangle,
  Clock,
  Eye,
  EyeOff,
  FileX,
  Ghost,
  MessageSquareOff,
  ShieldOff,
  Skull,
  Users,
  TrendingDown,
  TrendingUp,
  Minus,
  Trophy,
  Flag,
  type LucideIcon,
} from "lucide-react";
import { format, startOfWeek, subWeeks, subDays } from "date-fns";

/* ------------------------------------------------------------------ */
/* Tab definitions                                                     */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: "overview", label: "Vista General" },
  { id: "breakdown", label: "Desglose" },
  { id: "weekly", label: "Semanal" },
  { id: "ghosts", label: "Fantasmas" },
  { id: "hall", label: "Salón" },
  { id: "brutal", label: "Verdad Brutal" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface MemberShame {
  userId: string;
  profile: Profile | null;
  hoursLogged: number;
  hoursWithProof: number;
  lastEntryAt: string | null;
  hasCloseout: boolean;
  hasStandup: boolean;
  shameTag: string;
  shameLevel: "ghost" | "slacker" | "behind" | "on_track" | "machine";
  lateEntries: number;
  categoryBreakdown: Record<string, number>;
}

interface WeeklyMemberData {
  userId: string;
  profile: Profile | null;
  totalHours: number;
  avgDaily: number;
  rank: number;
  prevRank: number | null;
}

interface HallEntry {
  userId: string;
  profile: Profile | null;
  avgTrust: number;
  totalFlags: number;
  totalMissedHours: number;
}

interface BrutalTruth {
  text: string;
  severity: "incómodo" | "doloroso" | "devastador";
  revealed: boolean;
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

function classifyMember(hours: number): {
  tag: string;
  level: MemberShame["shameLevel"];
} {
  if (hours === 0) return { tag: "FANTASMA", level: "ghost" };
  if (hours < 3) return { tag: "VAGO", level: "slacker" };
  if (hours < 5) return { tag: "ATRASADO", level: "behind" };
  if (hours < 8) return { tag: "EN CAMINO", level: "on_track" };
  return { tag: "MÁQUINA", level: "machine" };
}

function levelColor(level: MemberShame["shameLevel"]): string {
  switch (level) {
    case "ghost": return "text-red-500";
    case "slacker": return "text-orange-500";
    case "behind": return "text-amber-500";
    case "on_track": return "text-primary";
    case "machine": return "text-green-500";
  }
}

function levelBorder(level: MemberShame["shameLevel"]): string {
  switch (level) {
    case "ghost": return "border-red-500/60";
    case "slacker": return "border-orange-500/40";
    case "behind": return "border-amber-500/40";
    case "on_track": return "border-primary/30";
    case "machine": return "border-green-500/30";
  }
}

function levelBg(level: MemberShame["shameLevel"]): string {
  switch (level) {
    case "ghost": return "bg-red-500/5";
    case "slacker": return "bg-orange-500/5";
    case "behind": return "";
    case "on_track": return "";
    case "machine": return "bg-green-500/5";
  }
}

/* ------------------------------------------------------------------ */
/* Live ticking counter                                                */
/* ------------------------------------------------------------------ */

function LiveCounter({ since }: { since: string | null }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!since) {
      setElapsed("SIN REGISTROS");
      return;
    }

    function tick() {
      const diff = Math.max(0, Date.now() - new Date(since!).getTime());
      const totalSec = Math.floor(diff / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      setElapsed(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      );
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);

  return (
    <span className="font-mono tabular-nums tracking-tight">{elapsed}</span>
  );
}

/* ------------------------------------------------------------------ */
/* Typewriter effect for brutal truths                                 */
/* ------------------------------------------------------------------ */

function TypewriterText({ text, delay }: { text: string; delay: number }) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const startTimeout = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(startTimeout);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 25);
    return () => clearInterval(interval);
  }, [started, text]);

  if (!started) return <span className="text-muted-foreground/30">...</span>;

  return (
    <span>
      {displayed}
      {displayed.length < text.length && (
        <span className="animate-pulse">|</span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ShamePage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [members, setMembers] = useState<MemberShame[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Weekly tab state
  const [weeklyData, setWeeklyData] = useState<WeeklyMemberData[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  // Hall of shame state
  const [hallData, setHallData] = useState<HallEntry[]>([]);
  const [hallLoading, setHallLoading] = useState(false);

  // Brutal truth state
  const [brutalTruths, setBrutalTruths] = useState<BrutalTruth[]>([]);
  const [brutalLoading, setBrutalLoading] = useState(false);

  // Profile map for reuse across tabs
  const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());

  /* ---------- overview data loader ---------- */

  const loadOverviewData = useCallback(async () => {
    if (!orgId) return;

    const today = getTodayMTY();

    const { data: orgMembers } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    if (!orgMembers) {
      setLoading(false);
      return;
    }

    const pMap = new Map<string, Profile>();
    const userIds: string[] = [];
    for (const m of orgMembers) {
      userIds.push(m.user_id);
      if (m.profiles)
        pMap.set(m.user_id, m.profiles as unknown as Profile);
    }
    setProfileMap(pMap);

    const { data: entries } = await supabase
      .from("time_entries")
      .select("user_id, proof_urls, logged_at, category, is_late")
      .eq("org_id", orgId)
      .eq("date", today);

    const { data: closeouts } = await supabase
      .from("daily_closeouts")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("date", today);

    const { data: standups } = await supabase
      .from("standups")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("date", today);

    const closeoutSet = new Set(
      (closeouts ?? []).map((c) => c.user_id as string)
    );
    const standupSet = new Set(
      (standups ?? []).map((s) => s.user_id as string)
    );

    const entryMap = new Map<
      string,
      {
        count: number;
        withProof: number;
        lastAt: string | null;
        lateCount: number;
        categories: Record<string, number>;
      }
    >();

    for (const e of entries ?? []) {
      const uid = e.user_id as string;
      const cur = entryMap.get(uid) ?? {
        count: 0,
        withProof: 0,
        lastAt: null,
        lateCount: 0,
        categories: {},
      };
      cur.count++;
      if (e.proof_urls && (e.proof_urls as string[]).length > 0)
        cur.withProof++;
      if (e.is_late) cur.lateCount++;
      const cat = e.category as string;
      cur.categories[cat] = (cur.categories[cat] ?? 0) + 1;
      const loggedAt = e.logged_at as string;
      if (!cur.lastAt || loggedAt > cur.lastAt) cur.lastAt = loggedAt;
      entryMap.set(uid, cur);
    }

    const result: MemberShame[] = userIds.map((uid) => {
      const stats = entryMap.get(uid) ?? {
        count: 0,
        withProof: 0,
        lastAt: null,
        lateCount: 0,
        categories: {},
      };
      const classification = classifyMember(stats.count);
      return {
        userId: uid,
        profile: pMap.get(uid) ?? null,
        hoursLogged: stats.count,
        hoursWithProof: stats.withProof,
        lastEntryAt: stats.lastAt,
        hasCloseout: closeoutSet.has(uid),
        hasStandup: standupSet.has(uid),
        shameTag: classification.tag,
        shameLevel: classification.level,
        lateEntries: stats.lateCount,
        categoryBreakdown: stats.categories,
      };
    });

    result.sort((a, b) => {
      if (a.hoursLogged !== b.hoursLogged) return a.hoursLogged - b.hoursLogged;
      if (!a.lastEntryAt && b.lastEntryAt) return -1;
      if (a.lastEntryAt && !b.lastEntryAt) return 1;
      if (a.lastEntryAt && b.lastEntryAt)
        return a.lastEntryAt < b.lastEntryAt ? -1 : 1;
      return 0;
    });

    setMembers(result);
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- weekly data loader ---------- */

  const loadWeeklyData = useCallback(async () => {
    if (!orgId) return;
    setWeeklyLoading(true);

    const now = new Date();
    const thisMonday = startOfWeek(now, { weekStartsOn: 1 });
    const lastMonday = subWeeks(thisMonday, 1);
    const thisMondayStr = format(thisMonday, "yyyy-MM-dd");
    const lastMondayStr = format(lastMonday, "yyyy-MM-dd");
    const today = getTodayMTY();

    // This week entries
    const { data: thisWeekEntries } = await supabase
      .from("time_entries")
      .select("user_id")
      .eq("org_id", orgId)
      .gte("date", thisMondayStr)
      .lte("date", today);

    // Last week entries
    const { data: lastWeekEntries } = await supabase
      .from("time_entries")
      .select("user_id")
      .eq("org_id", orgId)
      .gte("date", lastMondayStr)
      .lt("date", thisMondayStr);

    // Count hours per user this week
    const thisWeekMap = new Map<string, number>();
    for (const e of thisWeekEntries ?? []) {
      const uid = e.user_id as string;
      thisWeekMap.set(uid, (thisWeekMap.get(uid) ?? 0) + 1);
    }

    // Count hours per user last week
    const lastWeekMap = new Map<string, number>();
    for (const e of lastWeekEntries ?? []) {
      const uid = e.user_id as string;
      lastWeekMap.set(uid, (lastWeekMap.get(uid) ?? 0) + 1);
    }

    // How many work days this week so far (Mon-Fri)
    const dayOfWeek = now.getDay(); // 0=Sun
    const workDaysSoFar = Math.max(1, dayOfWeek === 0 ? 5 : Math.min(dayOfWeek, 5));

    // Build rankings - use all known userIds from profileMap
    const allUsers = Array.from(profileMap.keys());

    const thisWeekRanked = allUsers
      .map((uid) => ({
        userId: uid,
        profile: profileMap.get(uid) ?? null,
        totalHours: thisWeekMap.get(uid) ?? 0,
        avgDaily: (thisWeekMap.get(uid) ?? 0) / workDaysSoFar,
        rank: 0,
        prevRank: null as number | null,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // Assign this week ranks
    thisWeekRanked.forEach((m, i) => {
      m.rank = i + 1;
    });

    // Compute last week ranks
    const lastWeekRanked = allUsers
      .map((uid) => ({
        userId: uid,
        hours: lastWeekMap.get(uid) ?? 0,
      }))
      .sort((a, b) => b.hours - a.hours);

    const lastWeekRankMap = new Map<string, number>();
    lastWeekRanked.forEach((m, i) => {
      lastWeekRankMap.set(m.userId, i + 1);
    });

    thisWeekRanked.forEach((m) => {
      m.prevRank = lastWeekRankMap.get(m.userId) ?? null;
    });

    setWeeklyData(thisWeekRanked);
    setWeeklyLoading(false);
  }, [orgId, profileMap]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- hall of shame data loader ---------- */

  const loadHallData = useCallback(async () => {
    if (!orgId) return;
    setHallLoading(true);

    const allUsers = Array.from(profileMap.keys());

    // Trust score history (last 30 days)
    const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
    const { data: trustHistory } = await supabase
      .from("trust_score_history")
      .select("user_id, score")
      .eq("org_id", orgId)
      .gte("date", thirtyDaysAgo);

    // Flags (all time unresolved)
    const { data: flags } = await supabase
      .from("accountability_flags")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("resolved", false);

    // Aggregate trust scores
    const trustMap = new Map<string, { total: number; count: number }>();
    for (const t of trustHistory ?? []) {
      const uid = t.user_id as string;
      const cur = trustMap.get(uid) ?? { total: 0, count: 0 };
      cur.total += (t.score as number) ?? 0;
      cur.count++;
      trustMap.set(uid, cur);
    }

    // Count flags per user
    const flagMap = new Map<string, number>();
    for (const f of flags ?? []) {
      const uid = f.user_id as string;
      flagMap.set(uid, (flagMap.get(uid) ?? 0) + 1);
    }

    // Estimate missed hours from daily_aggregates or compute simple metric
    const hallEntries: HallEntry[] = allUsers.map((uid) => {
      const trust = trustMap.get(uid);
      const avgTrust = trust && trust.count > 0 ? trust.total / trust.count : 50;
      return {
        userId: uid,
        profile: profileMap.get(uid) ?? null,
        avgTrust: Math.round(avgTrust),
        totalFlags: flagMap.get(uid) ?? 0,
        totalMissedHours: 0, // Will compute from entries if needed
      };
    });

    // Sort by worst trust score
    hallEntries.sort((a, b) => a.avgTrust - b.avgTrust);

    setHallData(hallEntries);
    setHallLoading(false);
  }, [orgId, profileMap]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- brutal truth generator ---------- */

  const loadBrutalTruths = useCallback(async () => {
    if (!orgId || !userId) return;
    setBrutalLoading(true);

    const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

    const { data: myEntries } = await supabase
      .from("time_entries")
      .select("date, hour, category, proof_urls, is_late, logged_at, description")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .gte("date", thirtyDaysAgo)
      .order("date", { ascending: true });

    const { data: myCloseouts } = await supabase
      .from("daily_closeouts")
      .select("date")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .gte("date", thirtyDaysAgo);

    const { data: myStandups } = await supabase
      .from("standups")
      .select("date")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .gte("date", thirtyDaysAgo);

    const entries = myEntries ?? [];
    const closeoutDates = new Set((myCloseouts ?? []).map((c) => c.date as string));
    const standupDates = new Set((myStandups ?? []).map((s) => s.date as string));

    const truths: BrutalTruth[] = [];

    // 1. Total hours vs expected
    const uniqueDays = new Set(entries.map((e) => e.date as string));
    const totalDays = uniqueDays.size;
    const totalHours = entries.length;
    const expectedHours = totalDays * 8;
    if (totalHours < expectedHours * 0.7 && totalDays > 3) {
      const deficit = expectedHours - totalHours;
      truths.push({
        text: `En 30 días registraste ${totalHours}h de ${expectedHours}h esperadas. Te faltan ${deficit} horas. Eso es un ${Math.round((deficit / expectedHours) * 100)}% de tu tiempo laboral sin registrar.`,
        severity: deficit > expectedHours * 0.4 ? "devastador" : "doloroso",
        revealed: false,
      });
    }

    // 2. Late entries
    const lateCount = entries.filter((e) => e.is_late).length;
    const latePercent = entries.length > 0 ? Math.round((lateCount / entries.length) * 100) : 0;
    if (latePercent > 30) {
      truths.push({
        text: `${latePercent}% de tus entradas son tardías. No estás registrando en tiempo real — estás inventando recuerdos.`,
        severity: latePercent > 60 ? "devastador" : "doloroso",
        revealed: false,
      });
    }

    // 3. Proof rate
    const withProof = entries.filter(
      (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
    ).length;
    const proofRate =
      entries.length > 0 ? Math.round((withProof / entries.length) * 100) : 0;
    if (proofRate < 40 && entries.length > 5) {
      truths.push({
        text: `Solo ${proofRate}% de tus horas tienen evidencia. Sin pruebas, solo son palabras. Y las palabras no construyen confianza.`,
        severity: proofRate < 15 ? "devastador" : "doloroso",
        revealed: false,
      });
    }

    // 4. Category distribution — too many meetings or breaks
    const catCount: Record<string, number> = {};
    for (const e of entries) {
      const c = e.category as string;
      catCount[c] = (catCount[c] ?? 0) + 1;
    }
    const meetingPct = Math.round(
      ((catCount["meeting"] ?? 0) / Math.max(entries.length, 1)) * 100
    );
    if (meetingPct > 40) {
      truths.push({
        text: `${meetingPct}% de tu tiempo son reuniones. Pasas más tiempo hablando de trabajo que trabajando.`,
        severity: meetingPct > 55 ? "devastador" : "incómodo",
        revealed: false,
      });
    }

    const breakPct = Math.round(
      ((catCount["break"] ?? 0) / Math.max(entries.length, 1)) * 100
    );
    if (breakPct > 20) {
      truths.push({
        text: `${breakPct}% de tu jornada registrada son descansos. El resto del equipo trabaja mientras tú descansas.`,
        severity: "doloroso",
        revealed: false,
      });
    }

    // 5. Closeout compliance
    const closeoutRate =
      totalDays > 0
        ? Math.round((closeoutDates.size / totalDays) * 100)
        : 0;
    if (closeoutRate < 50 && totalDays > 5) {
      truths.push({
        text: `Solo hiciste cierre del día en ${closeoutRate}% de tus días activos. No reflexionas sobre lo que hiciste. Terminas el día y desapareces.`,
        severity: closeoutRate < 25 ? "devastador" : "incómodo",
        revealed: false,
      });
    }

    // 6. Standup compliance
    const standupRate =
      totalDays > 0
        ? Math.round((standupDates.size / totalDays) * 100)
        : 0;
    if (standupRate < 50 && totalDays > 5) {
      truths.push({
        text: `Standup en solo ${standupRate}% de los días. Tu equipo no sabe en qué trabajas. Eres invisible.`,
        severity: "incómodo",
        revealed: false,
      });
    }

    // 7. Deep work ratio
    const deepWorkPct = Math.round(
      ((catCount["deep_work"] ?? 0) / Math.max(entries.length, 1)) * 100
    );
    if (deepWorkPct < 20 && entries.length > 10) {
      truths.push({
        text: `Solo ${deepWorkPct}% de Deep Work en 30 días. Estás ocupado pero no productivo. La ocupación es el disfraz favorito de la mediocridad.`,
        severity: deepWorkPct < 10 ? "devastador" : "doloroso",
        revealed: false,
      });
    }

    // 8. Short descriptions (low detail)
    const shortDescs = entries.filter(
      (e) => !e.description || (e.description as string).length < 15
    ).length;
    const shortPct =
      entries.length > 0
        ? Math.round((shortDescs / entries.length) * 100)
        : 0;
    if (shortPct > 50 && entries.length > 10) {
      truths.push({
        text: `${shortPct}% de tus entradas no tienen descripción útil. Si no puedes explicar qué hiciste, tal vez no hiciste nada.`,
        severity: "incómodo",
        revealed: false,
      });
    }

    // Ensure at least one truth if data exists
    if (truths.length === 0 && entries.length > 0) {
      truths.push({
        text: `Registraste ${totalHours} horas en 30 días. Los datos no mienten — pero la ausencia de verdades brutales no significa que todo está bien. Significa que aún no tenemos suficientes datos para juzgarte.`,
        severity: "incómodo",
        revealed: false,
      });
    }

    // Cap at 8
    setBrutalTruths(truths.slice(0, 8));
    setBrutalLoading(false);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- initial load + 30s refresh ---------- */

  useEffect(() => {
    if (orgLoading || !orgId) {
      if (!orgLoading) setLoading(false);
      return;
    }

    loadOverviewData();

    intervalRef.current = setInterval(loadOverviewData, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [orgLoading, orgId, loadOverviewData]);

  /* ---------- real-time subscription ---------- */

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("shame-hub-entries")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadOverviewData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, loadOverviewData]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- load tab-specific data on tab change ---------- */

  useEffect(() => {
    if (!orgId || profileMap.size === 0) return;

    if (activeTab === "weekly" && weeklyData.length === 0) {
      loadWeeklyData();
    } else if (activeTab === "hall" && hallData.length === 0) {
      loadHallData();
    } else if (activeTab === "brutal" && brutalTruths.length === 0) {
      loadBrutalTruths();
    }
  }, [activeTab, orgId, profileMap]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- loading state ---------- */

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          CARGANDO...
        </p>
      </div>
    );
  }

  /* ---------- computed stats ---------- */

  const totalHours = members.reduce((s, m) => s + m.hoursLogged, 0);
  const teamAvg =
    members.length > 0 ? (totalHours / members.length).toFixed(1) : "0";
  const ghostCount = members.filter((m) => m.shameLevel === "ghost").length;
  const worst = members.length > 0 ? members[0] : null;

  /* ================================================================ */
  /* RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <AlertTriangle className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          SHAME CENTER
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Nadie se esconde. Nadie escapa.
      </p>

      {/* Team stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Horas equipo
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
            {totalHours}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Promedio
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
            {teamAvg}h
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Fantasmas
          </p>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
            ghostCount > 0 && "text-red-500"
          )}>
            {ghostCount}
          </p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/60">
            Eslabón más débil
          </p>
          <p className="text-sm font-mono font-bold tracking-tight mt-1 text-red-500 truncate">
            {worst?.profile?.full_name ?? "---"}
          </p>
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
      {activeTab === "overview" && (
        <OverviewTab members={members} userId={userId} />
      )}
      {activeTab === "breakdown" && (
        <BreakdownTab members={members} userId={userId} />
      )}
      {activeTab === "weekly" && (
        <WeeklyTab
          data={weeklyData}
          loading={weeklyLoading}
          userId={userId}
        />
      )}
      {activeTab === "ghosts" && (
        <GhostsTab members={members} userId={userId} />
      )}
      {activeTab === "hall" && (
        <HallTab data={hallData} loading={hallLoading} userId={userId} />
      )}
      {activeTab === "brutal" && (
        <BrutalTab
          truths={brutalTruths}
          loading={brutalLoading}
        />
      )}

      {/* Bottom message */}
      <div className="mt-10 text-center py-6 border-t border-border/30">
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/25">
          Todos ven. Todos saben. No hay donde esconderse.
        </p>
      </div>
    </div>
  );
}

/* ================================================================== */
/* TAB: OVERVIEW                                                       */
/* ================================================================== */

function OverviewTab({
  members,
  userId,
}: {
  members: MemberShame[];
  userId: string | null;
}) {
  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-16 h-16 border border-border flex items-center justify-center">
          <Ghost className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground font-mono">
          No hay miembros en la organización.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
        Ranking de hoy &mdash; peor primero
      </p>

      <div className="space-y-2">
        {members.map((m) => {
          const isMe = m.userId === userId;
          const ShameIcon =
            m.shameLevel === "ghost"
              ? Skull
              : m.shameLevel === "slacker"
                ? Ghost
                : m.shameLevel === "behind"
                  ? Clock
                  : Eye;

          return (
            <div
              key={m.userId}
              className={cn(
                "border p-4 transition-colors",
                levelBorder(m.shameLevel),
                levelBg(m.shameLevel)
              )}
            >
              <div className="flex items-start gap-3">
                <Avatar
                  className={cn(
                    "ring-1 ring-border shrink-0 w-9 h-9",
                    m.shameLevel === "ghost" && "ring-red-500/40 opacity-60",
                    m.shameLevel === "slacker" && "ring-orange-500/30"
                  )}
                >
                  <AvatarImage
                    src={m.profile?.avatar_url ?? undefined}
                  />
                  <AvatarFallback className="font-mono text-xs">
                    {getInitials(m.profile?.full_name ?? null)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className={cn(
                        "font-mono font-bold tracking-tight text-sm",
                        levelColor(m.shameLevel)
                      )}
                    >
                      {m.profile?.full_name ?? "Sin nombre"}
                    </p>
                    {isMe && (
                      <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
                        (tú)
                      </span>
                    )}
                    <span
                      className={cn(
                        "font-mono text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border",
                        levelColor(m.shameLevel),
                        levelBorder(m.shameLevel),
                        levelBg(m.shameLevel)
                      )}
                    >
                      {m.shameTag}
                    </span>
                  </div>

                  {/* Missing items */}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {!m.hasStandup && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-red-400/80">
                        <MessageSquareOff className="w-3 h-3" />
                        Sin standup
                      </span>
                    )}
                    {!m.hasCloseout && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-red-400/80">
                        <FileX className="w-3 h-3" />
                        Sin cierre
                      </span>
                    )}
                    {m.hoursLogged > 0 && m.hoursWithProof === 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-amber-500/80">
                        <ShieldOff className="w-3 h-3" />
                        Sin evidencia
                      </span>
                    )}
                    {m.hoursLogged > 0 &&
                      m.hoursWithProof > 0 &&
                      m.hoursWithProof < m.hoursLogged && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-amber-500/80">
                          <EyeOff className="w-3 h-3" />
                          {m.hoursWithProof}/{m.hoursLogged} con prueba
                        </span>
                      )}
                  </div>
                </div>

                {/* Hours */}
                <div className="text-right shrink-0">
                  <p
                    className={cn(
                      "font-mono font-black tabular-nums tracking-tight text-2xl",
                      levelColor(m.shameLevel)
                    )}
                  >
                    {m.hoursLogged}
                  </p>
                  <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                    {m.hoursLogged === 1 ? "hora" : "horas"}
                  </p>
                </div>
              </div>

              {/* Time since last entry */}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShameIcon
                    className={cn("w-3.5 h-3.5", levelColor(m.shameLevel))}
                  />
                  <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                    Desde último registro
                  </p>
                </div>
                <div className={cn("text-sm", levelColor(m.shameLevel))}>
                  <LiveCounter since={m.lastEntryAt} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/* TAB: BREAKDOWN                                                      */
/* ================================================================== */

function BreakdownTab({
  members,
  userId,
}: {
  members: MemberShame[];
  userId: string | null;
}) {
  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-16 h-16 border border-border flex items-center justify-center">
          <Ghost className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground font-mono">
          Sin datos para desglose.
        </p>
      </div>
    );
  }

  // Sort by hours (most first for breakdown)
  const sorted = [...members].sort((a, b) => b.hoursLogged - a.hoursLogged);

  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4">
        Desglose por categoría &mdash; distribución de hoy
      </p>

      <div className="space-y-4">
        {sorted.map((m) => {
          const isMe = m.userId === userId;
          const proofRate =
            m.hoursLogged > 0
              ? Math.round((m.hoursWithProof / m.hoursLogged) * 100)
              : 0;
          const lateRate =
            m.hoursLogged > 0
              ? Math.round((m.lateEntries / m.hoursLogged) * 100)
              : 0;

          return (
            <div
              key={m.userId}
              className="border border-border p-4"
            >
              {/* Name row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6 ring-1 ring-border">
                    <AvatarImage
                      src={m.profile?.avatar_url ?? undefined}
                    />
                    <AvatarFallback className="font-mono text-[9px]">
                      {getInitials(m.profile?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-mono font-bold text-xs tracking-tight">
                    {m.profile?.full_name ?? "Sin nombre"}
                  </span>
                  {isMe && (
                    <span className="font-mono text-[9px] text-muted-foreground tracking-widest">
                      (tú)
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "font-mono font-bold tabular-nums text-sm",
                    levelColor(m.shameLevel)
                  )}
                >
                  {m.hoursLogged}h
                </span>
              </div>

              {/* Category bar chart */}
              {m.hoursLogged > 0 ? (
                <div className="space-y-1.5">
                  {Object.entries(m.categoryBreakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat, count]) => {
                      const pct = Math.round(
                        (count / m.hoursLogged) * 100
                      );
                      const catConfig =
                        CATEGORIES[cat as WorkCategory];
                      const barColor =
                        CATEGORY_COLORS[cat] ?? "bg-slate-400";

                      return (
                        <div key={cat} className="flex items-center gap-2">
                          <span className="font-mono text-[9px] w-16 text-muted-foreground truncate">
                            {catConfig?.label ?? cat}
                          </span>
                          <div className="flex-1 h-3 bg-accent/30 border border-border overflow-hidden">
                            <div
                              className={cn("h-full", barColor)}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[9px] tabular-nums w-8 text-right text-muted-foreground">
                            {count}h
                          </span>
                          <span className="font-mono text-[9px] tabular-nums w-10 text-right text-muted-foreground">
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="font-mono text-[10px] text-red-500/60">
                  0 horas registradas
                </p>
              )}

              {/* Stats row */}
              <div className="flex gap-4 mt-3 pt-2 border-t border-border/50">
                <span
                  className={cn(
                    "font-mono text-[9px]",
                    proofRate >= 80
                      ? "text-green-500"
                      : proofRate >= 40
                        ? "text-amber-500"
                        : "text-red-500"
                  )}
                >
                  Evidencia: {proofRate}%
                </span>
                <span
                  className={cn(
                    "font-mono text-[9px]",
                    lateRate <= 10
                      ? "text-green-500"
                      : lateRate <= 30
                        ? "text-amber-500"
                        : "text-red-500"
                  )}
                >
                  Tardías: {lateRate}%
                </span>
                <span
                  className={cn(
                    "font-mono text-[9px]",
                    m.hasCloseout
                      ? "text-green-500"
                      : "text-red-500"
                  )}
                >
                  Cierre: {m.hasCloseout ? "SÍ" : "NO"}
                </span>
                <span
                  className={cn(
                    "font-mono text-[9px]",
                    m.hasStandup
                      ? "text-green-500"
                      : "text-red-500"
                  )}
                >
                  Standup: {m.hasStandup ? "SÍ" : "NO"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/* TAB: WEEKLY                                                         */
/* ================================================================== */

function WeeklyTab({
  data,
  loading,
  userId,
}: {
  data: WeeklyMemberData[];
  loading: boolean;
  userId: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="border border-border p-4 animate-pulse"
          >
            <div className="h-4 bg-accent/50 w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-16 h-16 border border-border flex items-center justify-center">
          <Ghost className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground font-mono">
          Sin datos semanales.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4">
        Ranking semanal &mdash; acumulado lunes a hoy
      </p>

      {/* Table header */}
      <div className="grid grid-cols-[auto_1fr_80px_80px_60px] gap-2 px-3 py-2 border-b border-border mb-1">
        <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground w-8">
          #
        </span>
        <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
          Miembro
        </span>
        <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground text-right">
          Total
        </span>
        <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground text-right">
          Prom/día
        </span>
        <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground text-right">
          Mov.
        </span>
      </div>

      <div className="space-y-1">
        {data.map((m) => {
          const isMe = m.userId === userId;
          const movement =
            m.prevRank !== null ? m.prevRank - m.rank : 0;

          return (
            <div
              key={m.userId}
              className={cn(
                "grid grid-cols-[auto_1fr_80px_80px_60px] gap-2 px-3 py-2.5 border border-border items-center",
                isMe && "bg-primary/5 border-primary/30"
              )}
            >
              {/* Rank */}
              <span
                className={cn(
                  "font-mono font-bold tabular-nums text-sm w-8",
                  m.rank === 1 && "text-green-500",
                  m.rank === data.length && data.length > 1 && "text-red-500"
                )}
              >
                {m.rank}
              </span>

              {/* Name */}
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="w-6 h-6 ring-1 ring-border shrink-0">
                  <AvatarImage
                    src={m.profile?.avatar_url ?? undefined}
                  />
                  <AvatarFallback className="font-mono text-[9px]">
                    {getInitials(m.profile?.full_name ?? null)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-mono text-xs tracking-tight truncate">
                  {m.profile?.full_name ?? "Sin nombre"}
                </span>
                {isMe && (
                  <span className="font-mono text-[9px] text-muted-foreground">
                    (tú)
                  </span>
                )}
              </div>

              {/* Total hours */}
              <span className="font-mono font-bold tabular-nums text-sm text-right">
                {m.totalHours}h
              </span>

              {/* Average daily */}
              <span className="font-mono tabular-nums text-xs text-right text-muted-foreground">
                {m.avgDaily.toFixed(1)}h
              </span>

              {/* Movement */}
              <div className="flex items-center justify-end gap-0.5">
                {movement > 0 && (
                  <>
                    <TrendingUp className="w-3 h-3 text-green-500" />
                    <span className="font-mono text-[10px] tabular-nums text-green-500">
                      +{movement}
                    </span>
                  </>
                )}
                {movement < 0 && (
                  <>
                    <TrendingDown className="w-3 h-3 text-red-500" />
                    <span className="font-mono text-[10px] tabular-nums text-red-500">
                      {movement}
                    </span>
                  </>
                )}
                {movement === 0 && (
                  <Minus className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/* TAB: GHOSTS                                                         */
/* ================================================================== */

function GhostsTab({
  members,
  userId,
}: {
  members: MemberShame[];
  userId: string | null;
}) {
  // Determine who should be working (within work hours)
  const now = new Date();
  const currentHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Monterrey",
    }).format(now)
  );
  const isWorkHours = currentHour >= 7 && currentHour < 19;

  const ghosts = members.filter((m) => m.shameLevel === "ghost");

  if (ghosts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-16 h-16 border border-border flex items-center justify-center">
          <Eye className="w-7 h-7 text-green-500" />
        </div>
        <p className="text-sm text-muted-foreground font-mono">
          No hay fantasmas hoy. Todos están registrando.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
        Desaparecidos &mdash; 0 horas registradas hoy
      </p>
      {!isWorkHours && (
        <p className="font-mono text-[9px] text-amber-500 mb-4">
          Fuera de horario laboral (7:00-19:00 CST)
        </p>
      )}

      <div className="space-y-3 mt-4">
        {ghosts.map((m) => {
          const isMe = m.userId === userId;
          // Compute hours since work start (9am or profile start)
          const workStart = m.profile?.work_start_hour ?? 9;
          const hoursSinceStart = Math.max(0, currentHour - workStart);

          return (
            <div
              key={m.userId}
              className="border-2 border-red-500/40 bg-red-500/5 p-5"
            >
              <div className="flex items-center gap-4">
                <Avatar className="w-14 h-14 ring-1 ring-red-500/30 opacity-30 shrink-0">
                  <AvatarImage
                    src={m.profile?.avatar_url ?? undefined}
                  />
                  <AvatarFallback className="font-mono text-sm bg-red-500/10 text-red-500/50">
                    {getInitials(m.profile?.full_name ?? null)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-bold text-lg tracking-tight text-red-500">
                      {m.profile?.full_name ?? "Sin nombre"}
                    </p>
                    {isMe && (
                      <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
                        (tú)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <Ghost className="w-4 h-4 text-red-500/60" />
                    <span className="font-mono text-sm text-red-500/80">
                      Desaparecido hace {hoursSinceStart}h
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-2">
                    {!m.hasStandup && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-red-400">
                        <MessageSquareOff className="w-3 h-3" />
                        Sin standup
                      </span>
                    )}
                    {!m.hasCloseout && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-red-400">
                        <FileX className="w-3 h-3" />
                        Sin cierre
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-mono font-black text-4xl tabular-nums text-red-500">
                    0
                  </p>
                  <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-red-500/60">
                    horas
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 border border-red-500/20 bg-red-500/5 p-3">
        <p className="font-mono text-[10px] text-red-500/80">
          {ghosts.length} de {members.length} miembros no han registrado
          nada hoy.{" "}
          {members.length > 0 && (
            <span className="font-bold">
              ({Math.round((ghosts.length / members.length) * 100)}% del
              equipo)
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/* ================================================================== */
/* TAB: HALL OF SHAME                                                  */
/* ================================================================== */

function HallTab({
  data,
  loading,
  userId,
}: {
  data: HallEntry[];
  loading: boolean;
  userId: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="border border-border p-4 animate-pulse"
          >
            <div className="h-4 bg-accent/50 w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-16 h-16 border border-border flex items-center justify-center">
          <Trophy className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground font-mono">
          Sin datos históricos.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4">
        Salón de la vergüenza &mdash; peores Trust Score promedio (30 días)
      </p>

      <div className="space-y-2">
        {data.map((entry, idx) => {
          const isMe = entry.userId === userId;
          const trustColor =
            entry.avgTrust >= 80
              ? "text-green-500"
              : entry.avgTrust >= 60
                ? "text-amber-500"
                : entry.avgTrust >= 40
                  ? "text-orange-500"
                  : "text-red-500";

          return (
            <div
              key={entry.userId}
              className={cn(
                "border border-border p-4 flex items-center gap-4",
                idx === 0 && "border-red-500/40 bg-red-500/5",
                isMe && "bg-primary/5 border-primary/30"
              )}
            >
              {/* Rank */}
              <span
                className={cn(
                  "font-mono font-bold tabular-nums text-lg w-8 shrink-0",
                  idx === 0 && "text-red-500"
                )}
              >
                {idx + 1}
              </span>

              {/* Avatar + name */}
              <Avatar className="w-8 h-8 ring-1 ring-border shrink-0">
                <AvatarImage
                  src={entry.profile?.avatar_url ?? undefined}
                />
                <AvatarFallback className="font-mono text-[9px]">
                  {getInitials(entry.profile?.full_name ?? null)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <p className="font-mono font-bold text-xs tracking-tight truncate">
                  {entry.profile?.full_name ?? "Sin nombre"}
                  {isMe && (
                    <span className="text-muted-foreground font-normal ml-1">
                      (tú)
                    </span>
                  )}
                </p>
              </div>

              {/* Trust Score */}
              <div className="text-right shrink-0">
                <p
                  className={cn(
                    "font-mono font-bold tabular-nums text-lg",
                    trustColor
                  )}
                >
                  {entry.avgTrust}
                </p>
                <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                  Trust Score
                </p>
              </div>

              {/* Flags */}
              {entry.totalFlags > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <Flag className="w-3 h-3 text-red-500" />
                  <span className="font-mono text-[10px] tabular-nums text-red-500">
                    {entry.totalFlags}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/* TAB: BRUTAL TRUTH                                                   */
/* ================================================================== */

function BrutalTab({
  truths,
  loading,
}: {
  truths: BrutalTruth[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Skull className="w-8 h-8 text-muted-foreground animate-pulse" />
        <p className="font-mono text-xs text-muted-foreground animate-pulse">
          Analizando tus 30 días...
        </p>
      </div>
    );
  }

  if (truths.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-16 h-16 border border-border flex items-center justify-center">
          <Skull className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground font-mono">
          Sin datos suficientes para generar verdades.
        </p>
      </div>
    );
  }

  const severityConfig = {
    "incómodo": {
      border: "border-yellow-500/40",
      bg: "bg-yellow-500/5",
      text: "text-yellow-500",
      label: "INCÓMODO",
    },
    doloroso: {
      border: "border-orange-500/40",
      bg: "bg-orange-500/5",
      text: "text-orange-500",
      label: "DOLOROSO",
    },
    devastador: {
      border: "border-red-500/40",
      bg: "bg-red-500/5",
      text: "text-red-500",
      label: "DEVASTADOR",
    },
  };

  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
        Verdad brutal &mdash; análisis de tus últimos 30 días
      </p>
      <p className="font-mono text-[9px] text-red-500/60 mb-6">
        Estos datos son solo tuyos. Nadie más los ve.
      </p>

      <div className="space-y-4">
        {truths.map((truth, idx) => {
          const config = severityConfig[truth.severity];
          return (
            <div
              key={idx}
              className={cn(
                "border-2 p-4",
                config.border,
                config.bg
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <span
                  className={cn(
                    "font-mono text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border shrink-0",
                    config.text,
                    config.border
                  )}
                >
                  {config.label}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
                  #{idx + 1}
                </span>
              </div>

              <p className="font-mono text-sm leading-relaxed">
                <TypewriterText
                  text={truth.text}
                  delay={idx * 2000}
                />
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
