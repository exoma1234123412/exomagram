"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, cn } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";

// ═══════════════════════════════════════════════════════════════
// RANKING STRIP — Persistent, inescapable ranking bar
// ═══════════════════════════════════════════════════════════════
//
// Shows on EVERY page, inline at top of main content (below
// PublicCountdown). Ranks all org members by hours logged today.
// Cannot be closed, minimized, or ignored.
//
// Updates every 60 seconds + real-time subscription on time_entries.

interface RankedMember {
 userId: string;
 fullName: string;
 hours: number;
 rank: number;
}

export function RankingStrip() {
 const { orgId, userId } = useOrg();
 const supabase = createClient();
 const [members, setMembers] = useState<RankedMember[]>([]);
 const [loading, setLoading] = useState(true);
 const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

 const fetchRankings = useCallback(async () => {
 if (!orgId) return;

 const today = getTodayMTY();

 // Fetch members and today's entries in parallel
 const [membersRes, entriesRes] = await Promise.all([
 supabase
 .from("org_members")
 .select("user_id, profiles(full_name)")
 .eq("org_id", orgId),
 supabase
 .from("time_entries")
 .select("user_id")
 .eq("org_id", orgId)
 .eq("date", today),
 ]);

 const orgMembers = membersRes.data ?? [];
 const entries = entriesRes.data ?? [];

 // Count hours per user
 const hoursMap = new Map<string, number>();
 for (const entry of entries) {
 hoursMap.set(entry.user_id, (hoursMap.get(entry.user_id) ?? 0) + 1);
 }

 // Build ranked list
 const ranked: RankedMember[] = orgMembers.map((m) => {
 const profile = m.profiles as unknown as Pick<Profile,"full_name"> | null;
 return {
 userId: m.user_id,
 fullName: profile?.full_name ??"Desconocido",
 hours: hoursMap.get(m.user_id) ?? 0,
 rank: 0,
 };
 });

 // Sort descending by hours (ties broken alphabetically)
 ranked.sort((a, b) => {
 if (b.hours !== a.hours) return b.hours - a.hours;
 return a.fullName.localeCompare(b.fullName);
 });

 // Assign ranks
 ranked.forEach((m, i) => {
 m.rank = i + 1;
 });

 setMembers(ranked);
 setLoading(false);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 // Initial fetch + polling every 60 seconds
 useEffect(() => {
 if (!orgId) return;
 fetchRankings();
 pollRef.current = setInterval(fetchRankings, 60 * 1000);
 return () => {
 if (pollRef.current) clearInterval(pollRef.current);
 };
 }, [orgId, fetchRankings]);

 // Real-time subscription on time_entries
 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("ranking_strip_rt")
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"time_entries",
 filter:`org_id=eq.${orgId}`,
 },
 () => fetchRankings()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, fetchRankings]); // eslint-disable-line react-hooks/exhaustive-deps

 // Don't render while loading or if no members
 if (loading || members.length === 0) return null;

 const totalMembers = members.length;
 const totalHours = members.reduce((sum, m) => sum + m.hours, 0);
 const avgHours = totalMembers > 0 ? totalHours / totalMembers : 0;

 // Is current user in last place?
 const currentUserRank = members.find((m) => m.userId === userId)?.rank ?? 0;
 const isLastPlace = currentUserRank === totalMembers && totalMembers > 1;

 return (
 <div
 className={cn(
"w-full border-b border-border/30 bg-accent/20",
"font-mono text-[10px] tracking-wider uppercase",
"flex items-center gap-0 overflow-x-auto",
"scrollbar-none",
 isLastPlace &&"bg-red-500/10 border-red-500/20")}
 >
 {/* Rankings — scrollable */}
 <div className="flex items-center gap-0 min-w-0 flex-1 overflow-x-auto scrollbar-none">
 {members.map((member) => {
 const isFirst = member.rank === 1;
 const isLast = member.rank === totalMembers && totalMembers > 1;
 const isCurrentUser = member.userId === userId;

 return (
 <div
 key={member.userId}
 className={cn(
"flex items-center gap-1 px-3 py-1.5 shrink-0",
"border-r border-border/20 last:border-r-0",
"transition-colors duration-200",
 isCurrentUser &&"border-x border-primary/30 bg-primary/5",
 isFirst &&"text-green-600 dark:text-green-400",
 isLast &&"text-red-600 dark:text-red-400",
 !isFirst && !isLast &&"text-muted-foreground")}
 >
 {/* Rank + emoji */}
 <span className="font-bold tabular-nums">
 {isFirst &&"👑"}
 {isLast &&"--"}
 #{member.rank}
 </span>

 {/* Full name */}
 <span
 className={cn(
"truncate max-w-[120px]",
 isCurrentUser &&"font-bold text-foreground")}
 >
 {member.fullName}
 </span>

 {/* Hours */}
 <span
 className={cn(
"font-bold tabular-nums",
 isLast &&"animate-pulse")}
 >
 {member.hours}h
 </span>
 </div>
 );
 })}
 </div>

 {/* Team stats — always visible, right side */}
 <div className="flex items-center gap-3 px-3 py-1.5 shrink-0 border-l border-border/30 text-muted-foreground/60">
 <span>
 TOTAL{""}
 <span className="font-bold tabular-nums text-foreground/80">
 {totalHours}h
 </span>
 </span>
 <span>
 PROM{""}
 <span className="font-bold tabular-nums text-foreground/80">
 {avgHours.toFixed(1)}h
 </span>
 </span>
 </div>
 </div>
 );
}
