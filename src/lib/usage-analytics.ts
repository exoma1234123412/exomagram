// ============================================================
// Usage Analytics — Session tracking & feature usage
// Pure TypeScript, no React, no Supabase. localStorage only.
// ============================================================

// ── Types ────────────────────────────────────────────────────

export interface SessionRecord {
  id: string;
  userId: string;
  orgId: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  pagesVisited: string[];
  entriesCreated: number;
  idleTimeMs: number;
  activeTimeMs: number;
  device: string;
}

export interface FeatureUsage {
  path: string;
  label: string;
  visitCount: number;
  totalDwellMs: number;
  avgDwellMs: number;
  lastVisited: number;
}

export interface SessionStats {
  totalSessions: number;
  avgSessionDurationMs: number;
  avgActiveTimeMs: number;
  avgIdleTimeMs: number;
  totalPagesVisited: number;
  avgPagesPerSession: number;
  avgEntriesPerSession: number;
  peakLoginHour: number;
  avgLoginHour: number;
  weekdayDistribution: Record<string, number>;
  deviceDistribution: Record<string, number>;
}

export interface TeamFeatureUsageEntry {
  feature: string;
  userBreakdown: Record<string, number>;
  totalVisits: number;
}

// ── Constants ────────────────────────────────────────────────

const MAX_SESSIONS = 200;
const SESSIONS_KEY_PREFIX = "sessions_";
const FEATURE_KEY_PREFIX = "feature_usage_";
const ACTIVE_SESSION_KEY = "active_session_";

const WEEKDAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Internal tracking for dwell time on current page
let _currentPageStart: number | null = null;
let _currentPagePath: string | null = null;
let _currentSessionId: string | null = null;
let _currentUserId: string | null = null;

/**
 * Feature label mapping — every route in the app.
 * Covers all sidebar items + additional routes.
 */
export const FEATURE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/alerts": "Alertas",
  "/projects": "Proyectos",
  "/analytics": "Analítica",
  "/data-hub": "Hub de Datos",
  "/ai-center": "AI Center",
  "/reports": "Reportes",
  "/auto-standup": "Auto-Standup",
  "/focus": "Focus",
  "/reflection": "Reflexión",
  "/surveillance": "Vigilancia",
  "/intel": "Intel",
  "/wellbeing": "Bienestar",
  "/team-narrative": "Crónica",
  "/consistency": "Consistencia",
  "/contradictions": "Contradicciones",
  "/ask-claude": "Ask Claude",
  "/conflicts": "Conflictos",
  "/ai-predictions": "Predicciones",
  "/arena": "Arena",
  "/shame": "Presión",
  "/hour-price": "Precio/Hora",
  "/intervention": "Intervención",
  "/broken-promises": "Promesas Rotas",
  "/shame-contract": "Contrato Vergüenza",
  "/reliability": "Confiabilidad",
  "/reciprocity": "Reciprocidad",
  "/peer-verdict": "Peer Verdict",
  "/xp": "Progreso",
  "/profile": "Perfil",
  "/settings": "Ajustes",
  // Additional routes beyond sidebar
  "/accountability": "Accountability",
  "/achievements": "Logros",
  "/activity-log": "Log de Actividad",
  "/admin": "Admin",
  "/archaeology": "Arqueología",
  "/audit": "Auditoría",
  "/audit-daily": "Auditoría Diaria",
  "/auto-capture": "Auto-Captura",
  "/autopsy": "Autopsia",
  "/bets": "Apuestas",
  "/bios": "Bios",
  "/black-market": "Mercado Negro",
  "/black-mirror": "Black Mirror",
  "/blood-contract": "Contrato de Sangre",
  "/bounties": "Bounties",
  "/brain": "Claude Brain",
  "/brutal-truth": "Verdad Brutal",
  "/budgets": "Presupuestos",
  "/capacity": "Capacidad",
  "/capital": "Capital",
  "/capsule": "Cápsula del Tiempo",
  "/chain": "Cadena Equipo",
  "/changelog": "Changelog",
  "/chronicle": "Crónica",
  "/claude-audit": "Claude Audit",
  "/collab": "Colaboración",
  "/collateral": "Colateral",
  "/command": "Comando",
  "/compare": "Comparar",
  "/compatibility": "Compatibilidad",
  "/confession": "Confesión",
  "/contract": "Contrato",
  "/daily-replay": "Replay Diario",
  "/deadman": "Deadman Switch",
  "/debt": "Deuda",
  "/deep-profile": "Perfil Profundo",
  "/digest": "Digest",
  "/dna-evolution": "Evolución DNA",
  "/dossier": "Expediente",
  "/duel": "Duelo",
  "/efficiency": "Eficiencia",
  "/elimination": "Eliminación",
  "/entropy": "Entropía",
  "/envelope": "Sobre",
  "/excuse-archaeology": "Arqueología de Excusas",
  "/excuse-patterns": "Patrones de Excusas",
  "/excuses": "Excusas",
  "/feed": "Feed",
  "/feedback": "Feedback",
  "/future-letter": "Carta al Futuro",
  "/ghost-mode": "Modo Fantasma",
  "/ghost-radar": "Radar Fantasma",
  "/goals": "Objetivos",
  "/graveyard": "Cementerio",
  "/grid": "Grid",
  "/hall-of-shame": "Salón de la Vergüenza",
  "/health": "Salud",
  "/heatmap": "Heatmap",
  "/home": "Inicio",
  "/hotseat": "Hot Seat",
  "/inheritance": "Herencia",
  "/insights": "Insights",
  "/inspection": "Inspección",
  "/insurance": "Seguro",
  "/integrations": "Integraciones",
  "/inverted": "Invertido",
  "/irrevocable": "Irrevocable",
  "/journal": "Diario",
  "/kudos": "Kudos",
  "/leaderboard": "Leaderboard",
  "/live-flow": "Live Flow",
  "/lottery": "Lotería",
  "/matrix": "Matriz",
  "/member": "Miembro",
  "/mirror": "Espejo",
  "/mirror-mode": "Modo Espejo",
  "/narrative": "Narrativa",
  "/notifications": "Notificaciones",
  "/now": "Ahora",
  "/obituario": "Obituario",
  "/one-on-one": "1-on-1",
  "/org-settings": "Config Org",
  "/org-stats": "Stats Org",
  "/output": "Output",
  "/pacts": "Pactos",
  "/panic": "Pánico",
  "/performance": "Rendimiento",
  "/power-rankings": "Power Rankings",
  "/predictions": "Predicciones",
  "/price-game": "Juego de Precios",
  "/pricing": "Precios",
  "/productivity-autopsy": "Autopsia Productividad",
  "/promises": "Promesas",
  "/pulse": "Pulso",
  "/radar": "Radar",
  "/rate": "Calificar",
  "/raw-data": "Raw Data",
  "/recap": "Recap",
  "/replay": "Replay",
  "/resign-risk": "Riesgo Renuncia",
  "/response-time": "Tiempo de Respuesta",
  "/retention": "Retención",
  "/retro": "Retro",
  "/review": "Review",
  "/roulette": "Ruleta",
  "/seasons": "Temporadas",
  "/setup": "Setup",
  "/shame-score": "Shame Score",
  "/shoutouts": "Shoutouts",
  "/silent-hours": "Horas Silenciosas",
  "/speedometer": "Velocímetro",
  "/sprints": "Sprints",
  "/standup": "Standup",
  "/stories": "Historias",
  "/subastas": "Subastas",
  "/survivor": "Survivor",
  "/team": "Equipo",
  "/timeline-view": "Vista Timeline",
  "/tools": "Herramientas",
  "/transparency": "Transparencia",
  "/tribunal": "Tribunal",
  "/trust-debt": "Deuda de Confianza",
  "/trust-decay": "Decaimiento Confianza",
  "/trust-market": "Mercado Confianza",
  "/twin": "Twin",
  "/vigilance": "Vigilancia",
  "/warroom": "War Room",
  "/weekly": "Semanal",
  "/weekly-shame": "Vergüenza Semanal",
  "/welcome": "Bienvenida",
  "/api-docs": "API Docs",
};

// ── Helpers ──────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function detectDevice(): string {
  if (typeof window === "undefined") return "unknown";
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function getStorageKey(prefix: string, userId: string): string {
  return `${prefix}${userId}`;
}

function readSessions(userId: string): SessionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(SESSIONS_KEY_PREFIX, userId));
    if (!raw) return [];
    return JSON.parse(raw) as SessionRecord[];
  } catch {
    return [];
  }
}

function writeSessions(userId: string, sessions: SessionRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    // Enforce max sessions limit — keep the most recent
    const trimmed = sessions.length > MAX_SESSIONS
      ? sessions.slice(sessions.length - MAX_SESSIONS)
      : sessions;
    localStorage.setItem(getStorageKey(SESSIONS_KEY_PREFIX, userId), JSON.stringify(trimmed));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

interface FeatureUsageStore {
  [path: string]: {
    visitCount: number;
    totalDwellMs: number;
    lastVisited: number;
  };
}

function readFeatureUsage(userId: string): FeatureUsageStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(getStorageKey(FEATURE_KEY_PREFIX, userId));
    if (!raw) return {};
    return JSON.parse(raw) as FeatureUsageStore;
  } catch {
    return {};
  }
}

function writeFeatureUsage(userId: string, store: FeatureUsageStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(FEATURE_KEY_PREFIX, userId), JSON.stringify(store));
  } catch {
    // Storage full — silently fail
  }
}

function filterByDays<T extends { startedAt?: number }>(records: T[], days: number, tsKey: keyof T = "startedAt" as keyof T): T[] {
  const cutoff = Date.now() - days * 86_400_000;
  return records.filter((r) => {
    const ts = r[tsKey];
    return typeof ts === "number" && ts >= cutoff;
  });
}

// ── Session Management ───────────────────────────────────────

/**
 * Start tracking a new session.
 * Returns a unique session ID.
 */
export function startSession(userId: string, orgId: string): string {
  const sessionId = generateId();
  const session: SessionRecord = {
    id: sessionId,
    userId,
    orgId,
    startedAt: Date.now(),
    pagesVisited: [],
    entriesCreated: 0,
    idleTimeMs: 0,
    activeTimeMs: 0,
    device: detectDevice(),
  };

  // Store active session reference
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(
        getStorageKey(ACTIVE_SESSION_KEY, userId),
        JSON.stringify(session)
      );
    } catch {
      // Silently fail
    }
  }

  _currentSessionId = sessionId;
  _currentUserId = userId;

  return sessionId;
}

/**
 * End the current session, computing duration and persisting it.
 */
export function endSession(sessionId: string): void {
  if (typeof window === "undefined") return;

  // Flush any pending page dwell time
  _flushCurrentPage();

  // Find the active session
  const userId = _currentUserId;
  if (!userId) return;

  try {
    const raw = localStorage.getItem(getStorageKey(ACTIVE_SESSION_KEY, userId));
    if (!raw) return;

    const session: SessionRecord = JSON.parse(raw);
    if (session.id !== sessionId) return;

    const now = Date.now();
    session.endedAt = now;
    session.durationMs = now - session.startedAt;

    // If activeTimeMs was never set, estimate it as duration minus idle
    if (session.activeTimeMs === 0 && session.durationMs > 0) {
      session.activeTimeMs = Math.max(0, session.durationMs - session.idleTimeMs);
    }

    // Append to session history
    const sessions = readSessions(userId);
    sessions.push(session);
    writeSessions(userId, sessions);

    // Clean up active session
    localStorage.removeItem(getStorageKey(ACTIVE_SESSION_KEY, userId));
  } catch {
    // Silently fail
  }

  _currentSessionId = null;
  _currentUserId = null;
  _currentPageStart = null;
  _currentPagePath = null;
}

/**
 * Record a page visit in the current active session.
 * Also tracks dwell time on the previous page and updates feature usage.
 */
export function recordPageVisit(sessionId: string, path: string): void {
  if (typeof window === "undefined") return;

  // Flush dwell time for the previous page
  _flushCurrentPage();

  // Normalize path: strip trailing slash, keep leading slash
  const normalizedPath = _normalizePath(path);

  const userId = _currentUserId;
  if (!userId) return;

  try {
    const raw = localStorage.getItem(getStorageKey(ACTIVE_SESSION_KEY, userId));
    if (!raw) return;

    const session: SessionRecord = JSON.parse(raw);
    if (session.id !== sessionId) return;

    // Add page to visited list (allow duplicates to track re-visits)
    session.pagesVisited.push(normalizedPath);

    localStorage.setItem(
      getStorageKey(ACTIVE_SESSION_KEY, userId),
      JSON.stringify(session)
    );
  } catch {
    // Silently fail
  }

  // Start tracking dwell on this page
  _currentPageStart = Date.now();
  _currentPagePath = normalizedPath;
  _currentSessionId = sessionId;
}

/**
 * Increment the entries created counter for the active session.
 */
export function recordEntryCreated(sessionId: string): void {
  if (typeof window === "undefined") return;

  const userId = _currentUserId;
  if (!userId) return;

  try {
    const raw = localStorage.getItem(getStorageKey(ACTIVE_SESSION_KEY, userId));
    if (!raw) return;

    const session: SessionRecord = JSON.parse(raw);
    if (session.id !== sessionId) return;

    session.entriesCreated += 1;

    localStorage.setItem(
      getStorageKey(ACTIVE_SESSION_KEY, userId),
      JSON.stringify(session)
    );
  } catch {
    // Silently fail
  }
}

/**
 * Record idle time in the active session.
 * Call this when detecting user went idle (e.g., no mouse/keyboard for N seconds).
 */
export function recordIdleTime(sessionId: string, idleMs: number): void {
  if (typeof window === "undefined") return;

  const userId = _currentUserId;
  if (!userId) return;

  try {
    const raw = localStorage.getItem(getStorageKey(ACTIVE_SESSION_KEY, userId));
    if (!raw) return;

    const session: SessionRecord = JSON.parse(raw);
    if (session.id !== sessionId) return;

    session.idleTimeMs += idleMs;

    localStorage.setItem(
      getStorageKey(ACTIVE_SESSION_KEY, userId),
      JSON.stringify(session)
    );
  } catch {
    // Silently fail
  }
}

/**
 * Record active time in the active session.
 */
export function recordActiveTime(sessionId: string, activeMs: number): void {
  if (typeof window === "undefined") return;

  const userId = _currentUserId;
  if (!userId) return;

  try {
    const raw = localStorage.getItem(getStorageKey(ACTIVE_SESSION_KEY, userId));
    if (!raw) return;

    const session: SessionRecord = JSON.parse(raw);
    if (session.id !== sessionId) return;

    session.activeTimeMs += activeMs;

    localStorage.setItem(
      getStorageKey(ACTIVE_SESSION_KEY, userId),
      JSON.stringify(session)
    );
  } catch {
    // Silently fail
  }
}

/**
 * Get the currently active session ID for a user, if any.
 */
export function getActiveSessionId(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getStorageKey(ACTIVE_SESSION_KEY, userId));
    if (!raw) return null;
    const session: SessionRecord = JSON.parse(raw);
    return session.id;
  } catch {
    return null;
  }
}

// ── Session Queries ──────────────────────────────────────────

/**
 * Get session history for a user.
 * @param days — how many days back to look (default: 30)
 */
export function getSessionHistory(userId: string, days: number = 30): SessionRecord[] {
  const sessions = readSessions(userId);
  return filterByDays(sessions, days);
}

/**
 * Get aggregated session stats for a user.
 * @param days — how many days back to look (default: 30)
 */
export function getSessionStats(userId: string, days: number = 30): SessionStats {
  const sessions = getSessionHistory(userId, days);

  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      avgSessionDurationMs: 0,
      avgActiveTimeMs: 0,
      avgIdleTimeMs: 0,
      totalPagesVisited: 0,
      avgPagesPerSession: 0,
      avgEntriesPerSession: 0,
      peakLoginHour: 0,
      avgLoginHour: 0,
      weekdayDistribution: {},
      deviceDistribution: {},
    };
  }

  const totalSessions = sessions.length;

  // Duration stats (only count completed sessions)
  const completedSessions = sessions.filter((s) => s.durationMs != null && s.durationMs > 0);
  const avgSessionDurationMs = completedSessions.length > 0
    ? completedSessions.reduce((sum, s) => sum + (s.durationMs ?? 0), 0) / completedSessions.length
    : 0;

  const avgActiveTimeMs = completedSessions.length > 0
    ? completedSessions.reduce((sum, s) => sum + s.activeTimeMs, 0) / completedSessions.length
    : 0;

  const avgIdleTimeMs = completedSessions.length > 0
    ? completedSessions.reduce((sum, s) => sum + s.idleTimeMs, 0) / completedSessions.length
    : 0;

  // Pages
  const totalPagesVisited = sessions.reduce((sum, s) => sum + s.pagesVisited.length, 0);
  const avgPagesPerSession = totalPagesVisited / totalSessions;

  // Entries
  const avgEntriesPerSession = sessions.reduce((sum, s) => sum + s.entriesCreated, 0) / totalSessions;

  // Login hour analysis
  const hourCounts: Record<number, number> = {};
  let hourSum = 0;
  for (const s of sessions) {
    const hour = new Date(s.startedAt).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    hourSum += hour;
  }

  let peakLoginHour = 0;
  let peakCount = 0;
  for (const [hour, count] of Object.entries(hourCounts)) {
    if (count > peakCount) {
      peakCount = count;
      peakLoginHour = Number(hour);
    }
  }

  const avgLoginHour = Math.round(hourSum / totalSessions);

  // Weekday distribution
  const weekdayDistribution: Record<string, number> = {};
  for (const s of sessions) {
    const day = WEEKDAY_NAMES[new Date(s.startedAt).getDay()];
    weekdayDistribution[day] = (weekdayDistribution[day] || 0) + 1;
  }

  // Device distribution
  const deviceDistribution: Record<string, number> = {};
  for (const s of sessions) {
    const device = s.device || "unknown";
    deviceDistribution[device] = (deviceDistribution[device] || 0) + 1;
  }

  return {
    totalSessions,
    avgSessionDurationMs,
    avgActiveTimeMs,
    avgIdleTimeMs,
    totalPagesVisited,
    avgPagesPerSession,
    avgEntriesPerSession,
    peakLoginHour,
    avgLoginHour,
    weekdayDistribution,
    deviceDistribution,
  };
}

// ── Feature Usage ────────────────────────────────────────────

/**
 * Get the human-readable label for a route path.
 * Falls back to the path itself if no mapping exists.
 */
export function getFeatureLabel(path: string): string {
  const normalized = _normalizePath(path);
  return FEATURE_LABELS[normalized] || _pathToLabel(normalized);
}

/**
 * Get feature usage data for a user.
 * @param days — if provided, only count visits within this window.
 *   Note: feature usage store is aggregated (no per-visit timestamps),
 *   so `days` filters by lastVisited timestamp only.
 */
export function getFeatureUsage(userId: string, days?: number): FeatureUsage[] {
  const store = readFeatureUsage(userId);
  const cutoff = days ? Date.now() - days * 86_400_000 : 0;

  const results: FeatureUsage[] = [];

  for (const [path, data] of Object.entries(store)) {
    if (cutoff > 0 && data.lastVisited < cutoff) continue;

    results.push({
      path,
      label: getFeatureLabel(path),
      visitCount: data.visitCount,
      totalDwellMs: data.totalDwellMs,
      avgDwellMs: data.visitCount > 0 ? Math.round(data.totalDwellMs / data.visitCount) : 0,
      lastVisited: data.lastVisited,
    });
  }

  // Sort by visit count descending
  results.sort((a, b) => b.visitCount - a.visitCount);

  return results;
}

/**
 * Get features the user has NEVER visited.
 * Compares against all known FEATURE_LABELS keys.
 * @param days — if provided, consider features unused if not visited in this window
 */
export function getUnusedFeatures(userId: string, days?: number): string[] {
  const store = readFeatureUsage(userId);
  const cutoff = days ? Date.now() - days * 86_400_000 : 0;
  const allFeatures = Object.keys(FEATURE_LABELS);

  return allFeatures.filter((path) => {
    const usage = store[path];
    if (!usage) return true;
    if (cutoff > 0 && usage.lastVisited < cutoff) return true;
    return false;
  });
}

/**
 * Get feature usage comparison across the entire team.
 * Reads feature_usage for every user in localStorage whose key matches the prefix.
 * NOTE: This only works when called from a context where all team members' data
 * is in the same localStorage (i.e., admin views or aggregated data).
 * For real cross-user comparison, pass an array of userIds.
 */
export function getTeamFeatureUsage(orgId: string, days?: number, userIds?: string[]): TeamFeatureUsageEntry[] {
  if (typeof window === "undefined") return [];

  const ids = userIds || _discoverUserIds();
  const cutoff = days ? Date.now() - days * 86_400_000 : 0;

  // Aggregate: feature -> { userId -> visitCount }
  const featureMap: Record<string, Record<string, number>> = {};

  for (const uid of ids) {
    const store = readFeatureUsage(uid);
    for (const [path, data] of Object.entries(store)) {
      if (cutoff > 0 && data.lastVisited < cutoff) continue;

      if (!featureMap[path]) featureMap[path] = {};
      featureMap[path][uid] = data.visitCount;
    }
  }

  const results: TeamFeatureUsageEntry[] = [];
  for (const [feature, userBreakdown] of Object.entries(featureMap)) {
    const totalVisits = Object.values(userBreakdown).reduce((a, b) => a + b, 0);
    results.push({ feature, userBreakdown, totalVisits });
  }

  // Sort by total visits descending
  results.sort((a, b) => b.totalVisits - a.totalVisits);

  return results;
}

// ── Internal Helpers ─────────────────────────────────────────

/**
 * Flush dwell time for the current page into the feature usage store.
 */
function _flushCurrentPage(): void {
  if (!_currentPagePath || !_currentPageStart || !_currentUserId) return;

  const dwellMs = Date.now() - _currentPageStart;
  if (dwellMs <= 0) return;

  const store = readFeatureUsage(_currentUserId);
  const existing = store[_currentPagePath];

  if (existing) {
    existing.visitCount += 1;
    existing.totalDwellMs += dwellMs;
    existing.lastVisited = Date.now();
  } else {
    store[_currentPagePath] = {
      visitCount: 1,
      totalDwellMs: dwellMs,
      lastVisited: Date.now(),
    };
  }

  writeFeatureUsage(_currentUserId, store);

  _currentPageStart = null;
  _currentPagePath = null;
}

/**
 * Normalize a URL path:
 * - Strip query params and hash
 * - Strip trailing slash (except root)
 * - Take only the first path segment for nested routes
 *   e.g., /dashboard/settings -> /dashboard
 */
function _normalizePath(path: string): string {
  // Strip query and hash
  let clean = path.split("?")[0].split("#")[0];

  // Remove trailing slash
  if (clean.length > 1 && clean.endsWith("/")) {
    clean = clean.slice(0, -1);
  }

  // For analytics purposes, group by top-level route
  // /projects/abc/tasks -> /projects
  const segments = clean.split("/").filter(Boolean);
  if (segments.length > 0) {
    return `/${segments[0]}`;
  }

  return "/dashboard";
}

/**
 * Convert a path to a human-readable label when no mapping exists.
 * /my-feature -> "My Feature"
 */
function _pathToLabel(path: string): string {
  const segment = path.replace(/^\//, "");
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Discover user IDs from localStorage keys.
 * Scans for keys matching the feature_usage_ prefix.
 */
function _discoverUserIds(): string[] {
  if (typeof window === "undefined") return [];

  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(FEATURE_KEY_PREFIX)) {
        ids.push(key.slice(FEATURE_KEY_PREFIX.length));
      }
    }
  } catch {
    // Silently fail
  }
  return ids;
}

// ── Convenience: Bulk import/export ──────────────────────────

/**
 * Export all analytics data for a user (for backup or server sync).
 */
export function exportAnalytics(userId: string): {
  sessions: SessionRecord[];
  featureUsage: FeatureUsageStore;
} {
  return {
    sessions: readSessions(userId),
    featureUsage: readFeatureUsage(userId),
  };
}

/**
 * Import analytics data for a user (restore from backup or server).
 * Merges with existing data: sessions are appended (deduped by id),
 * feature usage counts are summed.
 */
export function importAnalytics(
  userId: string,
  data: { sessions?: SessionRecord[]; featureUsage?: FeatureUsageStore }
): void {
  if (data.sessions) {
    const existing = readSessions(userId);
    const existingIds = new Set(existing.map((s) => s.id));
    const newSessions = data.sessions.filter((s) => !existingIds.has(s.id));
    writeSessions(userId, [...existing, ...newSessions]);
  }

  if (data.featureUsage) {
    const existing = readFeatureUsage(userId);
    for (const [path, imported] of Object.entries(data.featureUsage)) {
      const current = existing[path];
      if (current) {
        current.visitCount += imported.visitCount;
        current.totalDwellMs += imported.totalDwellMs;
        current.lastVisited = Math.max(current.lastVisited, imported.lastVisited);
      } else {
        existing[path] = { ...imported };
      }
    }
    writeFeatureUsage(userId, existing);
  }
}

/**
 * Clear all analytics data for a user.
 */
export function clearAnalytics(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getStorageKey(SESSIONS_KEY_PREFIX, userId));
    localStorage.removeItem(getStorageKey(FEATURE_KEY_PREFIX, userId));
    localStorage.removeItem(getStorageKey(ACTIVE_SESSION_KEY, userId));
  } catch {
    // Silently fail
  }
}
