"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import type { WorkCategory, ReactionType } from "@/lib/types/database";
import { CATEGORIES, EXPECTED_DAILY_HOURS, ACHIEVEMENTS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, getInitials } from "@/lib/utils";
import { subDays, format, differenceInWeeks, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import {
  ClipboardCheck,
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Flame,
  Copy,
  Check,
  BarChart3,
  Clock,
  Eye,
  Users,
  Target,
  Brain,
  Activity,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Star,
  Heart,
  Zap,
  CalendarDays,
  FileText,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReliabilityComponent {
  label: string;
  value: number;
  weight: number;
}

interface OutputMetrics {
  totalHours: number;
  hoursPerDay: number;
  fullDays: number;
  incompleteDays: number;
  proofRate: number;
  projects: string[];
}

interface BehavioralPatterns {
  peakHour: number | null;
  topCategory: WorkCategory | null;
  avgGapsPerDay: number;
  ghostHoursPerWeek: number;
  lateEntryRate: number;
  closeoutRate: number;
}

interface RiskIndicator {
  label: string;
  detected: boolean;
  detail: string;
  severity: "high" | "medium" | "low";
}

interface PeerPerception {
  suspicious: number;
  verified: number;
  impressive: number;
  helped_me: number;
  netSentiment: number;
}

interface TeamComparison {
  label: string;
  userValue: number;
  teamAvg: number;
  percentile: number;
  suffix: string;
}

interface WeeklyScore {
  weekLabel: string;
  score: number;
  trend: "up" | "down" | "flat";
}

interface PerformanceReport {
  profile: Profile;
  reliabilityScore: number;
  reliabilityComponents: ReliabilityComponent[];
  output: OutputMetrics;
  behavior: BehavioralPatterns;
  risks: RiskIndicator[];
  peer: PeerPerception;
  teamComparison: TeamComparison[];
  weeklyScores: WeeklyScore[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

function scoreBgColor(score: number) {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function percentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 50;
  const sorted = [...allValues].sort((a, b) => a - b);
  const rank = sorted.filter((v) => v < value).length;
  return Math.round((rank / sorted.length) * 100);
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PerformancePage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [members, setMembers] = useState<{ user_id: string; profiles: Profile }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const supabase = createClient();

  // Load org members
  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) { setLoading(false); return; }

    async function loadMembers() {
      const { data: memberData } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId!)
        ;

      if (memberData && memberData.length > 0) {
        setMembers(memberData as { user_id: string; profiles: Profile }[]);
        setSelectedUserId(memberData[0].user_id);
      }
      setLoading(false);
    }
    loadMembers();
  }, [orgLoading, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate report when member selected
  useEffect(() => {
    if (!orgId || !selectedUserId) return;
    generateReport();
  }, [orgId, selectedUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generateReport() {
    if (!orgId || !selectedUserId) return;
    setGenerating(true);

    const now = new Date();
    const endDate = now.toISOString().split("T")[0];
    const startDate30 = subDays(now, 30).toISOString().split("T")[0];
    const startDate84 = subDays(now, 84).toISOString().split("T")[0]; // 12 weeks

    // -----------------------------------------------------------------------
    // Fetch data in parallel
    // -----------------------------------------------------------------------
    const [
      { data: userEntries },
      { data: allOrgEntries },
      { data: closeouts },
      { data: allOrgCloseouts },
      { data: streakData },
      { data: reactionsData },
      { data: flagsData },
      { data: trustHistory },
      { data: profileData },
    ] = await Promise.all([
      // User entries (30 days)
      supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("org_id", orgId)
        .gte("date", startDate30)
        .lte("date", endDate),
      // All org entries (30 days) for comparison
      supabase
        .from("time_entries")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", startDate30)
        .lte("date", endDate),
      // User closeouts (30 days)
      supabase
        .from("daily_closeouts")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("org_id", orgId)
        .gte("date", startDate30)
        .lte("date", endDate),
      // All org closeouts (30 days)
      supabase
        .from("daily_closeouts")
        .select("user_id, date")
        .eq("org_id", orgId)
        .gte("date", startDate30)
        .lte("date", endDate),
      // Streak
      supabase
        .from("activity_streaks")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("org_id", orgId)
        .single(),
      // Reactions on user's entries (all time)
      supabase
        .from("entry_reactions")
        .select("reaction, entry_id")
        .in(
          "entry_id",
          (
            await supabase
              .from("time_entries")
              .select("id")
              .eq("user_id", selectedUserId)
              .eq("org_id", orgId)
              .gte("date", startDate30)
              .lte("date", endDate)
          ).data?.map((e) => e.id) ?? []
        ),
      // Unresolved flags
      supabase
        .from("accountability_flags")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("org_id", orgId)
        .eq("resolved", false),
      // Trust score history (12 weeks)
      supabase
        .from("trust_score_history")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("org_id", orgId)
        .gte("date", startDate84)
        .lte("date", endDate)
        .order("date", { ascending: true }),
      // Profile
      supabase.from("profiles").select("*").eq("id", selectedUserId).single(),
    ]);

    if (!profileData) {
      setGenerating(false);
      return;
    }

    const entries = userEntries ?? [];
    const orgEntries = allOrgEntries ?? [];
    const userCloseouts = closeouts ?? [];
    const orgCloseouts = allOrgCloseouts ?? [];
    const profile = profileData as Profile;
    const reactions = reactionsData ?? [];
    const flags = flagsData ?? [];
    const trustScores = trustHistory ?? [];
    const streak = streakData as { current_streak: number; longest_streak: number } | null;

    // -----------------------------------------------------------------------
    // 1. Output metrics
    // -----------------------------------------------------------------------
    const totalHours = entries.length;
    const uniqueDates = new Set(entries.map((e) => e.date));
    const activeDays = uniqueDates.size;
    const hoursPerDay = activeDays > 0 ? Math.round((totalHours / activeDays) * 10) / 10 : 0;

    const hoursPerDate = new Map<string, number>();
    for (const e of entries) {
      hoursPerDate.set(e.date, (hoursPerDate.get(e.date) ?? 0) + 1);
    }
    let fullDays = 0;
    let incompleteDays = 0;
    for (const [, count] of hoursPerDate) {
      if (count >= EXPECTED_DAILY_HOURS) fullDays++;
      else incompleteDays++;
    }

    const entriesWithProof = entries.filter(
      (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
    );
    const proofRate = totalHours > 0 ? Math.round((entriesWithProof.length / totalHours) * 100) : 0;

    const projectSet = new Set<string>();
    for (const e of entries) {
      if (e.project) projectSet.add(e.project);
    }

    const output: OutputMetrics = {
      totalHours,
      hoursPerDay,
      fullDays,
      incompleteDays,
      proofRate,
      projects: Array.from(projectSet),
    };

    // -----------------------------------------------------------------------
    // 2. Behavioral patterns
    // -----------------------------------------------------------------------
    const hourCounts = new Map<number, number>();
    const categoryCounts = new Map<WorkCategory, number>();
    for (const e of entries) {
      hourCounts.set(e.hour, (hourCounts.get(e.hour) ?? 0) + 1);
      categoryCounts.set(
        e.category as WorkCategory,
        (categoryCounts.get(e.category as WorkCategory) ?? 0) + 1
      );
    }

    let peakHour: number | null = null;
    let peakCount = 0;
    for (const [h, c] of hourCounts) {
      if (c > peakCount) {
        peakHour = h;
        peakCount = c;
      }
    }

    let topCategory: WorkCategory | null = null;
    let topCatCount = 0;
    for (const [cat, c] of categoryCounts) {
      if (c > topCatCount) {
        topCategory = cat;
        topCatCount = c;
      }
    }

    // Average gaps per day (hours without entries between first and last entry)
    let totalGaps = 0;
    let daysWithEntries = 0;
    for (const [dateStr] of hoursPerDate) {
      const dayEntries = entries
        .filter((e) => e.date === dateStr)
        .map((e) => e.hour)
        .sort((a, b) => a - b);
      if (dayEntries.length >= 2) {
        daysWithEntries++;
        const minH = dayEntries[0];
        const maxH = dayEntries[dayEntries.length - 1];
        const expectedSlots = maxH - minH + 1;
        const gaps = expectedSlots - dayEntries.length;
        totalGaps += gaps;
      }
    }
    const avgGapsPerDay =
      daysWithEntries > 0 ? Math.round((totalGaps / daysWithEntries) * 10) / 10 : 0;

    // Ghost hours per week: workday hours (7-18) without entries, when user was "active" that day
    const workdayCount = activeDays;
    const workHoursPerDay = 11; // 7-17 = 11 slots
    const totalPossibleSlots = workdayCount * workHoursPerDay;
    const ghostSlots = totalPossibleSlots - totalHours;
    const weeksInPeriod = Math.max(1, Math.ceil(activeDays / 5));
    const ghostHoursPerWeek =
      activeDays > 0 ? Math.round((Math.max(0, ghostSlots) / weeksInPeriod) * 10) / 10 : 0;

    // Late entry rate
    const lateEntries = entries.filter((e) => e.is_late);
    const lateEntryRate = totalHours > 0 ? Math.round((lateEntries.length / totalHours) * 100) : 0;

    // Closeout rate
    const workdays30 = Math.min(30, 5 * Math.ceil(30 / 7)); // ~22
    const closeoutRate =
      workdays30 > 0 ? Math.round((userCloseouts.length / workdays30) * 100) : 0;

    const behavior: BehavioralPatterns = {
      peakHour,
      topCategory,
      avgGapsPerDay,
      ghostHoursPerWeek,
      lateEntryRate,
      closeoutRate,
    };

    // -----------------------------------------------------------------------
    // 3. Reliability Score (0-100) with components
    // -----------------------------------------------------------------------
    const expectedTotalHours = workdays30 * EXPECTED_DAILY_HOURS;
    const hoursConsistency = expectedTotalHours > 0 ? clamp(totalHours / expectedTotalHours, 0, 1) : 0;
    const proofRatio = proofRate / 100;
    const closeoutRatio = closeoutRate / 100;
    const punctuality = 1 - lateEntryRate / 100;
    const streakBonus = streak ? clamp(streak.current_streak / 30, 0, 1) : 0;

    const reliabilityComponents: ReliabilityComponent[] = [
      { label: "Consistencia de horas", value: Math.round(hoursConsistency * 100), weight: 25 },
      { label: "Tasa de evidencia", value: Math.round(proofRatio * 100), weight: 25 },
      { label: "Cierre del dia", value: Math.round(closeoutRatio * 100), weight: 20 },
      { label: "Puntualidad", value: Math.round(punctuality * 100), weight: 20 },
      { label: "Racha activa", value: Math.round(streakBonus * 100), weight: 10 },
    ];

    const reliabilityScore = Math.round(
      hoursConsistency * 25 +
        proofRatio * 25 +
        closeoutRatio * 20 +
        punctuality * 20 +
        streakBonus * 10
    );

    // -----------------------------------------------------------------------
    // 4. Peer Perception
    // -----------------------------------------------------------------------
    const reactionCounts: Record<ReactionType, number> = {
      suspicious: 0,
      verified: 0,
      impressive: 0,
      helped_me: 0,
    };
    for (const r of reactions) {
      if (r.reaction in reactionCounts) {
        reactionCounts[r.reaction as ReactionType]++;
      }
    }
    const netSentiment =
      reactionCounts.verified * 2 +
      reactionCounts.impressive * 3 +
      reactionCounts.helped_me * 2 -
      reactionCounts.suspicious * 4;

    const peer: PeerPerception = {
      ...reactionCounts,
      netSentiment,
    };

    // -----------------------------------------------------------------------
    // 5. Risk Indicators
    // -----------------------------------------------------------------------
    // Last 2 weeks vs previous 2 weeks
    const twoWeeksAgo = subDays(now, 14).toISOString().split("T")[0];
    const fourWeeksAgo = subDays(now, 28).toISOString().split("T")[0];
    const recentEntries = entries.filter((e) => e.date >= twoWeeksAgo);
    const previousEntries = entries.filter((e) => e.date >= fourWeeksAgo && e.date < twoWeeksAgo);
    const recentHours = recentEntries.length;
    const previousHours = previousEntries.length;

    const recentWithProof = recentEntries.filter(
      (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
    ).length;
    const previousWithProof = previousEntries.filter(
      (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
    ).length;
    const recentProofRate = recentHours > 0 ? recentWithProof / recentHours : 0;
    const previousProofRate = previousHours > 0 ? previousWithProof / previousHours : 0;

    const recentLate = recentEntries.filter((e) => e.is_late).length;
    const previousLate = previousEntries.filter((e) => e.is_late).length;
    const recentLateRate = recentHours > 0 ? recentLate / recentHours : 0;
    const previousLateRate = previousHours > 0 ? previousLate / previousHours : 0;

    // Broken streaks
    const brokenStreaks = streak ? streak.longest_streak - streak.current_streak : 0;

    // Burnout risk: high hours + declining mood
    const moods = entries.filter((e) => e.mood).map((e) => e.mood as number);
    const avgMood = moods.length > 0 ? moods.reduce((a, b) => a + b, 0) / moods.length : 3;
    const burnoutRisk = totalHours > expectedTotalHours * 0.9 && avgMood < 2.5;

    const risks: RiskIndicator[] = [
      {
        label: "Horas en declive",
        detected: previousHours > 0 && recentHours < previousHours * 0.75,
        detail: `${recentHours}h (ultimas 2 sem) vs ${previousHours}h (previas 2 sem)`,
        severity: "high",
      },
      {
        label: "Evidencia en declive",
        detected: previousProofRate > 0 && recentProofRate < previousProofRate * 0.8,
        detail: `${Math.round(recentProofRate * 100)}% vs ${Math.round(previousProofRate * 100)}% anterior`,
        severity: "medium",
      },
      {
        label: "Aumento de entradas tardias",
        detected: recentLateRate > previousLateRate + 0.1,
        detail: `${Math.round(recentLateRate * 100)}% vs ${Math.round(previousLateRate * 100)}% anterior`,
        severity: "medium",
      },
      {
        label: "Rachas rotas",
        detected: brokenStreaks > 0 && streak !== null && streak.current_streak < 3,
        detail: `Racha actual: ${streak?.current_streak ?? 0}d, maxima: ${streak?.longest_streak ?? 0}d`,
        severity: "low",
      },
      {
        label: "Flags sin resolver",
        detected: flags.length > 0,
        detail: `${flags.length} flag(s) pendiente(s)`,
        severity: "high",
      },
      {
        label: "Riesgo de burnout",
        detected: burnoutRisk,
        detail: `${totalHours}h registradas, animo promedio: ${avgMood.toFixed(1)}/5`,
        severity: "high",
      },
    ];

    // -----------------------------------------------------------------------
    // 6. Team Comparison
    // -----------------------------------------------------------------------
    const memberUserIds = members.map((m) => m.user_id);
    const memberStats = memberUserIds.map((uid) => {
      const memberEntries = orgEntries.filter((e) => e.user_id === uid);
      const memberWithProof = memberEntries.filter(
        (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
      );
      const memberLate = memberEntries.filter((e) => e.is_late);
      const memberCloseouts = orgCloseouts.filter((c) => c.user_id === uid);

      const mHours = memberEntries.length;
      const mProof = mHours > 0 ? Math.round((memberWithProof.length / mHours) * 100) : 0;
      const mCloseout =
        workdays30 > 0 ? Math.round((memberCloseouts.length / workdays30) * 100) : 0;

      // Trust score simplified
      const mHoursR = expectedTotalHours > 0 ? clamp(mHours / expectedTotalHours, 0, 1) : 0;
      const mProofR = mProof / 100;
      const mCloseR = mCloseout / 100;
      const mLateR = mHours > 0 ? memberLate.length / mHours : 0;
      const mTrust = Math.round(
        (mHoursR * 0.3 + mProofR * 0.3 + mCloseR * 0.2 - mLateR * 0.2) * 100
      );
      return { uid, hours: mHours, proof: mProof, trust: clamp(mTrust, 0, 100) };
    });

    const allHours = memberStats.map((s) => s.hours);
    const allProof = memberStats.map((s) => s.proof);
    const allTrust = memberStats.map((s) => s.trust);
    const avgHours = allHours.length > 0 ? Math.round(allHours.reduce((a, b) => a + b, 0) / allHours.length) : 0;
    const avgProof = allProof.length > 0 ? Math.round(allProof.reduce((a, b) => a + b, 0) / allProof.length) : 0;
    const avgTrust = allTrust.length > 0 ? Math.round(allTrust.reduce((a, b) => a + b, 0) / allTrust.length) : 0;

    const userStats = memberStats.find((s) => s.uid === selectedUserId);

    const teamComparison: TeamComparison[] = [
      {
        label: "Horas registradas",
        userValue: totalHours,
        teamAvg: avgHours,
        percentile: percentile(totalHours, allHours),
        suffix: "h",
      },
      {
        label: "Tasa de evidencia",
        userValue: proofRate,
        teamAvg: avgProof,
        percentile: percentile(proofRate, allProof),
        suffix: "%",
      },
      {
        label: "Trust Score",
        userValue: userStats?.trust ?? 0,
        teamAvg: avgTrust,
        percentile: percentile(userStats?.trust ?? 0, allTrust),
        suffix: "",
      },
    ];

    // -----------------------------------------------------------------------
    // 7. Weekly Scores (12 weeks)
    // -----------------------------------------------------------------------
    const weeklyScores: WeeklyScore[] = [];
    const weekMap = new Map<string, number[]>();
    for (const ts of trustScores) {
      const weekStart = startOfWeek(new Date(ts.date + "T12:00:00"), {
        weekStartsOn: 1,
      });
      const weekKey = weekStart.toISOString().split("T")[0];
      if (!weekMap.has(weekKey)) weekMap.set(weekKey, []);
      weekMap.get(weekKey)!.push(ts.score);
    }

    const sortedWeeks = Array.from(weekMap.entries()).sort(
      (a, b) => a[0].localeCompare(b[0])
    );
    for (let i = 0; i < sortedWeeks.length; i++) {
      const [weekKey, scores] = sortedWeeks[i];
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const prevAvg =
        i > 0
          ? Math.round(
              sortedWeeks[i - 1][1].reduce((a, b) => a + b, 0) /
                sortedWeeks[i - 1][1].length
            )
          : avg;
      weeklyScores.push({
        weekLabel: format(new Date(weekKey + "T12:00:00"), "d MMM", { locale: es }),
        score: avg,
        trend: avg > prevAvg + 3 ? "up" : avg < prevAvg - 3 ? "down" : "flat",
      });
    }

    // -----------------------------------------------------------------------
    // 8. Auto-generated Summary
    // -----------------------------------------------------------------------
    const name = profile.full_name ?? profile.email;
    const proofVsTeam =
      proofRate >= avgProof ? "por encima del" : "por debajo del";

    // Find key strength
    const strengthMap = [
      { key: "consistencia de horas", val: hoursConsistency },
      { key: "tasa de evidencia", val: proofRatio },
      { key: "cierres del dia", val: closeoutRatio },
      { key: "puntualidad", val: punctuality },
    ];
    strengthMap.sort((a, b) => b.val - a.val);
    const keyStrength = strengthMap[0].key;
    const keyWeakness = strengthMap[strengthMap.length - 1].key;

    const activeRisks = risks.filter((r) => r.detected);
    const riskText =
      activeRisks.length > 0
        ? activeRisks.map((r) => r.label.toLowerCase()).join(", ")
        : "ninguno detectado";

    const summary = [
      `${name} registro ${totalHours} horas en los ultimos 30 dias, promediando ${hoursPerDay}/dia.`,
      `Tasa de evidencia del ${proofRate}%, ${proofVsTeam} promedio del equipo (${avgProof}%).`,
      `Fortaleza principal: ${keyStrength}.`,
      `Area de mejora: ${keyWeakness}.`,
      `Riesgos: ${riskText}.`,
    ].join("\n");

    // -----------------------------------------------------------------------
    // Build report
    // -----------------------------------------------------------------------
    setReport({
      profile,
      reliabilityScore: clamp(reliabilityScore, 0, 100),
      reliabilityComponents,
      output,
      behavior,
      risks,
      peer,
      teamComparison,
      weeklyScores,
      summary,
    });
    setGenerating(false);
  }

  // -------------------------------------------------------------------------
  // Export as Markdown
  // -------------------------------------------------------------------------
  function exportMarkdown() {
    if (!report) return;
    const r = report;
    const lines: string[] = [];
    lines.push(`# Performance Review: ${r.profile.full_name ?? r.profile.email}`);
    lines.push(`Generado: ${format(new Date(), "d MMM yyyy, HH:mm", { locale: es })}`);
    lines.push("");

    lines.push("## Reliability Score");
    lines.push(`**${r.reliabilityScore}/100**`);
    lines.push("");
    for (const c of r.reliabilityComponents) {
      lines.push(`- ${c.label}: ${c.value}/100 (peso: ${c.weight}%)`);
    }
    lines.push("");

    lines.push("## Output (30 dias)");
    lines.push(`- Horas totales: ${r.output.totalHours}`);
    lines.push(`- Promedio/dia: ${r.output.hoursPerDay}`);
    lines.push(`- Dias completos (${EXPECTED_DAILY_HOURS}h+): ${r.output.fullDays}`);
    lines.push(`- Dias incompletos: ${r.output.incompleteDays}`);
    lines.push(`- Tasa de evidencia: ${r.output.proofRate}%`);
    if (r.output.projects.length > 0) {
      lines.push(`- Proyectos: ${r.output.projects.join(", ")}`);
    }
    lines.push("");

    lines.push("## Patrones");
    if (r.behavior.peakHour !== null) lines.push(`- Hora pico: ${r.behavior.peakHour}:00`);
    if (r.behavior.topCategory)
      lines.push(`- Categoria principal: ${CATEGORIES[r.behavior.topCategory].label}`);
    lines.push(`- Gaps promedio/dia: ${r.behavior.avgGapsPerDay}`);
    lines.push(`- Ghost hours/semana: ${r.behavior.ghostHoursPerWeek}`);
    lines.push(`- Tasa de entradas tardias: ${r.behavior.lateEntryRate}%`);
    lines.push(`- Tasa de cierres: ${r.behavior.closeoutRate}%`);
    lines.push("");

    lines.push("## Riesgos");
    const activeRisks = r.risks.filter((ri) => ri.detected);
    if (activeRisks.length === 0) {
      lines.push("Ninguno detectado.");
    } else {
      for (const ri of activeRisks) {
        lines.push(`- **${ri.label}** [${ri.severity}]: ${ri.detail}`);
      }
    }
    lines.push("");

    lines.push("## Percepcion de pares");
    lines.push(`- Verificadas: ${r.peer.verified}`);
    lines.push(`- Impresionante: ${r.peer.impressive}`);
    lines.push(`- Me ayudo: ${r.peer.helped_me}`);
    lines.push(`- Sospechoso: ${r.peer.suspicious}`);
    lines.push(`- Sentimiento neto: ${r.peer.netSentiment}`);
    lines.push("");

    lines.push("## Comparacion vs Equipo");
    for (const tc of r.teamComparison) {
      lines.push(
        `- ${tc.label}: ${tc.userValue}${tc.suffix} vs ${tc.teamAvg}${tc.suffix} (percentil ${tc.percentile})`
      );
    }
    lines.push("");

    lines.push("## Resumen");
    lines.push(r.summary);

    const md = lines.join("\n");
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary" />
          Performance Review
        </h1>
        <p className="text-muted-foreground text-sm">
          Evaluacion integral de desempeno por miembro - ultimos 30 dias
        </p>
      </div>

      {/* Member Selector */}
      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Miembro:</span>
        </div>
        <Select
          value={selectedUserId}
          onValueChange={(v) => v && setSelectedUserId(v)}
        >
          <SelectTrigger className="w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.profiles.full_name ?? m.profiles.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {report && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-2 ml-auto"
            onClick={exportMarkdown}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Exportar Markdown
              </>
            )}
          </Button>
        )}
      </div>

      {generating ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Generando reporte...
          </p>
        </div>
      ) : report ? (
        <div className="space-y-6">
          {/* Profile Header & Reliability Score */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <Avatar className="w-16 h-16 ring-2 ring-background shadow-sm">
                  <AvatarImage src={report.profile.avatar_url ?? undefined} />
                  <AvatarFallback className="text-lg">
                    {getInitials(report.profile.full_name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold">
                    {report.profile.full_name ?? report.profile.email}
                  </h2>
                  {report.profile.role && (
                    <p className="text-sm text-muted-foreground">
                      {report.profile.role}
                    </p>
                  )}
                </div>

                <div className="text-center">
                  <p
                    className={cn(
                      "text-4xl font-bold tabular-nums tracking-tight",
                      scoreColor(report.reliabilityScore)
                    )}
                  >
                    {report.reliabilityScore}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium mt-1">
                    Reliability Score
                  </p>
                </div>
              </div>

              {/* Reliability Components */}
              <div className="mt-6 space-y-3">
                {report.reliabilityComponents.map((comp) => (
                  <div key={comp.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">
                        {comp.label}{" "}
                        <span className="text-muted-foreground/60">
                          ({comp.weight}%)
                        </span>
                      </span>
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          scoreColor(comp.value)
                        )}
                      >
                        {comp.value}
                      </span>
                    </div>
                    <div className="h-2 bg-accent/60 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          scoreBgColor(comp.value)
                        )}
                        style={{ width: `${comp.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Output Metrics */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Output (30 dias)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums tracking-tight">
                    {report.output.totalHours}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Horas totales
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums tracking-tight">
                    {report.output.hoursPerDay}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Horas/dia
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums tracking-tight",
                      report.output.fullDays > report.output.incompleteDays
                        ? "text-green-600"
                        : "text-yellow-600"
                    )}
                  >
                    {report.output.fullDays}
                    <span className="text-sm text-muted-foreground font-normal">
                      /{report.output.fullDays + report.output.incompleteDays}
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Dias completos ({EXPECTED_DAILY_HOURS}h+)
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums tracking-tight",
                      report.output.proofRate >= 80
                        ? "text-green-600"
                        : report.output.proofRate >= 50
                          ? "text-yellow-600"
                          : "text-red-600"
                    )}
                  >
                    {report.output.proofRate}%
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Tasa de evidencia
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums tracking-tight">
                    {report.output.projects.length}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Proyectos
                  </p>
                </div>
              </div>

              {/* Projects list */}
              {report.output.projects.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {report.output.projects.map((p) => (
                    <Badge key={p} variant="secondary" className="text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Behavioral Patterns */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                Patrones de comportamiento
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-accent/40 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-[10px] text-muted-foreground">
                      Hora pico
                    </span>
                  </div>
                  <p className="text-lg font-bold tabular-nums">
                    {report.behavior.peakHour !== null
                      ? `${report.behavior.peakHour}:00`
                      : "-"}
                  </p>
                </div>

                <div className="p-3 bg-accent/40 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground">
                      Categoria principal
                    </span>
                  </div>
                  <p className="text-lg font-bold">
                    {report.behavior.topCategory
                      ? `${CATEGORIES[report.behavior.topCategory].emoji} ${CATEGORIES[report.behavior.topCategory].label}`
                      : "-"}
                  </p>
                </div>

                <div className="p-3 bg-accent/40 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-[10px] text-muted-foreground">
                      Gaps prom/dia
                    </span>
                  </div>
                  <p
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      report.behavior.avgGapsPerDay > 2
                        ? "text-orange-600"
                        : "text-green-600"
                    )}
                  >
                    {report.behavior.avgGapsPerDay}
                  </p>
                </div>

                <div className="p-3 bg-accent/40 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <Eye className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-[10px] text-muted-foreground">
                      Ghost hours/sem
                    </span>
                  </div>
                  <p
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      report.behavior.ghostHoursPerWeek > 20
                        ? "text-red-600"
                        : "text-green-600"
                    )}
                  >
                    {report.behavior.ghostHoursPerWeek}
                  </p>
                </div>

                <div className="p-3 bg-accent/40 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-[10px] text-muted-foreground">
                      Entradas tardias
                    </span>
                  </div>
                  <p
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      report.behavior.lateEntryRate > 20
                        ? "text-red-600"
                        : "text-green-600"
                    )}
                  >
                    {report.behavior.lateEntryRate}%
                  </p>
                </div>

                <div className="p-3 bg-accent/40 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[10px] text-muted-foreground">
                      Tasa de cierre
                    </span>
                  </div>
                  <p
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      report.behavior.closeoutRate >= 80
                        ? "text-green-600"
                        : report.behavior.closeoutRate >= 50
                          ? "text-yellow-600"
                          : "text-red-600"
                    )}
                  >
                    {report.behavior.closeoutRate}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Risk Indicators */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-primary" />
                Indicadores de riesgo
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              {report.risks.filter((r) => r.detected).length === 0 ? (
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl">
                  <Shield className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      Sin riesgos detectados
                    </p>
                    <p className="text-xs text-green-600/70 dark:text-green-500/70">
                      Todos los indicadores estan dentro de parametros normales
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {report.risks
                    .filter((r) => r.detected)
                    .sort((a, b) => {
                      const order = { high: 0, medium: 1, low: 2 };
                      return order[a.severity] - order[b.severity];
                    })
                    .map((risk, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-xl border",
                          risk.severity === "high"
                            ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                            : risk.severity === "medium"
                              ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
                              : "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800"
                        )}
                      >
                        <AlertCircle
                          className={cn(
                            "w-4 h-4 mt-0.5 shrink-0",
                            risk.severity === "high"
                              ? "text-red-600"
                              : risk.severity === "medium"
                                ? "text-orange-600"
                                : "text-yellow-600"
                          )}
                        />
                        <div>
                          <p
                            className={cn(
                              "text-sm font-medium",
                              risk.severity === "high"
                                ? "text-red-700 dark:text-red-400"
                                : risk.severity === "medium"
                                  ? "text-orange-700 dark:text-orange-400"
                                  : "text-yellow-700 dark:text-yellow-400"
                            )}
                          >
                            {risk.label}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {risk.detail}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "ml-auto text-[10px] shrink-0",
                            risk.severity === "high"
                              ? "text-red-600 border-red-300"
                              : risk.severity === "medium"
                                ? "text-orange-600 border-orange-300"
                                : "text-yellow-600 border-yellow-300"
                          )}
                        >
                          {risk.severity === "high"
                            ? "Alto"
                            : risk.severity === "medium"
                              ? "Medio"
                              : "Bajo"}
                        </Badge>
                      </div>
                    ))}
                </div>
              )}

              {/* Also show inactive risks */}
              {report.risks.filter((r) => !r.detected).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {report.risks
                    .filter((r) => !r.detected)
                    .map((risk, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="text-[10px] text-green-600 border-green-200 bg-green-50/50 dark:bg-green-950/10"
                      >
                        <Shield className="w-3 h-3 mr-1" />
                        {risk.label}
                      </Badge>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Peer Perception */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Heart className="w-4 h-4 text-primary" />
                Percepcion de pares
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums tracking-tight text-green-600">
                    {report.peer.verified}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Verificadas
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums tracking-tight text-amber-600">
                    {report.peer.impressive}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Impresionante
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums tracking-tight text-blue-600">
                    {report.peer.helped_me}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Me ayudo
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums tracking-tight",
                      report.peer.suspicious > 0
                        ? "text-red-600"
                        : "text-green-600"
                    )}
                  >
                    {report.peer.suspicious}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Sospechoso
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums tracking-tight",
                      report.peer.netSentiment >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    )}
                  >
                    {report.peer.netSentiment > 0 ? "+" : ""}
                    {report.peer.netSentiment}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Sentimiento neto
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Comparison to Team */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Comparacion vs equipo
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2 space-y-4">
              {report.teamComparison.map((tc) => {
                const diff = tc.userValue - tc.teamAvg;
                const isAbove = diff > 0;
                return (
                  <div key={tc.label}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">{tc.label}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">
                          Equipo: {tc.teamAvg}
                          {tc.suffix}
                        </span>
                        <span
                          className={cn(
                            "font-bold tabular-nums",
                            scoreColor(tc.userValue)
                          )}
                        >
                          {tc.userValue}
                          {tc.suffix}
                        </span>
                        {diff !== 0 && (
                          <span
                            className={cn(
                              "flex items-center gap-0.5",
                              isAbove ? "text-green-600" : "text-red-600"
                            )}
                          >
                            {isAbove ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {isAbove ? "+" : ""}
                            {diff}
                            {tc.suffix}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Comparison bar */}
                    <div className="relative h-3 bg-accent/60 rounded-full overflow-hidden">
                      {/* Team avg marker */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground/40 z-10"
                        style={{
                          left: `${clamp(
                            (tc.teamAvg / Math.max(tc.userValue, tc.teamAvg, 1)) * 80,
                            5,
                            95
                          )}%`,
                        }}
                      />
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          isAbove ? "bg-green-500" : "bg-orange-500"
                        )}
                        style={{
                          width: `${clamp(
                            (tc.userValue / Math.max(tc.userValue, tc.teamAvg, 1)) * 80,
                            2,
                            100
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">0</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          tc.percentile >= 75
                            ? "text-green-600 border-green-300"
                            : tc.percentile >= 50
                              ? "text-blue-600 border-blue-300"
                              : tc.percentile >= 25
                                ? "text-yellow-600 border-yellow-300"
                                : "text-red-600 border-red-300"
                        )}
                      >
                        Percentil {tc.percentile}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Performance Timeline */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                Timeline de Trust Score (12 semanas)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              {report.weeklyScores.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <CalendarDays className="w-5 h-5 text-primary/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No hay datos historicos suficientes
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-1 sm:gap-2 h-40">
                    {report.weeklyScores.map((ws, idx) => {
                      const barHeight = Math.max((ws.score / 100) * 140, 4);
                      return (
                        <div
                          key={idx}
                          className="flex-1 flex flex-col items-center gap-1"
                        >
                          <span
                            className={cn(
                              "text-[9px] font-semibold tabular-nums",
                              scoreColor(ws.score)
                            )}
                          >
                            {ws.score}
                          </span>
                          <div className="w-full relative">
                            <div
                              className={cn(
                                "w-full rounded-t-md transition-all duration-300",
                                ws.trend === "up"
                                  ? "bg-green-500"
                                  : ws.trend === "down"
                                    ? "bg-red-500"
                                    : scoreBgColor(ws.score)
                              )}
                              style={{ height: `${barHeight}px` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-1 sm:gap-2 mt-1">
                    {report.weeklyScores.map((ws, idx) => (
                      <div
                        key={idx}
                        className="flex-1 text-center text-[8px] text-muted-foreground truncate"
                      >
                        {ws.weekLabel}
                      </div>
                    ))}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-4 justify-center text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-green-500 rounded-sm" />
                      Mejorando
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-blue-500 rounded-sm" />
                      Estable
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-red-500 rounded-sm" />
                      En declive
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Auto-Generated Summary */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="w-4 h-4 text-primary" />
                Resumen automatico
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              <div className="bg-accent/40 rounded-xl p-4 space-y-2">
                {report.summary.split("\n").map((line, idx) => (
                  <p
                    key={idx}
                    className={cn(
                      "text-sm",
                      idx === 0 && "font-semibold",
                      line.startsWith("Riesgos:") &&
                        report.risks.some((r) => r.detected)
                        ? "text-red-600 dark:text-red-400 font-medium"
                        : ""
                    )}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ClipboardCheck className="w-7 h-7 text-primary/40" />
          </div>
          <p className="text-sm text-muted-foreground">
            Selecciona un miembro para generar su reporte
          </p>
        </div>
      )}
    </div>
  );
}
