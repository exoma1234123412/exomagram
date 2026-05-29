"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS, WORK_HOURS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PerformanceTier = "high" | "medium" | "low" | "critical";

interface PerformanceSnapshot {
  hoursToday: number;
  proofRate: number; // 0–1
  trustScore: number | null;
  currentStreak: number;
  gapCount: number;
}

interface ThemeValues {
  saturation: number; // 70–100 (%)
  warmth: number; // 0 (cool/blue-gray) – 1 (normal)
  shadowOpacity: number; // 0.05–0.15
  borderOpacity: number; // 0.1–0.3
  overlayColor: string; // rgba(...)
  vignetteOpacity: number; // 0 – 0.12
}

// ---------------------------------------------------------------------------
// Work-day boundaries (derived from WORK_HOURS)
// ---------------------------------------------------------------------------

const WORK_START = WORK_HOURS[0]; // 7
const WORK_END = WORK_HOURS[WORK_HOURS.length - 1] + 1; // 19
const WORK_WINDOW = WORK_END - WORK_START; // 12

// ---------------------------------------------------------------------------
// Re-evaluation cadence
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const TRANSITION_DURATION_MS = 2000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decimalHour(d: Date): number {
  return d.getHours() + d.getMinutes() / 60;
}

/** Fraction of the work window that has elapsed (0–1, clamped). */
function elapsedRatio(d: Date): number {
  const h = decimalHour(d);
  if (h <= WORK_START) return 0;
  if (h >= WORK_END) return 1;
  return (h - WORK_START) / WORK_WINDOW;
}

/**
 * Calculate a "performance mood" score from 0 to 100.
 *
 * Components:
 *   - pace (50% weight):  (hours_today / expected_so_far)  clamped 0–1
 *   - proof rate (25% weight): direct 0–1
 *   - streak bonus (15% weight): streak > 0 gives 1, else 0
 *   - gap penalty (10% weight): 1 minus (gapCount / work_hours_elapsed) clamped
 */
function calculateMood(snap: PerformanceSnapshot): number {
  const now = new Date();
  const ratio = elapsedRatio(now);

  // Expected hours logged so far based on time elapsed
  const expectedSoFar = Math.max(ratio * EXPECTED_DAILY_HOURS, 0.5);

  // Pace: how close to the expected rate (capped at 1.0 = on track or ahead)
  const pace = Math.min(snap.hoursToday / expectedSoFar, 1);

  // Proof rate directly maps 0–1
  const proof = snap.proofRate;

  // Streak: binary bonus
  const streakBonus = snap.currentStreak > 0 ? 1 : 0;

  // Gap penalty: inverse of gap ratio against elapsed work hours
  const elapsedHours = Math.max(Math.floor(ratio * WORK_WINDOW), 1);
  const gapRatio = Math.min(snap.gapCount / elapsedHours, 1);
  const gapScore = 1 - gapRatio;

  const raw =
    pace * 50 +
    proof * 25 +
    streakBonus * 15 +
    gapScore * 10;

  return Math.round(Math.min(100, Math.max(0, raw)));
}

function classifyTier(mood: number): PerformanceTier {
  if (mood >= 80) return "high";
  if (mood >= 50) return "medium";
  if (mood >= 25) return "low";
  return "critical";
}

// ---------------------------------------------------------------------------
// Theme value interpolation
// ---------------------------------------------------------------------------

/** Linearly interpolate between a and b by t (0–1). */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function themeForMood(mood: number): ThemeValues {
  // Normalise mood into 0–1 where 0 = worst, 1 = best
  const t = Math.min(1, Math.max(0, mood / 100));

  const saturation = lerp(70, 100, t);
  const warmth = lerp(0, 1, t);
  const shadowOpacity = lerp(0.15, 0.05, t);
  const borderOpacity = lerp(0.3, 0.1, t);

  // Overlay: varies by tier
  const tier = classifyTier(mood);
  let overlayColor: string;
  let vignetteOpacity = 0;

  switch (tier) {
    case "high":
      // Very faint green tint or none
      overlayColor = "rgba(34, 197, 94, 0.01)";
      vignetteOpacity = 0;
      break;
    case "medium":
      // Subtle amber tint at 2% opacity
      overlayColor = "rgba(245, 158, 11, 0.02)";
      vignetteOpacity = 0;
      break;
    case "low":
      // Subtle reddish tint at 3% opacity
      overlayColor = "rgba(239, 68, 68, 0.03)";
      vignetteOpacity = 0.04;
      break;
    case "critical":
      // Noticeable red tint at 5% + vignette
      overlayColor = "rgba(220, 38, 38, 0.05)";
      vignetteOpacity = 0.12;
      break;
  }

  return { saturation, warmth, shadowOpacity, borderOpacity, overlayColor, vignetteOpacity };
}

// ---------------------------------------------------------------------------
// Apply CSS custom properties to :root
// ---------------------------------------------------------------------------

function applyToRoot(values: ThemeValues): void {
  const root = document.documentElement;
  root.style.setProperty("--performance-saturation", `${values.saturation}%`);
  root.style.setProperty("--performance-warmth", `${values.warmth}`);
  root.style.setProperty("--performance-shadow-opacity", `${values.shadowOpacity}`);
  root.style.setProperty("--performance-border-opacity", `${values.borderOpacity}`);
}

function cleanupRoot(): void {
  const root = document.documentElement;
  root.style.removeProperty("--performance-saturation");
  root.style.removeProperty("--performance-warmth");
  root.style.removeProperty("--performance-shadow-opacity");
  root.style.removeProperty("--performance-border-opacity");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdaptiveTheme() {
  const supabase = createClient();

  const [theme, setTheme] = useState<ThemeValues | null>(null);
  const previousMoodRef = useRef<number | null>(null);
  const orgIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchPerformance = useCallback(async (): Promise<void> => {
    try {
      // Resolve user + org (cache after first call)
      if (!userIdRef.current || !orgIdRef.current) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        userIdRef.current = user.id;

        const { data: membership } = await supabase
          .from("org_members")
          .select("org_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (!membership) return;
        orgIdRef.current = membership.org_id;
      }

      const userId = userIdRef.current;
      const orgId = orgIdRef.current;
      const today = new Date().toISOString().split("T")[0];

      // Parallel fetches
      const [entriesRes, trustRes, streakRes] = await Promise.all([
        // Today's time entries (with proof info)
        supabase
          .from("time_entries")
          .select("hour, proof_urls")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .eq("date", today),

        // Latest trust score
        supabase
          .from("trust_score_history")
          .select("score")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .order("date", { ascending: false })
          .limit(1)
          .single(),

        // Streak
        supabase
          .from("activity_streaks")
          .select("current_streak")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .limit(1)
          .single(),
      ]);

      const entries = entriesRes.data ?? [];
      const loggedHours = new Set(entries.map((e) => e.hour));
      const hoursToday = loggedHours.size;

      // Proof rate: fraction of entries that have at least one proof URL
      const withProof = entries.filter(
        (e) => e.proof_urls && (e.proof_urls as string[]).length > 0,
      );
      const proofRate = entries.length > 0 ? withProof.length / entries.length : 0;

      // Trust score
      const trustScore: number | null = trustRes.data?.score ?? null;

      // Streak
      const currentStreak: number = streakRes.data?.current_streak ?? 0;

      // Gap count: work hours elapsed that have no entry
      const now = new Date();
      const ratio = elapsedRatio(now);
      const elapsedWorkHours = Math.floor(ratio * WORK_WINDOW);
      let gapCount = 0;
      for (let i = 0; i < elapsedWorkHours; i++) {
        const hour = WORK_START + i;
        if (!loggedHours.has(hour)) {
          gapCount++;
        }
      }

      const snap: PerformanceSnapshot = {
        hoursToday,
        proofRate,
        trustScore,
        currentStreak,
        gapCount,
      };

      const mood = calculateMood(snap);
      const values = themeForMood(mood);

      // Only update if mood actually changed (avoids re-renders / transitions)
      if (previousMoodRef.current !== mood) {
        previousMoodRef.current = mood;
        setTheme(values);
        applyToRoot(values);
      }
    } catch {
      // Subliminal layer must never break the app
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Lifecycle: poll every 5 minutes + realtime subscription
  // -----------------------------------------------------------------------

  useEffect(() => {
    // Initial fetch
    fetchPerformance();

    // Periodic re-evaluation
    const interval = setInterval(fetchPerformance, POLL_INTERVAL_MS);

    // Realtime subscription: re-evaluate when new time entries arrive
    const channel = supabase
      .channel("adaptive-theme-entries")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
        },
        () => {
          // Small debounce so bulk inserts don't cause a storm
          setTimeout(fetchPerformance, 1500);
        },
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
      cleanupRoot();
    };
  }, [fetchPerformance, supabase]);

  // -----------------------------------------------------------------------
  // Render: invisible overlay only
  // -----------------------------------------------------------------------

  if (!theme) return null;

  // Build vignette gradient for low/critical tiers
  const vignetteBackground =
    theme.vignetteOpacity > 0
      ? `radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, ${theme.vignetteOpacity}) 100%)`
      : "none";

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        transition: `background-color ${TRANSITION_DURATION_MS}ms ease-in-out`,
        backgroundColor: theme.overlayColor,
      }}
    >
      {/* Vignette layer — only visible in low/critical tiers */}
      {theme.vignetteOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: vignetteBackground,
            transition: `opacity ${TRANSITION_DURATION_MS}ms ease-in-out`,
            opacity: 1,
          }}
        />
      )}
    </div>
  );
}
