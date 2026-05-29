"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { TimeEntry, TrustScoreHistory, DailyCloseout, WorkCategory } from "@/lib/types/database";
import { CATEGORIES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
 Skull,
 AlertTriangle,
 Eye,
 TrendingDown,
 Clock,
 Brain,
 ChevronDown,
} from "lucide-react";
import { subDays, isWeekend, format } from "date-fns";
import { es } from "date-fns/locale";

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

type Severity ="incomodo"|"doloroso"|"devastador";

interface BrutalTruth {
 id: string;
 text: string;
 severity: Severity;
 icon: typeof AlertTriangle;
}

const SEVERITY_CONFIG: Record<Severity, { label: string; dot: string; border: string; text: string }> = {
 incomodo: {
 label:"Incómodo",
 dot:"bg-yellow-500",
 border:"border-yellow-500/20",
 text:"text-yellow-500/70",
 },
 doloroso: {
 label:"Doloroso",
 dot:"bg-orange-500",
 border:"border-orange-500/20",
 text:"text-orange-500/70",
 },
 devastador: {
 label:"Devastador",
 dot:"bg-red-500",
 border:"border-red-500/20",
 text:"text-red-500/70",
 },
};

// ═══════════════════════════════════════════════════════════
// Analysis engine — generates brutal truths from raw data
// ═══════════════════════════════════════════════════════════

function analyzeBrutalTruths(
 entries: TimeEntry[],
 trustHistory: TrustScoreHistory[],
 closeouts: DailyCloseout[],
 teamAvgHours: number
): BrutalTruth[] {
 const truths: BrutalTruth[] = [];
 let idCounter = 0;
 const nextId = () =>`truth-${idCounter++}`;

 if (entries.length === 0) {
 truths.push({
 id: nextId(),
 text:"No tienes una sola entrada en 30 días. No hay nada que analizar porque no hay nada que hayas hecho.",
 severity:"devastador",
 icon: Skull,
 });
 return truths;
 }

 // Group entries by date
 const dayMap = new Map<string, TimeEntry[]>();
 for (const e of entries) {
 const arr = dayMap.get(e.date) ?? [];
 arr.push(e);
 dayMap.set(e.date, arr);
 }

 const workdays = [...dayMap.keys()].filter((d) => !isWeekend(new Date(d +"T12:00:00")));
 const avgHoursPerDay = workdays.length > 0
 ? entries.filter((e) => !isWeekend(new Date(e.date +"T12:00:00"))).length / workdays.length
 : 0;

 // 1. Low average hours
 if (avgHoursPerDay < 6 && teamAvgHours > 0) {
 truths.push({
 id: nextId(),
 text:`Promedio de ${avgHoursPerDay.toFixed(1)} horas diarias. El equipo promedia ${teamAvgHours.toFixed(1)}. No estás ni cerca.`,
 severity: avgHoursPerDay < 4 ?"devastador":"doloroso",
 icon: Clock,
 });
 }

 // 2. Meeting heavy
 const categoryCounts: Record<string, number> = {};
 for (const e of entries) {
 categoryCounts[e.category] = (categoryCounts[e.category] ?? 0) + 1;
 }
 const mostCommon = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
 if (mostCommon && mostCommon[0] ==="meeting") {
 const pct = Math.round((mostCommon[1] / entries.length) * 100);
 truths.push({
 id: nextId(),
 text:`Pasas ${pct}% de tu tiempo en reuniones. No produces, solo hablas.`,
 severity: pct > 50 ?"devastador":"doloroso",
 icon: Clock,
 });
 }

 // 3. Late entries
 const lateEntries = entries.filter((e) => e.is_late);
 const latePct = Math.round((lateEntries.length / entries.length) * 100);
 if (latePct > 30) {
 truths.push({
 id: nextId(),
 text:`${latePct}% de tus entries son tardías. O no trabajas a tiempo o mientes después.`,
 severity: latePct > 60 ?"devastador":"doloroso",
 icon: AlertTriangle,
 });
 }

 // 4. Missing closeouts
 const closeoutDates = new Set(closeouts.map((c) => c.date));
 const today = new Date();
 let daysWithoutCloseout = 0;
 for (let i = 1; i <= 14; i++) {
 const d = subDays(today, i);
 if (isWeekend(d)) continue;
 const ds = format(d,"yyyy-MM-dd");
 if (!closeoutDates.has(ds)) {
 daysWithoutCloseout++;
 } else {
 break;
 }
 }
 if (daysWithoutCloseout >= 3) {
 truths.push({
 id: nextId(),
 text:`No has hecho closeout en ${daysWithoutCloseout} días laborales. ¿Qué escondes?`,
 severity: daysWithoutCloseout >= 7 ?"devastador":"doloroso",
 icon: Eye,
 });
 }

 // 5. Trust score declining
 if (trustHistory.length >= 2) {
 const sorted = [...trustHistory].sort((a, b) => a.date.localeCompare(b.date));
 const first = sorted[0];
 const last = sorted[sorted.length - 1];
 if (last.score < first.score - 5) {
 truths.push({
 id: nextId(),
 text:`Tu Trust Score bajó de ${first.score} a ${last.score} en 30 días. Tendencia: irrelevante.`,
 severity: last.score < first.score - 15 ?"devastador":"doloroso",
 icon: TrendingDown,
 });
 }
 }

 // 6. Low verification
 const verified = entries.filter(
 (e) => e.verification_status ==="verified").length;
 const verifiedPct = Math.round((verified / entries.length) * 100);
 if (verifiedPct < 40) {
 truths.push({
 id: nextId(),
 text:`Solo ${verifiedPct}% de tu trabajo está verificado. El resto es tu palabra contra nada.`,
 severity: verifiedPct < 15 ?"devastador":"doloroso",
 icon: Eye,
 });
 }

 // 7. Mood always 5
 const entriesWithMood = entries.filter((e) => e.mood !== null);
 if (entriesWithMood.length >= 10) {
 const allFive = entriesWithMood.every((e) => e.mood === 5);
 if (allFive) {
 truths.push({
 id: nextId(),
 text:"Tu mood siempre es 5/5. O eres un robot o no eres honesto.",
 severity:"incomodo",
 icon: Brain,
 });
 }
 }

 // 8. Repeated descriptions
 const descriptionCounts = new Map<string, number>();
 for (const e of entries) {
 const desc = (e.description ?? e.title).trim().toLowerCase();
 if (desc.length > 5) {
 descriptionCounts.set(desc, (descriptionCounts.get(desc) ?? 0) + 1);
 }
 }
 for (const [desc, count] of descriptionCounts) {
 if (count >= 4) {
 const display = desc.length > 40 ? desc.slice(0, 40) +"...": desc;
 truths.push({
 id: nextId(),
 text:`Usaste la descripción"${display}"${count} veces. Copia-pega no es trabajo.`,
 severity: count >= 8 ?"doloroso":"incomodo",
 icon: Brain,
 });
 break; // Only show worst one
 }
 }

 // 9. Weekend work
 const weekendEntries = entries.filter((e) => isWeekend(new Date(e.date +"T12:00:00")));
 if (weekendEntries.length >= 4) {
 truths.push({
 id: nextId(),
 text:`Trabajas fines de semana (${weekendEntries.length} entries). No es dedicación, es mala gestión del tiempo.`,
 severity: weekendEntries.length >= 10 ?"doloroso":"incomodo",
 icon: Clock,
 });
 }

 // 10. No deep work
 const deepWorkDays = new Set(
 entries.filter((e) => e.category ==="deep_work").map((e) => e.date)
 );
 const allDays = new Set(entries.map((e) => e.date));
 const daysWithoutDeepWork = allDays.size - deepWorkDays.size;
 if (daysWithoutDeepWork > allDays.size * 0.7 && allDays.size >= 5) {
 truths.push({
 id: nextId(),
 text:`${daysWithoutDeepWork} días sin deep work de ${allDays.size} registrados. Solo apagas incendios.`,
 severity: daysWithoutDeepWork > allDays.size * 0.9 ?"devastador":"doloroso",
 icon: Brain,
 });
 }

 // HIDDEN TRUTHS (revealed on demand)
 // 11. Energy always same
 const entriesWithEnergy = entries.filter((e) => e.energy !== null);
 if (entriesWithEnergy.length >= 10) {
 const allSame = entriesWithEnergy.every((e) => e.energy === entriesWithEnergy[0].energy);
 if (allSame) {
 truths.push({
 id: nextId(),
 text:`Tu energía siempre es ${entriesWithEnergy[0].energy}/5. No te estás evaluando, estás rellenando campos.`,
 severity:"incomodo",
 icon: Brain,
 });
 }
 }

 // 12. Proof rate
 const withProof = entries.filter(
 (e) => e.proof_urls && e.proof_urls.length > 0
 ).length;
 const proofPct = Math.round((withProof / entries.length) * 100);
 if (proofPct < 20) {
 truths.push({
 id: nextId(),
 text:`Solo ${proofPct}% de tus entries tienen evidencia adjunta. Hablas mucho, demuestras poco.`,
 severity: proofPct < 5 ?"devastador":"doloroso",
 icon: Eye,
 });
 }

 // 13. No links at all
 const withLinks = entries.filter((e) => e.links && e.links.length > 0).length;
 if (withLinks === 0 && entries.length >= 10) {
 truths.push({
 id: nextId(),
 text:"Cero links en 30 días. ¿Todo tu trabajo es invisible o simplemente no existe?",
 severity:"doloroso",
 icon: Eye,
 });
 }

 // 14. Admin heavy
 const adminPct = Math.round(((categoryCounts["admin"] ?? 0) / entries.length) * 100);
 if (adminPct > 30) {
 truths.push({
 id: nextId(),
 text:`${adminPct}% de tu tiempo es admin. Eres un burócrata, no un profesional.`,
 severity: adminPct > 50 ?"devastador":"incomodo",
 icon: Clock,
 });
 }

 // 15. Blocked too often
 const blockedPct = Math.round(((categoryCounts["blocked"] ?? 0) / entries.length) * 100);
 if (blockedPct > 15) {
 truths.push({
 id: nextId(),
 text:`${blockedPct}% bloqueado. Esperando que otros te salven no cuenta como productividad.`,
 severity:"doloroso",
 icon: AlertTriangle,
 });
 }

 // Sort: devastador first, then doloroso, then incomodo
 const severityOrder: Record<Severity, number> = { devastador: 0, doloroso: 1, incomodo: 2 };
 truths.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

 return truths;
}

// ═══════════════════════════════════════════════════════════
// Typewriter hook
// ═══════════════════════════════════════════════════════════

function useTypewriter(text: string, speed: number = 18, enabled: boolean = false) {
 const [displayed, setDisplayed] = useState("");
 const [done, setDone] = useState(false);

 useEffect(() => {
 if (!enabled) {
 setDisplayed("");
 setDone(false);
 return;
 }
 setDisplayed("");
 setDone(false);
 let i = 0;
 const interval = setInterval(() => {
 if (i < text.length) {
 setDisplayed(text.slice(0, i + 1));
 i++;
 } else {
 setDone(true);
 clearInterval(interval);
 }
 }, speed);
 return () => clearInterval(interval);
 }, [text, speed, enabled]);

 return { displayed, done };
}

// ═══════════════════════════════════════════════════════════
// Truth card with typewriter reveal
// ═══════════════════════════════════════════════════════════

function TruthCard({ truth, index, shouldReveal }: { truth: BrutalTruth; index: number; shouldReveal: boolean }) {
 const [startTyping, setStartTyping] = useState(false);
 const [visible, setVisible] = useState(false);
 const config = SEVERITY_CONFIG[truth.severity];

 useEffect(() => {
 if (!shouldReveal) return;
 const showTimer = setTimeout(() => setVisible(true), index * 800);
 const typeTimer = setTimeout(() => setStartTyping(true), index * 800 + 300);
 return () => {
 clearTimeout(showTimer);
 clearTimeout(typeTimer);
 };
 }, [shouldReveal, index]);

 const { displayed, done } = useTypewriter(truth.text, 15, startTyping);
 const Icon = truth.icon;

 if (!visible) return null;

 return (
 <Card
 className={cn(
"bg-transparent border transition-all duration-500",
 config.border,
"animate-in fade-in slide-in-from-bottom-2")}
 >
 <CardContent className="p-4 sm:p-5">
 <div className="flex items-start gap-3">
 <div className="mt-0.5 shrink-0">
 <Icon className={cn("w-4 h-4", config.text)} />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-2">
 <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dot)} />
 <span className={cn("font-mono text-[9px] tracking-[0.18em] uppercase", config.text)}>
 {config.label}
 </span>
 </div>
 <p className="font-mono text-sm leading-relaxed text-foreground/90">
 {displayed}
 {!done && startTyping && (
 <span className="inline-block w-[2px] h-4 bg-red-500 ml-0.5 animate-pulse align-middle"/>
 )}
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 );
}

// ═══════════════════════════════════════════════════════════
// Mirror assessment
// ═══════════════════════════════════════════════════════════

function generateMirrorAssessment(truths: BrutalTruth[]): string {
 const devastador = truths.filter((t) => t.severity ==="devastador").length;
 const doloroso = truths.filter((t) => t.severity ==="doloroso").length;
 const total = truths.length;

 if (total === 0) {
 return"Sin datos suficientes para juzgarte. Eso en sí mismo es un problema.";
 }
 if (devastador >= 3) {
 return"Tienes problemas serios que probablemente ya sabías pero prefieres ignorar. Tus datos te delatan.";
 }
 if (devastador >= 1) {
 return"Hay al menos un patrón grave en tu trabajo. Lo que no mides no mejora, y lo que mides aquí no se ve bien.";
 }
 if (doloroso >= 3) {
 return"No estás en crisis, pero tampoco estás bien. Múltiples áreas necesitan atención real, no excusas.";
 }
 if (total >= 4) {
 return"Varios patrones cuestionables. Ninguno te destruye solo, pero juntos pintan un panorama mediocre.";
 }
 return"Pocos hallazgos, pero no confundas eso con excelencia. Puede que los datos simplemente no estén.";
}

// ═══════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════

export default function BrutalTruthPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [entries, setEntries] = useState<TimeEntry[]>([]);
 const [trustHistory, setTrustHistory] = useState<TrustScoreHistory[]>([]);
 const [closeouts, setCloseouts] = useState<DailyCloseout[]>([]);
 const [teamAvgHours, setTeamAvgHours] = useState(0);
 const [loading, setLoading] = useState(true);
 const [revealed, setRevealed] = useState(false);
 const [showMore, setShowMore] = useState(false);
 const [mirrorTyping, setMirrorTyping] = useState(false);
 const supabase = createClient();

 // Fetch data
 useEffect(() => {
 if (!orgId || !userId) return;

 async function load() {
 setLoading(true);
 const today = new Date();
 const thirtyDaysAgo = subDays(today, 30);
 const todayStr = format(today,"yyyy-MM-dd");
 const startStr = format(thirtyDaysAgo,"yyyy-MM-dd");

 const [
 { data: userEntries },
 { data: trustData },
 { data: closeoutData },
 { data: teamEntries },
 ] = await Promise.all([
 supabase
 .from("time_entries")
 .select("*")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr)
 .lte("date", todayStr)
 .order("date", { ascending: true }),
 supabase
 .from("trust_score_history")
 .select("*")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr)
 .lte("date", todayStr)
 .order("date", { ascending: true }),
 supabase
 .from("daily_closeouts")
 .select("*")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr)
 .lte("date", todayStr),
 supabase
 .from("time_entries")
 .select("user_id, date")
 .eq("org_id", orgId!)
 .neq("user_id", userId!)
 .gte("date", startStr)
 .lte("date", todayStr),
 ]);

 // Calculate team average hours per workday
 if (teamEntries && teamEntries.length > 0) {
 const teamUserDays = new Map<string, Set<string>>();
 for (const e of teamEntries) {
 if (isWeekend(new Date(e.date +"T12:00:00"))) continue;
 const set = teamUserDays.get(e.user_id) ?? new Set();
 set.add(e.date);
 teamUserDays.set(e.user_id, set);
 }
 // Count entries per user, then average
 const teamUserHoursPerDay: number[] = [];
 for (const [uid] of teamUserDays) {
 const userTeamEntries = teamEntries.filter(
 (e) => e.user_id === uid && !isWeekend(new Date(e.date +"T12:00:00"))
 );
 const userDays = teamUserDays.get(uid)!;
 if (userDays.size > 0) {
 teamUserHoursPerDay.push(userTeamEntries.length / userDays.size);
 }
 }
 const avg = teamUserHoursPerDay.length > 0
 ? teamUserHoursPerDay.reduce((a, b) => a + b, 0) / teamUserHoursPerDay.length
 : 0;
 setTeamAvgHours(avg);
 }

 setEntries((userEntries ?? []) as TimeEntry[]);
 setTrustHistory((trustData ?? []) as TrustScoreHistory[]);
 setCloseouts((closeoutData ?? []) as DailyCloseout[]);
 setLoading(false);
 }
 load();
 }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

 // Generate truths
 const allTruths = useMemo(
 () => analyzeBrutalTruths(entries, trustHistory, closeouts, teamAvgHours),
 [entries, trustHistory, closeouts, teamAvgHours]
 );

 // Split into initial and hidden
 const initialTruths = allTruths.slice(0, 5);
 const hiddenTruths = allTruths.slice(5);

 // Mirror assessment
 const mirrorText = useMemo(
 () => generateMirrorAssessment(allTruths),
 [allTruths]
 );
 const { displayed: mirrorDisplayed, done: mirrorDone } = useTypewriter(
 mirrorText,
 20,
 mirrorTyping
 );

 // Start reveal sequence
 const handleReveal = useCallback(() => {
 setRevealed(true);
 // Delay mirror typing to after the dramatic pause
 setTimeout(() => setMirrorTyping(true), 500);
 }, []);

 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </div>
 </div>
 );
 }

 return (
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-3 mb-1">
 <Skull className="w-5 h-5 text-red-500"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Cámara de Eco Inversa
 </h1>
 </div>
 <p className="font-mono text-xs text-muted-foreground mb-8 ml-8">
 Lo que no quieres escuchar. Derivado de tus datos reales.
 </p>

 {/* Pre-reveal state */}
 {!revealed && (
 <div className="flex flex-col items-center justify-center py-20">
 <div className="w-20 h-20 border border-red-500/20 flex items-center justify-center mb-8">
 <Skull className="w-10 h-10 text-red-500/40"/>
 </div>
 <p className="font-mono text-sm text-muted-foreground/60 text-center max-w-md mb-2">
 Este análisis usa tus últimos 30 días de datos para decirte exactamente lo que no quieres oír.
 </p>
 <p className="font-mono text-xs text-red-500/40 text-center mb-8">
 Sin motivación. Sin positivos. Solo verdades incómodas.
 </p>
 <Button
 onClick={handleReveal}
 className="bg-red-600 hover:bg-red-700 text-white font-mono text-xs uppercase tracking-widest px-8 py-5 border-0">
 ¿Quieres la verdad?
 </Button>
 </div>
 )}

 {/* Revealed content */}
 {revealed && (
 <div className="space-y-8">
 {/* Espejo — overall assessment */}
 <div className="border border-red-500/20 p-5 sm:p-6">
 <div className="flex items-center gap-2 mb-3">
 <Eye className="w-3.5 h-3.5 text-red-500/60"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/50">
 Espejo
 </span>
 </div>
 <p className="font-mono text-sm leading-relaxed text-foreground/80">
 {mirrorDisplayed}
 {!mirrorDone && mirrorTyping && (
 <span className="inline-block w-[2px] h-4 bg-red-500 ml-0.5 animate-pulse align-middle"/>
 )}
 </p>
 </div>

 {/* Stats summary */}
 <div className="grid grid-cols-3 gap-3">
 <div className="border border-red-500/10 p-3 text-center">
 <p className="font-mono text-2xl tabular-nums tracking-tight text-red-500">
 {allTruths.filter((t) => t.severity ==="devastador").length}
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mt-1">
 Devastador
 </p>
 </div>
 <div className="border border-orange-500/10 p-3 text-center">
 <p className="font-mono text-2xl tabular-nums tracking-tight text-orange-500">
 {allTruths.filter((t) => t.severity ==="doloroso").length}
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mt-1">
 Doloroso
 </p>
 </div>
 <div className="border border-yellow-500/10 p-3 text-center">
 <p className="font-mono text-2xl tabular-nums tracking-tight text-yellow-500">
 {allTruths.filter((t) => t.severity ==="incomodo").length}
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mt-1">
 Incómodo
 </p>
 </div>
 </div>

 {/* Truth cards */}
 <div>
 <div className="flex items-center gap-2 mb-4">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Verdades Incómodas
 </span>
 <Badge
 variant="outline"className="font-mono text-[9px] border-red-500/20 text-red-500/60">
 {allTruths.length}
 </Badge>
 </div>

 <div className="space-y-3">
 {initialTruths.map((truth, i) => (
 <TruthCard
 key={truth.id}
 truth={truth}
 index={i}
 shouldReveal={revealed}
 />
 ))}

 {/* Hidden truths */}
 {showMore &&
 hiddenTruths.map((truth, i) => (
 <TruthCard
 key={truth.id}
 truth={truth}
 index={i}
 shouldReveal={showMore}
 />
 ))}
 </div>

 {/* Reveal more button */}
 {hiddenTruths.length > 0 && !showMore && (
 <div className="mt-6 text-center">
 <Button
 variant="outline"onClick={() => setShowMore(true)}
 className="font-mono text-xs uppercase tracking-widest border-red-500/20 text-red-500/70 hover:bg-red-500/5 hover:text-red-500 gap-2">
 <ChevronDown className="w-3.5 h-3.5"/>
 Pedir Más Verdades ({hiddenTruths.length})
 </Button>
 </div>
 )}
 </div>

 {/* Bottom */}
 <div className="text-center py-8 border-t border-red-500/10">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/20">
 Las verdades no se pueden ocultar una vez reveladas
 </p>
 </div>
 </div>
 )}
 </div>
 );
}
