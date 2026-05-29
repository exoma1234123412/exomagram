"use client";

// ═══════════════════════════════════════════════════════════════════════
// PSYCHOLOGICAL TECHNIQUE: Pre-Commitment + Public Accountability
// ═══════════════════════════════════════════════════════════════════════
//
// Inspired by:
// - Military briefing orders:"State your mission before you execute."// - Amazon's"working backwards"memo: Write what you'll accomplish
// BEFORE you start, so reality is measured against intention.
// - Bridgewater's daily stand-up: Radical transparency starts with
// declaring what you plan to do and what could stop you.
//
// The morning intention is BLOCKING — you cannot use the app without
// committing to a plan. This eliminates drift and creates a contract
// with yourself and your team.
//
// Psychological levers:
// 1) Pre-commitment bias: Once you declare"8 hours of Deep Work,"// cognitive dissonance makes it painful to do less.
// 2) Specificity effect:"¿Qué vas a lograr?"forces concrete goals
// vs vague"I'll work on stuff."// 3) Obstacle anticipation:"¿Qué podría impedirlo?"activates
// implementation intentions (if X happens, I'll do Y).
// 4) All-day visibility: The plan is pinned, tracked, and compared
// to reality — nowhere to hide.
// 5) No escape: No close button, no Escape key. The only exit is
// commitment. After 11am, the app opens but you're flagged.

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
 Sun,
 Target,
 Clock,
 AlertTriangle,
 CheckCircle2,
 Flame,
 Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────────

interface MorningIntention {
 plannedHours: number;
 primaryCategory: WorkCategory;
 goal: string;
 obstacles: string;
 committed: boolean;
 submittedAt: string;
 autoFilled: boolean;
}

interface YesterdaySummary {
 hoursLogged: number;
 proofPercentage: number;
}

// ─── Constants ──────────────────────────────────────────────────────

/** Morning intention window: 7am - 11am on weekdays */
const INTENTION_WINDOW_START = 7;
const INTENTION_WINDOW_END = 11;

/** Minimum characters for the goal text */
const MIN_GOAL_LENGTH = 20;

/** localStorage key prefix */
const STORAGE_KEY_PREFIX ="exomagram_intention_";

// ─── Helpers ────────────────────────────────────────────────────────

function getTodayKey(): string {
 return new Date().toISOString().split("T")[0];
}

function getYesterdayKey(): string {
 const d = new Date();
 d.setDate(d.getDate() - 1);
 return d.toISOString().split("T")[0];
}

function isWeekday(): boolean {
 const day = new Date().getDay();
 return day >= 1 && day <= 5;
}

function getCurrentHour(): number {
 return new Date().getHours();
}

function getStorageKey(date: string): string {
 return`${STORAGE_KEY_PREFIX}${date}`;
}

function loadIntention(date: string): MorningIntention | null {
 if (typeof window ==="undefined") return null;
 try {
 const raw = localStorage.getItem(getStorageKey(date));
 if (!raw) return null;
 return JSON.parse(raw) as MorningIntention;
 } catch {
 return null;
 }
}

function saveIntention(date: string, intention: MorningIntention): void {
 if (typeof window ==="undefined") return;
 localStorage.setItem(getStorageKey(date), JSON.stringify(intention));
}

// ─── Progress status helpers ────────────────────────────────────────

type ProgressStatus ="on-track"|"warning"|"danger";

function getProgressStatus(
 actualHours: number,
 plannedHours: number
): ProgressStatus {
 const hour = getCurrentHour();
 const pct = plannedHours > 0 ? actualHours / plannedHours : 0;

 // After 4pm and behind → danger
 if (hour >= 16 && pct < 0.6) return"danger";
 // After noon and behind → warning
 if (hour >= 12 && pct < 0.35) return"warning";

 return"on-track";
}

function getStatusColors(status: ProgressStatus) {
 switch (status) {
 case"danger":
 return {
 card:"border-red-300 dark:border-red-800/60 bg-red-50/50 dark:bg-red-950/10",
 bar:"bg-red-500",
 text:"text-red-700 dark:text-red-400",
 badge:"bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
 };
 case"warning":
 return {
 card:"border-amber-300 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/10",
 bar:"bg-amber-500",
 text:"text-amber-700 dark:text-amber-400",
 badge:"bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
 };
 default:
 return {
 card:"border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-950/10",
 bar:"bg-emerald-500",
 text:"text-emerald-700 dark:text-emerald-400",
 badge:"bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
 };
 }
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENT: MorningIntentionGate
// ═══════════════════════════════════════════════════════════════════════
// Blocking overlay that forces users to declare their work intentions
// before they can use the app each workday morning (Mon-Fri, 7-11am).

export function MorningIntentionGate() {
 const [showDialog, setShowDialog] = useState(false);
 const [intention, setIntention] = useState<MorningIntention | null>(null);
 const [yesterdaySummary, setYesterdaySummary] =
 useState<YesterdaySummary | null>(null);

 // Form state
 const [plannedHours, setPlannedHours] = useState(EXPECTED_DAILY_HOURS);
 const [primaryCategory, setPrimaryCategory] =
 useState<WorkCategory>("deep_work");
 const [goal, setGoal] = useState("");
 const [obstacles, setObstacles] = useState("");
 const [committed, setCommitted] = useState(false);
 const [submitting, setSubmitting] = useState(false);

 const supabase = createClient();
 const today = getTodayKey();

 // ─── Check if dialog should show ─────────────────────────────────

 useEffect(() => {
 const existing = loadIntention(today);
 if (existing) {
 setIntention(existing);
 return;
 }

 const hour = getCurrentHour();
 const weekday = isWeekday();

 if (!weekday) return;

 // During the intention window (7-11am) and no intention yet → block
 if (hour >= INTENTION_WINDOW_START && hour < INTENTION_WINDOW_END) {
 setShowDialog(true);
 }

 // After 11am and still no intention → auto-fill as"Sin plan declarado"
if (hour >= INTENTION_WINDOW_END) {
 const autoIntention: MorningIntention = {
 plannedHours: EXPECTED_DAILY_HOURS,
 primaryCategory:"admin",
 goal:"Sin plan declarado — no se presentó antes de las 11am.",
 obstacles:"",
 committed: false,
 submittedAt: new Date().toISOString(),
 autoFilled: true,
 };
 saveIntention(today, autoIntention);
 setIntention(autoIntention);
 }
 }, [today]);

 // ─── Load yesterday's summary ─────────────────────────────────────

 useEffect(() => {
 async function loadYesterday() {
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

 const yesterday = getYesterdayKey();

 const { data: entries } = await supabase
 .from("time_entries")
 .select("id, proof_urls")
 .eq("user_id", user.id)
 .eq("org_id", membership.org_id)
 .eq("date", yesterday);

 if (entries && entries.length > 0) {
 const withProof = entries.filter(
 (e) => e.proof_urls && e.proof_urls.length > 0
 ).length;
 setYesterdaySummary({
 hoursLogged: entries.length,
 proofPercentage:
 entries.length > 0
 ? Math.round((withProof / entries.length) * 100)
 : 0,
 });
 }
 }

 if (showDialog) loadYesterday();
 }, [showDialog]); // eslint-disable-line react-hooks/exhaustive-deps

 // ─── Form validation ──────────────────────────────────────────────

 const isValid = useMemo(() => {
 return (
 plannedHours >= 1 &&
 plannedHours <= 12 &&
 goal.length >= MIN_GOAL_LENGTH &&
 committed
 );
 }, [plannedHours, goal, committed]);

 // ─── Submit handler ───────────────────────────────────────────────

 const handleSubmit = useCallback(
 async (e: React.FormEvent) => {
 e.preventDefault();
 if (!isValid) return;

 setSubmitting(true);

 const newIntention: MorningIntention = {
 plannedHours,
 primaryCategory,
 goal,
 obstacles,
 committed: true,
 submittedAt: new Date().toISOString(),
 autoFilled: false,
 };

 saveIntention(today, newIntention);
 setIntention(newIntention);
 setShowDialog(false);
 setSubmitting(false);
 },
 [isValid, plannedHours, primaryCategory, goal, obstacles, today]
 );

 // ─── Block keyboard escape ────────────────────────────────────────

 useEffect(() => {
 if (!showDialog) return;

 function blockEscape(e: KeyboardEvent) {
 if (e.key ==="Escape") {
 e.preventDefault();
 e.stopPropagation();
 }
 }

 document.addEventListener("keydown", blockEscape, true);
 return () => document.removeEventListener("keydown", blockEscape, true);
 }, [showDialog]);

 // ─── Formatted date ───────────────────────────────────────────────

 const formattedDate = useMemo(() => {
 return format(new Date(),"EEEE d 'de' MMMM, yyyy", { locale: es });
 }, []);

 // ─── Category options ─────────────────────────────────────────────

 const categoryEntries = useMemo(() => {
 return Object.entries(CATEGORIES).filter(
 ([key]) => key !=="break"&& key !=="blocked") as [WorkCategory, (typeof CATEGORIES)[WorkCategory]][];
 }, []);

 // ─── Render: Blocking Dialog ──────────────────────────────────────

 if (showDialog) {
 return (
 <Dialog open modal onOpenChange={() => {}}>
 <DialogContent
 showCloseButton={false}
 className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
 <DialogHeader>
 <div className="flex items-center gap-3">
 <div className="w-12 h-12 bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center shadow-amber-500/10">
 <Sun className="w-6 h-6 text-amber-500"/>
 </div>
 <div>
 <DialogTitle className="text-xl font-bold tracking-tight">
 PLAN DEL DIA
 </DialogTitle>
 <DialogDescription className="text-muted-foreground flex items-center gap-1.5 mt-0.5">
 <Calendar className="w-3.5 h-3.5"/>
 <span className="capitalize">{formattedDate}</span>
 </DialogDescription>
 </div>
 </div>
 </DialogHeader>

 {/* Yesterday's summary */}
 {yesterdaySummary && (
 <div className="bg-accent/40 p-3.5 flex items-center gap-3 text-sm">
 <Clock className="w-4 h-4 text-muted-foreground shrink-0"/>
 <span>
 Ayer registraste{" "}
 <span className="font-semibold tabular-nums">
 {yesterdaySummary.hoursLogged} horas
 </span>
 ,{" "}
 <span
 className={cn(
"font-semibold tabular-nums",
 yesterdaySummary.proofPercentage >= 80
 ?"text-emerald-600 dark:text-emerald-400": yesterdaySummary.proofPercentage >= 50
 ?"text-amber-600 dark:text-amber-400":"text-red-600 dark:text-red-400")}
 >
 {yesterdaySummary.proofPercentage}% con evidencia
 </span>
 </span>
 </div>
 )}

 {/* No-dismiss warning */}
 <div className="bg-amber-50/80 dark:bg-amber-950/15 border border-amber-200/60 dark:border-amber-800/40 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
 <Target className="w-4 h-4 shrink-0"/>
 <span>
 No puedes usar la app sin declarar tu plan. Tu equipo lo verá.
 </span>
 </div>

 {/* Form */}
 <form onSubmit={handleSubmit} className="space-y-4">
 {/* Planned hours */}
 <div className="space-y-2">
 <Label htmlFor="planned-hours"className="flex items-center gap-2">
 <Clock className="w-4 h-4 text-muted-foreground"/>
 ¿Cuántas horas planeas registrar hoy?
 </Label>
 <Input
 id="planned-hours"type="number"min={1}
 max={12}
 value={plannedHours}
 onChange={(e) =>
 setPlannedHours(
 Math.min(12, Math.max(1, Number(e.target.value)))
 )
 }
 className="w-full tabular-nums"/>
 <p className="text-[11px] text-muted-foreground/60">
 Se esperan al menos {EXPECTED_DAILY_HOURS} horas por día
 laboral.
 </p>
 </div>

 {/* Primary category */}
 <div className="space-y-2">
 <Label className="flex items-center gap-2">
 <Target className="w-4 h-4 text-muted-foreground"/>
 ¿Cuál será tu actividad principal?
 </Label>
 <div className="grid grid-cols-2 gap-2">
 {categoryEntries.map(([key, cat]) => (
 <button
 key={key}
 type="button"onClick={() => setPrimaryCategory(key)}
 className={cn(
"flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-all duration-200 text-left",
 primaryCategory === key
 ? cn(
 cat.bgColor,
 cat.color,
"ring-2 ring-current/20 scale-[1.02]")
 :"bg-accent/60 hover:bg-accent text-foreground/70")}
 >
 <span>{cat.emoji}</span>
 <span>{cat.label}</span>
 </button>
 ))}
 </div>
 </div>

 {/* Goal */}
 <div className="space-y-2">
 <Label htmlFor="goal"className="flex items-center gap-2">
 <Flame className="w-4 h-4 text-muted-foreground"/>
 ¿Qué vas a lograr hoy?
 </Label>
 <Textarea
 id="goal"placeholder="Sé específico: ¿qué vas a entregar, terminar, o avanzar?"value={goal}
 onChange={(e) => setGoal(e.target.value)}
 rows={3}
 required
 minLength={MIN_GOAL_LENGTH}
 />
 <div className="flex justify-between text-[11px]">
 <span
 className={cn(
"transition-colors",
 goal.length >= MIN_GOAL_LENGTH
 ?"text-emerald-600 dark:text-emerald-400":"text-muted-foreground/60")}
 >
 {goal.length >= MIN_GOAL_LENGTH ? (
 <span className="flex items-center gap-1">
 <CheckCircle2 className="w-3 h-3"/>
 Suficiente detalle
 </span>
 ) : (
`Mínimo ${MIN_GOAL_LENGTH} caracteres (${goal.length}/${MIN_GOAL_LENGTH})`)}
 </span>
 </div>
 </div>

 {/* Obstacles */}
 <div className="space-y-2">
 <Label htmlFor="obstacles"className="flex items-center gap-2">
 <AlertTriangle className="w-4 h-4 text-muted-foreground"/>
 ¿Hay algo que podría impedirlo?
 <Badge variant="secondary"className="text-[10px]">
 Opcional
 </Badge>
 </Label>
 <Textarea
 id="obstacles"placeholder="Reuniones inesperadas, dependencias, falta de información..."value={obstacles}
 onChange={(e) => setObstacles(e.target.value)}
 rows={2}
 />
 </div>

 {/* Commitment checkbox */}
 <div
 className={cn(
"p-3.5 border transition-all duration-200",
 committed
 ?"bg-emerald-50/50 dark:bg-emerald-950/15 border-emerald-200/60 dark:border-emerald-800/40":"bg-accent/40 border-transparent")}
 >
 <label className="flex items-start gap-3 cursor-pointer select-none">
 <input
 type="checkbox"checked={committed}
 onChange={(e) => setCommitted(e.target.checked)}
 className="mt-0.5 h-4 w-4 rounded border-input accent-emerald-600"/>
 <div className="space-y-0.5">
 <span className="text-sm font-semibold">
 Me comprometo a cumplir este plan
 </span>
 <p className="text-[11px] text-muted-foreground">
 Tu equipo verá esta declaración y al final del día se
 comparará con la realidad.
 </p>
 </div>
 </label>
 </div>

 {/* Submit */}
 <Button
 type="submit"disabled={!isValid || submitting}
 className="w-full h-11 bg-primary hover:from-blue-700 hover:to-blue-800 text-white border-0 hover:shadow-blue-600/40 transition-all duration-300 font-semibold text-base">
 {submitting ? (
"Guardando...") : (
 <span className="flex items-center gap-2">
 <CheckCircle2 className="w-4 h-4"/>
 Declarar mi plan del día
 </span>
 )}
 </Button>

 {!isValid && (
 <p className="text-[11px] text-center text-muted-foreground/60">
 {!committed
 ?"Debes marcar el compromiso para continuar.": goal.length < MIN_GOAL_LENGTH
 ?`Tu meta necesita al menos ${MIN_GOAL_LENGTH} caracteres.`:"Completa todos los campos obligatorios."}
 </p>
 )}
 </form>
 </DialogContent>
 </Dialog>
 );
 }

 // ─── Render: Nothing (no intention and outside window) ────────────

 if (!intention) return null;

 // ─── Render: Accountability Card (after submission) ───────────────

 return (
 <IntentionAccountabilityCard intention={intention} today={today} />
 );
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENT: IntentionAccountabilityCard
// ═══════════════════════════════════════════════════════════════════════
// Compact pinned card showing the day's intention and live progress.
// Turns amber at midday if behind, red at 4pm if still behind.

function IntentionAccountabilityCard({
 intention,
 today,
}: {
 intention: MorningIntention;
 today: string;
}) {
 const [actualHours, setActualHours] = useState(0);
 const [proofPercentage, setProofPercentage] = useState(0);
 const supabase = createClient();

 // ─── Load actual hours ────────────────────────────────────────────

 useEffect(() => {
 async function loadProgress() {
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

 const { data: entries } = await supabase
 .from("time_entries")
 .select("id, proof_urls")
 .eq("user_id", user.id)
 .eq("org_id", membership.org_id)
 .eq("date", today);

 if (entries) {
 setActualHours(entries.length);
 const withProof = entries.filter(
 (e) => e.proof_urls && e.proof_urls.length > 0
 ).length;
 setProofPercentage(
 entries.length > 0
 ? Math.round((withProof / entries.length) * 100)
 : 0
 );
 }
 }

 loadProgress();
 // Poll every 2 minutes to keep progress fresh
 const interval = setInterval(loadProgress, 120_000);
 return () => clearInterval(interval);
 }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

 // ─── Derived state ────────────────────────────────────────────────

 const progressPct = useMemo(() => {
 if (intention.plannedHours === 0) return 0;
 return Math.min(100, Math.round((actualHours / intention.plannedHours) * 100));
 }, [actualHours, intention.plannedHours]);

 const status = useMemo(
 () => getProgressStatus(actualHours, intention.plannedHours),
 [actualHours, intention.plannedHours]
 );

 const colors = useMemo(() => getStatusColors(status), [status]);
 const categoryInfo = CATEGORIES[intention.primaryCategory];

 // ─── Auto-filled flag ─────────────────────────────────────────────

 if (intention.autoFilled) {
 return (
 <Card
 className={cn(
"transition-all duration-300 border-red-300 dark:border-red-800/60 bg-red-50/30 dark:bg-red-950/10")}
 >
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-sm">
 <div className="w-8 h-8 bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
 <AlertTriangle className="w-4 h-4 text-red-500"/>
 </div>
 <div className="flex-1">
 <span className="text-red-700 dark:text-red-400">
 Sin plan declarado
 </span>
 <p className="text-[11px] text-muted-foreground font-normal mt-0.5">
 No se presentó plan antes de las 11am
 </p>
 </div>
 <Badge
 variant="destructive"className="text-[10px]">
 Falta
 </Badge>
 </CardTitle>
 </CardHeader>
 </Card>
 );
 }

 // ─── Normal accountability card ───────────────────────────────────

 return (
 <Card
 className={cn(
"transition-all duration-300 hover:border-primary/30",
 colors.card
 )}
 >
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-sm">
 <div
 className={cn(
"w-8 h-8 flex items-center justify-center",
 status ==="on-track"?"bg-emerald-100 dark:bg-emerald-900/30": status ==="warning"?"bg-amber-100 dark:bg-amber-900/30":"bg-red-100 dark:bg-red-900/30")}
 >
 {status ==="on-track"? (
 <Target className="w-4 h-4 text-emerald-500"/>
 ) : status ==="warning"? (
 <Clock className="w-4 h-4 text-amber-500"/>
 ) : (
 <AlertTriangle className="w-4 h-4 text-red-500"/>
 )}
 </div>
 <div className="flex-1 min-w-0">
 <span className="text-foreground">Tu plan del día</span>
 <p className="text-[11px] text-muted-foreground font-normal mt-0.5 truncate">
 {intention.plannedHours}h, principalmente{" "}
 {categoryInfo.emoji} {categoryInfo.label}
 </p>
 </div>
 <Badge
 className={cn("text-[10px] border-0 shrink-0", colors.badge)}
 >
 {actualHours}/{intention.plannedHours}h
 </Badge>
 </CardTitle>
 </CardHeader>

 <CardContent className="space-y-3">
 {/* Goal text */}
 <div className="text-sm text-foreground/80 leading-relaxed">
 <span className="font-medium text-foreground">Meta:</span>{" "}
 {intention.goal}
 </div>

 {/* Obstacles (if declared) */}
 {intention.obstacles && (
 <div className="text-xs text-muted-foreground flex items-start gap-1.5">
 <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0"/>
 <span>{intention.obstacles}</span>
 </div>
 )}

 {/* Progress bar */}
 <div className="space-y-1.5">
 <div className="flex justify-between text-[11px]">
 <span className="text-muted-foreground">Progreso</span>
 <span className={cn("font-semibold tabular-nums", colors.text)}>
 {progressPct}%
 </span>
 </div>
 <div className="h-2 bg-accent/60 rounded-full overflow-hidden">
 <div
 className={cn(
"h-full rounded-full transition-all duration-500 ease-out",
 colors.bar
 )}
 style={{ width:`${progressPct}%`}}
 />
 </div>
 </div>

 {/* Status messages */}
 {status ==="warning"&& (
 <div className="bg-amber-50/80 dark:bg-amber-950/15 border border-amber-200/60 dark:border-amber-800/40 p-2.5 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
 <Clock className="w-3.5 h-3.5 shrink-0"/>
 <span>
 Dijiste que harías {categoryInfo.label}. Llevas {actualHours}h
 de {intention.plannedHours}h planeadas.
 </span>
 </div>
 )}

 {status ==="danger"&& (
 <div className="bg-destructive/5 border border-destructive/20 p-2.5 text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
 <Flame className="w-3.5 h-3.5 shrink-0"/>
 <span>
 Son las {getCurrentHour()}:00 y vas {actualHours}/
 {intention.plannedHours}h. Tu plan está en riesgo.
 </span>
 </div>
 )}

 {status ==="on-track"&& actualHours >= intention.plannedHours && (
 <div className="bg-emerald-50/80 dark:bg-emerald-950/15 border border-emerald-200/60 dark:border-emerald-800/40 p-2.5 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
 <CheckCircle2 className="w-3.5 h-3.5 shrink-0"/>
 <span>Plan cumplido. Buen trabajo.</span>
 </div>
 )}

 {/* Stats row */}
 <div className="grid grid-cols-3 gap-2 pt-1">
 <div className="bg-accent/40 p-2 text-center">
 <p className="text-sm font-bold tabular-nums tracking-tight">
 {actualHours}
 </p>
 <p className="text-[10px] text-muted-foreground">Horas hoy</p>
 </div>
 <div className="bg-accent/40 p-2 text-center">
 <p
 className={cn(
"text-sm font-bold tabular-nums tracking-tight",
 proofPercentage >= 80
 ?"text-emerald-600 dark:text-emerald-400": proofPercentage >= 50
 ?"text-amber-600 dark:text-amber-400":"text-red-600 dark:text-red-400")}
 >
 {proofPercentage}%
 </p>
 <p className="text-[10px] text-muted-foreground">Evidencia</p>
 </div>
 <div className="bg-accent/40 p-2 text-center">
 <p className="text-sm font-bold tabular-nums tracking-tight">
 {Math.max(0, intention.plannedHours - actualHours)}
 </p>
 <p className="text-[10px] text-muted-foreground">Faltan</p>
 </div>
 </div>
 </CardContent>
 </Card>
 );
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORT: Hook for accessing today's intention from other components
// ═══════════════════════════════════════════════════════════════════════
// Used by smart-nudges, daily-closeout, vigilance views, etc.

export function useTodayIntention(): MorningIntention | null {
 const [intention, setIntention] = useState<MorningIntention | null>(null);

 useEffect(() => {
 const today = getTodayKey();
 setIntention(loadIntention(today));

 // Listen for storage changes (e.g., if intention submitted in another tab)
 function handleStorage(e: StorageEvent) {
 if (e.key === getStorageKey(today)) {
 setIntention(e.newValue ? JSON.parse(e.newValue) : null);
 }
 }

 window.addEventListener("storage", handleStorage);
 return () => window.removeEventListener("storage", handleStorage);
 }, []);

 return intention;
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORT: Compact badge for use in team views (/now, /vigilance)
// ═══════════════════════════════════════════════════════════════════════

export function IntentionBadge({
 intention,
 className,
}: {
 intention: MorningIntention | null;
 className?: string;
}) {
 if (!intention) {
 return (
 <Badge
 variant="destructive"className={cn("text-[10px]", className)}
 >
 Sin plan
 </Badge>
 );
 }

 if (intention.autoFilled) {
 return (
 <Badge
 variant="destructive"className={cn("text-[10px]", className)}
 >
 <AlertTriangle className="w-3 h-3 mr-0.5"/>
 Sin plan
 </Badge>
 );
 }

 const cat = CATEGORIES[intention.primaryCategory];

 return (
 <Badge
 variant="secondary"className={cn("text-[10px] gap-1", className)}
 >
 <span>{cat.emoji}</span>
 <span>
 {intention.plannedHours}h {cat.label}
 </span>
 </Badge>
 );
}

// ─── Alias for layout import compatibility ──────────────────────────
export { MorningIntentionGate as MorningIntention };
