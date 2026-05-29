"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, AiDailyInsight } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { Brain } from "lucide-react";
import { TabLoading, TabEmpty, gradeStyle } from "./shared";

export function TabAI({ orgId }: { orgId: string }) {
 const supabase = createClient();
 const today = getTodayMTY();
 const yesterdayStr = format(subDays(new Date(), 1),"yyyy-MM-dd");

 const [insights, setInsights] = useState<(AiDailyInsight & { profiles?: Profile })[]>([]);
 const [loading, setLoading] = useState(true);

 const loadData = useCallback(async () => {
 const { data } = await supabase
 .from("ai_daily_insights")
 .select("*, profiles(*)")
 .eq("org_id", orgId)
 .gte("date", yesterdayStr)
 .lte("date", today)
 .order("date", { ascending: false });

 setInsights((data ?? []) as (AiDailyInsight & { profiles?: Profile })[]);
 setLoading(false);
 }, [orgId, today, yesterdayStr]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => { loadData(); }, [loadData]);

 if (loading) return <TabLoading />;
 if (insights.length === 0) return <TabEmpty icon={Brain} text="Sin insights de AI para hoy o ayer."/>;

 const byUser = new Map<string, (AiDailyInsight & { profiles?: Profile })[]>();
 for (const ins of insights) {
 const uid = ins.user_id;
 if (!byUser.has(uid)) byUser.set(uid, []);
 byUser.get(uid)!.push(ins);
 }

 return (
 <div>
 <div className="palantir-divider text-muted-foreground mb-4">
 <Brain className="w-3 h-3"/>
 Insights AI — Últimas 48h
 </div>

 <div className="space-y-3">
 {Array.from(byUser.entries()).map(([uid, userInsights]) => {
 const latest = userInsights[0];
 const insightData = latest.insight as Record<string, unknown>;
 const grade = (insightData.grade as string) ?? null;
 const summary = (insightData.summary as string) ?? (insightData.resumen as string) ?? (insightData.verdict as string) ?? null;
 const keyInsight = (insightData.key_insight as string) ?? (insightData.insight_clave as string) ?? (insightData.recommendation as string) ?? null;
 const profile = latest.profiles;

 return (
 <div key={uid} className="card-palantir p-4">
 <div className="flex items-center gap-3 mb-2">
 <Avatar className="w-7 h-7 ring-1 ring-border">
 <AvatarImage src={profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px] font-mono">{getInitials(profile?.full_name ?? null)}</AvatarFallback>
 </Avatar>
 <span className="font-mono text-xs font-semibold">{profile?.full_name ??"?"}</span>
 <span className="font-mono text-[9px] text-muted-foreground ml-auto">{latest.date}</span>
 {grade && <span className={cn("font-mono text-lg font-black", gradeStyle(grade).color)}>{grade}</span>}
 </div>
 {summary && <p className="text-xs font-mono text-foreground mb-1.5">{summary}</p>}
 {keyInsight && <p className="text-[10px] font-mono text-muted-foreground border-l-2 border-primary/30 pl-2">{keyInsight}</p>}
 {latest.recommendation && !keyInsight && <p className="text-[10px] font-mono text-primary/70 mt-1">{latest.recommendation}</p>}
 </div>
 );
 })}
 </div>
 </div>
 );
}
