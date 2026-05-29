"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, getInitials, cn } from "@/lib/utils";
import type { Profile, FocusDuel } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
 DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
 Swords,
 Plus,
 Check,
 X,
 Trophy,
 Skull,
 Clock,
 Crown,
 Zap,
 MessageSquare,
} from "lucide-react";

interface DuelWithProfiles extends FocusDuel {
 challenger_profile: Profile;
 opponent_profile: Profile;
}

interface TeamMember {
 user_id: string;
 profile: Profile;
}

interface WinRecord {
 userId: string;
 wins: number;
 losses: number;
}

export default function DuelPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [activeDuels, setActiveDuels] = useState<DuelWithProfiles[]>([]);
 const [pendingDuels, setPendingDuels] = useState<DuelWithProfiles[]>([]);
 const [completedDuels, setCompletedDuels] = useState<DuelWithProfiles[]>([]);
 const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
 const [winRecords, setWinRecords] = useState<WinRecord[]>([]);
 const [loading, setLoading] = useState(true);

 // Dialog states
 const [challengeOpen, setChallengeOpen] = useState(false);
 const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null);
 const [creating, setCreating] = useState(false);

 const [confessionOpen, setConfessionOpen] = useState(false);
 const [confessionDuel, setConfessionDuel] = useState<DuelWithProfiles | null>(null);
 const [confessionText, setConfessionText] = useState("");
 const [submittingConfession, setSubmittingConfession] = useState(false);

 const today = getTodayMTY();

 const loadDuels = useCallback(async () => {
 if (!orgId) return;

 // Load all duels for org
 const { data: duels } = await supabase
 .from("focus_duels")
 .select("*")
 .eq("org_id", orgId)
 .order("created_at", { ascending: false });

 if (!duels) return;

 // Load all member profiles
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 const profileMap = new Map<string, Profile>();
 for (const m of members ?? []) {
 if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
 }

 setTeamMembers(
 (members ?? [])
 .filter((m) => m.user_id !== userId && m.profiles)
 .map((m) => ({ user_id: m.user_id, profile: m.profiles as unknown as Profile }))
 );

 // Enrich duels with profiles
 const enriched: DuelWithProfiles[] = duels.map((d) => ({
 ...d,
 status: d.status as FocusDuel["status"],
 challenger_profile: profileMap.get(d.challenger_id) ?? {
 id: d.challenger_id,
 email:"?",
 full_name: null,
 avatar_url: null,
 role: null,
 timezone:"America/Monterrey",
 created_at:"",
 updated_at:"",
 },
 opponent_profile: profileMap.get(d.opponent_id) ?? {
 id: d.opponent_id,
 email:"?",
 full_name: null,
 avatar_url: null,
 role: null,
 timezone:"America/Monterrey",
 created_at:"",
 updated_at:"",
 },
 }));

 // Get today's deep_work hours for active duels
 const todayDuels = enriched.filter((d) => d.date === today && (d.status ==="active"|| d.status ==="pending"));
 if (todayDuels.length > 0) {
 const userIds = new Set<string>();
 todayDuels.forEach((d) => {
 userIds.add(d.challenger_id);
 userIds.add(d.opponent_id);
 });

 const { data: entries } = await supabase
 .from("time_entries")
 .select("user_id")
 .eq("org_id", orgId)
 .eq("date", today)
 .eq("category","deep_work")
 .in("user_id", Array.from(userIds));

 const hourCounts = new Map<string, number>();
 for (const e of entries ?? []) {
 hourCounts.set(e.user_id, (hourCounts.get(e.user_id) ?? 0) + 1);
 }

 for (const d of enriched) {
 if (d.date === today && (d.status ==="active"|| d.status ==="pending")) {
 d.challenger_hours = hourCounts.get(d.challenger_id) ?? 0;
 d.opponent_hours = hourCounts.get(d.opponent_id) ?? 0;
 }
 }
 }

 // Separate by status
 setActiveDuels(enriched.filter((d) => d.date === today && d.status ==="active"));
 setPendingDuels(enriched.filter((d) => d.date === today && d.status ==="pending"));
 setCompletedDuels(enriched.filter((d) => d.status ==="completed").slice(0, 20));

 // Calculate win/loss records
 const records = new Map<string, { wins: number; losses: number }>();
 for (const d of enriched.filter((dd) => dd.status ==="completed"&& dd.winner_id)) {
 const loserId = d.winner_id === d.challenger_id ? d.opponent_id : d.challenger_id;

 if (!records.has(d.winner_id!)) records.set(d.winner_id!, { wins: 0, losses: 0 });
 if (!records.has(loserId)) records.set(loserId, { wins: 0, losses: 0 });

 records.get(d.winner_id!)!.wins++;
 records.get(loserId)!.losses++;
 }

 setWinRecords(
 Array.from(records.entries())
 .map(([userId, r]) => ({ userId, ...r }))
 .sort((a, b) => b.wins - a.wins)
 );

 setLoading(false);
 }, [orgId, userId, today]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (!orgId) return;
 loadDuels();
 }, [orgId, loadDuels]);

 // Real-time subscription
 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("focus_duels_live")
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"focus_duels",
 filter:`org_id=eq.${orgId}`,
 },
 () => loadDuels()
 )
 .on(
"postgres_changes",
 {
 event:"INSERT",
 schema:"public",
 table:"time_entries",
 filter:`org_id=eq.${orgId}`,
 },
 () => loadDuels()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, loadDuels]); // eslint-disable-line react-hooks/exhaustive-deps

 async function createDuel() {
 if (!orgId || !userId || !selectedOpponent) return;
 setCreating(true);

 await supabase.from("focus_duels").insert({
 org_id: orgId,
 challenger_id: userId,
 opponent_id: selectedOpponent,
 date: today,
 status:"pending",
 challenger_hours: 0,
 opponent_hours: 0,
 });

 setCreating(false);
 setChallengeOpen(false);
 setSelectedOpponent(null);
 loadDuels();
 }

 async function respondToDuel(duelId: string, accept: boolean) {
 await supabase
 .from("focus_duels")
 .update({ status: accept ?"active":"declined"})
 .eq("id", duelId);
 loadDuels();
 }

 async function resolveDuel(duel: DuelWithProfiles) {
 const winnerId =
 duel.challenger_hours > duel.opponent_hours
 ? duel.challenger_id
 : duel.opponent_hours > duel.challenger_hours
 ? duel.opponent_id
 : null; // tie = no winner

 await supabase
 .from("focus_duels")
 .update({
 status:"completed",
 winner_id: winnerId,
 challenger_hours: duel.challenger_hours,
 opponent_hours: duel.opponent_hours,
 })
 .eq("id", duel.id);

 loadDuels();
 }

 async function submitConfession() {
 if (!confessionDuel || !confessionText.trim()) return;
 setSubmittingConfession(true);

 await supabase
 .from("focus_duels")
 .update({ loser_confession: confessionText.trim() })
 .eq("id", confessionDuel.id);

 setSubmittingConfession(false);
 setConfessionOpen(false);
 setConfessionText("");
 setConfessionDuel(null);
 loadDuels();
 }

 function isMyPendingChallenge(duel: DuelWithProfiles) {
 return duel.status ==="pending"&& duel.opponent_id === userId;
 }

 function amILoser(duel: DuelWithProfiles) {
 return duel.winner_id && duel.winner_id !== userId && !duel.loser_confession &&
 (duel.challenger_id === userId || duel.opponent_id === userId);
 }

 if (orgLoading || loading) {
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
 <div className="flex items-center justify-between mb-8">
 <div>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Swords className="w-6 h-6 text-primary"/>
 Focus Duel
 </h1>
 <p className="text-muted-foreground text-sm mt-1">
 Reta a un compa a un duelo de Deep Work. El que pierda confiesa.
 </p>
 </div>
 <Button
 className="bg-primary text-white border-0 gap-2"onClick={() => setChallengeOpen(true)}
 >
 <Plus className="w-4 h-4"/>
 Retar
 </Button>
 </div>

 {/* Pending challenges for me */}
 {pendingDuels.filter((d) => isMyPendingChallenge(d)).length > 0 && (
 <div className="mb-8">
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
 Te retaron
 </h2>
 <div className="space-y-3">
 {pendingDuels
 .filter((d) => isMyPendingChallenge(d))
 .map((duel) => (
 <Card
 key={duel.id}
 className="transition-all duration-300 hover:border-primary/30 border-amber-300/50 dark:border-amber-700/40">
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Avatar className="w-10 h-10 ring-2 ring-background">
 <AvatarImage src={duel.challenger_profile.avatar_url ?? undefined} />
 <AvatarFallback>{getInitials(duel.challenger_profile.full_name)}</AvatarFallback>
 </Avatar>
 <div>
 <p className="font-semibold">
 {duel.challenger_profile.full_name ?? duel.challenger_profile.email}
 </p>
 <p className="text-xs text-muted-foreground flex items-center gap-1">
 <Swords className="w-3 h-3"/>
 Te reta a un duelo de Deep Work
 </p>
 </div>
 </div>
 <div className="flex gap-2">
 <Button
 variant="outline"size="sm"className="gap-1"onClick={() => respondToDuel(duel.id, false)}
 >
 <X className="w-3 h-3"/>
 Declinar
 </Button>
 <Button
 size="sm"className="bg-primary text-white border-0 gap-1"onClick={() => respondToDuel(duel.id, true)}
 >
 <Check className="w-3 h-3"/>
 Aceptar
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 )}

 {/* Pending duels I sent */}
 {pendingDuels.filter((d) => d.challenger_id === userId).length > 0 && (
 <div className="mb-8">
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
 Esperando respuesta
 </h2>
 <div className="space-y-3">
 {pendingDuels
 .filter((d) => d.challenger_id === userId)
 .map((duel) => (
 <Card
 key={duel.id}
 className="transition-all duration-300 hover:border-primary/30 opacity-70">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <Clock className="w-5 h-5 text-muted-foreground animate-pulse"/>
 <p className="text-sm text-muted-foreground">
 Esperando que{" "}
 <span className="font-semibold text-foreground">
 {duel.opponent_profile.full_name ?? duel.opponent_profile.email}
 </span>{" "}
 acepte el reto
 </p>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 )}

 {/* Active Duels - VS Layout */}
 {activeDuels.length > 0 && (
 <div className="mb-8">
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
 <Zap className="w-4 h-4 text-amber-500"/>
 Duelos activos
 </h2>
 <div className="space-y-4">
 {activeDuels.map((duel) => {
 const challengerWinning = duel.challenger_hours > duel.opponent_hours;
 const opponentWinning = duel.opponent_hours > duel.challenger_hours;
 const tied = duel.challenger_hours === duel.opponent_hours;

 return (
 <Card
 key={duel.id}
 className="transition-all duration-300 hover:border-primary/30 overflow-hidden">
 <CardContent className="p-0">
 {/* VS Arena */}
 <div className="relative">
 {/* Background gradient split */}
 <div className="absolute inset-0 flex">
 <div className="w-1/2 bg-gradient-to-r from-blue-500/5 to-blue-500/10"/>
 <div className="w-1/2 bg-gradient-to-l from-red-500/5 to-red-500/10"/>
 </div>

 <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-6 sm:p-8">
 {/* Challenger (Blue side) */}
 <div className="flex flex-col items-center text-center gap-3">
 <div className={cn(
"relative",
 challengerWinning &&"animate-pulse")}>
 <Avatar className="w-16 h-16 sm:w-20 sm:h-20 ring-4 ring-blue-500/30 shadow-blue-500/20">
 <AvatarImage src={duel.challenger_profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-lg sm:text-xl">
 {getInitials(duel.challenger_profile.full_name)}
 </AvatarFallback>
 </Avatar>
 {challengerWinning && (
 <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
 <Crown className="w-3.5 h-3.5 text-white"/>
 </div>
 )}
 </div>
 <p className="font-semibold text-sm sm:text-base truncate max-w-[120px] sm:max-w-[160px]">
 {duel.challenger_profile.full_name ?? duel.challenger_profile.email}
 </p>
 <div className={cn(
"text-4xl sm:text-5xl font-black tabular-nums tracking-tight",
 challengerWinning ?"text-blue-600 dark:text-blue-400":"text-muted-foreground")}>
 {duel.challenger_hours}
 </div>
 <p className="text-xs text-muted-foreground">horas Deep Work</p>
 </div>

 {/* VS Divider */}
 <div className="flex flex-col items-center gap-2">
 <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-orange-500/30">
 <span className="text-white font-black text-lg sm:text-xl tracking-tighter">VS</span>
 </div>
 {tied && duel.challenger_hours > 0 && (
 <Badge variant="secondary"className="text-[10px]">Empate</Badge>
 )}
 </div>

 {/* Opponent (Red side) */}
 <div className="flex flex-col items-center text-center gap-3">
 <div className={cn(
"relative",
 opponentWinning &&"animate-pulse")}>
 <Avatar className="w-16 h-16 sm:w-20 sm:h-20 ring-4 ring-red-500/30 shadow-red-500/20">
 <AvatarImage src={duel.opponent_profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-lg sm:text-xl">
 {getInitials(duel.opponent_profile.full_name)}
 </AvatarFallback>
 </Avatar>
 {opponentWinning && (
 <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
 <Crown className="w-3.5 h-3.5 text-white"/>
 </div>
 )}
 </div>
 <p className="font-semibold text-sm sm:text-base truncate max-w-[120px] sm:max-w-[160px]">
 {duel.opponent_profile.full_name ?? duel.opponent_profile.email}
 </p>
 <div className={cn(
"text-4xl sm:text-5xl font-black tabular-nums tracking-tight",
 opponentWinning ?"text-red-600 dark:text-red-400":"text-muted-foreground")}>
 {duel.opponent_hours}
 </div>
 <p className="text-xs text-muted-foreground">horas Deep Work</p>
 </div>
 </div>
 </div>

 {/* Resolve button (visible to participants) */}
 {(duel.challenger_id === userId || duel.opponent_id === userId) && (
 <div className="border-t px-6 py-3 flex justify-center">
 <Button
 variant="outline"size="sm"className="gap-2 text-xs"onClick={() => resolveDuel(duel)}
 >
 <Trophy className="w-3.5 h-3.5"/>
 Finalizar duelo
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

 {/* Empty state when no active/pending duels */}
 {activeDuels.length === 0 && pendingDuels.length === 0 && (
 <div className="flex flex-col items-center justify-center py-16 gap-4 mb-8">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center">
 <Swords className="w-7 h-7 text-primary/40"/>
 </div>
 <div className="text-center">
 <p className="text-sm text-muted-foreground">No hay duelos activos hoy.</p>
 <p className="text-xs text-muted-foreground mt-1">
 Reta a alguien y demuestra quién trabaja más enfocado.
 </p>
 </div>
 <Button
 className="bg-primary text-white border-0 gap-2"onClick={() => setChallengeOpen(true)}
 >
 <Swords className="w-4 h-4"/>
 Lanzar reto
 </Button>
 </div>
 )}

 {/* Win/Loss Records */}
 {winRecords.length > 0 && (
 <div className="mb-8">
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
 <Trophy className="w-4 h-4 text-yellow-500"/>
 Récord de duelos
 </h2>
 <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
 {winRecords.map((r) => {
 const member = teamMembers.find((m) => m.user_id === r.userId);
 const profile = member?.profile ?? activeDuels.find((d) => d.challenger_id === r.userId)?.challenger_profile ?? activeDuels.find((d) => d.opponent_id === r.userId)?.opponent_profile;
 if (!profile && r.userId !== userId) return null;

 // For current user, get profile from completed duels
 const displayProfile = profile ?? completedDuels.find((d) => d.challenger_id === r.userId)?.challenger_profile ?? completedDuels.find((d) => d.opponent_id === r.userId)?.opponent_profile;

 return (
 <div
 key={r.userId}
 className="bg-accent/40 p-3 flex items-center gap-3">
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage src={displayProfile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(displayProfile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium truncate">
 {displayProfile?.full_name ?? displayProfile?.email ??"?"}
 </p>
 <div className="flex items-center gap-2 text-xs">
 <span className="text-green-600 font-semibold tabular-nums tracking-tight">
 {r.wins}W
 </span>
 <span className="text-red-600 font-semibold tabular-nums tracking-tight">
 {r.losses}L
 </span>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Duel History */}
 {completedDuels.length > 0 && (
 <div className="mb-8">
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
 <Skull className="w-4 h-4"/>
 Historial de duelos
 </h2>
 <div className="space-y-3">
 {completedDuels.map((duel) => {
 const challengerWon = duel.winner_id === duel.challenger_id;
 const opponentWon = duel.winner_id === duel.opponent_id;
 const isTie = !duel.winner_id;
 const iAmLoser = amILoser(duel);

 return (
 <Card
 key={duel.id}
 className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 {/* Challenger */}
 <div className="flex items-center gap-2 flex-1 min-w-0">
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage src={duel.challenger_profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(duel.challenger_profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0">
 <p className={cn(
"text-sm font-medium truncate",
 challengerWon &&"text-green-600")}>
 {duel.challenger_profile.full_name ?? duel.challenger_profile.email}
 {challengerWon &&"\uD83C\uDFC6"}
 </p>
 <p className="text-xs text-muted-foreground tabular-nums tracking-tight">
 {duel.challenger_hours}h
 </p>
 </div>
 </div>

 {/* Score badge */}
 <div className="flex flex-col items-center gap-1">
 <Badge
 variant={isTie ?"secondary":"outline"}
 className="text-[10px] tabular-nums">
 {duel.challenger_hours} - {duel.opponent_hours}
 </Badge>
 <span className="text-[10px] text-muted-foreground">{duel.date}</span>
 </div>

 {/* Opponent */}
 <div className="flex items-center gap-2 flex-1 min-w-0 justify-end text-right">
 <div className="min-w-0">
 <p className={cn(
"text-sm font-medium truncate",
 opponentWon &&"text-green-600")}>
 {opponentWon &&"\uD83C\uDFC6"}
 {duel.opponent_profile.full_name ?? duel.opponent_profile.email}
 </p>
 <p className="text-xs text-muted-foreground tabular-nums tracking-tight">
 {duel.opponent_hours}h
 </p>
 </div>
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage src={duel.opponent_profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(duel.opponent_profile.full_name)}
 </AvatarFallback>
 </Avatar>
 </div>
 </div>

 {/* Confession */}
 {duel.loser_confession && (
 <div className="mt-3 p-3 bg-accent/40 flex items-start gap-2">
 <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0"/>
 <p className="text-xs text-muted-foreground italic">
 {"\u201C"}{duel.loser_confession}{"\u201D"}
 </p>
 </div>
 )}

 {/* Write confession button for loser */}
 {iAmLoser && (
 <div className="mt-3 flex justify-center">
 <Button
 variant="outline"size="sm"className="gap-1.5 text-xs text-red-600 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950"onClick={() => {
 setConfessionDuel(duel);
 setConfessionOpen(true);
 }}
 >
 <Skull className="w-3 h-3"/>
 Escribir confesión
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

 {/* Challenge Dialog */}
 <Dialog open={challengeOpen} onOpenChange={setChallengeOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Swords className="w-5 h-5 text-primary"/>
 Lanzar reto
 </DialogTitle>
 <DialogDescription>
 Elige a quién quieres retar a un duelo de Deep Work hoy.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-2 max-h-60 overflow-y-auto">
 {teamMembers.length === 0 ? (
 <p className="text-sm text-muted-foreground text-center py-4">
 No hay miembros disponibles.
 </p>
 ) : (
 teamMembers.map((m) => (
 <button
 key={m.user_id}
 onClick={() => setSelectedOpponent(m.user_id)}
 className={cn(
"w-full flex items-center gap-3 p-3 transition-all duration-200 text-left",
 selectedOpponent === m.user_id
 ?"bg-primary/10 ring-2 ring-primary/30":"hover:bg-accent/60")}
 >
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage src={m.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="text-sm font-medium">
 {m.profile.full_name ?? m.profile.email}
 </span>
 {selectedOpponent === m.user_id && (
 <Check className="w-4 h-4 text-primary ml-auto"/>
 )}
 </button>
 ))
 )}
 </div>

 <DialogFooter>
 <DialogClose render={<Button variant="outline"className=""/>}>
 Cancelar
 </DialogClose>
 <Button
 className="bg-primary text-white border-0 gap-1.5"disabled={!selectedOpponent || creating}
 onClick={createDuel}
 >
 <Swords className="w-4 h-4"/>
 {creating ?"Enviando...":"Enviar reto"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Confession Dialog */}
 <Dialog open={confessionOpen} onOpenChange={setConfessionOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Skull className="w-5 h-5 text-red-500"/>
 Confesión del perdedor
 </DialogTitle>
 <DialogDescription>
 Perdiste el duelo. Escribe tu confesión en una línea.
 </DialogDescription>
 </DialogHeader>

 <Textarea
 placeholder="Confieso que..."value={confessionText}
 onChange={(e) => setConfessionText(e.target.value)}
 className="min-h-[60px]"maxLength={200}
 />
 <p className="text-[10px] text-muted-foreground text-right">
 {confessionText.length}/200
 </p>

 <DialogFooter>
 <DialogClose render={<Button variant="outline"className=""/>}>
 Cancelar
 </DialogClose>
 <Button
 className="bg-gradient-to-r from-red-600 to-red-700 text-white border-0 gap-1.5"disabled={!confessionText.trim() || submittingConfession}
 onClick={submitConfession}
 >
 <MessageSquare className="w-4 h-4"/>
 {submittingConfession ?"Enviando...":"Confesar"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}
