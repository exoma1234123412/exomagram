"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, getInitials, cn } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
 AlertTriangle,
 Send,
 MessageSquare,
 Skull,
 Clock,
 Bot,
 Loader2,
} from "lucide-react";

interface ConfessionEntry {
 id: string;
 user_id: string;
 new_data: {
 confession: string;
 week_start: string;
 auto_generated: boolean;
 };
 created_at: string;
 profile?: Profile;
}

function getWeekStart(dateStr: string): string {
 const d = new Date(dateStr +"T12:00:00");
 const day = d.getDay();
 const diff = day === 0 ? 6 : day - 1; // Monday = start
 d.setDate(d.getDate() - diff);
 return d.toISOString().split("T")[0];
}

function isFriday(): boolean {
 const now = new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 return now.getDay() === 5;
}

function isPastFridayDeadline(): boolean {
 const now = new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 return now.getDay() === 5 && now.getHours() >= 18;
}

export default function ConfessionPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [confessions, setConfessions] = useState<ConfessionEntry[]>([]);
 const [myConfession, setMyConfession] = useState<ConfessionEntry | null>(null);
 const [text, setText] = useState("");
 const [submitting, setSubmitting] = useState(false);
 const [loading, setLoading] = useState(true);

 const today = getTodayMTY();
 const weekStart = getWeekStart(today);

 const loadConfessions = useCallback(async () => {
 if (!orgId) return;

 // Load this week's confessions from audit_log
 const { data: logs } = await supabase
 .from("audit_log")
 .select("id, user_id, new_data, created_at")
 .eq("org_id", orgId)
 .eq("action","entry_created")
 .eq("target_type","confession")
 .order("created_at", { ascending: false });

 // Filter to current week
 const weekConfessions = (logs ?? []).filter((l) => {
 const nd = l.new_data as ConfessionEntry["new_data"] | null;
 return nd?.week_start === weekStart;
 });

 // Load profiles
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 const profileMap = new Map<string, Profile>();
 for (const m of members ?? []) {
 if (m.profiles)
 profileMap.set(m.user_id, m.profiles as unknown as Profile);
 }

 const enriched: ConfessionEntry[] = weekConfessions.map((c) => ({
 id: c.id,
 user_id: c.user_id,
 new_data: c.new_data as ConfessionEntry["new_data"],
 created_at: c.created_at,
 profile: profileMap.get(c.user_id),
 }));

 setConfessions(enriched);
 setMyConfession(enriched.find((c) => c.user_id === userId) ?? null);
 setLoading(false);
 }, [orgId, userId, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (!orgId) return;
 loadConfessions();
 }, [orgId, loadConfessions]);

 async function submitConfession() {
 if (!orgId || !userId || text.trim().length < 20) return;
 setSubmitting(true);

 await supabase.from("audit_log").insert({
 org_id: orgId,
 user_id: userId,
 action:"entry_created",
 target_type:"confession",
 new_data: {
 confession: text.trim(),
 week_start: weekStart,
 auto_generated: false,
 },
 });

 setText("");
 await loadConfessions();
 setSubmitting(false);
 }

 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="flex flex-col items-center gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">
 Cargando...
 </p>
 </div>
 </div>
 );
 }

 const showForm = !myConfession && (isFriday() || confessions.length === 0);
 const pastDeadline = isPastFridayDeadline();

 return (
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Skull className="w-6 h-6 text-primary"/>
 Confesión del Viernes
 </h1>
 <p className="text-muted-foreground text-sm mt-1">
 Cada viernes, confiesa lo que hiciste mal esta semana. Todo el equipo
 lo ve.
 </p>
 </div>

 {/* Auto-generation warning */}
 {!myConfession && (
 <div className="mb-6 flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
 <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"/>
 <div>
 <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
 Si no confiesas antes del viernes a las 6pm, Claude generará una
 confesión por ti basada en tus datos.
 </p>
 {pastDeadline && (
 <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
 <Clock className="w-3 h-3"/>
 La fecha límite ya pasó
 </p>
 )}
 </div>
 </div>
 )}

 {/* Confession form */}
 {showForm && (
 <Card className="mb-8 border-2 border-dashed">
 <CardContent className="p-6">
 <label className="text-sm font-semibold mb-3 block">
 ¿Qué hiciste mal esta semana?
 </label>
 <Textarea
 placeholder="Escribe tu confesión (mínimo 20 caracteres)..."value={text}
 onChange={(e) => setText(e.target.value)}
 className="min-h-[100px] mb-3"maxLength={1000}
 autoComplete="off"/>
 <div className="flex items-center justify-between">
 <p
 className={cn(
"text-xs",
 text.length < 20
 ?"text-muted-foreground":"text-green-600")}
 >
 {text.length}/1000
 {text.length > 0 && text.length < 20 && (
 <span className="ml-2">
 (mínimo 20 caracteres)
 </span>
 )}
 </p>
 <Button
 className="bg-primary text-white border-0 gap-2"disabled={text.trim().length < 20 || submitting}
 onClick={submitConfession}
 >
 {submitting ? (
 <Loader2 className="w-4 h-4 animate-spin"/>
 ) : (
 <Send className="w-4 h-4"/>
 )}
 {submitting ?"Enviando...":"Confesar"}
 </Button>
 </div>
 </CardContent>
 </Card>
 )}

 {/* My confession */}
 {myConfession && (
 <div className="mb-8">
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
 Tu confesión
 </h2>
 <Card className="border-2 border-primary/20 transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-5">
 <div className="flex items-start gap-3">
 <Avatar className="w-10 h-10 ring-2 ring-background">
 <AvatarImage
 src={myConfession.profile?.avatar_url ?? undefined}
 />
 <AvatarFallback>
 {getInitials(myConfession.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <p className="font-semibold text-sm">
 {myConfession.profile?.full_name ??"Tú"}
 </p>
 {myConfession.new_data.auto_generated && (
 <Badge
 variant="secondary"className="text-[10px] gap-1">
 <Bot className="w-3 h-3"/>
 Auto-generada
 </Badge>
 )}
 </div>
 <p className="text-sm text-muted-foreground italic">
 &ldquo;{myConfession.new_data.confession}&rdquo;
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>
 )}

 {/* Team confessions */}
 {confessions.filter((c) => c.user_id !== userId).length > 0 && (
 <div className="mb-8">
 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
 <MessageSquare className="w-4 h-4"/>
 Confesiones del equipo
 </h2>
 <div className="space-y-3">
 {confessions
 .filter((c) => c.user_id !== userId)
 .map((c) => (
 <Card
 key={c.id}
 className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4">
 <div className="flex items-start gap-3">
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage
 src={c.profile?.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-xs">
 {getInitials(c.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <p className="font-semibold text-sm">
 {c.profile?.full_name ??
 c.profile?.email ??
"?"}
 </p>
 {c.new_data.auto_generated && (
 <Badge
 variant="secondary"className="text-[10px] gap-1">
 <Bot className="w-3 h-3"/>
 Auto
 </Badge>
 )}
 </div>
 <p className="text-sm text-muted-foreground italic">
 &ldquo;{c.new_data.confession}&rdquo;
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 )}

 {/* Empty state */}
 {confessions.length === 0 && !showForm && (
 <div className="flex flex-col items-center justify-center py-16 gap-4">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center">
 <MessageSquare className="w-7 h-7 text-primary/40"/>
 </div>
 <div className="text-center">
 <p className="text-sm text-muted-foreground">
 No hay confesiones esta semana.
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 Vuelve el viernes para confesar.
 </p>
 </div>
 </div>
 )}

 {/* No team confessions yet */}
 {myConfession &&
 confessions.filter((c) => c.user_id !== userId).length === 0 && (
 <div className="flex flex-col items-center justify-center py-12 gap-3">
 <div className="w-12 h-12 bg-primary/10 flex items-center justify-center">
 <Clock className="w-6 h-6 text-primary/40"/>
 </div>
 <p className="text-sm text-muted-foreground text-center">
 Esperando las confesiones del resto del equipo...
 </p>
 </div>
 )}
 </div>
 );
}
