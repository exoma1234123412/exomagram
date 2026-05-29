"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  TimeEntry,
  DailyCloseout,
  Standup,
  TrustScoreHistory,
} from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY, formatHour } from "@/lib/utils";
import { format, subDays, getDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Brain,
  AlertTriangle,
  TrendingDown,
  Clock,
  Ghost,
  Users,
  BarChart3,
  CheckCircle2,
  XCircle,
  Minus,
  Activity,
  ChevronRight,
  Eye,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface MemberData {
  userId: string;
  profile: Profile;
  entriesToday: TimeEntry[];
  entries30d: TimeEntry[];
  closeouts30d: DailyCloseout[];
  standups30d: Standup[];
  trustHistory: TrustScoreHistory[];
  standupToday: boolean;
}

type RiskLevel = "BAJO" | "MEDIO" | "ALTO" | "CRITICO";

interface HoursPrediction {
  predictedHours: number;
  currentHours: number;
  confidence: number; // 0-100
  projectedFinal: number;
  avgForDay: number;
  stdDev: number;
}

interface CloseoutPrediction {
  noCloseoutProbability: number; // 0-100
  closeoutRateForDay: number;
  totalDaysChecked: number;
}

interface LateEntryPrediction {
  lateEntryProbability: number; // 0-100
  lateRateForDay: number;
}

interface GhostPrediction {
  ghostProbability: number; // 0-100
  thresholdHour: number;
  hasLoggedByThreshold: boolean;
}

interface MemberPrediction {
  userId: string;
  profile: Profile;
  hours: HoursPrediction;
  closeout: CloseoutPrediction;
  lateEntry: LateEntryPrediction;
  ghost: GhostPrediction;
  riskLevel: RiskLevel;
  riskScore: number; // 0-100 composite
  riskFactors: string[];
  standupToday: boolean;
}

interface TeamPrediction {
  predictedTotalHours: number;
  predictedProofRate: number;
  failureProbability: number; // prob of missing 40 total hours
  dayRating: "BUENO" | "REGULAR" | "MALO";
}

interface HistoricalPrediction {
  date: string;
  predictedHours: number;
  actualHours: number;
  predictedRating: "BUENO" | "REGULAR" | "MALO";
  actualRating: "BUENO" | "REGULAR" | "MALO";
  wasAccurate: boolean;
}

// ============================================================
// Utility Functions
// ============================================================

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map((v) => Math.pow(v - mean, 2));
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function getCurrentHourMTY(): number {
  const now = new Date();
  const mtyTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Monterrey",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return parseInt(mtyTime, 10);
}

function getDayOfWeekMTY(): number {
  const now = new Date();
  const mtyDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
  }).format(now);
  return getDay(parseISO(mtyDate));
}

function getRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "CRITICO";
  if (score >= 50) return "ALTO";
  if (score >= 30) return "MEDIO";
  return "BAJO";
}

function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case "CRITICO":
      return "text-red-400";
    case "ALTO":
      return "text-red-400";
    case "MEDIO":
      return "text-amber-400";
    case "BAJO":
      return "text-emerald-400";
  }
}

function getRiskBg(level: RiskLevel): string {
  switch (level) {
    case "CRITICO":
      return "bg-red-500/10 border-red-500/30";
    case "ALTO":
      return "bg-red-500/8 border-red-500/20";
    case "MEDIO":
      return "bg-amber-500/8 border-amber-500/20";
    case "BAJO":
      return "bg-emerald-500/8 border-emerald-500/20";
  }
}

function getDayName(day: number): string {
  const names = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];
  return names[day] ?? "";
}

// ============================================================
// Prediction Engine
// ============================================================

function buildHoursPrediction(
  member: MemberData,
  todayDow: number,
  currentHour: number
): HoursPrediction {
  const today = getTodayMTY();
  const currentHours = member.entriesToday.length;

  // Get entries for same day of week in the last 30 days
  const sameDayEntries: Map<string, number> = new Map();
  for (const entry of member.entries30d) {
    const entryDow = getDay(parseISO(entry.date));
    if (entryDow === todayDow && entry.date !== today) {
      sameDayEntries.set(
        entry.date,
        (sameDayEntries.get(entry.date) ?? 0) + 1
      );
    }
  }

  const hourValues = Array.from(sameDayEntries.values());
  if (hourValues.length === 0) {
    // Fallback: use all days
    const allDayEntries: Map<string, number> = new Map();
    for (const entry of member.entries30d) {
      if (entry.date !== today) {
        allDayEntries.set(
          entry.date,
          (allDayEntries.get(entry.date) ?? 0) + 1
        );
      }
    }
    const allValues = Array.from(allDayEntries.values());
    const avg =
      allValues.length > 0
        ? allValues.reduce((a, b) => a + b, 0) / allValues.length
        : 8;
    return {
      predictedHours: avg,
      currentHours,
      confidence: 30,
      projectedFinal: currentHour >= 17 ? currentHours : Math.round(avg),
      avgForDay: avg,
      stdDev: stdDev(allValues),
    };
  }

  const avg = hourValues.reduce((a, b) => a + b, 0) / hourValues.length;
  const sd = stdDev(hourValues);
  const confidence = Math.min(100, Math.max(20, 100 - sd * 15));

  // Project final based on current rate
  let projectedFinal: number;
  if (currentHour < 10) {
    projectedFinal = Math.round(avg);
  } else if (currentHour >= 18) {
    projectedFinal = currentHours;
  } else {
    // Linear projection based on current pace
    const workHoursLeft = Math.max(0, 18 - currentHour);
    const workHoursElapsed = Math.max(1, currentHour - 8);
    const rate = currentHours / workHoursElapsed;
    projectedFinal = Math.round(currentHours + rate * workHoursLeft);

    // Blend with historical average
    const weight = Math.min(1, (currentHour - 8) / 10);
    projectedFinal = Math.round(
      projectedFinal * weight + avg * (1 - weight)
    );
  }

  return {
    predictedHours: avg,
    currentHours,
    confidence: Math.round(confidence),
    projectedFinal: Math.max(projectedFinal, currentHours),
    avgForDay: avg,
    stdDev: sd,
  };
}

function buildCloseoutPrediction(
  member: MemberData,
  todayDow: number
): CloseoutPrediction {
  const today = getTodayMTY();

  // Count how many same-day-of-week dates have closeouts in last 30 days
  const sameDayDates = new Set<string>();
  for (const entry of member.entries30d) {
    if (entry.date !== today && getDay(parseISO(entry.date)) === todayDow) {
      sameDayDates.add(entry.date);
    }
  }

  const closeoutDates = new Set(
    member.closeouts30d
      .filter(
        (c) => c.date !== today && getDay(parseISO(c.date)) === todayDow
      )
      .map((c) => c.date)
  );

  const totalDays = sameDayDates.size;
  if (totalDays === 0) {
    // Fallback: use overall closeout rate
    const allDates = new Set(
      member.entries30d.filter((e) => e.date !== today).map((e) => e.date)
    );
    const allCloseouts = new Set(
      member.closeouts30d.filter((c) => c.date !== today).map((c) => c.date)
    );
    const rate =
      allDates.size > 0 ? allCloseouts.size / allDates.size : 0.5;
    return {
      noCloseoutProbability: Math.round((1 - rate) * 100),
      closeoutRateForDay: rate,
      totalDaysChecked: allDates.size,
    };
  }

  const closeoutCount = Array.from(sameDayDates).filter((d) =>
    closeoutDates.has(d)
  ).length;
  const rate = closeoutCount / totalDays;

  return {
    noCloseoutProbability: Math.round((1 - rate) * 100),
    closeoutRateForDay: rate,
    totalDaysChecked: totalDays,
  };
}

function buildLateEntryPrediction(
  member: MemberData,
  todayDow: number
): LateEntryPrediction {
  const today = getTodayMTY();

  const sameDayEntries = member.entries30d.filter(
    (e) => e.date !== today && getDay(parseISO(e.date)) === todayDow
  );

  if (sameDayEntries.length === 0) {
    const allEntries = member.entries30d.filter((e) => e.date !== today);
    const lateCount = allEntries.filter((e) => e.is_late).length;
    const rate =
      allEntries.length > 0 ? lateCount / allEntries.length : 0.1;
    return {
      lateEntryProbability: Math.round(rate * 100),
      lateRateForDay: rate,
    };
  }

  const lateCount = sameDayEntries.filter((e) => e.is_late).length;
  const rate = lateCount / sameDayEntries.length;

  return {
    lateEntryProbability: Math.round(rate * 100),
    lateRateForDay: rate,
  };
}

function buildGhostPrediction(
  member: MemberData,
  todayDow: number,
  currentHour: number
): GhostPrediction {
  const today = getTodayMTY();
  const thresholdHour = Math.max(11, Math.min(currentHour + 1, 14));
  const hasLoggedByThreshold = member.entriesToday.length > 0;

  if (hasLoggedByThreshold) {
    return {
      ghostProbability: 5,
      thresholdHour,
      hasLoggedByThreshold: true,
    };
  }

  // Find days where they hadn't logged by the threshold hour
  // and count how many ended with <4 hours
  const sameDayDates = new Set<string>();
  for (const entry of member.entries30d) {
    if (entry.date !== today && getDay(parseISO(entry.date)) === todayDow) {
      sameDayDates.add(entry.date);
    }
  }

  if (sameDayDates.size === 0) {
    return {
      ghostProbability: currentHour >= 12 ? 60 : 30,
      thresholdHour,
      hasLoggedByThreshold: false,
    };
  }

  // Check each same-day: how many entries did they log?
  let lowDays = 0;
  let totalDays = 0;
  for (const date of sameDayDates) {
    const dayEntries = member.entries30d.filter((e) => e.date === date);
    totalDays++;
    if (dayEntries.length < 4) {
      lowDays++;
    }
  }

  // If they currently have 0 entries, weight the ghost probability higher
  const baseRate = totalDays > 0 ? lowDays / totalDays : 0.3;
  const timeBoost =
    currentHour >= 14 ? 0.3 : currentHour >= 12 ? 0.2 : 0.1;
  const ghostProb = Math.min(95, Math.round((baseRate + timeBoost) * 100));

  return {
    ghostProbability: ghostProb,
    thresholdHour,
    hasLoggedByThreshold: false,
  };
}

function buildMemberPrediction(
  member: MemberData,
  todayDow: number,
  currentHour: number
): MemberPrediction {
  const hours = buildHoursPrediction(member, todayDow, currentHour);
  const closeout = buildCloseoutPrediction(member, todayDow);
  const lateEntry = buildLateEntryPrediction(member, todayDow);
  const ghost = buildGhostPrediction(member, todayDow, currentHour);

  // Composite risk score
  const riskFactors: string[] = [];
  let riskScore = 0;

  // Hours risk (if projected < 6)
  if (hours.projectedFinal < 4) {
    riskScore += 35;
    riskFactors.push(
      `Proyección: solo ${hours.projectedFinal} hrs (promedio ${hours.avgForDay.toFixed(1)} para ${getDayName(todayDow)})`
    );
  } else if (hours.projectedFinal < 6) {
    riskScore += 20;
    riskFactors.push(
      `Proyección baja: ${hours.projectedFinal} hrs vs promedio ${hours.avgForDay.toFixed(1)}`
    );
  }

  // Ghost risk
  if (ghost.ghostProbability >= 50) {
    riskScore += 25;
    riskFactors.push(
      `Sin registro aún — ${ghost.ghostProbability}% probabilidad fantasma`
    );
  } else if (ghost.ghostProbability >= 30) {
    riskScore += 10;
  }

  // Closeout risk
  if (closeout.noCloseoutProbability >= 70) {
    riskScore += 15;
    riskFactors.push(
      `${closeout.noCloseoutProbability}% prob. no closeout (basado en ${closeout.totalDaysChecked} ${getDayName(todayDow)}s)`
    );
  } else if (closeout.noCloseoutProbability >= 40) {
    riskScore += 8;
  }

  // Late entry risk
  if (lateEntry.lateEntryProbability >= 50) {
    riskScore += 10;
    riskFactors.push(
      `${lateEntry.lateEntryProbability}% prob. entradas tardías`
    );
  }

  // No standup penalty
  if (!member.standupToday && currentHour >= 10) {
    riskScore += 10;
    riskFactors.push("No hizo Standup hoy");
  }

  // Current hours vs expected at this hour
  const expectedByNow = Math.max(0, Math.min(currentHour - 8, 8));
  if (
    hours.currentHours < expectedByNow * 0.5 &&
    currentHour >= 11
  ) {
    riskScore += 15;
    riskFactors.push(
      `Solo ${hours.currentHours} hrs registradas vs ${expectedByNow} esperadas para las ${formatHour(currentHour)}`
    );
  }

  riskScore = Math.min(100, riskScore);

  return {
    userId: member.userId,
    profile: member.profile,
    hours,
    closeout,
    lateEntry,
    ghost,
    riskLevel: getRiskLevel(riskScore),
    riskScore,
    riskFactors,
    standupToday: member.standupToday,
  };
}

function buildTeamPrediction(
  predictions: MemberPrediction[],
  memberCount: number
): TeamPrediction {
  const totalPredictedHours = predictions.reduce(
    (sum, p) => sum + p.hours.projectedFinal,
    0
  );

  // Proof rate prediction based on historical
  const totalCurrentEntries = predictions.reduce(
    (sum, p) => sum + p.hours.currentHours,
    0
  );

  // Simplified proof rate estimation
  const predictedProofRate = 70; // baseline — could be enhanced

  // Failure probability (missing 40 total hours)
  const target = memberCount * 8;
  const deficit = target - totalPredictedHours;
  let failureProbability: number;

  if (deficit <= 0) {
    failureProbability = 10;
  } else if (deficit <= target * 0.1) {
    failureProbability = 25;
  } else if (deficit <= target * 0.25) {
    failureProbability = 50;
  } else if (deficit <= target * 0.5) {
    failureProbability = 75;
  } else {
    failureProbability = 90;
  }

  let dayRating: "BUENO" | "REGULAR" | "MALO";
  if (failureProbability <= 25) {
    dayRating = "BUENO";
  } else if (failureProbability <= 60) {
    dayRating = "REGULAR";
  } else {
    dayRating = "MALO";
  }

  return {
    predictedTotalHours: totalPredictedHours,
    predictedProofRate,
    failureProbability,
    dayRating,
  };
}

function buildHistoricalPredictions(
  allMembers: MemberData[]
): HistoricalPrediction[] {
  const today = getTodayMTY();
  const results: HistoricalPrediction[] = [];

  // Check last 7 days
  for (let i = 1; i <= 7; i++) {
    const dateObj = subDays(parseISO(today), i);
    const date = format(dateObj, "yyyy-MM-dd");
    const dow = getDay(dateObj);

    // Skip weekends
    if (dow === 0 || dow === 6) continue;

    // Actual hours for this date
    let actualTotal = 0;
    for (const member of allMembers) {
      const dayEntries = member.entries30d.filter((e) => e.date === date);
      actualTotal += dayEntries.length;
    }

    // "Predicted" hours: average of same-DOW entries before that date
    let predictedTotal = 0;
    for (const member of allMembers) {
      const priorSameDow = member.entries30d.filter(
        (e) =>
          e.date < date && e.date !== today && getDay(parseISO(e.date)) === dow
      );
      const priorDates = new Set(priorSameDow.map((e) => e.date));
      const perDayHours: number[] = [];
      for (const d of priorDates) {
        perDayHours.push(priorSameDow.filter((e) => e.date === d).length);
      }
      const avg =
        perDayHours.length > 0
          ? perDayHours.reduce((a, b) => a + b, 0) / perDayHours.length
          : 8;
      predictedTotal += avg;
    }

    const memberCount = allMembers.length || 1;
    const target = memberCount * 8;

    const predictedRating: "BUENO" | "REGULAR" | "MALO" =
      predictedTotal >= target * 0.9
        ? "BUENO"
        : predictedTotal >= target * 0.7
          ? "REGULAR"
          : "MALO";

    const actualRating: "BUENO" | "REGULAR" | "MALO" =
      actualTotal >= target * 0.9
        ? "BUENO"
        : actualTotal >= target * 0.7
          ? "REGULAR"
          : "MALO";

    results.push({
      date,
      predictedHours: Math.round(predictedTotal),
      actualHours: actualTotal,
      predictedRating,
      actualRating,
      wasAccurate: predictedRating === actualRating,
    });
  }

  return results;
}

// ============================================================
// Main Page
// ============================================================

export default function AiPredictionsPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [membersData, setMembersData] = useState<MemberData[]>([]);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const today = getTodayMTY();
  const currentHour = getCurrentHourMTY();
  const todayDow = getDayOfWeekMTY();
  const displayDate = format(parseISO(today), "EEEE d 'de' MMMM, yyyy", {
    locale: es,
  });

  useEffect(() => {
    if (orgLoading || !orgId) return;
    loadAllData();
  }, [orgId, orgLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAllData() {
    setLoading(true);

    const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

    // 1. Get all org members + profiles
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id, profiles(id, email, full_name, avatar_url, role, timezone, work_start_hour, work_end_hour, setup_completed, created_at, updated_at)")
      .eq("org_id", orgId!);

    if (!members || members.length === 0) {
      setLoading(false);
      return;
    }

    const userIds = members.map((m) => m.user_id);

    // 2. Load all data in parallel
    const [
      entriesResult,
      closeoutsResult,
      standupsResult,
      trustResult,
    ] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("org_id", orgId!)
        .in("user_id", userIds)
        .gte("date", thirtyDaysAgo)
        .order("date", { ascending: false }),
      supabase
        .from("daily_closeouts")
        .select("*")
        .eq("org_id", orgId!)
        .in("user_id", userIds)
        .gte("date", thirtyDaysAgo),
      supabase
        .from("standups")
        .select("*")
        .eq("org_id", orgId!)
        .in("user_id", userIds)
        .gte("date", thirtyDaysAgo),
      supabase
        .from("trust_score_history")
        .select("*")
        .eq("org_id", orgId!)
        .in("user_id", userIds)
        .gte("date", thirtyDaysAgo)
        .order("date", { ascending: false }),
    ]);

    const allEntries = (entriesResult.data ?? []) as TimeEntry[];
    const allCloseouts = (closeoutsResult.data ?? []) as DailyCloseout[];
    const allStandups = (standupsResult.data ?? []) as Standup[];
    const allTrust = (trustResult.data ?? []) as TrustScoreHistory[];

    // Build per-member data
    const data: MemberData[] = members.map((m) => {
      const profile = (m.profiles as unknown as Profile) ?? {
        id: m.user_id,
        email: "",
        full_name: null,
        avatar_url: null,
        role: null,
        timezone: "America/Monterrey",
        work_start_hour: 8,
        work_end_hour: 18,
        setup_completed: false,
        created_at: "",
        updated_at: "",
      };

      const userEntries = allEntries.filter((e) => e.user_id === m.user_id);
      const userCloseouts = allCloseouts.filter(
        (c) => c.user_id === m.user_id
      );
      const userStandups = allStandups.filter(
        (s) => s.user_id === m.user_id
      );
      const userTrust = allTrust.filter((t) => t.user_id === m.user_id);

      return {
        userId: m.user_id,
        profile,
        entriesToday: userEntries.filter((e) => e.date === today),
        entries30d: userEntries,
        closeouts30d: userCloseouts,
        standups30d: userStandups,
        trustHistory: userTrust,
        standupToday: userStandups.some((s) => s.date === today),
      };
    });

    setMembersData(data);
    setLoading(false);
  }

  // ── Predictions ──
  const predictions = useMemo(() => {
    return membersData
      .map((m) => buildMemberPrediction(m, todayDow, currentHour))
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [membersData, todayDow, currentHour]);

  const teamPrediction = useMemo(() => {
    return buildTeamPrediction(predictions, membersData.length);
  }, [predictions, membersData.length]);

  const historicalPredictions = useMemo(() => {
    return buildHistoricalPredictions(membersData);
  }, [membersData]);

  const topRisks = predictions.filter((p) => p.riskScore >= 30).slice(0, 3);

  const accuracy = useMemo(() => {
    if (historicalPredictions.length === 0) return 0;
    const correct = historicalPredictions.filter((h) => h.wasAccurate).length;
    return Math.round((correct / historicalPredictions.length) * 100);
  }, [historicalPredictions]);

  // ── Loading ──
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
        <p className="text-muted-foreground font-mono text-xs">
          Crea o únete a un equipo desde el Dashboard.
        </p>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 bg-grid-palantir min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Brain className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Predicciones del Día
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground capitalize">
          {displayDate} — {formatHour(currentHour)} CST
        </p>
      </div>

      {/* ── ALERTA TEMPRANA ── */}
      {topRisks.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-400 font-semibold">
              Alerta Temprana
            </h2>
          </div>
          <div className="space-y-2">
            {topRisks.map((pred) => (
              <div
                key={pred.userId}
                className={cn(
                  "border p-4 transition-colors duration-200",
                  getRiskBg(pred.riskLevel)
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="w-8 h-8 ring-1 ring-border shrink-0">
                    <AvatarImage src={pred.profile.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px] font-mono font-bold bg-accent">
                      {getInitials(pred.profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold">
                        {pred.profile.full_name ?? pred.profile.email}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-[10px] font-bold tracking-wider",
                          getRiskColor(pred.riskLevel)
                        )}
                      >
                        {pred.riskScore}% RIESGO
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {pred.riskFactors.map((factor, i) => (
                        <p
                          key={i}
                          className="font-mono text-[11px] text-muted-foreground leading-relaxed"
                        >
                          <span className="text-muted-foreground mr-1">
                            &gt;
                          </span>
                          {factor}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── PREDICCIÓN DEL EQUIPO ── */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-3.5 h-3.5 text-primary" />
          <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground font-semibold">
            Predicción del Equipo
          </h2>
        </div>
        <div className="border border-border p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground mb-1">
                Hrs Proyectadas
              </p>
              <p className="font-mono text-2xl font-bold tabular-nums tracking-tight">
                {teamPrediction.predictedTotalHours}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                de {membersData.length * 8} objetivo
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground mb-1">
                Prob. Día Malo
              </p>
              <p
                className={cn(
                  "font-mono text-2xl font-bold tabular-nums tracking-tight",
                  teamPrediction.failureProbability >= 60
                    ? "text-red-400"
                    : teamPrediction.failureProbability >= 30
                      ? "text-amber-400"
                      : "text-emerald-400"
                )}
              >
                {teamPrediction.failureProbability}%
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground mb-1">
                Diagnóstico
              </p>
              <p
                className={cn(
                  "font-mono text-lg font-bold tracking-tight",
                  teamPrediction.dayRating === "MALO"
                    ? "text-red-400"
                    : teamPrediction.dayRating === "REGULAR"
                      ? "text-amber-400"
                      : "text-emerald-400"
                )}
              >
                {teamPrediction.dayRating}
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground mb-1">
                Precisión Modelo
              </p>
              <p className="font-mono text-2xl font-bold tabular-nums tracking-tight">
                {accuracy}%
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                últimos 7 días
              </p>
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <p className="font-mono text-[11px] text-muted-foreground">
              <span className="text-muted-foreground mr-1">&gt;</span>
              El modelo espera un día{" "}
              <span
                className={cn(
                  "font-bold",
                  teamPrediction.dayRating === "MALO"
                    ? "text-red-400"
                    : teamPrediction.dayRating === "REGULAR"
                      ? "text-amber-400"
                      : "text-emerald-400"
                )}
              >
                {teamPrediction.dayRating}
              </span>{" "}
              para el equipo — {teamPrediction.predictedTotalHours} horas
              proyectadas de {membersData.length * 8} objetivo
            </p>
          </div>
        </div>
      </section>

      {/* ── POR PERSONA ── */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-3.5 h-3.5 text-primary" />
          <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground font-semibold">
            Por Persona — {predictions.length} miembros
          </h2>
        </div>
        <div className="space-y-2">
          {predictions.map((pred) => {
            const isExpanded = expandedMember === pred.userId;
            return (
              <div
                key={pred.userId}
                className="border border-border transition-colors duration-200 hover:border-primary/30"
              >
                {/* Summary row */}
                <button
                  onClick={() =>
                    setExpandedMember(isExpanded ? null : pred.userId)
                  }
                  className="w-full px-4 py-3 flex items-center gap-3 cursor-pointer text-left"
                >
                  <Avatar className="w-7 h-7 ring-1 ring-border shrink-0">
                    <AvatarImage
                      src={pred.profile.avatar_url ?? undefined}
                    />
                    <AvatarFallback className="text-[9px] font-mono font-bold bg-accent">
                      {getInitials(pred.profile.full_name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs font-bold truncate block">
                      {pred.profile.full_name ?? pred.profile.email}
                    </span>
                  </div>

                  {/* Risk badge */}
                  <span
                    className={cn(
                      "font-mono text-[10px] font-bold tracking-wider px-2 py-0.5 border",
                      pred.riskLevel === "CRITICO" &&
                        "text-red-400 border-red-500/30 bg-red-500/10",
                      pred.riskLevel === "ALTO" &&
                        "text-red-400 border-red-500/20 bg-red-500/8",
                      pred.riskLevel === "MEDIO" &&
                        "text-amber-400 border-amber-500/20 bg-amber-500/8",
                      pred.riskLevel === "BAJO" &&
                        "text-emerald-400 border-emerald-500/20 bg-emerald-500/8"
                    )}
                  >
                    {pred.riskLevel}
                  </span>

                  {/* Projected hours */}
                  <div className="text-right shrink-0 w-16">
                    <p className="font-mono text-sm font-bold tabular-nums tracking-tight">
                      {pred.hours.projectedFinal}h
                    </p>
                    <p className="font-mono text-[9px] text-muted-foreground tabular-nums">
                      {pred.hours.currentHours}h ahora
                    </p>
                  </div>

                  <ChevronRight
                    className={cn(
                      "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0",
                      isExpanded && "rotate-90"
                    )}
                  />
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border/50">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 mb-3">
                      {/* Hours prediction */}
                      <div className="border border-border p-2.5">
                        <p className="font-mono text-[8px] tracking-wider uppercase text-muted-foreground mb-1">
                          Proyección Hrs
                        </p>
                        <p className="font-mono text-lg font-bold tabular-nums tracking-tight">
                          {pred.hours.projectedFinal}
                        </p>
                        <p className="font-mono text-[9px] text-muted-foreground">
                          Prom {getDayName(todayDow)}:{" "}
                          {pred.hours.avgForDay.toFixed(1)}h
                        </p>
                        <p className="font-mono text-[9px] text-muted-foreground">
                          Confianza: {pred.hours.confidence}%
                        </p>
                      </div>

                      {/* Closeout prediction */}
                      <div className="border border-border p-2.5">
                        <p className="font-mono text-[8px] tracking-wider uppercase text-muted-foreground mb-1">
                          No Closeout
                        </p>
                        <p
                          className={cn(
                            "font-mono text-lg font-bold tabular-nums tracking-tight",
                            pred.closeout.noCloseoutProbability >= 60
                              ? "text-red-400"
                              : pred.closeout.noCloseoutProbability >= 30
                                ? "text-amber-400"
                                : "text-emerald-400"
                          )}
                        >
                          {pred.closeout.noCloseoutProbability}%
                        </p>
                        <p className="font-mono text-[9px] text-muted-foreground">
                          Rate: {(pred.closeout.closeoutRateForDay * 100).toFixed(0)}% en{" "}
                          {getDayName(todayDow)}s
                        </p>
                      </div>

                      {/* Late entry prediction */}
                      <div className="border border-border p-2.5">
                        <p className="font-mono text-[8px] tracking-wider uppercase text-muted-foreground mb-1">
                          Entradas Tardías
                        </p>
                        <p
                          className={cn(
                            "font-mono text-lg font-bold tabular-nums tracking-tight",
                            pred.lateEntry.lateEntryProbability >= 50
                              ? "text-red-400"
                              : pred.lateEntry.lateEntryProbability >= 25
                                ? "text-amber-400"
                                : "text-emerald-400"
                          )}
                        >
                          {pred.lateEntry.lateEntryProbability}%
                        </p>
                        <p className="font-mono text-[9px] text-muted-foreground">
                          Prob. tardías hoy
                        </p>
                      </div>

                      {/* Ghost prediction */}
                      <div className="border border-border p-2.5">
                        <p className="font-mono text-[8px] tracking-wider uppercase text-muted-foreground mb-1">
                          Fantasma
                        </p>
                        <p
                          className={cn(
                            "font-mono text-lg font-bold tabular-nums tracking-tight",
                            pred.ghost.ghostProbability >= 50
                              ? "text-red-400"
                              : pred.ghost.ghostProbability >= 25
                                ? "text-amber-400"
                                : "text-emerald-400"
                          )}
                        >
                          {pred.ghost.ghostProbability}%
                        </p>
                        <p className="font-mono text-[9px] text-muted-foreground">
                          {pred.ghost.hasLoggedByThreshold
                            ? "Ya registró"
                            : `Sin registro (${formatHour(pred.ghost.thresholdHour)})`}
                        </p>
                      </div>
                    </div>

                    {/* Risk factors */}
                    {pred.riskFactors.length > 0 && (
                      <div className="border border-border p-2.5">
                        <p className="font-mono text-[8px] tracking-wider uppercase text-muted-foreground mb-2">
                          Factores de Riesgo
                        </p>
                        <div className="space-y-1">
                          {pred.riskFactors.map((factor, i) => (
                            <p
                              key={i}
                              className="font-mono text-[10px] text-muted-foreground"
                            >
                              <span className="text-red-400 mr-1.5">!</span>
                              {factor}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Status indicators */}
                    <div className="flex items-center gap-3 mt-3">
                      <span
                        className={cn(
                          "font-mono text-[9px] flex items-center gap-1",
                          pred.standupToday
                            ? "text-emerald-400"
                            : "text-muted-foreground"
                        )}
                      >
                        {pred.standupToday ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        Standup
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {pred.hours.currentHours}/{pred.hours.projectedFinal}{" "}
                        hrs
                      </span>
                      <span
                        className={cn(
                          "font-mono text-[9px] flex items-center gap-1",
                          pred.ghost.hasLoggedByThreshold
                            ? "text-emerald-400"
                            : "text-muted-foreground"
                        )}
                      >
                        <Ghost className="w-3 h-3" />
                        {pred.ghost.hasLoggedByThreshold
                          ? "Activo"
                          : "Sin actividad"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── HISTORIAL DE PREDICCIONES ── */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-3.5 h-3.5 text-primary" />
          <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground font-semibold">
            Historial de Predicciones — Últimos 7 Días
          </h2>
        </div>

        {historicalPredictions.length === 0 ? (
          <div className="border border-border p-8 flex flex-col items-center justify-center">
            <div className="w-16 h-16 border border-border flex items-center justify-center mb-3">
              <Activity className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              Sin datos históricos suficientes
            </p>
          </div>
        ) : (
          <div className="border border-border">
            {/* Table header */}
            <div className="grid grid-cols-5 gap-2 px-4 py-2 border-b border-border bg-accent/20">
              <p className="font-mono text-[8px] tracking-wider uppercase text-muted-foreground">
                Fecha
              </p>
              <p className="font-mono text-[8px] tracking-wider uppercase text-muted-foreground text-right">
                Predicho
              </p>
              <p className="font-mono text-[8px] tracking-wider uppercase text-muted-foreground text-right">
                Real
              </p>
              <p className="font-mono text-[8px] tracking-wider uppercase text-muted-foreground text-center">
                Rating
              </p>
              <p className="font-mono text-[8px] tracking-wider uppercase text-muted-foreground text-center">
                Acierto
              </p>
            </div>

            {historicalPredictions.map((h) => (
              <div
                key={h.date}
                className="grid grid-cols-5 gap-2 px-4 py-2.5 border-b border-border/50 last:border-b-0"
              >
                <p className="font-mono text-[11px] text-foreground">
                  {format(parseISO(h.date), "EEE d MMM", { locale: es })}
                </p>
                <p className="font-mono text-[11px] tabular-nums text-right text-muted-foreground">
                  {h.predictedHours}h
                </p>
                <p className="font-mono text-[11px] tabular-nums text-right font-bold">
                  {h.actualHours}h
                </p>
                <div className="flex justify-center gap-1">
                  <span
                    className={cn(
                      "font-mono text-[9px] font-bold",
                      h.predictedRating === "MALO"
                        ? "text-red-400"
                        : h.predictedRating === "REGULAR"
                          ? "text-amber-400"
                          : "text-emerald-400"
                    )}
                  >
                    {h.predictedRating}
                  </span>
                  <span className="text-muted-foreground text-[9px]">
                    &rarr;
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[9px] font-bold",
                      h.actualRating === "MALO"
                        ? "text-red-400"
                        : h.actualRating === "REGULAR"
                          ? "text-amber-400"
                          : "text-emerald-400"
                    )}
                  >
                    {h.actualRating}
                  </span>
                </div>
                <div className="flex justify-center">
                  {h.wasAccurate ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                </div>
              </div>
            ))}

            {/* Summary row */}
            <div className="px-4 py-2.5 border-t border-border bg-accent/20">
              <p className="font-mono text-[10px] text-muted-foreground">
                Precisión del modelo:{" "}
                <span className="font-bold text-foreground">
                  {accuracy}%
                </span>{" "}
                ({historicalPredictions.filter((h) => h.wasAccurate).length}/
                {historicalPredictions.length} predicciones correctas)
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── FOOTER NOTE ── */}
      <div className="border-t border-border pt-4">
        <p className="font-mono text-[9px] text-muted-foreground leading-relaxed">
          <span className="text-primary mr-1">&gt;</span>
          Las predicciones se basan en datos de los últimos 30 días, analizando
          patrones por día de la semana. El modelo actualiza proyecciones en
          tiempo real conforme avanza el día. Confianza aumenta con consistencia
          en el comportamiento.
        </p>
      </div>
    </div>
  );
}
