"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, getTodayMTY, getInitials } from "@/lib/utils";
import { MOOD_LABELS } from "@/lib/constants";
import {
 Activity,
 Heart,
 Droplets,
 Thermometer,
 Wind,
 Stethoscope,
 AlertTriangle,
 Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { TimeEntry, Profile, MoodLevel } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WindowData {
 hour: number;
 half: 0 | 1; // 0 = :00-:29, 1 = :30-:59
 count: number;
}

interface MemberPulse {
 userId: string;
 name: string;
 windows: WindowData[];
 lastEntry: string | null;
}

type Diagnosis =
 |"saludable"|"bradicardia"|"taquicardia"|"paro_cardiaco";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentHourMTY(): number {
 const now = new Date();
 const mtyTime = new Intl.DateTimeFormat("en-US", {
 timeZone:"America/Monterrey",
 hour:"numeric",
 hour12: false,
 }).format(now);
 return parseInt(mtyTime, 10);
}

function buildWindows(
 entries: TimeEntry[],
 startHour: number,
 endHour: number
): WindowData[] {
 const windows: WindowData[] = [];
 for (let h = startHour; h <= endHour; h++) {
 for (const half of [0, 1] as const) {
 const count = entries.filter((e) => {
 const loggedAt = new Date(e.logged_at);
 const entryHour = parseInt(
 new Intl.DateTimeFormat("en-US", {
 timeZone:"America/Monterrey",
 hour:"numeric",
 hour12: false,
 }).format(loggedAt),
 10
 );
 const entryMinute = parseInt(
 new Intl.DateTimeFormat("en-US", {
 timeZone:"America/Monterrey",
 minute:"numeric",
 }).format(loggedAt),
 10
 );
 if (entryHour !== h) return false;
 return half === 0 ? entryMinute < 30 : entryMinute >= 30;
 }).length;
 windows.push({ hour: h, half, count });
 }
 }
 return windows;
}

function getDiagnosis(windows: WindowData[], currentHour: number): Diagnosis {
 // Check for 2+ hour flatline (4 consecutive zero windows)
 let maxConsecutiveZero = 0;
 let currentZero = 0;
 for (const w of windows) {
 if (w.hour > currentHour) break;
 if (w.count === 0) {
 currentZero++;
 maxConsecutiveZero = Math.max(maxConsecutiveZero, currentZero);
 } else {
 currentZero = 0;
 }
 }

 if (maxConsecutiveZero >= 4) return"paro_cardiaco";

 // Check for burst of late entries (taquicardia)
 const recentWindows = windows.filter(
 (w) => w.hour >= currentHour - 1 && w.hour <= currentHour
 );
 const recentTotal = recentWindows.reduce((sum, w) => sum + w.count, 0);
 const totalEntries = windows.reduce((sum, w) => sum + w.count, 0);
 if (totalEntries > 0 && recentTotal > totalEntries * 0.5 && recentTotal > 4) {
 return"taquicardia";
 }

 // Check for very slow logging (bradicardia)
 const activeWindows = windows.filter(
 (w) => w.hour >= 7 && w.hour <= currentHour
 );
 const totalActive = activeWindows.length;
 const windowsWithActivity = activeWindows.filter((w) => w.count > 0).length;
 if (totalActive > 4 && windowsWithActivity / totalActive < 0.25) {
 return"bradicardia";
 }

 return"saludable";
}

const DIAGNOSIS_CONFIG: Record<
 Diagnosis,
 { label: string; description: string; color: string; bgColor: string }
> = {
 saludable: {
 label:"Saludable",
 description:"Actividad constante y distribuida a lo largo del dia.",
 color:"text-green-400",
 bgColor:"bg-green-500/10 border-green-500/20",
 },
 bradicardia: {
 label:"Bradicardia",
 description:"Registro de actividad muy lento. El equipo no esta logueando.",
 color:"text-yellow-400",
 bgColor:"bg-yellow-500/10 border-yellow-500/20",
 },
 taquicardia: {
 label:"Taquicardia",
 description:
"Rafaga de entradas tardias. Posible backfill masivo al final del dia.",
 color:"text-orange-400",
 bgColor:"bg-orange-500/10 border-orange-500/20",
 },
 paro_cardiaco: {
 label:"Paro cardiaco",
 description:"Linea plana de 2+ horas. Nadie esta registrando trabajo.",
 color:"text-red-400",
 bgColor:"bg-red-500/10 border-red-500/20",
 },
};

// ---------------------------------------------------------------------------
// EKG SVG Path Builder
// ---------------------------------------------------------------------------

function buildEKGPath(
 windows: WindowData[],
 width: number,
 height: number,
 maxCount: number,
 currentHour: number
): { path: string; segments: { path: string; color: string }[] } {
 if (windows.length === 0) return { path:"", segments: [] };

 const padding = 20;
 const usableWidth = width - padding * 2;
 const usableHeight = height - padding * 2;
 const stepX = usableWidth / (windows.length - 1 || 1);
 const baseline = padding + usableHeight * 0.7;
 const peakMax = usableHeight * 0.65;

 // Build points
 const points: { x: number; y: number; count: number; hour: number }[] = [];
 for (let i = 0; i < windows.length; i++) {
 const w = windows[i];
 const x = padding + i * stepX;
 if (w.hour > currentHour + (w.half === 1 ? 0.5 : 0)) {
 break;
 }

 if (w.count === 0) {
 points.push({ x, y: baseline, count: 0, hour: w.hour });
 } else {
 const intensity = Math.min(w.count / Math.max(maxCount, 1), 1);
 // EKG spike: sharp up then sharp down
 const peakY = baseline - intensity * peakMax;

 // Pre-spike dip
 const dipY = baseline + 8;
 points.push({ x: x - stepX * 0.15, y: dipY, count: w.count, hour: w.hour });
 // Sharp rise
 points.push({ x: x - stepX * 0.05, y: peakY, count: w.count, hour: w.hour });
 // Sharp fall past baseline
 points.push({ x: x + stepX * 0.05, y: baseline + (baseline - peakY) * 0.15, count: w.count, hour: w.hour });
 // Return to baseline
 points.push({ x: x + stepX * 0.15, y: baseline, count: w.count, hour: w.hour });
 }
 }

 if (points.length === 0) return { path:"", segments: [] };

 // Build segments with colors
 const segments: { path: string; color: string }[] = [];
 let currentSegment: typeof points = [points[0]];
 let currentColor = getSegmentColor(points[0]);

 for (let i = 1; i < points.length; i++) {
 const color = getSegmentColor(points[i]);
 if (color !== currentColor) {
 // Close segment
 segments.push({
 path: buildPathFromPoints(currentSegment),
 color: currentColor,
 });
 // Start new segment with last point of previous
 currentSegment = [currentSegment[currentSegment.length - 1], points[i]];
 currentColor = color;
 } else {
 currentSegment.push(points[i]);
 }
 }
 segments.push({
 path: buildPathFromPoints(currentSegment),
 color: currentColor,
 });

 const fullPath = buildPathFromPoints(points);
 return { path: fullPath, segments };
}

function getSegmentColor(point: { count: number }): string {
 if (point.count === 0) return"#ef4444"; // red for flatline
 if (point.count <= 1) return"#eab308"; // yellow for slow
 return"#22c55e"; // green for normal
}

function buildPathFromPoints(
 points: { x: number; y: number }[]
): string {
 if (points.length === 0) return"";
 let d =`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
 for (let i = 1; i < points.length; i++) {
 d +=`L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
 }
 return d;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PulseEKGPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [entries, setEntries] = useState<(TimeEntry & { profiles: Profile })[]>(
 []
 );
 const [members, setMembers] = useState<
 { user_id: string; profiles: Profile }[]
 >([]);
 const [loading, setLoading] = useState(true);
 const [currentTime, setCurrentTime] = useState(Date.now());
 const supabase = createClient();
 const today = getTodayMTY();

 // Tick every 30 seconds for live updates
 useEffect(() => {
 const interval = setInterval(() => setCurrentTime(Date.now()), 30_000);
 return () => clearInterval(interval);
 }, []);

 const loadData = useCallback(async () => {
 if (!orgId) return;

 const [entriesRes, membersRes] = await Promise.all([
 supabase
 .from("time_entries")
 .select("*, profiles(id, full_name, email, avatar_url)")
 .eq("org_id", orgId)
 .eq("date", today)
 .order("logged_at", { ascending: true }),
 supabase
 .from("org_members")
 .select("user_id, profiles(id, full_name, email, avatar_url)")
 .eq("org_id", orgId),
 ]);

 if (entriesRes.data) setEntries(entriesRes.data as any);
 if (membersRes.data) setMembers(membersRes.data as any);
 setLoading(false);
 }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId) {
 setLoading(false);
 return;
 }
 loadData();
 }, [orgLoading, orgId, loadData]);

 // Real-time subscription
 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("pulse-ekg-entries")
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"time_entries",
 filter:`org_id=eq.${orgId}`,
 },
 () => loadData()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

 // Derived data
 const currentHour = getCurrentHourMTY();
 const startHour = 7;
 const endHour = Math.max(currentHour, 18);

 const teamWindows = useMemo(
 () => buildWindows(entries, startHour, endHour),
 [entries, startHour, endHour] // eslint-disable-line react-hooks/exhaustive-deps
 );

 const maxCount = useMemo(
 () => Math.max(...teamWindows.map((w) => w.count), 1),
 [teamWindows]
 );

 const bpm = useMemo(() => {
 return entries.filter((e) => {
 const loggedAt = new Date(e.logged_at);
 const diff = (Date.now() - loggedAt.getTime()) / 1000 / 60;
 return diff <= 60;
 }).length;
 }, [entries, currentTime]); // eslint-disable-line react-hooks/exhaustive-deps

 // Vital signs
 const proofRatio = useMemo(() => {
 if (entries.length === 0) return 0;
 const withProof = entries.filter(
 (e) => e.proof_urls && e.proof_urls.length > 0
 ).length;
 return Math.round((withProof / entries.length) * 100);
 }, [entries]);

 const oxygenPercent = useMemo(() => {
 if (members.length === 0) return 0;
 const loggedUsers = new Set(entries.map((e) => e.user_id));
 return Math.round((loggedUsers.size / members.length) * 100);
 }, [entries, members]);

 const avgMood = useMemo(() => {
 const moods = entries
 .filter((e) => e.mood !== null)
 .map((e) => e.mood as number);
 if (moods.length === 0) return null;
 return moods.reduce((a, b) => a + b, 0) / moods.length;
 }, [entries]);

 const diagnosis = useMemo(
 () => getDiagnosis(teamWindows, currentHour),
 [teamWindows, currentHour]
 );

 const diagnosisConfig = DIAGNOSIS_CONFIG[diagnosis];

 // Member pulses
 const memberPulses = useMemo((): MemberPulse[] => {
 const byUser = new Map<string, TimeEntry[]>();
 for (const e of entries) {
 const list = byUser.get(e.user_id) ?? [];
 list.push(e);
 byUser.set(e.user_id, list);
 }

 return members.map((m) => {
 const userEntries = byUser.get(m.user_id) ?? [];
 const windows = buildWindows(userEntries, startHour, endHour);
 const lastEntry =
 userEntries.length > 0
 ? userEntries[userEntries.length - 1].logged_at
 : null;
 return {
 userId: m.user_id,
 name:
 (m.profiles as any)?.full_name ??
 (m.profiles as any)?.email ??
"?",
 windows,
 lastEntry,
 };
 });
 }, [entries, members, startHour, endHour]);

 // SVG dimensions
 const svgWidth = 800;
 const svgHeight = 200;
 const memberSvgHeight = 80;

 const teamEKG = useMemo(
 () => buildEKGPath(teamWindows, svgWidth, svgHeight, maxCount, currentHour),
 [teamWindows, svgWidth, svgHeight, maxCount, currentHour]
 );

 if (orgLoading || loading) {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">
 Cargando...
 </p>
 </div>
 );
 }

 if (!orgId) {
 return (
 <div className="flex items-center justify-center py-24">
 <p className="text-muted-foreground">
 Primero crea o unete a un equipo.
 </p>
 </div>
 );
 }

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
 <Activity className="w-6 h-6 text-primary"/>
 Pulso del Equipo
 </h1>
 <p className="text-muted-foreground text-sm">
 Electrocardiograma de actividad en tiempo real
 </p>
 </div>

 {/* BPM Display */}
 <div className="flex items-center justify-center mb-8">
 <div className="relative flex items-center gap-4 bg-black/90 dark:bg-black/70 px-8 py-5 border border-green-500/20">
 <Heart
 className={cn(
"w-8 h-8 text-green-400",
 bpm > 0 &&"animate-pulse")}
 />
 <div className="text-center">
 <p
 className={cn(
"text-5xl font-bold tabular-nums tracking-tight font-data",
 bpm > 0 ?"text-green-400":"text-red-400")}
 >
 {bpm}
 </p>
 <p className="text-[11px] text-green-400/60 uppercase tracking-widest">
 entradas / hora
 </p>
 </div>
 {bpm > 0 && (
 <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 animate-pulse-glow"/>
 )}
 </div>
 </div>

 {/* Team EKG Waveform */}
 <Card className="mb-8 overflow-hidden transition-all duration-300 hover:border-primary/30">
 <CardHeader className="border-b pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Activity className="w-4 h-4 text-primary"/>
 Electrocardiograma del equipo
 <Badge variant="outline"className="ml-auto text-[10px]">
 Hoy
 </Badge>
 </CardTitle>
 </CardHeader>
 <CardContent className="p-0">
 <div className="bg-black/95 dark:bg-black/60 relative">
 {/* Grid lines */}
 <svg
 viewBox={`0 0 ${svgWidth} ${svgHeight}`}
 className="w-full h-auto"preserveAspectRatio="xMidYMid meet">
 {/* Background grid */}
 <defs>
 <pattern
 id="ekg-grid"width="40"height="40"patternUnits="userSpaceOnUse">
 <path
 d="M 40 0 L 0 0 0 40"fill="none"stroke="rgba(34,197,94,0.08)"strokeWidth="0.5"/>
 </pattern>
 <pattern
 id="ekg-grid-small"width="8"height="8"patternUnits="userSpaceOnUse">
 <path
 d="M 8 0 L 0 0 0 8"fill="none"stroke="rgba(34,197,94,0.04)"strokeWidth="0.3"/>
 </pattern>
 {/* Glow filter */}
 <filter id="glow">
 <feGaussianBlur stdDeviation="2"result="coloredBlur"/>
 <feMerge>
 <feMergeNode in="coloredBlur"/>
 <feMergeNode in="SourceGraphic"/>
 </feMerge>
 </filter>
 </defs>

 <rect
 width={svgWidth}
 height={svgHeight}
 fill="url(#ekg-grid-small)"/>
 <rect
 width={svgWidth}
 height={svgHeight}
 fill="url(#ekg-grid)"/>

 {/* Hour labels */}
 {Array.from(
 { length: endHour - startHour + 1 },
 (_, i) => startHour + i
 ).map((h) => {
 const windowIndex = (h - startHour) * 2;
 const x =
 20 +
 (windowIndex / (teamWindows.length - 1 || 1)) *
 (svgWidth - 40);
 return (
 <g key={h}>
 <line
 x1={x}
 y1={0}
 x2={x}
 y2={svgHeight}
 stroke="rgba(34,197,94,0.1)"strokeWidth="0.5"strokeDasharray="4,4"/>
 <text
 x={x}
 y={svgHeight - 4}
 textAnchor="middle"fill="rgba(34,197,94,0.4)"fontSize="9"fontFamily="monospace">
 {h > 12 ? h - 12 : h}
 {h >= 12 ?"p":"a"}
 </text>
 </g>
 );
 })}

 {/* EKG line segments with color coding */}
 {teamEKG.segments.map((seg, i) => (
 <path
 key={i}
 d={seg.path}
 fill="none"stroke={seg.color}
 strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"filter="url(#glow)"/>
 ))}

 {/* Flatline warning zones */}
 {(() => {
 const zones: { startX: number; endX: number }[] = [];
 let zoneStart: number | null = null;
 let consecutiveZero = 0;

 for (let i = 0; i < teamWindows.length; i++) {
 const w = teamWindows[i];
 if (w.hour > currentHour) break;
 const x =
 20 +
 (i / (teamWindows.length - 1 || 1)) * (svgWidth - 40);

 if (w.count === 0) {
 if (zoneStart === null) zoneStart = x;
 consecutiveZero++;
 } else {
 if (consecutiveZero >= 4 && zoneStart !== null) {
 const prevX =
 20 +
 ((i - 1) / (teamWindows.length - 1 || 1)) *
 (svgWidth - 40);
 zones.push({ startX: zoneStart, endX: prevX });
 }
 zoneStart = null;
 consecutiveZero = 0;
 }
 }
 // Close trailing zone
 if (consecutiveZero >= 4 && zoneStart !== null) {
 const lastIdx = Math.min(
 teamWindows.findIndex((w) => w.hour > currentHour) - 1,
 teamWindows.length - 1
 );
 const endX =
 20 +
 (Math.max(lastIdx, 0) / (teamWindows.length - 1 || 1)) *
 (svgWidth - 40);
 zones.push({ startX: zoneStart, endX });
 }

 return zones.map((zone, i) => (
 <rect
 key={i}
 x={zone.startX}
 y={0}
 width={zone.endX - zone.startX}
 height={svgHeight}
 fill="rgba(239,68,68,0.06)"/>
 ));
 })()}
 </svg>

 {/* Legend */}
 <div className="flex items-center justify-center gap-6 px-4 py-2 border-t border-green-500/10">
 <span className="flex items-center gap-1.5 text-[10px] text-green-400/70">
 <span className="w-3 h-0.5 bg-green-500 rounded-full"/>
 Normal
 </span>
 <span className="flex items-center gap-1.5 text-[10px] text-yellow-400/70">
 <span className="w-3 h-0.5 bg-yellow-500 rounded-full"/>
 Lento
 </span>
 <span className="flex items-center gap-1.5 text-[10px] text-red-400/70">
 <span className="w-3 h-0.5 bg-red-500 rounded-full"/>
 Linea plana
 </span>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Vital Signs */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
 {/* Ritmo Cardiaco */}
 <div className="bg-black/90 dark:bg-black/60 p-4 border border-green-500/20 transition-all duration-300">
 <div className="flex items-center gap-2 mb-3">
 <Heart className="w-4 h-4 text-green-400"/>
 <p className="text-[10px] text-green-400/60 uppercase tracking-wider font-medium">
 Ritmo Cardiaco
 </p>
 </div>
 <p className="text-2xl font-bold tabular-nums tracking-tight text-green-400 font-data">
 {bpm}
 <span className="text-sm font-normal text-green-400/50 ml-1">
 e/h
 </span>
 </p>
 <p className="text-[10px] text-green-400/40 mt-1">
 {bpm === 0
 ?"Sin actividad": bpm < 3
 ?"Ritmo bajo": bpm < 8
 ?"Ritmo normal":"Ritmo alto"}
 </p>
 </div>

 {/* Presion */}
 <div className="bg-black/90 dark:bg-black/60 p-4 border border-green-500/20 transition-all duration-300">
 <div className="flex items-center gap-2 mb-3">
 <Droplets className="w-4 h-4 text-green-400"/>
 <p className="text-[10px] text-green-400/60 uppercase tracking-wider font-medium">
 Presion
 </p>
 </div>
 <p
 className={cn(
"text-2xl font-bold tabular-nums tracking-tight font-data",
 proofRatio >= 70
 ?"text-green-400": proofRatio >= 40
 ?"text-yellow-400":"text-red-400")}
 >
 {proofRatio}
 <span className="text-sm font-normal opacity-50 ml-0.5">%</span>
 </p>
 <p className="text-[10px] text-green-400/40 mt-1">
 Entradas con evidencia
 </p>
 </div>

 {/* Oxigeno */}
 <div className="bg-black/90 dark:bg-black/60 p-4 border border-green-500/20 transition-all duration-300">
 <div className="flex items-center gap-2 mb-3">
 <Wind className="w-4 h-4 text-green-400"/>
 <p className="text-[10px] text-green-400/60 uppercase tracking-wider font-medium">
 Oxigeno
 </p>
 </div>
 <p
 className={cn(
"text-2xl font-bold tabular-nums tracking-tight font-data",
 oxygenPercent >= 80
 ?"text-green-400": oxygenPercent >= 50
 ?"text-yellow-400":"text-red-400")}
 >
 {oxygenPercent}
 <span className="text-sm font-normal opacity-50 ml-0.5">%</span>
 </p>
 <p className="text-[10px] text-green-400/40 mt-1">
 Miembros activos hoy
 </p>
 </div>

 {/* Temperatura */}
 <div className="bg-black/90 dark:bg-black/60 p-4 border border-green-500/20 transition-all duration-300">
 <div className="flex items-center gap-2 mb-3">
 <Thermometer className="w-4 h-4 text-green-400"/>
 <p className="text-[10px] text-green-400/60 uppercase tracking-wider font-medium">
 Temperatura
 </p>
 </div>
 <p
 className={cn(
"text-2xl font-bold tabular-nums tracking-tight font-data",
 avgMood !== null && avgMood >= 4
 ?"text-green-400": avgMood !== null && avgMood >= 3
 ?"text-yellow-400":"text-red-400")}
 >
 {avgMood !== null ? avgMood.toFixed(1) :"--"}
 <span className="text-sm font-normal opacity-50 ml-0.5">/5</span>
 </p>
 <p className="text-[10px] text-green-400/40 mt-1">
 {avgMood !== null
 ? MOOD_LABELS[Math.round(avgMood) as MoodLevel] ??"Animo promedio":"Sin datos de animo"}
 </p>
 </div>
 </div>

 {/* Diagnostico */}
 <Card
 className={cn(
"mb-8 overflow-hidden transition-all duration-300 hover:border-primary/30",
"border",
 diagnosisConfig.bgColor
 )}
 >
 <CardContent className="p-5">
 <div className="flex items-start gap-4">
 <div
 className={cn(
"w-12 h-12 flex items-center justify-center shrink-0",
 diagnosis ==="saludable"?"bg-green-500/20": diagnosis ==="bradicardia"?"bg-yellow-500/20": diagnosis ==="taquicardia"?"bg-orange-500/20":"bg-red-500/20")}
 >
 {diagnosis ==="paro_cardiaco"? (
 <AlertTriangle className="w-6 h-6 text-red-400"/>
 ) : (
 <Stethoscope
 className={cn("w-6 h-6", diagnosisConfig.color)}
 />
 )}
 </div>
 <div>
 <div className="flex items-center gap-2 mb-1">
 <h3 className="font-semibold text-base">Diagnostico</h3>
 <Badge
 variant="outline"className={cn("text-[10px]", diagnosisConfig.color)}
 >
 {diagnosisConfig.label}
 </Badge>
 </div>
 <p className="text-sm text-muted-foreground">
 {diagnosisConfig.description}
 </p>
 <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
 <span className="tabular-nums">
 {entries.length} entradas hoy
 </span>
 <span className="tabular-nums">
 {new Set(entries.map((e) => e.user_id)).size}/{members.length}{""}
 miembros activos
 </span>
 </div>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Individual Heartbeats */}
 <div className="mb-8">
 <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
 <Users className="w-5 h-5 text-primary"/>
 Latidos individuales
 </h2>
 <div className="space-y-3">
 {memberPulses.map((member) => {
 const memberMax = Math.max(
 ...member.windows.map((w) => w.count),
 1
 );
 const memberEKG = buildEKGPath(
 member.windows,
 svgWidth,
 memberSvgHeight,
 Math.max(memberMax, 2),
 currentHour
 );
 const memberEntryCount = entries.filter(
 (e) => e.user_id === member.userId
 ).length;
 const isFlat = memberEntryCount === 0;

 return (
 <Card
 key={member.userId}
 className={cn(
"overflow-hidden transition-all duration-300 hover:border-primary/30",
 isFlat &&"opacity-60")}
 >
 <CardContent className="p-0">
 <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
 <Avatar className="w-7 h-7 ring-2 ring-background">
 <AvatarFallback className="text-[10px]">
 {getInitials(member.name)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium truncate">
 {member.name.split("")[0]}
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Badge
 variant={isFlat ?"destructive":"secondary"}
 className="text-[10px]">
 {memberEntryCount} entrada
 {memberEntryCount !== 1 ?"s":""}
 </Badge>
 {isFlat && (
 <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
 )}
 </div>
 </div>
 <div className="bg-black/90 dark:bg-black/60">
 <svg
 viewBox={`0 0 ${svgWidth} ${memberSvgHeight}`}
 className="w-full h-auto"preserveAspectRatio="xMidYMid meet">
 {/* Subtle grid */}
 <defs>
 <pattern
 id={`member-grid-${member.userId}`}
 width="40"height="40"patternUnits="userSpaceOnUse">
 <path
 d="M 40 0 L 0 0 0 40"fill="none"stroke="rgba(34,197,94,0.05)"strokeWidth="0.3"/>
 </pattern>
 </defs>
 <rect
 width={svgWidth}
 height={memberSvgHeight}
 fill={`url(#member-grid-${member.userId})`}
 />

 {isFlat ? (
 /* Flatline */
 <line
 x1="20"y1={memberSvgHeight * 0.6}
 x2={svgWidth - 20}
 y2={memberSvgHeight * 0.6}
 stroke="#ef4444"strokeWidth="1.5"strokeDasharray="8,4"opacity="0.6"/>
 ) : (
 memberEKG.segments.map((seg, i) => (
 <path
 key={i}
 d={seg.path}
 fill="none"stroke={seg.color}
 strokeWidth="1.5"strokeLinecap="round"strokeLinejoin="round"/>
 ))
 )}
 </svg>
 </div>
 </CardContent>
 </Card>
 );
 })}

 {memberPulses.length === 0 && (
 <div className="flex flex-col items-center justify-center py-12">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center mb-4">
 <Activity className="w-8 h-8 text-primary"/>
 </div>
 <p className="text-muted-foreground text-sm">
 No hay miembros en el equipo.
 </p>
 </div>
 )}
 </div>
 </div>
 </div>
 );
}
