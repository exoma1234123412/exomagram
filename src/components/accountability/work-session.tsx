"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Play, Square, Pause, Clock, AlertTriangle, Zap, MousePointer } from "lucide-react";

// ANTI-GAMING: Active Work Sessions
// Instead of just"logging"an hour retroactively, you must START a session,
// work during it, and END it. The session tracks:
// - Total time elapsed
// - Active time (mouse/keyboard detected in browser)
// - Idle time (no activity for 3+ min → auto-pauses and shows warning)
// - Idle ratio → if you were"idle"more than 30% of the session, it's flagged
//
// This makes it impossible to start a timer and walk away.

export function WorkSessionTracker({ orgId }: { orgId: string }) {
 const [isActive, setIsActive] = useState(false);
 const [isPaused, setIsPaused] = useState(false);
 const [task, setTask] = useState("");
 const [category, setCategory] = useState<WorkCategory |"">("");
 const [elapsedSeconds, setElapsedSeconds] = useState(0);
 const [activeSeconds, setActiveSeconds] = useState(0);
 const [idleSeconds, setIdleSeconds] = useState(0);
 const [lastActivity, setLastActivity] = useState(Date.now());
 const [idleWarning, setIdleWarning] = useState(false);
 const [sessionId, setSessionId] = useState<string | null>(null);
 const intervalRef = useRef<NodeJS.Timeout | null>(null);
 const supabase = createClient();

 const IDLE_THRESHOLD = 180; // 3 minutes in seconds

 // Track mouse/keyboard activity
 useEffect(() => {
 if (!isActive || isPaused) return;

 function onActivity() {
 setLastActivity(Date.now());
 if (idleWarning) setIdleWarning(false);
 }

 window.addEventListener("mousemove", onActivity);
 window.addEventListener("keydown", onActivity);
 window.addEventListener("click", onActivity);
 window.addEventListener("scroll", onActivity);

 return () => {
 window.removeEventListener("mousemove", onActivity);
 window.removeEventListener("keydown", onActivity);
 window.removeEventListener("click", onActivity);
 window.removeEventListener("scroll", onActivity);
 };
 }, [isActive, isPaused, idleWarning]);

 // Timer tick
 useEffect(() => {
 if (!isActive) return;

 intervalRef.current = setInterval(() => {
 if (isPaused) return;

 setElapsedSeconds((prev) => prev + 1);

 const idleTime = (Date.now() - lastActivity) / 1000;
 if (idleTime >= IDLE_THRESHOLD) {
 setIdleSeconds((prev) => prev + 1);
 if (!idleWarning) setIdleWarning(true);
 } else {
 setActiveSeconds((prev) => prev + 1);
 }
 }, 1000);

 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [isActive, isPaused, lastActivity, idleWarning]);

 async function startSession() {
 if (!task.trim() || !category) return;

 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;

 setIsActive(true);
 setIsPaused(false);
 setElapsedSeconds(0);
 setActiveSeconds(0);
 setIdleSeconds(0);
 setLastActivity(Date.now());
 setIdleWarning(false);

 // Update live status
 await supabase.from("live_status").upsert({
 user_id: user.id,
 org_id: orgId,
 status: category ==="meeting"?"in_meeting":"deep_work",
 current_task: task,
 started_at: new Date().toISOString(),
 last_heartbeat: new Date().toISOString(),
 });

 setSessionId(crypto.randomUUID());
 }

 async function endSession() {
 if (!isActive) return;

 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;

 const totalMinutes = Math.round(elapsedSeconds / 60);
 const activeMinutes = Math.round(activeSeconds / 60);
 const idleMinutes = Math.round(idleSeconds / 60);
 const idlePercent = elapsedSeconds > 0 ? Math.round((idleSeconds / elapsedSeconds) * 100) : 0;
 const now = new Date();

 // Create time entry with session metadata
 await supabase.from("time_entries").upsert({
 user_id: user.id,
 org_id: orgId,
 date: now.toISOString().split("T")[0],
 hour: now.getHours(),
 category: category as WorkCategory,
 title: task,
 description:`Sesión activa: ${activeMinutes}min activo, ${idleMinutes}min idle (${idlePercent}% idle)`,
 logged_at: now.toISOString(),
 is_late: false,
 minutes_late: 0,
 verification_status: idlePercent > 30 ?"flagged":"unverified",
 }, { onConflict:"user_id,org_id,date,hour"});

 // Log session details to audit
 await supabase.from("audit_log").insert({
 org_id: orgId,
 user_id: user.id,
 action:"entry_created",
 target_type:"work_session",
 new_data: {
 session_id: sessionId,
 task,
 category,
 total_seconds: elapsedSeconds,
 active_seconds: activeSeconds,
 idle_seconds: idleSeconds,
 idle_percent: idlePercent,
 flagged: idlePercent > 30,
 },
 });

 // If idle > 30%, flag it
 if (idlePercent > 30) {
 await supabase.from("accountability_flags").insert({
 user_id: user.id,
 org_id: orgId,
 flag_type:"suspicious_pattern",
 date: now.toISOString().split("T")[0],
 details:`Sesión de ${totalMinutes}min con ${idlePercent}% idle. Solo ${activeMinutes}min de actividad real.`,
 });
 }

 // Reset live status
 await supabase.from("live_status").upsert({
 user_id: user.id,
 org_id: orgId,
 status:"online",
 current_task: null,
 last_heartbeat: new Date().toISOString(),
 });

 setIsActive(false);
 setIsPaused(false);
 setSessionId(null);
 }

 const totalMinutes = Math.floor(elapsedSeconds / 60);
 const secs = elapsedSeconds % 60;
 const idlePercent = elapsedSeconds > 0 ? Math.round((idleSeconds / elapsedSeconds) * 100) : 0;
 const activePercent = 100 - idlePercent;

 return (
 <Card className={cn(
"transition-all",
 isActive && !idleWarning &&"border-green-300 dark:border-green-800 shadow-green-500/10",
 idleWarning &&"border-red-300 dark:border-red-800 shadow-red-500/10 animate-pulse",
 )}>
 <CardContent className="p-5">
 <div className="flex items-center gap-2 mb-3">
 <Zap className="w-4 h-4 text-primary"/>
 <h3 className="text-sm font-semibold">Sesión de trabajo verificada</h3>
 {isActive && (
 <Badge variant="outline"className={cn(
"text-[10px] ml-auto",
 idleWarning ?"text-red-600 border-red-300":"text-green-600 border-green-300")}>
 {idleWarning ?"IDLE DETECTADO":"ACTIVO"}
 </Badge>
 )}
 </div>

 {/* Idle warning */}
 {idleWarning && (
 <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 mb-3 flex items-start gap-2">
 <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5"/>
 <div className="text-sm">
 <p className="font-medium text-red-700 dark:text-red-400">Sin actividad detectada</p>
 <p className="text-[10px] text-red-600/70">Mueve el mouse o escribe algo. El tiempo idle se registra.</p>
 </div>
 </div>
 )}

 {!isActive ? (
 <>
 {/* Start form */}
 <div className="space-y-3">
 <div className="flex gap-1 flex-wrap">
 {(Object.keys(CATEGORIES) as WorkCategory[]).filter((k) => k !=="break").map((key) => {
 const cat = CATEGORIES[key];
 return (
 <button
 key={key}
 type="button"onClick={() => setCategory(category === key ?"": key)}
 className={cn(
"px-2.5 py-1.5 text-xs transition-all flex items-center gap-1",
 category === key
 ?"bg-primary/10 ring-2 ring-primary font-semibold":"bg-accent/40 hover:bg-accent opacity-70 hover:opacity-100")}
 >
 {cat.emoji} {cat.label}
 </button>
 );
 })}
 </div>
 <Input
 placeholder="¿En qué vas a trabajar?"value={task}
 onChange={(e) => setTask(e.target.value)}
 minLength={10}
 />
 <Button
 onClick={startSession}
 disabled={!task.trim() || !category || task.length < 10}
 className="w-full gap-2">
 <Play className="w-4 h-4"/> Iniciar sesión verificada
 </Button>
 <p className="text-[10px] text-muted-foreground/60 text-center">
 Se monitorea actividad de mouse/teclado. Si estás idle 3+ min, se registra.
 </p>
 </div>
 </>
 ) : (
 <>
 {/* Active session */}
 <div className="text-center mb-4">
 <p className="text-3xl font-mono font-bold tabular-nums">
 {String(totalMinutes).padStart(2,"0")}:{String(secs).padStart(2,"0")}
 </p>
 <p className="text-sm text-muted-foreground mt-1">{task}</p>
 </div>

 {/* Activity bar */}
 <div className="mb-4">
 <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
 <span className="flex items-center gap-1">
 <MousePointer className="w-3 h-3"/> Activo: {activePercent}%
 </span>
 <span className={cn(idlePercent > 30 &&"text-red-600 font-bold")}>
 Idle: {idlePercent}%
 </span>
 </div>
 <div className="h-2 bg-muted/30 rounded-full overflow-hidden flex">
 <div className="h-full bg-green-500 transition-all"style={{ width:`${activePercent}%`}} />
 <div className="h-full bg-red-400 transition-all"style={{ width:`${idlePercent}%`}} />
 </div>
 {idlePercent > 30 && (
 <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
 <AlertTriangle className="w-3 h-3"/>
 Más del 30% idle — esta sesión será flaggeada
 </p>
 )}
 </div>

 <div className="flex gap-2">
 <Button
 variant="outline"onClick={() => setIsPaused(!isPaused)}
 className="flex-1 gap-2">
 {isPaused ? <Play className="w-4 h-4"/> : <Pause className="w-4 h-4"/>}
 {isPaused ?"Reanudar":"Pausar"}
 </Button>
 <Button
 variant="destructive"onClick={endSession}
 className="flex-1 gap-2">
 <Square className="w-4 h-4"/> Terminar
 </Button>
 </div>
 </>
 )}
 </CardContent>
 </Card>
 );
}
