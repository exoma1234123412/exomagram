"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { WORK_HOURS, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { cn, getTodayMTY } from "@/lib/utils";
import { VolumeX } from "lucide-react";

interface SilentMember {
 userId: string;
 name: string;
 silentHours: number;
 lastEntry: string | null;
 isOnline: boolean;
}

export function SilenceAmplifier() {
 const { orgId } = useOrg();
 const [silentMembers, setSilentMembers] = useState<SilentMember[]>([]);

 useEffect(() => {
 if (!orgId) return;
 const supabase = createClient();
 const today = getTodayMTY();
 const currentHour = new Date().getHours();

 // Only show during work hours
 if (currentHour < WORK_HOURS[0] || currentHour > WORK_HOURS[WORK_HOURS.length - 1]) return;

 async function load() {
 const [{ data: members }, { data: entries }, { data: statuses }] = await Promise.all([
 supabase.from("org_members").select("user_id, profiles(full_name)").eq("org_id", orgId!),
 supabase.from("time_entries").select("user_id, hour").eq("org_id", orgId!).eq("date", today),
 supabase.from("live_status").select("user_id, status, last_heartbeat").eq("org_id", orgId!),
 ]);

 const pastWorkHours = WORK_HOURS.filter((h) => h < currentHour);
 const entryMap = new Map<string, Set<number>>();
 for (const e of entries ?? []) {
 const set = entryMap.get(e.user_id) ?? new Set();
 set.add(e.hour);
 entryMap.set(e.user_id, set);
 }

 const statusMap = new Map<string, { status: string; last_heartbeat: string }>();
 for (const s of statuses ?? []) statusMap.set(s.user_id, s);

 const silent: SilentMember[] = [];
 for (const m of members ?? []) {
 const logged = entryMap.get(m.user_id) ?? new Set();
 const missing = pastWorkHours.filter((h) => !logged.has(h)).length;
 if (missing < 2) continue; // Only show if 2+ hours silent

 const profile = m.profiles as unknown as { full_name: string | null };
 const status = statusMap.get(m.user_id);
 const lastEntryHour = [...(logged.values())].sort((a, b) => b - a)[0];

 silent.push({
 userId: m.user_id,
 name: profile?.full_name ?? "?",
 silentHours: missing,
 lastEntry: lastEntryHour != null ? `${lastEntryHour}:00` : null,
 isOnline: status?.status !== "offline" && status?.status != null,
 });
 }

 silent.sort((a, b) => b.silentHours - a.silentHours);
 setSilentMembers(silent);
 }

 load();
 const interval = setInterval(load, 5 * 60_000); // Refresh every 5 min
 return () => clearInterval(interval);
 }, [orgId]);

 if (silentMembers.length === 0) return null;

 return (
 <div className="border border-red-200/50 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/10 px-4 py-3 mb-4">
 <div className="flex items-center gap-2 mb-2">
 <VolumeX className="w-4 h-4 text-red-500"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-600 dark:text-red-400 font-semibold">
 Silencio detectado
 </span>
 </div>
 <div className="flex flex-wrap gap-3">
 {silentMembers.map((m) => (
 <div
 key={m.userId}
 className={cn(
 "flex items-center gap-2 px-3 py-1.5 border font-mono text-xs",
 m.isOnline
 ? "border-red-300 dark:border-red-800 bg-red-100/50 dark:bg-red-950/30"
 : "border-border bg-accent/20"
 )}
 >
 <span className={cn(
 "w-1.5 h-1.5 rounded-full shrink-0",
 m.isOnline ? "bg-green-500 animate-pulse" : "bg-gray-400"
 )}/>
 <span className="font-semibold">{m.name}</span>
 <span className={cn(
 "font-bold tabular-nums",
 m.silentHours >= 4 ? "text-red-600 dark:text-red-400" : "text-yellow-600 dark:text-yellow-400"
 )}>
 {m.silentHours}h sin explicar
 </span>
 {m.isOnline && (
 <span className="text-[9px] text-red-500 font-semibold">EN LINEA</span>
 )}
 </div>
 ))}
 </div>
 </div>
 );
}
