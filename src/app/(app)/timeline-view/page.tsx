"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { TimeEntry, Profile, LiveStatus } from "@/lib/types/database";
import type { WorkCategory } from "@/lib/types/database";
import { CATEGORIES, WORK_HOURS, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { cn, formatHourShort, getInitials } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Tooltip,
 TooltipContent,
 TooltipProvider,
 TooltipTrigger,
} from "@/components/ui/tooltip";
import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
 ChevronLeft,
 ChevronRight,
 Clock,
 AlertTriangle,
 ShieldCheck,
 ArrowUpDown,
 GanttChart,
 Wifi,
 WifiOff,
} from "lucide-react";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

type EntryWithProfile = TimeEntry & { profiles: Profile };

interface MemberRow {
 profile: Profile;
 entries: Map<number, TimeEntry>;
 liveStatus: LiveStatus | null;
 hoursLogged: number;
 hoursWithProof: number;
 gaps: number;
 gapRanges: GapRange[];
}

interface GapRange {
 start: number;
 end: number;
 onlineButMissing: boolean;
}

type SortMode ="name"|"hours_asc"|"hours_desc"|"gaps";

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const TIMELINE_START = WORK_HOURS[0]; // 7
const TIMELINE_END = WORK_HOURS[WORK_HOURS.length - 1]; // 18
const TOTAL_HOURS = TIMELINE_END - TIMELINE_START + 1; // 12

const CATEGORY_BG: Record<string, string> = {
 deep_work:"bg-violet-500 dark:bg-violet-600",
 meeting:"bg-blue-500 dark:bg-blue-600",
 review:"bg-amber-500 dark:bg-amber-600",
 admin:"bg-slate-400 dark:bg-slate-500",
 planning:"bg-emerald-500 dark:bg-emerald-600",
 learning:"bg-pink-500 dark:bg-pink-600",
 break:"bg-green-400 dark:bg-green-500",
 blocked:"bg-red-500 dark:bg-red-600",
};

const CATEGORY_GRADIENT: Record<string, string> = {
 deep_work:"from-violet-400 to-violet-600",
 meeting:"from-blue-400 to-blue-600",
 review:"from-amber-400 to-amber-600",
 admin:"from-slate-300 to-slate-500",
 planning:"from-emerald-400 to-emerald-600",
 learning:"from-pink-400 to-pink-600",
 break:"from-green-300 to-green-500",
 blocked:"from-red-400 to-red-600",
};

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function getCurrentHourFraction(dateStr: string): number | null {
 const today = new Date().toISOString().split("T")[0];
 if (dateStr !== today) return null;
 const now = new Date();
 const hours = now.getHours();
 const minutes = now.getMinutes();
 const fractional = hours + minutes / 60;
 if (fractional < TIMELINE_START || fractional > TIMELINE_END + 1) return null;
 return fractional;
}

function isPastHour(hour: number, dateStr: string): boolean {
 const today = new Date().toISOString().split("T")[0];
 if (dateStr < today) return true;
 if (dateStr > today) return false;
 return hour < new Date().getHours();
}

function detectGapRanges(
 entries: Map<number, TimeEntry>,
 liveStatus: LiveStatus | null,
 dateStr: string
): GapRange[] {
 const ranges: GapRange[] = [];
 let currentRange: GapRange | null = null;
 const isOnline =
 liveStatus != null && liveStatus.status !=="offline";

 for (const hour of WORK_HOURS) {
 const hasEntry = entries.has(hour);
 const past = isPastHour(hour, dateStr);

 if (!hasEntry && past) {
 if (currentRange) {
 currentRange.end = hour;
 } else {
 currentRange = {
 start: hour,
 end: hour,
 onlineButMissing: isOnline,
 };
 }
 } else {
 if (currentRange) {
 ranges.push(currentRange);
 currentRange = null;
 }
 }
 }
 if (currentRange) {
 ranges.push(currentRange);
 }

 return ranges;
}

function consecutiveGapCount(ranges: GapRange[]): number {
 return ranges.filter((r) => r.end - r.start >= 1).length;
}

// ────────────────────────────────────────────────────────────────
// Component: TimelineBlock
// ────────────────────────────────────────────────────────────────

function TimelineBlock({
 hour,
 entry,
 dateStr,
 gapRange,
}: {
 hour: number;
 entry: TimeEntry | undefined;
 dateStr: string;
 gapRange: GapRange | undefined;
}) {
 const past = isPastHour(hour, dateStr);
 const isMissing = !entry && past;
 const isGapStart = gapRange && gapRange.start === hour;
 const gapLength = gapRange ? gapRange.end - gapRange.start + 1 : 0;
 const isInConsecutiveGap = gapRange && gapLength >= 2;

 if (entry) {
 const cat = CATEGORIES[entry.category as WorkCategory];
 const gradient = CATEGORY_GRADIENT[entry.category];
 const hasProof = entry.proof_urls && entry.proof_urls.length > 0;

 return (
 <Tooltip>
 <TooltipTrigger
 className={cn(
"h-10 transition-all duration-200 cursor-default relative group",
"bg-gradient-to-br",
 gradient,
"opacity-80 hover:opacity-100 hover:scale-y-110")}
 >
 {entry.is_late && (
 <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-orange-400 ring-1 ring-white/50"/>
 )}
 {hasProof && (
 <div className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-green-300 ring-1 ring-white/50"/>
 )}
 </TooltipTrigger>
 <TooltipContent side="top"className="max-w-[260px]">
 <div className="space-y-1">
 <p className="font-semibold text-sm">
 {cat.emoji} {entry.title}
 </p>
 <p className="text-xs opacity-80">
 {cat.label} · {formatHourShort(hour)}
 </p>
 <div className="flex flex-wrap gap-1 mt-1">
 {hasProof ? (
 <span className="inline-flex items-center gap-0.5 text-[10px] text-green-300">
 <ShieldCheck className="w-3 h-3"/> Con evidencia
 </span>
 ) : (
 <span className="inline-flex items-center gap-0.5 text-[10px] text-yellow-300">
 <AlertTriangle className="w-3 h-3"/> Sin evidencia
 </span>
 )}
 {entry.is_late && (
 <span className="inline-flex items-center gap-0.5 text-[10px] text-orange-300">
 <Clock className="w-3 h-3"/> Tardio ({entry.minutes_late}min)
 </span>
 )}
 </div>
 {entry.verification_status !=="unverified"&& (
 <p className="text-[10px] opacity-70 mt-0.5">
 Estado: {entry.verification_status}
 </p>
 )}
 </div>
 </TooltipContent>
 </Tooltip>
 );
 }

 if (isMissing) {
 return (
 <Tooltip>
 <TooltipTrigger
 className={cn(
"h-10 transition-all duration-200 cursor-default relative",
"bg-gray-300/60 dark:bg-gray-700/60",
 isInConsecutiveGap &&
"border-2 border-dashed border-red-400 dark:border-red-500",
 gapRange?.onlineButMissing &&
"bg-red-200/60 dark:bg-red-900/40")}
 >
 {isGapStart && isInConsecutiveGap && (
 <div className="absolute -top-5 left-0 right-0 flex justify-center z-10 pointer-events-none">
 <span className="text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/80 px-1.5 py-0.5 rounded-md border border-red-200 dark:border-red-800 whitespace-nowrap">
 {gapLength}h sin registro
 </span>
 </div>
 )}
 </TooltipTrigger>
 <TooltipContent side="top"className="max-w-[220px]">
 <div className="space-y-1">
 <p className="font-semibold text-sm text-red-300">
 <AlertTriangle className="w-3 h-3 inline mr-1"/>
 Hora sin registro
 </p>
 <p className="text-xs opacity-80">{formatHourShort(hour)}</p>
 {gapRange?.onlineButMissing && (
 <p className="text-[10px] text-red-300 font-semibold mt-1">
 <Wifi className="w-3 h-3 inline mr-0.5"/>
 En linea pero sin registro
 </p>
 )}
 </div>
 </TooltipContent>
 </Tooltip>
 );
 }

 // Future hour - empty
 return (
 <div className="h-10 bg-muted/10 dark:bg-muted/5"/>
 );
}

// ────────────────────────────────────────────────────────────────
// Component: MemberTimelineRow
// ────────────────────────────────────────────────────────────────

function MemberTimelineRow({
 row,
 dateStr,
}: {
 row: MemberRow;
 dateStr: string;
}) {
 const proofPercent =
 row.hoursLogged > 0
 ? Math.round((row.hoursWithProof / row.hoursLogged) * 100)
 : 0;

 const hasAlarmingGaps = row.gapRanges.some(
 (g) => g.end - g.start >= 1
 );

 return (
 <div
 className={cn(
"flex items-stretch gap-3 py-3 px-4 transition-all duration-200",
"hover:bg-accent/30",
 hasAlarmingGaps &&
"bg-red-50/50 dark:bg-red-950/10 border border-red-200/50 dark:border-red-900/30",
 !hasAlarmingGaps &&"border border-transparent")}
 >
 {/* Person info - left column */}
 <div className="flex flex-col items-center gap-1.5 w-[80px] shrink-0 justify-center">
 <Avatar className="w-9 h-9 ring-2 ring-background">
 <AvatarImage src={row.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[10px] font-semibold bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/40 dark:to-sky-900/30">
 {getInitials(row.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="text-[11px] font-semibold truncate max-w-[76px] text-center text-foreground">
 {row.profile.full_name?.split("")[0] ??"?"}
 </span>
 {row.liveStatus && row.liveStatus.status !=="offline"? (
 <span className="flex items-center gap-1 text-[9px] text-green-600 dark:text-green-400 font-medium">
 <span className="relative flex h-1.5 w-1.5">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"/>
 <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"/>
 </span>
 En linea
 </span>
 ) : (
 <span className="flex items-center gap-1 text-[9px] text-muted-foreground font-medium">
 <WifiOff className="w-2.5 h-2.5"/>
 Offline
 </span>
 )}
 </div>

 {/* Timeline blocks - center */}
 <div className="flex-1 min-w-0">
 <div
 className="grid gap-1 relative"style={{ gridTemplateColumns:`repeat(${TOTAL_HOURS}, 1fr)`}}
 >
 {WORK_HOURS.map((hour) => {
 const entry = row.entries.get(hour);
 const gapRange = row.gapRanges.find(
 (g) => hour >= g.start && hour <= g.end
 );
 return (
 <TimelineBlock
 key={hour}
 hour={hour}
 entry={entry}
 dateStr={dateStr}
 gapRange={gapRange}
 />
 );
 })}

 {/* Current time marker */}
 <CurrentTimeMarker dateStr={dateStr} />
 </div>
 </div>

 {/* Summary - right column */}
 <div className="flex flex-col justify-center gap-1 w-[110px] shrink-0 pl-2 border-l border-border/30">
 <div className="flex items-baseline gap-1">
 <span
 className={cn(
"text-base font-bold tabular-nums",
 row.hoursLogged >= EXPECTED_DAILY_HOURS
 ?"text-green-600": row.hoursLogged >= 4
 ?"text-yellow-600":"text-red-600")}
 >
 {row.hoursLogged}
 </span>
 <span className="text-[10px] text-muted-foreground">
 /{EXPECTED_DAILY_HOURS}h
 </span>
 </div>

 <div className="flex items-center gap-1">
 <AlertTriangle
 className={cn(
"w-3 h-3",
 row.gaps > 0 ?"text-red-500":"text-muted-foreground")}
 />
 <span
 className={cn(
"text-xs font-semibold tabular-nums",
 row.gaps > 0 ?"text-red-600":"text-muted-foreground")}
 >
 {row.gaps} gap{row.gaps !== 1 ?"s":""}
 </span>
 </div>

 <div className="flex items-center gap-1">
 <ShieldCheck
 className={cn(
"w-3 h-3",
 proofPercent >= 80
 ?"text-green-500": proofPercent >= 50
 ?"text-yellow-500":"text-red-500")}
 />
 <span
 className={cn(
"text-xs font-semibold tabular-nums",
 proofPercent >= 80
 ?"text-green-600": proofPercent >= 50
 ?"text-yellow-600":"text-red-600")}
 >
 {proofPercent}%
 </span>
 </div>
 </div>
 </div>
 );
}

// ────────────────────────────────────────────────────────────────
// Component: CurrentTimeMarker
// ────────────────────────────────────────────────────────────────

function CurrentTimeMarker({ dateStr }: { dateStr: string }) {
 const [now, setNow] = useState(new Date());

 useEffect(() => {
 const interval = setInterval(() => setNow(new Date()), 60_000);
 return () => clearInterval(interval);
 }, []);

 const fractional = getCurrentHourFraction(dateStr);
 if (fractional === null) return null;

 const position =
 ((fractional - TIMELINE_START) / TOTAL_HOURS) * 100;

 return (
 <div
 className="absolute top-0 bottom-0 z-20 pointer-events-none"style={{ left:`${position}%`}}
 >
 {/* Vertical line */}
 <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 shadow-red-500/30"/>
 {/* Pulse dot at top */}
 <div className="absolute -top-1 -translate-x-1/2 left-[1px]">
 <span className="relative flex h-3 w-3">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"/>
 <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-white dark:border-gray-900"/>
 </span>
 </div>
 {/* Time label */}
 <div className="absolute -top-6 -translate-x-1/2 left-[1px]">
 <span className="text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/80 px-1.5 py-0.5 rounded-md border border-red-200 dark:border-red-800 whitespace-nowrap tabular-nums">
 {format(now,"HH:mm")}
 </span>
 </div>
 </div>
 );
}

// ────────────────────────────────────────────────────────────────
// Component: TimelineHeader (hour labels)
// ────────────────────────────────────────────────────────────────

function TimelineHeader({ dateStr }: { dateStr: string }) {
 return (
 <div className="flex items-stretch gap-3 px-4 mb-1">
 <div className="w-[80px] shrink-0"/>
 <div className="flex-1 min-w-0">
 <div
 className="grid gap-1 relative"style={{ gridTemplateColumns:`repeat(${TOTAL_HOURS}, 1fr)`}}
 >
 {WORK_HOURS.map((hour) => (
 <div
 key={hour}
 className="text-center text-[10px] text-muted-foreground/60 font-semibold tabular-nums py-1">
 {formatHourShort(hour)}
 </div>
 ))}
 </div>
 </div>
 <div className="w-[110px] shrink-0 pl-2"/>
 </div>
 );
}

// ────────────────────────────────────────────────────────────────
// Component: Legend
// ────────────────────────────────────────────────────────────────

function TimelineLegend() {
 return (
 <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-6 pt-5 border-t border-border/30 px-4">
 {Object.entries(CATEGORIES).map(([key, cat]) => (
 <div key={key} className="flex items-center gap-2">
 <div className={cn("w-3 h-3 rounded-sm", CATEGORY_BG[key])} />
 <span className="text-[11px] text-muted-foreground/70 font-medium">
 {cat.label}
 </span>
 </div>
 ))}
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-gray-600"/>
 <span className="text-[11px] text-muted-foreground/70 font-medium">
 Sin registro (pasado)
 </span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded-sm bg-red-200 dark:bg-red-900/60 border border-dashed border-red-400"/>
 <span className="text-[11px] text-red-500 font-medium">
 Brecha consecutiva
 </span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded-sm bg-muted/20"/>
 <span className="text-[11px] text-muted-foreground/70 font-medium">
 Futuro
 </span>
 </div>
 </div>
 );
}

// ────────────────────────────────────────────────────────────────
// Component: SummaryBar (team-level)
// ────────────────────────────────────────────────────────────────

function SummaryBar({ rows }: { rows: MemberRow[] }) {
 const total = rows.length;
 if (total === 0) return null;

 const totalHours = rows.reduce((s, r) => s + r.hoursLogged, 0);
 const totalGaps = rows.reduce((s, r) => s + r.gaps, 0);
 const totalProof = rows.reduce((s, r) => s + r.hoursWithProof, 0);
 const avgHours = (totalHours / total).toFixed(1);
 const proofPercent =
 totalHours > 0 ? Math.round((totalProof / totalHours) * 100) : 0;
 const withGaps = rows.filter((r) => r.gaps > 0).length;

 return (
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
 <Card className="border-border/50 shadow-none">
 <CardContent className="p-4 text-center">
 <p className="text-2xl font-bold tabular-nums text-foreground">
 {avgHours}
 </p>
 <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
 Promedio horas/persona
 </p>
 </CardContent>
 </Card>
 <Card className="border-border/50 shadow-none">
 <CardContent className="p-4 text-center">
 <p
 className={cn(
"text-2xl font-bold tabular-nums",
 totalGaps > 0 ?"text-red-600":"text-green-600")}
 >
 {totalGaps}
 </p>
 <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
 Brechas totales
 </p>
 </CardContent>
 </Card>
 <Card className="border-border/50 shadow-none">
 <CardContent className="p-4 text-center">
 <p
 className={cn(
"text-2xl font-bold tabular-nums",
 proofPercent >= 80
 ?"text-green-600": proofPercent >= 50
 ?"text-yellow-600":"text-red-600")}
 >
 {proofPercent}%
 </p>
 <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
 Con evidencia
 </p>
 </CardContent>
 </Card>
 <Card className="border-border/50 shadow-none">
 <CardContent className="p-4 text-center">
 <p
 className={cn(
"text-2xl font-bold tabular-nums",
 withGaps > 0 ?"text-orange-600":"text-green-600")}
 >
 {withGaps}/{total}
 </p>
 <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
 Con brechas hoy
 </p>
 </CardContent>
 </Card>
 </div>
 );
}

// ────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────

export default function TimelineViewPage() {
 const { orgId, loading: orgLoading } = useOrg();
 const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
 const [entries, setEntries] = useState<EntryWithProfile[]>([]);
 const [members, setMembers] = useState<Profile[]>([]);
 const [liveStatuses, setLiveStatuses] = useState<LiveStatus[]>([]);
 const [loading, setLoading] = useState(true);
 const [sortMode, setSortMode] = useState<SortMode>("gaps");
 const supabase = createClient();

 // Load data
 const loadData = useCallback(async () => {
 if (!orgId) return;
 setLoading(true);

 const [membersRes, entriesRes, statusRes] = await Promise.all([
 supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId)
 ,
 supabase
 .from("time_entries")
 .select("*, profiles(*)")
 .eq("org_id", orgId)
 .eq("date", date)
 ,
 supabase
 .from("live_status")
 .select("*")
 .eq("org_id", orgId)
 ,
 ]);

 if (membersRes.data) {
 setMembers(membersRes.data.map((m) => m.profiles));
 }
 setEntries(entriesRes.data ?? []);
 setLiveStatuses(statusRes.data ?? []);
 setLoading(false);
 }, [orgId, date]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 loadData();
 }, [loadData]);

 // Realtime subscription
 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("timeline_realtime")
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
 table:"live_status",
 filter:`org_id=eq.${orgId}`,
 },
 async () => {
 const { data } = await supabase
 .from("live_status")
 .select("*")
 .eq("org_id", orgId)
 ;
 setLiveStatuses(data ?? []);
 }
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, date]); // eslint-disable-line react-hooks/exhaustive-deps

 // Build rows
 const rows = useMemo<MemberRow[]>(() => {
 const statusMap = new Map<string, LiveStatus>();
 for (const s of liveStatuses) {
 statusMap.set(s.user_id, s);
 }

 return members.map((profile) => {
 const userEntries = entries.filter((e) => e.user_id === profile.id);
 const entryMap = new Map<number, TimeEntry>();
 for (const e of userEntries) {
 entryMap.set(e.hour, e);
 }

 const liveStatus = statusMap.get(profile.id) ?? null;
 const gapRanges = detectGapRanges(entryMap, liveStatus, date);
 const totalGapHours = gapRanges.reduce(
 (s, g) => s + (g.end - g.start + 1),
 0
 );
 const withProof = userEntries.filter(
 (e) => e.proof_urls && e.proof_urls.length > 0
 );

 return {
 profile,
 entries: entryMap,
 liveStatus,
 hoursLogged: userEntries.length,
 hoursWithProof: withProof.length,
 gaps: totalGapHours,
 gapRanges,
 };
 });
 }, [members, entries, liveStatuses, date]);

 // Sort rows
 const sortedRows = useMemo(() => {
 const sorted = [...rows];
 switch (sortMode) {
 case"name":
 sorted.sort((a, b) =>
 (a.profile.full_name ??"").localeCompare(
 b.profile.full_name ??"")
 );
 break;
 case"hours_asc":
 sorted.sort((a, b) => a.hoursLogged - b.hoursLogged);
 break;
 case"hours_desc":
 sorted.sort((a, b) => b.hoursLogged - a.hoursLogged);
 break;
 case"gaps":
 sorted.sort((a, b) => {
 if (b.gaps !== a.gaps) return b.gaps - a.gaps;
 return a.hoursLogged - b.hoursLogged;
 });
 break;
 }
 return sorted;
 }, [rows, sortMode]);

 const isToday = date === new Date().toISOString().split("T")[0];
 const displayDate = format(
 new Date(date +"T12:00:00"),
"EEEE, d MMMM yyyy",
 { locale: es }
 );

 // ──────────────────────────────────────────────────────────────
 // Render: Loading
 // ──────────────────────────────────────────────────────────────

 if (orgLoading || (loading && !orgId)) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="flex flex-col items-center gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">
 Cargando...
 </p>
 </div>
 </div>
 );
 }

 if (!orgId) {
 return (
 <div className="flex items-center justify-center h-screen">
 <p className="text-muted-foreground">
 Primero crea o unete a un equipo desde el Dashboard.
 </p>
 </div>
 );
 }

 // ──────────────────────────────────────────────────────────────
 // Render: Main
 // ──────────────────────────────────────────────────────────────

 return (
 <TooltipProvider>
 <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-2">
 <div className="flex items-center gap-3">
 <GanttChart className="w-6 h-6 text-primary"/>
 <h1 className="text-2xl font-bold tracking-tight">
 Timeline del Equipo
 </h1>
 </div>
 <p className="text-muted-foreground text-sm mt-1 capitalize">
 {displayDate}
 </p>
 </div>

 {/* Controls */}
 <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6 mt-4">
 {/* Date navigation */}
 <div className="flex items-center gap-2 bg-card/80 border border-border/50 p-2">
 <Button
 variant="ghost"size="icon"className=""onClick={() =>
 setDate(
 subDays(new Date(date +"T12:00:00"), 1)
 .toISOString()
 .split("T")[0]
 )
 }
 >
 <ChevronLeft className="w-4 h-4"/>
 </Button>
 <Input
 type="date"value={date}
 onChange={(e) => setDate(e.target.value)}
 className="w-auto border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto"/>
 <Button
 variant="ghost"size="icon"className=""onClick={() =>
 setDate(
 addDays(new Date(date +"T12:00:00"), 1)
 .toISOString()
 .split("T")[0]
 )
 }
 >
 <ChevronRight className="w-4 h-4"/>
 </Button>
 {!isToday && (
 <Button
 variant="secondary"size="sm"className="text-xs font-semibold"onClick={() =>
 setDate(new Date().toISOString().split("T")[0])
 }
 >
 Hoy
 </Button>
 )}
 </div>

 {/* Sort */}
 <div className="flex items-center gap-2">
 <ArrowUpDown className="w-4 h-4 text-muted-foreground"/>
 <Select
 value={sortMode}
 onValueChange={(val) => setSortMode(val as SortMode)}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="gaps">Mas brechas primero</SelectItem>
 <SelectItem value="hours_asc">
 Menos horas primero
 </SelectItem>
 <SelectItem value="hours_desc">
 Mas horas primero
 </SelectItem>
 <SelectItem value="name">Nombre A-Z</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>

 {/* Summary cards */}
 <SummaryBar rows={rows} />

 {/* Timeline chart */}
 {/* Mobile scroll hint */}
 <p className="text-[10px] font-mono text-muted-foreground mb-2 md:hidden flex items-center gap-1">
 <ChevronLeft className="w-3 h-3"/>
 Desliza horizontalmente para ver la timeline completa
 <ChevronRight className="w-3 h-3"/>
 </p>

 <Card className="border-border/50 overflow-hidden">
 <CardContent className="p-0">
 {loading ? (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">
 Cargando timeline...
 </p>
 </div>
 ) : members.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <GanttChart className="w-7 h-7 text-muted-foreground/30"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground">Día en blanco. Cada hora sin registrar es una hora perdida.</p>
 </div>
 ) : (
 <div className="overflow-x-auto -webkit-overflow-scrolling-touch pt-8 pb-2">
 <div className="min-w-[700px]">
 {/* Hour headers */}
 <TimelineHeader dateStr={date} />

 {/* Member rows */}
 <div className="space-y-1 px-2">
 {sortedRows.map((row) => (
 <MemberTimelineRow
 key={row.profile.id}
 row={row}
 dateStr={date}
 />
 ))}
 </div>

 {/* Legend */}
 <TimelineLegend />
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 </TooltipProvider>
 );
}
