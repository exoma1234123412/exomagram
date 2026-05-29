"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type {
  Profile,
  TimeEntry,
  DailyCloseout,
  Standup,
  EntryReaction,
  AccountabilityFlag,
  WorkCategory,
} from "@/lib/types/database";
import { CATEGORIES, FLAG_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials, formatHour } from "@/lib/utils";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Quote,
  AlertTriangle,
  Trophy,
  Skull,
  Eye,
  Clock,
  Shield,
  Flame,
  Target,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  subWeeks,
  addWeeks,
  eachDayOfInterval,
  isWeekend,
  isBefore,
} from "date-fns";
import { es } from "date-fns/locale";

// ============================================================
// Types
// ============================================================

interface DayStats {
  date: string;
  dayName: string;
  entries: TimeEntry[];
  totalHours: number;
  withProof: number;
  lateCount: number;
  categories: Partial<Record<WorkCategory, number>>;
  hasCloseout: boolean;
  hasStandup: boolean;
  reactions: { verified: number; suspicious: number; impressive: number; helped_me: number };
  flags: AccountabilityFlag[];
  gaps: { from: number; to: number }[];
  isWeekend: boolean;
}

interface WeekStats {
  totalHours: number;
  totalEntries: number;
  proofRate: number;
  lateRate: number;
  closeoutRate: number;
  standupRate: number;
  bestDay: DayStats | null;
  worstDay: DayStats | null;
  totalFlags: number;
  totalReactionsReceived: number;
  suspiciousReactions: number;
  categoryBreakdown: Partial<Record<WorkCategory, number>>;
  daysWithZero: DayStats[];
  worstMoment: string;
  grade: string;
  gradeScore: number;
}

// ============================================================
// Grade configuration
// ============================================================

const GRADE_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  A: { color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/20", border: "border-green-300 dark:border-green-800", label: "Excepcional" },
  B: { color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/20", border: "border-blue-300 dark:border-blue-800", label: "Sólido" },
  C: { color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/20", border: "border-yellow-300 dark:border-yellow-800", label: "Mediocre" },
  D: { color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20", border: "border-orange-300 dark:border-orange-800", label: "Deficiente" },
  F: { color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20", border: "border-red-300 dark:border-red-800", label: "Inaceptable" },
};

// ============================================================
// Day name helpers
// ============================================================

const DAY_NAMES: Record<number, string> = {
  0: "domingo",
  1: "lunes",
  2: "martes",
  3: "miércoles",
  4: "jueves",
  5: "viernes",
  6: "sábado",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================
// Narrative generator
// ============================================================

function generateNarrative(
  name: string,
  days: DayStats[],
  week: WeekStats,
  weekStart: Date,
  weekEnd: Date
): string {
  const firstName = name.split(" ")[0];
  const lines: string[] = [];

  // Opening
  const adj = week.gradeScore >= 85
    ? "excepcional"
    : week.gradeScore >= 70
      ? "aceptable"
      : week.gradeScore >= 50
        ? "mediocre"
        : week.gradeScore >= 30
          ? "preocupante"
          : "desastrosa";

  lines.push(`${firstName} tuvo una semana ${adj}.`);
  lines.push("");

  // Day-by-day
  const workDays = days.filter((d) => !d.isWeekend);

  for (const day of workDays) {
    const dayLabel = capitalize(day.dayName);

    if (day.totalHours === 0) {
      lines.push(
        `${dayLabel}: ${firstName} no dio señales de vida. Desaparición completa. Cero entradas, cero evidencia, cero explicación.`
      );
    } else if (day.totalHours >= 8 && day.withProof === day.entries.length && day.lateCount === 0) {
      lines.push(
        `${dayLabel}: ${firstName} fue una máquina. ${day.totalHours} horas registradas, 100% con evidencia, sin una sola entrada tardía. Impecable.`
      );
    } else {
      const parts: string[] = [];
      parts.push(`${dayLabel}: ${firstName} registró ${day.totalHours} hora${day.totalHours !== 1 ? "s" : ""}`);

      if (day.lateCount > 0) {
        if (day.lateCount === day.entries.length) {
          parts.push(
            `Cada entrada fue tardía. Como si el reloj fuera una sugerencia.`
          );
        } else {
          parts.push(`${day.lateCount} de ${day.entries.length} entradas fueron tardías.`);
        }
      }

      if (day.withProof === 0 && day.entries.length > 0) {
        parts.push(
          `${firstName} dice que trabajó, pero no hay evidencia. Palabras vacías.`
        );
      } else if (day.withProof < day.entries.length && day.entries.length > 0) {
        const noProof = day.entries.length - day.withProof;
        parts.push(
          `${noProof} de ${day.entries.length} entradas sin evidencia.`
        );
      }

      if (day.gaps.length > 0) {
        const gapDescs = day.gaps.map(
          (g) => `${formatHour(g.from)} a ${formatHour(g.to)}`
        );
        parts.push(
          `Desapareció entre las ${gapDescs.join(" y las ")}. Sin explicación.`
        );
      }

      if (!day.hasCloseout) {
        parts.push(`No cerró el día.`);
      }

      if (day.flags.length > 0) {
        const flagLabels = day.flags.map(
          (f) => FLAG_TYPES[f.flag_type]?.label ?? f.flag_type
        );
        parts.push(`Flags: ${flagLabels.join(", ")}.`);
      }

      lines.push(parts.join(" "));
    }
  }

  lines.push("");

  // Patterns
  const patterns: string[] = [];

  if (week.proofRate < 50) {
    patterns.push(
      `Un patrón preocupante: solo el ${Math.round(week.proofRate)}% de las entradas tienen evidencia. ${firstName} espera que le crean por su palabra.`
    );
  }

  if (week.lateRate > 50) {
    patterns.push(
      `Más de la mitad de las entradas fueron tardías (${Math.round(week.lateRate)}%). ${firstName} trata los plazos como sugerencias.`
    );
  }

  if (week.daysWithZero.length > 0) {
    const zeroDayNames = week.daysWithZero.map((d) => d.dayName);
    patterns.push(
      `Ausencia total ${zeroDayNames.length > 1 ? "los" : "el"} ${zeroDayNames.join(", ")}. ${zeroDayNames.length} día${zeroDayNames.length > 1 ? "s" : ""} completamente en blanco.`
    );
  }

  if (week.closeoutRate < 60) {
    patterns.push(
      `Solo cerró ${Math.round(week.closeoutRate)}% de los días. La disciplina de fin de jornada brilla por su ausencia.`
    );
  }

  if (week.suspiciousReactions > 0) {
    patterns.push(
      `Recibió ${week.suspiciousReactions} reacción${week.suspiciousReactions > 1 ? "es" : ""} de "sospechoso" del equipo. Los compañeros notan algo.`
    );
  }

  const topCategory = Object.entries(week.categoryBreakdown).sort(
    ([, a], [, b]) => (b ?? 0) - (a ?? 0)
  )[0];
  if (topCategory) {
    const catInfo = CATEGORIES[topCategory[0] as WorkCategory];
    if (catInfo) {
      patterns.push(
        `Categoría dominante: ${catInfo.label} (${topCategory[1]} horas). ${
          topCategory[0] === "meeting"
            ? "Demasiado tiempo en reuniones."
            : topCategory[0] === "break"
              ? "Demasiados descansos."
              : topCategory[0] === "deep_work"
                ? "Bien enfocado en trabajo profundo."
                : ""
        }`
      );
    }
  }

  if (patterns.length > 0) {
    lines.push("--- PATRONES ---");
    lines.push("");
    patterns.forEach((p) => lines.push(p));
    lines.push("");
  }

  // Worst moment
  if (week.worstMoment) {
    lines.push("--- PEOR MOMENTO DE LA SEMANA ---");
    lines.push("");
    lines.push(week.worstMoment);
    lines.push("");
  }

  // Verdict
  const gradeInfo = GRADE_CONFIG[week.grade] ?? GRADE_CONFIG.C;
  const verdictLine = week.gradeScore >= 85
    ? `${firstName} demostró ser confiable esta semana. El equipo puede contar con este rendimiento.`
    : week.gradeScore >= 70
      ? `${firstName} cumplió con lo mínimo aceptable. Hay margen de mejora considerable.`
      : week.gradeScore >= 50
        ? `${firstName} está por debajo del estándar. Si esto continúa, habrá consecuencias.`
        : week.gradeScore >= 30
          ? `${firstName} necesita una intervención urgente. Este nivel de rendimiento perjudica al equipo.`
          : `${firstName} fue un lastre para el equipo esta semana. Sin mejora inmediata, esto es insostenible.`;

  lines.push("--- VEREDICTO ---");
  lines.push("");
  lines.push(`Calificación: ${week.grade}. ${verdictLine}`);

  return lines.join("\n");
}

// ============================================================
// Stats calculators
// ============================================================

function calculateDayStats(
  date: string,
  entries: TimeEntry[],
  closeouts: DailyCloseout[],
  standups: Standup[],
  reactions: EntryReaction[],
  flags: AccountabilityFlag[]
): DayStats {
  const dateObj = new Date(date + "T12:00:00");
  const dayEntries = entries.filter((e) => e.date === date);
  const entryIds = new Set(dayEntries.map((e) => e.id));
  const dayReactions = reactions.filter((r) => entryIds.has(r.entry_id));
  const dayFlags = flags.filter((f) => f.date === date);

  // Calculate gaps (work hours 7-18 with no entries)
  const hoursLogged = new Set(dayEntries.map((e) => e.hour));
  const gaps: { from: number; to: number }[] = [];
  let gapStart: number | null = null;
  for (let h = 7; h <= 18; h++) {
    if (!hoursLogged.has(h)) {
      if (gapStart === null) gapStart = h;
    } else {
      if (gapStart !== null) {
        // Only count gaps of 2+ hours as meaningful
        if (h - gapStart >= 2) {
          gaps.push({ from: gapStart, to: h });
        }
        gapStart = null;
      }
    }
  }
  // Don't report trailing gaps if no entries at all (handled by zero-entry logic)
  if (gapStart !== null && dayEntries.length > 0 && 18 - gapStart >= 2) {
    gaps.push({ from: gapStart, to: 18 });
  }

  const categories: Partial<Record<WorkCategory, number>> = {};
  dayEntries.forEach((e) => {
    categories[e.category] = (categories[e.category] ?? 0) + 1;
  });

  const reactionCounts = { verified: 0, suspicious: 0, impressive: 0, helped_me: 0 };
  dayReactions.forEach((r) => {
    if (r.reaction in reactionCounts) {
      reactionCounts[r.reaction as keyof typeof reactionCounts]++;
    }
  });

  return {
    date,
    dayName: DAY_NAMES[dateObj.getDay()] ?? "?",
    entries: dayEntries,
    totalHours: dayEntries.length,
    withProof: dayEntries.filter(
      (e) => (e.proof_urls && e.proof_urls.length > 0) || (e.links && e.links.length > 0)
    ).length,
    lateCount: dayEntries.filter((e) => e.is_late).length,
    categories,
    hasCloseout: closeouts.some((c) => c.date === date),
    hasStandup: standups.some((s) => s.date === date),
    reactions: reactionCounts,
    flags: dayFlags,
    gaps,
    isWeekend: isWeekend(dateObj),
  };
}

function calculateWeekStats(days: DayStats[]): WeekStats {
  const workDays = days.filter((d) => !d.isWeekend);
  const totalHours = workDays.reduce((s, d) => s + d.totalHours, 0);
  const totalEntries = workDays.reduce((s, d) => s + d.entries.length, 0);
  const totalWithProof = workDays.reduce((s, d) => s + d.withProof, 0);
  const totalLate = workDays.reduce((s, d) => s + d.lateCount, 0);
  const closeoutDays = workDays.filter((d) => d.hasCloseout).length;
  const standupDays = workDays.filter((d) => d.hasStandup).length;
  const daysWithZero = workDays.filter((d) => d.totalHours === 0);

  const proofRate = totalEntries > 0 ? (totalWithProof / totalEntries) * 100 : 0;
  const lateRate = totalEntries > 0 ? (totalLate / totalEntries) * 100 : 0;
  const closeoutRate = workDays.length > 0 ? (closeoutDays / workDays.length) * 100 : 0;
  const standupRate = workDays.length > 0 ? (standupDays / workDays.length) * 100 : 0;

  // Best/worst day
  const rankedDays = [...workDays].sort((a, b) => {
    const scoreA = a.totalHours * 10 + a.withProof * 5 - a.lateCount * 3 - a.flags.length * 5;
    const scoreB = b.totalHours * 10 + b.withProof * 5 - b.lateCount * 3 - b.flags.length * 5;
    return scoreB - scoreA;
  });
  const bestDay = rankedDays[0] ?? null;
  const worstDay = rankedDays[rankedDays.length - 1] ?? null;

  // Category breakdown
  const categoryBreakdown: Partial<Record<WorkCategory, number>> = {};
  workDays.forEach((d) => {
    Object.entries(d.categories).forEach(([cat, count]) => {
      categoryBreakdown[cat as WorkCategory] = (categoryBreakdown[cat as WorkCategory] ?? 0) + (count ?? 0);
    });
  });

  // Total flags
  const totalFlags = workDays.reduce((s, d) => s + d.flags.length, 0);

  // Reactions
  const totalReactionsReceived = workDays.reduce(
    (s, d) => s + d.reactions.verified + d.reactions.suspicious + d.reactions.impressive + d.reactions.helped_me,
    0
  );
  const suspiciousReactions = workDays.reduce((s, d) => s + d.reactions.suspicious, 0);

  // Worst moment
  let worstMoment = "";
  if (daysWithZero.length > 0) {
    const d = daysWithZero[0];
    worstMoment = `El ${d.dayName}, cuando no registró ni una sola hora. Desaparición completa sin justificación.`;
  } else if (worstDay && worstDay.totalHours <= 3 && worstDay.totalHours > 0) {
    worstMoment = `El ${worstDay.dayName}, con solo ${worstDay.totalHours} hora${worstDay.totalHours !== 1 ? "s" : ""} registrada${worstDay.totalHours !== 1 ? "s" : ""}. Un día desperdiciado.`;
  } else if (worstDay && worstDay.lateCount > 0 && worstDay.withProof === 0) {
    worstMoment = `El ${worstDay.dayName}: ${worstDay.lateCount} entradas tardías y cero evidencia. Un día para el olvido.`;
  } else if (worstDay && worstDay.flags.length > 0) {
    const flagLabel = FLAG_TYPES[worstDay.flags[0].flag_type]?.label ?? worstDay.flags[0].flag_type;
    worstMoment = `El ${worstDay.dayName}, cuando fue señalado por: ${flagLabel}.`;
  } else {
    worstMoment = "";
  }

  // Grade calculation
  const expectedHours = workDays.length * 8;
  const hourScore = expectedHours > 0 ? Math.min((totalHours / expectedHours) * 100, 100) : 0;
  const proofScore = proofRate;
  const lateScore = 100 - lateRate;
  const closeoutScore = closeoutRate;
  const flagPenalty = totalFlags * 5;
  const suspiciousPenalty = suspiciousReactions * 10;

  const gradeScore = Math.max(
    0,
    Math.min(
      100,
      hourScore * 0.35 +
        proofScore * 0.25 +
        lateScore * 0.15 +
        closeoutScore * 0.15 +
        (standupRate * 0.10) -
        flagPenalty -
        suspiciousPenalty
    )
  );

  const grade =
    gradeScore >= 85
      ? "A"
      : gradeScore >= 70
        ? "B"
        : gradeScore >= 50
          ? "C"
          : gradeScore >= 30
            ? "D"
            : "F";

  return {
    totalHours,
    totalEntries,
    proofRate,
    lateRate,
    closeoutRate,
    standupRate,
    bestDay,
    worstDay,
    totalFlags,
    totalReactionsReceived,
    suspiciousReactions,
    categoryBreakdown,
    daysWithZero,
    worstMoment,
    grade,
    gradeScore,
  };
}

// ============================================================
// Narrative section parser (for display)
// ============================================================

interface NarrativeSection {
  type: "opening" | "daylog" | "patterns" | "worst" | "verdict";
  title?: string;
  content: string;
}

function parseNarrative(text: string): NarrativeSection[] {
  const sections: NarrativeSection[] = [];
  const lines = text.split("\n");
  let currentType: NarrativeSection["type"] = "opening";
  let currentTitle = "";
  let buffer: string[] = [];

  function flush() {
    const content = buffer.filter((l) => l.trim()).join("\n");
    if (content) {
      sections.push({ type: currentType, title: currentTitle || undefined, content });
    }
    buffer = [];
  }

  for (const line of lines) {
    if (line.startsWith("--- PATRONES ---")) {
      flush();
      currentType = "patterns";
      currentTitle = "Patrones detectados";
    } else if (line.startsWith("--- PEOR MOMENTO ---") || line.startsWith("--- PEOR MOMENTO DE LA SEMANA ---")) {
      flush();
      currentType = "worst";
      currentTitle = "Peor momento de la semana";
    } else if (line.startsWith("--- VEREDICTO ---")) {
      flush();
      currentType = "verdict";
      currentTitle = "Veredicto";
    } else {
      // After opening paragraph (first non-empty line), switch to daylog
      if (currentType === "opening" && sections.length === 0 && buffer.length > 0 && line.trim() === "") {
        flush();
        currentType = "daylog";
        currentTitle = "Día a día";
      } else {
        buffer.push(line);
      }
    }
  }
  flush();

  return sections;
}

// ============================================================
// Pull-quote extractor
// ============================================================

function extractPullQuotes(days: DayStats[], week: WeekStats, name: string): string[] {
  const firstName = name.split(" ")[0];
  const quotes: string[] = [];

  if (week.daysWithZero.length >= 2) {
    quotes.push(`${week.daysWithZero.length} días de ausencia total`);
  }

  if (week.proofRate < 30) {
    quotes.push(`Solo ${Math.round(week.proofRate)}% con evidencia`);
  }

  if (week.lateRate > 60) {
    quotes.push(`${Math.round(week.lateRate)}% de entradas tardías`);
  }

  if (week.totalHours >= 40) {
    quotes.push(`${week.totalHours} horas registradas`);
  }

  if (week.suspiciousReactions >= 3) {
    quotes.push(`${week.suspiciousReactions} reacciones sospechosas`);
  }

  if (week.totalFlags >= 5) {
    quotes.push(`${week.totalFlags} flags en la semana`);
  }

  if (week.proofRate === 100 && week.totalEntries > 10) {
    quotes.push(`100% evidencia en ${week.totalEntries} entradas`);
  }

  return quotes.slice(0, 3);
}

// ============================================================
// Component
// ============================================================

export default function ChroniclePage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = last week, -1 = 2 weeks ago, etc.
  const [loading, setLoading] = useState(false);

  // Raw data
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [closeouts, setCloseouts] = useState<DailyCloseout[]>([]);
  const [standups, setStandups] = useState<Standup[]>([]);
  const [reactions, setReactions] = useState<EntryReaction[]>([]);
  const [flags, setFlags] = useState<AccountabilityFlag[]>([]);

  const supabase = createClient();

  // Week dates
  const targetWeekStart = useMemo(() => {
    const now = new Date();
    // "Last week" = the Monday-Sunday that already passed
    const base = startOfWeek(subWeeks(now, 1 - weekOffset), { weekStartsOn: 1 });
    return base;
  }, [weekOffset]);

  const targetWeekEnd = useMemo(
    () => endOfWeek(targetWeekStart, { weekStartsOn: 1 }),
    [targetWeekStart]
  );

  const weekDates = useMemo(
    () =>
      eachDayOfInterval({ start: targetWeekStart, end: targetWeekEnd }).map(
        (d) => format(d, "yyyy-MM-dd")
      ),
    [targetWeekStart, targetWeekEnd]
  );

  const canGoForward = useMemo(() => {
    const nextWeekEnd = endOfWeek(addWeeks(targetWeekStart, 1), { weekStartsOn: 1 });
    return isBefore(nextWeekEnd, new Date());
  }, [targetWeekStart]);

  // Load members
  useEffect(() => {
    if (!orgId) return;
    async function loadMembers() {
      const { data: memberData } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId!);
      const profiles = (memberData ?? [])
        .map((md) => md.profiles)
        .filter((p): p is Profile => p !== null);
      setMembers(profiles);
    }
    loadMembers();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load data when user or week changes
  useEffect(() => {
    if (!orgId || !selectedUser) return;

    async function loadData() {
      setLoading(true);
      const dateFrom = weekDates[0];
      const dateTo = weekDates[weekDates.length - 1];

      const [entriesRes, closeoutsRes, standupsRes, flagsRes] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*")
          .eq("user_id", selectedUser!)
          .eq("org_id", orgId!)
          .gte("date", dateFrom)
          .lte("date", dateTo)
          .order("date")
          .order("hour"),
        supabase
          .from("daily_closeouts")
          .select("*")
          .eq("user_id", selectedUser!)
          .eq("org_id", orgId!)
          .gte("date", dateFrom)
          .lte("date", dateTo),
        supabase
          .from("standups")
          .select("*")
          .eq("user_id", selectedUser!)
          .eq("org_id", orgId!)
          .gte("date", dateFrom)
          .lte("date", dateTo),
        supabase
          .from("accountability_flags")
          .select("*")
          .eq("user_id", selectedUser!)
          .eq("org_id", orgId!)
          .gte("date", dateFrom)
          .lte("date", dateTo),
      ]);

      const loadedEntries = entriesRes.data ?? [];
      setEntries(loadedEntries);
      setCloseouts(closeoutsRes.data ?? []);
      setStandups(standupsRes.data ?? []);
      setFlags(flagsRes.data ?? []);

      // Load reactions for these entries
      const entryIds = loadedEntries.map((e) => e.id);
      if (entryIds.length > 0) {
        const { data: reactionsData } = await supabase
          .from("entry_reactions")
          .select("*")
          .in("entry_id", entryIds);
        setReactions(reactionsData ?? []);
      } else {
        setReactions([]);
      }

      setLoading(false);
    }

    loadData();
  }, [orgId, selectedUser, weekDates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate stats
  const dayStats = useMemo(() => {
    if (!selectedUser) return [];
    return weekDates.map((date) =>
      calculateDayStats(date, entries, closeouts, standups, reactions, flags)
    );
  }, [selectedUser, weekDates, entries, closeouts, standups, reactions, flags]);

  const weekStats = useMemo(() => calculateWeekStats(dayStats), [dayStats]);

  const selectedProfile = members.find((m) => m.id === selectedUser);
  const displayName = selectedProfile?.full_name ?? "Desconocido";

  const narrative = useMemo(() => {
    if (!selectedUser || entries.length === 0 && dayStats.every((d) => d.totalHours === 0)) {
      return "";
    }
    return generateNarrative(displayName, dayStats, weekStats, targetWeekStart, targetWeekEnd);
  }, [selectedUser, displayName, dayStats, weekStats, targetWeekStart, targetWeekEnd, entries.length]);

  const narrativeSections = useMemo(() => parseNarrative(narrative), [narrative]);
  const pullQuotes = useMemo(
    () => extractPullQuotes(dayStats, weekStats, displayName),
    [dayStats, weekStats, displayName]
  );

  const gradeConfig = GRADE_CONFIG[weekStats.grade] ?? GRADE_CONFIG.C;
  const weekLabel = `${format(targetWeekStart, "d MMM", { locale: es })} - ${format(targetWeekEnd, "d MMM yyyy", { locale: es })}`;

  // Loading
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            La Cronica
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Narrativa semanal. Pública. Sin filtros. Se lee cada lunes en el Standup.
        </p>
      </div>

      {/* Member selector */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2">
          Seleccionar persona
        </p>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <Button
              key={m.id}
              variant={selectedUser === m.id ? "default" : "outline"}
              onClick={() => setSelectedUser(m.id)}
              disabled={loading}
              className="gap-2 font-mono text-xs"
              size="sm"
            >
              <Avatar className="w-5 h-5 ring-1 ring-border">
                <AvatarImage src={m.avatar_url ?? undefined} />
                <AvatarFallback className="text-[8px]">
                  {getInitials(m.full_name)}
                </AvatarFallback>
              </Avatar>
              {m.full_name ?? m.email}
            </Button>
          ))}
        </div>
      </div>

      {/* Week navigation */}
      {selectedUser && (
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset((o) => o - 1)}
            disabled={loading}
            className="w-7 h-7"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            Semana del {weekLabel}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset((o) => o + 1)}
            disabled={loading || !canGoForward}
            className="w-7 h-7"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-10 h-10 border border-border flex items-center justify-center animate-pulse">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
            Compilando la crónica...
          </p>
        </div>
      )}

      {/* Empty state — no user selected */}
      {!selectedUser && !loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            Selecciona a una persona para generar su crónica semanal.
          </p>
        </div>
      )}

      {/* Chronicle article */}
      {selectedUser && !loading && (
        <article className="space-y-0">
          {/* Newspaper header */}
          <div className="border-t-4 border-foreground pt-4 pb-6 mb-0">
            {/* Masthead */}
            <div className="text-center mb-4">
              <p className="font-mono text-[9px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-1">
                Exomagram Chronicle / Edición Semanal
              </p>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                {weekLabel}
              </p>
            </div>

            {/* Headline */}
            <div className="text-center border-y border-border py-6">
              <div className="flex items-center justify-center gap-3 mb-3">
                <Avatar className="w-12 h-12 ring-1 ring-border">
                  <AvatarImage src={selectedProfile?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-sm font-mono">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <h2 className="text-3xl sm:text-4xl font-mono font-black tracking-tight uppercase">
                {displayName}
              </h2>
              <p className="text-sm font-mono text-muted-foreground mt-2">
                Semana del {weekLabel}
              </p>
            </div>
          </div>

          {/* Grade badge */}
          <div className="flex justify-center -mt-4 mb-8">
            <div
              className={cn(
                "flex items-center gap-3 px-5 py-3 border-2",
                gradeConfig.bg,
                gradeConfig.border
              )}
            >
              <span className={cn("text-4xl font-mono font-black", gradeConfig.color)}>
                {weekStats.grade}
              </span>
              <div className="text-left">
                <p className={cn("text-sm font-mono font-bold", gradeConfig.color)}>
                  {gradeConfig.label}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground">
                  Score: {Math.round(weekStats.gradeScore)}/100
                </p>
              </div>
            </div>
          </div>

          {/* Key stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="p-3 bg-accent/30 border border-border text-center">
              <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
                {weekStats.totalHours}
              </p>
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wide">
                Horas
              </p>
            </div>
            <div className="p-3 bg-accent/30 border border-border text-center">
              <p
                className={cn(
                  "text-2xl font-mono font-bold tabular-nums tracking-tight",
                  weekStats.proofRate >= 80
                    ? "text-green-600"
                    : weekStats.proofRate >= 50
                      ? "text-yellow-600"
                      : "text-red-600"
                )}
              >
                {Math.round(weekStats.proofRate)}%
              </p>
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wide">
                Evidencia
              </p>
            </div>
            <div className="p-3 bg-accent/30 border border-border text-center">
              <p
                className={cn(
                  "text-2xl font-mono font-bold tabular-nums tracking-tight",
                  weekStats.lateRate <= 10
                    ? "text-green-600"
                    : weekStats.lateRate <= 30
                      ? "text-yellow-600"
                      : "text-red-600"
                )}
              >
                {Math.round(weekStats.lateRate)}%
              </p>
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wide">
                Tardías
              </p>
            </div>
            <div className="p-3 bg-accent/30 border border-border text-center">
              <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
                {weekStats.totalFlags}
              </p>
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wide">
                Flags
              </p>
            </div>
          </div>

          {/* Pull quotes */}
          {pullQuotes.length > 0 && (
            <div className="mb-8 space-y-3">
              {pullQuotes.map((q, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 border-l-2 border-foreground pl-4 py-1"
                >
                  <Quote className="w-4 h-4 text-muted-foreground/30 shrink-0 mt-0.5" />
                  <p className="text-lg font-mono font-bold tracking-tight">{q}</p>
                </div>
              ))}
            </div>
          )}

          {/* Narrative body */}
          {narrativeSections.length > 0 ? (
            <div className="space-y-6 mb-8">
              {narrativeSections.map((section, i) => (
                <div key={i}>
                  {section.title && (
                    <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2 border-b border-border/50 pb-1">
                      {section.title}
                    </p>
                  )}
                  <div
                    className={cn(
                      "font-mono text-sm leading-relaxed whitespace-pre-line",
                      section.type === "verdict" && "font-bold",
                      section.type === "worst" &&
                        "border-l-2 border-red-500 pl-4 text-red-700 dark:text-red-400"
                    )}
                  >
                    {section.content}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !loading &&
            selectedUser && (
              <div className="py-12 text-center mb-8">
                <p className="text-sm text-muted-foreground font-mono">
                  No hay datos suficientes para esta semana. Cero entradas registradas.
                </p>
                <p className="text-xs text-muted-foreground/50 font-mono mt-1">
                  La ausencia de datos es, en sí misma, una historia.
                </p>
              </div>
            )
          )}

          {/* Day-by-day heatmap (visual complement) */}
          <div className="mb-8">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
              Mapa de actividad
            </p>
            <div className="grid grid-cols-7 gap-1">
              {dayStats.map((day) => {
                const intensity =
                  day.totalHours === 0
                    ? "bg-red-500/20 border-red-500/30"
                    : day.totalHours < 4
                      ? "bg-yellow-500/20 border-yellow-500/30"
                      : day.totalHours < 7
                        ? "bg-blue-500/20 border-blue-500/30"
                        : "bg-green-500/20 border-green-500/30";

                return (
                  <div
                    key={day.date}
                    className={cn(
                      "p-2 border text-center transition-colors duration-200",
                      intensity,
                      day.isWeekend && "opacity-40"
                    )}
                  >
                    <p className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-1">
                      {day.dayName.slice(0, 3)}
                    </p>
                    <p className="font-mono text-lg font-bold tabular-nums tracking-tight">
                      {day.totalHours}
                    </p>
                    <p className="font-mono text-[8px] text-muted-foreground">hrs</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      {day.withProof > 0 && (
                        <Eye className="w-2.5 h-2.5 text-green-500" />
                      )}
                      {day.lateCount > 0 && (
                        <Clock className="w-2.5 h-2.5 text-orange-500" />
                      )}
                      {day.flags.length > 0 && (
                        <AlertTriangle className="w-2.5 h-2.5 text-red-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Category breakdown */}
          {Object.keys(weekStats.categoryBreakdown).length > 0 && (
            <div className="mb-8">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
                Distribución por categoría
              </p>
              <div className="space-y-1.5">
                {Object.entries(weekStats.categoryBreakdown)
                  .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                  .map(([cat, hours]) => {
                    const catInfo = CATEGORIES[cat as WorkCategory];
                    const pct =
                      weekStats.totalHours > 0
                        ? ((hours ?? 0) / weekStats.totalHours) * 100
                        : 0;
                    return (
                      <div key={cat} className="flex items-center gap-2">
                        <span className="font-mono text-[10px] w-20 text-muted-foreground truncate">
                          {catInfo?.emoji} {catInfo?.label ?? cat}
                        </span>
                        <div className="flex-1 h-4 bg-accent/30 border border-border overflow-hidden">
                          <div
                            className={cn("h-full transition-all duration-500", catInfo?.bgColor ?? "bg-primary/20")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] tabular-nums tracking-tight w-12 text-right text-muted-foreground">
                          {hours}h ({Math.round(pct)}%)
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Best vs worst day */}
          {weekStats.bestDay && weekStats.worstDay && weekStats.bestDay.date !== weekStats.worstDay.date && (
            <div className="grid grid-cols-2 gap-3 mb-8">
              <div className="p-4 border border-green-500/20 bg-green-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-4 h-4 text-green-600" />
                  <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-green-600 font-bold">
                    Mejor día
                  </p>
                </div>
                <p className="font-mono text-sm font-bold capitalize">
                  {weekStats.bestDay.dayName}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {weekStats.bestDay.totalHours}h / {weekStats.bestDay.withProof} con evidencia
                </p>
              </div>
              <div className="p-4 border border-red-500/20 bg-red-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Skull className="w-4 h-4 text-red-600" />
                  <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-600 font-bold">
                    Peor día
                  </p>
                </div>
                <p className="font-mono text-sm font-bold capitalize">
                  {weekStats.worstDay.dayName}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {weekStats.worstDay.totalHours}h / {weekStats.worstDay.lateCount} tardías
                </p>
              </div>
            </div>
          )}

          {/* Reactions summary */}
          {weekStats.totalReactionsReceived > 0 && (
            <div className="mb-8">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
                Percepción del equipo
              </p>
              <div className="grid grid-cols-4 gap-2">
                {(["verified", "suspicious", "impressive", "helped_me"] as const).map((type) => {
                  const total = dayStats.reduce((s, d) => s + d.reactions[type], 0);
                  if (total === 0) return null;
                  const emoji =
                    type === "verified"
                      ? "✅"
                      : type === "suspicious"
                        ? "🤔"
                        : type === "impressive"
                          ? "🔥"
                          : "🙏";
                  const label =
                    type === "verified"
                      ? "Confirmo"
                      : type === "suspicious"
                        ? "Sospechoso"
                        : type === "impressive"
                          ? "Impresionante"
                          : "Me ayudó";
                  return (
                    <div
                      key={type}
                      className="p-2 bg-accent/30 border border-border text-center"
                    >
                      <p className="text-lg">{emoji}</p>
                      <p className="font-mono text-sm font-bold tabular-nums">{total}</p>
                      <p className="font-mono text-[8px] text-muted-foreground uppercase">
                        {label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer / colophon */}
          <div className="border-t border-border pt-4 text-center">
            <p className="font-mono text-[8px] tracking-[0.2em] uppercase text-muted-foreground/30">
              Generado por Exomagram Chronicle Engine / Datos verificados del sistema
            </p>
            <p className="font-mono text-[8px] tracking-[0.2em] uppercase text-muted-foreground/20 mt-1">
              Esta crónica se genera automáticamente y no puede ser editada ni eliminada.
            </p>
          </div>
        </article>
      )}
    </div>
  );
}
