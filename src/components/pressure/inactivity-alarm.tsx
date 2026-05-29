"use client";

import {
 useEffect,
 useState,
 useCallback,
 useRef,
 useMemo,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
 AlertTriangle,
 Skull,
 Clock,
 Activity,
 Eye,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EscalationStage ="none"|"gentle"|"warning"|"alert"|"escalation";

interface IdleSession {
 startedAt: number;
 endedAt: number | null;
 durationMin: number;
}

interface BreakdownEntry {
 label: string;
 minutes: number;
 stage: EscalationStage;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGE_THRESHOLDS = {
 gentle: 5 * 60 * 1000, // 5 minutes
 warning: 10 * 60 * 1000, // 10 minutes
 alert: 20 * 60 * 1000, // 20 minutes
 escalation: 30 * 60 * 1000, // 30 minutes
} as const;

const ACTIVITY_EVENTS = [
"mousemove",
"keydown",
"click",
"scroll",
"touchstart",
] as const;

const IDLE_CHECK_INTERVAL = 1_000; // 1 second for real-time counter

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isWorkHours(): boolean {
 const now = new Date();
 const day = now.getDay();
 const hour = now.getHours();
 // Monday=1 through Friday=5, 7am to 6pm
 return day >= 1 && day <= 5 && hour >= 7 && hour < 18;
}

function formatMinutes(min: number): string {
 if (min < 1) return"< 1m";
 const h = Math.floor(min / 60);
 const m = Math.round(min % 60);
 if (h === 0) return`${m}m`;
 return m > 0 ?`${h}h ${m}m`:`${h}h`;
}

function formatMinutesLong(min: number): string {
 const rounded = Math.floor(min);
 if (rounded < 1) return"menos de 1 minuto";
 if (rounded === 1) return"1 minuto";
 if (rounded < 60) return`${rounded} minutos`;
 const h = Math.floor(rounded / 60);
 const m = rounded % 60;
 if (m === 0) return`${h} hora${h > 1 ?"s":""}`;
 return`${h}h ${m}m`;
}

function todayISO(): string {
 return new Date().toISOString().slice(0, 10);
}

function getStage(idleMs: number): EscalationStage {
 if (idleMs >= STAGE_THRESHOLDS.escalation) return"escalation";
 if (idleMs >= STAGE_THRESHOLDS.alert) return"alert";
 if (idleMs >= STAGE_THRESHOLDS.warning) return"warning";
 if (idleMs >= STAGE_THRESHOLDS.gentle) return"gentle";
 return"none";
}

// ---------------------------------------------------------------------------
// CSS keyframes injected once
// ---------------------------------------------------------------------------

const KEYFRAMES_ID ="inactivity-alarm-keyframes";

function ensureKeyframes() {
 if (typeof document ==="undefined") return;
 if (document.getElementById(KEYFRAMES_ID)) return;

 const style = document.createElement("style");
 style.id = KEYFRAMES_ID;
 style.textContent =`@keyframes inactivity-pulse {
 0%, 100% { opacity: 1; }
 50% { opacity: 0.7; }
 }
 @keyframes inactivity-glow {
 0%, 100% { box-shadow: inset 0 0 20px rgba(239, 68, 68, 0.3); }
 50% { box-shadow: inset 0 0 40px rgba(239, 68, 68, 0.6); }
 }
 @keyframes inactivity-border-glow {
 0%, 100% { border-color: rgb(239, 68, 68); }
 50% { border-color: rgb(220, 38, 38); }
 }
 @keyframes inactivity-toast-in {
 from { transform: translateY(100%); opacity: 0; }
 to { transform: translateY(0); opacity: 1; }
 }
 @keyframes inactivity-skull-pulse {
 0%, 100% { transform: scale(1); }
 50% { transform: scale(1.05); }
 }
 @keyframes inactivity-counter-tick {
 0% { color: rgb(239, 68, 68); }
 50% { color: rgb(185, 28, 28); }
 100% { color: rgb(239, 68, 68); }
 }
`;
 document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InactivityAlarm({
 orgId,
 userId,
}: {
 orgId?: string;
 userId?: string;
}) {
 const supabase = createClient();

 // Core idle tracking
 const [lastActivity, setLastActivity] = useState<number>(Date.now());
 const [idleMs, setIdleMs] = useState(0);
 const [stage, setStage] = useState<EscalationStage>("none");
 const [dismissed, setDismissed] = useState(false);
 const [duringWorkHours, setDuringWorkHours] = useState(isWorkHours());

 // Cumulative tracking
 const [totalIdleToday, setTotalIdleToday] = useState(0);
 const [totalActiveToday, setTotalActiveToday] = useState(0);
 const [idleSessions, setIdleSessions] = useState<IdleSession[]>([]);
 const [showBreakdown, setShowBreakdown] = useState(false);

 // Escalation flag tracking (prevent duplicate inserts)
 const escalationFlagInserted = useRef(false);
 const sessionStartRef = useRef<number>(Date.now());
 const currentIdleSessionStart = useRef<number | null>(null);

 // ---------------------------------------------------------------------------
 // Inject CSS keyframes on mount
 // ---------------------------------------------------------------------------

 useEffect(() => {
 ensureKeyframes();
 sessionStartRef.current = Date.now();
 }, []);

 // ---------------------------------------------------------------------------
 // Activity listener
 // ---------------------------------------------------------------------------

 const handleActivity = useCallback(() => {
 const now = Date.now();
 const wasIdle = currentIdleSessionStart.current !== null;

 // If we were in an idle session, record it
 if (wasIdle && currentIdleSessionStart.current) {
 const idleDuration = now - currentIdleSessionStart.current;
 if (idleDuration >= STAGE_THRESHOLDS.gentle) {
 setIdleSessions((prev) => [
 ...prev,
 {
 startedAt: currentIdleSessionStart.current!,
 endedAt: now,
 durationMin: idleDuration / 60_000,
 },
 ]);
 setTotalIdleToday((prev) => prev + idleDuration);
 }
 currentIdleSessionStart.current = null;
 }

 setLastActivity(now);
 setDismissed(false);
 escalationFlagInserted.current = false;
 }, []);

 useEffect(() => {
 for (const event of ACTIVITY_EVENTS) {
 window.addEventListener(event, handleActivity, { passive: true });
 }
 return () => {
 for (const event of ACTIVITY_EVENTS) {
 window.removeEventListener(event, handleActivity);
 }
 };
 }, [handleActivity]);

 // ---------------------------------------------------------------------------
 // Idle timer tick (1s interval)
 // ---------------------------------------------------------------------------

 useEffect(() => {
 const interval = setInterval(() => {
 const now = Date.now();
 const elapsed = now - lastActivity;
 const workHours = isWorkHours();

 setDuringWorkHours(workHours);

 if (workHours) {
 setIdleMs(elapsed);
 const newStage = getStage(elapsed);
 setStage(newStage);

 // Track idle session start
 if (elapsed >= STAGE_THRESHOLDS.gentle && currentIdleSessionStart.current === null) {
 currentIdleSessionStart.current = lastActivity + STAGE_THRESHOLDS.gentle;
 }

 // Track cumulative active time (rough: total session - total idle)
 const sessionDuration = now - sessionStartRef.current;
 setTotalActiveToday(sessionDuration - totalIdleToday);
 } else {
 // Outside work hours: reset idle state
 setIdleMs(0);
 setStage("none");
 }
 }, IDLE_CHECK_INTERVAL);

 return () => clearInterval(interval);
 }, [lastActivity, totalIdleToday]);

 // ---------------------------------------------------------------------------
 // Stage 4 - Auto-insert accountability flag
 // ---------------------------------------------------------------------------

 useEffect(() => {
 if (stage !=="escalation") return;
 if (escalationFlagInserted.current) return;
 if (!duringWorkHours) return;

 escalationFlagInserted.current = true;
 const durationMin = Math.round(idleMs / 60_000);

 async function insertFlag() {
 await supabase.from("accountability_flags").insert({
 user_id: userId,
 org_id: orgId,
 flag_type:"idle_long"as const,
 date: todayISO(),
 details:`Inactividad prolongada de ${durationMin} minutos durante horario laboral. Detectado automaticamente por el sistema de monitoreo.`,
 resolved: false,
 });
 }

 insertFlag();
 }, [stage, duringWorkHours, idleMs, userId, orgId, supabase]);

 // ---------------------------------------------------------------------------
 // Derived values
 // ---------------------------------------------------------------------------

 const idleMinutes = useMemo(() => Math.floor(idleMs / 60_000), [idleMs]);
 const idleSeconds = useMemo(
 () => Math.floor((idleMs % 60_000) / 1_000),
 [idleMs],
 );
 const totalIdleMin = useMemo(
 () => Math.floor(totalIdleToday / 60_000),
 [totalIdleToday],
 );
 const totalActiveMin = useMemo(
 () => Math.max(0, Math.floor(totalActiveToday / 60_000)),
 [totalActiveToday],
 );

 const breakdown = useMemo<BreakdownEntry[]>(() => {
 return idleSessions
 .filter((s) => s.durationMin >= 1)
 .map((s, i) => {
 const startTime = new Date(s.startedAt);
 const label =`${startTime.getHours().toString().padStart(2,"0")}:${startTime.getMinutes().toString().padStart(2,"0")}`;
 return {
 label,
 minutes: Math.round(s.durationMin),
 stage: getStage(s.durationMin * 60_000),
 };
 });
 }, [idleSessions]);

 // ---------------------------------------------------------------------------
 // Dismiss handler for Stage 1 toast
 // ---------------------------------------------------------------------------

 const handleDismissToast = useCallback((e: React.MouseEvent) => {
 e.stopPropagation();
 setDismissed(true);
 }, []);

 // ---------------------------------------------------------------------------
 // Handle Stage 4 overlay click (dismiss + reset)
 // ---------------------------------------------------------------------------

 const handleEscalationClick = useCallback(() => {
 handleActivity();
 }, [handleActivity]);

 // ---------------------------------------------------------------------------
 // Don't render anything outside work hours or if no alarm state
 // ---------------------------------------------------------------------------

 if (!duringWorkHours && stage ==="none") {
 return null;
 }

 return (
 <>
 {/* ------------------------------------------------------------------ */}
 {/* Corner Widget - Always visible during work hours */}
 {/* ------------------------------------------------------------------ */}
 {duringWorkHours && (
 <div className="fixed bottom-4 left-4 z-[9998]">
 <button
 type="button"onClick={() => setShowBreakdown((prev) => !prev)}
 className={cn(
"flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-all duration-300",
"border border-border/50",
 stage ==="none"?"bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20":"bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20",
 )}
 >
 <span
 className={cn(
"inline-block h-2 w-2 rounded-full",
 stage ==="none"?"bg-green-500 animate-pulse":"bg-red-500 animate-pulse",
 )}
 />
 <Activity className="h-3 w-3"/>
 <span className="tabular-nums">
 Activo: {formatMinutes(totalActiveMin)}
 </span>
 <span className="text-muted-foreground">|</span>
 <Clock className="h-3 w-3"/>
 <span className="tabular-nums">
 Inactivo: {formatMinutes(totalIdleMin)}
 </span>
 </button>

 {/* Breakdown popover */}
 {showBreakdown && (
 <div
 className={cn(
"absolute bottom-full left-0 mb-2 w-72 border border-border bg-background/95 p-4 shadow-2xl backdrop-blur-sm",
 )}
 >
 <div className="mb-3 flex items-center justify-between">
 <h4 className="text-sm font-semibold flex items-center gap-1.5">
 <Eye className="h-3.5 w-3.5 text-muted-foreground"/>
 Desglose de actividad
 </h4>
 <button
 type="button"onClick={() => setShowBreakdown(false)}
 className="text-xs text-muted-foreground hover:text-foreground">
 Cerrar
 </button>
 </div>

 {/* Summary bars */}
 <div className="space-y-2 mb-3">
 <div className="flex items-center justify-between text-xs">
 <span className="text-green-600 dark:text-green-400 font-medium">
 Tiempo activo
 </span>
 <span className="tabular-nums font-semibold">
 {formatMinutes(totalActiveMin)}
 </span>
 </div>
 <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
 <div
 className="h-full rounded-full bg-green-500 transition-all duration-500"style={{
 width:`${totalActiveMin + totalIdleMin > 0 ? (totalActiveMin / (totalActiveMin + totalIdleMin)) * 100 : 100}%`,
 }}
 />
 </div>

 <div className="flex items-center justify-between text-xs">
 <span className="text-red-600 dark:text-red-400 font-medium">
 Tiempo inactivo
 </span>
 <span className="tabular-nums font-semibold">
 {formatMinutes(totalIdleMin)}
 </span>
 </div>
 <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
 <div
 className="h-full rounded-full bg-red-500 transition-all duration-500"style={{
 width:`${totalActiveMin + totalIdleMin > 0 ? (totalIdleMin / (totalActiveMin + totalIdleMin)) * 100 : 0}%`,
 }}
 />
 </div>
 </div>

 {/* Idle sessions list */}
 {breakdown.length > 0 && (
 <div className="border-t border-border pt-2">
 <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
 Periodos de inactividad
 </p>
 <div className="max-h-32 space-y-1 overflow-y-auto">
 {breakdown.map((entry, i) => (
 <div
 key={i}
 className="flex items-center justify-between rounded-md px-2 py-1 text-xs bg-muted/40">
 <span className="text-muted-foreground tabular-nums">
 {entry.label}
 </span>
 <Badge
 variant={
 entry.stage ==="escalation"?"destructive": entry.stage ==="alert"?"destructive":"secondary"}
 className="h-4 text-[10px] px-1.5 tabular-nums">
 {entry.minutes}m
 </Badge>
 </div>
 ))}
 </div>
 </div>
 )}

 {breakdown.length === 0 && (
 <p className="text-[11px] text-muted-foreground text-center py-2">
 Sin periodos de inactividad significativos hoy
 </p>
 )}

 {/* Warning footer */}
 <div className="mt-3 border-t border-border pt-2">
 <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
 <Eye className="h-2.5 w-2.5"/>
 Esta informacion es visible para tu equipo
 </p>
 </div>
 </div>
 )}
 </div>
 )}

 {/* ------------------------------------------------------------------ */}
 {/* Stage 1 - Gentle Toast (5-10 min) */}
 {/* ------------------------------------------------------------------ */}
 {stage ==="gentle"&& !dismissed && duringWorkHours && (
 <div
 className="fixed bottom-16 right-4 z-[9999] max-w-sm"style={{ animation:"inactivity-toast-in 0.3s ease-out"}}
 >
 <div
 className={cn(
"flex items-center gap-3 border border-yellow-300/50 bg-yellow-50/95 px-4 py-3 backdrop-blur-sm",
"dark:border-yellow-700/50 dark:bg-yellow-950/90",
 )}
 >
 <Clock className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400"/>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
 Has estado inactivo por {idleMinutes} minuto{idleMinutes !== 1 ?"s":""}
 </p>
 <p className="text-xs text-yellow-600/80 dark:text-yellow-400/70 mt-0.5">
 Tu actividad esta siendo monitoreada
 </p>
 </div>
 <button
 type="button"onClick={handleDismissToast}
 className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-200/60 dark:text-yellow-300 dark:hover:bg-yellow-900/40 transition-colors">
 OK
 </button>
 </div>
 </div>
 )}

 {/* ------------------------------------------------------------------ */}
 {/* Stage 2 - Warning Banner (10-20 min) */}
 {/* ------------------------------------------------------------------ */}
 {stage ==="warning"&& duringWorkHours && (
 <div
 className={cn(
"fixed top-0 left-0 right-0 z-[9999]",
"bg-orange-500/95 dark:bg-orange-600/95 backdrop-blur-sm",
"border-b-2 border-orange-600 dark:border-orange-700",
"shadow-orange-500/20",
 )}
 style={{ animation:"inactivity-pulse 2s ease-in-out infinite"}}
 >
 <div className="flex items-center justify-center gap-3 px-4 py-3">
 <AlertTriangle className="h-5 w-5 shrink-0 text-white"/>
 <p className="text-sm font-semibold text-white">
 Inactividad de {idleMinutes} minutos detectada. Tu equipo puede
 verlo.
 </p>
 <Eye className="h-4 w-4 shrink-0 text-white/70"/>
 </div>
 </div>
 )}

 {/* ------------------------------------------------------------------ */}
 {/* Stage 3 - Alert Border + Message (20-30 min) */}
 {/* ------------------------------------------------------------------ */}
 {stage ==="alert"&& duringWorkHours && (
 <>
 {/* Red border overlay around entire viewport */}
 <div
 className="fixed inset-0 z-[9998] pointer-events-none"style={{
 border:"4px solid rgb(239, 68, 68)",
 animation:
"inactivity-border-glow 1.5s ease-in-out infinite, inactivity-glow 1.5s ease-in-out infinite",
 }}
 />

 {/* Centered alert message */}
 <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
 <div
 className={cn(
"pointer-events-auto border-2 border-red-500/60 bg-red-950/90 px-8 py-6 shadow-2xl backdrop-blur-md",
"max-w-md text-center",
 )}
 style={{
 animation:"inactivity-skull-pulse 2s ease-in-out infinite",
 }}
 >
 <div className="mb-3 text-4xl">
 <AlertTriangle className="inline h-10 w-10 text-red-400"/>
 </div>
 <h2 className="text-lg font-bold text-red-100 mb-2">
 ALERTA: Inactividad detectada
 </h2>
 <p className="text-red-200/90 text-sm mb-4">
 Esto queda registrado.
 </p>

 {/* Real-time ticking counter */}
 <div
 className="text-3xl font-mono font-bold text-red-400 tabular-nums"style={{
 animation:"inactivity-counter-tick 1s ease-in-out infinite",
 }}
 >
 {idleMinutes}:{idleSeconds.toString().padStart(2,"0")}
 </div>
 <p className="text-xs text-red-400/60 mt-1">
 minutos sin actividad
 </p>

 <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-red-300/60">
 <Eye className="h-3 w-3"/>
 <span>Visible para todo el equipo</span>
 </div>
 </div>
 </div>
 </>
 )}

 {/* ------------------------------------------------------------------ */}
 {/* Stage 4 - Full Escalation Overlay (30+ min) */}
 {/* ------------------------------------------------------------------ */}
 {stage ==="escalation"&& duringWorkHours && (
 <div
 className="fixed inset-0 z-[10000] flex items-center justify-center cursor-pointer"onClick={handleEscalationClick}
 role="button"tabIndex={0}
 onKeyDown={(e) => {
 if (e.key ==="Enter"|| e.key ==="") {
 handleEscalationClick();
 }
 }}
 >
 {/* Semi-transparent red overlay */}
 <div className="absolute inset-0 bg-red-950/80 backdrop-blur-sm"/>

 {/* Content */}
 <div
 className="relative z-10 max-w-lg w-full mx-4 text-center"style={{
 animation:"inactivity-skull-pulse 3s ease-in-out infinite",
 }}
 >
 {/* Skull icon */}
 <div className="mb-6">
 <Skull className="inline h-16 w-16 text-red-400 drop-"/>
 </div>

 {/* Main title */}
 <h1 className="text-2xl sm:text-3xl font-black text-red-100 tracking-tight mb-4">
 INACTIVIDAD PROLONGADA
 </h1>

 {/* Duration counter */}
 <div className="mb-6 inline-flex items-center gap-3 border border-red-500/30 bg-red-900/50 px-6 py-4">
 <Clock className="h-6 w-6 text-red-400"/>
 <div className="text-left">
 <p
 className="text-3xl font-mono font-bold text-red-300 tabular-nums"style={{
 animation:
"inactivity-counter-tick 1s ease-in-out infinite",
 }}
 >
 {idleMinutes}:{idleSeconds.toString().padStart(2,"0")}
 </p>
 <p className="text-xs text-red-400/80">
 sin actividad durante horario laboral
 </p>
 </div>
 </div>

 {/* Warning messages */}
 <div className="space-y-3 mb-8">
 <p className="text-sm text-red-200/90 flex items-center justify-center gap-2">
 <Eye className="h-4 w-4 shrink-0 text-red-400"/>
 Este periodo sera visible para todo el equipo en el reporte
 diario
 </p>
 <p className="text-xs text-red-300/50">
 Se ha generado automaticamente un flag de inactividad prolongada
 </p>
 </div>

 {/* Accountability badge */}
 <Badge
 variant="destructive"className="mb-6 px-4 py-1.5 text-sm">
 <AlertTriangle className="h-4 w-4 mr-1"/>
 Flag: idle_long registrado
 </Badge>

 {/* Resume instruction */}
 <div className="mt-6">
 <p className="text-red-200/60 text-sm animate-pulse">
 Haz clic en cualquier lugar para reanudar
 </p>
 </div>

 {/* Today's total idle */}
 {totalIdleMin > 0 && (
 <div className="mt-8 border-t border-red-800/40 pt-4">
 <p className="text-xs text-red-400/50">
 Tiempo inactivo acumulado hoy:{" "}
 <span className="font-bold text-red-300/70 tabular-nums">
 {formatMinutesLong(totalIdleMin + idleMinutes)}
 </span>
 </p>
 </div>
 )}
 </div>
 </div>
 )}
 </>
 );
}

// ---------------------------------------------------------------------------
// Compact status indicator for embedding in other components
// ---------------------------------------------------------------------------

export function InactivityStatusPill({
 activeMinutes,
 idleMinutes,
 isIdle,
}: {
 activeMinutes: number;
 idleMinutes: number;
 isIdle: boolean;
}) {
 return (
 <div
 className={cn(
"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
 isIdle
 ?"bg-red-500/10 text-red-700 dark:text-red-400":"bg-green-500/10 text-green-700 dark:text-green-400",
 )}
 >
 <span
 className={cn(
"inline-block h-1.5 w-1.5 rounded-full",
 isIdle ?"bg-red-500":"bg-green-500",
 )}
 />
 <Activity className="h-3 w-3"/>
 <span className="tabular-nums">{formatMinutes(activeMinutes)}</span>
 <span className="text-muted-foreground">|</span>
 <Clock className="h-3 w-3"/>
 <span className="tabular-nums">{formatMinutes(idleMinutes)}</span>
 </div>
 );
}
