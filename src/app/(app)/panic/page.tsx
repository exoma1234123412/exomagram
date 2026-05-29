"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TimeEntry, PanicEvent } from "@/lib/types/database";
import { CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import { cn, getInitials } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Siren, ShieldCheck, Clock, Trophy, AlertTriangle, TrendingUp, User } from "lucide-react";

type PanicWithProfile = PanicEvent & {
 profiles: Profile;
 rescuer_profile?: Profile | null;
};

export default function PanicPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [events, setEvents] = useState<PanicWithProfile[]>([]);
 const [contextEntries, setContextEntries] = useState<Record<string, (TimeEntry & { profiles: Profile })[]>>({});
 const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
 const [loading, setLoading] = useState(true);
 const [dialogOpen, setDialogOpen] = useState(false);
 const [reason, setReason] = useState("");
 const [submitting, setSubmitting] = useState(false);
 const [now, setNow] = useState(Date.now());
 const supabase = createClient();

 // Tick every second for countdown timers
 useEffect(() => {
 const interval = setInterval(() => setNow(Date.now()), 1000);
 return () => clearInterval(interval);
 }, []);

 const loadEvents = useCallback(async () => {
 if (!orgId) return;

 // Load all members for profile map
 const { data: memberData } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 const pMap = new Map<string, Profile>();
 if (memberData) {
 for (const m of memberData) pMap.set(m.user_id, m.profiles);
 }
 setProfileMap(pMap);

 // Load panic events
 const { data: panicData } = await supabase
 .from("panic_events")
 .select("*")
 .eq("org_id", orgId)
 .order("created_at", { ascending: false })
 .limit(50);

 if (panicData) {
 const enriched: PanicWithProfile[] = panicData.map((p) => ({
 ...p,
 profiles: pMap.get(p.user_id) ?? { id: p.user_id, email:"", full_name: null, avatar_url: null, role: null, timezone:"America/Monterrey", created_at:"", updated_at:""},
 rescuer_profile: p.rescued_by ? pMap.get(p.rescued_by) ?? null : null,
 }));
 setEvents(enriched);

 // Load last 3 entries for each active panic user
 const activeUsers = panicData.filter((p) => p.status ==="active").map((p) => p.user_id);
 const uniqueUsers = [...new Set(activeUsers)] as string[];
 const entriesMap: Record<string, (TimeEntry & { profiles: Profile })[]> = {};

 for (const uid of uniqueUsers) {
 const { data: entryData } = await supabase
 .from("time_entries")
 .select("*, profiles(*)")
 .eq("user_id", uid)
 .eq("org_id", orgId)
 .order("created_at", { ascending: false })
 .limit(3);
 if (entryData) {
 entriesMap[uid] = entryData as (TimeEntry & { profiles: Profile })[];
 }
 }
 setContextEntries(entriesMap);
 }

 setLoading(false);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId) { setLoading(false); return; }
 loadEvents();

 // Real-time subscription
 const channel = supabase
 .channel("panic_events_realtime")
 .on("postgres_changes", {
 event:"*",
 schema:"public",
 table:"panic_events",
 filter:`org_id=eq.${orgId}`,
 }, () => loadEvents())
 .subscribe();

 return () => { supabase.removeChannel(channel); };
 }, [orgLoading, orgId, loadEvents]); // eslint-disable-line react-hooks/exhaustive-deps

 async function handlePanic() {
 if (!orgId || !userId) return;
 setSubmitting(true);

 await supabase.from("panic_events").insert({
 user_id: userId,
 org_id: orgId,
 reason: reason.trim() || null,
 status:"active",
 });

 setReason("");
 setDialogOpen(false);
 setSubmitting(false);
 await loadEvents();
 }

 async function handleRescue(eventId: string) {
 if (!userId) return;

 await supabase
 .from("panic_events")
 .update({
 status:"rescued",
 rescued_by: userId,
 rescued_at: new Date().toISOString(),
 })
 .eq("id", eventId);

 await loadEvents();
 }

 // Derived data
 const activeEvents = events.filter((e) => e.status ==="active");
 const resolvedEvents = events.filter((e) => e.status ==="rescued"|| e.status ==="resolved");
 const hasActivePanic = activeEvents.some((e) => e.user_id === userId);

 // Stats
 const thisMonth = new Date();
 const monthStart = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1).toISOString();
 const monthlyEvents = events.filter((e) => e.created_at >= monthStart);
 const totalPanicsMonth = monthlyEvents.length;

 const rescuedEvents = events.filter((e) => e.rescued_at && e.rescued_by);
 const avgResponseMs = rescuedEvents.length > 0
 ? rescuedEvents.reduce((sum, e) => {
 const diff = new Date(e.rescued_at!).getTime() - new Date(e.created_at).getTime();
 return sum + diff;
 }, 0) / rescuedEvents.length
 : 0;
 const avgResponseMin = Math.round(avgResponseMs / 1000 / 60);

 // Hero count (who rescues the most)
 const rescueCount = new Map<string, number>();
 for (const e of rescuedEvents) {
 rescueCount.set(e.rescued_by!, (rescueCount.get(e.rescued_by!) ?? 0) + 1);
 }
 const topRescuer = rescueCount.size > 0
 ? [...rescueCount.entries()].sort((a, b) => b[1] - a[1])[0]
 : null;

 // Who panics the most
 const panicCount = new Map<string, number>();
 for (const e of events) {
 panicCount.set(e.user_id, (panicCount.get(e.user_id) ?? 0) + 1);
 }
 const topPanicker = panicCount.size > 0
 ? [...panicCount.entries()].sort((a, b) => b[1] - a[1])[0]
 : null;

 function formatElapsed(createdAt: string): string {
 const diffMs = now - new Date(createdAt).getTime();
 const totalSeconds = Math.floor(diffMs / 1000);
 const hours = Math.floor(totalSeconds / 3600);
 const minutes = Math.floor((totalSeconds % 3600) / 60);
 const seconds = totalSeconds % 60;

 if (hours > 0) {
 return`${hours}h ${String(minutes).padStart(2,"0")}m ${String(seconds).padStart(2,"0")}s`;
 }
 return`${minutes}m ${String(seconds).padStart(2,"0")}s`;
 }

 function formatResponseTime(createdAt: string, rescuedAt: string): string {
 const diffMs = new Date(rescuedAt).getTime() - new Date(createdAt).getTime();
 const totalMinutes = Math.round(diffMs / 1000 / 60);
 if (totalMinutes < 1) return"<1 min";
 if (totalMinutes < 60) return`${totalMinutes} min`;
 const h = Math.floor(totalMinutes / 60);
 const m = totalMinutes % 60;
 return`${h}h ${m}m`;
 }

 if (loading || orgLoading) {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
 </div>
 );
 }

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Siren className="w-6 h-6 text-primary"/>
 Botón de Pánico
 </h1>
 <p className="text-muted-foreground text-sm">
 SOS inmediato cuando estás bloqueado o abrumado. Tu equipo puede rescatarte.
 </p>
 </div>

 {/* THE PANIC BUTTON */}
 <div className="flex justify-center mb-8">
 <button
 onClick={() => setDialogOpen(true)}
 disabled={hasActivePanic}
 className={cn(
"relative w-48 h-48 rounded-full transition-all duration-300 focus:outline-none",
 hasActivePanic
 ?"bg-red-900/30 border-4 border-red-800/40 cursor-not-allowed opacity-60":"bg-gradient-to-br from-red-500 to-red-700 border-4 border-red-400/50 shadow-2xl shadow-red-600/40 hover:shadow-red-500/60 hover:scale-105 active:scale-95 animate-pulse-glow cursor-pointer")}
 >
 <div className={cn(
"absolute inset-0 rounded-full",
 !hasActivePanic &&"animate-ping opacity-20 bg-red-500")} />
 <div className="relative flex flex-col items-center justify-center gap-2">
 <Siren className={cn(
"w-14 h-14",
 hasActivePanic ?"text-red-400/50":"text-white")} />
 <span className={cn(
"text-2xl font-black tracking-wider",
 hasActivePanic ?"text-red-400/50":"text-white")}>
 PÁNICO
 </span>
 </div>
 </button>
 </div>

 {hasActivePanic && (
 <p className="text-center text-sm text-red-400 mb-8">
 Ya tienes un pánico activo. Espera a que alguien te rescate.
 </p>
 )}

 {/* Panic Dialog */}
 <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-red-500">
 <AlertTriangle className="w-5 h-5"/>
 Activar Pánico
 </DialogTitle>
 <DialogDescription>
 Tu equipo será notificado inmediatamente. Describe brevemente qué pasa (opcional).
 </DialogDescription>
 </DialogHeader>
 <div className="py-2">
 <Input
 placeholder="Estoy bloqueado con... (opcional)"value={reason}
 onChange={(e) => setReason(e.target.value)}
 autoFocus
 />
 </div>
 <DialogFooter>
 <Button
 variant="outline"className=""onClick={() => setDialogOpen(false)}
 >
 Cancelar
 </Button>
 <Button
 onClick={handlePanic}
 disabled={submitting}
 className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white border-0 shadow-red-600/25">
 {submitting ?"Enviando...":"Activar Pánico"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Active Panic Events */}
 {activeEvents.length > 0 && (
 <div className="mb-8">
 <h2 className="text-lg font-semibold tracking-tight mb-4 flex items-center gap-2">
 <span className="relative flex h-3 w-3">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"/>
 <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"/>
 </span>
 Pánicos activos
 </h2>
 <div className="space-y-4">
 {activeEvents.map((event) => {
 const userEntries = contextEntries[event.user_id] ?? [];

 return (
 <Card
 key={event.id}
 className="border-2 border-red-500/40 bg-red-500/5 transition-all duration-300 hover:shadow-red-500/10">
 <CardContent className="p-5">
 <div className="flex items-start justify-between gap-4">
 <div className="flex items-start gap-3">
 <Avatar className="w-10 h-10 ring-2 ring-red-500/30">
 <AvatarImage src={event.profiles?.avatar_url ?? undefined} />
 <AvatarFallback className="text-sm bg-red-100 dark:bg-red-900/40 text-red-600">
 {getInitials(event.profiles?.full_name)}
 </AvatarFallback>
 </Avatar>
 <div>
 <p className="font-semibold text-sm">
 {event.profiles?.full_name ??"Miembro"}
 </p>
 <p className="text-xs text-muted-foreground">
 {format(new Date(event.created_at),"d MMM, h:mm a", { locale: es })}
 </p>
 {event.reason && (
 <p className="text-sm mt-2 text-red-600 dark:text-red-400 font-medium">
 &ldquo;{event.reason}&rdquo;
 </p>
 )}
 </div>
 </div>
 <div className="text-right flex flex-col items-end gap-2">
 <Badge variant="destructive"className="text-xs tabular-nums tracking-tight">
 <Clock className="w-3 h-3 mr-1"/>
 {formatElapsed(event.created_at)}
 </Badge>
 {event.user_id !== userId && (
 <Button
 onClick={() => handleRescue(event.id)}
 size="sm"className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white border-0 shadow-green-600/25">
 <ShieldCheck className="w-4 h-4 mr-1"/>
 Rescatar
 </Button>
 )}
 </div>
 </div>

 {/* Context: last 3 entries */}
 {userEntries.length > 0 && (
 <div className="mt-4 pt-4 border-t border-red-500/20">
 <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">
 Últimas entradas (contexto)
 </p>
 <div className="space-y-1.5">
 {userEntries.map((entry) => {
 const cat = CATEGORIES[entry.category];
 return (
 <div
 key={entry.id}
 className="flex items-center gap-2 text-sm bg-accent/30 px-3 py-1.5">
 <span>{cat?.emoji}</span>
 <span className="flex-1 truncate">{entry.title}</span>
 <span className="text-xs text-muted-foreground tabular-nums">
 {entry.date} {entry.hour}:00
 </span>
 </div>
 );
 })}
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 )}

 {/* Team Stats */}
 <div className="mb-8">
 <h2 className="text-lg font-semibold tracking-tight mb-4">Estadísticas del equipo</h2>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="bg-accent/40 p-4 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight">{totalPanicsMonth}</p>
 <p className="text-xs text-muted-foreground mt-1">Pánicos este mes</p>
 </div>
 <div className="bg-accent/40 p-4 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight">
 {avgResponseMin > 0 ?`${avgResponseMin}m`:"—"}
 </p>
 <p className="text-xs text-muted-foreground mt-1">Tiempo respuesta</p>
 </div>
 <div className="bg-accent/40 p-4 text-center">
 <div className="flex justify-center mb-1">
 {topRescuer ? (
 <Avatar className="w-7 h-7 ring-2 ring-background">
 <AvatarImage src={profileMap.get(topRescuer[0])?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[10px]">
 {getInitials(profileMap.get(topRescuer[0])?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 ) : (
 <Trophy className="w-6 h-6 text-muted-foreground"/>
 )}
 </div>
 <p className="text-xs font-medium truncate">
 {topRescuer ? (profileMap.get(topRescuer[0])?.full_name?.split("")[0] ??"?") :"—"}
 </p>
 <p className="text-xs text-muted-foreground">
 {topRescuer ?`${topRescuer[1]} rescates`:"Héroe rescate"}
 </p>
 </div>
 <div className="bg-accent/40 p-4 text-center">
 <div className="flex justify-center mb-1">
 {topPanicker ? (
 <Avatar className="w-7 h-7 ring-2 ring-background">
 <AvatarImage src={profileMap.get(topPanicker[0])?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[10px]">
 {getInitials(profileMap.get(topPanicker[0])?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 ) : (
 <User className="w-6 h-6 text-muted-foreground"/>
 )}
 </div>
 <p className="text-xs font-medium truncate">
 {topPanicker ? (profileMap.get(topPanicker[0])?.full_name?.split("")[0] ??"?") :"—"}
 </p>
 <p className="text-xs text-muted-foreground">
 {topPanicker ?`${topPanicker[1]} pánicos`:"Más pánicos"}
 </p>
 </div>
 </div>
 </div>

 {/* Resolved history */}
 <div>
 <h2 className="text-lg font-semibold tracking-tight mb-4">Historial de rescates</h2>
 {resolvedEvents.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-12">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center mb-4">
 <ShieldCheck className="w-8 h-8 text-primary"/>
 </div>
 <p className="text-sm text-muted-foreground">
 Aún no hay rescates registrados.
 </p>
 </div>
 ) : (
 <div className="space-y-2">
 {resolvedEvents.map((event) => (
 <Card
 key={event.id}
 className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage src={event.profiles?.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(event.profiles?.full_name)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="text-sm">
 <span className="font-semibold">{event.profiles?.full_name ??"?"}</span>
 {event.reason && (
 <span className="text-muted-foreground"> — {event.reason}</span>
 )}
 </p>
 <div className="flex items-center gap-2 mt-1 flex-wrap">
 <span className="text-[10px] text-muted-foreground">
 {format(new Date(event.created_at),"d MMM, h:mm a", { locale: es })}
 </span>
 {event.rescued_by && event.rescuer_profile && (
 <>
 <span className="text-[10px] text-muted-foreground">-</span>
 <Badge variant="secondary"className="text-[10px] gap-1">
 <ShieldCheck className="w-3 h-3 text-green-500"/>
 {event.rescuer_profile.full_name?.split("")[0] ??"?"}
 </Badge>
 </>
 )}
 {event.rescued_at && (
 <Badge variant="outline"className="text-[10px] tabular-nums tracking-tight gap-1">
 <TrendingUp className="w-3 h-3"/>
 {formatResponseTime(event.created_at, event.rescued_at)}
 </Badge>
 )}
 </div>
 </div>
 <Badge
 variant={event.status ==="rescued"?"secondary":"outline"}
 className="text-xs">
 {event.status ==="rescued"?"Rescatado":"Resuelto"}
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
