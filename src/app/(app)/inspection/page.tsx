"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY, formatHour } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
 ScanSearch,
 Clock,
 AlertTriangle,
 ShieldCheck,
 ShieldAlert,
 Users,
 Calendar,
 Eye,
 Trophy,
 Skull,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Deterministic inspection hour */
/* ------------------------------------------------------------------ */

function getInspectionHour(dateStr: string): number {
 let hash = 0;
 for (let i = 0; i < dateStr.length; i++) {
 hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
 hash |= 0;
 }
 return 9 + Math.abs(hash % 8); // 9am to 4pm
}

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

interface MemberSnapshot {
 userId: string;
 profile: Profile | null;
 entriesAtSnapshot: number;
 rank: number;
}

interface InspectionResult {
 date: string;
 inspectionHour: number;
 members: MemberSnapshot[];
 caughtUserId: string | null;
 caughtName: string;
 caughtEntries: number;
 bestUserId: string | null;
 bestName: string;
 bestEntries: number;
}

interface HistoryRecord {
 date: string;
 inspectionHour: number;
 caughtName: string;
 caughtEntries: number;
}

/* ------------------------------------------------------------------ */
/* Countdown timer component */
/* ------------------------------------------------------------------ */

function InspectionCountdown() {
 const [display, setDisplay] = useState("--:--:--");

 useEffect(() => {
 function tick() {
 const now = new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 // Time left until midnight (we don't reveal the hour)
 const midnight = new Date(now);
 midnight.setHours(23, 59, 59, 999);
 const diff = Math.max(0, midnight.getTime() - now.getTime());
 const totalSec = Math.floor(diff / 1000);
 const h = Math.floor(totalSec / 3600);
 const m = Math.floor((totalSec % 3600) / 60);
 const s = totalSec % 60;
 setDisplay(
`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
 }

 tick();
 const id = setInterval(tick, 1000);
 return () => clearInterval(id);
 }, []);

 return (
 <span className="font-mono tabular-nums tracking-tight">{display}</span>
 );
}

/* ------------------------------------------------------------------ */
/* Now clock display (Monterrey time) */
/* ------------------------------------------------------------------ */

function MtyClockDisplay() {
 const [time, setTime] = useState("--:--:--");

 useEffect(() => {
 function tick() {
 const now = new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 const h = String(now.getHours()).padStart(2,"0");
 const m = String(now.getMinutes()).padStart(2,"0");
 const s = String(now.getSeconds()).padStart(2,"0");
 setTime(`${h}:${m}:${s}`);
 }
 tick();
 const id = setInterval(tick, 1000);
 return () => clearInterval(id);
 }, []);

 return (
 <span className="font-mono tabular-nums tracking-tight">{time}</span>
 );
}

/* ------------------------------------------------------------------ */
/* Page */
/* ------------------------------------------------------------------ */

export default function InspectionPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [loading, setLoading] = useState(true);
 const [inspectionDone, setInspectionDone] = useState(false);
 const [todayResult, setTodayResult] = useState<InspectionResult | null>(null);
 const [history, setHistory] = useState<HistoryRecord[]>([]);
 const [mostCaughtName, setMostCaughtName] = useState<string | null>(null);
 const [mostCaughtCount, setMostCaughtCount] = useState(0);

 const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

 const today = getTodayMTY();
 const inspectionHour = getInspectionHour(today);

 /* ---------- Check if inspection time has passed ---------- */

 const checkInspectionTime = useCallback(() => {
 const now = new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 const currentHour = now.getHours();
 return currentHour >= inspectionHour;
 }, [inspectionHour]);

 /* ---------- Load snapshot for a given date ---------- */

 const loadSnapshotForDate = useCallback(
 async (
 date: string,
 profileMap: Map<string, Profile>,
 userIds: string[]
 ): Promise<InspectionResult | null> => {
 if (!orgId) return null;

 const hour = getInspectionHour(date);

 // Get entries logged BEFORE the inspection hour on that date
 const { data: entries } = await supabase
 .from("time_entries")
 .select("user_id, hour")
 .eq("org_id", orgId)
 .eq("date", date)
 .lt("hour", hour);

 // Count entries per user (only entries before inspection hour)
 const countMap = new Map<string, number>();
 for (const uid of userIds) {
 countMap.set(uid, 0);
 }
 for (const e of entries ?? []) {
 const uid = e.user_id as string;
 countMap.set(uid, (countMap.get(uid) ?? 0) + 1);
 }

 // Build sorted members
 const members: MemberSnapshot[] = userIds.map((uid) => ({
 userId: uid,
 profile: profileMap.get(uid) ?? null,
 entriesAtSnapshot: countMap.get(uid) ?? 0,
 rank: 0,
 }));

 // Sort: most entries first
 members.sort((a, b) => b.entriesAtSnapshot - a.entriesAtSnapshot);
 members.forEach((m, i) => (m.rank = i + 1));

 if (members.length === 0) return null;

 const worst = members[members.length - 1];
 const best = members[0];

 return {
 date,
 inspectionHour: hour,
 members,
 caughtUserId: worst.userId,
 caughtName: worst.profile?.full_name ??"Sin nombre",
 caughtEntries: worst.entriesAtSnapshot,
 bestUserId: best.userId,
 bestName: best.profile?.full_name ??"Sin nombre",
 bestEntries: best.entriesAtSnapshot,
 };
 },
 [orgId] // eslint-disable-line react-hooks/exhaustive-deps
 );

 /* ---------- Main data loader ---------- */

 const loadData = useCallback(async () => {
 if (!orgId) return;

 const done = checkInspectionTime();
 setInspectionDone(done);

 // 1. Get all org members with profiles
 const { data: orgMembers } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 if (!orgMembers) {
 setLoading(false);
 return;
 }

 const profileMap = new Map<string, Profile>();
 const userIds: string[] = [];
 for (const m of orgMembers) {
 userIds.push(m.user_id);
 if (m.profiles)
 profileMap.set(m.user_id, m.profiles as unknown as Profile);
 }

 // 2. Today's snapshot (only if inspection has passed)
 if (done) {
 const result = await loadSnapshotForDate(today, profileMap, userIds);
 setTodayResult(result);
 } else {
 setTodayResult(null);
 }

 // 3. History: last 14 days (excluding today)
 const historyRecords: HistoryRecord[] = [];
 const caughtFrequency = new Map<string, number>();

 for (let i = 1; i <= 14; i++) {
 const d = format(
 subDays(new Date(today +"T12:00:00"), i),
"yyyy-MM-dd");
 const result = await loadSnapshotForDate(d, profileMap, userIds);
 if (result && result.members.length > 0) {
 historyRecords.push({
 date: d,
 inspectionHour: result.inspectionHour,
 caughtName: result.caughtName,
 caughtEntries: result.caughtEntries,
 });
 const name = result.caughtName;
 caughtFrequency.set(name, (caughtFrequency.get(name) ?? 0) + 1);
 }
 }

 setHistory(historyRecords);

 // Find most caught person
 let maxName: string | null = null;
 let maxCount = 0;
 for (const [name, count] of caughtFrequency) {
 if (count > maxCount) {
 maxName = name;
 maxCount = count;
 }
 }
 setMostCaughtName(maxName);
 setMostCaughtCount(maxCount);

 setLoading(false);
 }, [orgId, today, checkInspectionTime, loadSnapshotForDate]); // eslint-disable-line react-hooks/exhaustive-deps

 /* ---------- Initial load + periodic check ---------- */

 useEffect(() => {
 if (orgLoading || !orgId) {
 if (!orgLoading) setLoading(false);
 return;
 }

 loadData();

 // Re-check every 30 seconds (may transition from pending -> done)
 intervalRef.current = setInterval(loadData, 30_000);
 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [orgLoading, orgId, loadData]);

 /* ---------- Real-time subscription ---------- */

 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("inspection-entries")
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

 /* ---------- Loading ---------- */

 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 CARGANDO...
 </p>
 </div>
 );
 }

 /* ---------- Render ---------- */

 const displayDate = format(
 new Date(today +"T12:00:00"),
"EEEE, d MMMM yyyy",
 { locale: es }
 );

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-2.5 mb-1">
 <ScanSearch className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 La Inspección
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground mb-8">
 Snapshot aleatorio diario. No sabes cuándo. No puedes prepararte.
 </p>

 {/* Status Banner */}
 {!inspectionDone ? (
 /* ---- PENDING ---- */
 <div className="border-2 border-amber-500/50 bg-amber-500/5 p-6 sm:p-8 mb-8">
 <div className="flex items-center gap-2 mb-4">
 <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse"/>
 <p className="font-mono text-sm font-bold tracking-[0.1em] uppercase text-amber-500">
 Inspección Pendiente
 </p>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Hora de inspección
 </p>
 <p className="text-lg font-mono font-bold tracking-tight mt-1 text-amber-500">
 ???
 </p>
 <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
 Hora desconocida
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Hora actual (MTY)
 </p>
 <p className="text-lg font-mono font-bold tracking-tight mt-1">
 <MtyClockDisplay />
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Día termina en
 </p>
 <p className="text-lg font-mono font-bold tracking-tight mt-1 text-amber-500">
 <InspectionCountdown />
 </p>
 </div>
 </div>

 <div className="mt-4 flex items-center gap-2">
 <Eye className="w-3.5 h-3.5 text-muted-foreground"/>
 <p className="font-mono text-[9px] tracking-[0.15em] uppercase text-muted-foreground">
 La inspección puede ocurrir en cualquier momento entre 9:00 AM y
 4:00 PM
 </p>
 </div>
 </div>
 ) : (
 /* ---- COMPLETED ---- */
 <div className="border-2 border-primary/40 bg-primary/5 p-6 sm:p-8 mb-8">
 <div className="flex items-center gap-2 mb-4">
 <ShieldCheck className="w-5 h-5 text-primary"/>
 <p className="font-mono text-sm font-bold tracking-[0.1em] uppercase text-primary">
 Inspección Completada
 </p>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Hora de inspección
 </p>
 <p className="text-lg font-mono font-bold tracking-tight mt-1 text-primary">
 {formatHour(inspectionHour)}
 </p>
 <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
 Revelada
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Fecha
 </p>
 <p className="text-sm font-mono font-bold tracking-tight mt-1 capitalize">
 {displayDate}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Miembros evaluados
 </p>
 <p className="text-lg font-mono font-bold tabular-nums tracking-tight mt-1 flex items-center gap-1.5">
 <Users className="w-4 h-4 text-muted-foreground"/>
 {todayResult?.members.length ?? 0}
 </p>
 </div>
 </div>
 </div>
 )}

 {/* Caught person banner (only if inspection done) */}
 {inspectionDone && todayResult && todayResult.members.length > 0 && (
 <div className="mb-8">
 {/* Caught */}
 <div className="border-2 border-red-500/50 bg-red-500/5 p-6 sm:p-8 mb-4">
 <div className="flex items-center gap-2 mb-3">
 <ShieldAlert className="w-4 h-4 text-red-500"/>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/70">
 Atrapado en la inspección
 </p>
 </div>
 <div className="flex items-center gap-4">
 <Avatar className="w-14 h-14 sm:w-16 sm:h-16 ring-2 ring-red-500/40">
 <AvatarImage
 src={
 todayResult.members[todayResult.members.length - 1]?.profile
 ?.avatar_url ?? undefined
 }
 />
 <AvatarFallback className="font-mono text-lg bg-red-500/20 text-red-500">
 {getInitials(todayResult.caughtName)}
 </AvatarFallback>
 </Avatar>
 <div>
 <p className="text-xl sm:text-2xl font-mono font-black tracking-tight text-red-500">
 {todayResult.caughtName}
 </p>
 <p className="font-mono text-xs text-red-400/80 mt-0.5">
 {todayResult.caughtEntries}{""}
 {todayResult.caughtEntries === 1 ?"entrada":"entradas"} al
 momento de la inspección
 </p>
 <span className="inline-block mt-2 font-mono text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border text-red-500 border-red-500/40 bg-red-500/10">
 ATRAPADO
 </span>
 </div>
 </div>
 </div>

 {/* Best performer */}
 <div className="border border-green-500/30 bg-green-500/3 p-4 mb-4">
 <div className="flex items-center gap-3">
 <Avatar className="w-10 h-10 ring-1 ring-green-500/30">
 <AvatarImage
 src={
 todayResult.members[0]?.profile?.avatar_url ?? undefined
 }
 />
 <AvatarFallback className="font-mono text-xs bg-green-500/10 text-green-600 dark:text-green-400">
 {getInitials(todayResult.bestName)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="font-mono font-bold tracking-tight text-green-600 dark:text-green-400">
 {todayResult.bestName}
 </p>
 <p className="font-mono text-[10px] text-green-500/70">
 {todayResult.bestEntries}{""}
 {todayResult.bestEntries === 1 ?"entrada":"entradas"} al
 momento
 </p>
 </div>
 <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10">
 PREPARADO
 </span>
 </div>
 </div>
 </div>
 )}

 {/* Full ranking (only if inspection done) */}
 {inspectionDone && todayResult && todayResult.members.length > 0 && (
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Ranking completo &mdash; snapshot a las {formatHour(inspectionHour)}
 </p>

 <div className="space-y-1">
 {todayResult.members.map((m) => {
 const isWorst = m.rank === todayResult.members.length;
 const isBest = m.rank === 1;
 const isMe = m.userId === userId;

 return (
 <div
 key={m.userId}
 className={cn(
"border p-3 flex items-center gap-3 transition-colors",
 isWorst &&
"border-2 border-red-500/40 bg-red-500/5",
 isBest &&"border-green-500/30 bg-green-500/3",
 !isWorst && !isBest &&"border-border")}
 >
 {/* Rank */}
 <div
 className={cn(
"w-7 h-7 border flex items-center justify-center font-mono text-xs font-bold tabular-nums shrink-0",
 isWorst &&"border-red-500/40 text-red-500",
 isBest &&
"border-green-500/30 text-green-600 dark:text-green-400",
 !isWorst &&
 !isBest &&
"border-border text-muted-foreground")}
 >
 {m.rank}
 </div>

 {/* Avatar */}
 <Avatar
 className={cn(
"w-8 h-8 ring-1 shrink-0",
 isWorst &&"ring-red-500/30",
 isBest &&"ring-green-500/30",
 !isWorst && !isBest &&"ring-border")}
 >
 <AvatarImage src={m.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="font-mono text-[10px]">
 {getInitials(m.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>

 {/* Name */}
 <div className="flex-1 min-w-0">
 <p
 className={cn(
"font-mono font-bold tracking-tight text-sm truncate",
 isWorst &&"text-red-500",
 isBest &&"text-green-600 dark:text-green-400")}
 >
 {m.profile?.full_name ??"Sin nombre"}
 {isMe && (
 <span className="ml-1.5 font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
 (tú)
 </span>
 )}
 </p>
 </div>

 {/* Entry count */}
 <div className="text-right shrink-0">
 <p
 className={cn(
"font-mono font-bold tabular-nums tracking-tight text-lg",
 isWorst &&"text-red-500",
 isBest &&"text-green-600 dark:text-green-400")}
 >
 {m.entriesAtSnapshot}
 </p>
 <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
 {m.entriesAtSnapshot === 1 ?"entrada":"entradas"}
 </p>
 </div>

 {/* Badge */}
 {isWorst && (
 <span className="font-mono text-[9px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 border text-red-500 border-red-500/40 bg-red-500/10 shrink-0">
 ATRAPADO
 </span>
 )}
 {isBest && (
 <span className="font-mono text-[9px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 border text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10 shrink-0">
 PREPARADO
 </span>
 )}
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* No members empty state */}
 {inspectionDone && (!todayResult || todayResult.members.length === 0) && (
 <div className="flex flex-col items-center justify-center py-16 gap-4 mb-8">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Users className="w-7 h-7 text-muted-foreground"/>
 </div>
 <p className="text-sm text-muted-foreground font-mono">
 No hay miembros para evaluar.
 </p>
 </div>
 )}

 {/* History: last 14 days */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Historial de inspecciones &mdash; últimos 14 días
 </p>

 {history.length === 0 ? (
 <div className="border border-border p-6 text-center">
 <p className="font-mono text-xs text-muted-foreground">
 Sin historial disponible.
 </p>
 </div>
 ) : (
 <div className="space-y-1">
 {history.map((h) => {
 const dayLabel = format(
 new Date(h.date +"T12:00:00"),
"EEE d MMM",
 { locale: es }
 );

 return (
 <div
 key={h.date}
 className="border border-border p-3 flex items-center gap-3">
 <div className="flex items-center gap-1.5 shrink-0 w-24">
 <Calendar className="w-3 h-3 text-muted-foreground"/>
 <p className="font-mono text-[11px] text-muted-foreground capitalize truncate">
 {dayLabel}
 </p>
 </div>
 <div className="flex items-center gap-1 shrink-0 w-20">
 <Clock className="w-3 h-3 text-muted-foreground"/>
 <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
 {formatHour(h.inspectionHour)}
 </p>
 </div>
 <div className="flex-1 min-w-0 flex items-center gap-2">
 <Skull className="w-3.5 h-3.5 text-red-500/60 shrink-0"/>
 <p className="font-mono text-xs font-bold text-red-500 truncate">
 {h.caughtName}
 </p>
 </div>
 <div className="text-right shrink-0">
 <p className="font-mono text-xs tabular-nums text-muted-foreground">
 {h.caughtEntries}{""}
 {h.caughtEntries === 1 ?"entrada":"entradas"}
 </p>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>

 {/* Most caught stat */}
 {mostCaughtName && (
 <div className="mb-8">
 <div className="border-2 border-red-500/30 bg-red-500/5 p-4 flex items-center gap-3">
 <Trophy className="w-5 h-5 text-red-500/70"/>
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/50">
 Más veces atrapado (14 días)
 </p>
 <p className="font-mono font-bold text-red-500 tracking-tight">
 {mostCaughtName}
 </p>
 </div>
 <div className="ml-auto text-right">
 <p className="text-2xl font-mono font-black tabular-nums tracking-tight text-red-500">
 {mostCaughtCount}
 </p>
 <p className="font-mono text-[9px] uppercase text-red-500/50">
 {mostCaughtCount === 1 ?"vez":"veces"}
 </p>
 </div>
 </div>
 </div>
 )}

 {/* Next inspection */}
 <div className="border border-border/30 p-4 text-center">
 <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/25 mb-1">
 Próxima inspección
 </p>
 <p className="font-mono text-sm font-bold tracking-tight text-muted-foreground">
 Mañana (hora desconocida)
 </p>
 <p className="font-mono text-[9px] tracking-[0.15em] uppercase text-muted-foreground/20 mt-2">
 No puedes prepararte. Solo puedes trabajar.
 </p>
 </div>
 </div>
 );
}
