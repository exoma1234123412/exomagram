"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// PUBLIC COUNTDOWN
// ═══════════════════════════════════════════════════════════════
//
// If ANY member hasn't logged for 2+ hours during work hours,
// EVERYONE sees a red banner with a live ticking counter.
// Public shame. No hiding.

interface DelinquentMember {
 userId: string;
 fullName: string;
 lastLoggedAt: string; // ISO timestamp
}

function isWorkHours(): boolean {
 const now = new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 const hour = now.getHours();
 return hour >= 7 && hour < 18;
}

function getElapsed(isoTimestamp: string): { hours: number; minutes: number; seconds: number } {
 const diff = Date.now() - new Date(isoTimestamp).getTime();
 const totalSeconds = Math.max(0, Math.floor(diff / 1000));
 return {
 hours: Math.floor(totalSeconds / 3600),
 minutes: Math.floor((totalSeconds % 3600) / 60),
 seconds: totalSeconds % 60,
 };
}

export function PublicCountdown() {
 const { orgId } = useOrg();
 const supabase = createClient();
 const [delinquents, setDelinquents] = useState<DelinquentMember[]>([]);
 const [tick, setTick] = useState(0);
 const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

 const fetchDelinquents = useCallback(async () => {
 if (!orgId) return;
 if (!isWorkHours()) {
 setDelinquents([]);
 return;
 }

 const today = getTodayMTY();

 // Get all org members
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(full_name)")
 .eq("org_id", orgId);

 if (!members || members.length === 0) return;

 // Get today's entries for the org
 const { data: entries } = await supabase
 .from("time_entries")
 .select("user_id, logged_at")
 .eq("org_id", orgId)
 .eq("date", today)
 .order("logged_at", { ascending: false });

 // Find last logged_at per member
 const lastLogMap = new Map<string, string>();
 for (const entry of entries ?? []) {
 if (!lastLogMap.has(entry.user_id)) {
 lastLogMap.set(entry.user_id, entry.logged_at);
 }
 }

 const twoHoursMs = 2 * 60 * 60 * 1000;
 const now = Date.now();
 const result: DelinquentMember[] = [];

 for (const member of members) {
 const profile = member.profiles as unknown as { full_name: string | null } | null;
 const lastLog = lastLogMap.get(member.user_id);

 // If no entries today at all, calculate from start of workday (7am MTY)
 let referenceTime: string;
 if (!lastLog) {
 const todayStart = new Date(today +"T07:00:00-06:00"); // CST
 referenceTime = todayStart.toISOString();
 } else {
 referenceTime = lastLog;
 }

 const elapsed = now - new Date(referenceTime).getTime();
 if (elapsed >= twoHoursMs) {
 result.push({
 userId: member.user_id,
 fullName: profile?.full_name ??"Desconocido",
 lastLoggedAt: referenceTime,
 });
 }
 }

 // Sort by longest silence first
 result.sort(
 (a, b) =>
 new Date(a.lastLoggedAt).getTime() - new Date(b.lastLoggedAt).getTime()
 );

 setDelinquents(result);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 // Initial fetch + polling every 2 minutes
 useEffect(() => {
 if (!orgId) return;
 fetchDelinquents();
 const poll = setInterval(fetchDelinquents, 2 * 60 * 1000);
 return () => clearInterval(poll);
 }, [orgId, fetchDelinquents]);

 // Live counter — tick every second
 useEffect(() => {
 if (delinquents.length === 0) {
 if (intervalRef.current) {
 clearInterval(intervalRef.current);
 intervalRef.current = null;
 }
 return;
 }

 intervalRef.current = setInterval(() => {
 setTick((t) => t + 1);
 }, 1000);

 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [delinquents.length]);

 // Real-time — refetch on new entries
 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("public_countdown_rt")
 .on(
"postgres_changes",
 {
 event:"INSERT",
 schema:"public",
 table:"time_entries",
 filter:`org_id=eq.${orgId}`,
 },
 () => fetchDelinquents()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, fetchDelinquents]); // eslint-disable-line react-hooks/exhaustive-deps

 if (delinquents.length === 0) return null;

 return (
 <div className="w-full space-y-0">
 {delinquents.map((member) => {
 const elapsed = getElapsed(member.lastLoggedAt);
 return (
 <div
 key={member.userId}
 className={cn(
"w-full px-4 py-2.5 border-b",
"bg-red-500/10 border-red-500/30",
"flex items-center gap-3",
"font-mono text-xs")}
 >
 <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 animate-pulse"/>
 <span className="text-red-700 dark:text-red-300 uppercase tracking-wide">
 <span className="font-bold">{member.fullName}</span>
 {" "}no registra hace{" "}
 <span className="font-bold tabular-nums">
 {elapsed.hours}h {String(elapsed.minutes).padStart(2,"0")}m{" "}
 {String(elapsed.seconds).padStart(2,"0")}s
 </span>
 </span>
 </div>
 );
 })}
 </div>
 );
}
