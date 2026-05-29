"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LiveStatus, Profile } from "@/lib/types/database";
import { LIVE_STATUS_CONFIG } from "@/lib/constants";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, timeAgo } from "@/lib/utils";

type StatusWithProfile = LiveStatus & { profiles: Profile };

export function LiveStatusBar({ orgId }: { orgId: string }) {
 const [statuses, setStatuses] = useState<StatusWithProfile[]>([]);
 const supabase = createClient();

 useEffect(() => {
 async function fetch() {
 const { data } = await supabase
 .from("live_status")
 .select("*, profiles(*)")
 .eq("org_id", orgId)
 ;
 setStatuses(data ?? []);
 }
 fetch();

 const channel = supabase
 .channel(`live_status_rt_${orgId}`)
 .on("postgres_changes", {
 event:"*",
 schema:"public",
 table:"live_status",
 filter:`org_id=eq.${orgId}`,
 }, () => fetch())
 .subscribe();

 return () => { supabase.removeChannel(channel); };
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 if (statuses.length === 0) return null;

 // Treat stale heartbeats (>5 min) as offline regardless of stored status
 const STALE_MS = 5 * 60 * 1000;
 const now = Date.now();
 const corrected = statuses.map((s) => {
 const heartbeatAge = now - new Date(s.last_heartbeat).getTime();
 if (s.status !=="offline"&& heartbeatAge > STALE_MS) {
 return { ...s, status:"offline"as const };
 }
 return s;
 });

 const online = corrected.filter((s) => s.status !=="offline");
 const offline = corrected.filter((s) => s.status ==="offline");

 return (
 <div className="border border-border bg-card/60 p-4 mb-8 corner-marks">
 <div className="flex items-center justify-between mb-3 relative z-10">
 <h3 className="text-[10px] font-mono font-bold tracking-[0.15em] uppercase flex items-center gap-2.5 text-foreground">
 <span className="relative flex h-2 w-2">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"/>
 <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500 shadow-[0_0_6px] shadow-green-500/50"/>
 </span>
 En vivo ahora
 </h3>
 <span className="text-[10px] font-mono text-muted-foreground tabular-nums tracking-wide">
 {online.length} activos / {offline.length} offline
 </span>
 </div>
 <div className="flex flex-wrap gap-1.5 relative z-10">
 {corrected.map((s) => {
 const config = LIVE_STATUS_CONFIG[s.status];
 return (
 <div
 key={s.user_id}
 className={cn(
"flex items-center gap-2 px-2.5 py-2 text-sm transition-all duration-200 border",
 s.status ==="offline"?"bg-muted/20 border-border/30 opacity-35":"bg-accent/30 border-border/50 hover:border-primary/30")}
 >
 <div className="relative">
 <Avatar className="w-7 h-7 ring-1 ring-border">
 <AvatarImage src={s.profiles?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px] font-mono font-bold bg-muted">
 {getInitials(s.profiles?.full_name)}
 </AvatarFallback>
 </Avatar>
 <div
 className={cn(
"absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-[1.5px] border-card",
 config.dotColor,
 s.status !=="offline"&&"shadow-[0_0_4px] shadow-current")}
 />
 </div>
 <div className="min-w-0">
 <p className="text-[11px] font-mono font-semibold truncate">
 {s.profiles?.full_name?.split("")[0] ??"?"}
 </p>
 {s.current_task && s.status !=="offline"? (
 <p className="text-[9px] font-mono text-muted-foreground truncate max-w-[120px]">
 {s.current_task}
 </p>
 ) : (
 <p className={cn("text-[9px] font-mono font-medium", config.color)}>{config.label}</p>
 )}
 </div>
 {s.status !=="offline"&& (
 <span className="text-[9px] font-mono text-muted-foreground tabular-nums ml-1">
 {timeAgo(s.started_at)}
 </span>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
}
