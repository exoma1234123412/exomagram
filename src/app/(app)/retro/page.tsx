"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
 Brain,
 Loader2,
 TrendingUp,
 TrendingDown,
 Minus,
 Shield,
 Clock,
 Flame,
 CheckCircle2,
 XCircle,
 Star,
 AlertTriangle,
 Sparkles,
} from "lucide-react";

interface MemberRetro {
 name: string;
 role: string;
 total_hours: number;
 avg_daily_hours: number;
 proof_percent: number;
 late_percent: number;
 deep_work_percent: number;
 meeting_percent: number;
 standup_count: number;
 closeout_count: number;
 promises_kept: number;
 promises_broken: number;
 shoutouts_received: number;
 prev_hours: number;
 prev_proof_percent: number;
 trend:"improving"|"declining"|"stable";
 weekly_grade: string;
 callout: string;
 issues: string[];
 wins: string[];
}

interface RetroData {
 period: { start: string; end: string };
 team_summary: string;
 team_hours: number;
 team_avg_proof: number;
 a_count: number;
 f_count: number;
 improving: number;
 declining: number;
 retros: MemberRetro[];
}

const GRADE_STYLE: Record<string, { color: string; bg: string; emoji: string }> = {
 A: { color:"text-green-700 dark:text-green-400", bg:"bg-green-50 dark:bg-green-950/20", emoji:"--"},
 B: { color:"text-blue-700 dark:text-blue-400", bg:"bg-blue-50 dark:bg-blue-950/20", emoji:"👍"},
 C: { color:"text-yellow-700 dark:text-yellow-400", bg:"bg-yellow-50 dark:bg-yellow-950/20", emoji:"😐"},
 D: { color:"text-orange-700 dark:text-orange-400", bg:"bg-orange-50 dark:bg-orange-950/20", emoji:"👎"},
 F: { color:"text-red-700 dark:text-red-400", bg:"bg-red-50 dark:bg-red-950/20", emoji:"--"},
};

export default function RetroPage() {
 const { orgId, loading: orgLoading } = useOrg();
 const [data, setData] = useState<RetroData | null>(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId) { setLoading(false); return; }

 async function load() {
 const res = await fetch(`/api/ai-weekly-retro?org_id=${orgId}`, { method:"POST"});
 setData(await res.json());
 setLoading(false);
 }
 load();
 }, [orgLoading, orgId]);

 if (loading) {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <Brain className="w-10 h-10 text-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Generando retrospectiva semanal...</p>
 </div>
 );
 }

 if (!data) return null;

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Brain className="w-6 h-6 text-primary"/>
 Retrospectiva semanal
 </h1>
 <p className="text-muted-foreground text-sm">{data.period.start} → {data.period.end}</p>
 </div>

 {/* Team summary */}
 <Card className="mb-8 border-2">
 <CardContent className="p-6">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
 <div className="text-center">
 <p className="text-3xl font-bold">{data.team_hours}h</p>
 <p className="text-xs text-muted-foreground">Horas totales</p>
 </div>
 <div className="text-center">
 <p className={cn("text-3xl font-bold", data.team_avg_proof >= 70 ?"text-green-600":"text-yellow-600")}>{data.team_avg_proof}%</p>
 <p className="text-xs text-muted-foreground">Evidencia prom.</p>
 </div>
 <div className="text-center">
 <p className="text-3xl font-bold text-green-600">{data.a_count}</p>
 <p className="text-xs text-muted-foreground">A&apos;s</p>
 </div>
 <div className="text-center">
 <p className={cn("text-3xl font-bold", data.f_count > 0 ?"text-red-600":"text-green-600")}>{data.f_count}</p>
 <p className="text-xs text-muted-foreground">F&apos;s</p>
 </div>
 </div>
 <p className="text-sm font-medium">{data.team_summary}</p>
 <div className="flex gap-3 mt-3">
 <Badge variant="outline"className="text-xs gap-1 text-green-600">
 <TrendingUp className="w-3 h-3"/> {data.improving} mejorando
 </Badge>
 {data.declining > 0 && (
 <Badge variant="outline"className="text-xs gap-1 text-red-600">
 <TrendingDown className="w-3 h-3"/> {data.declining} declinando
 </Badge>
 )}
 </div>
 </CardContent>
 </Card>

 {/* Individual retros */}
 <div className="space-y-4">
 {data.retros.map((r) => {
 const gs = GRADE_STYLE[r.weekly_grade] ?? GRADE_STYLE.C;
 const TrendIcon = r.trend ==="improving"? TrendingUp : r.trend ==="declining"? TrendingDown : Minus;
 const trendColor = r.trend ==="improving"?"text-green-600": r.trend ==="declining"?"text-red-600":"text-muted-foreground";

 return (
 <Card key={r.name} className={cn("border transition-all")}>
 <CardContent className="p-5">
 {/* Header */}
 <div className="flex items-start gap-4 mb-4">
 <div className={cn("w-14 h-14 flex flex-col items-center justify-center shrink-0", gs.bg)}>
 <span className="text-xl">{gs.emoji}</span>
 <span className={cn("text-lg font-black -mt-1", gs.color)}>{r.weekly_grade}</span>
 </div>
 <div className="flex-1">
 <div className="flex items-center gap-2">
 <h3 className="text-lg font-bold">{r.name}</h3>
 <TrendIcon className={cn("w-4 h-4", trendColor)} />
 {r.shoutouts_received > 0 && (
 <Badge variant="secondary"className="text-[10px] gap-1">
 <Star className="w-3 h-3 text-yellow-500"/> {r.shoutouts_received}
 </Badge>
 )}
 </div>
 <p className="text-xs text-muted-foreground">{r.role}</p>
 <p className={cn("text-sm mt-1 font-medium", gs.color)}>{r.callout}</p>
 </div>
 </div>

 {/* Stats grid */}
 <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-4 text-center">
 <div className="p-1.5 bg-accent/40">
 <p className="text-sm font-bold">{r.total_hours}h</p>
 <p className="text-[8px] text-muted-foreground">total</p>
 </div>
 <div className="p-1.5 bg-accent/40">
 <p className="text-sm font-bold">{r.avg_daily_hours}h</p>
 <p className="text-[8px] text-muted-foreground">/día</p>
 </div>
 <div className="p-1.5 bg-accent/40">
 <p className={cn("text-sm font-bold", r.proof_percent >= 70 ?"text-green-600":"text-yellow-600")}>{r.proof_percent}%</p>
 <p className="text-[8px] text-muted-foreground">evidencia</p>
 </div>
 <div className="p-1.5 bg-accent/40">
 <p className="text-sm font-bold">{r.deep_work_percent}%</p>
 <p className="text-[8px] text-muted-foreground">deep work</p>
 </div>
 <div className="p-1.5 bg-accent/40">
 <p className="text-sm font-bold">{r.meeting_percent}%</p>
 <p className="text-[8px] text-muted-foreground">meetings</p>
 </div>
 <div className="p-1.5 bg-accent/40">
 <p className="text-sm font-bold">{r.standup_count}/5</p>
 <p className="text-[8px] text-muted-foreground">standups</p>
 </div>
 <div className="p-1.5 bg-accent/40">
 <p className="text-sm font-bold">{r.closeout_count}/5</p>
 <p className="text-[8px] text-muted-foreground">cierres</p>
 </div>
 <div className="p-1.5 bg-accent/40">
 <p className={cn("text-sm font-bold", r.trend ==="improving"?"text-green-600": r.trend ==="declining"?"text-red-600":"")}>
 {r.total_hours - r.prev_hours > 0 ?"+":""}{r.total_hours - r.prev_hours}h
 </p>
 <p className="text-[8px] text-muted-foreground">vs prev</p>
 </div>
 </div>

 {/* Issues & Wins */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {r.issues.length > 0 && (
 <div>
 <p className="text-[10px] font-semibold text-red-600 uppercase mb-1 flex items-center gap-1">
 <AlertTriangle className="w-3 h-3"/> Problemas
 </p>
 {r.issues.map((issue, i) => (
 <p key={i} className="text-xs text-red-700 dark:text-red-400 flex items-start gap-1.5 mb-0.5">
 <span className="text-red-400">-</span> {issue}
 </p>
 ))}
 </div>
 )}
 {r.wins.length > 0 && (
 <div>
 <p className="text-[10px] font-semibold text-green-600 uppercase mb-1 flex items-center gap-1">
 <Sparkles className="w-3 h-3"/> Logros
 </p>
 {r.wins.map((win, i) => (
 <p key={i} className="text-xs text-green-700 dark:text-green-400 flex items-start gap-1.5 mb-0.5">
 <span className="text-green-400">+</span> {win}
 </p>
 ))}
 </div>
 )}
 </div>

 {/* Promises */}
 {(r.promises_kept > 0 || r.promises_broken > 0) && (
 <div className="flex items-center gap-3 mt-3 pt-3 border-t">
 {r.promises_kept > 0 && (
 <span className="text-xs text-green-600 flex items-center gap-1">
 <CheckCircle2 className="w-3 h-3"/> {r.promises_kept} cumplidas
 </span>
 )}
 {r.promises_broken > 0 && (
 <span className="text-xs text-red-600 flex items-center gap-1">
 <XCircle className="w-3 h-3"/> {r.promises_broken} rotas
 </span>
 )}
 </div>
 )}
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 );
}
