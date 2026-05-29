"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { WORK_HOURS, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { formatHour, formatHourShort, getTodayMTY } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export function MissingHoursAlert({ date }: { date: string }) {
 const [missingHours, setMissingHours] = useState<number[]>([]);
 const [totalLogged, setTotalLogged] = useState(0);
 const supabase = createClient();

 useEffect(() => {
 async function check() {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;

 const { data: membership } = await supabase
 .from("org_members")
 .select("org_id")
 .eq("user_id", user.id)
 .limit(1)
 .maybeSingle();

 if (!membership) return;

 const { data: entries } = await supabase
 .from("time_entries")
 .select("hour")
 .eq("user_id", user.id)
 .eq("org_id", membership.org_id)
 .eq("date", date);

 const loggedHours = new Set(entries?.map((e) => e.hour) ?? []);
 setTotalLogged(loggedHours.size);

 const now = new Date();
 const isToday = date === getTodayMTY();
 const currentHour = now.getHours();

 const missing = WORK_HOURS.filter((h) => {
 if (isToday && h >= currentHour) return false; // Don't flag future hours
 return !loggedHours.has(h);
 });

 setMissingHours(missing);
 }
 check();
 }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

 if (missingHours.length === 0) return null;

 return (
 <div className="bg-yellow-50/80 dark:bg-yellow-950/15 border border-yellow-200/60 dark:border-yellow-800/40 p-4 mb-8 shadow-yellow-500/5">
 <div className="flex items-start gap-3">
 <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center shrink-0">
 <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400"/>
 </div>
 <div>
 <p className="font-medium text-yellow-800 dark:text-yellow-300 text-sm">
 {missingHours.length} horas sin registrar
 </p>
 <p className="text-xs text-yellow-700/70 dark:text-yellow-400/70 mt-0.5">
 Faltan: {missingHours.map(formatHourShort).join(",")}
 </p>
 {totalLogged < EXPECTED_DAILY_HOURS && (
 <p className="text-xs text-yellow-700/70 dark:text-yellow-400/70 mt-1">
 Solo {totalLogged}/{EXPECTED_DAILY_HOURS} horas registradas hoy. Tu equipo puede ver esto.
 </p>
 )}
 </div>
 </div>
 </div>
 );
}
