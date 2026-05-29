"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY, formatHour } from "@/lib/utils";
import type { Profile, LiveStatus, TimeEntry } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
 Ghost,
 Eye,
 EyeOff,
 Clock,
 AlertTriangle,
 Users,
 Timer,
 TrendingUp,
 Skull,
 Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface MemberGhostData {
 userId: string;
 profile: Profile;
 isGhost: boolean;
 lastEntryHour: number | null;
 lastEntryTime: string | null;
 hoursGhost: number;
 entriesCount: number;
 liveStatus: LiveStatus | null;
}

interface GhostHistoryEntry {
 userId: string;
 name: string;
 date: string;
 hoursGhost: number;
 detectedAt: string;
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY_PREFIX ="exomagram_ghosts_";

function getCurrentMTYHour(): number {
 const now = new Date();
 const mtyTime = new Date(
 now.toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 return mtyTime.getHours();
}

function getMTYNow(): Date {
 return new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
}

function loadGhostHistory(orgId: string): GhostHistoryEntry[] {
 try {
 const raw = localStorage.getItem(STORAGE_KEY_PREFIX + orgId);
 return raw ? JSON.parse(raw) : [];
 } catch {
 return [];
 }
}

function saveGhostHistory(orgId: string, entries: GhostHistoryEntry[]) {
 try {
 // Keep only last 7 days
 const weekAgo = new Date();
 weekAgo.setDate(weekAgo.getDate() - 7);
 const filtered = entries.filter(
 (e) => new Date(e.detectedAt) > weekAgo
 );
 localStorage.setItem(
 STORAGE_KEY_PREFIX + orgId,
 JSON.stringify(filtered)
 );
 } catch {
 // Ignore storage errors
 }
}

// ═══════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════

export default function GhostModePage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [members, setMembers] = useState<MemberGhostData[]>([]);
 const [ghostHistory, setGhostHistory] = useState<GhostHistoryEntry[]>([]);
 const [loading, setLoading] = useState(true);
 const [currentHour, setCurrentHour] = useState(getCurrentMTYHour());

 const loadData = useCallback(async () => {
 if (!orgId) return;

 const today = getTodayMTY();

 const [membersRes, entriesRes, statusRes] = await Promise.all([
 supabase
 .from("org_members")
 .select(
"user_id, profiles(id, full_name, avatar_url, email, work_start_hour, work_end_hour)")
 .eq("org_id", orgId),
 supabase
 .from("time_entries")
 .select("user_id, hour, logged_at")
 .eq("org_id", orgId)
 .eq("date", today),
 supabase.from("live_status").select("*").eq("org_id", orgId),
 ]);

 const orgMembers = membersRes.data ?? [];
 const todayEntries = (entriesRes.data ?? []) as Pick<
 TimeEntry,
"user_id"|"hour"|"logged_at">[];
 const statuses = (statusRes.data ?? []) as LiveStatus[];

 const nowHour = getCurrentMTYHour();
 setCurrentHour(nowHour);

 const memberDataList: MemberGhostData[] = orgMembers.map((m) => {
 const profile = m.profiles as unknown as Profile;
 const userEntries = todayEntries.filter((e) => e.user_id === m.user_id);
 const liveStatus =
 statuses.find((s) => s.user_id === m.user_id) ?? null;

 const workStart = profile?.work_start_hour ?? 9;
 const workEnd = profile?.work_end_hour ?? 18;
 const isWithinWorkHours = nowHour >= workStart && nowHour < workEnd;

 // Determine last logged hour
 let lastEntryHour: number | null = null;
 let lastEntryTime: string | null = null;
 if (userEntries.length > 0) {
 const sorted = [...userEntries].sort((a, b) => b.hour - a.hour);
 lastEntryHour = sorted[0].hour;
 lastEntryTime = sorted[0].logged_at;
 }

 // Ghost detection
 let isGhost = false;
 let hoursGhost = 0;

 if (isWithinWorkHours) {
 if (userEntries.length === 0 && nowHour >= workStart + 2) {
 // No entries today and 2+ hours past work start
 isGhost = true;
 hoursGhost = nowHour - workStart;
 } else if (
 lastEntryHour !== null &&
 nowHour - lastEntryHour >= 4
 ) {
 // Last entry was 4+ hours ago
 isGhost = true;
 hoursGhost = nowHour - lastEntryHour;
 }
 }

 return {
 userId: m.user_id,
 profile,
 isGhost,
 lastEntryHour,
 lastEntryTime,
 hoursGhost,
 entriesCount: userEntries.length,
 liveStatus,
 };
 });

 setMembers(memberDataList);

 // Update ghost history
 const existing = loadGhostHistory(orgId);
 const newGhosts = memberDataList.filter((m) => m.isGhost);
 const todayStr = today;

 newGhosts.forEach((ghost) => {
 const alreadyLogged = existing.some(
 (e) =>
 e.userId === ghost.userId &&
 e.date === todayStr
 );
 if (!alreadyLogged) {
 existing.push({
 userId: ghost.userId,
 name: ghost.profile?.full_name ??"Desconocido",
 date: todayStr,
 hoursGhost: ghost.hoursGhost,
 detectedAt: new Date().toISOString(),
 });
 } else {
 // Update hours
 const idx = existing.findIndex(
 (e) => e.userId === ghost.userId && e.date === todayStr
 );
 if (idx !== -1) {
 existing[idx].hoursGhost = Math.max(
 existing[idx].hoursGhost,
 ghost.hoursGhost
 );
 }
 }
 });

 saveGhostHistory(orgId, existing);
 setGhostHistory(loadGhostHistory(orgId));
 setLoading(false);
 }, [orgId, supabase]);

 // Initial load
 useEffect(() => {
 if (orgLoading) return;
 if (!orgId) {
 setLoading(false);
 return;
 }
 loadData();
 }, [orgId, orgLoading, loadData]);

 // Auto-refresh every 60 seconds
 useEffect(() => {
 if (!orgId) return;
 const interval = setInterval(() => {
 loadData();
 }, 60_000);
 return () => clearInterval(interval);
 }, [orgId, loadData]);

 // ═══════════════════════════════════════════════════════════
 // Loading / empty
 // ═══════════════════════════════════════════════════════════

 if (loading || orgLoading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </div>
 </div>
 );
 }

 // ═══════════════════════════════════════════════════════════
 // Derived data
 // ═══════════════════════════════════════════════════════════

 const ghosts = members.filter((m) => m.isGhost);
 const visible = members.filter((m) => !m.isGhost);
 const myStatus = members.find((m) => m.userId === userId);
 const isMyGhost = myStatus?.isGhost ?? false;

 // Ghost stats from history
 const ghostFrequency: Record<string, number> = {};
 const ghostTotalHours: Record<string, { name: string; hours: number }> = {};

 ghostHistory.forEach((entry) => {
 ghostFrequency[entry.userId] = (ghostFrequency[entry.userId] ?? 0) + 1;
 if (!ghostTotalHours[entry.userId]) {
 ghostTotalHours[entry.userId] = { name: entry.name, hours: 0 };
 }
 ghostTotalHours[entry.userId].hours += entry.hoursGhost;
 });

 const mostFrequentGhost = Object.entries(ghostFrequency).sort(
 (a, b) => b[1] - a[1]
 )[0];
 const longestGhost = Object.entries(ghostTotalHours).sort(
 (a, b) => b[1].hours - a[1].hours
 )[0];

 // ═══════════════════════════════════════════════════════════
 // Render
 // ═══════════════════════════════════════════════════════════

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-3 mb-2">
 <Ghost className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Modo Fantasma
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground mb-8">
 Miembros sin actividad durante horas de trabajo se vuelven fantasmas
 visibles para todos. Hora actual:{""}
 <span className="font-mono tabular-nums text-foreground">
 {formatHour(currentHour)}
 </span>
 </p>

 {/* Your status banner */}
 {myStatus && (
 <div
 className={cn(
"mb-8 border p-4 flex items-center gap-4",
 isMyGhost
 ?"border-destructive/40 bg-destructive/5":"border-green-500/30 bg-green-500/5")}
 >
 <div
 className={cn(
"w-10 h-10 flex items-center justify-center",
 isMyGhost &&"animate-pulse")}
 >
 {isMyGhost ? (
 <Ghost className="w-7 h-7 text-destructive"/>
 ) : (
 <Eye className="w-7 h-7 text-green-500"/>
 )}
 </div>
 <div className="flex-1">
 <p
 className={cn(
"font-mono text-sm font-bold uppercase tracking-wide",
 isMyGhost ?"text-destructive":"text-green-500")}
 >
 {isMyGhost
 ?"TU ERES UN FANTASMA":"VISIBLE"}
 </p>
 <p className="text-xs font-mono text-muted-foreground mt-0.5">
 {isMyGhost
 ?`Desaparecido hace ${myStatus.hoursGhost}h. Registra tu actividad para volver a ser visible.`:`${myStatus.entriesCount} entradas hoy. Tu presencia es visible para el equipo.`}
 </p>
 </div>
 {isMyGhost && (
 <Badge variant="destructive"className="font-mono text-[10px]">
 {myStatus.hoursGhost}h sin actividad
 </Badge>
 )}
 </div>
 )}

 {/* Stats row */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Fantasmas activos
 </p>
 <p className="font-mono tabular-nums text-2xl font-bold tracking-tight mt-1">
 {ghosts.length}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Miembros visibles
 </p>
 <p className="font-mono tabular-nums text-2xl font-bold tracking-tight mt-1">
 {visible.length}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Fantasma frecuente
 </p>
 <p className="font-mono text-sm font-bold tracking-tight mt-1 truncate">
 {mostFrequentGhost
 ?`${ghostTotalHours[mostFrequentGhost[0]]?.name ??"?"} (${mostFrequentGhost[1]}x)`:"-"}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Mayor tiempo fantasma
 </p>
 <p className="font-mono text-sm font-bold tracking-tight mt-1 truncate">
 {longestGhost
 ?`${longestGhost[1].name} (${longestGhost[1].hours}h)`:"-"}
 </p>
 </div>
 </div>

 {/* Fantasmas Activos section */}
 <div className="mb-8">
 <div className="flex items-center gap-2 mb-4">
 <EyeOff className="w-4 h-4 text-primary"/>
 <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Fantasmas activos
 </h2>
 {ghosts.length > 0 && (
 <Badge variant="destructive"className="font-mono text-[10px]">
 {ghosts.length}
 </Badge>
 )}
 </div>

 {ghosts.length === 0 ? (
 <div className="border border-border border-dashed p-8 flex flex-col items-center gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Eye className="w-8 h-8 text-muted-foreground"/>
 </div>
 <p className="text-xs font-mono text-muted-foreground text-center">
 Todos los miembros estan visibles. Sin fantasmas por ahora.
 </p>
 </div>
 ) : (
 <div className="grid gap-3 sm:grid-cols-2">
 {ghosts
 .sort((a, b) => b.hoursGhost - a.hoursGhost)
 .map((ghost) => (
 <GhostMemberCard key={ghost.userId} member={ghost} isYou={ghost.userId === userId} />
 ))}
 </div>
 )}
 </div>

 {/* Miembros Visibles section */}
 <div className="mb-8">
 <div className="flex items-center gap-2 mb-4">
 <Eye className="w-4 h-4 text-primary"/>
 <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Miembros visibles
 </h2>
 </div>

 {visible.length === 0 ? (
 <div className="border border-border border-dashed p-8 flex flex-col items-center gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Ghost className="w-8 h-8 text-muted-foreground"/>
 </div>
 <p className="text-xs font-mono text-muted-foreground text-center">
 Todos son fantasmas. Nadie ha registrado actividad.
 </p>
 </div>
 ) : (
 <div className="grid gap-3 sm:grid-cols-2">
 {visible
 .sort((a, b) => b.entriesCount - a.entriesCount)
 .map((member) => (
 <VisibleMemberCard key={member.userId} member={member} isYou={member.userId === userId} />
 ))}
 </div>
 )}
 </div>

 {/* Registro de Apariciones (Ghost history) */}
 <div className="mb-8">
 <div className="flex items-center gap-2 mb-4">
 <Timer className="w-4 h-4 text-primary"/>
 <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Registro de apariciones (7 dias)
 </h2>
 </div>

 {ghostHistory.length === 0 ? (
 <div className="border border-border border-dashed p-8 flex flex-col items-center gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Activity className="w-8 h-8 text-muted-foreground"/>
 </div>
 <p className="text-xs font-mono text-muted-foreground text-center">
 Sin registros de fantasmas esta semana.
 </p>
 </div>
 ) : (
 <div className="space-y-2">
 {ghostHistory
 .sort(
 (a, b) =>
 new Date(b.detectedAt).getTime() -
 new Date(a.detectedAt).getTime()
 )
 .slice(0, 20)
 .map((entry, i) => (
 <div
 key={`${entry.userId}-${entry.date}-${i}`}
 className="flex items-center gap-3 border border-border p-3">
 <Ghost className="w-4 h-4 text-muted-foreground shrink-0"/>
 <div className="flex-1 min-w-0">
 <p className="font-mono text-xs font-medium truncate">
 {entry.name}
 </p>
 <p className="font-mono text-[10px] text-muted-foreground">
 {formatDistanceToNow(new Date(entry.detectedAt), {
 addSuffix: true,
 locale: es,
 })}
 </p>
 </div>
 <div className="text-right shrink-0">
 <p className="font-mono tabular-nums text-xs font-bold">
 {entry.hoursGhost}h
 </p>
 <p className="font-mono text-[10px] text-muted-foreground">
 {entry.date}
 </p>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Auto-refresh indicator */}
 <div className="flex items-center justify-center gap-2 text-muted-foreground">
 <Clock className="w-3 h-3"/>
 <p className="font-mono text-[9px] tracking-wider uppercase">
 Actualización automatica cada 60s
 </p>
 </div>
 </div>
 );
}

// ═══════════════════════════════════════════════════════════
// Ghost member card
// ═══════════════════════════════════════════════════════════

function GhostMemberCard({
 member,
 isYou,
}: {
 member: MemberGhostData;
 isYou: boolean;
}) {
 const { profile, hoursGhost, lastEntryHour, entriesCount, liveStatus } =
 member;

 return (
 <Card
 className={cn(
"border-dashed border-muted-foreground/20 transition-all duration-300",
"bg-card/50")}
 >
 <CardContent className="flex items-center gap-3">
 {/* Ghost avatar */}
 <div className="relative">
 <Avatar className="opacity-30"size="lg">
 <AvatarImage src={profile?.avatar_url ?? undefined} />
 <AvatarFallback className="font-mono text-xs">
 {getInitials(profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="absolute inset-0 flex items-center justify-center">
 <Ghost className="w-5 h-5 text-muted-foreground animate-pulse"/>
 </div>
 </div>

 {/* Info */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <p className="font-mono text-xs font-bold truncate">
 {profile?.full_name ?? profile?.email ??"Sin nombre"}
 </p>
 {isYou && (
 <Badge variant="outline"className="font-mono text-[9px]">
 Tu
 </Badge>
 )}
 </div>
 <div className="flex items-center gap-1 mt-0.5">
 <AlertTriangle className="w-3 h-3 text-destructive shrink-0"/>
 <p className="font-mono text-[10px] text-destructive">
 Desaparecido hace {hoursGhost}h
 </p>
 </div>
 <div className="flex items-center gap-3 mt-1">
 <span className="font-mono text-[10px] text-muted-foreground">
 {entriesCount > 0
 ?`Ultima entrada: ${formatHour(lastEntryHour!)}`:"Sin entradas hoy"}
 </span>
 {liveStatus && (
 <span className="font-mono text-[10px] text-muted-foreground/60">
 {liveStatus.status}
 </span>
 )}
 </div>
 </div>

 {/* Ghost duration */}
 <div className="text-right shrink-0">
 <p className="font-mono tabular-nums text-lg font-bold text-destructive">
 {hoursGhost}h
 </p>
 <p className="font-mono text-[9px] text-muted-foreground uppercase">
 Fantasma
 </p>
 </div>
 </CardContent>
 </Card>
 );
}

// ═══════════════════════════════════════════════════════════
// Visible member card
// ═══════════════════════════════════════════════════════════

function VisibleMemberCard({
 member,
 isYou,
}: {
 member: MemberGhostData;
 isYou: boolean;
}) {
 const { profile, entriesCount, lastEntryHour, liveStatus } = member;

 return (
 <Card
 className={cn(
"border-green-500/20 transition-all duration-300",
"hover:border-green-500/40")}
 >
 <CardContent className="flex items-center gap-3">
 {/* Normal avatar */}
 <div className="relative">
 <Avatar size="lg"className="ring-1 ring-border">
 <AvatarImage src={profile?.avatar_url ?? undefined} />
 <AvatarFallback className="font-mono text-xs">
 {getInitials(profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full ring-2 ring-background shadow-[0_0_6px] shadow-green-500/60"/>
 </div>

 {/* Info */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <p className="font-mono text-xs font-bold truncate">
 {profile?.full_name ?? profile?.email ??"Sin nombre"}
 </p>
 {isYou && (
 <Badge variant="outline"className="font-mono text-[9px]">
 Tu
 </Badge>
 )}
 </div>
 <div className="flex items-center gap-1 mt-0.5">
 <Eye className="w-3 h-3 text-green-500 shrink-0"/>
 <p className="font-mono text-[10px] text-green-500">Visible</p>
 </div>
 <div className="flex items-center gap-3 mt-1">
 <span className="font-mono text-[10px] text-muted-foreground">
 {entriesCount} entrada{entriesCount !== 1 ?"s":""} hoy
 </span>
 {lastEntryHour !== null && (
 <span className="font-mono text-[10px] text-muted-foreground/60">
 Ultima: {formatHour(lastEntryHour)}
 </span>
 )}
 </div>
 </div>

 {/* Entries count */}
 <div className="text-right shrink-0">
 <p className="font-mono tabular-nums text-lg font-bold text-green-500">
 {entriesCount}
 </p>
 <p className="font-mono text-[9px] text-muted-foreground uppercase">
 Entradas
 </p>
 </div>
 </CardContent>
 </Card>
 );
}
