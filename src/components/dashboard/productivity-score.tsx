"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { subDays } from "date-fns";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ProductivityData {
 score: number; // 0-100
 trend: number; // delta vs last week
 components: {
 output: number; // hours logged ratio
 quality: number; // proof rate
 focus: number; // deep work ratio
 consistency: number; // streak-based
 punctuality: number; // inverse late rate
 };
 decayApplied: boolean;
}

export function ProductivityScore({ orgId }: { orgId: string }) {
 const [data, setData] = useState<ProductivityData | null>(null);
 const supabase = createClient();

 useEffect(() => {
 async function load() {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;

 const now = new Date();
 const thisWeekStart = subDays(now, 7).toISOString().split("T")[0];
 const lastWeekStart = subDays(now, 14).toISOString().split("T")[0];
 const today = now.toISOString().split("T")[0];

 const [{ data: thisWeek }, { data: lastWeek }, { data: streak }] = await Promise.all([
 supabase
 .from("time_entries")
 .select("category, proof_urls, is_late")
 .eq("user_id", user.id)
 .eq("org_id", orgId)
 .gte("date", thisWeekStart),
 supabase
 .from("time_entries")
 .select("category, proof_urls, is_late")
 .eq("user_id", user.id)
 .eq("org_id", orgId)
 .gte("date", lastWeekStart)
 .lt("date", thisWeekStart),
 supabase
 .from("activity_streaks")
 .select("current_streak")
 .eq("user_id", user.id)
 .eq("org_id", orgId)
 .limit(1)
 .single(),
 ]);

 const tw = thisWeek ?? [];
 const lw = lastWeek ?? [];

 if (tw.length === 0 && lw.length === 0) return;

 const expectedWeekly = EXPECTED_DAILY_HOURS * 5;

 // This week components
 const output = Math.min(tw.length / expectedWeekly, 1) * 100;
 const withProof = tw.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
 const quality = tw.length > 0 ? (withProof.length / tw.length) * 100 : 0;
 const deepWork = tw.filter((e) => e.category ==="deep_work");
 const focus = tw.length > 0 ? (deepWork.length / tw.length) * 100 : 0;
 const currentStreak = streak?.current_streak ?? 0;
 const consistency = Math.min(currentStreak / 14, 1) * 100; // 14-day streak = 100%
 const lateEntries = tw.filter((e) => e.is_late);
 const punctuality = tw.length > 0 ? (1 - lateEntries.length / tw.length) * 100 : 100;

 // Weighted score
 const rawScore = (
 output * 0.25 +
 quality * 0.25 +
 focus * 0.2 +
 consistency * 0.15 +
 punctuality * 0.15
 );

 // Decay: reduce score if this week has significantly less output than last week
 let decayApplied = false;
 let finalScore = rawScore;
 if (lw.length > 0 && tw.length < lw.length * 0.6) {
 const decayFactor = tw.length / lw.length;
 finalScore = rawScore * decayFactor;
 decayApplied = true;
 }

 // Calculate last week's score for trend
 const lwOutput = Math.min(lw.length / expectedWeekly, 1) * 100;
 const lwProof = lw.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
 const lwQuality = lw.length > 0 ? (lwProof.length / lw.length) * 100 : 0;
 const lwDeep = lw.filter((e) => e.category ==="deep_work");
 const lwFocus = lw.length > 0 ? (lwDeep.length / lw.length) * 100 : 0;
 const lwLate = lw.filter((e) => e.is_late);
 const lwPunct = lw.length > 0 ? (1 - lwLate.length / lw.length) * 100 : 100;
 const lwScore = lwOutput * 0.25 + lwQuality * 0.25 + lwFocus * 0.2 + 50 * 0.15 + lwPunct * 0.15;

 setData({
 score: Math.round(finalScore),
 trend: Math.round(finalScore - lwScore),
 components: {
 output: Math.round(output),
 quality: Math.round(quality),
 focus: Math.round(focus),
 consistency: Math.round(consistency),
 punctuality: Math.round(punctuality),
 },
 decayApplied,
 });
 }
 load();
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 if (!data) return null;

 const scoreColor =
 data.score >= 80 ?"text-green-600":
 data.score >= 60 ?"text-blue-600":
 data.score >= 40 ?"text-yellow-600":"text-red-600";

 const ringColor =
 data.score >= 80 ?"stroke-green-500":
 data.score >= 60 ?"stroke-blue-500":
 data.score >= 40 ?"stroke-yellow-500":"stroke-red-500";

 const circumference = 2 * Math.PI * 36;
 const dashOffset = circumference - (data.score / 100) * circumference;

 const components = [
 { label:"Output", value: data.components.output },
 { label:"Calidad", value: data.components.quality },
 { label:"Focus", value: data.components.focus },
 { label:"Consist.", value: data.components.consistency },
 { label:"Puntual.", value: data.components.punctuality },
 ];

 return (
 <Card className="mb-4">
 <CardContent className="p-4 flex items-center gap-5">
 {/* Circular gauge */}
 <div className="relative w-20 h-20 shrink-0">
 <svg className="w-20 h-20 -rotate-90"viewBox="0 0 80 80">
 <circle cx="40"cy="40"r="36"fill="none"stroke="currentColor"strokeOpacity={0.1} strokeWidth={6} />
 <circle
 cx="40"cy="40"r="36"fill="none"className={ringColor}
 strokeWidth={6}
 strokeLinecap="round"strokeDasharray={circumference}
 strokeDashoffset={dashOffset}
 style={{ transition:"stroke-dashoffset 1s ease-out"}}
 />
 </svg>
 <div className="absolute inset-0 flex flex-col items-center justify-center">
 <span className={cn("text-lg font-bold tabular-nums", scoreColor)}>{data.score}</span>
 <span className="text-[8px] text-muted-foreground">PROD</span>
 </div>
 </div>

 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-2">
 <Activity className="w-4 h-4 text-primary"/>
 <span className="text-sm font-semibold">Productivity Score</span>
 {data.trend !== 0 && (
 <span className={cn("text-xs font-medium flex items-center gap-0.5",
 data.trend > 0 ?"text-green-600":"text-red-500")}>
 {data.trend > 0 ? <TrendingUp className="w-3 h-3"/> : <TrendingDown className="w-3 h-3"/>}
 {data.trend > 0 ?"+":""}{data.trend}
 </span>
 )}
 {data.decayApplied && (
 <span className="text-[10px] text-orange-600">(decay)</span>
 )}
 </div>

 {/* Component bars */}
 <div className="grid grid-cols-5 gap-1.5">
 {components.map((c) => (
 <div key={c.label} className="text-center">
 <div className="h-8 bg-muted/30 rounded-sm overflow-hidden flex flex-col justify-end">
 <div
 className={cn(
"rounded-t transition-all duration-700",
 c.value >= 70 ?"bg-green-400": c.value >= 40 ?"bg-yellow-400":"bg-red-400")}
 style={{ height:`${c.value}%`}}
 />
 </div>
 <span className="text-[8px] text-muted-foreground mt-0.5 block">{c.label}</span>
 </div>
 ))}
 </div>
 </div>
 </CardContent>
 </Card>
 );
}
