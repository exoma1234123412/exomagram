"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Eye, Activity, AlertTriangle } from "lucide-react";
import {
 Tooltip,
 TooltipTrigger,
 TooltipContent,
 TooltipProvider,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivityLevel ="intense"|"active"|"light"|"minimal"|"idle";

interface IdlePeriod {
 start: string;
 duration: number; // seconds
}

interface MinuteSnapshot {
 timestamp: string;
 mouseMoves: number;
 keyPresses: number;
 clicks: number;
 scrolls: number;
 totalEvents: number;
 activityLevel: ActivityLevel;
}

interface ActivityFingerprint {
 mouseMoves: number;
 keyPresses: number;
 clicks: number;
 scrolls: number;
 tabFocusTime: number; // ms spent focused
 tabBlurTime: number; // ms spent blurred
 activityLevel: ActivityLevel;
 idlePeriods: IdlePeriod[];
 snapshots: MinuteSnapshot[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IDLE_THRESHOLD_SECONDS = 30;
const EXTENDED_IDLE_SECONDS = 180; // 3 minutes => badge turns red
const REPORT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const SNAPSHOT_INTERVAL_MS = 60 * 1000; // 1 minute
const EVENT_DECAY_MS = 60 * 1000; // window for per-minute counts

const ACTIVITY_THRESHOLDS: { min: number; level: ActivityLevel }[] = [
 { min: 50, level:"intense"},
 { min: 20, level:"active"},
 { min: 5, level:"light"},
 { min: 1, level:"minimal"},
 { min: 0, level:"idle"},
];

const LEVEL_CONFIG: Record<
 ActivityLevel,
 { label: string; color: string; bgColor: string; dotColor: string; textColor: string }
> = {
 intense: {
 label:"Intensa",
 color:"text-green-600 dark:text-green-400",
 bgColor:"bg-green-500/10 dark:bg-green-500/20",
 dotColor:"bg-green-500",
 textColor:"text-green-700 dark:text-green-300",
 },
 active: {
 label:"Activa",
 color:"text-yellow-600 dark:text-yellow-400",
 bgColor:"bg-yellow-500/10 dark:bg-yellow-500/20",
 dotColor:"bg-yellow-500",
 textColor:"text-yellow-700 dark:text-yellow-300",
 },
 light: {
 label:"Ligera",
 color:"text-orange-600 dark:text-orange-400",
 bgColor:"bg-orange-500/10 dark:bg-orange-500/20",
 dotColor:"bg-orange-500",
 textColor:"text-orange-700 dark:text-orange-300",
 },
 minimal: {
 label:"Minima",
 color:"text-red-600 dark:text-red-400",
 bgColor:"bg-red-500/10 dark:bg-red-500/20",
 dotColor:"bg-red-500",
 textColor:"text-red-700 dark:text-red-300",
 },
 idle: {
 label:"Inactivo",
 color:"text-red-600 dark:text-red-400",
 bgColor:"bg-red-500/10 dark:bg-red-500/20",
 dotColor:"bg-red-500",
 textColor:"text-red-700 dark:text-red-300",
 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyActivity(eventsPerMinute: number): ActivityLevel {
 for (const t of ACTIVITY_THRESHOLDS) {
 if (eventsPerMinute >= t.min) return t.level;
 }
 return"idle";
}

function formatTimeSince(ms: number): string {
 const seconds = Math.floor(ms / 1000);
 if (seconds < 60) return`${seconds}s`;
 const minutes = Math.floor(seconds / 60);
 if (minutes < 60) return`${minutes}m`;
 const hours = Math.floor(minutes / 60);
 const remainingMinutes = minutes % 60;
 return remainingMinutes > 0 ?`${hours}h ${remainingMinutes}m`:`${hours}h`;
}

function buildActivitySummary(
 level: ActivityLevel,
 eventsPerMin: number,
 tabAway: boolean,
): string {
 if (tabAway) return"Tab inactivo";
 const config = LEVEL_CONFIG[level];
 return`Actividad ${config.label.toLowerCase()} (${eventsPerMin} eventos/min)`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScreenPulse() {
 const supabase = createClient();

 // --- Counters (reset each minute) ---
 const mouseMovesRef = useRef(0);
 const keyPressesRef = useRef(0);
 const clicksRef = useRef(0);
 const scrollsRef = useRef(0);

 // --- Cumulative totals for fingerprint ---
 const totalMouseRef = useRef(0);
 const totalKeysRef = useRef(0);
 const totalClicksRef = useRef(0);
 const totalScrollsRef = useRef(0);

 // --- Tab focus tracking ---
 const tabFocusTimeRef = useRef(0);
 const tabBlurTimeRef = useRef(0);
 const lastVisibilityChangeRef = useRef(Date.now());
 const isTabVisibleRef = useRef(true);

 // --- Idle tracking ---
 const lastActivityRef = useRef(Date.now());
 const idleStartRef = useRef<number | null>(null);
 const idlePeriodsRef = useRef<IdlePeriod[]>([]);

 // --- Snapshots ---
 const snapshotsRef = useRef<MinuteSnapshot[]>([]);

 // --- Reporting ---
 const lastReportRef = useRef(Date.now());

 // --- UI state ---
 const [activityLevel, setActivityLevel] = useState<ActivityLevel>("active");
 const [eventsPerMinute, setEventsPerMinute] = useState(0);
 const [isTabVisible, setIsTabVisible] = useState(true);
 const [isExtendedIdle, setIsExtendedIdle] = useState(false);
 const [timeSinceLastReport, setTimeSinceLastReport] = useState(0);
 const [isTracking, setIsTracking] = useState(true);

 // ---------------------------------------------------------------------------
 // Report to Supabase
 // ---------------------------------------------------------------------------

 const reportToSupabase = useCallback(
 async (summary: string) => {
 try {
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

 await supabase.from("live_status").upsert({
 user_id: user.id,
 org_id: membership.org_id,
 current_task: summary,
 last_heartbeat: new Date().toISOString(),
 });

 lastReportRef.current = Date.now();
 } catch {
 // Silently fail - monitoring shouldn't break the app
 }
 },
 [], // eslint-disable-line react-hooks/exhaustive-deps
 );

 // ---------------------------------------------------------------------------
 // Report on tab visibility change (immediate)
 // ---------------------------------------------------------------------------

 const reportTabChange = useCallback(
 async (visible: boolean) => {
 const summary = visible ?"Tab activo":"Tab inactivo";
 await reportToSupabase(summary);
 },
 [reportToSupabase],
 );

 // ---------------------------------------------------------------------------
 // Build fingerprint (exported via ref for consumers)
 // ---------------------------------------------------------------------------

 const buildFingerprint = useCallback((): ActivityFingerprint => {
 const totalEvents =
 totalMouseRef.current +
 totalKeysRef.current +
 totalClicksRef.current +
 totalScrollsRef.current;
 const uptimeMinutes = Math.max(
 1,
 (Date.now() - (snapshotsRef.current[0]
 ? new Date(snapshotsRef.current[0].timestamp).getTime()
 : Date.now())) / 60000,
 );
 const avgEventsPerMin = Math.round(totalEvents / uptimeMinutes);

 return {
 mouseMoves: totalMouseRef.current,
 keyPresses: totalKeysRef.current,
 clicks: totalClicksRef.current,
 scrolls: totalScrollsRef.current,
 tabFocusTime: tabFocusTimeRef.current,
 tabBlurTime: tabBlurTimeRef.current,
 activityLevel: classifyActivity(avgEventsPerMin),
 idlePeriods: [...idlePeriodsRef.current],
 snapshots: [...snapshotsRef.current],
 };
 }, []);

 // Expose fingerprint on window for debugging / external consumers
 useEffect(() => {
 (window as unknown as Record<string, unknown>).__screenPulseFingerprint =
 buildFingerprint;
 return () => {
 delete (window as unknown as Record<string, unknown>).__screenPulseFingerprint;
 };
 }, [buildFingerprint]);

 // ---------------------------------------------------------------------------
 // Core tracking effect
 // ---------------------------------------------------------------------------

 useEffect(() => {
 // ---- Activity event handlers ----

 function onMouseMove() {
 mouseMovesRef.current++;
 totalMouseRef.current++;
 touchActivity();
 }

 function onKeyDown() {
 keyPressesRef.current++;
 totalKeysRef.current++;
 touchActivity();
 }

 function onClick() {
 clicksRef.current++;
 totalClicksRef.current++;
 touchActivity();
 }

 function onScroll() {
 scrollsRef.current++;
 totalScrollsRef.current++;
 touchActivity();
 }

 function touchActivity() {
 const now = Date.now();
 lastActivityRef.current = now;

 // End idle period if one was in progress
 if (idleStartRef.current !== null) {
 const duration = (now - idleStartRef.current) / 1000;
 if (duration >= IDLE_THRESHOLD_SECONDS) {
 idlePeriodsRef.current.push({
 start: new Date(idleStartRef.current).toISOString(),
 duration: Math.round(duration),
 });
 // Keep only the last 50 idle periods
 if (idlePeriodsRef.current.length > 50) {
 idlePeriodsRef.current = idlePeriodsRef.current.slice(-50);
 }
 }
 idleStartRef.current = null;
 }

 setIsExtendedIdle(false);
 }

 // ---- Visibility change handler ----

 function onVisibilityChange() {
 const now = Date.now();
 const elapsed = now - lastVisibilityChangeRef.current;

 if (document.hidden) {
 // Tab became hidden
 tabFocusTimeRef.current += elapsed;
 isTabVisibleRef.current = false;
 setIsTabVisible(false);
 reportTabChange(false);
 } else {
 // Tab became visible
 tabBlurTimeRef.current += elapsed;
 isTabVisibleRef.current = true;
 setIsTabVisible(true);
 touchActivity();
 reportTabChange(true);
 }

 lastVisibilityChangeRef.current = now;
 }

 // ---- Register listeners ----

 // Throttle mouse moves to avoid flooding
 let mouseMoveThrottle = 0;
 function onMouseMoveThrottled() {
 const now = Date.now();
 if (now - mouseMoveThrottle < 100) return; // Max 10 events/sec
 mouseMoveThrottle = now;
 onMouseMove();
 }

 // Throttle scroll events
 let scrollThrottle = 0;
 function onScrollThrottled() {
 const now = Date.now();
 if (now - scrollThrottle < 200) return; // Max 5 events/sec
 scrollThrottle = now;
 onScroll();
 }

 window.addEventListener("mousemove", onMouseMoveThrottled);
 window.addEventListener("keydown", onKeyDown);
 window.addEventListener("click", onClick);
 window.addEventListener("scroll", onScrollThrottled, { passive: true });
 document.addEventListener("visibilitychange", onVisibilityChange);

 // ---- Snapshot interval (every 1 minute) ----

 const snapshotInterval = setInterval(() => {
 const totalThisMinute =
 mouseMovesRef.current +
 keyPressesRef.current +
 clicksRef.current +
 scrollsRef.current;

 const level = classifyActivity(totalThisMinute);

 const snapshot: MinuteSnapshot = {
 timestamp: new Date().toISOString(),
 mouseMoves: mouseMovesRef.current,
 keyPresses: keyPressesRef.current,
 clicks: clicksRef.current,
 scrolls: scrollsRef.current,
 totalEvents: totalThisMinute,
 activityLevel: level,
 };

 snapshotsRef.current.push(snapshot);
 // Keep last 60 snapshots (1 hour)
 if (snapshotsRef.current.length > 60) {
 snapshotsRef.current = snapshotsRef.current.slice(-60);
 }

 // Update UI state
 setActivityLevel(level);
 setEventsPerMinute(totalThisMinute);

 // Reset per-minute counters
 mouseMovesRef.current = 0;
 keyPressesRef.current = 0;
 clicksRef.current = 0;
 scrollsRef.current = 0;
 }, SNAPSHOT_INTERVAL_MS);

 // ---- Report interval (every 2 minutes) ----

 const reportInterval = setInterval(() => {
 const totalThisMinute =
 mouseMovesRef.current +
 keyPressesRef.current +
 clicksRef.current +
 scrollsRef.current;

 // Estimate events/min based on recent activity
 const recentSnapshots = snapshotsRef.current.slice(-2);
 const avgEvents =
 recentSnapshots.length > 0
 ? Math.round(
 recentSnapshots.reduce((sum, s) => sum + s.totalEvents, 0) /
 recentSnapshots.length,
 )
 : totalThisMinute;

 const level = classifyActivity(avgEvents);
 const tabAway = !isTabVisibleRef.current;
 const summary = buildActivitySummary(level, avgEvents, tabAway);

 reportToSupabase(summary);
 }, REPORT_INTERVAL_MS);

 // ---- Idle detection interval (every 5 seconds) ----

 const idleCheckInterval = setInterval(() => {
 const secondsSinceActivity =
 (Date.now() - lastActivityRef.current) / 1000;

 if (secondsSinceActivity >= IDLE_THRESHOLD_SECONDS) {
 // Start an idle period if not already tracking one
 if (idleStartRef.current === null) {
 idleStartRef.current = lastActivityRef.current;
 }

 if (secondsSinceActivity >= EXTENDED_IDLE_SECONDS) {
 setIsExtendedIdle(true);
 }
 }
 }, 5000);

 // ---- Timer display update (every second) ----

 const displayInterval = setInterval(() => {
 setTimeSinceLastReport(Date.now() - lastReportRef.current);
 }, 1000);

 // ---- Initial report ----
 setIsTracking(true);
 reportToSupabase("Monitor de actividad iniciado");

 // ---- Cleanup ----

 return () => {
 window.removeEventListener("mousemove", onMouseMoveThrottled);
 window.removeEventListener("keydown", onKeyDown);
 window.removeEventListener("click", onClick);
 window.removeEventListener("scroll", onScrollThrottled);
 document.removeEventListener("visibilitychange", onVisibilityChange);
 clearInterval(snapshotInterval);
 clearInterval(reportInterval);
 clearInterval(idleCheckInterval);
 clearInterval(displayInterval);
 setIsTracking(false);
 };
 }, [reportToSupabase, reportTabChange]);

 // ---------------------------------------------------------------------------
 // Derived display values
 // ---------------------------------------------------------------------------

 const config = LEVEL_CONFIG[activityLevel];
 const showIdleWarning = isExtendedIdle || !isTabVisible;

 const badgeLabel = showIdleWarning
 ?"Inactividad detectada":"Monitoreando actividad";

 const badgeIcon = showIdleWarning ? (
 <AlertTriangle className="h-3 w-3 shrink-0"/>
 ) : (
 <Eye className="h-3 w-3 shrink-0"/>
 );

 // ---------------------------------------------------------------------------
 // Render
 // ---------------------------------------------------------------------------

 return (
 <TooltipProvider>
 <div className="fixed bottom-4 right-4 z-50">
 <Tooltip>
 <TooltipTrigger
 className={cn(
"flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium backdrop-blur-sm",
"border transition-all duration-300 cursor-default select-none",
 showIdleWarning
 ?"border-red-300/60 bg-red-50/90 text-red-700 dark:border-red-700/50 dark:bg-red-950/80 dark:text-red-300":"border-border/60 bg-card/90 text-foreground dark:bg-card/80",
 )}
 >
 {/* Pulse dot */}
 <span className="relative flex h-2 w-2 shrink-0">
 {isTracking && !showIdleWarning && (
 <span
 className={cn(
"absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
 config.dotColor,
 )}
 />
 )}
 <span
 className={cn(
"relative inline-flex h-2 w-2 rounded-full",
 showIdleWarning ?"bg-red-500": config.dotColor,
 )}
 />
 </span>

 {/* Icon */}
 {badgeIcon}

 {/* Label */}
 <span className="hidden sm:inline">{badgeLabel}</span>

 {/* Activity level pill */}
 <span
 className={cn(
"inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
 showIdleWarning
 ?"bg-red-200/60 text-red-800 dark:bg-red-800/40 dark:text-red-200": cn(config.bgColor, config.textColor),
 )}
 >
 <Activity className="h-2.5 w-2.5"/>
 {config.label}
 </span>

 {/* Time since last report */}
 <span className="text-[10px] tabular-nums text-muted-foreground">
 {formatTimeSince(timeSinceLastReport)}
 </span>
 </TooltipTrigger>

 <TooltipContent side="top"sideOffset={8}>
 <div className="space-y-1.5 py-0.5">
 <p className="font-semibold text-[11px]">
 Tu actividad es visible para todo el equipo
 </p>
 <div className="space-y-0.5 text-[10px] opacity-80">
 <p>
 Nivel:{""}
 <span className="font-medium">{config.label}</span> (
 {eventsPerMinute} eventos/min)
 </p>
 <p>
 Tab:{""}
 <span className="font-medium">
 {isTabVisible ?"Activo":"Inactivo"}
 </span>
 </p>
 <p>
 Ultimo reporte: hace{""}
 <span className="font-medium tabular-nums">
 {formatTimeSince(timeSinceLastReport)}
 </span>
 </p>
 </div>
 </div>
 </TooltipContent>
 </Tooltip>
 </div>
 </TooltipProvider>
 );
}

// ---------------------------------------------------------------------------
// Export type for consumers who want the fingerprint shape
// ---------------------------------------------------------------------------

export type { ActivityFingerprint, ActivityLevel, MinuteSnapshot, IdlePeriod };
