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
 Search,
 ChevronLeft,
 ChevronRight,
 Loader2,
 AlertTriangle,
 CheckCircle2,
 XCircle,
 Ghost,
 Shield,
 Eye,
} from "lucide-react";

interface UserVerification {
 user_id: string;
 name: string;
 output_score: number;
 findings: string[];
 red_flags: string[];
 verified_outputs: string[];
 hours_claimed: number;
 hours_verified: number;
 ghost_hours: number;
}

interface OutputData {
 date: string;
 verifications: UserVerification[];
 team_avg_output: number;
 ghost_hours_total: number;
 members_with_flags: number;
}

export default function OutputPage() {
 const { orgId, loading: orgLoading } = useOrg();
 const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
 const [data, setData] = useState<OutputData | null>(null);
 const [loading, setLoading] = useState(false);

 async function runVerification() {
 if (!orgId) return;
 setLoading(true);
 const res = await fetch(`/api/output-verification?org_id=${orgId}&date=${date}`, { method:"POST"});
 setData(await res.json());
 setLoading(false);
 }

 useEffect(() => { if (orgId) runVerification(); }, [orgId, date]); // eslint-disable-line react-hooks/exhaustive-deps

 const isToday = date === new Date().toISOString().split("T")[0];
 const displayDate = format(new Date(date +"T12:00:00"),"EEEE, d MMMM", { locale: es });

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Search className="w-6 h-6 text-primary"/>
 Verificación de output
 </h1>
 <p className="text-muted-foreground text-sm capitalize">{displayDate}</p>
 <p className="text-xs text-muted-foreground/60 mt-1">
 No mide tiempo. Mide lo que REALMENTE se produjo. Cross-referencia con GitHub, PRs, meetings y check-ins.
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
 {!isToday && (
 <Button variant="ghost"size="sm"onClick={() => setDate(new Date().toISOString().split("T")[0])}>Hoy</Button>
 )}
 </div>

 {orgLoading || loading ? (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <Search className="w-10 h-10 text-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Verificando output real...</p>
 </div>
 ) : data ? (
 <div className="space-y-6">
 {/* Team summary */}
 <div className="grid grid-cols-3 gap-4">
 <Card>
 <CardContent className="p-4 text-center">
 <p className={cn("text-3xl font-bold",
 data.team_avg_output >= 60 ?"text-green-600":
 data.team_avg_output >= 40 ?"text-yellow-600":"text-red-600")}>
 {data.team_avg_output}
 </p>
 <p className="text-xs text-muted-foreground">Output score prom.</p>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 text-center">
 <p className={cn("text-3xl font-bold", data.ghost_hours_total > 10 ?"text-red-600":"text-muted-foreground")}>
 {data.ghost_hours_total}h
 </p>
 <p className="text-xs text-muted-foreground">Horas fantasma</p>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 text-center">
 <p className={cn("text-3xl font-bold", data.members_with_flags > 0 ?"text-red-600":"text-green-600")}>
 {data.members_with_flags}
 </p>
 <p className="text-xs text-muted-foreground">Con red flags</p>
 </CardContent>
 </Card>
 </div>

 {/* Per-person */}
 {data.verifications.map((v) => (
 <Card key={v.user_id} className={cn(
"border transition-all",
 v.red_flags.length >= 2 &&"border-red-300 dark:border-red-800",
 v.output_score >= 70 && v.red_flags.length === 0 &&"border-green-300 dark:border-green-800",
 )}>
 <CardContent className="p-5">
 <div className="flex items-start gap-4 mb-4">
 {/* Score */}
 <div className={cn(
"w-14 h-14 flex flex-col items-center justify-center shrink-0",
 v.output_score >= 70 ?"bg-green-50 dark:bg-green-950/20":
 v.output_score >= 40 ?"bg-yellow-50 dark:bg-yellow-950/20":
"bg-red-50 dark:bg-red-950/20")}>
 <span className={cn("text-2xl font-black",
 v.output_score >= 70 ?"text-green-700 dark:text-green-400":
 v.output_score >= 40 ?"text-yellow-700 dark:text-yellow-400":
"text-red-700 dark:text-red-400")}>
 {v.output_score}
 </span>
 </div>

 <div className="flex-1">
 <h3 className="text-lg font-bold">{v.name}</h3>
 <div className="flex items-center gap-4 mt-1">
 <span className="text-xs text-muted-foreground flex items-center gap-1">
 <Shield className="w-3 h-3"/>
 {v.hours_verified}/{v.hours_claimed}h verificadas
 </span>
 {v.ghost_hours > 0 && (
 <span className="text-xs text-red-600 flex items-center gap-1">
 <Ghost className="w-3 h-3"/>
 {v.ghost_hours}h fantasma
 </span>
 )}
 </div>
 </div>
 </div>

 {/* Hours bar */}
 <div className="mb-4">
 <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
 <span>Verificado</span>
 <span>Fantasma</span>
 </div>
 <div className="h-3 bg-muted/30 rounded-full overflow-hidden flex">
 <div className="h-full bg-green-500 transition-all"style={{ width:`${v.hours_claimed > 0 ? (v.hours_verified / v.hours_claimed) * 100 : 0}%`}} />
 <div className="h-full bg-red-400/50 transition-all"style={{ width:`${v.hours_claimed > 0 ? (v.ghost_hours / v.hours_claimed) * 100 : 0}%`}} />
 </div>
 </div>

 {/* Verified outputs */}
 {v.verified_outputs.length > 0 && (
 <div className="mb-3">
 <p className="text-[10px] font-semibold text-green-600 uppercase mb-1 flex items-center gap-1">
 <CheckCircle2 className="w-3 h-3"/> Output verificado
 </p>
 {v.verified_outputs.map((o, i) => (
 <p key={i} className="text-xs text-green-700 dark:text-green-400 mb-0.5">+ {o}</p>
 ))}
 </div>
 )}

 {/* Red flags */}
 {v.red_flags.length > 0 && (
 <div className="mb-3">
 <p className="text-[10px] font-semibold text-red-600 uppercase mb-1 flex items-center gap-1">
 <AlertTriangle className="w-3 h-3"/> Red flags
 </p>
 {v.red_flags.map((f, i) => (
 <p key={i} className="text-xs text-red-700 dark:text-red-400 mb-0.5">- {f}</p>
 ))}
 </div>
 )}

 {/* Findings */}
 {v.findings.length > 0 && (
 <div>
 <p className="text-[10px] font-semibold text-yellow-600 uppercase mb-1 flex items-center gap-1">
 <Eye className="w-3 h-3"/> Observaciones
 </p>
 {v.findings.map((f, i) => (
 <p key={i} className="text-xs text-muted-foreground mb-0.5">- {f}</p>
 ))}
 </div>
 )}
 </CardContent>
 </Card>
 ))}
 </div>
 ) : null}
 </div>
 );
}
