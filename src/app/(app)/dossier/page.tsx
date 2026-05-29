"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { TimeEntry, AccountabilityFlag, DailyCloseout } from "@/lib/types/database";
import { CATEGORIES } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials, formatHour } from "@/lib/utils";
import {
 ScrollText,
 User,
 AlertTriangle,
 TrendingUp,
 TrendingDown,
 Minus,
 ShieldAlert,
 Eye,
 Clock,
 Ghost,
 Copy,
 CalendarOff,
 FileWarning,
 Activity,
 BarChart3,
 ChevronDown,
} from "lucide-react";
import { format, subDays, getDay, differenceInCalendarDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";

// ============================================================
// Types
// ============================================================

type Severity ="low"|"medium"|"high";
type Trend ="improving"|"stable"|"worsening";

interface Finding {
 id: string;
 name: string;
 description: string;
 evidence: string[];
 severity: Severity;
 trend: Trend;
 icon: typeof AlertTriangle;
}

interface MemberOption {
 userId: string;
 fullName: string;
 email: string;
}

interface DossierData {
 entries: TimeEntry[];
 closeouts: DailyCloseout[];
 flags: AccountabilityFlag[];
 standups: Array<{ id: string; date: string; submitted_at: string }>;
}

// ============================================================
// Day names in Spanish
// ============================================================

const DAY_NAMES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

// ============================================================
// Severity config
// ============================================================

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string; border: string }> = {
 low: {
 label:"BAJA",
 color:"text-yellow-700 dark:text-yellow-400",
 bg:"bg-yellow-50 dark:bg-yellow-950/20",
 border:"border-yellow-300 dark:border-yellow-800",
 },
 medium: {
 label:"MEDIA",
 color:"text-orange-700 dark:text-orange-400",
 bg:"bg-orange-50 dark:bg-orange-950/20",
 border:"border-orange-300 dark:border-orange-800",
 },
 high: {
 label:"ALTA",
 color:"text-red-700 dark:text-red-400",
 bg:"bg-red-50 dark:bg-red-950/20",
 border:"border-red-300 dark:border-red-800",
 },
};

const TREND_CONFIG: Record<Trend, { label: string; icon: typeof TrendingUp; color: string }> = {
 improving: { label:"Mejorando", icon: TrendingDown, color:"text-green-600 dark:text-green-400"},
 stable: { label:"Estable", icon: Minus, color:"text-yellow-600 dark:text-yellow-400"},
 worsening: { label:"Empeorando", icon: TrendingUp, color:"text-red-600 dark:text-red-400"},
};

// ============================================================
// Levenshtein distance for copy-paste detection
// ============================================================

function levenshtein(a: string, b: string): number {
 const an = a.length;
 const bn = b.length;
 if (an === 0) return bn;
 if (bn === 0) return an;
 const matrix: number[][] = [];
 for (let i = 0; i <= an; i++) {
 matrix[i] = [i];
 }
 for (let j = 0; j <= bn; j++) {
 matrix[0][j] = j;
 }
 for (let i = 1; i <= an; i++) {
 for (let j = 1; j <= bn; j++) {
 const cost = a[i - 1] === b[j - 1] ? 0 : 1;
 matrix[i][j] = Math.min(
 matrix[i - 1][j] + 1,
 matrix[i][j - 1] + 1,
 matrix[i - 1][j - 1] + cost
 );
 }
 }
 return matrix[an][bn];
}

function similarity(a: string, b: string): number {
 if (a.length === 0 && b.length === 0) return 1;
 const maxLen = Math.max(a.length, b.length);
 if (maxLen === 0) return 1;
 return 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

// ============================================================
// Pattern Detection Engine
// ============================================================

function detectPatterns(data: DossierData, memberName: string): Finding[] {
 const findings: Finding[] = [];
 const { entries, closeouts, flags } = data;
 if (entries.length === 0) return findings;

 const today = new Date();
 const ninetyDaysAgo = subDays(today, 90);
 const midpoint = subDays(today, 45);

 // Helper: split entries into first half and second half (for trend analysis)
 const firstHalf = entries.filter((e) => parseISO(e.date) < midpoint);
 const secondHalf = entries.filter((e) => parseISO(e.date) >= midpoint);

 // ---- 1. DIA DEBIL ----
 {
 const dayHours: Record<number, number[]> = {};
 for (let d = 0; d < 7; d++) dayHours[d] = [];
 const dateHours = new Map<string, number>();
 for (const e of entries) {
 dateHours.set(e.date, (dateHours.get(e.date) ?? 0) + 1);
 }
 for (const [dateStr, hours] of dateHours) {
 const day = getDay(parseISO(dateStr));
 dayHours[day].push(hours);
 }
 // Find weekday with lowest average (only count days 1-5)
 let weakestDay = -1;
 let weakestAvg = Infinity;
 let strongestAvg = 0;
 for (let d = 1; d <= 5; d++) {
 if (dayHours[d].length === 0) continue;
 const avg = dayHours[d].reduce((a, b) => a + b, 0) / dayHours[d].length;
 if (avg < weakestAvg) {
 weakestAvg = avg;
 weakestDay = d;
 }
 if (avg > strongestAvg) strongestAvg = avg;
 }
 if (weakestDay >= 0 && strongestAvg > 0 && weakestAvg < strongestAvg * 0.75) {
 const diff = Math.round((1 - weakestAvg / strongestAvg) * 100);
 findings.push({
 id:"dia_debil",
 name:"DIA DEBIL",
 description:`${memberName} consistentemente registra menos horas los ${DAY_NAMES[weakestDay]}.`,
 evidence: [
`Promedio los ${DAY_NAMES[weakestDay]}: ${weakestAvg.toFixed(1)}h vs mejor día: ${strongestAvg.toFixed(1)}h`,
`${diff}% menos productividad ese día`,
`Basado en ${dayHours[weakestDay].length} ${DAY_NAMES[weakestDay]}(s) analizados`,
 ],
 severity: diff > 50 ?"high": diff > 30 ?"medium":"low",
 trend:"stable",
 icon: CalendarOff,
 });
 }
 }

 // ---- 2. HORA FANTASMA ----
 {
 const hourCounts: Record<number, number> = {};
 for (let h = 7; h <= 20; h++) hourCounts[h] = 0;
 for (const e of entries) {
 if (e.hour >= 7 && e.hour <= 20) hourCounts[e.hour]++;
 }
 const totalDays = new Set(entries.map((e) => e.date)).size;
 const ghostHours: number[] = [];
 for (let h = 8; h <= 18; h++) {
 // Core hours where you'd expect at least some entries
 if (hourCounts[h] < totalDays * 0.05) {
 ghostHours.push(h);
 }
 }
 if (ghostHours.length > 0 && ghostHours.length <= 6) {
 findings.push({
 id:"hora_fantasma",
 name:"HORA FANTASMA",
 description:`${memberName} NUNCA registra trabajo en ciertos horarios. Huecos sospechosos.`,
 evidence: [
`Horarios fantasma: ${ghostHours.map(formatHour).join(",")}`,
`De ${totalDays} días analizados, estas horas tienen <5% de registros`,
`Patrón consistente en 90 días`,
 ],
 severity: ghostHours.length > 3 ?"high": ghostHours.length > 1 ?"medium":"low",
 trend:"stable",
 icon: Ghost,
 });
 }
 }

 // ---- 3. PATRON DE TARDANZA ----
 {
 const firstHalfLate = firstHalf.filter((e) => e.is_late).length;
 const secondHalfLate = secondHalf.filter((e) => e.is_late).length;
 const firstHalfTotal = firstHalf.length || 1;
 const secondHalfTotal = secondHalf.length || 1;
 const firstRate = firstHalfLate / firstHalfTotal;
 const secondRate = secondHalfLate / secondHalfTotal;
 const totalLate = entries.filter((e) => e.is_late).length;
 const totalRate = totalLate / entries.length;

 if (totalRate > 0.1) {
 let trend: Trend ="stable";
 if (secondRate > firstRate * 1.3) trend ="worsening";
 else if (secondRate < firstRate * 0.7) trend ="improving";

 findings.push({
 id:"patron_tardanza",
 name:"PATRON DE TARDANZA",
 description:`${memberName} registra entradas tardías con frecuencia preocupante.`,
 evidence: [
`${totalLate} entradas tardías de ${entries.length} (${Math.round(totalRate * 100)}%)`,
`Primera mitad: ${Math.round(firstRate * 100)}% tardías`,
`Segunda mitad: ${Math.round(secondRate * 100)}% tardías`,
`Minutos promedio de tardanza: ${Math.round(entries.filter((e) => e.is_late).reduce((s, e) => s + e.minutes_late, 0) / (totalLate || 1))}min`,
 ],
 severity: totalRate > 0.4 ?"high": totalRate > 0.2 ?"medium":"low",
 trend,
 icon: Clock,
 });
 }
 }

 // ---- 4. EVIDENCIA SELECTIVA ----
 {
 const categoryProof: Record<string, { withProof: number; total: number }> = {};
 for (const e of entries) {
 if (!categoryProof[e.category]) categoryProof[e.category] = { withProof: 0, total: 0 };
 categoryProof[e.category].total++;
 if (e.proof_urls && e.proof_urls.length > 0) {
 categoryProof[e.category].withProof++;
 }
 }
 const rates: Array<{ cat: string; rate: number; total: number }> = [];
 for (const [cat, data] of Object.entries(categoryProof)) {
 if (data.total >= 5) {
 rates.push({ cat, rate: data.withProof / data.total, total: data.total });
 }
 }
 if (rates.length >= 2) {
 const maxRate = Math.max(...rates.map((r) => r.rate));
 const minRate = Math.min(...rates.map((r) => r.rate));
 if (maxRate - minRate > 0.4) {
 const highCat = rates.find((r) => r.rate === maxRate);
 const lowCat = rates.find((r) => r.rate === minRate);
 findings.push({
 id:"evidencia_selectiva",
 name:"EVIDENCIA SELECTIVA",
 description:`${memberName} solo proporciona pruebas para ciertas categorías. Sesgo de evidencia detectado.`,
 evidence: [
`${CATEGORIES[highCat!.cat as keyof typeof CATEGORIES]?.label ?? highCat!.cat}: ${Math.round(highCat!.rate * 100)}% con evidencia (${highCat!.total} entradas)`,
`${CATEGORIES[lowCat!.cat as keyof typeof CATEGORIES]?.label ?? lowCat!.cat}: ${Math.round(lowCat!.rate * 100)}% con evidencia (${lowCat!.total} entradas)`,
`Diferencia: ${Math.round((maxRate - minRate) * 100)} puntos porcentuales`,
 ],
 severity: maxRate - minRate > 0.7 ?"high":"medium",
 trend:"stable",
 icon: Eye,
 });
 }
 }
 }

 // ---- 5. EFECTO VIERNES ----
 {
 const dateHours = new Map<string, number>();
 for (const e of entries) {
 dateHours.set(e.date, (dateHours.get(e.date) ?? 0) + 1);
 }
 const fridayHours: number[] = [];
 const nonFridayHours: number[] = [];
 for (const [dateStr, hours] of dateHours) {
 const day = getDay(parseISO(dateStr));
 if (day === 5) fridayHours.push(hours);
 else if (day >= 1 && day <= 4) nonFridayHours.push(hours);
 }
 if (fridayHours.length >= 3 && nonFridayHours.length >= 5) {
 const fridayAvg = fridayHours.reduce((a, b) => a + b, 0) / fridayHours.length;
 const otherAvg = nonFridayHours.reduce((a, b) => a + b, 0) / nonFridayHours.length;
 const dropPercent = Math.round((1 - fridayAvg / otherAvg) * 100);
 if (dropPercent > 15) {
 findings.push({
 id:"efecto_viernes",
 name:"EFECTO VIERNES",
 description:`${memberName} baja su rendimiento los viernes de manera consistente.`,
 evidence: [
`Promedio viernes: ${fridayAvg.toFixed(1)}h vs otros días: ${otherAvg.toFixed(1)}h`,
`Caída del ${dropPercent}% en productividad`,
`Basado en ${fridayHours.length} viernes analizados`,
 ],
 severity: dropPercent > 40 ?"high": dropPercent > 25 ?"medium":"low",
 trend:"stable",
 icon: CalendarOff,
 });
 }
 }
 }

 // ---- 6. COMPENSACION ----
 {
 const dateHours = new Map<string, number>();
 for (const e of entries) {
 dateHours.set(e.date, (dateHours.get(e.date) ?? 0) + 1);
 }
 const sortedDates = [...dateHours.keys()].sort();
 let compensationCount = 0;
 let totalBadDays = 0;
 const compensationExamples: string[] = [];
 for (let i = 0; i < sortedDates.length - 1; i++) {
 const hours = dateHours.get(sortedDates[i])!;
 const nextHours = dateHours.get(sortedDates[i + 1])!;
 const daysDiff = differenceInCalendarDays(parseISO(sortedDates[i + 1]), parseISO(sortedDates[i]));
 if (hours <= 4 && daysDiff <= 2) {
 totalBadDays++;
 if (nextHours >= 9) {
 compensationCount++;
 if (compensationExamples.length < 3) {
 compensationExamples.push(
`${format(parseISO(sortedDates[i]),"d MMM", { locale: es })}: ${hours}h -> día siguiente: ${nextHours}h`);
 }
 }
 }
 }
 if (totalBadDays >= 3 && compensationCount / totalBadDays > 0.4) {
 findings.push({
 id:"compensacion",
 name:"COMPENSACION",
 description:`${memberName} registra horas extra el día después de un día malo. Patrón de sobrecompensación.`,
 evidence: [
`${compensationCount} de ${totalBadDays} días malos seguidos de sobrecompensación`,
 ...compensationExamples,
 ],
 severity: compensationCount > 5 ?"medium":"low",
 trend:"stable",
 icon: Activity,
 });
 }
 }

 // ---- 7. COPIA-PEGA SOSPECHOSO ----
 {
 const descriptions = entries
 .filter((e) => e.description && e.description.length > 15)
 .map((e) => ({ desc: e.description!, date: e.date, title: e.title }));

 let similarPairs = 0;
 const examples: string[] = [];
 for (let i = 0; i < descriptions.length && i < 200; i++) {
 for (let j = i + 1; j < descriptions.length && j < 200; j++) {
 if (descriptions[i].date === descriptions[j].date) continue; // Same day is OK
 const sim = similarity(descriptions[i].desc, descriptions[j].desc);
 if (sim > 0.85) {
 similarPairs++;
 if (examples.length < 3) {
 examples.push(
`"${descriptions[i].desc.slice(0, 50)}..."(${descriptions[i].date}) vs"${descriptions[j].desc.slice(0, 50)}..."(${descriptions[j].date}) - ${Math.round(sim * 100)}% similitud`);
 }
 }
 }
 }
 if (similarPairs >= 3) {
 findings.push({
 id:"copia_pega",
 name:"COPIA-PEGA SOSPECHOSO",
 description:`${memberName} tiene descripciones sospechosamente similares entre días distintos.`,
 evidence: [
`${similarPairs} pares de entradas con >85% similitud en días diferentes`,
 ...examples,
 ],
 severity: similarPairs > 10 ?"high": similarPairs > 5 ?"medium":"low",
 trend:"stable",
 icon: Copy,
 });
 }
 }

 // ---- 8. PICO Y CAIDA ----
 {
 // Check if Mon-Tue are significantly higher than Thu-Fri
 const dateHours = new Map<string, number>();
 for (const e of entries) {
 dateHours.set(e.date, (dateHours.get(e.date) ?? 0) + 1);
 }
 const startOfWeekHours: number[] = []; // Mon-Tue
 const endOfWeekHours: number[] = []; // Thu-Fri
 for (const [dateStr, hours] of dateHours) {
 const day = getDay(parseISO(dateStr));
 if (day === 1 || day === 2) startOfWeekHours.push(hours);
 if (day === 4 || day === 5) endOfWeekHours.push(hours);
 }
 if (startOfWeekHours.length >= 5 && endOfWeekHours.length >= 5) {
 const startAvg = startOfWeekHours.reduce((a, b) => a + b, 0) / startOfWeekHours.length;
 const endAvg = endOfWeekHours.reduce((a, b) => a + b, 0) / endOfWeekHours.length;
 const dropPercent = Math.round((1 - endAvg / startAvg) * 100);
 if (dropPercent > 20) {
 findings.push({
 id:"pico_caida",
 name:"PICO Y CAIDA",
 description:`${memberName} arranca la semana fuerte pero decae consistentemente hacia el jueves-viernes.`,
 evidence: [
`Lun-Mar promedio: ${startAvg.toFixed(1)}h`,
`Jue-Vie promedio: ${endAvg.toFixed(1)}h`,
`Caída del ${dropPercent}% en la segunda mitad de la semana`,
 ],
 severity: dropPercent > 40 ?"high": dropPercent > 25 ?"medium":"low",
 trend:"stable",
 icon: BarChart3,
 });
 }
 }
 }

 // ---- 9. HORARIO FANTASMA (backfilling) ----
 {
 const outsideHours = entries.filter((e) => {
 const loggedAt = new Date(e.logged_at || e.created_at);
 const loggedHour = loggedAt.getHours();
 // Logged before 6am or after 11pm — suspicious
 return loggedHour < 6 || loggedHour >= 23;
 });
 const afterHoursBackfill = entries.filter((e) => {
 if (!e.logged_at) return false;
 const loggedDate = new Date(e.logged_at).toISOString().split("T")[0];
 return loggedDate !== e.date; // Logged on a different day than the entry date
 });

 if (outsideHours.length >= 5 || afterHoursBackfill.length >= 10) {
 const count = Math.max(outsideHours.length, afterHoursBackfill.length);
 findings.push({
 id:"horario_fantasma",
 name:"HORARIO FANTASMA",
 description:`${memberName} registra entradas fuera de horario laboral o en fechas retroactivas. Posible backfilling.`,
 evidence: [
`${outsideHours.length} entradas registradas entre 11PM-6AM`,
`${afterHoursBackfill.length} entradas registradas en un día diferente al que corresponden`,
`${Math.round((count / entries.length) * 100)}% del total de entradas`,
 ],
 severity: count > entries.length * 0.3 ?"high": count > entries.length * 0.15 ?"medium":"low",
 trend:"stable",
 icon: FileWarning,
 });
 }
 }

 // ---- 10. REACCION A PRESION ----
 {
 if (flags.length >= 3) {
 // Look at entries logged in the 3 days after each flag
 let improvedCount = 0;
 let totalChecked = 0;
 for (const flag of flags) {
 const flagDate = parseISO(flag.date);
 const afterStart = format(flagDate,"yyyy-MM-dd");
 const afterEnd = format(subDays(flagDate, -3),"yyyy-MM-dd");
 const beforeStart = format(subDays(flagDate, 3),"yyyy-MM-dd");

 const before = entries.filter((e) => e.date >= beforeStart && e.date < afterStart);
 const after = entries.filter((e) => e.date > afterStart && e.date <= afterEnd);

 if (before.length > 0 && after.length > 0) {
 totalChecked++;
 const beforeAvgHours = before.length / 3;
 const afterAvgHours = after.length / 3;
 if (afterAvgHours > beforeAvgHours * 1.1) improvedCount++;
 }
 }

 if (totalChecked >= 2) {
 const improvementRate = improvedCount / totalChecked;
 findings.push({
 id:"reaccion_presion",
 name:"REACCION A PRESION",
 description: improvementRate > 0.5
 ?`${memberName} reacciona positivamente cuando recibe flags. La presión funciona.`:`${memberName} NO mejora después de recibir flags. La presión no tiene efecto.`,
 evidence: [
`${flags.length} flags recibidos en 90 días`,
`${improvedCount} de ${totalChecked} veces mejoró después del flag`,
`Tasa de reacción: ${Math.round(improvementRate * 100)}%`,
 ],
 severity: improvementRate < 0.3 ?"high": improvementRate < 0.6 ?"medium":"low",
 trend: improvementRate > 0.5 ?"improving": improvementRate < 0.3 ?"worsening":"stable",
 icon: ShieldAlert,
 });
 }
 }
 }

 return findings;
}

// ============================================================
// Risk Level Calculation
// ============================================================

function calculateRiskLevel(findings: Finding[]): number {
 if (findings.length === 0) return 1;
 let score = 0;
 for (const f of findings) {
 switch (f.severity) {
 case"high": score += 3; break;
 case"medium": score += 2; break;
 case"low": score += 1; break;
 }
 if (f.trend ==="worsening") score += 1;
 }
 if (score >= 15) return 5;
 if (score >= 10) return 4;
 if (score >= 6) return 3;
 if (score >= 3) return 2;
 return 1;
}

function getRiskLabel(level: number): { label: string; color: string; bg: string } {
 switch (level) {
 case 5: return { label:"CRITICO", color:"text-red-600 dark:text-red-400", bg:"bg-red-100 dark:bg-red-950/30"};
 case 4: return { label:"ALTO", color:"text-orange-600 dark:text-orange-400", bg:"bg-orange-100 dark:bg-orange-950/30"};
 case 3: return { label:"MODERADO", color:"text-yellow-600 dark:text-yellow-400", bg:"bg-yellow-100 dark:bg-yellow-950/30"};
 case 2: return { label:"BAJO", color:"text-blue-600 dark:text-blue-400", bg:"bg-blue-100 dark:bg-blue-950/30"};
 default: return { label:"MINIMO", color:"text-green-600 dark:text-green-400", bg:"bg-green-100 dark:bg-green-950/30"};
 }
}

// ============================================================
// Summary Generator
// ============================================================

function generateSummary(findings: Finding[], memberName: string, riskLevel: number, totalEntries: number, totalDays: number): string {
 if (findings.length === 0) {
 return`${memberName} no presenta patrones de comportamiento anómalos en los últimos 90 días. Con ${totalEntries} entradas en ${totalDays} días, su perfil conductual se mantiene dentro de parámetros normales. No se detectan irregularidades que requieran intervención.`;
 }

 const highFindings = findings.filter((f) => f.severity ==="high");
 const worseningFindings = findings.filter((f) => f.trend ==="worsening");
 const riskConfig = getRiskLabel(riskLevel);

 let summary =`Expediente de ${memberName}: ${findings.length} patrones conductuales detectados en 90 días (${totalEntries} entradas, ${totalDays} días activos).`;

 if (highFindings.length > 0) {
 summary +=`Se identifican ${highFindings.length} hallazgo(s) de alta severidad: ${highFindings.map((f) => f.name).join(",")}.`;
 }

 if (worseningFindings.length > 0) {
 summary +=`Tendencia negativa en: ${worseningFindings.map((f) => f.name).join(",")}.`;
 }

 summary +=`Nivel de riesgo clasificado como ${riskConfig.label}.`;

 if (riskLevel >= 4) {
 summary +=`Se recomienda intervención directa e inmediata. Los patrones de ${memberName} sugieren un deterioro progresivo que requiere acción correctiva antes de que se normalice.`;
 } else if (riskLevel >= 3) {
 summary +=`Monitoreo continuo recomendado. ${memberName} muestra señales de comportamientos que podrían escalar si no se abordan.`;
 } else {
 summary +=`No se requiere acción inmediata, pero se recomienda revisión periódica.`;
 }

 return summary;
}

// ============================================================
// Page Component
// ============================================================

export default function DossierPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [members, setMembers] = useState<MemberOption[]>([]);
 const [selectedMember, setSelectedMember] = useState<string | null>(null);
 const [dossierData, setDossierData] = useState<DossierData | null>(null);
 const [loading, setLoading] = useState(true);
 const [analyzing, setAnalyzing] = useState(false);
 const [selectorOpen, setSelectorOpen] = useState(false);

 // Load members
 useEffect(() => {
 if (!orgId) return;

 async function loadMembers() {
 const { data: orgMembers } = await supabase
 .from("org_members")
 .select("user_id")
 .eq("org_id", orgId!);

 if (!orgMembers || orgMembers.length === 0) {
 setLoading(false);
 return;
 }

 const userIds = orgMembers.map((m) => m.user_id);
 const { data: profiles } = await supabase
 .from("profiles")
 .select("id, full_name, email")
 .in("id", userIds);

 const memberList: MemberOption[] = (profiles ?? []).map((p) => ({
 userId: p.id,
 fullName: p.full_name ?? p.email,
 email: p.email,
 }));

 memberList.sort((a, b) => a.fullName.localeCompare(b.fullName));
 setMembers(memberList);
 setLoading(false);
 }
 loadMembers();
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 // Load dossier data for selected member
 const loadDossier = useCallback(
 async (memberId: string) => {
 if (!orgId) return;
 setAnalyzing(true);
 setDossierData(null);

 const today = new Date().toISOString().split("T")[0];
 const ninetyDaysAgo = subDays(new Date(), 90).toISOString().split("T")[0];

 const [entriesRes, closeoutsRes, flagsRes, standupsRes] = await Promise.all([
 supabase
 .from("time_entries")
 .select("*")
 .eq("user_id", memberId)
 .eq("org_id", orgId)
 .gte("date", ninetyDaysAgo)
 .lte("date", today)
 .order("date", { ascending: true }),
 supabase
 .from("daily_closeouts")
 .select("*")
 .eq("user_id", memberId)
 .eq("org_id", orgId)
 .gte("date", ninetyDaysAgo)
 .lte("date", today),
 supabase
 .from("accountability_flags")
 .select("*")
 .eq("user_id", memberId)
 .eq("org_id", orgId)
 .gte("date", ninetyDaysAgo)
 .lte("date", today),
 supabase
 .from("standups")
 .select("id, date, submitted_at")
 .eq("user_id", memberId)
 .eq("org_id", orgId)
 .gte("date", ninetyDaysAgo)
 .lte("date", today),
 ]);

 setDossierData({
 entries: entriesRes.data ?? [],
 closeouts: closeoutsRes.data ?? [],
 flags: flagsRes.data ?? [],
 standups: standupsRes.data ?? [],
 });
 setAnalyzing(false);
 },
 [orgId, supabase]
 );

 // When member is selected, load their data
 useEffect(() => {
 if (selectedMember) {
 loadDossier(selectedMember);
 }
 }, [selectedMember, loadDossier]);

 const selectedMemberName = members.find((m) => m.userId === selectedMember)?.fullName ??"—";

 const findings = useMemo(() => {
 if (!dossierData) return [];
 return detectPatterns(dossierData, selectedMemberName);
 }, [dossierData, selectedMemberName]);

 const riskLevel = useMemo(() => calculateRiskLevel(findings), [findings]);
 const riskConfig = getRiskLabel(riskLevel);

 const totalDays = useMemo(() => {
 if (!dossierData) return 0;
 return new Set(dossierData.entries.map((e) => e.date)).size;
 }, [dossierData]);

 const summary = useMemo(() => {
 if (!dossierData) return"";
 return generateSummary(findings, selectedMemberName, riskLevel, dossierData.entries.length, totalDays);
 }, [findings, selectedMemberName, riskLevel, dossierData, totalDays]);

 // ---- Render ----

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
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <div className="flex items-center gap-2.5 mb-1">
 <ScrollText className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Expediente
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground">
 Perfil conductual basado en 90 días de datos. Patrones, no estadísticas.
 </p>
 </div>

 {/* Member Selector */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 SUJETO DE INVESTIGACION
 </p>
 <div className="relative">
 <button
 onClick={() => setSelectorOpen(!selectorOpen)}
 className={cn(
"w-full flex items-center justify-between px-4 py-3 border border-border bg-background",
"font-mono text-sm transition-colors hover:border-primary/30 cursor-pointer",
 selectedMember &&"border-primary/20")}
 >
 <div className="flex items-center gap-3">
 {selectedMember ? (
 <>
 <div className="w-8 h-8 bg-accent/50 border border-border flex items-center justify-center font-mono text-xs font-bold">
 {getInitials(selectedMemberName)}
 </div>
 <div className="text-left">
 <p className="font-mono text-sm font-medium">{selectedMemberName}</p>
 <p className="font-mono text-[10px] text-muted-foreground">
 {members.find((m) => m.userId === selectedMember)?.email}
 </p>
 </div>
 </>
 ) : (
 <>
 <div className="w-8 h-8 border border-dashed border-muted-foreground/30 flex items-center justify-center">
 <User className="w-4 h-4 text-muted-foreground"/>
 </div>
 <span className="text-muted-foreground">Selecciona un miembro del equipo</span>
 </>
 )}
 </div>
 <ChevronDown
 className={cn(
"w-4 h-4 text-muted-foreground transition-transform duration-200",
 selectorOpen &&"rotate-180")}
 />
 </button>
 {selectorOpen && (
 <div className="absolute z-50 w-full mt-1 border border-border bg-background max-h-64 overflow-y-auto">
 {members.map((m) => (
 <button
 key={m.userId}
 onClick={() => {
 setSelectedMember(m.userId);
 setSelectorOpen(false);
 }}
 className={cn(
"w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/30 cursor-pointer",
 selectedMember === m.userId &&"bg-primary/5")}
 >
 <div className="w-7 h-7 bg-accent/50 border border-border flex items-center justify-center font-mono text-[10px] font-bold">
 {getInitials(m.fullName)}
 </div>
 <div>
 <p className="font-mono text-xs font-medium">{m.fullName}</p>
 <p className="font-mono text-[10px] text-muted-foreground">{m.email}</p>
 </div>
 </button>
 ))}
 </div>
 )}
 </div>
 </div>

 {/* Analyzing state */}
 {analyzing && (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="relative">
 <ScrollText className="w-10 h-10 text-primary animate-pulse"/>
 <div className="absolute inset-0 w-10 h-10 border border-primary/30 animate-ping"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground animate-pulse tracking-widest uppercase">
 Construyendo expediente...
 </p>
 <p className="font-mono text-[10px] text-muted-foreground">
 Analizando 90 días de comportamiento de {selectedMemberName}
 </p>
 </div>
 )}

 {/* No member selected */}
 {!selectedMember && !analyzing && (
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <ScrollText className="w-7 h-7 text-muted-foreground"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground text-center">
 Selecciona un miembro del equipo para generar su expediente conductual.
 </p>
 </div>
 )}

 {/* Dossier Results */}
 {dossierData && !analyzing && selectedMember && (
 <div className="space-y-8">
 {/* Subject Header */}
 <div className="border border-border p-5">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-3">
 <div className="w-12 h-12 bg-accent/50 border border-border flex items-center justify-center font-mono text-lg font-bold">
 {getInitials(selectedMemberName)}
 </div>
 <div>
 <p className="font-mono text-lg font-bold uppercase tracking-tight">
 {selectedMemberName}
 </p>
 <p className="font-mono text-[10px] text-muted-foreground">
 EXPEDIENTE CONDUCTUAL - ULTIMOS 90 DIAS
 </p>
 </div>
 </div>
 <div className={cn("px-3 py-1.5 border", riskConfig.bg)}>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 RIESGO
 </p>
 <p className={cn("font-mono text-xl font-black tabular-nums tracking-tight", riskConfig.color)}>
 {riskLevel}/5
 </p>
 <p className={cn("font-mono text-[9px] font-bold uppercase tracking-wider", riskConfig.color)}>
 {riskConfig.label}
 </p>
 </div>
 </div>

 {/* Quick stats bar */}
 <div className="grid grid-cols-4 gap-3 pt-4 border-t border-border">
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] uppercase text-muted-foreground tracking-wider">
 Entradas
 </p>
 <p className="font-mono text-lg font-bold tabular-nums tracking-tight">
 {dossierData.entries.length}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] uppercase text-muted-foreground tracking-wider">
 Días activos
 </p>
 <p className="font-mono text-lg font-bold tabular-nums tracking-tight">
 {totalDays}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] uppercase text-muted-foreground tracking-wider">
 Flags
 </p>
 <p className="font-mono text-lg font-bold tabular-nums tracking-tight">
 {dossierData.flags.length}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <p className="font-mono text-[9px] uppercase text-muted-foreground tracking-wider">
 Hallazgos
 </p>
 <p className="font-mono text-lg font-bold tabular-nums tracking-tight">
 {findings.length}
 </p>
 </div>
 </div>
 </div>

 {/* Risk Level Banner */}
 <div className={cn("border p-5", riskConfig.bg, SEVERITY_CONFIG[riskLevel >= 4 ?"high": riskLevel >= 3 ?"medium":"low"].border)}>
 <div className="flex items-start gap-3">
 <ShieldAlert className={cn("w-5 h-5 mt-0.5 shrink-0", riskConfig.color)} />
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
 NIVEL DE RIESGO
 </p>
 <div className="flex items-center gap-3 mb-3">
 {[1, 2, 3, 4, 5].map((level) => (
 <div
 key={level}
 className={cn(
"w-8 h-8 border flex items-center justify-center font-mono text-xs font-bold transition-colors",
 level <= riskLevel
 ? level >= 4
 ?"bg-red-500 border-red-500 text-white": level >= 3
 ?"bg-yellow-500 border-yellow-500 text-white":"bg-green-500 border-green-500 text-white":"border-border text-muted-foreground")}
 >
 {level}
 </div>
 ))}
 </div>
 <p className={cn("font-mono text-xs font-bold uppercase tracking-wider", riskConfig.color)}>
 {riskConfig.label}
 {riskLevel >= 4 &&"— Requiere intervención"}
 {riskLevel === 3 &&"— Monitoreo recomendado"}
 {riskLevel <= 2 &&"— Sin acción requerida"}
 </p>
 </div>
 </div>
 </div>

 {/* Findings */}
 {findings.length > 0 && (
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4">
 HALLAZGOS ({findings.length})
 </p>
 <div className="space-y-3">
 {findings
 .sort((a, b) => {
 const sev = { high: 3, medium: 2, low: 1 };
 return sev[b.severity] - sev[a.severity];
 })
 .map((finding) => {
 const sevConfig = SEVERITY_CONFIG[finding.severity];
 const trendConfig = TREND_CONFIG[finding.trend];
 const TrendIcon = trendConfig.icon;
 const FindingIcon = finding.icon;
 return (
 <Card key={finding.id} className={cn("border transition-colors duration-200 hover:border-primary/30")}>
 <CardContent className="p-5">
 <div className="flex items-start gap-4">
 <div className={cn("w-10 h-10 border flex items-center justify-center shrink-0", sevConfig.bg, sevConfig.border)}>
 <FindingIcon className={cn("w-5 h-5", sevConfig.color)} />
 </div>
 <div className="flex-1 min-w-0">
 {/* Finding header */}
 <div className="flex items-center gap-2 flex-wrap mb-1">
 <h3 className="font-mono text-sm font-bold uppercase tracking-tight">
 {finding.name}
 </h3>
 <Badge variant="outline"className={cn("font-mono text-[9px] px-1.5 py-0", sevConfig.color, sevConfig.border)}>
 {sevConfig.label}
 </Badge>
 <div className={cn("flex items-center gap-0.5 font-mono text-[10px]", trendConfig.color)}>
 <TrendIcon className="w-3 h-3"/>
 {trendConfig.label}
 </div>
 </div>

 {/* Description */}
 <p className="font-mono text-xs text-muted-foreground mb-3">
 {finding.description}
 </p>

 {/* Evidence */}
 <div className="border-t border-border pt-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 EVIDENCIA
 </p>
 {finding.evidence.map((ev, i) => (
 <p key={i} className="font-mono text-[11px] text-muted-foreground mb-0.5 pl-2 border-l-2 border-border">
 {ev}
 </p>
 ))}
 </div>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 )}

 {/* No findings */}
 {findings.length === 0 && (
 <div className="flex flex-col items-center justify-center py-16 gap-4 border border-border">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <ScrollText className="w-7 h-7 text-green-500/40"/>
 </div>
 <div className="text-center">
 <p className="font-mono text-sm font-bold uppercase tracking-tight text-green-600 dark:text-green-400">
 Expediente limpio
 </p>
 <p className="font-mono text-xs text-muted-foreground mt-1">
 No se detectaron patrones conductuales anómalos para {selectedMemberName}.
 </p>
 </div>
 </div>
 )}

 {/* Dossier Summary */}
 <div className="border border-border p-5">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 RESUMEN DEL EXPEDIENTE
 </p>
 <p className="font-mono text-xs text-muted-foreground leading-relaxed">
 {summary}
 </p>
 <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
 <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
 Generado {format(new Date(),"d MMM yyyy, HH:mm", { locale: es })}
 </p>
 <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
 CLASIFICADO - USO INTERNO
 </p>
 </div>
 </div>

 {/* Bottom border */}
 <div className="text-center py-6 border-t border-border">
 <p className="font-mono text-[9px] text-muted-foreground/20 uppercase tracking-[0.3em]">
 Fin del expediente - {selectedMemberName}
 </p>
 </div>
 </div>
 )}
 </div>
 );
}
