"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TribunalSession, TribunalVote, TimeEntry } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, formatHour, getTodayMTY } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";
import {
 Gavel,
 Shield,
 ShieldAlert,
 AlertTriangle,
 CheckCircle2,
 XCircle,
 Clock,
 FileText,
 ImageOff,
 Users,
 Loader2,
 Scale,
 Scroll,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface SessionWithDetails extends TribunalSession {
 entry: TimeEntry | null;
 nominated_profile: Profile | null;
 votes: (TribunalVote & { profile: Profile | null })[];
}

export default function TribunalPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [session, setSession] = useState<SessionWithDetails | null>(null);
 const [pastSessions, setPastSessions] = useState<SessionWithDetails[]>([]);
 const [loading, setLoading] = useState(true);
 const [creating, setCreating] = useState(false);
 const [voting, setVoting] = useState(false);
 const [showVerdict, setShowVerdict] = useState(false);
 const [verdictResult, setVerdictResult] = useState<"guilty"|"innocent"| null>(null);
 const supabase = createClient();

 const loadData = useCallback(async () => {
 if (!orgId) return;
 const today = getTodayMTY();

 // Build a profile map for the org
 const { data: memberData } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 const profileMap = new Map<string, Profile>();
 if (memberData) {
 for (const m of memberData) {
 if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
 }
 }

 // Load today's session
 const { data: todaySession } = await supabase
 .from("tribunal_sessions")
 .select("*")
 .eq("org_id", orgId)
 .eq("date", today)
 .limit(1)
 .single();

 // Load past sessions (last 14 days, not today)
 const { data: pastData } = await supabase
 .from("tribunal_sessions")
 .select("*")
 .eq("org_id", orgId)
 .neq("date", today)
 .order("date", { ascending: false })
 .limit(14);

 async function enrichSession(s: TribunalSession): Promise<SessionWithDetails> {
 // Load entry details
 const { data: entry } = await supabase
 .from("time_entries")
 .select("*")
 .eq("id", s.entry_id)
 .single();

 // Load votes
 const { data: votes } = await supabase
 .from("tribunal_votes")
 .select("*")
 .eq("session_id", s.id)
 .order("created_at", { ascending: true });

 return {
 ...s,
 entry: entry ?? null,
 nominated_profile: profileMap.get(s.nominated_user_id) ?? null,
 votes: (votes ?? []).map((v) => ({
 ...v,
 profile: profileMap.get(v.user_id) ?? null,
 })),
 };
 }

 if (todaySession) {
 const enriched = await enrichSession(todaySession);
 setSession(enriched);
 } else {
 setSession(null);
 }

 if (pastData && pastData.length > 0) {
 const enrichedPast = await Promise.all(pastData.map(enrichSession));
 setPastSessions(enrichedPast);
 } else {
 setPastSessions([]);
 }

 setLoading(false);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId) {
 setLoading(false);
 return;
 }
 loadData();
 }, [orgLoading, orgId, loadData]);

 // Real-time subscription
 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("tribunal_realtime")
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"tribunal_sessions",
 filter:`org_id=eq.${orgId}`,
 },
 () => loadData()
 )
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"tribunal_votes",
 },
 () => loadData()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

 async function createSession() {
 if (!orgId || !userId) return;
 setCreating(true);
 const today = getTodayMTY();

 // Find the most suspicious entry of the day:
 // Entries with no proof, short titles, no description, or flagged status
 const { data: entries } = await supabase
 .from("time_entries")
 .select("*")
 .eq("org_id", orgId)
 .eq("date", today)
 .order("created_at", { ascending: true });

 if (!entries || entries.length === 0) {
 setCreating(false);
 return;
 }

 // Score each entry by suspicion level (higher = more suspicious)
 const scored = entries.map((e) => {
 let suspicion = 0;
 if (!e.proof_urls || e.proof_urls.length === 0) suspicion += 3;
 if (!e.description || e.description.length < 10) suspicion += 2;
 if (e.title.length < 15) suspicion += 1;
 if (e.verification_status ==="flagged") suspicion += 4;
 if (e.is_late) suspicion += 1;
 return { entry: e, suspicion };
 });

 scored.sort((a, b) => b.suspicion - a.suspicion);
 const target = scored[0].entry;

 // Build reason string
 const reasons: string[] = [];
 if (!target.proof_urls || target.proof_urls.length === 0) reasons.push("Sin evidencia");
 if (!target.description || target.description.length < 10) reasons.push("Descripcion vaga");
 if (target.title.length < 15) reasons.push("Titulo corto");
 if (target.verification_status ==="flagged") reasons.push("Ya marcado como sospechoso");
 if (target.is_late) reasons.push("Entrada tardia");

 const { error } = await supabase.from("tribunal_sessions").insert({
 org_id: orgId,
 date: today,
 entry_id: target.id,
 nominated_user_id: target.user_id,
 reason: reasons.join(","),
 status:"voting",
 guilty_votes: 0,
 innocent_votes: 0,
 });

 if (!error) {
 await loadData();
 }
 setCreating(false);
 }

 async function castVote(vote:"guilty"|"innocent") {
 if (!session || !userId) return;
 setVoting(true);

 // Check if already voted
 const alreadyVoted = session.votes.some((v) => v.user_id === userId);
 if (alreadyVoted) {
 setVoting(false);
 return;
 }

 // Insert vote
 await supabase.from("tribunal_votes").insert({
 session_id: session.id,
 user_id: userId,
 vote,
 });

 // Update counts
 const newGuilty = session.guilty_votes + (vote ==="guilty"? 1 : 0);
 const newInnocent = session.innocent_votes + (vote ==="innocent"? 1 : 0);
 const totalVotes = newGuilty + newInnocent;

 // Auto-resolve if enough votes (3+ and clear majority)
 let newStatus: TribunalSession["status"] ="voting";
 if (totalVotes >= 3) {
 if (newGuilty > newInnocent) {
 newStatus ="guilty";
 } else if (newInnocent > newGuilty) {
 newStatus ="innocent";
 }
 }

 await supabase
 .from("tribunal_sessions")
 .update({
 guilty_votes: newGuilty,
 innocent_votes: newInnocent,
 status: newStatus,
 })
 .eq("id", session.id);

 // If verdict reached, flag the entry if guilty
 if (newStatus ==="guilty") {
 await supabase
 .from("time_entries")
 .update({ verification_status:"flagged"})
 .eq("id", session.entry_id);
 } else if (newStatus ==="innocent") {
 // Clear the entry if it was flagged
 await supabase
 .from("time_entries")
 .update({ verification_status:"verified"})
 .eq("id", session.entry_id);
 }

 // Show verdict animation if resolved
 if (newStatus !=="voting") {
 setVerdictResult(newStatus as"guilty"|"innocent");
 setShowVerdict(true);
 setTimeout(() => setShowVerdict(false), 3000);
 }

 await loadData();
 setVoting(false);
 }

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

 const userAlreadyVoted = session?.votes.some((v) => v.user_id === userId) ?? false;
 const isOwnEntry = session?.nominated_user_id === userId;
 const isResolved = session?.status ==="guilty"|| session?.status ==="innocent";

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Verdict overlay animation */}
 {showVerdict && verdictResult && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
 <div
 className={cn(
"flex flex-col items-center gap-4 p-10 shadow-2xl animate-in zoom-in-90 duration-500",
 verdictResult ==="guilty"?"bg-red-950 border-2 border-red-500":"bg-green-950 border-2 border-green-500")}
 >
 {verdictResult ==="guilty"? (
 <>
 <XCircle className="w-20 h-20 text-red-400 animate-pulse"/>
 <p className="text-3xl font-black text-red-400 tracking-tight">CULPABLE</p>
 <p className="text-sm text-red-300">La entrada ha sido marcada como sospechosa</p>
 </>
 ) : (
 <>
 <CheckCircle2 className="w-20 h-20 text-green-400 animate-pulse"/>
 <p className="text-3xl font-black text-green-400 tracking-tight">INOCENTE</p>
 <p className="text-sm text-green-300">La entrada ha sido verificada por el equipo</p>
 </>
 )}
 </div>
 </div>
 )}

 {/* Header */}
 <div className="mb-8">
 <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
 <Gavel className="w-6 h-6 text-primary"/>
 Tribunal Diario
 </h1>
 <p className="text-muted-foreground text-sm">
 Cada dia, la entrada mas sospechosa enfrenta el juicio del equipo
 </p>
 </div>

 {/* Today's session */}
 {!session ? (
 /* No session yet */
 <Card className="mb-8 border-dashed border-2">
 <CardContent className="p-10 flex flex-col items-center text-center gap-4">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center">
 <Scale className="w-8 h-8 text-primary"/>
 </div>
 <div>
 <h2 className="text-lg font-bold mb-1">No hay sesion de tribunal hoy</h2>
 <p className="text-sm text-muted-foreground mb-4">
 Inicia el tribunal para identificar la entrada mas sospechosa del dia y someterla a votacion
 </p>
 <Button
 onClick={createSession}
 disabled={creating}
 className="bg-primary hover:from-blue-700 hover:to-blue-800 text-white border-0">
 {creating ? (
 <>
 <Loader2 className="w-4 h-4 mr-2 animate-spin"/>
 Buscando sospechoso...
 </>
 ) : (
 <>
 <Gavel className="w-4 h-4 mr-2"/>
 Iniciar Tribunal
 </>
 )}
 </Button>
 </div>
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-6 mb-8">
 {/* Session status banner */}
 <div
 className={cn(
"flex items-center gap-3 px-4 py-3 text-sm font-medium",
 session.status ==="voting"&&"bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300",
 session.status ==="guilty"&&"bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300",
 session.status ==="innocent"&&"bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300",
 session.status ==="expired"&&"bg-slate-100 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400")}
 >
 {session.status ==="voting"&& <><Scale className="w-4 h-4"/> Votacion en curso &mdash; el equipo esta deliberando</>}
 {session.status ==="guilty"&& <><XCircle className="w-4 h-4"/> Veredicto: CULPABLE &mdash; entrada marcada</>}
 {session.status ==="innocent"&& <><CheckCircle2 className="w-4 h-4"/> Veredicto: INOCENTE &mdash; entrada verificada</>}
 {session.status ==="expired"&& <><Clock className="w-4 h-4"/> Sesion expirada sin veredicto</>}
 </div>

 {/* The accused entry */}
 <Card
 className={cn(
"relative overflow-hidden transition-all duration-300",
 session.status ==="voting"&&"border-2 border-amber-400 dark:border-amber-600 shadow-amber-500/10",
 session.status ==="guilty"&&"border-2 border-red-400 dark:border-red-600",
 session.status ==="innocent"&&"border-2 border-green-400 dark:border-green-600")}
 >
 {/* Dramatic top bar */}
 <div
 className={cn(
"px-5 py-3 flex items-center gap-3 text-sm font-bold uppercase tracking-wider",
 session.status ==="voting"&&"bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
 session.status ==="guilty"&&"bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400",
 session.status ==="innocent"&&"bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400")}
 >
 <ShieldAlert className="w-4 h-4"/>
 Entrada bajo juicio
 {isResolved && (
 <Badge
 className={cn(
"ml-auto",
 session.status ==="guilty"?"bg-red-600 text-white hover:bg-red-700":"bg-green-600 text-white hover:bg-green-700")}
 >
 {session.status ==="guilty"?"Culpable":"Inocente"}
 </Badge>
 )}
 </div>

 <CardContent className="p-5">
 {/* Accused user */}
 <div className="flex items-center gap-3 mb-4">
 <Avatar className="w-10 h-10 ring-2 ring-background">
 <AvatarImage src={session.nominated_profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(session.nominated_profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div>
 <p className="font-semibold">{session.nominated_profile?.full_name ??"Desconocido"}</p>
 <p className="text-xs text-muted-foreground">Acusado/a</p>
 </div>
 </div>

 {session.entry && (
 <div className="space-y-3">
 {/* Entry details */}
 <div className="flex items-center gap-2 flex-wrap">
 <Badge className={cn("text-xs", CATEGORIES[session.entry.category]?.bgColor, CATEGORIES[session.entry.category]?.color)}>
 {CATEGORIES[session.entry.category]?.emoji} {CATEGORIES[session.entry.category]?.label}
 </Badge>
 <span className="text-xs text-muted-foreground tabular-nums">
 {formatHour(session.entry.hour)}
 </span>
 {session.entry.is_late && (
 <Badge variant="outline"className="text-xs text-amber-600 border-amber-300">
 <Clock className="w-3 h-3 mr-1"/>
 Tardia
 </Badge>
 )}
 </div>

 <div>
 <h3 className="font-bold text-lg">{session.entry.title}</h3>
 {session.entry.description ? (
 <p className="text-sm text-muted-foreground mt-1">{session.entry.description}</p>
 ) : (
 <p className="text-sm text-red-500 dark:text-red-400 mt-1 italic flex items-center gap-1">
 <AlertTriangle className="w-3 h-3"/>
 Sin descripcion
 </p>
 )}
 </div>

 {/* Proof status */}
 <div className="flex items-center gap-2 text-sm">
 {session.entry.proof_urls && session.entry.proof_urls.length > 0 ? (
 <span className="flex items-center gap-1 text-green-600">
 <FileText className="w-4 h-4"/>
 {session.entry.proof_urls.length} evidencia{session.entry.proof_urls.length > 1 ?"s":""}
 </span>
 ) : (
 <span className="flex items-center gap-1 text-red-500 dark:text-red-400 font-medium">
 <ImageOff className="w-4 h-4"/>
 Sin evidencia
 </span>
 )}
 </div>

 {/* Reason for nomination */}
 {session.reason && (
 <div className="bg-accent/40 p-3">
 <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
 Motivo de la acusacion
 </p>
 <p className="text-sm">{session.reason}</p>
 </div>
 )}
 </div>
 )}

 {/* Voting area */}
 {session.status ==="voting"&& (
 <div className="mt-6 pt-5 border-t">
 <p className="text-sm font-medium mb-3 flex items-center gap-2">
 <Scale className="w-4 h-4 text-primary"/>
 Emite tu voto
 </p>

 {isOwnEntry ? (
 <div className="bg-accent/40 p-4 text-center">
 <Shield className="w-6 h-6 text-muted-foreground mx-auto mb-2"/>
 <p className="text-sm text-muted-foreground">
 No puedes votar sobre tu propia entrada
 </p>
 </div>
 ) : userAlreadyVoted ? (
 <div className="bg-accent/40 p-4 text-center">
 <CheckCircle2 className="w-6 h-6 text-primary mx-auto mb-2"/>
 <p className="text-sm text-muted-foreground">
 Ya emitiste tu voto. Esperando al resto del equipo.
 </p>
 </div>
 ) : (
 <div className="flex gap-3">
 <Button
 onClick={() => castVote("guilty")}
 disabled={voting}
 className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0 shadow-red-600/25 h-12 text-base font-bold">
 {voting ? (
 <Loader2 className="w-4 h-4 animate-spin"/>
 ) : (
 <>
 <XCircle className="w-5 h-5 mr-2"/>
 Culpable
 </>
 )}
 </Button>
 <Button
 onClick={() => castVote("innocent")}
 disabled={voting}
 className="flex-1 bg-green-600 hover:bg-green-700 text-white border-0 shadow-green-600/25 h-12 text-base font-bold">
 {voting ? (
 <Loader2 className="w-4 h-4 animate-spin"/>
 ) : (
 <>
 <CheckCircle2 className="w-5 h-5 mr-2"/>
 Inocente
 </>
 )}
 </Button>
 </div>
 )}
 </div>
 )}

 {/* Vote tally */}
 {(session.votes.length > 0 || isResolved) && (
 <div className="mt-5 pt-4 border-t">
 <div className="flex items-center gap-2 mb-3">
 <Users className="w-4 h-4 text-muted-foreground"/>
 <span className="text-sm font-medium">
 Votos ({session.guilty_votes + session.innocent_votes})
 </span>
 </div>

 {/* Vote bar */}
 {(session.guilty_votes + session.innocent_votes) > 0 && (
 <div className="flex h-3 rounded-full overflow-hidden mb-4 bg-accent/40">
 {session.guilty_votes > 0 && (
 <div
 className="bg-red-500 transition-all duration-500"style={{
 width:`${(session.guilty_votes / (session.guilty_votes + session.innocent_votes)) * 100}%`,
 }}
 />
 )}
 {session.innocent_votes > 0 && (
 <div
 className="bg-green-500 transition-all duration-500"style={{
 width:`${(session.innocent_votes / (session.guilty_votes + session.innocent_votes)) * 100}%`,
 }}
 />
 )}
 </div>
 )}

 <div className="grid grid-cols-2 gap-3 mb-4">
 <div className="bg-red-50 dark:bg-red-950/20 p-3 text-center">
 <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums tracking-tight">
 {session.guilty_votes}
 </p>
 <p className="text-xs text-red-600/70 dark:text-red-400/70">Culpable</p>
 </div>
 <div className="bg-green-50 dark:bg-green-950/20 p-3 text-center">
 <p className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums tracking-tight">
 {session.innocent_votes}
 </p>
 <p className="text-xs text-green-600/70 dark:text-green-400/70">Inocente</p>
 </div>
 </div>

 {/* Individual votes */}
 <div className="space-y-2">
 {session.votes.map((v) => (
 <div key={v.id} className="flex items-center gap-2 text-sm">
 <Avatar className="w-6 h-6 ring-2 ring-background">
 <AvatarImage src={v.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px]">
 {getInitials(v.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <span className="font-medium">{v.profile?.full_name ??"?"}</span>
 <Badge
 className={cn(
"text-[10px] ml-auto",
 v.vote ==="guilty"?"bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400":"bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400")}
 >
 {v.vote ==="guilty"?"Culpable":"Inocente"}
 </Badge>
 </div>
 ))}
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 )}

 {/* Past sessions */}
 {pastSessions.length > 0 && (
 <div>
 <h2 className="text-lg font-bold tracking-tight mb-4 flex items-center gap-2">
 <Scroll className="w-5 h-5 text-muted-foreground"/>
 Historial del Tribunal
 </h2>
 <div className="space-y-3">
 {pastSessions.map((ps) => {
 const cat = ps.entry ? CATEGORIES[ps.entry.category] : null;
 return (
 <Card
 key={ps.id}
 className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage src={ps.nominated_profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px]">
 {getInitials(ps.nominated_profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="font-semibold text-sm truncate">
 {ps.nominated_profile?.full_name ??"?"}
 </span>
 {cat && (
 <Badge className={cn("text-[10px]", cat.bgColor, cat.color)}>
 {cat.emoji} {cat.label}
 </Badge>
 )}
 </div>
 <p className="text-xs text-muted-foreground truncate">
 {ps.entry?.title ??"Entrada eliminada"}
 </p>
 </div>
 <div className="flex items-center gap-3 shrink-0">
 <div className="text-right">
 <div className="flex items-center gap-1.5 text-xs tabular-nums">
 <span className="text-red-500 font-medium">{ps.guilty_votes}</span>
 <span className="text-muted-foreground">/</span>
 <span className="text-green-500 font-medium">{ps.innocent_votes}</span>
 </div>
 <p className="text-[10px] text-muted-foreground">
 {format(new Date(ps.date),"d MMM", { locale: es })}
 </p>
 </div>
 <Badge
 className={cn(
"text-[10px]",
 ps.status ==="guilty"&&"bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",
 ps.status ==="innocent"&&"bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
 ps.status ==="expired"&&"bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400",
 ps.status ==="voting"&&"bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400")}
 >
 {ps.status ==="guilty"&&"Culpable"}
 {ps.status ==="innocent"&&"Inocente"}
 {ps.status ==="expired"&&"Expirado"}
 {ps.status ==="voting"&&"Pendiente"}
 </Badge>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 )}

 {/* Empty history state */}
 {!session && pastSessions.length === 0 && (
 <div className="text-center py-12 text-muted-foreground">
 <p className="text-sm">Aqui apareceran las sesiones pasadas del tribunal</p>
 </div>
 )}
 </div>
 );
}
