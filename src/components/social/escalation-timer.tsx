"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getTodayMTY } from "@/lib/utils";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
// ESCALATION TIMER
// ═══════════════════════════════════════════════════════════════════════
//
// The threat of escalation. A countdown that creates urgency before
// it even fires.
//
// 1. Check if current user has logged in the last 2 hours during
//    work hours (7am-6pm, or profile work_start_hour/work_end_hour).
// 2. If NOT: start a 30-minute countdown.
// 3. Show a FIXED banner at top of screen with live ticking countdown.
// 4. The countdown escalates visually as it runs down:
//    - 30-20 min: amber, steady
//    - 20-10 min: orange, subtle pulse
//    - 10-5 min:  red, fast pulse
//    - 5-0 min:   dark red, aggressive pulse, text gets bigger
// 5. At 0:00: flash "ALERTA ENVIADA", fire a shame notification
//    to public_feed, then reset the cycle.
// 6. If user logs before countdown ends: "Salvado" flash, dismiss.
//
// The COUNTDOWN is the pressure. The threat > the punishment.
// ═══════════════════════════════════════════════════════════════════════

const ESCALATION_MINUTES = 30;
const ESCALATION_MS = ESCALATION_MINUTES * 60 * 1000;
const GAP_HOURS = 2; // how long without logging before countdown starts
const GAP_MS = GAP_HOURS * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60_000; // re-check every 1 minute
const SAVED_FLASH_MS = 3000; // "Salvado" flash duration
const FIRED_FLASH_MS = 4000; // "ALERTA ENVIADA" flash duration
const STORAGE_KEY = "escalation-timer-last-fired";
const FIRE_COOLDOWN_MS = GAP_MS; // don't fire again for 2 hours after firing

type EscalationPhase = "idle" | "countdown" | "saved" | "fired";

function getMTYHour(): number {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  );
  return now.getHours();
}

function getMTYDayOfWeek(): number {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  );
  return now.getDay(); // 0=Sun, 6=Sat
}

function isOnFireCooldown(): boolean {
  try {
    const last = localStorage.getItem(STORAGE_KEY);
    if (!last) return false;
    return Date.now() - parseInt(last, 10) < FIRE_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markFired(): void {
  try {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  } catch {
    // localStorage unavailable
  }
}

export function EscalationTimer() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  // User profile work hours
  const [workStart, setWorkStart] = useState(7);
  const [workEnd, setWorkEnd] = useState(18);
  const [userName, setUserName] = useState("");

  // Countdown state
  const [phase, setPhase] = useState<EscalationPhase>("idle");
  const [countdownEnd, setCountdownEnd] = useState<number | null>(null); // timestamp
  const [remaining, setRemaining] = useState(ESCALATION_MS); // ms remaining
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  // Refs
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFiredRef = useRef(false);

  // ── Load user profile work hours ──────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    async function loadProfile() {
      const { data } = await supabase
        .from("profiles")
        .select("work_start_hour, work_end_hour, full_name")
        .eq("id", userId)
        .single();
      if (data) {
        setWorkStart(data.work_start_hour ?? 7);
        setWorkEnd(data.work_end_hour ?? 18);
        setUserName(data.full_name ?? "");
      }
    }
    loadProfile();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Check if user is delinquent ───────────────────────────────────
  const checkDelinquency = useCallback(async (): Promise<boolean> => {
    if (!orgId || !userId) return false;

    // Only during work hours
    const currentHour = getMTYHour();
    if (currentHour < workStart || currentHour >= workEnd) return false;

    // Not on weekends
    const dayOfWeek = getMTYDayOfWeek();
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;

    // If we just fired, don't start again immediately
    if (isOnFireCooldown()) return false;

    const today = getTodayMTY();

    // Get user's most recent entry today
    const { data: entries } = await supabase
      .from("time_entries")
      .select("logged_at")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", today)
      .order("logged_at", { ascending: false })
      .limit(1);

    const now = Date.now();

    if (!entries || entries.length === 0) {
      // No entries today at all. Compare against work start time.
      const todayStart = new Date(`${today}T${String(workStart).padStart(2, "0")}:00:00-06:00`);
      const elapsed = now - todayStart.getTime();
      return elapsed >= GAP_MS;
    }

    // Has entries — check gap since last one
    const lastLogged = new Date(entries[0].logged_at).getTime();
    const gap = now - lastLogged;
    return gap >= GAP_MS;
  }, [orgId, userId, workStart, workEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fire the escalation (send to public_feed) ────────────────────
  const fireEscalation = useCallback(async () => {
    if (!orgId || !userId || hasFiredRef.current) return;
    hasFiredRef.current = true;

    const displayName = userName || "Alguien";

    // Insert shame entry into public_feed
    await supabase.from("public_feed").insert({
      org_id: orgId,
      type: "shame",
      title: "Alerta de inactividad",
      body: `${displayName} no registró por más de 2.5 horas. Alerta automática.`,
      target_user_id: userId,
      urgency: "critical",
      emoji: "🚨",
      is_ai_generated: true,
    });

    // Also insert a notification for the user
    await supabase.from("notifications").insert({
      user_id: userId,
      org_id: orgId,
      type: "flag_raised",
      title: "Alerta de escalación enviada",
      body: "Tu equipo fue notificado de tu inactividad.",
      read: false,
    });

    markFired();

    // Show "ALERTA ENVIADA" flash
    setPhase("fired");

    // After flash, reset to idle and start a new watch cycle
    flashTimeoutRef.current = setTimeout(() => {
      setPhase("idle");
      setCountdownEnd(null);
      hasFiredRef.current = false;
    }, FIRED_FLASH_MS);
  }, [orgId, userId, userName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Main check loop ───────────────────────────────────────────────
  useEffect(() => {
    if (!orgId || !userId) return;

    async function check() {
      // Don't interrupt active countdown or flash states
      if (phase === "countdown" || phase === "saved" || phase === "fired") return;

      const isDelinquent = await checkDelinquency();

      if (isDelinquent) {
        // Start the countdown
        const end = Date.now() + ESCALATION_MS;
        setCountdownEnd(end);
        setRemaining(ESCALATION_MS);
        setPhase("countdown");
        hasFiredRef.current = false;
      }
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [orgId, userId, phase, checkDelinquency]);

  // ── Tick the countdown every second ───────────────────────────────
  useEffect(() => {
    if (phase !== "countdown" || !countdownEnd) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }

    tickRef.current = setInterval(() => {
      const now = Date.now();
      const left = Math.max(0, countdownEnd - now);
      setRemaining(left);

      if (left <= 0) {
        // Countdown reached zero — FIRE
        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = null;
        fireEscalation();
      }
    }, 1000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [phase, countdownEnd, fireEscalation]);

  // ── Real-time: listen for current user logging an entry ───────────
  useEffect(() => {
    if (!orgId || !userId) return;

    const channel = supabase
      .channel("escalation_timer_rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          // Check if it's the current user's entry
          if ((payload.new as { user_id: string }).user_id === userId) {
            if (phase === "countdown") {
              // User logged in time — SAVED
              if (tickRef.current) clearInterval(tickRef.current);
              tickRef.current = null;

              setPhase("saved");

              flashTimeoutRef.current = setTimeout(() => {
                setPhase("idle");
                setCountdownEnd(null);
              }, SAVED_FLASH_MS);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, userId, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  // ── Handle log dialog ────────────────────────────────────────────
  function handleLogDialogChange(open: boolean) {
    setLogDialogOpen(open);
    if (!open && phase === "countdown") {
      // After closing dialog, check if the countdown should dismiss
      // The real-time listener handles this, but we also do a manual check
      setTimeout(async () => {
        const stillDelinquent = await checkDelinquency();
        if (!stillDelinquent && phase === "countdown") {
          if (tickRef.current) clearInterval(tickRef.current);
          tickRef.current = null;
          setPhase("saved");
          flashTimeoutRef.current = setTimeout(() => {
            setPhase("idle");
            setCountdownEnd(null);
          }, SAVED_FLASH_MS);
        }
      }, 1500);
    }
  }

  // ── Render nothing if idle ────────────────────────────────────────
  if (phase === "idle") {
    return <LogEntryDialog open={logDialogOpen} onOpenChange={handleLogDialogChange} />;
  }

  // ── Format remaining time ─────────────────────────────────────────
  const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // ── Determine escalation level ────────────────────────────────────
  const minutesLeft = remaining / 60_000;
  const escalationLevel =
    minutesLeft > 20 ? 0 :
    minutesLeft > 10 ? 1 :
    minutesLeft > 5 ? 2 : 3;

  // ── Visual config per escalation level ────────────────────────────
  const levelConfig = [
    // Level 0: 30-20 min — amber, steady
    {
      borderColor: "border-amber-500/60",
      bgColor: "bg-amber-500/5",
      textColor: "text-amber-600 dark:text-amber-400",
      iconColor: "text-amber-500",
      timeSize: "text-lg",
      pulseClass: "",
      borderWidth: "border",
    },
    // Level 1: 20-10 min — orange, subtle pulse
    {
      borderColor: "border-orange-500/70",
      bgColor: "bg-orange-500/5",
      textColor: "text-orange-600 dark:text-orange-400",
      iconColor: "text-orange-500",
      timeSize: "text-xl",
      pulseClass: "animate-pulse",
      borderWidth: "border",
    },
    // Level 2: 10-5 min — red, fast pulse
    {
      borderColor: "border-red-500/80",
      bgColor: "bg-red-500/5",
      textColor: "text-red-600 dark:text-red-400",
      iconColor: "text-red-500",
      timeSize: "text-2xl",
      pulseClass: "escalation-pulse-fast",
      borderWidth: "border-2",
    },
    // Level 3: 5-0 min — dark red, aggressive pulse, bigger text
    {
      borderColor: "border-red-700/90",
      bgColor: "bg-red-500/10",
      textColor: "text-red-700 dark:text-red-300",
      iconColor: "text-red-600",
      timeSize: "text-3xl",
      pulseClass: "escalation-pulse-aggressive",
      borderWidth: "border-2",
    },
  ];

  // ── "SAVED" flash ─────────────────────────────────────────────────
  if (phase === "saved") {
    return (
      <>
        <div
          className={cn(
            "fixed top-0 left-0 right-0 z-[65] md:left-56",
            "border-b border-emerald-500/60 bg-emerald-500/10",
            "px-4 py-3",
            "flex items-center justify-center gap-3",
            "font-mono animate-in fade-in slide-in-from-top-2 duration-300"
          )}
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <span className="text-sm font-bold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400">
            Salvado
          </span>
        </div>
        <LogEntryDialog open={logDialogOpen} onOpenChange={handleLogDialogChange} />
      </>
    );
  }

  // ── "ALERTA ENVIADA" flash ────────────────────────────────────────
  if (phase === "fired") {
    return (
      <>
        <div
          className={cn(
            "fixed top-0 left-0 right-0 z-[65] md:left-56",
            "border-b-2 border-red-700/90 bg-red-500/15",
            "px-4 py-4",
            "flex items-center justify-center gap-3",
            "font-mono escalation-pulse-aggressive"
          )}
        >
          <ShieldAlert className="w-6 h-6 text-red-600" />
          <span className="text-xl font-bold uppercase tracking-[0.15em] text-red-700 dark:text-red-300">
            Alerta enviada
          </span>
          <ShieldAlert className="w-6 h-6 text-red-600" />
        </div>
        <LogEntryDialog open={logDialogOpen} onOpenChange={handleLogDialogChange} />
      </>
    );
  }

  // ── Active countdown banner ───────────────────────────────────────
  const config = levelConfig[escalationLevel];

  return (
    <>
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-[65] md:left-56",
          config.borderWidth, "border-t-0 border-l-0 border-r-0",
          config.borderColor,
          config.bgColor,
          config.pulseClass,
          "px-4 py-2.5",
          "font-mono transition-all duration-500"
        )}
      >
        {/* Bottom border line that pulses on higher levels */}
        {escalationLevel >= 2 && (
          <div className={cn(
            "absolute bottom-0 left-0 right-0 h-px",
            escalationLevel === 3
              ? "bg-red-600/80 shadow-[0_0_8px] shadow-red-600/40"
              : "bg-red-500/50"
          )} />
        )}

        <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
          {/* Left: icon + message */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <AlertTriangle className={cn(
              "shrink-0",
              config.iconColor,
              escalationLevel >= 2 ? "w-5 h-5" : "w-4 h-4",
              escalationLevel >= 1 && "animate-pulse"
            )} />

            <span className={cn(
              "text-[11px] uppercase tracking-wide leading-tight",
              config.textColor,
              escalationLevel >= 3 && "text-xs font-bold"
            )}>
              {escalationLevel < 2
                ? "Si no registras, se enviará una alerta al equipo completo con tu nombre"
                : escalationLevel < 3
                ? "Alerta al equipo en minutos — registra ahora"
                : "ALERTA INMINENTE — REGISTRA AHORA"
              }
            </span>
          </div>

          {/* Center: countdown */}
          <div className={cn(
            "shrink-0 font-mono font-bold tabular-nums tracking-tight",
            config.textColor,
            config.timeSize,
            escalationLevel >= 3 && "scale-110"
          )}>
            {timeStr}
          </div>

          {/* Right: action button */}
          <button
            onClick={() => setLogDialogOpen(true)}
            className={cn(
              "shrink-0 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em]",
              "border transition-all duration-200",
              escalationLevel < 2
                ? "border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                : "border-red-500/50 text-red-700 dark:text-red-300 hover:bg-red-500/10",
              escalationLevel >= 3 && "border-red-600 bg-red-500/10"
            )}
          >
            Registrar
          </button>
        </div>
      </div>

      <LogEntryDialog open={logDialogOpen} onOpenChange={handleLogDialogChange} />
    </>
  );
}
