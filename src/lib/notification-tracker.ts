// ═══════════════════════════════════════════════════════════════════════
// NOTIFICATION TRACKER
// ═══════════════════════════════════════════════════════════════════════
//
// Tracks when notifications/alerts are shown, seen, acted upon, or
// dismissed. Every notification, flag, and alert flows through here.
//
// Storage: localStorage key "notification_tracking", max 500 events.
// ═══════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "notification_tracking";
const MAX_EVENTS = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationEvent {
  id: string;
  type: string; // 'flag' | 'shame' | 'escalation' | 'herd_pressure' | 'morning_recap' | 'entry_verdict'
  userId: string;
  shownAt: number;
  seenAt?: number;
  actedAt?: number;
  dismissedAt?: number;
  action?: string; // 'logged_entry' | 'fixed_description' | 'dismissed' | 'ignored'
  responseTimeMs?: number; // seenAt - shownAt
  actionTimeMs?: number; // actedAt - shownAt
}

export interface NotificationStats {
  totalShown: number;
  totalSeen: number;
  totalActed: number;
  totalIgnored: number;
  avgResponseTimeMs: number;
  avgActionTimeMs: number;
  responseRate: number; // 0-1
  byType: Record<string, { shown: number; acted: number; avgResponseMs: number }>;
}

// ---------------------------------------------------------------------------
// Internal storage helpers
// ---------------------------------------------------------------------------

function loadEvents(): NotificationEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NotificationEvent[];
  } catch {
    return [];
  }
}

function saveEvents(events: NotificationEvent[]): void {
  try {
    // Keep only the most recent MAX_EVENTS
    const trimmed = events.slice(-MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage unavailable
  }
}

function findEvent(id: string): NotificationEvent | undefined {
  const events = loadEvents();
  return events.find((e) => e.id === id);
}

function updateEvent(id: string, updates: Partial<NotificationEvent>): void {
  const events = loadEvents();
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return;
  events[idx] = { ...events[idx], ...updates };
  saveEvents(events);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record that a notification was shown to the user.
 */
export function trackNotificationShown(
  id: string,
  type: string,
  userId: string
): void {
  const events = loadEvents();
  // Don't duplicate if already tracked
  if (events.some((e) => e.id === id)) return;
  events.push({
    id,
    type,
    userId,
    shownAt: Date.now(),
  });
  saveEvents(events);
}

/**
 * Record that the user saw/interacted with the notification.
 */
export function trackNotificationSeen(id: string): void {
  const event = findEvent(id);
  if (!event || event.seenAt) return;
  const now = Date.now();
  updateEvent(id, {
    seenAt: now,
    responseTimeMs: now - event.shownAt,
  });
}

/**
 * Record that the user took action on the notification.
 */
export function trackNotificationActed(id: string, action: string): void {
  const event = findEvent(id);
  if (!event || event.actedAt) return;
  const now = Date.now();
  updateEvent(id, {
    actedAt: now,
    action,
    actionTimeMs: now - event.shownAt,
    // Also mark as seen if not already
    ...(!event.seenAt
      ? { seenAt: now, responseTimeMs: now - event.shownAt }
      : {}),
  });
}

/**
 * Record that the user dismissed the notification.
 */
export function trackNotificationDismissed(id: string): void {
  const event = findEvent(id);
  if (!event || event.dismissedAt) return;
  const now = Date.now();
  updateEvent(id, {
    dismissedAt: now,
    action: "dismissed",
    // Also mark as seen if not already
    ...(!event.seenAt
      ? { seenAt: now, responseTimeMs: now - event.shownAt }
      : {}),
  });
}

/**
 * Get response stats for a user.
 */
export function getNotificationStats(userId: string): NotificationStats {
  const events = loadEvents().filter((e) => e.userId === userId);

  const totalShown = events.length;
  const totalSeen = events.filter((e) => e.seenAt).length;
  const totalActed = events.filter(
    (e) => e.actedAt && e.action !== "dismissed"
  ).length;
  const totalIgnored = events.filter(
    (e) => !e.seenAt && !e.actedAt && !e.dismissedAt
  ).length;

  // Avg response time (seenAt - shownAt) for events that were seen
  const seenEvents = events.filter((e) => e.responseTimeMs != null);
  const avgResponseTimeMs =
    seenEvents.length > 0
      ? seenEvents.reduce((sum, e) => sum + (e.responseTimeMs ?? 0), 0) /
        seenEvents.length
      : 0;

  // Avg action time (actedAt - shownAt) for events that were acted on
  const actedEvents = events.filter((e) => e.actionTimeMs != null);
  const avgActionTimeMs =
    actedEvents.length > 0
      ? actedEvents.reduce((sum, e) => sum + (e.actionTimeMs ?? 0), 0) /
        actedEvents.length
      : 0;

  const responseRate = totalShown > 0 ? totalSeen / totalShown : 0;

  // Per-type breakdown
  const byType: NotificationStats["byType"] = {};
  for (const event of events) {
    if (!byType[event.type]) {
      byType[event.type] = { shown: 0, acted: 0, avgResponseMs: 0 };
    }
    byType[event.type].shown += 1;
    if (event.actedAt && event.action !== "dismissed") {
      byType[event.type].acted += 1;
    }
  }

  // Calculate per-type avg response
  for (const type of Object.keys(byType)) {
    const typeEvents = events.filter(
      (e) => e.type === type && e.responseTimeMs != null
    );
    byType[type].avgResponseMs =
      typeEvents.length > 0
        ? typeEvents.reduce((sum, e) => sum + (e.responseTimeMs ?? 0), 0) /
          typeEvents.length
        : 0;
  }

  return {
    totalShown,
    totalSeen,
    totalActed,
    totalIgnored,
    avgResponseTimeMs,
    avgActionTimeMs,
    responseRate,
    byType,
  };
}

/**
 * Get all notification events for a user (most recent first).
 */
export function getNotificationHistory(
  userId: string,
  limit = 50
): NotificationEvent[] {
  const events = loadEvents().filter((e) => e.userId === userId);
  // Most recent first
  events.sort((a, b) => b.shownAt - a.shownAt);
  return events.slice(0, limit);
}
