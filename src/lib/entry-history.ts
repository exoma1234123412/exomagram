/**
 * Entry History — Client-side revision snapshots
 *
 * Every edit to a time_entry captures the BEFORE state in localStorage
 * so no data is ever silently overwritten. This complements the server-side
 * entry_revisions table with an offline-capable, instant local audit trail.
 *
 * Storage key: `entry_history_${orgId}`
 * Max snapshots: 1000 per org (oldest trimmed via FIFO)
 */

// ============================================================
// Types
// ============================================================

export interface EntrySnapshotData {
  category: string;
  title: string;
  description: string | null;
  proof_urls: string[] | null;
  mood: number | null;
  energy: number | null;
  project: string | null;
  logged_at: string;
}

export interface EntrySnapshot {
  entryId: string;
  userId: string;
  orgId: string;
  date: string;
  hour: number;
  version: number;
  snapshot: EntrySnapshotData;
  editedAt: string;
  editType: "created" | "edited";
}

export interface EntryDiffItem {
  field: string;
  before: string;
  after: string;
}

// ============================================================
// Constants
// ============================================================

const MAX_SNAPSHOTS = 1000;
const STORAGE_PREFIX = "entry_history_";

// Field labels in Spanish for UI display
export const FIELD_LABELS: Record<string, string> = {
  category: "Categoría",
  title: "Título",
  description: "Descripción",
  proof_urls: "Evidencia",
  mood: "Ánimo",
  energy: "Energía",
  project: "Proyecto",
  logged_at: "Hora de registro",
};

// ============================================================
// Storage helpers
// ============================================================

function getStorageKey(orgId: string): string {
  return `${STORAGE_PREFIX}${orgId}`;
}

function readSnapshots(orgId: string): EntrySnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(orgId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as EntrySnapshot[];
  } catch {
    return [];
  }
}

function writeSnapshots(orgId: string, snapshots: EntrySnapshot[]): void {
  if (typeof window === "undefined") return;
  try {
    // Trim to max, keeping newest (end of array)
    const trimmed =
      snapshots.length > MAX_SNAPSHOTS
        ? snapshots.slice(snapshots.length - MAX_SNAPSHOTS)
        : snapshots;
    localStorage.setItem(getStorageKey(orgId), JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Save a snapshot before an edit. Automatically assigns version number
 * and editedAt timestamp.
 */
export function saveEntrySnapshot(
  input: Omit<EntrySnapshot, "version" | "editedAt">
): void {
  const snapshots = readSnapshots(input.orgId);

  // Determine version: count existing snapshots for same slot
  const existingForSlot = snapshots.filter(
    (s) =>
      s.userId === input.userId &&
      s.orgId === input.orgId &&
      s.date === input.date &&
      s.hour === input.hour
  );

  const version = existingForSlot.length + 1;

  const full: EntrySnapshot = {
    ...input,
    version,
    editedAt: new Date().toISOString(),
  };

  snapshots.push(full);
  writeSnapshots(input.orgId, snapshots);
}

/**
 * Get all snapshots for a specific entry by ID.
 * Note: entryId may change across upserts if the row is deleted and recreated,
 * so prefer getEntryHistoryBySlot for reliable history.
 */
export function getEntryHistory(entryId: string): EntrySnapshot[] {
  if (typeof window === "undefined") return [];

  // We need to scan all orgs since we don't know which org
  const results: EntrySnapshot[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as EntrySnapshot[];
      results.push(...parsed.filter((s) => s.entryId === entryId));
    } catch {
      continue;
    }
  }

  return results.sort((a, b) => a.version - b.version);
}

/**
 * Get all snapshots for a specific time slot (user + org + date + hour).
 * This is the most reliable lookup since the slot identity never changes.
 */
export function getEntryHistoryBySlot(
  userId: string,
  orgId: string,
  date: string,
  hour: number
): EntrySnapshot[] {
  const snapshots = readSnapshots(orgId);
  return snapshots
    .filter(
      (s) =>
        s.userId === userId &&
        s.date === date &&
        s.hour === hour
    )
    .sort((a, b) => a.version - b.version);
}

/**
 * Compute the diff between two snapshots.
 * Returns an array of field-level changes with human-readable before/after values.
 */
export function getEntryDiff(
  before: EntrySnapshot,
  after: EntrySnapshot
): EntryDiffItem[] {
  const diffs: EntryDiffItem[] = [];
  const fields = Object.keys(before.snapshot) as (keyof EntrySnapshotData)[];

  for (const field of fields) {
    const bVal = before.snapshot[field];
    const aVal = after.snapshot[field];

    const bStr = formatValue(field, bVal);
    const aStr = formatValue(field, aVal);

    if (bStr !== aStr) {
      diffs.push({
        field,
        before: bStr,
        after: aStr,
      });
    }
  }

  return diffs;
}

/**
 * Format a snapshot field value for human-readable display.
 */
function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "(vacío)";
  if (Array.isArray(value)) {
    if (value.length === 0) return "(vacío)";
    return value.join(", ");
  }
  return String(value);
}

/**
 * Get the total number of snapshots stored for an org.
 * Useful for diagnostics / storage management.
 */
export function getSnapshotCount(orgId: string): number {
  return readSnapshots(orgId).length;
}

/**
 * Clear all snapshots for an org. Use with caution.
 */
export function clearOrgHistory(orgId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getStorageKey(orgId));
  } catch {
    // fail silently
  }
}
