"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { cn, getTodayMTY, getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Handshake,
 AlertTriangle,
 CheckCircle2,
 XCircle,
 Clock,
 ShieldAlert,
 Plus,
 Loader2,
 TrendingDown,
 Skull,
 ArrowRight,
} from "lucide-react";
import {
 format,
 subDays,
 isWeekend,
 addDays,
 differenceInHours,
 differenceInMinutes,
 isBefore,
 isAfter,
} from "date-fns";
import { es } from "date-fns/locale";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollateralCommitment {
 id: string;
 userId: string;
 profile: Profile | null;
 dateOff: string;
 hoursPromised: number;
 createdAt: string;
 // resolved state computed from time_entries
 compensated: boolean;
 actualHoursNext: number;
 deadlinePassed: boolean;
}

interface ShortDay {
 userId: string;
 profile: Profile | null;
 date: string;
 hoursLogged: number;
 nextBusinessDay: string;
 nextDayHours: number;
 compensated: boolean;
 deadlinePassed: boolean;
 hasCommitment: boolean;
}

interface MemberStats {
 userId: string;
 profile: Profile | null;
 shortDays: number;
 compensated: number;
 executed: number;
 complianceRate: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNextBusinessDay(dateStr: string): string {
 let d = addDays(new Date(dateStr +"T12:00:00"), 1);
 while (isWeekend(d)) {
 d = addDays(d, 1);
 }
 return d.toISOString().split("T")[0];
}

function getBusinessDaysBack(fromDate: string, count: number): string[] {
 const dates: string[] = [];
 let current = new Date(fromDate +"T12:00:00");
 while (dates.length < count) {
 if (!isWeekend(current)) {
 dates.push(current.toISOString().split("T")[0]);
 }
 current = subDays(current, 1);
 }
 return dates;
}

function getEndOfBusinessDay(dateStr: string): Date {
 return new Date(dateStr +"T18:00:00");
}

function formatCountdown(targetDate: Date): string {
 const now = new Date();
 if (isAfter(now, targetDate)) return"VENCIDO";
 const totalMinutes = differenceInMinutes(targetDate, now);
 const hours = Math.floor(totalMinutes / 60);
 const minutes = totalMinutes % 60;
 if (hours > 0) return`${hours}h ${minutes}m`;
 return`${minutes}m`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CollateralPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
 const [shortDays, setShortDays] = useState<ShortDay[]>([]);
 const [commitments, setCommitments] = useState<CollateralCommitment[]>([]);
 const [memberStats, setMemberStats] = useState<MemberStats[]>([]);
 const [loading, setLoading] = useState(true);

 // Form state
 const [showForm, setShowForm] = useState(false);
 const [submitting, setSubmitting] = useState(false);
 const [hoursPromised, setHoursPromised] = useState(8);

 // Stats
 const [totalShortDays, setTotalShortDays] = useState(0);
 const [compensationRate, setCompensationRate] = useState(0);
 const [biggestDebtor, setBiggestDebtor] = useState<{
 name: string;
 count: number;
 } | null>(null);

 const today = getTodayMTY();

 const loadData = useCallback(async () => {
 if (!orgId) return;

 // 1. Load org members with profiles
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 if (!members || members.length === 0) {
 setLoading(false);
 return;
 }

 const profileMap = new Map<string, Profile>();
 const userIds: string[] = [];
 for (const m of members) {
 if (m.profiles) {
 profileMap.set(m.user_id, m.profiles as unknown as Profile);
 }
 userIds.push(m.user_id);
 }
 setProfiles(profileMap);

 // 2. Load last 14 business days of time entries
 const lookbackDays = getBusinessDaysBack(today, 14);
 const earliest = lookbackDays[lookbackDays.length - 1];

 const [{ data: entries }, { data: commitmentLogs }] = await Promise.all([
 supabase
 .from("time_entries")
 .select("user_id, date, hour")
 .eq("org_id", orgId)
 .gte("date", earliest)
 .lte("date", today),
 supabase
 .from("audit_log")
 .select("id, user_id, new_data, created_at")
 .eq("org_id", orgId)
 .eq("action","entry_created")
 .eq("target_type","collateral")
 .order("created_at", { ascending: false }),
 ]);

 // Build hours per user+date
 const hoursMap = new Map<string, Set<number>>();
 for (const e of entries ?? []) {
 const key =`${e.user_id}|${e.date}`;
 if (!hoursMap.has(key)) hoursMap.set(key, new Set());
 hoursMap.get(key)!.add(e.hour);
 }

 // Build commitment lookup by user+dateOff
 const commitmentMap = new Map<
 string,
 { id: string; hoursPromised: number; createdAt: string }
 >();
 for (const log of commitmentLogs ?? []) {
 const nd = log.new_data as {
 date_off: string;
 hours_promised: number;
 };
 if (nd?.date_off) {
 const key =`${log.user_id}|${nd.date_off}`;
 commitmentMap.set(key, {
 id: log.id,
 hoursPromised: nd.hours_promised ?? 8,
 createdAt: log.created_at,
 });
 }
 }

 // 3. Detect short days (< 6 hours) in last 7 business days
 const recentDays = getBusinessDaysBack(today, 7);
 // Don't include today itself — it's still in progress
 const analyzeDays = recentDays.filter((d) => d !== today);

 const detectedShortDays: ShortDay[] = [];

 for (const day of analyzeDays) {
 for (const uid of userIds) {
 const key =`${uid}|${day}`;
 const hours = hoursMap.get(key)?.size ?? 0;

 if (hours < 6) {
 const nextBD = getNextBusinessDay(day);
 const nextKey =`${uid}|${nextBD}`;
 const nextHours = hoursMap.get(nextKey)?.size ?? 0;
 const compensated = nextHours >= 8;
 const deadline = getEndOfBusinessDay(nextBD);
 const deadlinePassed = isAfter(new Date(), deadline);
 const commitKey =`${uid}|${day}`;
 const hasCommitment = commitmentMap.has(commitKey);

 detectedShortDays.push({
 userId: uid,
 profile: profileMap.get(uid) ?? null,
 date: day,
 hoursLogged: hours,
 nextBusinessDay: nextBD,
 nextDayHours: nextHours,
 compensated,
 deadlinePassed,
 hasCommitment,
 });
 }
 }
 }

 // Sort: uncompensated first, then by date desc
 detectedShortDays.sort((a, b) => {
 if (a.compensated !== b.compensated) return a.compensated ? 1 : -1;
 return b.date.localeCompare(a.date);
 });

 setShortDays(detectedShortDays);

 // 4. Build commitment history from audit_log
 const allCommitments: CollateralCommitment[] = [];
 for (const log of commitmentLogs ?? []) {
 const nd = log.new_data as {
 date_off: string;
 hours_promised: number;
 };
 if (!nd?.date_off) continue;

 const nextBD = getNextBusinessDay(nd.date_off);
 const nextKey =`${log.user_id}|${nextBD}`;
 const nextHours = hoursMap.get(nextKey)?.size ?? 0;
 const compensated = nextHours >= nd.hours_promised;
 const deadline = getEndOfBusinessDay(nextBD);
 const deadlinePassed = isAfter(new Date(), deadline);

 allCommitments.push({
 id: log.id,
 userId: log.user_id,
 profile: profileMap.get(log.user_id) ?? null,
 dateOff: nd.date_off,
 hoursPromised: nd.hours_promised,
 createdAt: log.created_at,
 compensated,
 actualHoursNext: nextHours,
 deadlinePassed,
 });
 }

 setCommitments(allCommitments);

 // 5. Compute member stats from all short days in the 14-day window
 const allDaysToAnalyze = lookbackDays.filter((d) => d !== today);
 const statsMap = new Map<
 string,
 { shortDays: number; compensated: number; executed: number }
 >();

 for (const uid of userIds) {
 statsMap.set(uid, { shortDays: 0, compensated: 0, executed: 0 });
 }

 for (const day of allDaysToAnalyze) {
 for (const uid of userIds) {
 const key =`${uid}|${day}`;
 const hours = hoursMap.get(key)?.size ?? 0;

 if (hours < 6) {
 const s = statsMap.get(uid)!;
 s.shortDays++;

 const nextBD = getNextBusinessDay(day);
 const nextKey =`${uid}|${nextBD}`;
 const nextHours = hoursMap.get(nextKey)?.size ?? 0;
 const deadline = getEndOfBusinessDay(nextBD);
 const deadlinePassed = isAfter(new Date(), deadline);

 if (nextHours >= 8) {
 s.compensated++;
 } else if (deadlinePassed) {
 s.executed++;
 }
 }
 }
 }

 const computedStats: MemberStats[] = [];
 for (const uid of userIds) {
 const s = statsMap.get(uid)!;
 computedStats.push({
 userId: uid,
 profile: profileMap.get(uid) ?? null,
 shortDays: s.shortDays,
 compensated: s.compensated,
 executed: s.executed,
 complianceRate:
 s.shortDays > 0
 ? Math.round((s.compensated / s.shortDays) * 100)
 : 100,
 });
 }

 // Sort by worst compliance
 computedStats.sort((a, b) => a.complianceRate - b.complianceRate);
 setMemberStats(computedStats);

 // 6. Aggregate stats
 const totalSD = detectedShortDays.length;
 const totalCompensated = detectedShortDays.filter(
 (d) => d.compensated
 ).length;
 const totalDeadlinePassed = detectedShortDays.filter(
 (d) => d.deadlinePassed && !d.compensated
 ).length;

 setTotalShortDays(totalSD);
 setCompensationRate(
 totalSD > 0 ? Math.round((totalCompensated / totalSD) * 100) : 100
 );

 // Biggest debtor: most uncompensated short days
 let worstName ="";
 let worstCount = 0;
 for (const s of computedStats) {
 if (s.executed > worstCount) {
 worstCount = s.executed;
 worstName = s.profile?.full_name ??"Desconocido";
 }
 }
 setBiggestDebtor(
 worstCount > 0 ? { name: worstName, count: worstCount } : null
 );

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

 // Tick countdown every minute
 const [, setTick] = useState(0);
 useEffect(() => {
 const timer = setInterval(() => setTick((t) => t + 1), 60_000);
 return () => clearInterval(timer);
 }, []);

 // Derived: pending collateral (uncompensated + deadline NOT passed)
 const pendingShortDays = useMemo(
 () => shortDays.filter((d) => !d.compensated && !d.deadlinePassed),
 [shortDays]
 );

 // Derived: executed collateral (uncompensated + deadline passed)
 const executedShortDays = useMemo(
 () => shortDays.filter((d) => !d.compensated && d.deadlinePassed),
 [shortDays]
 );

 // Derived: compensated short days
 const compensatedShortDays = useMemo(
 () => shortDays.filter((d) => d.compensated),
 [shortDays]
 );

 async function submitCollateral(e: React.FormEvent) {
 e.preventDefault();
 if (!orgId || !userId) return;
 setSubmitting(true);

 await supabase.from("audit_log").insert({
 org_id: orgId,
 user_id: userId,
 action:"entry_created",
 target_type:"collateral",
 new_data: {
 date_off: today,
 hours_promised: Math.min(12, Math.max(6, hoursPromised)),
 },
 });

 setShowForm(false);
 setHoursPromised(8);
 await loadData();
 setSubmitting(false);
 }

 // Loading state
 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </p>
 </div>
 );
 }

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <div className="flex items-center gap-2 mb-1">
 <Handshake className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Colateral
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground">
 Si sales temprano, dejas colateral. Si no cumples, se ejecuta
 automáticamente.
 </p>
 </div>

 {/* Team stats */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Resumen semanal
 </p>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="bg-accent/30 border border-border p-4">
 <p className="font-mono tabular-nums tracking-tight text-3xl font-black">
 {totalShortDays}
 </p>
 <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider mt-1">
 Días cortos
 </p>
 </div>
 <div
 className={cn(
"border p-4",
 compensationRate >= 70
 ?"bg-green-500/5 border-green-500/20": compensationRate >= 40
 ?"bg-amber-500/5 border-amber-500/20":"bg-red-500/5 border-red-500/20")}
 >
 <p
 className={cn(
"font-mono tabular-nums tracking-tight text-3xl font-black",
 compensationRate >= 70
 ?"text-green-600": compensationRate >= 40
 ?"text-amber-500":"text-red-500")}
 >
 {compensationRate}%
 </p>
 <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider mt-1">
 Tasa compensación
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-4">
 <p className="font-mono tabular-nums tracking-tight text-3xl font-black text-red-500">
 {executedShortDays.length}
 </p>
 <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider mt-1">
 Colaterales ejecutados
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-4">
 {biggestDebtor ? (
 <>
 <p className="font-mono text-sm font-black text-red-500 truncate">
 {biggestDebtor.name}
 </p>
 <p className="font-mono tabular-nums text-lg font-black text-red-500">
 {biggestDebtor.count} sin compensar
 </p>
 </>
 ) : (
 <>
 <p className="font-mono text-sm font-bold text-green-600">
 Nadie
 </p>
 <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider mt-1">
 Sin deudores
 </p>
 </>
 )}
 <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider mt-1">
 Mayor deuda
 </p>
 </div>
 </div>
 </div>

 {/* Register collateral form */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Registrar colateral
 </p>

 {!showForm ? (
 <button
 onClick={() => setShowForm(true)}
 className="w-full border border-dashed border-border hover:border-primary/30 p-6 transition-colors duration-200 text-center cursor-pointer group">
 <div className="flex items-center justify-center gap-3">
 <div className="w-8 h-8 border border-border group-hover:border-primary/30 flex items-center justify-center transition-colors">
 <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors"/>
 </div>
 <div className="text-left">
 <p className="font-mono text-xs font-bold uppercase tracking-wider">
 Voy a salir temprano / tomar tiempo libre
 </p>
 <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
 Registra tu compromiso de compensación antes de irte
 </p>
 </div>
 </div>
 </button>
 ) : (
 <div className="border border-primary/20 bg-primary/5 p-6">
 <div className="flex items-center gap-2 mb-4">
 <Handshake className="w-4 h-4 text-primary"/>
 <p className="font-mono text-xs font-bold uppercase tracking-wider">
 Compromiso de colateral
 </p>
 </div>
 <form onSubmit={submitCollateral} className="space-y-4">
 <div>
 <p className="font-mono text-[10px] text-muted-foreground mb-2">
 Estás declarando que hoy ({format(new Date(today +"T12:00:00"),"EEEE d 'de' MMMM", { locale: es })}) saldrás temprano o tomarás tiempo libre.
 </p>
 <p className="font-mono text-[10px] text-muted-foreground">
 Te comprometes a compensar mañana registrando al menos las horas prometidas con evidencia.
 </p>
 </div>
 <div>
 <Label
 htmlFor="hours-promised"className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Horas prometidas para mañana
 </Label>
 <Input
 id="hours-promised"type="number"min={6}
 max={12}
 value={hoursPromised}
 onChange={(e) => setHoursPromised(Number(e.target.value))}
 className="w-32 mt-1 font-mono tabular-nums"/>
 </div>
 <div className="border border-amber-500/30 bg-amber-500/5 p-3">
 <div className="flex items-start gap-2">
 <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5"/>
 <p className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
 Si no registras {hoursPromised} horas mañana antes de las 6:00 PM, el colateral se ejecutará automáticamente y quedará registrado en tu historial.
 </p>
 </div>
 </div>
 <div className="flex gap-2 justify-end">
 <Button
 type="button"variant="ghost"className="font-mono text-xs"onClick={() => setShowForm(false)}
 >
 Cancelar
 </Button>
 <Button
 type="submit"disabled={submitting}
 className="font-mono text-xs bg-primary gap-2">
 {submitting ? (
 <Loader2 className="w-3.5 h-3.5 animate-spin"/>
 ) : (
 <Handshake className="w-3.5 h-3.5"/>
 )}
 {submitting
 ?"Registrando...":"Dejar colateral"}
 </Button>
 </div>
 </form>
 </div>
 )}
 </div>

 {/* Pending collateral - needs compensation */}
 {pendingShortDays.length > 0 && (
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Colateral pendiente
 </p>

 <div className="border border-amber-500/30 divide-y divide-amber-500/20">
 {pendingShortDays.map((sd) => {
 const deadline = getEndOfBusinessDay(sd.nextBusinessDay);
 const countdown = formatCountdown(deadline);

 return (
 <div
 key={`${sd.userId}-${sd.date}`}
 className="p-4 bg-amber-500/5">
 <div className="flex items-start gap-3">
 <Avatar className="w-8 h-8 ring-1 ring-border flex-shrink-0 mt-0.5">
 <AvatarImage
 src={sd.profile?.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[8px] font-mono">
 {getInitials(sd.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <p className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
 {sd.profile?.full_name ??"Desconocido"}
 </p>
 <div className="px-2 py-0.5 border border-amber-500/30 bg-amber-500/10">
 <p className="font-mono text-[9px] text-amber-600 dark:text-amber-400 uppercase tracking-wider font-bold">
 Pendiente
 </p>
 </div>
 </div>
 <p className="font-mono text-[10px] text-muted-foreground mt-1">
 Registró solo{""}
 <span className="font-bold text-red-500">
 {sd.hoursLogged}h
 </span>{""}
 el{""}
 {format(
 new Date(sd.date +"T12:00:00"),
"EEEE d 'de' MMMM",
 { locale: es }
 )}
 . Debe compensar.
 </p>
 <div className="flex items-center gap-4 mt-2">
 <div className="flex items-center gap-1.5">
 <ArrowRight className="w-3 h-3 text-muted-foreground"/>
 <p className="font-mono text-[10px] text-muted-foreground">
 Compensar el{""}
 {format(
 new Date(sd.nextBusinessDay +"T12:00:00"),
"EEEE d",
 { locale: es }
 )}
 </p>
 </div>
 <div className="flex items-center gap-1.5">
 <Clock className="w-3 h-3 text-amber-500"/>
 <p className="font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400 tabular-nums">
 {countdown}
 </p>
 </div>
 <div>
 <p className="font-mono text-[10px] text-muted-foreground">
 Progreso:{""}
 <span
 className={cn(
"font-bold tabular-nums",
 sd.nextDayHours >= 8
 ?"text-green-600":"text-muted-foreground")}
 >
 {sd.nextDayHours}h
 </span>{""}
 / 8h
 </p>
 </div>
 </div>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Executed collateral - deadline passed, not compensated */}
 {executedShortDays.length > 0 && (
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Colateral ejecutado
 </p>

 <div className="border border-red-500/30 divide-y divide-red-500/20">
 {executedShortDays.map((sd) => (
 <div
 key={`${sd.userId}-${sd.date}`}
 className="p-4 bg-red-500/5">
 <div className="flex items-start gap-3">
 <Avatar className="w-8 h-8 ring-1 ring-border flex-shrink-0 mt-0.5">
 <AvatarImage
 src={sd.profile?.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[8px] font-mono">
 {getInitials(sd.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <p className="font-mono text-xs font-bold text-red-500">
 {sd.profile?.full_name ??"Desconocido"}
 </p>
 <div className="px-2 py-0.5 border border-red-500/50 bg-red-500/20">
 <p className="font-mono text-[9px] text-red-500 uppercase tracking-wider font-black">
 Colateral ejecutado
 </p>
 </div>
 </div>
 <p className="font-mono text-[10px] text-muted-foreground mt-1">
 Registró solo{""}
 <span className="font-bold text-red-500">
 {sd.hoursLogged}h
 </span>{""}
 el{""}
 {format(
 new Date(sd.date +"T12:00:00"),
"EEEE d 'de' MMMM",
 { locale: es }
 )}
 . No compensó al día siguiente (
 <span className="font-bold text-red-500">
 {sd.nextDayHours}h
 </span>{""}
 registradas).
 </p>
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Compensated short days */}
 {compensatedShortDays.length > 0 && (
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Colateral cumplido
 </p>

 <div className="border border-green-500/20 divide-y divide-green-500/10">
 {compensatedShortDays.map((sd) => (
 <div
 key={`${sd.userId}-${sd.date}`}
 className="p-4 bg-green-500/5">
 <div className="flex items-start gap-3">
 <Avatar className="w-8 h-8 ring-1 ring-border flex-shrink-0 mt-0.5">
 <AvatarImage
 src={sd.profile?.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[8px] font-mono">
 {getInitials(sd.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <p className="font-mono text-xs font-bold text-green-600">
 {sd.profile?.full_name ??"Desconocido"}
 </p>
 <div className="px-2 py-0.5 border border-green-500/30 bg-green-500/10">
 <p className="font-mono text-[9px] text-green-600 uppercase tracking-wider font-bold">
 Cumplido
 </p>
 </div>
 </div>
 <p className="font-mono text-[10px] text-muted-foreground mt-1">
 Día corto el{""}
 {format(
 new Date(sd.date +"T12:00:00"),
"EEEE d",
 { locale: es }
 )}{""}
 ({sd.hoursLogged}h) — Compensó con{""}
 <span className="font-bold text-green-600">
 {sd.nextDayHours}h
 </span>{""}
 el{""}
 {format(
 new Date(sd.nextBusinessDay +"T12:00:00"),
"EEEE d",
 { locale: es }
 )}
 </p>
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Compliance per person */}
 {memberStats.some((s) => s.shortDays > 0) && (
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Cumplimiento por persona &mdash; Últimos 14 días
 </p>

 <div className="border border-border divide-y divide-border">
 {/* Header */}
 <div className="grid grid-cols-[1fr_70px_70px_70px_80px] gap-2 px-4 py-2 bg-accent/20">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Miembro
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground text-center">
 Días cortos
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground text-center">
 Compensados
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground text-center">
 Ejecutados
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground text-right">
 Cumplimiento
 </p>
 </div>

 {memberStats.map((ms) => {
 if (ms.shortDays === 0) return null;

 const isWorst =
 biggestDebtor &&
 ms.profile?.full_name === biggestDebtor.name;

 return (
 <div
 key={ms.userId}
 className={cn(
"grid grid-cols-[1fr_70px_70px_70px_80px] gap-2 px-4 py-3 items-center transition-colors duration-200",
 ms.complianceRate < 50 &&"bg-red-500/5",
 ms.complianceRate >= 80 &&"bg-green-500/5")}
 >
 {/* Name */}
 <div className="flex items-center gap-2 min-w-0">
 <Avatar className="w-6 h-6 ring-1 ring-border flex-shrink-0">
 <AvatarImage
 src={ms.profile?.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[8px] font-mono">
 {getInitials(ms.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex items-center gap-1.5 min-w-0">
 <p
 className={cn(
"font-mono text-xs truncate",
 ms.complianceRate < 50
 ?"text-red-500 font-bold":"",
 ms.complianceRate >= 80
 ?"text-green-600":"")}
 >
 {ms.profile?.full_name ??"Desconocido"}
 </p>
 {isWorst && (
 <Skull className="w-3 h-3 text-red-500 flex-shrink-0"/>
 )}
 {ms.userId === userId && (
 <span className="font-mono text-[8px] text-muted-foreground">
 (tú)
 </span>
 )}
 </div>
 </div>

 {/* Short days */}
 <div className="text-center">
 <p className="font-mono tabular-nums text-sm font-bold">
 {ms.shortDays}
 </p>
 </div>

 {/* Compensated */}
 <div className="text-center">
 <p className="font-mono tabular-nums text-sm font-bold text-green-600">
 {ms.compensated}
 </p>
 </div>

 {/* Executed */}
 <div className="text-center">
 <p
 className={cn(
"font-mono tabular-nums text-sm font-bold",
 ms.executed > 0 ?"text-red-500":"text-muted-foreground")}
 >
 {ms.executed}
 </p>
 </div>

 {/* Compliance rate */}
 <div className="text-right">
 <p
 className={cn(
"font-mono tabular-nums text-sm font-black",
 ms.complianceRate >= 80
 ?"text-green-600": ms.complianceRate >= 50
 ?"text-amber-500":"text-red-500")}
 >
 {ms.complianceRate}%
 </p>
 </div>
 </div>
 );
 })}

 {/* Members with no short days */}
 {memberStats.filter((s) => s.shortDays === 0).length > 0 && (
 <div className="px-4 py-3 bg-green-500/5">
 <div className="flex items-center gap-2">
 <CheckCircle2 className="w-3.5 h-3.5 text-green-600"/>
 <p className="font-mono text-[10px] text-green-600">
 {memberStats
 .filter((s) => s.shortDays === 0)
 .map((s) => s.profile?.full_name ??"Desconocido")
 .join(",")}{""}
 &mdash; Sin días cortos en los últimos 14 días
 </p>
 </div>
 </div>
 )}
 </div>

 {/* Worst compliance callout */}
 {memberStats.length > 0 && memberStats[0].complianceRate < 50 && memberStats[0].shortDays > 0 && (
 <div className="mt-3 border border-red-500/30 bg-red-500/5 p-4">
 <div className="flex items-center gap-2">
 <TrendingDown className="w-4 h-4 text-red-500"/>
 <p className="font-mono text-xs text-red-500 font-bold uppercase tracking-wider">
 Peor cumplimiento
 </p>
 </div>
 <p className="font-mono text-sm text-red-400 mt-1">
 <span className="font-bold text-red-500">
 {memberStats[0].profile?.full_name ??"Desconocido"}
 </span>{""}
 &mdash; {memberStats[0].complianceRate}% de cumplimiento (
 {memberStats[0].compensated}/{memberStats[0].shortDays} días
 compensados)
 </p>
 </div>
 )}
 </div>
 )}

 {/* Commitment history */}
 {commitments.length > 0 && (
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Historial de compromisos
 </p>

 <div className="border border-border divide-y divide-border">
 {commitments.map((c) => (
 <div key={c.id} className="p-4">
 <div className="flex items-start gap-3">
 <Avatar className="w-7 h-7 ring-1 ring-border flex-shrink-0 mt-0.5">
 <AvatarImage
 src={c.profile?.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[8px] font-mono">
 {getInitials(c.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <p className="font-mono text-xs font-bold">
 {c.profile?.full_name ??"Desconocido"}
 </p>
 {c.compensated ? (
 <div className="px-2 py-0.5 border border-green-500/30 bg-green-500/10">
 <p className="font-mono text-[8px] text-green-600 uppercase tracking-wider font-bold flex items-center gap-1">
 <CheckCircle2 className="w-2.5 h-2.5"/>
 Cumplido
 </p>
 </div>
 ) : c.deadlinePassed ? (
 <div className="px-2 py-0.5 border border-red-500/50 bg-red-500/20">
 <p className="font-mono text-[8px] text-red-500 uppercase tracking-wider font-black flex items-center gap-1">
 <XCircle className="w-2.5 h-2.5"/>
 Ejecutado
 </p>
 </div>
 ) : (
 <div className="px-2 py-0.5 border border-amber-500/30 bg-amber-500/10">
 <p className="font-mono text-[8px] text-amber-600 uppercase tracking-wider font-bold flex items-center gap-1">
 <Clock className="w-2.5 h-2.5"/>
 Pendiente
 </p>
 </div>
 )}
 <p className="font-mono text-[10px] text-muted-foreground">
 {format(
 new Date(c.createdAt),
"d MMM yyyy, HH:mm",
 { locale: es }
 )}
 </p>
 </div>
 <p className="font-mono text-[10px] text-muted-foreground mt-1">
 Prometió{""}
 <span className="font-bold">{c.hoursPromised}h</span>{""}
 para el día siguiente del{""}
 {format(
 new Date(c.dateOff +"T12:00:00"),
"d 'de' MMMM",
 { locale: es }
 )}
 .{""}
 {c.deadlinePassed && (
 <>
 Registró{""}
 <span
 className={cn(
"font-bold",
 c.compensated
 ?"text-green-600":"text-red-500")}
 >
 {c.actualHoursNext}h
 </span>
 .
 </>
 )}
 </p>
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Empty state */}
 {shortDays.length === 0 && commitments.length === 0 && (
 <div className="flex flex-col items-center justify-center py-16 gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Handshake className="w-7 h-7 text-primary/40"/>
 </div>
 <div className="text-center">
 <p className="font-mono text-xs text-muted-foreground">
 No hay colateral pendiente ni historial.
 </p>
 <p className="font-mono text-[10px] text-muted-foreground mt-1">
 Todos han cumplido sus horas esta semana.
 </p>
 </div>
 </div>
 )}

 {/* Footer */}
 <div className="text-center py-6 border-t border-border/50">
 <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest">
 Si sales temprano, dejas colateral. Sin excepciones.
 </p>
 </div>
 </div>
 );
}
