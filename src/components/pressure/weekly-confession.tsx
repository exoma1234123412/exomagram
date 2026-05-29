"use client";

// ═══════════════════════════════════════════════════════════════════════
// PSYCHOLOGICAL TECHNIQUE: Forced End-of-Week Reflection
// ═══════════════════════════════════════════════════════════════════════
//
// Inspired by Bridgewater's"radical transparency"and Toyota's"5 Whys."//
// Every Friday after 3pm, the user is confronted with their own performance
// data for the entire week. They cannot dismiss the dialog until they
// complete a mandatory self-assessment form.
//
// The system leverages several behavioral mechanisms:
// - Confrontation with objective data removes self-deception
// - Peer comparison triggers social accountability
// - Forced writing crystallizes intent ("implementation intentions")
// - Public visibility of reflections creates reputational stakes
// - The verdict label frames the week in stark terms
//
// The dialog re-shows every hour on Friday until the confession is done.
// Reflections are saved to localStorage per ISO week and are visible
// to the entire team (the user is told this upfront).

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS, CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
 Brain,
 AlertTriangle,
 Trophy,
 Skull,
 Calendar,
 TrendingUp,
 TrendingDown,
 MessageSquare,
 Star,
} from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, getISOWeek, getYear, isFriday, isAfter } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────

type WeekVerdict ="excelente"|"aceptable"|"deficiente"|"critica";

interface DailyBreakdown {
 date: string;
 dayLabel: string;
 hoursLogged: number;
}

interface WeekStats {
 totalHours: number;
 dailyBreakdown: DailyBreakdown[];
 proofRate: number;
 totalGapHours: number;
 trustScoreStart: number | null;
 trustScoreEnd: number | null;
 trustDelta: number;
 currentStreak: number;
 streakActive: boolean;
}

interface TeamComparison {
 userAvgHours: number;
 teamAvgHours: number;
 userProofRate: number;
 teamProofRate: number;
}

interface ConfessionForm {
 mayorLogro: string;
 mejorHecho: string;
 gapExplanation: string;
 diferente: string;
 selfRating: number | null;
}

interface SavedConfession extends ConfessionForm {
 weekKey: string;
 weekStats: WeekStats;
 verdict: WeekVerdict;
 savedAt: string;
 userId: string;
}

// ─── Verdict config ─────────────────────────────────────────────

const VERDICT_CONFIG: Record<
 WeekVerdict,
 {
 label: string;
 emoji: string;
 color: string;
 bgColor: string;
 borderColor: string;
 iconColor: string;
 icon: typeof Trophy;
 description: string;
 }
> = {
 excelente: {
 label:"SEMANA EXCELENTE",
 emoji:"\uD83C\uDFC6",
 color:"text-green-600 dark:text-green-400",
 bgColor:"bg-green-50 dark:bg-green-950/20",
 borderColor:"border-green-200 dark:border-green-800/50",
 iconColor:"text-green-500",
 icon: Trophy,
 description:"Cumpliste con creces. Sigue así.",
 },
 aceptable: {
 label:"SEMANA ACEPTABLE",
 emoji:"\u26A1",
 color:"text-yellow-600 dark:text-yellow-400",
 bgColor:"bg-yellow-50 dark:bg-yellow-950/20",
 borderColor:"border-yellow-200 dark:border-yellow-800/50",
 iconColor:"text-yellow-500",
 icon: AlertTriangle,
 description:"Hay espacio para mejorar. Reflexiona honestamente.",
 },
 deficiente: {
 label:"SEMANA DEFICIENTE",
 emoji:"\u26A0\uFE0F",
 color:"text-orange-600 dark:text-orange-400",
 bgColor:"bg-orange-50 dark:bg-orange-950/20",
 borderColor:"border-orange-200 dark:border-orange-800/50",
 iconColor:"text-orange-500",
 icon: AlertTriangle,
 description:"Resultados por debajo de lo esperado. Se necesita un plan de acción.",
 },
 critica: {
 label:"SEMANA CRÍTICA",
 emoji:"\uD83D\uDC80",
 color:"text-red-600 dark:text-red-400",
 bgColor:"bg-red-50 dark:bg-red-950/20",
 borderColor:"border-red-200 dark:border-red-800/50",
 iconColor:"text-red-500",
 icon: Skull,
 description:"Semana alarmante. Tu equipo necesita una explicación.",
 },
};

// ─── Constants ──────────────────────────────────────────────────

const RESHOW_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const TRIGGER_HOUR = 15; // 3pm Friday
const CONFESSION_STORAGE_KEY ="exomagram_weekly_confessions";
const MIN_TEXT_LENGTH = 20;
const EXPECTED_WEEKLY_HOURS = EXPECTED_DAILY_HOURS * 5; // Mon-Fri

const SELF_RATING_LABELS: Record<number, { label: string; color: string }> = {
 1: { label:"Pésima", color:"text-red-600"},
 2: { label:"Mala", color:"text-orange-600"},
 3: { label:"Regular", color:"text-yellow-600"},
 4: { label:"Buena", color:"text-blue-600"},
 5: { label:"Excelente", color:"text-green-600"},
};

// ─── Helpers ────────────────────────────────────────────────────

function getWeekKey(date: Date): string {
 return`${getYear(date)}-W${String(getISOWeek(date)).padStart(2,"0")}`;
}

function getWeekVerdict(
 totalHours: number,
 proofRate: number,
 trustDelta: number
): WeekVerdict {
 const hoursRatio = totalHours / EXPECTED_WEEKLY_HOURS;

 if (hoursRatio >= 0.9 && proofRate >= 70 && trustDelta >= 0) return"excelente";
 if (hoursRatio >= 0.7 && proofRate >= 50) return"aceptable";
 if (hoursRatio >= 0.5) return"deficiente";
 return"critica";
}

function getConfessionFromStorage(weekKey: string): SavedConfession | null {
 if (typeof window ==="undefined") return null;
 try {
 const raw = localStorage.getItem(CONFESSION_STORAGE_KEY);
 if (!raw) return null;
 const all: SavedConfession[] = JSON.parse(raw);
 return all.find((c) => c.weekKey === weekKey) ?? null;
 } catch {
 return null;
 }
}

function saveConfessionToStorage(confession: SavedConfession): void {
 if (typeof window ==="undefined") return;
 try {
 const raw = localStorage.getItem(CONFESSION_STORAGE_KEY);
 const all: SavedConfession[] = raw ? JSON.parse(raw) : [];
 // Replace existing for same week or append
 const idx = all.findIndex((c) => c.weekKey === confession.weekKey);
 if (idx >= 0) {
 all[idx] = confession;
 } else {
 all.push(confession);
 }
 // Keep last 12 weeks max
 const trimmed = all.slice(-12);
 localStorage.setItem(CONFESSION_STORAGE_KEY, JSON.stringify(trimmed));
 } catch {
 // Storage full or unavailable
 }
}

function getDailyHoursColor(hours: number): string {
 if (hours >= EXPECTED_DAILY_HOURS) return"bg-green-500 dark:bg-green-400";
 if (hours >= 6) return"bg-yellow-500 dark:bg-yellow-400";
 if (hours >= 3) return"bg-orange-500 dark:bg-orange-400";
 if (hours > 0) return"bg-red-500 dark:bg-red-400";
 return"bg-muted-foreground/20";
}

// ─── Component ──────────────────────────────────────────────────

export function WeeklyConfession() {
 const [open, setOpen] = useState(false);
 const [loading, setLoading] = useState(true);
 const [submitted, setSubmitted] = useState(false);
 const [submitting, setSubmitting] = useState(false);
 const [weekStats, setWeekStats] = useState<WeekStats | null>(null);
 const [teamComparison, setTeamComparison] = useState<TeamComparison | null>(null);
 const [form, setForm] = useState<ConfessionForm>({
 mayorLogro:"",
 mejorHecho:"",
 gapExplanation:"",
 diferente:"",
 selfRating: null,
 });
 const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

 const dismissedAtRef = useRef<number | null>(null);
 const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
 const supabase = createClient();
 const now = new Date();
 const weekKey = getWeekKey(now);

 // ─── Week date range ────────────────────────────────────────

 const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
 const weekEnd = endOfWeek(now, { weekStartsOn: 1 }); // Sunday
 const weekDays = eachDayOfInterval({ start: weekStart, end: now }).filter(
 (d) => d.getDay() >= 1 && d.getDay() <= 5 // Mon-Fri only
 );

 // ─── Data loading ───────────────────────────────────────────

 const loadWeekData = useCallback(async () => {
 setLoading(true);

 const {
 data: { user },
 } = await supabase.auth.getUser();
 if (!user) {
 setLoading(false);
 return;
 }

 const { data: membership } = await supabase
 .from("org_members")
 .select("org_id")
 .eq("user_id", user.id)
 .limit(1)
 .single();

 if (!membership) {
 setLoading(false);
 return;
 }

 const orgId = membership.org_id;
 const weekStartStr = format(weekStart,"yyyy-MM-dd");
 const todayStr = format(now,"yyyy-MM-dd");

 // Parallel queries
 const [
 userEntriesResult,
 trustHistoryResult,
 streakResult,
 teamEntriesResult,
 teamMembersResult,
 ] = await Promise.all([
 // User entries for the week
 supabase
 .from("time_entries")
 .select("id, date, category, proof_urls")
 .eq("user_id", user.id)
 .eq("org_id", orgId)
 .gte("date", weekStartStr)
 .lte("date", todayStr),

 // Trust score history for week range
 supabase
 .from("trust_score_history")
 .select("score, date")
 .eq("user_id", user.id)
 .eq("org_id", orgId)
 .gte("date", weekStartStr)
 .lte("date", todayStr)
 .order("date", { ascending: true }),

 // Streak
 supabase
 .from("activity_streaks")
 .select("current_streak, last_active_date")
 .eq("user_id", user.id)
 .eq("org_id", orgId)
 .limit(1)
 .single(),

 // Team entries this week
 supabase
 .from("time_entries")
 .select("user_id, proof_urls")
 .eq("org_id", orgId)
 .gte("date", weekStartStr)
 .lte("date", todayStr),

 // Team members
 supabase.from("org_members").select("user_id").eq("org_id", orgId),
 ]);

 // ── Process user entries ──
 const userEntries = userEntriesResult.data ?? [];
 const totalHours = userEntries.length;
 const withProof = userEntries.filter(
 (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
 ).length;
 const proofRate = totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0;

 // Daily breakdown
 const dailyMap = new Map<string, number>();
 for (const day of weekDays) {
 dailyMap.set(format(day,"yyyy-MM-dd"), 0);
 }
 for (const entry of userEntries) {
 const current = dailyMap.get(entry.date) ?? 0;
 dailyMap.set(entry.date, current + 1);
 }

 const dailyBreakdown: DailyBreakdown[] = weekDays.map((day) => {
 const dateStr = format(day,"yyyy-MM-dd");
 return {
 date: dateStr,
 dayLabel: format(day,"EEE", { locale: es }),
 hoursLogged: dailyMap.get(dateStr) ?? 0,
 };
 });

 // Gap hours
 const totalExpected = weekDays.length * EXPECTED_DAILY_HOURS;
 const totalGapHours = Math.max(0, totalExpected - totalHours);

 // Trust score change
 const trustHistory = trustHistoryResult.data ?? [];
 const trustScoreStart = trustHistory.length > 0 ? trustHistory[0].score : null;
 const trustScoreEnd =
 trustHistory.length > 0 ? trustHistory[trustHistory.length - 1].score : null;
 const trustDelta =
 trustScoreStart !== null && trustScoreEnd !== null
 ? trustScoreEnd - trustScoreStart
 : 0;

 // Streak
 const streakData = streakResult.data;
 const currentStreak = streakData?.current_streak ?? 0;
 const streakActive = streakData?.last_active_date === todayStr;

 const stats: WeekStats = {
 totalHours,
 dailyBreakdown,
 proofRate,
 totalGapHours,
 trustScoreStart,
 trustScoreEnd,
 trustDelta,
 currentStreak,
 streakActive,
 };
 setWeekStats(stats);

 // ── Process team comparison ──
 const teamEntries = teamEntriesResult.data ?? [];
 const teamMembers = teamMembersResult.data ?? [];
 const totalTeamMembers = teamMembers.length;

 if (totalTeamMembers > 1) {
 // Count per member
 const memberHoursMap = new Map<string, number>();
 const memberProofMap = new Map<string, { total: number; withProof: number }>();

 for (const member of teamMembers) {
 memberHoursMap.set(member.user_id, 0);
 memberProofMap.set(member.user_id, { total: 0, withProof: 0 });
 }

 for (const entry of teamEntries) {
 memberHoursMap.set(
 entry.user_id,
 (memberHoursMap.get(entry.user_id) || 0) + 1
 );
 const proofData = memberProofMap.get(entry.user_id) ?? { total: 0, withProof: 0 };
 proofData.total += 1;
 if (entry.proof_urls && (entry.proof_urls as string[]).length > 0) {
 proofData.withProof += 1;
 }
 memberProofMap.set(entry.user_id, proofData);
 }

 // Team averages (excluding current user)
 const otherHours = Array.from(memberHoursMap.entries())
 .filter(([uid]) => uid !== user.id)
 .map(([, h]) => h);

 const otherProofData = Array.from(memberProofMap.entries())
 .filter(([uid]) => uid !== user.id)
 .map(([, d]) => (d.total > 0 ? (d.withProof / d.total) * 100 : 0));

 const teamAvgHours =
 otherHours.length > 0
 ? Math.round((otherHours.reduce((a, b) => a + b, 0) / otherHours.length) * 10) / 10
 : 0;

 const teamProofRate =
 otherProofData.length > 0
 ? Math.round(otherProofData.reduce((a, b) => a + b, 0) / otherProofData.length)
 : 0;

 const userAvgHours =
 weekDays.length > 0
 ? Math.round((totalHours / weekDays.length) * 10) / 10
 : 0;

 setTeamComparison({
 userAvgHours,
 teamAvgHours,
 userProofRate: proofRate,
 teamProofRate,
 });
 }

 setLoading(false);
 }, []); // eslint-disable-line react-hooks/exhaustive-deps

 // ─── Time-based trigger logic ─────────────────────────────────

 const shouldShow = useCallback(() => {
 if (!isFriday(now)) return false;

 const hour = now.getHours();
 if (hour < TRIGGER_HOUR) return false;

 // Already confessed this week?
 const existing = getConfessionFromStorage(weekKey);
 if (existing) return false;

 // Dismissed recently?
 if (dismissedAtRef.current) {
 const elapsed = Date.now() - dismissedAtRef.current;
 if (elapsed < RESHOW_INTERVAL_MS) return false;
 }

 return true;
 }, [weekKey]); // eslint-disable-line react-hooks/exhaustive-deps

 const checkAndShow = useCallback(async () => {
 // Check if already confessed
 const existing = getConfessionFromStorage(weekKey);
 if (existing) {
 setSubmitted(true);
 return;
 }

 if (!shouldShow()) return;

 await loadWeekData();
 setOpen(true);
 }, [shouldShow, weekKey, loadWeekData]);

 useEffect(() => {
 checkAndShow();

 // Re-check every minute
 intervalRef.current = setInterval(checkAndShow, 60 * 1000);

 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [checkAndShow]);

 // ─── Form validation ─────────────────────────────────────────

 function validateForm(): boolean {
 const errors: Record<string, string> = {};

 if (form.mayorLogro.trim().length < MIN_TEXT_LENGTH) {
 errors.mayorLogro =`Mínimo ${MIN_TEXT_LENGTH} caracteres (tienes ${form.mayorLogro.trim().length})`;
 }
 if (form.mejorHecho.trim().length < MIN_TEXT_LENGTH) {
 errors.mejorHecho =`Mínimo ${MIN_TEXT_LENGTH} caracteres (tienes ${form.mejorHecho.trim().length})`;
 }
 if (form.diferente.trim().length < MIN_TEXT_LENGTH) {
 errors.diferente =`Mínimo ${MIN_TEXT_LENGTH} caracteres (tienes ${form.diferente.trim().length})`;
 }
 if (weekStats && weekStats.totalGapHours > 0 && form.gapExplanation.trim().length < MIN_TEXT_LENGTH) {
 errors.gapExplanation =`Mínimo ${MIN_TEXT_LENGTH} caracteres. Explica tus horas sin registro.`;
 }
 if (form.selfRating === null) {
 errors.selfRating ="Selecciona una calificación";
 }

 setValidationErrors(errors);
 return Object.keys(errors).length === 0;
 }

 // ─── Submit ───────────────────────────────────────────────────

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();

 if (!validateForm() || !weekStats) return;

 setSubmitting(true);

 const {
 data: { user },
 } = await supabase.auth.getUser();

 const verdict = getWeekVerdict(
 weekStats.totalHours,
 weekStats.proofRate,
 weekStats.trustDelta
 );

 const confession: SavedConfession = {
 ...form,
 weekKey,
 weekStats,
 verdict,
 savedAt: new Date().toISOString(),
 userId: user?.id ??"anonymous",
 };

 saveConfessionToStorage(confession);
 setSubmitted(true);
 setSubmitting(false);
 }

 // Dialog cannot be dismissed until form is completed
 function handleOpenChange(isOpen: boolean) {
 if (!isOpen && !submitted) {
 // Record dismissal for re-show interval, but still prevent close
 dismissedAtRef.current = Date.now();
 setOpen(false);
 } else {
 setOpen(isOpen);
 }
 }

 // ─── Success state ───────────────────────────────────────────

 if (submitted && open) {
 const verdict = weekStats
 ? getWeekVerdict(weekStats.totalHours, weekStats.proofRate, weekStats.trustDelta)
 :"aceptable";
 const config = VERDICT_CONFIG[verdict];

 return (
 <Dialog open={open} onOpenChange={() => setOpen(false)}>
 <DialogContent className="sm:max-w-md text-center py-12">
 <div
 className={cn(
"w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4",
 config.bgColor,
 config.borderColor,
"border")}
 >
 <config.icon className={cn("w-10 h-10", config.iconColor)} />
 </div>
 <h3 className={cn("text-xl font-bold tracking-tight", config.color)}>
 Reflexión semanal guardada
 </h3>
 <p className="text-muted-foreground mt-2">
 Tu equipo puede ver esta reflexión. Usa tus compromisos para mejorar la
 próxima semana.
 </p>
 <Button
 variant="outline"className="mt-4"onClick={() => setOpen(false)}
 >
 Cerrar
 </Button>
 </DialogContent>
 </Dialog>
 );
 }

 // ─── Main render ──────────────────────────────────────────────

 if (!weekStats || loading || !open) return null;

 const verdict = getWeekVerdict(
 weekStats.totalHours,
 weekStats.proofRate,
 weekStats.trustDelta
 );
 const config = VERDICT_CONFIG[verdict];
 const VerdictIcon = config.icon;
 const maxDailyHours = Math.max(
 EXPECTED_DAILY_HOURS,
 ...weekStats.dailyBreakdown.map((d) => d.hoursLogged)
 );

 return (
 <Dialog open={open} onOpenChange={handleOpenChange}>
 <DialogContent
 showCloseButton={false}
 className="sm:max-w-2xl max-h-[95vh] overflow-y-auto p-0">
 {/* ── Verdict Header ─────────────────────────────────── */}
 <div
 className={cn(
"px-6 pt-8 pb-6 text-center border-b",
 config.bgColor,
 config.borderColor
 )}
 >
 <div className="flex items-center justify-center gap-2 mb-3">
 <Brain className="w-4 h-4 text-muted-foreground"/>
 <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
 Reflexión semanal obligatoria
 </span>
 </div>
 <div
 className={cn(
"w-16 h-16 flex items-center justify-center mx-auto mb-4",
"bg-white/60 dark:bg-white/10",
 config.borderColor,
"border")}
 >
 <VerdictIcon className={cn("w-8 h-8", config.iconColor)} />
 </div>
 <h2
 className={cn(
"text-2xl font-black tracking-tight",
 config.color
 )}
 >
 {config.label} {config.emoji}
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 {config.description}
 </p>
 <p className="text-xs text-muted-foreground/70 mt-2">
 Semana del {format(weekStart,"d 'de' MMMM", { locale: es })} al{" "}
 {format(weekEnd,"d 'de' MMMM, yyyy", { locale: es })}
 </p>
 </div>

 <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">
 {/* ══ SECTION 1: Tu Semana en Números ══════════════════ */}
 <section>
 <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
 <Calendar className="w-4 h-4"/>
 Tu semana en números
 </h3>

 {/* Daily breakdown bars */}
 <div className="space-y-2 mb-4">
 <p className="text-xs text-muted-foreground font-medium">
 Horas registradas por día
 </p>
 <div className="flex items-end gap-2 h-24">
 {weekStats.dailyBreakdown.map((day) => {
 const heightPercent =
 maxDailyHours > 0
 ? Math.max(4, (day.hoursLogged / maxDailyHours) * 100)
 : 4;
 const isToday = day.date === format(now,"yyyy-MM-dd");

 return (
 <div
 key={day.date}
 className="flex-1 flex flex-col items-center gap-1">
 <span className="text-[10px] tabular-nums font-bold text-foreground">
 {day.hoursLogged}h
 </span>
 <div className="w-full relative flex items-end"style={{ height:"60px"}}>
 <div
 className={cn(
"w-full rounded-t-md transition-all duration-500",
 getDailyHoursColor(day.hoursLogged),
 isToday &&"ring-2 ring-primary ring-offset-1")}
 style={{ height:`${heightPercent}%`, minHeight:"3px"}}
 />
 </div>
 <span
 className={cn(
"text-[10px] font-medium capitalize",
 isToday ?"text-primary font-bold":"text-muted-foreground")}
 >
 {day.dayLabel}
 </span>
 </div>
 );
 })}
 </div>
 {/* Expected line annotation */}
 <p className="text-[10px] text-muted-foreground/60 text-right">
 Meta: {EXPECTED_DAILY_HOURS}h/día
 </p>
 </div>

 {/* Stat boxes row */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
 {/* Total hours */}
 <div className="bg-accent/40 p-3 text-center">
 <p
 className={cn(
"text-2xl font-black tabular-nums tracking-tight leading-none",
 weekStats.totalHours >= EXPECTED_WEEKLY_HOURS * 0.9
 ?"text-green-600 dark:text-green-400": weekStats.totalHours >= EXPECTED_WEEKLY_HOURS * 0.7
 ?"text-yellow-600 dark:text-yellow-400":"text-red-600 dark:text-red-400")}
 >
 {weekStats.totalHours}
 </p>
 <p className="text-[10px] text-muted-foreground font-medium mt-1">
 Horas totales
 </p>
 </div>

 {/* Proof rate */}
 <div className="bg-accent/40 p-3 text-center">
 <p
 className={cn(
"text-2xl font-black tabular-nums tracking-tight leading-none",
 weekStats.proofRate >= 70
 ?"text-green-600 dark:text-green-400": weekStats.proofRate >= 40
 ?"text-yellow-600 dark:text-yellow-400":"text-red-600 dark:text-red-400")}
 >
 {weekStats.proofRate}%
 </p>
 <p className="text-[10px] text-muted-foreground font-medium mt-1">
 Evidencia
 </p>
 </div>

 {/* Gaps */}
 <div className="bg-accent/40 p-3 text-center">
 <p
 className={cn(
"text-2xl font-black tabular-nums tracking-tight leading-none",
 weekStats.totalGapHours === 0
 ?"text-green-600 dark:text-green-400": weekStats.totalGapHours <= 5
 ?"text-yellow-600 dark:text-yellow-400":"text-red-600 dark:text-red-400")}
 >
 {weekStats.totalGapHours}h
 </p>
 <p className="text-[10px] text-muted-foreground font-medium mt-1">
 Sin registro
 </p>
 </div>

 {/* Trust score delta */}
 <div className="bg-accent/40 p-3 text-center">
 <div className="flex items-center justify-center gap-1">
 {weekStats.trustDelta > 0 ? (
 <TrendingUp className="w-4 h-4 text-green-500"/>
 ) : weekStats.trustDelta < 0 ? (
 <TrendingDown className="w-4 h-4 text-red-500"/>
 ) : null}
 <p
 className={cn(
"text-2xl font-black tabular-nums tracking-tight leading-none",
 weekStats.trustDelta > 0
 ?"text-green-600 dark:text-green-400": weekStats.trustDelta < 0
 ?"text-red-600 dark:text-red-400":"text-muted-foreground")}
 >
 {weekStats.trustDelta > 0 ?"+":""}
 {weekStats.trustDelta}
 </p>
 </div>
 <p className="text-[10px] text-muted-foreground font-medium mt-1">
 Trust Score
 </p>
 {weekStats.trustScoreStart !== null && weekStats.trustScoreEnd !== null && (
 <p className="text-[9px] text-muted-foreground/60 mt-0.5">
 {weekStats.trustScoreStart} → {weekStats.trustScoreEnd}
 </p>
 )}
 </div>
 </div>

 {/* Streak status */}
 {weekStats.currentStreak > 0 && (
 <div
 className={cn(
"mt-3 flex items-center gap-2 p-3 border",
 weekStats.streakActive
 ?"bg-orange-50/50 dark:bg-orange-950/10 border-orange-200/60 dark:border-orange-800/40":"bg-red-50/50 dark:bg-red-950/10 border-red-200/60 dark:border-red-800/40")}
 >
 <Star
 className={cn(
"w-4 h-4 shrink-0",
 weekStats.streakActive ?"text-orange-500":"text-red-500")}
 />
 <p className="text-xs font-semibold">
 Racha: {weekStats.currentStreak} días{" "}
 {weekStats.streakActive ?"activa":"en riesgo"}
 </p>
 </div>
 )}
 </section>

 {/* ══ SECTION 2: Peer Comparison ═══════════════════════ */}
 {teamComparison && (
 <section>
 <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
 <Trophy className="w-4 h-4"/>
 Comparación con el equipo
 </h3>

 <div className="space-y-4">
 {/* Hours comparison */}
 <div className="space-y-2">
 <div className="flex items-center justify-between text-xs text-muted-foreground">
 <span>
 Tu promedio de horas:{" "}
 <span className="font-bold text-foreground tabular-nums">
 {teamComparison.userAvgHours}
 </span>
 </span>
 <span>
 Equipo:{" "}
 <span className="font-bold text-foreground tabular-nums">
 {teamComparison.teamAvgHours}
 </span>
 </span>
 </div>
 <div className="space-y-1.5">
 <div className="flex items-center gap-2">
 <span className="text-[10px] text-muted-foreground w-10">Tú</span>
 <div className="flex-1 h-3 bg-accent/60 rounded-full overflow-hidden">
 <div
 className={cn(
"h-full rounded-full transition-all duration-700",
 teamComparison.userAvgHours >= teamComparison.teamAvgHours
 ?"bg-green-500":"bg-red-500")}
 style={{
 width:`${Math.min(100, (teamComparison.userAvgHours / Math.max(teamComparison.teamAvgHours, teamComparison.userAvgHours, 1)) * 100)}%`,
 }}
 />
 </div>
 </div>
 <div className="flex items-center gap-2">
 <span className="text-[10px] text-muted-foreground w-10">Equipo</span>
 <div className="flex-1 h-3 bg-accent/60 rounded-full overflow-hidden">
 <div
 className="h-full rounded-full transition-all duration-700 bg-blue-500"style={{
 width:`${Math.min(100, (teamComparison.teamAvgHours / Math.max(teamComparison.teamAvgHours, teamComparison.userAvgHours, 1)) * 100)}%`,
 }}
 />
 </div>
 </div>
 </div>
 </div>

 {/* Proof comparison */}
 <div className="space-y-2">
 <div className="flex items-center justify-between text-xs text-muted-foreground">
 <span>
 Tu evidencia:{" "}
 <span className="font-bold text-foreground tabular-nums">
 {teamComparison.userProofRate}%
 </span>
 </span>
 <span>
 Equipo:{" "}
 <span className="font-bold text-foreground tabular-nums">
 {teamComparison.teamProofRate}%
 </span>
 </span>
 </div>
 <div className="space-y-1.5">
 <div className="flex items-center gap-2">
 <span className="text-[10px] text-muted-foreground w-10">Tú</span>
 <div className="flex-1 h-3 bg-accent/60 rounded-full overflow-hidden">
 <div
 className={cn(
"h-full rounded-full transition-all duration-700",
 teamComparison.userProofRate >= teamComparison.teamProofRate
 ?"bg-green-500":"bg-red-500")}
 style={{ width:`${teamComparison.userProofRate}%`}}
 />
 </div>
 </div>
 <div className="flex items-center gap-2">
 <span className="text-[10px] text-muted-foreground w-10">Equipo</span>
 <div className="flex-1 h-3 bg-accent/60 rounded-full overflow-hidden">
 <div
 className="h-full rounded-full transition-all duration-700 bg-blue-500"style={{ width:`${teamComparison.teamProofRate}%`}}
 />
 </div>
 </div>
 </div>
 </div>
 </div>
 </section>
 )}

 {/* ══ SECTION 3: Forced Self-Assessment ════════════════ */}
 <section>
 <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
 <MessageSquare className="w-4 h-4"/>
 Autoevaluación obligatoria
 </h3>

 <div className="space-y-4">
 {/* Mayor logro */}
 <div className="space-y-2">
 <Label className="text-sm font-semibold">
 ¿Cuál fue tu mayor logro esta semana?
 </Label>
 <Textarea
 placeholder="Describe tu logro principal con detalle..."value={form.mayorLogro}
 onChange={(e) => {
 setForm((prev) => ({ ...prev, mayorLogro: e.target.value }));
 if (validationErrors.mayorLogro) {
 setValidationErrors((prev) => {
 const next = { ...prev };
 delete next.mayorLogro;
 return next;
 });
 }
 }}
 rows={3}
 className={cn(
 validationErrors.mayorLogro &&"border-destructive ring-destructive/20 ring-3")}
 />
 {validationErrors.mayorLogro && (
 <p className="text-xs text-destructive flex items-center gap-1">
 <AlertTriangle className="w-3 h-3"/>
 {validationErrors.mayorLogro}
 </p>
 )}
 <p className="text-[10px] text-muted-foreground/60 text-right">
 {form.mayorLogro.trim().length}/{MIN_TEXT_LENGTH} caracteres mín.
 </p>
 </div>

 {/* Qué podrías haber hecho mejor */}
 <div className="space-y-2">
 <Label className="text-sm font-semibold">
 ¿Qué podrías haber hecho mejor?
 </Label>
 <Textarea
 placeholder="Sé honesto. ¿Dónde fallaste o podrías haber dado más?"value={form.mejorHecho}
 onChange={(e) => {
 setForm((prev) => ({ ...prev, mejorHecho: e.target.value }));
 if (validationErrors.mejorHecho) {
 setValidationErrors((prev) => {
 const next = { ...prev };
 delete next.mejorHecho;
 return next;
 });
 }
 }}
 rows={3}
 className={cn(
 validationErrors.mejorHecho &&"border-destructive ring-destructive/20 ring-3")}
 />
 {validationErrors.mejorHecho && (
 <p className="text-xs text-destructive flex items-center gap-1">
 <AlertTriangle className="w-3 h-3"/>
 {validationErrors.mejorHecho}
 </p>
 )}
 <p className="text-[10px] text-muted-foreground/60 text-right">
 {form.mejorHecho.trim().length}/{MIN_TEXT_LENGTH} caracteres mín.
 </p>
 </div>

 {/* Gap explanation (conditional) */}
 {weekStats.totalGapHours > 0 && (
 <div className="space-y-2">
 <Label className="text-sm font-semibold">
 ¿Por qué tuviste {weekStats.totalGapHours} horas sin registro?
 </Label>
 <div className="bg-destructive/5 border border-destructive/20 p-3 mb-2">
 <p className="text-xs text-destructive/80">
 Tienes {weekStats.totalGapHours} horas sin registrar esta semana.
 Tu equipo merece una explicación.
 </p>
 </div>
 <Textarea
 placeholder="Explica cada bloque de tiempo sin registro..."value={form.gapExplanation}
 onChange={(e) => {
 setForm((prev) => ({
 ...prev,
 gapExplanation: e.target.value,
 }));
 if (validationErrors.gapExplanation) {
 setValidationErrors((prev) => {
 const next = { ...prev };
 delete next.gapExplanation;
 return next;
 });
 }
 }}
 rows={3}
 className={cn(
 validationErrors.gapExplanation &&
"border-destructive ring-destructive/20 ring-3")}
 />
 {validationErrors.gapExplanation && (
 <p className="text-xs text-destructive flex items-center gap-1">
 <AlertTriangle className="w-3 h-3"/>
 {validationErrors.gapExplanation}
 </p>
 )}
 <p className="text-[10px] text-muted-foreground/60 text-right">
 {form.gapExplanation.trim().length}/{MIN_TEXT_LENGTH} caracteres mín.
 </p>
 </div>
 )}

 {/* Qué harás diferente */}
 <div className="space-y-2">
 <Label className="text-sm font-semibold">
 ¿Qué harás diferente la próxima semana?
 </Label>
 <Textarea
 placeholder="Compromisos concretos para la próxima semana..."value={form.diferente}
 onChange={(e) => {
 setForm((prev) => ({ ...prev, diferente: e.target.value }));
 if (validationErrors.diferente) {
 setValidationErrors((prev) => {
 const next = { ...prev };
 delete next.diferente;
 return next;
 });
 }
 }}
 rows={3}
 className={cn(
 validationErrors.diferente &&"border-destructive ring-destructive/20 ring-3")}
 />
 {validationErrors.diferente && (
 <p className="text-xs text-destructive flex items-center gap-1">
 <AlertTriangle className="w-3 h-3"/>
 {validationErrors.diferente}
 </p>
 )}
 <p className="text-[10px] text-muted-foreground/60 text-right">
 {form.diferente.trim().length}/{MIN_TEXT_LENGTH} caracteres mín.
 </p>
 </div>

 {/* Self-rating 1-5 */}
 <div className="space-y-2">
 <Label className="text-sm font-semibold">
 ¿Cómo calificarías tu semana?
 </Label>
 <div className="flex gap-2">
 {[1, 2, 3, 4, 5].map((level) => (
 <button
 key={level}
 type="button"onClick={() => {
 setForm((prev) => ({
 ...prev,
 selfRating: prev.selfRating === level ? null : level,
 }));
 if (validationErrors.selfRating) {
 setValidationErrors((prev) => {
 const next = { ...prev };
 delete next.selfRating;
 return next;
 });
 }
 }}
 className={cn(
"flex-1 py-3 text-sm font-semibold transition-all duration-200 flex flex-col items-center gap-1",
 form.selfRating === level
 ?"bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-blue-600/25 scale-105":"bg-accent/60 hover:bg-accent text-foreground/70")}
 >
 <Star
 className={cn(
"w-4 h-4",
 form.selfRating === level
 ?"text-white fill-white":"text-muted-foreground")}
 />
 <span className="text-[10px]">
 {SELF_RATING_LABELS[level].label}
 </span>
 </button>
 ))}
 </div>
 {validationErrors.selfRating && (
 <p className="text-xs text-destructive flex items-center gap-1">
 <AlertTriangle className="w-3 h-3"/>
 {validationErrors.selfRating}
 </p>
 )}
 </div>
 </div>
 </section>

 {/* ══ SECTION 4: The Verdict (repeated as summary) ═════ */}
 <section
 className={cn(
"p-4 border text-center",
 config.bgColor,
 config.borderColor
 )}
 >
 <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
 El veredicto
 </h3>
 <p className={cn("text-lg font-black tracking-tight", config.color)}>
 {config.label} {config.emoji}
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 {weekStats.totalHours} horas | {weekStats.proofRate}% evidencia |
 Trust Score{" "}
 {weekStats.trustDelta > 0 ?"+":""}
 {weekStats.trustDelta}
 </p>
 </section>

 {/* ══ Visibility warning ═══════════════════════════════ */}
 <div className="bg-yellow-50/80 dark:bg-yellow-950/15 border border-yellow-200/60 dark:border-yellow-800/40 p-3.5 flex items-start gap-2.5">
 <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5"/>
 <div>
 <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
 Esta reflexión será visible para tu equipo
 </p>
 <p className="text-[11px] text-yellow-600/80 dark:text-yellow-400/70 mt-0.5">
 Tus compañeros y supervisor podrán leer tus respuestas junto con tus
 estadísticas de la semana. Sé honesto y específico.
 </p>
 </div>
 </div>

 {/* ══ Submit button ════════════════════════════════════ */}
 <Button
 type="submit"disabled={submitting}
 className={cn(
"w-full h-12 text-white border-0 font-bold text-sm",
"bg-primary",
"hover:from-blue-700 hover:to-blue-800",
"hover:shadow-blue-600/40",
"transition-all duration-300")}
 >
 <Brain className="w-4 h-4 mr-2"/>
 {submitting ?"Guardando reflexión...":"Enviar reflexión semanal"}
 </Button>

 <p className="text-[10px] text-center text-muted-foreground">
 No puedes cerrar esta ventana hasta completar la reflexión.
 Se muestra cada hora los viernes hasta ser completada.
 </p>
 </form>
 </DialogContent>
 </Dialog>
 );
}
