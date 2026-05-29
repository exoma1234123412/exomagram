"use client";

// =====================================================================
// DATA PIPELINE — Wires event logger + AI memory into the app flow
// =====================================================================
//
// Sits in the layout, renders nothing visible.
// Captures EVERYTHING silently:
//   - Page views (every route change)
//   - Tab focus/blur events
//   - Session start/end
//   - Periodic activity summaries -> AI memory
//
// Provides a context for other components to log custom events
// and save/retrieve AI memories.
// =====================================================================

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import {
  eventLogger,
  type EventType,
} from "@/lib/event-logger";
import {
  saveAIMemory,
  getUserMemories,
  type AIMemoryEntry,
} from "@/lib/ai-memory";
import { useActivityData } from "@/components/tracking/activity-tracker";

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

interface DataPipelineContextValue {
  logEvent: (type: EventType, data?: Record<string, unknown>) => void;
  saveMemory: (type: string, content: Record<string, unknown>, summary: string) => void;
  getRecentMemories: (type?: string, limit?: number) => AIMemoryEntry[];
}

const noop = () => {};

const DataPipelineContext = createContext<DataPipelineContextValue>({
  logEvent: noop,
  saveMemory: noop,
  getRecentMemories: () => [],
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLLUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DataPipelineProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { userId, orgId } = useOrg();
  const activityData = useActivityData();

  // Refs for tracking state without re-renders
  const initializedRef = useRef(false);
  const prevPathnameRef = useRef<string | null>(null);
  const pageEnteredAtRef = useRef<number>(Date.now());
  const sessionStartRef = useRef<number>(Date.now());
  const lastRollupRef = useRef<number>(Date.now());

  // -------------------------------------------------------------------
  // 1. INITIALIZE EVENT LOGGER on mount
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!userId || !orgId || initializedRef.current) return;

    try {
      const supabase = createClient();
      eventLogger.init(supabase);
      initializedRef.current = true;

      // Log session start
      eventLogger.log({
        type: "session_start",
        userId,
        orgId,
        data: {
          startedAt: new Date().toISOString(),
          pathname: pathname ?? "/",
        },
      });
    } catch {
      // Never crash the app
    }

    return () => {
      // Handled by beforeunload listener below
    };
  }, [userId, orgId, pathname]);

  // -------------------------------------------------------------------
  // 2. LOG PAGE VIEWS on route change
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!userId || !orgId || !pathname) return;

    try {
      const now = Date.now();

      // Log page leave for previous page (if any)
      if (prevPathnameRef.current && prevPathnameRef.current !== pathname) {
        const dwellMs = now - pageEnteredAtRef.current;
        eventLogger.log({
          type: "page_leave",
          userId,
          orgId,
          data: {
            path: prevPathnameRef.current,
            durationMs: dwellMs,
          },
        });
      }

      // Log page view for new page
      eventLogger.log({
        type: "page_view",
        userId,
        orgId,
        data: { path: pathname },
      });

      prevPathnameRef.current = pathname;
      pageEnteredAtRef.current = now;
    } catch {
      // Never crash
    }
  }, [pathname, userId, orgId]);

  // -------------------------------------------------------------------
  // 3. LOG FOCUS/BLUR — tab visibility changes
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!userId || !orgId) return;

    function handleVisibilityChange() {
      try {
        const isVisible = document.visibilityState === "visible";
        eventLogger.log({
          type: isVisible ? "focus_gained" : "focus_lost",
          userId: userId!,
          orgId: orgId!,
          data: {
            pathname: window.location.pathname,
          },
        });
      } catch {
        // Never crash
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId, orgId]);

  // -------------------------------------------------------------------
  // 4. SESSION END on unmount / beforeunload
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!userId || !orgId) return;

    function handleBeforeUnload() {
      try {
        // Log final page leave
        if (prevPathnameRef.current) {
          const dwellMs = Date.now() - pageEnteredAtRef.current;
          eventLogger.log({
            type: "page_leave",
            userId: userId!,
            orgId: orgId!,
            data: {
              path: prevPathnameRef.current,
              durationMs: dwellMs,
            },
          });
        }

        // Log session end
        const sessionDurationMs = Date.now() - sessionStartRef.current;
        eventLogger.log({
          type: "session_end",
          userId: userId!,
          orgId: orgId!,
          data: {
            durationMs: sessionDurationMs,
            pagesVisited: activityData.sessionStats.pagesVisited,
          },
        });

        // Flush everything synchronously
        eventLogger.flushSync();
      } catch {
        // Best effort on unload
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Also fire on React unmount
      handleBeforeUnload();
    };
  }, [userId, orgId, activityData.sessionStats.pagesVisited]);

  // -------------------------------------------------------------------
  // 5. PERIODIC DATA ROLLUP — every 30 minutes, compress to AI memory
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!userId || !orgId) return;

    const rollupInterval = setInterval(() => {
      try {
        const now = Date.now();
        const elapsed = now - lastRollupRef.current;

        // Only rollup if at least 25 minutes have passed (avoid double-fire)
        if (elapsed < 25 * 60 * 1000) return;
        lastRollupRef.current = now;

        const stats = activityData.sessionStats;
        const completedEntries = activityData.completedEntryWritings?.length ?? 0;

        // Collect unique pages visited
        const uniquePages = new Set(
          activityData.pageViews.map((pv) => pv.path)
        );

        // Build the session summary
        const sessionSummary = {
          pages_visited: uniquePages.size,
          page_list: Array.from(uniquePages).slice(0, 20),
          active_time_ms: stats.totalActiveTime,
          idle_time_ms: stats.totalIdleTime,
          entries_created: completedEntries,
          focus_ratio: Math.round(stats.tabFocusRatio * 100) / 100,
          total_clicks: Object.values(activityData.clicksByRoute).reduce(
            (a, b) => a + b,
            0
          ),
          typing_sessions: activityData.typingSessions.length,
          idle_periods: activityData.idlePeriods.length,
          session_duration_ms: now - sessionStartRef.current,
          rollup_at: new Date().toISOString(),
        };

        // Format active time for summary string
        const activeMinutes = Math.round(stats.totalActiveTime / 60_000);
        const idleMinutes = Math.round(stats.totalIdleTime / 60_000);
        const focusPct = Math.round(stats.tabFocusRatio * 100);

        const summaryText =
          `Sesion: ${activeMinutes}min activo, ${idleMinutes}min idle, ` +
          `${uniquePages.size} pags, ${completedEntries} entries, ` +
          `${focusPct}% focus`;

        saveAIMemory({
          orgId,
          userId,
          memoryType: "session_summary",
          content: sessionSummary,
          summary: summaryText,
        });
      } catch {
        // Never crash the app
      }
    }, ROLLUP_INTERVAL_MS);

    return () => clearInterval(rollupInterval);
  }, [userId, orgId, activityData]);

  // -------------------------------------------------------------------
  // Context functions (stable via useCallback)
  // -------------------------------------------------------------------

  const logEvent = useCallback(
    (type: EventType, data?: Record<string, unknown>) => {
      if (!userId || !orgId) return;
      try {
        eventLogger.log({
          type,
          userId,
          orgId,
          data,
        });
      } catch {
        // Never crash
      }
    },
    [userId, orgId]
  );

  const saveMemoryFn = useCallback(
    (type: string, content: Record<string, unknown>, summary: string) => {
      if (!userId || !orgId) return;
      try {
        saveAIMemory({
          orgId,
          userId,
          memoryType: type as AIMemoryEntry["memoryType"],
          content,
          summary,
        });
      } catch {
        // Never crash
      }
    },
    [userId, orgId]
  );

  const getRecentMemories = useCallback(
    (type?: string, limit?: number): AIMemoryEntry[] => {
      if (!userId || !orgId) return [];
      try {
        return getUserMemories(orgId, userId, {
          type: type as AIMemoryEntry["memoryType"] | undefined,
          limit: limit ?? 20,
        });
      } catch {
        return [];
      }
    },
    [userId, orgId]
  );

  // -------------------------------------------------------------------
  // Stable context value
  // -------------------------------------------------------------------

  const contextValue = useMemo<DataPipelineContextValue>(
    () => ({
      logEvent,
      saveMemory: saveMemoryFn,
      getRecentMemories,
    }),
    [logEvent, saveMemoryFn, getRecentMemories]
  );

  return (
    <DataPipelineContext.Provider value={contextValue}>
      {children}
    </DataPipelineContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDataPipeline(): DataPipelineContextValue {
  return useContext(DataPipelineContext);
}
