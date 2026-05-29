"use client";

// ═══════════════════════════════════════════════════════════════
// PRODUCTIVITY PRISON — THE NUCLEAR OPTION
// ═══════════════════════════════════════════════════════════════
//
// If you're 4+ hours behind on logging, the entire app becomes
// unusable. A heavy blur (4px) covers all content, and a prison
// overlay card demands you log at least 2 entries to unlock.
//
// At 2-3 hours behind, a light blur (1px) degrades the view and
// a persistent banner nags you into compliance.
//
// The blur wraps children directly — this is NOT a fixed overlay
// on top. The content literally becomes unreadable.
//
// Real-time: logging entries instantly recalculates deficit and
// lifts the blur when you're back within tolerance.
//
// This component is the final escalation after ScreenTint (red),
// GhostEffect (invisible), and HerdPressure (social shame).
// Here, we simply remove your ability to use the product.

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, cn } from "@/lib/utils";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { Lock, AlertTriangle, Clock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// --- Helpers --------------------------------------------------------

function getMTYNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  );
}

function getMTYHour(): number {
  return getMTYNow().getHours();
}

/** Fractional work hours elapsed since work_start up to now. */
function workHoursElapsed(workStart: number, workEnd: number): number {
  const now = getMTYNow();
  const currentFractional = now.getHours() + now.getMinutes() / 60;

  if (currentFractional < workStart) return 0;
  if (currentFractional >= workEnd) return workEnd - workStart;
  return currentFractional - workStart;
}

// --- Constants ------------------------------------------------------

const REFRESH_MS = 30_000; // 30 seconds
const HEAVY_BLUR_THRESHOLD = 4; // 4+ hours: full prison
const LIGHT_BLUR_THRESHOLD = 2; // 2-3 hours: degraded view
const ENTRIES_TO_UNLOCK = 2; // must log 2 entries to escape prison

// --- Component ------------------------------------------------------

export function ProductivityPrison({ children }: { children: React.ReactNode }) {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [deficit, setDeficit] = useState(0);
  const [todayEntryCount, setTodayEntryCount] = useState(0);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [recentEntries, setRecentEntries] = useState(0); // entries logged since prison activated
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prisonActivatedAtRef = useRef<string | null>(null);

  const compute = useCallback(async () => {
    if (!orgId || !userId) return;

    const today = getTodayMTY();
    const currentHour = getMTYHour();

    const [profileRes, entriesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("work_start_hour, work_end_hour")
        .eq("id", userId)
        .single(),
      supabase
        .from("time_entries")
        .select("id, logged_at", { count: "exact" })
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("date", today),
    ]);

    const workStart = profileRes.data?.work_start_hour ?? 7;
    const workEnd = profileRes.data?.work_end_hour ?? 19;
    const logged = entriesRes.count ?? 0;
    const expected = workHoursElapsed(workStart, workEnd);

    setTodayEntryCount(logged);

    // Only compute deficit during or after work hours
    if (currentHour < workStart) {
      setDeficit(0);
      setRecentEntries(0);
      prisonActivatedAtRef.current = null;
      return;
    }

    const newDeficit = Math.max(0, Math.floor(expected - logged));
    setDeficit(newDeficit);

    // Track when prison first activates
    if (newDeficit >= HEAVY_BLUR_THRESHOLD && !prisonActivatedAtRef.current) {
      prisonActivatedAtRef.current = new Date().toISOString();
    }

    // Count entries logged after prison activation
    if (prisonActivatedAtRef.current && entriesRes.data) {
      const activatedAt = prisonActivatedAtRef.current;
      const entriesSinceActivation = entriesRes.data.filter(
        (e) => e.logged_at >= activatedAt
      ).length;
      setRecentEntries(entriesSinceActivation);
    }

    // If deficit drops below threshold, clear prison
    if (newDeficit < HEAVY_BLUR_THRESHOLD) {
      prisonActivatedAtRef.current = null;
      setRecentEntries(0);
    }
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load + polling
  useEffect(() => {
    if (!orgId || !userId) return;
    compute();
    intervalRef.current = setInterval(compute, REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [orgId, userId, compute]);

  // Real-time: instant update when entries change
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`prison_${orgId}_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          // Small delay to let DB settle
          setTimeout(compute, 500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, userId, compute]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle log dialog close — refetch
  function handleLogDialogChange(open: boolean) {
    setLogDialogOpen(open);
    if (!open) {
      setTimeout(compute, 1000);
    }
  }

  // --- Determine blur level ---
  const isHeavyPrison = deficit >= HEAVY_BLUR_THRESHOLD;
  const isLightDegradation = deficit >= LIGHT_BLUR_THRESHOLD && deficit < HEAVY_BLUR_THRESHOLD;
  const blurPx = isHeavyPrison ? 4 : isLightDegradation ? 1 : 0;

  return (
    <>
      {/* Wrapped content with dynamic blur */}
      <div
        className="transition-all duration-700"
        style={{
          filter: blurPx > 0 ? `blur(${blurPx}px)` : "none",
          pointerEvents: isHeavyPrison ? "none" : "auto",
          userSelect: isHeavyPrison ? "none" : "auto",
        }}
      >
        {children}
      </div>

      {/* Light degradation banner (2-3 hours behind) */}
      {isLightDegradation && !isHeavyPrison && (
        <DegradationBanner
          deficit={deficit}
          onRegister={() => setLogDialogOpen(true)}
        />
      )}

      {/* Heavy prison overlay (4+ hours behind) */}
      {isHeavyPrison && (
        <PrisonOverlay
          deficit={deficit}
          todayEntryCount={todayEntryCount}
          recentEntries={recentEntries}
          onRegister={() => setLogDialogOpen(true)}
        />
      )}

      {/* Log entry dialog — always accessible */}
      <LogEntryDialog open={logDialogOpen} onOpenChange={handleLogDialogChange} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// DEGRADATION BANNER (2-3 hours behind)
// ═══════════════════════════════════════════════════════════════

function DegradationBanner({
  deficit,
  onRegister,
}: {
  deficit: number;
  onRegister: () => void;
}) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[85] pointer-events-auto">
      <div
        className={cn(
          "w-full px-4 py-3 border-b",
          "bg-amber-950/95 border-amber-500/30",
          "flex items-center justify-between gap-3",
          "font-mono text-xs backdrop-blur-sm"
        )}
      >
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
          <span className="text-amber-200 uppercase tracking-wide">
            <span className="font-bold">Vista degradada</span>
            <span className="mx-1.5 text-amber-500/50">|</span>
            <span className="tabular-nums font-bold">{deficit}</span> horas de retraso
            <span className="mx-1.5 text-amber-500/50">|</span>
            Registra para limpiar
          </span>
        </div>
        <Button
          onClick={onRegister}
          className={cn(
            "font-mono text-xs uppercase tracking-wider h-7 px-4",
            "bg-amber-500 text-black hover:bg-amber-400",
            "shrink-0"
          )}
        >
          Registrar
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRISON OVERLAY (4+ hours behind)
// ═══════════════════════════════════════════════════════════════
//
// Full-screen, no dismiss, no escape. Log or suffer.

function PrisonOverlay({
  deficit,
  todayEntryCount,
  recentEntries,
  onRegister,
}: {
  deficit: number;
  todayEntryCount: number;
  recentEntries: number;
  onRegister: () => void;
}) {
  const [tick, setTick] = useState(0);

  // Pulse timer for urgency effect
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Progress towards unlocking (need ENTRIES_TO_UNLOCK entries)
  const progress = Math.min(recentEntries, ENTRIES_TO_UNLOCK);
  const progressPercent = (progress / ENTRIES_TO_UNLOCK) * 100;

  // Time display pulses
  void tick;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      {/* Scanline effect */}
      <div
        className="fixed inset-0 z-[91] pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
        }}
        aria-hidden="true"
      />

      {/* Prison card */}
      <div
        className={cn(
          "relative z-[92] w-full max-w-md mx-auto",
          "bg-black border-2 border-red-500/60",
          "overflow-hidden font-mono",
          "shadow-2xl shadow-red-900/40"
        )}
      >
        {/* Top red pulse line */}
        <div className="h-1 w-full bg-gradient-to-r from-red-800 via-red-500 to-red-800 animate-pulse" />

        {/* Content */}
        <div className="px-6 pt-8 pb-6 space-y-6">
          {/* Lock icon */}
          <div className="flex justify-center">
            <div
              className={cn(
                "w-16 h-16 border-2 border-red-500/40",
                "flex items-center justify-center",
                "bg-red-950/30"
              )}
            >
              <Lock className="w-8 h-8 text-red-500 animate-pulse" />
            </div>
          </div>

          {/* Headline */}
          <div className="text-center space-y-2">
            <p className="font-mono text-[9px] tracking-[0.25em] uppercase text-red-500/50">
              Sistema de productividad
            </p>
            <h2 className="font-mono font-bold uppercase tracking-tight text-xl text-red-400">
              PRODUCTIVIDAD BLOQUEADA
            </h2>
          </div>

          {/* Deficit display */}
          <div
            className={cn(
              "text-center py-4 border border-red-500/20",
              "bg-red-950/20"
            )}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-red-400" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-red-400/60">
                Retraso actual
              </span>
            </div>
            <p className="font-mono text-4xl font-bold tabular-nums tracking-tight text-red-400">
              {deficit}h
            </p>
            <p className="font-mono text-xs text-red-400/50 mt-1">
              Llevas {deficit} horas de retraso
            </p>
          </div>

          {/* Instructions */}
          <div className="space-y-3">
            <p className="font-mono text-xs text-center text-gray-400 uppercase tracking-wide">
              Registra al menos {ENTRIES_TO_UNLOCK} entradas para desbloquear
            </p>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="w-full h-2 bg-red-950/50 border border-red-500/20 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-700"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] text-gray-500 tabular-nums">
                  {progress}/{ENTRIES_TO_UNLOCK} entradas para desbloquear
                </p>
                {progress > 0 && progress < ENTRIES_TO_UNLOCK && (
                  <p className="font-mono text-[10px] text-red-400 animate-pulse">
                    {ENTRIES_TO_UNLOCK - progress} MAS
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* CTA */}
          <Button
            onClick={onRegister}
            className={cn(
              "w-full font-mono text-sm uppercase tracking-wider",
              "bg-red-600 hover:bg-red-500 text-white",
              "h-12 border border-red-400/30",
              "transition-all duration-200",
              "shadow-lg shadow-red-900/50"
            )}
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Registrar ahora
          </Button>

          {/* Today's entry count */}
          <div className="text-center space-y-1">
            <p className="font-mono text-[10px] text-gray-600 uppercase tracking-wider">
              Entradas hoy: <span className="tabular-nums text-gray-400 font-bold">{todayEntryCount}</span>
            </p>
          </div>

          {/* Warning footer */}
          <div className="border-t border-red-500/10 pt-3">
            <p className="font-mono text-[9px] text-center text-red-500/30 uppercase tracking-wider leading-relaxed">
              No puedes cerrar esta pantalla.
              <br />
              La app permanece bloqueada hasta que registres.
            </p>
          </div>
        </div>

        {/* Bottom red pulse line */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
      </div>
    </div>
  );
}
