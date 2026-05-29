/**
 * Centralized Event Logger — captures EVERY user action to Supabase.
 *
 * Batches writes for efficiency (flushes every 5s or when buffer hits 10).
 * Falls back to localStorage when Supabase is unavailable.
 * Uses sendBeacon for reliable delivery on page close.
 *
 * Usage:
 *   import { eventLogger, logPageView, logEntryCreated } from "@/lib/event-logger";
 *   eventLogger.init(supabase);
 *   logPageView(userId, orgId, "/dashboard");
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type EventType =
  // Entry lifecycle
  | "entry_created"
  | "entry_edited"
  | "entry_validated"
  | "entry_rejected"
  | "entry_deleted"
  // Daily rituals
  | "closeout_submitted"
  | "standup_submitted"
  | "health_check_submitted"
  | "weekly_reflection_submitted"
  // Flags
  | "flag_raised"
  | "flag_resolved"
  // Reactions
  | "reaction_given"
  | "reaction_removed"
  // Session
  | "login"
  | "logout"
  | "session_start"
  | "session_end"
  // Navigation
  | "page_view"
  | "page_leave"
  // Presence
  | "idle_start"
  | "idle_end"
  | "focus_lost"
  | "focus_gained"
  // AI interactions
  | "ai_validation"
  | "ai_analysis"
  | "ai_prediction"
  | "ai_followup"
  | "ai_notification"
  // User actions
  | "search_query"
  | "export_data"
  | "shoutout_given"
  | "promise_created"
  | "promise_resolved"
  // Social / competitive
  | "panic_pressed"
  | "duel_created"
  | "bet_placed"
  | "prediction_made"
  | "shame_shown"
  | "prison_triggered"
  | "escalation_fired"
  // Misc
  | "pomodoro_started"
  | "pomodoro_completed"
  | "goal_created"
  | "goal_completed"
  | "settings_changed";

// ---------------------------------------------------------------------------
// Payload interface
// ---------------------------------------------------------------------------

export interface EventPayload {
  type: EventType;
  userId?: string;
  orgId?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface BufferedEvent extends EventPayload {
  metadata: Record<string, unknown> & { timestamp: number };
}

// ---------------------------------------------------------------------------
// Singleton EventLogger
// ---------------------------------------------------------------------------

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BATCH_SIZE = 10;
const LOCAL_STORAGE_KEY = "exoma_event_buffer";
const MAX_LOCAL_EVENTS = 500;

class EventLogger {
  private buffer: BufferedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private supabase: SupabaseClient | null = null;
  private flushing = false;

  /**
   * Initialize with a Supabase client. Must be called once on app mount.
   * Safe to call multiple times (idempotent).
   */
  init(supabase: SupabaseClient): void {
    this.supabase = supabase;

    // Attempt to drain any events stored in localStorage from a previous session
    this.drainLocalStorage();

    // Flush on page unload
    if (typeof window !== "undefined") {
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.flushSync();
        }
      });
      window.addEventListener("pagehide", () => this.flushSync());
    }
  }

  /**
   * Log an event. Buffered and flushed asynchronously.
   */
  log(event: EventPayload): void {
    const buffered: BufferedEvent = {
      ...event,
      metadata: {
        ...(event.metadata ?? {}),
        timestamp: Date.now(),
        url: typeof window !== "undefined" ? window.location.pathname : undefined,
        userAgent:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 120)
            : undefined,
      },
    };
    this.buffer.push(buffered);

    if (this.buffer.length >= FLUSH_BATCH_SIZE) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  /**
   * Force flush the buffer. Returns when complete.
   */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    this.clearTimer();

    const batch = this.buffer.splice(0);

    try {
      if (!this.supabase) throw new Error("No supabase client");

      const rows = batch.map((e) => ({
        org_id: e.orgId ?? null,
        user_id: e.userId ?? null,
        event_type: e.type,
        data: e.data ?? {},
        metadata: e.metadata ?? {},
      }));

      const { error } = await this.supabase.from("event_log").insert(rows);
      if (error) throw error;
    } catch {
      // Supabase unavailable — persist to localStorage as fallback
      this.storeLocally(batch);
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Synchronous flush for page unload. Uses sendBeacon for reliable delivery.
   */
  flushSync(): void {
    if (this.buffer.length === 0) return;
    this.clearTimer();

    const batch = this.buffer.splice(0);
    const payload = JSON.stringify(
      batch.map((e) => ({
        org_id: e.orgId ?? null,
        user_id: e.userId ?? null,
        event_type: e.type,
        data: e.data ?? {},
        metadata: e.metadata ?? {},
      }))
    );

    // sendBeacon is the only reliable way to send data on page close
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const sent = navigator.sendBeacon(
        "/api/log-events",
        new Blob([payload], { type: "application/json" })
      );
      if (!sent) {
        this.storeLocally(batch);
      }
    } else {
      this.storeLocally(batch);
    }
  }

  /**
   * Get current buffer size (for debugging/monitoring).
   */
  get pending(): number {
    return this.buffer.length;
  }

  // -- Private helpers --

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  private clearTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private storeLocally(events: BufferedEvent[]): void {
    if (typeof localStorage === "undefined") return;
    try {
      const stored: BufferedEvent[] = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_KEY) || "[]"
      );
      stored.push(...events);
      // Keep only the most recent events to avoid blowing up storage
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify(stored.slice(-MAX_LOCAL_EVENTS))
      );
    } catch {
      // localStorage full or unavailable — silently drop
    }
  }

  private async drainLocalStorage(): Promise<void> {
    if (typeof localStorage === "undefined" || !this.supabase) return;
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return;

      const stored: BufferedEvent[] = JSON.parse(raw);
      if (stored.length === 0) return;

      localStorage.removeItem(LOCAL_STORAGE_KEY);

      const rows = stored.map((e) => ({
        org_id: e.orgId ?? null,
        user_id: e.userId ?? null,
        event_type: e.type,
        data: e.data ?? {},
        metadata: e.metadata ?? {},
      }));

      const { error } = await this.supabase.from("event_log").insert(rows);
      if (error) {
        // Put them back
        this.storeLocally(stored);
      }
    } catch {
      // Don't crash on corrupted localStorage
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const eventLogger = new EventLogger();

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

/** Log a time entry creation */
export function logEntryCreated(
  userId: string,
  orgId: string,
  entryData: {
    entryId?: string;
    category?: string;
    hour?: number;
    date?: string;
    hasProof?: boolean;
    isLate?: boolean;
  }
): void {
  eventLogger.log({
    type: "entry_created",
    userId,
    orgId,
    data: entryData,
  });
}

/** Log a time entry edit */
export function logEntryEdited(
  userId: string,
  orgId: string,
  entryData: {
    entryId: string;
    changedFields?: string[];
  }
): void {
  eventLogger.log({
    type: "entry_edited",
    userId,
    orgId,
    data: entryData,
  });
}

/** Log an entry validation (verified/flagged) */
export function logEntryValidated(
  userId: string,
  orgId: string,
  data: { entryId: string; status: string; validatedBy?: string }
): void {
  eventLogger.log({
    type: "entry_validated",
    userId,
    orgId,
    data,
  });
}

/** Log a page view */
export function logPageView(
  userId: string,
  orgId: string,
  path: string
): void {
  eventLogger.log({
    type: "page_view",
    userId,
    orgId,
    data: { path },
  });
}

/** Log a page leave (with time spent) */
export function logPageLeave(
  userId: string,
  orgId: string,
  path: string,
  durationMs: number
): void {
  eventLogger.log({
    type: "page_leave",
    userId,
    orgId,
    data: { path, durationMs },
  });
}

/** Log an AI interaction (validation, analysis, prediction, followup) */
export function logAIInteraction(
  userId: string,
  orgId: string,
  aiType: "ai_validation" | "ai_analysis" | "ai_prediction" | "ai_followup" | "ai_notification",
  result: Record<string, unknown>
): void {
  eventLogger.log({
    type: aiType,
    userId,
    orgId,
    data: result,
  });
}

/** Log a closeout submission */
export function logCloseoutSubmitted(
  userId: string,
  orgId: string,
  data: { hoursLogged?: number; hoursWithProof?: number }
): void {
  eventLogger.log({
    type: "closeout_submitted",
    userId,
    orgId,
    data,
  });
}

/** Log a standup submission */
export function logStandupSubmitted(
  userId: string,
  orgId: string
): void {
  eventLogger.log({
    type: "standup_submitted",
    userId,
    orgId,
  });
}

/** Log a reaction given */
export function logReactionGiven(
  userId: string,
  orgId: string,
  data: { entryId: string; reaction: string; targetUserId?: string }
): void {
  eventLogger.log({
    type: "reaction_given",
    userId,
    orgId,
    data,
  });
}

/** Log a flag raised */
export function logFlagRaised(
  userId: string,
  orgId: string,
  data: { flagType: string; targetUserId?: string; date?: string }
): void {
  eventLogger.log({
    type: "flag_raised",
    userId,
    orgId,
    data,
  });
}

/** Log user login */
export function logLogin(userId: string, orgId?: string): void {
  eventLogger.log({
    type: "login",
    userId,
    orgId,
  });
}

/** Log user logout */
export function logLogout(userId: string, orgId?: string): void {
  eventLogger.log({
    type: "logout",
    userId,
    orgId,
  });
}

/** Log idle start */
export function logIdleStart(userId: string, orgId: string): void {
  eventLogger.log({
    type: "idle_start",
    userId,
    orgId,
  });
}

/** Log idle end */
export function logIdleEnd(
  userId: string,
  orgId: string,
  durationMs: number
): void {
  eventLogger.log({
    type: "idle_end",
    userId,
    orgId,
    data: { durationMs },
  });
}

/** Log focus lost (tab/window blur) */
export function logFocusLost(userId: string, orgId: string): void {
  eventLogger.log({
    type: "focus_lost",
    userId,
    orgId,
  });
}

/** Log focus gained (tab/window focus) */
export function logFocusGained(userId: string, orgId: string): void {
  eventLogger.log({
    type: "focus_gained",
    userId,
    orgId,
  });
}

/** Log a search query */
export function logSearchQuery(
  userId: string,
  orgId: string,
  query: string,
  resultCount?: number
): void {
  eventLogger.log({
    type: "search_query",
    userId,
    orgId,
    data: { query: query.slice(0, 200), resultCount },
  });
}

/** Log a data export */
export function logExportData(
  userId: string,
  orgId: string,
  format: string,
  recordCount?: number
): void {
  eventLogger.log({
    type: "export_data",
    userId,
    orgId,
    data: { format, recordCount },
  });
}

/** Log a panic button press */
export function logPanicPressed(
  userId: string,
  orgId: string,
  reason?: string
): void {
  eventLogger.log({
    type: "panic_pressed",
    userId,
    orgId,
    data: { reason },
  });
}

/** Log a duel creation */
export function logDuelCreated(
  userId: string,
  orgId: string,
  data: { opponentId: string; date: string }
): void {
  eventLogger.log({
    type: "duel_created",
    userId,
    orgId,
    data,
  });
}

/** Log a shoutout given */
export function logShoutoutGiven(
  userId: string,
  orgId: string,
  data: { toUserId: string; category: string }
): void {
  eventLogger.log({
    type: "shoutout_given",
    userId,
    orgId,
    data,
  });
}

/** Log settings changes */
export function logSettingsChanged(
  userId: string,
  orgId: string,
  changedFields: string[]
): void {
  eventLogger.log({
    type: "settings_changed",
    userId,
    orgId,
    data: { changedFields },
  });
}
