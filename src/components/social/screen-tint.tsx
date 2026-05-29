"use client";

// ═══════════════════════════════════════════════════════════════
// SCREEN TINT — PHYSIOLOGICAL PRESSURE
// ═══════════════════════════════════════════════════════════════
//
// The ENTIRE screen progressively turns red the more behind you are.
// Fixed overlay, pointer-events-none — covers everything but doesn't
// block clicks. Your screen literally becomes unusable if you don't log.
//
// Deficit scale:
//   0  hours behind: transparent (no tint)
//   1  hour  behind: rgba(255,0,0, 0.02) — barely noticeable
//   2  hours behind: rgba(255,0,0, 0.05) — something is off
//   3  hours behind: rgba(255,0,0, 0.10) — clearly red
//   4  hours behind: rgba(255,0,0, 0.15) — hard to ignore
//   5  hours behind: rgba(255,0,0, 0.20) — uncomfortable
//   6+ hours behind: rgba(255,0,0, 0.25) — PAINFUL
//
// Vignette effect intensifies with deficit: dark edges close in.
// Real-time subscription: logging an entry fades the red INSTANTLY.
// Document title reflects status with emoji prefix.

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";

// --- Helpers --------------------------------------------------------

function getMTYNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  );
}

function getMTYHour(): number {
  return getMTYNow().getHours();
}

/** How many work hours have elapsed since work_start up to now (fractional). */
function workHoursElapsed(workStart: number, workEnd: number): number {
  const now = getMTYNow();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentFractional = currentHour + currentMinute / 60;

  // Before work starts: 0 expected
  if (currentFractional < workStart) return 0;
  // After work ends: full day expected
  if (currentFractional >= workEnd) return workEnd - workStart;
  // During work: fractional elapsed
  return currentFractional - workStart;
}

/** Compute red overlay opacity from deficit. */
function deficitToOpacity(deficit: number): number {
  if (deficit <= 0) return 0;
  // Custom curve matching the spec exactly
  if (deficit <= 1) return 0.02;
  if (deficit <= 2) return 0.05;
  if (deficit <= 3) return 0.10;
  if (deficit <= 4) return 0.15;
  if (deficit <= 5) return 0.20;
  return 0.25; // 6+ — PAINFUL
}

/** Vignette intensity scales with deficit. */
function deficitToVignette(deficit: number): number {
  if (deficit <= 0) return 0;
  // 0 to 1 range
  return Math.min(1, deficit * 0.12);
}

// --- Refresh interval -----------------------------------------------

const REFRESH_MS = 60_000; // every 60 seconds

// --- Component ------------------------------------------------------

export function ScreenTint() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();
  const [deficit, setDeficit] = useState(0);
  const [hoursLogged, setHoursLogged] = useState<number | null>(null);
  const [isLastPlace, setIsLastPlace] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const compute = useCallback(async () => {
    if (!orgId || !userId) return;

    const today = getTodayMTY();
    const currentHour = getMTYHour();

    // Fetch user profile (work schedule) + today's entries + team entries in parallel
    const [profileRes, entriesRes, teamEntriesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("work_start_hour, work_end_hour")
        .eq("id", userId)
        .single(),
      supabase
        .from("time_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("date", today),
      supabase
        .from("time_entries")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("date", today),
    ]);

    const workStart = profileRes.data?.work_start_hour ?? 7;
    const workEnd = profileRes.data?.work_end_hour ?? 19;
    const logged = entriesRes.count ?? 0;
    const expected = workHoursElapsed(workStart, workEnd);

    setHoursLogged(logged);

    // Only apply deficit during or after work hours
    if (currentHour < workStart) {
      setDeficit(0);
      setIsLastPlace(false);
      return;
    }

    const newDeficit = Math.max(0, expected - logged);
    setDeficit(newDeficit);

    // Check if last place among team (for title override)
    const teamEntries = teamEntriesRes.data ?? [];
    const hoursByUser = new Map<string, number>();
    for (const e of teamEntries) {
      hoursByUser.set(e.user_id, (hoursByUser.get(e.user_id) ?? 0) + 1);
    }
    // Need at least 2 members to determine last place
    if (hoursByUser.size >= 2) {
      const myHours = hoursByUser.get(userId) ?? 0;
      const allHours = [...hoursByUser.values()];
      const minHours = Math.min(...allHours);
      const maxHours = Math.max(...allHours);
      setIsLastPlace(myHours === minHours && myHours < maxHours);
    } else {
      setIsLastPlace(false);
    }
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load + polling every 60s
  useEffect(() => {
    if (!orgId || !userId) return;

    compute();

    intervalRef.current = setInterval(compute, REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [orgId, userId, compute]);

  // Real-time subscription: instant fade when you log an entry
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`screen_tint_${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => compute()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, compute]); // eslint-disable-line react-hooks/exhaustive-deps

  // Document title based on status
  useEffect(() => {
    if (hoursLogged === null) return;

    if (hoursLogged === 0 && deficit > 0) {
      document.title = "\u{1F480} 0 HORAS \u2014 Exomagram";
    } else if (isLastPlace) {
      document.title = "\u{1F3F4} \u00DALTIMO \u2014 Exomagram";
    } else if (deficit >= 2) {
      document.title = "\u26A0\uFE0F ATRASADO \u2014 Exomagram";
    } else {
      document.title = "\u2705 Exomagram";
    }

    // Restore title on unmount
    return () => {
      document.title = "Exomagram";
    };
  }, [hoursLogged, deficit, isLastPlace]);

  // Don't render overlay if no deficit
  const opacity = deficitToOpacity(deficit);
  const vignette = deficitToVignette(deficit);

  if (opacity === 0 && vignette === 0) return null;

  return (
    <>
      {/* Red overlay — covers EVERYTHING, blocks NOTHING */}
      <div
        className="fixed inset-0 z-[100] pointer-events-none transition-all duration-1000"
        style={{
          backgroundColor: `rgba(255, 0, 0, ${opacity})`,
        }}
        aria-hidden="true"
      />

      {/* Vignette — dark edges that close in with deficit */}
      {vignette > 0 && (
        <div
          className="fixed inset-0 z-[100] pointer-events-none transition-all duration-1000"
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, rgba(80, 0, 0, ${vignette * 0.5}) 100%)`,
          }}
          aria-hidden="true"
        />
      )}
    </>
  );
}
