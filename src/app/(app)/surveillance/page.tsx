"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type {
 Profile,
 TimeEntry,
 LiveStatus,
 AccountabilityFlag,
 DailyCloseout,
 TrustScoreHistory,
} from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials, getTodayMTY, formatHour, timeAgo } from "@/lib/utils";
import {
 CATEGORIES,
 LIVE_STATUS_CONFIG,
 FLAG_TYPES,
 CATEGORY_COLORS,
} from "@/lib/constants";
import { format, subDays, getDay, differenceInMinutes, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
 Eye,
 Users,
 Radio,
 Clock,
 Shield,
 AlertTriangle,
 Ghost,
 ChevronDown,
 ChevronRight,
 Activity,
 FileCheck,
 Flag,
 Camera,
 Zap,
 BarChart3,
 Grid3X3,
 Flame,
 MessageSquare,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface MemberProfile extends Profile {
 // augmented data
}

interface MemberSurveillance {
 userId: string;
 profile: MemberProfile;
 liveStatus: LiveStatus | null;
 entriesToday: TimeEntry[];
 lastEntry: TimeEntry | null;
 hoursToday: number;
 expectedHours: number;
 proofRateToday: number;
 lateEntriesToday: number;
 entriesNoDescription: number;
 isGhost: boolean;
 daysInactive: number;
 // Week data
 entriesWeek: TimeEntry[];
 // 30-day data
 entries30d: TimeEntry[];
 closeouts30d: DailyCloseout[];
 standups30d: Array<{ id: string; date: string }>;
 flags30d: AccountabilityFlag[];
 trustHistory: TrustScoreHistory[];
 activeFlags: AccountabilityFlag[];
}

interface ActivityEvent {
 id: string;
 timestamp: string;
 userId: string;
 userName: string;
 action: string;
 details: string;
 type:"positive"|"negative"|"neutral";
}

// ============================================================
// Helpers
// ============================================================

function getCurrentMTYTime(): Date {
 const mtyStr = new Intl.DateTimeFormat("en-US", {
 timeZone:"America/Monterrey",
 year:"numeric",
 month:"2-digit",
 day:"2-digit",
 hour:"2-digit",
 minute:"2-digit",
 second:"2-digit",
 hour12: false,
 }).format(new Date());
 return new Date(mtyStr);
}

function getCurrentHourMTY(): number {
 const h = new Intl.DateTimeFormat("en-US", {
 timeZone:"America/Monterrey",
 hour:"numeric",
 hour12: false,
 }).format(new Date());
 return parseInt(h, 10);
}

function formatMTYTime(): string {
 return new Intl.DateTimeFormat("es-MX", {
 timeZone:"America/Monterrey",
 hour:"2-digit",
 minute:"2-digit",
 second:"2-digit",
 hour12: false,
 }).format(new Date());
}

function formatMTYDate(): string {
 return new Intl.DateTimeFormat("es-MX", {
 timeZone:"America/Monterrey",
 weekday:"long",
 day:"numeric",
 month:"long",
 year:"numeric",
 }).format(new Date());
}

function qualityGrade(entry: TimeEntry): string {
 let score = 0;
 if (entry.description && entry.description.length > 20) score += 2;
 else if (entry.description && entry.description.length > 5) score += 1;
 if (entry.proof_urls && entry.proof_urls.length > 0) score += 2;
 if (!entry.is_late) score += 1;
 if (entry.links && entry.links.length > 0) score += 1;
 if (score >= 5) return"A";
 if (score >= 4) return"B";
 if (score >= 3) return"C";
 if (score >= 2) return"D";
 return"F";
}

function gradeColor(g: string): string {
 if (g ==="A") return"text-green-500";
 if (g ==="B") return"text-green-400";
 if (g ==="C") return"text-amber-500";
 if (g ==="D") return"text-orange-500";
 return"text-red-500";
}

function avgDescriptionLength(entries: TimeEntry[]): number {
 const withDesc = entries.filter((e) => e.description && e.description.length > 0);
 if (withDesc.length === 0) return 0;
 return Math.round(withDesc.reduce((s, e) => s + (e.description?.length ?? 0), 0) / withDesc.length);
}

function avgQualityGrade(entries: TimeEntry[]): string {
 if (entries.length === 0) return"--";
 const grades = entries.map(qualityGrade);
 const map: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
 const avg = grades.reduce((s, g) => s + (map[g] ?? 0), 0) / grades.length;
 if (avg >= 4.5) return"A";
 if (avg >= 3.5) return"B";
 if (avg >= 2.5) return"C";
 if (avg >= 1.5) return"D";
 return"F";
}

// Levenshtein for copy-paste detection (from dossier)
function levenshtein(a: string, b: string): number {
 const an = a.length;
 const bn = b.length;
 if (an === 0) return bn;
 if (bn === 0) return an;
 const matrix: number[][] = [];
 for (let i = 0; i <= an; i++) matrix[i] = [i];
 for (let j = 0; j <= bn; j++) matrix[0][j] = j;
 for (let i = 1; i <= an; i++) {
 for (let j = 1; j <= bn; j++) {
 const cost = a[i - 1] === b[j - 1] ? 0 : 1;
 matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
 }
 }
 return matrix[an][bn];
}

function similarity(a: string, b: string): number {
 if (a.length === 0 && b.length === 0) return 1;
 const maxLen = Math.max(a.length, b.length);
 if (maxLen === 0) return 1;
 return 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

// ============================================================
// Page
// ============================================================

export default function SurveillancePage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [loading, setLoading] = useState(true);
 const [members, setMembers] = useState<MemberSurveillance[]>([]);
 const [clock, setClock] = useState(formatMTYTime());
 const [expandedMember, setExpandedMember] = useState<string | null>(null);
 const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);

 const today = useMemo(() => getTodayMTY(), []);

 // Live clock
 useEffect(() => {
 const interval = setInterval(() => setClock(formatMTYTime()), 1000);
 return () => clearInterval(interval);
 }, []);

 // Load all data
 const loadData = useCallback(async () => {
 if (!orgId) return;

 const thirtyDaysAgo = format(subDays(new Date(), 30),"yyyy-MM-dd");
 const sevenDaysAgo = format(subDays(new Date(), 7),"yyyy-MM-dd");

 const [
 membersRes,
 todayEntriesRes,
 weekEntriesRes,
 monthEntriesRes,
 liveRes,
 closeoutsRes,
 standupsRes,
 flagsRes,
 activeFlagsRes,
 trustRes,
 ] = await Promise.all([
 supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId),
 supabase
 .from("time_entries")
 .select("*")
 .eq("org_id", orgId)
 .eq("date", today)
 .order("logged_at", { ascending: false }),
 supabase
 .from("time_entries")
 .select("*")
 .eq("org_id", orgId)
 .gte("date", sevenDaysAgo)
 .lte("date", today)
 .order("date", { ascending: false }),
 supabase
 .from("time_entries")
 .select("*")
 .eq("org_id", orgId)
 .gte("date", thirtyDaysAgo)
 .lte("date", today),
 supabase
 .from("live_status")
 .select("*")
 .eq("org_id", orgId),
 supabase
 .from("daily_closeouts")
 .select("*")
 .eq("org_id", orgId)
 .gte("date", thirtyDaysAgo),
 supabase
 .from("standups")
 .select("id, date, user_id")
 .eq("org_id", orgId)
 .gte("date", thirtyDaysAgo),
 supabase
 .from("accountability_flags")
 .select("*")
 .eq("org_id", orgId)
 .gte("date", thirtyDaysAgo),
 supabase
 .from("accountability_flags")
 .select("*")
 .eq("org_id", orgId)
 .eq("resolved", false),
 supabase
 .from("trust_score_history")
 .select("*")
 .eq("org_id", orgId)
 .gte("date", thirtyDaysAgo)
 .order("date", { ascending: true }),
 ]);

 const orgMembers = membersRes.data ?? [];
 const todayEntries = (todayEntriesRes.data ?? []) as TimeEntry[];
 const weekEntries = (weekEntriesRes.data ?? []) as TimeEntry[];
 const monthEntries = (monthEntriesRes.data ?? []) as TimeEntry[];
 const liveStatuses = (liveRes.data ?? []) as LiveStatus[];
 const closeouts = (closeoutsRes.data ?? []) as DailyCloseout[];
 const standups = (standupsRes.data ?? []) as Array<{ id: string; date: string; user_id: string }>;
 const flags = (flagsRes.data ?? []) as AccountabilityFlag[];
 const activeFlags = (activeFlagsRes.data ?? []) as AccountabilityFlag[];
 const trustHistory = (trustRes.data ?? []) as TrustScoreHistory[];

 // Build maps
 const liveMap = new Map<string, LiveStatus>();
 for (const ls of liveStatuses) liveMap.set(ls.user_id, ls);

 // Latest entry per user (all time)
 const allMonthEntries = monthEntries;
 const latestEntryMap = new Map<string, TimeEntry>();
 for (const e of allMonthEntries) {
 const existing = latestEntryMap.get(e.user_id);
 if (!existing || e.logged_at > existing.logged_at) {
 latestEntryMap.set(e.user_id, e);
 }
 }

 const currentHour = getCurrentHourMTY();

 const memberData: MemberSurveillance[] = orgMembers.map((m) => {
 const profile = m.profiles as unknown as MemberProfile;
 const liveStatus = liveMap.get(m.user_id) ?? null;
 const userTodayEntries = todayEntries.filter((e) => e.user_id === m.user_id);
 const userWeekEntries = weekEntries.filter((e) => e.user_id === m.user_id);
 const userMonthEntries = monthEntries.filter((e) => e.user_id === m.user_id);
 const lastEntry = latestEntryMap.get(m.user_id) ?? null;

 const hoursToday = new Set(userTodayEntries.map((e) => e.hour)).size;
 const workStart = profile.work_start_hour ?? 7;
 const workEnd = profile.work_end_hour ?? 18;
 const expectedHours = Math.max(0, Math.min(currentHour, workEnd) - workStart);

 const withProof = userTodayEntries.filter((e) => e.proof_urls && e.proof_urls.length > 0).length;
 const proofRateToday = userTodayEntries.length > 0 ? (withProof / userTodayEntries.length) * 100 : 0;

 const lateEntriesToday = userTodayEntries.filter((e) => e.is_late).length;
 const entriesNoDescription = userTodayEntries.filter((e) => !e.description || e.description.length < 5).length;

 // Days inactive
 let daysInactive = 0;
 if (!lastEntry) {
 daysInactive = 999;
 } else {
 const lastDate = new Date(lastEntry.date +"T12:00:00");
 const todayDate = new Date(today +"T12:00:00");
 daysInactive = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
 }
 const isGhost = daysInactive >= 2;

 const userCloseouts = closeouts.filter((c) => c.user_id === m.user_id);
 const userStandups = standups.filter((s) => s.user_id === m.user_id);
 const userFlags = flags.filter((f) => f.user_id === m.user_id);
 const userActiveFlags = activeFlags.filter((f) => f.user_id === m.user_id);
 const userTrustHistory = trustHistory.filter((t) => t.user_id === m.user_id);

 return {
 userId: m.user_id,
 profile,
 liveStatus,
 entriesToday: userTodayEntries,
 lastEntry,
 hoursToday,
 expectedHours,
 proofRateToday,
 lateEntriesToday,
 entriesNoDescription,
 isGhost,
 daysInactive,
 entriesWeek: userWeekEntries,
 entries30d: userMonthEntries,
 closeouts30d: userCloseouts,
 standups30d: userStandups,
 flags30d: userFlags,
 trustHistory: userTrustHistory,
 activeFlags: userActiveFlags,
 };
 });

 // Sort: online first, then by hours today desc, ghosts last
 memberData.sort((a, b) => {
 const aOnline = a.liveStatus && a.liveStatus.status !=="offline"? 1 : 0;
 const bOnline = b.liveStatus && b.liveStatus.status !=="offline"? 1 : 0;
 if (aOnline !== bOnline) return bOnline - aOnline;
 if (a.isGhost !== b.isGhost) return a.isGhost ? 1 : -1;
 return b.hoursToday - a.hoursToday;
 });

 setMembers(memberData);

 // Build activity events from today entries
 const events: ActivityEvent[] = [];
 const profileMap = new Map<string, Profile>();
 for (const m of orgMembers) {
 const p = m.profiles as unknown as Profile;
 profileMap.set(m.user_id, p);
 }

 for (const entry of todayEntries) {
 const name = profileMap.get(entry.user_id)?.full_name ??"Desconocido";
 const cat = CATEGORIES[entry.category as keyof typeof CATEGORIES];
 events.push({
 id: entry.id,
 timestamp: entry.logged_at,
 userId: entry.user_id,
 userName: name,
 action:"registro entrada",
 details:`${cat?.emoji ??""} ${entry.title} (${formatHour(entry.hour)}) ${entry.is_late ?"TARDE":""}`,
 type: entry.is_late ?"negative": entry.proof_urls && entry.proof_urls.length > 0 ?"positive":"neutral",
 });
 }

 // Add closeouts for today
 const todayCloseouts = closeouts.filter((c) => c.date === today);
 for (const c of todayCloseouts) {
 const name = profileMap.get(c.user_id)?.full_name ??"Desconocido";
 events.push({
 id: c.id,
 timestamp: c.submitted_at,
 userId: c.user_id,
 userName: name,
 action:"cierre del dia",
 details:`${c.hours_logged}h registradas, ${c.hours_with_proof}h con evidencia`,
 type:"positive",
 });
 }

 // Add standups for today
 const todayStandups = standups.filter((s) => s.date === today);
 for (const s of todayStandups) {
 const name = profileMap.get(s.user_id)?.full_name ??"Desconocido";
 events.push({
 id: s.id,
 timestamp: today +"T09:00:00",
 userId: s.user_id,
 userName: name,
 action:"standup",
 details:"Standup enviado",
 type:"positive",
 });
 }

 events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
 setActivityEvents(events);

 setLoading(false);
 }, [orgId, today, supabase]);

 useEffect(() => {
 if (orgLoading || !orgId) {
 if (!orgLoading) setLoading(false);
 return;
 }
 loadData();
 }, [orgLoading, orgId, loadData]);

 // Real-time subscriptions
 useEffect(() => {
 if (!orgId) return;
 const channel = supabase
 .channel("surveillance-realtime")
 .on("postgres_changes", {
 event:"*",
 schema:"public",
 table:"time_entries",
 filter:`org_id=eq.${orgId}`,
 }, () => loadData())
 .on("postgres_changes", {
 event:"*",
 schema:"public",
 table:"live_status",
 filter:`org_id=eq.${orgId}`,
 }, () => loadData())
 .subscribe();
 return () => { supabase.removeChannel(channel); };
 }, [orgId, loadData, supabase]);

 // ---- Aggregate Stats ----
 const stats = useMemo(() => {
 const totalMembers = members.length;
 const entriesToday = members.reduce((s, m) => s + m.entriesToday.length, 0);
 const activeSessions = members.filter(
 (m) => m.liveStatus && m.liveStatus.status !=="offline").length;
 const ghosts = members.filter((m) => m.isGhost).length;
 const totalActiveFlags = members.reduce((s, m) => s + m.activeFlags.length, 0);
 return { totalMembers, entriesToday, activeSessions, ghosts, totalActiveFlags };
 }, [members]);

 // ---- Loading ----
 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Inicializando vigilancia...
 </div>
 </div>
 );
 }

 if (!orgId) {
 return (
 <div className="flex items-center justify-center py-24">
 <p className="text-muted-foreground font-mono text-xs">
 Primero crea o unete a un equipo.
 </p>
 </div>
 );
 }

 return (
 <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
 {/* ================================================================ */}
 {/* SECTION 1: PANEL DE VIGILANCIA TOTAL */}
 {/* ================================================================ */}
 <div className="mb-8">
 <div className="flex items-center justify-between mb-1">
 <div className="flex items-center gap-2.5">
 <Eye className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Panel de Vigilancia Total
 </h1>
 </div>
 <div className="flex items-center gap-3">
 <span className="font-mono text-2xl font-bold tabular-nums tracking-tight text-primary">
 {clock}
 </span>
 </div>
 </div>
 <div className="flex items-center gap-4 mb-6">
 <div className="flex items-center gap-1.5">
 <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_6px] shadow-green-500/60"/>
 <span className="font-mono text-[9px] tracking-[0.18em] text-green-500/80 uppercase">
 Sistema de vigilancia activo
 </span>
 </div>
 <span className="font-mono text-[9px] text-muted-foreground">|</span>
 <span className="font-mono text-[10px] text-muted-foreground capitalize">
 {formatMTYDate()}
 </span>
 </div>

 {/* Stats bar */}
 <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
 <div className="bg-accent/30 border border-border p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <Users className="w-3 h-3 text-muted-foreground"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Miembros
 </span>
 </div>
 <p className="text-xl font-mono font-bold tabular-nums tracking-tight">
 {stats.totalMembers}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <Activity className="w-3 h-3 text-muted-foreground"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Entradas hoy
 </span>
 </div>
 <p className="text-xl font-mono font-bold tabular-nums tracking-tight">
 {stats.entriesToday}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <Radio className="w-3 h-3 text-green-500"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 En linea
 </span>
 </div>
 <p className="text-xl font-mono font-bold tabular-nums tracking-tight text-green-600 dark:text-green-400">
 {stats.activeSessions}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <Ghost className="w-3 h-3 text-amber-500"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Fantasmas
 </span>
 </div>
 <p className={cn(
"text-xl font-mono font-bold tabular-nums tracking-tight",
 stats.ghosts > 0 &&"text-amber-600 dark:text-amber-400")}>
 {stats.ghosts}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <Flag className="w-3 h-3 text-red-500"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Flags activos
 </span>
 </div>
 <p className={cn(
"text-xl font-mono font-bold tabular-nums tracking-tight",
 stats.totalActiveFlags > 0 &&"text-red-600 dark:text-red-400")}>
 {stats.totalActiveFlags}
 </p>
 </div>
 </div>
 </div>

 {/* ================================================================ */}
 {/* SECTION 2: ESTADO EN TIEMPO REAL */}
 {/* ================================================================ */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Estado en tiempo real
 </p>
 <div className="space-y-2">
 {members.map((m) => (
 <SurveillanceCard
 key={m.userId}
 member={m}
 isExpanded={expandedMember === m.userId}
 onToggle={() =>
 setExpandedMember(expandedMember === m.userId ? null : m.userId)
 }
 today={today}
 />
 ))}
 </div>
 </div>

 {/* ================================================================ */}
 {/* SECTION 5: MAPA DE CALOR */}
 {/* ================================================================ */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Mapa de calor de actividad (7 dias)
 </p>
 <div className="space-y-4">
 {members.map((m) => (
 <HeatmapRow key={m.userId} member={m} />
 ))}
 </div>
 </div>

 {/* ================================================================ */}
 {/* SECTION 6: ALERTAS ACTIVAS */}
 {/* ================================================================ */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Alertas activas
 </p>
 <AlertsSection members={members} />
 </div>

 {/* ================================================================ */}
 {/* SECTION 4: REGISTRO DE ACTIVIDAD */}
 {/* ================================================================ */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Registro de actividad en tiempo real
 </p>
 <ActivityLog events={activityEvents} />
 </div>

 {/* Footer */}
 <div className="text-center py-6 border-t border-border">
 <p className="font-mono text-[9px] text-muted-foreground/20 uppercase tracking-[0.3em]">
 Panel de vigilancia total - Datos en tiempo real - {formatMTYDate()}
 </p>
 </div>
 </div>
 );
}

// ============================================================
// Surveillance Card (per member)
// ============================================================

function SurveillanceCard({
 member: m,
 isExpanded,
 onToggle,
 today,
}: {
 member: MemberSurveillance;
 isExpanded: boolean;
 onToggle: () => void;
 today: string;
}) {
 const statusConfig = m.liveStatus
 ? LIVE_STATUS_CONFIG[m.liveStatus.status] ?? LIVE_STATUS_CONFIG.offline
 : LIVE_STATUS_CONFIG.offline;

 const isOnline = m.liveStatus && m.liveStatus.status !=="offline";

 // Session duration (if online)
 const sessionDuration = useMemo(() => {
 if (!m.liveStatus || !isOnline) return null;
 const started = new Date(m.liveStatus.started_at);
 const mins = differenceInMinutes(new Date(), started);
 const h = Math.floor(mins / 60);
 const min = mins % 60;
 return h > 0 ?`${h}h ${min}m`:`${min}m`;
 }, [m.liveStatus, isOnline]);

 // Time since last activity
 const timeSinceLastActivity = useMemo(() => {
 if (m.lastEntry) return timeAgo(m.lastEntry.logged_at);
 return"Sin actividad";
 }, [m.lastEntry]);

 const lastEntryGrade = m.lastEntry ? qualityGrade(m.lastEntry) : null;
 const hoursFraction = m.expectedHours > 0
 ?`${m.hoursToday}/${m.expectedHours}`:`${m.hoursToday}`;

 const behindHours = Math.max(0, m.expectedHours - m.hoursToday);
 const isBehind = behindHours >= 2;

 return (
 <div
 className={cn(
"card-palantir",
 m.isGhost &&"border-amber-500/20 bg-amber-500/3",
 isBehind && !m.isGhost &&"border-red-500/20 bg-red-500/3")}
 >
 {/* Main row */}
 <button
 onClick={onToggle}
 className="w-full flex items-center gap-3 p-3 sm:p-4 cursor-pointer text-left">
 {/* Avatar */}
 <div className="relative shrink-0">
 <Avatar
 className={cn("w-9 h-9 ring-1 ring-border", m.isGhost &&"grayscale opacity-60")}
 >
 <AvatarImage src={m.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs font-mono">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span
 className={cn(
"absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
 isOnline ? statusConfig.dotColor :"bg-gray-400",
 isOnline &&"status-dot-active")}
 />
 </div>

 {/* Name + status */}
 <div className="flex-1 min-w-0">
 <p className="text-[11px] font-mono font-bold uppercase tracking-tight truncate">
 {m.profile.full_name ?? m.profile.email}
 </p>
 <div className="flex items-center gap-2 mt-0.5 flex-wrap">
 <span className={cn("text-[9px] font-mono", isOnline ? statusConfig.color :"text-muted-foreground")}>
 {isOnline ? statusConfig.label : m.isGhost ?`Fantasma (${m.daysInactive}d)`:"Desconectado"}
 </span>
 {m.liveStatus?.current_task && (
 <>
 <span className="text-[8px] text-muted-foreground/20">|</span>
 <span className="text-[9px] font-mono text-muted-foreground truncate max-w-[120px]">
 {m.liveStatus.current_task}
 </span>
 </>
 )}
 {isOnline && sessionDuration && (
 <>
 <span className="text-[8px] text-muted-foreground/20">|</span>
 <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
 {sessionDuration}
 </span>
 </>
 )}
 </div>
 </div>

 {/* Metrics row */}
 <div className="hidden sm:flex items-center gap-4 shrink-0">
 {/* Hours */}
 <div className="text-center w-14">
 <p className={cn(
"font-mono text-sm font-bold tabular-nums tracking-tight",
 isBehind ?"text-red-500": m.hoursToday >= m.expectedHours ?"text-green-500":"")}>
 {hoursFraction}
 </p>
 <span className="font-mono text-[7px] tracking-[0.18em] uppercase text-muted-foreground">
 horas
 </span>
 </div>

 {/* Proof rate */}
 <div className="text-center w-14">
 <p className={cn(
"font-mono text-sm font-bold tabular-nums tracking-tight",
 m.proofRateToday >= 80 ?"text-green-500": m.proofRateToday >= 50 ?"text-amber-500": m.entriesToday.length === 0 ?"":"text-red-500")}>
 {m.entriesToday.length > 0 ?`${Math.round(m.proofRateToday)}%`:"--"}
 </p>
 <span className="font-mono text-[7px] tracking-[0.18em] uppercase text-muted-foreground">
 evidencia
 </span>
 </div>

 {/* Late */}
 <div className="text-center w-10">
 <p className={cn(
"font-mono text-sm font-bold tabular-nums tracking-tight",
 m.lateEntriesToday > 0 &&"text-red-500")}>
 {m.lateEntriesToday}
 </p>
 <span className="font-mono text-[7px] tracking-[0.18em] uppercase text-muted-foreground">
 tarde
 </span>
 </div>

 {/* Grade */}
 {lastEntryGrade && (
 <div className="text-center w-8">
 <p className={cn("font-mono text-sm font-bold", gradeColor(lastEntryGrade))}>
 {lastEntryGrade}
 </p>
 <span className="font-mono text-[7px] tracking-[0.18em] uppercase text-muted-foreground">
 cal
 </span>
 </div>
 )}

 {/* Last activity */}
 <div className="text-center w-14">
 <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
 {timeSinceLastActivity}
 </p>
 <span className="font-mono text-[7px] tracking-[0.18em] uppercase text-muted-foreground">
 ultima
 </span>
 </div>
 </div>

 {/* Badges */}
 <div className="flex items-center gap-1 shrink-0">
 {m.isGhost && (
 <Badge variant="secondary"className="font-mono text-[8px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
 <Ghost className="w-3 h-3 mr-0.5"/>
 FANTASMA
 </Badge>
 )}
 {isBehind && !m.isGhost && (
 <Badge variant="destructive"className="font-mono text-[8px]">
 -{behindHours}h
 </Badge>
 )}
 {m.activeFlags.length > 0 && (
 <Badge variant="destructive"className="font-mono text-[8px] tabular-nums">
 {m.activeFlags.length} flag{m.activeFlags.length !== 1 ?"s":""}
 </Badge>
 )}
 </div>

 <ChevronDown
 className={cn(
"w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0",
 isExpanded &&"rotate-180")}
 />
 </button>

 {/* Expanded detail panel */}
 {isExpanded && (
 <ExpandedMemberDetail member={m} today={today} />
 )}
 </div>
 );
}

// ============================================================
// Expanded Member Detail (Section 3)
// ============================================================

function ExpandedMemberDetail({
 member: m,
 today,
}: {
 member: MemberSurveillance;
 today: string;
}) {
 // ---- TODAY stats ----
 const todayAvgGrade = avgQualityGrade(m.entriesToday);
 const todayAvgDescLen = avgDescriptionLength(m.entriesToday);
 const todayProof = m.entriesToday.length > 0
 ? Math.round((m.entriesToday.filter((e) => e.proof_urls && e.proof_urls.length > 0).length / m.entriesToday.length) * 100)
 : 0;

 // ---- WEEK stats ----
 const weekDays = new Map<string, TimeEntry[]>();
 for (const e of m.entriesWeek) {
 const list = weekDays.get(e.date) ?? [];
 list.push(e);
 weekDays.set(e.date, list);
 }
 const weekDayStats = [...weekDays.entries()].map(([date, entries]) => ({
 date,
 hours: new Set(entries.map((e) => e.hour)).size,
 entries: entries.length,
 proofRate: entries.length > 0
 ? Math.round((entries.filter((e) => e.proof_urls && e.proof_urls.length > 0).length / entries.length) * 100)
 : 0,
 lateCount: entries.filter((e) => e.is_late).length,
 grade: avgQualityGrade(entries),
 })).sort((a, b) => a.date.localeCompare(b.date));

 const bestDay = weekDayStats.reduce((best, d) => (d.hours > (best?.hours ?? 0) ? d : best), weekDayStats[0]);
 const worstDay = weekDayStats.reduce((worst, d) => (d.hours < (worst?.hours ?? Infinity) ? d : worst), weekDayStats[0]);

 // ---- 30-DAY stats ----
 const totalHours30d = new Set(m.entries30d.map((e) =>`${e.date}-${e.hour}`)).size;
 const proof30d = m.entries30d.length > 0
 ? Math.round((m.entries30d.filter((e) => e.proof_urls && e.proof_urls.length > 0).length / m.entries30d.length) * 100)
 : 0;
 const late30d = m.entries30d.length > 0
 ? Math.round((m.entries30d.filter((e) => e.is_late).length / m.entries30d.length) * 100)
 : 0;
 const uniqueDays30d = new Set(m.entries30d.map((e) => e.date)).size;
 const closeoutRate30d = uniqueDays30d > 0
 ? Math.round((m.closeouts30d.length / uniqueDays30d) * 100)
 : 0;
 const standupRate30d = uniqueDays30d > 0
 ? Math.round((m.standups30d.length / uniqueDays30d) * 100)
 : 0;
 const flagsReceived30d = m.flags30d.length;
 const latestTrust = m.trustHistory.length > 0 ? m.trustHistory[m.trustHistory.length - 1].score : null;

 // ---- Pattern detection (simplified from dossier) ----
 const patterns: string[] = [];

 // Copy-paste check
 const descriptions = m.entries30d
 .filter((e) => e.description && e.description.length > 15)
 .map((e) => ({ desc: e.description!, date: e.date }));
 let copyPasteCount = 0;
 for (let i = 0; i < Math.min(descriptions.length, 100); i++) {
 for (let j = i + 1; j < Math.min(descriptions.length, 100); j++) {
 if (descriptions[i].date === descriptions[j].date) continue;
 if (similarity(descriptions[i].desc, descriptions[j].desc) > 0.85) copyPasteCount++;
 }
 }
 if (copyPasteCount >= 3) patterns.push(`Copia-pega: ${copyPasteCount} pares similares`);

 // Friday effect
 const dateHoursMap = new Map<string, number>();
 for (const e of m.entries30d) {
 dateHoursMap.set(e.date, (dateHoursMap.get(e.date) ?? 0) + 1);
 }
 const fridayHours: number[] = [];
 const nonFridayHours: number[] = [];
 for (const [dateStr, hours] of dateHoursMap) {
 const day = getDay(parseISO(dateStr));
 if (day === 5) fridayHours.push(hours);
 else if (day >= 1 && day <= 4) nonFridayHours.push(hours);
 }
 if (fridayHours.length >= 2 && nonFridayHours.length >= 3) {
 const fridayAvg = fridayHours.reduce((a, b) => a + b, 0) / fridayHours.length;
 const otherAvg = nonFridayHours.reduce((a, b) => a + b, 0) / nonFridayHours.length;
 const drop = Math.round((1 - fridayAvg / otherAvg) * 100);
 if (drop > 15) patterns.push(`Efecto viernes: -${drop}% productividad`);
 }

 // Suspicious backfilling
 const backfills = m.entries30d.filter((e) => {
 if (!e.logged_at) return false;
 const loggedDate = new Date(e.logged_at).toISOString().split("T")[0];
 return loggedDate !== e.date;
 });
 if (backfills.length >= 5) {
 patterns.push(`Backfilling: ${backfills.length} entradas retroactivas`);
 }

 // Low detail entries
 const lowDetail = m.entries30d.filter((e) => !e.description || e.description.length < 10);
 if (lowDetail.length > m.entries30d.length * 0.3 && m.entries30d.length > 5) {
 patterns.push(`Bajo detalle: ${Math.round((lowDetail.length / m.entries30d.length) * 100)}% sin descripcion`);
 }

 return (
 <div className="border-t border-border px-3 sm:px-4 py-4 space-y-4 bg-accent/10">
 {/* HOY */}
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Hoy
 </p>
 <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
 <MiniStat label="Horas"value={`${m.hoursToday}`} />
 <MiniStat label="Entradas"value={`${m.entriesToday.length}`} />
 <MiniStat label="Evidencia"value={`${todayProof}%`} color={todayProof >= 80 ?"green": todayProof >= 50 ?"amber":"red"} />
 <MiniStat label="Tardes"value={`${m.lateEntriesToday}`} color={m.lateEntriesToday > 0 ?"red": undefined} />
 <MiniStat label="Desc. prom"value={`${todayAvgDescLen}`} />
 <MiniStat label="Calidad"value={todayAvgGrade} color={todayAvgGrade ==="A"|| todayAvgGrade ==="B"?"green": todayAvgGrade ==="C"?"amber":"red"} />
 </div>
 </div>

 {/* ESTA SEMANA */}
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Esta semana
 </p>
 {weekDayStats.length > 0 ? (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead>
 <tr className="border-b border-border">
 <th className="text-left font-mono text-[9px] text-muted-foreground uppercase tracking-wider pb-1 pr-3">Dia</th>
 <th className="text-right font-mono text-[9px] text-muted-foreground uppercase tracking-wider pb-1 px-2">Horas</th>
 <th className="text-right font-mono text-[9px] text-muted-foreground uppercase tracking-wider pb-1 px-2">Evid%</th>
 <th className="text-right font-mono text-[9px] text-muted-foreground uppercase tracking-wider pb-1 px-2">Tardes</th>
 <th className="text-right font-mono text-[9px] text-muted-foreground uppercase tracking-wider pb-1 px-2">Calif</th>
 </tr>
 </thead>
 <tbody>
 {weekDayStats.map((d) => (
 <tr key={d.date} className="border-b border-border/30">
 <td className="font-mono text-[11px] py-1 pr-3">
 {format(parseISO(d.date),"EEE d", { locale: es })}
 {d.date === bestDay?.date && weekDayStats.length > 1 && <span className="text-green-500 ml-1 text-[8px]">MEJOR</span>}
 {d.date === worstDay?.date && weekDayStats.length > 1 && d.date !== bestDay?.date && <span className="text-red-500 ml-1 text-[8px]">PEOR</span>}
 </td>
 <td className="text-right font-mono text-[11px] tabular-nums py-1 px-2">{d.hours}</td>
 <td className={cn("text-right font-mono text-[11px] tabular-nums py-1 px-2", d.proofRate >= 80 ?"text-green-500": d.proofRate >= 50 ?"text-amber-500":"text-red-500")}>
 {d.proofRate}%
 </td>
 <td className={cn("text-right font-mono text-[11px] tabular-nums py-1 px-2", d.lateCount > 0 &&"text-red-500")}>
 {d.lateCount}
 </td>
 <td className={cn("text-right font-mono text-[11px] font-bold py-1 px-2", gradeColor(d.grade))}>
 {d.grade}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 ) : (
 <p className="font-mono text-[10px] text-muted-foreground">Sin datos esta semana</p>
 )}
 </div>

 {/* 30 DIAS */}
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Ultimos 30 dias
 </p>
 <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
 <MiniStat label="Horas totales"value={`${totalHours30d}`} />
 <MiniStat label="Evidencia"value={`${proof30d}%`} color={proof30d >= 80 ?"green": proof30d >= 50 ?"amber":"red"} />
 <MiniStat label="Tardes"value={`${late30d}%`} color={late30d > 20 ?"red": late30d > 10 ?"amber":"green"} />
 <MiniStat label="Closeout"value={`${closeoutRate30d}%`} color={closeoutRate30d >= 80 ?"green": closeoutRate30d >= 50 ?"amber":"red"} />
 <MiniStat label="Standup"value={`${standupRate30d}%`} color={standupRate30d >= 80 ?"green": standupRate30d >= 50 ?"amber":"red"} />
 <MiniStat label="Flags"value={`${flagsReceived30d}`} color={flagsReceived30d > 3 ?"red": flagsReceived30d > 0 ?"amber": undefined} />
 <MiniStat label="Trust Score"value={latestTrust !== null ?`${latestTrust}`:"--"} color={latestTrust !== null ? (latestTrust >= 80 ?"green": latestTrust >= 60 ?"amber":"red") : undefined} />
 <MiniStat label="Dias activos"value={`${uniqueDays30d}`} />
 </div>
 </div>

 {/* PATTERNS */}
 {patterns.length > 0 && (
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Patrones detectados
 </p>
 <div className="space-y-1">
 {patterns.map((p, i) => (
 <div key={i} className="flex items-center gap-2 py-1 border-l-2 border-red-500/30 pl-2">
 <AlertTriangle className="w-3 h-3 text-red-500/60 shrink-0"/>
 <span className="font-mono text-[10px] text-red-600 dark:text-red-400">{p}</span>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Last entry detail */}
 {m.lastEntry && (
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Ultima entrada registrada
 </p>
 <div className="border border-border p-3 bg-background">
 <div className="flex items-center gap-2 mb-1">
 <span className="text-[11px]">
 {CATEGORIES[m.lastEntry.category as keyof typeof CATEGORIES]?.emoji ??""}
 </span>
 <span className="font-mono text-[11px] font-medium">{m.lastEntry.title}</span>
 <Badge variant="outline"className="font-mono text-[8px] ml-auto">
 {formatHour(m.lastEntry.hour)}
 </Badge>
 </div>
 {m.lastEntry.description && (
 <p className="font-mono text-[10px] text-muted-foreground mt-1 line-clamp-2">
 {m.lastEntry.description}
 </p>
 )}
 <div className="flex items-center gap-3 mt-2">
 <span className="font-mono text-[9px] text-muted-foreground">
 {format(new Date(m.lastEntry.logged_at),"d MMM HH:mm", { locale: es })}
 </span>
 {m.lastEntry.is_late && (
 <Badge variant="destructive"className="font-mono text-[8px]">
 TARDE ({m.lastEntry.minutes_late}m)
 </Badge>
 )}
 {m.lastEntry.proof_urls && m.lastEntry.proof_urls.length > 0 && (
 <Badge variant="secondary"className="font-mono text-[8px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800">
 <Camera className="w-2.5 h-2.5 mr-0.5"/> Evidencia
 </Badge>
 )}
 <span className={cn("font-mono text-[9px] font-bold", gradeColor(qualityGrade(m.lastEntry)))}>
 Calidad: {qualityGrade(m.lastEntry)}
 </span>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}

// ============================================================
// Mini Stat Widget
// ============================================================

function MiniStat({
 label,
 value,
 color,
}: {
 label: string;
 value: string;
 color?:"green"|"amber"|"red";
}) {
 const colorClass = color ==="green"?"text-green-600 dark:text-green-400": color ==="amber"?"text-amber-600 dark:text-amber-400": color ==="red"?"text-red-600 dark:text-red-400":"";
 return (
 <div className="bg-accent/20 border border-border p-2">
 <p className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground mb-0.5 truncate">
 {label}
 </p>
 <p className={cn("font-mono text-sm font-bold tabular-nums tracking-tight", colorClass)}>
 {value}
 </p>
 </div>
 );
}

// ============================================================
// Heatmap Row (per member)
// ============================================================

function HeatmapRow({ member: m }: { member: MemberSurveillance }) {
 // Build 7-day x 12-hour grid (hours 7-18)
 const hours = Array.from({ length: 12 }, (_, i) => i + 7);
 const days = Array.from({ length: 7 }, (_, i) => {
 const d = subDays(new Date(), 6 - i);
 return format(d,"yyyy-MM-dd");
 });

 const dayLabels = days.map((d) =>
 format(parseISO(d),"EEE", { locale: es }).slice(0, 2).toUpperCase()
 );

 // Count entries per slot
 const grid = new Map<string, number>();
 for (const e of m.entriesWeek) {
 const key =`${e.date}-${e.hour}`;
 grid.set(key, (grid.get(key) ?? 0) + 1);
 }

 const maxCount = Math.max(...Array.from(grid.values()), 1);

 return (
 <div className="card-palantir p-3">
 <div className="flex items-center gap-2 mb-2">
 <Avatar className="w-5 h-5 ring-1 ring-border">
 <AvatarImage src={m.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[7px] font-mono">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="font-mono text-[10px] font-medium truncate">
 {m.profile.full_name ?? m.profile.email}
 </span>
 </div>

 <div className="overflow-x-auto">
 <div className="min-w-[360px]">
 {/* Hour header */}
 <div className="flex items-center gap-0">
 <div className="w-8 shrink-0"/>
 {hours.map((h) => (
 <div
 key={h}
 className="flex-1 text-center font-mono text-[7px] text-muted-foreground">
 {h}
 </div>
 ))}
 </div>

 {/* Grid rows */}
 {days.map((day, di) => (
 <div key={day} className="flex items-center gap-0">
 <div className="w-8 shrink-0 font-mono text-[8px] text-muted-foreground text-right pr-1">
 {dayLabels[di]}
 </div>
 {hours.map((h) => {
 const count = grid.get(`${day}-${h}`) ?? 0;
 const intensity = count > 0 ? Math.max(0.15, count / maxCount) : 0;
 return (
 <div
 key={`${day}-${h}`}
 className="flex-1 aspect-square m-[1px] border border-border/20"style={{
 backgroundColor:
 count > 0
 ?`oklch(0.65 0.12 258 / ${intensity})`:"transparent",
 }}
 title={`${dayLabels[di]} ${h}:00 - ${count} entrada(s)`}
 />
 );
 })}
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}

// ============================================================
// Alerts Section
// ============================================================

function AlertsSection({ members }: { members: MemberSurveillance[] }) {
 const allActiveFlags = members.flatMap((m) =>
 m.activeFlags.map((f) => ({
 ...f,
 memberName: m.profile.full_name ?? m.profile.email,
 }))
 );

 const ghostMembers = members.filter((m) => m.isGhost);
 const behindMembers = members.filter((m) => {
 const behind = Math.max(0, m.expectedHours - m.hoursToday);
 return behind >= 2 && !m.isGhost;
 });

 const currentHour = getCurrentHourMTY();
 const escalationRisk = members.filter((m) => {
 if (m.isGhost) return false;
 const workStart = m.profile.work_start_hour ?? 7;
 const workEnd = m.profile.work_end_hour ?? 18;
 const isInWorkHours = currentHour >= workStart && currentHour < workEnd;
 if (!isInWorkHours) return false;
 // No entries in last 3 hours during work hours
 const recentEntries = m.entriesToday.filter((e) => e.hour >= currentHour - 3);
 return recentEntries.length === 0 && m.hoursToday < m.expectedHours - 3;
 });

 if (allActiveFlags.length === 0 && ghostMembers.length === 0 && behindMembers.length === 0 && escalationRisk.length === 0) {
 return (
 <div className="border border-border p-8 text-center">
 <Shield className="w-8 h-8 text-green-500/30 mx-auto mb-2"/>
 <p className="font-mono text-xs text-muted-foreground">Sin alertas activas</p>
 </div>
 );
 }

 return (
 <div className="space-y-2">
 {/* Active flags */}
 {allActiveFlags.map((f) => (
 <div
 key={f.id}
 className="flex items-center gap-3 p-3 border border-red-500/20 bg-red-500/5">
 <Flag className="w-3.5 h-3.5 text-red-500 shrink-0"/>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <span className="font-mono text-[11px] font-bold uppercase">
 {f.memberName}
 </span>
 <Badge variant="destructive"className="font-mono text-[8px]">
 {FLAG_TYPES[f.flag_type as keyof typeof FLAG_TYPES]?.emoji}{""}
 {FLAG_TYPES[f.flag_type as keyof typeof FLAG_TYPES]?.label ?? f.flag_type}
 </Badge>
 </div>
 {f.details && (
 <p className="font-mono text-[10px] text-muted-foreground mt-0.5 truncate">
 {f.details}
 </p>
 )}
 </div>
 <span className="font-mono text-[9px] text-muted-foreground tabular-nums shrink-0">
 {format(parseISO(f.date),"d MMM", { locale: es })}
 </span>
 </div>
 ))}

 {/* Ghost members */}
 {ghostMembers.map((m) => (
 <div
 key={m.userId +"-ghost"}
 className="flex items-center gap-3 p-3 border border-amber-500/20 bg-amber-500/5">
 <Ghost className="w-3.5 h-3.5 text-amber-500 shrink-0"/>
 <div className="flex-1 min-w-0">
 <span className="font-mono text-[11px] font-bold uppercase">
 {m.profile.full_name ?? m.profile.email}
 </span>
 <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400 ml-2">
 FANTASMA - {m.daysInactive === 999 ?"Sin actividad":`${m.daysInactive} dias sin registrar`}
 </span>
 </div>
 </div>
 ))}

 {/* Behind members */}
 {behindMembers.map((m) => {
 const behind = Math.max(0, m.expectedHours - m.hoursToday);
 return (
 <div
 key={m.userId +"-behind"}
 className="flex items-center gap-3 p-3 border border-orange-500/20 bg-orange-500/5">
 <Clock className="w-3.5 h-3.5 text-orange-500 shrink-0"/>
 <div className="flex-1 min-w-0">
 <span className="font-mono text-[11px] font-bold uppercase">
 {m.profile.full_name ?? m.profile.email}
 </span>
 <span className="font-mono text-[10px] text-orange-600 dark:text-orange-400 ml-2">
 ATRASADO - {behind}h detras ({m.hoursToday}/{m.expectedHours}h)
 </span>
 </div>
 </div>
 );
 })}

 {/* Escalation risk */}
 {escalationRisk.map((m) => (
 <div
 key={m.userId +"-escalation"}
 className="flex items-center gap-3 p-3 border border-red-500/30 bg-red-500/8 animate-pulse">
 <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0"/>
 <div className="flex-1 min-w-0">
 <span className="font-mono text-[11px] font-bold uppercase">
 {m.profile.full_name ?? m.profile.email}
 </span>
 <span className="font-mono text-[10px] text-red-600 dark:text-red-400 ml-2">
 RIESGO ESCALACION - 3+ horas sin registrar en horario laboral
 </span>
 </div>
 </div>
 ))}
 </div>
 );
}

// ============================================================
// Activity Log
// ============================================================

function ActivityLog({ events }: { events: ActivityEvent[] }) {
 if (events.length === 0) {
 return (
 <div className="border border-border p-8 text-center">
 <Activity className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2"/>
 <p className="font-mono text-xs text-muted-foreground">Sin actividad registrada hoy</p>
 </div>
 );
 }

 return (
 <div className="border border-border divide-y divide-border max-h-[400px] overflow-y-auto">
 {events.slice(0, 50).map((event) => {
 const colorClass =
 event.type ==="positive"?"text-green-600 dark:text-green-400": event.type ==="negative"?"text-red-600 dark:text-red-400":"text-amber-600 dark:text-amber-400";

 const dotColor =
 event.type ==="positive"?"bg-green-500": event.type ==="negative"?"bg-red-500":"bg-amber-500";

 return (
 <div key={event.id} className="flex items-start gap-3 p-2 hover:bg-accent/10 transition-colors">
 <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", dotColor)} />
 <span className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0 w-14">
 {format(new Date(event.timestamp),"HH:mm:ss")}
 </span>
 <span className={cn("font-mono text-[10px] font-bold uppercase shrink-0 w-28 truncate", colorClass)}>
 {event.userName}
 </span>
 <span className="font-mono text-[10px] text-muted-foreground/60 shrink-0 w-24 truncate">
 {event.action}
 </span>
 <span className="font-mono text-[10px] text-muted-foreground truncate flex-1">
 {event.details}
 </span>
 </div>
 );
 })}
 </div>
 );
}
