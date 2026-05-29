"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, DeadmanAlert } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import {
 Timer,
 AlertTriangle,
 Clock,
 Radio,
 CheckCircle2,
 Users,
 ShieldAlert,
 Loader2,
 Eye,
 History,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface MemberStatus {
 userId: string;
 profile: Profile;
 lastEntryTime: string | null;
 lastEntryHour: number | null;
 hoursMissing: number;
 isMissing: boolean;
 isInWorkHours: boolean;
 hasBreak: boolean;
 activeAlert: DeadmanAlert | null;
}

export default function DeadmanPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [members, setMembers] = useState<MemberStatus[]>([]);
 const [pastAlerts, setPastAlerts] = useState<(DeadmanAlert & { profile: Profile | null; acknowledger_profile: Profile | null })[]>([]);
 const [loading, setLoading] = useState(true);
 const [acknowledging, setAcknowledging] = useState<string | null>(null);
 const [now, setNow] = useState(Date.now());
 const supabase = createClient();

 // Tick every second for live countdowns
 useEffect(() => {
 const interval = setInterval(() => setNow(Date.now()), 1000);
 return () => clearInterval(interval);
 }, []);

 const loadData = useCallback(async () => {
 if (!orgId) return;
 const today = getTodayMTY();

 // Load all members with profiles
 const { data: memberData } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 const profileMap = new Map<string, Profile>();
 const memberIds: string[] = [];
 if (memberData) {
 for (const m of memberData) {
 if (m.profiles) {
 profileMap.set(m.user_id, m.profiles as unknown as Profile);
 memberIds.push(m.user_id);
 }
 }
 }

 // Load today's entries for all members
 const { data: entries } = await supabase
 .from("time_entries")
 .select("user_id, hour, category, logged_at")
 .eq("org_id", orgId)
 .eq("date", today)
 .order("hour", { ascending: false });

 // Load active alerts
 const { data: activeAlerts } = await supabase
 .from("deadman_alerts")
 .select("*")
 .eq("org_id", orgId)
 .eq("status","active");

 // Load past alerts (acknowledged/resolved, last 30)
 const { data: pastData } = await supabase
 .from("deadman_alerts")
 .select("*")
 .eq("org_id", orgId)
 .neq("status","active")
 .order("triggered_at", { ascending: false })
 .limit(30);

 // Current time in CST (Monterrey)
 const nowDate = new Date();
 const cstFormatter = new Intl.DateTimeFormat("en-US", {
 timeZone:"America/Monterrey",
 hour:"numeric",
 minute:"numeric",
 hour12: false,
 });
 const cstParts = cstFormatter.formatToParts(nowDate);
 const currentHour = parseInt(cstParts.find((p) => p.type ==="hour")?.value ??"0");
 const currentMinute = parseInt(cstParts.find((p) => p.type ==="minute")?.value ??"0");
 const currentDecimalHour = currentHour + currentMinute / 60;

 // Build member status list
 const statuses: MemberStatus[] = memberIds.map((uid) => {
 const profile = profileMap.get(uid)!;
 const userEntries = (entries ?? []).filter((e) => e.user_id === uid);
 const hasBreak = userEntries.some((e) => e.category ==="break");

 // Work hours from profile (default 7-18)
 const workStart = profile.work_start_hour ?? 7;
 const workEnd = profile.work_end_hour ?? 18;
 const isInWorkHours = currentHour >= workStart && currentHour < workEnd;

 // Find the latest entry
 let lastEntryHour: number | null = null;
 let lastEntryTime: string | null = null;
 if (userEntries.length > 0) {
 const latest = userEntries[0]; // already sorted desc by hour
 lastEntryHour = latest.hour;
 lastEntryTime = latest.logged_at;
 }

 // Calculate hours missing
 let hoursMissing = 0;
 if (isInWorkHours) {
 if (lastEntryHour !== null) {
 // Hours since last entry (the entry covers that hour, so gap starts at hour+1)
 hoursMissing = Math.max(0, currentDecimalHour - (lastEntryHour + 1));
 } else {
 // No entries today — missing since work start
 hoursMissing = Math.max(0, currentDecimalHour - workStart);
 }
 }

 const isMissing = isInWorkHours && hoursMissing >= 4 && !hasBreak;

 // Check for active alert
 const activeAlert = (activeAlerts ?? []).find((a) => a.user_id === uid) ?? null;

 return {
 userId: uid,
 profile,
 lastEntryTime,
 lastEntryHour,
 hoursMissing: Math.round(hoursMissing * 10) / 10,
 isMissing,
 isInWorkHours,
 hasBreak,
 activeAlert,
 };
 });

 // Sort: missing first, then by hours missing desc
 statuses.sort((a, b) => {
 if (a.isMissing && !b.isMissing) return -1;
 if (!a.isMissing && b.isMissing) return 1;
 if (a.activeAlert && !b.activeAlert) return -1;
 if (!a.activeAlert && b.activeAlert) return 1;
 return b.hoursMissing - a.hoursMissing;
 });

 setMembers(statuses);

 // Enrich past alerts
 if (pastData) {
 const enriched = pastData.map((a) => ({
 ...a,
 profile: profileMap.get(a.user_id) ?? null,
 acknowledger_profile: a.acknowledged_by ? profileMap.get(a.acknowledged_by) ?? null : null,
 }));
 setPastAlerts(enriched);
 }

 // Auto-create alerts for missing members who don't have one
 for (const m of statuses) {
 if (m.isMissing && !m.activeAlert) {
 await supabase.from("deadman_alerts").insert({
 user_id: m.userId,
 org_id: orgId,
 triggered_at: new Date().toISOString(),
 hours_missing: m.hoursMissing,
 status:"active",
 });
 }
 }

 // Update hours_missing on existing active alerts
 for (const m of statuses) {
 if (m.activeAlert && m.isMissing) {
 await supabase
 .from("deadman_alerts")
 .update({ hours_missing: m.hoursMissing })
 .eq("id", m.activeAlert.id);
 }
 // Auto-resolve if no longer missing
 if (m.activeAlert && !m.isMissing) {
 await supabase
 .from("deadman_alerts")
 .update({ status:"resolved", resolved_at: new Date().toISOString() })
 .eq("id", m.activeAlert.id);
 }
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
 .channel("deadman_realtime")
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"deadman_alerts",
 filter:`org_id=eq.${orgId}`,
 },
 () => loadData()
 )
 .on(
"postgres_changes",
 {
 event:"INSERT",
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
 }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

 // Refresh data every 60 seconds to keep countdowns accurate
 useEffect(() => {
 if (!orgId) return;
 const interval = setInterval(() => loadData(), 60_000);
 return () => clearInterval(interval);
 }, [orgId, loadData]);

 async function handleAcknowledge(alertId: string) {
 if (!userId) return;
 setAcknowledging(alertId);

 await supabase
 .from("deadman_alerts")
 .update({
 status:"acknowledged",
 acknowledged_by: userId,
 })
 .eq("id", alertId);

 await loadData();
 setAcknowledging(null);
 }

 // Derived data
 const activeAlerts = members.filter((m) => m.activeAlert);
 const missingMembers = members.filter((m) => m.isMissing);
 const onlineMembers = members.filter((m) => m.isInWorkHours && !m.isMissing);
 const offlineMembers = members.filter((m) => !m.isInWorkHours);

 function formatCountdown(triggeredAt: string): string {
 const diffMs = now - new Date(triggeredAt).getTime();
 const totalSeconds = Math.floor(diffMs / 1000);
 const hours = Math.floor(totalSeconds / 3600);
 const minutes = Math.floor((totalSeconds % 3600) / 60);
 const seconds = totalSeconds % 60;

 return`${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
 }

 function formatHoursMissing(hours: number): string {
 if (hours < 1) return`${Math.round(hours * 60)}m`;
 const h = Math.floor(hours);
 const m = Math.round((hours - h) * 60);
 return m > 0 ?`${h}h ${m}m`:`${h}h`;
 }

 if (loading || orgLoading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">Cargando...</div>
 </div>
 );
 }

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Timer className="w-6 h-6 text-primary"/>
 Dead Man&apos;s Switch
 </h1>
 <p className="text-xs font-mono text-muted-foreground">
 Alerta automatica si alguien desaparece por 4+ horas en horario laboral sin registrar descanso
 </p>
 </div>

 {/* Stats Bar */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
 <div className="bg-accent/30 border border-border p-4 text-center">
 <p className="text-2xl font-mono tabular-nums tracking-tight text-red-500">
 {activeAlerts.length}
 </p>
 <p className="text-xs text-muted-foreground mt-1">Alertas activas</p>
 </div>
 <div className="bg-accent/30 border border-border p-4 text-center">
 <p className="text-2xl font-mono tabular-nums tracking-tight">
 {missingMembers.length}
 </p>
 <p className="text-xs text-muted-foreground mt-1">Desaparecidos</p>
 </div>
 <div className="bg-accent/30 border border-border p-4 text-center">
 <p className="text-2xl font-mono tabular-nums tracking-tight text-green-500">
 {onlineMembers.length}
 </p>
 <p className="text-xs text-muted-foreground mt-1">En linea</p>
 </div>
 <div className="bg-accent/30 border border-border p-4 text-center">
 <p className="text-2xl font-mono tabular-nums tracking-tight text-muted-foreground">
 {offlineMembers.length}
 </p>
 <p className="text-xs text-muted-foreground mt-1">Fuera de horario</p>
 </div>
 </div>

 {/* Active Alerts — AMBER Alert Style */}
 {activeAlerts.length > 0 && (
 <div className="mb-8">
 {/* AMBER Alert Banner */}
 <div className="bg-red-600 px-4 py-3 flex items-center gap-3">
 <span className="relative flex h-3 w-3">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"/>
 <span className="relative inline-flex rounded-full h-3 w-3 bg-white"/>
 </span>
 <ShieldAlert className="w-5 h-5 text-white"/>
 <span className="text-white font-bold text-sm uppercase tracking-wider">
 Alerta AMBER — Miembro desaparecido
 </span>
 </div>

 <div className="space-y-0">
 {activeAlerts.map((member) => {
 const alert = member.activeAlert!;
 return (
 <Card
 key={alert.id}
 className={cn(
"border border-red-500/60 border-t-0 transition-colors",
"bg-red-500/5 animate-danger-pulse")}
 >
 <CardContent className="p-5">
 <div className="flex items-start justify-between gap-4">
 <div className="flex items-start gap-3">
 <div className="relative">
 <Avatar className="w-12 h-12 ring-1 ring-red-500/50">
 <AvatarImage src={member.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-sm bg-red-100 dark:bg-red-900/40 text-red-600">
 {getInitials(member.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"/>
 <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-background"/>
 </span>
 </div>
 <div>
 <p className="font-bold text-base">
 {member.profile.full_name ??"Miembro"}
 </p>
 <p className="text-xs text-muted-foreground">
 {member.profile.email}
 </p>
 <div className="flex items-center gap-2 mt-2 flex-wrap">
 <Badge variant="destructive"className="text-xs gap-1">
 <AlertTriangle className="w-3 h-3"/>
 {formatHoursMissing(member.hoursMissing)} sin actividad
 </Badge>
 {member.lastEntryHour !== null && (
 <Badge variant="outline"className="text-xs gap-1 text-muted-foreground">
 <Clock className="w-3 h-3"/>
 Ultima entrada: {member.lastEntryHour}:00
 </Badge>
 )}
 {member.lastEntryHour === null && (
 <Badge variant="outline"className="text-xs gap-1 text-red-500 border-red-300">
 <AlertTriangle className="w-3 h-3"/>
 Sin entradas hoy
 </Badge>
 )}
 </div>
 </div>
 </div>

 <div className="text-right flex flex-col items-end gap-3">
 {/* Live countdown */}
 <div className="bg-red-950 border border-red-500/50 px-4 py-2">
 <p className="text-[10px] text-red-400 font-mono uppercase tracking-widest mb-0.5">
 Tiempo desaparecido
 </p>
 <p className="text-2xl font-mono font-black text-red-400 tabular-nums tracking-tight">
 {formatCountdown(alert.triggered_at)}
 </p>
 </div>

 {/* Acknowledge button */}
 {member.userId !== userId && (
 <Button
 onClick={() => handleAcknowledge(alert.id)}
 disabled={acknowledging === alert.id}
 size="sm"className="bg-primary text-primary-foreground font-mono text-xs border-0">
 {acknowledging === alert.id ? (
 <Loader2 className="w-4 h-4 animate-spin"/>
 ) : (
 <>
 <Eye className="w-4 h-4 mr-1"/>
 Confirmar visto
 </>
 )}
 </Button>
 )}
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 )}

 {/* Team Member Status Board */}
 <div className="mb-8">
 <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4 flex items-center gap-2">
 <Users className="w-3 h-3"/>
 Estado del equipo
 </h2>

 {members.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-12">
 <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
 <Users className="w-8 h-8 text-primary/40"/>
 </div>
 <p className="text-sm text-muted-foreground">
 No hay miembros en la organizacion
 </p>
 </div>
 ) : (
 <div className="space-y-2">
 {members.map((member) => {
 const isAlerted = !!member.activeAlert;
 const isDanger = member.isMissing;
 const isWarning = member.isInWorkHours && member.hoursMissing >= 2 && !member.isMissing;
 const isSafe = member.isInWorkHours && !isDanger && !isWarning;
 const isOffline = !member.isInWorkHours;

 return (
 <Card
 key={member.userId}
 className={cn(
"border border-border transition-colors hover:border-primary/30",
 isAlerted &&"border-red-500/40 bg-red-500/5",
 isDanger && !isAlerted &&"border-amber-500/30 bg-amber-500/5",
 )}
 >
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div className="relative">
 <Avatar className="w-9 h-9 ring-1 ring-border">
 <AvatarImage src={member.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(member.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 {/* Status dot */}
 <span
 className={cn(
"absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
 isSafe &&"bg-green-500",
 isWarning &&"bg-amber-500",
 isDanger &&"bg-red-500",
 isOffline &&"bg-slate-400",
 )}
 />
 </div>

 <div className="flex-1 min-w-0">
 <p className="text-sm font-semibold truncate">
 {member.profile.full_name ?? member.profile.email}
 </p>
 <p className="text-xs text-muted-foreground">
 {isOffline
 ?"Fuera de horario laboral": member.lastEntryHour !== null
 ?`Ultima entrada: ${member.lastEntryHour}:00`:"Sin entradas hoy"}
 </p>
 </div>

 <div className="flex items-center gap-2 shrink-0">
 {member.isInWorkHours && member.hoursMissing > 0 && (
 <span
 className={cn(
"text-xs font-medium tabular-nums tracking-tight",
 member.hoursMissing >= 4 &&"text-red-500",
 member.hoursMissing >= 2 && member.hoursMissing < 4 &&"text-amber-500",
 member.hoursMissing < 2 &&"text-muted-foreground",
 )}
 >
 {formatHoursMissing(member.hoursMissing)} sin log
 </span>
 )}

 {isAlerted && (
 <Badge variant="destructive"className="text-[10px] gap-1">
 <Radio className="w-3 h-3"/>
 ALERTA
 </Badge>
 )}
 {isSafe && (
 <Badge variant="secondary"className="text-[10px] gap-1 text-green-600 dark:text-green-400">
 <CheckCircle2 className="w-3 h-3"/>
 Activo
 </Badge>
 )}
 {isWarning && (
 <Badge variant="outline"className="text-[10px] gap-1 text-amber-600 border-amber-300 dark:text-amber-400">
 <Clock className="w-3 h-3"/>
 Advertencia
 </Badge>
 )}
 {isOffline && (
 <Badge variant="outline"className="text-[10px] text-muted-foreground">
 Offline
 </Badge>
 )}
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 )}
 </div>

 {/* Alert History */}
 <div>
 <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4 flex items-center gap-2">
 <History className="w-3 h-3"/>
 Historial de alertas
 </h2>

 {pastAlerts.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-12">
 <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
 <Timer className="w-8 h-8 text-primary/40"/>
 </div>
 <p className="text-sm text-muted-foreground">
 No hay alertas pasadas. El equipo esta al dia.
 </p>
 </div>
 ) : (
 <div className="space-y-2">
 {pastAlerts.map((alert) => (
 <Card
 key={alert.id}
 className="border border-border transition-colors hover:border-primary/30">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <Avatar className="w-8 h-8 ring-1 ring-border">
 <AvatarImage src={alert.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px]">
 {getInitials(alert.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="text-sm">
 <span className="font-semibold">
 {alert.profile?.full_name ??"Desconocido"}
 </span>
 <span className="text-muted-foreground">
 {""}— {alert.hours_missing}h sin actividad
 </span>
 </p>
 <div className="flex items-center gap-2 mt-1 flex-wrap">
 <span className="text-[10px] text-muted-foreground">
 {format(new Date(alert.triggered_at),"d MMM, h:mm a", { locale: es })}
 </span>
 {alert.acknowledged_by && alert.acknowledger_profile && (
 <>
 <span className="text-[10px] text-muted-foreground">-</span>
 <Badge variant="secondary"className="text-[10px] gap-1">
 <Eye className="w-3 h-3 text-primary"/>
 Visto por {alert.acknowledger_profile.full_name?.split("")[0] ??"?"}
 </Badge>
 </>
 )}
 {alert.resolved_at && (
 <Badge variant="outline"className="text-[10px] gap-1 tabular-nums tracking-tight">
 <CheckCircle2 className="w-3 h-3 text-green-500"/>
 Resuelto
 </Badge>
 )}
 </div>
 </div>
 <Badge
 className={cn(
"text-[10px]",
 alert.status ==="acknowledged"&&
"bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
 alert.status ==="resolved"&&
"bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400")}
 >
 {alert.status ==="acknowledged"?"Confirmado":"Resuelto"}
 </Badge>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 )}
 </div>
 </div>
 );
}
