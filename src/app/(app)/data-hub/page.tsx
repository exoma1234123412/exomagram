"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn } from "@/lib/utils";
import { subDays, format, differenceInCalendarWeeks, isWeekend } from "date-fns";
import { es } from "date-fns/locale";
import {
 Database,
 BarChart3,
 Heart,
 Clock,
 MessageSquare,
 GitBranch,
 Target,
 Brain,
 TrendingUp,
 CheckCircle2,
 AlertCircle,
 ArrowRight,
 Zap,
 Activity,
 Shield,
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceStatus {
 key: string;
 name: string;
 icon: React.ReactNode;
 collected: number;
 possible: number;
 rate: number;
 lastDate: string | null;
 link: string | null;
}

interface FieldCompletion {
 field: string;
 label: string;
 filled: number;
 total: number;
 rate: number;
}

interface DayTrend {
 date: string;
 completeness: number;
}

interface Recommendation {
 text: string;
 priority:"high"|"medium"|"low";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWorkDays(startDate: Date, endDate: Date): number {
 let count = 0;
 const cur = new Date(startDate);
 while (cur <= endDate) {
 if (!isWeekend(cur)) count++;
 cur.setDate(cur.getDate() + 1);
 }
 return count;
}

function rateColor(rate: number): string {
 if (rate >= 0.8) return"text-emerald-500";
 if (rate >= 0.5) return"text-amber-500";
 return"text-red-500";
}

function barColor(rate: number): string {
 if (rate >= 0.7) return"bg-emerald-500";
 if (rate >= 0.3) return"bg-amber-500";
 return"bg-red-500";
}

function scoreColor(pct: number): string {
 if (pct >= 80) return"text-emerald-500";
 if (pct >= 50) return"text-amber-500";
 return"text-red-500";
}

// ---------------------------------------------------------------------------
// Tracked entry fields (21 optional fields)
// ---------------------------------------------------------------------------

const TRACKED_FIELDS: { field: string; label: string; mode:"truthy"|"nonzero"|"nonempty"|"explicit"}[] = [
 { field:"description", label:"Descripcion", mode:"truthy"},
 { field:"mood", label:"Estado de animo", mode:"truthy"},
 { field:"energy", label:"Nivel de energia", mode:"truthy"},
 { field:"proof_urls", label:"Evidencia (URLs)", mode:"nonempty"},
 { field:"project", label:"Proyecto", mode:"truthy"},
 { field:"difficulty", label:"Dificultad", mode:"truthy"},
 { field:"focus_quality", label:"Calidad de enfoque", mode:"truthy"},
 { field:"value_rating", label:"Valor generado", mode:"truthy"},
 { field:"stress_level", label:"Nivel de estres", mode:"truthy"},
 { field:"confidence", label:"Confianza del dato", mode:"truthy"},
 { field:"interruptions", label:"Interrupciones", mode:"nonzero"},
 { field:"context_switches", label:"Cambios de contexto", mode:"nonzero"},
 { field:"collaborators", label:"Colaboradores", mode:"nonempty"},
 { field:"output_type", label:"Tipo de output", mode:"truthy"},
 { field:"tools_used", label:"Herramientas usadas", mode:"nonempty"},
 { field:"location", label:"Ubicacion", mode:"truthy"},
 { field:"client_facing", label:"Cliente presente", mode:"explicit"},
 { field:"could_be_async", label:"Pudo ser async", mode:"explicit"},
 { field:"blocker_detail", label:"Detalle de blocker", mode:"truthy"},
 { field:"skills_tags", label:"Tags de habilidades", mode:"nonempty"},
 { field:"learning_notes", label:"Notas de aprendizaje", mode:"truthy"},
];

function isFieldFilled(entry: Record<string, unknown>, field: string, mode: string): boolean {
 const val = entry[field];
 switch (mode) {
 case"truthy":
 return val !== null && val !== undefined && val !=="";
 case"nonzero":
 return typeof val ==="number"&& val > 0;
 case"nonempty":
 return Array.isArray(val) && val.length > 0;
 case"explicit":
 // client_facing defaults false, could_be_async defaults null
 // Consider filled if explicitly true
 return val === true;
 default:
 return false;
 }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataHubPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [loading, setLoading] = useState(true);

 // Raw data
 const [entries, setEntries] = useState<Record<string, unknown>[]>([]);
 const [healthCount, setHealthCount] = useState(0);
 const [reflectionCount, setReflectionCount] = useState(0);
 const [focusSessionDays, setFocusSessionDays] = useState(0);
 const [commLogDays, setCommLogDays] = useState(0);
 const [gitDays, setGitDays] = useState(0);
 const [closeoutCount, setCloseoutCount] = useState(0);
 const [standupCount, setStandupCount] = useState(0);
 const [reactionDaysGiven, setReactionDaysGiven] = useState(0);
 const [reactionDaysReceived, setReactionDaysReceived] = useState(0);
 const [lastHealthDate, setLastHealthDate] = useState<string | null>(null);
 const [lastCloseoutDate, setLastCloseoutDate] = useState<string | null>(null);
 const [lastStandupDate, setLastStandupDate] = useState<string | null>(null);
 const [lastReflectionDate, setLastReflectionDate] = useState<string | null>(null);
 const [lastFocusDate, setLastFocusDate] = useState<string | null>(null);
 const [lastCommDate, setLastCommDate] = useState<string | null>(null);
 const [lastGitDate, setLastGitDate] = useState<string | null>(null);
 const [lastReactionDate, setLastReactionDate] = useState<string | null>(null);
 const [totalVariables, setTotalVariables] = useState(0);

 const supabase = createClient();

 // Date range: last 30 days
 const endDate = useMemo(() => new Date(), []);
 const startDate = useMemo(() => subDays(endDate, 29), [endDate]);
 const startStr = useMemo(() => format(startDate,"yyyy-MM-dd"), [startDate]);
 const endStr = useMemo(() => format(endDate,"yyyy-MM-dd"), [endDate]);
 const workDays = useMemo(() => getWorkDays(startDate, endDate), [startDate, endDate]);
 const weeks = useMemo(
 () => Math.max(1, differenceInCalendarWeeks(endDate, startDate, { weekStartsOn: 1 }) + 1),
 [startDate, endDate]
 );

 useEffect(() => {
 if (orgLoading || !orgId || !userId) {
 if (!orgLoading) setLoading(false);
 return;
 }

 async function fetchAll() {
 const [
 entriesRes,
 healthRes,
 reflectionRes,
 focusRes,
 commRes,
 gitRes,
 closeoutRes,
 standupRes,
 reactionsGivenRes,
 reactionsReceivedRes,
 ] = await Promise.all([
 // 1. Time entries
 supabase
 .from("time_entries")
 .select("*")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr)
 .lte("date", endStr),

 // 2. Daily health
 supabase
 .from("daily_health")
 .select("date")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr)
 .lte("date", endStr)
 .order("date", { ascending: false }),

 // 3. Weekly reflections
 supabase
 .from("weekly_reflections")
 .select("week_start")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("week_start", startStr)
 .lte("week_start", endStr)
 .order("week_start", { ascending: false }),

 // 4. Focus sessions
 supabase
 .from("focus_sessions")
 .select("started_at")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("started_at", new Date(startStr).toISOString())
 .lte("started_at", new Date(endStr +"T23:59:59").toISOString()),

 // 5. Communication log
 supabase
 .from("communication_log")
 .select("date")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr)
 .lte("date", endStr)
 .order("date", { ascending: false }),

 // 6. Git daily metrics
 supabase
 .from("git_daily_metrics")
 .select("date")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr)
 .lte("date", endStr)
 .order("date", { ascending: false }),

 // 7. Daily closeouts
 supabase
 .from("daily_closeouts")
 .select("date")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr)
 .lte("date", endStr)
 .order("date", { ascending: false }),

 // 8. Standups
 supabase
 .from("standups")
 .select("date")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr)
 .lte("date", endStr)
 .order("date", { ascending: false }),

 // 9. Reactions given
 supabase
 .from("entry_reactions")
 .select("created_at")
 .eq("user_id", userId!)
 .gte("created_at", new Date(startStr).toISOString())
 .lte("created_at", new Date(endStr +"T23:59:59").toISOString()),

 // 10. Reactions received (entries belonging to user that got reactions)
 supabase
 .from("entry_reactions")
 .select("created_at, entry_id")
 .gte("created_at", new Date(startStr).toISOString())
 .lte("created_at", new Date(endStr +"T23:59:59").toISOString()),
 ]);

 // Process time entries
 const rawEntries = (entriesRes.data ?? []) as Record<string, unknown>[];
 setEntries(rawEntries);

 // Unique entry dates (days with at least 1 entry)
 const entryDates = new Set(rawEntries.map((e) => e.date as string));

 // Health
 const healthDates = healthRes.data ?? [];
 setHealthCount(healthDates.length);
 setLastHealthDate(healthDates.length > 0 ? (healthDates[0] as { date: string }).date : null);

 // Reflections
 const reflections = reflectionRes.data ?? [];
 setReflectionCount(reflections.length);
 setLastReflectionDate(reflections.length > 0 ? (reflections[0] as { week_start: string }).week_start : null);

 // Focus sessions — unique days
 const focusDates = new Set<string>(
 (focusRes.data ?? []).map((s) => (s as { started_at: string }).started_at.split("T")[0])
 );
 setFocusSessionDays(focusDates.size);
 const focusArr = Array.from(focusDates).sort().reverse();
 setLastFocusDate(focusArr.length > 0 ? focusArr[0] : null);

 // Communication log
 const commDates = commRes.data ?? [];
 setCommLogDays(commDates.length);
 setLastCommDate(commDates.length > 0 ? (commDates[0] as { date: string }).date : null);

 // Git metrics
 const gitDates = gitRes.data ?? [];
 setGitDays(gitDates.length);
 setLastGitDate(gitDates.length > 0 ? (gitDates[0] as { date: string }).date : null);

 // Closeouts
 const closeouts = closeoutRes.data ?? [];
 setCloseoutCount(closeouts.length);
 setLastCloseoutDate(closeouts.length > 0 ? (closeouts[0] as { date: string }).date : null);

 // Standups
 const standups = standupRes.data ?? [];
 setStandupCount(standups.length);
 setLastStandupDate(standups.length > 0 ? (standups[0] as { date: string }).date : null);

 // Reactions given — unique days
 const givenDays = new Set<string>(
 (reactionsGivenRes.data ?? []).map((r) => (r as { created_at: string }).created_at.split("T")[0])
 );
 setReactionDaysGiven(givenDays.size);
 const givenArr = Array.from(givenDays).sort().reverse();
 setLastReactionDate(givenArr.length > 0 ? givenArr[0] : null);

 // Reactions received
 const receivedDays = new Set<string>(
 (reactionsReceivedRes.data ?? []).map((r) => (r as { created_at: string }).created_at.split("T")[0])
 );
 setReactionDaysReceived(receivedDays.size);

 // Count total non-null variables across all data
 let varCount = 0;
 // Time entries fields
 for (const e of rawEntries) {
 for (const tf of TRACKED_FIELDS) {
 if (isFieldFilled(e, tf.field, tf.mode)) varCount++;
 }
 // Always-filled fields: category, title, hour, date
 varCount += 4;
 }
 // Other sources: each record = data points
 varCount += healthDates.length * 15; // daily_health has ~15 fields
 varCount += reflections.length * 12; // weekly_reflection has ~12 fields
 varCount += focusDates.size * 10; // focus_session has ~10 fields
 varCount += commDates.length * 12; // communication_log has ~12 fields
 varCount += gitDates.length * 14; // git_daily has ~14 fields
 varCount += closeouts.length * 5; // closeout has ~5 fields
 varCount += standups.length * 4; // standup has ~4 fields
 varCount += givenDays.size; // each reaction day = 1+
 setTotalVariables(varCount);

 setLoading(false);
 }

 fetchAll();
 }, [orgId, userId, orgLoading, startStr, endStr]); // eslint-disable-line react-hooks/exhaustive-deps

 // ---------------------------------------------------------------------------
 // Computed data
 // ---------------------------------------------------------------------------

 // Entry dates
 const entryDatesSet = useMemo(
 () => new Set(entries.map((e) => e.date as string)),
 [entries]
 );
 const entryDayCount = entryDatesSet.size;

 // Advanced data rate — entries with difficulty OR focus_quality filled
 const advancedCount = useMemo(
 () =>
 entries.filter(
 (e) =>
 (e.difficulty !== null && e.difficulty !== undefined) ||
 (e.focus_quality !== null && e.focus_quality !== undefined)
 ).length,
 [entries]
 );

 // Sources
 const sources: SourceStatus[] = useMemo(() => {
 return [
 {
 key:"entries",
 name:"Entradas de Tiempo",
 icon: <Clock className="w-4 h-4 text-primary"/>,
 collected: entryDayCount,
 possible: workDays,
 rate: workDays > 0 ? entryDayCount / workDays : 0,
 lastDate: entries.length > 0 ? (entries[entries.length - 1].date as string) : null,
 link:"/dashboard",
 },
 {
 key:"advanced",
 name:"Datos Avanzados",
 icon: <Brain className="w-4 h-4 text-primary"/>,
 collected: advancedCount,
 possible: entries.length,
 rate: entries.length > 0 ? advancedCount / entries.length : 0,
 lastDate: null,
 link:"/dashboard",
 },
 {
 key:"health",
 name:"Check-in Salud",
 icon: <Heart className="w-4 h-4 text-primary"/>,
 collected: healthCount,
 possible: workDays,
 rate: workDays > 0 ? healthCount / workDays : 0,
 lastDate: lastHealthDate,
 link:"/health",
 },
 {
 key:"closeouts",
 name:"Cierre de Dia",
 icon: <CheckCircle2 className="w-4 h-4 text-primary"/>,
 collected: closeoutCount,
 possible: workDays,
 rate: workDays > 0 ? closeoutCount / workDays : 0,
 lastDate: lastCloseoutDate,
 link:"/dashboard",
 },
 {
 key:"standups",
 name:"Standups",
 icon: <MessageSquare className="w-4 h-4 text-primary"/>,
 collected: standupCount,
 possible: workDays,
 rate: workDays > 0 ? standupCount / workDays : 0,
 lastDate: lastStandupDate,
 link:"/standup",
 },
 {
 key:"reflections",
 name:"Reflexiones",
 icon: <Target className="w-4 h-4 text-primary"/>,
 collected: reflectionCount,
 possible: weeks,
 rate: weeks > 0 ? reflectionCount / weeks : 0,
 lastDate: lastReflectionDate,
 link:"/journal",
 },
 {
 key:"focus",
 name:"Sesiones Enfoque",
 icon: <Zap className="w-4 h-4 text-primary"/>,
 collected: focusSessionDays,
 possible: workDays,
 rate: workDays > 0 ? focusSessionDays / workDays : 0,
 lastDate: lastFocusDate,
 link:"/focus",
 },
 {
 key:"comms",
 name:"Comunicaciones",
 icon: <Activity className="w-4 h-4 text-primary"/>,
 collected: commLogDays,
 possible: workDays,
 rate: workDays > 0 ? commLogDays / workDays : 0,
 lastDate: lastCommDate,
 link: null,
 },
 {
 key:"git",
 name:"Git Metrics",
 icon: <GitBranch className="w-4 h-4 text-primary"/>,
 collected: gitDays,
 possible: workDays,
 rate: workDays > 0 ? gitDays / workDays : 0,
 lastDate: lastGitDate,
 link: null,
 },
 {
 key:"reactions",
 name:"Reacciones",
 icon: <Shield className="w-4 h-4 text-primary"/>,
 collected: reactionDaysGiven,
 possible: workDays,
 rate: workDays > 0 ? reactionDaysGiven / workDays : 0,
 lastDate: lastReactionDate,
 link:"/dashboard",
 },
 ];
 }, [
 entryDayCount, advancedCount, entries, healthCount, closeoutCount,
 standupCount, reflectionCount, focusSessionDays, commLogDays, gitDays,
 reactionDaysGiven, workDays, weeks,
 lastHealthDate, lastCloseoutDate, lastStandupDate, lastReflectionDate,
 lastFocusDate, lastCommDate, lastGitDate, lastReactionDate,
 ]);

 // Completeness score — weighted average
 const completenessScore = useMemo(() => {
 const weights: Record<string, number> = {
 entries: 25,
 advanced: 10,
 health: 10,
 closeouts: 15,
 standups: 15,
 reflections: 5,
 focus: 5,
 comms: 5,
 git: 5,
 reactions: 5,
 };
 let totalWeight = 0;
 let weightedSum = 0;
 for (const s of sources) {
 const w = weights[s.key] ?? 5;
 weightedSum += Math.min(1, s.rate) * w;
 totalWeight += w;
 }
 return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;
 }, [sources]);

 // Field completions
 const fieldCompletions: FieldCompletion[] = useMemo(() => {
 if (entries.length === 0) return [];
 return TRACKED_FIELDS.map((tf) => {
 const filled = entries.filter((e) => isFieldFilled(e, tf.field, tf.mode)).length;
 return {
 field: tf.field,
 label: tf.label,
 filled,
 total: entries.length,
 rate: entries.length > 0 ? filled / entries.length : 0,
 };
 });
 }, [entries]);

 // 30-day trend
 const dailyTrend: DayTrend[] = useMemo(() => {
 if (entries.length === 0) return [];
 const byDate = new Map<string, Record<string, unknown>[]>();
 for (const e of entries) {
 const d = e.date as string;
 const list = byDate.get(d) ?? [];
 list.push(e);
 byDate.set(d, list);
 }

 const result: DayTrend[] = [];
 for (let i = 0; i < 30; i++) {
 const d = format(subDays(endDate, 29 - i),"yyyy-MM-dd");
 const dayEntries = byDate.get(d) ?? [];
 if (dayEntries.length === 0) {
 result.push({ date: d, completeness: 0 });
 continue;
 }
 let totalFilled = 0;
 const totalPossible = dayEntries.length * TRACKED_FIELDS.length;
 for (const e of dayEntries) {
 for (const tf of TRACKED_FIELDS) {
 if (isFieldFilled(e, tf.field, tf.mode)) totalFilled++;
 }
 }
 result.push({
 date: d,
 completeness: totalPossible > 0 ? Math.round((totalFilled / totalPossible) * 100) : 0,
 });
 }
 return result;
 }, [entries, endDate]);

 const maxTrend = useMemo(
 () => Math.max(1, ...dailyTrend.map((d) => d.completeness)),
 [dailyTrend]
 );

 // Recommendations
 const recommendations: Recommendation[] = useMemo(() => {
 const recs: Recommendation[] = [];

 // Health gaps
 if (healthCount === 0) {
 recs.push({ text:"Registra tu check-in de salud diario — no tienes ninguno en los ultimos 30 dias", priority:"high"});
 } else if (healthCount < workDays * 0.5) {
 const missing = workDays - healthCount;
 recs.push({ text:`Registra tu check-in de salud — llevas ${missing} dias sin hacerlo de ${workDays} laborables`, priority:"medium"});
 }

 // Closeout gaps
 if (closeoutCount < workDays * 0.5) {
 recs.push({ text:`Completa tu cierre de dia — solo ${closeoutCount} de ${workDays} dias laborables`, priority:"high"});
 }

 // Standup gaps
 if (standupCount < workDays * 0.5) {
 recs.push({ text:`Registra tu standup diario — solo ${standupCount} de ${workDays} dias laborables`, priority:"high"});
 }

 // Reflections
 if (reflectionCount === 0) {
 recs.push({ text:"Haz una reflexion semanal — no tienes ninguna este mes", priority:"medium"});
 }

 // Location field
 const locationRate = entries.length > 0
 ? entries.filter((e) => e.location !== null && e.location !== undefined).length / entries.length
 : 0;
 if (locationRate < 0.3 && entries.length > 0) {
 recs.push({ text:`Agrega ubicacion a tus entradas — solo ${Math.round(locationRate * 100)}% tienen ubicacion`, priority:"low"});
 }

 // Difficulty/focus quality
 const advRate = entries.length > 0 ? advancedCount / entries.length : 0;
 if (advRate < 0.3 && entries.length > 0) {
 recs.push({ text:`Registra dificultad y calidad de enfoque — solo ${Math.round(advRate * 100)}% de entradas tienen datos avanzados`, priority:"medium"});
 }

 // Focus sessions
 if (focusSessionDays < workDays * 0.3) {
 recs.push({ text:"Usa sesiones de enfoque para rastrear tu deep work con mas precision", priority:"low"});
 }

 // Reactions
 if (reactionDaysGiven < workDays * 0.2) {
 recs.push({ text:"Reacciona a entradas de tus companeros — fortalece el accountability mutuo", priority:"low"});
 }

 return recs.slice(0, 5);
 }, [
 healthCount, closeoutCount, standupCount, reflectionCount,
 entries, advancedCount, focusSessionDays, reactionDaysGiven, workDays,
 ]);

 // ---------------------------------------------------------------------------
 // Render
 // ---------------------------------------------------------------------------

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
 <div className="flex items-center justify-center h-screen">
 <p className="text-muted-foreground font-mono text-xs">Sin organizacion</p>
 </div>
 );
 }

 return (
 <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <div className="flex items-center gap-2 mb-1">
 <Database className="w-4 h-4 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Hub de Datos
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground">
 Estado de recoleccion de datos en todas las fuentes
 </p>
 </div>

 {/* Section 1: Completeness Score */}
 <section className="mb-8">
 <div className="palantir-divider mb-4 text-muted-foreground">
 Puntuacion de Completitud
 </div>
 <div className="corner-marks border border-border bg-grid-palantir p-6 flex flex-col items-center justify-center gap-2">
 <span className="label-mono text-muted-foreground">Data Score</span>
 <span className={cn("data-number text-5xl", scoreColor(completenessScore))}>
 {completenessScore}%
 </span>
 <span className="font-mono text-[10px] text-muted-foreground/60 tracking-wide">
 Ultimos 30 dias &middot; {workDays} dias laborables
 </span>
 </div>
 </section>

 {/* Section 2: Status by Source */}
 <section className="mb-8">
 <div className="palantir-divider mb-4 text-muted-foreground">
 Estado por Fuente
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
 {sources.map((s) => (
 <div
 key={s.key}
 className="card-palantir p-4 flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 {s.icon}
 <span className="font-mono text-xs font-semibold tracking-tight">
 {s.name}
 </span>
 </div>
 <span className={cn("font-mono text-sm font-bold tabular-nums", rateColor(s.rate))}>
 {Math.round(s.rate * 100)}%
 </span>
 </div>

 {/* Progress bar */}
 <div className="w-full h-1.5 bg-accent/30 border border-border overflow-hidden">
 <div
 className={cn("h-full transition-all duration-500", barColor(s.rate))}
 style={{ width:`${Math.min(100, Math.round(s.rate * 100))}%`}}
 />
 </div>

 <div className="flex items-center justify-between">
 <span className="data-cell text-muted-foreground/60">
 {s.collected} / {s.possible}
 {s.key ==="reflections"?"sem":"dias"}
 </span>
 <div className="flex items-center gap-2">
 {s.lastDate && (
 <span className="data-cell text-muted-foreground">
 {format(new Date(s.lastDate +"T12:00:00"),"dd MMM", { locale: es })}
 </span>
 )}
 {s.link && (
 <Link href={s.link} className="text-primary hover:text-primary/80">
 <ArrowRight className="w-3 h-3"/>
 </Link>
 )}
 </div>
 </div>
 </div>
 ))}
 </div>
 </section>

 {/* Section 3: Entry Field Completion */}
 <section className="mb-8">
 <div className="palantir-divider mb-4 text-muted-foreground">
 Campos de Entrada Detallados
 </div>
 {entries.length === 0 ? (
 <div className="border border-border p-8 flex flex-col items-center gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <BarChart3 className="w-6 h-6 text-muted-foreground"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground">
 Sin entradas en los ultimos 30 dias
 </p>
 </div>
 ) : (
 <div className="border border-border divide-y divide-border">
 {/* Table header */}
 <div className="grid grid-cols-[1fr_80px_1fr_60px] gap-2 px-4 py-2 bg-accent/20">
 <span className="label-mono text-muted-foreground">Campo</span>
 <span className="label-mono text-muted-foreground text-right">Tasa</span>
 <span className="label-mono text-muted-foreground">Barra</span>
 <span className="label-mono text-muted-foreground text-right">N</span>
 </div>
 {fieldCompletions.map((fc) => (
 <div
 key={fc.field}
 className="grid grid-cols-[1fr_80px_1fr_60px] gap-2 px-4 py-2 items-center hover:bg-accent/10 transition-colors">
 <span className="font-mono text-xs truncate">{fc.label}</span>
 <span className={cn("font-mono text-xs text-right tabular-nums font-semibold", rateColor(fc.rate))}>
 {Math.round(fc.rate * 100)}%
 </span>
 <div className="w-full h-1 bg-accent/20 overflow-hidden">
 <div
 className={cn("h-full transition-all duration-300", barColor(fc.rate))}
 style={{ width:`${Math.round(fc.rate * 100)}%`}}
 />
 </div>
 <span className="data-cell text-muted-foreground text-right">
 {fc.filled}/{fc.total}
 </span>
 </div>
 ))}
 </div>
 )}
 </section>

 {/* Section 4: 30-Day Trend */}
 <section className="mb-8">
 <div className="palantir-divider mb-4 text-muted-foreground">
 Tendencia de Completitud (30 dias)
 </div>
 {dailyTrend.length === 0 ? (
 <div className="border border-border p-8 flex flex-col items-center gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <TrendingUp className="w-6 h-6 text-muted-foreground"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground">
 Sin datos de tendencia
 </p>
 </div>
 ) : (
 <div className="border border-border bg-grid-palantir p-4">
 {/* Bar chart */}
 <div className="flex items-end gap-[2px] h-32">
 {dailyTrend.map((d, i) => {
 const height = maxTrend > 0 ? (d.completeness / maxTrend) * 100 : 0;
 const dayOfWeek = new Date(d.date +"T12:00:00").getDay();
 const isWknd = dayOfWeek === 0 || dayOfWeek === 6;
 return (
 <div
 key={d.date}
 className="flex-1 flex flex-col items-center justify-end group relative"title={`${format(new Date(d.date +"T12:00:00"),"dd MMM", { locale: es })}: ${d.completeness}%`}
 >
 <div
 className={cn(
"w-full min-h-[2px] transition-all duration-300",
 d.completeness === 0
 ?"bg-muted/30": d.completeness >= 50
 ?"bg-primary/70 group-hover:bg-primary": d.completeness >= 25
 ?"bg-amber-500/70 group-hover:bg-amber-500":"bg-red-500/70 group-hover:bg-red-500",
 isWknd &&"opacity-40")}
 style={{ height:`${Math.max(2, height)}%`}}
 />
 {/* Tooltip on hover */}
 <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
 <div className="bg-popover border border-border px-2 py-1 font-mono text-[9px] whitespace-nowrap">
 {format(new Date(d.date +"T12:00:00"),"dd/MM")}: {d.completeness}%
 </div>
 </div>
 </div>
 );
 })}
 </div>
 {/* X-axis labels */}
 <div className="flex justify-between mt-2">
 <span className="data-cell text-muted-foreground">
 {format(new Date(dailyTrend[0].date +"T12:00:00"),"dd MMM", { locale: es })}
 </span>
 <span className="data-cell text-muted-foreground">
 {format(new Date(dailyTrend[dailyTrend.length - 1].date +"T12:00:00"),"dd MMM", { locale: es })}
 </span>
 </div>
 </div>
 )}
 </section>

 {/* Section 5: Recommendations */}
 {recommendations.length > 0 && (
 <section className="mb-8">
 <div className="palantir-divider mb-4 text-muted-foreground">
 Recomendaciones
 </div>
 <div className="space-y-2">
 {recommendations.map((r, i) => (
 <div
 key={i}
 className={cn(
"border-l-2 pl-3 py-2 font-mono text-xs",
 r.priority ==="high"?"border-red-500 text-foreground": r.priority ==="medium"?"border-amber-500 text-foreground/80":"border-primary text-muted-foreground")}
 >
 <div className="flex items-start gap-2">
 <AlertCircle className={cn(
"w-3 h-3 mt-0.5 shrink-0",
 r.priority ==="high"?"text-red-500": r.priority ==="medium"?"text-amber-500":"text-primary")} />
 <span>{r.text}</span>
 </div>
 </div>
 ))}
 </div>
 </section>
 )}

 {/* Section 6: Total Variables Collected */}
 <section className="mb-8">
 <div className="palantir-divider mb-4 text-muted-foreground">
 Variables Recolectadas
 </div>
 <div className="border border-border bg-accent/20 p-6 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Database className="w-5 h-5 text-primary"/>
 <div>
 <span className="font-mono text-sm font-semibold">Variables unicas recolectadas</span>
 <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
 Puntos de datos no nulos en todas las tablas (30 dias)
 </p>
 </div>
 </div>
 <span className="data-number text-3xl text-primary">
 {totalVariables.toLocaleString()}
 </span>
 </div>
 </section>
 </div>
 );
}
