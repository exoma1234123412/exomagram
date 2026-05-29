"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import {
 startOfMonth,
 endOfMonth,
 differenceInDays,
 format,
} from "date-fns";
import { es } from "date-fns/locale";
import {
 Trophy,
 Medal,
 Crown,
 Calendar,
 Clock,
 FileText,
 TrendingUp,
 History,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberSeason {
 profile: Profile;
 totalScore: number;
 avgScore: number;
 totalHours: number;
 totalEntries: number;
 daysLogged: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSeasonNumber(date: Date): number {
 // Season 1 = May 2026 (month index 4, year 2026)
 const originYear = 2026;
 const originMonth = 4; // May (0-indexed)
 const monthsDiff =
 (date.getFullYear() - originYear) * 12 +
 (date.getMonth() - originMonth);
 return Math.max(1, monthsDiff + 1);
}

function getSeasonLabel(date: Date): string {
 return format(date,"MMMM yyyy", { locale: es });
}

const REWARDS = [
 { rank: 1, title:"Campeón", color:"text-yellow-500", icon: Crown },
 { rank: 2, title:"Subcampeón", color:"text-gray-400", icon: Medal },
 { rank: 3, title:"Bronce", color:"text-amber-600", icon: Medal },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SeasonsPage() {
 const { orgId, loading: orgLoading } = useOrg();
 const [loading, setLoading] = useState(true);
 const [members, setMembers] = useState<MemberSeason[]>([]);

 const supabase = createClient();

 // Season dates based on current month
 const now = new Date();
 const seasonStart = startOfMonth(now);
 const seasonEnd = endOfMonth(now);
 const seasonNumber = getSeasonNumber(now);
 const seasonLabel = getSeasonLabel(now);

 const totalDays = differenceInDays(seasonEnd, seasonStart) + 1;
 const daysElapsed = Math.min(
 differenceInDays(now, seasonStart) + 1,
 totalDays
 );
 const progressPct = Math.round((daysElapsed / totalDays) * 100);

 const startStr = format(seasonStart,"yyyy-MM-dd");
 const endStr = format(seasonEnd,"yyyy-MM-dd");
 const startDisplay = format(seasonStart,"d MMM yyyy", { locale: es });
 const endDisplay = format(seasonEnd,"d MMM yyyy", { locale: es });

 // -----------------------------------------------------------------------
 // Load data
 // -----------------------------------------------------------------------

 useEffect(() => {
 if (orgLoading || !orgId) {
 if (!orgLoading && !orgId) setLoading(false);
 return;
 }

 async function load() {
 setLoading(true);

 // Get org members with profiles
 const { data: orgMembers } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId!);

 if (!orgMembers || orgMembers.length === 0) {
 setMembers([]);
 setLoading(false);
 return;
 }

 const userIds = orgMembers.map((m) => m.user_id);

 // Fetch trust_score_history for the season date range
 const { data: trustData } = await supabase
 .from("trust_score_history")
 .select("user_id, score, hours_logged, date")
 .eq("org_id", orgId!)
 .in("user_id", userIds)
 .gte("date", startStr)
 .lte("date", endStr);

 // Fetch time_entries count for the season
 const { data: entriesData } = await supabase
 .from("time_entries")
 .select("user_id, id")
 .eq("org_id", orgId!)
 .in("user_id", userIds)
 .gte("date", startStr)
 .lte("date", endStr);

 // Aggregate per user
 const memberMap = new Map<
 string,
 {
 totalScore: number;
 scoreCount: number;
 totalHours: number;
 totalEntries: number;
 datesSet: Set<string>;
 }
 >();

 for (const m of orgMembers) {
 memberMap.set(m.user_id, {
 totalScore: 0,
 scoreCount: 0,
 totalHours: 0,
 totalEntries: 0,
 datesSet: new Set(),
 });
 }

 for (const row of trustData ?? []) {
 const agg = memberMap.get(row.user_id);
 if (agg) {
 agg.totalScore += row.score;
 agg.scoreCount += 1;
 agg.totalHours += row.hours_logged;
 agg.datesSet.add(row.date);
 }
 }

 for (const row of entriesData ?? []) {
 const agg = memberMap.get(row.user_id);
 if (agg) {
 agg.totalEntries += 1;
 }
 }

 // Build member list
 const result: MemberSeason[] = orgMembers.map((m) => {
 const agg = memberMap.get(m.user_id)!;
 return {
 profile: m.profiles as unknown as Profile,
 totalScore: Math.round(agg.totalScore),
 avgScore:
 agg.scoreCount > 0
 ? Math.round(agg.totalScore / agg.scoreCount)
 : 0,
 totalHours: Math.round(agg.totalHours * 10) / 10,
 totalEntries: agg.totalEntries,
 daysLogged: agg.datesSet.size,
 };
 });

 // Sort by cumulative trust score descending
 result.sort((a, b) => b.totalScore - a.totalScore);

 setMembers(result);
 setLoading(false);
 }

 load();
 }, [orgLoading, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 // -----------------------------------------------------------------------
 // Derived stats
 // -----------------------------------------------------------------------

 const teamTotalHours = useMemo(
 () => members.reduce((sum, m) => sum + m.totalHours, 0),
 [members]
 );
 const teamTotalEntries = useMemo(
 () => members.reduce((sum, m) => sum + m.totalEntries, 0),
 [members]
 );
 const teamAvgScore = useMemo(() => {
 const withData = members.filter((m) => m.avgScore > 0);
 if (withData.length === 0) return 0;
 return Math.round(
 withData.reduce((sum, m) => sum + m.avgScore, 0) / withData.length
 );
 }, [members]);

 // -----------------------------------------------------------------------
 // Render
 // -----------------------------------------------------------------------

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-3 mb-1">
 <Trophy className="w-6 h-6 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Temporada {seasonNumber} — {seasonLabel}
 </h1>
 </div>
 <p className="text-sm text-muted-foreground mb-8 capitalize">
 {startDisplay} — {endDisplay}
 </p>

 {/* Season progress */}
 <Card className="mb-8">
 <CardContent className="p-4 sm:p-5">
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center gap-2">
 <Calendar className="w-4 h-4 text-primary"/>
 <span className="text-sm font-medium">
 Progreso de la temporada
 </span>
 </div>
 <span className="text-sm font-semibold tabular-nums tracking-tight">
 {daysElapsed}/{totalDays} días
 </span>
 </div>
 <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
 <div
 className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"style={{ width:`${progressPct}%`}}
 />
 </div>
 <p className="text-xs text-muted-foreground mt-2">
 {progressPct}% completado — la temporada se reinicia el{" "}
 {format(endOfMonth(now),"d 'de' MMMM", { locale: es })}
 </p>
 </CardContent>
 </Card>

 {loading ? (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">
 Cargando...
 </p>
 </div>
 ) : members.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-16 h-16 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
 <Trophy className="w-7 h-7 text-primary/40"/>
 </div>
 <p className="text-sm text-muted-foreground">
 No hay datos para esta temporada.
 </p>
 </div>
 ) : (
 <div className="space-y-8">
 {/* Team Stats */}
 <div className="grid grid-cols-3 gap-4">
 <Card>
 <CardContent className="p-4 text-center">
 <Clock className="w-5 h-5 text-primary mx-auto mb-1"/>
 <p className="text-2xl font-bold tabular-nums tracking-tight">
 {Math.round(teamTotalHours)}
 </p>
 <p className="text-xs text-muted-foreground">Horas del equipo</p>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 text-center">
 <FileText className="w-5 h-5 text-primary mx-auto mb-1"/>
 <p className="text-2xl font-bold tabular-nums tracking-tight">
 {teamTotalEntries}
 </p>
 <p className="text-xs text-muted-foreground">Registros totales</p>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 text-center">
 <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1"/>
 <p className="text-2xl font-bold tabular-nums tracking-tight">
 {teamAvgScore}
 </p>
 <p className="text-xs text-muted-foreground">
 Trust Score promedio
 </p>
 </CardContent>
 </Card>
 </div>

 {/* Season Rewards Preview */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-lg flex items-center gap-2">
 <Crown className="w-5 h-5 text-yellow-500"/>
 Recompensas de temporada
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-3 gap-4">
 {REWARDS.map((reward) => {
 const Icon = reward.icon;
 const holder =
 members.length >= reward.rank
 ? members[reward.rank - 1]
 : null;

 return (
 <div
 key={reward.rank}
 className={cn(
"flex flex-col items-center gap-2 p-4 border border-border/50",
 reward.rank === 1 &&
"bg-yellow-50/50 dark:bg-yellow-950/10 border-yellow-300/40",
 reward.rank === 2 &&
"bg-gray-50/50 dark:bg-gray-800/10 border-gray-300/40",
 reward.rank === 3 &&
"bg-amber-50/50 dark:bg-amber-950/10 border-amber-400/30")}
 >
 <Icon
 className={cn("w-8 h-8", reward.color)}
 />
 <span className="text-sm font-bold">{reward.title}</span>
 {holder ? (
 <div className="flex flex-col items-center gap-1">
 <Avatar className="w-10 h-10 ring-2 ring-background">
 <AvatarImage
 src={holder.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-xs">
 {getInitials(holder.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs text-muted-foreground truncate max-w-[100px]">
 {holder.profile.full_name?.split("")[0] ??
 holder.profile.email}
 </span>
 </div>
 ) : (
 <span className="text-xs text-muted-foreground">
 Sin datos
 </span>
 )}
 </div>
 );
 })}
 </div>
 </CardContent>
 </Card>

 {/* Standings */}
 <div>
 <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
 <Trophy className="w-5 h-5 text-primary"/>
 Clasificación actual
 </h2>
 <div className="space-y-3">
 {members.map((m, idx) => {
 const rank = idx + 1;
 const isPodium = rank <= 3;

 return (
 <Card
 key={m.profile.id}
 className={cn(
"transition-all duration-200 hover:-translate-y-0.5",
 rank === 1 &&
"border-yellow-300/60 dark:border-yellow-700/40 shadow-yellow-500/10 ring-1 ring-yellow-300/30",
 rank === 2 &&
"border-gray-300/60 dark:border-gray-600/40",
 rank === 3 &&
"border-amber-400/40 dark:border-amber-800/40")}
 >
 <CardContent className="p-4">
 <div className="flex items-center gap-4">
 {/* Rank */}
 <div className="flex-shrink-0">
 {rank === 1 ? (
 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-yellow-500/30">
 <Crown className="w-5 h-5 text-white"/>
 </div>
 ) : rank === 2 ? (
 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center shadow-gray-400/30">
 <Medal className="w-5 h-5 text-white"/>
 </div>
 ) : rank === 3 ? (
 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center shadow-amber-700/30">
 <Medal className="w-5 h-5 text-white"/>
 </div>
 ) : (
 <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
 <span className="text-lg font-bold text-muted-foreground tabular-nums">
 {rank}
 </span>
 </div>
 )}
 </div>

 {/* Avatar */}
 <Avatar
 className={cn(
"w-12 h-12 ring-2 ring-background",
 isPodium &&"ring-4")}
 >
 <AvatarImage
 src={m.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="font-semibold">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>

 {/* Info */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="font-semibold truncate">
 {m.profile.full_name ?? m.profile.email}
 </h3>
 {m.profile.role && (
 <span className="text-xs text-muted-foreground">
 {m.profile.role}
 </span>
 )}
 {isPodium && (
 <Badge
 className={cn(
"text-[10px] font-semibold border-0",
 rank === 1 &&
"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
 rank === 2 &&
"bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
 rank === 3 &&
"bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300")}
 >
 {REWARDS[rank - 1].title}
 </Badge>
 )}
 </div>
 <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
 <span className="tabular-nums">
 {m.totalHours}h registradas
 </span>
 <span className="text-muted-foreground">|</span>
 <span className="tabular-nums">
 {m.totalEntries} registros
 </span>
 <span className="text-muted-foreground">|</span>
 <span className="tabular-nums">
 {m.daysLogged} días activos
 </span>
 </div>
 </div>

 {/* Score */}
 <div className="text-right min-w-[70px]">
 <p
 className={cn(
"text-2xl font-bold tabular-nums tracking-tight",
 m.avgScore >= 80
 ?"text-green-600": m.avgScore >= 60
 ?"text-blue-600": m.avgScore >= 40
 ?"text-yellow-600":"text-red-600")}
 >
 {m.avgScore}
 </p>
 <p className="text-[10px] text-muted-foreground font-medium">
 Trust Score avg
 </p>
 <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
 Total: {m.totalScore}
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>

 {/* Previous Seasons */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-lg flex items-center gap-2">
 <History className="w-5 h-5 text-primary"/>
 Temporadas anteriores
 </CardTitle>
 </CardHeader>
 <CardContent>
 {seasonNumber <= 1 ? (
 <div className="flex flex-col items-center justify-center py-8 gap-3">
 <div className="w-12 h-12 bg-muted flex items-center justify-center">
 <Trophy className="w-6 h-6 text-muted-foreground"/>
 </div>
 <p className="text-sm text-muted-foreground text-center">
 Esta es la primera temporada. El historial aparecerá aquí
 cuando termine.
 </p>
 </div>
 ) : (
 <p className="text-sm text-muted-foreground">
 Historial de temporadas próximamente.
 </p>
 )}
 </CardContent>
 </Card>

 {/* Methodology */}
 <Card>
 <CardContent className="p-4">
 <p className="text-xs text-muted-foreground">
 <span className="font-medium">Temporadas</span> — Cada
 temporada dura un mes calendario (del 1 al último día). La
 clasificación se basa en el Trust Score acumulado durante el
 período. La temporada se reinicia automáticamente al inicio de
 cada mes.
 </p>
 </CardContent>
 </Card>
 </div>
 )}
 </div>
 );
}
