"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS, WORK_HOURS } from "@/lib/constants";
import {
 AlertTriangle,
 Clock,
 Flame,
 Skull,
 Timer,
 Users,
 TrendingDown,
 Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UrgencyLevel =
 |"gentle"|"moderate"|"aggressive"|"critical"|"final"|"shame"|"none";

interface TeamMemberStatus {
 userId: string;
 fullName: string;
 hoursLogged: number;
 completed: boolean;
}

interface StreakData {
 currentStreak: number;
 lastActiveDate: string | null;
}

interface EngineState {
 loading: boolean;
 urgencyLevel: UrgencyLevel;
 myHoursLogged: number;
 teamStatuses: TeamMemberStatus[];
 teamAverage: number;
 teamCompleted: number;
 teamTotal: number;
 streak: StreakData | null;
 currentHour: number;
 currentMinute: number;
}

// ---------------------------------------------------------------------------
// Work-day boundaries (derived from WORK_HOURS)
// ---------------------------------------------------------------------------

const WORK_START = WORK_HOURS[0]; // 7
const WORK_END = WORK_HOURS[WORK_HOURS.length - 1] + 1; // 19 (6pm)
const FINAL_WARNING_START = 17.5; // 5:30pm
const CRITICAL_START = 16; // 4pm
const CRITICAL_END = 17.5; // 5:30pm
const AGGRESSIVE_START = 13; // 1pm
const AGGRESSIVE_END = 16; // 4pm
const MODERATE_START = 10; // 10am
const MODERATE_END = 13; // 1pm
const GENTLE_START = 7; // 7am
const GENTLE_END = 10; // 10am

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDecimalHour(d: Date): number {
 return d.getHours() + d.getMinutes() / 60;
}

function getUrgencyLevel(decimalHour: number, hoursLogged: number): UrgencyLevel {
 if (decimalHour >= WORK_END) return"shame";
 if (decimalHour >= FINAL_WARNING_START) return"final";
 if (decimalHour >= CRITICAL_START && decimalHour < CRITICAL_END) return"critical";
 if (decimalHour >= AGGRESSIVE_START && decimalHour < AGGRESSIVE_END) return"aggressive";
 if (decimalHour >= MODERATE_START && decimalHour < MODERATE_END) return"moderate";
 if (decimalHour >= GENTLE_START && decimalHour < GENTLE_END) return"gentle";
 // Before work hours or weird edge – no urgency
 if (hoursLogged >= EXPECTED_DAILY_HOURS) return"none";
 return"none";
}

function projectedTotal(hoursLogged: number, decimalHour: number): number {
 const elapsed = Math.max(decimalHour - WORK_START, 0.5);
 const totalWindow = WORK_END - WORK_START; // 12
 const rate = hoursLogged / elapsed;
 return Math.round(rate * totalWindow * 10) / 10;
}

function minutesUntilClose(decimalHour: number): number {
 const remaining = WORK_END - decimalHour;
 return Math.max(0, Math.round(remaining * 60));
}

function formatHoursRemaining(hours: number): string {
 if (hours <= 0) return"0";
 return hours.toFixed(1);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PeerCompletionRing({
 completed,
 total,
}: {
 completed: number;
 total: number;
}) {
 const pct = total > 0 ? (completed / total) * 100 : 0;
 const radius = 18;
 const circumference = 2 * Math.PI * radius;
 const offset = circumference - (pct / 100) * circumference;

 return (
 <div className="flex items-center gap-3">
 <div className="relative w-11 h-11">
 <svg className="w-11 h-11 -rotate-90"viewBox="0 0 44 44">
 <circle
 cx="22"cy="22"r={radius}
 fill="none"stroke="currentColor"strokeWidth="3"className="text-muted-foreground/15"/>
 <circle
 cx="22"cy="22"r={radius}
 fill="none"stroke="currentColor"strokeWidth="3"strokeDasharray={circumference}
 strokeDashoffset={offset}
 strokeLinecap="round"className="text-emerald-500 transition-all duration-700"/>
 </svg>
 <div className="absolute inset-0 flex items-center justify-center">
 <Users className="w-3.5 h-3.5 text-muted-foreground"/>
 </div>
 </div>
 <div className="text-xs text-muted-foreground leading-tight">
 <span className="font-semibold text-foreground">{completed}</span> de{" "}
 <span className="font-semibold text-foreground">{total}</span> personas
 <br />
 ya completaron sus {EXPECTED_DAILY_HOURS} horas hoy
 </div>
 </div>
 );
}

function StreakThreat({
 streak,
 hasLoggedToday,
}: {
 streak: StreakData;
 hasLoggedToday: boolean;
}) {
 if (streak.currentStreak < 3 || hasLoggedToday) return null;

 return (
 <div className="flex items-center gap-3 p-3.5 bg-orange-50/90 dark:bg-orange-950/25 border border-orange-300/60 dark:border-orange-700/50 shadow-orange-500/10 animate-pulse">
 <div className="w-9 h-9 bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
 <Flame className="w-5 h-5 text-orange-500"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
 Tu racha de {streak.currentStreak} dias esta en riesgo
 </p>
 <p className="text-xs text-orange-700/80 dark:text-orange-400/70 mt-0.5">
 Registra al menos 1 hora para mantenerla.
 </p>
 </div>
 <Badge variant="destructive"className="shrink-0">
 <Flame className="w-3 h-3 mr-1"/>
 {streak.currentStreak}d
 </Badge>
 </div>
 );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UrgencyEngine() {
 const supabase = createClient();

 const [state, setState] = useState<EngineState>({
 loading: true,
 urgencyLevel:"none",
 myHoursLogged: 0,
 teamStatuses: [],
 teamAverage: 0,
 teamCompleted: 0,
 teamTotal: 0,
 streak: null,
 currentHour: new Date().getHours(),
 currentMinute: new Date().getMinutes(),
 });

 // -----------------------------------------------------------------------
 // Data fetching
 // -----------------------------------------------------------------------

 const fetchData = useCallback(async () => {
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

 const now = new Date();
 const today = now.toISOString().split("T")[0];
 const decimalHour = getDecimalHour(now);

 // Parallel fetches ---------------------------------------------------
 const [myEntriesRes, orgMembersRes, streakRes] = await Promise.all([
 // My entries today
 supabase
 .from("time_entries")
 .select("hour")
 .eq("user_id", user.id)
 .eq("org_id", membership.org_id)
 .eq("date", today),
 // All org members
 supabase
 .from("org_members")
 .select("user_id")
 .eq("org_id", membership.org_id),
 // My streak
 supabase
 .from("activity_streaks")
 .select("current_streak, last_active_date")
 .eq("user_id", user.id)
 .eq("org_id", membership.org_id)
 .limit(1)
 .single(),
 ]);

 const myHoursLogged = new Set(
 myEntriesRes.data?.map((e) => e.hour) ?? []
 ).size;

 // Build team statuses ------------------------------------------------
 const memberIds: string[] =
 orgMembersRes.data?.map((m) => m.user_id) ?? [];

 let teamStatuses: TeamMemberStatus[] = [];
 if (memberIds.length > 0) {
 // Fetch all team entries for today
 const { data: allEntries } = await supabase
 .from("time_entries")
 .select("user_id, hour")
 .eq("org_id", membership.org_id)
 .eq("date", today);

 // Fetch profiles for names
 const { data: profiles } = await supabase
 .from("profiles")
 .select("id, full_name")
 .in("id", memberIds);

 const profileMap = new Map<string, string>();
 for (const p of profiles ?? []) {
 profileMap.set(p.id, p.full_name ??"Anonimo");
 }

 // Aggregate hours per member
 const hoursMap = new Map<string, Set<number>>();
 for (const entry of allEntries ?? []) {
 if (!hoursMap.has(entry.user_id)) {
 hoursMap.set(entry.user_id, new Set());
 }
 hoursMap.get(entry.user_id)!.add(entry.hour);
 }

 teamStatuses = memberIds
 .filter((id) => id !== user.id)
 .map((id) => {
 const hours = hoursMap.get(id)?.size ?? 0;
 return {
 userId: id,
 fullName: profileMap.get(id) ??"Anonimo",
 hoursLogged: hours,
 completed: hours >= EXPECTED_DAILY_HOURS,
 };
 });
 }

 const teamTotal = teamStatuses.length + 1; // including self
 const teamCompletedCount =
 teamStatuses.filter((t) => t.completed).length +
 (myHoursLogged >= EXPECTED_DAILY_HOURS ? 1 : 0);
 const allHours = [
 myHoursLogged,
 ...teamStatuses.map((t) => t.hoursLogged),
 ];
 const teamAvg =
 allHours.length > 0
 ? Math.round(
 (allHours.reduce((a, b) => a + b, 0) / allHours.length) * 10
 ) / 10
 : 0;

 const streak: StreakData | null = streakRes.data
 ? {
 currentStreak: streakRes.data.current_streak,
 lastActiveDate: streakRes.data.last_active_date,
 }
 : null;

 const urgencyLevel =
 myHoursLogged >= EXPECTED_DAILY_HOURS
 ?"none": getUrgencyLevel(decimalHour, myHoursLogged);

 setState({
 loading: false,
 urgencyLevel,
 myHoursLogged,
 teamStatuses,
 teamAverage: teamAvg,
 teamCompleted: teamCompletedCount,
 teamTotal,
 streak,
 currentHour: now.getHours(),
 currentMinute: now.getMinutes(),
 });
 }, []); // eslint-disable-line react-hooks/exhaustive-deps

 // -----------------------------------------------------------------------
 // Lifecycle: fetch on mount + refresh every 60s
 // -----------------------------------------------------------------------

 useEffect(() => {
 fetchData();
 const interval = setInterval(fetchData, 60_000);
 return () => clearInterval(interval);
 }, [fetchData]);

 // -----------------------------------------------------------------------
 // Short-circuit
 // -----------------------------------------------------------------------

 if (state.loading) return null;
 if (state.urgencyLevel ==="none"&& (!state.streak || state.myHoursLogged > 0))
 return (
 <div className="mb-6">
 <PeerCompletionRing
 completed={state.teamCompleted}
 total={state.teamTotal}
 />
 </div>
 );

 // -----------------------------------------------------------------------
 // Derived values
 // -----------------------------------------------------------------------

 const now = new Date();
 const decimalHour = getDecimalHour(now);
 const projected = projectedTotal(state.myHoursLogged, decimalHour);
 const remaining = EXPECTED_DAILY_HOURS - state.myHoursLogged;
 const minsLeft = minutesUntilClose(decimalHour);
 const hasLoggedToday = state.myHoursLogged > 0;

 // People who already finished
 const finishedPeople = state.teamStatuses.filter((t) => t.completed);
 // People who already started
 const activePeople = state.teamStatuses.filter((t) => t.hoursLogged > 0);

 // -----------------------------------------------------------------------
 // Render helpers per level
 // -----------------------------------------------------------------------

 function renderGentle() {
 return (
 <Card className="border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/10">
 <CardContent className="flex flex-col gap-3">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
 <Clock className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
 Buenos dias. Tu equipo ya esta registrando.
 </p>
 {activePeople.length > 0 && (
 <p className="text-xs text-emerald-700/70 dark:text-emerald-400/60 mt-1">
 {activePeople.slice(0, 4).map((p) => p.fullName).join(",")}
 {activePeople.length > 4
 ?`y ${activePeople.length - 4} mas`:""}{" "}
 ya comenzaron su dia.
 </p>
 )}
 </div>
 </div>
 </CardContent>
 </Card>
 );
 }

 function renderModerate() {
 return (
 <Card className="border-blue-200/60 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-950/10">
 <CardContent className="flex flex-col gap-3">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
 <TrendingDown className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
 Llevas{" "}
 <span className="font-bold">
 {state.myHoursLogged}/{EXPECTED_DAILY_HOURS}
 </span>{" "}
 horas. El promedio del equipo es{" "}
 <span className="font-bold">{state.teamAverage}</span>.
 </p>
 {state.myHoursLogged < state.teamAverage && (
 <p className="text-xs text-blue-700/70 dark:text-blue-400/60 mt-1">
 Estás por debajo del promedio. Considera registrar tus
 actividades.
 </p>
 )}
 </div>
 <Badge variant="secondary"className="shrink-0">
 {state.myHoursLogged}h
 </Badge>
 </div>
 </CardContent>
 </Card>
 );
 }

 function renderAggressive() {
 return (
 <Card className="border-amber-300/60 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-950/15 shadow-amber-500/10">
 <CardContent className="flex flex-col gap-3">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
 <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
 Vas por debajo del ritmo. A este paso solo registraras{" "}
 <span className="font-bold underline decoration-amber-500/50">
 {projected}
 </span>{" "}
 horas hoy.
 </p>
 <p className="text-xs text-amber-700/80 dark:text-amber-400/60 mt-1">
 Te faltan{" "}
 <span className="font-semibold">
 {formatHoursRemaining(remaining)}
 </span>{" "}
 horas y quedan{" "}
 <span className="font-semibold">{minsLeft} minutos</span> de
 jornada.
 </p>
 </div>
 <Badge variant="destructive"className="shrink-0">
 <Timer className="w-3 h-3 mr-1"/>
 {projected}h
 </Badge>
 </div>
 </CardContent>
 </Card>
 );
 }

 function renderCritical() {
 return (
 <div className="border-2 border-red-400/70 dark:border-red-600/60 bg-red-50 dark:bg-red-950/30 p-4 shadow-md shadow-red-500/15">
 <div className="flex items-start gap-3">
 <div className="w-10 h-10 bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0 animate-pulse">
 <Zap className="w-5 h-5 text-red-600 dark:text-red-400"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-bold text-red-800 dark:text-red-300">
 URGENTE: Te faltan{" "}
 <span className="text-red-600 dark:text-red-400 underline">
 {formatHoursRemaining(remaining)} horas
 </span>{" "}
 y quedan{" "}
 <span className="text-red-600 dark:text-red-400 underline">
 {minsLeft} minutos
 </span>
 .
 </p>
 {finishedPeople.length > 0 && (
 <div className="mt-2 flex flex-wrap gap-1.5">
 {finishedPeople.slice(0, 5).map((p) => (
 <Badge
 key={p.userId}
 variant="secondary"className="text-[11px] bg-red-100/80 dark:bg-red-900/30 text-red-700 dark:text-red-300">
 {p.fullName} ya completo
 </Badge>
 ))}
 </div>
 )}
 {finishedPeople.length === 0 && (
 <p className="text-xs text-red-700/80 dark:text-red-400/60 mt-1">
 Nadie ha completado aun, pero el tiempo se acaba.
 </p>
 )}
 </div>
 </div>
 </div>
 );
 }

 function renderFinal() {
 return (
 <div className="border-2 border-red-500 dark:border-red-600 bg-red-600 dark:bg-red-900 p-5 shadow-red-600/30 w-full">
 <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-white/20 flex items-center justify-center shrink-0 animate-pulse">
 <Skull className="w-6 h-6 text-white"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-base font-black text-white tracking-wide uppercase">
 Ultima oportunidad
 </p>
 <p className="text-sm font-semibold text-red-100 mt-0.5">
 Cierre en{" "}
 <span className="text-white underline decoration-2 decoration-white/50">
 {minsLeft} minutos
 </span>
 . Registra ahora o el dia queda incompleto.
 </p>
 <p className="text-xs text-red-200/80 mt-1">
 Llevas {state.myHoursLogged}/{EXPECTED_DAILY_HOURS} horas. Faltan{" "}
 {formatHoursRemaining(remaining)}.
 </p>
 </div>
 <div className="shrink-0 flex flex-col items-center">
 <Timer className="w-7 h-7 text-white"/>
 <span className="text-[11px] font-bold text-white mt-1">
 {minsLeft}m
 </span>
 </div>
 </div>
 </div>
 );
 }

 function renderShame() {
 // Projected trust score impact: rough heuristic
 // A full day = score unchanged. Missing hours deduct ~5 pts per missing hour
 const trustPenalty = Math.round(remaining * 5);

 return (
 <div className="border-2 border-red-800/60 dark:border-red-700/50 bg-red-950 dark:bg-red-950 p-5 shadow-red-900/40 w-full">
 <div className="flex items-start gap-4">
 <div className="w-11 h-11 bg-red-900/60 flex items-center justify-center shrink-0">
 <Skull className="w-6 h-6 text-red-400"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-base font-black text-red-300 uppercase tracking-wide">
 El dia termino
 </p>
 <p className="text-sm font-semibold text-red-400/90 mt-1">
 Registraste{" "}
 <span className="text-red-300 font-black">
 {state.myHoursLogged}/{EXPECTED_DAILY_HOURS}
 </span>{" "}
 horas. Tu trust score bajara.
 </p>
 <div className="flex items-center gap-2 mt-2">
 <TrendingDown className="w-4 h-4 text-red-500"/>
 <span className="text-xs text-red-400/80">
 Impacto estimado:{" "}
 <span className="font-bold text-red-300">-{trustPenalty} pts</span>{" "}
 en tu trust score
 </span>
 </div>
 {finishedPeople.length > 0 && (
 <p className="text-xs text-red-500/60 mt-2">
 {finishedPeople.length} de tus compañeros completaron sus{" "}
 {EXPECTED_DAILY_HOURS} horas.
 </p>
 )}
 </div>
 </div>
 </div>
 );
 }

 // -----------------------------------------------------------------------
 // Level-to-renderer map
 // -----------------------------------------------------------------------

 const renderers: Record<UrgencyLevel, (() => React.ReactNode) | null> = {
 gentle: renderGentle,
 moderate: renderModerate,
 aggressive: renderAggressive,
 critical: renderCritical,
 final: renderFinal,
 shame: renderShame,
 none: null,
 };

 const renderLevel = renderers[state.urgencyLevel];

 // -----------------------------------------------------------------------
 // Final render
 // -----------------------------------------------------------------------

 return (
 <div className="space-y-3 mb-6">
 {/* Streak threat — always evaluated regardless of urgency level */}
 {state.streak && (
 <StreakThreat streak={state.streak} hasLoggedToday={hasLoggedToday} />
 )}

 {/* Time-based urgency banner */}
 {renderLevel && renderLevel()}

 {/* Peer completion counter — always visible */}
 <div
 className={cn(
"p-3 border transition-colors",
 state.urgencyLevel ==="final"|| state.urgencyLevel ==="shame"?"border-red-300/40 dark:border-red-800/30 bg-red-50/30 dark:bg-red-950/10": state.urgencyLevel ==="critical"?"border-red-200/40 dark:border-red-800/20 bg-red-50/20 dark:bg-red-950/5":"border-border/50 bg-muted/20")}
 >
 <PeerCompletionRing
 completed={state.teamCompleted}
 total={state.teamTotal}
 />
 </div>
 </div>
 );
}
