"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY, formatHourShort } from "@/lib/utils";
import type { Profile, TimeEntry } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Scale, AlertTriangle, Users, ShieldCheck, Clock, TrendingUp } from "lucide-react";
import { subDays, startOfWeek, format } from "date-fns";

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

interface HourSlot {
 hour: number;
 logged: boolean;
 hasProof: boolean;
}

interface MemberDebt {
 userId: string;
 profile: Profile | null;
 /** Today's computed compounding debt */
 debt: number;
 /** Which hours are missing */
 missingHours: number[];
 /** Longest current consecutive missing streak */
 currentStreak: number;
 /** Slot-by-slot breakdown */
 slots: HourSlot[];
 /** Is debt actively compounding right now? */
 isActive: boolean;
 /** Yesterday's debt */
 yesterdayDebt: number;
 /** This week's total debt */
 weekDebt: number;
}

/* ------------------------------------------------------------------ */
/* Debt calculation */
/* ------------------------------------------------------------------ */

/**
 * Triangular number: n*(n+1)/2
 * Hour 1 missed = 1pt, Hour 2 = 1+2 = 3pt, Hour 3 = 1+2+3 = 6pt, etc.
 *
 * Entries WITH proof reset the consecutive counter.
 * Entries WITHOUT proof do NOT reset - debt continues compounding.
 */
function calculateDebt(
 slots: HourSlot[]
): { debt: number; missingHours: number[]; currentStreak: number } {
 let totalDebt = 0;
 let consecutiveMissing = 0;
 const missingHours: number[] = [];

 for (const slot of slots) {
 if (slot.logged && slot.hasProof) {
 // Proof clears the streak
 consecutiveMissing = 0;
 } else {
 // Missing OR logged without proof -> debt compounds
 consecutiveMissing++;
 totalDebt += consecutiveMissing; // triangular accumulation
 missingHours.push(slot.hour);
 }
 }

 return { debt: totalDebt, missingHours, currentStreak: consecutiveMissing };
}

/**
 * Build hour slots for a given date up to maxHour.
 * maxHour is either the current MTY hour (for today) or work_end_hour (for past days).
 */
function buildSlots(
 entries: Pick<TimeEntry,"hour"|"proof_urls">[],
 workStartHour: number,
 maxHour: number
): HourSlot[] {
 const entryMap = new Map<number, { hasProof: boolean }>();
 for (const e of entries) {
 const proofUrls = e.proof_urls as string[] | null;
 const hasProof = !!proofUrls && proofUrls.length > 0;
 entryMap.set(e.hour, { hasProof });
 }

 const slots: HourSlot[] = [];
 for (let h = workStartHour; h <= maxHour; h++) {
 const entry = entryMap.get(h);
 slots.push({
 hour: h,
 logged: !!entry,
 hasProof: entry?.hasProof ?? false,
 });
 }

 return slots;
}

/** Get current hour in MTY timezone */
function getCurrentHourMTY(): number {
 const now = new Date();
 const mtyStr = now.toLocaleString("en-US", { timeZone:"America/Monterrey", hour:"numeric", hour12: false });
 return parseInt(mtyStr, 10);
}

/* ------------------------------------------------------------------ */
/* Debt Stack Visual */
/* ------------------------------------------------------------------ */

function DebtStack({ streak, maxStreak }: { streak: number; maxStreak: number }) {
 if (streak === 0) return null;

 const blocks = Array.from({ length: streak }, (_, i) => i + 1);

 return (
 <div className="flex items-end gap-px h-10">
 {blocks.map((n) => {
 const heightPct = Math.min(100, (n / Math.max(maxStreak, 6)) * 100);
 return (
 <div
 key={n}
 className={cn(
"w-2 sm:w-2.5 border border-red-500/40",
 n <= 2 &&"bg-amber-500/40",
 n > 2 && n <= 4 &&"bg-red-400/40",
 n > 4 &&"bg-red-600/60 animate-pulse")}
 style={{ height:`${Math.max(15, heightPct)}%`}}
 title={`Hora ${n}: +${n} pts`}
 />
 );
 })}
 </div>
 );
}

/* ------------------------------------------------------------------ */
/* Hour grid */
/* ------------------------------------------------------------------ */

function HourGrid({ slots }: { slots: HourSlot[] }) {
 return (
 <div className="flex flex-wrap gap-1 mt-2">
 {slots.map((slot) => (
 <div
 key={slot.hour}
 className={cn(
"flex flex-col items-center border px-1 py-0.5 min-w-[32px]",
 slot.logged && slot.hasProof &&"border-green-500/40 bg-green-500/10",
 slot.logged && !slot.hasProof &&"border-amber-500/40 bg-amber-500/10",
 !slot.logged &&"border-red-500/40 bg-red-500/10")}
 title={
 slot.logged && slot.hasProof
 ?`${formatHourShort(slot.hour)}: Registrada con prueba`: slot.logged
 ?`${formatHourShort(slot.hour)}: Sin prueba (deuda continua)`:`${formatHourShort(slot.hour)}: No registrada`}
 >
 <span className="font-mono text-[8px] text-muted-foreground">
 {formatHourShort(slot.hour)}
 </span>
 <span className="font-mono text-[10px] font-bold">
 {slot.logged && slot.hasProof ? (
 <ShieldCheck className="w-3 h-3 text-green-500"/>
 ) : slot.logged ? (
 <AlertTriangle className="w-3 h-3 text-amber-500"/>
 ) : (
 <span className="text-red-500">X</span>
 )}
 </span>
 </div>
 ))}
 </div>
 );
}

/* ------------------------------------------------------------------ */
/* Live debt counter */
/* ------------------------------------------------------------------ */

function LiveDebtCounter({ debt, isActive }: { debt: number; isActive: boolean }) {
 const [display, setDisplay] = useState(debt);
 const [flash, setFlash] = useState(false);

 useEffect(() => {
 if (display !== debt) {
 setDisplay(debt);
 setFlash(true);
 const t = setTimeout(() => setFlash(false), 600);
 return () => clearTimeout(t);
 }
 }, [debt]); // eslint-disable-line react-hooks/exhaustive-deps

 return (
 <span
 className={cn(
"font-mono font-black tabular-nums tracking-tight transition-colors duration-300",
 flash &&"scale-110",
 isActive && debt > 0 &&"animate-pulse")}
 >
 {display}
 </span>
 );
}

/* ------------------------------------------------------------------ */
/* Page */
/* ------------------------------------------------------------------ */

export default function DebtPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [members, setMembers] = useState<MemberDebt[]>([]);
 const [loading, setLoading] = useState(true);
 const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

 /* ---------- data loader ---------- */

 const loadData = useCallback(async () => {
 if (!orgId) return;

 const today = getTodayMTY();
 const currentHour = getCurrentHourMTY();

 // Yesterday
 const yesterdayDate = subDays(new Date(today +"T12:00:00"), 1)
 .toISOString()
 .split("T")[0];

 // Week start (Monday)
 const weekStart = format(
 startOfWeek(new Date(today +"T12:00:00"), { weekStartsOn: 1 }),
"yyyy-MM-dd");

 // 1. All org members with profiles
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
 if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
 }

 // 2. Today's time entries
 const { data: todayEntries } = await supabase
 .from("time_entries")
 .select("user_id, hour, proof_urls")
 .eq("org_id", orgId)
 .eq("date", today);

 // 3. Yesterday's time entries
 const { data: yesterdayEntries } = await supabase
 .from("time_entries")
 .select("user_id, hour, proof_urls")
 .eq("org_id", orgId)
 .eq("date", yesterdayDate);

 // 4. This week's time entries
 const { data: weekEntries } = await supabase
 .from("time_entries")
 .select("user_id, hour, date, proof_urls")
 .eq("org_id", orgId)
 .gte("date", weekStart)
 .lte("date", today);

 // Group by user
 function groupByUser(entries: { user_id: string; hour: number; proof_urls: string[] | null }[] | null) {
 const map = new Map<string, { hour: number; proof_urls: string[] | null }[]>();
 for (const e of entries ?? []) {
 const uid = e.user_id as string;
 if (!map.has(uid)) map.set(uid, []);
 map.get(uid)!.push({ hour: e.hour, proof_urls: e.proof_urls as string[] | null });
 }
 return map;
 }

 // Group week entries by user+date
 function groupWeekByUserDate(
 entries: { user_id: string; hour: number; date: string; proof_urls: string[] | null }[] | null
 ) {
 const map = new Map<string, Map<string, { hour: number; proof_urls: string[] | null }[]>>();
 for (const e of entries ?? []) {
 const uid = e.user_id as string;
 if (!map.has(uid)) map.set(uid, new Map());
 const dateMap = map.get(uid)!;
 if (!dateMap.has(e.date)) dateMap.set(e.date, []);
 dateMap.get(e.date)!.push({ hour: e.hour, proof_urls: e.proof_urls as string[] | null });
 }
 return map;
 }

 const todayMap = groupByUser(todayEntries as { user_id: string; hour: number; proof_urls: string[] | null }[] | null);
 const yesterdayMap = groupByUser(yesterdayEntries as { user_id: string; hour: number; proof_urls: string[] | null }[] | null);
 const weekMap = groupWeekByUserDate(weekEntries as { user_id: string; hour: number; date: string; proof_urls: string[] | null }[] | null);

 // Build member list
 const result: MemberDebt[] = userIds.map((uid) => {
 const profile = profileMap.get(uid) ?? null;
 const workStart = profile?.work_start_hour ?? 7;
 const workEnd = profile?.work_end_hour ?? 18;

 // Today: up to current hour (or workEnd if past)
 const todayMaxHour = Math.min(currentHour - 1, workEnd); // current hour not yet complete
 const todaySlots = buildSlots(todayMap.get(uid) ?? [], workStart, todayMaxHour);
 const todayCalc = calculateDebt(todaySlots);

 // Is debt actively compounding? Only if we're in work hours and there's a streak
 const isActive = currentHour >= workStart && currentHour <= workEnd && todayCalc.currentStreak > 0;

 // Yesterday: full work day
 const yesterdaySlots = buildSlots(yesterdayMap.get(uid) ?? [], workStart, workEnd);
 const yesterdayCalc = calculateDebt(yesterdaySlots);

 // Week: sum debt for each day
 let weekDebt = todayCalc.debt; // includes today
 const userWeekDates = weekMap.get(uid);
 // Calculate debt for each past day this week
 const pastDate = new Date(weekStart +"T12:00:00");
 const todayObj = new Date(today +"T12:00:00");
 while (pastDate < todayObj) {
 const dateStr = format(pastDate,"yyyy-MM-dd");
 const dayEntries = userWeekDates?.get(dateStr) ?? [];
 const daySlots = buildSlots(dayEntries, workStart, workEnd);
 const dayCalc = calculateDebt(daySlots);
 weekDebt += dayCalc.debt;
 pastDate.setDate(pastDate.getDate() + 1);
 }

 return {
 userId: uid,
 profile,
 debt: todayCalc.debt,
 missingHours: todayCalc.missingHours,
 currentStreak: todayCalc.currentStreak,
 slots: todaySlots,
 isActive,
 yesterdayDebt: yesterdayCalc.debt,
 weekDebt,
 };
 });

 // Sort by highest debt first
 result.sort((a, b) => {
 if (b.debt !== a.debt) return b.debt - a.debt;
 return b.currentStreak - a.currentStreak;
 });

 setMembers(result);
 setLoading(false);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 /* ---------- initial load + 60s refresh ---------- */

 useEffect(() => {
 if (orgLoading || !orgId) {
 if (!orgLoading) setLoading(false);
 return;
 }

 loadData();

 intervalRef.current = setInterval(loadData, 60_000);
 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [orgLoading, orgId, loadData]);

 /* ---------- real-time subscription ---------- */

 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("debt-entries")
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

 /* ---------- loading state ---------- */

 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 CARGANDO...
 </p>
 </div>
 );
 }

 /* ---------- computed ---------- */

 const teamTotalDebt = members.reduce((s, m) => s + m.debt, 0);
 const activeDebtors = members.filter((m) => m.isActive && m.debt > 0);
 const cleanMembers = members.filter((m) => m.debt === 0);
 const worstDebtor = members.length > 0 && members[0].debt > 0 ? members[0] : null;
 const maxStreak = Math.max(...members.map((m) => m.currentStreak), 1);

 /* ---------- render ---------- */

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-2.5 mb-1">
 <Scale className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Deuda Acumulada
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground mb-8">
 Cada hora sin registrar compone deuda. Solo entradas con prueba la limpian.
 Actualización cada 60s.
 </p>

 {/* Worst debtor callout */}
 {worstDebtor && (
 <div className="mb-8 border-2 border-red-500/50 bg-red-500/5 p-4">
 <div className="flex items-center gap-2 mb-1">
 <AlertTriangle className="w-4 h-4 text-red-500"/>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/80 font-bold">
 Mayor deudor
 </p>
 </div>
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Avatar className="w-10 h-10 ring-1 ring-red-500/40">
 <AvatarImage src={worstDebtor.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="font-mono text-xs bg-red-500/20 text-red-500">
 {getInitials(worstDebtor.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <span className="font-mono font-bold text-lg text-red-500 tracking-tight">
 {worstDebtor.profile?.full_name ??"Sin nombre"}
 </span>
 </div>
 <div className="text-right">
 <p className="font-mono font-black text-3xl tabular-nums tracking-tight text-red-500">
 {worstDebtor.debt}
 </p>
 <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-red-500/60">
 puntos deuda
 </p>
 </div>
 </div>
 </div>
 )}

 {/* Team stats strip */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Deuda total equipo
 </p>
 <p className={cn(
"text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
 teamTotalDebt > 0 ?"text-red-500":"text-green-500")}>
 {teamTotalDebt}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Deuda activa
 </p>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
 {activeDebtors.length}
 <span className="text-sm text-muted-foreground ml-1">
 / {members.length}
 </span>
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Limpios
 </p>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-green-500">
 {cleanMembers.length}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Miembros
 </p>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 flex items-center gap-1.5">
 <Users className="w-4 h-4 text-muted-foreground"/>
 {members.length}
 </p>
 </div>
 </div>

 {/* Section label */}
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Ranking de deuda &mdash; mayor primero
 </p>

 {/* Member cards */}
 {members.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Scale className="w-7 h-7 text-muted-foreground"/>
 </div>
 <p className="text-sm text-muted-foreground font-mono">
 No hay miembros en la organizacion.
 </p>
 </div>
 ) : (
 <div className="space-y-2">
 {members.map((m) => {
 const isClean = m.debt === 0;
 const isLow = m.debt > 0 && m.debt <= 3;
 const isMedium = m.debt > 3 && m.debt <= 10;
 const isHigh = m.debt > 10 && m.debt <= 21;
 const isCritical = m.debt > 21;
 const isMe = m.userId === userId;

 // Card border
 const borderClass = cn(
"border transition-colors",
 isClean &&"border border-green-500/30 bg-green-500/3",
 isLow &&"border border-amber-500/30",
 isMedium &&"border-2 border-amber-500/40 bg-amber-500/3",
 isHigh &&"border-2 border-red-500/40 bg-red-500/3",
 isCritical &&"border-2 border-red-500/60 bg-red-500/5 animate-pulse");

 // Name styling
 const nameClass = cn(
"font-mono font-bold tracking-tight",
 isClean &&"text-sm text-green-600 dark:text-green-400",
 isLow &&"text-sm text-foreground",
 isMedium &&"text-base text-amber-500",
 isHigh &&"text-base sm:text-lg text-red-400",
 isCritical &&"text-lg sm:text-xl text-red-500");

 // Debt number styling
 const debtClass = cn(
"font-mono font-black tabular-nums tracking-tight",
 isClean &&"text-lg text-green-600 dark:text-green-400",
 isLow &&"text-xl text-amber-500",
 isMedium &&"text-2xl text-amber-500",
 isHigh &&"text-2xl sm:text-3xl text-red-400",
 isCritical &&"text-3xl sm:text-4xl text-red-500");

 // Tag
 const tagText = isClean
 ?"LIMPIO": m.isActive
 ?"DEUDA ACTIVA":"CON DEUDA";

 const tagClass = cn(
"font-mono text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border",
 isClean &&"text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10",
 (isLow || isMedium) && !m.isActive &&"text-amber-500 border-amber-500/30 bg-amber-500/10",
 (isLow || isMedium) && m.isActive &&"text-amber-500 border-amber-500/40 bg-amber-500/15 animate-pulse",
 (isHigh || isCritical) && !m.isActive &&"text-red-500 border-red-500/30 bg-red-500/10",
 (isHigh || isCritical) && m.isActive &&"text-red-500 border-red-500/40 bg-red-500/15 animate-pulse");

 // Padding scales with debt
 const paddingClass = cn(
 isCritical &&"p-5 sm:p-6",
 isHigh &&"p-4 sm:p-5",
 isMedium &&"p-3 sm:p-4",
 (isClean || isLow) &&"p-3");

 return (
 <div key={m.userId} className={cn(borderClass, paddingClass)}>
 {/* Top row */}
 <div className="flex items-start gap-3">
 {/* Avatar */}
 <Avatar
 className={cn(
"ring-1 ring-border shrink-0",
 isCritical &&"w-12 h-12 sm:w-14 sm:h-14 ring-red-500/40",
 isHigh &&"w-10 h-10 sm:w-12 sm:h-12 ring-red-400/30",
 isMedium &&"w-9 h-9 sm:w-10 sm:h-10 ring-amber-500/30",
 (isClean || isLow) &&"w-8 h-8")}
 >
 <AvatarImage src={m.profile?.avatar_url ?? undefined} />
 <AvatarFallback
 className={cn(
"font-mono text-xs",
 isCritical &&"text-sm bg-red-500/20 text-red-500",
 isHigh &&"bg-red-400/10 text-red-400",
 isClean &&"bg-green-500/10 text-green-500")}
 >
 {getInitials(m.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>

 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <p className={nameClass}>
 {m.profile?.full_name ??"Sin nombre"}
 </p>
 {isMe && (
 <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
 (tu)
 </span>
 )}
 <span className={tagClass}>{tagText}</span>
 </div>

 {/* Missing hours list */}
 {m.missingHours.length > 0 && (
 <div className="flex items-center gap-1.5 mt-1.5">
 <Clock className="w-3 h-3 text-muted-foreground shrink-0"/>
 <p className="font-mono text-[10px] text-muted-foreground/60 truncate">
 Falta: {m.missingHours.map((h) => formatHourShort(h)).join(",")}
 </p>
 </div>
 )}

 {/* Historical debt */}
 <div className="flex items-center gap-3 mt-1.5">
 <span className="font-mono text-[9px] text-muted-foreground">
 Ayer:{""}
 <span className={cn(
"font-bold tabular-nums",
 m.yesterdayDebt > 0 ?"text-red-400/80":"text-green-500/80")}>
 {m.yesterdayDebt}
 </span>
 </span>
 <span className="font-mono text-[9px] text-muted-foreground">
 Semana:{""}
 <span className={cn(
"font-bold tabular-nums",
 m.weekDebt > 0 ?"text-red-400/80":"text-green-500/80")}>
 {m.weekDebt}
 </span>
 </span>
 </div>
 </div>

 {/* Right side: debt + stack */}
 <div className="text-right shrink-0 flex flex-col items-end gap-1">
 <div className={debtClass}>
 <LiveDebtCounter debt={m.debt} isActive={m.isActive} />
 </div>
 <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
 {m.debt === 1 ?"punto":"puntos"}
 </p>
 <DebtStack streak={m.currentStreak} maxStreak={maxStreak} />
 </div>
 </div>

 {/* Hour grid */}
 {m.slots.length > 0 && (
 <div className="mt-3">
 <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground mb-1">
 Horas de hoy
 </p>
 <HourGrid slots={m.slots} />
 </div>
 )}

 {/* Compounding formula explanation for high debt */}
 {m.currentStreak >= 3 && (
 <div className="mt-2 flex items-center gap-1.5">
 <TrendingUp className="w-3 h-3 text-red-400/60"/>
 <p className="font-mono text-[9px] text-red-400/60">
 {m.currentStreak} horas consecutivas sin prueba = {m.currentStreak}*{m.currentStreak + 1}/2 = {(m.currentStreak * (m.currentStreak + 1)) / 2} pts de racha activa
 </p>
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}

 {/* Bottom message */}
 <div className="mt-10 text-center py-6 border-t border-border/30">
 <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/25">
 La deuda se acumula. Solo la evidencia la detiene.
 </p>
 </div>
 </div>
 );
}
