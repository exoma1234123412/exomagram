"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
 Crosshair,
 Plus,
 Clock,
 CheckCircle2,
 Hand,
 Link2,
 Loader2,
 Trophy,
 AlertTriangle,
 Flame,
} from "lucide-react";
import { format, isPast } from "date-fns";
import { es } from "date-fns/locale";

interface Bounty {
 id: string;
 user_id: string;
 new_data: {
 title: string;
 deadline: string;
 points: number;
 status:"open"|"claimed"|"completed";
 claimer_id?: string;
 evidence_url?: string;
 };
 created_at: string;
 profile?: Profile;
 claimerProfile?: Profile;
}

export default function BountiesPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [bounties, setBounties] = useState<Bounty[]>([]);
 const [loading, setLoading] = useState(true);
 const [submitting, setSubmitting] = useState(false);
 const [claiming, setClaiming] = useState<string | null>(null);
 const [verifying, setVerifying] = useState<string | null>(null);
 const [showForm, setShowForm] = useState(false);

 // Form state
 const [title, setTitle] = useState("");
 const [deadline, setDeadline] = useState("");
 const [points, setPoints] = useState(10);

 // Claim state
 const [claimEvidence, setClaimEvidence] = useState("");
 const [claimingBountyId, setClaimingBountyId] = useState<string | null>(null);

 const loadBounties = useCallback(async () => {
 if (!orgId) return;

 const { data: logs } = await supabase
 .from("audit_log")
 .select("id, user_id, new_data, created_at")
 .eq("org_id", orgId)
 .eq("action","entry_created")
 .eq("target_type","bounty")
 .order("created_at", { ascending: false });

 // Load profiles
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 const profileMap = new Map<string, Profile>();
 for (const m of members ?? []) {
 if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
 }

 const enriched: Bounty[] = (logs ?? []).map((l) => {
 const nd = l.new_data as Bounty["new_data"];
 return {
 id: l.id,
 user_id: l.user_id,
 new_data: nd,
 created_at: l.created_at,
 profile: profileMap.get(l.user_id),
 claimerProfile: nd.claimer_id ? profileMap.get(nd.claimer_id) : undefined,
 };
 });

 setBounties(enriched);
 setLoading(false);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId) {
 setLoading(false);
 return;
 }
 loadBounties();
 }, [orgLoading, orgId, loadBounties]);

 async function createBounty(e: React.FormEvent) {
 e.preventDefault();
 if (!orgId || !userId || !title.trim() || !deadline) return;
 setSubmitting(true);

 await supabase.from("audit_log").insert({
 org_id: orgId,
 user_id: userId,
 action:"entry_created",
 target_type:"bounty",
 new_data: {
 title: title.trim(),
 deadline,
 points: Math.min(50, Math.max(1, points)),
 status:"open",
 },
 });

 setTitle("");
 setDeadline("");
 setPoints(10);
 setShowForm(false);
 await loadBounties();
 setSubmitting(false);
 }

 async function claimBounty(bountyId: string) {
 if (!userId || !claimEvidence.trim()) return;
 setClaiming(bountyId);

 const bounty = bounties.find((b) => b.id === bountyId);
 if (!bounty) { setClaiming(null); return; }

 await supabase
 .from("audit_log")
 .update({
 new_data: {
 ...bounty.new_data,
 status:"claimed",
 claimer_id: userId,
 evidence_url: claimEvidence.trim(),
 },
 })
 .eq("id", bountyId);

 setClaimEvidence("");
 setClaimingBountyId(null);
 await loadBounties();
 setClaiming(null);
 }

 async function verifyBounty(bountyId: string) {
 setVerifying(bountyId);

 const bounty = bounties.find((b) => b.id === bountyId);
 if (!bounty) { setVerifying(null); return; }

 await supabase
 .from("audit_log")
 .update({
 new_data: {
 ...bounty.new_data,
 status:"completed",
 },
 })
 .eq("id", bountyId);

 await loadBounties();
 setVerifying(null);
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

 const openBounties = bounties.filter((b) => b.new_data.status ==="open"&& !isPast(new Date(b.new_data.deadline)));
 const expiredBounties = bounties.filter((b) => b.new_data.status ==="open"&& isPast(new Date(b.new_data.deadline)));
 const claimedBounties = bounties.filter((b) => b.new_data.status ==="claimed");
 const completedBounties = bounties.filter((b) => b.new_data.status ==="completed");

 const totalPointsAwarded = completedBounties.reduce((s, b) => s + b.new_data.points, 0);

 return (
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
 <Crosshair className="w-6 h-6 text-primary"/>
 Tablero de Bounties
 </h1>
 <p className="text-muted-foreground text-sm mt-1">
 Publica tareas con puntos de recompensa. Quien la resuelva antes del deadline, gana.
 </p>
 </div>

 {/* Stats */}
 {bounties.length > 0 && (
 <div className="grid grid-cols-4 gap-3 mb-8">
 <div className="bg-green-50 dark:bg-green-950/20 p-3 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight text-green-600">{openBounties.length}</p>
 <p className="text-[10px] text-muted-foreground">Abiertas</p>
 </div>
 <div className="bg-amber-50 dark:bg-amber-950/20 p-3 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight text-amber-600">{claimedBounties.length}</p>
 <p className="text-[10px] text-muted-foreground">Reclamadas</p>
 </div>
 <div className="bg-blue-50 dark:bg-blue-950/20 p-3 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight text-blue-600">{completedBounties.length}</p>
 <p className="text-[10px] text-muted-foreground">Completadas</p>
 </div>
 <div className="bg-purple-50 dark:bg-purple-950/20 p-3 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight text-purple-600">{totalPointsAwarded}</p>
 <p className="text-[10px] text-muted-foreground">Puntos dados</p>
 </div>
 </div>
 )}

 {/* Create bounty button / form */}
 {!showForm ? (
 <Button
 onClick={() => setShowForm(true)}
 className="mb-8 bg-primary text-white border-0 gap-2">
 <Plus className="w-4 h-4"/>
 Publicar bounty
 </Button>
 ) : (
 <Card className="mb-8 border-2 border-dashed">
 <CardContent className="p-6">
 <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
 <Crosshair className="w-4 h-4 text-primary"/>
 Nueva bounty
 </h3>
 <form onSubmit={createBounty} className="space-y-4">
 <div>
 <Label htmlFor="bounty-title"className="text-xs font-medium">
 Descripción de la tarea
 </Label>
 <Textarea
 id="bounty-title"placeholder="Quien resuelva [tarea] gana puntos..."value={title}
 onChange={(e) => setTitle(e.target.value)}
 required
 minLength={10}
 maxLength={500}
 className="min-h-[80px] mt-1"/>
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <Label htmlFor="bounty-deadline"className="text-xs font-medium">
 Deadline
 </Label>
 <Input
 id="bounty-deadline"type="datetime-local"value={deadline}
 onChange={(e) => setDeadline(e.target.value)}
 required
 min={new Date().toISOString().slice(0, 16)}
 className="mt-1"/>
 </div>
 <div>
 <Label htmlFor="bounty-points"className="text-xs font-medium">
 Puntos (1-50)
 </Label>
 <Input
 id="bounty-points"type="number"min={1}
 max={50}
 value={points}
 onChange={(e) => setPoints(Number(e.target.value))}
 required
 className="mt-1"/>
 </div>
 </div>
 <div className="flex gap-2 justify-end">
 <Button
 type="button"variant="ghost"className=""onClick={() => setShowForm(false)}
 >
 Cancelar
 </Button>
 <Button
 type="submit"disabled={submitting || title.trim().length < 10 || !deadline}
 className="bg-primary text-white border-0 gap-2">
 {submitting ? (
 <Loader2 className="w-4 h-4 animate-spin"/>
 ) : (
 <Plus className="w-4 h-4"/>
 )}
 {submitting ?"Publicando...":"Publicar"}
 </Button>
 </div>
 </form>
 </CardContent>
 </Card>
 )}

 {/* Open bounties */}
 {openBounties.length > 0 && (
 <div className="mb-8">
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
 <Flame className="w-4 h-4"/>
 Bounties abiertas
 </h2>
 <div className="space-y-3">
 {openBounties.map((b) => (
 <Card
 key={b.id}
 className="transition-all duration-300 hover:border-primary/30 border-green-200 dark:border-green-900">
 <CardContent className="p-4">
 <div className="flex items-start gap-3">
 <Avatar className="w-8 h-8 ring-2 ring-background mt-0.5">
 <AvatarImage src={b.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(b.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1 flex-wrap">
 <p className="font-semibold text-sm">
 {b.profile?.full_name ??"?"}
 </p>
 <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px]">
 Abierta
 </Badge>
 <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[10px] gap-1">
 <Trophy className="w-3 h-3"/>
 {b.new_data.points} pts
 </Badge>
 </div>
 <p className="text-sm mb-2">{b.new_data.title}</p>
 <p className="text-[10px] text-muted-foreground flex items-center gap-1">
 <Clock className="w-3 h-3"/>
 Deadline: {format(new Date(b.new_data.deadline),"d MMM yyyy, HH:mm", { locale: es })}
 </p>

 {/* Claim area */}
 {b.user_id !== userId && (
 <>
 {claimingBountyId === b.id ? (
 <div className="mt-3 space-y-2">
 <Input
 placeholder="URL de evidencia (link al PR, screenshot, etc.)"value={claimEvidence}
 onChange={(e) => setClaimEvidence(e.target.value)}
 />
 <div className="flex gap-2">
 <Button
 size="sm"variant="ghost"className="text-xs"onClick={() => { setClaimingBountyId(null); setClaimEvidence(""); }}
 >
 Cancelar
 </Button>
 <Button
 size="sm"className="text-xs gap-1"disabled={!claimEvidence.trim() || claiming === b.id}
 onClick={() => claimBounty(b.id)}
 >
 {claiming === b.id ? (
 <Loader2 className="w-3 h-3 animate-spin"/>
 ) : (
 <Hand className="w-3 h-3"/>
 )}
 Reclamar
 </Button>
 </div>
 </div>
 ) : (
 <Button
 size="sm"variant="outline"className="mt-3 text-xs gap-1"onClick={() => setClaimingBountyId(b.id)}
 >
 <Hand className="w-3 h-3"/>
 Reclamar
 </Button>
 )}
 </>
 )}
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 )}

 {/* Claimed bounties (in progress) */}
 {claimedBounties.length > 0 && (
 <div className="mb-8">
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
 <Hand className="w-4 h-4"/>
 En progreso
 </h2>
 <div className="space-y-3">
 {claimedBounties.map((b) => (
 <Card
 key={b.id}
 className="transition-all duration-300 hover:border-primary/30 border-amber-200 dark:border-amber-900">
 <CardContent className="p-4">
 <div className="flex items-start gap-3">
 <Avatar className="w-8 h-8 ring-2 ring-background mt-0.5">
 <AvatarImage src={b.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(b.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1 flex-wrap">
 <p className="font-semibold text-sm">
 {b.profile?.full_name ??"?"}
 </p>
 <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px]">
 Reclamada
 </Badge>
 <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[10px] gap-1">
 <Trophy className="w-3 h-3"/>
 {b.new_data.points} pts
 </Badge>
 </div>
 <p className="text-sm mb-2">{b.new_data.title}</p>

 {/* Claimer info */}
 <div className="bg-accent/40 p-3 mt-2">
 <div className="flex items-center gap-2 mb-1">
 <Avatar className="w-5 h-5">
 <AvatarImage src={b.claimerProfile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px]">
 {getInitials(b.claimerProfile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-medium">
 {b.claimerProfile?.full_name ??"?"} reclamó esta bounty
 </span>
 </div>
 {b.new_data.evidence_url && (
 <a
 href={b.new_data.evidence_url}
 target="_blank"rel="noopener noreferrer"className="text-xs text-primary flex items-center gap-1 hover:underline mt-1">
 <Link2 className="w-3 h-3"/>
 Ver evidencia
 </a>
 )}
 </div>

 {/* Verify button (only poster can verify) */}
 {b.user_id === userId && (
 <Button
 size="sm"className="mt-3 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"disabled={verifying === b.id}
 onClick={() => verifyBounty(b.id)}
 >
 {verifying === b.id ? (
 <Loader2 className="w-3 h-3 animate-spin"/>
 ) : (
 <CheckCircle2 className="w-3 h-3"/>
 )}
 Verificar completada
 </Button>
 )}
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 )}

 {/* Completed bounties */}
 {completedBounties.length > 0 && (
 <div className="mb-8">
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
 <CheckCircle2 className="w-4 h-4"/>
 Completadas
 </h2>
 <div className="space-y-3">
 {completedBounties.map((b) => (
 <Card
 key={b.id}
 className="transition-all duration-300 hover:border-primary/30 opacity-80">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage src={b.claimerProfile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(b.claimerProfile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1 flex-wrap">
 <p className="font-semibold text-sm">
 {b.claimerProfile?.full_name ??"?"}
 </p>
 <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] gap-1">
 <CheckCircle2 className="w-3 h-3"/>
 Completada
 </Badge>
 <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[10px] gap-1">
 <Trophy className="w-3 h-3"/>
 +{b.new_data.points} pts
 </Badge>
 </div>
 <p className="text-sm text-muted-foreground">{b.new_data.title}</p>
 <p className="text-[10px] text-muted-foreground mt-1">
 Publicada por {b.profile?.full_name ??"?"}
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 )}

 {/* Expired bounties */}
 {expiredBounties.length > 0 && (
 <div className="mb-8">
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
 <AlertTriangle className="w-4 h-4"/>
 Expiradas
 </h2>
 <div className="space-y-3">
 {expiredBounties.map((b) => (
 <Card
 key={b.id}
 className="transition-all duration-300 opacity-50">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage src={b.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(b.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1 flex-wrap">
 <p className="font-semibold text-sm text-muted-foreground">
 {b.profile?.full_name ??"?"}
 </p>
 <Badge variant="secondary"className="text-[10px]">
 Expirada
 </Badge>
 <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[10px] gap-1">
 {b.new_data.points} pts
 </Badge>
 </div>
 <p className="text-sm text-muted-foreground line-through">{b.new_data.title}</p>
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 )}

 {/* Empty state */}
 {bounties.length === 0 && !showForm && (
 <div className="flex flex-col items-center justify-center py-16 gap-4">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center">
 <Crosshair className="w-7 h-7 text-primary/40"/>
 </div>
 <div className="text-center">
 <p className="text-sm text-muted-foreground">
 No hay bounties publicadas.
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 Sé el primero en publicar una tarea con recompensa.
 </p>
 </div>
 </div>
 )}
 </div>
 );
}
