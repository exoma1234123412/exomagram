// ============================================================
// AI Memory — Persistent storage for all AI outputs
// ============================================================
// Every AI analysis, prediction, validation, observation is stored
// in localStorage and retrievable for context-building.
// No React dependencies. Pure TypeScript utilities.
// ============================================================

export type AIMemoryType =
  | "entry_analysis"
  | "validation"
  | "prediction"
  | "observation"
  | "briefing"
  | "narrative"
  | "followup"
  | "coaching"
  | "session_summary";

export interface AIMemoryEntry {
  id: string;
  orgId: string;
  userId: string | null; // null = team-level memory
  memoryType: AIMemoryType;
  content: Record<string, unknown>;
  summary: string; // One-line summary for quick retrieval
  createdAt: string;
}

// ── Storage config ──────────────────────────────────────────

const STORAGE_KEY = "ai_memory";
const MAX_MEMORIES = 500;

// ── Helpers ─────────────────────────────────────────────────

function isLocalStorageAvailable(): boolean {
  try {
    const test = "__ai_mem_test__";
    localStorage.setItem(test, "1");
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

function readStore(): AIMemoryEntry[] {
  if (!isLocalStorageAvailable()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(entries: AIMemoryEntry[]): void {
  if (!isLocalStorageAvailable()) return;
  try {
    // Keep only last MAX_MEMORIES entries
    const trimmed = entries.slice(-MAX_MEMORIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

/** Strip null/undefined fields to compress stored data */
function compress(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && v !== null) {
      const nested = compress(v as Record<string, unknown>);
      if (Object.keys(nested).length > 0) result[k] = nested;
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ── Public API ──────────────────────────────────────────────

/**
 * Save an AI memory entry to localStorage.
 * Generates id and createdAt automatically.
 */
export function saveAIMemory(entry: Omit<AIMemoryEntry, "id" | "createdAt">): AIMemoryEntry {
  const full: AIMemoryEntry = {
    ...entry,
    content: compress(entry.content),
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const store = readStore();
  store.push(full);
  writeStore(store);

  return full;
}

/**
 * Get recent AI memories for a specific user.
 */
export function getUserMemories(
  orgId: string,
  userId: string,
  options?: { type?: AIMemoryType; limit?: number; days?: number }
): AIMemoryEntry[] {
  const store = readStore();
  const limit = options?.limit ?? 50;
  const days = options?.days ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  return store
    .filter(
      (m) =>
        m.orgId === orgId &&
        m.userId === userId &&
        m.createdAt >= cutoffStr &&
        (!options?.type || m.memoryType === options.type)
    )
    .slice(-limit);
}

/**
 * Get team-level memories (userId === null).
 */
export function getTeamMemories(
  orgId: string,
  options?: { type?: AIMemoryType; limit?: number; days?: number }
): AIMemoryEntry[] {
  const store = readStore();
  const limit = options?.limit ?? 50;
  const days = options?.days ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  return store
    .filter(
      (m) =>
        m.orgId === orgId &&
        m.userId === null &&
        m.createdAt >= cutoffStr &&
        (!options?.type || m.memoryType === options.type)
    )
    .slice(-limit);
}

/**
 * Get ALL memories for an org (user + team) within a window.
 */
export function getOrgMemories(
  orgId: string,
  options?: { type?: AIMemoryType; limit?: number; days?: number }
): AIMemoryEntry[] {
  const store = readStore();
  const limit = options?.limit ?? 100;
  const days = options?.days ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  return store
    .filter(
      (m) =>
        m.orgId === orgId &&
        m.createdAt >= cutoffStr &&
        (!options?.type || m.memoryType === options.type)
    )
    .slice(-limit);
}

/**
 * Build a compressed memory context string for Claude prompts.
 *
 * Output format (ultra-compressed):
 * AI_MEMORY(last 7d):
 * - [2026-05-28] entry_analysis: EXOMAP "API auth" -> B(72) "Buena pero sin pruebas"
 * - [2026-05-28] prediction: Equipo 73% prob dia malo -> ACERTO
 * - [2026-05-27] observation: Eugenio backfill 4 entries en 3min
 */
export function buildMemoryContext(
  memories: AIMemoryEntry[],
  options?: { maxEntries?: number; maxChars?: number }
): string {
  const maxEntries = options?.maxEntries ?? 30;
  const maxChars = options?.maxChars ?? 2000;

  if (memories.length === 0) return "";

  // Sort by date descending for most-recent-first
  const sorted = [...memories].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt)
  );
  const selected = sorted.slice(0, maxEntries);

  const lines: string[] = ["AI_MEMORY:"];
  let totalChars = lines[0].length;

  for (const m of selected) {
    const date = m.createdAt.slice(0, 10);
    const line = `- [${date}] ${m.memoryType}: ${m.summary}`;

    if (totalChars + line.length + 1 > maxChars) break;

    lines.push(line);
    totalChars += line.length + 1;
  }

  return lines.join("\n");
}

/**
 * Build context for a specific user — combines user + team memories.
 */
export function buildUserContext(
  orgId: string,
  userId: string,
  options?: { days?: number; maxChars?: number }
): string {
  const days = options?.days ?? 7;
  const userMems = getUserMemories(orgId, userId, { days, limit: 20 });
  const teamMems = getTeamMemories(orgId, { days, limit: 10 });
  const combined = [...userMems, ...teamMems];

  return buildMemoryContext(combined, {
    maxEntries: 25,
    maxChars: options?.maxChars ?? 2000,
  });
}

/**
 * Delete all memories for an org (useful for testing/reset).
 */
export function clearMemories(orgId?: string): void {
  if (!orgId) {
    if (isLocalStorageAvailable()) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    return;
  }

  const store = readStore();
  const filtered = store.filter((m) => m.orgId !== orgId);
  writeStore(filtered);
}

/**
 * Get memory stats for debugging.
 */
export function getMemoryStats(orgId: string): {
  total: number;
  byType: Record<string, number>;
  oldestDate: string | null;
  newestDate: string | null;
  storageSizeKB: number;
} {
  const store = readStore();
  const orgMemories = store.filter((m) => m.orgId === orgId);

  const byType: Record<string, number> = {};
  for (const m of orgMemories) {
    byType[m.memoryType] = (byType[m.memoryType] ?? 0) + 1;
  }

  let storageSizeKB = 0;
  if (isLocalStorageAvailable()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      storageSizeKB = raw ? Math.round((raw.length * 2) / 1024) : 0;
    } catch {
      // ignore
    }
  }

  return {
    total: orgMemories.length,
    byType,
    oldestDate: orgMemories.length > 0 ? orgMemories[0].createdAt : null,
    newestDate:
      orgMemories.length > 0
        ? orgMemories[orgMemories.length - 1].createdAt
        : null,
    storageSizeKB,
  };
}

/**
 * Export all memories as a JSON blob (for Supabase sync or backup).
 */
export function exportMemories(orgId: string): string {
  const orgMemories = readStore().filter((m) => m.orgId === orgId);
  return JSON.stringify(orgMemories);
}

/**
 * Import memories from a JSON blob (from Supabase sync or restore).
 * Deduplicates by id.
 */
export function importMemories(jsonBlob: string): number {
  try {
    const incoming: AIMemoryEntry[] = JSON.parse(jsonBlob);
    if (!Array.isArray(incoming)) return 0;

    const store = readStore();
    const existingIds = new Set(store.map((m) => m.id));
    let added = 0;

    for (const m of incoming) {
      if (!m.id || existingIds.has(m.id)) continue;
      if (!m.orgId || !m.memoryType || !m.summary || !m.createdAt) continue;
      store.push(m);
      existingIds.add(m.id);
      added++;
    }

    writeStore(store);
    return added;
  } catch {
    return 0;
  }
}
