"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import { Droplets, Clock, FileText, TrendingDown, Flame } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberCandle {
 userId: string;
 profile: Profile;
 baseScore: number;
 hoursSinceLastEntry: number;
 entriesToday: number;
 decayedScore: number;
 recentlyLogged: boolean; // last 30 min
}

// ---------------------------------------------------------------------------
// Candle color helpers
// ---------------------------------------------------------------------------

function flameColor(score: number): {
 label: string;
 flame: string;
 glow: string;
 wax: string;
 bg: string;
} {
 if (score >= 80)
 return {
 label:"Ardiendo",
 flame:"from-green-300 via-green-400 to-emerald-500",
 glow:"shadow-green-400/50",
 wax:"from-green-100 to-green-200 dark:from-green-900 dark:to-green-800",
 bg:"bg-green-500/10",
 };
 if (score >= 60)
 return {
 label:"Estable",
 flame:"from-yellow-200 via-yellow-400 to-amber-500",
 glow:"shadow-yellow-400/50",
 wax:"from-yellow-100 to-yellow-200 dark:from-yellow-900 dark:to-yellow-800",
 bg:"bg-yellow-500/10",
 };
 if (score >= 40)
 return {
 label:"Debilitando",
 flame:"from-orange-300 via-orange-500 to-red-500",
 glow:"shadow-orange-400/50",
 wax:"from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800",
 bg:"bg-orange-500/10",
 };
 if (score >= 20)
 return {
 label:"Cr\u00edtico",
 flame:"from-red-400 via-red-600 to-red-700",
 glow:"shadow-red-500/50",
 wax:"from-red-100 to-red-200 dark:from-red-900 dark:to-red-800",
 bg:"bg-red-500/10",
 };
 return {
 label:"Extinguido",
 flame:"",
 glow:"",
 wax:"from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800",
 bg:"bg-slate-500/10",
 };
}

function scoreBadgeVariant(score: number): string {
 if (score >= 80) return"text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40";
 if (score >= 60) return"text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/40";
 if (score >= 40) return"text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/40";
 if (score >= 20) return"text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/40";
 return"text-slate-700 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/40";
}

// ---------------------------------------------------------------------------
// CSS Keyframes (injected once via <style>)
// ---------------------------------------------------------------------------

const candleStyles =`@keyframes flicker {
 0%, 100% { transform: scaleX(1) scaleY(1) rotate(0deg); opacity: 1; }
 25% { transform: scaleX(0.92) scaleY(1.04) rotate(-2deg); opacity: 0.9; }
 50% { transform: scaleX(1.05) scaleY(0.96) rotate(1deg); opacity: 1; }
 75% { transform: scaleX(0.97) scaleY(1.02) rotate(-1deg); opacity: 0.95; }
}
@keyframes flicker-inner {
 0%, 100% { transform: scaleX(1) scaleY(1); opacity: 0.8; }
 33% { transform: scaleX(0.85) scaleY(1.1); opacity: 0.7; }
 66% { transform: scaleX(1.1) scaleY(0.9); opacity: 0.9; }
}
@keyframes smoke-rise {
 0% { opacity: 0.6; transform: translateY(0) scaleX(1); }
 50% { opacity: 0.3; transform: translateY(-12px) scaleX(1.5); }
 100% { opacity: 0; transform: translateY(-28px) scaleX(2); }
}
@keyframes smoke-rise-2 {
 0% { opacity: 0.4; transform: translateY(0) scaleX(1) translateX(0); }
 50% { opacity: 0.2; transform: translateY(-16px) scaleX(1.3) translateX(3px); }
 100% { opacity: 0; transform: translateY(-32px) scaleX(1.8) translateX(-2px); }
}
@keyframes melt-drip {
 0%, 100% { transform: scaleY(1); }
 50% { transform: scaleY(1.08); }
}
@keyframes glow-pulse {
 0%, 100% { opacity: 0.3; }
 50% { opacity: 0.6; }
}
.candle-flame {
 animation: flicker 1.5s ease-in-out infinite;
 transform-origin: bottom center;
}
.candle-flame-inner {
 animation: flicker-inner 1.2s ease-in-out infinite;
 transform-origin: bottom center;
}
.candle-smoke {
 animation: smoke-rise 2.5s ease-out infinite;
}
.candle-smoke-2 {
 animation: smoke-rise-2 3s ease-out infinite 0.5s;
}
.candle-melt {
 animation: melt-drip 3s ease-in-out infinite;
 transform-origin: bottom center;
}
.candle-glow {
 animation: glow-pulse 2s ease-in-out infinite;
}
`;

// ---------------------------------------------------------------------------
// CandleVisualization component
// ---------------------------------------------------------------------------

function CandleVisualization({
 score,
 isActive,
 isExtinguished,
}: {
 score: number;
 isActive: boolean;
 isExtinguished: boolean;
}) {
 const colors = flameColor(score);
 // Map score (0-100) to candle height percentage (10-100%)
 const heightPercent = Math.max(10, score);

 return (
 <div className="relative flex flex-col items-center justify-end h-36 w-12">
 {/* Flame or smoke */}
 {!isExtinguished ? (
 <div className="relative flex items-end justify-center mb-[-2px] z-10">
 {/* Glow */}
 {isActive && (
 <div
 className={cn(
"absolute -inset-3 rounded-full blur-md candle-glow",
 colors.glow
 )}
 />
 )}
 {/* Outer flame */}
 <div
 className={cn(
"candle-flame w-5 rounded-full bg-gradient-to-t",
 colors.flame
 )}
 style={{
 height:`${Math.max(16, score * 0.3)}px`,
 filter:"blur(0.5px)",
 }}
 />
 {/* Inner flame (brighter core) */}
 <div
 className="candle-flame-inner absolute bottom-0 w-2.5 rounded-full bg-gradient-to-t from-white/80 to-white/20"style={{
 height:`${Math.max(8, score * 0.18)}px`,
 }}
 />
 </div>
 ) : (
 <div className="relative flex items-end justify-center mb-[-2px] z-10 h-8">
 {/* Smoke wisps */}
 <div className="candle-smoke absolute bottom-0 w-1.5 h-3 rounded-full bg-slate-400/40 dark:bg-slate-500/30 blur-[1px]"/>
 <div className="candle-smoke-2 absolute bottom-0 left-1 w-1 h-2 rounded-full bg-slate-400/30 dark:bg-slate-500/20 blur-[1px]"/>
 {/* Wick tip (ember) */}
 <div className="absolute bottom-0 w-1 h-1 rounded-full bg-orange-400/60"/>
 </div>
 )}

 {/* Wick */}
 <div className="w-[2px] h-2 bg-slate-800 dark:bg-slate-300 z-10 mb-[-1px]"/>

 {/* Wax body */}
 <div
 className={cn(
"relative w-full rounded-t-sm rounded-b-md bg-gradient-to-b transition-all duration-1000 ease-in-out overflow-hidden",
 colors.wax,
 !isExtinguished &&"candle-melt")}
 style={{ height:`${heightPercent}%`, maxHeight:"100%"}}
 >
 {/* Wax drip texture */}
 <div className="absolute inset-0 opacity-30">
 <div className="absolute top-0 left-1 w-1.5 h-2 rounded-b-full bg-white/30"/>
 <div className="absolute top-0 right-2 w-1 h-3 rounded-b-full bg-white/20"/>
 </div>
 </div>

 {/* Base plate */}
 <div className="w-14 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 mt-[-1px]"/>
 </div>
 );
}

// ---------------------------------------------------------------------------
// MemberCandleCard component
// ---------------------------------------------------------------------------

function MemberCandleCard({ member }: { member: MemberCandle }) {
 const colors = flameColor(member.decayedScore);
 const isExtinguished = member.decayedScore < 20;

 return (
 <Card className="transition-all duration-300 hover:border-primary/30 overflow-hidden">
 <CardContent className="p-4 flex flex-col items-center gap-3">
 {/* Avatar */}
 <Avatar className="w-10 h-10 ring-2 ring-background">
 <AvatarImage src={member.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs font-medium">
 {getInitials(member.profile.full_name)}
 </AvatarFallback>
 </Avatar>

 <p className="text-xs font-medium text-center truncate w-full">
 {member.profile.full_name ?? member.profile.email}
 </p>

 {/* Candle */}
 <CandleVisualization
 score={member.decayedScore}
 isActive={member.recentlyLogged}
 isExtinguished={isExtinguished}
 />

 {/* Score badge */}
 <Badge
 variant="secondary"className={cn(
"tabular-nums tracking-tight text-xs font-bold px-2.5 py-0.5",
 scoreBadgeVariant(member.decayedScore)
 )}
 >
 {Math.round(member.decayedScore)}
 </Badge>

 {/* Stats */}
 <div className="w-full space-y-1 text-[11px]">
 <div className="flex items-center justify-between text-muted-foreground">
 <span className="flex items-center gap-1">
 <Clock className="w-3 h-3"/>
 Sin registro
 </span>
 <span className="font-medium text-foreground tabular-nums">
 {member.hoursSinceLastEntry < 1
 ?"< 1h":`${Math.round(member.hoursSinceLastEntry)}h`}
 </span>
 </div>
 <div className="flex items-center justify-between text-muted-foreground">
 <span className="flex items-center gap-1">
 <FileText className="w-3 h-3"/>
 Hoy
 </span>
 <span className="font-medium text-foreground tabular-nums">
 {member.entriesToday} entrada{member.entriesToday !== 1 ?"s":""}
 </span>
 </div>
 <div className="flex items-center justify-between text-muted-foreground">
 <span className="flex items-center gap-1">
 <TrendingDown className="w-3 h-3"/>
 Decay
 </span>
 <span className="font-medium text-foreground tabular-nums">
 {member.hoursSinceLastEntry > 0
 ?`-${Math.min(Math.round(member.hoursSinceLastEntry), member.baseScore)}/h`:"0/h"}
 </span>
 </div>
 </div>

 {/* Status label */}
 <span
 className={cn(
"text-[10px] font-medium px-2 py-0.5 rounded-full",
 colors.bg,
 member.decayedScore >= 80
 ?"text-green-700 dark:text-green-400": member.decayedScore >= 60
 ?"text-yellow-700 dark:text-yellow-400": member.decayedScore >= 40
 ?"text-orange-700 dark:text-orange-400": member.decayedScore >= 20
 ?"text-red-700 dark:text-red-400":"text-slate-600 dark:text-slate-400")}
 >
 {colors.label}
 </span>
 </CardContent>
 </Card>
 );
}

// ---------------------------------------------------------------------------
// Team average candle
// ---------------------------------------------------------------------------

function TeamAverageCandle({ members }: { members: MemberCandle[] }) {
 if (members.length === 0) return null;

 const avgScore =
 members.reduce((s, m) => s + m.decayedScore, 0) / members.length;
 const avgHours =
 members.reduce((s, m) => s + m.hoursSinceLastEntry, 0) / members.length;
 const totalEntries = members.reduce((s, m) => s + m.entriesToday, 0);
 const activeCount = members.filter((m) => m.recentlyLogged).length;
 const criticalCount = members.filter((m) => m.decayedScore < 40).length;
 const colors = flameColor(avgScore);

 return (
 <Card className="transition-all duration-300 hover:border-primary/30 mb-8">
 <CardContent className="p-6">
 <div className="flex flex-col sm:flex-row items-center gap-6">
 {/* Big candle */}
 <div className="flex flex-col items-center gap-2">
 <CandleVisualization
 score={avgScore}
 isActive={activeCount > 0}
 isExtinguished={avgScore < 20}
 />
 <Badge
 variant="secondary"className={cn(
"tabular-nums tracking-tight text-sm font-bold px-3 py-1",
 scoreBadgeVariant(avgScore)
 )}
 >
 {Math.round(avgScore)}
 </Badge>
 </div>

 {/* Stats */}
 <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
 <div className="bg-accent/40 p-3 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight">
 {Math.round(avgScore)}
 </p>
 <p className="text-[11px] text-muted-foreground">Score promedio</p>
 </div>
 <div className="bg-accent/40 p-3 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight">
 {avgHours < 1 ?"< 1": Math.round(avgHours)}
 <span className="text-sm font-normal text-muted-foreground">h</span>
 </p>
 <p className="text-[11px] text-muted-foreground">Promedio sin registro</p>
 </div>
 <div className="bg-accent/40 p-3 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight">
 {totalEntries}
 </p>
 <p className="text-[11px] text-muted-foreground">Entradas hoy</p>
 </div>
 <div className="bg-accent/40 p-3 text-center">
 <p
 className={cn(
"text-2xl font-bold tabular-nums tracking-tight",
 criticalCount > 0 ?"text-red-600":"text-green-600")}
 >
 {criticalCount}
 </p>
 <p className="text-[11px] text-muted-foreground">En estado cr\u00edtico</p>
 </div>
 </div>
 </div>

 {/* Team status label */}
 <div className="mt-4 flex items-center justify-center gap-2">
 <Flame className="w-4 h-4 text-primary"/>
 <span
 className={cn(
"text-xs font-medium",
 avgScore >= 60
 ?"text-green-600 dark:text-green-400": avgScore >= 40
 ?"text-yellow-600 dark:text-yellow-400":"text-red-600 dark:text-red-400")}
 >
 {avgScore >= 80
 ?"El equipo esta ardiendo - excelente ritmo": avgScore >= 60
 ?"Llama estable - buen ritmo de trabajo": avgScore >= 40
 ?"La llama se debilita - alguien necesita registrar": avgScore >= 20
 ?"Zona cr\u00edtica - varias velas a punto de apagarse":"Emergencia - el equipo esta a oscuras"}
 </span>
 </div>
 </CardContent>
 </Card>
 );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TrustDecayPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();
 const [members, setMembers] = useState<MemberCandle[]>([]);
 const [loading, setLoading] = useState(true);
 const [now, setNow] = useState(Date.now());

 // Tick every 60s so decay updates live
 useEffect(() => {
 const interval = setInterval(() => setNow(Date.now()), 60_000);
 return () => clearInterval(interval);
 }, []);

 // Load data
 useEffect(() => {
 if (orgLoading) return;
 if (!orgId) {
 setLoading(false);
 return;
 }

 async function load() {
 const today = new Date().toISOString().split("T")[0];

 // 1. Get all org members with profiles
 const { data: orgMembers } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId!);

 if (!orgMembers || orgMembers.length === 0) {
 setLoading(false);
 return;
 }

 const userIds = orgMembers.map((m) => m.user_id);

 // 2. Get latest trust scores for all members
 const { data: trustScores } = await supabase
 .from("trust_score_history")
 .select("user_id, score, date")
 .eq("org_id", orgId!)
 .in("user_id", userIds)
 .order("date", { ascending: false });

 // 3. Get latest time entry per member (for hours since last entry)
 const { data: latestEntries } = await supabase
 .from("time_entries")
 .select("user_id, logged_at")
 .eq("org_id", orgId!)
 .in("user_id", userIds)
 .order("logged_at", { ascending: false });

 // 4. Get today's entry counts
 const { data: todayEntries } = await supabase
 .from("time_entries")
 .select("user_id")
 .eq("org_id", orgId!)
 .eq("date", today)
 .in("user_id", userIds);

 // Build per-user maps
 const latestScoreMap = new Map<string, number>();
 if (trustScores) {
 for (const ts of trustScores) {
 if (!latestScoreMap.has(ts.user_id)) {
 latestScoreMap.set(ts.user_id, ts.score);
 }
 }
 }

 const latestEntryMap = new Map<string, string>();
 if (latestEntries) {
 for (const e of latestEntries) {
 if (!latestEntryMap.has(e.user_id)) {
 latestEntryMap.set(e.user_id, e.logged_at);
 }
 }
 }

 const todayCountMap = new Map<string, number>();
 if (todayEntries) {
 for (const e of todayEntries) {
 todayCountMap.set(e.user_id, (todayCountMap.get(e.user_id) ?? 0) + 1);
 }
 }

 // Build candle data
 const candles: MemberCandle[] = orgMembers.map((m) => {
 const profile = m.profiles as unknown as Profile;
 const baseScore = latestScoreMap.get(m.user_id) ?? 50;
 const lastLoggedAt = latestEntryMap.get(m.user_id);
 const hoursSince = lastLoggedAt
 ? (Date.now() - new Date(lastLoggedAt).getTime()) / (1000 * 60 * 60)
 : 999;
 const recentlyLogged = hoursSince < 0.5;
 const decay = Math.floor(hoursSince);
 const decayedScore = Math.max(0, baseScore - decay);

 return {
 userId: m.user_id,
 profile,
 baseScore,
 hoursSinceLastEntry: hoursSince,
 entriesToday: todayCountMap.get(m.user_id) ?? 0,
 decayedScore,
 recentlyLogged,
 };
 });

 setMembers(candles);
 setLoading(false);
 }

 load();
 }, [orgLoading, orgId, now]); // eslint-disable-line react-hooks/exhaustive-deps

 // Sort by urgency (most decayed first)
 const sorted = useMemo(
 () => [...members].sort((a, b) => a.decayedScore - b.decayedScore),
 [members]
 );

 // ---------------------------------------------------------------------------
 // Render
 // ---------------------------------------------------------------------------

 if (loading || orgLoading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="flex flex-col items-center gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
 </div>
 </div>
 );
 }

 if (!orgId) {
 return (
 <div className="flex items-center justify-center h-screen">
 <p className="text-muted-foreground">
 Primero crea o \u00fanete a un equipo desde el Dashboard.
 </p>
 </div>
 );
 }

 if (members.length === 0) {
 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 <div className="flex items-center gap-3 mb-2">
 <Droplets className="w-6 h-6 text-primary"/>
 <h1 className="text-2xl font-bold tracking-tight">Trust Decay</h1>
 </div>
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center">
 <Droplets className="w-8 h-8 text-primary"/>
 </div>
 <p className="text-muted-foreground text-sm">
 No hay miembros en la organizaci\u00f3n
 </p>
 </div>
 </div>
 );
 }

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Inject candle animation styles */}
 <style dangerouslySetInnerHTML={{ __html: candleStyles }} />

 {/* Header */}
 <div className="flex items-center gap-3 mb-2">
 <Droplets className="w-6 h-6 text-primary"/>
 <h1 className="text-2xl font-bold tracking-tight">Trust Decay</h1>
 </div>
 <p className="text-muted-foreground text-sm mb-8">
 Cada vela representa el Trust Score de un miembro. Sin registros, la vela se derrite. Registra para mantener la llama viva.
 </p>

 {/* Team average */}
 <TeamAverageCandle members={sorted} />

 {/* Member grid */}
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
 {sorted.map((member) => (
 <MemberCandleCard key={member.userId} member={member} />
 ))}
 </div>
 </div>
 );
}
