"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
 AlertTriangle,
 Clock,
 Eye,
 EyeOff,
 FileX,
 Ghost,
 MessageSquareOff,
 ShieldOff,
 Skull,
 Users,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

interface MemberShame {
 userId: string;
 profile: Profile | null;
 hoursLogged: number;
 hoursWithProof: number;
 lastEntryAt: string | null; // ISO timestamp of most recent logged_at
 hasCloseout: boolean;
 hasStandup: boolean;
 shameTag: string;
 shameLevel:"ghost"|"slacker"|"behind"|"on_track"|"machine";
}

/* ------------------------------------------------------------------ */
/* Shame tag logic */
/* ------------------------------------------------------------------ */

function classifyMember(hours: number, lastAt: string | null): {
 tag: string;
 level: MemberShame["shameLevel"];
} {
 if (hours === 0) return { tag:"FANTASMA", level:"ghost"};
 if (hours <= 2) return { tag:"VAGO", level:"slacker"};
 if (hours <= 5) return { tag:"ATRASADO", level:"behind"};
 if (hours <= 7) return { tag:"EN CAMINO", level:"on_track"};
 return { tag:"MAQUINA", level:"machine"};
}

/* ------------------------------------------------------------------ */
/* Live ticking counter component */
/* ------------------------------------------------------------------ */

function LiveCounter({ since }: { since: string | null }) {
 const [elapsed, setElapsed] = useState("");

 useEffect(() => {
 if (!since) {
 setElapsed("SIN REGISTROS");
 return;
 }

 function tick() {
 const diff = Math.max(0, Date.now() - new Date(since!).getTime());
 const totalSec = Math.floor(diff / 1000);
 const h = Math.floor(totalSec / 3600);
 const m = Math.floor((totalSec % 3600) / 60);
 const s = totalSec % 60;
 setElapsed(
`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
 }

 tick();
 const id = setInterval(tick, 1000);
 return () => clearInterval(id);
 }, [since]);

 return (
 <span className="font-mono tabular-nums tracking-tight">
 {elapsed}
 </span>
 );
}

/* ------------------------------------------------------------------ */
/* Page */
/* ------------------------------------------------------------------ */

export default function ShamePage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [members, setMembers] = useState<MemberShame[]>([]);
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
 if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
 }

 // 2. Today's time entries for whole org
 const { data: entries } = await supabase
 .from("time_entries")
 .select("user_id, proof_urls, logged_at")
 .eq("org_id", orgId)
 .eq("date", today);

 // 3. Today's closeouts
 const { data: closeouts } = await supabase
 .from("daily_closeouts")
 .select("user_id")
 .eq("org_id", orgId)
 .eq("date", today);

 // 4. Today's standups
 const { data: standups } = await supabase
 .from("standups")
 .select("user_id")
 .eq("org_id", orgId)
 .eq("date", today);

 // Build lookup sets
 const closeoutSet = new Set((closeouts ?? []).map((c) => c.user_id as string));
 const standupSet = new Set((standups ?? []).map((s) => s.user_id as string));

 // Group entries by user
 const entryMap = new Map<string, { count: number; withProof: number; lastAt: string | null }>();
 for (const e of entries ?? []) {
 const uid = e.user_id as string;
 const cur = entryMap.get(uid) ?? { count: 0, withProof: 0, lastAt: null };
 cur.count++;
 if (e.proof_urls && (e.proof_urls as string[]).length > 0) cur.withProof++;
 const loggedAt = e.logged_at as string;
 if (!cur.lastAt || loggedAt > cur.lastAt) cur.lastAt = loggedAt;
 entryMap.set(uid, cur);
 }

 // Build member list
 const result: MemberShame[] = userIds.map((uid) => {
 const stats = entryMap.get(uid) ?? { count: 0, withProof: 0, lastAt: null };
 const classification = classifyMember(stats.count, stats.lastAt);
 return {
 userId: uid,
 profile: profileMap.get(uid) ?? null,
 hoursLogged: stats.count,
 hoursWithProof: stats.withProof,
 lastEntryAt: stats.lastAt,
 hasCloseout: closeoutSet.has(uid),
 hasStandup: standupSet.has(uid),
 shameTag: classification.tag,
 shameLevel: classification.level,
 };
 });

 // Sort: worst first (fewest hours, then longest since last entry)
 result.sort((a, b) => {
 if (a.hoursLogged !== b.hoursLogged) return a.hoursLogged - b.hoursLogged;
 // If same hours, whoever has NO entry or older entry goes first
 if (!a.lastEntryAt && b.lastEntryAt) return -1;
 if (a.lastEntryAt && !b.lastEntryAt) return 1;
 if (a.lastEntryAt && b.lastEntryAt) return a.lastEntryAt < b.lastEntryAt ? -1 : 1;
 return 0;
 });

 setMembers(result);
 setLoading(false);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 /* ---------- initial load + 30s refresh ---------- */

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
 .channel("shame-entries")
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

 /* ---------- computed team stats ---------- */

 const totalHours = members.reduce((s, m) => s + m.hoursLogged, 0);
 const teamAvg = members.length > 0 ? (totalHours / members.length).toFixed(1) :"0";
 const worst = members.length > 0 ? members[0] : null;

 /* ---------- render ---------- */

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-2.5 mb-1">
 <AlertTriangle className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Muro de la Vergüenza
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground mb-8">
 Transparencia total. Todos los nombres. Sin excusas. Actualización cada 30s.
 </p>

 {/* Team stats strip */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Horas equipo
 </p>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
 {totalHours}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Promedio
 </p>
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
 {teamAvg}h
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
 <div className="bg-red-500/10 border border-red-500/30 p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/60">
 Eslabon mas debil
 </p>
 <p className="text-sm font-mono font-bold tracking-tight mt-1 text-red-500 truncate">
 {worst?.profile?.full_name ??"---"}
 </p>
 </div>
 </div>

 {/* Section label */}
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Ranking de hoy &mdash; peor primero
 </p>

 {/* Member cards */}
 {members.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Ghost className="w-7 h-7 text-muted-foreground"/>
 </div>
 <p className="text-sm text-muted-foreground font-mono">
 No hay miembros en la organizacion.
 </p>
 </div>
 ) : (
 <div className="space-y-2">
 {members.map((m) => {
 const isGhost = m.shameLevel ==="ghost";
 const isSlacker = m.shameLevel ==="slacker";
 const isBehind = m.shameLevel ==="behind";
 const isGood = m.shameLevel ==="on_track";
 const isMachine = m.shameLevel ==="machine";
 const isMe = m.userId === userId;

 // Card border classes based on shame level
 const borderClass = cn(
"border transition-colors",
 isGhost &&"border-2 border-red-500/60 animate-pulse bg-red-500/5",
 isSlacker &&"border-2 border-red-500/40 bg-red-500/3",
 isBehind &&"border-2 border-amber-500/40",
 isGood &&"border border-green-500/30",
 isMachine &&"border border-green-500/30 bg-green-500/3");

 // Name size based on shame — worse = bigger name for more shame
 const nameClass = cn(
"font-mono font-bold tracking-tight",
 isGhost &&"text-lg sm:text-xl text-red-500",
 isSlacker &&"text-base sm:text-lg text-red-400",
 isBehind &&"text-sm sm:text-base text-amber-500",
 isGood &&"text-sm text-foreground",
 isMachine &&"text-sm text-green-600 dark:text-green-400");

 // Hours number size
 const hoursClass = cn(
"font-mono font-black tabular-nums tracking-tight",
 isGhost &&"text-3xl sm:text-4xl text-red-500",
 isSlacker &&"text-2xl sm:text-3xl text-red-400",
 isBehind &&"text-xl sm:text-2xl text-amber-500",
 isGood &&"text-lg text-foreground",
 isMachine &&"text-lg text-green-600 dark:text-green-400");

 // Tag styling
 const tagClass = cn(
"font-mono text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border",
 isGhost &&"text-red-500 border-red-500/40 bg-red-500/10",
 isSlacker &&"text-red-400 border-red-400/30 bg-red-400/10",
 isBehind &&"text-amber-500 border-amber-500/30 bg-amber-500/10",
 isGood &&"text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10",
 isMachine &&"text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10");

 // Padding scales with shame
 const paddingClass = cn(
 isGhost &&"p-5 sm:p-6",
 isSlacker &&"p-4 sm:p-5",
 isBehind &&"p-3 sm:p-4",
 (isGood || isMachine) &&"p-3");

 // Shame icon
 const ShameIcon =
 isGhost ? Skull :
 isSlacker ? Ghost :
 isBehind ? Clock :
 isMachine ? Eye :
 Eye;

 return (
 <div key={m.userId} className={cn(borderClass, paddingClass)}>
 {/* Top row: avatar + name + tag */}
 <div className="flex items-start gap-3">
 {/* Avatar — bigger for worse offenders */}
 <Avatar
 className={cn(
"ring-1 ring-border shrink-0",
 isGhost &&"w-12 h-12 sm:w-14 sm:h-14 ring-red-500/40",
 isSlacker &&"w-10 h-10 sm:w-12 sm:h-12 ring-red-400/30",
 isBehind &&"w-9 h-9 sm:w-10 sm:h-10 ring-amber-500/30",
 (isGood || isMachine) &&"w-8 h-8")}
 >
 <AvatarImage src={m.profile?.avatar_url ?? undefined} />
 <AvatarFallback
 className={cn(
"font-mono text-xs",
 isGhost &&"text-sm bg-red-500/20 text-red-500",
 isSlacker &&"bg-red-400/10 text-red-400")}
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
 <span className={tagClass}>{m.shameTag}</span>
 </div>

 {/* Missing items row */}
 <div className="flex flex-wrap items-center gap-2 mt-1.5">
 {!m.hasStandup && (
 <span className="flex items-center gap-1 text-[10px] font-mono text-red-400/80">
 <MessageSquareOff className="w-3 h-3"/>
 Sin standup
 </span>
 )}
 {!m.hasCloseout && (
 <span className="flex items-center gap-1 text-[10px] font-mono text-red-400/80">
 <FileX className="w-3 h-3"/>
 Sin cierre
 </span>
 )}
 {m.hoursLogged > 0 && m.hoursWithProof === 0 && (
 <span className="flex items-center gap-1 text-[10px] font-mono text-amber-500/80">
 <ShieldOff className="w-3 h-3"/>
 Sin evidencia
 </span>
 )}
 {m.hoursLogged > 0 && m.hoursWithProof > 0 && m.hoursWithProof < m.hoursLogged && (
 <span className="flex items-center gap-1 text-[10px] font-mono text-amber-500/80">
 <EyeOff className="w-3 h-3"/>
 {m.hoursWithProof}/{m.hoursLogged} con prueba
 </span>
 )}
 </div>
 </div>

 {/* Right side: hours + counter */}
 <div className="text-right shrink-0">
 <p className={hoursClass}>
 {m.hoursLogged}
 </p>
 <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
 {m.hoursLogged === 1 ?"hora":"horas"}
 </p>
 </div>
 </div>

 {/* Time since last entry — live ticking */}
 <div
 className={cn(
"mt-2 flex items-center justify-between",
 (isGhost || isSlacker) &&"mt-3")}
 >
 <div className="flex items-center gap-1.5">
 <ShameIcon
 className={cn(
"w-3.5 h-3.5",
 isGhost &&"text-red-500",
 isSlacker &&"text-red-400",
 isBehind &&"text-amber-500",
 (isGood || isMachine) &&"text-muted-foreground")}
 />
 <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
 Desde ultimo registro
 </p>
 </div>
 <div
 className={cn(
"text-sm",
 isGhost &&"text-red-500 text-base font-bold",
 isSlacker &&"text-red-400 font-semibold",
 isBehind &&"text-amber-500",
 (isGood || isMachine) &&"text-muted-foreground")}
 >
 <LiveCounter since={m.lastEntryAt} />
 </div>
 </div>
 </div>
 );
 })}
 </div>
 )}

 {/* Bottom oppressive message */}
 <div className="mt-10 text-center py-6 border-t border-border/30">
 <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/25">
 Todos ven. Todos saben. No hay donde esconderse.
 </p>
 </div>
 </div>
 );
}
