"use client";

// =====================================================================
// ACTIVITY TRACKER -- Passive, Silent, Inescapable Data Collection
// =====================================================================
//
// This component wraps the entire app and silently records everything:
// - Page views with dwell time
// - Tab focus/blur events with focus ratio
// - Idle detection (2-minute threshold)
// - Click counts per route
// - Typing speed sessions
// - Session-level aggregate stats
// - Entry writing metadata (dialog open -> submit timing, paste detection)
//
// All data is stored client-side in refs (no re-renders) and exposed
// via context hooks. A snapshot is persisted to localStorage every 60s
// and optionally synced to Supabase live_status every 5 minutes.
//
// Renders nothing visible. Attaches global event listeners.
// =====================================================================

import {
 createContext,
 useContext,
 useEffect,
 useRef,
 useCallback,
 useState,
 type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageView {
 path: string;
 entered: number;
 left: number;
}

interface FocusEvent {
 type:"focus"|"blur";
 timestamp: number;
}

interface IdlePeriod {
 start: number;
 end: number;
 duration: number;
}

interface TypingSession {
 route: string;
 cpm: number;
 duration: number;
}

interface EntryWritingData {
 dialogOpenedAt: number;
 keystrokeCount: number;
 pasteCount: number;
 charCount: number;
 wordCount: number;
 submittedAt: number | null;
}

interface SessionStats {
 sessionStart: number;
 totalActiveTime: number;
 totalIdleTime: number;
 pagesVisited: number;
 tabFocusRatio: number;
}

interface ActivityData {
 // Raw tracked arrays
 pageViews: PageView[];
 focusEvents: FocusEvent[];
 idlePeriods: IdlePeriod[];
 clicksByRoute: Record<string, number>;
 typingSessions: TypingSession[];

 // Session aggregates
 sessionStats: SessionStats;

 // Entry writing (current in-progress entry)
 currentEntryWriting: EntryWritingData | null;
 completedEntryWritings: EntryWritingData[];
}

interface EntryWritingTracker {
 trackEntryStart: () => void;
 trackEntrySubmit: () => EntryWritingData | null;
 trackEntryKeystroke: () => void;
 trackEntryPaste: () => void;
 trackEntryContent: (text: string) => void;
}

interface ActivityContextValue {
 data: ActivityData;
 entryTracker: EntryWritingTracker;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const IDLE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const LOCALSTORAGE_KEY ="exoma_activity_snapshot";
const LOCALSTORAGE_SAVE_INTERVAL = 60_000; // 60 seconds
const SUPABASE_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

function createEmptyData(): ActivityData {
 return {
 pageViews: [],
 focusEvents: [],
 idlePeriods: [],
 clicksByRoute: {},
 typingSessions: [],
 sessionStats: {
 sessionStart: Date.now(),
 totalActiveTime: 0,
 totalIdleTime: 0,
 pagesVisited: 0,
 tabFocusRatio: 1,
 },
 currentEntryWriting: null,
 completedEntryWritings: [],
 };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ActivityContext = createContext<ActivityContextValue>({
 data: createEmptyData(),
 entryTracker: {
 trackEntryStart: () => {},
 trackEntrySubmit: () => null,
 trackEntryKeystroke: () => {},
 trackEntryPaste: () => {},
 trackEntryContent: () => {},
 },
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ActivityTrackerProvider({ children }: { children: ReactNode }) {
 const pathname = usePathname();
 const { userId, orgId } = useOrg();

 // All tracking data lives in refs to avoid re-renders
 const dataRef = useRef<ActivityData>(createEmptyData());

 // Page tracking refs
 const currentPageRef = useRef<{ path: string; entered: number }>({
 path: pathname ??"/",
 entered: Date.now(),
 });

 // Focus tracking refs
 const lastFocusStateRef = useRef<boolean>(true);
 const focusedTimeRef = useRef<number>(0);
 const blurredTimeRef = useRef<number>(0);
 const lastFocusChangeRef = useRef<number>(Date.now());

 // Idle tracking refs
 const lastActivityRef = useRef<number>(Date.now());
 const isIdleRef = useRef<boolean>(false);
 const idleStartRef = useRef<number>(0);

 // Typing tracking refs
 const typingSessionRef = useRef<{
 route: string;
 startTime: number;
 charCount: number;
 lastKeystroke: number;
 } | null>(null);

 // Entry writing ref
 const entryWritingRef = useRef<EntryWritingData | null>(null);

 // Force a state update when hooks need fresh data
 const [, setTick] = useState(0);
 const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

 // -------------------------------------------------------------------
 // Helper: finalize current page view
 // -------------------------------------------------------------------
 const finalizePageView = useCallback(() => {
 const current = currentPageRef.current;
 if (current) {
 const now = Date.now();
 dataRef.current.pageViews.push({
 path: current.path,
 entered: current.entered,
 left: now,
 });
 // Keep only last 500 page views to prevent memory bloat
 if (dataRef.current.pageViews.length > 500) {
 dataRef.current.pageViews = dataRef.current.pageViews.slice(-500);
 }
 }
 }, []);

 // -------------------------------------------------------------------
 // 1. PAGE VIEW TRACKING
 // -------------------------------------------------------------------
 useEffect(() => {
 if (!pathname) return;

 // Finalize previous page
 finalizePageView();

 // Start new page
 currentPageRef.current = { path: pathname, entered: Date.now() };

 // Update pages visited count
 const uniquePaths = new Set(dataRef.current.pageViews.map((pv) => pv.path));
 uniquePaths.add(pathname);
 dataRef.current.sessionStats.pagesVisited = uniquePaths.size;
 }, [pathname, finalizePageView]);

 // -------------------------------------------------------------------
 // 2. FOCUS / BLUR TRACKING
 // -------------------------------------------------------------------
 useEffect(() => {
 function handleVisibilityChange() {
 const now = Date.now();
 const isVisible = document.visibilityState ==="visible";

 if (isVisible === lastFocusStateRef.current) return;

 const elapsed = now - lastFocusChangeRef.current;

 if (lastFocusStateRef.current) {
 // Was focused, now blurring
 focusedTimeRef.current += elapsed;
 } else {
 // Was blurred, now focusing
 blurredTimeRef.current += elapsed;
 }

 dataRef.current.focusEvents.push({
 type: isVisible ?"focus":"blur",
 timestamp: now,
 });

 // Cap focus events at 1000
 if (dataRef.current.focusEvents.length > 1000) {
 dataRef.current.focusEvents = dataRef.current.focusEvents.slice(-1000);
 }

 lastFocusStateRef.current = isVisible;
 lastFocusChangeRef.current = now;

 // Update focus ratio
 const totalTracked = focusedTimeRef.current + blurredTimeRef.current;
 dataRef.current.sessionStats.tabFocusRatio =
 totalTracked > 0 ? focusedTimeRef.current / totalTracked : 1;
 }

 function handleFocus() {
 if (!lastFocusStateRef.current) {
 const now = Date.now();
 const elapsed = now - lastFocusChangeRef.current;
 blurredTimeRef.current += elapsed;

 dataRef.current.focusEvents.push({ type:"focus", timestamp: now });
 lastFocusStateRef.current = true;
 lastFocusChangeRef.current = now;

 const totalTracked = focusedTimeRef.current + blurredTimeRef.current;
 dataRef.current.sessionStats.tabFocusRatio =
 totalTracked > 0 ? focusedTimeRef.current / totalTracked : 1;
 }
 }

 function handleBlur() {
 if (lastFocusStateRef.current) {
 const now = Date.now();
 const elapsed = now - lastFocusChangeRef.current;
 focusedTimeRef.current += elapsed;

 dataRef.current.focusEvents.push({ type:"blur", timestamp: now });
 lastFocusStateRef.current = false;
 lastFocusChangeRef.current = now;

 const totalTracked = focusedTimeRef.current + blurredTimeRef.current;
 dataRef.current.sessionStats.tabFocusRatio =
 totalTracked > 0 ? focusedTimeRef.current / totalTracked : 1;
 }
 }

 document.addEventListener("visibilitychange", handleVisibilityChange);
 window.addEventListener("focus", handleFocus);
 window.addEventListener("blur", handleBlur);

 return () => {
 document.removeEventListener("visibilitychange", handleVisibilityChange);
 window.removeEventListener("focus", handleFocus);
 window.removeEventListener("blur", handleBlur);
 };
 }, []);

 // -------------------------------------------------------------------
 // 3. IDLE DETECTION + 4. CLICK HEATMAP + 5. TYPING SPEED
 // -------------------------------------------------------------------
 useEffect(() => {
 function resetIdle() {
 const now = Date.now();
 lastActivityRef.current = now;

 if (isIdleRef.current) {
 // End idle period
 const idleDuration = now - idleStartRef.current;
 dataRef.current.idlePeriods.push({
 start: idleStartRef.current,
 end: now,
 duration: idleDuration,
 });
 // Cap at 200 idle periods
 if (dataRef.current.idlePeriods.length > 200) {
 dataRef.current.idlePeriods = dataRef.current.idlePeriods.slice(-200);
 }
 isIdleRef.current = false;
 }
 }

 function handleMouseMove() {
 resetIdle();
 }

 function handleClick() {
 resetIdle();

 // Track click by route
 const route = currentPageRef.current?.path ??"/";
 dataRef.current.clicksByRoute[route] =
 (dataRef.current.clicksByRoute[route] ?? 0) + 1;
 }

 function handleKeydown(e: KeyboardEvent) {
 resetIdle();

 // Typing speed tracking: only for actual character input in text fields
 const target = e.target as HTMLElement;
 const isTextInput =
 target.tagName ==="INPUT"||
 target.tagName ==="TEXTAREA"||
 target.contentEditable ==="true";

 if (!isTextInput) return;
 // Ignore modifier-only keys
 if (e.key.length > 1 && !["Backspace","Delete","Enter"].includes(e.key)) return;

 const now = Date.now();
 const route = currentPageRef.current?.path ??"/";
 const session = typingSessionRef.current;

 if (
 session &&
 session.route === route &&
 now - session.lastKeystroke < 5000 // 5s gap = new session
 ) {
 session.charCount++;
 session.lastKeystroke = now;
 } else {
 // Finalize previous session if exists
 if (session) {
 const durationMs = session.lastKeystroke - session.startTime;
 if (durationMs > 2000) {
 // Only track sessions > 2 seconds
 const durationMinutes = durationMs / 60_000;
 const cpm =
 durationMinutes > 0 ? session.charCount / durationMinutes : 0;
 dataRef.current.typingSessions.push({
 route: session.route,
 cpm: Math.round(cpm),
 duration: durationMs,
 });
 // Cap at 200
 if (dataRef.current.typingSessions.length > 200) {
 dataRef.current.typingSessions =
 dataRef.current.typingSessions.slice(-200);
 }
 }
 }
 // Start new session
 typingSessionRef.current = {
 route,
 startTime: now,
 charCount: 1,
 lastKeystroke: now,
 };
 }

 // Also track entry writing keystrokes
 if (entryWritingRef.current) {
 entryWritingRef.current.keystrokeCount++;
 }
 }

 function handlePaste() {
 // Track paste events for entry writing detection
 if (entryWritingRef.current) {
 entryWritingRef.current.pasteCount++;
 }
 }

 // Idle check interval (every 10 seconds)
 const idleCheckInterval = setInterval(() => {
 const now = Date.now();
 const idleMs = now - lastActivityRef.current;

 if (idleMs >= IDLE_THRESHOLD_MS && !isIdleRef.current) {
 isIdleRef.current = true;
 idleStartRef.current = lastActivityRef.current; // Idle started when last activity happened
 }
 }, 10_000);

 window.addEventListener("mousemove", handleMouseMove, { passive: true });
 window.addEventListener("click", handleClick, { passive: true });
 window.addEventListener("keydown", handleKeydown, { passive: true });
 document.addEventListener("paste", handlePaste, { passive: true });

 return () => {
 window.removeEventListener("mousemove", handleMouseMove);
 window.removeEventListener("click", handleClick);
 window.removeEventListener("keydown", handleKeydown);
 document.removeEventListener("paste", handlePaste);
 clearInterval(idleCheckInterval);
 };
 }, []);

 // -------------------------------------------------------------------
 // 6. SESSION STATS COMPUTATION (every 30 seconds)
 // -------------------------------------------------------------------
 useEffect(() => {
 const interval = setInterval(() => {
 const now = Date.now();
 const sessionStart = dataRef.current.sessionStats.sessionStart;
 const totalElapsed = now - sessionStart;

 // Sum idle time
 const totalIdleMs = dataRef.current.idlePeriods.reduce(
 (sum, p) => sum + p.duration,
 0
 );
 // Add current idle if active
 const currentIdleExtra =
 isIdleRef.current ? now - idleStartRef.current : 0;

 // Sum blurred time
 const currentBlurExtra = lastFocusStateRef.current
 ? 0
 : now - lastFocusChangeRef.current;
 const totalBlurred = blurredTimeRef.current + currentBlurExtra;

 // Active = total - idle - blurred (but don't double count)
 const inactiveTime = Math.max(totalIdleMs + currentIdleExtra, totalBlurred);
 const activeTime = Math.max(0, totalElapsed - inactiveTime);

 dataRef.current.sessionStats.totalActiveTime = activeTime;
 dataRef.current.sessionStats.totalIdleTime =
 totalIdleMs + currentIdleExtra;

 // Update focus ratio with current state
 const currentFocusExtra = lastFocusStateRef.current
 ? now - lastFocusChangeRef.current
 : 0;
 const totalFocused = focusedTimeRef.current + currentFocusExtra;
 const totalTracked = totalFocused + totalBlurred;
 dataRef.current.sessionStats.tabFocusRatio =
 totalTracked > 0 ? totalFocused / totalTracked : 1;

 // Trigger a render so hooks get fresh data
 setTick((t) => t + 1);
 }, 30_000);

 return () => clearInterval(interval);
 }, []);

 // -------------------------------------------------------------------
 // LOCALSTORAGE PERSISTENCE (every 60 seconds)
 // -------------------------------------------------------------------
 useEffect(() => {
 // Load previous session data
 try {
 const stored = localStorage.getItem(LOCALSTORAGE_KEY);
 if (stored) {
 const parsed = JSON.parse(stored) as Partial<ActivityData>;
 // Merge completed entry writings from previous session
 if (parsed.completedEntryWritings) {
 dataRef.current.completedEntryWritings =
 parsed.completedEntryWritings.slice(-50);
 }
 }
 } catch {
 // Ignore parse errors
 }

 const saveInterval = setInterval(() => {
 try {
 const snapshot: Partial<ActivityData> = {
 pageViews: dataRef.current.pageViews.slice(-100),
 clicksByRoute: dataRef.current.clicksByRoute,
 typingSessions: dataRef.current.typingSessions.slice(-50),
 sessionStats: { ...dataRef.current.sessionStats },
 completedEntryWritings:
 dataRef.current.completedEntryWritings.slice(-50),
 idlePeriods: dataRef.current.idlePeriods.slice(-50),
 focusEvents: dataRef.current.focusEvents.slice(-100),
 };
 localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(snapshot));
 } catch {
 // localStorage full or unavailable, silently fail
 }
 }, LOCALSTORAGE_SAVE_INTERVAL);

 return () => clearInterval(saveInterval);
 }, []);

 // -------------------------------------------------------------------
 // SUPABASE SYNC (every 5 minutes -- write to live_status metadata)
 // -------------------------------------------------------------------
 useEffect(() => {
 if (!userId || !orgId) return;

 const syncInterval = setInterval(async () => {
 try {
 const supabase = createClient();
 const stats = dataRef.current.sessionStats;
 const snapshot = {
 session_start: stats.sessionStart,
 active_time_ms: stats.totalActiveTime,
 idle_time_ms: stats.totalIdleTime,
 pages_visited: stats.pagesVisited,
 tab_focus_ratio: Math.round(stats.tabFocusRatio * 100) / 100,
 total_clicks: Object.values(dataRef.current.clicksByRoute).reduce(
 (a, b) => a + b,
 0
 ),
 typing_sessions_count: dataRef.current.typingSessions.length,
 idle_periods_count: dataRef.current.idlePeriods.length,
 avg_typing_cpm:
 dataRef.current.typingSessions.length > 0
 ? Math.round(
 dataRef.current.typingSessions.reduce(
 (sum, s) => sum + s.cpm,
 0
 ) / dataRef.current.typingSessions.length
 )
 : 0,
 last_sync: new Date().toISOString(),
 };

 // Update live_status with activity snapshot in current_task as JSON
 // This piggybacks on the existing heartbeat mechanism
 await supabase
 .from("live_status")
 .upsert(
 {
 user_id: userId,
 org_id: orgId,
 last_heartbeat: new Date().toISOString(),
 current_task: JSON.stringify({
 _activity_snapshot: snapshot,
 }),
 },
 { onConflict:"user_id"}
 );
 } catch {
 // Silently fail -- this is non-critical telemetry
 }
 }, SUPABASE_SYNC_INTERVAL);

 return () => clearInterval(syncInterval);
 }, [userId, orgId]);

 // -------------------------------------------------------------------
 // CLEANUP: save on unmount / page unload
 // -------------------------------------------------------------------
 useEffect(() => {
 function handleBeforeUnload() {
 // Finalize current page
 finalizePageView();

 // Finalize any in-progress typing session
 const session = typingSessionRef.current;
 if (session) {
 const durationMs = session.lastKeystroke - session.startTime;
 if (durationMs > 2000) {
 const durationMinutes = durationMs / 60_000;
 const cpm =
 durationMinutes > 0 ? session.charCount / durationMinutes : 0;
 dataRef.current.typingSessions.push({
 route: session.route,
 cpm: Math.round(cpm),
 duration: durationMs,
 });
 }
 typingSessionRef.current = null;
 }

 // Final save
 try {
 const snapshot: Partial<ActivityData> = {
 pageViews: dataRef.current.pageViews.slice(-100),
 clicksByRoute: dataRef.current.clicksByRoute,
 typingSessions: dataRef.current.typingSessions.slice(-50),
 sessionStats: { ...dataRef.current.sessionStats },
 completedEntryWritings:
 dataRef.current.completedEntryWritings.slice(-50),
 idlePeriods: dataRef.current.idlePeriods.slice(-50),
 focusEvents: dataRef.current.focusEvents.slice(-100),
 };
 localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(snapshot));
 } catch {
 // Ignore
 }
 }

 window.addEventListener("beforeunload", handleBeforeUnload);
 return () => {
 window.removeEventListener("beforeunload", handleBeforeUnload);
 handleBeforeUnload(); // Also run on React unmount
 };
 }, [finalizePageView]);

 // -------------------------------------------------------------------
 // 7. ENTRY WRITING TRACKER
 // -------------------------------------------------------------------
 const trackEntryStart = useCallback(() => {
 entryWritingRef.current = {
 dialogOpenedAt: Date.now(),
 keystrokeCount: 0,
 pasteCount: 0,
 charCount: 0,
 wordCount: 0,
 submittedAt: null,
 };
 }, []);

 const trackEntrySubmit = useCallback((): EntryWritingData | null => {
 if (!entryWritingRef.current) return null;

 const completed: EntryWritingData = {
 ...entryWritingRef.current,
 submittedAt: Date.now(),
 };

 dataRef.current.completedEntryWritings.push(completed);
 // Cap at 100
 if (dataRef.current.completedEntryWritings.length > 100) {
 dataRef.current.completedEntryWritings =
 dataRef.current.completedEntryWritings.slice(-100);
 }

 entryWritingRef.current = null;
 return completed;
 }, []);

 const trackEntryKeystroke = useCallback(() => {
 if (entryWritingRef.current) {
 entryWritingRef.current.keystrokeCount++;
 }
 }, []);

 const trackEntryPaste = useCallback(() => {
 if (entryWritingRef.current) {
 entryWritingRef.current.pasteCount++;
 }
 }, []);

 const trackEntryContent = useCallback((text: string) => {
 if (entryWritingRef.current) {
 entryWritingRef.current.charCount = text.length;
 entryWritingRef.current.wordCount = text
 .trim()
 .split(/\s+/)
 .filter(Boolean).length;
 }
 }, []);

 // -------------------------------------------------------------------
 // CONTEXT VALUE (stable ref -- only changes on tick)
 // -------------------------------------------------------------------
 const contextValue: ActivityContextValue = {
 data: dataRef.current,
 entryTracker: {
 trackEntryStart,
 trackEntrySubmit,
 trackEntryKeystroke,
 trackEntryPaste,
 trackEntryContent,
 },
 };

 return (
 <ActivityContext.Provider value={contextValue}>
 {children}
 </ActivityContext.Provider>
 );
}

// ---------------------------------------------------------------------------
// HOOKS
// ---------------------------------------------------------------------------

/**
 * Returns all tracked activity data.
 * Data updates every 30 seconds (session stats recalculation).
 */
export function useActivityData(): ActivityData {
 const { data } = useContext(ActivityContext);
 return data;
}

/**
 * Returns session-level summary statistics.
 */
export function useSessionStats(): SessionStats {
 const { data } = useContext(ActivityContext);
 return data.sessionStats;
}

/**
 * Returns entry writing tracking functions.
 * Call trackEntryStart() when opening the log entry dialog.
 * Call trackEntrySubmit() when the entry is submitted.
 */
export function useEntryWritingTracker(): EntryWritingTracker {
 const { entryTracker } = useContext(ActivityContext);
 return entryTracker;
}
