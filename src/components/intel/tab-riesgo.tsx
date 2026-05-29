"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, Brain, Scan } from "lucide-react";
import { RISK_CONFIG } from "./shared";

interface RiskPrediction {
 name: string;
 resignation_risk: number;
 risk_level: string;
 signals: string[];
 prediction: string;
 recommended_action: string;
}

interface RiskAnalysis {
 analysis_date: string;
 predictions: RiskPrediction[];
 team_summary: string;
 highest_risk: string;
 immediate_actions: string[];
}

export function TabRiesgo({ orgId }: { orgId: string }) {
 const [data, setData] = useState<RiskAnalysis | null>(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

 async function analyze() {
 setLoading(true);
 setError(null);
 try {
 const res = await fetch("/api/claude-resign-predict", {
 method:"POST",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({ org_id: orgId }),
 });
 const json = await res.json();
 if (!res.ok) throw new Error(json.error ??"Error al analizar");
 setData(json as RiskAnalysis);
 } catch (err: unknown) {
 setError(err instanceof Error ? err.message :"Error desconocido");
 }
 setLoading(false);
 }

 return (
 <div>
 <div className="palantir-divider text-muted-foreground mb-4">
 <AlertTriangle className="w-3 h-3"/>
 Predicción de riesgo de renuncia
 </div>

 {!data && !loading && (
 <div className="card-palantir p-8 flex flex-col items-center gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Scan className="w-7 h-7 text-primary/40"/>
 </div>
 <p className="text-xs font-mono text-muted-foreground text-center max-w-sm">
 Analiza 30 días de datos comportamentales por persona para predecir riesgo de renuncia.
 </p>
 {error && (
 <p className="text-xs font-mono text-red-500 bg-destructive/5 border border-destructive/20 px-3 py-1.5">{error}</p>
 )}
 <Button onClick={analyze} className="font-mono text-xs bg-primary text-primary-foreground">
 <Scan className="w-3 h-3 mr-1.5"/>
 Analizar Riesgo de Renuncia
 </Button>
 </div>
 )}

 {loading && (
 <div className="card-palantir p-12 flex flex-col items-center gap-4">
 <div className="w-12 h-12 border border-primary/30 flex items-center justify-center animate-border-pulse">
 <Brain className="w-6 h-6 text-primary animate-pulse"/>
 </div>
 <p className="text-xs font-mono text-muted-foreground animate-pulse tracking-widest uppercase">Analizando señales...</p>
 </div>
 )}

 {data && !loading && (
 <div className="space-y-4">
 <div className="card-palantir p-4 corner-marks">
 <span className="label-mono text-muted-foreground mb-2 block">Resumen del equipo</span>
 <p className="text-xs font-mono text-foreground">{data.team_summary}</p>
 {data.highest_risk && <p className="text-[10px] font-mono text-red-500 mt-2">Mayor riesgo: {data.highest_risk}</p>}
 </div>

 {data.immediate_actions && data.immediate_actions.length > 0 && (
 <div className="card-palantir p-4 border-red-500/20">
 <span className="label-mono text-red-500/60 mb-2 block">Acciones inmediatas</span>
 <ul className="space-y-1">
 {data.immediate_actions.map((a, i) => (
 <li key={i} className="text-[10px] font-mono text-foreground flex items-start gap-2">
 <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 mt-0.5"/>{a}
 </li>
 ))}
 </ul>
 </div>
 )}

 <div className="space-y-3">
 {(data.predictions ?? [])
 .sort((a, b) => b.resignation_risk - a.resignation_risk)
 .map((p, i) => {
 const cfg = RISK_CONFIG[p.risk_level] ?? RISK_CONFIG.low;
 return (
 <div key={i} className={cn("card-palantir p-4", p.risk_level ==="critical"&&"animate-border-pulse")}>
 <div className="flex items-center gap-3 mb-2">
 <span className="font-mono text-xs font-semibold">{p.name}</span>
 <Badge variant="outline"className={cn("text-[8px] font-mono h-4 ml-auto", cfg.color)}>{cfg.label}</Badge>
 </div>
 <div className="flex items-center gap-3 mb-2">
 <div className="flex-1 h-2 bg-accent/30 border border-border overflow-hidden">
 <div className={cn("h-full transition-all duration-700", cfg.bar)} style={{ width:`${p.resignation_risk}%`}} />
 </div>
 <span className={cn("font-mono text-sm font-bold tabular-nums", cfg.color)}>{p.resignation_risk}%</span>
 </div>
 <p className="text-[10px] font-mono text-foreground mb-2">{p.prediction}</p>
 {p.signals.length > 0 && (
 <div className="flex flex-wrap gap-1 mb-2">
 {p.signals.map((s, si) => (
 <span key={si} className="text-[8px] font-mono px-1.5 py-0.5 bg-accent/30 border border-border text-muted-foreground">{s}</span>
 ))}
 </div>
 )}
 <p className="text-[9px] font-mono text-primary/70 border-l-2 border-primary/30 pl-2">{p.recommended_action}</p>
 </div>
 );
 })}
 </div>
 </div>
 )}
 </div>
 );
}
