"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, AccountabilityFlag, AuditLottery } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import { FLAG_TYPES } from "@/lib/constants";
import { format, subDays } from "date-fns";
import { Eye, FileSearch, CheckCircle2, AlertTriangle } from "lucide-react";
import { TabLoading, TabEmpty, StatBox } from "./shared";

export function TabAuditoria({ orgId }: { orgId: string }) {
 const supabase = createClient();
 const thirtyDaysAgo = format(subDays(new Date(), 30),"yyyy-MM-dd");

 const [lotteries, setLotteries] = useState<(AuditLottery & { profiles?: Profile })[]>([]);
 const [flags, setFlags] = useState<(AccountabilityFlag & { profiles?: Profile })[]>([]);
 const [loading, setLoading] = useState(true);

 const loadData = useCallback(async () => {
 const [{ data: lotteryData }, { data: flagData }] = await Promise.all([
 supabase.from("audit_lotteries").select("*, profiles:selected_user_id(full_name, avatar_url)").eq("org_id", orgId).gte("date", thirtyDaysAgo).order("date", { ascending: false }).limit(20),
 supabase.from("accountability_flags").select("*, profiles:user_id(full_name, avatar_url)").eq("org_id", orgId).gte("created_at", thirtyDaysAgo +"T00:00:00").order("created_at", { ascending: false }).limit(30),
 ]);

 setLotteries((lotteryData ?? []) as (AuditLottery & { profiles?: Profile })[]);
 setFlags((flagData ?? []) as (AccountabilityFlag & { profiles?: Profile })[]);
 setLoading(false);
 }, [orgId, thirtyDaysAgo]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => { loadData(); }, [loadData]);

 if (loading) return <TabLoading />;

 const totalAudits = lotteries.length;
 const passed = lotteries.filter((l) => l.status ==="passed").length;
 const passRate = totalAudits > 0 ? Math.round((passed / totalAudits) * 100) : 0;
 const totalFlags = flags.length;
 const unresolvedFlags = flags.filter((f) => !f.resolved).length;

 return (
 <div>
 <div className="palantir-divider text-muted-foreground mb-4">
 <Eye className="w-3 h-3"/>
 Auditorías y flags — Últimos 30 días
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
 <StatBox label="Auditorías"value={totalAudits} />
 <StatBox label="Pass Rate"value={`${passRate}%`} />
 <StatBox label="Total Flags"value={totalFlags} alert={totalFlags > 0} />
 <StatBox label="Sin resolver"value={unresolvedFlags} alert={unresolvedFlags > 0} />
 </div>

 {lotteries.length > 0 && (
 <section className="mb-8">
 <span className="label-mono text-muted-foreground mb-3 block">Lotería de auditoría</span>
 <div className="space-y-2">
 {lotteries.map((l) => {
 const profile = l.profiles as unknown as { full_name: string | null; avatar_url: string | null } | null;
 return (
 <div key={l.id} className="card-palantir p-3 flex items-center gap-3">
 <Avatar className="w-6 h-6 ring-1 ring-border">
 <AvatarImage src={profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[7px] font-mono">{getInitials(profile?.full_name ?? null)}</AvatarFallback>
 </Avatar>
 <span className="font-mono text-[10px] font-semibold">{profile?.full_name ??"?"}</span>
 <span className="font-mono text-[9px] text-muted-foreground">{l.date}</span>
 <Badge variant="outline"className={cn("text-[8px] font-mono h-4 ml-auto",
 l.status ==="passed"?"border-green-400 text-green-600":
 l.status ==="failed"?"border-red-400 text-red-600":
"border-border text-muted-foreground")}>
 {l.status ==="passed"?"PASSED": l.status ==="failed"?"FAILED": l.status ==="auditing"?"EN CURSO":"PENDIENTE"}
 </Badge>
 </div>
 );
 })}
 </div>
 </section>
 )}

 {flags.length > 0 && (
 <section>
 <span className="label-mono text-muted-foreground mb-3 block">Flags recientes</span>
 <div className="space-y-2">
 {flags.map((f) => {
 const profile = f.profiles as unknown as { full_name: string | null; avatar_url: string | null } | null;
 const cfg = FLAG_TYPES[f.flag_type as keyof typeof FLAG_TYPES];
 return (
 <div key={f.id} className="card-palantir p-3 flex items-center gap-3">
 <span className="text-sm">{cfg?.emoji ??"?"}</span>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <span className="font-mono text-[10px] font-semibold">{profile?.full_name ??"?"}</span>
 <Badge variant="outline"className={cn("text-[7px] font-mono h-3.5",
 cfg?.severity ==="high"?"border-red-400 text-red-500":
 cfg?.severity ==="medium"?"border-amber-400 text-amber-500":
"border-border text-muted-foreground")}>{cfg?.label ?? f.flag_type}</Badge>
 </div>
 {f.details && <p className="text-[9px] font-mono text-muted-foreground truncate mt-0.5">{f.details}</p>}
 </div>
 <div className="flex items-center gap-2 shrink-0">
 <span className="font-mono text-[8px] text-muted-foreground">{f.date}</span>
 {f.resolved ? <CheckCircle2 className="w-3 h-3 text-green-500"/> : <AlertTriangle className="w-3 h-3 text-amber-500"/>}
 </div>
 </div>
 );
 })}
 </div>
 </section>
 )}

 {lotteries.length === 0 && flags.length === 0 && (
 <TabEmpty icon={FileSearch} text="Sin auditorías ni flags en los últimos 30 días."/>
 )}
 </div>
 );
}
