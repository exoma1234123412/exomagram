"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, CATEGORY_COLORS, FLAG_TYPES, REACTIONS } from "@/lib/constants";
import type { WorkCategory, FlagType, ReactionType } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import {
 BarChart3, TrendingUp, Users, Shield, Clock, Flame,
 AlertTriangle, Download, Filter, Activity, Target,
 Zap, Eye, ChevronUp, ChevronDown, ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ───────────────────────────────────────────────────────
interface KPIs {
 total_hours: number;
 unique_days: number;
 avg_hours_per_day: number;
 proof_rate: number;
 late_rate: number;
 avg_trust_score: number;
 avg_mood: number;
 avg_energy: number;
 total_flags: number;
 unresolved_flags: number;
 closeout_rate: number;
 avg_streak: number;
 total_reactions: number;
 verified_reactions: number;
 suspicious_reactions: number;
 total_shoutouts: number;
 total_entries_with_description: number;
 detail_rate: number;
 member_count: number;
}

interface TrendPoint {
 date: string;
 hours: number;
 proof_hours: number;
 late_count: number;
 trust_avg: number | null;
 mood_avg: number | null;
 energy_avg: number | null;
 entries_count: number;
 flags_count: number;
}

interface CategoryDist {
 category: string;
 hours: number;
 percent: number;
}

interface MemberStat {
 user_id: string;
 name: string;
 hours: number;
 proof_rate: number;
 late_rate: number;
 trust_avg: number;
 mood_avg: number;
 energy_avg: number;
 flags: number;
 streak: number;
 closeout_rate: number;
 reactions_received: number;
 shoutouts_received: number;
}

interface CorrelationData {
 correlation: number;
 data: [number, number][];
}

interface FlagBreakdown {
 type: string;
 count: number;
 percent: number;
}

interface ReactionBreakdown {
 type: string;
 count: number;
 percent: number;
}

interface AnalyticsData {
 kpis: KPIs;
 trends: TrendPoint[];
 category_distribution: CategoryDist[];
 hour_heatmap: Record<string, Record<string, number>>;
 member_stats: MemberStat[];
 correlations: {
 mood_vs_hours: CorrelationData;
 energy_vs_proof: CorrelationData;
 hours_vs_trust: CorrelationData;
 };
 flag_breakdown: FlagBreakdown[];
 reaction_breakdown: ReactionBreakdown[];
}

type SortKey = keyof Pick<MemberStat,"name"|"hours"|"proof_rate"|"late_rate"|"trust_avg"|"mood_avg"|"energy_avg"|"flags"|"streak">;
type SortDir ="asc"|"desc";

// ─── Helpers ─────────────────────────────────────────────────────
function defaultStart(): string {
 const d = new Date();
 d.setDate(d.getDate() - 30);
 return d.toISOString().split("T")[0];
}

function defaultEnd(): string {
 return new Date().toISOString().split("T")[0];
}

const HEATMAP_HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7-23
const DOW_LABELS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

function formatHourLabel(h: number): string {
 if (h === 0) return"12AM";
 if (h < 12) return`${h}AM`;
 if (h === 12) return"12PM";
 return`${h - 12}PM`;
}

// ─── Component ───────────────────────────────────────────────────
export default function AnalyticsPage() {
 const { orgId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 // Filters
 const [startDate, setStartDate] = useState(defaultStart);
 const [endDate, setEndDate] = useState(defaultEnd);
 const [filterUserId, setFilterUserId] = useState<string | null>(null);
 const [filterCategory, setFilterCategory] = useState<string | null>(null);

 // Data
 const [data, setData] = useState<AnalyticsData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);

 // Members list for filter dropdown
 const [membersList, setMembersList] = useState<{ user_id: string; name: string }[]>([]);

 // Sort state for member table
 const [sortKey, setSortKey] = useState<SortKey>("hours");
 const [sortDir, setSortDir] = useState<SortDir>("desc");

 // Load member names for filter
 useEffect(() => {
 if (!orgId) return;
 async function loadMembers() {
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(full_name, email)")
 .eq("org_id", orgId!);
 if (members) {
 setMembersList(
 members.map((m) => {
 const p = m.profiles as unknown as { full_name: string | null; email: string } | null;
 return { user_id: m.user_id, name: p?.full_name || p?.email || m.user_id };
 })
 );
 }
 }
 loadMembers();
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 // Fetch analytics data
 const fetchData = useCallback(async () => {
 if (!orgId) return;
 setLoading(true);
 setError(null);

 const params = new URLSearchParams({
 org_id: orgId,
 start: startDate,
 end: endDate,
 });
 if (filterUserId) params.set("user_id", filterUserId);
 if (filterCategory) params.set("category", filterCategory);

 try {
 const res = await fetch(`/api/analytics/command-center?${params.toString()}`);
 const json = await res.json();
 if (!res.ok) {
 setError(json.error ||"Error al cargar datos");
 setData(null);
 } else {
 setData(json.data);
 }
 } catch {
 setError("Error de conexión");
 } finally {
 setLoading(false);
 }
 }, [orgId, startDate, endDate, filterUserId, filterCategory]);

 useEffect(() => {
 if (orgLoading) return;
 fetchData();
 }, [orgLoading, fetchData]);

 // Sorted member stats
 const sortedMembers = useMemo(() => {
 if (!data) return [];
 const sorted = [...data.member_stats];
 sorted.sort((a, b) => {
 const av = a[sortKey];
 const bv = b[sortKey];
 if (typeof av ==="string"&& typeof bv ==="string") {
 return sortDir ==="asc"? av.localeCompare(bv) : bv.localeCompare(av);
 }
 const an = av as number;
 const bn = bv as number;
 return sortDir ==="asc"? an - bn : bn - an;
 });
 return sorted;
 }, [data, sortKey, sortDir]);

 // Find best value per column for highlighting
 const bestValues = useMemo(() => {
 if (!data || data.member_stats.length === 0) return null;
 const ms = data.member_stats;
 return {
 hours: Math.max(...ms.map((m) => m.hours)),
 proof_rate: Math.max(...ms.map((m) => m.proof_rate)),
 late_rate: Math.min(...ms.map((m) => m.late_rate)),
 trust_avg: Math.max(...ms.map((m) => m.trust_avg)),
 mood_avg: Math.max(...ms.map((m) => m.mood_avg)),
 energy_avg: Math.max(...ms.map((m) => m.energy_avg)),
 flags: Math.min(...ms.map((m) => m.flags)),
 streak: Math.max(...ms.map((m) => m.streak)),
 };
 }, [data]);

 function handleSort(key: SortKey) {
 if (sortKey === key) {
 setSortDir((d) => (d ==="asc"?"desc":"asc"));
 } else {
 setSortKey(key);
 setSortDir("desc");
 }
 }

 function exportCSV() {
 if (!data) return;
 const headers = ["Nombre","Horas","Evidencia%","Puntualidad%","Trust","Ánimo","Energía","Flags","Racha","Closeout%","Reacciones","Shoutouts"];
 const rows = data.member_stats.map((m) => [
 m.name,
 m.hours,
 m.proof_rate,
 Math.round((100 - m.late_rate) * 10) / 10,
 m.trust_avg,
 m.mood_avg,
 m.energy_avg,
 m.flags,
 m.streak,
 m.closeout_rate,
 m.reactions_received,
 m.shoutouts_received,
 ].join(","));
 const csv = [headers.join(","), ...rows].join("\n");
 const blob = new Blob([csv], { type:"text/csv;charset=utf-8;"});
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download =`analytics_${startDate}_${endDate}.csv`;
 a.click();
 URL.revokeObjectURL(url);
 }

 function exportJSON() {
 if (!data) return;
 const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json"});
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download =`analytics_${startDate}_${endDate}.json`;
 a.click();
 URL.revokeObjectURL(url);
 }

 // ── Loading state ──────────────────────────────────────────────
 if (orgLoading || (loading && !data)) {
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
 <p className="text-muted-foreground font-mono text-xs">Sin organización</p>
 </div>
 );
 }

 // ── Max values for heatmap normalization ───────────────────────
 const heatmapMax = useMemo(() => {
 if (!data) return 1;
 let max = 0;
 for (const h of Object.keys(data.hour_heatmap)) {
 for (const d of Object.keys(data.hour_heatmap[h])) {
 if (data.hour_heatmap[h][d] > max) max = data.hour_heatmap[h][d];
 }
 }
 return max || 1;
 }, [data]);

 // ── Max hours in trends for bar scaling ────────────────────────
 const trendMaxHours = useMemo(() => {
 if (!data) return 1;
 return Math.max(1, ...data.trends.map((t) => t.hours));
 }, [data]);

 // ── Category bar color lookup ──────────────────────────────────
 function getCategoryBarColor(cat: string): string {
 return CATEGORY_COLORS[cat] ??"bg-muted-foreground";
 }

 function getCategoryLabel(cat: string): string {
 return CATEGORIES[cat as WorkCategory]?.label ?? cat;
 }

 // ── Flag severity color ────────────────────────────────────────
 function getFlagColor(flagType: string): string {
 const severity = FLAG_TYPES[flagType as FlagType]?.severity;
 if (severity ==="high") return"bg-red-500";
 if (severity ==="medium") return"bg-amber-500";
 return"bg-slate-400";
 }

 function getFlagLabel(flagType: string): string {
 return FLAG_TYPES[flagType as FlagType]?.label ?? flagType;
 }

 // ── Reaction label/color ───────────────────────────────────────
 function getReactionLabel(type: string): string {
 return REACTIONS[type as ReactionType]?.label ?? type;
 }

 function getReactionColor(type: string): string {
 if (type ==="verified") return"bg-green-500";
 if (type ==="suspicious") return"bg-red-500";
 if (type ==="impressive") return"bg-amber-500";
 if (type ==="helped_me") return"bg-blue-500";
 return"bg-muted-foreground";
 }

 const kpis = data?.kpis;

 return (
 <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 bg-grid-palantir min-h-screen">
 {/* ── Header ──────────────────────────────────────────────── */}
 <div className="mb-8 glow-line-top pt-4">
 <div className="flex items-center gap-3 mb-1">
 <Activity className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Centro de Comando
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground">
 Análisis integral del equipo &mdash; {startDate} al {endDate}
 </p>
 </div>

 {/* ── Filters ─────────────────────────────────────────────── */}
 <div className="border border-border p-4 mb-8 corner-marks">
 <div className="flex items-center gap-2 mb-3">
 <Filter className="w-3.5 h-3.5 text-primary"/>
 <span className="label-mono text-muted-foreground">Filtros</span>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
 <div>
 <label className="label-mono text-muted-foreground block mb-1">Desde</label>
 <Input
 type="date"value={startDate}
 onChange={(e) => setStartDate(e.target.value)}
 className="font-mono text-xs"/>
 </div>
 <div>
 <label className="label-mono text-muted-foreground block mb-1">Hasta</label>
 <Input
 type="date"value={endDate}
 onChange={(e) => setEndDate(e.target.value)}
 className="font-mono text-xs"/>
 </div>
 <div>
 <label className="label-mono text-muted-foreground block mb-1">Persona</label>
 <select
 value={filterUserId ??""}
 onChange={(e) => setFilterUserId(e.target.value || null)}
 className="w-full border border-border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary">
 <option value="">Todos</option>
 {membersList.map((m) => (
 <option key={m.user_id} value={m.user_id}>{m.name}</option>
 ))}
 </select>
 </div>
 <div>
 <label className="label-mono text-muted-foreground block mb-1">Categoría</label>
 <select
 value={filterCategory ??""}
 onChange={(e) => setFilterCategory(e.target.value || null)}
 className="w-full border border-border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary">
 <option value="">Todas</option>
 {Object.entries(CATEGORIES).map(([key, cat]) => (
 <option key={key} value={key}>{cat.label}</option>
 ))}
 </select>
 </div>
 <div className="flex items-end">
 <Button
 onClick={fetchData}
 className="w-full font-mono text-xs"disabled={loading}
 >
 {loading ?"Cargando...":"Aplicar"}
 </Button>
 </div>
 </div>
 </div>

 {error && (
 <div className="bg-destructive/5 border border-destructive/20 p-4 mb-8 font-mono text-xs text-destructive">
 {error}
 </div>
 )}

 {data && kpis && (
 <>
 {/* ── KPI Grid ──────────────────────────────────────────── */}
 <div className="mb-8">
 <div className="palantir-divider text-muted-foreground mb-4">
 <BarChart3 className="w-3 h-3 text-primary"/>
 Indicadores clave
 </div>
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <KPIBox label="Total horas"value={kpis.total_hours} icon={<Clock className="w-3.5 h-3.5"/>} />
 <KPIBox label="Tasa de evidencia"value={`${kpis.proof_rate}%`} icon={<Eye className="w-3.5 h-3.5"/>} />
 <KPIBox label="Trust Score prom."value={kpis.avg_trust_score} icon={<Shield className="w-3.5 h-3.5"/>} />
 <KPIBox label="Tasa de puntualidad"value={`${Math.round((100 - kpis.late_rate) * 10) / 10}%`} icon={<Clock className="w-3.5 h-3.5"/>} />
 <KPIBox label="Promedio ánimo"value={kpis.avg_mood} icon={<Flame className="w-3.5 h-3.5"/>} />
 <KPIBox label="Promedio energía"value={kpis.avg_energy} icon={<Zap className="w-3.5 h-3.5"/>} />
 <KPIBox label="Tasa de closeout"value={`${kpis.closeout_rate}%`} icon={<Target className="w-3.5 h-3.5"/>} />
 <KPIBox label="Flags sin resolver"value={kpis.unresolved_flags} icon={<AlertTriangle className="w-3.5 h-3.5"/>} accent={kpis.unresolved_flags > 0 ?"destructive": undefined} />
 <KPIBox label="Racha promedio"value={`${kpis.avg_streak}d`} icon={<Flame className="w-3.5 h-3.5"/>} />
 <KPIBox label="Reacciones totales"value={kpis.total_reactions} icon={<Activity className="w-3.5 h-3.5"/>} />
 <KPIBox label="Shoutouts recibidos"value={kpis.total_shoutouts} icon={<TrendingUp className="w-3.5 h-3.5"/>} />
 <KPIBox label="Tasa de detalle"value={`${kpis.detail_rate}%`} icon={<Eye className="w-3.5 h-3.5"/>} />
 </div>
 </div>

 {/* ── Trends ────────────────────────────────────────────── */}
 <div className="mb-8">
 <div className="palantir-divider text-muted-foreground mb-4">
 <TrendingUp className="w-3 h-3 text-primary"/>
 Tendencias
 </div>
 <div className="border border-border p-4 corner-marks">
 <div className="flex items-end gap-px"style={{ height: 180 }}>
 {data.trends.map((t, i) => {
 const barHeight = (t.hours / trendMaxHours) * 100;
 const trustHeight = t.trust_avg ? (t.trust_avg / 100) * 100 : 0;
 return (
 <div
 key={t.date}
 className="flex-1 relative group"style={{ height:"100%"}}
 >
 {/* Trust score overlay line */}
 {t.trust_avg !== null && (
 <div
 className="absolute left-0 right-0 h-[2px] bg-primary/60 z-10"style={{ bottom:`${trustHeight}%`}}
 />
 )}
 {/* Hours bar */}
 <div className="absolute bottom-0 left-0 right-0 flex flex-col justify-end"style={{ height:"100%"}}>
 <div
 className="bg-primary/40 transition-all duration-200 group-hover:bg-primary/70"style={{ height:`${barHeight}%`, minHeight: t.hours > 0 ? 2 : 0 }}
 />
 </div>
 {/* Tooltip on hover */}
 <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20">
 <div className="bg-popover border border-border p-2 font-mono text-[9px] whitespace-nowrap">
 <div className="font-bold">{t.date}</div>
 <div>{t.hours}h</div>
 {t.trust_avg !== null && <div>Trust: {t.trust_avg}</div>}
 {t.flags_count > 0 && <div className="text-destructive">{t.flags_count} flags</div>}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 {/* X-axis labels (show every nth) */}
 <div className="flex gap-px mt-1">
 {data.trends.map((t, i) => {
 const show = data.trends.length <= 15 || i % Math.ceil(data.trends.length / 10) === 0;
 return (
 <div key={t.date} className="flex-1 text-center">
 {show && (
 <span className="font-mono text-[7px] text-muted-foreground">
 {t.date.slice(5)}
 </span>
 )}
 </div>
 );
 })}
 </div>
 <div className="flex items-center gap-4 mt-3">
 <div className="flex items-center gap-1.5">
 <div className="w-3 h-3 bg-primary/40"/>
 <span className="font-mono text-[8px] text-muted-foreground uppercase">Horas</span>
 </div>
 <div className="flex items-center gap-1.5">
 <div className="w-3 h-[2px] bg-primary/60"/>
 <span className="font-mono text-[8px] text-muted-foreground uppercase">Trust Score</span>
 </div>
 </div>
 </div>
 </div>

 {/* ── Heatmap ───────────────────────────────────────────── */}
 <div className="mb-8">
 <div className="palantir-divider text-muted-foreground mb-4">
 <Activity className="w-3 h-3 text-primary"/>
 Heatmap de actividad
 </div>
 <div className="border border-border p-4 corner-marks overflow-x-auto">
 <div className="grid gap-[2px]"style={{ gridTemplateColumns:`40px repeat(7, 1fr)`}}>
 {/* Header row */}
 <div />
 {DOW_LABELS.map((d) => (
 <div key={d} className="text-center font-mono text-[8px] text-muted-foreground uppercase pb-1">
 {d}
 </div>
 ))}
 {/* Data rows */}
 {HEATMAP_HOURS.map((h) => (
 <HeatmapRow
 key={h}
 hour={h}
 label={formatHourLabel(h)}
 days={DOW_LABELS}
 data={data.hour_heatmap[String(h)] ?? {}}
 max={heatmapMax}
 />
 ))}
 </div>
 </div>
 </div>

 {/* ── Category Distribution ─────────────────────────────── */}
 <div className="mb-8">
 <div className="palantir-divider text-muted-foreground mb-4">
 <BarChart3 className="w-3 h-3 text-primary"/>
 Distribución por categoría
 </div>
 <div className="border border-border p-4 corner-marks space-y-2">
 {data.category_distribution.map((cat) => {
 const maxHours = data.category_distribution[0]?.hours ?? 1;
 return (
 <div key={cat.category} className="flex items-center gap-3">
 <div className="w-24 shrink-0">
 <span className="font-mono text-[10px] text-muted-foreground truncate block">
 {getCategoryLabel(cat.category)}
 </span>
 </div>
 <div className="flex-1 h-5 bg-accent/20 relative">
 <div
 className={cn("h-full transition-all duration-500", getCategoryBarColor(cat.category))}
 style={{ width:`${(cat.hours / maxHours) * 100}%`}}
 />
 </div>
 <div className="w-20 shrink-0 text-right">
 <span className="font-mono tabular-nums text-xs font-bold">{cat.hours}h</span>
 <span className="font-mono text-[9px] text-muted-foreground ml-1">{cat.percent}%</span>
 </div>
 </div>
 );
 })}
 {data.category_distribution.length === 0 && (
 <p className="text-center font-mono text-xs text-muted-foreground py-4">Insuficiente data. Registra más horas para analizar patrones.</p>
 )}
 </div>
 </div>

 {/* ── Member Ranking Table ──────────────────────────────── */}
 <div className="mb-8">
 <div className="palantir-divider text-muted-foreground mb-4">
 <Users className="w-3 h-3 text-primary"/>
 Ranking de miembros
 </div>
 <div className="border border-border overflow-x-auto">
 <table className="w-full min-w-[700px]">
 <thead>
 <tr className="border-b border-border">
 <SortHeader label="Nombre"sortKey="name"current={sortKey} dir={sortDir} onSort={handleSort} />
 <SortHeader label="Horas"sortKey="hours"current={sortKey} dir={sortDir} onSort={handleSort} />
 <SortHeader label="Evidencia%"sortKey="proof_rate"current={sortKey} dir={sortDir} onSort={handleSort} />
 <SortHeader label="Puntualidad%"sortKey="late_rate"current={sortKey} dir={sortDir} onSort={handleSort} />
 <SortHeader label="Trust"sortKey="trust_avg"current={sortKey} dir={sortDir} onSort={handleSort} />
 <SortHeader label="Ánimo"sortKey="mood_avg"current={sortKey} dir={sortDir} onSort={handleSort} />
 <SortHeader label="Energía"sortKey="energy_avg"current={sortKey} dir={sortDir} onSort={handleSort} />
 <SortHeader label="Flags"sortKey="flags"current={sortKey} dir={sortDir} onSort={handleSort} />
 <SortHeader label="Racha"sortKey="streak"current={sortKey} dir={sortDir} onSort={handleSort} />
 </tr>
 </thead>
 <tbody>
 {sortedMembers.map((m) => (
 <tr key={m.user_id} className="border-b border-border/50 hover:bg-accent/10 transition-colors">
 <td className="data-cell px-3 py-2 font-medium">{m.name}</td>
 <td className={cn("data-cell px-3 py-2 text-right", bestValues?.hours === m.hours && m.hours > 0 &&"text-primary font-bold")}>
 {m.hours}
 </td>
 <td className={cn("data-cell px-3 py-2 text-right", bestValues?.proof_rate === m.proof_rate && m.proof_rate > 0 &&"text-primary font-bold")}>
 {m.proof_rate}%
 </td>
 <td className={cn("data-cell px-3 py-2 text-right", bestValues?.late_rate === m.late_rate &&"text-primary font-bold")}>
 {Math.round((100 - m.late_rate) * 10) / 10}%
 </td>
 <td className={cn("data-cell px-3 py-2 text-right", bestValues?.trust_avg === m.trust_avg && m.trust_avg > 0 &&"text-primary font-bold")}>
 {m.trust_avg}
 </td>
 <td className={cn("data-cell px-3 py-2 text-right", bestValues?.mood_avg === m.mood_avg && m.mood_avg > 0 &&"text-primary font-bold")}>
 {m.mood_avg}
 </td>
 <td className={cn("data-cell px-3 py-2 text-right", bestValues?.energy_avg === m.energy_avg && m.energy_avg > 0 &&"text-primary font-bold")}>
 {m.energy_avg}
 </td>
 <td className={cn("data-cell px-3 py-2 text-right", bestValues?.flags === m.flags &&"text-primary font-bold", m.flags > 3 &&"text-destructive")}>
 {m.flags}
 </td>
 <td className={cn("data-cell px-3 py-2 text-right", bestValues?.streak === m.streak && m.streak > 0 &&"text-primary font-bold")}>
 {m.streak}d
 </td>
 </tr>
 ))}
 {sortedMembers.length === 0 && (
 <tr>
 <td colSpan={9} className="text-center font-mono text-xs text-muted-foreground py-6">
 Sin miembros con actividad en este período.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </div>

 {/* ── Correlations ──────────────────────────────────────── */}
 <div className="mb-8">
 <div className="palantir-divider text-muted-foreground mb-4">
 <TrendingUp className="w-3 h-3 text-primary"/>
 Correlaciones
 </div>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <ScatterPlot
 title="Ánimo vs Horas"xLabel="Ánimo"yLabel="Horas"correlation={data.correlations.mood_vs_hours.correlation}
 data={data.correlations.mood_vs_hours.data}
 />
 <ScatterPlot
 title="Energía vs Evidencia"xLabel="Energía"yLabel="Evidencia %"correlation={data.correlations.energy_vs_proof.correlation}
 data={data.correlations.energy_vs_proof.data}
 />
 <ScatterPlot
 title="Horas vs Trust"xLabel="Horas"yLabel="Trust"correlation={data.correlations.hours_vs_trust.correlation}
 data={data.correlations.hours_vs_trust.data}
 />
 </div>
 </div>

 {/* ── Flag & Reaction Breakdowns ─────────────────────────── */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
 {/* Flag Breakdown */}
 <div>
 <div className="palantir-divider text-muted-foreground mb-4">
 <AlertTriangle className="w-3 h-3 text-primary"/>
 Desglose de flags
 </div>
 <div className="border border-border p-4 corner-marks space-y-2">
 {data.flag_breakdown.map((f) => {
 const maxCount = data.flag_breakdown[0]?.count ?? 1;
 return (
 <div key={f.type} className="flex items-center gap-3">
 <div className="w-28 shrink-0">
 <span className="font-mono text-[10px] text-muted-foreground truncate block">
 {getFlagLabel(f.type)}
 </span>
 </div>
 <div className="flex-1 h-4 bg-accent/20 relative">
 <div
 className={cn("h-full", getFlagColor(f.type))}
 style={{ width:`${(f.count / maxCount) * 100}%`}}
 />
 </div>
 <div className="w-16 shrink-0 text-right">
 <span className="font-mono tabular-nums text-xs font-bold">{f.count}</span>
 <span className="font-mono text-[9px] text-muted-foreground ml-1">{f.percent}%</span>
 </div>
 </div>
 );
 })}
 {data.flag_breakdown.length === 0 && (
 <p className="text-center font-mono text-xs text-muted-foreground py-4">Sin flags</p>
 )}
 </div>
 </div>

 {/* Reaction Breakdown */}
 <div>
 <div className="palantir-divider text-muted-foreground mb-4">
 <Zap className="w-3 h-3 text-primary"/>
 Desglose de reacciones
 </div>
 <div className="border border-border p-4 corner-marks space-y-2">
 {data.reaction_breakdown.map((r) => {
 const maxCount = data.reaction_breakdown[0]?.count ?? 1;
 return (
 <div key={r.type} className="flex items-center gap-3">
 <div className="w-28 shrink-0">
 <span className="font-mono text-[10px] text-muted-foreground truncate block">
 {getReactionLabel(r.type)}
 </span>
 </div>
 <div className="flex-1 h-4 bg-accent/20 relative">
 <div
 className={cn("h-full", getReactionColor(r.type))}
 style={{ width:`${(r.count / maxCount) * 100}%`}}
 />
 </div>
 <div className="w-16 shrink-0 text-right">
 <span className="font-mono tabular-nums text-xs font-bold">{r.count}</span>
 <span className="font-mono text-[9px] text-muted-foreground ml-1">{r.percent}%</span>
 </div>
 </div>
 );
 })}
 {data.reaction_breakdown.length === 0 && (
 <p className="text-center font-mono text-xs text-muted-foreground py-4">Sin reacciones</p>
 )}
 </div>
 </div>
 </div>

 {/* ── Export ─────────────────────────────────────────────── */}
 <div className="mb-8">
 <div className="palantir-divider text-muted-foreground mb-4">
 <Download className="w-3 h-3 text-primary"/>
 Exportar datos
 </div>
 <div className="flex gap-3">
 <Button variant="outline"onClick={exportCSV} className="font-mono text-xs gap-2">
 <Download className="w-3.5 h-3.5"/>
 Exportar CSV
 </Button>
 <Button variant="outline"onClick={exportJSON} className="font-mono text-xs gap-2">
 <Download className="w-3.5 h-3.5"/>
 Exportar JSON
 </Button>
 </div>
 </div>
 </>
 )}
 </div>
 );
}

// ─── Sub-components ──────────────────────────────────────────────

function KPIBox({
 label,
 value,
 icon,
 accent,
}: {
 label: string;
 value: string | number;
 icon: React.ReactNode;
 accent?:"destructive";
}) {
 return (
 <div className="bg-accent/30 border border-border p-4">
 <div className="flex items-center gap-1.5 mb-2">
 <span className={cn("text-muted-foreground", accent ==="destructive"&&"text-destructive")}>
 {icon}
 </span>
 <span className="label-mono text-muted-foreground">{label}</span>
 </div>
 <div className={cn(
"text-2xl font-mono tabular-nums font-bold tracking-tight",
 accent ==="destructive"&&"text-destructive")}>
 {value}
 </div>
 </div>
 );
}

function SortHeader({
 label,
 sortKey: key,
 current,
 dir,
 onSort,
}: {
 label: string;
 sortKey: SortKey;
 current: SortKey;
 dir: SortDir;
 onSort: (key: SortKey) => void;
}) {
 const isActive = current === key;
 return (
 <th
 onClick={() => onSort(key)}
 className="px-3 py-2 text-left cursor-pointer select-none hover:bg-accent/10 transition-colors">
 <div className="flex items-center gap-1">
 <span className="label-mono text-muted-foreground">{label}</span>
 {isActive ? (
 dir ==="asc"? (
 <ChevronUp className="w-2.5 h-2.5 text-primary"/>
 ) : (
 <ChevronDown className="w-2.5 h-2.5 text-primary"/>
 )
 ) : (
 <ArrowUpDown className="w-2.5 h-2.5 text-muted-foreground/20"/>
 )}
 </div>
 </th>
 );
}

function HeatmapRow({
 hour,
 label,
 days,
 data,
 max,
}: {
 hour: number;
 label: string;
 days: string[];
 data: Record<string, number>;
 max: number;
}) {
 return (
 <>
 <div className="flex items-center justify-end pr-2">
 <span className="font-mono text-[8px] text-muted-foreground">{label}</span>
 </div>
 {days.map((d) => {
 const count = data[d] ?? 0;
 const opacity = count > 0 ? Math.max(0.15, count / max) : 0;
 return (
 <div
 key={`${hour}-${d}`}
 className="aspect-square border border-border/30 relative group"style={{ backgroundColor: count > 0 ?`oklch(0.70 0.14 200 / ${opacity})`: undefined }}
 >
 {count > 0 && (
 <div className="absolute inset-0 flex items-center justify-center">
 <span className="font-mono text-[7px] tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
 {count}
 </span>
 </div>
 )}
 </div>
 );
 })}
 </>
 );
}

function ScatterPlot({
 title,
 xLabel,
 yLabel,
 correlation,
 data,
}: {
 title: string;
 xLabel: string;
 yLabel: string;
 correlation: number;
 data: [number, number][];
}) {
 const xMin = data.length > 0 ? Math.min(...data.map(([x]) => x)) : 0;
 const xMax = data.length > 0 ? Math.max(...data.map(([x]) => x)) : 1;
 const yMin = data.length > 0 ? Math.min(...data.map(([, y]) => y)) : 0;
 const yMax = data.length > 0 ? Math.max(...data.map(([, y]) => y)) : 1;
 const xRange = xMax - xMin || 1;
 const yRange = yMax - yMin || 1;

 const corrColor =
 Math.abs(correlation) > 0.6
 ?"text-primary": Math.abs(correlation) > 0.3
 ?"text-amber-500":"text-muted-foreground";

 return (
 <div className="border border-border p-4 corner-marks">
 <div className="flex items-center justify-between mb-3">
 <span className="label-mono text-muted-foreground">{title}</span>
 <span className={cn("font-mono text-xs tabular-nums font-bold", corrColor)}>
 r = {correlation}
 </span>
 </div>
 <div className="relative bg-accent/10 border border-border/30"style={{ height: 140 }}>
 {data.length === 0 && (
 <div className="absolute inset-0 flex items-center justify-center">
 <span className="font-mono text-[9px] text-muted-foreground">Sin datos</span>
 </div>
 )}
 {data.map(([x, y], i) => {
 const left = ((x - xMin) / xRange) * 90 + 5;
 const bottom = ((y - yMin) / yRange) * 85 + 5;
 return (
 <div
 key={i}
 className="absolute w-[5px] h-[5px] bg-primary/70 hover:bg-primary transition-colors"style={{
 left:`${left}%`,
 bottom:`${bottom}%`,
 transform:"translate(-50%, 50%)",
 }}
 title={`${xLabel}: ${Math.round(x * 10) / 10}, ${yLabel}: ${Math.round(y * 10) / 10}`}
 />
 );
 })}
 </div>
 <div className="flex justify-between mt-1">
 <span className="font-mono text-[7px] text-muted-foreground">{xLabel}</span>
 <span className="font-mono text-[7px] text-muted-foreground">{yLabel}</span>
 </div>
 </div>
 );
}
