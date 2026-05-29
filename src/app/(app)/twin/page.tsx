"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { startOfWeek, format } from "date-fns";
import { es } from "date-fns/locale";
import {
 Users,
 AlertTriangle,
 Loader2,
 Clock,
 TrendingUp,
 Shield,
 Shuffle,
 Link2,
} from "lucide-react";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getWeekStart(date: Date = new Date()): string {
 return format(startOfWeek(date, { weekStartsOn: 1 }),"yyyy-MM-dd");
}

interface TwinPairData {
 pairs: [string, string][];
 solos: string[];
 week_start: string;
}

interface MemberStats {
 userId: string;
 name: string;
 avatarUrl: string | null;
 hoursToday: number;
 hoursThisWeek: number;
 closeoutsThisWeek: number;
 standupsThisWeek: number;
 trustScore: number | null;
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function TwinPage() {
 const { orgId, userId, role, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [twinAssignment, setTwinAssignment] = useState<TwinPairData | null>(null);
 const [myTwinId, setMyTwinId] = useState<string | null>(null);
 const [isSolo, setIsSolo] = useState(false);
 const [myStats, setMyStats] = useState<MemberStats | null>(null);
 const [twinStats, setTwinStats] = useState<MemberStats | null>(null);
 const [allPairs, setAllPairs] = useState<{ a: MemberStats; b: MemberStats }[]>([]);
 const [loading, setLoading] = useState(true);
 const [assigning, setAssigning] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const weekStart = getWeekStart();

 const loadMemberStats = useCallback(
 async (uid: string): Promise<MemberStats | null> => {
 if (!orgId) return null;

 const today = new Date().toISOString().split("T")[0];

 const [
 { data: profile },
 { data: entriesToday },
 { data: entriesWeek },
 { data: closeouts },
 { data: standups },
 { data: trust },
 ] = await Promise.all([
 supabase.from("profiles").select("full_name, avatar_url").eq("id", uid).single(),
 supabase
 .from("time_entries")
 .select("id")
 .eq("user_id", uid)
 .eq("org_id", orgId)
 .eq("date", today),
 supabase
 .from("time_entries")
 .select("id")
 .eq("user_id", uid)
 .eq("org_id", orgId)
 .gte("date", weekStart),
 supabase
 .from("daily_closeouts")
 .select("id")
 .eq("user_id", uid)
 .eq("org_id", orgId)
 .gte("date", weekStart),
 supabase
 .from("standups")
 .select("id")
 .eq("user_id", uid)
 .eq("org_id", orgId)
 .gte("date", weekStart),
 supabase
 .from("trust_score_history")
 .select("score")
 .eq("user_id", uid)
 .eq("org_id", orgId)
 .order("date", { ascending: false })
 .limit(1)
 .single(),
 ]);

 return {
 userId: uid,
 name: (profile as Profile | null)?.full_name ??"Miembro",
 avatarUrl: (profile as Profile | null)?.avatar_url ?? null,
 hoursToday: entriesToday?.length ?? 0,
 hoursThisWeek: entriesWeek?.length ?? 0,
 closeoutsThisWeek: closeouts?.length ?? 0,
 standupsThisWeek: standups?.length ?? 0,
 trustScore: (trust as { score: number } | null)?.score ?? null,
 };
 },
 [orgId, weekStart] // eslint-disable-line react-hooks/exhaustive-deps
 );

 const loadData = useCallback(async () => {
 if (!orgId || !userId) return;
 setLoading(true);
 setError(null);

 // Find the most recent twin_assignment for this week
 const { data: assignments } = await supabase
 .from("audit_log")
 .select("new_data, created_at")
 .eq("org_id", orgId)
 .eq("target_type","twin_assignment")
 .order("created_at", { ascending: false })
 .limit(10);

 // Find the one that matches the current week
 let currentAssignment: TwinPairData | null = null;
 for (const a of assignments ?? []) {
 const data = a.new_data as unknown as TwinPairData | null;
 if (data?.week_start === weekStart) {
 currentAssignment = data;
 break;
 }
 }

 setTwinAssignment(currentAssignment);

 if (currentAssignment) {
 // Find my twin
 let foundTwinId: string | null = null;
 let foundSolo = false;

 for (const pair of currentAssignment.pairs) {
 if (pair[0] === userId) {
 foundTwinId = pair[1];
 break;
 }
 if (pair[1] === userId) {
 foundTwinId = pair[0];
 break;
 }
 }

 if (!foundTwinId && currentAssignment.solos?.includes(userId)) {
 foundSolo = true;
 }

 setMyTwinId(foundTwinId);
 setIsSolo(foundSolo);

 // Load stats for both
 const myStatsData = await loadMemberStats(userId);
 setMyStats(myStatsData);

 if (foundTwinId) {
 const twinStatsData = await loadMemberStats(foundTwinId);
 setTwinStats(twinStatsData);
 }

 // Load all pairs for the team view
 const pairsData: { a: MemberStats; b: MemberStats }[] = [];
 for (const pair of currentAssignment.pairs) {
 const [aStats, bStats] = await Promise.all([
 loadMemberStats(pair[0]),
 loadMemberStats(pair[1]),
 ]);
 if (aStats && bStats) {
 pairsData.push({ a: aStats, b: bStats });
 }
 }
 setAllPairs(pairsData);
 }

 setLoading(false);
 }, [orgId, userId, weekStart, loadMemberStats]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId || !userId) {
 setLoading(false);
 return;
 }
 loadData();
 }, [orgLoading, orgId, userId, loadData]);

 async function assignTwins() {
 if (!orgId) return;
 setAssigning(true);
 setError(null);

 try {
 const res = await fetch("/api/twins/assign", {
 method:"POST",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({ org_id: orgId }),
 });

 const data = await res.json();
 if (!res.ok) {
 setError(data.error ??"Error al asignar twins");
 } else {
 await loadData();
 }
 } catch {
 setError("Error de red al asignar twins");
 }

 setAssigning(false);
 }

 // ─── Loading state ─────────────────────────

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

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
 <Users className="w-6 h-6 text-primary"/>
 Accountability Twin
 </h1>
 <p className="text-muted-foreground text-sm mt-1">
 Cada semana, dos personas son emparejadas. Si uno falla, el otro pierde puntos tambien.
 </p>
 </div>

 {/* Error */}
 {error && (
 <div className="mb-6 bg-destructive/5 border border-destructive/20 p-4">
 <p className="text-sm text-destructive">{error}</p>
 </div>
 )}

 {/* No assignment yet */}
 {!twinAssignment ? (
 <Card className="border-2 border-dashed border-primary/30 transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-8 text-center">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center mx-auto mb-4">
 <Shuffle className="w-8 h-8 text-primary"/>
 </div>
 <h3 className="font-bold text-lg mb-2">No hay twins asignados esta semana</h3>
 <p className="text-sm text-muted-foreground mb-6">
 Asigna twins para esta semana. Se emparejan aleatoriamente.
 </p>
 {(role ==="owner"|| role ==="admin") && (
 <Button
 onClick={assignTwins}
 disabled={assigning}
 className="bg-primary text-white hover: hover:shadow-blue-600/30 transition-all duration-300 gap-2">
 {assigning ? (
 <Loader2 className="w-4 h-4 animate-spin"/>
 ) : (
 <Shuffle className="w-4 h-4"/>
 )}
 Asignar Twins
 </Button>
 )}
 {role ==="member"&& (
 <p className="text-xs text-muted-foreground">
 Pide a un admin que asigne los twins de esta semana.
 </p>
 )}
 </CardContent>
 </Card>
 ) : (
 <>
 {/* My Twin Section */}
 <section className="mb-8">
 <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
 <Link2 className="w-4 h-4 text-primary"/>
 Tu twin esta semana
 </h2>

 {isSolo ? (
 <Card className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-6 text-center">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center mx-auto mb-3">
 <Shield className="w-8 h-8 text-primary"/>
 </div>
 <p className="font-semibold">Estas solo esta semana</p>
 <p className="text-sm text-muted-foreground mt-1">
 Numero impar de miembros. Tus puntos dependen solo de ti.
 </p>
 </CardContent>
 </Card>
 ) : myTwinId && myStats && twinStats ? (
 <div className="space-y-4">
 {/* Side-by-side stats */}
 <div className="grid grid-cols-2 gap-4">
 <StatCard stats={myStats} label="Tu"isMe />
 <StatCard stats={twinStats} label="Tu twin"isMe={false} />
 </div>

 {/* Warning if twin is underperforming */}
 {twinStats.hoursToday < 3 && (
 <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-4 flex items-start gap-3">
 <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"/>
 <div>
 <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
 Tu twin {twinStats.name.split("")[0]} solo lleva {twinStats.hoursToday}h hoy.
 {twinStats.hoursToday === 0
 ?"Si no registra, ambos pierden.":"Si no mejora, ambos pierden."}
 </p>
 <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
 Recuerdale que registre sus horas. Tu Trust Score depende de el tambien.
 </p>
 </div>
 </div>
 )}

 {/* Warning if I am underperforming */}
 {myStats.hoursToday < 3 && (
 <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-4 flex items-start gap-3">
 <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5"/>
 <div>
 <p className="text-sm font-semibold text-red-800 dark:text-red-400">
 Tu llevas {myStats.hoursToday}h hoy. Estas arrastrando a {twinStats.name.split("")[0]} contigo.
 </p>
 <p className="text-xs text-red-600 dark:text-red-500 mt-1">
 No seas el twin que hace perder puntos.
 </p>
 </div>
 </div>
 )}
 </div>
 ) : !myTwinId && !isSolo ? (
 <Card className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-6 text-center">
 <p className="text-sm text-muted-foreground">
 No apareces en la asignacion de esta semana. Quizas te uniste despues.
 </p>
 </CardContent>
 </Card>
 ) : null}
 </section>

 {/* All Pairs */}
 <section className="mb-8">
 <h2 className="font-semibold text-lg mb-4">Todos los twins</h2>
 {allPairs.length === 0 ? (
 <p className="text-sm text-muted-foreground">Cargando pares...</p>
 ) : (
 <div className="space-y-3">
 {allPairs.map((pair, i) => (
 <PairRow key={i} a={pair.a} b={pair.b} currentUserId={userId} />
 ))}
 </div>
 )}
 </section>

 {/* Re-assign (admin only) */}
 {(role ==="owner"|| role ==="admin") && (
 <div className="text-center">
 <Button
 variant="outline"onClick={assignTwins}
 disabled={assigning}
 className="gap-2">
 {assigning ? (
 <Loader2 className="w-4 h-4 animate-spin"/>
 ) : (
 <Shuffle className="w-4 h-4"/>
 )}
 Re-asignar Twins
 </Button>
 <p className="text-[10px] text-muted-foreground mt-2">
 Esto reemplaza la asignacion actual.
 </p>
 </div>
 )}
 </>
 )}
 </div>
 );
}

// ─────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────

function StatCard({
 stats,
 label,
 isMe,
}: {
 stats: MemberStats;
 label: string;
 isMe: boolean;
}) {
 return (
 <Card className={cn(
"transition-all duration-300 hover:border-primary/30",
 isMe &&"border-primary/20")}>
 <CardContent className="p-4">
 <div className="flex items-center gap-3 mb-4">
 <Avatar className="w-10 h-10 ring-2 ring-background">
 <AvatarImage src={stats.avatarUrl ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(stats.name)}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0">
 <p className="text-sm font-semibold truncate">{stats.name}</p>
 <p className="text-[10px] text-muted-foreground">{label}</p>
 </div>
 </div>

 <div className="space-y-2">
 <StatRow
 icon={<Clock className="w-3.5 h-3.5"/>}
 label="Horas hoy"value={stats.hoursToday}
 warn={stats.hoursToday < 3}
 />
 <StatRow
 icon={<TrendingUp className="w-3.5 h-3.5"/>}
 label="Horas semana"value={stats.hoursThisWeek}
 warn={false}
 />
 <StatRow
 icon={<Shield className="w-3.5 h-3.5"/>}
 label="Trust Score"value={stats.trustScore ??"—"}
 warn={stats.trustScore !== null && stats.trustScore < 60}
 />
 </div>

 <div className="flex gap-2 mt-3">
 <Badge
 variant="outline"className={cn(
"text-[10px]",
 stats.standupsThisWeek > 0
 ?"text-green-600 border-green-200 dark:border-green-900":"text-red-600 border-red-200 dark:border-red-900")}
 >
 Standups: {stats.standupsThisWeek}
 </Badge>
 <Badge
 variant="outline"className={cn(
"text-[10px]",
 stats.closeoutsThisWeek > 0
 ?"text-green-600 border-green-200 dark:border-green-900":"text-red-600 border-red-200 dark:border-red-900")}
 >
 Closeouts: {stats.closeoutsThisWeek}
 </Badge>
 </div>
 </CardContent>
 </Card>
 );
}

function StatRow({
 icon,
 label,
 value,
 warn,
}: {
 icon: React.ReactNode;
 label: string;
 value: string | number;
 warn: boolean;
}) {
 return (
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2 text-xs text-muted-foreground">
 {icon}
 {label}
 </div>
 <span
 className={cn(
"text-sm font-bold tabular-nums tracking-tight",
 warn ?"text-red-600":"text-foreground")}
 >
 {value}
 </span>
 </div>
 );
}

// ─────────────────────────────────────────────
// Pair Row
// ─────────────────────────────────────────────

function PairRow({
 a,
 b,
 currentUserId,
}: {
 a: MemberStats;
 b: MemberStats;
 currentUserId: string | null;
}) {
 const isMyPair = a.userId === currentUserId || b.userId === currentUserId;

 return (
 <Card className={cn(
"transition-all duration-300 hover:border-primary/30",
 isMyPair &&"border-primary/20 bg-primary/[0.02]")}>
 <CardContent className="p-4 flex items-center gap-4">
 {/* Person A */}
 <div className="flex items-center gap-2 flex-1 min-w-0">
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage src={a.avatarUrl ?? undefined} />
 <AvatarFallback className="text-[10px]">{getInitials(a.name)}</AvatarFallback>
 </Avatar>
 <div className="min-w-0">
 <p className="text-sm font-medium truncate">{a.name}</p>
 <p className="text-[10px] text-muted-foreground tabular-nums">
 {a.hoursToday}h hoy / {a.hoursThisWeek}h semana
 </p>
 </div>
 </div>

 {/* Link icon */}
 <Link2 className="w-4 h-4 text-primary shrink-0"/>

 {/* Person B */}
 <div className="flex items-center gap-2 flex-1 min-w-0 justify-end text-right">
 <div className="min-w-0">
 <p className="text-sm font-medium truncate">{b.name}</p>
 <p className="text-[10px] text-muted-foreground tabular-nums">
 {b.hoursToday}h hoy / {b.hoursThisWeek}h semana
 </p>
 </div>
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage src={b.avatarUrl ?? undefined} />
 <AvatarFallback className="text-[10px]">{getInitials(b.name)}</AvatarFallback>
 </Avatar>
 </div>
 </CardContent>
 </Card>
 );
}
