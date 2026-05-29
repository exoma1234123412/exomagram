"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TrustScoreHistory, AccountabilityFlag } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import { FLAG_TYPES } from "@/lib/constants";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { Shield, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { TabLoading, TabEmpty } from "./shared";

interface VigilanceMember {
 profile: Profile;
 trustHistory: TrustScoreHistory[];
 currentScore: number | null;
 delta7d: number | null;
 avgMood: number | null;
 avgEnergy: number | null;
 activeFlags: AccountabilityFlag[];
}

export function TabVigilancia({ orgId }: { orgId: string }) {
 const supabase = createClient();
 const [members, setMembers] = useState<VigilanceMember[]>([]);
 const [loading, setLoading] = useState(true);
 const sevenDaysAgo = format(subDays(new Date(), 7),"yyyy-MM-dd");
 const today = getTodayMTY();

 const loadData = useCallback(async () => {
 const [{ data: memberData }, { data: trustData }, { data: flagData }, { data: entryData }] = await Promise.all([
 supabase.from("org_members").select("user_id, profiles(*)").eq("org_id", orgId),
 supabase.from("trust_score_history").select("*").eq("org_id", orgId).gte("date", sevenDaysAgo).lte("date", today).order("date", { ascending: true }),
 supabase.from("accountability_flags").select("*").eq("org_id", orgId).eq("resolved", false).order("created_at", { ascending: false }),
 supabase.from("time_entries").select("user_id, mood, energy").eq("org_id", orgId).gte("date", sevenDaysAgo).lte("date", today),
 ]);

 if (!memberData) { setLoading(false); return; }

 const result: VigilanceMember[] = memberData.map((m) => {
 const profile = m.profiles as unknown as Profile;
 const uid = m.user_id;
 const userTrust = (trustData ?? []).filter((t) => t.user_id === uid) as TrustScoreHistory[];
 const current = userTrust.length > 0 ? userTrust[userTrust.length - 1].score : null;
 const oldest = userTrust.length > 1 ? userTrust[0].score : null;
 const delta = current !== null && oldest !== null ? current - oldest : null;
 const flags = (flagData ?? []).filter((f) => f.user_id === uid) as AccountabilityFlag[];
 const userEntries = (entryData ?? []).filter((e) => e.user_id === uid);
 const moods = userEntries.filter((e) => e.mood).map((e) => e.mood as number);
 const energies = userEntries.filter((e) => e.energy).map((e) => e.energy as number);
 const avgMood = moods.length > 0 ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null;
 const avgEnergy = energies.length > 0 ? Math.round((energies.reduce((a, b) => a + b, 0) / energies.length) * 10) / 10 : null;
 return { profile, trustHistory: userTrust, currentScore: current, delta7d: delta, avgMood, avgEnergy, activeFlags: flags };
 });

 result.sort((a, b) => {
 if (a.activeFlags.length !== b.activeFlags.length) return b.activeFlags.length - a.activeFlags.length;
 return (a.currentScore ?? 0) - (b.currentScore ?? 0);
 });

 setMembers(result);
 setLoading(false);
 }, [orgId, sevenDaysAgo, today]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => { loadData(); }, [loadData]);

 if (loading) return <TabLoading />;
 if (members.length === 0) return <TabEmpty icon={Shield} text="No hay datos de vigilancia."/>;

 const days: string[] = [];
 for (let i = 6; i >= 0; i--) days.push(format(subDays(new Date(), i),"yyyy-MM-dd"));

 return (
 <div>
 <div className="palantir-divider text-muted-foreground mb-4">
 <Shield className="w-3 h-3"/>
 Trust Score y salud — Últimos 7 días
 </div>

 <div className="space-y-3">
 {members.map((m) => {
 const trustByDate = new Map<string, number>();
 for (const t of m.trustHistory) trustByDate.set(t.date, t.score);

 return (
 <div key={m.profile.id} className="card-palantir p-4">
 <div className="flex items-center gap-3 mb-3">
 <Avatar className="w-7 h-7 ring-1 ring-border">
 <AvatarImage src={m.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px] font-mono">{getInitials(m.profile.full_name)}</AvatarFallback>
 </Avatar>
 <span className="font-mono text-xs font-semibold">{m.profile.full_name ?? m.profile.email}</span>
 <div className="ml-auto flex items-center gap-3 text-[10px] font-mono">
 {m.avgMood !== null && <span className="text-muted-foreground">Mood <span className="data-number text-sm text-foreground">{m.avgMood}</span></span>}
 {m.avgEnergy !== null && <span className="text-muted-foreground">Energy <span className="data-number text-sm text-foreground">{m.avgEnergy}</span></span>}
 </div>
 </div>

 <div className="flex items-end gap-1 h-10 mb-2">
 {days.map((day) => {
 const score = trustByDate.get(day);
 const height = score ?`${Math.max(score, 5)}%`:"2%";
 const color = score ? (score >= 80 ?"bg-green-500": score >= 50 ?"bg-amber-500":"bg-red-500") :"bg-border";
 return (
 <div key={day} className="flex-1 flex flex-col items-center gap-0.5">
 <div className="w-full relative"style={{ height:"40px"}}>
 <div className={cn("absolute bottom-0 w-full transition-all duration-500", color)} style={{ height }} />
 </div>
 <span className="text-[7px] font-mono text-muted-foreground">{format(new Date(day +"T12:00:00"),"EEE", { locale: es }).slice(0, 2)}</span>
 </div>
 );
 })}
 </div>

 <div className="flex items-center gap-3">
 {m.currentScore !== null && (
 <span className={cn("data-number text-xl",
 m.currentScore >= 80 ?"text-green-600 dark:text-green-400":
 m.currentScore >= 50 ?"text-amber-600 dark:text-amber-400":
"text-red-600 dark:text-red-400")}>{m.currentScore}</span>
 )}
 {m.delta7d !== null && (
 <span className={cn("flex items-center gap-0.5 font-mono text-[10px] font-semibold",
 m.delta7d > 0 ?"text-green-500": m.delta7d < 0 ?"text-red-500":"text-muted-foreground")}>
 {m.delta7d > 0 ? <TrendingUp className="w-3 h-3"/> : m.delta7d < 0 ? <TrendingDown className="w-3 h-3"/> : <Minus className="w-3 h-3"/>}
 {m.delta7d > 0 ?"+":""}{m.delta7d}
 </span>
 )}
 {m.activeFlags.length > 0 && (
 <div className="flex gap-1 ml-auto flex-wrap justify-end">
 {m.activeFlags.slice(0, 3).map((f) => {
 const cfg = FLAG_TYPES[f.flag_type as keyof typeof FLAG_TYPES];
 return (
 <Badge key={f.id} variant="outline"className={cn("text-[7px] font-mono h-4",
 cfg?.severity ==="high"?"border-red-400 text-red-500":
 cfg?.severity ==="medium"?"border-amber-400 text-amber-500":
"border-border text-muted-foreground")}>{cfg?.emoji} {cfg?.label ?? f.flag_type}</Badge>
 );
 })}
 {m.activeFlags.length > 3 && <span className="text-[8px] font-mono text-muted-foreground">+{m.activeFlags.length - 3}</span>}
 </div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 );
}
