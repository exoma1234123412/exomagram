"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, MonthlyObituary } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import {
 Newspaper,
 Skull,
 Loader2,
 Calendar,
 Sparkles,
 ScrollText,
 ChevronLeft,
 ChevronRight,
} from "lucide-react";

interface ObituaryWithProfile extends MonthlyObituary {
 profile?: Profile;
}

function getCurrentMonth(): string {
 const now = new Date();
 return`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,"0")}`;
}

function formatMonth(month: string): string {
 const [year, m] = month.split("-");
 const months = [
"Enero","Febrero","Marzo","Abril","Mayo","Junio",
"Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
 ];
 return`${months[parseInt(m, 10) - 1]} ${year}`;
}

function getPreviousMonth(month: string): string {
 const [year, m] = month.split("-").map(Number);
 if (m === 1) return`${year - 1}-12`;
 return`${year}-${String(m - 1).padStart(2,"0")}`;
}

function getNextMonth(month: string): string {
 const [year, m] = month.split("-").map(Number);
 if (m === 12) return`${year + 1}-01`;
 return`${year}-${String(m + 1).padStart(2,"0")}`;
}

export default function ObituarioPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [obituaries, setObituaries] = useState<ObituaryWithProfile[]>([]);
 const [loading, setLoading] = useState(true);
 const [generating, setGenerating] = useState(false);
 const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
 const [availableMonths, setAvailableMonths] = useState<string[]>([]);
 const [error, setError] = useState<string | null>(null);

 const loadObituaries = useCallback(
 async (month: string) => {
 if (!orgId) return;
 setLoading(true);
 setError(null);

 // Load obituaries for the selected month
 const { data: obits } = await supabase
 .from("monthly_obituaries")
 .select("*")
 .eq("org_id", orgId)
 .eq("month", month)
 .order("created_at", { ascending: false });

 // Load all distinct months for navigation
 const { data: allObits } = await supabase
 .from("monthly_obituaries")
 .select("month")
 .eq("org_id", orgId);

 const allObitsList = (allObits ?? []) as { month: string }[];
 const monthSet = new Set<string>(allObitsList.map((o) => o.month));
 setAvailableMonths(Array.from(monthSet).sort().reverse());

 // Load profiles for members
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 const profileMap = new Map<string, Profile>();
 for (const m of members ?? []) {
 if (m.profiles) {
 profileMap.set(m.user_id, m.profiles as unknown as Profile);
 }
 }

 const enriched: ObituaryWithProfile[] = (obits ?? []).map((o) => ({
 ...o,
 profile: profileMap.get(o.user_id),
 }));

 setObituaries(enriched);
 setLoading(false);
 },
 [orgId] // eslint-disable-line react-hooks/exhaustive-deps
 );

 useEffect(() => {
 if (!orgId) return;
 loadObituaries(selectedMonth);
 }, [orgId, selectedMonth, loadObituaries]);

 async function handleGenerate() {
 if (!orgId) return;
 setGenerating(true);
 setError(null);

 try {
 const res = await fetch("/api/obituarios", {
 method:"POST",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({ org_id: orgId }),
 });

 if (!res.ok) {
 const err = await res.json();
 setError(err.error ??"Error al generar obituarios");
 setGenerating(false);
 return;
 }

 // Reload obituaries for the current month
 setSelectedMonth(getCurrentMonth());
 await loadObituaries(getCurrentMonth());
 } catch {
 setError("Error de conexion al generar obituarios");
 } finally {
 setGenerating(false);
 }
 }

 const isCurrentMonth = selectedMonth === getCurrentMonth();
 const canGoNext = selectedMonth < getCurrentMonth();

 if (orgLoading || (loading && obituaries.length === 0)) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">Cargando...</div>
 </div>
 );
 }

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-start justify-between mb-8">
 <div>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Newspaper className="w-5 h-5 text-primary"/>
 Obituario Mensual
 </h1>
 <p className="text-xs font-mono text-muted-foreground mt-1">
 Obituarios satiricos generados por Claude basados en los datos
 reales de productividad del equipo.
 </p>
 </div>
 <Button
 className="bg-primary text-primary-foreground font-mono text-xs gap-2"onClick={handleGenerate}
 disabled={generating}
 >
 {generating ? (
 <Loader2 className="w-4 h-4 animate-spin"/>
 ) : (
 <Sparkles className="w-4 h-4"/>
 )}
 {generating ?"Generando...":"Generar obituarios"}
 </Button>
 </div>

 {/* Generation loading state */}
 {generating && (
 <div className="mb-8">
 <div className="flex flex-col items-center gap-4 px-6 py-10 bg-slate-950 border border-border">
 <Skull className="w-10 h-10 text-slate-400 animate-pulse"/>
 <div className="text-center">
 <p className="text-xs font-mono text-slate-300 uppercase tracking-widest">
 Claude esta redactando los obituarios...
 </p>
 <p className="text-xs font-mono text-slate-500 mt-1">
 Analizando 30 dias de datos para escribir las elegias mas
 dramaticas que el equipo haya visto.
 </p>
 </div>
 <div className="flex gap-1">
 {[0, 1, 2].map((i) => (
 <div
 key={i}
 className="w-2 h-2 bg-slate-600 animate-pulse"style={{ animationDelay:`${i * 200}ms`}}
 />
 ))}
 </div>
 </div>
 </div>
 )}

 {/* Error state */}
 {error && (
 <div className="mb-6 px-4 py-3 bg-destructive/5 border border-destructive/20">
 <p className="text-xs font-mono text-destructive">{error}</p>
 </div>
 )}

 {/* Month navigation */}
 <div className="flex items-center justify-between mb-6">
 <Button
 variant="ghost"size="sm"className="gap-1 font-mono text-xs"onClick={() => setSelectedMonth(getPreviousMonth(selectedMonth))}
 >
 <ChevronLeft className="w-4 h-4"/>
 Anterior
 </Button>
 <div className="flex items-center gap-2">
 <Calendar className="w-4 h-4 text-muted-foreground"/>
 <span className="font-mono text-sm tabular-nums tracking-tight">
 {formatMonth(selectedMonth)}
 </span>
 {isCurrentMonth && (
 <Badge variant="secondary"className="font-mono text-[9px] tracking-widest uppercase">
 Este mes
 </Badge>
 )}
 </div>
 <Button
 variant="ghost"size="sm"className="gap-1 font-mono text-xs"onClick={() => setSelectedMonth(getNextMonth(selectedMonth))}
 disabled={!canGoNext}
 >
 Siguiente
 <ChevronRight className="w-4 h-4"/>
 </Button>
 </div>

 {/* Obituary cards */}
 {!loading && obituaries.length > 0 && (
 <div className="space-y-5">
 {obituaries.map((obit) => (
 <Card
 key={obit.id}
 className="bg-slate-950 text-slate-200 border border-border transition-colors hover:border-primary/30 overflow-hidden">
 <CardContent className="p-0">
 {/* Decorative top border */}
 <div className="h-px bg-slate-700"/>

 <div className="p-6">
 {/* Cross / RIP header */}
 <div className="text-center mb-4">
 <p className="text-2xl text-slate-500 mb-1">
 ✝
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-slate-600">
 Descanse en productividad
 </p>
 </div>

 {/* Person info */}
 <div className="flex items-center justify-center gap-3 mb-5">
 <Avatar className="w-12 h-12 ring-1 ring-border">
 <AvatarImage
 src={obit.profile?.avatar_url ?? undefined}
 />
 <AvatarFallback className="bg-slate-800 text-slate-300">
 {getInitials(obit.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div>
 <p className="font-mono font-bold text-slate-100 tracking-tight uppercase">
 {obit.profile?.full_name ??"Desconocido"}
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-slate-500">
 {formatMonth(obit.month)}
 </p>
 </div>
 </div>

 {/* Divider */}
 <div className="flex items-center gap-3 mb-5">
 <div className="flex-1 h-px bg-slate-800"/>
 <ScrollText className="w-4 h-4 text-slate-600"/>
 <div className="flex-1 h-px bg-slate-800"/>
 </div>

 {/* Obituary text */}
 <p className="text-xs font-mono text-slate-300 italic leading-relaxed text-center px-4">
 &ldquo;{obit.content}&rdquo;
 </p>

 {/* Footer */}
 <div className="mt-5 pt-4 border-t border-slate-800/60 flex items-center justify-center gap-2">
 {obit.ai_generated && (
 <Badge
 variant="secondary"className="font-mono text-[9px] tracking-widest uppercase gap-1 bg-slate-800 text-slate-400 border-slate-700">
 <Sparkles className="w-3 h-3"/>
 Generado por Claude
 </Badge>
 )}
 </div>
 </div>

 {/* Decorative bottom border */}
 <div className="h-px bg-slate-700"/>
 </CardContent>
 </Card>
 ))}
 </div>
 )}

 {/* Loading state for month switch */}
 {loading && obituaries.length === 0 && !generating && (
 <div className="space-y-5">
 {[0, 1, 2].map((i) => (
 <div
 key={i}
 className="h-48 bg-slate-950 border border-border animate-pulse"/>
 ))}
 </div>
 )}

 {/* Empty state */}
 {!loading && !generating && obituaries.length === 0 && (
 <div className="flex flex-col items-center justify-center py-16 gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Skull className="w-7 h-7 text-primary/40"/>
 </div>
 <div className="text-center">
 <p className="text-xs font-mono text-muted-foreground">
 No hay obituarios para {formatMonth(selectedMonth)}.
 </p>
 {isCurrentMonth && (
 <p className="text-xs font-mono text-muted-foreground mt-1">
 Presiona &quot;Generar obituarios&quot; para que Claude escriba
 las elegias del mes.
 </p>
 )}
 </div>
 {isCurrentMonth && (
 <Button
 className="bg-primary text-primary-foreground font-mono text-xs gap-2"onClick={handleGenerate}
 disabled={generating}
 >
 <Skull className="w-4 h-4"/>
 Generar obituarios
 </Button>
 )}
 </div>
 )}

 {/* Past months history */}
 {availableMonths.length > 1 && (
 <div className="mt-10 mb-8">
 <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
 <Calendar className="w-3 h-3"/>
 Meses anteriores
 </h2>
 <div className="flex flex-wrap gap-2">
 {availableMonths
 .filter((m) => m !== selectedMonth)
 .map((month) => (
 <Button
 key={month}
 variant="outline"size="sm"className={cn(
"font-mono text-xs",
 month === selectedMonth &&"border-primary text-primary")}
 onClick={() => setSelectedMonth(month)}
 >
 {formatMonth(month)}
 </Button>
 ))}
 </div>
 </div>
 )}
 </div>
 );
}
