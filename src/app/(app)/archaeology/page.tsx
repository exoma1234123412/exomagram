"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatHour } from "@/lib/utils";
import { subDays, format, getDay, parseISO, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import type { WorkCategory, TimeEntry } from "@/lib/types/database";
import {
 Pickaxe,
 Skull,
 Sun,
 Waves,
 Ghost,
 Clock,
 Flame,
 Moon,
 Users,
 Layers,
} from "lucide-react";

// ─── TYPES ──────────────────────────────────────────────────
interface Fossil {
 id: string;
 icon: typeof Skull;
 title: string;
 subtitle: string;
 finding: string;
 detail: string | null;
 severity:"low"|"medium"|"high";
 layer: number; // 1 = surface, 5 = deep
}

interface ProfileInfo {
 id: string;
 full_name: string | null;
}

// ─── DAY NAMES ──────────────────────────────────────────────
const DAY_NAMES: Record<number, string> = {
 0:"Domingo",
 1:"Lunes",
 2:"Martes",
 3:"Miercoles",
 4:"Jueves",
 5:"Viernes",
 6:"Sabado",
};

// ─── FOSSIL CARD COLORS BY LAYER ────────────────────────────
const LAYER_STYLES: Record<number, { border: string; bg: string; glow: string }> = {
 1: {
 border:"border-amber-300/40 dark:border-amber-600/30",
 bg:"bg-amber-50/60 dark:bg-amber-950/20",
 glow:"hover:shadow-amber-400/10",
 },
 2: {
 border:"border-amber-400/40 dark:border-amber-600/30",
 bg:"bg-amber-50/80 dark:bg-amber-950/30",
 glow:"hover:shadow-amber-500/10",
 },
 3: {
 border:"border-orange-400/40 dark:border-orange-700/30",
 bg:"bg-orange-50/60 dark:bg-orange-950/20",
 glow:"hover:shadow-orange-500/10",
 },
 4: {
 border:"border-orange-500/40 dark:border-orange-700/40",
 bg:"bg-orange-50/80 dark:bg-orange-950/30",
 glow:"hover:shadow-orange-600/10",
 },
 5: {
 border:"border-red-400/30 dark:border-red-800/30",
 bg:"bg-red-50/50 dark:bg-red-950/20",
 glow:"hover:shadow-red-500/10",
 },
};

const SEVERITY_BADGE: Record<string, { label: string; className: string }> = {
 low: { label:"Superficie", className:"bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"},
 medium: { label:"Estrato medio", className:"bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"},
 high: { label:"Estrato profundo", className:"bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"},
};

// ─── ANALYSIS FUNCTIONS ─────────────────────────────────────

function getName(profiles: ProfileInfo[], userId: string): string {
 const p = profiles.find((pr) => pr.id === userId);
 if (!p?.full_name) return"Alguien";
 return p.full_name.split("")[0] || p.full_name;
}

function analyzeDiaMaldito(entries: TimeEntry[]): Fossil | null {
 // Which day of the week consistently has lowest deep_work hours
 const dayHours: Record<number, number> = {};
 const dayCounts: Record<number, number> = {};

 for (const e of entries) {
 const day = getDay(parseISO(e.date));
 if (day === 0 || day === 6) continue; // skip weekends
 if (e.category ==="deep_work") {
 dayHours[day] = (dayHours[day] || 0) + 1;
 }
 dayCounts[day] = (dayCounts[day] || 0) + 1;
 }

 const weekdays = [1, 2, 3, 4, 5].filter((d) => dayCounts[d] > 0);
 if (weekdays.length < 3) return null;

 // Average deep_work per day-of-week
 const dayAvg = weekdays.map((d) => ({
 day: d,
 avg: (dayHours[d] || 0) / (dayCounts[d] || 1),
 }));

 dayAvg.sort((a, b) => a.avg - b.avg);
 const worst = dayAvg[0];
 const best = dayAvg[dayAvg.length - 1];

 if (best.avg - worst.avg < 0.05) return null;

 return {
 id:"dia_maldito",
 icon: Skull,
 title:"Dia Maldito",
 subtitle:`${DAY_NAMES[worst.day]} es el dia con menos Deep Work`,
 finding:`Los ${DAY_NAMES[worst.day].toLowerCase()} el equipo solo promedia ${(worst.avg * 100).toFixed(0)}% de Deep Work en sus entradas, comparado con ${(best.avg * 100).toFixed(0)}% los ${DAY_NAMES[best.day].toLowerCase()}.`,
 detail:`Diferencia de ${((best.avg - worst.avg) * 100).toFixed(0)} puntos porcentuales entre el mejor y peor dia.`,
 severity:"medium",
 layer: 2,
 };
}

function analyzeHoraDorada(entries: TimeEntry[]): Fossil | null {
 // Hour of day with highest deep_work concentration
 const hourDeep: Record<number, number> = {};
 const hourTotal: Record<number, number> = {};

 for (const e of entries) {
 hourTotal[e.hour] = (hourTotal[e.hour] || 0) + 1;
 if (e.category ==="deep_work") {
 hourDeep[e.hour] = (hourDeep[e.hour] || 0) + 1;
 }
 }

 const hours = Object.keys(hourTotal).map(Number).filter((h) => hourTotal[h] >= 5);
 if (hours.length < 3) return null;

 const hourRatio = hours.map((h) => ({
 hour: h,
 ratio: (hourDeep[h] || 0) / hourTotal[h],
 count: hourDeep[h] || 0,
 }));

 hourRatio.sort((a, b) => b.ratio - a.ratio);
 const golden = hourRatio[0];

 if (golden.ratio < 0.2) return null;

 return {
 id:"hora_dorada",
 icon: Sun,
 title:"Hora Dorada",
 subtitle:`${formatHour(golden.hour)} es la hora de maxima concentracion`,
 finding:`A las ${formatHour(golden.hour)}, el ${(golden.ratio * 100).toFixed(0)}% de las entradas son Deep Work. Es el horario donde el equipo esta mas enfocado.`,
 detail:`${golden.count} entradas de Deep Work registradas en este horario.`,
 severity:"low",
 layer: 1,
 };
}

function analyzeEfectoDomino(entries: TimeEntry[], profiles: ProfileInfo[]): Fossil | null {
 // When person X logs"blocked", does anyone else's output drop the next day?
 const userDates: Record<string, Record<string, TimeEntry[]>> = {};
 for (const e of entries) {
 if (!userDates[e.user_id]) userDates[e.user_id] = {};
 if (!userDates[e.user_id][e.date]) userDates[e.user_id][e.date] = [];
 userDates[e.user_id][e.date].push(e);
 }

 const userIds = Object.keys(userDates);
 if (userIds.length < 2) return null;

 let bestCorrelation = { blocker:"", affected:"", dropCount: 0, totalBlocked: 0 };

 for (const blockerId of userIds) {
 const blockerDates = Object.keys(userDates[blockerId]);
 const blockedDays = blockerDates.filter((d) =>
 userDates[blockerId][d].some((e) => e.category ==="blocked")
 );

 if (blockedDays.length < 2) continue;

 for (const affectedId of userIds) {
 if (affectedId === blockerId) continue;

 let dropCount = 0;
 for (const blockedDay of blockedDays) {
 const nextDay = format(
 new Date(new Date(blockedDay +"T12:00:00").getTime() + 86400000),
"yyyy-MM-dd");
 const affectedNextDay = userDates[affectedId]?.[nextDay];
 const affectedBlockedDay = userDates[affectedId]?.[blockedDay];

 if (affectedNextDay && affectedBlockedDay) {
 const nextDeep = affectedNextDay.filter((e) => e.category ==="deep_work").length;
 const currentDeep = affectedBlockedDay.filter((e) => e.category ==="deep_work").length;
 if (nextDeep < currentDeep) dropCount++;
 }
 }

 if (dropCount > bestCorrelation.dropCount) {
 bestCorrelation = { blocker: blockerId, affected: affectedId, dropCount, totalBlocked: blockedDays.length };
 }
 }
 }

 if (bestCorrelation.dropCount < 2) return null;

 const blockerName = getName(profiles, bestCorrelation.blocker);
 const affectedName = getName(profiles, bestCorrelation.affected);
 const pct = ((bestCorrelation.dropCount / bestCorrelation.totalBlocked) * 100).toFixed(0);

 return {
 id:"efecto_domino",
 icon: Waves,
 title:"Efecto Domino",
 subtitle:`Cuando ${blockerName} se bloquea, ${affectedName} se afecta`,
 finding:`En el ${pct}% de los dias que ${blockerName} registro"Bloqueado", el Deep Work de ${affectedName} cayo al dia siguiente.`,
 detail:`Detectado en ${bestCorrelation.dropCount} de ${bestCorrelation.totalBlocked} bloqueos.`,
 severity:"high",
 layer: 4,
 };
}

function analyzePatronFantasma(entries: TimeEntry[]): Fossil | null {
 // Days where everyone's entries are thin (low description length) simultaneously
 const dateLengths: Record<string, { totalLen: number; count: number; users: Set<string> }> = {};

 for (const e of entries) {
 if (!dateLengths[e.date]) dateLengths[e.date] = { totalLen: 0, count: 0, users: new Set() };
 dateLengths[e.date].totalLen += (e.description?.length || 0) + (e.title?.length || 0);
 dateLengths[e.date].count++;
 dateLengths[e.date].users.add(e.user_id);
 }

 const dates = Object.entries(dateLengths)
 .filter(([, v]) => v.users.size >= 2 && v.count >= 3)
 .map(([date, v]) => ({
 date,
 avgLen: v.totalLen / v.count,
 people: v.users.size,
 }));

 if (dates.length < 5) return null;

 // Overall average
 const overallAvg = dates.reduce((s, d) => s + d.avgLen, 0) / dates.length;
 // Find days well below average
 const ghostDays = dates.filter((d) => d.avgLen < overallAvg * 0.5);

 if (ghostDays.length < 2) return null;

 // Most recent ghost day
 ghostDays.sort((a, b) => b.date.localeCompare(a.date));
 const latest = ghostDays[0];

 return {
 id:"patron_fantasma",
 icon: Ghost,
 title:"Patron Fantasma",
 subtitle:`${ghostDays.length} dias con entradas esqueleticas`,
 finding:`Hubo ${ghostDays.length} dias donde todo el equipo escribió descripciones 50% mas cortas de lo normal. El ultimo fue el ${format(parseISO(latest.date),"d 'de' MMMM", { locale: es })}.`,
 detail:`Promedio de ${Math.round(latest.avgLen)} caracteres vs ${Math.round(overallAvg)} normales.`,
 severity:"medium",
 layer: 3,
 };
}

function analyzeReunionVampiro(entries: TimeEntry[]): Fossil | null {
 // Time slot consistently filled with meetings
 const hourMeetings: Record<number, number> = {};
 const hourTotal: Record<number, number> = {};

 for (const e of entries) {
 hourTotal[e.hour] = (hourTotal[e.hour] || 0) + 1;
 if (e.category ==="meeting") {
 hourMeetings[e.hour] = (hourMeetings[e.hour] || 0) + 1;
 }
 }

 const hours = Object.keys(hourTotal).map(Number).filter((h) => hourTotal[h] >= 5);
 if (hours.length < 3) return null;

 const hourRatio = hours.map((h) => ({
 hour: h,
 ratio: (hourMeetings[h] || 0) / hourTotal[h],
 count: hourMeetings[h] || 0,
 }));

 hourRatio.sort((a, b) => b.ratio - a.ratio);
 const vampire = hourRatio[0];

 if (vampire.ratio < 0.3) return null;

 return {
 id:"reunion_vampiro",
 icon: Clock,
 title:"Reunion Vampiro",
 subtitle:`${formatHour(vampire.hour)} es devorado por reuniones`,
 finding:`A las ${formatHour(vampire.hour)}, el ${(vampire.ratio * 100).toFixed(0)}% de las entradas son reuniones. Este horario esta siendo consumido sistematicamente.`,
 detail:`${vampire.count} reuniones registradas en este slot.`,
 severity:"high",
 layer: 3,
 };
}

function analyzeRachaOculta(entries: TimeEntry[], profiles: ProfileInfo[]): Fossil | null {
 // Longest consecutive days where someone logged 8+ hours
 const userDates: Record<string, Set<string>> = {};

 for (const e of entries) {
 if (!userDates[e.user_id]) userDates[e.user_id] = new Set();
 userDates[e.user_id].add(e.date);
 }

 // Count entries per user per date
 const userDateCount: Record<string, Record<string, number>> = {};
 for (const e of entries) {
 if (!userDateCount[e.user_id]) userDateCount[e.user_id] = {};
 userDateCount[e.user_id][e.date] = (userDateCount[e.user_id][e.date] || 0) + 1;
 }

 let bestStreak = { userId:"", days: 0, startDate:"", endDate:""};

 for (const [userId, dateCounts] of Object.entries(userDateCount)) {
 const fullDays = Object.entries(dateCounts)
 .filter(([, count]) => count >= 8)
 .map(([date]) => date)
 .sort();

 if (fullDays.length < 3) continue;

 let currentStreak = 1;
 let streakStart = fullDays[0];

 for (let i = 1; i < fullDays.length; i++) {
 const diff = differenceInDays(parseISO(fullDays[i]), parseISO(fullDays[i - 1]));
 if (diff === 1 || (diff <= 3 && getDay(parseISO(fullDays[i - 1])) === 5)) {
 // Allow weekend gaps (Friday to Monday = 3 days)
 currentStreak++;
 } else {
 if (currentStreak > bestStreak.days) {
 bestStreak = { userId, days: currentStreak, startDate: streakStart, endDate: fullDays[i - 1] };
 }
 currentStreak = 1;
 streakStart = fullDays[i];
 }
 }
 if (currentStreak > bestStreak.days) {
 bestStreak = { userId, days: currentStreak, startDate: streakStart, endDate: fullDays[fullDays.length - 1] };
 }
 }

 if (bestStreak.days < 3) return null;

 const name = getName(profiles, bestStreak.userId);

 return {
 id:"racha_oculta",
 icon: Flame,
 title:"Racha Oculta",
 subtitle:`${name} mantuvo ${bestStreak.days} dias consecutivos con 8+ horas`,
 finding:`${name} registro 8 o mas horas ${bestStreak.days} dias consecutivos (laborales), del ${format(parseISO(bestStreak.startDate),"d MMM", { locale: es })} al ${format(parseISO(bestStreak.endDate),"d MMM", { locale: es })}.`,
 detail:"Contando dias laborales consecutivos, con fines de semana como pausas validas.",
 severity:"low",
 layer: 1,
 };
}

function analyzeCicloLunar(entries: TimeEntry[]): Fossil | null {
 // ~Monthly recurring patterns in productivity
 // Group entries by week number, look for ~4-week cycles
 const weekMap: Record<string, { deep: number; total: number }> = {};

 for (const e of entries) {
 const weekKey = format(parseISO(e.date),"yyyy-ww", { locale: es });
 if (!weekMap[weekKey]) weekMap[weekKey] = { deep: 0, total: 0 };
 weekMap[weekKey].total++;
 if (e.category ==="deep_work") weekMap[weekKey].deep++;
 }

 const weeks = Object.entries(weekMap)
 .map(([week, data]) => ({ week, ratio: data.deep / data.total }))
 .sort((a, b) => a.week.localeCompare(b.week));

 if (weeks.length < 8) return null;

 // Look for pattern: every ~4 weeks a dip
 const ratios = weeks.map((w) => w.ratio);
 const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
 const dipWeeks: number[] = [];

 for (let i = 0; i < ratios.length; i++) {
 if (ratios[i] < avg * 0.7) dipWeeks.push(i);
 }

 if (dipWeeks.length < 2) return null;

 // Check if gaps between dips are roughly 3-5 weeks
 const gaps: number[] = [];
 for (let i = 1; i < dipWeeks.length; i++) {
 gaps.push(dipWeeks[i] - dipWeeks[i - 1]);
 }

 const cyclicGaps = gaps.filter((g) => g >= 3 && g <= 5);
 if (cyclicGaps.length < 1) return null;

 const avgGap = Math.round(cyclicGaps.reduce((s, g) => s + g, 0) / cyclicGaps.length);

 return {
 id:"ciclo_lunar",
 icon: Moon,
 title:"Ciclo Lunar",
 subtitle:`Patron de productividad cada ~${avgGap} semanas`,
 finding:`La productividad del equipo parece seguir un ciclo de ~${avgGap} semanas. Se detectaron ${dipWeeks.length} caidas recurrentes con intervalos regulares.`,
 detail:`${dipWeeks.length} semanas de baja detectadas en ${weeks.length} semanas analizadas.`,
 severity:"medium",
 layer: 5,
 };
}

function analyzeGemelosDeTrabajo(entries: TimeEntry[], profiles: ProfileInfo[]): Fossil | null {
 // Two people who tend to log the same categories at the same hours
 const userHourCat: Record<string, Record<string, WorkCategory>> = {};

 for (const e of entries) {
 const key =`${e.date}_${e.hour}`;
 if (!userHourCat[e.user_id]) userHourCat[e.user_id] = {};
 userHourCat[e.user_id][key] = e.category;
 }

 const userIds = Object.keys(userHourCat);
 if (userIds.length < 2) return null;

 let bestPair = { userA:"", userB:"", matches: 0, total: 0 };

 for (let i = 0; i < userIds.length; i++) {
 for (let j = i + 1; j < userIds.length; j++) {
 const keysA = Object.keys(userHourCat[userIds[i]]);
 const keysB = new Set(Object.keys(userHourCat[userIds[j]]));
 const commonKeys = keysA.filter((k) => keysB.has(k));

 if (commonKeys.length < 10) continue;

 let matches = 0;
 for (const key of commonKeys) {
 if (userHourCat[userIds[i]][key] === userHourCat[userIds[j]][key]) {
 matches++;
 }
 }

 if (matches > bestPair.matches) {
 bestPair = { userA: userIds[i], userB: userIds[j], matches, total: commonKeys.length };
 }
 }
 }

 if (bestPair.matches < 10 || bestPair.total < 15) return null;

 const pct = ((bestPair.matches / bestPair.total) * 100).toFixed(0);
 const nameA = getName(profiles, bestPair.userA);
 const nameB = getName(profiles, bestPair.userB);

 if (Number(pct) < 30) return null;

 return {
 id:"gemelos_trabajo",
 icon: Users,
 title:"Gemelos de Trabajo",
 subtitle:`${nameA} y ${nameB} trabajan en sincronizacion`,
 finding:`${nameA} y ${nameB} registran la misma categoria a la misma hora el ${pct}% de las veces. Son los miembros mas sincronizados del equipo.`,
 detail:`${bestPair.matches} coincidencias de ${bestPair.total} horas compartidas.`,
 severity:"low",
 layer: 2,
 };
}

// ─── MAIN COMPONENT ─────────────────────────────────────────

export default function ArchaeologyPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [entries, setEntries] = useState<TimeEntry[]>([]);
 const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
 const [loading, setLoading] = useState(true);
 const [excavating, setExcavating] = useState(true);
 const supabase = createClient();

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId) {
 setLoading(false);
 setExcavating(false);
 return;
 }

 async function load() {
 const since = format(subDays(new Date(), 90),"yyyy-MM-dd");

 const [entriesRes, profilesRes] = await Promise.all([
 supabase
 .from("time_entries")
 .select("id, user_id, org_id, date, hour, category, title, description")
 .eq("org_id", orgId!)
 .gte("date", since)
 .order("date", { ascending: true }),
 supabase
 .from("profiles")
 .select("id, full_name")
 .in(
"id",
 await supabase
 .from("org_members")
 .select("user_id")
 .eq("org_id", orgId!)
 .then((r) => r.data?.map((m) => m.user_id) ?? [])
 ),
 ]);

 setEntries((entriesRes.data as TimeEntry[]) ?? []);
 setProfiles((profilesRes.data as ProfileInfo[]) ?? []);
 setLoading(false);

 // Simulate archaeological excavation delay
 setTimeout(() => setExcavating(false), 1200);
 }

 load();
 }, [orgLoading, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 const fossils = useMemo(() => {
 if (entries.length === 0) return [];

 const results: Fossil[] = [];

 const diaMaldito = analyzeDiaMaldito(entries);
 if (diaMaldito) results.push(diaMaldito);

 const horaDorada = analyzeHoraDorada(entries);
 if (horaDorada) results.push(horaDorada);

 const efectoDomino = analyzeEfectoDomino(entries, profiles);
 if (efectoDomino) results.push(efectoDomino);

 const patronFantasma = analyzePatronFantasma(entries);
 if (patronFantasma) results.push(patronFantasma);

 const reunionVampiro = analyzeReunionVampiro(entries);
 if (reunionVampiro) results.push(reunionVampiro);

 const rachaOculta = analyzeRachaOculta(entries, profiles);
 if (rachaOculta) results.push(rachaOculta);

 const cicloLunar = analyzeCicloLunar(entries);
 if (cicloLunar) results.push(cicloLunar);

 const gemelosDeTrabajo = analyzeGemelosDeTrabajo(entries, profiles);
 if (gemelosDeTrabajo) results.push(gemelosDeTrabajo);

 // Sort by layer depth (deepest first = most interesting)
 results.sort((a, b) => b.layer - a.layer);

 return results;
 }, [entries, profiles]);

 // ─── LOADING STATE ──────────────────────────────────────────
 if (loading || excavating) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="flex flex-col items-center gap-4">
 <div className="relative">
 <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-700 animate-pulse"/>
 <Pickaxe className="w-6 h-6 text-white absolute top-3 left-3"/>
 </div>
 <div className="text-center">
 <p className="text-sm font-medium text-foreground animate-pulse">
 Excavando datos...
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 Analizando 90 dias de registros
 </p>
 </div>
 </div>
 </div>
 );
 }

 // ─── STATS ──────────────────────────────────────────────────
 const totalDays = new Set(entries.map((e) => e.date)).size;
 const totalPeople = new Set(entries.map((e) => e.user_id)).size;
 const totalEntries = entries.length;

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-3 mb-2">
 <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
 <Pickaxe className="w-5 h-5 text-amber-700 dark:text-amber-400"/>
 </div>
 <div>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">Fosiles</h1>
 <p className="text-sm text-muted-foreground">
 Patrones ocultos excavados de {totalDays} dias de datos
 </p>
 </div>
 </div>

 {/* Archaeological Summary */}
 <div className="grid grid-cols-3 gap-3 mb-8 mt-6">
 <div className="bg-amber-50/60 dark:bg-amber-950/20 p-3 text-center border border-amber-200/30 dark:border-amber-800/20">
 <p className="text-2xl font-bold tabular-nums tracking-tight text-amber-800 dark:text-amber-300">
 {totalEntries.toLocaleString()}
 </p>
 <p className="text-[11px] text-muted-foreground">Registros excavados</p>
 </div>
 <div className="bg-amber-50/60 dark:bg-amber-950/20 p-3 text-center border border-amber-200/30 dark:border-amber-800/20">
 <p className="text-2xl font-bold tabular-nums tracking-tight text-amber-800 dark:text-amber-300">
 {totalDays}
 </p>
 <p className="text-[11px] text-muted-foreground">Dias analizados</p>
 </div>
 <div className="bg-amber-50/60 dark:bg-amber-950/20 p-3 text-center border border-amber-200/30 dark:border-amber-800/20">
 <p className="text-2xl font-bold tabular-nums tracking-tight text-amber-800 dark:text-amber-300">
 {fossils.length}
 </p>
 <p className="text-[11px] text-muted-foreground">Fosiles encontrados</p>
 </div>
 </div>

 {/* Archaeological Layers Legend */}
 <div className="flex items-center gap-2 mb-6">
 <Layers className="w-4 h-4 text-muted-foreground"/>
 <p className="text-xs text-muted-foreground">
 Ordenados por profundidad del estrato — los hallazgos mas profundos son los mas reveladores
 </p>
 </div>

 {/* Fossils */}
 {fossils.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center mb-4">
 <Pickaxe className="w-8 h-8 text-primary"/>
 </div>
 <h3 className="text-lg font-semibold mb-1">Sin fosiles aun</h3>
 <p className="text-sm text-muted-foreground text-center max-w-md">
 Necesitamos mas datos para excavar patrones ocultos. Sigue registrando entradas y vuelve en unas semanas.
 </p>
 </div>
 ) : (
 <div className="space-y-4">
 {fossils.map((fossil, index) => {
 const style = LAYER_STYLES[fossil.layer] || LAYER_STYLES[1];
 const severityBadge = SEVERITY_BADGE[fossil.severity];
 const Icon = fossil.icon;

 return (
 <Card
 key={fossil.id}
 className={cn(
"transition-all duration-300 border",
 style.border,
 style.bg,
 style.glow
 )}
 >
 <CardContent className="p-5">
 <div className="flex items-start gap-4">
 {/* Layer indicator */}
 <div className="flex flex-col items-center gap-1 min-w-[40px]">
 <div
 className={cn(
"w-10 h-10 flex items-center justify-center",
 fossil.severity ==="high"?"bg-red-100 dark:bg-red-900/30": fossil.severity ==="medium"?"bg-orange-100 dark:bg-orange-900/30":"bg-amber-100 dark:bg-amber-900/30")}
 >
 <Icon
 className={cn(
"w-5 h-5",
 fossil.severity ==="high"?"text-red-700 dark:text-red-400": fossil.severity ==="medium"?"text-orange-700 dark:text-orange-400":"text-amber-700 dark:text-amber-400")}
 />
 </div>
 <div className="flex gap-0.5 mt-1">
 {Array.from({ length: 5 }).map((_, i) => (
 <div
 key={i}
 className={cn(
"w-1.5 h-1.5 rounded-full",
 i < fossil.layer
 ?"bg-amber-500 dark:bg-amber-400":"bg-amber-200 dark:bg-amber-800")}
 />
 ))}
 </div>
 </div>

 {/* Content */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap mb-1">
 <h3 className="font-semibold text-foreground">{fossil.title}</h3>
 <Badge
 className={cn("text-[10px] border-0", severityBadge.className)}
 >
 Capa {fossil.layer}
 </Badge>
 </div>
 <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
 {fossil.subtitle}
 </p>
 <p className="text-sm text-muted-foreground leading-relaxed">
 {fossil.finding}
 </p>
 {fossil.detail && (
 <p className="text-xs text-muted-foreground/70 mt-2 italic">
 {fossil.detail}
 </p>
 )}
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 )}

 {/* Footer */}
 {fossils.length > 0 && (
 <div className="mt-8 text-center">
 <p className="text-xs text-muted-foreground">
 Basado en {totalEntries.toLocaleString()} registros de {totalPeople} personas en los ultimos 90 dias
 </p>
 </div>
 )}
 </div>
 );
}
