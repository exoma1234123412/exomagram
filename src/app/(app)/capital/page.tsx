"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
 ShieldMinus,
 ShieldAlert,
 ShieldX,
 Clock,
 FileX,
 MessageSquareOff,
 EyeOff,
 Users,
 AlertTriangle,
 TrendingDown,
 ChevronDown,
 ChevronUp,
} from "lucide-react";
import { startOfWeek, endOfWeek, format, eachDayOfInterval, isWeekend } from "date-fns";
import { es } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

interface Deduction {
 userId: string;
 name: string;
 reason: string;
 points: number;
 date: string;
 icon:"hours"|"closeout"|"standup"|"proof"|"late";
}

interface MemberCapital {
 userId: string;
 profile: Profile | null;
 capital: number;
 deductions: Deduction[];
 daysMissingHours: number;
 daysMissingCloseout: number;
 daysMissingStandup: number;
 entriesWithoutProof: number;
 lateEntries: number;
}

/* ------------------------------------------------------------------ */
/* Constants */
/* ------------------------------------------------------------------ */

const STARTING_CAPITAL = 1000;
const PENALTY_LOW_HOURS = 50;
const PENALTY_NO_CLOSEOUT = 40;
const PENALTY_NO_STANDUP = 30;
const PENALTY_NO_PROOF = 10;
const PENALTY_LATE_ENTRY = 20;
const MIN_DAILY_HOURS = 6;

/* ------------------------------------------------------------------ */
/* Page */
/* ------------------------------------------------------------------ */

export default function CapitalPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [members, setMembers] = useState<MemberCapital[]>([]);
 const [deductionLog, setDeductionLog] = useState<Deduction[]>([]);
 const [loading, setLoading] = useState(true);
 const [logExpanded, setLogExpanded] = useState(false);
 const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

 const today = getTodayMTY();
 const todayDate = new Date(today +"T12:00:00");
 const weekStart = startOfWeek(todayDate, { weekStartsOn: 1 });
 const weekEnd = endOfWeek(todayDate, { weekStartsOn: 1 });
 const weekStartStr = format(weekStart,"yyyy-MM-dd");
 const weekEndStr = format(weekEnd,"yyyy-MM-dd");

 // All workdays from Monday to today (skip weekends)
 const workdays = eachDayOfInterval({ start: weekStart, end: todayDate })
 .filter((d) => !isWeekend(d))
 .map((d) => format(d,"yyyy-MM-dd"));

 const weekLabel =`${format(weekStart,"d MMM", { locale: es })} - ${format(weekEnd,"d MMM", { locale: es })}`;

 /* ---------- data loader ---------- */

 const loadData = useCallback(async () => {
 if (!orgId) return;

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

 // 2. This week's time entries
 const { data: entries } = await supabase
 .from("time_entries")
 .select("user_id, date, hour, proof_urls, is_late")
 .eq("org_id", orgId)
 .gte("date", weekStartStr)
 .lte("date", weekEndStr);

 // 3. This week's closeouts
 const { data: closeouts } = await supabase
 .from("daily_closeouts")
 .select("user_id, date")
 .eq("org_id", orgId)
 .gte("date", weekStartStr)
 .lte("date", weekEndStr);

 // 4. This week's standups
 const { data: standups } = await supabase
 .from("standups")
 .select("user_id, date")
 .eq("org_id", orgId)
 .gte("date", weekStartStr)
 .lte("date", weekEndStr);

 // Build lookup structures
 // entries per user per day
 const entryMap = new Map<string, Map<string, { count: number; withoutProof: number; lateCount: number }>>();
 for (const e of entries ?? []) {
 const uid = e.user_id as string;
 const date = e.date as string;
 if (!entryMap.has(uid)) entryMap.set(uid, new Map());
 const dayMap = entryMap.get(uid)!;
 const cur = dayMap.get(date) ?? { count: 0, withoutProof: 0, lateCount: 0 };
 cur.count++;
 const proofUrls = e.proof_urls as string[] | null;
 if (!proofUrls || proofUrls.length === 0) cur.withoutProof++;
 if (e.is_late) cur.lateCount++;
 dayMap.set(date, cur);
 }

 // closeout set: user_id -> set of dates
 const closeoutMap = new Map<string, Set<string>>();
 for (const c of closeouts ?? []) {
 const uid = c.user_id as string;
 if (!closeoutMap.has(uid)) closeoutMap.set(uid, new Set());
 closeoutMap.get(uid)!.add(c.date as string);
 }

 // standup set: user_id -> set of dates
 const standupMap = new Map<string, Set<string>>();
 for (const s of standups ?? []) {
 const uid = s.user_id as string;
 if (!standupMap.has(uid)) standupMap.set(uid, new Set());
 standupMap.get(uid)!.add(s.date as string);
 }

 // Calculate capital for each member
 const allDeductions: Deduction[] = [];
 const result: MemberCapital[] = userIds.map((uid) => {
 const profile = profileMap.get(uid) ?? null;
 const name = profile?.full_name ??"Sin nombre";
 const userEntries = entryMap.get(uid) ?? new Map();
 const userCloseouts = closeoutMap.get(uid) ?? new Set();
 const userStandups = standupMap.get(uid) ?? new Set();

 let capital = STARTING_CAPITAL;
 const memberDeductions: Deduction[] = [];
 let daysMissingHours = 0;
 let daysMissingCloseout = 0;
 let daysMissingStandup = 0;
 let entriesWithoutProof = 0;
 let lateEntries = 0;

 for (const day of workdays) {
 const dayData = userEntries.get(day);
 const hoursLogged = dayData?.count ?? 0;

 // Penalty: less than 6 hours
 if (hoursLogged < MIN_DAILY_HOURS) {
 capital -= PENALTY_LOW_HOURS;
 daysMissingHours++;
 memberDeductions.push({
 userId: uid,
 name,
 reason:`<${MIN_DAILY_HOURS}h registradas (${hoursLogged}h)`,
 points: PENALTY_LOW_HOURS,
 date: day,
 icon:"hours",
 });
 }

 // Penalty: no closeout
 if (!userCloseouts.has(day)) {
 capital -= PENALTY_NO_CLOSEOUT;
 daysMissingCloseout++;
 memberDeductions.push({
 userId: uid,
 name,
 reason:"Sin cierre del dia",
 points: PENALTY_NO_CLOSEOUT,
 date: day,
 icon:"closeout",
 });
 }

 // Penalty: no standup
 if (!userStandups.has(day)) {
 capital -= PENALTY_NO_STANDUP;
 daysMissingStandup++;
 memberDeductions.push({
 userId: uid,
 name,
 reason:"Sin standup",
 points: PENALTY_NO_STANDUP,
 date: day,
 icon:"standup",
 });
 }

 // Penalty: entries without proof
 if (dayData) {
 for (let i = 0; i < dayData.withoutProof; i++) {
 capital -= PENALTY_NO_PROOF;
 entriesWithoutProof++;
 memberDeductions.push({
 userId: uid,
 name,
 reason:"Entrada sin evidencia",
 points: PENALTY_NO_PROOF,
 date: day,
 icon:"proof",
 });
 }
 // Penalty: late entries
 for (let i = 0; i < dayData.lateCount; i++) {
 capital -= PENALTY_LATE_ENTRY;
 lateEntries++;
 memberDeductions.push({
 userId: uid,
 name,
 reason:"Entrada tardia",
 points: PENALTY_LATE_ENTRY,
 date: day,
 icon:"late",
 });
 }
 }
 }

 allDeductions.push(...memberDeductions);

 return {
 userId: uid,
 profile,
 capital: Math.max(0, capital),
 deductions: memberDeductions,
 daysMissingHours,
 daysMissingCloseout,
 daysMissingStandup,
 entriesWithoutProof,
 lateEntries,
 };
 });

 // Sort: lowest capital first (most shame)
 result.sort((a, b) => a.capital - b.capital);

 // Sort deduction log: most recent first, then by points
 allDeductions.sort((a, b) => {
 if (a.date !== b.date) return b.date.localeCompare(a.date);
 return b.points - a.points;
 });

 setMembers(result);
 setDeductionLog(allDeductions);
 setLoading(false);
 }, [orgId, workdays.length]); // eslint-disable-line react-hooks/exhaustive-deps

 /* ---------- initial load + 30s refresh ---------- */

 useEffect(() => {
 if (orgLoading || !orgId) {
 if (!orgLoading) setLoading(false);
 return;
 }

 loadData();

 intervalRef.current = setInterval(loadData, 30_000);
 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [orgLoading, orgId, loadData]);

 /* ---------- real-time subscription ---------- */

 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("capital-live")
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
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"daily_closeouts",
 filter:`org_id=eq.${orgId}`,
 },
 () => loadData()
 )
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"standups",
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

 const teamAvg =
 members.length > 0
 ? Math.round(members.reduce((s, m) => s + m.capital, 0) / members.length)
 : 0;
 const worst = members.length > 0 ? members[0] : null;
 const totalDeductions = deductionLog.reduce((s, d) => s + d.points, 0);
 const visibleDeductions = logExpanded ? deductionLog : deductionLog.slice(0, 15);

 /* ---------- helpers ---------- */

 function getCapitalColor(capital: number) {
 if (capital >= 800) return"text-green-600 dark:text-green-400";
 if (capital >= 500) return"text-amber-500";
 if (capital >= 300) return"text-orange-500";
 return"text-red-500";
 }

 function getBarColor(capital: number) {
 if (capital >= 800) return"bg-green-500";
 if (capital >= 500) return"bg-amber-500";
 if (capital >= 300) return"bg-orange-500";
 return"bg-red-500";
 }

 function getBarBg(capital: number) {
 if (capital >= 800) return"bg-green-500/10";
 if (capital >= 500) return"bg-amber-500/10";
 if (capital >= 300) return"bg-orange-500/10";
 return"bg-red-500/10";
 }

 function getDeductionIcon(icon: Deduction["icon"]) {
 switch (icon) {
 case"hours":
 return <Clock className="w-3 h-3"/>;
 case"closeout":
 return <FileX className="w-3 h-3"/>;
 case"standup":
 return <MessageSquareOff className="w-3 h-3"/>;
 case"proof":
 return <EyeOff className="w-3 h-3"/>;
 case"late":
 return <Clock className="w-3 h-3"/>;
 }
 }

 /* ---------- render ---------- */

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-2.5 mb-1">
 <ShieldMinus className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Trust Capital
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground mb-8">
 Semana {weekLabel} &mdash; 1000 pts iniciales. Solo se pierden. Se reinicia el lunes.
 </p>

 {/* Team stats strip */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Capital promedio
 </p>
 <p className={cn("text-2xl font-mono font-bold tabular-nums tracking-tight mt-1", getCapitalColor(teamAvg))}>
 {teamAvg}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Deducciones totales
 </p>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-red-500">
 -{totalDeductions}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Dias evaluados
 </p>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
 {workdays.length}
 </p>
 </div>
 <div className="bg-red-500/10 border border-red-500/30 p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/60">
 Mayor perdida
 </p>
 <p className="text-sm font-mono font-bold tracking-tight mt-1 text-red-500 truncate">
 {worst?.profile?.full_name ??"---"}
 </p>
 </div>
 </div>

 {/* Section label */}
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Capital restante &mdash; menor primero
 </p>

 {/* Member cards */}
 {members.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <ShieldMinus className="w-7 h-7 text-muted-foreground"/>
 </div>
 <p className="text-sm text-muted-foreground font-mono">
 No hay miembros en la organizacion.
 </p>
 </div>
 ) : (
 <div className="space-y-2 mb-8">
 {members.map((m, idx) => {
 const isWorst = idx === 0 && members.length > 1;
 const isMe = m.userId === userId;
 const atRisk = m.capital < 500;
 const inRedZone = m.capital < 300;
 const pct = Math.round((m.capital / STARTING_CAPITAL) * 100);
 const totalLost = STARTING_CAPITAL - m.capital;

 // Border styling
 const borderClass = cn(
"border transition-colors",
 isWorst &&"border-2 border-red-500/60 bg-red-500/5",
 !isWorst && inRedZone &&"border-2 border-red-500/40",
 !isWorst && atRisk && !inRedZone &&"border-2 border-amber-500/40",
 !isWorst && !atRisk &&"border border-border");

 return (
 <div key={m.userId} className={cn(borderClass,"p-4 sm:p-5")}>
 {/* Worst label */}
 {isWorst && (
 <div className="flex items-center gap-1.5 mb-3">
 <AlertTriangle className="w-3.5 h-3.5 text-red-500"/>
 <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-red-500">
 MAYOR PERDIDA: {m.profile?.full_name ??"Sin nombre"}
 </span>
 </div>
 )}

 {/* Top row: avatar + name + capital */}
 <div className="flex items-start gap-3">
 <Avatar
 className={cn(
"ring-1 ring-border shrink-0 w-10 h-10",
 isWorst &&"ring-red-500/40",
 inRedZone && !isWorst &&"ring-red-500/30")}
 >
 <AvatarImage src={m.profile?.avatar_url ?? undefined} />
 <AvatarFallback
 className={cn(
"font-mono text-xs",
 (isWorst || inRedZone) &&"bg-red-500/20 text-red-500")}
 >
 {getInitials(m.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>

 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <p
 className={cn(
"font-mono font-bold tracking-tight",
 isWorst &&"text-lg text-red-500",
 !isWorst && inRedZone &&"text-base text-red-400",
 !isWorst && atRisk && !inRedZone &&"text-base text-amber-500",
 !atRisk && !isWorst &&"text-sm text-foreground")}
 >
 {m.profile?.full_name ??"Sin nombre"}
 </p>
 {isMe && (
 <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
 (tu)
 </span>
 )}
 {inRedZone && (
 <span className="font-mono text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 border border-red-500/40 bg-red-500/10 text-red-500 animate-pulse">
 ZONA ROJA
 </span>
 )}
 {atRisk && !inRedZone && (
 <span className="font-mono text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 border border-amber-500/40 bg-amber-500/10 text-amber-500">
 EN RIESGO
 </span>
 )}
 </div>

 {/* Deduction breakdown badges */}
 <div className="flex flex-wrap items-center gap-2 mt-1.5">
 {m.daysMissingHours > 0 && (
 <span className="flex items-center gap-1 text-[10px] font-mono text-red-400/80">
 <Clock className="w-3 h-3"/>
 {m.daysMissingHours}d &lt;{MIN_DAILY_HOURS}h (-{m.daysMissingHours * PENALTY_LOW_HOURS})
 </span>
 )}
 {m.daysMissingCloseout > 0 && (
 <span className="flex items-center gap-1 text-[10px] font-mono text-red-400/80">
 <FileX className="w-3 h-3"/>
 {m.daysMissingCloseout}d sin cierre (-{m.daysMissingCloseout * PENALTY_NO_CLOSEOUT})
 </span>
 )}
 {m.daysMissingStandup > 0 && (
 <span className="flex items-center gap-1 text-[10px] font-mono text-red-400/80">
 <MessageSquareOff className="w-3 h-3"/>
 {m.daysMissingStandup}d sin standup (-{m.daysMissingStandup * PENALTY_NO_STANDUP})
 </span>
 )}
 {m.entriesWithoutProof > 0 && (
 <span className="flex items-center gap-1 text-[10px] font-mono text-amber-500/80">
 <EyeOff className="w-3 h-3"/>
 {m.entriesWithoutProof} sin prueba (-{m.entriesWithoutProof * PENALTY_NO_PROOF})
 </span>
 )}
 {m.lateEntries > 0 && (
 <span className="flex items-center gap-1 text-[10px] font-mono text-amber-500/80">
 <Clock className="w-3 h-3"/>
 {m.lateEntries} tardias (-{m.lateEntries * PENALTY_LATE_ENTRY})
 </span>
 )}
 </div>
 </div>

 {/* Right side: capital number */}
 <div className="text-right shrink-0">
 <p
 className={cn(
"font-mono font-black tabular-nums tracking-tight",
 isWorst &&"text-3xl text-red-500",
 !isWorst && inRedZone &&"text-2xl text-red-400",
 !isWorst && atRisk && !inRedZone &&"text-2xl text-amber-500",
 !atRisk && !isWorst && m.capital >= 800 &&"text-xl text-green-600 dark:text-green-400",
 !atRisk && !isWorst && m.capital < 800 &&"text-xl text-foreground")}
 >
 {m.capital}
 </p>
 <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
 / {STARTING_CAPITAL}
 </p>
 {totalLost > 0 && (
 <p className="font-mono text-[10px] tabular-nums text-red-400 mt-0.5">
 -{totalLost}
 </p>
 )}
 </div>
 </div>

 {/* Capital bar */}
 <div className="mt-3">
 <div className={cn("h-2 w-full", getBarBg(m.capital))}>
 <div
 className={cn("h-full transition-all duration-500", getBarColor(m.capital))}
 style={{ width:`${pct}%`}}
 />
 </div>
 <div className="flex justify-between mt-1">
 <span className="font-mono text-[8px] text-muted-foreground tabular-nums">
 0
 </span>
 <span className="font-mono text-[8px] text-muted-foreground tabular-nums">
 {pct}%
 </span>
 <span className="font-mono text-[8px] text-muted-foreground tabular-nums">
 {STARTING_CAPITAL}
 </span>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 )}

 {/* Deduction Log */}
 {deductionLog.length > 0 && (
 <>
 <div className="flex items-center justify-between mb-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Registro de deducciones ({deductionLog.length})
 </p>
 <button
 onClick={() => setLogExpanded(!logExpanded)}
 className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-muted-foreground transition-colors cursor-pointer">
 {logExpanded ?"Colapsar":"Expandir"}
 {logExpanded ? (
 <ChevronUp className="w-3 h-3"/>
 ) : (
 <ChevronDown className="w-3 h-3"/>
 )}
 </button>
 </div>

 <div className="border border-border divide-y divide-border/50">
 {visibleDeductions.map((d, i) => (
 <div
 key={`${d.userId}-${d.date}-${d.reason}-${i}`}
 className="flex items-center gap-3 px-3 py-2 hover:bg-accent/20 transition-colors">
 <span className="text-red-400/70 shrink-0">
 {getDeductionIcon(d.icon)}
 </span>
 <span className="font-mono text-[10px] font-bold text-foreground truncate min-w-0">
 {d.name}
 </span>
 <span className="font-mono text-[10px] text-muted-foreground truncate flex-1 min-w-0">
 {d.reason}
 </span>
 <span className="font-mono text-[9px] text-muted-foreground shrink-0">
 {format(new Date(d.date +"T12:00:00"),"EEE d", { locale: es })}
 </span>
 <span className="font-mono text-[11px] font-bold tabular-nums text-red-500 shrink-0">
 -{d.points}
 </span>
 </div>
 ))}
 </div>

 {deductionLog.length > 15 && !logExpanded && (
 <button
 onClick={() => setLogExpanded(true)}
 className="w-full mt-1 py-2 text-center font-mono text-[10px] text-muted-foreground hover:text-muted-foreground transition-colors border border-border/50 cursor-pointer">
 Ver {deductionLog.length - 15} deducciones mas
 </button>
 )}
 </>
 )}

 {/* Penalty reference */}
 <div className="mt-8 border border-border/50 p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Tabla de penalizaciones
 </p>
 <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
 {[
 { label:`<${MIN_DAILY_HOURS}h/dia`, pts: PENALTY_LOW_HOURS },
 { label:"Sin cierre", pts: PENALTY_NO_CLOSEOUT },
 { label:"Sin standup", pts: PENALTY_NO_STANDUP },
 { label:"Sin prueba", pts: PENALTY_NO_PROOF },
 { label:"Entrada tardia", pts: PENALTY_LATE_ENTRY },
 ].map((p) => (
 <div key={p.label} className="flex items-center justify-between bg-accent/20 px-2 py-1.5">
 <span className="font-mono text-[9px] text-muted-foreground">{p.label}</span>
 <span className="font-mono text-[10px] font-bold tabular-nums text-red-500">-{p.pts}</span>
 </div>
 ))}
 </div>
 </div>

 {/* Bottom oppressive message */}
 <div className="mt-10 text-center py-6 border-t border-border/30">
 <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/25">
 El capital no se gana. Solo se pierde. Cuida lo que tienes.
 </p>
 </div>
 </div>
 );
}
