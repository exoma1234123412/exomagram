"use client";

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE WATERMARK — Inescapable rank indicator
// ═══════════════════════════════════════════════════════════════
//
// Like a surveillance camera indicator. Always there.
// Fixed in the bottom-left, showing your current rank among
// org members by hours logged today. CANNOT be hidden.
//
// Psychological levers:
// - CONSTANT AWARENESS: you always see your position
// - COLOR CODING: green (#1), neutral (#2-3), amber (#4), red (last)
// - PULSING RED: if you're dead last, the watermark pulses
// - PROGRESS BAR: your hours vs team average — instant comparison
// - DYNAMIC TITLE: your shame/glory title is embedded

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { useDynamicTitle } from "@/components/social/dynamic-title";
import { getTodayMTY } from "@/lib/utils";
import { cn } from "@/lib/utils";

// --- Types ---

interface RankData {
 rank: number;
 total: number;
 myHours: number;
 teamAvgHours: number;
}

// --- Helpers ---

function getRankColor(rank: number, total: number) {
 if (total <= 1) return { text:"text-muted-foreground", glow:"", isLast: false };
 if (rank === 1)
 return {
 text:"text-green-500 dark:text-green-400",
 glow:"shadow-[0_0_8px_rgba(34,197,94,0.3)]",
 isLast: false,
 };
 if (rank <= 3)
 return { text:"text-muted-foreground", glow:"", isLast: false };
 if (rank === total)
 return {
 text:"text-red-500 dark:text-red-400",
 glow:"shadow-[0_0_8px_rgba(239,68,68,0.3)]",
 isLast: true,
 };
 // rank 4+ but not last
 return { text:"text-amber-500 dark:text-amber-400", glow:"", isLast: false };
}

// --- Component ---

export function PerformanceWatermark() {
 const { orgId, userId } = useOrg();
 const titleInfo = useDynamicTitle(userId ??"");
 const [data, setData] = useState<RankData | null>(null);
 const supabase = createClient();
 const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

 const fetchRank = useCallback(async () => {
 if (!orgId || !userId) return;

 const today = getTodayMTY();

 // Fetch org members + today's entries in parallel
 const [membersRes, entriesRes] = await Promise.all([
 supabase
 .from("org_members")
 .select("user_id")
 .eq("org_id", orgId),
 supabase
 .from("time_entries")
 .select("user_id")
 .eq("org_id", orgId)
 .eq("date", today),
 ]);

 const members = membersRes.data ?? [];
 const entries = entriesRes.data ?? [];

 if (members.length === 0) return;

 // Count hours per member
 const hoursByUser = new Map<string, number>();
 for (const m of members) {
 hoursByUser.set(m.user_id, 0);
 }
 for (const e of entries) {
 hoursByUser.set(e.user_id, (hoursByUser.get(e.user_id) ?? 0) + 1);
 }

 // Sort descending by hours
 const sorted = [...hoursByUser.entries()].sort((a, b) => b[1] - a[1]);

 // Find my rank
 let rank = 1;
 for (let i = 0; i < sorted.length; i++) {
 if (sorted[i][0] === userId) {
 rank = i + 1;
 break;
 }
 }

 const myHours = hoursByUser.get(userId) ?? 0;
 const totalHours = [...hoursByUser.values()].reduce((a, b) => a + b, 0);
 const teamAvgHours = members.length > 0 ? totalHours / members.length : 0;

 setData({
 rank,
 total: members.length,
 myHours,
 teamAvgHours,
 });
 }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

 // Initial fetch
 useEffect(() => {
 fetchRank();
 }, [fetchRank]);

 // Poll every 2 minutes
 useEffect(() => {
 if (!orgId || !userId) return;
 intervalRef.current = setInterval(fetchRank, 2 * 60 * 1000);
 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [orgId, userId, fetchRank]);

 // Real-time: refetch when entries change
 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel(`perf_watermark_${orgId}`)
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"time_entries",
 filter:`org_id=eq.${orgId}`,
 },
 () => fetchRank()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, fetchRank]); // eslint-disable-line react-hooks/exhaustive-deps

 // Don't render until we have data
 if (!orgId || !userId || !data) return null;

 const { rank, total, myHours, teamAvgHours } = data;
 const { text: rankColor, glow, isLast } = getRankColor(rank, total);

 // Progress bar: my hours vs team average (capped at 100%)
 const progressPct =
 teamAvgHours > 0
 ? Math.min(100, Math.round((myHours / teamAvgHours) * 100))
 : myHours > 0
 ? 100
 : 0;

 // Progress bar color
 const progressBarColor = isLast
 ?"bg-red-500": rank === 1
 ?"bg-green-500": progressPct >= 100
 ?"bg-green-500": progressPct >= 70
 ?"bg-muted-foreground":"bg-amber-500";

 return (
 <div
 className={cn(
"fixed bottom-20 md:bottom-4 left-4 md:left-60 z-[40]",
"w-[120px]",
"border border-border/40 bg-card/80 backdrop-blur-sm",
"font-mono text-[9px] tracking-wider",
"select-none pointer-events-auto",
"opacity-70 hover:opacity-100 transition-opacity duration-300",
 glow,
 isLast &&"animate-pulse")}
 >
 {/* Rank line */}
 <div className="px-2 pt-1.5 flex items-baseline justify-between">
 <span className={cn("font-bold tabular-nums", rankColor)}>
 #{rank} de {total}
 </span>
 {isLast && (
 <span className="text-red-500 dark:text-red-400 font-bold uppercase text-[7px]">
 ULTIMO
 </span>
 )}
 </div>

 {/* Hours */}
 <div className="px-2 pt-0.5">
 <span className="tabular-nums text-foreground/80">
 {myHours}h
 </span>
 <span className="text-muted-foreground ml-1">
 / {teamAvgHours.toFixed(1)}h avg
 </span>
 </div>

 {/* Progress bar */}
 <div className="px-2 pt-1 pb-1">
 <div className="h-[2px] w-full bg-border/30 overflow-hidden">
 <div
 className={cn("h-full transition-all duration-500", progressBarColor)}
 style={{ width:`${progressPct}%`}}
 />
 </div>
 </div>

 {/* Dynamic title badge */}
 {titleInfo.title && (
 <div className="px-2 pb-1.5 truncate">
 <span
 className={cn(
"text-[7px] font-bold uppercase tracking-wider",
 titleInfo.color,
 titleInfo.pulse &&"animate-pulse")}
 >
 {titleInfo.title}
 </span>
 </div>
 )}

 {/* No title — add bottom padding */}
 {!titleInfo.title && <div className="pb-0.5"/>}
 </div>
 );
}
