"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type {
 Profile,
 TimeEntry,
 DailyCloseout,
 Standup,
 AccountabilityFlag,
 EntryReaction,
 TrustScoreHistory,
 ActivityStreak,
} from "@/lib/types/database";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
 Database, Download, RefreshCw, ChevronLeft, ChevronRight,
 ArrowUp, ArrowDown, ChevronsUpDown, Clock, Users, CalendarDays,
 BarChart3,
} from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type TabKey ="time_entries"|"daily_closeouts"|"standups"|"accountability_flags"|"entry_reactions"|"trust_score_history"|"activity_streaks";

interface TabConfig {
 key: TabKey;
 label: string;
 columns: string[];
 columnLabels: Record<string, string>;
}

type SortDir ="asc"|"desc";
type DateRange = 7 | 30 | 90 | 0;

// ═══════════════════════════════════════════════════════════════
// TAB DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const TABS: TabConfig[] = [
 {
 key:"time_entries",
 label:"Entradas",
 columns: [
"id","full_name","date","hour","category","title","description",
"mood","energy","difficulty","focus_quality","value_rating","stress_level","confidence",
"interruptions","context_switches","output_type","location","client_facing","could_be_async",
"project","tools_used","skills_tags","collaborators",
"links","proof_urls","verification_status","verification_note","verified_by_name",
"is_late","minutes_late","auto_captured","blocker_detail","learning_notes",
"logged_at","created_at","updated_at",
 // computed
"_quality_score","_response_time_min","_desc_word_count","_desc_char_count",
"_has_proof","_proof_url_count",
 ],
 columnLabels: {
 id:"ID",
 full_name:"Persona",
 date:"Fecha",
 hour:"Hora",
 category:"Categoría",
 title:"Título",
 description:"Descripción",
 mood:"Mood",
 energy:"Energy",
 difficulty:"Dificultad",
 focus_quality:"Focus",
 value_rating:"Valor",
 stress_level:"Estrés",
 confidence:"Confianza",
 interruptions:"Interrupciones",
 context_switches:"Cambios Contexto",
 output_type:"Tipo Output",
 location:"Ubicación",
 client_facing:"Cliente",
 could_be_async:"Async?",
 project:"Proyecto",
 tools_used:"Herramientas",
 skills_tags:"Skills",
 collaborators:"Colaboradores",
 links:"Links",
 proof_urls:"Pruebas URLs",
 verification_status:"Verificación",
 verification_note:"Nota Verif.",
 verified_by_name:"Verificado por",
 is_late:"Tarde",
 minutes_late:"Min. Tarde",
 auto_captured:"Auto",
 blocker_detail:"Blocker",
 learning_notes:"Notas Aprendizaje",
 logged_at:"Registrado",
 created_at:"Creado",
 updated_at:"Actualizado",
 _quality_score:"Calidad",
 _response_time_min:"Resp. (min)",
 _desc_word_count:"Palabras",
 _desc_char_count:"Caracteres",
 _has_proof:"Tiene Prueba",
 _proof_url_count:"# Pruebas",
 },
 },
 {
 key:"daily_closeouts",
 label:"Cierres",
 columns: ["id","full_name","date","summary","blockers","tomorrow_plan","mood","hours_logged","hours_with_proof","submitted_at"],
 columnLabels: {
 id:"ID", full_name:"Persona", date:"Fecha", summary:"Resumen",
 blockers:"Blockers", tomorrow_plan:"Plan Mañana", mood:"Mood",
 hours_logged:"Hrs Reg.", hours_with_proof:"Hrs c/Prueba", submitted_at:"Enviado",
 },
 },
 {
 key:"standups",
 label:"Standups",
 columns: ["id","full_name","date","yesterday","today_plan","blockers","mood","submitted_at"],
 columnLabels: {
 id:"ID", full_name:"Persona", date:"Fecha", yesterday:"Ayer",
 today_plan:"Plan Hoy", blockers:"Blockers", mood:"Mood", submitted_at:"Enviado",
 },
 },
 {
 key:"accountability_flags",
 label:"Flags",
 columns: ["id","full_name","flag_type","date","details","resolved","resolved_by_name","resolved_note","created_at"],
 columnLabels: {
 id:"ID", full_name:"Persona", flag_type:"Tipo", date:"Fecha",
 details:"Detalle", resolved:"Resuelto", resolved_by_name:"Resuelto por",
 resolved_note:"Nota Resol.", created_at:"Creado",
 },
 },
 {
 key:"entry_reactions",
 label:"Reacciones",
 columns: ["id","entry_id","full_name","reaction","comment","created_at"],
 columnLabels: {
 id:"ID", entry_id:"Entry ID", full_name:"Persona", reaction:"Reacción",
 comment:"Comentario", created_at:"Creado",
 },
 },
 {
 key:"trust_score_history",
 label:"Trust Score",
 columns: ["id","full_name","date","score","hours_logged","hours_with_proof","late_entries","has_closeout","suspicious_reactions","created_at"],
 columnLabels: {
 id:"ID", full_name:"Persona", date:"Fecha", score:"Score",
 hours_logged:"Hrs Reg.", hours_with_proof:"Hrs c/Prueba",
 late_entries:"Entradas Tarde", has_closeout:"Cierre", suspicious_reactions:"Sospechas",
 created_at:"Creado",
 },
 },
 {
 key:"activity_streaks",
 label:"Rachas",
 columns: ["full_name","current_streak","longest_streak","last_active_date","total_days_logged","updated_at"],
 columnLabels: {
 full_name:"Persona", current_streak:"Racha Actual", longest_streak:"Racha Máx.",
 last_active_date:"Último Activo", total_days_logged:"Días Totales", updated_at:"Actualizado",
 },
 },
];

const PAGE_SIZE = 50;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function computeQualityScore(entry: TimeEntry): string {
 let score = 0;
 if (entry.description && entry.description.length > 20) score += 2;
 if (entry.description && entry.description.length > 80) score += 1;
 if (entry.proof_urls && entry.proof_urls.length > 0) score += 2;
 if (entry.links && entry.links.length > 0) score += 1;
 if (!entry.is_late) score += 2;
 if (entry.verification_status ==="verified") score += 1;
 if (entry.project) score += 1;
 // 0-2 = F, 3-4 = D, 5-6 = C, 7-8 = B, 9-10 = A
 if (score >= 9) return"A";
 if (score >= 7) return"B";
 if (score >= 5) return"C";
 if (score >= 3) return"D";
 return"F";
}

function computeResponseTime(entry: TimeEntry): number | null {
 if (!entry.logged_at || !entry.date || entry.hour === undefined) return null;
 const hourEnd = new Date(`${entry.date}T${String(entry.hour + 1).padStart(2,"0")}:00:00`);
 const loggedAt = new Date(entry.logged_at);
 const diffMin = Math.round((loggedAt.getTime() - hourEnd.getTime()) / 60000);
 return diffMin;
}

function formatCellValue(value: unknown): string {
 if (value === null || value === undefined) return"—";
 if (typeof value ==="boolean") return value ?"SI":"NO";
 if (Array.isArray(value)) return value.length === 0 ?"—": value.join(",");
 if (typeof value ==="object") return JSON.stringify(value);
 return String(value);
}

function isTimestamp(col: string): boolean {
 return ["logged_at","created_at","updated_at","submitted_at","last_active_date"].includes(col);
}

function isDateCol(col: string): boolean {
 return col ==="date"|| col ==="week_start";
}

function buildCsvContent(columns: string[], labels: Record<string, string>, rows: Record<string, unknown>[]): string {
 const header = columns.map((c) => labels[c] || c).join(",");
 const body = rows.map((row) => {
 return columns.map((col) => {
 const val = formatCellValue(row[col]);
 // Escape CSV
 if (val.includes(",") || val.includes('"') || val.includes("\n")) {
 return`"${val.replace(/"/g, '""')}"`;
 }
 return val;
 }).join(",");
 }).join("\n");
 return`${header}\n${body}`;
}

function downloadCsv(content: string, filename: string) {
 const blob = new Blob(["\uFEFF"+ content], { type:"text/csv;charset=utf-8;"});
 const url = URL.createObjectURL(blob);
 const link = document.createElement("a");
 link.href = url;
 link.download = filename;
 link.click();
 URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function RawDataPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 // State
 const [activeTab, setActiveTab] = useState<TabKey>("time_entries");
 const [profiles, setProfiles] = useState<Record<string, string>>({});
 const [rows, setRows] = useState<Record<string, unknown>[]>([]);
 const [totalCount, setTotalCount] = useState(0);
 const [loading, setLoading] = useState(true);
 const [page, setPage] = useState(0);
 const [sortCol, setSortCol] = useState<string>("date");
 const [sortDir, setSortDir] = useState<SortDir>("desc");
 const [dateRange, setDateRange] = useState<DateRange>(30);
 const [personFilter, setPersonFilter] = useState<string>("all");
 const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
 const [memberList, setMemberList] = useState<{ id: string; name: string }[]>([]);
 const refreshTimer = useRef<NodeJS.Timeout | null>(null);

 const tabConfig = useMemo(() => TABS.find((t) => t.key === activeTab)!, [activeTab]);

 // ─── Load profiles ──────────────────────────────────────────
 const loadProfiles = useCallback(async () => {
 if (!orgId) return;
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(full_name)")
 .eq("org_id", orgId);
 if (!members) return;
 const map: Record<string, string> = {};
 const list: { id: string; name: string }[] = [];
 for (const m of members) {
 const name = (m.profiles as any)?.full_name ||"Sin nombre";
 map[m.user_id] = name;
 list.push({ id: m.user_id, name });
 }
 setProfiles(map);
 setMemberList(list.sort((a, b) => a.name.localeCompare(b.name)));
 }, [orgId, supabase]);

 // ─── Load data for current tab ──────────────────────────────
 const loadData = useCallback(async () => {
 if (!orgId) return;
 setLoading(true);

 const from = dateRange > 0 ? format(subDays(new Date(), dateRange),"yyyy-MM-dd") : undefined;
 const tab = activeTab;

 try {
 let query: any;
 let countQuery: any;

 // Determine date column for filtering
 const dateCol = tab ==="activity_streaks"?"updated_at":"date";
 const hasDateCol = tab !=="entry_reactions";

 // Special handling per table
 if (tab ==="activity_streaks") {
 query = supabase.from(tab).select("*").eq("org_id", orgId);
 countQuery = supabase.from(tab).select("*", { count:"exact", head: true }).eq("org_id", orgId);
 if (personFilter !=="all") {
 query = query.eq("user_id", personFilter);
 countQuery = countQuery.eq("user_id", personFilter);
 }
 } else if (tab ==="entry_reactions") {
 // Reactions need special join — we query entries first to get org scope
 query = supabase
 .from("entry_reactions")
 .select("*, time_entries!inner(org_id)")
 .eq("time_entries.org_id", orgId);
 countQuery = supabase
 .from("entry_reactions")
 .select("*, time_entries!inner(org_id)", { count:"exact", head: true })
 .eq("time_entries.org_id", orgId);
 if (personFilter !=="all") {
 query = query.eq("user_id", personFilter);
 countQuery = countQuery.eq("user_id", personFilter);
 }
 if (from) {
 query = query.gte("created_at", from);
 countQuery = countQuery.gte("created_at", from);
 }
 } else {
 query = supabase.from(tab).select("*").eq("org_id", orgId);
 countQuery = supabase.from(tab).select("*", { count:"exact", head: true }).eq("org_id", orgId);
 if (personFilter !=="all") {
 query = query.eq("user_id", personFilter);
 countQuery = countQuery.eq("user_id", personFilter);
 }
 if (from && hasDateCol) {
 query = query.gte(dateCol, from);
 countQuery = countQuery.gte(dateCol, from);
 }
 }

 // Sort
 const realSortCol = sortCol ==="full_name"?"user_id": sortCol.startsWith("_") ?"created_at": sortCol;
 if (tab !=="entry_reactions") {
 query = query.order(realSortCol, { ascending: sortDir ==="asc"});
 } else {
 // For reactions, sort by created_at by default since joins complicate column resolution
 const reactionSort = ["id","entry_id","user_id","reaction","comment","created_at"].includes(sortCol) ? sortCol :"created_at";
 query = query.order(reactionSort, { ascending: sortDir ==="asc"});
 }

 // Pagination
 query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

 const [{ data, error }, { count }] = await Promise.all([query, countQuery]);

 if (error) {
 console.error("Query error:", error);
 setRows([]);
 setTotalCount(0);
 setLoading(false);
 return;
 }

 // Process rows — add full_name and computed columns
 const processed = (data || []).map((row: any) => {
 const enhanced: Record<string, unknown> = { ...row };

 // Strip nested join data
 delete enhanced.time_entries;

 // Full name
 enhanced.full_name = profiles[row.user_id] || row.user_id ||"—";

 // Verified by name
 if (row.verified_by) {
 enhanced.verified_by_name = profiles[row.verified_by] || row.verified_by;
 }
 if (row.resolved_by) {
 enhanced.resolved_by_name = profiles[row.resolved_by] || row.resolved_by;
 }

 // Computed columns for time_entries
 if (tab ==="time_entries") {
 const entry = row as TimeEntry;
 enhanced._quality_score = computeQualityScore(entry);
 enhanced._response_time_min = computeResponseTime(entry);
 enhanced._desc_word_count = entry.description ? entry.description.split(/\s+/).filter(Boolean).length : 0;
 enhanced._desc_char_count = entry.description ? entry.description.length : 0;
 enhanced._has_proof = !!(entry.proof_urls && entry.proof_urls.length > 0);
 enhanced._proof_url_count = entry.proof_urls ? entry.proof_urls.length : 0;
 }

 return enhanced;
 });

 setRows(processed);
 setTotalCount(count ?? 0);
 setLastRefresh(new Date());
 } catch (err) {
 console.error("Load error:", err);
 setRows([]);
 setTotalCount(0);
 }
 setLoading(false);
 }, [orgId, activeTab, page, sortCol, sortDir, dateRange, personFilter, profiles, supabase]);

 // ─── Effects ────────────────────────────────────────────────
 useEffect(() => {
 if (!orgLoading && orgId) loadProfiles();
 }, [orgId, orgLoading, loadProfiles]);

 useEffect(() => {
 if (!orgLoading && orgId && Object.keys(profiles).length > 0) loadData();
 }, [orgId, orgLoading, profiles, activeTab, page, sortCol, sortDir, dateRange, personFilter, loadData]);

 // Auto-refresh every 60s
 useEffect(() => {
 refreshTimer.current = setInterval(() => {
 if (orgId && Object.keys(profiles).length > 0) loadData();
 }, 60000);
 return () => {
 if (refreshTimer.current) clearInterval(refreshTimer.current);
 };
 }, [loadData, orgId, profiles]);

 // Reset page on filter/tab change
 useEffect(() => { setPage(0); }, [activeTab, dateRange, personFilter]);

 // ─── Sort handler ───────────────────────────────────────────
 function handleSort(col: string) {
 if (sortCol === col) {
 setSortDir((d) => (d ==="asc"?"desc":"asc"));
 } else {
 setSortCol(col);
 setSortDir("desc");
 }
 }

 // ─── Export CSV ─────────────────────────────────────────────
 async function handleExportCsv() {
 if (!orgId) return;

 // Fetch ALL rows matching current filter (no pagination)
 const from = dateRange > 0 ? format(subDays(new Date(), dateRange),"yyyy-MM-dd") : undefined;
 const tab = activeTab;
 const dateCol = tab ==="activity_streaks"?"updated_at":"date";
 const hasDateCol = tab !=="entry_reactions";

 let query: any;
 if (tab ==="entry_reactions") {
 query = supabase
 .from("entry_reactions")
 .select("*, time_entries!inner(org_id)")
 .eq("time_entries.org_id", orgId);
 if (personFilter !=="all") query = query.eq("user_id", personFilter);
 if (from) query = query.gte("created_at", from);
 } else if (tab ==="activity_streaks") {
 query = supabase.from(tab).select("*").eq("org_id", orgId);
 if (personFilter !=="all") query = query.eq("user_id", personFilter);
 } else {
 query = supabase.from(tab).select("*").eq("org_id", orgId);
 if (personFilter !=="all") query = query.eq("user_id", personFilter);
 if (from && hasDateCol) query = query.gte(dateCol, from);
 }

 const { data } = await query;
 if (!data || data.length === 0) return;

 const processed = (data as any[]).map((row: any) => {
 const enhanced: Record<string, unknown> = { ...row };
 delete enhanced.time_entries;
 enhanced.full_name = profiles[row.user_id] || row.user_id ||"—";
 if (row.verified_by) enhanced.verified_by_name = profiles[row.verified_by] || row.verified_by;
 if (row.resolved_by) enhanced.resolved_by_name = profiles[row.resolved_by] || row.resolved_by;
 if (tab ==="time_entries") {
 const entry = row as TimeEntry;
 enhanced._quality_score = computeQualityScore(entry);
 enhanced._response_time_min = computeResponseTime(entry);
 enhanced._desc_word_count = entry.description ? entry.description.split(/\s+/).filter(Boolean).length : 0;
 enhanced._desc_char_count = entry.description ? entry.description.length : 0;
 enhanced._has_proof = !!(entry.proof_urls && entry.proof_urls.length > 0);
 enhanced._proof_url_count = entry.proof_urls ? entry.proof_urls.length : 0;
 }
 return enhanced;
 });

 const csv = buildCsvContent(tabConfig.columns, tabConfig.columnLabels, processed);
 const dateStr = format(new Date(),"yyyy-MM-dd_HHmm");
 downloadCsv(csv,`exomagram_${tab}_${dateStr}.csv`);
 }

 // ─── Stats ──────────────────────────────────────────────────
 const stats = useMemo(() => {
 if (rows.length === 0) return null;
 const dates = rows.map((r) => r.date as string || r.created_at as string).filter(Boolean).sort();
 const uniquePersons = new Set(rows.map((r) => r.full_name as string)).size;
 const uniqueDates = new Set(dates).size;
 return {
 totalRows: totalCount,
 dateRangeStr: dates.length > 0 ?`${dates[0]?.slice(0, 10)} → ${dates[dates.length - 1]?.slice(0, 10)}`:"—",
 rowsPerPerson: uniquePersons > 0 ? (totalCount / uniquePersons).toFixed(1) :"—",
 rowsPerDay: uniqueDates > 0 ? (totalCount / uniqueDates).toFixed(1) :"—",
 };
 }, [rows, totalCount]);

 const totalPages = Math.ceil(totalCount / PAGE_SIZE);

 // ─── Loading state ──────────────────────────────────────────
 if (orgLoading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">Cargando...</div>
 </div>
 );
 }

 if (!orgId) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="text-muted-foreground font-mono text-xs">Sin organización</div>
 </div>
 );
 }

 // ═══════════════════════════════════════════════════════════
 // RENDER
 // ═══════════════════════════════════════════════════════════

 return (
 <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center justify-between mb-6">
 <div className="flex items-center gap-3">
 <Database className="w-5 h-5 text-primary"/>
 <div>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">Raw Data</h1>
 <p className="text-xs font-mono text-muted-foreground">
 Todos los datos. Todas las columnas. Sin filtros.
 </p>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground/60">
 <Clock className="w-3 h-3"/>
 <span>Última actualización: {format(lastRefresh,"HH:mm:ss")}</span>
 </div>
 <button
 onClick={loadData}
 className="p-1.5 hover:bg-accent/30 transition-colors border border-border/40"title="Refrescar">
 <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", loading &&"animate-spin")} />
 </button>
 </div>
 </div>

 {/* Tabs */}
 <div className="flex gap-0 border-b border-border/40 mb-4 overflow-x-auto">
 {TABS.map((tab) => (
 <button
 key={tab.key}
 onClick={() => setActiveTab(tab.key)}
 className={cn(
"px-3 py-2 font-mono text-[10px] uppercase tracking-wider whitespace-nowrap transition-colors border-b-2 -mb-[1px]",
 activeTab === tab.key
 ?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-muted-foreground")}
 >
 {tab.label}
 </button>
 ))}
 </div>

 {/* Filters + Export bar */}
 <div className="flex flex-wrap items-center gap-3 mb-4">
 {/* Date range */}
 <div className="flex items-center gap-1">
 <CalendarDays className="w-3 h-3 text-muted-foreground"/>
 <select
 value={dateRange}
 onChange={(e) => setDateRange(Number(e.target.value) as DateRange)}
 className="bg-background border border-border/40 font-mono text-[10px] px-2 py-1 text-foreground">
 <option value={7}>7 días</option>
 <option value={30}>30 días</option>
 <option value={90}>90 días</option>
 <option value={0}>Todo</option>
 </select>
 </div>

 {/* Person filter */}
 <div className="flex items-center gap-1">
 <Users className="w-3 h-3 text-muted-foreground"/>
 <select
 value={personFilter}
 onChange={(e) => setPersonFilter(e.target.value)}
 className="bg-background border border-border/40 font-mono text-[10px] px-2 py-1 text-foreground">
 <option value="all">Todos</option>
 {memberList.map((m) => (
 <option key={m.id} value={m.id}>{m.name}</option>
 ))}
 </select>
 </div>

 <div className="flex-1"/>

 {/* Export */}
 <Button
 variant="outline"size="sm"onClick={handleExportCsv}
 className="font-mono text-[10px] uppercase tracking-wider h-7 px-3 gap-1.5">
 <Download className="w-3 h-3"/>
 Exportar CSV
 </Button>
 </div>

 {/* Summary stats */}
 {stats && (
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
 <div className="bg-accent/30 border border-border p-3">
 <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">Total Filas</div>
 <div className="font-mono text-lg tabular-nums tracking-tight">{stats.totalRows.toLocaleString()}</div>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">Rango Fechas</div>
 <div className="font-mono text-[11px] tabular-nums tracking-tight">{stats.dateRangeStr}</div>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">Filas / Persona</div>
 <div className="font-mono text-lg tabular-nums tracking-tight">{stats.rowsPerPerson}</div>
 </div>
 <div className="bg-accent/30 border border-border p-3">
 <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">Filas / Día</div>
 <div className="font-mono text-lg tabular-nums tracking-tight">{stats.rowsPerDay}</div>
 </div>
 </div>
 )}

 {/* Data table */}
 <div className="border border-border overflow-x-auto mb-4">
 <table className="w-full border-collapse min-w-[800px]">
 <thead>
 <tr>
 {tabConfig.columns.map((col) => (
 <th
 key={col}
 onClick={() => handleSort(col)}
 className={cn(
"font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground bg-accent/20",
"px-2 py-2 text-left border border-border/30 cursor-pointer select-none whitespace-nowrap",
"hover:bg-accent/40 transition-colors")}
 >
 <span className="inline-flex items-center gap-1">
 {tabConfig.columnLabels[col] || col}
 {sortCol === col ? (
 sortDir ==="asc"? (
 <ArrowUp className="w-2.5 h-2.5 text-primary"/>
 ) : (
 <ArrowDown className="w-2.5 h-2.5 text-primary"/>
 )
 ) : (
 <ChevronsUpDown className="w-2.5 h-2.5 opacity-20"/>
 )}
 </span>
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {loading ? (
 <tr>
 <td colSpan={tabConfig.columns.length} className="text-center py-16">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">Cargando datos...</div>
 </td>
 </tr>
 ) : rows.length === 0 ? (
 <tr>
 <td colSpan={tabConfig.columns.length} className="text-center py-16">
 <div className="flex flex-col items-center gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Database className="w-6 h-6 text-primary/40"/>
 </div>
 <div className="font-mono text-xs text-muted-foreground">Sin datos para este filtro</div>
 </div>
 </td>
 </tr>
 ) : (
 rows.map((row, i) => (
 <tr
 key={`${row.id ?? row.user_id}-${i}`}
 className={cn(
"hover:bg-accent/20 transition-colors",
 i % 2 === 1 &&"bg-accent/10")}
 >
 {tabConfig.columns.map((col) => {
 const val = row[col];
 const display = formatCellValue(val);

 // Determine if this is a timestamp column for relative time
 const showRelative = isTimestamp(col) && val && typeof val ==="string";

 return (
 <td
 key={col}
 className={cn(
"font-mono text-[11px] px-2 py-1.5 border border-border/20 max-w-[300px] truncate",
 typeof val ==="number"&&"tabular-nums text-right",
 col ==="_quality_score"&&"text-center font-bold",
 col ==="_quality_score"&& val ==="A"&&"text-green-500",
 col ==="_quality_score"&& val ==="B"&&"text-blue-500",
 col ==="_quality_score"&& val ==="C"&&"text-amber-500",
 col ==="_quality_score"&& val ==="D"&&"text-orange-500",
 col ==="_quality_score"&& val ==="F"&&"text-red-500",
 col ==="is_late"&& val === true &&"text-red-500",
 col ==="resolved"&& val === true &&"text-green-500",
 col ==="resolved"&& val === false &&"text-red-500",
 col ==="_has_proof"&& val === true &&"text-green-500",
 col ==="_has_proof"&& val === false &&"text-red-500/50",
 )}
 title={
 showRelative
 ?`${display} (${timeAgo(val as string)})`: display.length > 40
 ? display
 : undefined
 }
 >
 {showRelative ? (
 <span className="flex flex-col">
 <span className="text-[10px]">{display}</span>
 <span className="text-[8px] text-muted-foreground">hace {timeAgo(val as string)}</span>
 </span>
 ) : (
 display
 )}
 </td>
 );
 })}
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>

 {/* Pagination */}
 {totalPages > 1 && (
 <div className="flex items-center justify-between">
 <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
 Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount.toLocaleString()}
 </div>
 <div className="flex items-center gap-1">
 <button
 onClick={() => setPage((p) => Math.max(0, p - 1))}
 disabled={page === 0}
 className={cn(
"p-1.5 border border-border/40 transition-colors",
 page === 0 ?"opacity-30 cursor-not-allowed":"hover:bg-accent/30")}
 >
 <ChevronLeft className="w-3.5 h-3.5"/>
 </button>
 <span className="font-mono text-[10px] tabular-nums px-2 text-muted-foreground">
 {page + 1} / {totalPages}
 </span>
 <button
 onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
 disabled={page >= totalPages - 1}
 className={cn(
"p-1.5 border border-border/40 transition-colors",
 page >= totalPages - 1 ?"opacity-30 cursor-not-allowed":"hover:bg-accent/30")}
 >
 <ChevronRight className="w-3.5 h-3.5"/>
 </button>
 </div>
 </div>
 )}

 {/* Auto-refresh indicator */}
 <div className="mt-6 flex items-center justify-center gap-2">
 <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>
 <span className="font-mono text-[8px] tracking-[0.2em] text-muted-foreground uppercase">
 Auto-refresh cada 60s
 </span>
 </div>
 </div>
 );
}
