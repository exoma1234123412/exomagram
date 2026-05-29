"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, LiveStatus } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY, timeAgo } from "@/lib/utils";
import { LIVE_STATUS_CONFIG } from "@/lib/constants";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { Users, Ghost, Timer } from "lucide-react";
import { TabLoading, TabEmpty, StatBox } from "./shared";

interface MemberData {
 profile: Profile;
 hoursToday: number;
 trustScore: number | null;
 lastActivity: string | null;
 liveStatus: LiveStatus | null;
 isGhost: boolean;
 isDeadman: boolean;
}

export function TabEquipo({ orgId }: { orgId: string; userId: string }) {
 const [members, setMembers] = useState<MemberData[]>([]);
 const [loading, setLoading] = useState(true);
 const supabase = createClient();
 const today = getTodayMTY();

 const loadData = useCallback(async () => {
 const [
 { data: memberData },
 { data: entries },
 { data: trustData },
 { data: liveData },
 ] = await Promise.all([
 supabase.from("org_members").select("user_id, profiles(*)").eq("org_id", orgId),
 supabase.from("time_entries").select("user_id, hour, logged_at").eq("org_id", orgId).eq("date", today),
 supabase.from("trust_score_history").select("user_id, score, date").eq("org_id", orgId)
 .gte("date", format(subDays(new Date(), 7),"yyyy-MM-dd")).order("date", { ascending: false }),
 supabase.from("live_status").select("*").eq("org_id", orgId),
 ]);

 if (!memberData) { setLoading(false); return; }

 const hoursMap = new Map<string, number>();
 const lastActivityMap = new Map<string, string>();
 for (const e of entries ?? []) {
 hoursMap.set(e.user_id, (hoursMap.get(e.user_id) ?? 0) + 1);
 const existing = lastActivityMap.get(e.user_id);
 if (!existing || e.logged_at > existing) lastActivityMap.set(e.user_id, e.logged_at);
 }

 const trustMap = new Map<string, number>();
 for (const t of trustData ?? []) {
 if (!trustMap.has(t.user_id)) trustMap.set(t.user_id, t.score);
 }

 const liveMap = new Map<string, LiveStatus>();
 for (const l of liveData ?? []) liveMap.set(l.user_id, l as LiveStatus);

 const now = new Date();
 const nowHour = new Date().toLocaleString("en-US", { timeZone:"America/Monterrey", hour:"numeric", hour12: false });
 const currentHour = parseInt(nowHour, 10);

 const result: MemberData[] = memberData.map((m) => {
 const profile = m.profiles as unknown as Profile;
 const hours = hoursMap.get(m.user_id) ?? 0;
 const lastAct = lastActivityMap.get(m.user_id) ?? null;
 const live = liveMap.get(m.user_id) ?? null;

 const lastEntryTime = lastAct ? new Date(lastAct) : null;
 const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
 const isGhost = !lastEntryTime || lastEntryTime < twoDaysAgo;

 const isWorkHours = currentHour >= 8 && currentHour < 18;
 const heartbeat = live?.last_heartbeat ? new Date(live.last_heartbeat) : null;
 const hoursSinceHeartbeat = heartbeat ? (now.getTime() - heartbeat.getTime()) / (1000 * 60 * 60) : Infinity;
 const isDeadman = isWorkHours && hours === 0 && currentHour >= 12 && hoursSinceHeartbeat > 4;

 return { profile, hoursToday: hours, trustScore: trustMap.get(m.user_id) ?? null, lastActivity: lastAct, liveStatus: live, isGhost, isDeadman };
 });

 result.sort((a, b) => {
 const aAlert = (a.isGhost || a.isDeadman) ? 1 : 0;
 const bAlert = (b.isGhost || b.isDeadman) ? 1 : 0;
 if (aAlert !== bAlert) return bAlert - aAlert;
 return b.hoursToday - a.hoursToday;
 });

 setMembers(result);
 setLoading(false);
 }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 loadData();
 const channel = supabase.channel("intel_equipo_rt")
 .on("postgres_changes", { event:"*", schema:"public", table:"time_entries", filter:`org_id=eq.${orgId}`}, () => { loadData(); })
 .subscribe();
 return () => { supabase.removeChannel(channel); };
 }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

 if (loading) return <TabLoading />;
 if (members.length === 0) return <TabEmpty icon={Users} text="No hay miembros en este equipo."/>;

 function statusDot(m: MemberData) {
 if (m.isGhost) return"bg-gray-400";
 if (m.isDeadman) return"bg-red-500 animate-pulse";
 const status = m.liveStatus?.status ??"offline";
 return LIVE_STATUS_CONFIG[status]?.dotColor ??"bg-gray-400";
 }

 return (
 <div>
 <div className="palantir-divider text-muted-foreground mb-4">
 Estado del equipo — {format(new Date(),"d MMM yyyy", { locale: es })}
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
 <StatBox label="Miembros"value={members.length} />
 <StatBox label="Horas hoy"value={members.reduce((s, m) => s + m.hoursToday, 0)} />
 <StatBox label="Fantasmas"value={members.filter((m) => m.isGhost).length} alert />
 <StatBox label="Deadman"value={members.filter((m) => m.isDeadman).length} alert />
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
 {members.map((m) => (
 <div key={m.profile.id} className={cn("card-palantir p-4 relative", (m.isGhost || m.isDeadman) &&"animate-border-pulse")}>
 {(m.isGhost || m.isDeadman) && <div className="corner-marks absolute inset-0 pointer-events-none"/>}
 <div className="flex items-start gap-3">
 <div className="relative">
 <Avatar className="w-9 h-9 ring-1 ring-border">
 <AvatarImage src={m.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[10px] font-mono">{getInitials(m.profile.full_name)}</AvatarFallback>
 </Avatar>
 <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background", statusDot(m))} />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <span className="font-mono text-xs font-semibold truncate">{m.profile.full_name ?? m.profile.email}</span>
 {m.isGhost && (
 <Badge variant="outline"className="text-[8px] font-mono h-4 px-1.5 border-gray-400 text-gray-500">
 <Ghost className="w-2.5 h-2.5 mr-0.5"/>GHOST
 </Badge>
 )}
 {m.isDeadman && (
 <Badge variant="outline"className="text-[8px] font-mono h-4 px-1.5 border-red-400 text-red-500">
 <Timer className="w-2.5 h-2.5 mr-0.5"/>DEADMAN
 </Badge>
 )}
 </div>
 <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
 <span>
 <span className="data-number text-base text-foreground">{m.hoursToday}</span>
 <span className="ml-0.5">hrs</span>
 </span>
 {m.trustScore !== null && (
 <span>
 Trust{" "}
 <span className={cn("data-number text-base",
 m.trustScore >= 80 ?"text-green-600 dark:text-green-400":
 m.trustScore >= 50 ?"text-amber-600 dark:text-amber-400":
"text-red-600 dark:text-red-400")}>{m.trustScore}</span>
 </span>
 )}
 {m.lastActivity && <span className="text-muted-foreground/60">{timeAgo(m.lastActivity)}</span>}
 </div>
 {m.liveStatus && m.liveStatus.status !=="offline"&& m.liveStatus.current_task && (
 <p className="text-[9px] font-mono text-muted-foreground/60 mt-1 truncate">{m.liveStatus.current_task}</p>
 )}
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 );
}
