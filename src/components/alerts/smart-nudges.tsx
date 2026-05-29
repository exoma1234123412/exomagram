"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { AlertTriangle, Clock, Shield, FileCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Nudge {
 id: string;
 message: string;
 type:"warning"|"info"|"reminder";
 icon: React.ReactNode;
}

export function SmartNudges({ date }: { date: string }) {
 const [nudges, setNudges] = useState<Nudge[]>([]);
 const [dismissed, setDismissed] = useState<Set<string>>(new Set());
 const supabase = createClient();

 useEffect(() => {
 async function checkNudges() {
 const {
 data: { user },
 } = await supabase.auth.getUser();
 if (!user) return;

 const { data: membership } = await supabase
 .from("org_members")
 .select("org_id")
 .eq("user_id", user.id)
 .limit(1)
 .single();

 if (!membership) return;

 const now = new Date();
 const currentHour = now.getHours();
 const today = now.toISOString().split("T")[0];
 if (date !== today) return;

 // Get today's entries
 const { data: entries } = await supabase
 .from("time_entries")
 .select("hour, proof_urls, is_late")
 .eq("user_id", user.id)
 .eq("org_id", membership.org_id)
 .eq("date", today);

 // Get today's closeout
 const { data: closeout } = await supabase
 .from("daily_closeouts")
 .select("id")
 .eq("user_id", user.id)
 .eq("org_id", membership.org_id)
 .eq("date", today)
 .limit(1);

 const todayEntries = entries ?? [];
 const hoursLogged = todayEntries.length;
 const withoutProof = todayEntries.filter(
 (e) => !e.proof_urls || e.proof_urls.length === 0
 );
 const hasCloseout = closeout && closeout.length > 0;

 const newNudges: Nudge[] = [];

 // Nudge: low hours after 3pm
 if (currentHour >= 15 && hoursLogged < 4) {
 newNudges.push({
 id:"low_hours",
 message:`Son las ${currentHour}:00 y solo llevas ${hoursLogged} horas registradas.`,
 type:"warning",
 icon: <Clock className="w-4 h-4"/>,
 });
 }

 // Nudge: entries without proof
 if (withoutProof.length >= 3) {
 newNudges.push({
 id:"no_proof",
 message:`${withoutProof.length} entradas de hoy no tienen evidencia.`,
 type:"info",
 icon: <Shield className="w-4 h-4"/>,
 });
 }

 // Nudge: closeout reminder after 5pm
 if (currentHour >= 17 && !hasCloseout && hoursLogged > 0) {
 newNudges.push({
 id:"closeout",
 message:"No olvides hacer tu cierre del dia antes de irte.",
 type:"reminder",
 icon: <FileCheck className="w-4 h-4"/>,
 });
 }

 // Nudge: behind pace at midday
 if (currentHour >= 12 && currentHour < 15 && hoursLogged < 2) {
 newNudges.push({
 id:"midday_pace",
 message:`Vas ${hoursLogged}/${EXPECTED_DAILY_HOURS} horas. Considera ponerte al dia.`,
 type:"info",
 icon: <AlertTriangle className="w-4 h-4"/>,
 });
 }

 setNudges(newNudges);
 }

 checkNudges();
 }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

 const visibleNudges = nudges.filter((n) => !dismissed.has(n.id));
 if (visibleNudges.length === 0) return null;

 return (
 <div className="space-y-2.5 mb-8">
 {visibleNudges.map((nudge) => (
 <div
 key={nudge.id}
 className={cn(
"flex items-center gap-3 p-3.5 text-sm transition-all duration-300",
 nudge.type ==="warning"&&
"bg-orange-50/80 dark:bg-orange-950/15 text-orange-700 dark:text-orange-400 border border-orange-200/60 dark:border-orange-800/40 shadow-orange-500/5",
 nudge.type ==="info"&&
"bg-blue-50/80 dark:bg-blue-950/15 text-blue-700 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40 shadow-blue-500/5",
 nudge.type ==="reminder"&&
"bg-blue-50/80 dark:bg-blue-950/15 text-blue-700 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40 shadow-blue-600/5")}
 >
 {nudge.icon}
 <span className="flex-1">{nudge.message}</span>
 <button
 onClick={() => setDismissed((prev) => new Set(prev).add(nudge.id))}
 className="opacity-50 hover:opacity-100">
 <X className="w-4 h-4"/>
 </button>
 </div>
 ))}
 </div>
 );
}
