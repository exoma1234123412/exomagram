"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Users, Eye, ArrowUp, ArrowDown, Minus } from "lucide-react";

interface PressureData {
 teamTotal: number;
 teamLogged: number;
 myHours: number;
 myRank: number;
 prevRank: number | null;
 activeNow: number;
 teamHours: { name: string; hours: number }[];
 imLast: boolean;
 percentile: number;
}

export function SocialPressureBar({ orgId }: { orgId: string }) {
 const [data, setData] = useState<PressureData | null>(null);
 const [rankChanged, setRankChanged] = useState<"up"|"down"| null>(null);
 const supabase = createClient();
 const today = new Date().toISOString().split("T")[0];

 useEffect(() => {
 async function load() {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;

 const [{ data: members }, { data: entries }, { data: liveStatuses }] = await Promise.all([
 supabase.from("org_members").select("user_id, profiles(full_name)")
 .eq("org_id", orgId),
 supabase.from("time_entries").select("user_id, hour")
 .eq("org_id", orgId).eq("date", today),
 supabase.from("live_status").select("user_id, status")
 .eq("org_id", orgId).in("status", ["online","deep_work","in_meeting"]),
 ]);

 if (!members) return;

 // Count hours per person
 const hoursByUser: Record<string, number> = {};
 entries?.forEach((e) => {
 hoursByUser[e.user_id] = (hoursByUser[e.user_id] || 0) + 1;
 });

 const teamHours = members.map((m) => ({
 name: (m.profiles as { full_name: string | null })?.full_name?.split("")[0] ??"?",
 hours: hoursByUser[m.user_id] || 0,
 })).sort((a, b) => b.hours - a.hours);

 const myHours = hoursByUser[user.id] || 0;
 const logged = Object.values(hoursByUser).filter((h) => h > 0).length;

 // Calculate rank
 const sortedUsers = members.map((m) => ({
 userId: m.user_id,
 hours: hoursByUser[m.user_id] || 0,
 })).sort((a, b) => b.hours - a.hours);

 const myRank = sortedUsers.findIndex((u) => u.userId === user.id) + 1;
 const activeNow = liveStatuses?.length ?? 0;
 const imLast = myRank === members.length;
 const percentile = Math.round(((members.length - myRank) / Math.max(members.length - 1, 1)) * 100);

 setData((prev) => {
 if (prev && prev.myRank !== myRank) {
 setRankChanged(myRank < prev.myRank ?"up":"down");
 setTimeout(() => setRankChanged(null), 2000);
 }
 return {
 teamTotal: members.length,
 teamLogged: logged,
 myHours,
 myRank,
 prevRank: prev?.myRank ?? null,
 activeNow,
 teamHours,
 imLast,
 percentile,
 };
 });
 }
 load();

 const interval = setInterval(load, 60000); // every minute
 return () => clearInterval(interval);
 }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

 // Also subscribe to real-time changes
 useEffect(() => {
 const channel = supabase
 .channel("pressure-bar")
 .on("postgres_changes", { event:"INSERT", schema:"public", table:"time_entries", filter:`org_id=eq.${orgId}`}, () => {
 // Trigger refresh
 setData((prev) => prev ? { ...prev } : null);
 })
 .subscribe();

 return () => { supabase.removeChannel(channel); };
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 if (!data || data.teamTotal <= 1) return null;

 const teamProgress = Math.round((data.teamLogged / data.teamTotal) * 100);

 return (
 <div className={cn(
"fixed left-0 right-0 z-40 border-t glass animate-slide-up-bounce",
"bottom-0 md:bottom-0",
"md:bg-background/90 md:dark:bg-background/95",
"bg-background/95 dark:bg-background/95",
"mb-[calc(3.5rem+env(safe-area-inset-bottom))] md:mb-0",
 data.imLast &&"border-t-red-500/50")}>
 <div className="max-w-3xl mx-auto px-4 py-2.5">
 <div className="flex items-center justify-between gap-4">
 {/* Team progress */}
 <div className="flex items-center gap-3 min-w-0">
 <div className="flex items-center gap-1.5">
 <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0"/>
 <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
 {data.teamLogged}/{data.teamTotal}
 </span>
 </div>
 <div className="h-1.5 w-20 sm:w-32 bg-muted/30 rounded-full overflow-hidden shrink-0">
 <div
 className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"style={{ width:`${teamProgress}%`}}
 />
 </div>
 <span className="text-[10px] text-muted-foreground hidden sm:block whitespace-nowrap">
 registraron hoy
 </span>
 </div>

 {/* Your rank */}
 <div className={cn(
"flex items-center gap-2 px-3 py-1 transition-all",
 rankChanged ==="up"&&"animate-rank-rise",
 rankChanged ==="down"&&"animate-rank-drop",
 data.imLast
 ?"bg-red-500/15 dark:bg-red-950/30": data.myRank <= 3
 ?"bg-green-500/10 dark:bg-green-950/30":"bg-muted/30")}>
 <span className="text-[10px] text-muted-foreground hidden sm:block">Rank</span>
 <span className={cn(
"text-sm font-black tabular-nums",
 data.imLast ?"text-red-500": data.myRank <= 3 ?"text-green-600 dark:text-green-400":"text-foreground")}>
 #{data.myRank}
 </span>
 {data.prevRank !== null && data.prevRank !== data.myRank && (
 data.myRank < data.prevRank ? (
 <ArrowUp className="w-3 h-3 text-green-500"/>
 ) : (
 <ArrowDown className="w-3 h-3 text-red-500"/>
 )
 )}
 {data.imLast && (
 <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider hidden sm:block">
 Último
 </span>
 )}
 </div>

 {/* Your hours vs expected */}
 <div className="flex items-center gap-1.5">
 <span className={cn(
"text-sm font-bold tabular-nums",
 data.myHours >= EXPECTED_DAILY_HOURS
 ?"text-green-600": data.myHours >= 4
 ?"text-yellow-600":"text-red-500")}>
 {data.myHours}h
 </span>
 <span className="text-[10px] text-muted-foreground">/{EXPECTED_DAILY_HOURS}h</span>
 </div>

 {/* Active now indicator */}
 {data.activeNow > 0 && (
 <div className="flex items-center gap-1.5 shrink-0">
 <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse-glow"/>
 <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
 {data.activeNow} activos
 </span>
 </div>
 )}

 {/* Surveillance eye */}
 <Eye className="w-3.5 h-3.5 text-muted-foreground animate-eye-blink shrink-0 hidden sm:block"/>
 </div>

 {/* Mini leaderboard row — top 3 */}
 {data.teamHours.length > 2 && (
 <div className="flex items-center gap-1 mt-1.5 overflow-hidden">
 {data.teamHours.slice(0, 5).map((member, i) => (
 <div key={i} className="flex items-center gap-1 text-[9px] text-muted-foreground">
 <span className={cn(
"font-bold",
 i === 0 ?"text-amber-500": i === 1 ?"text-slate-400": i === 2 ?"text-amber-700":"")}>
 {i === 0 ?"🥇": i === 1 ?"🥈": i === 2 ?"🥉":`${i + 1}.`}
 </span>
 <span className="truncate max-w-[50px]">{member.name}</span>
 <span className="tabular-nums font-medium">{member.hours}h</span>
 {i < Math.min(4, data.teamHours.length - 1) && <span className="text-muted-foreground">·</span>}
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 );
}
