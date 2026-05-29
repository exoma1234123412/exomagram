"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import type { Profile, TimeEntry, DailyCloseout, AccountabilityFlag } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Skull,
  ChevronLeft,
  ChevronRight,
  Crown,
  Award,
  Ghost,
  Clock,
  ShieldAlert,
  Turtle,
  Zap,
  Sunrise,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isWeekend,
  isBefore,
  parseISO,
  getDay,
} from "date-fns";
import { es } from "date-fns/locale";

// ============================================================
// Types
// ============================================================

interface MemberWeekData {
  userId: string;
  profile: Profile | null;
  entries: TimeEntry[];
  closeouts: DailyCloseout[];
  standups: { id: string; date: string }[];
  flags: AccountabilityFlag[];
  totalHours: number;
  proofPercent: number;
  latePercent: number;
  closeoutPercent: number;
  standupPercent: number;
  flagCount: number;
  avgDescriptionWords: number;
  earliestLogAvg: number | null;
  grade: string;
  // Previous week comparison
  prevTotalHours: number;
  prevProofPercent: number;
}

interface DayData {
  date: string;
  dayName: string;
  members: {
    userId: string;
    name: string;
    hours: number;
    proofPercent: number;
    lateCount: number;
    notableEvents: string[];
  }[];
  worstUserId: string | null;
  bestUserId: string | null;
}

interface ShamefulPattern {
  userId: string;
  name: string;
  pattern: string;
}

interface WeeklyAward {
  title: string;
  icon: React.ReactNode;
  name: string;
  detail: string;
  isPositive: boolean;
}

// ============================================================
// Grade helpers
// ============================================================

function computeGrade(m: {
  totalHours: number;
  proofPercent: number;
  latePercent: number;
  closeoutPercent: number;
  standupPercent: number;
  flagCount: number;
}): string {
  let score = 0;
  // Hours (out of 40 expected for 5 days)
  const hourRatio = Math.min(m.totalHours / 40, 1);
  score += hourRatio * 30;
  // Proof %
  score += (m.proofPercent / 100) * 25;
  // Closeout %
  score += (m.closeoutPercent / 100) * 15;
  // Standup %
  score += (m.standupPercent / 100) * 15;
  // Late penalty
  score -= (m.latePercent / 100) * 10;
  // Flag penalty
  score -= m.flagCount * 3;

  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function computeTeamGrade(members: MemberWeekData[]): string {
  if (members.length === 0) return "F";
  const gradeValues: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  const avg = members.reduce((sum, m) => sum + (gradeValues[m.grade] ?? 0), 0) / members.length;
  if (avg >= 3.5) return "A";
  if (avg >= 2.5) return "B";
  if (avg >= 1.5) return "C";
  if (avg >= 0.5) return "D";
  return "F";
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-green-600 dark:text-green-400",
  B: "text-blue-600 dark:text-blue-400",
  C: "text-yellow-600 dark:text-yellow-400",
  D: "text-orange-600 dark:text-orange-400",
  F: "text-red-600 dark:text-red-400",
};

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// ============================================================
// Page
// ============================================================

export default function WeeklyShamePage() {
  const { orgId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [members, setMembers] = useState<MemberWeekData[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(-1); // -1 = last completed week

  // Compute the week range based on offset
  const weekRange = useMemo(() => {
    const today = new Date(getTodayMTY() + "T12:00:00");
    const ref = addWeeks(today, weekOffset);
    const start = startOfWeek(ref, { weekStartsOn: 1 }); // Monday
    const end = endOfWeek(ref, { weekStartsOn: 1 }); // Sunday
    // Clamp end to Friday for display
    const fri = new Date(start);
    fri.setDate(fri.getDate() + 4);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(fri, "yyyy-MM-dd"),
      startDisplay: format(start, "d MMM", { locale: es }),
      endDisplay: format(fri, "d MMM yyyy", { locale: es }),
      // Previous week
      prevStart: format(subWeeks(start, 1), "yyyy-MM-dd"),
      prevEnd: format(subWeeks(fri, 1), "yyyy-MM-dd"),
    };
  }, [weekOffset]);

  // Can't navigate into future
  const canGoNext = useMemo(() => {
    const today = new Date(getTodayMTY() + "T12:00:00");
    const nextEnd = addWeeks(new Date(weekRange.end + "T12:00:00"), 1);
    return isBefore(nextEnd, today);
  }, [weekRange]);

  // ============================================================
  // Data Loading
  // ============================================================

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    // 1. All org members with profiles
    const { data: orgMembers } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    if (!orgMembers || orgMembers.length === 0) {
      setLoading(false);
      return;
    }

    const pMap = new Map<string, Profile>();
    const userIds: string[] = [];
    for (const m of orgMembers) {
      userIds.push(m.user_id);
      if (m.profiles) pMap.set(m.user_id, m.profiles as unknown as Profile);
    }
    setProfileMap(pMap);

    // 2. Time entries for this week AND previous week
    const { data: entries } = await supabase
      .from("time_entries")
      .select("id, user_id, date, hour, category, title, description, is_late, proof_urls, logged_at")
      .eq("org_id", orgId)
      .gte("date", weekRange.prevStart)
      .lte("date", weekRange.end);

    // 3. Daily closeouts
    const { data: closeouts } = await supabase
      .from("daily_closeouts")
      .select("id, user_id, date")
      .eq("org_id", orgId)
      .gte("date", weekRange.prevStart)
      .lte("date", weekRange.end);

    // 4. Standups
    const { data: standups } = await supabase
      .from("standups")
      .select("id, user_id, date")
      .eq("org_id", orgId)
      .gte("date", weekRange.prevStart)
      .lte("date", weekRange.end);

    // 5. Flags
    const { data: flags } = await supabase
      .from("accountability_flags")
      .select("id, user_id, date, flag_type, details")
      .eq("org_id", orgId)
      .gte("date", weekRange.prevStart)
      .lte("date", weekRange.end);

    // Build weekdays for this week (Mon-Fri)
    const weekStart = new Date(weekRange.start + "T12:00:00");
    const weekEnd = new Date(weekRange.end + "T12:00:00");
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })
      .filter((d) => !isWeekend(d))
      .map((d) => format(d, "yyyy-MM-dd"));
    const weekDayCount = weekDays.length || 5;

    // Previous week days
    const prevWeekStart = new Date(weekRange.prevStart + "T12:00:00");
    const prevWeekEnd = new Date(weekRange.prevEnd + "T12:00:00");
    const prevWeekDays = eachDayOfInterval({ start: prevWeekStart, end: prevWeekEnd })
      .filter((d) => !isWeekend(d))
      .map((d) => format(d, "yyyy-MM-dd"));

    // Process each member
    const memberData: MemberWeekData[] = userIds.map((uid) => {
      // This week
      const userEntries = (entries ?? []).filter(
        (e) => e.user_id === uid && weekDays.includes(e.date)
      );
      const userCloseouts = (closeouts ?? []).filter(
        (c) => c.user_id === uid && weekDays.includes(c.date)
      );
      const userStandups = (standups ?? []).filter(
        (s) => s.user_id === uid && weekDays.includes(s.date)
      );
      const userFlags = (flags ?? []).filter(
        (f) => f.user_id === uid && weekDays.includes(f.date)
      );

      const totalHours = userEntries.length;
      const withProof = userEntries.filter(
        (e) => e.proof_urls && e.proof_urls.length > 0
      ).length;
      const proofPercent = totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0;
      const lateCount = userEntries.filter((e) => e.is_late).length;
      const latePercent = totalHours > 0 ? Math.round((lateCount / totalHours) * 100) : 0;

      const closeoutDates = new Set(userCloseouts.map((c) => c.date));
      const closeoutPercent = Math.round((closeoutDates.size / weekDayCount) * 100);

      const standupDates = new Set(userStandups.map((s) => s.date));
      const standupPercent = Math.round((standupDates.size / weekDayCount) * 100);

      // Avg description length
      const descWords = userEntries
        .map((e) => (e.description || "").trim().split(/\s+/).filter(Boolean).length)
        .filter((w) => w > 0);
      const avgDescriptionWords =
        descWords.length > 0 ? Math.round(descWords.reduce((a, b) => a + b, 0) / descWords.length) : 0;

      // Earliest log average (hour of day from logged_at)
      const logHours = userEntries.map((e) => {
        const d = new Date(e.logged_at);
        return d.getHours() + d.getMinutes() / 60;
      });
      const earliestLogAvg =
        logHours.length > 0
          ? logHours.reduce((a, b) => Math.min(a, b), 24)
          : null;

      // Previous week
      const prevEntries = (entries ?? []).filter(
        (e) => e.user_id === uid && prevWeekDays.includes(e.date)
      );
      const prevTotalHours = prevEntries.length;
      const prevWithProof = prevEntries.filter(
        (e) => e.proof_urls && e.proof_urls.length > 0
      ).length;
      const prevProofPercent =
        prevTotalHours > 0 ? Math.round((prevWithProof / prevTotalHours) * 100) : 0;

      const memberStats = {
        totalHours,
        proofPercent,
        latePercent,
        closeoutPercent,
        standupPercent,
        flagCount: userFlags.length,
      };

      return {
        userId: uid,
        profile: pMap.get(uid) ?? null,
        entries: userEntries,
        closeouts: userCloseouts,
        standups: userStandups,
        flags: userFlags,
        totalHours,
        proofPercent,
        latePercent,
        closeoutPercent,
        standupPercent,
        flagCount: userFlags.length,
        avgDescriptionWords,
        earliestLogAvg,
        grade: computeGrade(memberStats),
        prevTotalHours,
        prevProofPercent,
      };
    });

    // Sort by totalHours desc
    memberData.sort((a, b) => b.totalHours - a.totalHours);
    setMembers(memberData);
    setLoading(false);
  }, [orgId, weekRange, supabase]);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      return;
    }
    loadData();
  }, [orgLoading, orgId, loadData]);

  // ============================================================
  // Computed Data
  // ============================================================

  // Team averages
  const teamAvg = useMemo(() => {
    if (members.length === 0)
      return { hours: 0, proof: 0, late: 0, closeout: 0, standup: 0, flags: 0 };
    return {
      hours: members.reduce((s, m) => s + m.totalHours, 0) / members.length,
      proof: members.reduce((s, m) => s + m.proofPercent, 0) / members.length,
      late: members.reduce((s, m) => s + m.latePercent, 0) / members.length,
      closeout: members.reduce((s, m) => s + m.closeoutPercent, 0) / members.length,
      standup: members.reduce((s, m) => s + m.standupPercent, 0) / members.length,
      flags: members.reduce((s, m) => s + m.flagCount, 0) / members.length,
    };
  }, [members]);

  // Day-by-day breakdown
  const dayBreakdown = useMemo((): DayData[] => {
    if (members.length === 0) return [];
    const weekStart = new Date(weekRange.start + "T12:00:00");
    const weekEnd = new Date(weekRange.end + "T12:00:00");
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd }).filter(
      (d) => !isWeekend(d)
    );

    return weekDays.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayName = DAY_NAMES[getDay(day)]?.toUpperCase() ?? "";

      const dayMembers = members.map((m) => {
        const dayEntries = m.entries.filter((e) => e.date === dateStr);
        const hours = dayEntries.length;
        const withProof = dayEntries.filter(
          (e) => e.proof_urls && e.proof_urls.length > 0
        ).length;
        const proofPct = hours > 0 ? Math.round((withProof / hours) * 100) : 0;
        const lateCount = dayEntries.filter((e) => e.is_late).length;

        const events: string[] = [];
        if (hours === 0) events.push("Sin entradas");
        if (lateCount > 0) events.push(`${lateCount} tardía${lateCount > 1 ? "s" : ""}`);
        const dayFlags = m.flags.filter((f) => f.date === dateStr);
        if (dayFlags.length > 0) events.push(`${dayFlags.length} flag${dayFlags.length > 1 ? "s" : ""}`);

        return {
          userId: m.userId,
          name: m.profile?.full_name ?? m.profile?.email ?? "Sin nombre",
          hours,
          proofPercent: proofPct,
          lateCount,
          notableEvents: events,
        };
      });

      // Worst = fewest hours, then lowest proof
      const sorted = [...dayMembers].sort(
        (a, b) => a.hours - b.hours || a.proofPercent - b.proofPercent
      );
      const best = [...dayMembers].sort(
        (a, b) => b.hours - a.hours || b.proofPercent - a.proofPercent
      );

      return {
        date: dateStr,
        dayName,
        members: dayMembers,
        worstUserId: sorted[0]?.userId ?? null,
        bestUserId: best[0]?.userId ?? null,
      };
    });
  }, [members, weekRange]);

  // Awards
  const awards = useMemo((): WeeklyAward[] => {
    if (members.length === 0) return [];
    const getName = (m: MemberWeekData) =>
      m.profile?.full_name ?? m.profile?.email ?? "Desconocido";

    const sorted = [...members];
    const result: WeeklyAward[] = [];

    // Fantasma — fewest hours
    const ghost = sorted.reduce((min, m) => (m.totalHours < min.totalHours ? m : min), sorted[0]);
    if (ghost) {
      result.push({
        title: "Fantasma de la Semana",
        icon: <Ghost className="w-5 h-5" />,
        name: getName(ghost),
        detail: `${ghost.totalHours} horas en 5 días`,
        isPositive: false,
      });
    }

    // Mentiroso — lowest proof %
    const liar = sorted.reduce((min, m) => (m.proofPercent < min.proofPercent ? m : min), sorted[0]);
    if (liar) {
      result.push({
        title: "Mentiroso de la Semana",
        icon: <ShieldAlert className="w-5 h-5" />,
        name: getName(liar),
        detail: `${liar.proofPercent}% de entradas sin evidencia`,
        isPositive: false,
      });
    }

    // Tortuga — most late entries
    const turtle = sorted.reduce(
      (max, m) => {
        const lateCount = m.entries.filter((e) => e.is_late).length;
        const maxLate = max.entries.filter((e) => e.is_late).length;
        return lateCount > maxLate ? m : max;
      },
      sorted[0]
    );
    if (turtle) {
      const lateCount = turtle.entries.filter((e) => e.is_late).length;
      result.push({
        title: "Tortuga de la Semana",
        icon: <Turtle className="w-5 h-5" />,
        name: getName(turtle),
        detail: `${lateCount} entradas tardías`,
        isPositive: false,
      });
    }

    // Vago — lowest avg words per description
    const lazy = sorted.reduce(
      (min, m) => (m.avgDescriptionWords < min.avgDescriptionWords ? m : min),
      sorted[0]
    );
    if (lazy) {
      result.push({
        title: "Vago de la Semana",
        icon: <FileText className="w-5 h-5" />,
        name: getName(lazy),
        detail: `promedio de ${lazy.avgDescriptionWords} palabras por descripción`,
        isPositive: false,
      });
    }

    // Máquina — most hours + best proof
    const machine = sorted.reduce(
      (best, m) => {
        const score = m.totalHours * (m.proofPercent / 100);
        const bestScore = best.totalHours * (best.proofPercent / 100);
        return score > bestScore ? m : best;
      },
      sorted[0]
    );
    if (machine) {
      result.push({
        title: "Máquina de la Semana",
        icon: <Zap className="w-5 h-5" />,
        name: getName(machine),
        detail: `${machine.totalHours} horas, ${machine.proofPercent}% evidencia`,
        isPositive: true,
      });
    }

    // Madrugador — earliest first log
    const earlyBird = sorted
      .filter((m) => m.earliestLogAvg !== null)
      .reduce<MemberWeekData | null>(
        (best, m) => {
          if (!best || (m.earliestLogAvg ?? 24) < (best.earliestLogAvg ?? 24)) return m;
          return best;
        },
        null
      );
    if (earlyBird && earlyBird.earliestLogAvg !== null) {
      const h = Math.floor(earlyBird.earliestLogAvg);
      const min = Math.round((earlyBird.earliestLogAvg - h) * 60);
      result.push({
        title: "Madrugador de la Semana",
        icon: <Sunrise className="w-5 h-5" />,
        name: getName(earlyBird),
        detail: `primera entrada a las ${h}:${min.toString().padStart(2, "0")} promedio`,
        isPositive: true,
      });
    }

    return result;
  }, [members]);

  // Shameful patterns
  const patterns = useMemo((): ShamefulPattern[] => {
    if (members.length === 0) return [];
    const result: ShamefulPattern[] = [];
    const getName = (m: MemberWeekData) =>
      m.profile?.full_name ?? m.profile?.email ?? "Desconocido";

    const weekStart = new Date(weekRange.start + "T12:00:00");
    const weekEnd = new Date(weekRange.end + "T12:00:00");
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })
      .filter((d) => !isWeekend(d))
      .map((d) => format(d, "yyyy-MM-dd"));
    const weekDayCount = weekDays.length || 5;

    for (const m of members) {
      // No closeout
      const closeoutDays = new Set(m.closeouts.map((c) => c.date));
      const missingCloseouts = weekDayCount - closeoutDays.size;
      if (missingCloseouts > 0) {
        result.push({
          userId: m.userId,
          name: getName(m),
          pattern: `no registró closeout ${missingCloseouts} de ${weekDayCount} días`,
        });
      }

      // Duplicate descriptions
      const descriptions = m.entries
        .map((e) => (e.description || "").trim().toLowerCase())
        .filter((d) => d.length > 5);
      const descCounts = new Map<string, number>();
      for (const d of descriptions) {
        descCounts.set(d, (descCounts.get(d) || 0) + 1);
      }
      for (const [desc, count] of descCounts) {
        if (count >= 3) {
          result.push({
            userId: m.userId,
            name: getName(m),
            pattern: `copió descripciones idénticas ${count} veces`,
          });
          break;
        }
      }

      // Backfilling — all entries logged after 5pm
      const after5pm = m.entries.filter((e) => {
        const loggedHour = new Date(e.logged_at).getHours();
        return loggedHour >= 17;
      });
      if (m.entries.length > 0 && after5pm.length === m.entries.length) {
        result.push({
          userId: m.userId,
          name: getName(m),
          pattern: `registró todas las entradas después de las 5pm (backfilling)`,
        });
      }

      // Low detail descriptions
      if (m.avgDescriptionWords > 0 && m.avgDescriptionWords <= 5) {
        result.push({
          userId: m.userId,
          name: getName(m),
          pattern: `promedió ${m.avgDescriptionWords} palabras por descripción`,
        });
      }
    }

    return result;
  }, [members, weekRange]);

  // Comparison to previous week
  const comparisons = useMemo(() => {
    return members.map((m) => {
      const getName = (m: MemberWeekData) =>
        m.profile?.full_name ?? m.profile?.email ?? "Desconocido";
      const hoursDiff = m.totalHours - m.prevTotalHours;
      const proofDiff = m.proofPercent - m.prevProofPercent;
      const improved = hoursDiff > 0 || proofDiff > 5;
      const worsened = hoursDiff < -2 || proofDiff < -10;
      return {
        userId: m.userId,
        name: getName(m),
        hoursDiff,
        proofDiff,
        status: improved ? ("improved" as const) : worsened ? ("worsened" as const) : ("stable" as const),
      };
    });
  }, [members]);

  // Team grade
  const teamGrade = useMemo(() => computeTeamGrade(members), [members]);

  // ============================================================
  // Render
  // ============================================================

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
        <p className="text-muted-foreground font-mono text-sm">Sin organización</p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <Skull className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground font-mono text-sm">Sin datos para esta semana</p>
        </div>
      </div>
    );
  }

  const getName = (userId: string) => {
    const p = profileMap.get(userId);
    return p?.full_name ?? p?.email ?? "Desconocido";
  };

  const topMember = members[0];
  const bottomMember = members[members.length - 1];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* =============== MASTHEAD =============== */}
      <div className="border-t-4 border-foreground mb-8">
        <div className="border-b border-border py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-mono font-bold tracking-tight uppercase">
                Informe Semanal de Vergüenza
              </h1>
              <p className="font-mono text-xs text-muted-foreground mt-1">
                El documento definitivo de accountability. Cada nombre. Cada falla. Cada comparación.
              </p>
            </div>
            <Skull className="w-8 h-8 text-primary shrink-0" />
          </div>

          {/* Week navigation */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              className="w-8 h-8 flex items-center justify-center border border-border hover:bg-accent transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-sm font-bold tracking-tight uppercase">
              {weekRange.startDisplay} — {weekRange.endDisplay}
            </span>
            <button
              onClick={() => canGoNext && setWeekOffset((o) => o + 1)}
              disabled={!canGoNext}
              className={cn(
                "w-8 h-8 flex items-center justify-center border border-border transition-colors",
                canGoNext ? "hover:bg-accent" : "opacity-30 cursor-not-allowed"
              )}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* =============== RANKING FINAL =============== */}
      <section className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Ranking Final de la Semana
        </p>

        <div className="border border-border overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-3 py-2 font-bold text-[10px] tracking-wide">#</th>
                <th className="text-left px-3 py-2 font-bold text-[10px] tracking-wide">Nombre</th>
                <th className="text-right px-3 py-2 font-bold text-[10px] tracking-wide">Horas</th>
                <th className="text-right px-3 py-2 font-bold text-[10px] tracking-wide">Evidencia</th>
                <th className="text-right px-3 py-2 font-bold text-[10px] tracking-wide">Tardías</th>
                <th className="text-right px-3 py-2 font-bold text-[10px] tracking-wide">Closeout</th>
                <th className="text-right px-3 py-2 font-bold text-[10px] tracking-wide">Standup</th>
                <th className="text-right px-3 py-2 font-bold text-[10px] tracking-wide">Flags</th>
                <th className="text-center px-3 py-2 font-bold text-[10px] tracking-wide">Nota</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === members.length - 1;
                const name = m.profile?.full_name ?? m.profile?.email ?? "Sin nombre";
                return (
                  <tr
                    key={m.userId}
                    className={cn(
                      "border-b border-border/50 transition-colors",
                      isFirst && "bg-green-500/5",
                      isLast && members.length > 1 && "bg-red-500/5"
                    )}
                  >
                    <td className="px-3 py-2.5 font-mono tabular-nums">
                      <div className="flex items-center gap-1.5">
                        {isFirst && <Crown className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />}
                        {isLast && members.length > 1 && <Skull className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />}
                        {!isFirst && !(isLast && members.length > 1) && (
                          <span className="text-muted-foreground">{idx + 1}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-5 h-5 ring-1 ring-border">
                          <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[8px] font-mono">
                            {getInitials(m.profile?.full_name ?? null)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-bold truncate max-w-[120px]">{name}</span>
                      </div>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-mono tabular-nums font-bold",
                        m.totalHours >= teamAvg.hours
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {m.totalHours}h
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-mono tabular-nums",
                        m.proofPercent >= teamAvg.proof
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {m.proofPercent}%
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-mono tabular-nums",
                        m.latePercent <= teamAvg.late
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {m.latePercent}%
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-mono tabular-nums",
                        m.closeoutPercent >= teamAvg.closeout
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {m.closeoutPercent}%
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-mono tabular-nums",
                        m.standupPercent >= teamAvg.standup
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {m.standupPercent}%
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-mono tabular-nums",
                        m.flagCount <= teamAvg.flags
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {m.flagCount}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={cn(
                          "font-mono font-black text-sm",
                          GRADE_COLORS[m.grade] ?? "text-muted-foreground"
                        )}
                      >
                        {m.grade}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* =============== PREMIOS SEMANALES =============== */}
      <section className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Premios Semanales
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {awards.map((award, i) => (
            <div
              key={i}
              className={cn(
                "border p-3 transition-colors",
                award.isPositive
                  ? "border-green-600/30 bg-green-500/5"
                  : "border-red-600/30 bg-red-500/5"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={award.isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                  {award.icon}
                </span>
                <span className="font-mono text-[10px] font-bold tracking-wide uppercase truncate">
                  {award.title}
                </span>
              </div>
              <p className="font-mono text-sm">
                <span className="font-bold">{award.name}</span>
                <span className="text-muted-foreground"> — {award.detail}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* =============== DIA POR DIA =============== */}
      <section className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Día por Día
        </p>

        <div className="space-y-4">
          {dayBreakdown.map((day) => (
            <div key={day.date} className="border border-border">
              <div className="bg-accent/30 px-3 py-2 border-b border-border">
                <span className="font-mono text-xs font-bold tracking-wide uppercase">
                  {day.dayName} {format(new Date(day.date + "T12:00:00"), "d MMM", { locale: es })}
                </span>
              </div>
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left px-3 py-1.5 text-[10px] text-muted-foreground font-medium">
                      Nombre
                    </th>
                    <th className="text-right px-3 py-1.5 text-[10px] text-muted-foreground font-medium">
                      Horas
                    </th>
                    <th className="text-right px-3 py-1.5 text-[10px] text-muted-foreground font-medium">
                      Evidencia
                    </th>
                    <th className="text-right px-3 py-1.5 text-[10px] text-muted-foreground font-medium">
                      Tardías
                    </th>
                    <th className="text-left px-3 py-1.5 text-[10px] text-muted-foreground font-medium">
                      Eventos
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {day.members.map((dm) => {
                    const isWorst = dm.userId === day.worstUserId;
                    const isBest = dm.userId === day.bestUserId;
                    return (
                      <tr
                        key={dm.userId}
                        className={cn(
                          "border-b border-border/30",
                          isWorst && "bg-red-500/5",
                          isBest && day.members.length > 1 && "bg-green-500/5"
                        )}
                      >
                        <td className="px-3 py-1.5">
                          <span className="font-bold">{dm.name}</span>
                          {isWorst && (
                            <span className="ml-1.5 text-red-600 dark:text-red-400 text-[9px]">
                              PEOR
                            </span>
                          )}
                          {isBest && day.members.length > 1 && (
                            <span className="ml-1.5 text-green-600 dark:text-green-400 text-[9px]">
                              MEJOR
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                          {dm.hours}h
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                          {dm.proofPercent}%
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                          {dm.lateCount}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {dm.notableEvents.length > 0
                            ? dm.notableEvents.join(", ")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-1.5 bg-accent/20 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span>
                  Peor del día:{" "}
                  <span className="text-red-600 dark:text-red-400 font-bold">
                    {day.worstUserId ? getName(day.worstUserId) : "—"}
                  </span>
                </span>
                <span>
                  Mejor del día:{" "}
                  <span className="text-green-600 dark:text-green-400 font-bold">
                    {day.bestUserId ? getName(day.bestUserId) : "—"}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* =============== PATRONES VERGONZOSOS =============== */}
      {patterns.length > 0 && (
        <section className="mb-8">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Patrones Vergonzosos
          </p>
          <div className="border border-border divide-y divide-border/50">
            {patterns.map((p, i) => (
              <div key={i} className="px-3 py-2.5 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <p className="font-mono text-xs">
                  <span className="font-bold">{p.name}</span>{" "}
                  <span className="text-muted-foreground">{p.pattern}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* =============== COMPARACION SEMANA ANTERIOR =============== */}
      <section className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Comparación Semana Anterior
        </p>

        <div className="border border-border divide-y divide-border/50">
          {comparisons.map((c) => {
            const icon =
              c.status === "improved" ? (
                <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              ) : c.status === "worsened" ? (
                <TrendingDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              ) : (
                <Minus className="w-3.5 h-3.5 text-muted-foreground" />
              );

            const label =
              c.status === "improved"
                ? "Mejoró"
                : c.status === "worsened"
                  ? "Empeoró"
                  : "Estable";

            return (
              <div key={c.userId} className="px-3 py-2.5 flex items-center gap-3">
                {icon}
                <span
                  className={cn(
                    "font-mono text-[10px] font-bold uppercase w-16",
                    c.status === "improved"
                      ? "text-green-600 dark:text-green-400"
                      : c.status === "worsened"
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
                <span className="font-mono text-xs">
                  <span className="font-bold">{c.name}</span>{" "}
                  <span className="text-muted-foreground">
                    ({c.hoursDiff >= 0 ? "+" : ""}
                    {c.hoursDiff}h, {c.proofDiff >= 0 ? "+" : ""}
                    {c.proofDiff}% evidencia)
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* =============== VEREDICTO FINAL =============== */}
      <section className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Veredicto Final
        </p>

        <div className="border-2 border-foreground p-4 sm:p-6">
          <div className="flex items-center gap-4 mb-4">
            <span
              className={cn(
                "font-mono font-black text-5xl",
                GRADE_COLORS[teamGrade] ?? "text-muted-foreground"
              )}
            >
              {teamGrade}
            </span>
            <div>
              <p className="font-mono text-sm font-bold uppercase tracking-tight">
                Calificación del equipo
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Promedio de {members.length} miembro{members.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="font-mono text-xs leading-relaxed">
              El equipo registró un total de{" "}
              <span className="font-bold">
                {members.reduce((s, m) => s + m.totalHours, 0)} horas
              </span>{" "}
              esta semana con un promedio de evidencia del{" "}
              <span className="font-bold">{Math.round(teamAvg.proof)}%</span>.
              {topMember && (
                <>
                  {" "}
                  El mejor desempeño fue de{" "}
                  <span className="font-bold text-green-600 dark:text-green-400">
                    {topMember.profile?.full_name ?? topMember.profile?.email ?? "Desconocido"}
                  </span>{" "}
                  con {topMember.totalHours}h y {topMember.proofPercent}% de evidencia.
                </>
              )}
              {bottomMember && members.length > 1 && (
                <>
                  {" "}
                  El peor desempeño fue de{" "}
                  <span className="font-bold text-red-600 dark:text-red-400">
                    {bottomMember.profile?.full_name ?? bottomMember.profile?.email ?? "Desconocido"}
                  </span>{" "}
                  con {bottomMember.totalHours}h y {bottomMember.proofPercent}% de evidencia.
                </>
              )}
            </p>

            {/* Improvement areas */}
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wide mb-1">
                El equipo necesita mejorar en:
              </p>
              <ul className="space-y-1">
                {teamAvg.proof < 80 && (
                  <li className="font-mono text-xs text-muted-foreground flex items-center gap-2">
                    <span className="w-1 h-1 bg-red-500 shrink-0" />
                    Evidencia (promedio {Math.round(teamAvg.proof)}%, objetivo 80%)
                    {members
                      .filter((m) => m.proofPercent < 50)
                      .map((m) => (
                        <span key={m.userId} className="font-bold text-foreground ml-1">
                          {m.profile?.full_name ?? m.profile?.email}
                        </span>
                      ))}
                  </li>
                )}
                {teamAvg.closeout < 80 && (
                  <li className="font-mono text-xs text-muted-foreground flex items-center gap-2">
                    <span className="w-1 h-1 bg-red-500 shrink-0" />
                    Closeouts (promedio {Math.round(teamAvg.closeout)}%)
                    {members
                      .filter((m) => m.closeoutPercent < 40)
                      .map((m) => (
                        <span key={m.userId} className="font-bold text-foreground ml-1">
                          {m.profile?.full_name ?? m.profile?.email}
                        </span>
                      ))}
                  </li>
                )}
                {teamAvg.standup < 80 && (
                  <li className="font-mono text-xs text-muted-foreground flex items-center gap-2">
                    <span className="w-1 h-1 bg-red-500 shrink-0" />
                    Standups (promedio {Math.round(teamAvg.standup)}%)
                    {members
                      .filter((m) => m.standupPercent < 40)
                      .map((m) => (
                        <span key={m.userId} className="font-bold text-foreground ml-1">
                          {m.profile?.full_name ?? m.profile?.email}
                        </span>
                      ))}
                  </li>
                )}
                {teamAvg.late > 20 && (
                  <li className="font-mono text-xs text-muted-foreground flex items-center gap-2">
                    <span className="w-1 h-1 bg-red-500 shrink-0" />
                    Entradas tardías (promedio {Math.round(teamAvg.late)}%)
                    {members
                      .filter((m) => m.latePercent > 30)
                      .map((m) => (
                        <span key={m.userId} className="font-bold text-foreground ml-1">
                          {m.profile?.full_name ?? m.profile?.email}
                        </span>
                      ))}
                  </li>
                )}
                {teamAvg.proof >= 80 &&
                  teamAvg.closeout >= 80 &&
                  teamAvg.standup >= 80 &&
                  teamAvg.late <= 20 && (
                    <li className="font-mono text-xs text-green-600 dark:text-green-400 flex items-center gap-2">
                      <span className="w-1 h-1 bg-green-500 shrink-0" />
                      El equipo cumple con todos los estándares mínimos. Mantener el nivel.
                    </li>
                  )}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t border-border pt-4 text-center">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
          Generado automáticamente por EXOMAGRAM
        </p>
      </div>
    </div>
  );
}
