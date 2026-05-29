"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { AccountabilityFlag, Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import {
 Pickaxe,
 Search,
 AlertTriangle,
 Repeat,
 TrendingUp,
 Calendar,
 User,
 MessageSquareWarning,
 Bone,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ExcuseRecord {
 id: string;
 text: string;
 category: string;
 userId: string;
 date: string;
 source:"blocked_entry"|"closeout_blocker"|"flag";
}

interface ProfileMap {
 [userId: string]: { full_name: string | null; avatar_url: string | null };
}

// ─────────────────────────────────────────────
// Excuse categorization
// ─────────────────────────────────────────────

const EXCUSE_CATEGORIES: { keywords: string[]; label: string; emoji: string }[] = [
 { keywords: ["internet","wifi","conexión","conexion","red","lag"], label:"Problemas de Internet", emoji:"📡"},
 { keywords: ["reunión","reunion","meeting","junta","call","llamada"], label:"Exceso de Reuniones", emoji:"📞"},
 { keywords: ["enfermo","doctor","salud","gripe","fiebre","médico","medico"], label:"Problemas de Salud", emoji:"🏥"},
 { keywords: ["sistema","servidor","deploy","bug","error","crash","caído","caido"], label:"Fallas Técnicas", emoji:"💥"},
 { keywords: ["bloqueado","esperando","dependo","dependencia","aprobación","aprobacion","permiso"], label:"Dependencias", emoji:"🔗"},
 { keywords: ["personal","familia","hijo","casa","emergencia"], label:"Asuntos Personales", emoji:"--"},
];

function categorizeExcuse(text: string): { label: string; emoji: string } {
 const lower = text.toLowerCase();
 for (const cat of EXCUSE_CATEGORIES) {
 if (cat.keywords.some((kw) => lower.includes(kw))) {
 return { label: cat.label, emoji: cat.emoji };
 }
 }
 return { label:"Misceláneos", emoji:"--"};
}

function getRepeatBadgeStyle(count: number): string {
 if (count >= 10) return"bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800";
 if (count >= 6) return"bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800";
 if (count >= 3) return"bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800";
 return"text-muted-foreground border-border";
}

function getAgeBorderStyle(date: string): string {
 const days = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
 if (days > 90) return"border-amber-400/40 dark:border-amber-700/40 bg-amber-50/30 dark:bg-amber-950/10";
 if (days > 30) return"border-amber-300/30 dark:border-amber-800/30 bg-amber-50/15 dark:bg-amber-950/5";
 return"";
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function ExcuseArchaeologyPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [excuses, setExcuses] = useState<ExcuseRecord[]>([]);
 const [profiles, setProfiles] = useState<ProfileMap>({});
 const [loading, setLoading] = useState(true);
 const [searchTerm, setSearchTerm] = useState("");

 const loadData = useCallback(async () => {
 if (!orgId) return;
 setLoading(true);

 const [
 { data: flags },
 { data: blockedEntries },
 { data: closeouts },
 { data: orgMembers },
 ] = await Promise.all([
 supabase
 .from("accountability_flags")
 .select("*")
 .eq("org_id", orgId)
 .order("created_at", { ascending: false }),
 supabase
 .from("time_entries")
 .select("id, user_id, date, description, category")
 .eq("org_id", orgId)
 .eq("category","blocked")
 .order("date", { ascending: false }),
 supabase
 .from("daily_closeouts")
 .select("id, user_id, date, blockers")
 .eq("org_id", orgId)
 .not("blockers","is", null)
 .order("date", { ascending: false }),
 supabase
 .from("org_members")
 .select("user_id, profiles(id, full_name, avatar_url)")
 .eq("org_id", orgId),
 ]);

 // Build profile map
 const pMap: ProfileMap = {};
 for (const m of orgMembers ?? []) {
 const p = m.profiles as unknown as Profile;
 if (p) pMap[m.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url };
 }
 setProfiles(pMap);

 // Build excuses
 const allExcuses: ExcuseRecord[] = [];

 // From blocked entries
 for (const entry of blockedEntries ?? []) {
 if (entry.description && entry.description.trim().length > 0) {
 allExcuses.push({
 id:`entry-${entry.id}`,
 text: entry.description.trim(),
 category: categorizeExcuse(entry.description).label,
 userId: entry.user_id,
 date: entry.date,
 source:"blocked_entry",
 });
 }
 }

 // From closeout blockers
 for (const co of closeouts ?? []) {
 if (co.blockers && co.blockers.trim().length > 0) {
 allExcuses.push({
 id:`closeout-${co.id}`,
 text: co.blockers.trim(),
 category: categorizeExcuse(co.blockers).label,
 userId: co.user_id,
 date: co.date,
 source:"closeout_blocker",
 });
 }
 }

 // From flags
 for (const flag of (flags ?? []) as AccountabilityFlag[]) {
 if (flag.details && flag.details.trim().length > 0) {
 allExcuses.push({
 id:`flag-${flag.id}`,
 text: flag.details.trim(),
 category: categorizeExcuse(flag.details).label,
 userId: flag.user_id,
 date: flag.date,
 source:"flag",
 });
 }
 }

 setExcuses(allExcuses);
 setLoading(false);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (!orgLoading && orgId) loadData();
 }, [orgLoading, orgId, loadData]);

 // ─── Computed data ───

 const filtered = useMemo(() => {
 if (!searchTerm) return excuses;
 const lower = searchTerm.toLowerCase();
 return excuses.filter(
 (e) =>
 e.text.toLowerCase().includes(lower) ||
 e.category.toLowerCase().includes(lower) ||
 (profiles[e.userId]?.full_name ??"").toLowerCase().includes(lower)
 );
 }, [excuses, searchTerm, profiles]);

 // Group similar excuses by normalized text
 const excuseGroups = useMemo(() => {
 const map = new Map<string, { text: string; category: string; count: number; users: Set<string>; firstDate: string; lastDate: string; records: ExcuseRecord[] }>();
 for (const ex of filtered) {
 const key = ex.text.toLowerCase().trim().slice(0, 80);
 const existing = map.get(key);
 if (existing) {
 existing.count++;
 existing.users.add(ex.userId);
 if (ex.date < existing.firstDate) existing.firstDate = ex.date;
 if (ex.date > existing.lastDate) existing.lastDate = ex.date;
 existing.records.push(ex);
 } else {
 map.set(key, {
 text: ex.text,
 category: ex.category,
 count: 1,
 users: new Set([ex.userId]),
 firstDate: ex.date,
 lastDate: ex.date,
 records: [ex],
 });
 }
 }
 return [...map.values()].sort((a, b) => b.count - a.count);
 }, [filtered]);

 // Top 10 most used
 const topExcuses = useMemo(() => excuseGroups.slice(0, 10), [excuseGroups]);

 // Fossils: repeated 3+ times
 const fossils = useMemo(() => excuseGroups.filter((g) => g.count >= 3), [excuseGroups]);

 // Per-person breakdown
 const perPerson = useMemo(() => {
 const map = new Map<string, { userId: string; excuses: ExcuseRecord[]; categoryMap: Map<string, number> }>();
 for (const ex of filtered) {
 let entry = map.get(ex.userId);
 if (!entry) {
 entry = { userId: ex.userId, excuses: [], categoryMap: new Map() };
 map.set(ex.userId, entry);
 }
 entry.excuses.push(ex);
 entry.categoryMap.set(ex.category, (entry.categoryMap.get(ex.category) ?? 0) + 1);
 }
 return [...map.values()].sort((a, b) => b.excuses.length - a.excuses.length);
 }, [filtered]);

 // Category breakdown
 const categoryBreakdown = useMemo(() => {
 const map = new Map<string, number>();
 for (const ex of filtered) {
 map.set(ex.category, (map.get(ex.category) ?? 0) + 1);
 }
 return [...map.entries()]
 .sort((a, b) => b[1] - a[1])
 .map(([label, count]) => ({
 label,
 count,
 emoji: EXCUSE_CATEGORIES.find((c) => c.label === label)?.emoji ??"--",
 }));
 }, [filtered]);

 const maxCategoryCount = useMemo(
 () => Math.max(...categoryBreakdown.map((c) => c.count), 1),
 [categoryBreakdown]
 );

 // Most recent excuse
 const latestExcuse = useMemo(() => {
 if (filtered.length === 0) return null;
 return [...filtered].sort((a, b) => b.date.localeCompare(a.date))[0];
 }, [filtered]);

 // ─── Loading ───

 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </div>
 </div>
 );
 }

 // ─── Empty state ───

 if (excuses.length === 0) {
 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Pickaxe className="w-5 h-5 text-primary"/>
 Arqueologia de Excusas
 </h1>
 <p className="text-xs font-mono text-muted-foreground mt-1">
 Catalogo historico de excusas del equipo
 </p>
 </div>
 <Card className="border border-border">
 <CardContent className="p-8 text-center">
 <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-3">
 <Bone className="w-8 h-8 text-primary"/>
 </div>
 <p className="text-sm font-mono text-muted-foreground">
 No se encontraron excusas. El equipo esta limpio... por ahora.
 </p>
 </CardContent>
 </Card>
 </div>
 );
 }

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Pickaxe className="w-5 h-5 text-primary"/>
 Arqueologia de Excusas
 </h1>
 <p className="text-xs font-mono text-muted-foreground mt-1">
 Catalogo historico de cada excusa. Las repeticiones se exponen publicamente.
 </p>
 </div>

 {/* Stats row */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
 <div className="bg-accent/30 border border-border p-4 text-center">
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">{excuses.length}</p>
 <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground">Total excusas</p>
 </div>
 <div className="bg-accent/30 border border-border p-4 text-center">
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight text-amber-600">{fossils.length}</p>
 <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground">Fosiles (3+)</p>
 </div>
 <div className="bg-accent/30 border border-border p-4 text-center">
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">{categoryBreakdown.length}</p>
 <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground">Categorias</p>
 </div>
 <div className="bg-accent/30 border border-border p-4 text-center">
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight text-red-600">
 {topExcuses[0]?.count ?? 0}
 </p>
 <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground">Record max</p>
 </div>
 </div>

 {/* Search */}
 <div className="relative mb-8">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
 <input
 type="text"value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 placeholder="Buscar excusas, personas, categorias..."className="w-full pl-10 pr-4 py-2 text-sm font-mono bg-background border border-border focus:border-primary focus:outline-none transition-colors"/>
 </div>

 {/* Excusa del Dia */}
 {latestExcuse && (
 <section className="mb-8">
 <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Excusa del dia
 </div>
 <Card className="border border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10">
 <CardContent className="p-4">
 <div className="flex items-start gap-3">
 <div className="w-8 h-8 border border-amber-300 dark:border-amber-800 flex items-center justify-center shrink-0">
 <AlertTriangle className="w-4 h-4 text-amber-600"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-mono font-medium mb-1">
 &ldquo;{latestExcuse.text}&rdquo;
 </p>
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-xs font-mono text-muted-foreground">
 {profiles[latestExcuse.userId]?.full_name ??"Desconocido"}
 </span>
 <span className="text-muted-foreground">|</span>
 <span className="text-xs font-mono text-muted-foreground">
 {format(new Date(latestExcuse.date),"d MMM yyyy", { locale: es })}
 </span>
 <Badge variant="outline"className="text-[10px] font-mono">
 {categorizeExcuse(latestExcuse.text).emoji} {latestExcuse.category}
 </Badge>
 </div>
 </div>
 </div>
 </CardContent>
 </Card>
 </section>
 )}

 {/* Museo de Excusas - Top 10 */}
 <section className="mb-8">
 <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Museo de Excusas - Top 10
 </div>
 <div className="space-y-2">
 {topExcuses.map((group, i) => (
 <Card
 key={i}
 className={cn(
"border border-border transition-colors duration-200 hover:border-primary/30",
 getAgeBorderStyle(group.firstDate)
 )}
 >
 <CardContent className="p-4">
 <div className="flex items-start gap-3">
 <div className="flex items-center justify-center w-7 h-7 border border-border shrink-0">
 <span className="text-xs font-mono font-bold tabular-nums text-muted-foreground">
 {i + 1}
 </span>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-mono font-medium mb-1 truncate">
 &ldquo;{group.text}&rdquo;
 </p>
 <div className="flex items-center gap-2 flex-wrap">
 <Badge variant="outline"className="text-[10px] font-mono">
 {categorizeExcuse(group.text).emoji} {group.category}
 </Badge>
 <span className="text-[10px] font-mono text-muted-foreground">
 {group.users.size} persona{group.users.size !== 1 ?"s":""}
 </span>
 {group.count >= 3 && (
 <span className="text-[10px] font-mono text-muted-foreground">
 {format(new Date(group.firstDate),"d MMM", { locale: es })} - {format(new Date(group.lastDate),"d MMM yyyy", { locale: es })}
 </span>
 )}
 </div>
 </div>
 <Badge
 variant="outline"className={cn("text-xs font-mono font-bold tabular-nums shrink-0", getRepeatBadgeStyle(group.count))}
 >
 {group.count}x
 {group.count >= 10 &&"RECORD"}
 </Badge>
 </div>
 </CardContent>
 </Card>
 ))}
 {topExcuses.length === 0 && (
 <p className="text-sm font-mono text-muted-foreground text-center py-4">
 Sin excusas en el filtro actual.
 </p>
 )}
 </div>
 </section>

 {/* Fosiles Recurrentes */}
 {fossils.length > 0 && (
 <section className="mb-8">
 <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Fosiles Recurrentes (3+ repeticiones)
 </div>
 <div className="space-y-2">
 {fossils.map((fossil, i) => (
 <Card
 key={i}
 className="border border-amber-300/50 dark:border-amber-800/50 bg-amber-50/20 dark:bg-amber-950/10 transition-colors duration-200 hover:border-amber-400/70">
 <CardContent className="p-4">
 <div className="flex items-start gap-3">
 <Bone className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"/>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <p className="text-sm font-mono font-medium truncate">
 &ldquo;{fossil.text}&rdquo;
 </p>
 <Badge
 variant="outline"className={cn("text-xs font-mono font-bold tabular-nums shrink-0", getRepeatBadgeStyle(fossil.count))}
 >
 {fossil.count}x
 {fossil.count >= 10 &&"RECORD"}
 </Badge>
 </div>
 <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
 <span className="flex items-center gap-1">
 <Calendar className="w-3 h-3"/>
 Primer registro: {format(new Date(fossil.firstDate),"d MMM yyyy", { locale: es })}
 </span>
 <span className="flex items-center gap-1">
 <Repeat className="w-3 h-3"/>
 Ultimo: {format(new Date(fossil.lastDate),"d MMM yyyy", { locale: es })}
 </span>
 </div>
 <p className="text-[10px] font-mono text-amber-600/80 mt-1">
 Esta es la {fossil.count}a vez que esta excusa aparece.
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </section>
 )}

 {/* Arqueologos - Per person */}
 <section className="mb-8">
 <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Arqueologos - Excusas por persona
 </div>
 <div className="space-y-2">
 {perPerson.map((person) => {
 const profile = profiles[person.userId];
 const topCategory = [...person.categoryMap.entries()].sort((a, b) => b[1] - a[1])[0];
 return (
 <Card
 key={person.userId}
 className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <Avatar className="w-8 h-8 ring-1 ring-border">
 <AvatarImage src={profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[10px] font-mono font-bold">
 {getInitials(profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-mono font-medium truncate">
 {profile?.full_name ??"Desconocido"}
 </p>
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-[10px] font-mono text-muted-foreground">
 {person.excuses.length} excusa{person.excuses.length !== 1 ?"s":""}
 </span>
 {topCategory && (
 <>
 <span className="text-muted-foreground">|</span>
 <span className="text-[10px] font-mono text-muted-foreground">
 Favorita: {topCategory[0]} ({topCategory[1]}x)
 </span>
 </>
 )}
 </div>
 </div>
 <Badge
 variant="outline"className={cn("text-xs font-mono font-bold tabular-nums", getRepeatBadgeStyle(person.excuses.length))}
 >
 {person.excuses.length}
 </Badge>
 </div>
 {/* Category breakdown for this person */}
 <div className="mt-3 flex flex-wrap gap-1.5">
 {[...person.categoryMap.entries()]
 .sort((a, b) => b[1] - a[1])
 .map(([cat, count]) => (
 <Badge key={cat} variant="outline"className="text-[10px] font-mono">
 {categorizeExcuse(cat).emoji} {cat}: {count}
 </Badge>
 ))}
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </section>

 {/* Excavacion - Category Chart */}
 <section className="mb-8">
 <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Excavacion - Desglose por categoria
 </div>
 <Card className="border border-border">
 <CardContent className="p-4 space-y-3">
 {categoryBreakdown.map((cat) => (
 <div key={cat.label}>
 <div className="flex items-center justify-between mb-1">
 <span className="text-xs font-mono font-medium flex items-center gap-1.5">
 <span>{cat.emoji}</span>
 {cat.label}
 </span>
 <span className="text-xs font-mono font-bold tabular-nums text-muted-foreground">
 {cat.count}
 </span>
 </div>
 <div className="w-full h-2 bg-accent/30 border border-border overflow-hidden">
 <div
 className="h-full bg-primary transition-all duration-500"style={{ width:`${(cat.count / maxCategoryCount) * 100}%`}}
 />
 </div>
 </div>
 ))}
 {categoryBreakdown.length === 0 && (
 <p className="text-sm font-mono text-muted-foreground text-center py-4">
 Sin datos de categorias.
 </p>
 )}
 </CardContent>
 </Card>
 </section>

 {/* Timeline */}
 <section className="mb-8">
 <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Timeline - Registro cronologico
 </div>
 <div className="space-y-1.5">
 {filtered
 .sort((a, b) => b.date.localeCompare(a.date))
 .slice(0, 50)
 .map((ex) => {
 const profile = profiles[ex.userId];
 const cat = categorizeExcuse(ex.text);
 const group = excuseGroups.find(
 (g) => g.text.toLowerCase().trim().slice(0, 80) === ex.text.toLowerCase().trim().slice(0, 80)
 );
 return (
 <Card
 key={ex.id}
 className={cn(
"border border-border transition-colors duration-200 hover:border-primary/30",
 getAgeBorderStyle(ex.date)
 )}
 >
 <CardContent className="p-3">
 <div className="flex items-start gap-3">
 <Avatar className="w-6 h-6 ring-1 ring-border shrink-0 mt-0.5">
 <AvatarImage src={profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px] font-mono font-bold">
 {getInitials(profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-mono truncate">
 &ldquo;{ex.text}&rdquo;
 </p>
 <div className="flex items-center gap-2 mt-1 flex-wrap">
 <span className="text-[10px] font-mono text-muted-foreground">
 {profile?.full_name ??"Desconocido"}
 </span>
 <span className="text-muted-foreground">|</span>
 <span className="text-[10px] font-mono text-muted-foreground">
 {format(new Date(ex.date),"d MMM yyyy", { locale: es })}
 </span>
 <Badge variant="outline"className="text-[9px] font-mono">
 {cat.emoji} {ex.category}
 </Badge>
 <Badge
 variant="outline"className={cn(
"text-[9px] font-mono",
 ex.source ==="blocked_entry"?"text-red-600 border-red-300 dark:border-red-800": ex.source ==="closeout_blocker"?"text-amber-600 border-amber-300 dark:border-amber-800":"text-muted-foreground border-border")}
 >
 {ex.source ==="blocked_entry"?"Entrada": ex.source ==="closeout_blocker"?"Closeout":"Flag"}
 </Badge>
 {group && group.count > 1 && (
 <Badge
 variant="outline"className={cn("text-[9px] font-mono font-bold tabular-nums", getRepeatBadgeStyle(group.count))}
 >
 <Repeat className="w-2.5 h-2.5 mr-0.5"/>
 {group.count}x
 </Badge>
 )}
 </div>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 {filtered.length > 50 && (
 <p className="text-center text-[10px] font-mono text-muted-foreground py-2">
 Mostrando 50 de {filtered.length} registros
 </p>
 )}
 </div>
 </section>
 </div>
 );
}
