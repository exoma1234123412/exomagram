"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
 ShieldCheck,
 ShieldX,
 X,
 ArrowRight,
 AlertTriangle,
 Copy,
 Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================
// Types
// ============================================================

interface EntryValidatorProps {
 entry: {
 category: string;
 title: string;
 description: string;
 hour: number;
 date: string;
 proof_urls: string[];
 };
 recentEntries: { title: string; description: string }[];
 onApproved: () => void;
 onCancel: () => void;
}

interface ValidationResult {
 approved: boolean;
 issues: string[];
 suggestions: string[];
 quality_score: number;
 red_flags: string[];
 copycat_score: number;
}

type ValidatorState ="scanning"|"approved"|"rejected"|"error";

// ============================================================
// Grade helpers
// ============================================================

function getGrade(score: number): { letter: string; color: string } {
 if (score >= 85) return { letter:"A", color:"text-green-500"};
 if (score >= 70) return { letter:"B", color:"text-blue-500"};
 if (score >= 55) return { letter:"C", color:"text-amber-500"};
 if (score >= 40) return { letter:"D", color:"text-orange-500"};
 return { letter:"F", color:"text-red-500"};
}

// ============================================================
// Component
// ============================================================

export function EntryValidator({
 entry,
 recentEntries,
 onApproved,
 onCancel,
}: EntryValidatorProps) {
 const [state, setState] = useState<ValidatorState>("scanning");
 const [result, setResult] = useState<ValidationResult | null>(null);
 const [scanLine, setScanLine] = useState(0);

 // Scanning animation
 useEffect(() => {
 if (state !=="scanning") return;
 const interval = setInterval(() => {
 setScanLine((prev) => (prev >= 100 ? 0 : prev + 2));
 }, 30);
 return () => clearInterval(interval);
 }, [state]);

 // Call validation API on mount
 const validate = useCallback(async () => {
 try {
 const res = await fetch("/api/validate-entry", {
 method:"POST",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({
 category: entry.category,
 title: entry.title,
 description: entry.description,
 hour: entry.hour,
 date: entry.date,
 proof_urls: entry.proof_urls,
 recent_entries: recentEntries.map((e) => ({
 title: e.title,
 description: e.description,
 category:"",
 hour: 0,
 date:"",
 })),
 }),
 });

 if (!res.ok) {
 setState("error");
 return;
 }

 const data = (await res.json()) as ValidationResult;
 setResult(data);

 if (data.approved) {
 setState("approved");
 } else {
 setState("rejected");
 }
 } catch {
 setState("error");
 }
 }, [entry, recentEntries]);

 useEffect(() => {
 validate();
 }, [validate]);

 // Auto-proceed after approval
 useEffect(() => {
 if (state !=="approved") return;
 const timer = setTimeout(() => {
 onApproved();
 }, 1000);
 return () => clearTimeout(timer);
 }, [state, onApproved]);

 const grade = result ? getGrade(result.quality_score) : null;

 return (
 <div className="absolute inset-0 z-10 bg-background/95 backdrop-blur flex flex-col font-mono">
 {/* ---- SCANNING STATE ---- */}
 {state ==="scanning"&& (
 <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 relative overflow-hidden">
 {/* Scan line */}
 <div
 className="absolute left-0 right-0 h-px bg-primary/60 transition-none pointer-events-none"style={{ top:`${scanLine}%`}}
 />
 <div
 className="absolute left-0 right-0 h-8 bg-gradient-to-b from-primary/10 to-transparent transition-none pointer-events-none"style={{ top:`${scanLine}%`}}
 />

 <div className="w-12 h-12 border border-primary/40 flex items-center justify-center">
 <ShieldCheck className="w-6 h-6 text-primary animate-pulse"/>
 </div>

 <div className="text-center space-y-2">
 <p className="text-xs tracking-[0.2em] uppercase text-foreground font-bold">
 Claude esta evaluando tu entrada...
 </p>
 <p className="text-[10px] text-muted-foreground tracking-wide">
 Analizando calidad, especificidad y originalidad
 </p>
 </div>

 {/* Entry preview */}
 <div className="w-full max-w-sm border border-border p-3 space-y-1.5 bg-accent/20">
 <div className="flex items-center gap-2">
 <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Categoria
 </span>
 <span className="text-[11px] text-foreground">
 {entry.category}
 </span>
 </div>
 <div className="text-[11px] text-foreground truncate">
 {entry.title}
 </div>
 {entry.description && (
 <div className="text-[10px] text-muted-foreground line-clamp-2">
 {entry.description}
 </div>
 )}
 </div>
 </div>
 )}

 {/* ---- APPROVED STATE ---- */}
 {state ==="approved"&& (
 <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
 <div className="w-16 h-16 border-2 border-green-500 flex items-center justify-center animate-in zoom-in duration-300">
 <ShieldCheck className="w-8 h-8 text-green-500"/>
 </div>
 <p className="text-sm tracking-[0.15em] uppercase text-green-500 font-bold">
 Entrada aprobada
 </p>
 {result && (
 <div className="flex items-center gap-3">
 <span
 className={cn(
"text-2xl font-bold tabular-nums",
 grade?.color,
 )}
 >
 {grade?.letter}
 </span>
 <span className="text-xs text-muted-foreground tabular-nums">
 {result.quality_score}/100
 </span>
 </div>
 )}
 <p className="text-[10px] text-muted-foreground tracking-wide">
 Guardando...
 </p>
 </div>
 )}

 {/* ---- REJECTED STATE ---- */}
 {state ==="rejected"&& result && (
 <div className="flex-1 flex flex-col overflow-y-auto">
 {/* Header */}
 <div className="border-b border-red-500/30 bg-red-500/5 px-4 py-4 flex items-center gap-3 shrink-0">
 <div className="w-10 h-10 border-2 border-red-500 flex items-center justify-center">
 <ShieldX className="w-5 h-5 text-red-500"/>
 </div>
 <div>
 <p className="text-xs tracking-[0.15em] uppercase text-red-500 font-bold">
 Entrada rechazada
 </p>
 <p className="text-[10px] text-muted-foreground mt-0.5">
 Debes corregir antes de enviar
 </p>
 </div>
 </div>

 <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
 {/* Quality score */}
 <div className="flex items-center justify-between border border-border px-3 py-2">
 <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Calidad
 </span>
 <div className="flex items-center gap-2">
 <span
 className={cn(
"text-xl font-bold tabular-nums",
 grade?.color,
 )}
 >
 {grade?.letter}
 </span>
 <span className="text-xs text-muted-foreground tabular-nums">
 {result.quality_score}/100
 </span>
 </div>
 </div>

 {/* Issues */}
 {result.issues.length > 0 && (
 <div className="space-y-2">
 <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Problemas
 </span>
 <div className="space-y-1.5">
 {result.issues.map((issue, i) => (
 <div
 key={i}
 className="flex items-start gap-2 text-[11px] text-red-500 bg-red-500/5 border border-red-500/20 px-3 py-2">
 <X className="w-3.5 h-3.5 mt-0.5 shrink-0"/>
 <span>{issue}</span>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Suggestions */}
 {result.suggestions.length > 0 && (
 <div className="space-y-2">
 <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Sugerencias
 </span>
 <div className="space-y-1.5">
 {result.suggestions.map((suggestion, i) => (
 <div
 key={i}
 className="flex items-start gap-2 text-[11px] text-primary bg-primary/5 border border-primary/20 px-3 py-2">
 <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0"/>
 <span>{suggestion}</span>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Red flags */}
 {result.red_flags.length > 0 && (
 <div className="space-y-2">
 <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Red Flags
 </span>
 <div className="space-y-1.5">
 {result.red_flags.map((flag, i) => (
 <div
 key={i}
 className="flex items-start gap-2 text-[11px] text-red-600 bg-red-500/10 border border-red-500/30 px-3 py-2">
 <Ban className="w-3.5 h-3.5 mt-0.5 shrink-0"/>
 <span>{flag}</span>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Copycat score */}
 {result.copycat_score > 50 && (
 <div className="flex items-center gap-2 border border-amber-500/30 bg-amber-500/5 px-3 py-2">
 <Copy className="w-4 h-4 text-amber-500 shrink-0"/>
 <div>
 <p className="text-[11px] text-amber-600 font-bold">
 Similitud con entradas recientes:{""}
 <span className="tabular-nums">{result.copycat_score}%</span>
 </p>
 <p className="text-[10px] text-muted-foreground">
 Se detecta contenido repetido
 </p>
 </div>
 </div>
 )}
 </div>

 {/* Action */}
 <div className="border-t border-border px-4 py-3 shrink-0">
 <Button
 onClick={onCancel}
 className="w-full font-mono text-xs uppercase tracking-wider bg-primary text-primary-foreground">
 Corregir entrada
 </Button>
 </div>
 </div>
 )}

 {/* ---- ERROR STATE ---- */}
 {state ==="error"&& (
 <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
 <div className="w-12 h-12 border border-amber-500/40 flex items-center justify-center">
 <AlertTriangle className="w-6 h-6 text-amber-500"/>
 </div>
 <p className="text-xs tracking-[0.15em] uppercase text-amber-500 font-bold">
 Validacion no disponible
 </p>
 <p className="text-[10px] text-muted-foreground text-center max-w-xs">
 No se pudo conectar con el servicio de validacion.
 La entrada se enviara con una marca de advertencia.
 </p>
 <Button
 onClick={onApproved}
 variant="outline"className="font-mono text-xs uppercase tracking-wider">
 <AlertTriangle className="w-3.5 h-3.5 mr-1.5"/>
 Enviar sin validacion
 </Button>
 </div>
 )}
 </div>
 );
}
