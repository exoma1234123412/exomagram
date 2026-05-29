"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, INTERRUPTION_SOURCES } from "@/lib/constants";
import type { FocusSession, WorkCategory, MoodLevel, InterruptionSource } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn, getTodayMTY } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
 Crosshair,
 Play,
 Square,
 X,
 Plus,
 Clock,
 AlertTriangle,
 Activity,
 Star,
 Flame,
 Calendar,
} from "lucide-react";

// ─────────────────────────────────────────────
// Duration options
// ─────────────────────────────────────────────
const DURATION_OPTIONS = [15, 25, 45, 60, 90];

// ─────────────────────────────────────────────
// Timer display helper
// ─────────────────────────────────────────────
function formatTimer(seconds: number): string {
 const h = Math.floor(seconds / 3600);
 const m = Math.floor((seconds % 3600) / 60);
 const s = seconds % 60;
 if (h > 0) {
 return`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
 }
 return`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
export default function FocusPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();
 const today = getTodayMTY();

 // Active session
 const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
 const [elapsed, setElapsed] = useState(0);
 const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

 // Today's completed sessions
 const [todaySessions, setTodaySessions] = useState<FocusSession[]>([]);
 const [loading, setLoading] = useState(true);

 // New session form
 const [newTitle, setNewTitle] = useState("");
 const [newCategory, setNewCategory] = useState<string>("");
 const [newDuration, setNewDuration] = useState<number>(25);
 const [showNewForm, setShowNewForm] = useState(false);

 // Interruption form
 const [intSource, setIntSource] = useState<string>("slack");

 // Completion form
 const [completing, setCompleting] = useState(false);
 const [qualityRating, setQualityRating] = useState<MoodLevel | null>(null);
 const [flowAchieved, setFlowAchieved] = useState(false);
 const [deliverables, setDeliverables] = useState("");

 // ─── Load data ────────────────────────────

 const loadSessions = useCallback(async () => {
 if (!orgId || !userId) return;

 const startOfDay = today +"T00:00:00";
 const endOfDay = today +"T23:59:59";

 const { data: sessions } = await supabase
 .from("focus_sessions")
 .select("*")
 .eq("user_id", userId)
 .eq("org_id", orgId)
 .gte("started_at", startOfDay)
 .lte("started_at", endOfDay)
 .order("started_at", { ascending: false });

 const all = (sessions ?? []) as FocusSession[];

 // Find active session (ended_at is null)
 const active = all.find((s) => !s.ended_at) ?? null;
 const completed = all.filter((s) => s.ended_at);

 setActiveSession(active);
 setTodaySessions(completed);

 // Start timer if active session exists
 if (active) {
 const startTime = new Date(active.started_at).getTime();
 const now = Date.now();
 setElapsed(Math.floor((now - startTime) / 1000));
 }

 setLoading(false);
 }, [orgId, userId, today]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId || !userId) {
 setLoading(false);
 return;
 }
 loadSessions();
 }, [orgLoading, orgId, userId, loadSessions]);

 // ─── Timer interval ──────────────────────

 useEffect(() => {
 if (activeSession) {
 intervalRef.current = setInterval(() => {
 const startTime = new Date(activeSession.started_at).getTime();
 setElapsed(Math.floor((Date.now() - startTime) / 1000));
 }, 1000);
 } else {
 setElapsed(0);
 }
 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [activeSession]);

 // ─── Actions ──────────────────────────────

 async function startSession(e: React.FormEvent) {
 e.preventDefault();
 if (!userId || !orgId || !newTitle.trim()) return;

 const { data, error } = await supabase
 .from("focus_sessions")
 .insert({
 user_id: userId,
 org_id: orgId,
 task_title: newTitle.trim(),
 category: newCategory || null,
 planned_minutes: newDuration,
 started_at: new Date().toISOString(),
 was_completed: false,
 interruption_count: 0,
 interruption_sources: [],
 flow_state_achieved: false,
 })
 .select("*")
 .single();

 if (!error && data) {
 setActiveSession(data as FocusSession);
 setNewTitle("");
 setNewCategory("");
 setNewDuration(25);
 setShowNewForm(false);
 }
 }

 async function addInterruption() {
 if (!activeSession) return;

 const newCount = activeSession.interruption_count + 1;
 const newSources = [
 ...activeSession.interruption_sources,
 intSource as InterruptionSource,
 ];

 await supabase
 .from("focus_sessions")
 .update({
 interruption_count: newCount,
 interruption_sources: newSources,
 })
 .eq("id", activeSession.id);

 setActiveSession({
 ...activeSession,
 interruption_count: newCount,
 interruption_sources: newSources,
 });
 }

 async function completeSession() {
 if (!activeSession) return;

 const now = new Date();
 const startTime = new Date(activeSession.started_at);
 const actualMinutes = Math.round((now.getTime() - startTime.getTime()) / 60000);

 const { data, error } = await supabase
 .from("focus_sessions")
 .update({
 ended_at: now.toISOString(),
 actual_minutes: actualMinutes,
 was_completed: true,
 quality_rating: qualityRating,
 flow_state_achieved: flowAchieved,
 deliverables: deliverables.trim() || null,
 })
 .eq("id", activeSession.id)
 .select("*")
 .single();

 if (!error && data) {
 setTodaySessions((prev) => [data as FocusSession, ...prev]);
 setActiveSession(null);
 setCompleting(false);
 setQualityRating(null);
 setFlowAchieved(false);
 setDeliverables("");
 }
 }

 async function cancelSession() {
 if (!activeSession) return;

 const now = new Date();
 const startTime = new Date(activeSession.started_at);
 const actualMinutes = Math.round((now.getTime() - startTime.getTime()) / 60000);

 await supabase
 .from("focus_sessions")
 .update({
 ended_at: now.toISOString(),
 actual_minutes: actualMinutes,
 was_completed: false,
 })
 .eq("id", activeSession.id);

 setActiveSession(null);
 setCompleting(false);
 loadSessions();
 }

 // ─── Stats ────────────────────────────────

 const completedToday = todaySessions.filter((s) => s.was_completed);
 const totalFocusMinutes = completedToday.reduce(
 (sum, s) => sum + (s.actual_minutes ?? 0),
 0
 );
 const avgQuality =
 completedToday.filter((s) => s.quality_rating).length > 0
 ? (
 completedToday.reduce((sum, s) => sum + (s.quality_rating ?? 0), 0) /
 completedToday.filter((s) => s.quality_rating).length
 ).toFixed(1)
 :"-";
 const totalInterruptions = completedToday.reduce(
 (sum, s) => sum + s.interruption_count,
 0
 );
 const interruptionsPerHour =
 totalFocusMinutes > 0
 ? ((totalInterruptions / totalFocusMinutes) * 60).toFixed(1)
 :"-";
 const flowRate =
 completedToday.length > 0
 ? Math.round(
 (completedToday.filter((s) => s.flow_state_achieved).length /
 completedToday.length) *
 100
 )
 : 0;

 // ─── Loading ──────────────────────────────

 if (loading || orgLoading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </div>
 </div>
 );
 }

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Sesiones de Enfoque
 </h1>
 <p className="text-xs font-mono text-muted-foreground mt-1">
 Rastrea tus sesiones de trabajo profundo y mide tu capacidad de Focus.
 </p>
 </div>

 {/* ─── Active Session Panel ────────────── */}
 <section className="mb-8">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 block">
 SESION ACTIVA
 </span>

 {!activeSession && !showNewForm ? (
 <div className="border border-border p-6 text-center">
 <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-3">
 <Crosshair className="w-8 h-8 text-muted-foreground"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground mb-4">
 Sin sesion activa
 </p>
 <Button
 onClick={() => setShowNewForm(true)}
 className="font-mono text-xs gap-2">
 <Play className="w-3.5 h-3.5"/> Iniciar Sesion
 </Button>
 </div>
 ) : !activeSession && showNewForm ? (
 <div className="border border-border p-4">
 <form onSubmit={startSession} className="space-y-4">
 {/* Task title */}
 <div>
 <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
 Tarea
 </label>
 <Input
 value={newTitle}
 onChange={(e) => setNewTitle(e.target.value)}
 placeholder="En que vas a trabajar?"required
 className="font-mono text-xs"/>
 </div>

 {/* Category */}
 <div>
 <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
 Categoria
 </label>
 <div className="flex flex-wrap gap-1">
 {(Object.keys(CATEGORIES) as WorkCategory[]).map((key) => {
 const cat = CATEGORIES[key];
 return (
 <button
 key={key}
 type="button"onClick={() => setNewCategory(newCategory === key ?"": key)}
 className={cn(
"px-2 py-1 text-[10px] font-mono border border-border cursor-pointer transition-colors",
 newCategory === key
 ?"bg-primary text-primary-foreground border-primary":"hover:border-primary/40")}
 >
 {cat.emoji} {cat.label}
 </button>
 );
 })}
 </div>
 </div>

 {/* Duration */}
 <div>
 <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
 Duracion planeada
 </label>
 <div className="flex gap-1">
 {DURATION_OPTIONS.map((d) => (
 <button
 key={d}
 type="button"onClick={() => setNewDuration(d)}
 className={cn(
"px-3 py-1.5 text-[10px] font-mono tabular-nums border border-border cursor-pointer transition-colors",
 newDuration === d
 ?"bg-primary text-primary-foreground border-primary":"hover:border-primary/40")}
 >
 {d}m
 </button>
 ))}
 </div>
 </div>

 {/* Actions */}
 <div className="flex gap-2">
 <Button type="submit"disabled={!newTitle.trim()} className="font-mono text-xs gap-2">
 <Play className="w-3.5 h-3.5"/> Comenzar
 </Button>
 <Button
 type="button"variant="ghost"onClick={() => setShowNewForm(false)}
 className="font-mono text-xs">
 Cancelar
 </Button>
 </div>
 </form>
 </div>
 ) : activeSession && !completing ? (
 <div className="border border-primary/30 bg-primary/5 p-4">
 {/* Timer */}
 <div className="text-center mb-4">
 <p className="font-mono text-4xl tabular-nums tracking-tight font-bold">
 {formatTimer(elapsed)}
 </p>
 <p className="font-mono text-xs text-muted-foreground mt-1">
 {activeSession.task_title}
 </p>
 {activeSession.category && (
 <Badge variant="outline"className="text-[9px] font-mono mt-1">
 {CATEGORIES[activeSession.category as WorkCategory]?.emoji}{""}
 {CATEGORIES[activeSession.category as WorkCategory]?.label}
 </Badge>
 )}
 <p className="font-mono text-[9px] text-muted-foreground mt-1">
 Planeado: {activeSession.planned_minutes}m
 </p>
 </div>

 {/* Interruptions */}
 <div className="flex items-center justify-between border border-border p-2 mb-4">
 <div className="flex items-center gap-2">
 <AlertTriangle className="w-3 h-3 text-muted-foreground/60"/>
 <span className="font-mono text-[10px] uppercase text-muted-foreground/60">
 Interrupciones
 </span>
 <span className="font-mono text-xs tabular-nums font-bold">
 {activeSession.interruption_count}
 </span>
 </div>
 <div className="flex items-center gap-1">
 <select
 value={intSource}
 onChange={(e) => setIntSource(e.target.value)}
 className="font-mono text-[10px] h-6 px-1 border border-border bg-transparent">
 {Object.entries(INTERRUPTION_SOURCES).map(([key, val]) => (
 <option key={key} value={key}>
 {val.emoji} {val.label}
 </option>
 ))}
 </select>
 <button
 type="button"onClick={addInterruption}
 className="w-6 h-6 border border-border flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors">
 <Plus className="w-3 h-3"/>
 </button>
 </div>
 </div>

 {/* Actions */}
 <div className="flex gap-2">
 <Button
 onClick={() => setCompleting(true)}
 className="font-mono text-xs gap-2 flex-1">
 <Square className="w-3.5 h-3.5"/> Completar
 </Button>
 <Button
 variant="ghost"onClick={cancelSession}
 className="font-mono text-xs gap-2 text-red-500 hover:text-red-600">
 <X className="w-3.5 h-3.5"/> Cancelar
 </Button>
 </div>
 </div>
 ) : activeSession && completing ? (
 <div className="border border-primary/30 bg-primary/5 p-4">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 block">
 COMPLETAR SESION
 </span>

 {/* Quality rating */}
 <div className="mb-3">
 <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
 Calidad de la sesion
 </label>
 <div className="flex gap-1">
 {([1, 2, 3, 4, 5] as MoodLevel[]).map((n) => (
 <button
 key={n}
 type="button"onClick={() => setQualityRating(n)}
 className={cn(
"w-8 h-8 border border-border flex items-center justify-center cursor-pointer transition-colors",
 qualityRating === n
 ?"bg-primary text-primary-foreground border-primary":"hover:border-primary/40")}
 >
 <Star
 className={cn(
"w-3.5 h-3.5",
 qualityRating != null && n <= qualityRating
 ?"fill-current":"")}
 />
 </button>
 ))}
 </div>
 </div>

 {/* Flow state */}
 <div className="mb-3">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"checked={flowAchieved}
 onChange={(e) => setFlowAchieved(e.target.checked)}
 className="accent-primary"/>
 <span className="font-mono text-[10px] uppercase text-muted-foreground/60">
 Flow state alcanzado
 </span>
 {flowAchieved && <Flame className="w-3 h-3 text-orange-500"/>}
 </label>
 </div>

 {/* Deliverables */}
 <div className="mb-4">
 <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
 Entregables / resultado
 </label>
 <Textarea
 value={deliverables}
 onChange={(e) => setDeliverables(e.target.value)}
 placeholder="Que lograste en esta sesion?"rows={2}
 className="font-mono text-xs min-h-[48px]"/>
 </div>

 {/* Actions */}
 <div className="flex gap-2">
 <Button onClick={completeSession} className="font-mono text-xs gap-2">
 Guardar
 </Button>
 <Button
 variant="ghost"onClick={() => setCompleting(false)}
 className="font-mono text-xs">
 Volver
 </Button>
 </div>
 </div>
 ) : null}
 </section>

 {/* ─── Today's Sessions ────────────────── */}
 <section className="mb-8">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 block">
 SESIONES DE HOY
 </span>

 {todaySessions.length === 0 ? (
 <div className="border border-border p-6 text-center">
 <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-3">
 <Calendar className="w-8 h-8 text-muted-foreground"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground">
 Sin sesiones completadas hoy
 </p>
 </div>
 ) : (
 <div className="space-y-1">
 {todaySessions.map((s) => {
 const startTime = format(new Date(s.started_at),"HH:mm", { locale: es });
 const catConfig = s.category
 ? CATEGORIES[s.category as WorkCategory]
 : null;

 return (
 <div
 key={s.id}
 className="border border-border p-3 flex items-center gap-3 hover:border-primary/30 transition-colors">
 {/* Time */}
 <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60 w-10 shrink-0">
 {startTime}
 </span>

 {/* Duration */}
 <span className="font-mono text-xs tabular-nums font-bold w-10 shrink-0">
 {s.actual_minutes ?? 0}m
 </span>

 {/* Title */}
 <span className="font-mono text-xs flex-1 truncate">{s.task_title}</span>

 {/* Category dot */}
 {catConfig && (
 <span className="text-[10px]"title={catConfig.label}>
 {catConfig.emoji}
 </span>
 )}

 {/* Interruptions */}
 {s.interruption_count > 0 && (
 <span className="font-mono text-[9px] tabular-nums text-muted-foreground flex items-center gap-0.5">
 <AlertTriangle className="w-2.5 h-2.5"/>
 {s.interruption_count}
 </span>
 )}

 {/* Quality stars */}
 {s.quality_rating && (
 <div className="flex gap-0">
 {Array.from({ length: 5 }).map((_, i) => (
 <Star
 key={i}
 className={cn(
"w-2.5 h-2.5",
 i < s.quality_rating!
 ?"text-primary fill-primary":"text-muted-foreground/20")}
 />
 ))}
 </div>
 )}

 {/* Flow */}
 {s.flow_state_achieved && (
 <Flame className="w-3 h-3 text-orange-500"/>
 )}

 {/* Completed badge */}
 {!s.was_completed && (
 <Badge
 variant="outline"className="text-[8px] font-mono text-red-500 border-red-500/30">
 Cancelada
 </Badge>
 )}
 </div>
 );
 })}
 </div>
 )}
 </section>

 {/* ─── Stats Panel ─────────────────────── */}
 <section className="mb-8">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 block">
 ESTADISTICAS
 </span>

 <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
 <div className="bg-accent/30 border border-border p-3 text-center">
 <Clock className="w-3.5 h-3.5 text-primary mx-auto mb-1"/>
 <p className="font-mono text-lg tabular-nums tracking-tight font-bold">
 {totalFocusMinutes > 60
 ?`${Math.floor(totalFocusMinutes / 60)}h ${totalFocusMinutes % 60}m`:`${totalFocusMinutes}m`}
 </p>
 <p className="font-mono text-[8px] text-muted-foreground uppercase">
 Focus total hoy
 </p>
 </div>

 <div className="bg-accent/30 border border-border p-3 text-center">
 <Star className="w-3.5 h-3.5 text-primary mx-auto mb-1"/>
 <p className="font-mono text-lg tabular-nums tracking-tight font-bold">
 {avgQuality}
 </p>
 <p className="font-mono text-[8px] text-muted-foreground uppercase">
 Calidad promedio
 </p>
 </div>

 <div className="bg-accent/30 border border-border p-3 text-center">
 <AlertTriangle className="w-3.5 h-3.5 text-primary mx-auto mb-1"/>
 <p className="font-mono text-lg tabular-nums tracking-tight font-bold">
 {interruptionsPerHour}
 </p>
 <p className="font-mono text-[8px] text-muted-foreground uppercase">
 Interrupciones/h
 </p>
 </div>

 <div className="bg-accent/30 border border-border p-3 text-center">
 <Flame className="w-3.5 h-3.5 text-primary mx-auto mb-1"/>
 <p className="font-mono text-lg tabular-nums tracking-tight font-bold">
 {flowRate}%
 </p>
 <p className="font-mono text-[8px] text-muted-foreground uppercase">
 Flow state rate
 </p>
 </div>

 <div className="bg-accent/30 border border-border p-3 text-center">
 <Crosshair className="w-3.5 h-3.5 text-primary mx-auto mb-1"/>
 <p className="font-mono text-lg tabular-nums tracking-tight font-bold">
 {completedToday.length}
 </p>
 <p className="font-mono text-[8px] text-muted-foreground uppercase">
 Sesiones hoy
 </p>
 </div>

 <div className="bg-accent/30 border border-border p-3 text-center">
 <Activity className="w-3.5 h-3.5 text-primary mx-auto mb-1"/>
 <p className="font-mono text-lg tabular-nums tracking-tight font-bold">
 {totalInterruptions}
 </p>
 <p className="font-mono text-[8px] text-muted-foreground uppercase">
 Interrupciones total
 </p>
 </div>
 </div>
 </section>
 </div>
 );
}
