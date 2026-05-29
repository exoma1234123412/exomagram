"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getInitials, cn } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 ScrollText,
 Users,
 AlertTriangle,
 Shield,
 ArrowDown,
 Link2,
 Crown,
 Loader2,
 Trash2,
 ChevronRight,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface TeamMember {
 user_id: string;
 profile: Profile;
}

interface InheritanceDesignation {
 heirId: string;
 percentage: number;
 createdAt: string;
}

interface InheritanceEvent {
 type:"created"|"updated"|"removed";
 fromId: string;
 toId: string;
 percentage: number;
 timestamp: string;
}

const PERCENTAGE_OPTIONS = [
 { value: 25, label:"25%"},
 { value: 50, label:"50%"},
 { value: 75, label:"75%"},
 { value: 100, label:"100%"},
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getStorageKey(orgId: string, userId: string) {
 return`exomagram_inheritance_${orgId}_${userId}`;
}

function getEventsKey(orgId: string) {
 return`exomagram_inheritance_events_${orgId}`;
}

function getAllDesignations(orgId: string, memberIds: string[]): Map<string, InheritanceDesignation> {
 const map = new Map<string, InheritanceDesignation>();
 for (const uid of memberIds) {
 const key = getStorageKey(orgId, uid);
 try {
 const raw = localStorage.getItem(key);
 if (raw) {
 const parsed = JSON.parse(raw) as InheritanceDesignation;
 map.set(uid, parsed);
 }
 } catch {
 // ignore corrupt data
 }
 }
 return map;
}

function getEvents(orgId: string): InheritanceEvent[] {
 try {
 const raw = localStorage.getItem(getEventsKey(orgId));
 return raw ? (JSON.parse(raw) as InheritanceEvent[]) : [];
 } catch {
 return [];
 }
}

function saveEvent(orgId: string, event: InheritanceEvent) {
 const events = getEvents(orgId);
 events.unshift(event);
 localStorage.setItem(getEventsKey(orgId), JSON.stringify(events.slice(0, 50)));
}

function formatEventDate(iso: string): string {
 const d = new Date(iso);
 return d.toLocaleDateString("es-MX", {
 day:"numeric",
 month:"short",
 year:"numeric",
 hour:"2-digit",
 minute:"2-digit",
 });
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function InheritancePage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
 const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
 const [trustScores, setTrustScores] = useState<Map<string, number>>(new Map());
 const [myDesignation, setMyDesignation] = useState<InheritanceDesignation | null>(null);
 const [allDesignations, setAllDesignations] = useState<Map<string, InheritanceDesignation>>(new Map());
 const [events, setEvents] = useState<InheritanceEvent[]>([]);
 const [loading, setLoading] = useState(true);

 // Form state
 const [selectedHeir, setSelectedHeir] = useState<string>("");
 const [selectedPercentage, setSelectedPercentage] = useState<number>(50);
 const [saving, setSaving] = useState(false);

 const loadData = useCallback(async () => {
 if (!orgId || !userId) return;

 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(id, full_name, avatar_url, email)")
 .eq("org_id", orgId);

 const pMap = new Map<string, Profile>();
 const team: TeamMember[] = [];
 const memberIds: string[] = [];

 for (const m of members ?? []) {
 if (m.profiles) {
 const p = m.profiles as unknown as Profile;
 pMap.set(m.user_id, p);
 memberIds.push(m.user_id);
 if (m.user_id !== userId) {
 team.push({ user_id: m.user_id, profile: p });
 }
 }
 }
 setTeamMembers(team);
 setProfileMap(pMap);

 const scores = new Map<string, number>();
 const scorePromises = memberIds.map(async (uid) => {
 const { data } = await supabase
 .from("trust_score_history")
 .select("score")
 .eq("user_id", uid)
 .eq("org_id", orgId)
 .order("date", { ascending: false })
 .limit(1)
 .single();
 if (data) scores.set(uid, data.score);
 });
 await Promise.all(scorePromises);
 setTrustScores(scores);

 const designations = getAllDesignations(orgId, memberIds);
 setAllDesignations(designations);

 const mine = designations.get(userId) ?? null;
 setMyDesignation(mine);
 if (mine) {
 setSelectedHeir(mine.heirId);
 setSelectedPercentage(mine.percentage);
 }

 setEvents(getEvents(orgId));
 setLoading(false);
 }, [orgId, userId, supabase]);

 useEffect(() => {
 if (orgLoading) return;
 loadData();
 }, [orgLoading, loadData]);

 // ─────────────────────────────────────────
 // Actions
 // ─────────────────────────────────────────

 function handleSave() {
 if (!orgId || !userId || !selectedHeir) return;
 setSaving(true);

 const designation: InheritanceDesignation = {
 heirId: selectedHeir,
 percentage: selectedPercentage,
 createdAt: new Date().toISOString(),
 };

 localStorage.setItem(getStorageKey(orgId, userId), JSON.stringify(designation));

 const eventType = myDesignation ?"updated":"created";
 saveEvent(orgId, {
 type: eventType,
 fromId: userId,
 toId: selectedHeir,
 percentage: selectedPercentage,
 timestamp: new Date().toISOString(),
 });

 setMyDesignation(designation);
 setAllDesignations((prev) => {
 const next = new Map(prev);
 next.set(userId, designation);
 return next;
 });
 setEvents(getEvents(orgId));
 setSaving(false);
 }

 function handleRemove() {
 if (!orgId || !userId || !myDesignation) return;

 localStorage.removeItem(getStorageKey(orgId, userId));

 saveEvent(orgId, {
 type:"removed",
 fromId: userId,
 toId: myDesignation.heirId,
 percentage: myDesignation.percentage,
 timestamp: new Date().toISOString(),
 });

 setMyDesignation(null);
 setSelectedHeir("");
 setSelectedPercentage(50);
 setAllDesignations((prev) => {
 const next = new Map(prev);
 next.delete(userId);
 return next;
 });
 setEvents(getEvents(orgId));
 }

 // ─────────────────────────────────────────
 // Derived data
 // ─────────────────────────────────────────

 const myInheritors = Array.from(allDesignations.entries())
 .filter(([, d]) => d.heirId === userId)
 .map(([fromId, d]) => ({ fromId, ...d }));

 const heirTrustScore = myDesignation ? trustScores.get(myDesignation.heirId) : null;
 const heirRiskLevel:"low"|"medium"|"high"| null =
 heirTrustScore == null
 ? null
 : heirTrustScore >= 70
 ?"low": heirTrustScore >= 40
 ?"medium":"high";

 // Build chains of responsibility
 const chains: { members: string[]; percentages: number[] }[] = [];
 const visited = new Set<string>();
 for (const [startId] of allDesignations) {
 if (visited.has(startId)) continue;
 const chain: string[] = [startId];
 const percentages: number[] = [];
 let current = startId;
 const localVisited = new Set<string>([startId]);

 while (allDesignations.has(current)) {
 const d = allDesignations.get(current)!;
 percentages.push(d.percentage);
 const next = d.heirId;
 if (localVisited.has(next)) break;
 chain.push(next);
 localVisited.add(next);
 current = next;
 }

 if (chain.length >= 2) {
 chains.push({ members: chain, percentages });
 for (const id of chain) visited.add(id);
 }
 }

 // ─────────────────────────────────────────
 // Render helpers
 // ─────────────────────────────────────────

 function MemberAvatar({ uid, size ="md"}: { uid: string; size?:"sm"|"md"|"lg"}) {
 const profile = profileMap.get(uid);
 const sizeClasses = size ==="sm"?"w-8 h-8": size ==="lg"?"w-14 h-14":"w-10 h-10";
 const textSize = size ==="sm"?"text-xs": size ==="lg"?"text-lg":"text-sm";

 return (
 <Avatar className={cn(sizeClasses,"ring-1 ring-border")}>
 <AvatarImage src={profile?.avatar_url ?? undefined} />
 <AvatarFallback className={cn(textSize,"font-mono")}>
 {getInitials(profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 );
 }

 function getName(uid: string): string {
 return profileMap.get(uid)?.full_name ??"Desconocido";
 }

 // ─────────────────────────────────────────
 // Loading / empty
 // ─────────────────────────────────────────

 if (loading || orgLoading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </div>
 </div>
 );
 }

 if (!orgId) {
 return (
 <div className="flex items-center justify-center h-screen">
 <p className="text-muted-foreground font-mono text-xs">Sin organizacion</p>
 </div>
 );
 }

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <div className="flex items-center gap-3 mb-1">
 <ScrollText className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Herencia Digital
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground ml-8">
 Designa un heredero para tu Trust Score, rachas y XP
 </p>
 </div>

 {/* My Testament */}
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
 <Crown className="w-3 h-3"/>
 MI TESTAMENTO DIGITAL
 </p>

 <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="pt-6">
 {myDesignation ? (
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <MemberAvatar uid={myDesignation.heirId} size="lg"/>
 <div>
 <p className="font-mono font-medium text-sm">{getName(myDesignation.heirId)}</p>
 <p className="text-xs font-mono text-muted-foreground">Heredero designado</p>
 </div>
 </div>
 <Badge
 variant="secondary"className="bg-amber-500/10 text-amber-700 border border-amber-500/20 text-lg font-mono tabular-nums px-3 py-1">
 {myDesignation.percentage}%
 </Badge>
 </div>

 {/* Risk warning */}
 {heirRiskLevel ==="high"&& (
 <div className="bg-destructive/5 border border-destructive/20 p-3 flex items-start gap-2">
 <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0"/>
 <div>
 <p className="text-xs font-mono font-medium text-destructive uppercase">Riesgo alto de herencia</p>
 <p className="text-xs text-muted-foreground mt-1">
 Tu heredero tiene un Trust Score de{" "}
 <span className="font-mono tabular-nums font-medium">{heirTrustScore}</span>.
 Si su rendimiento baja, tus puntajes historicos tambien decaeran.
 </p>
 </div>
 </div>
 )}
 {heirRiskLevel ==="medium"&& (
 <div className="bg-amber-500/5 border border-amber-500/20 p-3 flex items-start gap-2">
 <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0"/>
 <div>
 <p className="text-xs font-mono font-medium text-amber-700 uppercase">Riesgo moderado</p>
 <p className="text-xs text-muted-foreground mt-1">
 Trust Score del heredero:{" "}
 <span className="font-mono tabular-nums font-medium">{heirTrustScore}</span>.
 Monitorea su rendimiento.
 </p>
 </div>
 </div>
 )}

 {/* Edit form */}
 <div className="pt-3 border-t border-border space-y-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Modificar testamento
 </p>
 <div className="flex gap-3">
 <Select value={selectedHeir} onValueChange={(v) => v && setSelectedHeir(v)}>
 <SelectTrigger className="flex-1">
 <SelectValue placeholder="Elegir heredero"/>
 </SelectTrigger>
 <SelectContent>
 {teamMembers.map((m) => (
 <SelectItem key={m.user_id} value={m.user_id}>
 {m.profile.full_name ?? m.profile.email}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Select
 value={String(selectedPercentage)}
 onValueChange={(v) => v && setSelectedPercentage(Number(v))}
 >
 <SelectTrigger className="w-28">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {PERCENTAGE_OPTIONS.map((opt) => (
 <SelectItem key={opt.value} value={String(opt.value)}>
 {opt.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="flex gap-2">
 <Button
 onClick={handleSave}
 disabled={!selectedHeir || saving}
 className="bg-primary font-mono text-xs">
 {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin"/>}
 Actualizar
 </Button>
 <Button
 variant="outline"onClick={handleRemove}
 className="font-mono text-xs text-destructive hover:text-destructive">
 <Trash2 className="w-4 h-4 mr-2"/>
 Revocar
 </Button>
 </div>
 </div>
 </div>
 ) : (
 /* No designation yet */
 <div className="space-y-4">
 <div className="flex items-center gap-3 mb-2">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <ScrollText className="w-8 h-8 text-primary"/>
 </div>
 <div>
 <p className="font-mono font-medium text-sm">Sin heredero designado</p>
 <p className="text-xs font-mono text-muted-foreground">
 Elige a quien heredara tu Trust Score, rachas y XP si te ausentas
 </p>
 </div>
 </div>

 <div className="flex gap-3">
 <Select value={selectedHeir} onValueChange={(v) => v && setSelectedHeir(v)}>
 <SelectTrigger className="flex-1">
 <SelectValue placeholder="Elegir heredero"/>
 </SelectTrigger>
 <SelectContent>
 {teamMembers.map((m) => (
 <SelectItem key={m.user_id} value={m.user_id}>
 {m.profile.full_name ?? m.profile.email}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Select
 value={String(selectedPercentage)}
 onValueChange={(v) => v && setSelectedPercentage(Number(v))}
 >
 <SelectTrigger className="w-28">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {PERCENTAGE_OPTIONS.map((opt) => (
 <SelectItem key={opt.value} value={String(opt.value)}>
 {opt.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <Button
 onClick={handleSave}
 disabled={!selectedHeir || saving}
 className="bg-primary font-mono text-xs">
 {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin"/>}
 Designar heredero
 </Button>
 </div>
 )}
 </CardContent>
 </Card>
 </section>

 {/* Riesgo de Herencia */}
 {myDesignation && heirTrustScore != null && (
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
 <Shield className="w-3 h-3"/>
 RIESGO DE HERENCIA
 </p>
 <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="pt-6">
 <div className="flex items-center justify-between mb-3">
 <span className="text-xs font-mono text-muted-foreground">
 Trust Score de {getName(myDesignation.heirId)}
 </span>
 <span className="text-2xl font-mono font-bold tabular-nums tracking-tight">
 {heirTrustScore}
 </span>
 </div>
 <div className="w-full h-2 bg-accent/30 border border-border overflow-hidden">
 <div
 className={cn(
"h-full transition-all duration-500",
 heirRiskLevel ==="low"&&"bg-emerald-500",
 heirRiskLevel ==="medium"&&"bg-amber-500",
 heirRiskLevel ==="high"&&"bg-red-500")}
 style={{ width:`${Math.min(100, Math.max(0, heirTrustScore))}%`}}
 />
 </div>
 <div className="flex justify-between mt-2 text-[10px] font-mono text-muted-foreground">
 <span>Riesgo alto</span>
 <span>Seguro</span>
 </div>
 <p className="text-xs font-mono text-muted-foreground mt-3">
 Herencia al <span className="font-medium tabular-nums">{myDesignation.percentage}%</span>
 {" "}&mdash; si el Trust Score de tu heredero baja,
 tus puntajes historicos decaeran proporcionalmente.
 </p>
 </CardContent>
 </Card>
 </section>
 )}

 {/* Herederos - people who designated me */}
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
 <Users className="w-3 h-3"/>
 HEREDEROS
 {myInheritors.length > 0 && (
 <span className="font-mono tabular-nums text-muted-foreground">
 ({myInheritors.length})
 </span>
 )}
 </p>

 {myInheritors.length === 0 ? (
 <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="pt-6">
 <div className="flex flex-col items-center text-center py-6">
 <div className="w-16 h-16 border border-border flex items-center justify-center mb-3">
 <Users className="w-8 h-8 text-primary"/>
 </div>
 <p className="text-muted-foreground text-xs font-mono">
 Nadie te ha designado como heredero aun
 </p>
 </div>
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-2">
 {myInheritors.map((inheritor) => {
 const score = trustScores.get(inheritor.fromId);
 return (
 <Card
 key={inheritor.fromId}
 className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="pt-4 pb-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <MemberAvatar uid={inheritor.fromId} />
 <div>
 <p className="font-mono font-medium text-sm">{getName(inheritor.fromId)}</p>
 <p className="text-xs font-mono text-muted-foreground">
 Trust Score:{" "}
 <span className="tabular-nums font-medium">
 {score ??"—"}
 </span>
 </p>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-24 h-2 bg-accent/30 border border-border overflow-hidden">
 <div
 className="h-full bg-amber-500"style={{ width:`${inheritor.percentage}%`}}
 />
 </div>
 <Badge
 variant="outline"className="border-amber-500/30 text-amber-700 font-mono tabular-nums text-xs">
 {inheritor.percentage}%
 </Badge>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 )}
 </section>

 {/* Cadena de Responsabilidad */}
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
 <Link2 className="w-3 h-3"/>
 CADENA DE RESPONSABILIDAD
 </p>

 {chains.length === 0 ? (
 <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="pt-6">
 <div className="flex flex-col items-center text-center py-6">
 <div className="w-16 h-16 border border-border flex items-center justify-center mb-3">
 <Link2 className="w-8 h-8 text-primary"/>
 </div>
 <p className="text-muted-foreground text-xs font-mono">
 No hay cadenas de herencia formadas
 </p>
 <p className="text-[10px] font-mono text-muted-foreground mt-1">
 Las cadenas se forman cuando los miembros designan herederos
 </p>
 </div>
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-3">
 {chains.map((chain, ci) => (
 <Card
 key={ci}
 className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="pt-5 pb-5">
 <div className="flex items-center flex-wrap gap-2">
 {chain.members.map((uid, mi) => {
 const isMe = uid === userId;
 return (
 <div key={uid} className="flex items-center gap-2">
 <div
 className={cn(
"flex items-center gap-2 px-3 py-2 border transition-colors",
 isMe
 ?"border-amber-500/40 bg-amber-500/5":"border-border bg-accent/20")}
 >
 <MemberAvatar uid={uid} size="sm"/>
 <div className="min-w-0">
 <p className={cn(
"text-xs font-mono font-medium truncate max-w-[100px]",
 isMe &&"text-amber-700")}>
 {isMe ?"Tu": getName(uid)}
 </p>
 <p className="text-[10px] font-mono text-muted-foreground tabular-nums">
 TS: {trustScores.get(uid) ??"—"}
 </p>
 </div>
 </div>
 {mi < chain.members.length - 1 && (
 <div className="flex flex-col items-center">
 <ChevronRight className="w-4 h-4 text-amber-500"/>
 <span className="text-[9px] font-mono text-amber-600/70 tabular-nums font-medium">
 {chain.percentages[mi]}%
 </span>
 </div>
 )}
 </div>
 );
 })}
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 )}
 </section>

 {/* Historial de Herencia */}
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
 <ScrollText className="w-3 h-3"/>
 HISTORIAL DE HERENCIA
 </p>

 {events.length === 0 ? (
 <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="pt-6">
 <div className="flex flex-col items-center text-center py-6">
 <div className="w-16 h-16 border border-border flex items-center justify-center mb-3">
 <ScrollText className="w-8 h-8 text-primary"/>
 </div>
 <p className="text-muted-foreground text-xs font-mono">
 Sin eventos de herencia registrados
 </p>
 </div>
 </CardContent>
 </Card>
 ) : (
 <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="pt-5">
 <div className="space-y-3">
 {events.map((event, i) => (
 <div
 key={`${event.timestamp}-${i}`}
 className="flex items-start gap-3 pb-3 border-b border-border/30 last:border-0 last:pb-0">
 <div
 className={cn(
"w-8 h-8 border flex items-center justify-center shrink-0 mt-0.5",
 event.type ==="created"&&"border-emerald-500/30 bg-emerald-500/5",
 event.type ==="updated"&&"border-amber-500/30 bg-amber-500/5",
 event.type ==="removed"&&"border-red-500/30 bg-red-500/5")}
 >
 {event.type ==="created"&& (
 <ScrollText className="w-4 h-4 text-emerald-600"/>
 )}
 {event.type ==="updated"&& (
 <ArrowDown className="w-4 h-4 text-amber-600"/>
 )}
 {event.type ==="removed"&& (
 <Trash2 className="w-4 h-4 text-red-500"/>
 )}
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-xs font-mono">
 {event.type ==="created"&& (
 <>
 <span className="font-medium">{getName(event.fromId)}</span>
 {"designo a"}
 <span className="font-medium">{getName(event.toId)}</span>
 {"como heredero"}
 </>
 )}
 {event.type ==="updated"&& (
 <>
 <span className="font-medium">{getName(event.fromId)}</span>
 {"actualizo su testamento a"}
 <span className="font-medium">{getName(event.toId)}</span>
 </>
 )}
 {event.type ==="removed"&& (
 <>
 <span className="font-medium">{getName(event.fromId)}</span>
 {"revoco la herencia de"}
 <span className="font-medium">{getName(event.toId)}</span>
 </>
 )}
 </p>
 <div className="flex items-center gap-2 mt-1">
 <Badge variant="outline"className="text-[10px] font-mono tabular-nums">
 {event.percentage}%
 </Badge>
 <span className="text-[10px] font-mono text-muted-foreground">
 {formatEventDate(event.timestamp)}
 </span>
 </div>
 </div>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>
 )}
 </section>
 </div>
 );
}
