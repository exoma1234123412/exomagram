"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type {
  Profile,
  TimeEntry,
  DailyCloseout,
  Standup,
  AccountabilityFlag,
  EntryReaction,
  ActivityStreak,
  TrustScoreHistory,
  LiveStatus,
  WorkCategory,
  FlagType,
} from "@/lib/types/database";
import {
  CATEGORIES,
  FLAG_TYPES,
  VERIFICATION_STATUS,
  LIVE_STATUS_CONFIG,
  MOOD_LABELS,
  ENERGY_LABELS,
  CATEGORY_COLORS,
} from "@/lib/constants";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials, formatHour, timeAgo } from "@/lib/utils";
import { format, subDays, eachDayOfInterval, getDay } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Shield,
  Flame,
  AlertTriangle,
  FileCheck,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  Calendar,
  BarChart3,
  TrendingUp,
  Flag,
  Zap,
  Eye,
  User,
  Mail,
  Globe,
  CalendarDays,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function getTitleTier(score: number): string {
  if (score >= 95) return "S";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function tierLabel(tier: string): string {
  switch (tier) {
    case "S": return "Leyenda";
    case "A": return "Confiable";
    case "B": return "Competente";
    case "C": return "Irregular";
    case "D": return "En riesgo";
    default: return "Problema";
  }
}

function tierColor(tier: string): string {
  switch (tier) {
    case "S": return "text-yellow-500";
    case "A": return "text-green-500";
    case "B": return "text-blue-500";
    case "C": return "text-yellow-600";
    case "D": return "text-orange-500";
    default: return "text-red-500";
  }
}

function trustColor(score: number): string {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-blue-600 dark:text-blue-400";
  if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function qualityGrade(entry: TimeEntry): string {
  let score = 0;
  if (entry.description && entry.description.length > 20) score += 2;
  else if (entry.description && entry.description.length > 5) score += 1;
  if (entry.proof_urls && entry.proof_urls.length > 0) score += 2;
  if (!entry.is_late) score += 1;
  if (score >= 5) return "A";
  if (score >= 4) return "B";
  if (score >= 3) return "C";
  if (score >= 2) return "D";
  return "F";
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return "text-green-600 dark:text-green-400";
    case "B": return "text-blue-600 dark:text-blue-400";
    case "C": return "text-yellow-600 dark:text-yellow-400";
    case "D": return "text-orange-600 dark:text-orange-400";
    default: return "text-red-600 dark:text-red-400";
  }
}

function heatmapColor(hours: number): string {
  if (hours === 0) return "bg-red-200 dark:bg-red-900/40";
  if (hours <= 4) return "bg-amber-300 dark:bg-amber-700/50";
  if (hours <= 7) return "bg-yellow-300 dark:bg-yellow-600/50";
  return "bg-green-400 dark:bg-green-600/60";
}

// ═══════════════════════════════════════════════════════════════════
// SECTION LABEL COMPONENT
// ═══════════════════════════════════════════════════════════════════

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 mt-12 first:mt-0">
      <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 border-b border-border pb-2">
        {children}
      </h2>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════

export default function DeepProfilePage() {
  const params = useParams();
  const targetUserId = params.userId as string;
  const { orgId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  // ── State ────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [closeouts, setCloseouts] = useState<DailyCloseout[]>([]);
  const [standups, setStandups] = useState<Standup[]>([]);
  const [flags, setFlags] = useState<AccountabilityFlag[]>([]);
  const [reactionsReceived, setReactionsReceived] = useState<EntryReaction[]>([]);
  const [reactionsGiven, setReactionsGiven] = useState<EntryReaction[]>([]);
  const [streak, setStreak] = useState<ActivityStreak | null>(null);
  const [trustHistory, setTrustHistory] = useState<TrustScoreHistory[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  // ── Load data ────────────────────────────────────────────────
  useEffect(() => {
    if (orgLoading || !orgId) return;

    async function loadAll() {
      const ninetyDaysAgo = subDays(new Date(), 90).toISOString().split("T")[0];

      const [
        { data: profileData },
        { data: entryData },
        { data: closeoutData },
        { data: standupData },
        { data: flagData },
        { data: streakData },
        { data: trustData },
        { data: statusData },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", targetUserId).single(),
        supabase
          .from("time_entries")
          .select("*")
          .eq("user_id", targetUserId)
          .eq("org_id", orgId!)
          .gte("date", ninetyDaysAgo)
          .order("date", { ascending: false })
          .order("hour", { ascending: false }),
        supabase
          .from("daily_closeouts")
          .select("*")
          .eq("user_id", targetUserId)
          .eq("org_id", orgId!)
          .order("date", { ascending: false }),
        supabase
          .from("standups")
          .select("*")
          .eq("user_id", targetUserId)
          .eq("org_id", orgId!)
          .order("date", { ascending: false }),
        supabase
          .from("accountability_flags")
          .select("*")
          .eq("user_id", targetUserId)
          .eq("org_id", orgId!)
          .order("date", { ascending: false }),
        supabase
          .from("activity_streaks")
          .select("*")
          .eq("user_id", targetUserId)
          .eq("org_id", orgId!)
          .single(),
        supabase
          .from("trust_score_history")
          .select("*")
          .eq("user_id", targetUserId)
          .eq("org_id", orgId!)
          .order("date", { ascending: true }),
        supabase
          .from("live_status")
          .select("*")
          .eq("user_id", targetUserId)
          .single(),
      ]);

      setProfile(profileData);
      setEntries(entryData ?? []);
      setCloseouts(closeoutData ?? []);
      setStandups(standupData ?? []);
      setFlags(flagData ?? []);
      setStreak(streakData);
      setTrustHistory(trustData ?? []);
      setLiveStatus(statusData);

      // Load reactions: received (on this user's entries) and given (by this user)
      if (entryData && entryData.length > 0) {
        const entryIds = entryData.map((e) => e.id);
        // Batch in chunks of 100 to avoid URL limit
        const chunks: string[][] = [];
        for (let i = 0; i < entryIds.length; i += 100) {
          chunks.push(entryIds.slice(i, i + 100));
        }
        const allReceived: EntryReaction[] = [];
        for (const chunk of chunks) {
          const { data } = await supabase
            .from("entry_reactions")
            .select("*")
            .in("entry_id", chunk);
          if (data) allReceived.push(...data);
        }
        setReactionsReceived(allReceived);
      }

      const { data: givenData } = await supabase
        .from("entry_reactions")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(200);
      setReactionsGiven(givenData ?? []);

      setLoading(false);
    }

    loadAll();
  }, [orgId, orgLoading, targetUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════
  // COMPUTED METRICS
  // ═══════════════════════════════════════════════════════════════

  const metrics = useMemo(() => {
    if (!entries.length) {
      return {
        totalEntries: 0,
        avgHoursPerDay: 0,
        proofRate: 0,
        lateRate: 0,
        closeoutRate: 0,
        standupRate: 0,
        totalFlags: 0,
        currentStreak: 0,
        longestStreak: 0,
        avgDescLength: 0,
        avgQualityGrade: "—",
        avgResponseTime: 0,
        shameScore: 0,
      };
    }

    // Unique dates with entries
    const uniqueDates = new Set(entries.map((e) => e.date));
    const totalEntries = entries.length;
    const avgHoursPerDay = uniqueDates.size > 0 ? +(totalEntries / uniqueDates.size).toFixed(1) : 0;

    // Proof rate
    const withProof = entries.filter((e) => e.proof_urls && e.proof_urls.length > 0).length;
    const proofRate = Math.round((withProof / totalEntries) * 100);

    // Late rate
    const lateEntries = entries.filter((e) => e.is_late).length;
    const lateRate = Math.round((lateEntries / totalEntries) * 100);

    // Closeout rate: number of closeout days / number of unique entry days
    const closeoutRate = uniqueDates.size > 0
      ? Math.round((closeouts.length / uniqueDates.size) * 100)
      : 0;

    // Standup rate
    const standupRate = uniqueDates.size > 0
      ? Math.round((standups.length / uniqueDates.size) * 100)
      : 0;

    // Flags
    const totalFlags = flags.length;

    // Streaks
    const currentStreak = streak?.current_streak ?? 0;
    const longestStreak = streak?.longest_streak ?? 0;

    // Avg description length in words
    const descs = entries
      .map((e) => e.description ?? "")
      .filter((d) => d.length > 0);
    const avgDescLength = descs.length > 0
      ? Math.round(descs.reduce((acc, d) => acc + d.split(/\s+/).length, 0) / descs.length)
      : 0;

    // Avg quality grade
    const grades = entries.map(qualityGrade);
    const gradeValues: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
    const avgGradeNum = grades.reduce((acc, g) => acc + (gradeValues[g] ?? 0), 0) / grades.length;
    let avgQualityGrade = "F";
    if (avgGradeNum >= 4.5) avgQualityGrade = "A";
    else if (avgGradeNum >= 3.5) avgQualityGrade = "B";
    else if (avgGradeNum >= 2.5) avgQualityGrade = "C";
    else if (avgGradeNum >= 1.5) avgQualityGrade = "D";

    // Avg minutes late (for late entries only)
    const lateOnes = entries.filter((e) => e.is_late && e.minutes_late > 0);
    const avgResponseTime = lateOnes.length > 0
      ? Math.round(lateOnes.reduce((acc, e) => acc + e.minutes_late, 0) / lateOnes.length)
      : 0;

    // Shame score: cumulative negative indicators
    const shameScore = totalFlags * 10 + lateRate + Math.max(0, 100 - proofRate) + Math.max(0, 100 - closeoutRate);

    return {
      totalEntries,
      avgHoursPerDay,
      proofRate,
      lateRate,
      closeoutRate,
      standupRate,
      totalFlags,
      currentStreak,
      longestStreak,
      avgDescLength,
      avgQualityGrade,
      avgResponseTime,
      shameScore,
    };
  }, [entries, closeouts, standups, flags, streak]);

  // ── Heatmap data (90 days) ──────────────────────────────────
  const heatmapData = useMemo(() => {
    const today = new Date();
    const start = subDays(today, 89);
    const days = eachDayOfInterval({ start, end: today });

    const countByDate = new Map<string, number>();
    for (const e of entries) {
      countByDate.set(e.date, (countByDate.get(e.date) ?? 0) + 1);
    }

    const weeks: { date: Date; dateStr: string; count: number }[][] = [];
    let currentWeek: { date: Date; dateStr: string; count: number }[] = [];

    const firstDow = getDay(days[0]);
    for (let i = 0; i < firstDow; i++) {
      currentWeek.push({ date: new Date(0), dateStr: "", count: -1 });
    }

    for (const day of days) {
      const dateStr = format(day, "yyyy-MM-dd");
      currentWeek.push({ date: day, dateStr, count: countByDate.get(dateStr) ?? 0 });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    return weeks;
  }, [entries]);

  // ── Behavioral patterns ─────────────────────────────────────
  const patterns = useMemo(() => {
    // Day of week distribution
    const dayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    const dayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

    // Hour distribution
    const hourDist: Record<number, number> = {};

    // Category distribution
    const catDist: Record<string, number> = {};

    // Proof rate by category
    const proofByCategory: Record<string, { total: number; withProof: number }> = {};

    // Late rate by day
    const lateByDay = [0, 0, 0, 0, 0, 0, 0];
    const totalByDay = [0, 0, 0, 0, 0, 0, 0];

    // Description length over time (by week)
    const descByWeek: Record<string, number[]> = {};

    for (const e of entries) {
      const d = new Date(e.date + "T12:00:00");
      const dow = d.getDay();
      dayOfWeek[dow]++;
      totalByDay[dow]++;
      if (e.is_late) lateByDay[dow]++;

      hourDist[e.hour] = (hourDist[e.hour] ?? 0) + 1;

      catDist[e.category] = (catDist[e.category] ?? 0) + 1;

      if (!proofByCategory[e.category]) {
        proofByCategory[e.category] = { total: 0, withProof: 0 };
      }
      proofByCategory[e.category].total++;
      if (e.proof_urls && e.proof_urls.length > 0) {
        proofByCategory[e.category].withProof++;
      }

      // Desc length by week
      const weekKey = format(d, "yyyy-'W'II");
      if (!descByWeek[weekKey]) descByWeek[weekKey] = [];
      const wordCount = (e.description ?? "").split(/\s+/).filter(Boolean).length;
      descByWeek[weekKey].push(wordCount);
    }

    // Max values for normalization
    const maxDow = Math.max(...dayOfWeek, 1);
    const maxHour = Math.max(...Object.values(hourDist), 1);
    const maxCat = Math.max(...Object.values(catDist), 1);

    // Sorted hours
    const hours = Object.entries(hourDist)
      .map(([h, c]) => ({ hour: parseInt(h), count: c }))
      .sort((a, b) => a.hour - b.hour);

    // Category sorted
    const categories = Object.entries(catDist)
      .map(([cat, count]) => ({ category: cat as WorkCategory, count }))
      .sort((a, b) => b.count - a.count);

    // Late rate by day
    const lateRateByDay = totalByDay.map((total, i) =>
      total > 0 ? Math.round((lateByDay[i] / total) * 100) : 0
    );

    // Desc trend
    const descTrend = Object.entries(descByWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, lengths]) => ({
        week,
        avg: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
      }));

    return {
      dayOfWeek,
      dayLabels,
      maxDow,
      hours,
      maxHour,
      categories,
      maxCat,
      proofByCategory,
      lateRateByDay,
      descTrend,
    };
  }, [entries]);

  // ── Trust score trend (last 30 days for sparkline) ──────────
  const trustSparkline = useMemo(() => {
    if (trustHistory.length === 0) return [];
    const last30 = trustHistory.slice(-30);
    const maxScore = Math.max(...last30.map((t) => t.score), 1);
    return last30.map((t) => ({
      date: t.date,
      score: t.score,
      heightPct: Math.max((t.score / maxScore) * 100, 5),
    }));
  }, [trustHistory]);

  // ── Flags by type ───────────────────────────────────────────
  const flagsByType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of flags) {
      map[f.flag_type] = (map[f.flag_type] ?? 0) + 1;
    }
    return Object.entries(map)
      .map(([type, count]) => ({ type: type as FlagType, count }))
      .sort((a, b) => b.count - a.count);
  }, [flags]);

  // ── Recent entries (last 30) ────────────────────────────────
  const recentEntries = useMemo(() => entries.slice(0, 30), [entries]);

  // ── Reactions map for entries ───────────────────────────────
  const reactionsByEntry = useMemo(() => {
    const map = new Map<string, EntryReaction[]>();
    for (const r of reactionsReceived) {
      const arr = map.get(r.entry_id) ?? [];
      arr.push(r);
      map.set(r.entry_id, arr);
    }
    return map;
  }, [reactionsReceived]);

  // ═══════════════════════════════════════════════════════════════
  // LOADING / ERROR STATES
  // ═══════════════════════════════════════════════════════════════

  if (loading || orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando dossier...
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-4">
            <User className="w-7 h-7 text-muted-foreground/40" />
          </div>
          <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            Usuario no encontrado
          </p>
        </div>
      </div>
    );
  }

  const currentTrust = trustHistory.length > 0 ? trustHistory[trustHistory.length - 1].score : 0;
  const tier = getTitleTier(currentTrust);
  const statusConfig = liveStatus ? LIVE_STATUS_CONFIG[liveStatus.status] : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link */}
      <Link
        href="/team"
        className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground mb-8 uppercase tracking-wider"
      >
        <ArrowLeft className="w-3 h-3" />
        Volver
      </Link>

      {/* ════════════════════════════════════════════════════════════
          HEADER: PERFIL COMPLETO
          ════════════════════════════════════════════════════════════ */}
      <div className="border border-border p-6 mb-8">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar */}
          <div className="relative">
            <Avatar className="w-20 h-20 ring-1 ring-border">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback className="text-xl font-mono font-bold">
                {getInitials(profile.full_name)}
              </AvatarFallback>
            </Avatar>
            {statusConfig && (
              <div className={cn(
                "absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-background",
                statusConfig.dotColor
              )} />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
                {profile.full_name ?? profile.email}
              </h1>
              <Badge variant="outline" className={cn("font-mono text-xs font-bold", tierColor(tier))}>
                {tier} — {tierLabel(tier)}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 mt-3 text-xs font-mono text-muted-foreground">
              <div className="flex items-center gap-2">
                <Mail className="w-3 h-3" />
                <span>{profile.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-3 h-3" />
                <span>{profile.timezone}</span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-3 h-3" />
                <span>Desde {format(new Date(profile.created_at), "d MMM yyyy", { locale: es })}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3" />
                <span>Horario: {formatHour(profile.work_start_hour)} - {formatHour(profile.work_end_hour)}</span>
              </div>
            </div>

            {/* Live status */}
            {statusConfig && liveStatus && (
              <div className="mt-3 flex items-center gap-2 text-xs font-mono">
                <span className={cn("w-2 h-2 rounded-full", statusConfig.dotColor, liveStatus.status !== "offline" && "animate-pulse")} />
                <span className={statusConfig.color}>{statusConfig.label}</span>
                {liveStatus.current_task && (
                  <span className="text-muted-foreground/60">— {liveStatus.current_task}</span>
                )}
                <span className="text-muted-foreground/40 ml-auto">
                  Heartbeat: {timeAgo(liveStatus.last_heartbeat)}
                </span>
              </div>
            )}
          </div>

          {/* Trust Score + Shame */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="text-right">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Trust Score</p>
              <p className={cn("font-mono text-3xl font-black tabular-nums tracking-tight", trustColor(currentTrust))}>
                {currentTrust}
              </p>
              {/* Mini sparkline */}
              {trustSparkline.length > 1 && (
                <div className="flex items-end gap-[1px] h-4 mt-1">
                  {trustSparkline.map((t, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-[2px] transition-all",
                        t.score >= 80 ? "bg-green-500" : t.score >= 60 ? "bg-blue-500" : t.score >= 40 ? "bg-yellow-500" : "bg-red-500"
                      )}
                      style={{ height: `${t.heightPct}%` }}
                      title={`${t.date}: ${t.score}`}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Shame Score</p>
              <p className="font-mono text-lg font-bold tabular-nums tracking-tight text-red-500">
                {metrics.shameScore}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          RESUMEN EJECUTIVO
          ════════════════════════════════════════════════════════════ */}
      <SectionLabel>Resumen ejecutivo</SectionLabel>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-[1px] bg-border mb-8">
        {[
          { label: "Entradas (90d)", value: metrics.totalEntries, warn: metrics.totalEntries < 100 },
          { label: "Prom. hrs/dia", value: metrics.avgHoursPerDay, warn: metrics.avgHoursPerDay < 6 },
          { label: "Tasa evidencia", value: `${metrics.proofRate}%`, warn: metrics.proofRate < 50 },
          { label: "Tasa tardias", value: `${metrics.lateRate}%`, warn: metrics.lateRate > 30 },
          { label: "Tasa closeout", value: `${metrics.closeoutRate}%`, warn: metrics.closeoutRate < 50 },
          { label: "Tasa standup", value: `${metrics.standupRate}%`, warn: metrics.standupRate < 50 },
          { label: "Flags totales", value: metrics.totalFlags, warn: metrics.totalFlags > 5 },
          { label: "Racha actual", value: `${metrics.currentStreak}d`, warn: metrics.currentStreak === 0 },
          { label: "Mejor racha", value: `${metrics.longestStreak}d`, warn: false },
          { label: "Prom. palabras", value: metrics.avgDescLength, warn: metrics.avgDescLength < 5 },
          { label: "Calidad prom.", value: metrics.avgQualityGrade, warn: metrics.avgQualityGrade === "D" || metrics.avgQualityGrade === "F" },
          { label: "Min. tarde prom.", value: `${metrics.avgResponseTime}m`, warn: metrics.avgResponseTime > 60 },
        ].map((stat, i) => (
          <div key={i} className="bg-background p-3 text-center">
            <p className={cn(
              "font-mono text-lg font-bold tabular-nums tracking-tight",
              stat.warn ? "text-red-500" : "text-foreground"
            )}>
              {stat.value}
            </p>
            <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground/50 mt-1">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════
          CALENDARIO DE ACTIVIDAD (90-day heatmap)
          ════════════════════════════════════════════════════════════ */}
      <SectionLabel>Calendario de actividad — 90 dias</SectionLabel>
      <div className="border border-border p-4 mb-8 overflow-x-auto">
        <div className="flex gap-[2px] min-w-[600px]">
          {/* Day labels */}
          <div className="flex flex-col gap-[2px] mr-1 w-[20px] shrink-0">
            {["", "L", "", "M", "", "V", ""].map((label, i) => (
              <div key={i} className="h-[12px] flex items-center">
                <span className="font-mono text-[8px] text-muted-foreground/40">{label}</span>
              </div>
            ))}
          </div>
          {/* Weeks */}
          <div className="flex gap-[2px]">
            {heatmapData.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[2px]">
                {week.map((day, di) => (
                  <div
                    key={di}
                    className={cn(
                      "w-[12px] h-[12px] transition-colors cursor-default",
                      day.count < 0 ? "bg-transparent" : heatmapColor(day.count),
                      hoveredDay === day.dateStr && "ring-1 ring-foreground"
                    )}
                    onMouseEnter={() => day.dateStr && setHoveredDay(day.dateStr)}
                    onMouseLeave={() => setHoveredDay(null)}
                    title={day.count >= 0 ? `${day.dateStr}: ${day.count}h` : undefined}
                  />
                ))}
                {Array.from({ length: 7 - week.length }).map((_, i) => (
                  <div key={`pad-${i}`} className="w-[12px] h-[12px]" />
                ))}
              </div>
            ))}
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-1 font-mono text-[8px] text-muted-foreground/40">
            <span>0h</span>
            <div className="w-[12px] h-[12px] bg-red-200 dark:bg-red-900/40" />
            <div className="w-[12px] h-[12px] bg-amber-300 dark:bg-amber-700/50" />
            <div className="w-[12px] h-[12px] bg-yellow-300 dark:bg-yellow-600/50" />
            <div className="w-[12px] h-[12px] bg-green-400 dark:bg-green-600/60" />
            <span>8h+</span>
          </div>
          {hoveredDay && (
            <span className="font-mono text-[9px] text-muted-foreground ml-auto">
              {hoveredDay}: {entries.filter((e) => e.date === hoveredDay).length}h registradas
            </span>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          ENTRADAS RECIENTES (last 30)
          ════════════════════════════════════════════════════════════ */}
      <SectionLabel>Entradas recientes — ultimas 30</SectionLabel>
      <div className="border border-border divide-y divide-border mb-8">
        {recentEntries.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-mono text-xs text-muted-foreground/40 uppercase">Sin entradas</p>
          </div>
        ) : (
          recentEntries.map((entry) => {
            const catInfo = CATEGORIES[entry.category];
            const verInfo = VERIFICATION_STATUS[entry.verification_status];
            const grade = qualityGrade(entry);
            const entryReactions = reactionsByEntry.get(entry.id) ?? [];

            return (
              <div key={entry.id} className="p-3 hover:bg-accent/20 transition-colors">
                {/* Row 1: date + hour + category + title + grade */}
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums shrink-0 w-[68px]">
                    {entry.date}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums shrink-0 w-[52px]">
                    {formatHour(entry.hour)}
                  </span>
                  <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 shrink-0", catInfo.bgColor, catInfo.color)}>
                    {catInfo.emoji} {catInfo.label}
                  </Badge>
                  <span className="font-mono text-xs font-medium flex-1 min-w-0">{entry.title}</span>
                  <span className={cn("font-mono text-[10px] font-bold shrink-0", gradeColor(grade))}>
                    {grade}
                  </span>
                </div>

                {/* Row 2: description (full, no truncation) */}
                {entry.description && (
                  <p className="font-mono text-[11px] text-muted-foreground mt-1 ml-[122px] whitespace-pre-wrap">
                    {entry.description}
                  </p>
                )}

                {/* Row 3: metadata */}
                <div className="flex items-center gap-3 mt-1 ml-[122px] flex-wrap">
                  <span className={cn("font-mono text-[9px]", verInfo.color)}>
                    {verInfo.icon} {verInfo.label}
                  </span>
                  {entry.mood && (
                    <span className="font-mono text-[9px] text-muted-foreground/50">
                      Animo: {MOOD_LABELS[entry.mood]}
                    </span>
                  )}
                  {entry.energy && (
                    <span className="font-mono text-[9px] text-muted-foreground/50">
                      Energia: {ENERGY_LABELS[entry.energy]}
                    </span>
                  )}
                  {entry.is_late && (
                    <span className="font-mono text-[9px] text-red-500">
                      TARDIA +{entry.minutes_late}m
                    </span>
                  )}
                  {entry.proof_urls && entry.proof_urls.length > 0 && (
                    <span className="font-mono text-[9px] text-green-600 dark:text-green-400 flex items-center gap-0.5">
                      <Shield className="w-2.5 h-2.5" />
                      {entry.proof_urls.length} prueba{entry.proof_urls.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {entryReactions.length > 0 && (
                    <span className="font-mono text-[9px] text-muted-foreground/50">
                      {entryReactions.length} reaccione{entryReactions.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Row 4: proof links */}
                {entry.proof_urls && entry.proof_urls.length > 0 && (
                  <div className="flex items-center gap-2 mt-1 ml-[122px] flex-wrap">
                    {entry.proof_urls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[9px] text-primary hover:underline flex items-center gap-0.5"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        Prueba {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          PATRONES DE COMPORTAMIENTO
          ════════════════════════════════════════════════════════════ */}
      <SectionLabel>Patrones de comportamiento</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Day of week distribution */}
        <div className="border border-border p-4">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Distribucion por dia
          </p>
          <div className="flex items-end gap-2 h-24">
            {patterns.dayOfWeek.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="font-mono text-[8px] tabular-nums text-muted-foreground/50">
                  {count}
                </span>
                <div
                  className={cn(
                    "w-full transition-all",
                    count > 0 ? "bg-primary/60" : "bg-muted/30"
                  )}
                  style={{ height: `${patterns.maxDow > 0 ? (count / patterns.maxDow) * 64 : 0}px`, minHeight: count > 0 ? "2px" : "0" }}
                />
                <span className="font-mono text-[8px] text-muted-foreground/40">
                  {patterns.dayLabels[i]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Hour distribution */}
        <div className="border border-border p-4">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Distribucion por hora
          </p>
          <div className="flex items-end gap-[2px] h-24">
            {patterns.hours.map(({ hour, count }) => (
              <div key={hour} className="flex-1 flex flex-col items-center gap-1">
                <span className="font-mono text-[7px] tabular-nums text-muted-foreground/50">
                  {count}
                </span>
                <div
                  className="w-full bg-primary/60 transition-all"
                  style={{ height: `${(count / patterns.maxHour) * 64}px`, minHeight: "2px" }}
                />
                <span className="font-mono text-[7px] tabular-nums text-muted-foreground/40">
                  {hour}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Category distribution */}
        <div className="border border-border p-4">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Distribucion por categoria
          </p>
          <div className="space-y-2">
            {patterns.categories.map(({ category, count }) => {
              const catInfo = CATEGORIES[category];
              const pct = entries.length > 0 ? Math.round((count / entries.length) * 100) : 0;
              return (
                <div key={category}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-[10px]">
                      {catInfo.emoji} {catInfo.label}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50">
                      {count}h ({pct}%)
                    </span>
                  </div>
                  <div className="h-1 bg-muted/30">
                    <div
                      className={cn("h-full transition-all", CATEGORY_COLORS[category])}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Proof rate by category */}
        <div className="border border-border p-4">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Tasa de evidencia por categoria
          </p>
          <div className="space-y-2">
            {Object.entries(patterns.proofByCategory)
              .sort(([, a], [, b]) => b.total - a.total)
              .map(([cat, data]) => {
                const pct = data.total > 0 ? Math.round((data.withProof / data.total) * 100) : 0;
                const catInfo = CATEGORIES[cat as WorkCategory];
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-mono text-[10px]">
                        {catInfo?.emoji} {catInfo?.label ?? cat}
                      </span>
                      <span className={cn(
                        "font-mono text-[10px] tabular-nums font-bold",
                        pct >= 80 ? "text-green-500" : pct >= 50 ? "text-yellow-500" : "text-red-500"
                      )}>
                        {pct}%
                      </span>
                    </div>
                    <div className="h-1 bg-muted/30">
                      <div
                        className={cn(
                          "h-full transition-all",
                          pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Late rate by day of week */}
        <div className="border border-border p-4">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Tasa de tardias por dia
          </p>
          <div className="flex items-end gap-2 h-20">
            {patterns.lateRateByDay.map((pct, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="font-mono text-[8px] tabular-nums text-muted-foreground/50">
                  {pct}%
                </span>
                <div
                  className={cn(
                    "w-full transition-all",
                    pct > 30 ? "bg-red-500" : pct > 10 ? "bg-yellow-500" : "bg-green-500/60"
                  )}
                  style={{ height: `${Math.max(pct * 0.6, pct > 0 ? 2 : 0)}px` }}
                />
                <span className="font-mono text-[8px] text-muted-foreground/40">
                  {patterns.dayLabels[i]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Description length trend */}
        <div className="border border-border p-4">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Largo de descripcion (palabras/semana)
          </p>
          {patterns.descTrend.length > 0 ? (
            <div className="flex items-end gap-[2px] h-20">
              {patterns.descTrend.map(({ week, avg }) => {
                const maxAvg = Math.max(...patterns.descTrend.map((d) => d.avg), 1);
                return (
                  <div key={week} className="flex-1 flex flex-col items-center gap-1">
                    <span className="font-mono text-[7px] tabular-nums text-muted-foreground/50">
                      {avg}
                    </span>
                    <div
                      className="w-full bg-primary/40 transition-all"
                      style={{ height: `${(avg / maxAvg) * 56}px`, minHeight: avg > 0 ? "2px" : "0" }}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="font-mono text-[9px] text-muted-foreground/40">Sin datos</p>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          HISTORIAL DE CONFIANZA
          ════════════════════════════════════════════════════════════ */}
      <SectionLabel>Historial de Trust Score</SectionLabel>
      <div className="border border-border p-4 mb-8">
        {trustHistory.length === 0 ? (
          <p className="font-mono text-[9px] text-muted-foreground/40 text-center py-4 uppercase">
            Sin historial de Trust Score
          </p>
        ) : (
          <>
            {/* Score chart */}
            <div className="flex items-end gap-[1px] h-32 mb-4">
              {trustHistory.map((t, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-end group relative"
                >
                  <div
                    className={cn(
                      "w-full transition-all cursor-default",
                      t.score >= 80 ? "bg-green-500/70" : t.score >= 60 ? "bg-blue-500/70" : t.score >= 40 ? "bg-yellow-500/70" : "bg-red-500/70",
                      "hover:opacity-80"
                    )}
                    style={{ height: `${Math.max((t.score / 100) * 120, 2)}px` }}
                    title={`${t.date}: ${t.score}`}
                  />
                </div>
              ))}
            </div>
            {/* Date labels */}
            <div className="flex justify-between">
              <span className="font-mono text-[8px] text-muted-foreground/40">
                {trustHistory[0].date}
              </span>
              <span className="font-mono text-[8px] text-muted-foreground/40">
                {trustHistory[trustHistory.length - 1].date}
              </span>
            </div>

            {/* Component breakdown table for last record */}
            {trustHistory.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2">
                  Ultimo registro: {trustHistory[trustHistory.length - 1].date}
                </p>
                <div className="grid grid-cols-5 gap-[1px] bg-border">
                  {[
                    { label: "Hrs registradas", value: trustHistory[trustHistory.length - 1].hours_logged },
                    { label: "Hrs con prueba", value: trustHistory[trustHistory.length - 1].hours_with_proof },
                    { label: "Entradas tardias", value: trustHistory[trustHistory.length - 1].late_entries },
                    { label: "Closeout", value: trustHistory[trustHistory.length - 1].has_closeout ? "Si" : "No" },
                    { label: "Sospechosas", value: trustHistory[trustHistory.length - 1].suspicious_reactions },
                  ].map((item, i) => (
                    <div key={i} className="bg-background p-2 text-center">
                      <p className="font-mono text-sm font-bold tabular-nums tracking-tight">{item.value}</p>
                      <p className="font-mono text-[8px] text-muted-foreground/40 uppercase">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          HISTORIAL DE FLAGS
          ════════════════════════════════════════════════════════════ */}
      <SectionLabel>Historial de flags — {flags.length} total</SectionLabel>
      <div className="border border-border mb-8">
        {/* Summary by type */}
        {flagsByType.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-[1px] bg-border border-b border-border">
            {flagsByType.map(({ type, count }) => {
              const info = FLAG_TYPES[type];
              return (
                <div key={type} className="bg-background p-3 text-center">
                  <p className="text-lg">{info.emoji}</p>
                  <p className="font-mono text-sm font-bold tabular-nums tracking-tight">{count}</p>
                  <p className="font-mono text-[8px] text-muted-foreground/40 uppercase">{info.label}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Full list */}
        <div className="divide-y divide-border max-h-80 overflow-y-auto">
          {flags.length === 0 ? (
            <div className="p-6 text-center">
              <p className="font-mono text-[9px] text-muted-foreground/40 uppercase">Sin flags</p>
            </div>
          ) : (
            flags.map((flag) => {
              const info = FLAG_TYPES[flag.flag_type as FlagType];
              return (
                <div key={flag.id} className="p-3 flex items-start gap-3 hover:bg-accent/20 transition-colors">
                  <span className="text-sm">{info.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{info.label}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[8px] px-1 py-0 h-3.5",
                          flag.resolved
                            ? "text-green-600 border-green-300 dark:border-green-700"
                            : "text-red-600 border-red-300 dark:border-red-700"
                        )}
                      >
                        {flag.resolved ? "RESUELTO" : "PENDIENTE"}
                      </Badge>
                    </div>
                    {flag.details && (
                      <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                        {flag.details}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-[9px] text-muted-foreground/40 tabular-nums shrink-0">
                    {flag.date}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          RACHAS
          ════════════════════════════════════════════════════════════ */}
      <SectionLabel>Rachas</SectionLabel>
      <div className="grid grid-cols-3 gap-[1px] bg-border mb-8">
        <div className="bg-background p-4 text-center">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-1">Racha actual</p>
          <p className="font-mono text-2xl font-black tabular-nums tracking-tight flex items-center justify-center gap-1">
            {metrics.currentStreak > 0 && <Flame className="w-5 h-5 text-orange-500" />}
            {metrics.currentStreak}
          </p>
          <p className="font-mono text-[9px] text-muted-foreground/40 mt-0.5">dias</p>
        </div>
        <div className="bg-background p-4 text-center">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-1">Mejor racha</p>
          <p className="font-mono text-2xl font-black tabular-nums tracking-tight">
            {metrics.longestStreak}
          </p>
          <p className="font-mono text-[9px] text-muted-foreground/40 mt-0.5">dias</p>
        </div>
        <div className="bg-background p-4 text-center">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-1">Dias registrados</p>
          <p className="font-mono text-2xl font-black tabular-nums tracking-tight">
            {streak?.total_days_logged ?? 0}
          </p>
          <p className="font-mono text-[9px] text-muted-foreground/40 mt-0.5">total</p>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          REACCIONES
          ════════════════════════════════════════════════════════════ */}
      <SectionLabel>Reacciones</SectionLabel>
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="border border-border p-4">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Recibidas ({reactionsReceived.length})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["verified", "suspicious", "impressive", "helped_me"] as const).map((type) => {
              const count = reactionsReceived.filter((r) => r.reaction === type).length;
              const isNegative = type === "suspicious";
              return (
                <div key={type} className="text-center p-2 bg-accent/20">
                  <p className={cn(
                    "font-mono text-lg font-bold tabular-nums",
                    isNegative && count > 0 ? "text-red-500" : "text-foreground"
                  )}>
                    {count}
                  </p>
                  <p className="font-mono text-[8px] text-muted-foreground/40 uppercase">{type}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="border border-border p-4">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Dadas ({reactionsGiven.length})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["verified", "suspicious", "impressive", "helped_me"] as const).map((type) => {
              const count = reactionsGiven.filter((r) => r.reaction === type).length;
              return (
                <div key={type} className="text-center p-2 bg-accent/20">
                  <p className="font-mono text-lg font-bold tabular-nums">
                    {count}
                  </p>
                  <p className="font-mono text-[8px] text-muted-foreground/40 uppercase">{type}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          CLOSEOUTS RECIENTES
          ════════════════════════════════════════════════════════════ */}
      <SectionLabel>Closeouts recientes — {closeouts.length}</SectionLabel>
      <div className="border border-border divide-y divide-border mb-8 max-h-80 overflow-y-auto">
        {closeouts.length === 0 ? (
          <div className="p-6 text-center">
            <p className="font-mono text-[9px] text-muted-foreground/40 uppercase">Sin closeouts</p>
          </div>
        ) : (
          closeouts.slice(0, 20).map((c) => (
            <div key={c.id} className="p-3 hover:bg-accent/20 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">{c.date}</span>
                <span className="font-mono text-[10px] tabular-nums">
                  {c.hours_logged}h / {c.hours_with_proof}h prueba
                </span>
              </div>
              <p className="font-mono text-[11px]">{c.summary}</p>
              {c.blockers && (
                <p className="font-mono text-[10px] text-red-500/70 mt-1">
                  Blocker: {c.blockers}
                </p>
              )}
              {c.tomorrow_plan && (
                <p className="font-mono text-[10px] text-muted-foreground/50 mt-1">
                  Plan: {c.tomorrow_plan}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          STANDUPS RECIENTES
          ════════════════════════════════════════════════════════════ */}
      <SectionLabel>Standups recientes — {standups.length}</SectionLabel>
      <div className="border border-border divide-y divide-border mb-8 max-h-80 overflow-y-auto">
        {standups.length === 0 ? (
          <div className="p-6 text-center">
            <p className="font-mono text-[9px] text-muted-foreground/40 uppercase">Sin standups</p>
          </div>
        ) : (
          standups.slice(0, 20).map((s) => (
            <div key={s.id} className="p-3 hover:bg-accent/20 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">{s.date}</span>
                {s.mood && (
                  <span className="font-mono text-[9px] text-muted-foreground/50">
                    Animo: {MOOD_LABELS[s.mood]}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                <p className="font-mono text-[10px]">
                  <span className="text-muted-foreground/40">AYER:</span> {s.yesterday}
                </p>
                <p className="font-mono text-[10px]">
                  <span className="text-muted-foreground/40">HOY:</span> {s.today_plan}
                </p>
                {s.blockers && (
                  <p className="font-mono text-[10px] text-red-500/70">
                    <span className="text-muted-foreground/40">BLOCKER:</span> {s.blockers}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom spacer */}
      <div className="h-16" />
    </div>
  );
}
