"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials, getTodayMTY, formatHour } from "@/lib/utils";
import type { Profile, TimeEntry } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { subDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
 Clock,
 Zap,
 Turtle,
 TrendingUp,
 TrendingDown,
 Minus,
 AlertTriangle,
 CalendarX,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberStats {
 userId: string;
 profile: Profile;
 avgResponseMin: number;
 fastestMin: number;
 slowestMin: number;
 pctWithin30: number;
 pctSameDay: number;
 pctLate: number;
 totalEntries: number;
}

interface HourStatus {
 hour: number;
 logged: { userId: string; name: string; responseMin: number }[];
 missing: { userId: string; name: string }[];
}

interface WorstDay {
 date: string;
 avgMin: number;
 worstUserId: string;
 worstUserName: string;
 worstUserMin: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentHourMTY(): number {
 const mtyTime = new Intl.DateTimeFormat("en-US", {
 timeZone:"America/Monterrey",
 hour:"numeric",
 hour12: false,
 }).format(new Date());
 return parseInt(mtyTime, 10);
}

function calcResponseMinutes(entry: TimeEntry): number {
 // If is_late and minutes_late is set, use that directly
 if (entry.is_late && entry.minutes_late > 0) {
 return entry.minutes_late;
 }

 // Calculate: logged_at - end of the work hour
 // hour=9 means 9:00-10:00 block, so end = date at 10:00 CST
 const hourEnd = entry.hour + 1;
 const endStr =`${entry.date}T${String(hourEnd).padStart(2,"0")}:00:00`;

 // Parse logged_at
 const loggedAt = new Date(entry.logged_at);

 // Build end date in MTY timezone for comparison
 // Use a simpler approach: parse the date and set hour in UTC-6 (CST)
 const endDate = new Date(endStr);
 // Adjust for CST (UTC-6)
 endDate.setTime(endDate.getTime() + 6 * 60 * 60 * 1000);

 const diffMs = loggedAt.getTime() - endDate.getTime();
 if (diffMs <= 0) return 0; // logged before hour ended = real-time
 return Math.round(diffMs / 60000);
}

function formatResponseTime(min: number): string {
 if (min === 0) return"0m";
 if (min < 60) return`${min}m`;
 const h = Math.floor(min / 60);
 const m = min % 60;
 if (m === 0) return`${h}h`;
 return`${h}h ${m}m`;
}

function responseColor(min: number): string {
 if (min <= 5) return"text-green-600 dark:text-green-400";
 if (min <= 30) return"text-emerald-600 dark:text-emerald-400";
 if (min <= 60) return"text-yellow-600 dark:text-yellow-400";
 if (min <= 180) return"text-orange-600 dark:text-orange-400";
 return"text-red-600 dark:text-red-400";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResponseTimePage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();
 const [entries, setEntries] = useState<TimeEntry[]>([]);
 const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
 const [memberWorkHours, setMemberWorkHours] = useState<
 Map<string, { start: number; end: number }>
 >(new Map());
 const [loading, setLoading] = useState(true);

 const today = getTodayMTY();
 const currentHour = getCurrentHourMTY();

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId) {
 setLoading(false);
 return;
 }

 async function load() {
 const startDate = format(subDays(new Date(), 14),"yyyy-MM-dd");

 const [entriesResult, membersResult] = await Promise.all([
 supabase
 .from("time_entries")
 .select("*")
 .eq("org_id", orgId!)
 .gte("date", startDate)
 .lte("date", today)
 .order("date", { ascending: true })
 .order("hour", { ascending: true }),
 supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId!),
 ]);

 const profileMap = new Map<string, Profile>();
 const workHoursMap = new Map<string, { start: number; end: number }>();
 for (const m of membersResult.data ?? []) {
 const p = m.profiles as unknown as Profile;
 if (p) {
 profileMap.set(m.user_id, p);
 workHoursMap.set(m.user_id, {
 start: p.work_start_hour ?? 9,
 end: p.work_end_hour ?? 18,
 });
 }
 }

 setEntries((entriesResult.data as TimeEntry[]) ?? []);
 setProfiles(profileMap);
 setMemberWorkHours(workHoursMap);
 setLoading(false);
 }
 load();
 }, [orgId, orgLoading]); // eslint-disable-line react-hooks/exhaustive-deps

 // ---------------------------------------------------------------------------
 // Computed: per-member stats
 // ---------------------------------------------------------------------------

 const memberStats = useMemo(() => {
 if (profiles.size === 0) return [];

 const byUser = new Map<string, TimeEntry[]>();
 for (const e of entries) {
 if (!byUser.has(e.user_id)) byUser.set(e.user_id, []);
 byUser.get(e.user_id)!.push(e);
 }

 const stats: MemberStats[] = [];

 for (const [uid, profile] of profiles) {
 const userEntries = byUser.get(uid) ?? [];
 if (userEntries.length === 0) {
 stats.push({
 userId: uid,
 profile,
 avgResponseMin: Infinity,
 fastestMin: Infinity,
 slowestMin: 0,
 pctWithin30: 0,
 pctSameDay: 0,
 pctLate: 0,
 totalEntries: 0,
 });
 continue;
 }

 const responseTimes = userEntries.map(calcResponseMinutes);
 const total = responseTimes.length;
 const sum = responseTimes.reduce((a, b) => a + b, 0);
 const avg = Math.round(sum / total);
 const fastest = Math.min(...responseTimes);
 const slowest = Math.max(...responseTimes);
 const within30 = responseTimes.filter((r) => r <= 30).length;
 const lateCount = userEntries.filter((e) => e.is_late).length;

 // Same day: logged_at date matches entry date
 const sameDay = userEntries.filter((e) => {
 const loggedDate = new Intl.DateTimeFormat("en-CA", {
 timeZone:"America/Monterrey",
 }).format(new Date(e.logged_at));
 return loggedDate === e.date;
 }).length;

 stats.push({
 userId: uid,
 profile,
 avgResponseMin: avg,
 fastestMin: fastest,
 slowestMin: slowest,
 pctWithin30: Math.round((within30 / total) * 100),
 pctSameDay: Math.round((sameDay / total) * 100),
 pctLate: Math.round((lateCount / total) * 100),
 totalEntries: total,
 });
 }

 // Sort by avg response time ascending (fastest first)
 // People with no entries go to the bottom
 stats.sort((a, b) => {
 if (a.totalEntries === 0 && b.totalEntries === 0) return 0;
 if (a.totalEntries === 0) return 1;
 if (b.totalEntries === 0) return -1;
 return a.avgResponseMin - b.avgResponseMin;
 });

 return stats;
 }, [entries, profiles]);

 // ---------------------------------------------------------------------------
 // Computed: today's hour-by-hour status
 // ---------------------------------------------------------------------------

 const todayHourStatus = useMemo(() => {
 const todayEntries = entries.filter((e) => e.date === today);

 // Find the earliest work_start and latest work_end across all members
 let minStart = 9;
 let maxEnd = 18;
 for (const [, wh] of memberWorkHours) {
 if (wh.start < minStart) minStart = wh.start;
 if (wh.end > maxEnd) maxEnd = wh.end;
 }

 const hours: HourStatus[] = [];

 for (let h = minStart; h < Math.min(maxEnd, currentHour + 1); h++) {
 const hourEntries = todayEntries.filter((e) => e.hour === h);
 const loggedUserIds = new Set(hourEntries.map((e) => e.user_id));

 const logged: HourStatus["logged"] = [];
 const missing: HourStatus["missing"] = [];

 for (const [uid, profile] of profiles) {
 const wh = memberWorkHours.get(uid);
 // Only include members whose work hours include this hour
 if (wh && h >= wh.start && h < wh.end) {
 if (loggedUserIds.has(uid)) {
 const entry = hourEntries.find((e) => e.user_id === uid)!;
 logged.push({
 userId: uid,
 name: profile.full_name ?? profile.email,
 responseMin: calcResponseMinutes(entry),
 });
 } else {
 missing.push({
 userId: uid,
 name: profile.full_name ?? profile.email,
 });
 }
 }
 }

 // Sort logged by response time
 logged.sort((a, b) => a.responseMin - b.responseMin);

 hours.push({ hour: h, logged, missing });
 }

 return hours;
 }, [entries, profiles, memberWorkHours, today, currentHour]);

 // ---------------------------------------------------------------------------
 // Computed: worst day
 // ---------------------------------------------------------------------------

 const worstDay = useMemo((): WorstDay | null => {
 if (entries.length === 0) return null;

 const dayMap = new Map<string, { times: number[]; userTimes: Map<string, number[]> }>();

 for (const e of entries) {
 if (!dayMap.has(e.date)) {
 dayMap.set(e.date, { times: [], userTimes: new Map() });
 }
 const rt = calcResponseMinutes(e);
 dayMap.get(e.date)!.times.push(rt);
 if (!dayMap.get(e.date)!.userTimes.has(e.user_id)) {
 dayMap.get(e.date)!.userTimes.set(e.user_id, []);
 }
 dayMap.get(e.date)!.userTimes.get(e.user_id)!.push(rt);
 }

 let worst: WorstDay | null = null;
 let worstAvg = -1;

 for (const [date, data] of dayMap) {
 const avg = data.times.reduce((a, b) => a + b, 0) / data.times.length;
 if (avg > worstAvg) {
 worstAvg = avg;
 // Find worst individual on that day
 let worstUser ="";
 let worstUserAvg = -1;
 for (const [uid, times] of data.userTimes) {
 const uAvg = times.reduce((a, b) => a + b, 0) / times.length;
 if (uAvg > worstUserAvg) {
 worstUserAvg = uAvg;
 worstUser = uid;
 }
 }
 const profile = profiles.get(worstUser);
 worst = {
 date,
 avgMin: Math.round(avg),
 worstUserId: worstUser,
 worstUserName: profile?.full_name ?? profile?.email ??"Desconocido",
 worstUserMin: Math.round(worstUserAvg),
 };
 }
 }

 return worst;
 }, [entries, profiles]);

 // ---------------------------------------------------------------------------
 // Computed: trend (first 7 days vs last 7 days)
 // ---------------------------------------------------------------------------

 const trend = useMemo(() => {
 if (entries.length < 2) return { direction:"flat"as const, delta: 0 };

 const midDate = format(subDays(new Date(), 7),"yyyy-MM-dd");

 const firstHalf = entries.filter((e) => e.date < midDate);
 const secondHalf = entries.filter((e) => e.date >= midDate);

 if (firstHalf.length === 0 || secondHalf.length === 0)
 return { direction:"flat"as const, delta: 0 };

 const avgFirst =
 firstHalf.map(calcResponseMinutes).reduce((a, b) => a + b, 0) /
 firstHalf.length;
 const avgSecond =
 secondHalf.map(calcResponseMinutes).reduce((a, b) => a + b, 0) /
 secondHalf.length;

 const delta = Math.round(avgSecond - avgFirst);
 const direction =
 delta < -5 ? ("faster"as const) : delta > 5 ? ("slower"as const) : ("flat"as const);

 return { direction, delta: Math.abs(delta) };
 }, [entries]);

 // ---------------------------------------------------------------------------
 // Render
 // ---------------------------------------------------------------------------

 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </p>
 </div>
 );
 }

 if (!orgId) {
 return (
 <div className="flex items-center justify-center h-screen">
 <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
 Sin organizacion
 </p>
 </div>
 );
 }

 const fastest = memberStats.find((s) => s.totalEntries > 0) ?? null;
 const slowest =
 [...memberStats].filter((s) => s.totalEntries > 0).pop() ?? null;

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-3 mb-1">
 <Clock className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Ranking de Tiempo de Respuesta
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground mb-8">
 Ultimos 14 dias -- Quien registra rapido y quien se tarda
 </p>

 {/* Top stats row */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
 {/* Trend */}
 <div className="bg-accent/30 border border-border p-4">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Tendencia 14 dias
 </p>
 <div className="flex items-center gap-2">
 {trend.direction ==="faster"? (
 <TrendingDown className="w-5 h-5 text-green-600"/>
 ) : trend.direction ==="slower"? (
 <TrendingUp className="w-5 h-5 text-red-600"/>
 ) : (
 <Minus className="w-5 h-5 text-muted-foreground"/>
 )}
 <span
 className={cn(
"font-mono text-2xl tabular-nums tracking-tight font-bold",
 trend.direction ==="faster"?"text-green-600": trend.direction ==="slower"?"text-red-600":"text-muted-foreground")}
 >
 {trend.direction ==="flat"?"Estable":`${trend.delta}m`}
 </span>
 </div>
 <p className="font-mono text-[10px] text-muted-foreground mt-1">
 {trend.direction ==="faster"?"Mas rapido que la semana anterior": trend.direction ==="slower"?"Mas lento que la semana anterior":"Sin cambio significativo"}
 </p>
 </div>

 {/* Fastest */}
 {fastest && (
 <div className="bg-accent/30 border border-border p-4">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Mas rapido
 </p>
 <div className="flex items-center gap-2">
 <Zap className="w-5 h-5 text-green-600"/>
 <span className="font-mono text-lg tabular-nums tracking-tight font-bold text-green-600">
 {formatResponseTime(fastest.avgResponseMin)}
 </span>
 </div>
 <p className="font-mono text-[10px] text-muted-foreground mt-1 truncate">
 {fastest.profile.full_name ?? fastest.profile.email}
 </p>
 </div>
 )}

 {/* Worst day */}
 {worstDay && (
 <div className="bg-accent/30 border border-border p-4">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Peor dia
 </p>
 <div className="flex items-center gap-2">
 <CalendarX className="w-4 h-4 text-red-600"/>
 <span className="font-mono text-lg tabular-nums tracking-tight font-bold text-red-600">
 {formatResponseTime(worstDay.avgMin)} prom
 </span>
 </div>
 <p className="font-mono text-[10px] text-muted-foreground mt-1">
 {format(parseISO(worstDay.date),"d MMM", { locale: es })} --{""}
 <span className="text-red-600 font-semibold">
 {worstDay.worstUserName}
 </span>{""}
 ({formatResponseTime(worstDay.worstUserMin)})
 </p>
 </div>
 )}
 </div>

 {/* Ranking table */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Ranking general
 </p>
 <div className="border border-border divide-y divide-border">
 {/* Header row */}
 <div className="grid grid-cols-[2.5rem_1fr_5rem_5rem_5rem_4.5rem] sm:grid-cols-[2.5rem_1fr_5.5rem_5.5rem_5.5rem_5rem_5rem] gap-1 px-3 py-2 bg-accent/20">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 #
 </span>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Persona
 </span>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground text-right">
 Prom
 </span>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground text-right">
 Mejor
 </span>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground text-right">
 Peor
 </span>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground text-right hidden sm:block">
 &lt;30m
 </span>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground text-right">
 Tarde
 </span>
 </div>

 {memberStats.map((s, i) => {
 const isFirst = i === 0 && s.totalEntries > 0;
 const isLast =
 i === memberStats.length - 1 &&
 memberStats.length > 1 &&
 s.totalEntries > 0;

 return (
 <div
 key={s.userId}
 className={cn(
"grid grid-cols-[2.5rem_1fr_5rem_5rem_5rem_4.5rem] sm:grid-cols-[2.5rem_1fr_5.5rem_5.5rem_5.5rem_5rem_5rem] gap-1 px-3 py-2.5 items-center transition-colors duration-200 hover:bg-accent/10",
 isFirst &&"bg-green-500/5",
 isLast &&"bg-red-500/5")}
 >
 {/* Rank */}
 <span
 className={cn(
"font-mono text-sm tabular-nums font-bold",
 isFirst
 ?"text-green-600": isLast
 ?"text-red-600":"text-muted-foreground")}
 >
 {i + 1}
 </span>

 {/* Person */}
 <div className="flex items-center gap-2 min-w-0">
 <Avatar className="w-6 h-6 ring-1 ring-border shrink-0">
 <AvatarImage src={s.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px] font-mono">
 {getInitials(s.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span
 className={cn(
"font-mono text-xs truncate",
 isLast
 ?"text-red-600 font-bold": isFirst
 ?"text-green-600 font-semibold":"text-foreground")}
 >
 {s.profile.full_name ?? s.profile.email}
 </span>
 {isFirst && s.totalEntries > 0 && (
 <span className="shrink-0 font-mono text-[8px] tracking-[0.15em] uppercase bg-green-600/15 text-green-600 border border-green-600/30 px-1.5 py-0.5">
 RAYO
 </span>
 )}
 {isLast && s.totalEntries > 0 && (
 <span className="shrink-0 font-mono text-[8px] tracking-[0.15em] uppercase bg-red-600/15 text-red-600 border border-red-600/30 px-1.5 py-0.5">
 TORTUGA
 </span>
 )}
 </div>

 {/* Avg */}
 <span
 className={cn(
"font-mono text-xs tabular-nums text-right font-bold",
 s.totalEntries === 0
 ?"text-muted-foreground": responseColor(s.avgResponseMin)
 )}
 >
 {s.totalEntries === 0
 ?"--": formatResponseTime(s.avgResponseMin)}
 </span>

 {/* Fastest */}
 <span
 className={cn(
"font-mono text-xs tabular-nums text-right",
 s.totalEntries === 0
 ?"text-muted-foreground": responseColor(s.fastestMin)
 )}
 >
 {s.totalEntries === 0
 ?"--": formatResponseTime(s.fastestMin)}
 </span>

 {/* Slowest */}
 <span
 className={cn(
"font-mono text-xs tabular-nums text-right",
 s.totalEntries === 0
 ?"text-muted-foreground": responseColor(s.slowestMin)
 )}
 >
 {s.totalEntries === 0
 ?"--": formatResponseTime(s.slowestMin)}
 </span>

 {/* % within 30m */}
 <span
 className={cn(
"font-mono text-xs tabular-nums text-right hidden sm:block",
 s.totalEntries === 0
 ?"text-muted-foreground": s.pctWithin30 >= 80
 ?"text-green-600": s.pctWithin30 >= 50
 ?"text-yellow-600":"text-red-600")}
 >
 {s.totalEntries === 0 ?"--":`${s.pctWithin30}%`}
 </span>

 {/* % late */}
 <span
 className={cn(
"font-mono text-xs tabular-nums text-right",
 s.totalEntries === 0
 ?"text-muted-foreground": s.pctLate <= 10
 ?"text-green-600": s.pctLate <= 30
 ?"text-yellow-600":"text-red-600")}
 >
 {s.totalEntries === 0 ?"--":`${s.pctLate}%`}
 </span>
 </div>
 );
 })}

 {memberStats.length === 0 && (
 <div className="px-3 py-8 text-center">
 <p className="font-mono text-xs text-muted-foreground">
 Sin datos de entradas
 </p>
 </div>
 )}
 </div>
 </div>

 {/* Slowest callout */}
 {slowest && slowest.totalEntries > 0 && memberStats.length > 1 && (
 <div className="mb-8 border border-red-600/30 bg-red-600/5 p-4">
 <div className="flex items-center gap-3">
 <Turtle className="w-5 h-5 text-red-600 shrink-0"/>
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-600/60 mb-1">
 El mas lento del equipo
 </p>
 <p className="font-mono text-sm">
 <span className="text-red-600 font-bold">
 {slowest.profile.full_name ?? slowest.profile.email}
 </span>{""}
 <span className="text-muted-foreground">
 tarda en promedio{""}
 </span>
 <span className="text-red-600 font-bold tabular-nums">
 {formatResponseTime(slowest.avgResponseMin)}
 </span>{""}
 <span className="text-muted-foreground">
 en registrar despues de cada hora. Solo{""}
 </span>
 <span className="text-red-600 font-bold tabular-nums">
 {slowest.pctWithin30}%
 </span>{""}
 <span className="text-muted-foreground">
 de sus entradas fueron dentro de los primeros 30 minutos.
 </span>
 </p>
 </div>
 </div>
 </div>
 )}

 {/* Today's hour-by-hour */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Hoy -- hora por hora
 </p>

 {todayHourStatus.length === 0 ? (
 <div className="border border-border p-6 text-center">
 <p className="font-mono text-xs text-muted-foreground">
 Aun no hay horas completadas hoy
 </p>
 </div>
 ) : (
 <div className="border border-border divide-y divide-border">
 {todayHourStatus.map((hs) => (
 <div key={hs.hour} className="px-3 py-2.5">
 <div className="flex items-center gap-3 mb-1.5">
 <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60 w-14 shrink-0">
 {formatHour(hs.hour)}
 </span>
 <span className="font-mono text-[9px] text-muted-foreground">
 {hs.logged.length} registrado{hs.logged.length !== 1 ?"s":""}{""}
 {hs.missing.length > 0 && (
 <span className="text-red-600">
 / {hs.missing.length} faltante{hs.missing.length !== 1 ?"s":""}
 </span>
 )}
 </span>
 </div>

 <div className="flex flex-wrap gap-x-4 gap-y-1 ml-14">
 {hs.logged.map((l) => (
 <span
 key={l.userId}
 className="font-mono text-[10px] flex items-center gap-1">
 <span className="text-foreground/80">{l.name}</span>
 <span
 className={cn(
"tabular-nums font-bold",
 responseColor(l.responseMin)
 )}
 >
 {formatResponseTime(l.responseMin)}
 </span>
 </span>
 ))}
 {hs.missing.map((m) => (
 <span
 key={m.userId}
 className="font-mono text-[10px] flex items-center gap-1">
 <AlertTriangle className="w-2.5 h-2.5 text-red-600"/>
 <span className="text-red-600 font-bold">{m.name}</span>
 <span className="text-red-600/50">sin registrar</span>
 </span>
 ))}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Footer */}
 <div className="text-center py-4 border-t border-border/30">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Registra al momento. No despues.
 </p>
 </div>
 </div>
 );
}
