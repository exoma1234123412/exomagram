"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Skull, TrendingDown } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// LAST PLACE CURSE
// ═══════════════════════════════════════════════════════════════
//
// A persistent, undismissable banner that follows you when you're
// in last place for hours logged today. CANNOT be closed.
// The only escape is to log more hours than someone else.
//
// Psychological lever: constant shame pressure at the bottom of
// the screen. You see the leader's name and hours. You see your
// gap. It updates every 30 seconds. There is no escape button.

interface MemberHours {
 userId: string;
 name: string;
 hours: number;
}

const REFRESH_INTERVAL = 30_000; // 30 seconds

export function LastPlaceCurse() {
 const { orgId, userId } = useOrg();
 const supabase = createClient();
 const [ranking, setRanking] = useState<MemberHours[]>([]);
 const [loaded, setLoaded] = useState(false);
 const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

 const loadRanking = useCallback(async () => {
 if (!orgId || !userId) return;

 const today = getTodayMTY();

 // Fetch members and today's entries in parallel
 const [membersRes, entriesRes] = await Promise.all([
 supabase
 .from("org_members")
 .select("user_id, profiles(full_name)")
 .eq("org_id", orgId),
 supabase
 .from("time_entries")
 .select("user_id, hour")
 .eq("org_id", orgId)
 .eq("date", today),
 ]);

 const members = membersRes.data ?? [];
 const entries = entriesRes.data ?? [];

 // Count hours per user
 const hourMap = new Map<string, number>();
 for (const e of entries) {
 hourMap.set(e.user_id, (hourMap.get(e.user_id) ?? 0) + 1);
 }

 // Build ranking
 const rows: MemberHours[] = members.map((m) => ({
 userId: m.user_id,
 name: (m.profiles as any)?.full_name?.split("")[0] ??"?",
 hours: hourMap.get(m.user_id) ?? 0,
 }));

 // Sort descending (most hours first)
 rows.sort((a, b) => b.hours - a.hours);

 setRanking(rows);
 setLoaded(true);
 }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

 // Initial load + polling every 30s
 useEffect(() => {
 if (!orgId || !userId) return;

 loadRanking();

 intervalRef.current = setInterval(loadRanking, REFRESH_INTERVAL);

 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [orgId, userId, loadRanking]);

 // Real-time subscription for immediate updates
 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel(`last_place_curse_${orgId}`)
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"time_entries",
 filter:`org_id=eq.${orgId}`,
 },
 () => loadRanking()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, loadRanking]); // eslint-disable-line react-hooks/exhaustive-deps

 // Don't render until loaded
 if (!loaded || !userId || ranking.length < 2) return null;

 // Find current user
 const currentUser = ranking.find((r) => r.userId === userId);
 if (!currentUser) return null;

 // Find last place hours
 const lastPlaceHours = ranking[ranking.length - 1].hours;

 // Check if current user is in last place
 const isLastPlace = currentUser.hours === lastPlaceHours;
 if (!isLastPlace) return null;

 // If everyone has the same hours, no one is"last"— no curse
 const firstPlaceHours = ranking[0].hours;
 if (firstPlaceHours === lastPlaceHours) return null;

 // Find tied members in last place (excluding current user)
 const tiedMembers = ranking.filter(
 (r) => r.hours === lastPlaceHours && r.userId !== userId
 );

 // First place info
 const leader = ranking[0];
 const gap = leader.hours - currentUser.hours;

 // Find the person just above last place to calculate escape gap
 const aboveLastPlace = [...ranking]
 .reverse()
 .find((r) => r.hours > lastPlaceHours);
 const escapeGap = aboveLastPlace
 ? aboveLastPlace.hours - currentUser.hours
 : 1;

 return (
 <div
 className={cn(
"fixed bottom-0 left-0 right-0 z-[45]",
"md:left-56",
 // Offset for mobile nav bar
"mb-[52px] md:mb-0")}
 >
 <div
 className={cn(
"bg-red-500/10 border-t-2 border-red-500/50",
"px-4 py-2.5",
"animate-[border-pulse_2s_ease-in-out_infinite]")}
 >
 <div className="max-w-4xl mx-auto flex items-center gap-3">
 {/* Icon */}
 <div className="shrink-0">
 <div className="w-8 h-8 border border-red-500/30 bg-red-500/10 flex items-center justify-center">
 <Skull className="w-4 h-4 text-red-500 animate-pulse"/>
 </div>
 </div>

 {/* Content */}
 <div className="min-w-0 flex-1">
 {/* Main message */}
 <p className="font-mono text-[11px] uppercase tracking-wider text-red-600 dark:text-red-400 font-bold leading-tight">
 {tiedMembers.length > 0 ? (
 <>
 ULTIMO LUGAR — Compartes el ultimo lugar con{" "}
 {tiedMembers.map((t) => t.name).join(",")}
 </>
 ) : (
 <>
 ULTIMO LUGAR — Todo el equipo te supera.{" "}
 <span className="text-red-500 dark:text-red-300">
 {leader.name} lleva{" "}
 <span className="font-mono tabular-nums">
 {leader.hours}
 </span>{" "}
 hrs.
 </span>{" "}
 Tu llevas{" "}
 <span className="font-mono tabular-nums">
 {currentUser.hours}
 </span>{" "}
 hrs.
 </>
 )}
 </p>

 {/* Escape gap */}
 <p className="font-mono text-[10px] tracking-wider text-red-500/70 dark:text-red-400/60 mt-0.5 flex items-center gap-1.5">
 <TrendingDown className="w-3 h-3 inline shrink-0"/>
 Te faltan{" "}
 <span className="font-mono tabular-nums font-bold">
 {escapeGap}
 </span>{" "}
 hrs para dejar el ultimo lugar
 {gap > escapeGap && (
 <span className="ml-2 opacity-60">
 ({gap} hrs detras del lider)
 </span>
 )}
 </p>
 </div>
 </div>
 </div>

 {/* Inline animation keyframes */}
 <style jsx>{`@keyframes border-pulse {
 0%,
 100% {
 border-color: rgb(239 68 68 / 0.5);
 }
 50% {
 border-color: rgb(239 68 68 / 0.9);
 }
 }
`}</style>
 </div>
 );
}
