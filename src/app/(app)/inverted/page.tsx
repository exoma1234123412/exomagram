"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
 ArrowDownUp,
 Crown,
 AlertTriangle,
 Clock,
 TrendingDown,
 TrendingUp,
 RotateCcw,
 Eye,
 Calendar,
 History,
} from "lucide-react";
import { format, getDaysInMonth, differenceInDays, addMonths, setDate as setDateFn } from "date-fns";
import { es } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

interface MemberData {
 userId: string;
 profile: Profile | null;
 hoursLogged: number;
 trustScore: number;
 invertedScore: number;
 normalRank: number;
 invertedRank: number;
 rankDelta: number;
}

interface PastInvertedDay {
 date: string;
 winnerId: string | null;
 winnerName: string | null;
}

/* ------------------------------------------------------------------ */
/* Seeded inverted day calculation */
/* ------------------------------------------------------------------ */

function getInvertedDay(year: number, month: number): number {
 const totalDays = getDaysInMonth(new Date(year, month - 1));
 return ((month * 7 + year * 13) % totalDays) + 1;
}

function getCountdownText(targetDate: Date): string {
 const now = new Date();
 const diff = differenceInDays(targetDate, now);
 if (diff <= 0) return"Hoy";
 if (diff === 1) return"1 dia";
 return`${diff} dias`;
}

/* ------------------------------------------------------------------ */
/* Component */
/* ------------------------------------------------------------------ */

export default function InvertedPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [members, setMembers] = useState<MemberData[]>([]);
 const [pastDays, setPastDays] = useState<PastInvertedDay[]>([]);
 const [loading, setLoading] = useState(true);

 const now = new Date();
 const currentYear = now.getFullYear();
 const currentMonth = now.getMonth() + 1;
 const today = format(now,"yyyy-MM-dd");

 const invertedDay = getInvertedDay(currentYear, currentMonth);
 const invertedDateStr = format(
 new Date(currentYear, currentMonth - 1, invertedDay),
"yyyy-MM-dd");
 const isInvertedToday = today === invertedDateStr;

 // Next inverted day (this month or next)
 const invertedDateObj = new Date(currentYear, currentMonth - 1, invertedDay);
 const nextInvertedDate =
 invertedDateObj >= now
 ? invertedDateObj
 : (() => {
 const next = addMonths(now, 1);
 const nextDay = getInvertedDay(next.getFullYear(), next.getMonth() + 1);
 return new Date(next.getFullYear(), next.getMonth(), nextDay);
 })();

 const formattedInvertedDate = format(
 new Date(currentYear, currentMonth - 1, invertedDay),
"EEEE d 'de' MMMM",
 { locale: es }
 );

 const loadData = useCallback(async () => {
 if (!orgId) return;
 setLoading(true);

 // Fetch members
 const { data: membersRaw } = await supabase
 .from("org_members")
 .select("user_id, profiles(id, full_name, avatar_url, email)")
 .eq("org_id", orgId);

 if (!membersRaw) {
 setLoading(false);
 return;
 }

 // Determine the date to query: if today is inverted day, use today; otherwise use the inverted date for this month
 const queryDate = invertedDateStr;

 // Fetch time entries for the inverted day
 const { data: entries } = await supabase
 .from("time_entries")
 .select("user_id, id")
 .eq("org_id", orgId)
 .eq("date", queryDate);

 // Fetch trust scores for the inverted day
 const { data: trustScores } = await supabase
 .from("trust_score_history")
 .select("user_id, score")
 .eq("org_id", orgId)
 .eq("date", queryDate);

 // Build maps
 const hoursMap = new Map<string, number>();
 for (const e of entries ?? []) {
 hoursMap.set(e.user_id, (hoursMap.get(e.user_id) ?? 0) + 1);
 }

 const trustMap = new Map<string, number>();
 for (const t of trustScores ?? []) {
 trustMap.set(t.user_id, t.score);
 }

 // Calculate member data
 const memberData: MemberData[] = membersRaw.map((m) => {
 const profile = m.profiles as unknown as Profile | null;
 const hoursLogged = hoursMap.get(m.user_id) ?? 0;
 const trustScore = trustMap.get(m.user_id) ?? 50;
 // Inverted formula: less hours + lower trust = higher inverted score
 const invertedScore = (10 - hoursLogged) * 15 + (100 - trustScore);
 return {
 userId: m.user_id,
 profile,
 hoursLogged,
 trustScore,
 invertedScore,
 normalRank: 0,
 invertedRank: 0,
 rankDelta: 0,
 };
 });

 // Normal ranking: highest trust score first
 const normalSorted = [...memberData].sort((a, b) => b.trustScore - a.trustScore);
 normalSorted.forEach((m, i) => {
 m.normalRank = i + 1;
 });

 // Inverted ranking: highest inverted score first
 const invertedSorted = [...memberData].sort((a, b) => b.invertedScore - a.invertedScore);
 invertedSorted.forEach((m, i) => {
 m.invertedRank = i + 1;
 });

 // Calculate rank delta
 memberData.forEach((m) => {
 m.rankDelta = m.normalRank - m.invertedRank;
 });

 setMembers(invertedSorted);

 // Load past inverted days (last 6 months)
 const pastResults: PastInvertedDay[] = [];
 for (let i = 1; i <= 6; i++) {
 const pastDate = addMonths(now, -i);
 const pastYear = pastDate.getFullYear();
 const pastMonth = pastDate.getMonth() + 1;
 const pastDay = getInvertedDay(pastYear, pastMonth);
 const pastDateStr = format(
 new Date(pastYear, pastMonth - 1, pastDay),
"yyyy-MM-dd");

 const { data: pastEntries } = await supabase
 .from("time_entries")
 .select("user_id, id")
 .eq("org_id", orgId)
 .eq("date", pastDateStr);

 const { data: pastTrust } = await supabase
 .from("trust_score_history")
 .select("user_id, score")
 .eq("org_id", orgId)
 .eq("date", pastDateStr);

 // Calculate past inverted winner
 const pastHoursMap = new Map<string, number>();
 for (const e of pastEntries ?? []) {
 pastHoursMap.set(e.user_id, (pastHoursMap.get(e.user_id) ?? 0) + 1);
 }
 const pastTrustMap = new Map<string, number>();
 for (const t of pastTrust ?? []) {
 pastTrustMap.set(t.user_id, t.score);
 }

 let bestScore = -Infinity;
 let winnerId: string | null = null;
 for (const m of membersRaw) {
 const hrs = pastHoursMap.get(m.user_id) ?? 0;
 const ts = pastTrustMap.get(m.user_id) ?? 50;
 const score = (10 - hrs) * 15 + (100 - ts);
 if (score > bestScore) {
 bestScore = score;
 winnerId = m.user_id;
 }
 }

 const winnerProfile = winnerId
 ? (membersRaw.find((m) => m.user_id === winnerId)?.profiles as unknown as Profile | null)
 : null;

 pastResults.push({
 date: pastDateStr,
 winnerId,
 winnerName: winnerProfile?.full_name ?? null,
 });
 }

 setPastDays(pastResults);
 setLoading(false);
 }, [orgId, invertedDateStr]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (!orgLoading && orgId) loadData();
 }, [orgLoading, orgId, loadData]);

 /* ---------------------------------------------------------------- */
 /* Loading / Empty */
 /* ---------------------------------------------------------------- */

 if (loading || orgLoading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground">Cargando...</div>
 </div>
 );
 }

 if (!orgId) {
 return (
 <div className="flex items-center justify-center h-screen">
 <p className="text-muted-foreground">Sin organizacion</p>
 </div>
 );
 }

 /* ---------------------------------------------------------------- */
 /* Derived data */
 /* ---------------------------------------------------------------- */

 // Members sorted by absolute rank delta (most suspicious first)
 const suspiciousMembers = [...members]
 .sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta))
 .filter((m) => Math.abs(m.rankDelta) > 0);

 /* ---------------------------------------------------------------- */
 /* Render */
 /* ---------------------------------------------------------------- */

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-3 mb-2">
 <ArrowDownUp className="w-6 h-6 text-fuchsia-500 rotate-180"/>
 <h1 className="text-2xl font-bold tracking-tight">Modo Invertido</h1>
 </div>
 <p className="text-sm text-muted-foreground mb-8">
 Un dia al mes, todas las metricas se invierten. Quien trabaja menos, gana mas.
 Expone a quien solo juega el sistema.
 </p>

 {/* Active Banner or Countdown */}
 {isInvertedToday ? (
 <div className="relative mb-8 overflow-hidden bg-gradient-to-r from-fuchsia-600 via-purple-600 to-fuchsia-700 p-6 text-white shadow-fuchsia-600/25">
 <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_60%)]"/>
 <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/5 animate-pulse"/>
 <div className="absolute -left-4 -bottom-4 w-24 h-24 rounded-full bg-white/5 animate-pulse delay-500"/>
 <div className="relative z-10 flex items-center gap-4">
 <div className="flex items-center justify-center w-14 h-14 bg-white/15 backdrop-blur-sm">
 <RotateCcw className="w-7 h-7 animate-spin"style={{ animationDuration:"3s"}} />
 </div>
 <div>
 <h2 className="text-xl font-bold tracking-tight">MODO INVERTIDO ACTIVO</h2>
 <p className="text-sm text-white/80 mt-0.5">
 Hoy las reglas se invierten. Menos trabajo = mas puntos. Trust Score bajo = ventaja.
 </p>
 </div>
 </div>
 </div>
 ) : (
 <Card className="mb-8 transition-all duration-300 hover:border-primary/30 border-fuchsia-500/20">
 <CardContent className="p-5">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="flex items-center justify-center w-10 h-10 bg-fuchsia-500/10">
 <Calendar className="w-5 h-5 text-fuchsia-500"/>
 </div>
 <div>
 <p className="text-sm font-medium">Proximo dia invertido</p>
 <p className="text-xs text-muted-foreground capitalize">
 {formattedInvertedDate}
 </p>
 </div>
 </div>
 <Badge variant="outline"className="font-mono text-xs border-fuchsia-500/30 text-fuchsia-500">
 {getCountdownText(nextInvertedDate)}
 </Badge>
 </div>
 </CardContent>
 </Card>
 )}

 {/* Inverted Leaderboard */}
 <section className="mb-8">
 <div className="flex items-center gap-2 mb-4">
 <TrendingDown className="w-4 h-4 text-fuchsia-500"/>
 <h2 className="text-lg font-semibold tracking-tight">Ranking Invertido</h2>
 </div>

 {members.length === 0 ? (
 <Card className="transition-all duration-300">
 <CardContent className="p-8 flex flex-col items-center gap-3">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center">
 <ArrowDownUp className="w-8 h-8 text-primary"/>
 </div>
 <p className="text-sm text-muted-foreground text-center">
 No hay datos para el dia invertido de este mes
 </p>
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-2">
 {members.map((m, idx) => {
 const isTop = idx === 0;
 const isMe = m.userId === userId;
 return (
 <Card
 key={m.userId}
 className={cn(
"transition-all duration-300 hover:border-primary/30",
 isTop &&"border-fuchsia-500/40 shadow-fuchsia-500/10",
 isMe &&"ring-1 ring-fuchsia-500/30")}
 >
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 {/* Rank */}
 <div
 className={cn(
"flex items-center justify-center w-8 h-8 font-bold text-sm tabular-nums tracking-tight shrink-0",
 isTop
 ?"bg-fuchsia-500 text-white":"bg-accent/40 text-muted-foreground")}
 >
 {isTop ? (
 <Crown className="w-4 h-4 scale-y-[-1]"/>
 ) : (
 idx + 1
 )}
 </div>

 {/* Avatar */}
 <Avatar className="w-9 h-9 ring-2 ring-background">
 <AvatarImage src={m.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs font-medium">
 {getInitials(m.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>

 {/* Name + stats */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <span className="text-sm font-medium truncate">
 {m.profile?.full_name ??"Sin nombre"}
 </span>
 {isMe && (
 <Badge variant="outline"className="text-[10px] px-1.5 py-0">
 Tu
 </Badge>
 )}
 </div>
 <div className="flex items-center gap-3 mt-0.5">
 <span className="text-xs text-muted-foreground">
 <Clock className="w-3 h-3 inline mr-0.5"/>
 {m.hoursLogged}h logueadas
 </span>
 <span className="text-xs text-muted-foreground">
 Trust: {m.trustScore}
 </span>
 </div>
 </div>

 {/* Inverted Score */}
 <div className="text-right shrink-0">
 <div className="text-lg font-bold tabular-nums tracking-tight text-fuchsia-500">
 {m.invertedScore}
 </div>
 <div className="text-[10px] text-muted-foreground">pts inv.</div>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 )}
 </section>

 {/* Normal vs Inverted Side by Side */}
 {members.length > 0 && (
 <section className="mb-8">
 <div className="flex items-center gap-2 mb-4">
 <Eye className="w-4 h-4 text-fuchsia-500"/>
 <h2 className="text-lg font-semibold tracking-tight">Normal vs Invertido</h2>
 </div>

 <Card className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4">
 <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-2 items-center">
 {/* Header */}
 <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
 Miembro
 </div>
 <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider text-center">
 Normal
 </div>
 <div className="text-[10px] font-mono text-fuchsia-500 uppercase tracking-wider text-center">
 Invertido
 </div>
 <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider text-center">
 Delta
 </div>

 {/* Rows */}
 {members.map((m) => {
 const deltaAbs = Math.abs(m.rankDelta);
 const isPositive = m.rankDelta > 0;
 const isNeutral = m.rankDelta === 0;
 return (
 <div key={m.userId} className="contents">
 <div className="flex items-center gap-2 py-1.5">
 <Avatar className="w-6 h-6 ring-2 ring-background">
 <AvatarImage src={m.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px]">
 {getInitials(m.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-medium truncate">
 {m.profile?.full_name ??"Sin nombre"}
 </span>
 </div>
 <div className="text-center">
 <span className="text-sm font-bold tabular-nums tracking-tight">
 #{m.normalRank}
 </span>
 </div>
 <div className="text-center">
 <span className="text-sm font-bold tabular-nums tracking-tight text-fuchsia-500">
 #{m.invertedRank}
 </span>
 </div>
 <div className="text-center">
 {isNeutral ? (
 <span className="text-xs text-muted-foreground">--</span>
 ) : (
 <div
 className={cn(
"inline-flex items-center gap-0.5 text-xs font-medium",
 isPositive
 ?"text-green-600 dark:text-green-400":"text-red-600 dark:text-red-400")}
 >
 {isPositive ? (
 <TrendingUp className="w-3 h-3"/>
 ) : (
 <TrendingDown className="w-3 h-3"/>
 )}
 {deltaAbs}
 </div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </CardContent>
 </Card>
 </section>
 )}

 {/* Inversion Analysis */}
 {suspiciousMembers.length > 0 && (
 <section className="mb-8">
 <div className="flex items-center gap-2 mb-4">
 <AlertTriangle className="w-4 h-4 text-amber-500"/>
 <h2 className="text-lg font-semibold tracking-tight">Analisis de Inversion</h2>
 </div>
 <p className="text-xs text-muted-foreground mb-3">
 Quienes se benefician mas del modo invertido pueden estar jugando el sistema normalmente.
 </p>

 <div className="space-y-2">
 {suspiciousMembers.slice(0, 5).map((m) => {
 const benefitsFromInversion = m.rankDelta > 0;
 return (
 <Card
 key={m.userId}
 className={cn(
"transition-all duration-300 hover:border-primary/30",
 benefitsFromInversion &&"border-amber-500/30")}
 >
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage src={m.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(m.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <span className="text-sm font-medium truncate block">
 {m.profile?.full_name ??"Sin nombre"}
 </span>
 <span className="text-xs text-muted-foreground">
 Normal #{m.normalRank} → Invertido #{m.invertedRank}
 </span>
 </div>
 <div className="shrink-0">
 {benefitsFromInversion ? (
 <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">
 Sube {Math.abs(m.rankDelta)} pos.
 </Badge>
 ) : (
 <Badge variant="outline"className="text-[10px] text-muted-foreground">
 Baja {Math.abs(m.rankDelta)} pos.
 </Badge>
 )}
 </div>
 </div>
 {benefitsFromInversion && (
 <div className="mt-2 p-2 bg-amber-500/5 border border-amber-500/10">
 <p className="text-[11px] text-amber-600 dark:text-amber-400">
 Este miembro sube {Math.abs(m.rankDelta)} posiciones cuando las metricas se invierten.
 Posible optimizador de metricas — revisa su trabajo real.
 </p>
 </div>
 )}
 </CardContent>
 </Card>
 );
 })}
 </div>
 </section>
 )}

 {/* Past Inverted Days */}
 <section className="mb-8">
 <div className="flex items-center gap-2 mb-4">
 <History className="w-4 h-4 text-fuchsia-500"/>
 <h2 className="text-lg font-semibold tracking-tight">Historial de Dias Invertidos</h2>
 </div>

 {pastDays.length === 0 ? (
 <Card className="transition-all duration-300">
 <CardContent className="p-6 text-center">
 <p className="text-sm text-muted-foreground">Sin historial disponible</p>
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-2">
 {pastDays.map((pd) => (
 <Card
 key={pd.date}
 className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="flex items-center justify-center w-8 h-8 bg-fuchsia-500/10">
 <RotateCcw className="w-4 h-4 text-fuchsia-500"/>
 </div>
 <div>
 <p className="text-sm font-medium capitalize">
 {format(new Date(pd.date +"T12:00:00"),"d MMM yyyy", { locale: es })}
 </p>
 <p className="text-xs text-muted-foreground">Dia invertido</p>
 </div>
 </div>
 <div className="text-right">
 {pd.winnerName ? (
 <div className="flex items-center gap-1.5">
 <Crown className="w-3.5 h-3.5 text-fuchsia-500 scale-y-[-1]"/>
 <span className="text-sm font-medium">{pd.winnerName}</span>
 </div>
 ) : (
 <span className="text-xs text-muted-foreground">Sin datos</span>
 )}
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 )}
 </section>

 {/* How it works */}
 <section className="mb-8">
 <Card className="transition-all duration-300 hover:border-primary/30 border-fuchsia-500/10">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-semibold flex items-center gap-2">
 <ArrowDownUp className="w-4 h-4 text-fuchsia-500"/>
 Como funciona
 </CardTitle>
 </CardHeader>
 <CardContent className="p-5 pt-0">
 <ul className="space-y-2 text-xs text-muted-foreground">
 <li className="flex items-start gap-2">
 <span className="text-fuchsia-500 font-bold mt-0.5">1.</span>
 Un dia al mes, seleccionado aleatoriamente, se activa el Modo Invertido.
 </li>
 <li className="flex items-start gap-2">
 <span className="text-fuchsia-500 font-bold mt-0.5">2.</span>
 La formula se invierte: (10 - horas) x 15 + (100 - Trust Score).
 </li>
 <li className="flex items-start gap-2">
 <span className="text-fuchsia-500 font-bold mt-0.5">3.</span>
 Quien trabaja menos y tiene Trust Score mas bajo, obtiene mas puntos invertidos.
 </li>
 <li className="flex items-start gap-2">
 <span className="text-fuchsia-500 font-bold mt-0.5">4.</span>
 Si alguien sube muchas posiciones al invertirse, puede estar optimizando metricas sin trabajar de verdad.
 </li>
 </ul>
 </CardContent>
 </Card>
 </section>
 </div>
 );
}
