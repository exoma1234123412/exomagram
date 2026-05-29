"use client";

import { useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
 Search,
 Loader2,
 AlertCircle,
 ShieldCheck,
 ShieldAlert,
 MessageSquareWarning,
 RefreshCw,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Excuse {
 phrase: string;
 count: number;
 verdict:"legit"|"suspicious";
 evidence?: string;
}

interface PersonExcuses {
 user_id: string;
 name: string;
 excuses: Excuse[];
 overall: string;
}

interface ExcuseAnalysis {
 people: PersonExcuses[];
 summary: string;
 model?: string;
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function ExcusesPage() {
 const { orgId, loading: orgLoading } = useOrg();

 const [analysis, setAnalysis] = useState<ExcuseAnalysis | null>(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

 async function runAnalysis() {
 if (!orgId) return;
 setLoading(true);
 setError(null);
 setAnalysis(null);

 try {
 const res = await fetch("/api/claude-excuses", {
 method:"POST",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({ org_id: orgId }),
 });

 const data = await res.json();
 if (!res.ok) {
 setError(data.error ??"Error al analizar excusas");
 } else {
 setAnalysis(data);
 }
 } catch {
 setError("Error de red al conectar con Claude");
 }

 setLoading(false);
 }

 // ─── Loading state ─────────────────────────

 if (orgLoading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="flex flex-col items-center gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
 </div>
 </div>
 );
 }

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
 <MessageSquareWarning className="w-6 h-6 text-primary"/>
 Detector de Excusas
 </h1>
 <p className="text-muted-foreground text-sm mt-1">
 Claude analiza los ultimos 30 dias de standups y closeouts buscando excusas recurrentes.
 </p>
 </div>

 {/* Run button */}
 {!analysis && !loading && (
 <Card className="border-2 border-dashed border-primary/30 transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-8 text-center">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center mx-auto mb-4">
 <Search className="w-8 h-8 text-primary"/>
 </div>
 <h3 className="font-bold text-lg mb-2">Analizar excusas del equipo</h3>
 <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
 Claude Haiku lee todos los blockers y closeouts de los ultimos 30 dias
 para detectar frases que se repiten sospechosamente.
 </p>
 <Button
 onClick={runAnalysis}
 disabled={loading}
 className="bg-primary text-white hover: hover:shadow-blue-600/30 transition-all duration-300 gap-2">
 <Search className="w-4 h-4"/>
 Ejecutar Analisis
 </Button>
 </CardContent>
 </Card>
 )}

 {/* Loading */}
 {loading && (
 <Card className="transition-all duration-300">
 <CardContent className="p-8 text-center">
 <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4"/>
 <p className="text-sm font-medium">Claude esta analizando 30 dias de datos...</p>
 <p className="text-xs text-muted-foreground mt-1">Esto puede tardar unos segundos.</p>
 </CardContent>
 </Card>
 )}

 {/* Error */}
 {error && (
 <div className="mb-6 bg-destructive/5 border border-destructive/20 p-4">
 <div className="flex items-start gap-3">
 <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5"/>
 <div>
 <p className="text-sm font-semibold text-destructive">{error}</p>
 <Button
 variant="outline"size="sm"onClick={runAnalysis}
 className="mt-2 gap-2">
 <RefreshCw className="w-3.5 h-3.5"/> Reintentar
 </Button>
 </div>
 </div>
 </div>
 )}

 {/* Results */}
 {analysis && (
 <>
 {/* Summary */}
 <Card className="mb-8 transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-5">
 <h2 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wider">
 Resumen general
 </h2>
 <p className="text-sm leading-relaxed">{analysis.summary}</p>
 </CardContent>
 </Card>

 {/* Stats row */}
 <div className="grid grid-cols-3 gap-3 mb-8">
 <div className="bg-accent/40 p-4 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight">{analysis.people.length}</p>
 <p className="text-[10px] text-muted-foreground">Personas analizadas</p>
 </div>
 <div className="bg-accent/40 p-4 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight text-red-600">
 {analysis.people.reduce(
 (sum, p) => sum + p.excuses.filter((e) => e.verdict ==="suspicious").length,
 0
 )}
 </p>
 <p className="text-[10px] text-muted-foreground">Excusas sospechosas</p>
 </div>
 <div className="bg-accent/40 p-4 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight text-green-600">
 {analysis.people.reduce(
 (sum, p) => sum + p.excuses.filter((e) => e.verdict ==="legit").length,
 0
 )}
 </p>
 <p className="text-[10px] text-muted-foreground">Bloqueadores reales</p>
 </div>
 </div>

 {/* Per person */}
 <section className="mb-8">
 <h2 className="font-semibold text-lg mb-4">Por persona</h2>

 {analysis.people.length === 0 ? (
 <Card className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-6 text-center">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center mx-auto mb-3">
 <ShieldCheck className="w-8 h-8 text-primary"/>
 </div>
 <p className="text-sm text-muted-foreground">
 No se encontraron excusas recurrentes. Buen trabajo.
 </p>
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-4">
 {analysis.people.map((person) => (
 <PersonCard key={person.user_id} person={person} />
 ))}
 </div>
 )}
 </section>

 {/* Re-run */}
 <div className="text-center">
 <Button
 variant="outline"onClick={runAnalysis}
 disabled={loading}
 className="gap-2">
 <RefreshCw className="w-4 h-4"/>
 Volver a analizar
 </Button>
 </div>
 </>
 )}
 </div>
 );
}

// ─────────────────────────────────────────────
// Person Card
// ─────────────────────────────────────────────

function PersonCard({ person }: { person: PersonExcuses }) {
 const suspiciousCount = person.excuses.filter((e) => e.verdict ==="suspicious").length;
 const legitCount = person.excuses.filter((e) => e.verdict ==="legit").length;

 return (
 <Card className={cn(
"transition-all duration-300 hover:border-primary/30",
 suspiciousCount > 0 &&"border-amber-200 dark:border-amber-900")}>
 <CardContent className="p-5">
 {/* Header */}
 <div className="flex items-center justify-between mb-3">
 <h3 className="font-semibold text-base">{person.name}</h3>
 <div className="flex items-center gap-2">
 {suspiciousCount > 0 && (
 <Badge
 variant="outline"className="text-[10px] text-amber-600 border-amber-200 dark:border-amber-900 gap-1">
 <ShieldAlert className="w-3 h-3"/>
 {suspiciousCount} sospechosa{suspiciousCount !== 1 ?"s":""}
 </Badge>
 )}
 {legitCount > 0 && (
 <Badge
 variant="outline"className="text-[10px] text-green-600 border-green-200 dark:border-green-900 gap-1">
 <ShieldCheck className="w-3 h-3"/>
 {legitCount} legit
 </Badge>
 )}
 </div>
 </div>

 {/* Overall */}
 <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{person.overall}</p>

 {/* Excuses list */}
 <div className="space-y-2">
 {person.excuses.map((excuse, i) => (
 <ExcuseRow key={i} excuse={excuse} />
 ))}
 </div>
 </CardContent>
 </Card>
 );
}

// ─────────────────────────────────────────────
// Excuse Row
// ─────────────────────────────────────────────

function ExcuseRow({ excuse }: { excuse: Excuse }) {
 const isSuspicious = excuse.verdict ==="suspicious";

 return (
 <div
 className={cn(
"p-3",
 isSuspicious
 ?"bg-amber-50 dark:bg-amber-950/20":"bg-green-50 dark:bg-green-950/20")}
 >
 <div className="flex items-start gap-3">
 {isSuspicious ? (
 <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"/>
 ) : (
 <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5"/>
 )}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <span className="text-sm font-medium">
 &ldquo;{excuse.phrase}&rdquo;
 </span>
 <Badge
 variant="outline"className={cn(
"text-[10px] shrink-0",
 isSuspicious
 ?"text-amber-600 border-amber-300 dark:border-amber-800":"text-green-600 border-green-300 dark:border-green-800")}
 >
 {excuse.count}x
 </Badge>
 </div>
 {excuse.evidence && (
 <p className="text-xs text-muted-foreground">{excuse.evidence}</p>
 )}
 </div>
 <Badge
 variant="outline"className={cn(
"text-[10px] shrink-0",
 isSuspicious
 ?"text-amber-700 bg-amber-100/50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-800":"text-green-700 bg-green-100/50 dark:bg-green-900/30 border-green-300 dark:border-green-800")}
 >
 {isSuspicious ?"Sospechoso":"Legit"}
 </Badge>
 </div>
 </div>
 );
}
