"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
 Swords,
 FileSignature,
 Flame,
 Shield,
 AlertTriangle,
 CheckCircle,
 XCircle,
 Skull,
 Droplets,
 Loader2,
 Clock,
 Trophy,
 Plus,
} from "lucide-react";
import { formatDistanceToNow, format, isPast } from "date-fns";
import { es } from "date-fns/locale";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ContractSignature {
 userId: string;
 signedAt: string;
}

interface BloodContract {
 id: string;
 creatorId: string;
 opponentId: string;
 terms: string;
 stake: number;
 deadline: string;
 status:"pending"|"signed"|"active"|"completed"|"broken";
 createdAt: string;
 signatures: ContractSignature[];
 winnerId?: string;
 resolution?: string;
}

interface TeamMember {
 user_id: string;
 profile: Profile;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getStorageKey(orgId: string): string {
 return`exomagram_blood_contracts_${orgId}`;
}

function loadContracts(orgId: string): BloodContract[] {
 try {
 const raw = localStorage.getItem(getStorageKey(orgId));
 return raw ? JSON.parse(raw) : [];
 } catch {
 return [];
 }
}

function saveContracts(orgId: string, contracts: BloodContract[]): void {
 localStorage.setItem(getStorageKey(orgId), JSON.stringify(contracts));
}

function generateId(): string {
 return`bc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function BloodContractPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [contracts, setContracts] = useState<BloodContract[]>([]);
 const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
 const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
 const [loading, setLoading] = useState(true);
 const [showForm, setShowForm] = useState(false);

 // Form state
 const [selectedOpponent, setSelectedOpponent] = useState("");
 const [terms, setTerms] = useState("");
 const [stake, setStake] = useState(100);
 const [deadline, setDeadline] = useState("");

 const loadData = useCallback(async () => {
 if (!orgId || !userId) return;

 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 const pMap = new Map<string, Profile>();
 const team: TeamMember[] = [];
 for (const m of members ?? []) {
 if (m.profiles) {
 const p = m.profiles as unknown as Profile;
 pMap.set(m.user_id, p);
 if (m.user_id !== userId) {
 team.push({ user_id: m.user_id, profile: p });
 }
 }
 }
 setProfileMap(pMap);
 setTeamMembers(team);

 const stored = loadContracts(orgId);
 setContracts(stored);
 setLoading(false);
 }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId || !userId) {
 setLoading(false);
 return;
 }
 loadData();
 }, [orgLoading, orgId, userId, loadData]);

 // ─── Actions ───────────────────────────────

 function createContract() {
 if (!orgId || !userId || !selectedOpponent || !terms.trim() || !deadline) return;

 const newContract: BloodContract = {
 id: generateId(),
 creatorId: userId,
 opponentId: selectedOpponent,
 terms: terms.trim(),
 stake,
 deadline,
 status:"pending",
 createdAt: new Date().toISOString(),
 signatures: [{ userId, signedAt: new Date().toISOString() }],
 };

 const updated = [newContract, ...contracts];
 saveContracts(orgId, updated);
 setContracts(updated);

 // Reset form
 setSelectedOpponent("");
 setTerms("");
 setStake(100);
 setDeadline("");
 setShowForm(false);
 }

 function signContract(contractId: string) {
 if (!orgId || !userId) return;
 const updated = contracts.map((c) => {
 if (c.id !== contractId) return c;
 if (c.signatures.some((s) => s.userId === userId)) return c;
 const newSigs = [...c.signatures, { userId, signedAt: new Date().toISOString() }];
 const bothSigned = newSigs.length >= 2;
 return { ...c, signatures: newSigs, status: bothSigned ?"active"as const : c.status };
 });
 saveContracts(orgId, updated);
 setContracts(updated);
 }

 function rejectContract(contractId: string) {
 if (!orgId) return;
 const updated = contracts.filter((c) => c.id !== contractId);
 saveContracts(orgId, updated);
 setContracts(updated);
 }

 function declareVictory(contractId: string) {
 if (!orgId || !userId) return;
 const updated = contracts.map((c) => {
 if (c.id !== contractId || c.status !=="active") return c;
 return { ...c, status:"completed"as const, winnerId: userId, resolution:"Victoria declarada"};
 });
 saveContracts(orgId, updated);
 setContracts(updated);
 }

 function admitDefeat(contractId: string) {
 if (!orgId || !userId) return;
 const updated = contracts.map((c) => {
 if (c.id !== contractId || c.status !=="active") return c;
 const winnerId = c.creatorId === userId ? c.opponentId : c.creatorId;
 return { ...c, status:"broken"as const, winnerId, resolution:"Derrota admitida"};
 });
 saveContracts(orgId, updated);
 setContracts(updated);
 }

 // ─── Categorize contracts ──────────────────

 const pendingForMe = contracts.filter(
 (c) => c.status ==="pending"&& c.opponentId === userId && !c.signatures.some((s) => s.userId === userId)
 );
 const activeContracts = contracts.filter((c) => c.status ==="active");
 const pendingContracts = contracts.filter(
 (c) => c.status ==="pending"&& !(c.opponentId === userId && !c.signatures.some((s) => s.userId === userId))
 );
 const brokenContracts = contracts.filter((c) => c.status ==="broken");
 const completedContracts = contracts.filter((c) => c.status ==="completed");

 // ─── Loading ───────────────────────────────

 if (loading || orgLoading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </div>
 </div>
 );
 }

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* ─── Header ─────────────────────────── */}
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Droplets className="w-5 h-5 text-red-600"/>
 Contrato de Sangre Digital
 </h1>
 <p className="font-mono text-xs text-muted-foreground mt-1">
 Pactos vinculantes con consecuencias reales. Irreversible una vez firmado.
 </p>
 </div>

 {/* ─── Stats ──────────────────────────── */}
 <div className="grid grid-cols-4 gap-3 mb-8">
 <div className="bg-accent/30 border border-border p-3 text-center">
 <p className="text-xl font-mono font-bold tabular-nums tracking-tight">{activeContracts.length}</p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">Activos</p>
 </div>
 <div className="bg-accent/30 border border-border p-3 text-center">
 <p className="text-xl font-mono font-bold tabular-nums tracking-tight">{pendingForMe.length}</p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">Pendientes</p>
 </div>
 <div className="bg-accent/30 border border-border p-3 text-center">
 <p className="text-xl font-mono font-bold tabular-nums tracking-tight text-green-600">{completedContracts.length}</p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">Completados</p>
 </div>
 <div className="bg-accent/30 border border-border p-3 text-center">
 <p className="text-xl font-mono font-bold tabular-nums tracking-tight text-red-600">{brokenContracts.length}</p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">Rotos</p>
 </div>
 </div>

 {/* ─── Pending for me (sign/reject) ───── */}
 {pendingForMe.length > 0 && (
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
 <AlertTriangle className="w-3 h-3 text-amber-500"/>
 Contratos que requieren tu firma
 </p>
 <div className="space-y-3">
 {pendingForMe.map((c) => (
 <PendingSignCard
 key={c.id}
 contract={c}
 profileMap={profileMap}
 onSign={() => signContract(c.id)}
 onReject={() => rejectContract(c.id)}
 />
 ))}
 </div>
 </section>
 )}

 {/* ─── New Contract Button / Form ────── */}
 <section className="mb-8">
 {!showForm ? (
 <Button
 onClick={() => setShowForm(true)}
 className="w-full font-mono text-xs uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white border-0 gap-2">
 <Plus className="w-4 h-4"/>
 Nuevo Contrato de Sangre
 </Button>
 ) : (
 <Card className="border-red-600/30 border-2">
 <CardContent className="p-5">
 <div className="flex items-center justify-between mb-4">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-600 font-bold flex items-center gap-2">
 <Droplets className="w-3 h-3"/>
 Redactar contrato
 </p>
 <button
 onClick={() => setShowForm(false)}
 className="font-mono text-[9px] text-muted-foreground hover:text-foreground transition-colors">
 Cancelar
 </button>
 </div>

 <div className="space-y-4">
 {/* Opponent */}
 <div>
 <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2 block">
 Contraparte
 </label>
 <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
 {teamMembers.map((m) => (
 <button
 key={m.user_id}
 onClick={() => setSelectedOpponent(m.user_id)}
 className={cn(
"flex items-center gap-2 p-2.5 transition-all duration-200 text-left border",
 selectedOpponent === m.user_id
 ?"bg-red-600/10 border-red-600/30":"bg-accent/20 border-border hover:border-primary/30")}
 >
 <Avatar className="w-6 h-6 ring-1 ring-border">
 <AvatarImage src={m.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px] font-mono">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="text-[10px] font-mono font-medium truncate">
 {m.profile.full_name ?? m.profile.email}
 </span>
 {selectedOpponent === m.user_id && (
 <CheckCircle className="w-3 h-3 text-red-600 ml-auto shrink-0"/>
 )}
 </button>
 ))}
 </div>
 </div>

 {/* Terms */}
 <div>
 <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2 block">
 Terminos del pacto
 </label>
 <Textarea
 placeholder="Describe exactamente a que se compromete cada parte..."value={terms}
 onChange={(e) => setTerms(e.target.value)}
 rows={3}
 className="font-mono text-xs"/>
 </div>

 {/* Stake */}
 <div>
 <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2 block">
 XP en juego: <span className="text-red-600 font-bold tabular-nums">{stake}</span>
 </label>
 <input
 type="range"min={50}
 max={500}
 step={25}
 value={stake}
 onChange={(e) => setStake(Number(e.target.value))}
 className="w-full accent-red-600"/>
 <div className="flex justify-between font-mono text-[8px] text-muted-foreground mt-1">
 <span>50 XP</span>
 <span>500 XP</span>
 </div>
 </div>

 {/* Deadline */}
 <div>
 <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2 block">
 Fecha limite
 </label>
 <Input
 type="date"value={deadline}
 onChange={(e) => setDeadline(e.target.value)}
 min={new Date().toISOString().split("T")[0]}
 className="font-mono text-xs"/>
 </div>

 {/* Preview */}
 {selectedOpponent && terms.trim() && deadline && (
 <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-900/20 p-4">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-amber-700 dark:text-amber-400 mb-2 font-bold">
 Vista previa del contrato
 </p>
 <p className="font-mono text-xs text-foreground leading-relaxed">
 Yo, <span className="font-bold">{profileMap.get(userId!)?.full_name ??"?"}</span>,
 y <span className="font-bold">{profileMap.get(selectedOpponent)?.full_name ??"?"}</span>,
 sellamos este pacto de sangre digital con{" "}
 <span className="font-bold text-red-600 tabular-nums">{stake} XP</span> en juego.
 Fecha limite: <span className="font-bold">{format(new Date(deadline +"T12:00:00"),"d 'de' MMMM yyyy", { locale: es })}</span>.
 </p>
 <p className="font-mono text-[10px] text-muted-foreground mt-2 italic">
 &quot;{terms.trim()}&quot;
 </p>
 </div>
 )}

 <Button
 onClick={createContract}
 disabled={!selectedOpponent || !terms.trim() || !deadline}
 className="w-full font-mono text-xs uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white border-0 gap-2">
 <Droplets className="w-4 h-4"/>
 Firmar con Sangre
 </Button>
 </div>
 </CardContent>
 </Card>
 )}
 </section>

 {/* ─── Active Contracts ────────────────── */}
 {activeContracts.length > 0 && (
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
 <Flame className="w-3 h-3 text-red-500"/>
 Contratos Activos
 </p>
 <div className="space-y-3">
 {activeContracts.map((c) => (
 <ActiveContractCard
 key={c.id}
 contract={c}
 userId={userId!}
 profileMap={profileMap}
 onDeclareVictory={() => declareVictory(c.id)}
 onAdmitDefeat={() => admitDefeat(c.id)}
 />
 ))}
 </div>
 </section>
 )}

 {/* ─── Pending (waiting for other) ───── */}
 {pendingContracts.length > 0 && (
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
 <Clock className="w-3 h-3"/>
 Esperando Firma
 </p>
 <div className="space-y-3">
 {pendingContracts.map((c) => (
 <WaitingCard key={c.id} contract={c} profileMap={profileMap} />
 ))}
 </div>
 </section>
 )}

 {/* ─── Empty state ─────────────────────── */}
 {contracts.length === 0 && (
 <div className="flex flex-col items-center justify-center py-16 gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Droplets className="w-8 h-8 text-red-600/40"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground text-center">
 No hay contratos de sangre. Crea uno arriba para sellar un pacto.
 </p>
 </div>
 )}

 {/* ─── Muro de la Verguenza ────────────── */}
 {brokenContracts.length > 0 && (
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-600/60 mb-3 flex items-center gap-2">
 <Skull className="w-3 h-3 text-red-600"/>
 Muro de la Verguenza
 </p>
 <div className="space-y-3">
 {brokenContracts.map((c) => (
 <BrokenContractCard key={c.id} contract={c} profileMap={profileMap} />
 ))}
 </div>
 </section>
 )}

 {/* ─── Contratos Legendarios ───────────── */}
 {completedContracts.length > 0 && (
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-amber-600/60 mb-3 flex items-center gap-2">
 <Trophy className="w-3 h-3 text-amber-600"/>
 Contratos Legendarios
 </p>
 <div className="space-y-3">
 {completedContracts.map((c) => (
 <LegendaryContractCard key={c.id} contract={c} profileMap={profileMap} />
 ))}
 </div>
 </section>
 )}
 </div>
 );
}

// ─────────────────────────────────────────────
// Pending Sign Card
// ─────────────────────────────────────────────

function PendingSignCard({
 contract,
 profileMap,
 onSign,
 onReject,
}: {
 contract: BloodContract;
 profileMap: Map<string, Profile>;
 onSign: () => void;
 onReject: () => void;
}) {
 const creator = profileMap.get(contract.creatorId);

 return (
 <Card className="border-amber-600/30 border-2 transition-colors duration-200 hover:border-amber-600/50">
 <CardContent className="p-4">
 <div className="flex items-start gap-3 mb-3">
 <Avatar className="w-8 h-8 ring-1 ring-border">
 <AvatarImage src={creator?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px] font-mono">
 {getInitials(creator?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="font-mono text-xs font-bold">
 {creator?.full_name ??"?"} te desafia
 </p>
 <p className="font-mono text-[10px] text-muted-foreground">
 {formatDistanceToNow(new Date(contract.createdAt), { addSuffix: true, locale: es })}
 </p>
 </div>
 <Badge className="bg-red-600/10 text-red-600 border-red-600/20 font-mono text-[10px] tabular-nums">
 {contract.stake} XP
 </Badge>
 </div>

 <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-900/20 p-3 mb-3">
 <p className="font-mono text-[10px] text-foreground leading-relaxed italic">
 &quot;{contract.terms}&quot;
 </p>
 <p className="font-mono text-[9px] text-muted-foreground mt-2">
 Limite: {format(new Date(contract.deadline +"T12:00:00"),"d 'de' MMMM yyyy", { locale: es })}
 </p>
 </div>

 <div className="flex gap-2">
 <Button
 onClick={onSign}
 className="flex-1 font-mono text-[10px] uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white border-0 gap-1"size="sm">
 <Droplets className="w-3 h-3"/>
 Firmar con Sangre
 </Button>
 <Button
 onClick={onReject}
 variant="outline"size="sm"className="font-mono text-[10px] uppercase tracking-wider gap-1">
 <XCircle className="w-3 h-3"/>
 Rechazar
 </Button>
 </div>
 </CardContent>
 </Card>
 );
}

// ─────────────────────────────────────────────
// Active Contract Card
// ─────────────────────────────────────────────

function ActiveContractCard({
 contract,
 userId,
 profileMap,
 onDeclareVictory,
 onAdmitDefeat,
}: {
 contract: BloodContract;
 userId: string;
 profileMap: Map<string, Profile>;
 onDeclareVictory: () => void;
 onAdmitDefeat: () => void;
}) {
 const creator = profileMap.get(contract.creatorId);
 const opponent = profileMap.get(contract.opponentId);
 const deadlineDate = new Date(contract.deadline +"T23:59:59");
 const isExpired = isPast(deadlineDate);
 const isParty = contract.creatorId === userId || contract.opponentId === userId;

 return (
 <Card className="border-red-600/20 border transition-colors duration-200 hover:border-red-600/40">
 <CardContent className="p-4">
 {/* SELLADO badge */}
 <div className="flex items-center justify-between mb-3">
 <Badge className="bg-red-600 text-white font-mono text-[9px] tracking-[0.12em] uppercase border-0">
 <Flame className="w-3 h-3 mr-1"/>
 Sellado
 </Badge>
 <span className={cn(
"font-mono text-[10px] tabular-nums",
 isExpired ?"text-red-600 font-bold":"text-muted-foreground")}>
 {isExpired
 ?"EXPIRADO": formatDistanceToNow(deadlineDate, { addSuffix: false, locale: es }) +"restante"}
 </span>
 </div>

 {/* Parties facing each other */}
 <div className="flex items-center gap-3 mb-3">
 <div className="flex items-center gap-2 flex-1 min-w-0">
 <Avatar className="w-9 h-9 ring-1 ring-red-600/30">
 <AvatarImage src={creator?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px] font-mono bg-red-600/10 text-red-600">
 {getInitials(creator?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0">
 <p className="font-mono text-xs font-bold truncate">{creator?.full_name ??"?"}</p>
 <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-wider">Creador</p>
 </div>
 </div>

 <div className="flex flex-col items-center shrink-0">
 <Swords className="w-5 h-5 text-red-600"/>
 <span className="font-mono text-[10px] font-bold text-red-600 tabular-nums mt-0.5">{contract.stake} XP</span>
 </div>

 <div className="flex items-center gap-2 flex-1 min-w-0 justify-end text-right">
 <div className="min-w-0">
 <p className="font-mono text-xs font-bold truncate">{opponent?.full_name ??"?"}</p>
 <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-wider">Contraparte</p>
 </div>
 <Avatar className="w-9 h-9 ring-1 ring-red-600/30">
 <AvatarImage src={opponent?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px] font-mono bg-red-600/10 text-red-600">
 {getInitials(opponent?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 </div>
 </div>

 {/* Terms */}
 <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-900/20 p-3 mb-3">
 <p className="font-mono text-[10px] text-foreground leading-relaxed italic">
 &quot;{contract.terms}&quot;
 </p>
 </div>

 {/* Deadline */}
 <p className="font-mono text-[9px] text-muted-foreground mb-3">
 Limite: {format(new Date(contract.deadline +"T12:00:00"),"d 'de' MMMM yyyy", { locale: es })}
 </p>

 {/* Actions */}
 {isParty && (
 <div className="flex gap-2 pt-3 border-t border-border/50">
 <Button
 onClick={onDeclareVictory}
 size="sm"className="flex-1 font-mono text-[10px] uppercase tracking-wider bg-green-600 hover:bg-green-700 text-white border-0 gap-1">
 <Trophy className="w-3 h-3"/>
 Declarar Victoria
 </Button>
 <Button
 onClick={onAdmitDefeat}
 variant="outline"size="sm"className="flex-1 font-mono text-[10px] uppercase tracking-wider gap-1 text-red-600 border-red-600/30 hover:bg-red-600/10">
 <Skull className="w-3 h-3"/>
 Admitir Derrota
 </Button>
 </div>
 )}
 </CardContent>
 </Card>
 );
}

// ─────────────────────────────────────────────
// Waiting Card (pending, creator view)
// ─────────────────────────────────────────────

function WaitingCard({
 contract,
 profileMap,
}: {
 contract: BloodContract;
 profileMap: Map<string, Profile>;
}) {
 const opponent = profileMap.get(contract.opponentId);

 return (
 <Card className="border border-border transition-colors duration-200 hover:border-primary/30 opacity-70">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <Avatar className="w-7 h-7 ring-1 ring-border">
 <AvatarImage src={opponent?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px] font-mono">
 {getInitials(opponent?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="font-mono text-xs truncate">
 Esperando firma de <span className="font-bold">{opponent?.full_name ??"?"}</span>
 </p>
 <p className="font-mono text-[9px] text-muted-foreground tabular-nums">
 {contract.stake} XP &middot; {format(new Date(contract.deadline +"T12:00:00"),"d MMM yyyy", { locale: es })}
 </p>
 </div>
 <Badge variant="outline"className="font-mono text-[9px] gap-1">
 <Clock className="w-3 h-3"/>
 Pendiente
 </Badge>
 </div>
 </CardContent>
 </Card>
 );
}

// ─────────────────────────────────────────────
// Broken Contract Card (Muro de la Verguenza)
// ─────────────────────────────────────────────

function BrokenContractCard({
 contract,
 profileMap,
}: {
 contract: BloodContract;
 profileMap: Map<string, Profile>;
}) {
 const loserId = contract.winnerId === contract.creatorId ? contract.opponentId : contract.creatorId;
 const loser = profileMap.get(loserId);
 const winner = profileMap.get(contract.winnerId ??"");

 return (
 <Card className="border-red-600/20 border transition-colors duration-200 hover:border-red-600/40 bg-red-600/3">
 <CardContent className="p-4">
 <div className="flex items-center gap-3 mb-2">
 <div className="relative">
 <Avatar className="w-9 h-9 ring-1 ring-red-600/40 grayscale">
 <AvatarImage src={loser?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px] font-mono bg-red-600/10 text-red-600">
 {getInitials(loser?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <Skull className="w-4 h-4 text-red-600 absolute -bottom-1 -right-1"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="font-mono text-xs">
 <span className="font-bold text-red-600">{loser?.full_name ??"?"}</span>
 {" "}rompio su pacto contra{" "}
 <span className="font-bold">{winner?.full_name ??"?"}</span>
 </p>
 <p className="font-mono text-[9px] text-muted-foreground">
 Perdio {contract.stake} XP &middot; {contract.resolution}
 </p>
 </div>
 <Badge className="bg-red-600/10 text-red-600 border-red-600/20 font-mono text-[10px] tabular-nums">
 -{contract.stake} XP
 </Badge>
 </div>
 <div className="bg-red-50 dark:bg-red-950/20 border border-red-900/10 p-2">
 <p className="font-mono text-[9px] text-muted-foreground italic truncate">
 &quot;{contract.terms}&quot;
 </p>
 </div>
 </CardContent>
 </Card>
 );
}

// ─────────────────────────────────────────────
// Legendary Contract Card (Completed)
// ─────────────────────────────────────────────

function LegendaryContractCard({
 contract,
 profileMap,
}: {
 contract: BloodContract;
 profileMap: Map<string, Profile>;
}) {
 const winner = profileMap.get(contract.winnerId ??"");
 const creator = profileMap.get(contract.creatorId);
 const opponent = profileMap.get(contract.opponentId);

 return (
 <Card className="border-amber-600/20 border transition-colors duration-200 hover:border-amber-600/40 bg-amber-600/3">
 <CardContent className="p-4">
 <div className="flex items-center gap-3 mb-2">
 <div className="relative">
 <Avatar className="w-9 h-9 ring-1 ring-amber-600/40">
 <AvatarImage src={winner?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px] font-mono bg-amber-600/10 text-amber-700">
 {getInitials(winner?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <Trophy className="w-4 h-4 text-amber-600 absolute -bottom-1 -right-1"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="font-mono text-xs">
 <span className="font-bold text-amber-700 dark:text-amber-400">{winner?.full_name ??"?"}</span>
 {" "}gano el pacto
 </p>
 <p className="font-mono text-[9px] text-muted-foreground">
 {creator?.full_name ??"?"} vs {opponent?.full_name ??"?"} &middot; +{contract.stake} XP
 </p>
 </div>
 <Badge className="bg-amber-600/10 text-amber-700 dark:text-amber-400 border-amber-600/20 font-mono text-[10px] tabular-nums">
 +{contract.stake} XP
 </Badge>
 </div>
 <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-900/10 p-2">
 <p className="font-mono text-[9px] text-muted-foreground italic truncate">
 &quot;{contract.terms}&quot;
 </p>
 </div>
 </CardContent>
 </Card>
 );
}
