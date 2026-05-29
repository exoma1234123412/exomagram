"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { useOrg } from "@/lib/context/org-context";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// THE THRONE
// ═══════════════════════════════════════════════════════════════
//
// Every week, one person wears the crown. One person gets the pillow.
// Crown = most deep work hours (they're the king/queen)
// Sleepy = least total hours (they need to wake up)

interface ThroneData {
  crownUserId: string | null;
  crownName: string | null;
  crownDeepWorkHours: number;
  sleepyUserId: string | null;
  sleepyName: string | null;
  sleepyTotalHours: number;
}

const ThroneContext = createContext<ThroneData>({
  crownUserId: null,
  crownName: null,
  crownDeepWorkHours: 0,
  sleepyUserId: null,
  sleepyName: null,
  sleepyTotalHours: 0,
});

export function useThrone() {
  return useContext(ThroneContext);
}

export function ThroneProvider({ children }: { children: React.ReactNode }) {
  const { orgId } = useOrg();
  const [data, setData] = useState<ThroneData>({
    crownUserId: null,
    crownName: null,
    crownDeepWorkHours: 0,
    sleepyUserId: null,
    sleepyName: null,
    sleepyTotalHours: 0,
  });

  useEffect(() => {
    if (!orgId) return;

    async function fetchThrone() {
      try {
        const res = await fetch(`/api/throne?org_id=${orgId}`);
        if (!res.ok) return;
        const json = await res.json();
        setData({
          crownUserId: json.crown_user_id,
          crownName: json.crown_name,
          crownDeepWorkHours: json.crown_deep_work_hours ?? 0,
          sleepyUserId: json.sleepy_user_id,
          sleepyName: json.sleepy_name,
          sleepyTotalHours: json.sleepy_total_hours ?? 0,
        });
      } catch {
        // Silent fail — non-critical feature
      }
    }

    fetchThrone();
    // Refresh every 10 minutes
    const interval = setInterval(fetchThrone, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [orgId]);

  return (
    <ThroneContext.Provider value={data}>
      {children}
    </ThroneContext.Provider>
  );
}

export function ThroneBanner({ orgId }: { orgId: string }) {
  const throne = useThrone();

  if (!throne.crownName && !throne.sleepyName) return null;

  const crownFirstName = throne.crownName?.split(" ")[0] ?? "?";
  const sleepyFirstName = throne.sleepyName?.split(" ")[0] ?? "?";

  return (
    <div
      className={cn(
        "mb-8 px-4 py-3 rounded-xl border",
        "bg-accent/40 border-border/50",
        "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {throne.crownName && (
          <span>
            <span className="mr-1">👑</span>
            <span className="font-semibold">{crownFirstName}</span>
            {" "}lidera con{" "}
            <span className="font-bold tabular-nums tracking-tight">{throne.crownDeepWorkHours}h</span>
            {" "}de Deep Work esta semana
          </span>
        )}
        {throne.crownName && throne.sleepyName && (
          <span className="text-muted-foreground hidden sm:inline">|</span>
        )}
        {throne.sleepyName && (
          <span className="text-muted-foreground">
            <span className="mr-1">💤</span>
            <span className="font-semibold">{sleepyFirstName}</span>
            {" "}va último con{" "}
            <span className="font-bold tabular-nums tracking-tight">{throne.sleepyTotalHours}h</span>
          </span>
        )}
      </div>
    </div>
  );
}
