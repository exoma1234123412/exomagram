"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY, formatHour, timeAgo } from "@/lib/utils";
import type { Profile, TimeEntry } from "@/lib/types/database";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
 Eye,
 EyeOff,
 Shield,
 ShieldAlert,
 ShieldCheck,
 ShieldX,
 Lock,
 Unlock,
 AlertTriangle,
 ArrowUp,
 ArrowDown,
 Minus,
 Radio,
 Activity,
 Users,
 Scan,
 Camera,
 FileWarning,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

type TransparencyTier = 1 | 2 | 3 | 4;

interface TierConfig {
 level: TransparencyTier;
 name: string;
 label: string;
 description: string;
 visibleData: string[];
 restrictions: string[];
 howToMoveUp: string;
 color: string;
 textColor: string;
 borderColor: string;
 bgColor: string;
 bgAccent: string;
 iconBg: string;
}

interface MemberTransparency {
 userId: string;
 profile: Profile | null;
 trustScore: number;
 tier: TransparencyTier;
 previousTier: TransparencyTier | null;
 recentEntries: TimeEntry[];
 liveStatus: string | null;
 currentTask: string | null;
 lastHeartbeat: string | null;
}

interface TierMovement {
 userId: string;
 name: string;
 from: TransparencyTier;
 to: TransparencyTier;
 direction:"up"|"down";
 date: string;
}

/* ------------------------------------------------------------------ */
/* Tier configuration */
/* ------------------------------------------------------------------ */

const TIERS: Record<TransparencyTier, TierConfig> = {
 4: {
 level: 4,
 name:"AUTONOMO",
 label:"Nivel 4 — AUTONOMO",
 description:"Solo resumen diario compartido. Privacidad ganada.",
 visibleData: ["Resumen diario","Trust Score"],
 restrictions: ["Ninguna"],
 howToMoveUp:"Ya estas en el nivel maximo. Manten tu Trust Score >90.",
 color:"text-green-500",
 textColor:"text-green-500",
 borderColor:"border-green-500/30",
 bgColor:"bg-green-500/5",
 bgAccent:"bg-green-500/10",
 iconBg:"bg-green-500/10",
 },
 3: {
 level: 3,
 name:"MONITOREADO",
 label:"Nivel 3 — MONITOREADO",
 description:"Entradas por hora visibles para el equipo.",
 visibleData: ["Entradas por hora","Categorias","Trust Score","Resumen diario"],
 restrictions: ["Entradas visibles para todos"],
 howToMoveUp:"Sube tu Trust Score a >90 para alcanzar AUTONOMO.",
 color:"text-blue-500",
 textColor:"text-blue-500",
 borderColor:"border-blue-500/30",
 bgColor:"bg-blue-500/5",
 bgAccent:"bg-blue-500/10",
 iconBg:"bg-blue-500/10",
 },
 2: {
 level: 2,
 name:"VIGILADO",
 label:"Nivel 2 — VIGILADO",
 description:"Entradas + evidencia visible para todos. Bajo observacion.",
 visibleData: [
"Entradas por hora",
"Evidencia/pruebas",
"Categorias",
"Links adjuntos",
"Trust Score",
 ],
 restrictions: [
"Toda la evidencia es publica",
"Entradas revisadas automaticamente",
 ],
 howToMoveUp:"Sube tu Trust Score a >70 para pasar a MONITOREADO.",
 color:"text-amber-500",
 textColor:"text-amber-500",
 borderColor:"border-amber-500/40",
 bgColor:"bg-amber-500/5",
 bgAccent:"bg-amber-500/10",
 iconBg:"bg-amber-500/10",
 },
 1: {
 level: 1,
 name:"EXPUESTO",
 label:"Nivel 1 — EXPUESTO",
 description:
"Todo visible. Status en vivo, notificaciones entrada por entrada, evidencia obligatoria.",
 visibleData: [
"Entradas en tiempo real",
"Status en vivo",
"Evidencia obligatoria",
"Notificaciones por cada entrada",
"Historial completo",
"Trust Score",
 ],
 restrictions: [
"Evidencia obligatoria en cada entrada",
"Notificacion publica por cada registro",
"Status en vivo transmitido",
"Sin privacidad alguna",
 ],
 howToMoveUp:"Sube tu Trust Score a >50 para escapar de EXPUESTO.",
 color:"text-red-500",
 textColor:"text-red-500",
 borderColor:"border-red-500/50",
 bgColor:"bg-red-500/5",
 bgAccent:"bg-red-500/10",
 iconBg:"bg-red-500/15",
 },
};

function getTier(score: number): TransparencyTier {
 if (score > 90) return 4;
 if (score >= 70) return 3;
 if (score >= 50) return 2;
 return 1;
}

function getTierIcon(tier: TransparencyTier) {
 switch (tier) {
 case 4:
 return ShieldCheck;
 case 3:
 return Eye;
 case 2:
 return ShieldAlert;
 case 1:
 return ShieldX;
 }
}

/* ------------------------------------------------------------------ */
/* Live pulse indicator for EXPUESTO members */
/* ------------------------------------------------------------------ */

function LivePulse({ status }: { status: string | null }) {
 if (!status || status ==="offline") return null;
 return (
 <span className="flex items-center gap-1">
 <span className="relative flex h-2 w-2">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"/>
 <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"/>
 </span>
 <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-red-500">
 EN VIVO
 </span>
 </span>
 );
}

/* ------------------------------------------------------------------ */
/* Page */
/* ------------------------------------------------------------------ */

export default function TransparencyPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [members, setMembers] = useState<MemberTransparency[]>([]);
 const [movements, setMovements] = useState<TierMovement[]>([]);
 const [loading, setLoading] = useState(true);
 const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

 /* ---------- data loader ---------- */

 const loadData = useCallback(async () => {
 if (!orgId) return;

 const today = getTodayMTY();

 // 1. All org members with profiles
 const { data: orgMembers } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 if (!orgMembers) {
 setLoading(false);
 return;
 }

 const profileMap = new Map<string, Profile>();
 const userIds: string[] = [];
 for (const m of orgMembers) {
 userIds.push(m.user_id);
 if (m.profiles)
 profileMap.set(m.user_id, m.profiles as unknown as Profile);
 }

 // 2. Latest trust score for each member (most recent date)
 const { data: trustScores } = await supabase
 .from("trust_score_history")
 .select("user_id, score, date")
 .eq("org_id", orgId)
 .order("date", { ascending: false });

 // Build map: user_id -> latest score
 const latestScoreMap = new Map<string, number>();
 for (const ts of trustScores ?? []) {
 if (!latestScoreMap.has(ts.user_id)) {
 latestScoreMap.set(ts.user_id, ts.score);
 }
 }

 // 3. Trust score history for tier movements (last 7 days)
 const sevenDaysAgo = new Date();
 sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
 const sevenDaysStr = sevenDaysAgo.toISOString().split("T")[0];

 // Build previous tier map from 7 days ago
 const prevScoreMap = new Map<string, number>();
 for (const ts of trustScores ?? []) {
 if (ts.date <= sevenDaysStr && !prevScoreMap.has(ts.user_id)) {
 prevScoreMap.set(ts.user_id, ts.score);
 }
 }

 // 4. Today's time entries for EXPUESTO members (live feed)
 const { data: todayEntries } = await supabase
 .from("time_entries")
 .select("*")
 .eq("org_id", orgId)
 .eq("date", today)
 .order("hour", { ascending: false });

 // 5. Live status for all members
 const { data: liveStatuses } = await supabase
 .from("live_status")
 .select("user_id, status, current_task, last_heartbeat")
 .eq("org_id", orgId);

 const liveMap = new Map<
 string,
 { status: string; task: string | null; heartbeat: string | null }
 >();
 for (const ls of liveStatuses ?? []) {
 liveMap.set(ls.user_id, {
 status: ls.status,
 task: ls.current_task,
 heartbeat: ls.last_heartbeat,
 });
 }

 // Build member list
 const result: MemberTransparency[] = userIds.map((uid) => {
 const score = latestScoreMap.get(uid) ?? 50;
 const prevScore = prevScoreMap.get(uid);
 const tier = getTier(score);
 const previousTier = prevScore !== undefined ? getTier(prevScore) : null;
 const live = liveMap.get(uid);

 // Recent entries for this user today
 const userEntries = (todayEntries ?? []).filter(
 (e) => e.user_id === uid
 );

 return {
 userId: uid,
 profile: profileMap.get(uid) ?? null,
 trustScore: score,
 tier,
 previousTier,
 recentEntries: userEntries as TimeEntry[],
 liveStatus: live?.status ?? null,
 currentTask: live?.task ?? null,
 lastHeartbeat: live?.heartbeat ?? null,
 };
 });

 // Sort: lowest trust first (most exposed at top)
 result.sort((a, b) => a.trustScore - b.trustScore);

 // Tier movements
 const mvts: TierMovement[] = [];
 for (const m of result) {
 if (m.previousTier !== null && m.previousTier !== m.tier) {
 mvts.push({
 userId: m.userId,
 name: m.profile?.full_name ??"Sin nombre",
 from: m.previousTier,
 to: m.tier,
 direction: m.tier > m.previousTier ?"up":"down",
 date: today,
 });
 }
 }
 mvts.sort((a, b) => {
 // Downgrades first (more dramatic)
 if (a.direction !== b.direction) return a.direction ==="down"? -1 : 1;
 return 0;
 });

 setMembers(result);
 setMovements(mvts);
 setLoading(false);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 /* ---------- initial load + auto-refresh ---------- */

 useEffect(() => {
 if (orgLoading || !orgId) {
 if (!orgLoading) setLoading(false);
 return;
 }

 loadData();

 intervalRef.current = setInterval(loadData, 30_000);
 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [orgLoading, orgId, loadData]);

 /* ---------- real-time subscription ---------- */

 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("transparency-live")
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"time_entries",
 filter:`org_id=eq.${orgId}`,
 },
 () => loadData()
 )
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"live_status",
 filter:`org_id=eq.${orgId}`,
 },
 () => loadData()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

 /* ---------- loading state ---------- */

 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 CARGANDO...
 </p>
 </div>
 );
 }

 /* ---------- computed stats ---------- */

 const tierCounts: Record<TransparencyTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
 for (const m of members) {
 tierCounts[m.tier]++;
 }

 const mostExposed =
 members.length > 0 ? members[0] : null;
 const mostAutonomous =
 members.length > 0 ? members[members.length - 1] : null;

 const tierOrder: TransparencyTier[] = [1, 2, 3, 4];

 /* ---------- render ---------- */

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-2.5 mb-1">
 <Eye className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Transparencia Escalonada
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground mb-8">
 Trust Score determina tu nivel de privacidad. Confianza alta = mas
 autonomia. Confianza baja = exposicion total.
 </p>

 {/* Stat strip */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
 <div className="bg-red-500/10 border border-red-500/30 p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/60">
 Mas expuesto
 </p>
 <p className="text-sm font-mono font-bold tracking-tight mt-1 text-red-500 truncate">
 {mostExposed?.profile?.full_name ??"---"}
 </p>
 <p className="font-mono text-[9px] tabular-nums text-red-500/50 mt-0.5">
 Trust: {mostExposed?.trustScore ??"---"}
 </p>
 </div>
 <div className="bg-green-500/10 border border-green-500/30 p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-green-500/60">
 Mas autonomo
 </p>
 <p className="text-sm font-mono font-bold tracking-tight mt-1 text-green-500 truncate">
 {mostAutonomous?.profile?.full_name ??"---"}
 </p>
 <p className="font-mono text-[9px] tabular-nums text-green-500/50 mt-0.5">
 Trust: {mostAutonomous?.trustScore ??"---"}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Miembros
 </p>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 flex items-center gap-1.5">
 <Users className="w-4 h-4 text-muted-foreground"/>
 {members.length}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Movimientos 7d
 </p>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 flex items-center gap-1.5">
 <Activity className="w-4 h-4 text-muted-foreground"/>
 {movements.length}
 </p>
 </div>
 </div>

 {/* Tier movements */}
 {movements.length > 0 && (
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Movimientos de nivel recientes
 </p>
 <div className="space-y-1">
 {movements.map((mv) => {
 const isDown = mv.direction ==="down";
 return (
 <div
 key={mv.userId}
 className={cn(
"flex items-center gap-2 px-3 py-2 border",
 isDown
 ?"border-red-500/30 bg-red-500/5":"border-green-500/30 bg-green-500/5")}
 >
 {isDown ? (
 <ArrowDown className="w-3.5 h-3.5 text-red-500 shrink-0"/>
 ) : (
 <ArrowUp className="w-3.5 h-3.5 text-green-500 shrink-0"/>
 )}
 <span className="font-mono text-xs font-bold truncate">
 {mv.name}
 </span>
 <span className="font-mono text-[10px] text-muted-foreground">
 {TIERS[mv.from].name}
 </span>
 <Minus className="w-3 h-3 text-muted-foreground shrink-0"/>
 <span
 className={cn(
"font-mono text-[10px] font-bold",
 isDown ?"text-red-500":"text-green-500")}
 >
 {TIERS[mv.to].name}
 </span>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Tier visualization — each tier as a horizontal band */}
 {tierOrder.map((tierLevel) => {
 const config = TIERS[tierLevel];
 const tierMembers = members.filter((m) => m.tier === tierLevel);
 const TierIcon = getTierIcon(tierLevel);

 if (tierMembers.length === 0) {
 return (
 <div key={tierLevel} className="mb-6">
 {/* Tier header */}
 <div
 className={cn(
"flex items-center gap-2 px-3 py-2 border-b",
 config.borderColor
 )}
 >
 <TierIcon className={cn("w-4 h-4", config.textColor)} />
 <span
 className={cn(
"font-mono text-[10px] font-bold tracking-[0.15em] uppercase",
 config.textColor
 )}
 >
 {config.label}
 </span>
 <span className="font-mono text-[9px] text-muted-foreground ml-auto">
 0 miembros
 </span>
 </div>
 <div
 className={cn(
"px-3 py-6 text-center border-x border-b",
 config.borderColor,
 config.bgColor
 )}
 >
 <p className="font-mono text-[10px] text-muted-foreground">
 Nadie en este nivel.
 </p>
 </div>
 </div>
 );
 }

 return (
 <div key={tierLevel} className="mb-6">
 {/* Tier header */}
 <div
 className={cn(
"flex items-center gap-2 px-3 py-2 border-b",
 config.borderColor
 )}
 >
 <TierIcon className={cn("w-4 h-4", config.textColor)} />
 <span
 className={cn(
"font-mono text-[10px] font-bold tracking-[0.15em] uppercase",
 config.textColor
 )}
 >
 {config.label}
 </span>
 <span className="font-mono text-[9px] text-muted-foreground ml-auto">
 {tierMembers.length}{""}
 {tierMembers.length === 1 ?"miembro":"miembros"}
 </span>
 </div>

 {/* Tier description */}
 <div
 className={cn(
"px-3 py-2 border-x",
 config.borderColor,
 config.bgColor
 )}
 >
 <p className="font-mono text-[9px] text-muted-foreground">
 {config.description}
 </p>
 <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
 <div>
 <span className="font-mono text-[8px] tracking-[0.15em] uppercase text-muted-foreground">
 VISIBLE:
 </span>
 {config.visibleData.map((v) => (
 <span
 key={v}
 className="font-mono text-[9px] text-muted-foreground ml-1.5">
 {v}
 </span>
 ))}
 </div>
 </div>
 </div>

 {/* Members */}
 <div
 className={cn(
"border-x border-b divide-y divide-border/30",
 config.borderColor
 )}
 >
 {tierMembers.map((m) => {
 const isMe = m.userId === userId;
 const isExpuesto = m.tier === 1;
 const isVigilado = m.tier === 2;
 const isMonitoreado = m.tier === 3;
 const isAutonomo = m.tier === 4;

 // Movement indicator
 const moved =
 m.previousTier !== null && m.previousTier !== m.tier;
 const movedUp =
 moved && m.previousTier !== null && m.tier > m.previousTier;

 // Card size scales inversely with trust — lower trust = bigger, more exposed
 const paddingClass = cn(
 isExpuesto &&"p-4 sm:p-5",
 isVigilado &&"p-3 sm:p-4",
 isMonitoreado &&"p-3",
 isAutonomo &&"px-3 py-2");

 const nameClass = cn(
"font-mono font-bold tracking-tight",
 isExpuesto &&"text-base sm:text-lg text-red-500",
 isVigilado &&"text-sm sm:text-base text-amber-500",
 isMonitoreado &&"text-sm text-foreground",
 isAutonomo &&"text-sm text-foreground");

 const scoreClass = cn(
"font-mono font-black tabular-nums tracking-tight",
 isExpuesto &&"text-2xl sm:text-3xl text-red-500",
 isVigilado &&"text-xl sm:text-2xl text-amber-500",
 isMonitoreado &&"text-lg text-blue-500",
 isAutonomo &&"text-base text-green-500");

 const avatarClass = cn(
"ring-1 ring-border shrink-0",
 isExpuesto &&
"w-12 h-12 sm:w-14 sm:h-14 ring-red-500/40",
 isVigilado &&"w-10 h-10 sm:w-11 sm:h-11 ring-amber-500/30",
 isMonitoreado &&"w-9 h-9 ring-blue-500/20",
 isAutonomo &&"w-8 h-8");

 return (
 <div
 key={m.userId}
 className={cn(
 paddingClass,
 config.bgColor,
 isExpuesto &&"bg-red-500/5")}
 >
 {/* Top row */}
 <div className="flex items-start gap-3">
 <Avatar className={avatarClass}>
 <AvatarImage
 src={m.profile?.avatar_url ?? undefined}
 />
 <AvatarFallback
 className={cn(
"font-mono text-xs",
 isExpuesto &&
"text-sm bg-red-500/20 text-red-500",
 isVigilado &&
"bg-amber-500/10 text-amber-500")}
 >
 {getInitials(m.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>

 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <p className={nameClass}>
 {m.profile?.full_name ??"Sin nombre"}
 </p>
 {isMe && (
 <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
 (tu)
 </span>
 )}
 {moved && (
 <span
 className={cn(
"flex items-center gap-0.5 font-mono text-[9px] font-bold",
 movedUp
 ?"text-green-500":"text-red-500")}
 >
 {movedUp ? (
 <ArrowUp className="w-3 h-3"/>
 ) : (
 <ArrowDown className="w-3 h-3"/>
 )}
 {movedUp ?"SUBIO":"BAJO"}
 </span>
 )}
 </div>

 {/* Tier-specific info lines */}
 {isExpuesto && (
 <div className="flex flex-wrap items-center gap-2 mt-1.5">
 <LivePulse status={m.liveStatus} />
 {m.currentTask && (
 <span className="flex items-center gap-1 text-[10px] font-mono text-red-400/80">
 <Radio className="w-3 h-3"/>
 {m.currentTask}
 </span>
 )}
 <span className="flex items-center gap-1 text-[10px] font-mono text-red-400/70">
 <Camera className="w-3 h-3"/>
 Evidencia obligatoria
 </span>
 <span className="flex items-center gap-1 text-[10px] font-mono text-red-400/70">
 <Scan className="w-3 h-3"/>
 Vigilancia total
 </span>
 </div>
 )}

 {isVigilado && (
 <div className="flex flex-wrap items-center gap-2 mt-1.5">
 <span className="flex items-center gap-1 text-[10px] font-mono text-amber-500/70">
 <Eye className="w-3 h-3"/>
 Entradas + evidencia visibles
 </span>
 <span className="flex items-center gap-1 text-[10px] font-mono text-amber-500/70">
 <FileWarning className="w-3 h-3"/>
 Bajo observacion
 </span>
 </div>
 )}

 {isMonitoreado && (
 <div className="flex items-center gap-2 mt-1">
 <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
 <Eye className="w-3 h-3"/>
 Entradas visibles
 </span>
 </div>
 )}

 {isAutonomo && (
 <div className="flex items-center gap-1 mt-0.5">
 <Lock className="w-3 h-3 text-green-500/50"/>
 <span className="text-[10px] font-mono text-green-500/50">
 Privacidad ganada
 </span>
 </div>
 )}
 </div>

 {/* Score */}
 <div className="text-right shrink-0">
 <p className={scoreClass}>{m.trustScore}</p>
 <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
 Trust
 </p>
 </div>
 </div>

 {/* EXPUESTO: Live feed of today's entries */}
 {isExpuesto && m.recentEntries.length > 0 && (
 <div className="mt-3 border-t border-red-500/20 pt-3">
 <p className="font-mono text-[8px] tracking-[0.18em] uppercase text-red-500/40 mb-2">
 FEED EN VIVO — Entradas de hoy
 </p>
 <div className="space-y-1.5">
 {m.recentEntries.slice(0, 5).map((entry) => {
 const cat = CATEGORIES[entry.category as WorkCategory];
 const hasProof =
 entry.proof_urls &&
 (entry.proof_urls as string[]).length > 0;
 return (
 <div
 key={entry.id}
 className="flex items-start gap-2 px-2 py-1.5 bg-red-500/5 border border-red-500/15">
 <span className="font-mono text-[10px] tabular-nums text-red-500/60 shrink-0 mt-0.5">
 {formatHour(entry.hour)}
 </span>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-1.5">
 <span className="text-[10px]">
 {cat?.emoji}
 </span>
 <span className="font-mono text-[11px] text-foreground truncate">
 {entry.title}
 </span>
 </div>
 {entry.description && (
 <p className="font-mono text-[9px] text-muted-foreground mt-0.5 truncate">
 {entry.description}
 </p>
 )}
 </div>
 <div className="flex items-center gap-1 shrink-0">
 {hasProof ? (
 <Shield className="w-3 h-3 text-green-500/50"/>
 ) : (
 <ShieldX className="w-3 h-3 text-red-500/50"/>
 )}
 {entry.is_late && (
 <AlertTriangle className="w-3 h-3 text-amber-500/50"/>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {isExpuesto && m.recentEntries.length === 0 && (
 <div className="mt-3 border-t border-red-500/20 pt-3">
 <p className="font-mono text-[9px] text-red-500/40 text-center">
 SIN ENTRADAS HOY — Expuesto y sin actividad.
 </p>
 </div>
 )}

 {/* VIGILADO: Show entry count + proof stats */}
 {isVigilado && m.recentEntries.length > 0 && (
 <div className="mt-2 flex items-center gap-3">
 <span className="font-mono text-[10px] text-amber-500/60">
 {m.recentEntries.length}h hoy
 </span>
 <span className="font-mono text-[10px] text-amber-500/50">
 {
 m.recentEntries.filter(
 (e) =>
 e.proof_urls &&
 (e.proof_urls as string[]).length > 0
 ).length
 }
 /{m.recentEntries.length} con evidencia
 </span>
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
 })}

 {/* Tier rules reference */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Reglas por nivel
 </p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 {tierOrder.map((tierLevel) => {
 const config = TIERS[tierLevel];
 const TierIcon = getTierIcon(tierLevel);
 return (
 <div
 key={tierLevel}
 className={cn(
"border p-3",
 config.borderColor,
 config.bgColor
 )}
 >
 <div className="flex items-center gap-2 mb-2">
 <TierIcon className={cn("w-3.5 h-3.5", config.textColor)} />
 <span
 className={cn(
"font-mono text-[10px] font-bold tracking-[0.1em] uppercase",
 config.textColor
 )}
 >
 {config.name}
 </span>
 <span className="font-mono text-[9px] text-muted-foreground ml-auto">
 {tierLevel === 4
 ?">90": tierLevel === 3
 ?"70-90": tierLevel === 2
 ?"50-70":"<50"}
 </span>
 </div>
 <div className="space-y-1">
 <p className="font-mono text-[8px] tracking-[0.15em] uppercase text-muted-foreground">
 RESTRICCIONES
 </p>
 {config.restrictions.map((r) => (
 <p
 key={r}
 className="font-mono text-[9px] text-muted-foreground">
 {r}
 </p>
 ))}
 <p className="font-mono text-[8px] tracking-[0.15em] uppercase text-muted-foreground mt-1.5">
 COMO SUBIR
 </p>
 <p className="font-mono text-[9px] text-muted-foreground">
 {config.howToMoveUp}
 </p>
 </div>
 </div>
 );
 })}
 </div>
 </div>

 {/* Empty state */}
 {members.length === 0 && (
 <div className="flex flex-col items-center justify-center py-16 gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Eye className="w-7 h-7 text-muted-foreground"/>
 </div>
 <p className="text-sm text-muted-foreground font-mono">
 No hay miembros en la organizacion.
 </p>
 </div>
 )}

 {/* Bottom message */}
 <div className="mt-10 text-center py-6 border-t border-border/30">
 <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/25">
 La privacidad es un privilegio. Se gana con confianza.
 </p>
 </div>
 </div>
 );
}
