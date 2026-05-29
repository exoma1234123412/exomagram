"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Zap, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlotRewardProps {
  trigger: boolean;
  onComplete: (amount: number) => void;
}

type RewardTier = "none" | "small" | "medium" | "big" | "jackpot";

interface RewardResult {
  amount: number;
  tier: RewardTier;
}

// ---------------------------------------------------------------------------
// Reward Generation — Variable Ratio Reinforcement
// ---------------------------------------------------------------------------

function generateReward(): RewardResult {
  const roll = Math.random();

  // 1% — JACKPOT: 500 XP
  if (roll < 0.01) {
    return { amount: 500, tier: "jackpot" };
  }

  // 4% — big: 100-200 XP
  if (roll < 0.05) {
    return { amount: 100 + Math.floor(Math.random() * 101), tier: "big" };
  }

  // 10% — medium: 25-50 XP
  if (roll < 0.15) {
    return { amount: 25 + Math.floor(Math.random() * 26), tier: "medium" };
  }

  // 25% — small: 5-15 XP
  if (roll < 0.40) {
    return { amount: 5 + Math.floor(Math.random() * 11), tier: "small" };
  }

  // 60% — nothing
  return { amount: 0, tier: "none" };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_CONFIG: Record<
  Exclude<RewardTier, "none">,
  { label: string; color: string; borderColor: string; bgColor: string }
> = {
  small: {
    label: "BONUS",
    color: "text-primary",
    borderColor: "border-primary/40",
    bgColor: "bg-primary/5",
  },
  medium: {
    label: "GRAN BONUS",
    color: "text-amber-500",
    borderColor: "border-amber-500/40",
    bgColor: "bg-amber-500/5",
  },
  big: {
    label: "MEGA BONUS",
    color: "text-green-500",
    borderColor: "border-green-500/40",
    bgColor: "bg-green-500/5",
  },
  jackpot: {
    label: "JACKPOT",
    color: "text-yellow-400",
    borderColor: "border-yellow-500/60",
    bgColor: "bg-yellow-500/10",
  },
};

const SPIN_DIGITS = 3; // number of reel columns
const SPIN_TOTAL_TICKS = 35; // total animation ticks
const SPIN_INTERVAL_MS = 45; // ms between ticks

// How many ticks until each reel settles (staggered)
const REEL_SETTLE_TICKS = [14, 22, 30];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split a number into array of digit strings for the reels. */
function numberToReelDigits(n: number): string[] {
  const str = String(n);
  // Pad or truncate to SPIN_DIGITS
  if (str.length >= SPIN_DIGITS) {
    return str.slice(-SPIN_DIGITS).split("");
  }
  return str.padStart(SPIN_DIGITS, "0").split("");
}

function randomDigit(): string {
  return String(Math.floor(Math.random() * 10));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SlotReward({ trigger, onComplete }: SlotRewardProps) {
  const [phase, setPhase] = useState<"idle" | "spinning" | "result">("idle");
  const [reels, setReels] = useState<string[]>(
    Array(SPIN_DIGITS).fill("0"),
  );
  const [settled, setSettled] = useState<boolean[]>(
    Array(SPIN_DIGITS).fill(false),
  );
  const [result, setResult] = useState<RewardResult | null>(null);
  const [shaking, setShaking] = useState(false);

  const prevTrigger = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Stores the timestamp (ms) after which the slot is allowed to trigger again.
  // Set to Date.now() + 60_000 each time a trigger fires (reward or not).
  const cooldownEndRef = useRef<number>(0);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ---- Start spin when trigger flips to true ----
  const startSpin = useCallback(
    (reward: RewardResult) => {
      setResult(reward);

      // No reward -- skip animation entirely
      if (reward.tier === "none") {
        onComplete(0);
        return;
      }

      setPhase("spinning");
      setSettled(Array(SPIN_DIGITS).fill(false));

      const targetDigits = numberToReelDigits(reward.amount);
      let tick = 0;

      timerRef.current = setInterval(() => {
        tick++;

        // Update each reel: show random digits until settled
        setReels((prev) => {
          const next = [...prev];
          for (let i = 0; i < SPIN_DIGITS; i++) {
            if (tick >= REEL_SETTLE_TICKS[i]) {
              next[i] = targetDigits[i];
            } else {
              next[i] = randomDigit();
            }
          }
          return next;
        });

        // Mark reels as settled
        setSettled((prev) => {
          const next = [...prev];
          for (let i = 0; i < SPIN_DIGITS; i++) {
            if (tick >= REEL_SETTLE_TICKS[i]) next[i] = true;
          }
          return next;
        });

        // All done
        if (tick >= SPIN_TOTAL_TICKS) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          setPhase("result");

          // Screen shake for big/jackpot
          if (reward.tier === "big" || reward.tier === "jackpot") {
            setShaking(true);
            setTimeout(() => setShaking(false), 500);
          }
        }
      }, SPIN_INTERVAL_MS);
    },
    [onComplete],
  );

  useEffect(() => {
    if (trigger && !prevTrigger.current) {
      const now = Date.now();
      if (now < cooldownEndRef.current) {
        // Still in cooldown — skip animation entirely and report 0 XP.
        onComplete(0);
      } else {
        // Start the 60-second cooldown, then run the full slot experience.
        cooldownEndRef.current = now + 60_000;
        const reward = generateReward();
        startSpin(reward);
      }
    }
    prevTrigger.current = trigger;
  }, [trigger, startSpin, onComplete]);

  // ---- Dismiss ----
  function handleDismiss() {
    setPhase("idle");
    setShaking(false);
    if (result) onComplete(result.amount);
    setResult(null);
  }

  // ---- Auto-dismiss small rewards after 2.5s ----
  useEffect(() => {
    if (phase === "result" && result && result.tier === "small") {
      const timeout = setTimeout(handleDismiss, 2500);
      return () => clearTimeout(timeout);
    }
  }, [phase, result]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Nothing to show ----
  if (phase === "idle" || !result || result.tier === "none") return null;

  const isSmall = result.tier === "small";
  const isOverlay = result.tier === "medium" || result.tier === "big" || result.tier === "jackpot";
  const isJackpot = result.tier === "jackpot";
  const config = TIER_CONFIG[result.tier];

  // ---- Small: inline toast notification ----
  if (isSmall) {
    return (
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50",
          "border bg-card p-3 shadow-lg",
          "animate-slide-up-bounce",
          config.borderColor,
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className={cn("flex items-center justify-center w-8 h-8 border", config.borderColor, config.bgColor)}>
            <Zap className={cn("w-4 h-4", config.color)} />
          </div>
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {config.label}
            </p>
            <p className={cn("font-mono text-lg font-black tabular-nums tracking-tight", config.color)}>
              +{result.amount} XP
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Medium / Big / Jackpot: full overlay ----
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/40",
        shaking && "animate-danger-shake",
      )}
    >
      <div
        className={cn(
          "relative bg-card border shadow-2xl p-6 max-w-xs w-full mx-4",
          "transition-all duration-300",
          config.borderColor,
          isJackpot && phase === "result" && "animate-jackpot-glow",
        )}
      >
        {/* Close button */}
        {phase === "result" && (
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 w-6 h-6 border border-border bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}

        {/* Header label */}
        <div className="text-center mb-5">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Zap
              className={cn(
                "w-4 h-4",
                phase === "spinning"
                  ? "text-yellow-500 animate-pulse"
                  : config.color,
              )}
            />
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {phase === "spinning" ? "CALCULANDO BONUS..." : config.label}
            </span>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground tracking-wide">
            Registro detectado -- bonus aleatorio
          </p>
        </div>

        {/* Slot reels */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {reels.map((digit, i) => (
            <div
              key={i}
              className={cn(
                "w-16 h-20 border-2 flex items-center justify-center",
                "transition-all duration-200",
                settled[i]
                  ? cn(config.borderColor, config.bgColor, "animate-slot-settle")
                  : "border-muted bg-muted/20",
                isJackpot && phase === "result" && settled[i] && "border-yellow-500/60 bg-yellow-500/10",
              )}
            >
              <span
                className={cn(
                  "font-mono text-4xl font-black tabular-nums",
                  !settled[i] && "blur-[1px] text-muted-foreground",
                  settled[i] && config.color,
                  isJackpot && phase === "result" && "animate-streak-fire",
                )}
              >
                {digit}
              </span>
            </div>
          ))}
        </div>

        {/* Result display */}
        {phase === "result" && (
          <div className="text-center animate-number-roll">
            {isJackpot && (
              <>
                <p className="font-mono text-2xl font-black text-yellow-400 mb-1 animate-streak-fire">
                  +{result.amount} XP
                </p>
                <p className="font-mono text-[10px] text-yellow-500/80 uppercase tracking-[0.14em]">
                  Probabilidad: 1% -- Evento excepcional
                </p>
              </>
            )}
            {result.tier === "big" && (
              <>
                <p className={cn("font-mono text-xl font-black mb-1", config.color)}>
                  +{result.amount} XP
                </p>
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
                  Bonus significativo obtenido
                </p>
              </>
            )}
            {result.tier === "medium" && (
              <>
                <p className={cn("font-mono text-xl font-black mb-1", config.color)}>
                  +{result.amount} XP
                </p>
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
                  Sigue registrando para otro giro
                </p>
              </>
            )}
          </div>
        )}

        {/* CTA button */}
        {phase === "result" && (
          <button
            onClick={handleDismiss}
            className={cn(
              "w-full mt-5 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] transition-all border",
              isJackpot
                ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/20"
                : result.tier === "big"
                  ? "bg-green-500/10 border-green-500/40 text-green-500 hover:bg-green-500/20"
                  : "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20",
            )}
          >
            {isJackpot ? "Reclamar jackpot" : "Continuar"}
          </button>
        )}
      </div>
    </div>
  );
}
