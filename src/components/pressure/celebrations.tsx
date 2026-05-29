"use client";

// ═══════════════════════════════════════════════════════════════════════════
// POSITIVE REINFORCEMENT: Celebration System
// ═══════════════════════════════════════════════════════════════════════════
//
// The REWARD side of the psychological pressure architecture.
//
// Dopamine design principle: make achievements feel INCREDIBLE so
// the contrast with failure (shame ticker, ghost detector, etc.) feels worse.
//
// Every celebration is designed to:
// 1. Trigger a dopamine spike (surprise + color + motion)
// 2. Create a positive memory anchor tied to the behavior
// 3. Make the user crave the next celebration
// 4. Make the ABSENCE of celebration (a bad day) feel like withdrawal
//
// The asymmetry is intentional: celebrations are brief, intense, and rare.
// The pressure systems are ambient, persistent, and inescapable.
// This ratio maximizes behavioral compliance.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────

type CelebrationType =
  | "day_complete"
  | "proof_100"
  | "streak_milestone"
  | "first_to_complete"
  | "title_promotion"
  | "buddy_duo_complete";

interface CelebrationEvent {
  type: CelebrationType;
  payload: Record<string, unknown>;
  id: string;
  triggeredAt: number;
}

type TitleTier = "S" | "A" | "B" | "C" | "D" | "F";

interface CelebrationContextValue {
  trigger: (type: CelebrationType, payload?: Record<string, unknown>) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 60 * 60 * 1000; // 1 hour between same celebration type
const CELEBRATION_DURATION_MS = 4000;
const SESSION_KEY = "exo_celebrations_seen";
const DEBOUNCE_KEY = "exo_celebrations_debounce";

const CONFETTI_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#06b6d4", // cyan
  "#f97316", // orange
];

const TIER_COLORS: Record<TitleTier, string> = {
  S: "#f59e0b",
  A: "#10b981",
  B: "#3b82f6",
  C: "#eab308",
  D: "#f97316",
  F: "#ef4444",
};

const TIER_LABELS: Record<TitleTier, string> = {
  S: "Elite",
  A: "De Confianza",
  B: "Consistente",
  C: "En Desarrollo",
  D: "En Observación",
  F: "En Riesgo",
};

// ─── Context ──────────────────────────────────────────────────────────────

const CelebrationContext = createContext<CelebrationContextValue>({
  trigger: () => {},
});

export function useCelebration() {
  return useContext(CelebrationContext);
}

// ─── Debounce & Session helpers ───────────────────────────────────────────

function getDebounceMap(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(DEBOUNCE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setDebounceTimestamp(type: CelebrationType) {
  try {
    const map = getDebounceMap();
    map[type] = Date.now();
    sessionStorage.setItem(DEBOUNCE_KEY, JSON.stringify(map));
  } catch {
    // sessionStorage unavailable — silently ignore
  }
}

function canTrigger(type: CelebrationType): boolean {
  const map = getDebounceMap();
  const last = map[type];
  if (!last) return true;
  return Date.now() - last > DEBOUNCE_MS;
}

function getSeenSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markSeen(id: string) {
  try {
    const seen = getSeenSet();
    seen.add(id);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...seen]));
  } catch {
    // ignore
  }
}

function wasSeen(id: string): boolean {
  return getSeenSet().has(id);
}

// ─── Generate unique celebration ID for dedup ─────────────────────────────

function celebrationId(type: CelebrationType, date: string): string {
  return `${type}_${date}`;
}

// ─── CSS Keyframes (injected once) ────────────────────────────────────────

const KEYFRAMES_CSS = `
@keyframes exo-confetti-burst {
  0% {
    transform: translate(0, 0) rotate(0deg) scale(1);
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  100% {
    transform: translate(var(--exo-tx), var(--exo-ty)) rotate(var(--exo-rot)) scale(0.3);
    opacity: 0;
  }
}

@keyframes exo-scale-bounce {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
  70% {
    transform: scale(0.95);
  }
  85% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes exo-fade-out {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes exo-pulse-ring {
  0% {
    transform: scale(0.8);
    opacity: 0.8;
    box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.6);
  }
  50% {
    transform: scale(1);
    box-shadow: 0 0 0 20px rgba(251, 191, 36, 0);
  }
  100% {
    transform: scale(0.8);
    opacity: 0.8;
    box-shadow: 0 0 0 0 rgba(251, 191, 36, 0);
  }
}

@keyframes exo-golden-glow {
  0% {
    box-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
  }
  50% {
    box-shadow: 0 0 60px rgba(251, 191, 36, 0.7), 0 0 100px rgba(251, 191, 36, 0.3);
  }
  100% {
    box-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
  }
}

@keyframes exo-slide-in-left {
  0% {
    transform: translateX(-200px);
    opacity: 0;
  }
  100% {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes exo-slide-in-right {
  0% {
    transform: translateX(200px);
    opacity: 0;
  }
  100% {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes exo-slide-in-bottom {
  0% {
    transform: translateY(40px);
    opacity: 0;
  }
  60% {
    transform: translateY(-8px);
    opacity: 1;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes exo-fall-emoji {
  0% {
    transform: translateY(-60px) rotate(0deg);
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    transform: translateY(calc(100vh + 60px)) rotate(var(--exo-rot));
    opacity: 0;
  }
}

@keyframes exo-crown-drop {
  0% {
    transform: translateY(-120px) scale(0.5);
    opacity: 0;
  }
  60% {
    transform: translateY(10px) scale(1.1);
    opacity: 1;
  }
  75% {
    transform: translateY(-8px) scale(0.95);
  }
  90% {
    transform: translateY(4px) scale(1.02);
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

@keyframes exo-shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@keyframes exo-star-burst {
  0% {
    transform: scale(0) rotate(0deg);
    opacity: 1;
  }
  50% {
    transform: scale(1.5) rotate(180deg);
    opacity: 0.8;
  }
  100% {
    transform: scale(2) rotate(360deg);
    opacity: 0;
  }
}

@keyframes exo-count-pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes exo-arrow-slide {
  0% {
    transform: translateX(-20px);
    opacity: 0;
  }
  100% {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes exo-high-five {
  0% {
    transform: translateX(var(--exo-start-x));
  }
  70% {
    transform: translateX(var(--exo-end-x));
  }
  80% {
    transform: translateX(calc(var(--exo-end-x) + var(--exo-bounce)));
  }
  100% {
    transform: translateX(var(--exo-end-x));
  }
}

@keyframes exo-particle-ring {
  0% {
    transform: rotate(0deg) translateX(40px) scale(1);
    opacity: 1;
  }
  100% {
    transform: rotate(360deg) translateX(80px) scale(0);
    opacity: 0;
  }
}
`;

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-exo-celebrations", "true");
  style.textContent = KEYFRAMES_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}

// ─── Particle / Confetti generators ───────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function ConfettiParticles({ count = 25, colors = CONFETTI_COLORS }: { count?: number; colors?: string[] }) {
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = randomBetween(0, 360);
    const distance = randomBetween(100, 350);
    const tx = Math.cos((angle * Math.PI) / 180) * distance;
    const ty = Math.sin((angle * Math.PI) / 180) * distance - randomBetween(50, 150);
    const rot = randomBetween(-720, 720);
    const size = randomBetween(6, 14);
    const color = colors[i % colors.length];
    const isCircle = Math.random() > 0.5;
    const delay = randomBetween(0, 0.15);
    const duration = randomBetween(0.8, 1.4);

    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: "50%",
          top: "40%",
          width: size,
          height: size,
          backgroundColor: color,
          borderRadius: isCircle ? "50%" : "2px",
          // @ts-expect-error CSS custom properties
          "--exo-tx": `${tx}px`,
          "--exo-ty": `${ty}px`,
          "--exo-rot": `${rot}deg`,
          animation: `exo-confetti-burst ${duration}s ${delay}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
          opacity: 0,
          animationFillMode: "forwards",
        }}
      />
    );
  });

  return <>{particles}</>;
}

function FallingEmojis({ emoji, count = 15 }: { emoji: string; count?: number }) {
  const items = Array.from({ length: count }, (_, i) => {
    const left = randomBetween(5, 95);
    const delay = randomBetween(0, 1.5);
    const duration = randomBetween(2, 3.5);
    const rot = randomBetween(-360, 360);
    const size = randomBetween(20, 36);

    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: `${left}%`,
          top: 0,
          fontSize: size,
          // @ts-expect-error CSS custom property
          "--exo-rot": `${rot}deg`,
          animation: `exo-fall-emoji ${duration}s ${delay}s ease-in forwards`,
          opacity: 0,
          animationFillMode: "forwards",
        }}
      >
        {emoji}
      </div>
    );
  });

  return <>{items}</>;
}

function ParticleRing({ count = 12, color = "#f59e0b" }: { count?: number; color?: string }) {
  const items = Array.from({ length: count }, (_, i) => {
    const angle = (360 / count) * i;
    const delay = (i / count) * 0.5;

    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: "50%",
          top: "40%",
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: color,
          transformOrigin: "center",
          transform: `rotate(${angle}deg) translateX(40px)`,
          animation: `exo-particle-ring 1.5s ${delay}s ease-out forwards`,
          opacity: 0,
          animationFillMode: "forwards",
        }}
      />
    );
  });

  return <>{items}</>;
}

// ─── Individual celebration renderers ─────────────────────────────────────

function DayCompleteCelebration() {
  return (
    <>
      <ConfettiParticles count={28} />

      {/* Pulsing ring — visual "ding" */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "40%",
          transform: "translate(-50%, -50%)",
          width: 80,
          height: 80,
          borderRadius: "50%",
          border: "3px solid #fbbf24",
          animation: "exo-pulse-ring 0.8s ease-out 3",
        }}
      />

      {/* Main text */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "40%",
          transform: "translate(-50%, -50%)",
          animation: "exo-scale-bounce 0.7s 0.1s cubic-bezier(0.34, 1.56, 0.64, 1) both",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 48,
            marginBottom: 8,
          }}
        >
          🏆
        </div>
        <div
          className="font-bold tracking-tight"
          style={{
            fontSize: 28,
            background: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #f59e0b 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "none",
            filter: "drop-shadow(0 2px 8px rgba(245, 158, 11, 0.4))",
          }}
        >
          DÍA COMPLETO
        </div>
        <div
          className="text-muted-foreground font-medium"
          style={{
            fontSize: 14,
            marginTop: 4,
            animation: "exo-slide-in-bottom 0.5s 0.5s ease-out both",
          }}
        >
          {EXPECTED_DAILY_HOURS}h registradas con éxito
        </div>
      </div>
    </>
  );
}

function Proof100Celebration() {
  return (
    <>
      {/* Viewport shimmer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(251, 191, 36, 0.06) 25%, rgba(251, 191, 36, 0.12) 50%, rgba(251, 191, 36, 0.06) 75%, transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "exo-shimmer 1.5s 0.3s ease-in-out both",
        }}
      />

      {/* Shield with golden glow */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "40%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            animation:
              "exo-scale-bounce 0.7s 0.1s cubic-bezier(0.34, 1.56, 0.64, 1) both, exo-golden-glow 1.5s 0.5s ease-in-out 2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 48,
          }}
        >
          🛡️
        </div>
        <div
          className="font-bold tracking-tight"
          style={{
            fontSize: 26,
            marginTop: 12,
            animation: "exo-slide-in-bottom 0.5s 0.4s ease-out both",
            background: "linear-gradient(135deg, #10b981 0%, #34d399 50%, #10b981 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 2px 8px rgba(16, 185, 129, 0.4))",
          }}
        >
          100% EVIDENCIA
        </div>
        <div
          className="text-muted-foreground font-medium"
          style={{
            fontSize: 13,
            marginTop: 4,
            animation: "exo-slide-in-bottom 0.5s 0.6s ease-out both",
          }}
        >
          Todas las entradas con pruebas
        </div>
      </div>
    </>
  );
}

function StreakMilestoneCelebration({ days }: { days: number }) {
  const [displayCount, setDisplayCount] = useState(0);
  const isEpic = days >= 30;

  useEffect(() => {
    // Rapid count-up from 0 to days
    const step = Math.max(1, Math.floor(days / 30));
    const interval = setInterval(() => {
      setDisplayCount((prev) => {
        const next = prev + step;
        if (next >= days) {
          clearInterval(interval);
          return days;
        }
        return next;
      });
    }, 40);
    return () => clearInterval(interval);
  }, [days]);

  return (
    <>
      <FallingEmojis emoji="🔥" count={days >= 30 ? 20 : 12} />

      {isEpic && <ParticleRing count={16} color="#f97316" />}

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "40%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          zIndex: 2,
        }}
      >
        <div
          className="font-black tabular-nums"
          style={{
            fontSize: 56,
            animation: "exo-scale-bounce 0.7s 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both",
            background: "linear-gradient(135deg, #f97316 0%, #ef4444 50%, #f97316 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 2px 12px rgba(249, 115, 22, 0.5))",
          }}
        >
          {displayCount}
        </div>
        <div
          className="font-bold tracking-tight"
          style={{
            fontSize: 22,
            marginTop: -4,
            animation: "exo-slide-in-bottom 0.5s 0.5s ease-out both",
            background: "linear-gradient(135deg, #f97316 0%, #fbbf24 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          RACHA DE {days} DÍAS 🔥
        </div>
        {isEpic && (
          <div
            className="text-muted-foreground font-medium"
            style={{
              fontSize: 13,
              marginTop: 6,
              animation: "exo-slide-in-bottom 0.5s 0.7s ease-out both",
            }}
          >
            Nivel legendario alcanzado
          </div>
        )}
      </div>
    </>
  );
}

function FirstToCompleteCelebration() {
  return (
    <>
      {/* Star burst particles behind crown */}
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (360 / 8) * i;
        const tx = Math.cos((angle * Math.PI) / 180) * 100;
        const ty = Math.sin((angle * Math.PI) / 180) * 100;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "35%",
              width: 8,
              height: 8,
              backgroundColor: "#fbbf24",
              borderRadius: "50%",
              // @ts-expect-error CSS custom properties
              "--exo-tx": `${tx}px`,
              "--exo-ty": `${ty}px`,
              "--exo-rot": `${randomBetween(-360, 360)}deg`,
              animation: `exo-confetti-burst 1s ${i * 0.05}s ease-out forwards`,
              opacity: 0,
            }}
          />
        );
      })}

      {/* Crown */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "35%",
          transform: "translate(-50%, -50%)",
          fontSize: 60,
          animation: "exo-crown-drop 0.9s 0.1s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}
      >
        👑
      </div>

      {/* Text */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "52%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}
      >
        <div
          className="font-bold tracking-tight"
          style={{
            fontSize: 24,
            animation: "exo-slide-in-bottom 0.5s 0.6s ease-out both",
            background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 2px 8px rgba(251, 191, 36, 0.5))",
          }}
        >
          PRIMERO EN TERMINAR 👑
        </div>
        <div
          className="text-muted-foreground font-medium"
          style={{
            fontSize: 13,
            marginTop: 4,
            animation: "exo-slide-in-bottom 0.5s 0.8s ease-out both",
          }}
        >
          Nadie más ha completado hoy
        </div>
      </div>
    </>
  );
}

function TitlePromotionCelebration({
  oldTier,
  newTier,
}: {
  oldTier: TitleTier;
  newTier: TitleTier;
}) {
  const newColor = TIER_COLORS[newTier] ?? "#3b82f6";
  const tierColors = Array.from({ length: 25 }, (_, i) =>
    i % 2 === 0 ? newColor : "#fbbf24"
  );

  return (
    <>
      <ConfettiParticles count={25} colors={tierColors} />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "38%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}
      >
        {/* Old tier → arrow → new tier */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            marginBottom: 16,
            animation: "exo-scale-bounce 0.7s 0.1s cubic-bezier(0.34, 1.56, 0.64, 1) both",
          }}
        >
          {/* Old tier */}
          <div
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              backgroundColor: "rgba(100, 100, 100, 0.2)",
              border: `2px solid ${TIER_COLORS[oldTier] ?? "#666"}`,
              color: TIER_COLORS[oldTier] ?? "#666",
              fontSize: 18,
              fontWeight: 700,
              opacity: 0.6,
              textDecoration: "line-through",
            }}
          >
            {oldTier} — {TIER_LABELS[oldTier] ?? oldTier}
          </div>

          {/* Arrow */}
          <div
            style={{
              fontSize: 28,
              animation: "exo-arrow-slide 0.4s 0.5s ease-out both",
            }}
          >
            →
          </div>

          {/* New tier */}
          <div
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              backgroundColor: `${newColor}22`,
              border: `2px solid ${newColor}`,
              color: newColor,
              fontSize: 18,
              fontWeight: 700,
              animation: "exo-scale-bounce 0.5s 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both",
            }}
          >
            {newTier} — {TIER_LABELS[newTier] ?? newTier}
          </div>
        </div>

        {/* Banner */}
        <div
          className="font-bold tracking-tight"
          style={{
            fontSize: 24,
            animation: "exo-slide-in-bottom 0.5s 0.9s ease-out both",
            color: newColor,
            filter: `drop-shadow(0 2px 8px ${newColor}66)`,
          }}
        >
          ASCENDIDO: {TIER_LABELS[newTier] ?? newTier}
        </div>
        <div
          className="text-muted-foreground font-medium"
          style={{
            fontSize: 13,
            marginTop: 6,
            animation: "exo-slide-in-bottom 0.5s 1.1s ease-out both",
          }}
        >
          Tu rendimiento ha sido reconocido
        </div>
      </div>
    </>
  );
}

function BuddyDuoCompleteCelebration({
  buddyName,
  myName,
}: {
  buddyName: string;
  myName: string;
}) {
  const initials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <>
      {/* Left avatar slides in */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "36%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
          transform: "translateX(-50%)",
        }}
      >
        <div
          style={{
            // @ts-expect-error CSS custom properties
            "--exo-start-x": "-120px",
            "--exo-end-x": "8px",
            "--exo-bounce": "-6px",
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 700,
            fontSize: 18,
            animation: "exo-high-five 0.8s 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both",
            border: "3px solid white",
            boxShadow: "0 4px 12px rgba(59, 130, 246, 0.4)",
          }}
        >
          {initials(myName || "Tú")}
        </div>
        <div
          style={{
            // @ts-expect-error CSS custom properties
            "--exo-start-x": "120px",
            "--exo-end-x": "-8px",
            "--exo-bounce": "6px",
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #10b981, #06b6d4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 700,
            fontSize: 18,
            animation: "exo-high-five 0.8s 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both",
            border: "3px solid white",
            boxShadow: "0 4px 12px rgba(16, 185, 129, 0.4)",
          }}
        >
          {initials(buddyName || "Buddy")}
        </div>
      </div>

      {/* Text */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "52%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}
      >
        <div
          className="font-bold tracking-tight"
          style={{
            fontSize: 24,
            animation: "exo-slide-in-bottom 0.5s 0.8s ease-out both",
            background: "linear-gradient(135deg, #3b82f6 0%, #10b981 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 2px 8px rgba(59, 130, 246, 0.4))",
          }}
        >
          DUO IMPARABLE 🤝
        </div>
        <div
          className="text-muted-foreground font-medium"
          style={{
            fontSize: 13,
            marginTop: 4,
            animation: "exo-slide-in-bottom 0.5s 1s ease-out both",
          }}
        >
          {myName || "Tú"} y {buddyName || "tu buddy"} completaron el día
        </div>
      </div>
    </>
  );
}

// ─── Celebration Container ────────────────────────────────────────────────

function CelebrationOverlay({
  event,
  onDone,
}: {
  event: CelebrationEvent;
  onDone: (id: string) => void;
}) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const holdTimer = setTimeout(() => {
      setFading(true);
    }, CELEBRATION_DURATION_MS - 800);

    const removeTimer = setTimeout(() => {
      onDone(event.id);
    }, CELEBRATION_DURATION_MS);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(removeTimer);
    };
  }, [event.id, onDone]);

  function renderCelebration() {
    switch (event.type) {
      case "day_complete":
        return <DayCompleteCelebration />;

      case "proof_100":
        return <Proof100Celebration />;

      case "streak_milestone":
        return (
          <StreakMilestoneCelebration
            days={(event.payload.days as number) ?? 7}
          />
        );

      case "first_to_complete":
        return <FirstToCompleteCelebration />;

      case "title_promotion":
        return (
          <TitlePromotionCelebration
            oldTier={(event.payload.oldTier as TitleTier) ?? "C"}
            newTier={(event.payload.newTier as TitleTier) ?? "B"}
          />
        );

      case "buddy_duo_complete":
        return (
          <BuddyDuoCompleteCelebration
            buddyName={(event.payload.buddyName as string) ?? ""}
            myName={(event.payload.myName as string) ?? ""}
          />
        );

      default:
        return null;
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 pointer-events-none",
        "flex items-center justify-center"
      )}
      style={{
        animation: fading ? "exo-fade-out 0.8s ease-out forwards" : undefined,
      }}
      aria-live="polite"
      role="status"
    >
      {renderCelebration()}
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [activeCelebrations, setActiveCelebrations] = useState<CelebrationEvent[]>([]);
  const supabase = createClient();
  const userIdRef = useRef<string | null>(null);
  const orgIdRef = useRef<string | null>(null);
  const prevStreakRef = useRef<number | null>(null);
  const prevTierRef = useRef<TitleTier | null>(null);
  const initialLoadDone = useRef(false);

  // Inject CSS keyframes on mount
  useEffect(() => {
    injectStyles();
  }, []);

  // ── trigger function (debounced + deduped) ──

  const trigger = useCallback(
    (type: CelebrationType, payload: Record<string, unknown> = {}) => {
      const today = new Date().toISOString().slice(0, 10);
      const id = celebrationId(type, today);

      if (wasSeen(id)) return;
      if (!canTrigger(type)) return;

      markSeen(id);
      setDebounceTimestamp(type);

      const event: CelebrationEvent = {
        type,
        payload,
        id,
        triggeredAt: Date.now(),
      };

      setActiveCelebrations((prev) => [...prev, event]);
    },
    []
  );

  const removeCelebration = useCallback((id: string) => {
    setActiveCelebrations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // ── Load user context ──

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

      // Load initial streak for comparison
      const { data: streak } = await supabase
        .from("activity_streaks")
        .select("current_streak")
        .eq("user_id", user.id)
        .eq("org_id", membership.org_id)
        .single();

      if (streak) {
        prevStreakRef.current = streak.current_streak;
      }

      // Load initial title tier
      const { data: titleData } = await supabase
        .from("title_tiers")
        .select("tier")
        .eq("user_id", user.id)
        .eq("org_id", membership.org_id)
        .single();

      if (titleData) {
        prevTierRef.current = titleData.tier;
      }

      initialLoadDone.current = true;
    }

    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Check for day completion ──

  const checkDayComplete = useCallback(async () => {
    const userId = userIdRef.current;
    const orgId = orgIdRef.current;
    if (!userId || !orgId) return;

    const today = new Date().toISOString().slice(0, 10);

    const { data: entries } = await supabase
      .from("time_entries")
      .select("id, proof_urls")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", today);

    if (!entries) return;

    const totalHours = entries.length; // each entry = 1 hour slot

    // Day complete
    if (totalHours >= EXPECTED_DAILY_HOURS) {
      trigger("day_complete");

      // Check 100% proof
      const withProof = entries.filter(
        (e) => e.proof_urls && e.proof_urls.length > 0
      ).length;
      if (withProof >= totalHours) {
        trigger("proof_100");
      }

      // Check first to complete — are there other users who hit 8h today?
      const { data: otherEntries } = await supabase
        .from("time_entries")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("date", today)
        .neq("user_id", userId);

      if (otherEntries) {
        const otherUserCounts = new Map<string, number>();
        for (const entry of otherEntries) {
          otherUserCounts.set(
            entry.user_id,
            (otherUserCounts.get(entry.user_id) ?? 0) + 1
          );
        }
        const othersCompleted = [...otherUserCounts.values()].filter(
          (c) => c >= EXPECTED_DAILY_HOURS
        );
        if (othersCompleted.length === 0) {
          trigger("first_to_complete");
        }
      }
    }
  }, [supabase, trigger]);

  // ── Check buddy duo completion ──

  const checkBuddyDuo = useCallback(async () => {
    const userId = userIdRef.current;
    const orgId = orgIdRef.current;
    if (!userId || !orgId) return;

    const today = new Date().toISOString().slice(0, 10);

    // Look up buddy pairing
    const { data: pairing } = await supabase
      .from("accountability_buddies")
      .select("buddy_user_id")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .single();

    if (!pairing) return;

    // Check if I completed
    const { data: myEntries } = await supabase
      .from("time_entries")
      .select("id")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", today);

    const myHours = myEntries?.length ?? 0;
    if (myHours < EXPECTED_DAILY_HOURS) return;

    // Check if buddy completed
    const { data: buddyEntries } = await supabase
      .from("time_entries")
      .select("id")
      .eq("user_id", pairing.buddy_user_id)
      .eq("org_id", orgId)
      .eq("date", today);

    const buddyHours = buddyEntries?.length ?? 0;
    if (buddyHours < EXPECTED_DAILY_HOURS) return;

    // Both completed — get names
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    const { data: buddyProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", pairing.buddy_user_id)
      .single();

    trigger("buddy_duo_complete", {
      myName: myProfile?.full_name ?? "Tú",
      buddyName: buddyProfile?.full_name ?? "Tu buddy",
    });
  }, [supabase, trigger]);

  // ── Check streak milestones ──

  const checkStreakMilestone = useCallback(async () => {
    const userId = userIdRef.current;
    const orgId = orgIdRef.current;
    if (!userId || !orgId || !initialLoadDone.current) return;

    const { data: streak } = await supabase
      .from("activity_streaks")
      .select("current_streak")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .single();

    if (!streak) return;

    const current = streak.current_streak;
    const prev = prevStreakRef.current ?? 0;
    prevStreakRef.current = current;

    // Check if we crossed a milestone boundary
    const milestones = [7, 14, 30, 60, 100];
    for (const m of milestones) {
      if (current >= m && prev < m) {
        trigger("streak_milestone", { days: m });
        break; // only trigger the highest new milestone
      }
    }
  }, [supabase, trigger]);

  // ── Check title promotion ──

  const checkTitlePromotion = useCallback(async () => {
    const userId = userIdRef.current;
    const orgId = orgIdRef.current;
    if (!userId || !orgId || !initialLoadDone.current) return;

    const { data: titleData } = await supabase
      .from("title_tiers")
      .select("tier")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .single();

    if (!titleData) return;

    const current = titleData.tier;
    const prev = prevTierRef.current;
    prevTierRef.current = current;

    if (!prev) return;

    // Tier ranking: S > A > B > C > D > F
    const tierOrder: TitleTier[] = ["F", "D", "C", "B", "A", "S"];
    const currentIdx = tierOrder.indexOf(current);
    const prevIdx = tierOrder.indexOf(prev);

    // Only celebrate promotions (going up), not demotions
    if (currentIdx > prevIdx) {
      trigger("title_promotion", { oldTier: prev, newTier: current });
    }
  }, [supabase, trigger]);

  // ── Realtime subscriptions ──

  useEffect(() => {
    if (!initialLoadDone.current) {
      // Wait a bit for initial load
      const timeout = setTimeout(() => {
        // Still subscribe even if init was slow
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    const userId = userIdRef.current;
    const orgId = orgIdRef.current;

    // Subscribe to time_entries changes for this user
    const timeChannel = supabase
      .channel("celebrations-time-entries")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "time_entries",
        },
        (payload) => {
          const row = payload.new as { user_id?: string; org_id?: string };
          // Only react to entries in our org
          if (row.org_id === orgIdRef.current) {
            // Check if it's our entry or someone else's (buddy might complete)
            checkDayComplete();
            checkBuddyDuo();
          }
        }
      )
      .subscribe();

    // Subscribe to activity_streaks changes
    const streakChannel = supabase
      .channel("celebrations-streaks")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "activity_streaks",
        },
        (payload) => {
          const row = payload.new as { user_id?: string };
          if (row.user_id === userIdRef.current) {
            checkStreakMilestone();
          }
        }
      )
      .subscribe();

    // Subscribe to title_tiers changes
    const titleChannel = supabase
      .channel("celebrations-titles")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "title_tiers",
        },
        (payload) => {
          const row = (payload.new ?? {}) as { user_id?: string };
          if (row.user_id === userIdRef.current) {
            checkTitlePromotion();
          }
        }
      )
      .subscribe();

    // Subscribe to achievements
    const achievementChannel = supabase
      .channel("celebrations-achievements")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "achievements",
        },
        (payload) => {
          const row = payload.new as { user_id?: string; achievement_type?: string };
          if (row.user_id === userIdRef.current) {
            // Achievements can map to streak milestones or proof celebrations
            if (row.achievement_type === "proof_100") {
              trigger("proof_100");
            }
            if (row.achievement_type?.startsWith("streak_")) {
              const days = parseInt(row.achievement_type.replace("streak_", ""), 10);
              if (!isNaN(days)) {
                trigger("streak_milestone", { days });
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(timeChannel);
      supabase.removeChannel(streakChannel);
      supabase.removeChannel(titleChannel);
      supabase.removeChannel(achievementChannel);
    };
  }, [supabase, checkDayComplete, checkBuddyDuo, checkStreakMilestone, checkTitlePromotion, trigger]);

  return (
    <CelebrationContext.Provider value={{ trigger }}>
      {children}
      {activeCelebrations.map((event) => (
        <CelebrationOverlay
          key={event.id}
          event={event}
          onDone={removeCelebration}
        />
      ))}
    </CelebrationContext.Provider>
  );
}
