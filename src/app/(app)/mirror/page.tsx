"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type {
 Profile,
 AccountabilityFlag,
 TrustScoreHistory,
 EntryReaction,
 TimeEntry,
} from "@/lib/types/database";
import { CATEGORIES, FLAG_TYPES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { FlagType } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import { format, subDays, subWeeks, differenceInCalendarDays, startOfWeek, endOfWeek, isWeekend, addDays } from "date-fns";
import { es } from "date-fns/locale";
import {
 Skull,
 TrendingDown,
 TrendingUp,
 DollarSign,
 Clock,
 Shield,
 AlertTriangle,
 Flag,
 Target,
 ArrowRight,
 Eye,
 Flame,
 CheckCircle2,
 MessageSquare,
 FileText,
 Calendar,
 Users,
} from "lucide-react";
import Link from "next/link";

// ─── TYPES ──────────────────────────────────────────────────

interface MirrorData {
 profile: Profile;
 orgId: string;
 trustScore: number;
 trustHistory30d: TrustScoreHistory[];
 trustHistory12w: TrustScoreHistory[];
 entries30d: TimeEntry[];
 flags: AccountabilityFlag[];
 suspiciousReactions: Array<{
 reaction: EntryReaction;
 senderName: string;
 entryTitle: string;
 }>;
 verifiedReactions: Array<{
 reaction: EntryReaction;
 senderName: string;
 entryTitle: string;
 }>;
 streak: number;
 closeouts30d: number;
 workdays30d: number;
 teamSize: number;
 rankPosition: number;
}

// ─── HELPERS ────────────────────────────────────────────────

function getTier(score: number): {
 tier: string;
 label: string;
 color: string;
 bgColor: string;
} {
 if (score >= 90)
 return {
 tier:"S",
 label:"Intocable",
 color:"text-emerald-500",
 bgColor:"bg-emerald-500/10 border-emerald-500/30",
 };
 if (score >= 80)
 return {
 tier:"A",
 label:"Confiable",
 color:"text-green-500",
 bgColor:"bg-green-500/10 border-green-500/30",
 };
 if (score >= 65)
 return {
 tier:"B",
 label:"Estable",
 color:"text-blue-500",
 bgColor:"bg-blue-500/10 border-blue-500/30",
 };
 if (score >= 50)
 return {
 tier:"C",
 label:"En riesgo",
 color:"text-yellow-500",
 bgColor:"bg-yellow-500/10 border-yellow-500/30",
 };
 if (score >= 30)
 return {
 tier:"D",
 label:"Problemático",
 color:"text-orange-500",
 bgColor:"bg-orange-500/10 border-orange-500/30",
 };
 return {
 tier:"F",
 label:"Crítico",
 color:"text-red-500",
 bgColor:"bg-red-500/10 border-red-500/30",
 };
}

function countWorkdays(startDate: Date, endDate: Date): number {
 let count = 0;
 const current = new Date(startDate);
 while (current <= endDate) {
 if (!isWeekend(current)) count++;
 current.setDate(current.getDate() + 1);
 }
 return count;
}

function getWorkdaysRemaining(): number {
 const today = new Date();
 const friday = endOfWeek(today, { weekStartsOn: 1 });
 friday.setDate(friday.getDate() - 2); // Friday
 let count = 0;
 const current = new Date(today);
 while (current <= friday) {
 if (!isWeekend(current)) count++;
 current.setDate(current.getDate() + 1);
 }
 return count;
}

function getWorkdaysThisWeek(): number {
 const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
 const today = new Date();
 let count = 0;
 const current = new Date(monday);
 while (current <= today) {
 if (!isWeekend(current)) count++;
 current.setDate(current.getDate() + 1);
 }
 return count;
}

// ─── SPARKLINE COMPONENT ────────────────────────────────────

function Sparkline({
 data,
 width = 200,
 height = 40,
 className,
}: {
 data: number[];
 width?: number;
 height?: number;
 className?: string;
}) {
 if (data.length < 2) return null;

 const min = Math.min(...data);
 const max = Math.max(...data);
 const range = max - min || 1;

 const points = data.map((v, i) => {
 const x = (i / (data.length - 1)) * width;
 const y = height - ((v - min) / range) * (height - 4) - 2;
 return`${x},${y}`;
 });

 const lastVal = data[data.length - 1];
 const lastColor =
 lastVal >= 75
 ?"text-green-500": lastVal >= 50
 ?"text-yellow-500":"text-red-500";

 return (
 <svg
 width={width}
 height={height}
 className={cn("overflow-visible", className)}
 >
 {/* Color zones */}
 <rect
 x={0}
 y={0}
 width={width}
 height={(height * (100 - 75)) / range}
 fill="currentColor"className="text-green-500/5"/>
 <rect
 x={0}
 y={(height * (100 - 75)) / range}
 width={width}
 height={(height * 25) / range}
 fill="currentColor"className="text-yellow-500/5"/>
 <rect
 x={0}
 y={(height * (100 - 50)) / range}
 width={width}
 height={(height * 50) / range}
 fill="currentColor"className="text-red-500/5"/>
 <polyline
 points={points.join("")}
 fill="none"stroke="currentColor"strokeWidth={2}
 strokeLinecap="round"strokeLinejoin="round"className={lastColor}
 />
 {/* Current dot */}
 {(() => {
 const lastPoint = points[points.length - 1].split(",");
 return (
 <circle
 cx={parseFloat(lastPoint[0])}
 cy={parseFloat(lastPoint[1])}
 r={3}
 fill="currentColor"className={lastColor}
 />
 );
 })()}
 </svg>
 );
}

// ─── TRUST CHART (12 weeks) ─────────────────────────────────

function TrustChart({
 data,
 className,
}: {
 data: { date: string; score: number }[];
 className?: string;
}) {
 if (data.length < 2) {
 return (
 <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
 No hay suficientes datos para el gráfico.
 </div>
 );
 }

 const width = 600;
 const height = 180;
 const padX = 40;
 const padY = 20;
 const chartW = width - padX * 2;
 const chartH = height - padY * 2;

 const points = data.map((d, i) => {
 const x = padX + (i / (data.length - 1)) * chartW;
 const y = padY + chartH - (d.score / 100) * chartH;
 return { x, y, score: d.score, date: d.date };
 });

 const pathD = points
 .map((p, i) =>`${i === 0 ?"M":"L"} ${p.x} ${p.y}`)
 .join("");

 // Zone lines at 50 and 75
 const y75 = padY + chartH - (75 / 100) * chartH;
 const y50 = padY + chartH - (50 / 100) * chartH;

 return (
 <svg
 viewBox={`0 0 ${width} ${height}`}
 className={cn("w-full", className)}
 >
 {/* Green zone */}
 <rect
 x={padX}
 y={padY}
 width={chartW}
 height={y75 - padY}
 fill="currentColor"className="text-green-500/5"/>
 {/* Yellow zone */}
 <rect
 x={padX}
 y={y75}
 width={chartW}
 height={y50 - y75}
 fill="currentColor"className="text-yellow-500/5"/>
 {/* Red zone */}
 <rect
 x={padX}
 y={y50}
 width={chartW}
 height={padY + chartH - y50}
 fill="currentColor"className="text-red-500/5"/>

 {/* Zone lines */}
 <line
 x1={padX}
 y1={y75}
 x2={padX + chartW}
 y2={y75}
 stroke="currentColor"strokeDasharray="4 4"className="text-green-500/30"/>
 <line
 x1={padX}
 y1={y50}
 x2={padX + chartW}
 y2={y50}
 stroke="currentColor"strokeDasharray="4 4"className="text-red-500/30"/>

 {/* Labels */}
 <text
 x={padX - 4}
 y={y75 + 3}
 textAnchor="end"className="fill-muted-foreground text-[9px]">
 75
 </text>
 <text
 x={padX - 4}
 y={y50 + 3}
 textAnchor="end"className="fill-muted-foreground text-[9px]">
 50
 </text>
 <text
 x={padX - 4}
 y={padY + 3}
 textAnchor="end"className="fill-muted-foreground text-[9px]">
 100
 </text>
 <text
 x={padX - 4}
 y={padY + chartH + 3}
 textAnchor="end"className="fill-muted-foreground text-[9px]">
 0
 </text>

 {/* Line */}
 <path
 d={pathD}
 fill="none"stroke="currentColor"strokeWidth={2.5}
 strokeLinecap="round"strokeLinejoin="round"className={
 points[points.length - 1].score >= 75
 ?"text-green-500": points[points.length - 1].score >= 50
 ?"text-yellow-500":"text-red-500"}
 />

 {/* Dots */}
 {points.map((p, i) => (
 <circle
 key={i}
 cx={p.x}
 cy={p.y}
 r={i === points.length - 1 ? 4 : 2}
 fill="currentColor"className={
 p.score >= 75
 ?"text-green-500": p.score >= 50
 ?"text-yellow-500":"text-red-500"}
 />
 ))}

 {/* Date labels — first, middle, last */}
 {[0, Math.floor(points.length / 2), points.length - 1].map((idx) => (
 <text
 key={idx}
 x={points[idx].x}
 y={height - 2}
 textAnchor="middle"className="fill-muted-foreground text-[8px]">
 {format(new Date(points[idx].date +"T12:00:00"),"dd MMM", {
 locale: es,
 })}
 </text>
 ))}
 </svg>
 );
}

// ─── REGRET VISUAL: DEBT BARS ───────────────────────────────

function DebtBars({
 lost,
 total,
 label,
}: {
 lost: number;
 total: number;
 label: string;
}) {
 const blocks = Math.min(Math.ceil(total), 40);
 const lostBlocks = Math.min(Math.ceil(lost), blocks);

 return (
 <div className="space-y-1">
 <p className="text-xs text-muted-foreground">{label}</p>
 <div className="flex flex-wrap gap-0.5">
 {Array.from({ length: blocks }).map((_, i) => (
 <div
 key={i}
 className={cn(
"w-3 h-5 rounded-sm transition-all duration-500",
 i < lostBlocks
 ?"bg-red-500/80 dark:bg-red-500/60":"bg-green-500/30 dark:bg-green-500/20")}
 style={{ animationDelay:`${i * 30}ms`}}
 />
 ))}
 </div>
 <p className="text-[10px] text-muted-foreground/70">
 {lostBlocks} de {blocks} bloques perdidos
 </p>
 </div>
 );
}

// ─── MAIN PAGE ──────────────────────────────────────────────

export default function MirrorPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [data, setData] = useState<MirrorData | null>(null);
 const [loading, setLoading] = useState(true);
 const [hourlyRate, setHourlyRate] = useState(25);
 const supabase = createClient();

 useEffect(() => {
 if (!orgId || !userId) return;

 async function load() {
 setLoading(true);

 // Get profile
 const { data: profile } = await supabase
 .from("profiles")
 .select("*")
 .eq("id", userId!)
 .single();
 if (!profile) return;
 const today = new Date();
 const thirtyDaysAgo = subDays(today, 30);
 const twelveWeeksAgo = subWeeks(today, 12);
 const todayStr = today.toISOString().split("T")[0];
 const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];
 const twelveWeeksAgoStr = twelveWeeksAgo.toISOString().split("T")[0];

 // Parallel fetches
 const [
 { data: entries30d },
 { data: trustHistory30d },
 { data: trustHistory12w },
 { data: flags },
 { data: streakData },
 { data: closeouts },
 { data: allMembers },
 ] = await Promise.all([
 supabase
 .from("time_entries")
 .select("*")
 .eq("user_id", userId!)
 .eq("org_id", orgId)
 .gte("date", thirtyDaysAgoStr)
 .lte("date", todayStr)
 .order("date", { ascending: true })
 ,
 supabase
 .from("trust_score_history")
 .select("*")
 .eq("user_id", userId!)
 .eq("org_id", orgId)
 .gte("date", thirtyDaysAgoStr)
 .lte("date", todayStr)
 .order("date", { ascending: true })
 ,
 supabase
 .from("trust_score_history")
 .select("*")
 .eq("user_id", userId!)
 .eq("org_id", orgId)
 .gte("date", twelveWeeksAgoStr)
 .lte("date", todayStr)
 .order("date", { ascending: true })
 ,
 supabase
 .from("accountability_flags")
 .select("*")
 .eq("user_id", userId!)
 .eq("org_id", orgId)
 .gte("date", thirtyDaysAgoStr)
 .order("date", { ascending: false })
 ,
 supabase
 .from("activity_streaks")
 .select("current_streak")
 .eq("user_id", userId!)
 .eq("org_id", orgId)
 .single(),
 supabase
 .from("daily_closeouts")
 .select("id")
 .eq("user_id", userId!)
 .eq("org_id", orgId)
 .gte("date", thirtyDaysAgoStr)
 .lte("date", todayStr),
 supabase
 .from("org_members")
 .select("user_id")
 .eq("org_id", orgId),
 ]);

 // Get entry IDs for reaction lookups
 const entryIds = (entries30d ?? []).map((e) => e.id);

 // Get reactions on user's entries
 let suspiciousReactions: MirrorData["suspiciousReactions"] = [];
 let verifiedReactions: MirrorData["verifiedReactions"] = [];

 if (entryIds.length > 0) {
 const { data: reactions } = await supabase
 .from("entry_reactions")
 .select("*")
 .in("entry_id", entryIds)
 ;

 if (reactions && reactions.length > 0) {
 // Get sender profiles
 const senderIds = [...new Set(reactions.map((r) => r.user_id))];
 const { data: senderProfiles } = await supabase
 .from("profiles")
 .select("id, full_name, email")
 .in("id", senderIds);

 const senderMap = new Map<string, string>(
 ((senderProfiles ?? []) as Array<{ id: string; full_name: string | null; email: string }>).map((p) => [
 p.id,
 p.full_name ?? p.email,
 ])
 );
 const entryMap = new Map<string, string>(
 (entries30d ?? []).map((e) => [e.id, e.title])
 );

 for (const r of reactions) {
 const info = {
 reaction: r,
 senderName: senderMap.get(r.user_id) ??"Desconocido",
 entryTitle: entryMap.get(r.entry_id) ??"Entrada",
 };
 if (r.reaction ==="suspicious") {
 suspiciousReactions.push(info);
 } else if (r.reaction ==="verified") {
 verifiedReactions.push(info);
 }
 }
 }
 }

 // Compute rank position among team members
 let rankPosition = 1;
 if (allMembers && allMembers.length > 1) {
 const { data: allScores } = await supabase
 .from("trust_score_history")
 .select("user_id, score")
 .eq("org_id", orgId)
 .eq("date", todayStr);

 if (allScores && allScores.length > 0) {
 const scoreMap = new Map<string, number>();
 for (const s of allScores) {
 scoreMap.set(s.user_id, s.score);
 }
 const myScore = scoreMap.get(userId!) ?? 0;
 let rank = 1;
 for (const [uid, sc] of scoreMap) {
 if (uid !== userId && sc > myScore) rank++;
 }
 rankPosition = rank;
 }
 }

 // Compute trust score — use latest from history or calculate
 const latestTrust =
 trustHistory30d && trustHistory30d.length > 0
 ? trustHistory30d[trustHistory30d.length - 1].score
 : 50;

 const workdays30 = countWorkdays(thirtyDaysAgo, today);

 setData({
 profile,
 orgId: orgId!,
 trustScore: latestTrust,
 trustHistory30d: trustHistory30d ?? [],
 trustHistory12w: trustHistory12w ?? [],
 entries30d: entries30d ?? [],
 flags: flags ?? [],
 suspiciousReactions,
 verifiedReactions,
 streak: streakData?.current_streak ?? 0,
 closeouts30d: closeouts?.length ?? 0,
 workdays30d: workdays30,
 teamSize: allMembers?.length ?? 1,
 rankPosition,
 });

 setLoading(false);
 }

 load();
 }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

 // ─── COMPUTED DATA ──────────────────────────────────────────

 const computed = useMemo(() => {
 if (!data) return null;

 const totalHours = data.entries30d.length;
 const hoursWithProof = data.entries30d.filter(
 (e) => e.proof_urls && e.proof_urls.length > 0
 ).length;
 const lateEntries = data.entries30d.filter((e) => e.is_late).length;
 const proofRate =
 totalHours > 0 ? Math.round((hoursWithProof / totalHours) * 100) : 0;
 const lateRate =
 totalHours > 0 ? Math.round((lateEntries / totalHours) * 100) : 0;

 const expectedTotal = data.workdays30d * EXPECTED_DAILY_HOURS;
 const gapHours = Math.max(0, expectedTotal - totalHours);

 // Ghost hours: entries without proof and without closeout on that day
 const entriesNoProof = data.entries30d.filter(
 (e) => !e.proof_urls || e.proof_urls.length === 0
 ).length;

 // Regret calculations
 const hoursBelow8PerDay = gapHours;
 const fullDaysEquivalent = Math.round((hoursBelow8PerDay / EXPECTED_DAILY_HOURS) * 10) / 10;
 const costAtRate = hoursBelow8PerDay * hourlyRate;

 // Days without closeout
 const uniqueDatesLogged = new Set(data.entries30d.map((e) => e.date));
 const daysWithoutCloseout = Math.max(0, data.workdays30d - data.closeouts30d);

 // Trust trajectory
 const scores30d = data.trustHistory30d.map((t) => t.score);
 const scores12w = data.trustHistory12w.map((t) => ({
 date: t.date,
 score: t.score,
 }));

 const score4WeeksAgo =
 data.trustHistory12w.length > 0
 ? (() => {
 const fourWeeksAgoDate = subWeeks(new Date(), 4)
 .toISOString()
 .split("T")[0];
 const closest = data.trustHistory12w.reduce((prev, curr) =>
 Math.abs(
 new Date(curr.date).getTime() -
 new Date(fourWeeksAgoDate).getTime()
 ) <
 Math.abs(
 new Date(prev.date).getTime() -
 new Date(fourWeeksAgoDate).getTime()
 )
 ? curr
 : prev
 );
 return closest.score;
 })()
 : null;

 // Projection: linear extrapolation from last 7 days
 const last7Scores = scores30d.slice(-7);
 let projectedScore2w = data.trustScore;
 if (last7Scores.length >= 2) {
 const slope =
 (last7Scores[last7Scores.length - 1] - last7Scores[0]) /
 last7Scores.length;
 projectedScore2w = Math.max(
 0,
 Math.min(100, Math.round(data.trustScore + slope * 14))
 );
 }

 // Predictions for end of week
 const workdaysPassed = getWorkdaysThisWeek();
 const workdaysLeft = getWorkdaysRemaining();
 const todayStr = new Date().toISOString().split("T")[0];
 const mondayStr = startOfWeek(new Date(), { weekStartsOn: 1 })
 .toISOString()
 .split("T")[0];

 const hoursThisWeek = data.entries30d.filter(
 (e) => e.date >= mondayStr && e.date <= todayStr
 ).length;
 const avgHoursPerDay =
 workdaysPassed > 0 ? hoursThisWeek / workdaysPassed : 0;
 const projectedWeeklyHours = Math.round(
 hoursThisWeek + avgHoursPerDay * Math.max(0, workdaysLeft - 1)
 );

 const projectedTier = getTier(projectedScore2w);
 const currentTier = getTier(data.trustScore);

 // Points needed calculation
 const pointsToNextTier = (() => {
 const thresholds = [90, 80, 65, 50, 30, 0];
 for (const t of thresholds) {
 if (data.trustScore < t) return t - data.trustScore;
 }
 return 0;
 })();

 return {
 totalHours,
 hoursWithProof,
 lateEntries,
 proofRate,
 lateRate,
 gapHours,
 entriesNoProof,
 hoursBelow8PerDay,
 fullDaysEquivalent,
 costAtRate,
 daysWithoutCloseout,
 scores30d,
 scores12w,
 score4WeeksAgo,
 projectedScore2w,
 projectedWeeklyHours,
 projectedTier,
 currentTier,
 pointsToNextTier,
 hoursThisWeek,
 avgHoursPerDay,
 workdaysLeft,
 };
 }, [data, hourlyRate]);

 // ─── RENDER ─────────────────────────────────────────────────

 if (orgLoading || loading || !data || !computed) {
 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">
 Cargando...
 </p>
 </div>
 </div>
 );
 }

 const tier = getTier(data.trustScore);

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-3 mb-2">
 <Eye className="w-6 h-6 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">El Espejo</h1>
 </div>
 <p className="text-muted-foreground text-sm mb-8">
 Así te ve tu equipo. Sin filtros. Sin excusas.
 </p>

 {/* ═══════════════════════════════════════════════════════ */}
 {/* SECTION 1 — Así te ve tu equipo */}
 {/* ═══════════════════════════════════════════════════════ */}

 <section className="mb-8">
 <h2 className="text-lg font-bold tracking-tight mb-4 flex items-center gap-2">
 <Users className="w-5 h-5 text-primary"/>
 Así te ve tu equipo
 </h2>

 {/* Identity card */}
 <Card className="transition-all duration-300 hover:border-primary/30 mb-4">
 <CardContent className="p-6">
 <div className="flex items-center gap-6">
 {/* Large avatar */}
 <Avatar className="w-20 h-20 ring-4 ring-background">
 <AvatarImage src={data.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-xl">
 {getInitials(data.profile.full_name)}
 </AvatarFallback>
 </Avatar>

 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-3 flex-wrap">
 <h3 className="text-xl font-bold truncate">
 {data.profile.full_name ?? data.profile.email}
 </h3>
 <Badge
 className={cn(
"text-sm font-bold px-3 py-0.5 border",
 tier.bgColor,
 tier.color
 )}
 >
 Tier {tier.tier}
 </Badge>
 </div>
 <p className={cn("text-sm font-medium mt-0.5", tier.color)}>
 {tier.label}
 </p>
 {data.profile.role && (
 <p className="text-xs text-muted-foreground mt-1">
 {data.profile.role}
 </p>
 )}
 </div>

 {/* Trust score */}
 <div className="text-center">
 <p
 className={cn(
"text-5xl font-black tabular-nums tracking-tight",
 tier.color
 )}
 >
 {data.trustScore}
 </p>
 <p className="text-xs text-muted-foreground font-medium">
 Trust Score
 </p>
 {/* 30d sparkline */}
 {computed.scores30d.length > 1 && (
 <Sparkline
 data={computed.scores30d}
 width={120}
 height={30}
 className="mt-2"/>
 )}
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Public stats grid */}
 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
 <div className="text-center p-3 bg-accent/40">
 <p
 className={cn(
"text-xl font-bold tabular-nums",
 computed.totalHours >= data.workdays30d * EXPECTED_DAILY_HOURS * 0.8
 ?"text-green-600":"text-red-600")}
 >
 {computed.totalHours}h
 </p>
 <p className="text-[10px] text-muted-foreground">
 Total (30d)
 </p>
 </div>

 <div className="text-center p-3 bg-accent/40">
 <p
 className={cn(
"text-xl font-bold tabular-nums",
 computed.proofRate >= 80
 ?"text-green-600": computed.proofRate >= 50
 ?"text-yellow-600":"text-red-600")}
 >
 {computed.proofRate}%
 </p>
 <p className="text-[10px] text-muted-foreground">
 Con evidencia
 </p>
 </div>

 <div className="text-center p-3 bg-accent/40">
 <p
 className={cn(
"text-xl font-bold tabular-nums",
 computed.lateRate <= 10
 ?"text-green-600":"text-orange-600")}
 >
 {computed.lateRate}%
 </p>
 <p className="text-[10px] text-muted-foreground">Tardías</p>
 </div>

 <div className="text-center p-3 bg-accent/40">
 <p className="text-xl font-bold tabular-nums text-orange-600">
 {computed.gapHours}h
 </p>
 <p className="text-[10px] text-muted-foreground">
 Gap (30d)
 </p>
 </div>

 <div className="text-center p-3 bg-accent/40">
 <p className="text-xl font-bold tabular-nums text-red-500">
 {computed.entriesNoProof}
 </p>
 <p className="text-[10px] text-muted-foreground">
 Sin evidencia
 </p>
 </div>

 <div className="text-center p-3 bg-accent/40">
 <div className="flex items-center justify-center gap-1">
 <Flame
 className={cn(
"w-5 h-5",
 data.streak > 5
 ?"text-orange-500":"text-muted-foreground")}
 />
 <p
 className={cn(
"text-xl font-bold tabular-nums",
 data.streak > 5
 ?"text-orange-500":"text-muted-foreground")}
 >
 {data.streak}d
 </p>
 </div>
 <p className="text-[10px] text-muted-foreground">Racha</p>
 </div>
 </div>

 {/* Flags received */}
 {data.flags.length > 0 && (
 <Card className="mb-4 border-red-200 dark:border-red-900">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-600">
 <Flag className="w-4 h-4"/>
 Flags recibidos ({data.flags.length})
 </CardTitle>
 </CardHeader>
 <CardContent className="pt-0">
 <div className="space-y-2">
 {data.flags.map((flag) => {
 const info = FLAG_TYPES[flag.flag_type as FlagType];
 return (
 <div
 key={flag.id}
 className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
 <div className="flex items-center gap-2">
 <span>{info?.emoji ??"?"}</span>
 <span className="text-sm">
 {info?.label ?? flag.flag_type}
 </span>
 {flag.details && (
 <span className="text-xs text-muted-foreground">
 ({flag.details})
 </span>
 )}
 </div>
 <span className="text-xs text-muted-foreground tabular-nums">
 {format(
 new Date(flag.date +"T12:00:00"),
"dd MMM",
 { locale: es }
 )}
 </span>
 </div>
 );
 })}
 </div>
 </CardContent>
 </Card>
 )}

 {/* Suspicious reactions */}
 {data.suspiciousReactions.length > 0 && (
 <Card className="mb-4 border-orange-200 dark:border-orange-900">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-600">
 <AlertTriangle className="w-4 h-4"/>
 Reacciones sospechosas recibidas (
 {data.suspiciousReactions.length})
 </CardTitle>
 </CardHeader>
 <CardContent className="pt-0">
 <div className="space-y-2">
 {data.suspiciousReactions.map((s, i) => (
 <div
 key={i}
 className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
 <div className="flex items-center gap-2 min-w-0">
 <span className="text-sm">
 ??{" "}
 <span className="font-medium">{s.senderName}</span>{" "}
 marcó{" "}
 <span className="text-muted-foreground truncate">
 &quot;{s.entryTitle}&quot;
 </span>
 </span>
 </div>
 <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-2">
 {format(
 new Date(s.reaction.created_at),
"dd MMM",
 { locale: es }
 )}
 </span>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>
 )}

 {/* Verified reactions */}
 {data.verifiedReactions.length > 0 && (
 <Card className="mb-4 border-green-200 dark:border-green-900">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-semibold flex items-center gap-2 text-green-600">
 <CheckCircle2 className="w-4 h-4"/>
 Verificaciones recibidas ({data.verifiedReactions.length})
 </CardTitle>
 </CardHeader>
 <CardContent className="pt-0">
 <div className="space-y-2">
 {data.verifiedReactions.slice(0, 10).map((v, i) => (
 <div
 key={i}
 className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
 <div className="flex items-center gap-2 min-w-0">
 <span className="text-sm">
 OK{" "}
 <span className="font-medium">{v.senderName}</span>{" "}
 verificó{" "}
 <span className="text-muted-foreground truncate">
 &quot;{v.entryTitle}&quot;
 </span>
 </span>
 </div>
 <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-2">
 {format(
 new Date(v.reaction.created_at),
"dd MMM",
 { locale: es }
 )}
 </span>
 </div>
 ))}
 {data.verifiedReactions.length > 10 && (
 <p className="text-xs text-muted-foreground text-center pt-1">
 +{data.verifiedReactions.length - 10} más
 </p>
 )}
 </div>
 </CardContent>
 </Card>
 )}
 </section>

 {/* ═══════════════════════════════════════════════════════ */}
 {/* SECTION 2 — Calculadora de Arrepentimiento */}
 {/* ═══════════════════════════════════════════════════════ */}

 <section className="mb-8">
 <h2 className="text-lg font-bold tracking-tight mb-4 flex items-center gap-2">
 <Skull className="w-5 h-5 text-red-500"/>
 Calculadora de Arrepentimiento
 </h2>

 <Card className="transition-all duration-300 hover:border-primary/30 border-red-200/50 dark:border-red-900/50">
 <CardContent className="p-6 space-y-6">
 {/* Lost hours */}
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 bg-red-500/10 flex items-center justify-center shrink-0">
 <Clock className="w-6 h-6 text-red-500"/>
 </div>
 <div>
 <p className="text-sm text-muted-foreground">
 Horas perdidas este mes
 </p>
 <p className="text-3xl font-black tabular-nums text-red-500">
 {computed.hoursBelow8PerDay}h
 </p>
 <p className="text-sm text-muted-foreground mt-1">
 Eso equivale a{" "}
 <span className="font-bold text-foreground">
 {computed.fullDaysEquivalent} días completos
 </span>{" "}
 de trabajo que tu equipo cubrió.
 </p>
 </div>
 </div>

 {/* Cost */}
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 bg-red-500/10 flex items-center justify-center shrink-0">
 <DollarSign className="w-6 h-6 text-red-500"/>
 </div>
 <div>
 <div className="flex items-center gap-3 flex-wrap">
 <p className="text-sm text-muted-foreground">
 Si esas horas se pagaran a
 </p>
 <div className="inline-flex items-center gap-1 bg-accent/60 px-2 py-0.5">
 <span className="text-xs text-muted-foreground">$</span>
 <input
 type="number"value={hourlyRate}
 onChange={(e) =>
 setHourlyRate(Math.max(1, Number(e.target.value)))
 }
 className="w-14 bg-transparent text-sm font-bold tabular-nums text-center outline-none"min={1}
 />
 <span className="text-xs text-muted-foreground">
 /hora
 </span>
 </div>
 </div>
 <p className="text-3xl font-black tabular-nums text-red-500 mt-1">
 ${computed.costAtRate.toLocaleString("es-MX")}
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 Costo estimado de horas no trabajadas
 </p>
 </div>
 </div>

 {/* Entries without proof */}
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 bg-orange-500/10 flex items-center justify-center shrink-0">
 <Shield className="w-6 h-6 text-orange-500"/>
 </div>
 <div>
 <p className="text-sm text-muted-foreground">
 Entradas sin evidencia
 </p>
 <p className="text-3xl font-black tabular-nums text-orange-500">
 {computed.entriesNoProof}
 </p>
 <p className="text-sm text-muted-foreground mt-1">
 Tu equipo no puede verificar ese trabajo.
 </p>
 </div>
 </div>

 {/* Days without closeout */}
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 bg-yellow-500/10 flex items-center justify-center shrink-0">
 <FileText className="w-6 h-6 text-yellow-500"/>
 </div>
 <div>
 <p className="text-sm text-muted-foreground">
 Días sin cierre
 </p>
 <p className="text-3xl font-black tabular-nums text-yellow-500">
 {computed.daysWithoutCloseout}
 </p>
 <p className="text-sm text-muted-foreground mt-1">
 Tu equipo no supo qué hiciste esos días.
 </p>
 </div>
 </div>

 {/* Debt visualization */}
 <div className="border-t border-border/50 pt-4">
 <DebtBars
 lost={computed.hoursBelow8PerDay}
 total={data.workdays30d * EXPECTED_DAILY_HOURS}
 label="Deuda de horas (bloques = horas esperadas vs. registradas)"/>
 </div>
 </CardContent>
 </Card>
 </section>

 {/* ═══════════════════════════════════════════════════════ */}
 {/* SECTION 3 — Tu Trayectoria */}
 {/* ═══════════════════════════════════════════════════════ */}

 <section className="mb-8">
 <h2 className="text-lg font-bold tracking-tight mb-4 flex items-center gap-2">
 <TrendingUp className="w-5 h-5 text-primary"/>
 Tu Trayectoria
 </h2>

 <Card className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-6">
 {/* 12-week chart */}
 <TrustChart data={computed.scores12w} className="mb-4"/>

 {/* Trajectory summary */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
 {/* 4 weeks ago */}
 {computed.score4WeeksAgo !== null && (
 <div className="text-center p-3 bg-accent/40">
 <p className="text-xs text-muted-foreground mb-1">
 Hace 4 semanas
 </p>
 <p
 className={cn(
"text-2xl font-bold tabular-nums",
 computed.score4WeeksAgo >= 75
 ?"text-green-600": computed.score4WeeksAgo >= 50
 ?"text-yellow-600":"text-red-600")}
 >
 {computed.score4WeeksAgo}
 </p>
 </div>
 )}

 {/* Current */}
 <div className="text-center p-3 bg-accent/40">
 <p className="text-xs text-muted-foreground mb-1">Hoy</p>
 <div className="flex items-center justify-center gap-2">
 {computed.score4WeeksAgo !== null && (
 <>
 {data.trustScore > computed.score4WeeksAgo ? (
 <TrendingUp className="w-5 h-5 text-green-500"/>
 ) : data.trustScore < computed.score4WeeksAgo ? (
 <TrendingDown className="w-5 h-5 text-red-500"/>
 ) : null}
 </>
 )}
 <p
 className={cn(
"text-2xl font-bold tabular-nums",
 tier.color
 )}
 >
 {data.trustScore}
 </p>
 </div>
 </div>

 {/* Projected */}
 <div className="text-center p-3 bg-accent/40">
 <p className="text-xs text-muted-foreground mb-1">
 Proyección (2 sem)
 </p>
 <p
 className={cn(
"text-2xl font-bold tabular-nums",
 computed.projectedScore2w >= 75
 ?"text-green-600": computed.projectedScore2w >= 50
 ?"text-yellow-600":"text-red-600")}
 >
 ~{computed.projectedScore2w}
 </p>
 </div>
 </div>

 {computed.score4WeeksAgo !== null && (
 <p className="text-sm text-center text-muted-foreground mt-4">
 Hace 4 semanas estabas en{" "}
 <span className="font-bold text-foreground">
 {computed.score4WeeksAgo}
 </span>
 . Hoy estás en{" "}
 <span className={cn("font-bold", tier.color)}>
 {data.trustScore}
 </span>
 .{" "}
 {data.trustScore > computed.score4WeeksAgo
 ?"Vas subiendo.": data.trustScore < computed.score4WeeksAgo
 ?"Vas bajando.":"Te mantienes igual."}
 </p>
 )}
 </CardContent>
 </Card>
 </section>

 {/* ═══════════════════════════════════════════════════════ */}
 {/* SECTION 4 — Profecía de Rendimiento */}
 {/* ═══════════════════════════════════════════════════════ */}

 <section className="mb-8">
 <h2 className="text-lg font-bold tracking-tight mb-4 flex items-center gap-2">
 <Target className="w-5 h-5 text-primary"/>
 Profecía de Rendimiento
 </h2>

 <Card className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-6">
 <p className="text-lg font-bold text-muted-foreground mb-4">
 A este ritmo...
 </p>

 <div className="space-y-4">
 {/* Weekly hours projection */}
 <div
 className={cn(
"flex items-center gap-4 p-4 border",
 computed.projectedWeeklyHours >= 40
 ?"bg-green-500/5 border-green-500/20":"bg-red-500/5 border-red-500/20")}
 >
 <Clock
 className={cn(
"w-5 h-5 shrink-0",
 computed.projectedWeeklyHours >= 40
 ?"text-green-500":"text-red-500")}
 />
 <p className="text-sm">
 ...el viernes habrás registrado{" "}
 <span
 className={cn(
"font-bold text-lg tabular-nums",
 computed.projectedWeeklyHours >= 40
 ?"text-green-600":"text-red-600")}
 >
 {computed.projectedWeeklyHours}h
 </span>{" "}
 de 40h
 </p>
 </div>

 {/* Trust score projection */}
 <div
 className={cn(
"flex items-center gap-4 p-4 border",
 computed.projectedScore2w >= data.trustScore
 ?"bg-green-500/5 border-green-500/20":"bg-red-500/5 border-red-500/20")}
 >
 <Shield
 className={cn(
"w-5 h-5 shrink-0",
 computed.projectedScore2w >= data.trustScore
 ?"text-green-500":"text-red-500")}
 />
 <p className="text-sm">
 ...tu Trust Score será{" "}
 <span
 className={cn(
"font-bold text-lg tabular-nums",
 computed.projectedScore2w >= data.trustScore
 ?"text-green-600":"text-red-600")}
 >
 ~{computed.projectedScore2w}
 </span>{" "}
 (actualmente{" "}
 <span className="font-bold tabular-nums">
 {data.trustScore}
 </span>
 )
 </p>
 </div>

 {/* Tier projection */}
 <div
 className={cn(
"flex items-center gap-4 p-4 border",
 computed.projectedTier.tier <= computed.currentTier.tier
 ?"bg-green-500/5 border-green-500/20":"bg-red-500/5 border-red-500/20")}
 >
 <Flag
 className={cn(
"w-5 h-5 shrink-0",
 computed.projectedTier.tier <= computed.currentTier.tier
 ?"text-green-500":"text-red-500")}
 />
 <p className="text-sm">
 ...tu título será{" "}
 <Badge
 className={cn(
"font-bold border",
 computed.projectedTier.bgColor,
 computed.projectedTier.color
 )}
 >
 Tier {computed.projectedTier.tier} —{" "}
 {computed.projectedTier.label}
 </Badge>
 </p>
 </div>

 {/* Rank projection */}
 <div
 className={cn(
"flex items-center gap-4 p-4 border",
 data.rankPosition <= Math.ceil(data.teamSize / 2)
 ?"bg-green-500/5 border-green-500/20":"bg-red-500/5 border-red-500/20")}
 >
 <Users
 className={cn(
"w-5 h-5 shrink-0",
 data.rankPosition <= Math.ceil(data.teamSize / 2)
 ?"text-green-500":"text-red-500")}
 />
 <p className="text-sm">
 ...tu posición en el ranking será{" "}
 <span
 className={cn(
"font-bold text-lg tabular-nums",
 data.rankPosition <= Math.ceil(data.teamSize / 2)
 ?"text-green-600":"text-red-600")}
 >
 #{data.rankPosition}
 </span>{" "}
 de {data.teamSize}
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 </section>

 {/* ═══════════════════════════════════════════════════════ */}
 {/* SECTION 5 — Lo que puedes hacer */}
 {/* ═══════════════════════════════════════════════════════ */}

 <section className="mb-8">
 <h2 className="text-lg font-bold tracking-tight mb-4 flex items-center gap-2">
 <Target className="w-5 h-5 text-primary"/>
 Lo que puedes hacer
 </h2>

 <div className="space-y-3">
 {/* Action: Log hours with proof */}
 {computed.proofRate < 100 && (
 <Card className="transition-all duration-300 hover:border-primary/30 hover:-translate-y-0.5">
 <CardContent className="p-4">
 <div className="flex items-center gap-4">
 <div className="w-10 h-10 bg-green-500/10 flex items-center justify-center shrink-0">
 <Shield className="w-5 h-5 text-green-500"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-semibold">
 Registra 2 horas con evidencia para subir{" "}
 {Math.min(computed.pointsToNextTier, 5)} puntos
 </p>
 <p className="text-xs text-muted-foreground mt-0.5">
 Tu tasa de evidencia es {computed.proofRate}%. Cada
 hora con prueba sube tu Trust Score.
 </p>
 </div>
 <Link href="/dashboard">
 <Button
 size="sm"className="bg-primary text-white border-0 gap-1">
 Registrar
 <ArrowRight className="w-3.5 h-3.5"/>
 </Button>
 </Link>
 </div>
 </CardContent>
 </Card>
 )}

 {/* Action: Daily closeout */}
 {computed.daysWithoutCloseout > 0 && (
 <Card className="transition-all duration-300 hover:border-primary/30 hover:-translate-y-0.5">
 <CardContent className="p-4">
 <div className="flex items-center gap-4">
 <div className="w-10 h-10 bg-yellow-500/10 flex items-center justify-center shrink-0">
 <FileText className="w-5 h-5 text-yellow-500"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-semibold">
 Haz tu cierre del día para evitar un flag
 </p>
 <p className="text-xs text-muted-foreground mt-0.5">
 Llevas {computed.daysWithoutCloseout} días sin cierre
 este mes. Tu equipo necesita saber qué hiciste.
 </p>
 </div>
 <Link href="/dashboard">
 <Button
 size="sm"className="bg-primary text-white border-0 gap-1">
 Cerrar día
 <ArrowRight className="w-3.5 h-3.5"/>
 </Button>
 </Link>
 </div>
 </CardContent>
 </Card>
 )}

 {/* Action: Standup */}
 <Card className="transition-all duration-300 hover:border-primary/30 hover:-translate-y-0.5">
 <CardContent className="p-4">
 <div className="flex items-center gap-4">
 <div className="w-10 h-10 bg-blue-500/10 flex items-center justify-center shrink-0">
 <MessageSquare className="w-5 h-5 text-blue-500"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-semibold">
 Completa tu standup mañana antes de las 10am
 </p>
 <p className="text-xs text-muted-foreground mt-0.5">
 Los standups a tiempo muestran compromiso y mejoran tu
 visibilidad con el equipo.
 </p>
 </div>
 <Link href="/standup">
 <Button
 size="sm"className="bg-primary text-white border-0 gap-1">
 Standup
 <ArrowRight className="w-3.5 h-3.5"/>
 </Button>
 </Link>
 </div>
 </CardContent>
 </Card>

 {/* Action: Fill gap hours */}
 {computed.gapHours > 0 && (
 <Card className="transition-all duration-300 hover:border-primary/30 hover:-translate-y-0.5">
 <CardContent className="p-4">
 <div className="flex items-center gap-4">
 <div className="w-10 h-10 bg-orange-500/10 flex items-center justify-center shrink-0">
 <Clock className="w-5 h-5 text-orange-500"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-semibold">
 Registra las {Math.min(computed.gapHours, EXPECTED_DAILY_HOURS)}h
 faltantes de hoy
 </p>
 <p className="text-xs text-muted-foreground mt-0.5">
 Tienes un gap de {computed.gapHours}h este mes. Cada
 hora que registres reduce tu deuda.
 </p>
 </div>
 <Link href="/dashboard">
 <Button
 size="sm"className="bg-primary text-white border-0 gap-1">
 Registrar
 <ArrowRight className="w-3.5 h-3.5"/>
 </Button>
 </Link>
 </div>
 </CardContent>
 </Card>
 )}

 {/* Action: Address suspicious reactions */}
 {data.suspiciousReactions.length > 0 && (
 <Card className="transition-all duration-300 hover:border-primary/30 hover:-translate-y-0.5 border-orange-200 dark:border-orange-900">
 <CardContent className="p-4">
 <div className="flex items-center gap-4">
 <div className="w-10 h-10 bg-red-500/10 flex items-center justify-center shrink-0">
 <AlertTriangle className="w-5 h-5 text-red-500"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-semibold">
 Agrega evidencia a entradas marcadas como sospechosas
 </p>
 <p className="text-xs text-muted-foreground mt-0.5">
 {data.suspiciousReactions.length} entradas fueron
 cuestionadas. Agrega enlaces o capturas para
 demostrar tu trabajo.
 </p>
 </div>
 <Link href="/dashboard">
 <Button
 size="sm"className="bg-primary text-white border-0 gap-1">
 Ver entradas
 <ArrowRight className="w-3.5 h-3.5"/>
 </Button>
 </Link>
 </div>
 </CardContent>
 </Card>
 )}

 {/* All good state */}
 {computed.proofRate >= 100 &&
 computed.daysWithoutCloseout === 0 &&
 computed.gapHours === 0 &&
 data.suspiciousReactions.length === 0 && (
 <Card className="border-green-200 dark:border-green-900">
 <CardContent className="p-6">
 <div className="flex flex-col items-center justify-center text-center gap-3">
 <div className="w-16 h-16 bg-green-500/10 flex items-center justify-center">
 <CheckCircle2 className="w-8 h-8 text-green-500"/>
 </div>
 <p className="text-sm font-semibold text-green-600">
 Todo limpio. Tu equipo te ve bien.
 </p>
 <p className="text-xs text-muted-foreground">
 Mantén este ritmo y tu Trust Score seguirá subiendo.
 </p>
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 </section>
 </div>
 );
}
