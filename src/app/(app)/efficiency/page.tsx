"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
 Gauge,
 ChevronLeft,
 ChevronRight,
 Loader2,
 Flame,
 Clock,
 DollarSign,
 AlertTriangle,
 Sparkles,
 TrendingUp,
 Zap,
 Ban,
 Repeat,
 Brain,
} from "lucide-react";

interface EfficiencyAudit {
 user_id: string;
 name: string;
 role: string;
 efficiency_score: number;
 efficiency_grade: string;
 deep_work_ratio: number;
 context_switches: number;
 flow_state_hours: number;
 meeting_tax: number;
 overhead_ratio: number;
 output_density: number;
 total_hours: number;
 productive_hours: number;
 overhead_hours: number;
 meeting_hours: number;
 blocked_hours: number;
 wasted_cost: number;
 verdict: string;
 improvements: string[];
 waste_sources: string[];
 strengths: string[];
}

interface EffData {
 date: string;
 team_avg_efficiency: number;
 total_wasted_cost: number;
 audits: EfficiencyAudit[];
}

const GRADE_STYLE: Record<string, { color: string; bg: string; emoji: string }> = {
 A: { color:"text-green-700 dark:text-green-400", bg:"bg-green-50 dark:bg-green-950/20", emoji:"--"},
 B: { color:"text-blue-700 dark:text-blue-400", bg:"bg-blue-50 dark:bg-blue-950/20", emoji:"👍"},
 C: { color:"text-yellow-700 dark:text-yellow-400", bg:"bg-yellow-50 dark:bg-yellow-950/20", emoji:"😐"},
 D: { color:"text-orange-700 dark:text-orange-400", bg:"bg-orange-50 dark:bg-orange-950/20", emoji:"👎"},
 F: { color:"text-red-700 dark:text-red-400", bg:"bg-red-50 dark:bg-red-950/20", emoji:"--"},
};

export default function EfficiencyPage() {
 const { orgId, loading: orgLoading } = useOrg();
 const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
 const [data, setData] = useState<EffData | null>(null);
 const [loading, setLoading] = useState(false);

 useEffect(() => {
 if (!orgId) return;
 setLoading(true);
 fetch(`/api/efficiency-audit?org_id=${orgId}&date=${date}`, { method:"POST"})
 .then((r) => r.json())
 .then((d) => { setData(d); setLoading(false); });
 }, [orgId, date]);

 const isToday = date === new Date().toISOString().split("T")[0];
 const displayDate = format(new Date(date +"T12:00:00"),"EEEE, d MMMM", { locale: es });

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 <div className="mb-8">
 <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
 <Gauge className="w-6 h-6 text-primary"/>
 Eficiencia
 </h1>
 <p className="text-muted-foreground text-sm capitalize">{displayDate}</p>
 <p className="text-xs text-muted-foreground/60 mt-1">
 No cuantas horas trabajaste, sino cuanto produjiste por hora. Mas horas ≠ mas output.
 </p>
 </div>

 {/* Date nav */}
 <div className="flex items-center gap-2 mb-8">
 <Button variant="outline"size="icon"onClick={() => setDate(subDays(new Date(date +"T12:00:00"), 1).toISOString().split("T")[0])}>
 <ChevronLeft className="w-4 h-4"/>
 </Button>
 <Input type="date"value={date} onChange={(e) => setDate(e.target.value)} className="w-auto"/>
 <Button variant="outline"size="icon"onClick={() => { const d = new Date(date +"T12:00:00"); d.setDate(d.getDate() + 1); setDate(d.toISOString().split("T")[0]); }}>
 <ChevronRight className="w-4 h-4"/>
 </Button>
 {!isToday && <Button variant="ghost"size="sm"onClick={() => setDate(new Date().toISOString().split("T")[0])}>Hoy</Button>}
 </div>

 {orgLoading || loading ? (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <Gauge className="w-10 h-10 text-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Analizando eficiencia...</p>
 </div>
 ) : data ? (
 <div className="space-y-6">
 {/* Team summary */}
 <div className="grid grid-cols-2 gap-4">
 <Card>
 <CardContent className="p-5 text-center">
 <Gauge className="w-6 h-6 mx-auto text-primary mb-2"/>
 <p className={cn("text-4xl font-bold",
 data.team_avg_efficiency >= 70 ?"text-green-600":
 data.team_avg_efficiency >= 50 ?"text-yellow-600":"text-red-600")}>
 {data.team_avg_efficiency}
 </p>
 <p className="text-xs text-muted-foreground mt-1">Eficiencia promedio</p>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-5 text-center">
 <DollarSign className="w-6 h-6 mx-auto text-red-500 mb-2"/>
 <p className={cn("text-4xl font-bold", data.total_wasted_cost > 200 ?"text-red-600":"text-muted-foreground")}>
 ${data.total_wasted_cost}
 </p>
 <p className="text-xs text-muted-foreground mt-1">Desperdiciado hoy</p>
 </CardContent>
 </Card>
 </div>

 {/* Per-person */}
 {data.audits.map((a) => {
 const gs = GRADE_STYLE[a.efficiency_grade] ?? GRADE_STYLE.C;
 return (
 <Card key={a.user_id} className="border transition-all">
 <CardContent className="p-5">
 {/* Header */}
 <div className="flex items-start gap-4 mb-4">
 <div className={cn("w-14 h-14 flex flex-col items-center justify-center shrink-0", gs.bg)}>
 <span className="text-xl">{gs.emoji}</span>
 <span className={cn("text-lg font-black -mt-1", gs.color)}>{a.efficiency_grade}</span>
 </div>
 <div className="flex-1">
 <h3 className="text-lg font-bold">{a.name}</h3>
 <p className="text-xs text-muted-foreground">{a.role}</p>
 <p className={cn("text-sm mt-1 font-medium", gs.color)}>{a.verdict}</p>
 </div>
 </div>

 {/* Metric bars */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
 <div className="p-2.5 bg-accent/40 text-center">
 <Flame className="w-3.5 h-3.5 mx-auto text-primary mb-0.5"/>
 <p className={cn("text-lg font-bold", a.deep_work_ratio >= 50 ?"text-green-600": a.deep_work_ratio >= 30 ?"text-yellow-600":"text-red-600")}>
 {a.deep_work_ratio}%
 </p>
 <p className="text-[9px] text-muted-foreground">Deep work</p>
 </div>
 <div className="p-2.5 bg-accent/40 text-center">
 <Brain className="w-3.5 h-3.5 mx-auto text-blue-500 mb-0.5"/>
 <p className={cn("text-lg font-bold", a.flow_state_hours >= 3 ?"text-green-600":"text-muted-foreground")}>
 {a.flow_state_hours}h
 </p>
 <p className="text-[9px] text-muted-foreground">Flow state</p>
 </div>
 <div className="p-2.5 bg-accent/40 text-center">
 <Repeat className="w-3.5 h-3.5 mx-auto text-orange-500 mb-0.5"/>
 <p className={cn("text-lg font-bold", a.context_switches <= 3 ?"text-green-600":"text-red-600")}>
 {a.context_switches}
 </p>
 <p className="text-[9px] text-muted-foreground">Switches</p>
 </div>
 <div className="p-2.5 bg-accent/40 text-center">
 <DollarSign className="w-3.5 h-3.5 mx-auto text-red-500 mb-0.5"/>
 <p className={cn("text-lg font-bold", a.wasted_cost > 100 ?"text-red-600":"text-muted-foreground")}>
 ${a.wasted_cost}
 </p>
 <p className="text-[9px] text-muted-foreground">Desperdicio</p>
 </div>
 </div>

 {/* Time breakdown bar */}
 <div className="mb-4">
 <div className="flex gap-0.5 h-4 rounded-full overflow-hidden">
 {a.productive_hours > 0 && (
 <div className="bg-green-500 h-full"style={{ width:`${(a.productive_hours / a.total_hours) * 100}%`}}
 title={`${a.productive_hours}h productivas`} />
 )}
 {a.meeting_hours > 0 && (
 <div className="bg-blue-500 h-full"style={{ width:`${(a.meeting_hours / a.total_hours) * 100}%`}}
 title={`${a.meeting_hours}h reuniones`} />
 )}
 {a.overhead_hours > 0 && (
 <div className="bg-yellow-400 h-full"style={{ width:`${(a.overhead_hours / a.total_hours) * 100}%`}}
 title={`${a.overhead_hours}h overhead`} />
 )}
 {a.blocked_hours > 0 && (
 <div className="bg-red-500 h-full"style={{ width:`${(a.blocked_hours / a.total_hours) * 100}%`}}
 title={`${a.blocked_hours}h bloqueado`} />
 )}
 </div>
 <div className="flex gap-3 mt-1.5 text-[9px] text-muted-foreground">
 <span className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full"/>Productivo {a.productive_hours}h</span>
 <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full"/>Reuniones {a.meeting_hours}h</span>
 <span className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-400 rounded-full"/>Overhead {a.overhead_hours}h</span>
 {a.blocked_hours > 0 && <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full"/>Bloqueado {a.blocked_hours}h</span>}
 </div>
 </div>

 {/* Improvements, waste, strengths */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 {a.improvements.length > 0 && (
 <div>
 <p className="text-[10px] font-semibold text-yellow-600 uppercase mb-1 flex items-center gap-1">
 <TrendingUp className="w-3 h-3"/> Mejorar
 </p>
 {a.improvements.map((imp, i) => (
 <p key={i} className="text-[11px] text-muted-foreground mb-0.5">- {imp}</p>
 ))}
 </div>
 )}
 {a.waste_sources.length > 0 && (
 <div>
 <p className="text-[10px] font-semibold text-red-600 uppercase mb-1 flex items-center gap-1">
 <Ban className="w-3 h-3"/> Desperdicio
 </p>
 {a.waste_sources.map((w, i) => (
 <p key={i} className="text-[11px] text-red-700 dark:text-red-400 mb-0.5">- {w}</p>
 ))}
 </div>
 )}
 {a.strengths.length > 0 && (
 <div>
 <p className="text-[10px] font-semibold text-green-600 uppercase mb-1 flex items-center gap-1">
 <Sparkles className="w-3 h-3"/> Fortalezas
 </p>
 {a.strengths.map((s, i) => (
 <p key={i} className="text-[11px] text-green-700 dark:text-green-400 mb-0.5">+ {s}</p>
 ))}
 </div>
 )}
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 ) : null}
 </div>
 );
}
