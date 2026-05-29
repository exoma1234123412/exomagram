// ============================================================
// Proof URL Validator + Inter-Entry Timing Analyzer
// Pure TypeScript — no React, no Supabase, no HTTP requests
// ============================================================

// ============================================================
// Part 1: Proof URL Validator
// ============================================================

export type ProofUrlType =
  | "github"
  | "figma"
  | "notion"
  | "google_docs"
  | "jira"
  | "linear"
  | "slack"
  | "generic_link"
  | "invalid";

export interface ProofValidation {
  url: string;
  isValid: boolean;
  isAccessible: boolean | null; // null — we don't make HTTP requests
  domain: string;
  type: ProofUrlType;
  relevanceScore: number; // 0-100 based on domain trust
}

export interface ProofValidationResult {
  allValid: boolean;
  results: ProofValidation[];
  overallScore: number; // average relevance
  suspiciousUrls: string[];
}

/** Domains we trust and their base relevance scores */
const TRUSTED_DOMAINS: Record<string, { type: ProofUrlType; score: number }> = {
  "github.com": { type: "github", score: 95 },
  "gitlab.com": { type: "github", score: 90 },
  "figma.com": { type: "figma", score: 90 },
  "notion.so": { type: "notion", score: 85 },
  "notion.site": { type: "notion", score: 85 },
  "linear.app": { type: "linear", score: 90 },
  "jira.atlassian.net": { type: "jira", score: 90 },
  "docs.google.com": { type: "google_docs", score: 85 },
  "drive.google.com": { type: "google_docs", score: 80 },
  "sheets.google.com": { type: "google_docs", score: 80 },
  "slides.google.com": { type: "google_docs", score: 80 },
  "slack.com": { type: "slack", score: 80 },
  "app.slack.com": { type: "slack", score: 80 },
};

/** Domains that are always suspicious — score 0 */
const SUSPICIOUS_DOMAINS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "test.local",
  "foo.com",
  "bar.com",
  "httpbin.org",
  "jsonplaceholder.typicode.com",
]);

/**
 * Extract the effective domain from a hostname for matching.
 * Handles subdomains: "myteam.atlassian.net" -> check "jira.atlassian.net" won't match,
 * but we also check the full hostname and the last two parts.
 */
function extractDomainParts(hostname: string): string[] {
  const parts = hostname.split(".");
  const candidates: string[] = [hostname];

  // Add the last two parts (e.g., "atlassian.net" from "myteam.atlassian.net")
  if (parts.length >= 2) {
    candidates.push(parts.slice(-2).join("."));
  }

  // Add the last three parts (e.g., "jira.atlassian.net" from "x.jira.atlassian.net")
  if (parts.length >= 3) {
    candidates.push(parts.slice(-3).join("."));
  }

  return candidates;
}

/**
 * Validate a single proof URL.
 * No HTTP requests — format and domain trust only.
 */
export function validateProofUrl(url: string): ProofValidation {
  const trimmed = url.trim();

  // Empty or stub URLs
  if (!trimmed || trimmed === "http://" || trimmed === "https://" || trimmed === "http" || trimmed === "https") {
    return {
      url: trimmed,
      isValid: false,
      isAccessible: null,
      domain: "",
      type: "invalid",
      relevanceScore: 0,
    };
  }

  // Try parsing as URL
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      url: trimmed,
      isValid: false,
      isAccessible: null,
      domain: "",
      type: "invalid",
      relevanceScore: 0,
    };
  }

  // Must be http or https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      url: trimmed,
      isValid: false,
      isAccessible: null,
      domain: parsed.hostname,
      type: "invalid",
      relevanceScore: 0,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check suspicious domains
  if (SUSPICIOUS_DOMAINS.has(hostname)) {
    return {
      url: trimmed,
      isValid: true, // technically a valid URL, but suspicious
      isAccessible: null,
      domain: hostname,
      type: "generic_link",
      relevanceScore: 0,
    };
  }

  // Check if it's a loopback IP range (127.x.x.x)
  if (hostname.startsWith("127.") || hostname === "[::1]") {
    return {
      url: trimmed,
      isValid: true,
      isAccessible: null,
      domain: hostname,
      type: "generic_link",
      relevanceScore: 0,
    };
  }

  // Match against trusted domains
  const domainParts = extractDomainParts(hostname);
  for (const candidate of domainParts) {
    const trusted = TRUSTED_DOMAINS[candidate];
    if (trusted) {
      // Bonus: URLs with meaningful paths score higher
      const hasPath = parsed.pathname.length > 1;
      const pathBonus = hasPath ? 5 : 0;
      const score = Math.min(100, trusted.score + pathBonus);

      return {
        url: trimmed,
        isValid: true,
        isAccessible: null,
        domain: hostname,
        type: trusted.type,
        relevanceScore: score,
      };
    }
  }

  // Unknown domain — generic link with base score of 40
  return {
    url: trimmed,
    isValid: true,
    isAccessible: null,
    domain: hostname,
    type: "generic_link",
    relevanceScore: 40,
  };
}

/**
 * Validate all proof URLs for an entry.
 * Checks validity, scores, duplicates, and suspicious URLs.
 */
export function validateProofUrls(urls: string[]): ProofValidationResult {
  if (!urls || urls.length === 0) {
    return {
      allValid: true,
      results: [],
      overallScore: 0,
      suspiciousUrls: [],
    };
  }

  const results = urls.map(validateProofUrl);
  const allValid = results.every((r) => r.isValid);

  // Average relevance score (only count valid URLs)
  const validResults = results.filter((r) => r.isValid);
  const overallScore =
    validResults.length > 0
      ? Math.round(validResults.reduce((sum, r) => sum + r.relevanceScore, 0) / validResults.length)
      : 0;

  // Suspicious: invalid URLs, score-0 URLs, duplicates
  const suspicious: string[] = [];

  // Flag invalid URLs
  for (const r of results) {
    if (!r.isValid) {
      suspicious.push(r.url);
    } else if (r.relevanceScore === 0) {
      suspicious.push(r.url);
    }
  }

  // Flag duplicate URLs
  const seen = new Set<string>();
  for (const r of results) {
    const normalized = r.url.toLowerCase().replace(/\/+$/, "");
    if (seen.has(normalized)) {
      if (!suspicious.includes(r.url)) {
        suspicious.push(r.url);
      }
    }
    seen.add(normalized);
  }

  return {
    allValid,
    results,
    overallScore,
    suspiciousUrls: suspicious,
  };
}

// ============================================================
// Part 2: Inter-Entry Timing Analyzer
// ============================================================

export type TimingPattern = "realtime" | "mixed" | "end_of_day" | "burst_backfill" | "suspicious";

export interface TimingMetrics {
  avgGapMinutes: number;
  maxGapMinutes: number;
  minGapMinutes: number;
  burstCount: number; // entries logged within 2 min of each other
  evenlySpaced: boolean; // suspiciously uniform spacing
  allAtEndOfDay: boolean; // all logged after 5pm
  allInBurst: boolean; // all logged within 10 minutes
  backfillScore: number; // 0-100, higher = more likely backfilling
  realtimeScore: number; // 0-100, higher = more likely logging in real-time
}

export interface TimingAnalysis {
  userId: string;
  date: string;
  entries: { hour: number; loggedAt: string }[];
  metrics: TimingMetrics;
  pattern: TimingPattern;
}

export interface TimingProfile {
  dominantPattern: string;
  realtimeRate: number; // % of days with realtime logging
  backfillRate: number; // % of days with burst backfilling
  avgDailyBursts: number;
}

/** Get minutes between two ISO date strings */
function minutesBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

/** Get the hour of day (0-23) from an ISO date string */
function hourOfDay(iso: string): number {
  return new Date(iso).getHours();
}

/** Check if gaps between sorted values are suspiciously uniform */
function hasUniformGaps(sortedTimestamps: string[], toleranceMinutes: number = 0.5): boolean {
  if (sortedTimestamps.length < 3) return false;

  const gaps: number[] = [];
  for (let i = 1; i < sortedTimestamps.length; i++) {
    gaps.push(minutesBetween(sortedTimestamps[i - 1], sortedTimestamps[i]));
  }

  // Check if all gaps are within tolerance of each other
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (avgGap === 0) return false;

  const allSimilar = gaps.every((g) => Math.abs(g - avgGap) <= toleranceMinutes);

  // Uniform gaps in the 0.5-2 minute range is the most suspicious pattern
  // (someone clicking through entries methodically)
  return allSimilar && avgGap >= 0.3 && avgGap <= 5;
}

/**
 * Analyze timing patterns for a user's entries on a single date.
 */
export function analyzeEntryTiming(
  entries: { hour: number; logged_at: string; date: string }[]
): TimingAnalysis {
  if (entries.length === 0) {
    return {
      userId: "",
      date: "",
      entries: [],
      metrics: {
        avgGapMinutes: 0,
        maxGapMinutes: 0,
        minGapMinutes: 0,
        burstCount: 0,
        evenlySpaced: false,
        allAtEndOfDay: false,
        allInBurst: false,
        backfillScore: 0,
        realtimeScore: 100,
      },
      pattern: "realtime",
    };
  }

  const date = entries[0].date;

  // Sort by logged_at timestamp
  const sorted = [...entries].sort(
    (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
  );

  const mappedEntries = sorted.map((e) => ({ hour: e.hour, loggedAt: e.logged_at }));
  const loggedAtTimestamps = sorted.map((e) => e.logged_at);

  // Calculate gaps between consecutive logged_at timestamps
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(minutesBetween(sorted[i - 1].logged_at, sorted[i].logged_at));
  }

  const avgGapMinutes = gaps.length > 0 ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;
  const maxGapMinutes = gaps.length > 0 ? Math.max(...gaps) : 0;
  const minGapMinutes = gaps.length > 0 ? Math.min(...gaps) : 0;

  // Count bursts: entries logged within 2 minutes of each other
  let burstCount = 0;
  for (const gap of gaps) {
    if (gap <= 2) burstCount++;
  }

  // Check for uniform spacing
  const evenlySpaced = hasUniformGaps(loggedAtTimestamps);

  // All entries logged after 5pm (17:00)?
  const allAfter5pm = sorted.every((e) => hourOfDay(e.logged_at) >= 17);

  // All entries for hours BEFORE 5pm but logged AFTER 5pm?
  const hasEarlyHoursLoggedLate =
    allAfter5pm && sorted.some((e) => e.hour < 17);
  const allAtEndOfDay = hasEarlyHoursLoggedLate;

  // All logged within 10 minutes?
  const totalSpan =
    sorted.length >= 2
      ? minutesBetween(sorted[0].logged_at, sorted[sorted.length - 1].logged_at)
      : 0;
  const allInBurst = sorted.length >= 2 && totalSpan <= 10;

  // --- Backfill Score Calculation ---
  let backfillScore = 0;
  const entryCount = sorted.length;

  if (entryCount === 1) {
    // Single entry — check if it was logged near its hour
    const e = sorted[0];
    const loggedHour = hourOfDay(e.logged_at);
    const hoursLate = loggedHour - e.hour;
    if (hoursLate <= 1 && hoursLate >= 0) {
      backfillScore = 5;
    } else if (hoursLate > 4) {
      backfillScore = 50;
    } else {
      backfillScore = 25;
    }
  } else {
    // Multiple entries
    if (allInBurst) {
      backfillScore = 90;
    } else if (evenlySpaced) {
      backfillScore = 80;
    } else if (burstCount > entryCount * 0.5) {
      backfillScore = 70;
    } else if (allAtEndOfDay) {
      backfillScore = 60;
    } else {
      // Check how many entries were logged near their actual hour
      let realtimeCount = 0;
      for (const e of sorted) {
        const loggedHour = hourOfDay(e.logged_at);
        // Within 30 minutes of the hour slot (same hour or +1)
        if (loggedHour === e.hour || loggedHour === e.hour + 1) {
          realtimeCount++;
        }
      }
      const realtimeRatio = realtimeCount / entryCount;

      if (realtimeRatio >= 0.8) {
        backfillScore = 10;
      } else if (realtimeRatio >= 0.5) {
        backfillScore = 30;
      } else {
        backfillScore = 50;
      }
    }
  }

  const realtimeScore = Math.max(0, 100 - backfillScore);

  // --- Determine pattern ---
  let pattern: TimingPattern;
  if (backfillScore >= 80 && evenlySpaced) {
    pattern = "suspicious";
  } else if (backfillScore >= 80) {
    pattern = "burst_backfill";
  } else if (allAtEndOfDay) {
    pattern = "end_of_day";
  } else if (backfillScore <= 20) {
    pattern = "realtime";
  } else {
    pattern = "mixed";
  }

  return {
    userId: "",
    date,
    entries: mappedEntries,
    metrics: {
      avgGapMinutes: Math.round(avgGapMinutes * 100) / 100,
      maxGapMinutes: Math.round(maxGapMinutes * 100) / 100,
      minGapMinutes: Math.round(minGapMinutes * 100) / 100,
      burstCount,
      evenlySpaced,
      allAtEndOfDay,
      allInBurst,
      backfillScore,
      realtimeScore,
    },
    pattern,
  };
}

/**
 * Get a timing profile summary for a user across multiple days.
 */
export function getTimingProfile(
  entries: { hour: number; logged_at: string; date: string }[],
  userId: string
): TimingProfile {
  if (entries.length === 0) {
    return {
      dominantPattern: "realtime",
      realtimeRate: 0,
      backfillRate: 0,
      avgDailyBursts: 0,
    };
  }

  // Group entries by date
  const byDate = new Map<string, { hour: number; logged_at: string; date: string }[]>();
  for (const entry of entries) {
    const existing = byDate.get(entry.date) || [];
    existing.push(entry);
    byDate.set(entry.date, existing);
  }

  // Analyze each day
  const analyses: TimingAnalysis[] = [];
  for (const [, dayEntries] of byDate) {
    const analysis = analyzeEntryTiming(dayEntries);
    analysis.userId = userId;
    analyses.push(analysis);
  }

  const totalDays = analyses.length;
  if (totalDays === 0) {
    return {
      dominantPattern: "realtime",
      realtimeRate: 0,
      backfillRate: 0,
      avgDailyBursts: 0,
    };
  }

  // Count patterns
  const patternCounts: Record<string, number> = {};
  let realtimeDays = 0;
  let backfillDays = 0;
  let totalBursts = 0;

  for (const a of analyses) {
    patternCounts[a.pattern] = (patternCounts[a.pattern] || 0) + 1;
    if (a.pattern === "realtime") realtimeDays++;
    if (a.pattern === "burst_backfill" || a.pattern === "suspicious") backfillDays++;
    totalBursts += a.metrics.burstCount;
  }

  // Find dominant pattern
  let dominantPattern = "mixed";
  let maxCount = 0;
  for (const [pattern, count] of Object.entries(patternCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantPattern = pattern;
    }
  }

  return {
    dominantPattern,
    realtimeRate: Math.round((realtimeDays / totalDays) * 100),
    backfillRate: Math.round((backfillDays / totalDays) * 100),
    avgDailyBursts: Math.round((totalBursts / totalDays) * 100) / 100,
  };
}
