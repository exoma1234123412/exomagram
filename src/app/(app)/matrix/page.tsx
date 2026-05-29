"use client";

import { Fragment, useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { subDays, startOfWeek, differenceInMinutes, format } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart3, Check, X, Minus } from "lucide-react";
import type {
 Profile,
 TimeEntry,
 DailyCloseout,
 Standup,
 ActivityStreak,
 AccountabilityFlag,
 TrustScoreHistory,
 CommunicationLog,
} from "@/lib/types/database";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface MemberData {
 profile: Profile;
 userId: string;
 // Raw data
 entriesToday: TimeEntry[];
 entriesWeek: TimeEntry[];
 entries30d: TimeEntry[];
 closeoutsToday: DailyCloseout[];
 closeouts30d: DailyCloseout[];
 standupsToday: Standup[];
 standups30d: Standup[];
 streak: ActivityStreak | null;
 flags30d: AccountabilityFlag[];
 trustLatest: TrustScoreHistory | null;
 commLogs30d: CommunicationLog[];
}

type CellType ="number"|"percent"|"boolean"|"time"|"text"|"grade";

interface MetricDef {
 key: string;
 label: string;
 section: string;
 type: CellType;
 getValue: (d: MemberData) => number | string | boolean | null;
 higherIsBetter: boolean; // true = green for highest, false = green for lowest
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function countWithProof(entries: TimeEntry[]): number {
 return entries.filter(
 (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
 ).length;
}

function proofRate(entries: TimeEntry[]): number {
 if (entries.length === 0) return 0;
 return Math.round((countWithProof(entries) / entries.length) * 100);
}

function lateRate(entries: TimeEntry[]): number {
 if (entries.length === 0) return 0;
 return Math.round(
 (entries.filter((e) => e.is_late).length / entries.length) * 100
 );
}

function avgDescriptionWords(entries: TimeEntry[]): number {
 if (entries.length === 0) return 0;
 const total = entries.reduce((sum, e) => {
 const text = (e.description ??"").trim();
 return sum + (text ? text.split(/\s+/).length : 0);
 }, 0);
 return Math.round(total / entries.length);
}

function uniqueDaysWithZero(
 entries: TimeEntry[],
 startDate: string,
 endDate: string
): number {
 const daysWithEntries = new Set(entries.map((e) => e.date));
 let count = 0;
 const start = new Date(startDate +"T12:00:00");
 const end = new Date(endDate +"T12:00:00");
 for (
 let d = new Date(start);
 d <= end;
 d.setDate(d.getDate() + 1)
 ) {
 const day = d.getDay();
 if (day === 0 || day === 6) continue; // skip weekends
 const ds = d.toISOString().split("T")[0];
 if (!daysWithEntries.has(ds)) count++;
 }
 return count;
}

function qualityGrade(entries: TimeEntry[]): string {
 if (entries.length === 0) return"-";
 const totalScore = entries.reduce((sum, e) => {
 let s = 0;
 // proof
 if (e.proof_urls && (e.proof_urls as string[]).length > 0) s += 2;
 // description length
 const words = (e.description ??"").trim().split(/\s+/).length;
 if (words >= 15) s += 2;
 else if (words >= 5) s += 1;
 // not late
 if (!e.is_late) s += 1;
 return sum + s;
 }, 0);
 const avg = totalScore / entries.length;
 if (avg >= 4.5) return"A+";
 if (avg >= 4) return"A";
 if (avg >= 3) return"B";
 if (avg >= 2) return"C";
 if (avg >= 1) return"D";
 return"F";
}

function gradeToNumber(g: string): number {
 const map: Record<string, number> = {
"A+": 6,
 A: 5,
 B: 4,
 C: 3,
 D: 2,
 F: 1,
"-": 0,
 };
 return map[g] ?? 0;
}

function formatTime(hour: number): string {
 const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
 const suffix = hour >= 12 ?"PM":"AM";
 return`${h}:00 ${suffix}`;
}

function weekdaysInRange(startDate: string, endDate: string): number {
 let count = 0;
 const start = new Date(startDate +"T12:00:00");
 const end = new Date(endDate +"T12:00:00");
 for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
 const day = d.getDay();
 if (day !== 0 && day !== 6) count++;
 }
 return count;
}

// ═══════════════════════════════════════════════════════════
// METRIC DEFINITIONS
// ═══════════════════════════════════════════════════════════

function buildMetrics(today: string, weekStart: string, thirtyDaysAgo: string): MetricDef[] {
 return [
 // ── TODAY ──
 {
 key:"hours_today",
 label:"Horas registradas hoy",
 section:"HOY",
 type:"number",
 getValue: (d) => d.entriesToday.length,
 higherIsBetter: true,
 },
 {
 key:"entries_today",
 label:"Entradas hoy",
 section:"HOY",
 type:"number",
 getValue: (d) => d.entriesToday.length,
 higherIsBetter: true,
 },
 {
 key:"proof_entries_today",
 label:"Entradas con evidencia hoy",
 section:"HOY",
 type:"number",
 getValue: (d) => countWithProof(d.entriesToday),
 higherIsBetter: true,
 },
 {
 key:"proof_rate_today",
 label:"Tasa de evidencia hoy",
 section:"HOY",
 type:"percent",
 getValue: (d) => proofRate(d.entriesToday),
 higherIsBetter: true,
 },
 {
 key:"late_entries_today",
 label:"Entradas tardias hoy",
 section:"HOY",
 type:"number",
 getValue: (d) => d.entriesToday.filter((e) => e.is_late).length,
 higherIsBetter: false,
 },
 {
 key:"has_standup_today",
 label:"Standup hoy",
 section:"HOY",
 type:"boolean",
 getValue: (d) => d.standupsToday.length > 0,
 higherIsBetter: true,
 },
 {
 key:"has_closeout_today",
 label:"Cierre hoy",
 section:"HOY",
 type:"boolean",
 getValue: (d) => d.closeoutsToday.length > 0,
 higherIsBetter: true,
 },
 {
 key:"first_entry_time",
 label:"Primera entrada hoy",
 section:"HOY",
 type:"time",
 getValue: (d) => {
 if (d.entriesToday.length === 0) return null;
 const sorted = [...d.entriesToday].sort((a, b) => a.hour - b.hour);
 return sorted[0].hour;
 },
 higherIsBetter: false, // earlier is better
 },
 {
 key:"last_entry_time",
 label:"Ultima entrada hoy",
 section:"HOY",
 type:"time",
 getValue: (d) => {
 if (d.entriesToday.length === 0) return null;
 const sorted = [...d.entriesToday].sort((a, b) => b.hour - a.hour);
 return sorted[0].hour;
 },
 higherIsBetter: true, // later is better (more coverage)
 },
 {
 key:"hours_since_last",
 label:"Horas desde ultima entrada",
 section:"HOY",
 type:"number",
 getValue: (d) => {
 if (d.entriesToday.length === 0) return null;
 const sorted = [...d.entriesToday].sort(
 (a, b) =>
 new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
 );
 const last = new Date(sorted[0].logged_at);
 const now = new Date();
 return Math.round(differenceInMinutes(now, last) / 60 * 10) / 10;
 },
 higherIsBetter: false,
 },
 {
 key:"avg_desc_today",
 label:"Promedio palabras descripcion hoy",
 section:"HOY",
 type:"number",
 getValue: (d) => avgDescriptionWords(d.entriesToday),
 higherIsBetter: true,
 },

 // ── THIS WEEK ──
 {
 key:"hours_week",
 label:"Horas esta semana",
 section:"ESTA SEMANA",
 type:"number",
 getValue: (d) => d.entriesWeek.length,
 higherIsBetter: true,
 },
 {
 key:"daily_avg_week",
 label:"Promedio diario esta semana",
 section:"ESTA SEMANA",
 type:"number",
 getValue: (d) => {
 const days = weekdaysInRange(weekStart, today);
 return days > 0 ? Math.round((d.entriesWeek.length / days) * 10) / 10 : 0;
 },
 higherIsBetter: true,
 },
 {
 key:"proof_rate_week",
 label:"Tasa evidencia esta semana",
 section:"ESTA SEMANA",
 type:"percent",
 getValue: (d) => proofRate(d.entriesWeek),
 higherIsBetter: true,
 },
 {
 key:"late_rate_week",
 label:"Tasa tardias esta semana",
 section:"ESTA SEMANA",
 type:"percent",
 getValue: (d) => lateRate(d.entriesWeek),
 higherIsBetter: false,
 },
 {
 key:"zero_days_week",
 label:"Dias con 0 entradas esta semana",
 section:"ESTA SEMANA",
 type:"number",
 getValue: (d) => uniqueDaysWithZero(d.entriesWeek, weekStart, today),
 higherIsBetter: false,
 },
 {
 key:"quality_week",
 label:"Calificacion calidad esta semana",
 section:"ESTA SEMANA",
 type:"grade",
 getValue: (d) => qualityGrade(d.entriesWeek),
 higherIsBetter: true,
 },

 // ── LAST 30 DAYS ──
 {
 key:"hours_30d",
 label:"Horas totales (30d)",
 section:"ULTIMOS 30 DIAS",
 type:"number",
 getValue: (d) => d.entries30d.length,
 higherIsBetter: true,
 },
 {
 key:"daily_avg_30d",
 label:"Promedio diario (30d)",
 section:"ULTIMOS 30 DIAS",
 type:"number",
 getValue: (d) => {
 const days = weekdaysInRange(thirtyDaysAgo, today);
 return days > 0 ? Math.round((d.entries30d.length / days) * 10) / 10 : 0;
 },
 higherIsBetter: true,
 },
 {
 key:"proof_rate_30d",
 label:"Tasa evidencia (30d)",
 section:"ULTIMOS 30 DIAS",
 type:"percent",
 getValue: (d) => proofRate(d.entries30d),
 higherIsBetter: true,
 },
 {
 key:"late_rate_30d",
 label:"Tasa tardias (30d)",
 section:"ULTIMOS 30 DIAS",
 type:"percent",
 getValue: (d) => lateRate(d.entries30d),
 higherIsBetter: false,
 },
 {
 key:"closeout_rate_30d",
 label:"Tasa cierres (30d)",
 section:"ULTIMOS 30 DIAS",
 type:"percent",
 getValue: (d) => {
 const days = weekdaysInRange(thirtyDaysAgo, today);
 return days > 0
 ? Math.round((d.closeouts30d.length / days) * 100)
 : 0;
 },
 higherIsBetter: true,
 },
 {
 key:"standup_rate_30d",
 label:"Tasa standups (30d)",
 section:"ULTIMOS 30 DIAS",
 type:"percent",
 getValue: (d) => {
 const days = weekdaysInRange(thirtyDaysAgo, today);
 return days > 0
 ? Math.round((d.standups30d.length / days) * 100)
 : 0;
 },
 higherIsBetter: true,
 },
 {
 key:"flags_30d",
 label:"Flags recibidos (30d)",
 section:"ULTIMOS 30 DIAS",
 type:"number",
 getValue: (d) => d.flags30d.length,
 higherIsBetter: false,
 },
 {
 key:"current_streak",
 label:"Racha actual (dias)",
 section:"ULTIMOS 30 DIAS",
 type:"number",
 getValue: (d) => d.streak?.current_streak ?? 0,
 higherIsBetter: true,
 },
 {
 key:"longest_streak",
 label:"Racha mas larga",
 section:"ULTIMOS 30 DIAS",
 type:"number",
 getValue: (d) => d.streak?.longest_streak ?? 0,
 higherIsBetter: true,
 },
 {
 key:"trust_score",
 label:"Trust Score (ultimo)",
 section:"ULTIMOS 30 DIAS",
 type:"number",
 getValue: (d) => d.trustLatest?.score ?? 0,
 higherIsBetter: true,
 },
 {
 key:"shame_score",
 label:"Shame score (acumulado)",
 section:"ULTIMOS 30 DIAS",
 type:"number",
 getValue: (d) => {
 // shame = flags + late entries + missing closeouts
 const lateCount = d.entries30d.filter((e) => e.is_late).length;
 return d.flags30d.length * 3 + lateCount;
 },
 higherIsBetter: false,
 },
 {
 key:"response_time_30d",
 label:"Tiempo respuesta promedio (min)",
 section:"ULTIMOS 30 DIAS",
 type:"number",
 getValue: (d) => {
 if (d.commLogs30d.length === 0) return null;
 const withTime = d.commLogs30d.filter(
 (c) => c.response_time_avg_minutes != null
 );
 if (withTime.length === 0) return null;
 const avg =
 withTime.reduce(
 (s, c) => s + (c.response_time_avg_minutes ?? 0),
 0
 ) / withTime.length;
 return Math.round(avg);
 },
 higherIsBetter: false,
 },
 {
 key:"desc_avg_30d",
 label:"Promedio palabras descripcion (30d)",
 section:"ULTIMOS 30 DIAS",
 type:"number",
 getValue: (d) => avgDescriptionWords(d.entries30d),
 higherIsBetter: true,
 },
 ];
}

// ═══════════════════════════════════════════════════════════
// CELL RENDERING
// ═══════════════════════════════════════════════════════════

function CellValue({
 value,
 type,
 isBest,
 isWorst,
}: {
 value: number | string | boolean | null;
 type: CellType;
 isBest: boolean;
 isWorst: boolean;
}) {
 if (value === null || value === undefined) {
 return (
 <span className="text-muted-foreground">
 <Minus className="w-3 h-3 inline"/>
 </span>
 );
 }

 const cellBg = isBest
 ?"bg-green-100 dark:bg-green-950/40": isWorst
 ?"bg-red-100 dark:bg-red-950/40":"";

 const textWeight = isBest || isWorst ?"font-bold":"";

 if (type ==="boolean") {
 const boolVal = value as boolean;
 return (
 <span
 className={cn(
"inline-flex items-center justify-center w-full h-full",
 cellBg
 )}
 >
 {boolVal ? (
 <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400"/>
 ) : (
 <X className="w-3.5 h-3.5 text-red-600 dark:text-red-400"/>
 )}
 </span>
 );
 }

 if (type ==="percent") {
 const num = value as number;
 const color =
 num >= 80
 ?"text-green-700 dark:text-green-400": num >= 50
 ?"text-amber-700 dark:text-amber-400":"text-red-700 dark:text-red-400";
 return (
 <span
 className={cn(
"font-mono tabular-nums",
 color,
 textWeight,
 cellBg,
"block w-full h-full px-1.5 py-1")}
 >
 {num}%
 </span>
 );
 }

 if (type ==="time") {
 return (
 <span
 className={cn(
"font-mono tabular-nums text-foreground",
 textWeight,
 cellBg,
"block w-full h-full px-1.5 py-1")}
 >
 {formatTime(value as number)}
 </span>
 );
 }

 if (type ==="grade") {
 const grade = value as string;
 const color =
 grade ==="A+"|| grade ==="A"?"text-green-700 dark:text-green-400": grade ==="B"?"text-blue-700 dark:text-blue-400": grade ==="C"?"text-amber-700 dark:text-amber-400":"text-red-700 dark:text-red-400";
 return (
 <span
 className={cn(
"font-mono",
 color,
 textWeight,
 cellBg,
"block w-full h-full px-1.5 py-1")}
 >
 {grade}
 </span>
 );
 }

 // number or text
 return (
 <span
 className={cn(
"font-mono tabular-nums text-foreground",
 textWeight,
 cellBg,
"block w-full h-full px-1.5 py-1")}
 >
 {value}
 </span>
 );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function MatrixPage() {
 const { orgId, loading: orgLoading } = useOrg();
 const supabase = createClient();
 const [members, setMembers] = useState<MemberData[]>([]);
 const [loading, setLoading] = useState(true);

 const today = getTodayMTY();
 const weekStart = useMemo(() => {
 const ws = startOfWeek(new Date(today +"T12:00:00"), { weekStartsOn: 1 });
 return ws.toISOString().split("T")[0];
 }, [today]);
 const thirtyDaysAgo = useMemo(
 () => subDays(new Date(today +"T12:00:00"), 30).toISOString().split("T")[0],
 [today]
 );

 const metrics = useMemo(
 () => buildMetrics(today, weekStart, thirtyDaysAgo),
 [today, weekStart, thirtyDaysAgo]
 );

 useEffect(() => {
 if (!orgId) return;

 async function loadMatrix() {
 setLoading(true);

 // 1) Get all org members with profiles
 const { data: orgMembers } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId!);

 if (!orgMembers || orgMembers.length === 0) {
 setLoading(false);
 return;
 }

 const userIds = orgMembers.map((m) => m.user_id);

 // 2) Parallel queries for all data
 const [
 { data: allEntries },
 { data: allCloseouts },
 { data: allStandups },
 { data: allStreaks },
 { data: allFlags },
 { data: allTrust },
 { data: allComm },
 ] = await Promise.all([
 // Entries for last 30 days (covers today + week + 30d)
 supabase
 .from("time_entries")
 .select("*")
 .eq("org_id", orgId!)
 .gte("date", thirtyDaysAgo)
 .lte("date", today)
 .in("user_id", userIds),
 // Closeouts
 supabase
 .from("daily_closeouts")
 .select("*")
 .eq("org_id", orgId!)
 .gte("date", thirtyDaysAgo)
 .lte("date", today)
 .in("user_id", userIds),
 // Standups
 supabase
 .from("standups")
 .select("*")
 .eq("org_id", orgId!)
 .gte("date", thirtyDaysAgo)
 .lte("date", today)
 .in("user_id", userIds),
 // Streaks
 supabase
 .from("activity_streaks")
 .select("*")
 .eq("org_id", orgId!)
 .in("user_id", userIds),
 // Flags in last 30d
 supabase
 .from("accountability_flags")
 .select("*")
 .eq("org_id", orgId!)
 .gte("date", thirtyDaysAgo)
 .in("user_id", userIds),
 // Latest trust score per user
 supabase
 .from("trust_score_history")
 .select("*")
 .eq("org_id", orgId!)
 .in("user_id", userIds)
 .order("date", { ascending: false })
 .limit(userIds.length * 1), // one per user approx
 // Communication logs
 supabase
 .from("communication_logs")
 .select("*")
 .eq("org_id", orgId!)
 .gte("date", thirtyDaysAgo)
 .in("user_id", userIds),
 ]);

 const entries = (allEntries ?? []) as TimeEntry[];
 const closeouts = (allCloseouts ?? []) as DailyCloseout[];
 const standups = (allStandups ?? []) as Standup[];
 const streaks = (allStreaks ?? []) as ActivityStreak[];
 const flags = (allFlags ?? []) as AccountabilityFlag[];
 const trust = (allTrust ?? []) as TrustScoreHistory[];
 const comm = (allComm ?? []) as CommunicationLog[];

 // Build per-member data
 const memberData: MemberData[] = orgMembers.map((m) => {
 const uid = m.user_id;
 const userEntries = entries.filter((e) => e.user_id === uid);
 const userCloseouts = closeouts.filter((c) => c.user_id === uid);
 const userStandups = standups.filter((s) => s.user_id === uid);

 // Get latest trust score for this user
 const userTrust = trust.find((t) => t.user_id === uid) ?? null;

 return {
 profile: m.profiles as unknown as Profile,
 userId: uid,
 entriesToday: userEntries.filter((e) => e.date === today),
 entriesWeek: userEntries.filter(
 (e) => e.date >= weekStart && e.date <= today
 ),
 entries30d: userEntries,
 closeoutsToday: userCloseouts.filter((c) => c.date === today),
 closeouts30d: userCloseouts,
 standupsToday: userStandups.filter((s) => s.date === today),
 standups30d: userStandups,
 streak: streaks.find((s) => s.user_id === uid) ?? null,
 flags30d: flags.filter((f) => f.user_id === uid),
 trustLatest: userTrust,
 commLogs30d: comm.filter((c) => c.user_id === uid),
 };
 });

 // Sort by full_name
 memberData.sort((a, b) =>
 (a.profile.full_name ??"").localeCompare(
 b.profile.full_name ??"")
 );

 setMembers(memberData);
 setLoading(false);
 }

 loadMatrix();
 }, [orgId, today, weekStart, thirtyDaysAgo]); // eslint-disable-line react-hooks/exhaustive-deps

 // ═══════════════════════════════════════════════════════════
 // COMPUTE BEST/WORST PER METRIC
 // ═══════════════════════════════════════════════════════════

 const bestWorstMap = useMemo(() => {
 if (members.length < 2) return new Map<string, { best: Set<number>; worst: Set<number> }>();

 const map = new Map<string, { best: Set<number>; worst: Set<number> }>();

 for (const metric of metrics) {
 const values = members.map((m) => metric.getValue(m));

 // Convert to comparable numbers
 const numValues = values.map((v) => {
 if (v === null || v === undefined) return null;
 if (typeof v ==="boolean") return v ? 1 : 0;
 if (typeof v ==="string") return gradeToNumber(v);
 return v as number;
 });

 // Find best and worst (ignoring nulls)
 const nonNull = numValues
 .map((v, i) => ({ v, i }))
 .filter((x) => x.v !== null) as { v: number; i: number }[];

 if (nonNull.length < 2) {
 map.set(metric.key, { best: new Set(), worst: new Set() });
 continue;
 }

 const bestVal = metric.higherIsBetter
 ? Math.max(...nonNull.map((x) => x.v))
 : Math.min(...nonNull.map((x) => x.v));

 const worstVal = metric.higherIsBetter
 ? Math.min(...nonNull.map((x) => x.v))
 : Math.max(...nonNull.map((x) => x.v));

 // Only highlight if best != worst (there is actual difference)
 const best = new Set<number>();
 const worst = new Set<number>();

 if (bestVal !== worstVal) {
 for (const x of nonNull) {
 if (x.v === bestVal) best.add(x.i);
 if (x.v === worstVal) worst.add(x.i);
 }
 }

 map.set(metric.key, { best, worst });
 }

 return map;
 }, [members, metrics]);

 // ═══════════════════════════════════════════════════════════
 // COMPUTE TEAM AVERAGES
 // ═══════════════════════════════════════════════════════════

 const teamAverages = useMemo(() => {
 if (members.length === 0) return new Map<string, string>();

 const avgs = new Map<string, string>();

 for (const metric of metrics) {
 const values = members.map((m) => metric.getValue(m));

 if (metric.type ==="boolean") {
 const trues = values.filter((v) => v === true).length;
 avgs.set(metric.key,`${trues}/${members.length}`);
 continue;
 }

 if (metric.type ==="grade") {
 const nums = values
 .filter((v) => v !== null && v !=="-")
 .map((v) => gradeToNumber(v as string));
 if (nums.length === 0) {
 avgs.set(metric.key,"-");
 continue;
 }
 const avg = nums.reduce((s, n) => s + n, 0) / nums.length;
 const grades = ["","F","D","C","B","A","A+"];
 avgs.set(metric.key, grades[Math.round(avg)] ??"-");
 continue;
 }

 // number, percent, time
 const nums = values.filter((v) => v !== null && typeof v ==="number") as number[];
 if (nums.length === 0) {
 avgs.set(metric.key,"-");
 continue;
 }
 const avg = nums.reduce((s, n) => s + n, 0) / nums.length;

 if (metric.type ==="percent") {
 avgs.set(metric.key,`${Math.round(avg)}%`);
 } else if (metric.type ==="time") {
 avgs.set(metric.key, formatTime(Math.round(avg)));
 } else {
 avgs.set(
 metric.key,
 avg % 1 === 0 ? String(avg) : avg.toFixed(1)
 );
 }
 }

 return avgs;
 }, [members, metrics]);

 // ═══════════════════════════════════════════════════════════
 // RENDER
 // ═══════════════════════════════════════════════════════════

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
 <p className="text-muted-foreground font-mono text-xs">
 Primero crea o unete a un equipo desde el Dashboard.
 </p>
 </div>
 );
 }

 if (members.length === 0) {
 return (
 <div className="max-w-7xl mx-auto px-2 sm:px-4 py-8">
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <BarChart3 className="w-7 h-7 text-primary/40"/>
 </div>
 <p className="text-sm text-muted-foreground font-mono">
 No hay miembros en el equipo.
 </p>
 </div>
 </div>
 );
 }

 // Group metrics by section
 const sections: { label: string; metrics: MetricDef[] }[] = [];
 let currentSection ="";
 for (const m of metrics) {
 if (m.section !== currentSection) {
 sections.push({ label: m.section, metrics: [] });
 currentSection = m.section;
 }
 sections[sections.length - 1].metrics.push(m);
 }

 const displayDate = format(
 new Date(today +"T12:00:00"),
"EEEE d 'de' MMMM yyyy",
 { locale: es }
 );

 return (
 <div className="max-w-7xl mx-auto px-2 sm:px-4 py-8">
 {/* Header */}
 <div className="mb-8">
 <div className="flex items-center gap-2.5 mb-1">
 <BarChart3 className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Matriz de Comparacion
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground capitalize">
 {displayDate}
 </p>
 <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
 {members.length} miembros &middot; {metrics.length} metricas &middot; Sin excusas
 </p>
 </div>

 {/* Legend */}
 <div className="flex items-center gap-4 mb-6 text-[10px] font-mono">
 <div className="flex items-center gap-1.5">
 <span className="w-3 h-3 bg-green-100 dark:bg-green-950/40 border border-green-300 dark:border-green-800"/>
 <span className="text-muted-foreground">Mejor del equipo</span>
 </div>
 <div className="flex items-center gap-1.5">
 <span className="w-3 h-3 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800"/>
 <span className="text-muted-foreground">Peor del equipo</span>
 </div>
 <div className="flex items-center gap-1.5">
 <Check className="w-3 h-3 text-green-600"/>
 <span className="text-muted-foreground">Si</span>
 </div>
 <div className="flex items-center gap-1.5">
 <X className="w-3 h-3 text-red-600"/>
 <span className="text-muted-foreground">No</span>
 </div>
 </div>

 {/* Matrix Table */}
 <div className="overflow-x-auto border border-border">
 <table className="w-full border-collapse text-[10px] font-mono">
 {/* Header row — sticky */}
 <thead>
 <tr className="sticky top-0 z-20 bg-background">
 <th
 className="sticky left-0 z-30 bg-background border border-border px-2 py-2 text-left font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground min-w-[200px] w-[200px]">
 Metrica
 </th>
 {members.map((m) => (
 <th
 key={m.userId}
 className="border border-border px-2 py-2 text-center min-w-[100px]">
 <div className="flex flex-col items-center gap-1">
 <Avatar className="w-6 h-6 ring-1 ring-border">
 <AvatarImage
 src={m.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[8px] font-mono">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-foreground font-bold leading-tight">
 {m.profile.full_name ?? m.profile.email}
 </span>
 </div>
 </th>
 ))}
 <th className="border border-border px-2 py-2 text-center min-w-[80px]">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground font-bold">
 Equipo
 </span>
 </th>
 </tr>
 </thead>

 <tbody>
 {sections.map((section) => (
 <Fragment key={`section-${section.label}`}>
 {/* Section header row */}
 <tr>
 <td
 colSpan={members.length + 2}
 className="bg-accent/30 border border-border px-2 py-1.5 font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60 font-bold">
 {section.label}
 </td>
 </tr>

 {/* Metric rows */}
 {section.metrics.map((metric) => {
 const bw = bestWorstMap.get(metric.key) ?? {
 best: new Set<number>(),
 worst: new Set<number>(),
 };

 return (
 <tr
 key={metric.key}
 className="hover:bg-accent/10 transition-colors duration-100">
 {/* Metric label — sticky left */}
 <td className="sticky left-0 z-10 bg-background border border-border px-2 py-1.5 text-[10px] text-muted-foreground whitespace-nowrap">
 {metric.label}
 </td>

 {/* Values */}
 {members.map((m, idx) => {
 const value = metric.getValue(m);
 const isBest = bw.best.has(idx);
 const isWorst = bw.worst.has(idx);

 return (
 <td
 key={m.userId}
 className={cn(
"border border-border text-center align-middle",
 isBest &&"bg-green-100 dark:bg-green-950/40",
 isWorst &&"bg-red-100 dark:bg-red-950/40")}
 >
 <CellValue
 value={value}
 type={metric.type}
 isBest={isBest}
 isWorst={isWorst}
 />
 </td>
 );
 })}

 {/* Team average */}
 <td className="border border-border text-center align-middle px-1.5 py-1 bg-accent/10">
 <span className="font-mono tabular-nums text-muted-foreground text-[10px]">
 {teamAverages.get(metric.key) ??"-"}
 </span>
 </td>
 </tr>
 );
 })}
 </Fragment>
 ))}
 </tbody>
 </table>
 </div>

 {/* Footer note */}
 <div className="mt-4 text-[9px] font-mono text-muted-foreground tracking-wide">
 Datos en tiempo real &middot; Zona horaria: America/Monterrey &middot; Actualizado al cargar la pagina
 </div>
 </div>
 );
}
