"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS, WORK_HOURS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { TrendingDown, AlertTriangle, Eye, Skull, ChevronDown, ShieldAlert } from "lucide-react";

interface FearData {
 trustScore: number;
 teamAvgScore: number;
 hoursToday: number;
 hasProof: boolean;
 hasStandup: boolean;
 hasCloseout: boolean;
 pendingPenalties: { label: string; points: number; deadline: string; urgent: boolean }[];
 projectedLoss: number;
 daysToZero: number;
}

export function FearWidget({ orgId }: { orgId: string }) {
 const [data, setData] = useState<FearData | null>(null);
 const [expanded, setExpanded] = useState(false);
 const supabase = createClient();
 const today = new Date().toISOString().split("T")[0];
 const currentHour = new Date().getHours();

 useEffect(() => {
 async function load() {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;

 const [{ data: trustHistory }, { data: teamScores }, { data: entries }, { data: standup }, { data: closeout }] = await Promise.all([
 supabase.from("trust_score_history").select("score")
 .eq("user_id", user.id).eq("org_id", orgId)
 .order("date", { ascending: false }).limit(1).single(),
 supabase.from("trust_score_history").select("score")
 .eq("org_id", orgId).eq("date", today),
 supabase.from("time_entries").select("proof_urls")
 .eq("user_id", user.id).eq("date", today),
 supabase.from("standups").select("id")
 .eq("user_id", user.id).eq("date", today).limit(1).single(),
 supabase.from("daily_closeouts").select("id")
 .eq("user_id", user.id).eq("date", today).limit(1).single(),
 ]);

 const score = trustHistory?.score ?? 75;
 const scores = teamScores?.map((s) => s.score) ?? [];
 const teamAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 75;

 const hoursToday = entries?.length ?? 0;
 const withProof = entries?.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length ?? 0;
 const hasProof = hoursToday > 0 && withProof === hoursToday;

 // Calculate pending penalties
 const penalties: FearData["pendingPenalties"] = [];
 let projectedLoss = 0;

 if (hoursToday < EXPECTED_DAILY_HOURS && currentHour >= 12) {
 const pts = 5;
 projectedLoss += pts;
 penalties.push({
 label:`${EXPECTED_DAILY_HOURS - hoursToday}h sin registrar`,
 points: pts,
 deadline:"11:59 PM",
 urgent: currentHour >= 16,
 });
 }

 if (!standup && currentHour >= 10) {
 projectedLoss += 2;
 penalties.push({
 label:"Sin standup",
 points: 2,
 deadline: currentHour >= 12 ?"YA VENCIÓ":"12:00 PM",
 urgent: currentHour >= 11,
 });
 }

 if (!closeout && currentHour >= 17) {
 projectedLoss += 2;
 penalties.push({
 label:"Sin cierre del día",
 points: 2,
 deadline:"11:59 PM",
 urgent: currentHour >= 19,
 });
 }

 if (hoursToday > 0 && !hasProof) {
 projectedLoss += 3;
 penalties.push({
 label:`${hoursToday - withProof} entradas sin evidencia`,
 points: 3,
 deadline:"11:59 PM",
 urgent: false,
 });
 }

 const daysToZero = projectedLoss > 0 ? Math.ceil(score / projectedLoss) : 999;

 setData({
 trustScore: score,
 teamAvgScore: teamAvg,
 hoursToday,
 hasProof,
 hasStandup: !!standup,
 hasCloseout: !!closeout,
 pendingPenalties: penalties,
 projectedLoss,
 daysToZero,
 });
 }
 load();

 const interval = setInterval(load, 120000); // every 2min
 return () => clearInterval(interval);
 }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

 if (!data || data.pendingPenalties.length === 0) return null;

 const isDanger = data.projectedLoss >= 5;
 const isCritical = data.trustScore <= 30 || data.daysToZero <= 7;

 return (
 <div className={cn(
"border p-4 mb-8 transition-all duration-300",
 isCritical
 ?"bg-red-500/5 border-red-500/50 animate-danger-pulse": isDanger
 ?"bg-red-500/3 border-red-500/25":"bg-yellow-500/3 border-yellow-500/20")}>
 {/* Header */}
 <button
 onClick={() => setExpanded(!expanded)}
 className="flex items-center justify-between w-full text-left cursor-pointer">
 <div className="flex items-center gap-3">
 <div className={cn(
"w-9 h-9 border flex items-center justify-center",
 isCritical
 ?"border-red-500/40 bg-red-500/10": isDanger
 ?"border-red-500/25 bg-red-500/5":"border-yellow-500/25 bg-yellow-500/5")}>
 {isCritical ? (
 <Skull className="w-4 h-4 text-red-500 animate-countdown-tick"/>
 ) : (
 <TrendingDown className={cn("w-4 h-4", isDanger ?"text-red-500":"text-yellow-500")} />
 )}
 </div>
 <div>
 <div className="flex items-center gap-2">
 <span className={cn(
"text-[11px] font-mono font-bold uppercase tracking-[0.1em]",
 isCritical ?"text-red-500": isDanger ?"text-red-400":"text-yellow-500")}>
 {isCritical ?"TRUST SCORE EN RIESGO EXTREMO":`−${data.projectedLoss} puntos pendientes`}
 </span>
 </div>
 <p className="text-[9px] font-mono text-muted-foreground">
 Trust Score: <span className="font-bold tabular-nums text-foreground">{data.trustScore}</span>
 {data.trustScore < data.teamAvgScore && (
 <span className="text-red-500"> ({data.teamAvgScore - data.trustScore}pts debajo)</span>
 )}
 </p>
 </div>
 </div>

 <div className="flex items-center gap-2">
 <div className={cn(
"text-[11px] font-mono font-black px-2.5 py-1 tabular-nums tracking-tight border",
 isCritical
 ?"border-red-500/40 text-red-500 bg-red-500/10":"border-orange-500/25 text-orange-400 bg-orange-500/5")}>
 {data.trustScore} → {Math.max(0, data.trustScore - data.projectedLoss)}
 </div>
 <ChevronDown className={cn(
"w-3.5 h-3.5 text-muted-foreground transition-transform",
 expanded &&"rotate-180")} />
 </div>
 </button>

 {/* Expanded penalties */}
 {expanded && (
 <div className="mt-4 space-y-1.5">
 {data.pendingPenalties.map((penalty, i) => (
 <div
 key={i}
 className={cn(
"flex items-center justify-between px-3 py-2 text-[11px] font-mono border",
 penalty.urgent
 ?"bg-red-500/5 border-red-500/20":"bg-muted/20 border-border/30")}
 >
 <div className="flex items-center gap-2">
 {penalty.urgent ? (
 <AlertTriangle className="w-3 h-3 text-red-500"/>
 ) : (
 <ShieldAlert className="w-3 h-3 text-yellow-500"/>
 )}
 <span className="font-medium">{penalty.label}</span>
 </div>
 <div className="flex items-center gap-3">
 <span className={cn(
"font-bold tabular-nums",
 penalty.urgent ?"text-red-500":"text-muted-foreground")}>
 {penalty.deadline}
 </span>
 <span className="font-black text-red-500 tabular-nums">−{penalty.points}</span>
 </div>
 </div>
 ))}

 {/* Days to zero projection */}
 {data.daysToZero <= 30 && (
 <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-red-500/5 border border-red-500/30">
 <Skull className="w-3.5 h-3.5 text-red-500"/>
 <span className="text-[10px] font-mono font-bold text-red-500">
 A este ritmo, tu Trust Score llega a 0 en {data.daysToZero} días.
 </span>
 </div>
 )}

 {/* Surveillance reminder */}
 <div className="flex items-center gap-2 mt-2 text-[9px] font-mono text-muted-foreground">
 <Eye className="w-3 h-3 animate-eye-blink"/>
 <span>Tu equipo y administradores pueden ver este score en tiempo real.</span>
 </div>
 </div>
 )}
 </div>
 );
}
