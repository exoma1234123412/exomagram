"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Ghost } from "lucide-react";
import type { Profile } from "@/lib/types/database";

// ═══════════════════════════════════════════════════════════════
// EMPTY CHAIR EFFECT
// ═══════════════════════════════════════════════════════════════
//
// For team grids/lists — members with 0 entries today get a
// ghostly placeholder card. The empty chair at the table.
// Dashed borders, faded text, ticking counter of absence.

interface EmptyChairCardProps {
  profile: Profile;
  lastEntry: string | null; // ISO timestamp of last entry, or null if never
}

function getElapsedSince(isoTimestamp: string | null): {
  hours: number;
  minutes: number;
  seconds: number;
  label: string;
} {
  if (!isoTimestamp) {
    return { hours: 0, minutes: 0, seconds: 0, label: "Sin registros" };
  }

  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const totalSeconds = Math.max(0, Math.floor(diff / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    hours,
    minutes,
    seconds,
    label: `${hours}h ${String(minutes).padStart(2, "0")}m sin registrar`,
  };
}

export function EmptyChairCard({ profile, lastEntry }: EmptyChairCardProps) {
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every second for the live counter
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const elapsed = getElapsedSince(lastEntry);
  const firstName = profile.full_name?.split(" ")[0] ?? "?";
  const fullName = profile.full_name ?? "Desconocido";

  return (
    <div
      className={cn(
        "relative p-4",
        "border-2 border-dashed border-red-500/30",
        "opacity-30",
        "font-mono",
        "transition-opacity duration-500"
      )}
    >
      {/* Ghost avatar */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            "w-10 h-10 border border-red-500/20",
            "flex items-center justify-center",
            "bg-red-500/5"
          )}
        >
          <Ghost className="w-5 h-5 text-red-500/60" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-red-700 dark:text-red-400 truncate uppercase tracking-tight">
            {fullName}
          </p>
          <p className="text-[9px] tracking-[0.18em] uppercase text-red-500/60 font-bold">
            Sin actividad
          </p>
        </div>
      </div>

      {/* Ticking counter */}
      <div className="border border-red-500/20 px-3 py-2 bg-red-500/5">
        {lastEntry ? (
          <p className="text-xs text-red-600/80 dark:text-red-400/80">
            <span className="font-bold tabular-nums">
              {elapsed.hours}h {String(elapsed.minutes).padStart(2, "0")}m{" "}
              {String(elapsed.seconds).padStart(2, "0")}s
            </span>
            <span className="ml-1.5 uppercase tracking-wide text-[9px]">
              sin registrar
            </span>
          </p>
        ) : (
          <p className="text-xs text-red-600/80 dark:text-red-400/80 uppercase tracking-wide">
            Sin registros hoy
          </p>
        )}
      </div>
    </div>
  );
}
