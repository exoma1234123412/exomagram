"use client";

import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// THE GHOST EFFECT
// ═══════════════════════════════════════════════════════════════
//
// If you haven't logged a single hour in 2 days, you become a ghost.
// Your avatar becomes invisible to the team. A banner haunts you.
// The only way to un-ghost is to log hours.

interface GhostContextValue {
 isGhost: boolean;
}

const GhostContext = createContext<GhostContextValue>({ isGhost: false });

export function useGhost() {
 return useContext(GhostContext);
}

export function isUserGhost(entryCountLast2Days: number): boolean {
 return entryCountLast2Days === 0;
}

export function GhostEffect({ children }: { children: ReactNode }) {
 const { orgId, userId } = useOrg();
 const [isGhost, setIsGhost] = useState(false);
 const supabase = createClient();

 useEffect(() => {
 if (!orgId || !userId) return;

 async function checkGhost() {
 const twoDaysAgo = new Date();
 twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
 const cutoffDate = twoDaysAgo.toISOString().split("T")[0];

 const { count } = await supabase
 .from("time_entries")
 .select("id", { count:"exact", head: true })
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", cutoffDate);

 setIsGhost((count ?? 0) === 0);
 }

 checkGhost();
 // Re-check every 5 minutes
 const interval = setInterval(checkGhost, 5 * 60 * 1000);
 return () => clearInterval(interval);
 }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

 return (
 <GhostContext.Provider value={{ isGhost }}>
 {isGhost && <GhostBanner />}
 {children}
 </GhostContext.Provider>
 );
}

function GhostBanner() {
 return (
 <div
 className={cn(
"w-full px-4 py-3 text-center text-sm font-medium",
"bg-gray-100 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-800",
"text-gray-500 dark:text-gray-400",
"opacity-70 grayscale")}
 >
 <span className="mr-2">👻</span>
 Eres un fantasma. No has registrado horas en 2 días. Tu avatar es invisible para el equipo.
 </div>
 );
}
