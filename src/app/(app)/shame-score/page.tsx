"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
 Skull,
 ChevronDown,
 ChevronUp,
 Calendar,
} from "lucide-react";
import { subDays, format, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

interface ShameBreakdown {
 flags: number;
 zeroDays: number;
 lowHoursDays: number;
 noCloseoutDays: number;
 lateEntries: number;
 noProofEntries: number;
 lastPlaceCount: number;
 brokenChains: number;
}

interface MemberShameScore {
 userId: string;
 profile: Profile | null;
 score: number;
 breakdown: ShameBreakdown;
 monthlyScores: { month: string; score: number }[];
}

interface WeekShame {
 weekLabel: string;
 weekStart: string;
 totalShame: number;
}

/* ------------------------------------------------------------------ */
/* Shame points config */
/* ------------------------------------------------------------------ */

const SHAME_POINTS = {
 flag: 10,
 zeroDays: 50,
 lowHours: 20,
 noCloseout: 15,
 lateEntry: 5,
 noProof: 3,
 lastPlace: 25,
 brokenChain: 100,
};

/* ------------------------------------------------------------------ */
/* Page */
/* ------------------------------------------------------------------ */

export default function ShameScorePage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [members, setMembers] = useState<MemberShameScore[]>([]);
 const [loading, setLoading] = useState(true);
 const [expandedUser, setExpandedUser] = useState<string | null>(null);
 const [worstWeek, setWorstWeek] = useState<WeekShame | null>(null);

 /* ---------- data loader ---------- */

 const loadData = useCallback(async () => {
 if (!orgId) return;

 const today = getTodayMTY();
 const ninetyDaysAgo = format(subDays(new Date(today +"T12:00:00"), 90),"yyyy-MM-dd");

 // 1. All org members with profiles
 const { data: orgMembers } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 if (!orgMembers || orgMembers.length === 0) {
 setLoading(false);
 return;
 }

 const profileMap = new Map<string, Profile>();
 const userIds: string[] = [];
 for (const m of orgMembers) {
 userIds.push(m.user_id);
 if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
 }

 // 2. All accountability flags (last 90 days)
 const { data: flags } = await supabase
 .from("accountability_flags")
 .select("user_id, date, flag_type")
 .eq("org_id", orgId)
 .gte("date", ninetyDaysAgo);

 // 3. All time entries (last 90 days)
 const { data: entries } = await supabase
 .from("time_entries")
 .select("user_id, date, hour, is_late, proof_urls")
 .eq("org_id", orgId)
 .gte("date", ninetyDaysAgo);

 // 4. All daily closeouts (last 90 days)
 const { data: closeouts } = await supabase
 .from("daily_closeouts")
 .select("user_id, date")
 .eq("org_id", orgId)
 .gte("date", ninetyDaysAgo);

 // 5. Activity streaks to detect broken chains
 const { data: streaks } = await supabase
 .from("activity_streaks")
 .select("user_id, current_streak, longest_streak, total_days_logged")
 .eq("org_id", orgId);

 /* ---------- group data ---------- */

 // Flags per user
 const flagsByUser = new Map<string, number>();
 for (const f of flags ?? []) {
 flagsByUser.set(f.user_id, (flagsByUser.get(f.user_id) ?? 0) + 1);
 }

 // Entries per user per date
 const entriesByUserDate = new Map<string, Map<string, { count: number; lateCount: number; noProofCount: number }>>();
 for (const e of entries ?? []) {
 if (!entriesByUserDate.has(e.user_id)) entriesByUserDate.set(e.user_id, new Map());
 const dateMap = entriesByUserDate.get(e.user_id)!;
 if (!dateMap.has(e.date)) dateMap.set(e.date, { count: 0, lateCount: 0, noProofCount: 0 });
 const day = dateMap.get(e.date)!;
 day.count++;
 if (e.is_late) day.lateCount++;
 const proofUrls = e.proof_urls as string[] | null;
 if (!proofUrls || proofUrls.length === 0) day.noProofCount++;
 }

 // Closeouts per user as a set of dates
 const closeoutsByUser = new Map<string, Set<string>>();
 for (const c of closeouts ?? []) {
 if (!closeoutsByUser.has(c.user_id)) closeoutsByUser.set(c.user_id, new Set());
 closeoutsByUser.get(c.user_id)!.add(c.date);
 }

 // Daily hours per user per date (for last place calculation)
 const dailyHoursByUserDate = new Map<string, Map<string, number>>();
 for (const e of entries ?? []) {
 if (!dailyHoursByUserDate.has(e.user_id)) dailyHoursByUserDate.set(e.user_id, new Map());
 const dateMap = dailyHoursByUserDate.get(e.user_id)!;
 dateMap.set(e.date, (dateMap.get(e.date) ?? 0) + 1);
 }

 // Streaks map for broken chains
 const streakMap = new Map<string, { current: number; longest: number; totalDays: number }>();
 for (const s of streaks ?? []) {
 streakMap.set(s.user_id, {
 current: s.current_streak,
 longest: s.longest_streak,
 totalDays: s.total_days_logged,
 });
 }

 /* ---------- generate all work dates in the 90-day window ---------- */

 const allDates: string[] = [];
 const dateObj = new Date(ninetyDaysAgo +"T12:00:00");
 const todayObj = new Date(today +"T12:00:00");
 while (dateObj <= todayObj) {
 const day = dateObj.getDay();
 // Only weekdays (Mon-Fri)
 if (day !== 0 && day !== 6) {
 allDates.push(format(dateObj,"yyyy-MM-dd"));
 }
 dateObj.setDate(dateObj.getDate() + 1);
 }

 /* ---------- last place per day ---------- */

 const lastPlaceCount = new Map<string, number>();
 for (const date of allDates) {
 // Find who had the fewest hours on this day (among those who should have worked)
 let minHours = Infinity;
 let minUsers: string[] = [];
 let anyoneWorked = false;

 for (const uid of userIds) {
 const hours = dailyHoursByUserDate.get(uid)?.get(date) ?? 0;
 // Only count if at least someone worked that day
 if (hours > 0) anyoneWorked = true;
 if (hours < minHours) {
 minHours = hours;
 minUsers = [uid];
 } else if (hours === minHours) {
 minUsers.push(uid);
 }
 }

 // Only count last place if at least 2 people worked and someone was clearly worst
 if (anyoneWorked && minUsers.length < userIds.length) {
 for (const uid of minUsers) {
 lastPlaceCount.set(uid, (lastPlaceCount.get(uid) ?? 0) + 1);
 }
 }
 }

 /* ---------- broken chain estimate ---------- */
 // A broken chain = longest_streak - current_streak > 0 means they broke at least once
 // We estimate breaks as: (total_days_logged / longest_streak) - 1 when longest > current
 const brokenChainCount = new Map<string, number>();
 for (const uid of userIds) {
 const streak = streakMap.get(uid);
 if (streak && streak.longest > 0 && streak.current < streak.longest) {
 // Simple estimate: they broke at least once
 const estimatedBreaks = Math.max(1, Math.floor(streak.totalDays / Math.max(streak.longest, 1)) - 1);
 brokenChainCount.set(uid, Math.min(estimatedBreaks, 5)); // cap at 5
 }
 }

 /* ---------- calculate shame per member ---------- */

 // Track monthly shame for the trend chart
 const monthKeys: string[] = [];
 {
 const d = new Date(ninetyDaysAgo +"T12:00:00");
 while (d <= todayObj) {
 const mk = format(d,"yyyy-MM");
 if (!monthKeys.includes(mk)) monthKeys.push(mk);
 d.setMonth(d.getMonth() + 1);
 }
 const currentMonth = format(todayObj,"yyyy-MM");
 if (!monthKeys.includes(currentMonth)) monthKeys.push(currentMonth);
 }

 const result: MemberShameScore[] = userIds.map((uid) => {
 const profile = profileMap.get(uid) ?? null;
 const userEntries = entriesByUserDate.get(uid) ?? new Map();
 const userCloseouts = closeoutsByUser.get(uid) ?? new Set();
 const userFlags = flagsByUser.get(uid) ?? 0;
 const userLastPlace = lastPlaceCount.get(uid) ?? 0;
 const userBrokenChains = brokenChainCount.get(uid) ?? 0;

 let zeroDays = 0;
 let lowHoursDays = 0;
 let noCloseoutDays = 0;
 let totalLateEntries = 0;
 let totalNoProofEntries = 0;

 // Monthly tracking
 const monthlyMap = new Map<string, number>();
 for (const mk of monthKeys) monthlyMap.set(mk, 0);

 for (const date of allDates) {
 const dayData = userEntries.get(date);
 const month = date.substring(0, 7);
 const dayHours = dayData?.count ?? 0;

 // Zero day
 if (dayHours === 0) {
 zeroDays++;
 monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + SHAME_POINTS.zeroDays);
 }

 // Low hours (but not zero)
 if (dayHours > 0 && dayHours < 6) {
 lowHoursDays++;
 monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + SHAME_POINTS.lowHours);
 }

 // No closeout
 if (!userCloseouts.has(date)) {
 noCloseoutDays++;
 monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + SHAME_POINTS.noCloseout);
 }

 // Late entries
 if (dayData) {
 totalLateEntries += dayData.lateCount;
 monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + dayData.lateCount * SHAME_POINTS.lateEntry);

 // No proof
 totalNoProofEntries += dayData.noProofCount;
 monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + dayData.noProofCount * SHAME_POINTS.noProof);
 }
 }

 // Add flags to first month
 if (monthKeys.length > 0) {
 // Distribute flags evenly across months (simplification)
 const flagsPerMonth = Math.ceil(userFlags / monthKeys.length);
 for (const mk of monthKeys) {
 monthlyMap.set(mk, (monthlyMap.get(mk) ?? 0) + flagsPerMonth * SHAME_POINTS.flag);
 }
 }

 const breakdown: ShameBreakdown = {
 flags: userFlags,
 zeroDays,
 lowHoursDays,
 noCloseoutDays,
 lateEntries: totalLateEntries,
 noProofEntries: totalNoProofEntries,
 lastPlaceCount: userLastPlace,
 brokenChains: userBrokenChains,
 };

 const score =
 userFlags * SHAME_POINTS.flag +
 zeroDays * SHAME_POINTS.zeroDays +
 lowHoursDays * SHAME_POINTS.lowHours +
 noCloseoutDays * SHAME_POINTS.noCloseout +
 totalLateEntries * SHAME_POINTS.lateEntry +
 totalNoProofEntries * SHAME_POINTS.noProof +
 userLastPlace * SHAME_POINTS.lastPlace +
 userBrokenChains * SHAME_POINTS.brokenChain;

 // Add last place + broken chains to monthly scores (spread evenly)
 if (monthKeys.length > 0) {
 const lpPerMonth = Math.ceil((userLastPlace * SHAME_POINTS.lastPlace) / monthKeys.length);
 const bcPerMonth = Math.ceil((userBrokenChains * SHAME_POINTS.brokenChain) / monthKeys.length);
 for (const mk of monthKeys) {
 monthlyMap.set(mk, (monthlyMap.get(mk) ?? 0) + lpPerMonth + bcPerMonth);
 }
 }

 const monthlyScores = monthKeys.map((mk) => ({
 month: mk,
 score: monthlyMap.get(mk) ?? 0,
 }));

 return { userId: uid, profile, score, breakdown, monthlyScores };
 });

 // Sort by highest shame first
 result.sort((a, b) => b.score - a.score);
 setMembers(result);

 /* ---------- worst week ---------- */

 const weekShameMap = new Map<string, { label: string; start: string; total: number }>();

 for (const date of allDates) {
 const dateD = new Date(date +"T12:00:00");
 const ws = startOfWeek(dateD, { weekStartsOn: 1 });
 const we = endOfWeek(dateD, { weekStartsOn: 1 });
 const wsStr = format(ws,"yyyy-MM-dd");
 const label =`${format(ws,"d MMM", { locale: es })} - ${format(we,"d MMM", { locale: es })}`;

 if (!weekShameMap.has(wsStr)) {
 weekShameMap.set(wsStr, { label, start: wsStr, total: 0 });
 }

 // Add all users' shame for this date
 for (const uid of userIds) {
 const dayData = entriesByUserDate.get(uid)?.get(date);
 const dayHours = dayData?.count ?? 0;
 let dayShame = 0;
 if (dayHours === 0) dayShame += SHAME_POINTS.zeroDays;
 if (dayHours > 0 && dayHours < 6) dayShame += SHAME_POINTS.lowHours;
 if (!closeoutsByUser.get(uid)?.has(date)) dayShame += SHAME_POINTS.noCloseout;
 if (dayData) {
 dayShame += dayData.lateCount * SHAME_POINTS.lateEntry;
 dayShame += dayData.noProofCount * SHAME_POINTS.noProof;
 }
 weekShameMap.get(wsStr)!.total += dayShame;
 }
 }

 let worst: WeekShame | null = null;
 for (const w of weekShameMap.values()) {
 if (!worst || w.total > worst.totalShame) {
 worst = { weekLabel: w.label, weekStart: w.start, totalShame: w.total };
 }
 }
 setWorstWeek(worst);
 setLoading(false);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 /* ---------- initial load ---------- */

 useEffect(() => {
 if (orgLoading || !orgId) {
 if (!orgLoading) setLoading(false);
 return;
 }
 loadData();
 }, [orgLoading, orgId, loadData]);

 /* ---------- real-time ---------- */

 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("shame-score-rt")
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
 table:"accountability_flags",
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

 const teamAvgShame = members.length > 0
 ? Math.round(members.reduce((s, m) => s + m.score, 0) / members.length)
 : 0;
 const totalTeamShame = members.reduce((s, m) => s + m.score, 0);
 const cleanMembers = members.filter((m) => m.score < 50);
 const criticalMembers = members.filter((m) => m.score >= 500);

 /* ---------- shame bar for monthly trends ---------- */

 function ShameBar({ scores, maxScore }: { scores: { month: string; score: number }[]; maxScore: number }) {
 const barMax = Math.max(maxScore, 1);
 return (
 <div className="flex items-end gap-1 h-12">
 {scores.map((s) => {
 const pct = Math.max(5, (s.score / barMax) * 100);
 return (
 <div key={s.month} className="flex flex-col items-center gap-0.5 flex-1">
 <div
 className={cn(
"w-full border transition-all",
 s.score > 300 ?"bg-red-500/60 border-red-500/40":
 s.score > 100 ?"bg-red-400/40 border-red-400/30":
 s.score > 50 ?"bg-amber-500/40 border-amber-500/30":
"bg-green-500/30 border-green-500/20")}
 style={{ height:`${pct}%`}}
 />
 <span className="font-mono text-[7px] text-muted-foreground">
 {s.month.substring(5)}
 </span>
 </div>
 );
 })}
 </div>
 );
 }

 /* ---------- render ---------- */

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-2.5 mb-1">
 <Skull className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Indice de Verguenza Acumulada
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground mb-8">
 Un numero que te persigue para siempre. Cada falla suma. Nunca se resetea. Ultimos 90 dias.
 </p>

 {/* #1 shame callout */}
 {members.length > 0 && members[0].score > 0 && (
 <div className="mb-8 border-2 border-red-500/50 bg-red-500/5 p-4 sm:p-5">
 <div className="flex items-center gap-2 mb-2">
 <Skull className="w-4 h-4 text-red-500"/>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/80 font-bold">
 Verguenza Maxima
 </p>
 </div>
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Avatar className="w-12 h-12 ring-1 ring-red-500/40">
 <AvatarImage src={members[0].profile?.avatar_url ?? undefined} />
 <AvatarFallback className="font-mono text-sm bg-red-500/20 text-red-500">
 {getInitials(members[0].profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div>
 <span className="font-mono font-bold text-lg text-red-500 tracking-tight block">
 {members[0].profile?.full_name ??"Sin nombre"}
 </span>
 <span className="font-mono text-[10px] text-red-400/60">
 {members[0].breakdown.zeroDays} dias fantasma, {members[0].breakdown.flags} flags
 </span>
 </div>
 </div>
 <div className="text-right">
 <p className="font-mono font-black text-4xl sm:text-5xl tabular-nums tracking-tight text-red-500">
 {members[0].score.toLocaleString()}
 </p>
 <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-red-500/60">
 puntos verguenza
 </p>
 </div>
 </div>
 </div>
 )}

 {/* Team stats strip */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Verguenza total
 </p>
 <p className={cn(
"text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
 totalTeamShame > 0 ?"text-red-500":"text-green-500")}>
 {totalTeamShame.toLocaleString()}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Promedio equipo
 </p>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-red-400">
 {teamAvgShame.toLocaleString()}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 En zona critica
 </p>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-red-500">
 {criticalMembers.length}
 <span className="text-sm text-muted-foreground ml-1">/ {members.length}</span>
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Intachables
 </p>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-green-500">
 {cleanMembers.length}
 </p>
 </div>
 </div>

 {/* Worst week */}
 {worstWeek && worstWeek.totalShame > 0 && (
 <div className="mb-8 border border-red-500/20 bg-red-500/3 p-3 sm:p-4">
 <div className="flex items-center gap-2 mb-1">
 <Calendar className="w-3.5 h-3.5 text-red-400/70"/>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-400/60 font-bold">
 Peor semana de todos los tiempos
 </p>
 </div>
 <div className="flex items-center justify-between">
 <p className="font-mono text-sm text-muted-foreground">
 {worstWeek.weekLabel}
 </p>
 <p className="font-mono font-black text-xl tabular-nums tracking-tight text-red-500">
 {worstWeek.totalShame.toLocaleString()}
 <span className="text-[9px] font-normal ml-1 text-red-400/50">pts</span>
 </p>
 </div>
 </div>
 )}

 {/* Section label */}
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Ranking de verguenza &mdash; mayor primero
 </p>

 {/* Member cards */}
 {members.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Skull className="w-7 h-7 text-muted-foreground"/>
 </div>
 <p className="text-sm text-muted-foreground font-mono">
 No hay miembros en la organizacion.
 </p>
 </div>
 ) : (
 <div className="space-y-2">
 {members.map((m, idx) => {
 const rank = idx + 1;
 const isClean = m.score < 50;
 const isLow = m.score >= 50 && m.score < 200;
 const isMedium = m.score >= 200 && m.score < 500;
 const isHigh = m.score >= 500 && m.score < 1000;
 const isCritical = m.score >= 1000;
 const isMe = m.userId === userId;
 const isExpanded = expandedUser === m.userId;
 const isFirst = rank === 1 && m.score > 0;

 // Dynamic border
 const borderClass = cn(
"border transition-colors",
 isClean &&"border-green-500/30 bg-green-500/3",
 isLow &&"border-border",
 isMedium &&"border-2 border-amber-500/30 bg-amber-500/3",
 isHigh &&"border-2 border-red-500/40 bg-red-500/5 animate-pulse",
 isCritical &&"border-2 border-red-600/60 bg-red-500/8 animate-pulse");

 // Name size scales with shame
 const nameClass = cn(
"font-mono font-bold tracking-tight",
 isClean &&"text-sm text-green-600 dark:text-green-400",
 isLow &&"text-sm text-foreground",
 isMedium &&"text-base text-amber-500",
 isHigh &&"text-lg sm:text-xl text-red-400",
 isCritical &&"text-xl sm:text-2xl text-red-500");

 // Score number scaling
 const scoreClass = cn(
"font-mono font-black tabular-nums tracking-tight",
 isClean &&"text-lg text-green-600 dark:text-green-400",
 isLow &&"text-xl text-foreground",
 isMedium &&"text-2xl text-amber-500",
 isHigh &&"text-3xl sm:text-4xl text-red-400",
 isCritical &&"text-4xl sm:text-5xl text-red-500");

 // Padding scales with shame
 const paddingClass = cn(
 isCritical &&"p-5 sm:p-6",
 isHigh &&"p-4 sm:p-5",
 isMedium &&"p-3 sm:p-4",
 (isClean || isLow) &&"p-3");

 // Badge
 const badge = isFirst
 ? { text:"VERGUENZA MAXIMA", color:"text-red-500 border-red-500/40 bg-red-500/15"}
 : isClean
 ? { text:"INTACHABLE", color:"text-green-500 border-green-500/30 bg-green-500/10"}
 : isHigh || isCritical
 ? { text:"ZONA CRITICA", color:"text-red-500 border-red-500/30 bg-red-500/10 animate-pulse"}
 : null;

 // Rank styling
 const rankClass = cn(
"font-mono font-black tabular-nums shrink-0",
 isClean &&"text-sm text-green-500/50",
 isLow &&"text-sm text-muted-foreground",
 isMedium &&"text-base text-amber-500/60",
 isHigh &&"text-lg text-red-400/60",
 isCritical &&"text-xl text-red-500/70");

 // Max monthly score for bar chart scaling
 const maxMonthlyScore = Math.max(...m.monthlyScores.map((s) => s.score), 1);

 return (
 <div key={m.userId} className={cn(borderClass, paddingClass)}>
 {/* Top row */}
 <div className="flex items-start gap-3">
 {/* Rank */}
 <span className={rankClass}>#{rank}</span>

 {/* Avatar */}
 <Avatar
 className={cn(
"ring-1 ring-border shrink-0",
 isCritical &&"w-14 h-14 sm:w-16 sm:h-16 ring-red-500/40",
 isHigh &&"w-12 h-12 sm:w-14 sm:h-14 ring-red-400/30",
 isMedium &&"w-10 h-10 ring-amber-500/30",
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
 {badge && (
 <span className={cn(
"font-mono text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border",
 badge.color
 )}>
 {badge.text}
 </span>
 )}
 </div>

 {/* Summary line */}
 <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
 {m.breakdown.zeroDays > 0 &&`${m.breakdown.zeroDays} dias fantasma`}
 {m.breakdown.zeroDays > 0 && m.breakdown.flags > 0 &&"/"}
 {m.breakdown.flags > 0 &&`${m.breakdown.flags} flags`}
 {(m.breakdown.zeroDays > 0 || m.breakdown.flags > 0) && m.breakdown.noCloseoutDays > 0 &&"/"}
 {m.breakdown.noCloseoutDays > 0 &&`${m.breakdown.noCloseoutDays} sin cierre`}
 </p>

 {/* Expand button */}
 <button
 onClick={() => setExpandedUser(isExpanded ? null : m.userId)}
 className="flex items-center gap-1 mt-1.5 group cursor-pointer">
 {isExpanded ? (
 <ChevronUp className="w-3 h-3 text-muted-foreground group-hover:text-muted-foreground"/>
 ) : (
 <ChevronDown className="w-3 h-3 text-muted-foreground group-hover:text-muted-foreground"/>
 )}
 <span className="font-mono text-[9px] text-muted-foreground group-hover:text-muted-foreground tracking-wider uppercase">
 {isExpanded ?"Ocultar desglose":"Ver desglose"}
 </span>
 </button>
 </div>

 {/* Right side: score */}
 <div className="text-right shrink-0">
 <p className={scoreClass}>
 {m.score.toLocaleString()}
 </p>
 <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
 pts
 </p>
 </div>
 </div>

 {/* Expanded breakdown */}
 {isExpanded && (
 <div className="mt-4 border-t border-border/30 pt-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Desglose de verguenza
 </p>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
 <BreakdownItem
 label="Flags"count={m.breakdown.flags}
 points={m.breakdown.flags * SHAME_POINTS.flag}
 rate={`+${SHAME_POINTS.flag}/flag`}
 />
 <BreakdownItem
 label="Dias fantasma (0h)"count={m.breakdown.zeroDays}
 points={m.breakdown.zeroDays * SHAME_POINTS.zeroDays}
 rate={`+${SHAME_POINTS.zeroDays}/dia`}
 />
 <BreakdownItem
 label="Dias <6 horas"count={m.breakdown.lowHoursDays}
 points={m.breakdown.lowHoursDays * SHAME_POINTS.lowHours}
 rate={`+${SHAME_POINTS.lowHours}/dia`}
 />
 <BreakdownItem
 label="Sin cierre"count={m.breakdown.noCloseoutDays}
 points={m.breakdown.noCloseoutDays * SHAME_POINTS.noCloseout}
 rate={`+${SHAME_POINTS.noCloseout}/dia`}
 />
 <BreakdownItem
 label="Entradas tardia"count={m.breakdown.lateEntries}
 points={m.breakdown.lateEntries * SHAME_POINTS.lateEntry}
 rate={`+${SHAME_POINTS.lateEntry}/entrada`}
 />
 <BreakdownItem
 label="Sin prueba"count={m.breakdown.noProofEntries}
 points={m.breakdown.noProofEntries * SHAME_POINTS.noProof}
 rate={`+${SHAME_POINTS.noProof}/entrada`}
 />
 <BreakdownItem
 label="Ultimo lugar"count={m.breakdown.lastPlaceCount}
 points={m.breakdown.lastPlaceCount * SHAME_POINTS.lastPlace}
 rate={`+${SHAME_POINTS.lastPlace}/vez`}
 />
 <BreakdownItem
 label="Cadena rota"count={m.breakdown.brokenChains}
 points={m.breakdown.brokenChains * SHAME_POINTS.brokenChain}
 rate={`+${SHAME_POINTS.brokenChain}/rotura`}
 />
 </div>

 {/* Monthly trend */}
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Evolucion de la verguenza
 </p>
 <ShameBar scores={m.monthlyScores} maxScore={maxMonthlyScore} />
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}

 {/* Team monthly trend */}
 {members.length > 0 && (
 <div className="mt-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Evolucion de la verguenza &mdash; equipo completo
 </p>
 <TeamMonthlyTrend members={members} />
 </div>
 )}

 {/* Bottom message */}
 <div className="mt-10 text-center py-6 border-t border-border/30">
 <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/25">
 Este indice nunca se resetea. La verguenza es permanente.
 </p>
 </div>
 </div>
 );
}

/* ------------------------------------------------------------------ */
/* Breakdown item component */
/* ------------------------------------------------------------------ */

function BreakdownItem({
 label,
 count,
 points,
 rate,
}: {
 label: string;
 count: number;
 points: number;
 rate: string;
}) {
 return (
 <div className="bg-accent/20 border border-border p-2">
 <p className="font-mono text-[8px] tracking-[0.12em] uppercase text-muted-foreground">
 {label}
 </p>
 <div className="flex items-baseline gap-1.5 mt-0.5">
 <span className="font-mono font-bold text-sm tabular-nums tracking-tight">
 {count}
 </span>
 <span className={cn(
"font-mono text-[10px] font-bold tabular-nums",
 points > 0 ?"text-red-400":"text-green-500")}>
 {points > 0 ?`+${points}`:"0"}
 </span>
 </div>
 <p className="font-mono text-[7px] text-muted-foreground mt-0.5">
 {rate}
 </p>
 </div>
 );
}

/* ------------------------------------------------------------------ */
/* Team monthly trend component */
/* ------------------------------------------------------------------ */

function TeamMonthlyTrend({ members }: { members: MemberShameScore[] }) {
 if (members.length === 0 || members[0].monthlyScores.length === 0) return null;

 const months = members[0].monthlyScores.map((s) => s.month);

 // Sum all members' scores per month
 const teamMonthly = months.map((month) => {
 const total = members.reduce((sum, m) => {
 const ms = m.monthlyScores.find((s) => s.month === month);
 return sum + (ms?.score ?? 0);
 }, 0);
 return { month, total };
 });

 const maxTotal = Math.max(...teamMonthly.map((t) => t.total), 1);

 return (
 <div className="border border-border p-3">
 <div className="flex items-end gap-2 h-20">
 {teamMonthly.map((t) => {
 const pct = Math.max(5, (t.total / maxTotal) * 100);
 return (
 <div key={t.month} className="flex flex-col items-center gap-1 flex-1">
 <span className="font-mono text-[8px] tabular-nums text-muted-foreground">
 {t.total.toLocaleString()}
 </span>
 <div
 className={cn(
"w-full border transition-all",
 t.total > 1000 ?"bg-red-500/50 border-red-500/40":
 t.total > 500 ?"bg-red-400/40 border-red-400/30":
 t.total > 200 ?"bg-amber-500/40 border-amber-500/30":
"bg-green-500/30 border-green-500/20")}
 style={{ height:`${pct}%`}}
 />
 <span className="font-mono text-[8px] text-muted-foreground">
 {format(new Date(t.month +"-15"),"MMM", { locale: es })}
 </span>
 </div>
 );
 })}
 </div>
 </div>
 );
}
