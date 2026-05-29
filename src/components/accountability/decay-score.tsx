"use client";

// PSYCHOLOGY: Trust Score Decay
// Your trust score DECAYS by 5 points every day you don't log.
// Like a plant that dies without water.
// Loss aversion: losing 5 points feels worse than gaining 5 points.
// This creates a daily"must log"habit, not"should log"suggestion.
//
// Decay rates:
// - 0 hours logged: -5 points
// - No standup: -2 points
// - No closeout: -2 points
// - No proof on any entry: -3 points
// - 100% proof: +3 bonus points
// - Spot check missed: -10 points
//
// This makes the cost of NOT working higher than the cost of working.
// The rational choice becomes: just do the work and log it.

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingDown, Shield, AlertTriangle } from "lucide-react";

interface DecayInfo {
 currentScore: number;
 projectedScore: number; // what it'll be tomorrow if nothing changes
 dailyDecay: number;
 daysUntilZero: number;
 riskLevel:"safe"|"warning"|"danger";
}

export function DecayScoreWarning({ score, hasStandup, hasCloseout, hoursLogged, proofPercent }: {
 score: number;
 hasStandup: boolean;
 hasCloseout: boolean;
 hoursLogged: number;
 proofPercent: number;
}) {
 // Calculate projected decay
 let decay = 0;
 const penalties: string[] = [];

 if (hoursLogged === 0) {
 decay += 5;
 penalties.push("-5 sin horas");
 }
 if (!hasStandup) {
 decay += 2;
 penalties.push("-2 sin standup");
 }
 if (!hasCloseout && new Date().getHours() >= 17) {
 decay += 2;
 penalties.push("-2 sin cierre");
 }
 if (hoursLogged > 0 && proofPercent === 0) {
 decay += 3;
 penalties.push("-3 sin evidencia");
 }

 // Bonuses
 let bonus = 0;
 const bonuses: string[] = [];
 if (proofPercent === 100 && hoursLogged >= 6) {
 bonus += 3;
 bonuses.push("+3 evidencia 100%");
 }
 if (hasStandup && hasCloseout && hoursLogged >= 8) {
 bonus += 2;
 bonuses.push("+2 día completo");
 }

 const netChange = bonus - decay;
 const projectedScore = Math.max(0, Math.min(100, score + netChange));
 const daysUntilZero = decay > 0 ? Math.ceil(score / decay) : Infinity;

 if (netChange >= 0 && penalties.length === 0) return null; // All good, don't show

 return (
 <div className={cn(
"p-4 mb-6 border",
 netChange <= -5 ?"bg-red-50 dark:bg-red-950/15 border-red-200 dark:border-red-800": netChange < 0 ?"bg-yellow-50 dark:bg-yellow-950/15 border-yellow-200 dark:border-yellow-800":"bg-green-50 dark:bg-green-950/15 border-green-200 dark:border-green-800")}>
 <div className="flex items-start gap-3">
 {netChange < 0 ? (
 <TrendingDown className={cn("w-5 h-5 shrink-0 mt-0.5", netChange <= -5 ?"text-red-600":"text-yellow-600")} />
 ) : (
 <Shield className="w-5 h-5 text-green-600 shrink-0 mt-0.5"/>
 )}
 <div>
 <p className={cn(
"font-semibold text-sm",
 netChange <= -5 ?"text-red-700 dark:text-red-400": netChange < 0 ?"text-yellow-700 dark:text-yellow-400":"text-green-700 dark:text-green-400")}>
 {netChange < 0
 ?`Tu score caerá ${Math.abs(netChange)} puntos mañana`:`Tu score subirá ${netChange} puntos`}
 </p>
 <div className="flex flex-wrap gap-2 mt-1.5">
 {penalties.map((p) => (
 <span key={p} className="text-[10px] text-red-600/80 bg-red-100/50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">
 {p}
 </span>
 ))}
 {bonuses.map((b) => (
 <span key={b} className="text-[10px] text-green-600/80 bg-green-100/50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">
 {b}
 </span>
 ))}
 </div>
 {daysUntilZero <= 7 && netChange < 0 && (
 <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
 <AlertTriangle className="w-3 h-3"/>
 A este ritmo, tu score llega a 0 en {daysUntilZero} días
 </p>
 )}
 </div>
 </div>
 </div>
 );
}
