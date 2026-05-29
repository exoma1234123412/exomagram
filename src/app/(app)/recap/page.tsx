"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
 Profile,
 TimeEntry,
 DailyCloseout,
 AccountabilityFlag,
 EntryReaction,
 WorkCategory,
} from "@/lib/types/database";
import {
 CATEGORIES,
 CATEGORY_COLORS,
 EXPECTED_DAILY_HOURS,
 WORK_HOURS,
} from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, getInitials, formatHourShort } from "@/lib/utils";
import { format, subDays, addDays } from "date-fns";
import { es } from "date-fns/locale";
import {
 ChevronLeft,
 ChevronRight,
 Clock,
 Shield,
 Users,
 Smile,
 Trophy,
 Star,
 AlertTriangle,
 CheckCircle2,
 XCircle,
 Copy,
 Printer,
 TrendingUp,
 Heart,
 Flag,
 Eye,
} from "lucide-react";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

interface MemberRecap {
 profile: Profile;
 entries: TimeEntry[];
 totalHours: number;
 proofHours: number;
 proofPercent: number;
 lateEntries: number;
 hasCloseout: boolean;
 closeout: DailyCloseout | null;
 mood: number | null;
 categoryBreakdown: Record<string, number>;
 hourMap: Map<number, WorkCategory>;
 flags: AccountabilityFlag[];
 reactionCount: number;
}

// ────────────────────────────────────────────────────────────────
// Timeline constants
// ────────────────────────────────────────────────────────────────

const TIMELINE_START = WORK_HOURS[0];
const TIMELINE_END = WORK_HOURS[WORK_HOURS.length - 1];
const TOTAL_SLOTS = TIMELINE_END - TIMELINE_START + 1;

// ────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────

export default function RecapPage() {
 const supabase = createClient();
 const [orgId, setOrgId] = useState<string | null>(null);
 const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
 const [members, setMembers] = useState<MemberRecap[]>([]);
 const [totalReactions, setTotalReactions] = useState(0);
 const [loading, setLoading] = useState(true);
 const [copied, setCopied] = useState(false);

 // Load org
 useEffect(() => {
 async function loadOrg() {
 const {
 data: { user },
 } = await supabase.auth.getUser();
 if (!user) return;
 const { data: membership } = await supabase
 .from("org_members")
 .select("org_id")
 .eq("user_id", user.id)
 .limit(1)
 .single();
 if (membership) setOrgId(membership.org_id);
 }
 loadOrg();
 }, []); // eslint-disable-line react-hooks/exhaustive-deps

 // Load data
 useEffect(() => {
 if (!orgId) return;

 async function loadRecap() {
 setLoading(true);

 // Fetch base data in parallel
 const [
 { data: orgMembers },
 { data: timeEntries },
 { data: closeouts },
 { data: flags },
 ] = await Promise.all([
 supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId),
 supabase
 .from("time_entries")
 .select("*")
 .eq("org_id", orgId)
 .eq("date", date),
 supabase
 .from("daily_closeouts")
 .select("*")
 .eq("org_id", orgId)
 .eq("date", date),
 supabase
 .from("accountability_flags")
 .select("*")
 .eq("org_id", orgId)
 .eq("date", date),
 ]);

 // Since we can't use entries in the reactions query before it resolves,
 // fetch reactions separately if entries exist
 const entryIds = (timeEntries ?? []).map((e: TimeEntry) => e.id);
 let reactionsData: EntryReaction[] = [];
 if (entryIds.length > 0) {
 const { data: rxns } = await supabase
 .from("entry_reactions")
 .select("*")
 .in("entry_id", entryIds);
 reactionsData = (rxns ?? []) as EntryReaction[];
 }

 const closeoutMap = new Map<string, DailyCloseout>();
 for (const c of (closeouts ?? []) as DailyCloseout[]) {
 closeoutMap.set(c.user_id, c);
 }

 const flagMap = new Map<string, AccountabilityFlag[]>();
 for (const f of (flags ?? []) as AccountabilityFlag[]) {
 const arr = flagMap.get(f.user_id) ?? [];
 arr.push(f);
 flagMap.set(f.user_id, arr);
 }

 const reactionCountByEntry = new Map<string, number>();
 for (const r of reactionsData) {
 reactionCountByEntry.set(
 r.entry_id,
 (reactionCountByEntry.get(r.entry_id) ?? 0) + 1
 );
 }

 const recaps: MemberRecap[] = (orgMembers ?? []).map((m) => {
 const profile = m.profiles as unknown as Profile;
 const userEntries = (timeEntries ?? []).filter(
 (e: TimeEntry) => e.user_id === m.user_id
 ) as TimeEntry[];

 const totalHours = userEntries.length;
 const proofEntries = userEntries.filter(
 (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
 );
 const proofHours = proofEntries.length;
 const proofPercent =
 totalHours > 0 ? Math.round((proofHours / totalHours) * 100) : 0;
 const lateEntries = userEntries.filter((e) => e.is_late).length;

 const closeout = closeoutMap.get(m.user_id) ?? null;
 const hasCloseout = !!closeout;

 // Mood: average from entries
 const moods = userEntries
 .map((e) => e.mood)
 .filter((m) => m !== null) as number[];
 const mood =
 moods.length > 0
 ? Math.round(moods.reduce((a, b) => a + b, 0) / moods.length)
 : null;

 // Category breakdown
 const categoryBreakdown: Record<string, number> = {};
 for (const e of userEntries) {
 categoryBreakdown[e.category] =
 (categoryBreakdown[e.category] ?? 0) + 1;
 }

 // Hour map
 const hourMap = new Map<number, WorkCategory>();
 for (const e of userEntries) {
 hourMap.set(e.hour, e.category as WorkCategory);
 }

 // Reaction count
 let reactionCount = 0;
 for (const e of userEntries) {
 reactionCount += reactionCountByEntry.get(e.id) ?? 0;
 }

 return {
 profile,
 entries: userEntries,
 totalHours,
 proofHours,
 proofPercent,
 lateEntries,
 hasCloseout,
 closeout,
 mood,
 categoryBreakdown,
 hourMap,
 flags: flagMap.get(m.user_id) ?? [],
 reactionCount,
 };
 });

 // Sort by total hours descending
 recaps.sort((a, b) => b.totalHours - a.totalHours);

 setMembers(recaps);
 setTotalReactions(reactionsData.length);
 setLoading(false);
 }

 loadRecap();
 }, [orgId, date]); // eslint-disable-line react-hooks/exhaustive-deps

 // ────────────────────────────────────────────────────────────────
 // Computed stats
 // ────────────────────────────────────────────────────────────────

 const teamTotalHours = useMemo(
 () => members.reduce((acc, m) => acc + m.totalHours, 0),
 [members]
 );

 const teamProofRate = useMemo(() => {
 const totalEntries = members.reduce((acc, m) => acc + m.totalHours, 0);
 const totalProof = members.reduce((acc, m) => acc + m.proofHours, 0);
 return totalEntries > 0
 ? Math.round((totalProof / totalEntries) * 100)
 : 0;
 }, [members]);

 const membersCompleted = useMemo(
 () => members.filter((m) => m.totalHours >= EXPECTED_DAILY_HOURS).length,
 [members]
 );

 const teamMoodAvg = useMemo(() => {
 const moods = members
 .map((m) => m.mood)
 .filter((m) => m !== null) as number[];
 return moods.length > 0
 ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1)
 :"--";
 }, [members]);

 const mvp = useMemo(() => {
 const withProof = members.filter((m) => m.proofHours > 0);
 if (withProof.length === 0) return null;
 return withProof.reduce((best, m) =>
 m.proofHours > best.proofHours ? m : best
 );
 }, [members]);

 const highlightFullProof = useMemo(
 () => members.filter((m) => m.proofPercent === 100 && m.totalHours > 0).length,
 [members]
 );

 const highlightCloseouts = useMemo(
 () => members.filter((m) => m.hasCloseout).length,
 [members]
 );

 const totalFlags = useMemo(
 () => members.reduce((acc, m) => acc + m.flags.length, 0),
 [members]
 );

 const lowlightNoLog = useMemo(
 () => members.filter((m) => m.totalHours === 0),
 [members]
 );

 const lowlightNoProof = useMemo(
 () =>
 members.filter((m) => m.totalHours > 0 && m.proofPercent === 0),
 [members]
 );

 const unresolvedFlags = useMemo(
 () =>
 members.flatMap((m) =>
 m.flags.filter((f) => !f.resolved).map((f) => ({ ...f, member: m }))
 ),
 [members]
 );

 // ────────────────────────────────────────────────────────────────
 // Date navigation
 // ────────────────────────────────────────────────────────────────

 const isToday = date === new Date().toISOString().split("T")[0];
 const displayDate = format(new Date(date +"T12:00:00"),"EEEE, d 'de' MMMM yyyy", {
 locale: es,
 });

 const goPrev = useCallback(() => {
 setDate(subDays(new Date(date +"T12:00:00"), 1).toISOString().split("T")[0]);
 }, [date]);

 const goNext = useCallback(() => {
 setDate(addDays(new Date(date +"T12:00:00"), 1).toISOString().split("T")[0]);
 }, [date]);

 const goToday = useCallback(() => {
 setDate(new Date().toISOString().split("T")[0]);
 }, []);

 // ────────────────────────────────────────────────────────────────
 // Copy as markdown
 // ────────────────────────────────────────────────────────────────

 const generateMarkdown = useCallback(() => {
 const lines: string[] = [];
 lines.push(`# Resumen del Dia - ${displayDate}`);
 lines.push("");
 lines.push(`## Estadisticas del equipo`);
 lines.push(`- Horas totales: ${teamTotalHours}h`);
 lines.push(`- Tasa de evidencia: ${teamProofRate}%`);
 lines.push(`- Completaron ${EXPECTED_DAILY_HOURS}h: ${membersCompleted}/${members.length}`);
 lines.push(`- Animo promedio: ${teamMoodAvg}`);
 lines.push("");

 if (mvp) {
 lines.push(`## MVP del dia`);
 lines.push(
`${mvp.profile.full_name ?? mvp.profile.email} - ${mvp.proofHours}h con evidencia (${mvp.proofPercent}%)`);
 lines.push("");
 }

 lines.push(`## Ranking`);
 lines.push(`| # | Nombre | Horas | Evidencia | Tarde | Cierre |`);
 lines.push(`|---|--------|-------|-----------|-------|--------|`);
 members.forEach((m, i) => {
 lines.push(
`| ${i + 1} | ${m.profile.full_name ?? m.profile.email} | ${m.totalHours}h | ${m.proofPercent}% | ${m.lateEntries} | ${m.hasCloseout ?"Si":"No"} |`);
 });
 lines.push("");

 lines.push(`## Destacados`);
 lines.push(`- ${highlightFullProof} entradas con 100% evidencia`);
 lines.push(`- ${totalReactions} reacciones del equipo`);
 lines.push(`- ${highlightCloseouts} cierres del dia completados`);
 if (totalFlags > 0) lines.push(`- ${totalFlags} alertas levantadas`);
 lines.push("");

 if (lowlightNoLog.length > 0 || lowlightNoProof.length > 0) {
 lines.push(`## Atencion`);
 if (lowlightNoLog.length > 0) {
 lines.push(
`- Sin registro: ${lowlightNoLog.map((m) => m.profile.full_name ?? m.profile.email).join(",")}`);
 }
 if (lowlightNoProof.length > 0) {
 lines.push(
`- Sin evidencia: ${lowlightNoProof.map((m) => m.profile.full_name ?? m.profile.email).join(",")}`);
 }
 }

 return lines.join("\n");
 }, [
 displayDate,
 teamTotalHours,
 teamProofRate,
 membersCompleted,
 members,
 teamMoodAvg,
 mvp,
 highlightFullProof,
 totalReactions,
 highlightCloseouts,
 totalFlags,
 lowlightNoLog,
 lowlightNoProof,
 ]);

 const handleCopy = useCallback(async () => {
 await navigator.clipboard.writeText(generateMarkdown());
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 }, [generateMarkdown]);

 const handlePrint = useCallback(() => {
 window.print();
 }, []);

 // ────────────────────────────────────────────────────────────────
 // Render helpers
 // ────────────────────────────────────────────────────────────────

 function getRowColor(hours: number): string {
 if (hours >= EXPECTED_DAILY_HOURS) return"bg-green-50 dark:bg-green-950/30";
 if (hours >= 4) return"bg-yellow-50 dark:bg-yellow-950/20";
 return"bg-red-50 dark:bg-red-950/20";
 }

 function getMoodEmoji(mood: number): string {
 if (mood >= 4.5) return"😄";
 if (mood >= 3.5) return"🙂";
 if (mood >= 2.5) return"😐";
 if (mood >= 1.5) return"😕";
 return"😞";
 }

 // ────────────────────────────────────────────────────────────────
 // Render
 // ────────────────────────────────────────────────────────────────

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 print:px-8 print:py-4">
 {/* ── Header ─────────────────────────────────────────── */}
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
 <div>
 <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
 <Eye className="w-6 h-6 text-primary"/>
 Resumen del Dia
 </h1>
 <p className="text-muted-foreground text-sm capitalize mt-1">
 {displayDate}
 </p>
 </div>

 {/* Date nav */}
 <div className="flex items-center gap-2 print:hidden">
 <Button variant="outline"size="icon"className=""onClick={goPrev}>
 <ChevronLeft className="w-4 h-4"/>
 </Button>
 <Input
 type="date"value={date}
 onChange={(e) => setDate(e.target.value)}
 className="w-auto"/>
 <Button variant="outline"size="icon"className=""onClick={goNext}>
 <ChevronRight className="w-4 h-4"/>
 </Button>
 {!isToday && (
 <Button variant="ghost"size="sm"className=""onClick={goToday}>
 Hoy
 </Button>
 )}
 </div>
 </div>

 {loading ? (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">
 Cargando...
 </p>
 </div>
 ) : (
 <div className="space-y-8">
 {/* ── 1. Hero Stats ─────────────────────────────── */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
 <Card className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-5 text-center">
 <div className="inline-flex items-center justify-center w-10 h-10 bg-accent/40 mb-2">
 <Clock className="w-5 h-5 text-primary"/>
 </div>
 <p className="text-3xl font-bold tabular-nums tracking-tight">
 {teamTotalHours}
 <span className="text-lg text-muted-foreground font-normal">h</span>
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 Horas del equipo
 </p>
 </CardContent>
 </Card>

 <Card className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-5 text-center">
 <div className="inline-flex items-center justify-center w-10 h-10 bg-accent/40 mb-2">
 <Shield className="w-5 h-5 text-primary"/>
 </div>
 <p
 className={cn(
"text-3xl font-bold tabular-nums tracking-tight",
 teamProofRate >= 80
 ?"text-green-600": teamProofRate >= 50
 ?"text-yellow-600":"text-red-600")}
 >
 {teamProofRate}
 <span className="text-lg font-normal">%</span>
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 Tasa de evidencia
 </p>
 </CardContent>
 </Card>

 <Card className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-5 text-center">
 <div className="inline-flex items-center justify-center w-10 h-10 bg-accent/40 mb-2">
 <Users className="w-5 h-5 text-primary"/>
 </div>
 <p className="text-3xl font-bold tabular-nums tracking-tight">
 {membersCompleted}
 <span className="text-lg text-muted-foreground font-normal">
 /{members.length}
 </span>
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 Completaron {EXPECTED_DAILY_HOURS}h
 </p>
 </CardContent>
 </Card>

 <Card className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-5 text-center">
 <div className="inline-flex items-center justify-center w-10 h-10 bg-accent/40 mb-2">
 <Smile className="w-5 h-5 text-primary"/>
 </div>
 <p className="text-3xl font-bold tabular-nums tracking-tight">
 {teamMoodAvg}
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 {typeof teamMoodAvg ==="string"&& teamMoodAvg !=="--"? getMoodEmoji(parseFloat(teamMoodAvg))
 :""}{""}
 Animo promedio
 </p>
 </CardContent>
 </Card>
 </div>

 {/* ── 2. MVP of the Day ────────────────────────── */}
 {mvp && mvp.proofHours > 0 && (
 <Card className="transition-all duration-300 hover:border-primary/30 border-yellow-300/60 dark:border-yellow-700/40 shadow-yellow-500/10 ring-1 ring-yellow-300/30 overflow-hidden">
 <CardContent className="p-6">
 <div className="flex items-center gap-2 mb-4">
 <Trophy className="w-5 h-5 text-yellow-500"/>
 <h2 className="font-bold text-lg tracking-tight">
 MVP del dia
 </h2>
 <Badge
 variant="secondary"className="text-[10px] gap-1 ml-auto">
 <Star className="w-3 h-3 text-yellow-500"/>
 Player of the day
 </Badge>
 </div>

 <div className="flex flex-col sm:flex-row items-center gap-6">
 {/* Avatar */}
 <div className="relative">
 <Avatar className="w-20 h-20 ring-4 ring-yellow-200 dark:ring-yellow-800">
 <AvatarImage
 src={mvp.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-yellow-100 to-yellow-200 dark:from-yellow-900 dark:to-yellow-800">
 {getInitials(mvp.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center shadow-md">
 <Trophy className="w-4 h-4 text-yellow-900"/>
 </div>
 </div>

 {/* Name & stats */}
 <div className="flex-1 text-center sm:text-left">
 <h3 className="text-xl font-bold">
 {mvp.profile.full_name ?? mvp.profile.email}
 </h3>
 {mvp.profile.role && (
 <p className="text-sm text-muted-foreground">
 {mvp.profile.role}
 </p>
 )}

 <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3">
 <div className="bg-accent/40 px-3 py-1.5 text-center">
 <p className="text-lg font-bold tabular-nums tracking-tight">
 {mvp.totalHours}h
 </p>
 <p className="text-[10px] text-muted-foreground">
 Total
 </p>
 </div>
 <div className="bg-accent/40 px-3 py-1.5 text-center">
 <p className="text-lg font-bold tabular-nums tracking-tight text-green-600">
 {mvp.proofPercent}%
 </p>
 <p className="text-[10px] text-muted-foreground">
 Evidencia
 </p>
 </div>
 <div className="bg-accent/40 px-3 py-1.5 text-center">
 <p className="text-lg font-bold tabular-nums tracking-tight">
 {mvp.lateEntries}
 </p>
 <p className="text-[10px] text-muted-foreground">
 Tarde
 </p>
 </div>
 </div>
 </div>

 {/* Category breakdown */}
 <div className="flex flex-wrap gap-1.5 sm:max-w-[180px] justify-center sm:justify-end">
 {Object.entries(mvp.categoryBreakdown)
 .sort(([, a], [, b]) => b - a)
 .map(([cat, hours]) => (
 <Badge
 key={cat}
 variant="secondary"className="text-[10px] gap-1">
 {CATEGORIES[cat as WorkCategory]?.emoji}{""}
 {CATEGORIES[cat as WorkCategory]?.label} {hours}h
 </Badge>
 ))}
 </div>
 </div>
 </CardContent>
 </Card>
 )}

 {/* ── 3. Team Ranking ──────────────────────────── */}
 <Card className="transition-all duration-300 hover:border-primary/30 overflow-hidden">
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-base">
 <TrendingUp className="w-4 h-4 text-primary"/>
 Ranking del equipo
 </CardTitle>
 </CardHeader>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b text-xs text-muted-foreground">
 <th className="text-left px-4 py-2.5 font-medium w-10">
 #
 </th>
 <th className="text-left px-4 py-2.5 font-medium">
 Nombre
 </th>
 <th className="text-center px-3 py-2.5 font-medium">
 Horas
 </th>
 <th className="text-center px-3 py-2.5 font-medium">
 Evidencia
 </th>
 <th className="text-center px-3 py-2.5 font-medium">
 Tarde
 </th>
 <th className="text-center px-3 py-2.5 font-medium">
 Cierre
 </th>
 </tr>
 </thead>
 <tbody>
 {members.map((m, i) => (
 <tr
 key={m.profile.id}
 className={cn(
"border-b last:border-b-0 transition-colors",
 getRowColor(m.totalHours)
 )}
 >
 <td className="px-4 py-2.5 font-bold text-muted-foreground tabular-nums">
 {i + 1}
 </td>
 <td className="px-4 py-2.5">
 <div className="flex items-center gap-2">
 <Avatar className="w-6 h-6 ring-2 ring-background">
 <AvatarImage
 src={m.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[10px]">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="font-medium truncate max-w-[160px]">
 {m.profile.full_name ?? m.profile.email}
 </span>
 </div>
 </td>
 <td className="text-center px-3 py-2.5">
 <span
 className={cn(
"font-bold tabular-nums tracking-tight",
 m.totalHours >= EXPECTED_DAILY_HOURS
 ?"text-green-600": m.totalHours >= 4
 ?"text-yellow-600":"text-red-600")}
 >
 {m.totalHours}h
 </span>
 </td>
 <td className="text-center px-3 py-2.5">
 <span
 className={cn(
"font-semibold tabular-nums",
 m.proofPercent >= 80
 ?"text-green-600": m.proofPercent >= 50
 ?"text-yellow-600":"text-red-600")}
 >
 {m.proofPercent}%
 </span>
 </td>
 <td className="text-center px-3 py-2.5 tabular-nums">
 {m.lateEntries > 0 ? (
 <span className="text-orange-600 font-semibold">
 {m.lateEntries}
 </span>
 ) : (
 <span className="text-green-600">0</span>
 )}
 </td>
 <td className="text-center px-3 py-2.5">
 {m.hasCloseout ? (
 <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto"/>
 ) : (
 <XCircle className="w-4 h-4 text-red-400 mx-auto"/>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>

 {members.length === 0 && (
 <div className="flex flex-col items-center justify-center py-12 gap-4">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center">
 <Users className="w-7 h-7 text-primary/40"/>
 </div>
 <p className="text-sm text-muted-foreground">
 No hay miembros en esta organizacion.
 </p>
 </div>
 )}
 </div>
 </CardContent>
 </Card>

 {/* ── 4. Hour-by-Hour Timeline ─────────────────── */}
 <Card className="transition-all duration-300 hover:border-primary/30 overflow-hidden">
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-base">
 <Clock className="w-4 h-4 text-primary"/>
 Linea de tiempo
 </CardTitle>
 </CardHeader>
 <CardContent className="p-4">
 {/* Hour labels */}
 <div className="flex items-center mb-1 pl-[120px] sm:pl-[160px]">
 {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
 <div
 key={i}
 className="flex-1 text-[9px] text-muted-foreground text-center truncate">
 {formatHourShort(TIMELINE_START + i)}
 </div>
 ))}
 </div>

 {/* Rows */}
 <div className="space-y-1">
 {members.map((m) => (
 <div key={m.profile.id} className="flex items-center gap-2">
 {/* Name */}
 <div className="w-[120px] sm:w-[160px] flex items-center gap-1.5 shrink-0">
 <Avatar className="w-5 h-5 ring-1 ring-background">
 <AvatarImage
 src={m.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[8px]">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs truncate font-medium">
 {m.profile.full_name ?? m.profile.email}
 </span>
 </div>

 {/* Timeline bar */}
 <div className="flex flex-1 h-6 rounded-md overflow-hidden bg-muted/30 border border-border/40">
 {Array.from({ length: TOTAL_SLOTS }, (_, i) => {
 const hour = TIMELINE_START + i;
 const cat = m.hourMap.get(hour);
 return (
 <div
 key={i}
 className={cn(
"flex-1 transition-colors border-r border-border/20 last:border-r-0",
 cat
 ? CATEGORY_COLORS[cat] ??"bg-primary":"bg-transparent")}
 title={
 cat
 ?`${formatHourShort(hour)} - ${CATEGORIES[cat]?.label}`:`${formatHourShort(hour)} - Sin registro`}
 />
 );
 })}
 </div>
 </div>
 ))}
 </div>

 {/* Legend */}
 <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t">
 {(Object.keys(CATEGORIES) as WorkCategory[]).map((cat) => (
 <div key={cat} className="flex items-center gap-1">
 <div
 className={cn(
"w-2.5 h-2.5 rounded-sm",
 CATEGORY_COLORS[cat]
 )}
 />
 <span className="text-[10px] text-muted-foreground">
 {CATEGORIES[cat].label}
 </span>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* ── 5. Highlights ────────────────────────────── */}
 <Card className="transition-all duration-300 hover:border-primary/30 border-green-200/60 dark:border-green-800/30">
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-base">
 <Star className="w-4 h-4 text-green-600"/>
 Destacados
 </CardTitle>
 </CardHeader>
 <CardContent className="p-4">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/20 p-3">
 <div className="w-9 h-9 bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
 <Shield className="w-4 h-4 text-green-600"/>
 </div>
 <div>
 <p className="text-sm font-semibold tabular-nums">
 {highlightFullProof}{""}
 <span className="font-normal text-muted-foreground">
 {highlightFullProof === 1 ?"miembro":"miembros"} con 100% evidencia
 </span>
 </p>
 </div>
 </div>

 <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/20 p-3">
 <div className="w-9 h-9 bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
 <Heart className="w-4 h-4 text-green-600"/>
 </div>
 <div>
 <p className="text-sm font-semibold tabular-nums">
 {totalReactions}{""}
 <span className="font-normal text-muted-foreground">
 {totalReactions === 1 ?"reaccion":"reacciones"} del equipo
 </span>
 </p>
 </div>
 </div>

 <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/20 p-3">
 <div className="w-9 h-9 bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
 <CheckCircle2 className="w-4 h-4 text-green-600"/>
 </div>
 <div>
 <p className="text-sm font-semibold tabular-nums">
 {highlightCloseouts}{""}
 <span className="font-normal text-muted-foreground">
 {highlightCloseouts === 1
 ?"cierre del dia completado":"cierres del dia completados"}
 </span>
 </p>
 </div>
 </div>

 {totalFlags > 0 && (
 <div className="flex items-center gap-3 bg-yellow-50 dark:bg-yellow-950/20 p-3">
 <div className="w-9 h-9 bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center shrink-0">
 <Flag className="w-4 h-4 text-yellow-600"/>
 </div>
 <div>
 <p className="text-sm font-semibold tabular-nums">
 {totalFlags}{""}
 <span className="font-normal text-muted-foreground">
 {totalFlags === 1 ?"alerta levantada":"alertas levantadas"}
 </span>
 </p>
 </div>
 </div>
 )}
 </div>
 </CardContent>
 </Card>

 {/* ── 6. Lowlights ─────────────────────────────── */}
 {(lowlightNoLog.length > 0 ||
 lowlightNoProof.length > 0 ||
 unresolvedFlags.length > 0) && (
 <Card className="transition-all duration-300 hover:border-primary/30 border-red-200/60 dark:border-red-800/30">
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-base text-red-600">
 <AlertTriangle className="w-4 h-4"/>
 Atencion requerida
 </CardTitle>
 </CardHeader>
 <CardContent className="p-4 space-y-4">
 {/* No log */}
 {lowlightNoLog.length > 0 && (
 <div className="bg-red-50 dark:bg-red-950/20 p-4">
 <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1.5">
 <XCircle className="w-3.5 h-3.5"/>
 Sin registro hoy
 </p>
 <div className="flex flex-wrap gap-2">
 {lowlightNoLog.map((m) => (
 <div
 key={m.profile.id}
 className="flex items-center gap-1.5 bg-white dark:bg-red-900/30 px-2.5 py-1.5 border border-red-200 dark:border-red-800">
 <Avatar className="w-5 h-5 ring-1 ring-red-200">
 <AvatarImage
 src={m.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[8px]">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-medium">
 {m.profile.full_name ?? m.profile.email}
 </span>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* No proof */}
 {lowlightNoProof.length > 0 && (
 <div className="bg-red-50 dark:bg-red-950/20 p-4">
 <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1.5">
 <Shield className="w-3.5 h-3.5"/>
 0% evidencia
 </p>
 <div className="flex flex-wrap gap-2">
 {lowlightNoProof.map((m) => (
 <div
 key={m.profile.id}
 className="flex items-center gap-1.5 bg-white dark:bg-red-900/30 px-2.5 py-1.5 border border-red-200 dark:border-red-800">
 <Avatar className="w-5 h-5 ring-1 ring-red-200">
 <AvatarImage
 src={m.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[8px]">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-medium">
 {m.profile.full_name ?? m.profile.email}
 </span>
 <Badge variant="destructive"className="text-[9px]">
 {m.totalHours}h sin evidencia
 </Badge>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Unresolved flags */}
 {unresolvedFlags.length > 0 && (
 <div className="bg-red-50 dark:bg-red-950/20 p-4">
 <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1.5">
 <Flag className="w-3.5 h-3.5"/>
 Alertas sin resolver
 </p>
 <div className="space-y-1.5">
 {unresolvedFlags.map((f) => (
 <div
 key={f.id}
 className="flex items-center gap-2 bg-white dark:bg-red-900/30 px-2.5 py-1.5 border border-red-200 dark:border-red-800 text-xs">
 <Avatar className="w-5 h-5 ring-1 ring-red-200">
 <AvatarImage
 src={f.member.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[8px]">
 {getInitials(f.member.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="font-medium">
 {f.member.profile.full_name ??
 f.member.profile.email}
 </span>
 <Badge variant="destructive"className="text-[9px]">
 {f.flag_type.replace(/_/g,"")}
 </Badge>
 {f.details && (
 <span className="text-muted-foreground truncate max-w-[200px]">
 {f.details}
 </span>
 )}
 </div>
 ))}
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 )}

 {/* ── 7. Share Button ──────────────────────────── */}
 <div className="flex items-center justify-center gap-3 pt-2 print:hidden">
 <Button
 variant="outline"className="gap-2"onClick={handleCopy}
 >
 <Copy className="w-4 h-4"/>
 {copied ?"Copiado":"Copiar como markdown"}
 </Button>
 <Button
 variant="outline"className="gap-2"onClick={handlePrint}
 >
 <Printer className="w-4 h-4"/>
 Imprimir
 </Button>
 </div>
 </div>
 )}
 </div>
 );
}
