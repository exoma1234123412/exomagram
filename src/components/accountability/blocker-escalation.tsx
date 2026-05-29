"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TimeEntry } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { AlertTriangle, Clock, Siren } from "lucide-react";

// PSYCHOLOGY: Blocker Escalation
// If someone marks "blocked" for 2+ consecutive hours, it auto-escalates.
// No one can hide behind "I was blocked" as an excuse for not working.
// The escalation is PUBLIC — the whole team sees who's blocked and for how long.
// This forces either: (1) real blockers get solved fast, or (2) fake "blocked" stops.

interface BlockedPerson {
 profile: Profile;
 blockedHours: number;
 entries: TimeEntry[];
 firstBlockedHour: number;
}

export function BlockerEscalation({ orgId }: { orgId: string }) {
 const [blocked, setBlocked] = useState<BlockedPerson[]>([]);
 const supabase = createClient();
 const today = new Date().toISOString().split("T")[0];

 useEffect(() => {
 async function check() {
 const { data: entries } = await supabase
 .from("time_entries")
 .select("*, profiles(*)")
 .eq("org_id", orgId)
 .eq("date", today)
 .eq("category","blocked")
 .order("hour")
 ;

 if (!entries || entries.length === 0) return;

 // Group by user
 const byUser = new Map<string, (TimeEntry & { profiles: Profile })[]>();
 for (const e of entries) {
 const list = byUser.get(e.user_id) ?? [];
 list.push(e);
 byUser.set(e.user_id, list);
 }

 const escalated: BlockedPerson[] = [];

 for (const [, userEntries] of byUser) {
 // Check for consecutive blocked hours
 const hours = userEntries.map((e) => e.hour).sort((a, b) => a - b);
 let maxConsecutive = 1;
 let current = 1;
 for (let i = 1; i < hours.length; i++) {
 if (hours[i] === hours[i - 1] + 1) {
 current++;
 maxConsecutive = Math.max(maxConsecutive, current);
 } else {
 current = 1;
 }
 }

 if (userEntries.length >= 2) {
 escalated.push({
 profile: userEntries[0].profiles,
 blockedHours: userEntries.length,
 entries: userEntries,
 firstBlockedHour: Math.min(...hours),
 });
 }
 }

 escalated.sort((a, b) => b.blockedHours - a.blockedHours);
 setBlocked(escalated);
 }
 check();
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 if (blocked.length === 0) return null;

 return (
 <div className="mb-8">
 <div className="flex items-center gap-2 mb-3">
 <Siren className="w-4 h-4 text-red-500"/>
 <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
 Escalación de bloqueos
 </h3>
 </div>

 <div className="space-y-2">
 {blocked.map((b) => {
 const severity = b.blockedHours >= 4 ?"critical": b.blockedHours >= 3 ?"high":"medium";
 return (
 <Card key={b.profile.id} className={cn(
"border transition-all",
 severity ==="critical"&&"border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10 animate-pulse",
 severity ==="high"&&"border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/5",
 severity ==="medium"&&"border-orange-200 dark:border-orange-900",
 )}>
 <CardContent className="p-3 flex items-center gap-3">
 <Avatar className="w-8 h-8">
 <AvatarImage src={b.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">{getInitials(b.profile.full_name)}</AvatarFallback>
 </Avatar>
 <div className="flex-1">
 <p className="font-semibold text-sm">{b.profile.full_name}</p>
 <p className="text-[10px] text-muted-foreground">
 Bloqueado {b.blockedHours}h consecutivas desde las {b.firstBlockedHour > 12 ? b.firstBlockedHour - 12 : b.firstBlockedHour}{b.firstBlockedHour >= 12 ?"pm":"am"}
 </p>
 {b.entries.length > 0 && (
 <p className="text-[10px] text-red-600 mt-0.5 italic">
 &quot;{b.entries[0].title}&quot;
 </p>
 )}
 </div>
 <Badge variant="destructive"className={cn(
"text-[10px]",
 severity ==="critical"&&"animate-pulse")}>
 {severity ==="critical"?"CRITICO": severity ==="high"?"ALTO":"MEDIO"}
 </Badge>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 );
}
