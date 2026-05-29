"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, WorkCategory } from "@/lib/types/database";
import { CATEGORIES, VERIFICATION_STATUS } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, formatHour, getTodayMTY } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
 Eye,
 Clock,
 AlertTriangle,
 Camera,
 Trophy,
 Minus,
} from "lucide-react";

// ─────────────────────────────────────────────
// Pairing Algorithm — deterministic daily shuffle
// ─────────────────────────────────────────────

function getMirrorPairs(
 dateStr: string,
 orgId: string,
 memberIds: string[]
): Map<string, string> {
 let hash = 0;
 const seed = dateStr + orgId;
 for (let i = 0; i < seed.length; i++) {
 hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
 }

 const shuffled = [...memberIds].sort((a, b) => {
 const ha = ((hash * 31 + a.charCodeAt(0)) | 0);
 const hb = ((hash * 31 + b.charCodeAt(0)) | 0);
 return ha - hb;
 });

 const pairs = new Map<string, string>();
 for (let i = 0; i < shuffled.length; i += 2) {
 if (i + 1 < shuffled.length) {
 pairs.set(shuffled[i], shuffled[i + 1]);
 pairs.set(shuffled[i + 1], shuffled[i]);
 } else {
 // Odd one out mirrors the first person
 pairs.set(shuffled[i], shuffled[0]);
 }
 }
 return pairs;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface MemberProfile {
 id: string;
 full_name: string | null;
 avatar_url: string | null;
}

interface MirrorStats {
 totalEntries: number;
 withProof: number;
 proofPercent: number;
 avgDescLength: number;
 categories: Record<string, number>;
 earliestHour: number | null;
 latestHour: number | null;
 gaps: number[];
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function computeStats(entries: TimeEntry[]): MirrorStats {
 const totalEntries = entries.length;
 const withProof = entries.filter(
 (e) => (e.proof_urls && e.proof_urls.length > 0) || (e.links && e.links.length > 0)
 ).length;
 const proofPercent = totalEntries > 0 ? Math.round((withProof / totalEntries) * 100) : 0;

 const descLengths = entries.map((e) => (e.description ??"").length);
 const avgDescLength =
 descLengths.length > 0
 ? Math.round(descLengths.reduce((a, b) => a + b, 0) / descLengths.length)
 : 0;

 const categories: Record<string, number> = {};
 for (const e of entries) {
 categories[e.category] = (categories[e.category] ?? 0) + 1;
 }

 const hours = entries.map((e) => e.hour).sort((a, b) => a - b);
 const earliestHour = hours.length > 0 ? hours[0] : null;
 const latestHour = hours.length > 0 ? hours[hours.length - 1] : null;

 // Calculate gaps (missing hours between earliest and latest)
 const filledHours = new Set(hours);
 const gaps: number[] = [];
 if (earliestHour !== null && latestHour !== null) {
 for (let h = earliestHour; h <= latestHour; h++) {
 if (!filledHours.has(h)) {
 gaps.push(h);
 }
 }
 }

 return { totalEntries, withProof, proofPercent, avgDescLength, categories, earliestHour, latestHour, gaps };
}

function getQualityLevel(entry: TimeEntry): { label: string; color: string } {
 const descLen = (entry.description ??"").length;
 const hasProof = (entry.proof_urls && entry.proof_urls.length > 0) || (entry.links && entry.links.length > 0);

 if (descLen > 80 && hasProof) return { label:"Excelente", color:"text-green-600"};
 if (descLen > 30 && hasProof) return { label:"Buena", color:"text-blue-600"};
 if (descLen > 30 || hasProof) return { label:"Aceptable", color:"text-yellow-600"};
 return { label:"Baja", color:"text-red-600"};
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function MirrorModePage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();
 const today = getTodayMTY();

 const [loading, setLoading] = useState(true);
 const [partnerId, setPartnerId] = useState<string | null>(null);
 const [partnerProfile, setPartnerProfile] = useState<MemberProfile | null>(null);
 const [myProfile, setMyProfile] = useState<MemberProfile | null>(null);
 const [myEntries, setMyEntries] = useState<TimeEntry[]>([]);
 const [partnerEntries, setPartnerEntries] = useState<TimeEntry[]>([]);

 const displayDate = format(new Date(today +"T12:00:00"),"EEEE, d MMMM yyyy", {
 locale: es,
 });

 const loadData = useCallback(async () => {
 if (!orgId || !userId) return;
 setLoading(true);

 // 1. Get all org members
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id")
 .eq("org_id", orgId);

 if (!members || members.length < 2) {
 setLoading(false);
 return;
 }

 const memberIds = members.map((m) => m.user_id).sort();

 // 2. Compute mirror pairing
 const pairs = getMirrorPairs(today, orgId, memberIds);
 const myPartnerId = pairs.get(userId) ?? null;
 setPartnerId(myPartnerId);

 if (!myPartnerId) {
 setLoading(false);
 return;
 }

 // 3. Load profiles and entries in parallel
 const [
 { data: myProf },
 { data: partProf },
 { data: myEntr },
 { data: partEntr },
 ] = await Promise.all([
 supabase.from("profiles").select("id, full_name, avatar_url").eq("id", userId).single(),
 supabase.from("profiles").select("id, full_name, avatar_url").eq("id", myPartnerId).single(),
 supabase
 .from("time_entries")
 .select("*")
 .eq("user_id", userId)
 .eq("org_id", orgId)
 .eq("date", today)
 .order("hour", { ascending: true }),
 supabase
 .from("time_entries")
 .select("*")
 .eq("user_id", myPartnerId)
 .eq("org_id", orgId)
 .eq("date", today)
 .order("hour", { ascending: true }),
 ]);

 setMyProfile(myProf as MemberProfile | null);
 setPartnerProfile(partProf as MemberProfile | null);
 setMyEntries((myEntr as TimeEntry[]) ?? []);
 setPartnerEntries((partEntr as TimeEntry[]) ?? []);
 setLoading(false);
 }, [orgId, userId, today]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (orgLoading) return;
 loadData();
 }, [orgLoading, loadData]);

 // Set up real-time subscription for partner entries
 useEffect(() => {
 if (!orgId || !partnerId) return;

 const channel = supabase
 .channel(`mirror-${partnerId}`)
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"time_entries",
 filter:`user_id=eq.${partnerId}`,
 },
 () => {
 // Reload partner entries on any change
 supabase
 .from("time_entries")
 .select("*")
 .eq("user_id", partnerId)
 .eq("org_id", orgId)
 .eq("date", today)
 .order("hour", { ascending: true })
 .then(({ data }) => {
 if (data) setPartnerEntries(data as TimeEntry[]);
 });
 }
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, partnerId, today]); // eslint-disable-line react-hooks/exhaustive-deps

 const myStats = useMemo(() => computeStats(myEntries), [myEntries]);
 const partnerStats = useMemo(() => computeStats(partnerEntries), [partnerEntries]);

 const partnerName = partnerProfile?.full_name ??"Compañero";
 const partnerFirstName = partnerName.split("")[0];
 const myName = myProfile?.full_name ??"Tú";

 // Who's winning?
 const myScore = myStats.totalEntries + myStats.withProof * 0.5;
 const partnerScore = partnerStats.totalEntries + partnerStats.withProof * 0.5;
 const winner =
 myScore > partnerScore ?"you": partnerScore > myScore ?"partner":"tie";

 // ─── Loading state ─────────────────────────

 if (loading || orgLoading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="flex flex-col items-center gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </p>
 </div>
 </div>
 );
 }

 // ─── No partner found (solo member) ─────────

 if (!partnerId || !partnerProfile) {
 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Eye className="w-5 h-5 text-primary"/>
 Modo Espejo
 </h1>
 </div>
 <Card className="border border-border">
 <CardContent className="p-8 text-center">
 <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-4">
 <Eye className="w-8 h-8 text-primary/40"/>
 </div>
 <p className="font-mono text-sm font-bold">Sin pareja disponible</p>
 <p className="text-xs text-muted-foreground mt-2">
 Se necesitan al menos 2 miembros en el equipo para activar el Modo Espejo.
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
 <Eye className="w-5 h-5 text-primary"/>
 Modo Espejo
 </h1>
 <p className="text-xs font-mono text-muted-foreground mt-1 capitalize">
 {displayDate}
 </p>
 </div>

 {/* Active Banner */}
 <div className="mb-8 border border-primary/30 bg-primary/5 p-4">
 <div className="flex items-center gap-3">
 <div className="w-2 h-2 rounded-full bg-primary animate-pulse"/>
 <div>
 <p className="font-mono text-xs font-bold tracking-wider uppercase text-primary">
 Modo Espejo Activo
 </p>
 <p className="text-xs text-muted-foreground mt-0.5">
 Estás viendo el timeline de{" "}
 <span className="font-bold text-foreground">{partnerName}</span> — y{" "}
 {partnerFirstName} está viendo el tuyo.
 </p>
 </div>
 </div>
 </div>

 {/* Surveillance notice */}
 <div className="mb-8 border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-3">
 <Eye className="w-4 h-4 text-amber-600 shrink-0"/>
 <p className="font-mono text-[10px] text-amber-700 dark:text-amber-400">
 Tu trabajo está siendo visto por:{" "}
 <span className="font-bold uppercase">{partnerName}</span>
 </p>
 </div>

 {/* ────── Mirror Stats Comparison ────── */}
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Comparación
 </p>
 <div className="grid grid-cols-3 gap-3">
 <ComparisonStat
 label="Entradas"myVal={myStats.totalEntries}
 partnerVal={partnerStats.totalEntries}
 />
 <ComparisonStat
 label="Con evidencia"myVal={myStats.withProof}
 partnerVal={partnerStats.withProof}
 />
 <ComparisonStat
 label="% Evidencia"myVal={myStats.proofPercent}
 partnerVal={partnerStats.proofPercent}
 suffix="%"/>
 <ComparisonStat
 label="Huecos"myVal={myStats.gaps.length}
 partnerVal={partnerStats.gaps.length}
 invert
 />
 <ComparisonStat
 label="Inicio"myVal={myStats.earliestHour}
 partnerVal={partnerStats.earliestHour}
 formatFn={(v) => (v !== null ? formatHour(v) :"—")}
 invert
 />
 <ComparisonStat
 label="Detalle prom."myVal={myStats.avgDescLength}
 partnerVal={partnerStats.avgDescLength}
 suffix="chars"/>
 </div>

 {/* Winner badge */}
 <div className="mt-4 text-center">
 {winner ==="you"? (
 <Badge className="bg-green-600 text-white font-mono text-[10px]">
 <Trophy className="w-3 h-3 mr-1"/>
 Vas ganando el día
 </Badge>
 ) : winner ==="partner"? (
 <Badge className="bg-red-600 text-white font-mono text-[10px]">
 <AlertTriangle className="w-3 h-3 mr-1"/>
 {partnerFirstName} va ganando
 </Badge>
 ) : (
 <Badge variant="outline"className="font-mono text-[10px]">
 <Minus className="w-3 h-3 mr-1"/>
 Empate
 </Badge>
 )}
 </div>
 </section>

 {/* ────── Side-by-Side Timeline ────── */}
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Timeline lado a lado
 </p>

 <div className="grid grid-cols-2 gap-4">
 {/* Column Headers */}
 <div className="flex items-center gap-2 pb-2 border-b border-border">
 <Avatar className="w-6 h-6 ring-1 ring-border">
 <AvatarImage src={myProfile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px]">
 {getInitials(myName)}
 </AvatarFallback>
 </Avatar>
 <span className="font-mono text-xs font-bold uppercase">Tú</span>
 <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
 ({myStats.totalEntries}h)
 </span>
 </div>
 <div className="flex items-center gap-2 pb-2 border-b border-border">
 <Avatar className="w-6 h-6 ring-1 ring-border">
 <AvatarImage src={partnerProfile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px]">
 {getInitials(partnerName)}
 </AvatarFallback>
 </Avatar>
 <span className="font-mono text-xs font-bold uppercase">
 {partnerFirstName}
 </span>
 <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
 ({partnerStats.totalEntries}h)
 </span>
 </div>

 {/* Timeline entries — iterate all work hours */}
 {Array.from({ length: 12 }, (_, i) => i + 7).map((hour) => {
 const myEntry = myEntries.find((e) => e.hour === hour);
 const partnerEntry = partnerEntries.find((e) => e.hour === hour);

 return (
 <TimelineRow
 key={hour}
 hour={hour}
 myEntry={myEntry ?? null}
 partnerEntry={partnerEntry ?? null}
 />
 );
 })}
 </div>
 </section>

 {/* ────── Partner Full Timeline ────── */}
 <section className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 Timeline completo de {partnerFirstName}
 </p>

 {partnerEntries.length === 0 ? (
 <Card className="border border-border">
 <CardContent className="p-6 text-center">
 <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-3">
 <Clock className="w-8 h-8 text-primary/40"/>
 </div>
 <p className="font-mono text-sm font-bold">
 {partnerFirstName} no ha registrado nada hoy
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 Sin entradas. Sin evidencia. Sin excusas.
 </p>
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-2">
 {partnerEntries.map((entry) => (
 <EntryCard key={entry.id} entry={entry} />
 ))}
 </div>
 )}

 {/* Gaps highlighted */}
 {partnerStats.gaps.length > 0 && (
 <div className="mt-3 border border-red-500/30 bg-red-500/5 p-3">
 <div className="flex items-center gap-2 mb-2">
 <AlertTriangle className="w-3.5 h-3.5 text-red-600"/>
 <p className="font-mono text-[10px] font-bold text-red-600 uppercase">
 {partnerStats.gaps.length} huecos detectados
 </p>
 </div>
 <div className="flex flex-wrap gap-1.5">
 {partnerStats.gaps.map((h) => (
 <span
 key={h}
 className="font-mono text-[10px] tabular-nums bg-red-500/10 text-red-600 border border-red-500/20 px-2 py-0.5">
 {formatHour(h)}
 </span>
 ))}
 </div>
 </div>
 )}
 </section>

 {/* ────── Tomorrow message ────── */}
 <div className="border border-border/60 bg-accent/20 p-4 text-center">
 <p className="font-mono text-[10px] text-muted-foreground tracking-wider uppercase">
 Mañana verás el trabajo de alguien más. No sabes quién.
 </p>
 </div>
 </div>
 );
}

// ─────────────────────────────────────────────
// Timeline Row (side-by-side for a given hour)
// ─────────────────────────────────────────────

function TimelineRow({
 hour,
 myEntry,
 partnerEntry,
}: {
 hour: number;
 myEntry: TimeEntry | null;
 partnerEntry: TimeEntry | null;
}) {
 return (
 <>
 {/* My side */}
 <MiniEntry hour={hour} entry={myEntry} />
 {/* Partner side */}
 <MiniEntry hour={hour} entry={partnerEntry} />
 </>
 );
}

function MiniEntry({ hour, entry }: { hour: number; entry: TimeEntry | null }) {
 if (!entry) {
 return (
 <div className="border border-dashed border-red-500/20 bg-red-500/5 p-2 flex items-center gap-2">
 <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-12 shrink-0">
 {formatHour(hour)}
 </span>
 <span className="font-mono text-[10px] text-red-500/50">— vacío —</span>
 </div>
 );
 }

 const cat = CATEGORIES[entry.category as WorkCategory];
 const hasProof =
 (entry.proof_urls && entry.proof_urls.length > 0) ||
 (entry.links && entry.links.length > 0);

 return (
 <div className="border border-border p-2 flex items-start gap-2 transition-colors duration-200 hover:border-primary/30">
 <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-12 shrink-0 pt-0.5">
 {formatHour(entry.hour)}
 </span>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-1.5">
 <span className="text-[10px]">{cat?.emoji}</span>
 <span className={cn("text-[10px] font-mono", cat?.color)}>
 {cat?.label}
 </span>
 {hasProof && <Camera className="w-2.5 h-2.5 text-green-600"/>}
 </div>
 <p className="text-[11px] font-medium truncate mt-0.5">{entry.title}</p>
 </div>
 </div>
 );
}

// ─────────────────────────────────────────────
// Full Entry Card (partner timeline detail)
// ─────────────────────────────────────────────

function EntryCard({ entry }: { entry: TimeEntry }) {
 const cat = CATEGORIES[entry.category as WorkCategory];
 const verification = VERIFICATION_STATUS[entry.verification_status];
 const quality = getQualityLevel(entry);
 const hasProof =
 (entry.proof_urls && entry.proof_urls.length > 0) ||
 (entry.links && entry.links.length > 0);
 const descLength = (entry.description ??"").length;

 return (
 <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="p-3">
 <div className="flex items-start justify-between gap-3">
 <div className="flex items-center gap-2">
 <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-14 shrink-0">
 {formatHour(entry.hour)}
 </span>
 <Badge variant="outline"className={cn("text-[9px] font-mono gap-1", cat?.color)}>
 <span>{cat?.emoji}</span>
 {cat?.label}
 </Badge>
 </div>
 <div className="flex items-center gap-2">
 {hasProof ? (
 <Badge variant="outline"className="text-[9px] font-mono text-green-600 border-green-200 dark:border-green-900 gap-1">
 <Camera className="w-2.5 h-2.5"/>
 Evidencia
 </Badge>
 ) : (
 <Badge variant="outline"className="text-[9px] font-mono text-red-600 border-red-200 dark:border-red-900 gap-1">
 <AlertTriangle className="w-2.5 h-2.5"/>
 Sin prueba
 </Badge>
 )}
 <span className={cn("text-[9px] font-mono", quality.color)}>
 {quality.label}
 </span>
 </div>
 </div>

 <p className="text-sm font-medium mt-2">{entry.title}</p>

 {entry.description && (
 <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
 {entry.description}
 </p>
 )}

 <div className="flex items-center gap-3 mt-2">
 <span className="text-[9px] text-muted-foreground font-mono">
 {verification.icon} {verification.label}
 </span>
 <span className="text-[9px] text-muted-foreground font-mono tabular-nums">
 {descLength} chars
 </span>
 {entry.is_late && (
 <span className="text-[9px] text-red-600 font-mono">
 Tardía ({entry.minutes_late}min)
 </span>
 )}
 </div>
 </CardContent>
 </Card>
 );
}

// ─────────────────────────────────────────────
// Comparison Stat Box
// ─────────────────────────────────────────────

function ComparisonStat({
 label,
 myVal,
 partnerVal,
 suffix ="",
 invert = false,
 formatFn,
}: {
 label: string;
 myVal: number | null;
 partnerVal: number | null;
 suffix?: string;
 invert?: boolean;
 formatFn?: (v: number | null) => string;
}) {
 const myV = myVal ?? 0;
 const pV = partnerVal ?? 0;

 // Determine who's better: for 'invert' metrics, lower is better (gaps, start time)
 const iAmBetter = invert ? myV < pV : myV > pV;
 const theyAreBetter = invert ? pV < myV : pV > myV;

 const displayMy = formatFn ? formatFn(myVal) :`${myV}${suffix}`;
 const displayPartner = formatFn ? formatFn(partnerVal) :`${pV}${suffix}`;

 return (
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 {label}
 </p>
 <div className="flex items-center justify-between gap-2">
 <div className="text-center flex-1">
 <p
 className={cn(
"font-mono text-sm font-bold tabular-nums tracking-tight",
 iAmBetter &&"text-green-600",
 theyAreBetter &&"text-red-600")}
 >
 {displayMy}
 </p>
 <p className="font-mono text-[8px] text-muted-foreground uppercase">
 Tú
 </p>
 </div>
 <div className="text-muted-foreground/20">
 <Minus className="w-3 h-3"/>
 </div>
 <div className="text-center flex-1">
 <p
 className={cn(
"font-mono text-sm font-bold tabular-nums tracking-tight",
 theyAreBetter &&"text-green-600",
 iAmBetter &&"text-red-600")}
 >
 {displayPartner}
 </p>
 <p className="font-mono text-[8px] text-muted-foreground uppercase">
 Espejo
 </p>
 </div>
 </div>
 </div>
 );
}
