"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════
// MOMENTUM KILLER
// ═══════════════════════════════════════════════════════════════════
//
// Full-screen flash that fires on EVERYONE'S screen when one person
// kills team momentum.
//
// How it works:
//   1. Subscribe to real-time time_entries changes for the org.
//   2. Every 5 minutes, evaluate team velocity:
//      - Count entries per member in the last 60 minutes.
//      - If the team had consistent velocity (3+ entries/hour) but
//        it dropped to <1, identify who stopped logging (had entries
//        before but none in the last hour).
//   3. Show a 4-second full-screen flash on everyone's screen.
//      - Everyone ELSE sees the culprit's name.
//      - The CULPRIT sees a more aggressive personal message.
//   4. One fire per person per hour (tracked in state).
//   5. Only during work hours (9-19 MTY time).
//
// ═══════════════════════════════════════════════════════════════════

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const FLASH_DURATION_MS = 4000; // 4 seconds total
const COOLDOWN_PER_PERSON_MS = 60 * 60 * 1000; // 1 hour
const WORK_HOUR_START = 9;
const WORK_HOUR_END = 19;

interface FlashState {
  culpritName: string;
  culpritUserId: string;
  previousVelocity: number;
  isYou: boolean;
}

function getMTYHour(): number {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  ).getHours();
}

function isWorkHours(): boolean {
  const hour = getMTYHour();
  return hour >= WORK_HOUR_START && hour < WORK_HOUR_END;
}

export function MomentumKiller() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [flash, setFlash] = useState<FlashState | null>(null);
  const [visible, setVisible] = useState(false);

  // Track previous velocity to detect drops
  const prevVelocityRef = useRef<number>(0);
  // Track per-person cooldown: userId -> last fired timestamp
  const cooldownMapRef = useRef<Map<string, number>>(new Map());
  // Track member names
  const memberNamesRef = useRef<Map<string, string>>(new Map());
  // Previous per-member entry counts (in the hour before the last check)
  const prevMemberEntriesRef = useRef<Map<string, number>>(new Map());

  // ---- Fetch org member names once ----
  useEffect(() => {
    if (!orgId) return;

    async function loadMembers() {
      const { data } = await supabase
        .from("org_members")
        .select("user_id, profiles(full_name)")
        .eq("org_id", orgId!);

      if (data) {
        const names = new Map<string, string>();
        for (const m of data) {
          const profile = m.profiles as unknown as { full_name: string | null };
          names.set(m.user_id, profile?.full_name?.split(" ")[0] ?? "Desconocido");
        }
        memberNamesRef.current = names;
      }
    }

    loadMembers();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Core velocity check ----
  const checkVelocity = useCallback(async () => {
    if (!orgId || !userId) return;
    if (!isWorkHours()) return;

    const today = getTodayMTY();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    // Fetch entries from last 2 hours for comparison window
    const { data: recentEntries } = await supabase
      .from("time_entries")
      .select("user_id, logged_at")
      .eq("org_id", orgId)
      .eq("date", today)
      .gte("logged_at", twoHoursAgo)
      .order("logged_at", { ascending: false });

    if (!recentEntries || recentEntries.length === 0) {
      prevVelocityRef.current = 0;
      prevMemberEntriesRef.current = new Map();
      return;
    }

    // Split into "previous hour" (2h ago to 1h ago) and "current hour" (last 1h)
    const previousHourEntries = recentEntries.filter(
      (e) => e.logged_at >= twoHoursAgo && e.logged_at < oneHourAgo
    );
    const currentHourEntries = recentEntries.filter(
      (e) => e.logged_at >= oneHourAgo
    );

    // Count per-member entries in each window
    const prevMemberCounts = new Map<string, number>();
    for (const e of previousHourEntries) {
      prevMemberCounts.set(e.user_id, (prevMemberCounts.get(e.user_id) ?? 0) + 1);
    }

    const currMemberCounts = new Map<string, number>();
    for (const e of currentHourEntries) {
      currMemberCounts.set(e.user_id, (currMemberCounts.get(e.user_id) ?? 0) + 1);
    }

    // Team velocity = total entries in that hour
    const previousVelocity = previousHourEntries.length;
    const currentVelocity = currentHourEntries.length;

    // Detect momentum drop:
    // Previous hour had 3+ entries (consistent velocity)
    // Current hour dropped to <1
    if (previousVelocity >= 3 && currentVelocity < 1) {
      // Find who stopped: had entries in previous hour but NOT in current hour
      const culprits: string[] = [];
      for (const [memberId] of prevMemberCounts) {
        const currentCount = currMemberCounts.get(memberId) ?? 0;
        if (currentCount === 0) {
          culprits.push(memberId);
        }
      }

      if (culprits.length > 0) {
        // Pick the culprit with the most entries in the previous hour
        // (biggest contributor that dropped off = biggest momentum loss)
        const sorted = culprits.sort(
          (a, b) => (prevMemberCounts.get(b) ?? 0) - (prevMemberCounts.get(a) ?? 0)
        );
        const topCulprit = sorted[0];

        // Check per-person cooldown
        const lastFired = cooldownMapRef.current.get(topCulprit);
        if (lastFired && Date.now() - lastFired < COOLDOWN_PER_PERSON_MS) {
          // On cooldown, skip
          prevVelocityRef.current = currentVelocity;
          prevMemberEntriesRef.current = currMemberCounts;
          return;
        }

        // Fire the flash
        const culpritName =
          memberNamesRef.current.get(topCulprit) ?? "Alguien";
        const isYou = topCulprit === userId;

        cooldownMapRef.current.set(topCulprit, Date.now());

        setFlash({
          culpritName,
          culpritUserId: topCulprit,
          previousVelocity,
          isYou,
        });
        setVisible(true);
      }
    }

    prevVelocityRef.current = currentVelocity;
    prevMemberEntriesRef.current = currMemberCounts;
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Auto-clear flash after 4 seconds ----
  useEffect(() => {
    if (!visible) return;

    const timeout = setTimeout(() => {
      setVisible(false);
      // Clear flash state after fade-out completes
      setTimeout(() => setFlash(null), 600);
    }, FLASH_DURATION_MS);

    return () => clearTimeout(timeout);
  }, [visible]);

  // ---- Polling: check every 5 minutes ----
  useEffect(() => {
    if (!orgId || !userId) return;

    // Initial check after a short delay
    const initialTimeout = setTimeout(checkVelocity, 5000);
    const interval = setInterval(checkVelocity, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [orgId, userId, checkVelocity]);

  // ---- Real-time subscription: re-evaluate on new entries ----
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("momentum_killer_rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          // Don't check immediately on every insert — that would be noisy.
          // The 5-minute interval handles it. But if velocity was previously
          // high, a new entry might restore it, so we re-check to be accurate.
          checkVelocity();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, checkVelocity]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Nothing to render ----
  if (!flash) return null;

  // ---- Full-screen flash overlay ----
  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] pointer-events-none",
        "flex items-center justify-center",
        "transition-opacity duration-500",
        visible ? "opacity-100" : "opacity-0"
      )}
      style={{
        animation: visible
          ? "momentum-flash 4s ease-in-out forwards"
          : undefined,
      }}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0",
          flash.isYou
            ? "bg-red-950/85"
            : "bg-black/80"
        )}
      />

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-2xl mx-auto space-y-6">
        {flash.isYou ? (
          <>
            {/* ---- MESSAGE FOR THE CULPRIT ---- */}
            <div className="space-y-4">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-400/60">
                Alerta personal
              </p>

              <h1 className="font-mono font-bold uppercase tracking-tight text-3xl sm:text-4xl md:text-5xl text-red-400 leading-tight">
                EL EQUIPO PERDIO MOMENTUM
                <br />
                POR TU INACTIVIDAD
              </h1>

              <div className="flex items-center justify-center gap-3">
                <div
                  className={cn(
                    "px-4 py-2 border border-red-500/40",
                    "font-mono text-sm uppercase tracking-wide",
                    "text-red-300 bg-red-500/10"
                  )}
                >
                  <span className="font-mono tabular-nums tracking-tight">
                    {flash.previousVelocity}
                  </span>
                  <span className="mx-2 text-red-500/60">{"->"}</span>
                  <span className="font-mono tabular-nums tracking-tight font-bold">
                    0
                  </span>
                  <span className="ml-2 text-red-400/60 text-xs">
                    entradas/hora
                  </span>
                </div>
              </div>

              <p className="font-mono text-xs text-red-400/50 uppercase tracking-wider">
                Registra algo. Ahora.
              </p>
            </div>
          </>
        ) : (
          <>
            {/* ---- MESSAGE FOR EVERYONE ELSE ---- */}
            <div className="space-y-4">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-amber-400/60">
                Alerta de equipo
              </p>

              <h1 className="font-mono font-bold uppercase tracking-tight text-3xl sm:text-4xl md:text-5xl text-amber-400 leading-tight">
                MOMENTUM PERDIDO
              </h1>

              <div className="space-y-2">
                <p className="font-mono text-lg sm:text-xl text-white/90 uppercase tracking-wide">
                  <span className="font-bold text-amber-300 underline decoration-amber-500/40 decoration-2 underline-offset-4">
                    {flash.culpritName}
                  </span>
                  {" "}dejo de registrar
                </p>

                <div className="flex items-center justify-center gap-3">
                  <div
                    className={cn(
                      "px-4 py-2 border border-amber-500/30",
                      "font-mono text-sm uppercase tracking-wide",
                      "text-amber-200 bg-amber-500/10"
                    )}
                  >
                    <span className="text-amber-300/60 text-xs mr-2">
                      Velocidad del equipo:
                    </span>
                    <span className="font-mono tabular-nums tracking-tight">
                      {flash.previousVelocity}
                    </span>
                    <span className="mx-2 text-amber-500/60">{"->"}</span>
                    <span className="font-mono tabular-nums tracking-tight font-bold">
                      0
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* CSS keyframe animation: fade in, hold, fade out */}
      <style jsx>{`
        @keyframes momentum-flash {
          0% {
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          75% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
