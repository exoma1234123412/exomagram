"use client";

// ═══════════════════════════════════════════════════════════════
// NEGATIVE PRIMING — MORNING FAILURE CONFRONTATION
// ═══════════════════════════════════════════════════════════════
//
// Every morning the FIRST thing you see is your worst stats from
// yesterday. Full-screen overlay that cannot be dismissed for 5
// seconds. Forces the user to confront personal failures before
// starting the day.
//
// Behavioral priming: negativity drives compensatory action.
// If yesterday was actually good, shows a brief positive message
// with a 2-second dismiss timer instead.
//
// Checks localStorage to avoid reshowing the same day.
// Queries: time_entries, trust_score_history, daily_closeouts,
// daily_promises, accountability_flags, entry_reactions.

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Module-level fallback for environments where localStorage is unavailable
// (private browsing, storage quota exceeded, security restrictions).
// Keyed by the same storage key so it behaves identically to localStorage.
// ---------------------------------------------------------------------------
const _inMemoryPrimed = new Set<string>();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface YesterdayStats {
  hoursLogged: number;
  trustScore: number | null;
  rank: number | null;
  totalMembers: number | null;
  hadCloseout: boolean;
  brokenPromises: string[];
  flagCount: number;
  suspiciousReactions: number;
}

type DayQuality = "bad" | "good";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getYesterdayMTY(): string {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  );
  now.setDate(now.getDate() - 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getStorageKey(date: string): string {
  return `primed_${date}`;
}

function wasPrimedToday(todayDate: string): boolean {
  const key = getStorageKey(todayDate);
  // Check in-memory fallback first — covers the case where localStorage was
  // unavailable on a previous markAsPrimed call this session.
  if (_inMemoryPrimed.has(key)) return true;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function markAsPrimed(todayDate: string): void {
  const key = getStorageKey(todayDate);
  // Always record in-memory so the check works even if localStorage fails.
  _inMemoryPrimed.add(key);
  try {
    localStorage.setItem(key, "true");
  } catch {
    // localStorage unavailable — in-memory fallback already set above.
  }
}

const EXPECTED_HOURS = 8;

function assessQuality(stats: YesterdayStats): DayQuality {
  // "Good" requires: 7+ hours, closeout done, no broken promises,
  // no flags, no suspicious reactions, trust score >= 80
  const hoursOk = stats.hoursLogged >= 7;
  const trustOk = stats.trustScore === null || stats.trustScore >= 80;
  const closeoutOk = stats.hadCloseout;
  const promisesOk = stats.brokenPromises.length === 0;
  const flagsOk = stats.flagCount === 0;
  const reactionsOk = stats.suspiciousReactions === 0;

  if (hoursOk && trustOk && closeoutOk && promisesOk && flagsOk && reactionsOk) {
    return "good";
  }
  return "bad";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NegativePriming() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<YesterdayStats | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [quality, setQuality] = useState<DayQuality>("bad");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Ref used by the safety timeout so it can cancel itself after fetchData
  // resolves normally without racing with state updates.
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Fetch yesterday's data ----
  const fetchData = useCallback(async () => {
    if (!orgId || !userId) return;

    // Safety timeout: if queries haven't resolved within 8 seconds, unblock
    // the user by auto-dismissing the overlay and marking as primed so it
    // doesn't re-appear on the next page load.
    safetyTimerRef.current = setTimeout(() => {
      const today = getTodayMTY();
      markAsPrimed(today);
      setVisible(false);
    }, 8000);

    try {
      const yesterday = getYesterdayMTY();

      const [
        entriesRes,
        trustRes,
        allTrustRes,
        closeoutRes,
        promisesRes,
        flagsRes,
        reactionsRes,
      ] = await Promise.all([
        // Hours logged yesterday
        supabase
          .from("time_entries")
          .select("hour")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .eq("date", yesterday)
          .is("deleted_at", null),
        // Trust score yesterday
        supabase
          .from("trust_score_history")
          .select("score")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .eq("date", yesterday)
          .limit(1)
          .single(),
        // All trust scores yesterday (for rank)
        supabase
          .from("trust_score_history")
          .select("user_id, score")
          .eq("org_id", orgId)
          .eq("date", yesterday)
          .order("score", { ascending: false }),
        // Closeout yesterday
        supabase
          .from("daily_closeouts")
          .select("id")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .eq("date", yesterday)
          .limit(1)
          .single(),
        // Broken promises yesterday
        supabase
          .from("daily_promises")
          .select("title, status")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .eq("date", yesterday)
          .eq("status", "broken"),
        // Flags raised yesterday
        supabase
          .from("accountability_flags")
          .select("id")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .eq("date", yesterday),
        // Suspicious reactions on yesterday's entries
        supabase
          .from("time_entries")
          .select("id")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .eq("date", yesterday)
          .is("deleted_at", null),
      ]);

      // Count unique hours
      const uniqueHours = new Set((entriesRes.data ?? []).map((e) => e.hour));
      const hoursLogged = uniqueHours.size;

      // Trust score and rank
      const trustScore = trustRes.data?.score ?? null;
      const allScores = allTrustRes.data ?? [];
      let rank: number | null = null;
      let totalMembers: number | null = null;
      if (allScores.length > 0) {
        totalMembers = allScores.length;
        const idx = allScores.findIndex((s) => s.user_id === userId);
        rank = idx >= 0 ? idx + 1 : null;
      }

      // Closeout
      const hadCloseout = !!closeoutRes.data;

      // Broken promises
      const brokenPromises = (promisesRes.data ?? []).map((p) => p.title);

      // Flags
      const flagCount = flagsRes.data?.length ?? 0;

      // Suspicious reactions: fetch reactions for yesterday's entries
      const entryIds = (reactionsRes.data ?? []).map((e) => e.id);
      let suspiciousReactions = 0;
      if (entryIds.length > 0) {
        const { data: reactions } = await supabase
          .from("entry_reactions")
          .select("id")
          .in("entry_id", entryIds)
          .eq("reaction", "suspicious");
        suspiciousReactions = reactions?.length ?? 0;
      }

      const result: YesterdayStats = {
        hoursLogged,
        trustScore,
        rank,
        totalMembers,
        hadCloseout,
        brokenPromises,
        flagCount,
        suspiciousReactions,
      };

      setStats(result);

      const q = assessQuality(result);
      setQuality(q);
      // Good day gets 2-second timer, bad day gets 5
      setCountdown(q === "good" ? 2 : 5);
      setLoading(false);
    } catch {
      // Any query error: show a brief message, then auto-dismiss after 2
      // seconds so the user is never permanently blocked.
      setErrorMessage("No se pudo cargar datos de ayer");
      setLoading(false);
      setTimeout(() => {
        const today = getTodayMTY();
        markAsPrimed(today);
        setVisible(false);
      }, 2000);
    } finally {
      // Cancel the safety timeout if fetchData finished (success or error)
      // before the 8-second deadline.
      if (safetyTimerRef.current !== null) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
    }
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Cleanup safety timer on unmount ----
  useEffect(() => {
    return () => {
      if (safetyTimerRef.current !== null) {
        clearTimeout(safetyTimerRef.current);
      }
    };
  }, []);

  // ---- Check if should show ----
  useEffect(() => {
    if (!orgId || !userId) return;

    const today = getTodayMTY();
    if (wasPrimedToday(today)) {
      setVisible(false);
      setLoading(false);
      return;
    }

    setVisible(true);
    fetchData();
  }, [orgId, userId, fetchData]);

  // ---- Countdown timer (starts after loading) ----
  useEffect(() => {
    if (!visible || loading || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, loading, countdown]);

  // ---- Dismiss ----
  function handleDismiss() {
    const today = getTodayMTY();
    markAsPrimed(today);
    setVisible(false);
  }

  // ---- Failure lines ----
  const failureLines = useMemo(() => {
    if (!stats || quality === "good") return [];

    const lines: { text: string; severity: "red" | "amber" }[] = [];

    // Hours
    if (stats.hoursLogged < EXPECTED_HOURS) {
      const severity = stats.hoursLogged < 5 ? "red" : "amber";
      lines.push({
        text: `Ayer registraste ${stats.hoursLogged} hora${stats.hoursLogged !== 1 ? "s" : ""} (esperado: ${EXPECTED_HOURS})`,
        severity,
      });
    }

    // Trust score + rank
    if (stats.trustScore !== null) {
      const severity = stats.trustScore < 60 ? "red" : "amber";
      let rankText = "";
      if (stats.rank !== null && stats.totalMembers !== null) {
        rankText = ` (rank #${stats.rank} de ${stats.totalMembers})`;
      }
      lines.push({
        text: `Trust Score: ${Math.round(stats.trustScore)}${rankText}`,
        severity,
      });
    }

    // Missing closeout
    if (!stats.hadCloseout) {
      lines.push({ text: "Sin closeout", severity: "red" });
    }

    // Broken promises
    for (const promise of stats.brokenPromises) {
      lines.push({
        text: `Promesa rota: ${promise}`,
        severity: "red",
      });
    }

    // Flags
    if (stats.flagCount > 0) {
      lines.push({
        text: `${stats.flagCount} bandera${stats.flagCount > 1 ? "s" : ""} levantada${stats.flagCount > 1 ? "s" : ""}`,
        severity: stats.flagCount > 2 ? "red" : "amber",
      });
    }

    // Suspicious reactions
    if (stats.suspiciousReactions > 0) {
      lines.push({
        text: `${stats.suspiciousReactions} reaccion${stats.suspiciousReactions > 1 ? "es" : ""} sospechosa${stats.suspiciousReactions > 1 ? "s" : ""}`,
        severity: "red",
      });
    }

    return lines;
  }, [stats, quality]);

  // ---- Don't render ----
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center">
      {/* Content panel */}
      <div className="corner-marks border border-border bg-background p-8 max-w-md w-full mx-4">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-10 h-10 border border-red-500/30 animate-pulse flex items-center justify-center">
              <div className="w-3 h-3 bg-red-500/60" />
            </div>
            <p className="font-mono text-[10px] text-muted-foreground mt-4 uppercase tracking-[0.2em]">
              Analizando...
            </p>
            {/* Escape hatch — nearly invisible, exists only to unblock the
                user if something goes wrong during the loading phase. */}
            <button
              onClick={handleDismiss}
              className="absolute bottom-2 right-3 font-mono text-[8px] text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
            >
              Saltar
            </button>
          </div>
        )}

        {/* Error state — auto-dismisses after 2 s, shown when queries fail */}
        {!loading && errorMessage && (
          <div>
            <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted-foreground mb-6">
              RESUMEN DE AYER
            </p>
            <p className="font-mono text-sm text-muted-foreground">
              {errorMessage}
            </p>
          </div>
        )}

        {/* Bad day — confrontation */}
        {!loading && stats && quality === "bad" && (
          <div>
            {/* Header */}
            <p className="font-mono text-xs tracking-[0.2em] uppercase text-red-500 mb-6">
              RESUMEN DE AYER
            </p>

            {/* Failure lines */}
            <div className="space-y-4">
              {failureLines.map((line, i) => (
                <p
                  key={i}
                  className={cn(
                    "font-mono tabular-nums text-lg font-bold",
                    line.severity === "red"
                      ? "text-red-400"
                      : "text-amber-400"
                  )}
                >
                  {line.text}
                </p>
              ))}
            </div>

            {/* Countdown / dismiss */}
            <div className="mt-8 relative">
              {countdown > 0 ? (
                <p className="font-mono text-[10px] text-muted-foreground/60">
                  Puedes cerrar en {countdown} segundo{countdown !== 1 ? "s" : ""}
                </p>
              ) : (
                <button
                  onClick={handleDismiss}
                  className="bg-primary text-primary-foreground font-mono text-xs px-6 py-2.5 transition-colors duration-150 hover:bg-primary/90"
                >
                  Entendido
                </button>
              )}
              {/* Escape hatch — nearly invisible during the forced wait */}
              {countdown > 0 && (
                <button
                  onClick={handleDismiss}
                  className="absolute bottom-0 right-0 font-mono text-[8px] text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
                >
                  Saltar
                </button>
              )}
            </div>
          </div>
        )}

        {/* Good day — brief acknowledgment */}
        {!loading && stats && quality === "good" && (
          <div>
            {/* Header */}
            <p className="font-mono text-xs tracking-[0.2em] uppercase text-green-500 mb-6">
              RESUMEN DE AYER
            </p>

            <p className="font-mono tabular-nums text-lg font-bold text-green-400">
              Buen dia ayer. Manten el nivel.
            </p>

            {/* Countdown / dismiss */}
            <div className="mt-8 relative">
              {countdown > 0 ? (
                <p className="font-mono text-[10px] text-muted-foreground/60">
                  Puedes cerrar en {countdown} segundo{countdown !== 1 ? "s" : ""}
                </p>
              ) : (
                <button
                  onClick={handleDismiss}
                  className="bg-primary text-primary-foreground font-mono text-xs px-6 py-2.5 transition-colors duration-150 hover:bg-primary/90"
                >
                  Entendido
                </button>
              )}
              {/* Escape hatch — nearly invisible during the forced wait */}
              {countdown > 0 && (
                <button
                  onClick={handleDismiss}
                  className="absolute bottom-0 right-0 font-mono text-[8px] text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
                >
                  Saltar
                </button>
              )}
            </div>
          </div>
        )}

        {/* No data edge case — only shown when there was no error and no stats */}
        {!loading && !stats && !errorMessage && (
          <div>
            <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted-foreground mb-6">
              RESUMEN DE AYER
            </p>
            <p className="font-mono text-sm text-muted-foreground">
              Sin datos de ayer para analizar.
            </p>
            <div className="mt-8">
              <button
                onClick={handleDismiss}
                className="bg-primary text-primary-foreground font-mono text-xs px-6 py-2.5 transition-colors duration-150 hover:bg-primary/90"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
