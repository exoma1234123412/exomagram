"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import { subDays, format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
 Ghost,
 Clock,
 AlertTriangle,
 Radio,
 Bell,
 TrendingDown,
 Shield,
 Skull,
 Send,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberGhostData {
 profile: Profile;
 userId: string;
 lastEntryDate: string | null;
 daysInactive: number;
 isGhost: boolean;
 last7Days: boolean[]; // true = had entries, false = ghost day
 totalEntriesLast7: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHauntLevel(days: number): { label: string } {
 if (days >= 7) return { label:"DESAPARECIDO"};
 if (days >= 5) return { label:"FANTASMA MAYOR"};
 if (days >= 3) return { label:"FANTASMA"};
 return { label:"DESVANECIENDOSE"};
}

function getTimeSinceText(dateStr: string | null): string {
 if (!dateStr) return"Nunca registrado";
 const date = new Date(dateStr +"T23:59:59");
 return formatDistanceToNow(date, { addSuffix: true, locale: es });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GhostRadarPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [members, setMembers] = useState<MemberGhostData[]>([]);
 const [loading, setLoading] = useState(true);
 const [nudging, setNudging] = useState<string | null>(null);
 const [nudged, setNudged] = useState<Set<string>>(new Set());
 const supabase = createClient();

 const today = useMemo(() => getTodayMTY(), []);

 const loadData = useCallback(async () => {
 if (!orgId) return;

 const startDate = format(subDays(new Date(), 6),"yyyy-MM-dd");

 // Fetch team members with profiles
 const { data: orgMembers } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 if (!orgMembers || orgMembers.length === 0) {
 setLoading(false);
 return;
 }

 // Fetch all time entries for last 7 days
 const { data: recentEntries } = await supabase
 .from("time_entries")
 .select("user_id, date")
 .eq("org_id", orgId)
 .gte("date", startDate)
 .lte("date", today);

 // Fetch the latest entry date per user (beyond 7 days if needed)
 const { data: latestEntries } = await supabase
 .from("time_entries")
 .select("user_id, date")
 .eq("org_id", orgId)
 .order("date", { ascending: false });

 // Build a map: userId -> set of dates with entries
 const userDatesMap = new Map<string, Set<string>>();
 for (const e of recentEntries ?? []) {
 const dates = userDatesMap.get(e.user_id) ?? new Set<string>();
 dates.add(e.date);
 userDatesMap.set(e.user_id, dates);
 }

 // Build a map: userId -> latest entry date
 const userLatestMap = new Map<string, string>();
 for (const e of latestEntries ?? []) {
 if (!userLatestMap.has(e.user_id)) {
 userLatestMap.set(e.user_id, e.date);
 }
 }

 // Generate last 7 days array
 const last7Dates: string[] = [];
 for (let i = 6; i >= 0; i--) {
 last7Dates.push(format(subDays(new Date(), i),"yyyy-MM-dd"));
 }

 // Build member data
 const result: MemberGhostData[] = orgMembers.map((m) => {
 const profile = m.profiles as unknown as Profile;
 const userDates = userDatesMap.get(m.user_id) ?? new Set<string>();
 const lastEntryDate = userLatestMap.get(m.user_id) ?? null;

 // Calculate days inactive
 let daysInactive = 0;
 if (!lastEntryDate) {
 daysInactive = 999; // never logged
 } else {
 const lastDate = new Date(lastEntryDate +"T12:00:00");
 const todayDate = new Date(today +"T12:00:00");
 daysInactive = Math.floor(
 (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
 );
 }

 // Last 7 days activity trail
 const last7Days = last7Dates.map((d) => userDates.has(d));
 const totalEntriesLast7 = last7Days.filter(Boolean).length;

 return {
 profile,
 userId: m.user_id,
 lastEntryDate,
 daysInactive,
 isGhost: daysInactive >= 2,
 last7Days,
 totalEntriesLast7,
 };
 });

 // Sort: ghosts first (by days inactive desc), then active members
 result.sort((a, b) => {
 if (a.isGhost && !b.isGhost) return -1;
 if (!a.isGhost && b.isGhost) return 1;
 if (a.isGhost && b.isGhost) return b.daysInactive - a.daysInactive;
 return a.daysInactive - b.daysInactive;
 });

 setMembers(result);
 setLoading(false);
 }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

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
 .channel("ghost-radar-entries")
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
 .subscribe();
 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, loadData, supabase]);

 // Send nudge notification
 async function handleNudge(targetUserId: string, targetName: string) {
 if (!orgId || !userId || nudged.has(targetUserId)) return;
 setNudging(targetUserId);

 await supabase.from("notifications").insert({
 user_id: targetUserId,
 org_id: orgId,
 type:"flag_raised"as const,
 title:"Alerta Fantasma",
 body:`Tu equipo nota tu ausencia. Registra tu trabajo para dejar de ser un fantasma.`,
 link:"/dashboard",
 read: false,
 from_user_id: userId,
 });

 setNudged((prev) => new Set(prev).add(targetUserId));
 setNudging(null);
 }

 // Derived stats
 const ghosts = members.filter((m) => m.isGhost);
 const survivors = members.filter((m) => !m.isGhost);
 const worstGhost = ghosts.length > 0 ? ghosts[0] : null;
 const teamGhostRate =
 members.length > 0
 ? Math.round((ghosts.length / members.length) * 100)
 : 0;

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
 <div className="flex items-center justify-center py-24">
 <p className="text-muted-foreground font-mono text-xs">
 Primero crea o unete a un equipo.
 </p>
 </div>
 );
 }

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-3 mb-1">
 <Ghost className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Fantasma Inverso
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground mb-8">
 Radar de inactividad. Los fantasmas no se esconden — se amplifican.
 </p>

 {/* Stats row */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
 <div className="bg-accent/30 border border-border p-4">
 <div className="flex items-center gap-2 mb-1">
 <Ghost className="w-3.5 h-3.5 text-muted-foreground"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Fantasmas
 </span>
 </div>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
 {ghosts.length}
 </p>
 <p className="text-[10px] font-mono text-muted-foreground">
 de {members.length} miembros
 </p>
 </div>

 <div className="bg-accent/30 border border-border p-4">
 <div className="flex items-center gap-2 mb-1">
 <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Tasa
 </span>
 </div>
 <p
 className={cn(
"text-2xl font-mono font-bold tabular-nums tracking-tight",
 teamGhostRate >= 50
 ?"text-red-600 dark:text-red-400": teamGhostRate >= 25
 ?"text-amber-600 dark:text-amber-400":"text-green-600 dark:text-green-400")}
 >
 {teamGhostRate}%
 </p>
 <p className="text-[10px] font-mono text-muted-foreground">del equipo</p>
 </div>

 <div className="bg-accent/30 border border-border p-4">
 <div className="flex items-center gap-2 mb-1">
 <Skull className="w-3.5 h-3.5 text-muted-foreground"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Peor caso
 </span>
 </div>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
 {worstGhost
 ? worstGhost.daysInactive === 999
 ?"INF":`${worstGhost.daysInactive}d`:"--"}
 </p>
 <p className="text-[10px] font-mono text-muted-foreground truncate">
 {worstGhost
 ? worstGhost.profile.full_name ?? worstGhost.profile.email
 :"Nadie"}
 </p>
 </div>

 <div className="bg-accent/30 border border-border p-4">
 <div className="flex items-center gap-2 mb-1">
 <Shield className="w-3.5 h-3.5 text-muted-foreground"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Activos
 </span>
 </div>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight text-green-600 dark:text-green-400">
 {survivors.length}
 </p>
 <p className="text-[10px] font-mono text-muted-foreground">sobrevivientes</p>
 </div>
 </div>

 {/* GHOST ZONE */}
 {ghosts.length > 0 && (
 <div className="mb-8">
 <div className="flex items-center gap-2 mb-4">
 <Radio className="w-3.5 h-3.5 text-red-500 animate-pulse"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-600 dark:text-red-400 font-semibold">
 Zona Fantasma
 </span>
 <Badge
 variant="destructive"className="font-mono text-[9px]">
 {ghosts.length} detectados
 </Badge>
 </div>

 <div className="space-y-3">
 {ghosts.map((ghost) => {
 const haunt = getHauntLevel(ghost.daysInactive);

 return (
 <Card
 key={ghost.userId}
 className="border border-border transition-colors hover:border-primary/30">
 <CardContent className="p-5 sm:p-6">
 <div className="flex items-start gap-4 sm:gap-5">
 {/* Giant ghost avatar */}
 <div className="relative shrink-0">
 <Avatar
 className={cn(
"ring-1 ring-border grayscale opacity-50",
 ghost.daysInactive >= 7
 ?"w-20 h-20 sm:w-24 sm:h-24": ghost.daysInactive >= 5
 ?"w-18 h-18 sm:w-20 sm:h-20":"w-16 h-16 sm:w-18 sm:h-18")}
 >
 <AvatarImage
 src={ghost.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-2xl font-mono">
 {getInitials(ghost.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 {/* Ghost overlay icon */}
 <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-red-100 dark:bg-red-900/60 border border-red-300 dark:border-red-800 flex items-center justify-center">
 <Ghost className="w-4 h-4 text-red-500"/>
 </div>
 </div>

 {/* Info */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1 flex-wrap">
 <h3 className="font-mono font-bold text-base truncate text-foreground/70 uppercase">
 {ghost.profile.full_name ?? ghost.profile.email}
 </h3>
 <Badge
 variant="secondary"className="font-mono text-[9px] bg-accent/30 border border-border text-muted-foreground">
 {haunt.label}
 </Badge>
 </div>

 {/* Days inactive counter */}
 <div className="flex items-center gap-2 mb-3">
 <Clock className="w-4 h-4 text-red-500/70"/>
 <span className="text-xs font-mono text-muted-foreground">
 Dias inactivo:{""}
 <span
 className={cn(
"font-bold tabular-nums text-base",
 ghost.daysInactive >= 7
 ?"text-red-600 dark:text-red-400":"text-amber-600 dark:text-amber-400")}
 >
 {ghost.daysInactive === 999
 ?"INF": ghost.daysInactive}
 </span>
 </span>
 </div>

 {/* Last seen */}
 <p className="text-[11px] font-mono text-muted-foreground mb-3">
 Ultima actividad: {getTimeSinceText(ghost.lastEntryDate)}
 </p>

 {/* Activity trail - last 7 days */}
 <div className="mb-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1.5">
 Rastro fantasma (7 dias)
 </p>
 <div className="flex items-center gap-1.5">
 {ghost.last7Days.map((active, i) => (
 <div key={i} className="flex flex-col items-center gap-1">
 <div
 className={cn(
"w-6 h-6 sm:w-7 sm:h-7 border transition-all flex items-center justify-center",
 active
 ?"bg-green-200 dark:bg-green-800/60 border-green-300 dark:border-green-700":"bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 opacity-40")}
 >
 {active ? (
 <div className="w-2 h-2 bg-green-500"/>
 ) : (
 <Ghost className="w-3 h-3 text-slate-400 dark:text-slate-600"/>
 )}
 </div>
 <span className="text-[8px] font-mono text-muted-foreground">
 {format(
 subDays(new Date(), 6 - i),
"EEE",
 { locale: es }
 )
 .charAt(0)
 .toUpperCase()}
 </span>
 </div>
 ))}
 </div>
 </div>

 {/* Decline indicator */}
 <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
 <TrendingDown className="w-3.5 h-3.5 text-red-500"/>
 <span>
 {ghost.totalEntriesLast7}/7 dias con actividad
 </span>
 </div>
 </div>

 {/* Nudge button */}
 <div className="shrink-0">
 <Button
 size="sm"variant={nudged.has(ghost.userId) ?"secondary":"default"}
 className={cn(
"font-mono text-xs gap-1.5",
 !nudged.has(ghost.userId) &&"bg-primary")}
 disabled={
 nudging === ghost.userId ||
 nudged.has(ghost.userId) ||
 ghost.userId === userId
 }
 onClick={() =>
 handleNudge(
 ghost.userId,
 ghost.profile.full_name ?? ghost.profile.email
 )
 }
 >
 {nudged.has(ghost.userId) ? (
 <>
 <Bell className="w-3.5 h-3.5"/>
 <span className="hidden sm:inline">Enviado</span>
 </>
 ) : nudging === ghost.userId ? (
 <>
 <Send className="w-3.5 h-3.5 animate-pulse"/>
 <span className="hidden sm:inline">
 Enviando...
 </span>
 </>
 ) : (
 <>
 <Bell className="w-3.5 h-3.5"/>
 <span className="hidden sm:inline">
 Enviar Nudge
 </span>
 </>
 )}
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 )}

 {/* EMPTY GHOST STATE */}
 {ghosts.length === 0 && (
 <div className="mb-8">
 <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="flex flex-col items-center justify-center py-12">
 <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
 <Ghost className="w-8 h-8 text-primary"/>
 </div>
 <p className="text-sm font-mono font-medium mb-1">Sin fantasmas</p>
 <p className="text-xs font-mono text-muted-foreground text-center max-w-xs">
 Todos los miembros han registrado actividad en los ultimos 2 dias.
 El radar esta limpio.
 </p>
 </CardContent>
 </Card>
 </div>
 )}

 {/* SURVIVORS */}
 {survivors.length > 0 && (
 <div>
 <div className="flex items-center gap-2 mb-4">
 <Shield className="w-3.5 h-3.5 text-green-500"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-green-600 dark:text-green-400 font-semibold">
 Sobrevivientes
 </span>
 <Badge
 variant="secondary"className="font-mono text-[9px] bg-accent/30 border border-border text-muted-foreground">
 {survivors.length} activos
 </Badge>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {survivors.map((member) => (
 <Card
 key={member.userId}
 className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="p-3 sm:p-4">
 <div className="flex items-center gap-3">
 <Avatar className="w-9 h-9 ring-1 ring-border">
 <AvatarImage
 src={member.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-xs font-mono">
 {getInitials(member.profile.full_name)}
 </AvatarFallback>
 </Avatar>

 <div className="flex-1 min-w-0">
 <p className="text-sm font-mono font-medium truncate">
 {member.profile.full_name ?? member.profile.email}
 </p>
 <p className="text-[10px] font-mono text-muted-foreground">
 {member.daysInactive === 0
 ?"Activo hoy":`Hace ${member.daysInactive} dia${member.daysInactive !== 1 ?"s":""}`}
 </p>
 </div>

 {/* Mini activity trail */}
 <div className="flex items-center gap-[3px] shrink-0">
 {member.last7Days.map((active, i) => (
 <div
 key={i}
 className={cn(
"w-2.5 h-2.5 transition-all",
 active
 ?"bg-green-400 dark:bg-green-600":"bg-slate-200 dark:bg-slate-700")}
 />
 ))}
 </div>

 <Badge
 variant="secondary"className="font-mono text-[9px] tabular-nums bg-accent/30 border border-border text-muted-foreground shrink-0">
 {member.totalEntriesLast7}/7
 </Badge>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 )}

 {/* Legend */}
 <div className="mt-8 p-4 bg-accent/30 border border-border">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Niveles de fantasma
 </p>
 <div className="flex flex-wrap gap-3">
 {[
 { days:"2-3d", label:"Desvaneciendose", color:"bg-yellow-500"},
 { days:"3-5d", label:"Fantasma", color:"bg-amber-500"},
 { days:"5-7d", label:"Fantasma Mayor", color:"bg-orange-500"},
 { days:"7+d", label:"Desaparecido", color:"bg-red-500"},
 ].map((item) => (
 <div key={item.label} className="flex items-center gap-1.5">
 <div className={cn("w-3 h-3", item.color)} />
 <span className="text-[10px] font-mono text-muted-foreground">
 {item.days}: {item.label}
 </span>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}
