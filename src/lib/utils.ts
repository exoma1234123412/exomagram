import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatHour(h: number): string {
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:00 ${suffix}`;
}

export function formatHourShort(h: number): string {
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}${suffix}`;
}

export function getTodayMTY(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date());
}

export function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000 / 60;
  if (diff < 1) return "ahora";
  if (diff < 60) return `${Math.round(diff)}m`;
  if (diff < 1440) return `${Math.round(diff / 60)}h`;
  return `${Math.round(diff / 1440)}d`;
}

// ── Freshness: half-life decay from logged_at ──────────────
// Returns 0-100. 100 = logged within the hour. Decays with half-life of 2 hours.
export function entryFreshness(loggedAt: string, entryDate: string, entryHour: number): number {
  const endHour = entryHour >= 23 ? 23 : entryHour + 1;
  const entryTime = new Date(`${entryDate}T${String(endHour).padStart(2, "0")}:${entryHour >= 23 ? "59:59" : "00:00"}`).getTime();
  const loggedTime = new Date(loggedAt).getTime();
  const delayMinutes = Math.max(0, (loggedTime - entryTime) / 1000 / 60);
  // Half-life: 120 minutes. After 2h = 50%, 4h = 25%, 8h = 6%, 24h ≈ 0%
  const halfLife = 120;
  return Math.round(100 * Math.pow(0.5, delayMinutes / halfLife));
}

export function freshnessLabel(pct: number): { text: string; color: string } {
  if (pct >= 90) return { text: "Fresco", color: "text-green-600 dark:text-green-400" };
  if (pct >= 60) return { text: `${pct}%`, color: "text-emerald-600 dark:text-emerald-400" };
  if (pct >= 30) return { text: `${pct}%`, color: "text-yellow-600 dark:text-yellow-400" };
  if (pct >= 10) return { text: `${pct}%`, color: "text-orange-600 dark:text-orange-400" };
  return { text: "Rancio", color: "text-red-600 dark:text-red-400" };
}

// ── Entry Entropy: information-theoretic content score ──────
// Measures unique information density. Returns 0-100.
export function entryEntropy(title: string, description?: string | null): number {
  const text = `${title} ${description ?? ""}`.trim();
  if (text.length < 5) return 0;

  // Character-level entropy (Shannon)
  const freq: Record<string, number> = {};
  for (const c of text.toLowerCase()) freq[c] = (freq[c] ?? 0) + 1;
  const len = text.length;
  let shannon = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    if (p > 0) shannon -= p * Math.log2(p);
  }

  // Unique word ratio
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words).size;
  const uniqueRatio = words.length > 0 ? uniqueWords / words.length : 0;

  // Specific artifact bonus (file names, numbers, technical terms)
  const artifacts = (text.match(/[A-Z][a-z]+[A-Z]|#\d+|\.\w{2,4}\b|https?:\/\/|[a-z_]+\(|v\d+\.\d+/g) ?? []).length;
  const artifactBonus = Math.min(artifacts * 8, 25);

  // Length bonus (longer = more info, diminishing returns)
  const lengthScore = Math.min(text.length / 3, 25);

  // Combine: shannon (0-~4.5) scaled to 0-25, unique ratio 0-25, artifacts 0-25, length 0-25
  const shannonScaled = Math.min((shannon / 4.5) * 25, 25);
  const uniqueScaled = uniqueRatio * 25;

  return Math.min(100, Math.round(shannonScaled + uniqueScaled + artifactBonus + lengthScore));
}

export function entropyLabel(score: number): { text: string; color: string } {
  if (score >= 70) return { text: "Alta info", color: "text-green-600 dark:text-green-400" };
  if (score >= 40) return { text: "Media", color: "text-muted-foreground" };
  if (score >= 20) return { text: "Baja info", color: "text-yellow-600 dark:text-yellow-400" };
  return { text: "Vacía", color: "text-red-600 dark:text-red-400" };
}

// ── Work Value Pricing ─────────────────────────────────────
// Base rates per category (relative value multiplier 0-1)
const CATEGORY_VALUE: Record<string, number> = {
  deep_work: 1.0,
  review: 0.85,
  planning: 0.75,
  learning: 0.7,
  meeting: 0.5,
  admin: 0.35,
  break: 0.0,
  blocked: 0.1,
};

// Returns dollar value estimate for an entry (0-100 scale per hour)
export function entryValue(entry: {
  category: string;
  quality_score?: number | null;
  proof_urls?: string[] | null;
  is_late?: boolean;
}): number {
  const base = CATEGORY_VALUE[entry.category] ?? 0.3;
  const quality = (entry.quality_score ?? 50) / 100;
  const proofBonus = (entry.proof_urls?.length ?? 0) > 0 ? 1.2 : 0.8;
  const latePenalty = entry.is_late ? 0.85 : 1.0;
  return Math.round(base * quality * proofBonus * latePenalty * 100);
}

export function valueLabel(v: number): { text: string; color: string } {
  if (v >= 70) return { text: `$${v}`, color: "text-green-600 dark:text-green-400" };
  if (v >= 40) return { text: `$${v}`, color: "text-muted-foreground" };
  if (v >= 15) return { text: `$${v}`, color: "text-yellow-600 dark:text-yellow-400" };
  return { text: `$${v}`, color: "text-red-600 dark:text-red-400" };
}
