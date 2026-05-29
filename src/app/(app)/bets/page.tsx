"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, getInitials, cn } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
 TrendingUp,
 Trophy,
 Loader2,
 Target,
 Check,
 X,
 Coins,
 Swords,
 Clock,
} from "lucide-react";

interface TeamMember {
 user_id: string;
 profile: Profile;
}

interface BetEntry {
 id: string;
 user_id: string;
 new_data: {
 challenger_id: string;
 opponent_id: string;
 metric: string;
 points: number;
 date: string;
 status:"pending"|"won"|"lost"|"draw";
 result_challenger?: number;
 result_opponent?: number;
 };
 created_at: string;
 challenger_profile?: Profile;
 opponent_profile?: Profile;
}

const METRICS = [
 { value:"deep_work", label:"Deep Work"},
 { value:"total_hours", label:"Horas totales"},
 { value:"proof_count", label:"Entradas con evidencia"},
];

const POINT_OPTIONS = [1, 2, 3, 5, 8, 10];

export default function BetsPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
 const [todayBets, setTodayBets] = useState<BetEntry[]>([]);
 const [pastBets, setPastBets] = useState<BetEntry[]>([]);
 const [loading, setLoading] = useState(true);
 const [creating, setCreating] = useState(false);

 // Form state
 const [selectedOpponent, setSelectedOpponent] = useState<string>("");
 const [selectedMetric, setSelectedMetric] = useState<string>("deep_work");
 const [selectedPoints, setSelectedPoints] = useState<number>(5);

 const today = getTodayMTY();

 const loadData = useCallback(async () => {
 if (!orgId) return;

 // Load team members
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 const profileMap = new Map<string, Profile>();
 const teamList: TeamMember[] = [];
 for (const m of members ?? []) {
 if (m.profiles) {
 const p = m.profiles as unknown as Profile;
 profileMap.set(m.user_id, p);
 if (m.user_id !== userId) {
 teamList.push({ user_id: m.user_id, profile: p });
 }
 }
 }
 setTeamMembers(teamList);

 // Load bets from audit_log
 const { data: logs } = await supabase
 .from("audit_log")
 .select("id, user_id, new_data, created_at")
 .eq("org_id", orgId)
 .eq("action","entry_created")
 .eq("target_type","bet")
 .order("created_at", { ascending: false })
 .limit(100);

 const enriched: BetEntry[] = (logs ?? []).map((l) => {
 const nd = l.new_data as BetEntry["new_data"];
 return {
 id: l.id,
 user_id: l.user_id,
 new_data: nd,
 created_at: l.created_at,
 challenger_profile: profileMap.get(nd.challenger_id),
 opponent_profile: profileMap.get(nd.opponent_id),
 };
 });

 setTodayBets(enriched.filter((b) => b.new_data.date === today));
 setPastBets(
 enriched
 .filter((b) => b.new_data.date !== today)
 .slice(0, 30)
 );
 setLoading(false);
 }, [orgId, userId, today]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (!orgId) return;
 loadData();
 }, [orgId, loadData]);

 async function createBet() {
 if (!orgId || !userId || !selectedOpponent) return;
 setCreating(true);

 await supabase.from("audit_log").insert({
 org_id: orgId,
 user_id: userId,
 action:"entry_created",
 target_type:"bet",
 new_data: {
 challenger_id: userId,
 opponent_id: selectedOpponent,
 metric: selectedMetric,
 points: selectedPoints,
 date: today,
 status:"pending",
 },
 });

 setSelectedOpponent("");
 setSelectedMetric("deep_work");
 setSelectedPoints(5);
 await loadData();
 setCreating(false);
 }

 async function resolveBet(bet: BetEntry) {
 if (!orgId || !userId) return;
 const nd = bet.new_data;

 // Fetch today's data for both users
 const { data: entries } = await supabase
 .from("time_entries")
 .select("user_id, category, proof_urls")
 .eq("org_id", orgId)
 .eq("date", nd.date)
 .in("user_id", [nd.challenger_id, nd.opponent_id]);

 const challengerEntries = (entries ?? []).filter(
 (e) => e.user_id === nd.challenger_id
 );
 const opponentEntries = (entries ?? []).filter(
 (e) => e.user_id === nd.opponent_id
 );

 let challengerScore = 0;
 let opponentScore = 0;

 if (nd.metric ==="deep_work") {
 challengerScore = challengerEntries.filter(
 (e) => e.category ==="deep_work").length;
 opponentScore = opponentEntries.filter(
 (e) => e.category ==="deep_work").length;
 } else if (nd.metric ==="total_hours") {
 challengerScore = challengerEntries.length;
 opponentScore = opponentEntries.length;
 } else if (nd.metric ==="proof_count") {
 challengerScore = challengerEntries.filter(
 (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
 ).length;
 opponentScore = opponentEntries.filter(
 (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
 ).length;
 }

 const status: BetEntry["new_data"]["status"] =
 challengerScore > opponentScore
 ?"won": opponentScore > challengerScore
 ?"lost":"draw";

 // Update the bet
 await supabase
 .from("audit_log")
 .update({
 new_data: {
 ...nd,
 status,
 result_challenger: challengerScore,
 result_opponent: opponentScore,
 },
 })
 .eq("id", bet.id);

 await loadData();
 }

 if (orgLoading || loading) {
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

 const myActiveBetToday = todayBets.find(
 (b) =>
 b.new_data.status ==="pending"&&
 (b.new_data.challenger_id === userId ||
 b.new_data.opponent_id === userId)
 );

 return (
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Coins className="w-6 h-6 text-primary"/>
 Apuestas de productividad
 </h1>
 <p className="text-muted-foreground text-sm mt-1">
 Apuesta puntos contra un compañero. Al final del día se resuelve
 automáticamente.
 </p>
 </div>

 {/* Create bet form */}
 <Card className="mb-8 border-2">
 <CardContent className="p-6">
 <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
 <Target className="w-4 h-4 text-primary"/>
 Nueva apuesta
 </h2>

 <div className="space-y-4">
 {/* Opponent selection */}
 <div>
 <label className="text-xs font-medium text-muted-foreground mb-2 block">
 Oponente
 </label>
 <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
 {teamMembers.map((m) => (
 <button
 key={m.user_id}
 onClick={() => setSelectedOpponent(m.user_id)}
 className={cn(
"flex items-center gap-2 p-2.5 transition-all duration-200 text-left",
 selectedOpponent === m.user_id
 ?"bg-primary/10 ring-2 ring-primary/30":"bg-accent/40 hover:bg-accent/60")}
 >
 <Avatar className="w-7 h-7 ring-2 ring-background">
 <AvatarImage
 src={m.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[9px]">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-medium truncate">
 {m.profile.full_name ?? m.profile.email}
 </span>
 {selectedOpponent === m.user_id && (
 <Check className="w-3 h-3 text-primary ml-auto shrink-0"/>
 )}
 </button>
 ))}
 </div>
 </div>

 {/* Metric selection */}
 <div>
 <label className="text-xs font-medium text-muted-foreground mb-2 block">
 Métrica
 </label>
 <div className="flex flex-wrap gap-2">
 {METRICS.map((m) => (
 <button
 key={m.value}
 onClick={() => setSelectedMetric(m.value)}
 className={cn(
"px-3 py-1.5 text-xs font-medium transition-all duration-200",
 selectedMetric === m.value
 ?"bg-primary text-primary-foreground":"bg-accent/40 text-muted-foreground hover:bg-accent/60")}
 >
 {m.label}
 </button>
 ))}
 </div>
 </div>

 {/* Points selection */}
 <div>
 <label className="text-xs font-medium text-muted-foreground mb-2 block">
 Puntos apostados
 </label>
 <div className="flex flex-wrap gap-2">
 {POINT_OPTIONS.map((p) => (
 <button
 key={p}
 onClick={() => setSelectedPoints(p)}
 className={cn(
"w-10 h-10 text-sm font-bold transition-all duration-200 tabular-nums",
 selectedPoints === p
 ?"bg-primary text-primary-foreground shadow-primary/25":"bg-accent/40 text-muted-foreground hover:bg-accent/60")}
 >
 {p}
 </button>
 ))}
 </div>
 </div>

 {/* Summary and submit */}
 {selectedOpponent && (
 <div className="bg-accent/40 p-3 text-sm">
 <p>
 Apuesto{" "}
 <span className="font-bold tabular-nums tracking-tight">
 {selectedPoints} puntos
 </span>{" "}
 a que hago más{" "}
 <span className="font-bold">
 {
 METRICS.find((m) => m.value === selectedMetric)
 ?.label
 }
 </span>{" "}
 que{" "}
 <span className="font-bold">
 {
 teamMembers.find(
 (m) => m.user_id === selectedOpponent
 )?.profile.full_name
 }
 </span>{" "}
 hoy.
 </p>
 </div>
 )}

 <Button
 className="bg-primary text-white border-0 gap-2 w-full"disabled={!selectedOpponent || creating}
 onClick={createBet}
 >
 {creating ? (
 <Loader2 className="w-4 h-4 animate-spin"/>
 ) : (
 <Coins className="w-4 h-4"/>
 )}
 {creating ?"Creando apuesta...":"Apostar"}
 </Button>
 </div>
 </CardContent>
 </Card>

 {/* Active bets today */}
 {todayBets.length > 0 && (
 <div className="mb-8">
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
 <Swords className="w-4 h-4"/>
 Apuestas de hoy
 </h2>
 <div className="space-y-3">
 {todayBets.map((bet) => {
 const nd = bet.new_data;
 const isChallenger = nd.challenger_id === userId;
 const isPending = nd.status ==="pending";
 const canResolve =
 isPending &&
 (nd.challenger_id === userId ||
 nd.opponent_id === userId);

 return (
 <Card
 key={bet.id}
 className={cn(
"transition-all duration-300 hover:border-primary/30",
 nd.status ==="won"&&
 isChallenger &&
"border-green-300/50 dark:border-green-700/40",
 nd.status ==="lost"&&
 isChallenger &&
"border-red-300/50 dark:border-red-700/40")}
 >
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 {/* Challenger */}
 <div className="flex items-center gap-2 flex-1 min-w-0">
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage
 src={
 bet.challenger_profile?.avatar_url ??
 undefined
 }
 />
 <AvatarFallback className="text-xs">
 {getInitials(
 bet.challenger_profile?.full_name ??
 null
 )}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0">
 <p className="text-sm font-medium truncate">
 {bet.challenger_profile?.full_name ??"?"}
 </p>
 {nd.result_challenger !== undefined && (
 <p className="text-xs text-muted-foreground tabular-nums tracking-tight">
 {nd.result_challenger}
 </p>
 )}
 </div>
 </div>

 {/* Center info */}
 <div className="flex flex-col items-center gap-1 shrink-0">
 <Badge
 variant="outline"className="text-[10px] tabular-nums">
 {nd.points} pts
 </Badge>
 <span className="text-[10px] text-muted-foreground">
 {
 METRICS.find(
 (m) => m.value === nd.metric
 )?.label
 }
 </span>
 {isPending ? (
 <Badge
 variant="secondary"className="text-[10px] gap-1">
 <Clock className="w-3 h-3"/>
 Activa
 </Badge>
 ) : nd.status ==="draw"? (
 <Badge
 variant="secondary"className="text-[10px]">
 Empate
 </Badge>
 ) : nd.status ==="won"? (
 <Badge className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
 Ganó retador
 </Badge>
 ) : (
 <Badge className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">
 Perdió retador
 </Badge>
 )}
 </div>

 {/* Opponent */}
 <div className="flex items-center gap-2 flex-1 min-w-0 justify-end text-right">
 <div className="min-w-0">
 <p className="text-sm font-medium truncate">
 {bet.opponent_profile?.full_name ??"?"}
 </p>
 {nd.result_opponent !== undefined && (
 <p className="text-xs text-muted-foreground tabular-nums tracking-tight">
 {nd.result_opponent}
 </p>
 )}
 </div>
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage
 src={
 bet.opponent_profile?.avatar_url ??
 undefined
 }
 />
 <AvatarFallback className="text-xs">
 {getInitials(
 bet.opponent_profile?.full_name ?? null
 )}
 </AvatarFallback>
 </Avatar>
 </div>
 </div>

 {/* Resolve button */}
 {canResolve && (
 <div className="mt-3 pt-3 border-t flex justify-center">
 <Button
 variant="outline"size="sm"className="gap-2 text-xs"onClick={() => resolveBet(bet)}
 >
 <Trophy className="w-3.5 h-3.5"/>
 Resolver apuesta
 </Button>
 </div>
 )}
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 )}

 {/* Empty state for today */}
 {todayBets.length === 0 && (
 <div className="mb-8 flex flex-col items-center justify-center py-8 gap-3">
 <div className="w-12 h-12 bg-primary/10 flex items-center justify-center">
 <Coins className="w-6 h-6 text-primary/40"/>
 </div>
 <p className="text-sm text-muted-foreground">
 No hay apuestas para hoy. Crea una arriba.
 </p>
 </div>
 )}

 {/* Past bets */}
 {pastBets.length > 0 && (
 <div>
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
 <TrendingUp className="w-4 h-4"/>
 Historial de apuestas
 </h2>
 <div className="space-y-2">
 {pastBets.map((bet) => {
 const nd = bet.new_data;
 const isChallenger = nd.challenger_id === userId;

 return (
 <Card
 key={bet.id}
 className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-3">
 <div className="flex items-center gap-3">
 <Avatar className="w-6 h-6 ring-2 ring-background">
 <AvatarImage
 src={
 bet.challenger_profile?.avatar_url ??
 undefined
 }
 />
 <AvatarFallback className="text-[8px]">
 {getInitials(
 bet.challenger_profile?.full_name ?? null
 )}
 </AvatarFallback>
 </Avatar>

 <div className="flex-1 min-w-0">
 <p className="text-xs truncate">
 <span className="font-medium">
 {bet.challenger_profile?.full_name ??"?"}
 </span>
 {"vs"}
 <span className="font-medium">
 {bet.opponent_profile?.full_name ??"?"}
 </span>
 </p>
 <p className="text-[10px] text-muted-foreground">
 {
 METRICS.find(
 (m) => m.value === nd.metric
 )?.label
 }{" "}
 &middot; {nd.points} pts &middot; {nd.date}
 </p>
 </div>

 {nd.status ==="pending"? (
 <Badge
 variant="secondary"className="text-[10px]">
 Pendiente
 </Badge>
 ) : nd.status ==="draw"? (
 <Badge
 variant="secondary"className="text-[10px]">
 Empate
 </Badge>
 ) : (nd.status ==="won"&& isChallenger) ||
 (nd.status ==="lost"&& !isChallenger) ? (
 <Badge className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 gap-1">
 <Check className="w-3 h-3"/>
 +{nd.points}
 </Badge>
 ) : (
 <Badge className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 gap-1">
 <X className="w-3 h-3"/>
 -{nd.points}
 </Badge>
 )}

 {nd.result_challenger !== undefined && (
 <span className="text-[10px] text-muted-foreground tabular-nums tracking-tight whitespace-nowrap">
 {nd.result_challenger} - {nd.result_opponent}
 </span>
 )}
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 )}
 </div>
 );
}
