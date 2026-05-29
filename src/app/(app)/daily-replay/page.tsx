"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, cn } from "@/lib/utils";
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/constants";
import type { TimeEntry, Profile, WorkCategory } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
 Camera, Play, Pause, SkipForward, Calendar, ChevronLeft, ChevronRight,
 Clock, Shield, AlertTriangle, Ghost, Trophy, User, Eye,
} from "lucide-react";
import { format, subDays, addDays } from "date-fns";
import { es } from "date-fns/locale";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface ReplayEntry extends TimeEntry {
 profile?: Profile;
}

interface GapSegment {
 userId: string;
 startHour: number;
 endHour: number;
 durationMinutes: number;
}

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const WORK_START = 7; // 7:00 AM
const WORK_END = 18; // 6:00 PM
const TOTAL_WORK_MINUTES = (WORK_END - WORK_START) * 60; // 660
const REPLAY_DURATION_MS = (WORK_END - WORK_START) * 2000; // 22s total (1 hr = 2s)
const TICK_MS = 50; // update every 50ms for smooth animation
const GAP_THRESHOLD_MINUTES = 30;

function minutesSinceStart(hour: number): number {
 return (hour - WORK_START) * 60;
}

function replayTimeToDisplay(replayMinutes: number): string {
 const totalMinutes = WORK_START * 60 + replayMinutes;
 const h = Math.floor(totalMinutes / 60);
 const m = Math.floor(totalMinutes % 60);
 const ampm = h >= 12 ?"PM":"AM";
 const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
 return`${h12}:${m.toString().padStart(2,"0")} ${ampm}`;
}

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function DailyReplayPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 // Date state
 const [date, setDate] = useState(() => {
 const today = getTodayMTY();
 return subDays(new Date(today +"T12:00:00"), 1).toISOString().split("T")[0];
 });

 // Data
 const [entries, setEntries] = useState<ReplayEntry[]>([]);
 const [profiles, setProfiles] = useState<Record<string, Profile>>({});
 const [memberIds, setMemberIds] = useState<string[]>([]);
 const [loading, setLoading] = useState(true);

 // Replay state
 const [playing, setPlaying] = useState(false);
 const [replayMinutes, setReplayMinutes] = useState(0); // 0 = 7:00 AM, 660 = 6:00 PM
 const [completed, setCompleted] = useState(false);
 const [autoStarted, setAutoStarted] = useState(false);
 const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

 const isToday = date === getTodayMTY();
 const displayDate = format(new Date(date +"T12:00:00"),"EEEE, d MMMM yyyy", { locale: es });

 // ------------------------------------------------------------------
 // Data Loading
 // ------------------------------------------------------------------

 useEffect(() => {
 if (!orgId) return;
 setLoading(true);
 setPlaying(false);
 setReplayMinutes(0);
 setCompleted(false);
 setAutoStarted(false);

 async function load() {
 // Get org members
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id")
 .eq("org_id", orgId!);

 const ids = (members || []).map((m) => m.user_id);
 setMemberIds(ids);

 // Get profiles
 const { data: profs } = await supabase
 .from("profiles")
 .select("*")
 .in("id", ids);

 const profileMap: Record<string, Profile> = {};
 (profs || []).forEach((p) => { profileMap[p.id] = p as Profile; });
 setProfiles(profileMap);

 // Get entries for the date
 const { data: dayEntries } = await supabase
 .from("time_entries")
 .select("*")
 .eq("org_id", orgId!)
 .eq("date", date)
 .order("hour", { ascending: true });

 const enriched: ReplayEntry[] = (dayEntries || []).map((e) => ({
 ...e as TimeEntry,
 profile: profileMap[e.user_id] || undefined,
 }));

 setEntries(enriched);
 setLoading(false);
 }
 load();
 }, [orgId, date]); // eslint-disable-line react-hooks/exhaustive-deps

 // Auto-start replay when data loads
 useEffect(() => {
 if (!loading && entries.length > 0 && !autoStarted) {
 setAutoStarted(true);
 setPlaying(true);
 }
 }, [loading, entries.length, autoStarted]);

 // ------------------------------------------------------------------
 // Replay Timer
 // ------------------------------------------------------------------

 useEffect(() => {
 if (playing && !completed) {
 const minutesPerTick = (TOTAL_WORK_MINUTES / REPLAY_DURATION_MS) * TICK_MS;
 intervalRef.current = setInterval(() => {
 setReplayMinutes((prev) => {
 const next = prev + minutesPerTick;
 if (next >= TOTAL_WORK_MINUTES) {
 setPlaying(false);
 setCompleted(true);
 return TOTAL_WORK_MINUTES;
 }
 return next;
 });
 }, TICK_MS);
 }
 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [playing, completed]);

 // ------------------------------------------------------------------
 // Derived Data
 // ------------------------------------------------------------------

 // Entries visible at current replay time
 const visibleEntries = useMemo(() => {
 const currentHour = WORK_START + replayMinutes / 60;
 return entries.filter((e) => e.hour < currentHour);
 }, [entries, replayMinutes]);

 // Entries for the recently-appeared animation (appeared in last 60 replay-minutes = 2 seconds)
 const recentEntries = useMemo(() => {
 const currentHour = WORK_START + replayMinutes / 60;
 const recentThreshold = currentHour - 1;
 return new Set(
 entries
 .filter((e) => e.hour >= recentThreshold && e.hour < currentHour)
 .map((e) => e.id)
 );
 }, [entries, replayMinutes]);

 // Gaps per user
 const gaps = useMemo(() => {
 const result: GapSegment[] = [];
 const currentHour = WORK_START + replayMinutes / 60;

 memberIds.forEach((uid) => {
 const userEntries = entries
 .filter((e) => e.user_id === uid && e.hour < currentHour)
 .sort((a, b) => a.hour - b.hour);

 if (userEntries.length === 0 && currentHour > WORK_START + 0.5) {
 // No entries at all — the whole span is a gap
 result.push({
 userId: uid,
 startHour: WORK_START,
 endHour: Math.min(currentHour, WORK_END),
 durationMinutes: (Math.min(currentHour, WORK_END) - WORK_START) * 60,
 });
 return;
 }

 // Check gap from work start to first entry
 if (userEntries.length > 0 && userEntries[0].hour - WORK_START >= 0.5) {
 const gapMin = (userEntries[0].hour - WORK_START) * 60;
 if (gapMin >= GAP_THRESHOLD_MINUTES) {
 result.push({
 userId: uid,
 startHour: WORK_START,
 endHour: userEntries[0].hour,
 durationMinutes: gapMin,
 });
 }
 }

 // Check gaps between entries
 for (let i = 0; i < userEntries.length - 1; i++) {
 const gapMin = (userEntries[i + 1].hour - userEntries[i].hour - 1) * 60;
 if (gapMin >= GAP_THRESHOLD_MINUTES) {
 result.push({
 userId: uid,
 startHour: userEntries[i].hour + 1,
 endHour: userEntries[i + 1].hour,
 durationMinutes: gapMin,
 });
 }
 }

 // Check gap from last entry to current time
 if (userEntries.length > 0) {
 const lastHour = userEntries[userEntries.length - 1].hour + 1;
 const gapMin = (Math.min(currentHour, WORK_END) - lastHour) * 60;
 if (gapMin >= GAP_THRESHOLD_MINUTES) {
 result.push({
 userId: uid,
 startHour: lastHour,
 endHour: Math.min(currentHour, WORK_END),
 durationMinutes: gapMin,
 });
 }
 }
 });

 return result;
 }, [entries, memberIds, replayMinutes]);

 // Active gaps (currently happening at replay time)
 const activeGaps = useMemo(() => {
 const currentHour = WORK_START + replayMinutes / 60;
 return gaps.filter((g) => g.startHour <= currentHour && g.endHour >= currentHour - 0.5);
 }, [gaps, replayMinutes]);

 // Users who have logged at current point
 const loggedUsers = useMemo(() => {
 return new Set(visibleEntries.map((e) => e.user_id));
 }, [visibleEntries]);

 // ------------------------------------------------------------------
 // Summary Stats (for completed replay)
 // ------------------------------------------------------------------

 const summary = useMemo(() => {
 if (!completed || entries.length === 0) return null;

 const sorted = [...entries].sort((a, b) => a.hour - b.hour);
 const first = sorted[0];
 const last = sorted[sorted.length - 1];

 // Biggest gap per user
 let biggestGap = { userId:"", minutes: 0 };
 memberIds.forEach((uid) => {
 const userGaps = gaps.filter((g) => g.userId === uid);
 const totalGap = userGaps.reduce((sum, g) => sum + g.durationMinutes, 0);
 if (totalGap > biggestGap.minutes) {
 biggestGap = { userId: uid, minutes: totalGap };
 }
 });

 // Most productive hour
 const hourCounts: Record<number, number> = {};
 entries.forEach((e) => {
 hourCounts[e.hour] = (hourCounts[e.hour] || 0) + 1;
 });
 const bestHour = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0];

 // Ghosts
 const loggers = new Set(entries.map((e) => e.user_id));
 const ghosts = memberIds.filter((id) => !loggers.has(id));

 return { first, last, biggestGap, bestHour, ghosts };
 }, [completed, entries, memberIds, gaps]);

 // ------------------------------------------------------------------
 // Controls
 // ------------------------------------------------------------------

 const handlePlayPause = useCallback(() => {
 if (completed) {
 setReplayMinutes(0);
 setCompleted(false);
 setPlaying(true);
 } else {
 setPlaying((p) => !p);
 }
 }, [completed]);

 const handleSkip = useCallback(() => {
 setReplayMinutes(TOTAL_WORK_MINUTES);
 setPlaying(false);
 setCompleted(true);
 }, []);

 const handleDateChange = useCallback((newDate: string) => {
 setDate(newDate);
 }, []);

 // ------------------------------------------------------------------
 // Render
 // ------------------------------------------------------------------

 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </div>
 </div>
 );
 }

 if (!orgId) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="text-muted-foreground font-mono text-xs">Sin organización</div>
 </div>
 );
 }

 const progressPercent = (replayMinutes / TOTAL_WORK_MINUTES) * 100;

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center justify-between mb-8">
 <div className="flex items-center gap-3">
 <Camera className="w-5 h-5 text-primary"/>
 <div>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Replay Cinematográfico
 </h1>
 <p className="text-xs font-mono text-muted-foreground mt-0.5 capitalize">
 {displayDate}
 </p>
 </div>
 </div>
 {playing && (
 <div className="flex items-center gap-1.5">
 <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"/>
 <span className="font-mono text-[9px] tracking-[0.18em] text-red-500 uppercase">
 REC
 </span>
 </div>
 )}
 </div>

 {/* Date Navigation */}
 <div className="flex items-center gap-2 mb-8">
 <Button
 variant="ghost"size="icon"onClick={() =>
 handleDateChange(
 subDays(new Date(date +"T12:00:00"), 1).toISOString().split("T")[0]
 )
 }
 >
 <ChevronLeft className="w-4 h-4"/>
 </Button>
 <div className="flex items-center gap-2 px-1">
 <Calendar className="w-3.5 h-3.5 text-muted-foreground"/>
 <Input
 type="date"value={date}
 onChange={(e) => handleDateChange(e.target.value)}
 className="w-auto border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto font-mono text-xs"/>
 </div>
 <Button
 variant="ghost"size="icon"onClick={() =>
 handleDateChange(
 addDays(new Date(date +"T12:00:00"), 1).toISOString().split("T")[0]
 )
 }
 >
 <ChevronRight className="w-4 h-4"/>
 </Button>
 {date !== getTodayMTY() && (
 <Button
 variant="secondary"size="sm"className="text-xs font-mono"onClick={() => handleDateChange(getTodayMTY())}
 >
 Hoy
 </Button>
 )}
 </div>

 {/* Empty State */}
 {entries.length === 0 && !loading && (
 <div className="flex flex-col items-center justify-center py-24">
 <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
 <Camera className="w-8 h-8 text-muted-foreground"/>
 </div>
 <p className="font-mono text-sm text-muted-foreground">
 Sin grabaciones para este día
 </p>
 <p className="font-mono text-[10px] text-muted-foreground/60 mt-1">
 No se encontraron entradas registradas
 </p>
 </div>
 )}

 {/* Replay Content */}
 {entries.length > 0 && (
 <>
 {/* Controls & Progress */}
 <div className="border border-border bg-card mb-8">
 {/* Surveillance Header */}
 <div className="border-b border-border px-4 py-2 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Eye className="w-3.5 h-3.5 text-muted-foreground"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Cámara de Vigilancia
 </span>
 </div>
 <span className="font-mono text-[10px] tabular-nums tracking-tight text-muted-foreground">
 {entries.length} registro{entries.length !== 1 ?"s":""}
 </span>
 </div>

 {/* Progress bar */}
 <div className="px-4 pt-3 pb-2">
 <div className="flex items-center justify-between mb-1.5">
 <span className="font-mono text-[10px] tabular-nums tracking-tight text-muted-foreground">
 7:00 AM
 </span>
 <span className="font-mono text-xs tabular-nums tracking-tight font-bold">
 {replayTimeToDisplay(replayMinutes)}
 </span>
 <span className="font-mono text-[10px] tabular-nums tracking-tight text-muted-foreground">
 6:00 PM
 </span>
 </div>

 {/* Timeline bar */}
 <div className="relative h-6 bg-accent/30 border border-border overflow-hidden">
 {/* Progress fill */}
 <div
 className="absolute inset-y-0 left-0 bg-primary/15 transition-[width] duration-100"style={{ width:`${progressPercent}%`}}
 />

 {/* Entry dots */}
 {entries.map((entry) => {
 const pos = (minutesSinceStart(entry.hour) / TOTAL_WORK_MINUTES) * 100;
 const cat = entry.category as WorkCategory;
 const colorClass = CATEGORY_COLORS[cat] ||"bg-gray-500";
 const isVisible = entry.hour < WORK_START + replayMinutes / 60;
 return (
 <div
 key={entry.id}
 className={cn(
"absolute top-1/2 -translate-y-1/2 w-2 h-2 transition-all duration-300",
 colorClass,
 isVisible ?"opacity-100 scale-100":"opacity-0 scale-0")}
 style={{ left:`${pos}%`}}
 title={`${entry.profile?.full_name ||"?"} — ${CATEGORIES[cat]?.emoji} ${entry.title}`}
 />
 );
 })}

 {/* Gap markers (red glow) */}
 {gaps
 .filter((g) => g.startHour < WORK_START + replayMinutes / 60)
 .map((g, i) => {
 const left = (minutesSinceStart(g.startHour) / TOTAL_WORK_MINUTES) * 100;
 const width =
 ((Math.min(g.endHour, WORK_START + replayMinutes / 60) - g.startHour) /
 (WORK_END - WORK_START)) *
 100;
 return (
 <div
 key={`gap-${g.userId}-${i}`}
 className="absolute inset-y-0 bg-red-500/20 border-x border-red-500/30"style={{ left:`${left}%`, width:`${Math.max(width, 0.5)}%`}}
 />
 );
 })}

 {/* Playhead */}
 <div
 className="absolute top-0 bottom-0 w-px bg-primary shadow-[0_0_4px] shadow-primary/60 transition-[left] duration-100"style={{ left:`${progressPercent}%`}}
 />
 </div>

 {/* Hour markers */}
 <div className="flex justify-between mt-1">
 {Array.from({ length: 12 }, (_, i) => i + 7).map((h) => (
 <span
 key={h}
 className="font-mono text-[7px] tabular-nums text-muted-foreground">
 {h}
 </span>
 ))}
 </div>
 </div>

 {/* Playback controls */}
 <div className="border-t border-border px-4 py-2 flex items-center gap-2">
 <Button
 variant="ghost"size="sm"onClick={handlePlayPause}
 className="gap-1.5 font-mono text-[10px]">
 {completed ? (
 <>
 <Play className="w-3 h-3"/> Repetir
 </>
 ) : playing ? (
 <>
 <Pause className="w-3 h-3"/> Pausar
 </>
 ) : (
 <>
 <Play className="w-3 h-3"/> Reproducir
 </>
 )}
 </Button>
 {!completed && (
 <Button
 variant="ghost"size="sm"onClick={handleSkip}
 className="gap-1.5 font-mono text-[10px]">
 <SkipForward className="w-3 h-3"/> Saltar al final
 </Button>
 )}
 <div className="ml-auto flex items-center gap-3">
 <span className="font-mono text-[9px] text-muted-foreground">
 {visibleEntries.length}/{entries.length} entradas
 </span>
 <span className="font-mono text-[9px] text-muted-foreground">
 {loggedUsers.size}/{memberIds.length} personas
 </span>
 </div>
 </div>
 </div>

 {/* Active Gap Alerts */}
 {activeGaps.length > 0 && playing && (
 <div className="mb-8 space-y-1">
 {activeGaps.slice(0, 3).map((g, i) => (
 <div
 key={`alert-${g.userId}-${i}`}
 className="flex items-center gap-2 px-3 py-1.5 bg-red-500/5 border border-red-500/20 animate-pulse">
 <AlertTriangle className="w-3 h-3 text-red-500 shrink-0"/>
 <span className="font-mono text-[10px] text-red-500 uppercase tracking-wider">
 Silencio — {profiles[g.userId]?.full_name ||"Desconocido"} — {Math.round(g.durationMinutes)} min sin actividad
 </span>
 </div>
 ))}
 </div>
 )}

 {/* Live Feed — entries appearing */}
 <div className="mb-8">
 <div className="flex items-center gap-2 mb-3">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Registro en Vivo
 </span>
 {playing && (
 <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"/>
 )}
 </div>

 {visibleEntries.length === 0 && (
 <div className="border border-border border-dashed px-4 py-6 text-center">
 <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
 Esperando primera actividad...
 </span>
 </div>
 )}

 <div className="space-y-1">
 {[...visibleEntries].reverse().map((entry) => {
 const cat = entry.category as WorkCategory;
 const catInfo = CATEGORIES[cat];
 const isRecent = recentEntries.has(entry.id);
 const hasProof =
 (entry.proof_urls && entry.proof_urls.length > 0) ||
 (entry.links && entry.links.length > 0);

 return (
 <div
 key={entry.id}
 className={cn(
"flex items-start gap-3 px-3 py-2 border border-border transition-all duration-500",
 isRecent
 ?"bg-primary/5 border-primary/20 translate-x-0 opacity-100":"bg-card opacity-80")}
 style={{
 animation: isRecent ?"slideIn 0.4s ease-out": undefined,
 }}
 >
 {/* Timestamp */}
 <div className="shrink-0 pt-0.5">
 <span className="font-mono text-[10px] tabular-nums tracking-tight text-muted-foreground">
 {entry.hour > 12 ? entry.hour - 12 : entry.hour}:00{" "}
 {entry.hour >= 12 ?"PM":"AM"}
 </span>
 </div>

 {/* Category dot */}
 <div className="shrink-0 pt-1.5">
 <div className={cn("w-2 h-2", CATEGORY_COLORS[cat] ||"bg-gray-500")} />
 </div>

 {/* Content */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-1.5">
 <span className="font-mono text-[11px] font-bold uppercase tracking-wide truncate">
 {entry.profile?.full_name ||"Desconocido"}
 </span>
 <span className="text-xs">{catInfo?.emoji}</span>
 {hasProof && (
 <Shield className="w-2.5 h-2.5 text-green-500 shrink-0"/>
 )}
 </div>
 <p className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
 {entry.title}
 </p>
 </div>

 {/* Category label */}
 <div className="shrink-0">
 <span
 className={cn(
"font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5",
 catInfo?.bgColor,
 catInfo?.color
 )}
 >
 {catInfo?.label}
 </span>
 </div>
 </div>
 );
 })}
 </div>
 </div>

 {/* Roster Status */}
 <div className="mb-8">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-3">
 Estado del Equipo — {replayTimeToDisplay(replayMinutes)}
 </span>
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
 {memberIds.map((uid) => {
 const profile = profiles[uid];
 const hasLogged = loggedUsers.has(uid);
 const userEntryCount = visibleEntries.filter((e) => e.user_id === uid).length;
 return (
 <div
 key={uid}
 className={cn(
"flex items-center gap-2 px-2 py-1.5 border transition-colors duration-300",
 hasLogged
 ?"border-border bg-card":"border-red-500/20 bg-red-500/5")}
 >
 <div
 className={cn(
"w-5 h-5 flex items-center justify-center shrink-0",
 hasLogged ?"bg-primary/10":"bg-red-500/10")}
 >
 {hasLogged ? (
 <User className="w-3 h-3 text-primary"/>
 ) : (
 <Ghost className="w-3 h-3 text-red-500/60"/>
 )}
 </div>
 <div className="min-w-0">
 <span className="font-mono text-[9px] font-bold uppercase tracking-wide truncate block">
 {profile?.full_name?.split("")[0] ||"?"}
 </span>
 {hasLogged ? (
 <span className="font-mono text-[7px] tabular-nums text-muted-foreground">
 {userEntryCount} entrada{userEntryCount !== 1 ?"s":""}
 </span>
 ) : (
 <span className="font-mono text-[7px] text-red-500/60">
 Sin actividad
 </span>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>

 {/* Summary — shows after replay completes */}
 {completed && summary && (
 <div className="border border-border bg-card mb-8">
 <div className="border-b border-border px-4 py-2">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Resumen del Día
 </span>
 </div>

 <div className="p-4 space-y-4">
 {/* Stats grid */}
 <div className="grid grid-cols-2 gap-3">
 {/* First to log */}
 <div className="bg-accent/30 border border-border p-3">
 <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground block mb-1">
 Primero en registrar
 </span>
 <span className="font-mono text-sm font-bold tracking-tight block">
 {summary.first.profile?.full_name?.split("")[0] ||"?"}
 </span>
 <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
 {summary.first.hour > 12 ? summary.first.hour - 12 : summary.first.hour}:00{" "}
 {summary.first.hour >= 12 ?"PM":"AM"}
 </span>
 </div>

 {/* Last to log */}
 <div className="bg-accent/30 border border-border p-3">
 <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground block mb-1">
 Último en registrar
 </span>
 <span className="font-mono text-sm font-bold tracking-tight block">
 {summary.last.profile?.full_name?.split("")[0] ||"?"}
 </span>
 <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
 {summary.last.hour > 12 ? summary.last.hour - 12 : summary.last.hour}:00{" "}
 {summary.last.hour >= 12 ?"PM":"AM"}
 </span>
 </div>

 {/* Biggest gap */}
 <div className="bg-accent/30 border border-border p-3">
 <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground block mb-1">
 Mayor brecha
 </span>
 <span className="font-mono text-sm font-bold tracking-tight block">
 {profiles[summary.biggestGap.userId]?.full_name?.split("")[0] ||"?"}
 </span>
 <span className="font-mono text-[10px] tabular-nums text-red-500">
 {Math.round(summary.biggestGap.minutes / 60 * 10) / 10}h sin actividad
 </span>
 </div>

 {/* Most productive hour */}
 {summary.bestHour && (
 <div className="bg-accent/30 border border-border p-3">
 <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground block mb-1">
 Hora más productiva
 </span>
 <span className="font-mono text-sm font-bold tracking-tight tabular-nums block">
 {Number(summary.bestHour[0]) > 12
 ? Number(summary.bestHour[0]) - 12
 : Number(summary.bestHour[0])}
 :00 {Number(summary.bestHour[0]) >= 12 ?"PM":"AM"}
 </span>
 <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
 {summary.bestHour[1]} entradas
 </span>
 </div>
 )}
 </div>

 {/* Ghosts */}
 {summary.ghosts.length > 0 && (
 <div className="border border-red-500/20 bg-red-500/5 p-3">
 <div className="flex items-center gap-1.5 mb-2">
 <Ghost className="w-3.5 h-3.5 text-red-500"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500">
 Fantasmas del Día
 </span>
 </div>
 <p className="font-mono text-[10px] text-red-500/80">
 Registraron 0 horas:{" "}
 {summary.ghosts
 .map((id) => profiles[id]?.full_name ||"Desconocido")
 .join(",")}
 </p>
 </div>
 )}

 {/* Total entries stat */}
 <div className="flex items-center justify-between border-t border-border pt-3">
 <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
 Total registros
 </span>
 <span className="font-mono text-sm font-bold tabular-nums tracking-tight">
 {entries.length}
 </span>
 </div>
 <div className="flex items-center justify-between">
 <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
 Personas activas
 </span>
 <span className="font-mono text-sm font-bold tabular-nums tracking-tight">
 {new Set(entries.map((e) => e.user_id)).size}/{memberIds.length}
 </span>
 </div>
 <div className="flex items-center justify-between">
 <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
 Con evidencia
 </span>
 <span className="font-mono text-sm font-bold tabular-nums tracking-tight">
 {entries.filter(
 (e) =>
 (e.proof_urls && e.proof_urls.length > 0) ||
 (e.links && e.links.length > 0)
 ).length}
 /{entries.length}
 </span>
 </div>
 </div>
 </div>
 )}
 </>
 )}

 {/* CSS for slide-in animation */}
 <style jsx>{`@keyframes slideIn {
 from {
 opacity: 0;
 transform: translateX(-8px);
 }
 to {
 opacity: 1;
 transform: translateX(0);
 }
 }
`}</style>
 </div>
 );
}
