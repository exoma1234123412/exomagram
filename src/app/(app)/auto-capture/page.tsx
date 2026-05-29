"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { cn, formatHour, getTodayMTY } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
 GitBranch,
 GitCommit,
 GitPullRequest,
 Zap,
 Clock,
 CheckCircle2,
 Brain,
 AlertCircle,
 RefreshCw,
 Sparkles,
 Target,
 TrendingUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatternData {
 typical_start_hour: number;
 typical_end_hour: number;
 avg_hours_per_day: Record<string, number>;
 category_by_hour: Record<string, string>;
 top_titles: Record<string, string[]>;
 total_days_analyzed: number;
}

interface Suggestion {
 hour: number;
 category: WorkCategory;
 title: string;
 confidence: number;
 reason: string;
 source:"pattern"|"github";
}

interface GapData {
 missing_hours: number[];
 expected_today: number;
 logged_today: number;
}

interface GithubSuggestion {
 user_id: string;
 date: string;
 hour: number;
 category: WorkCategory;
 title: string;
 description: string | null;
 source:"github";
 source_url: string | null;
 github_event_id: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_ORDER = ["Lun","Mar","Mi\u00e9","Jue","Vie","S\u00e1b","Dom"];

const GITHUB_EVENT_ICONS: Record<string, typeof GitCommit> = {
 commit: GitCommit,
 pr_opened: GitPullRequest,
 pr_merged: GitPullRequest,
 pr_reviewed: GitBranch,
 issue_opened: AlertCircle,
 issue_closed: CheckCircle2,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AutoCapturePage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 // State
 const [patterns, setPatterns] = useState<PatternData | null>(null);
 const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
 const [gaps, setGaps] = useState<GapData | null>(null);
 const [githubSuggestions, setGithubSuggestions] = useState<GithubSuggestion[]>([]);
 const [selectedGithub, setSelectedGithub] = useState<Set<string>>(new Set());
 const [autoCapturedCount, setAutoCapturedCount] = useState(0);

 // Loading states
 const [loadingSuggestions, setLoadingSuggestions] = useState(true);
 const [loadingGithub, setLoadingGithub] = useState(false);
 const [acceptingHour, setAcceptingHour] = useState<number | null>(null);
 const [acceptingGithub, setAcceptingGithub] = useState(false);
 const [createdCount, setCreatedCount] = useState<number | null>(null);

 // ---------------------------------------------------------------------------
 // Fetch smart suggestions
 // ---------------------------------------------------------------------------

 const fetchSuggestions = useCallback(async () => {
 if (!orgId || !userId) return;
 setLoadingSuggestions(true);

 try {
 const today = getTodayMTY();
 const res = await fetch(
`/api/auto-capture/suggest?org_id=${orgId}&user_id=${userId}&date=${today}`);
 if (res.ok) {
 const data = await res.json();
 setPatterns(data.patterns);
 setSuggestions(data.suggestions);
 setGaps(data.gaps);
 }
 } finally {
 setLoadingSuggestions(false);
 }
 }, [orgId, userId]);

 // ---------------------------------------------------------------------------
 // Fetch auto-captured stats
 // ---------------------------------------------------------------------------

 const fetchStats = useCallback(async () => {
 if (!orgId || !userId) return;

 const { count } = await supabase
 .from("time_entries")
 .select("id", { count:"exact", head: true })
 .eq("user_id", userId)
 .eq("org_id", orgId)
 .eq("auto_captured", true);

 setAutoCapturedCount(count ?? 0);
 }, [orgId, userId, supabase]);

 // ---------------------------------------------------------------------------
 // Load on mount
 // ---------------------------------------------------------------------------

 useEffect(() => {
 if (orgLoading || !orgId || !userId) return;
 fetchSuggestions();
 fetchStats();
 }, [orgId, userId, orgLoading, fetchSuggestions, fetchStats]);

 // ---------------------------------------------------------------------------
 // Scan GitHub
 // ---------------------------------------------------------------------------

 async function scanGithub() {
 if (!orgId || !userId) return;
 setLoadingGithub(true);
 setCreatedCount(null);

 try {
 const res = await fetch("/api/auto-capture/github", {
 method:"POST",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({ org_id: orgId, user_id: userId }),
 });
 if (res.ok) {
 const data = await res.json();
 setGithubSuggestions(data.suggestions ?? []);
 setSelectedGithub(new Set());
 }
 } finally {
 setLoadingGithub(false);
 }
 }

 // ---------------------------------------------------------------------------
 // Accept a single gap suggestion
 // ---------------------------------------------------------------------------

 async function acceptGapSuggestion(suggestion: Suggestion) {
 if (!orgId || !userId) return;
 setAcceptingHour(suggestion.hour);

 try {
 const today = getTodayMTY();
 const res = await fetch("/api/auto-capture/github", {
 method:"PUT",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({
 org_id: orgId,
 entries: [
 {
 user_id: userId,
 date: today,
 hour: suggestion.hour,
 category: suggestion.category,
 title: suggestion.title,
 },
 ],
 }),
 });
 if (res.ok) {
 // Remove from suggestions and gaps
 setSuggestions((prev) => prev.filter((s) => s.hour !== suggestion.hour));
 setGaps((prev) =>
 prev
 ? {
 ...prev,
 missing_hours: prev.missing_hours.filter((h) => h !== suggestion.hour),
 logged_today: prev.logged_today + 1,
 }
 : prev
 );
 setAutoCapturedCount((c) => c + 1);
 }
 } finally {
 setAcceptingHour(null);
 }
 }

 // ---------------------------------------------------------------------------
 // Accept selected GitHub suggestions
 // ---------------------------------------------------------------------------

 async function acceptSelectedGithub() {
 if (!orgId || !userId || selectedGithub.size === 0) return;
 setAcceptingGithub(true);
 setCreatedCount(null);

 const selected = githubSuggestions.filter((s) =>
 selectedGithub.has(s.github_event_id)
 );

 try {
 const res = await fetch("/api/auto-capture/github", {
 method:"PUT",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({
 org_id: orgId,
 entries: selected.map((s) => ({
 user_id: s.user_id,
 date: s.date,
 hour: s.hour,
 category: s.category,
 title: s.title,
 description: s.description,
 proof_urls: s.source_url ? [s.source_url] : null,
 })),
 }),
 });
 if (res.ok) {
 const data = await res.json();
 setCreatedCount(data.created);
 // Remove accepted from the list
 setGithubSuggestions((prev) =>
 prev.filter((s) => !selectedGithub.has(s.github_event_id))
 );
 setSelectedGithub(new Set());
 setAutoCapturedCount((c) => c + (data.created ?? 0));
 // Refresh suggestions
 fetchSuggestions();
 }
 } finally {
 setAcceptingGithub(false);
 }
 }

 // ---------------------------------------------------------------------------
 // Toggle GitHub suggestion selection
 // ---------------------------------------------------------------------------

 function toggleGithubSelection(eventId: string) {
 setSelectedGithub((prev) => {
 const next = new Set(prev);
 if (next.has(eventId)) {
 next.delete(eventId);
 } else {
 next.add(eventId);
 }
 return next;
 });
 }

 function selectAllGithub() {
 if (selectedGithub.size === githubSuggestions.length) {
 setSelectedGithub(new Set());
 } else {
 setSelectedGithub(new Set(githubSuggestions.map((s) => s.github_event_id)));
 }
 }

 // ---------------------------------------------------------------------------
 // Avg confidence
 // ---------------------------------------------------------------------------

 const avgConfidence =
 suggestions.length > 0
 ? Math.round(
 suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length
 )
 : 0;

 // ---------------------------------------------------------------------------
 // Render
 // ---------------------------------------------------------------------------

 if (orgLoading || loadingSuggestions) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </div>
 </div>
 );
 }

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* ------------------------------------------------------------------ */}
 {/* Header */}
 {/* ------------------------------------------------------------------ */}
 <div className="mb-8">
 <div className="flex items-center gap-2 mb-1">
 <Zap className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Auto-Captura
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground">
 Recolección inteligente de datos de trabajo
 </p>
 </div>

 {/* ------------------------------------------------------------------ */}
 {/* Resumen de Captura — Stats */}
 {/* ------------------------------------------------------------------ */}
 <div className="mb-8">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-3">
 Resumen de Captura
 </span>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <div className="bg-accent/30 border border-border p-4">
 <div className="flex items-center gap-2 mb-1">
 <CheckCircle2 className="w-3.5 h-3.5 text-primary"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Auto-capturadas
 </span>
 </div>
 <p className="font-mono text-2xl tabular-nums tracking-tight">
 {autoCapturedCount}
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-4">
 <div className="flex items-center gap-2 mb-1">
 <Brain className="w-3.5 h-3.5 text-primary"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Confianza promedio
 </span>
 </div>
 <p className="font-mono text-2xl tabular-nums tracking-tight">
 {avgConfidence}
 <span className="text-sm text-muted-foreground">%</span>
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-4">
 <div className="flex items-center gap-2 mb-1">
 <Target className="w-3.5 h-3.5 text-primary"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Huecos hoy
 </span>
 </div>
 <p className="font-mono text-2xl tabular-nums tracking-tight">
 {gaps?.missing_hours.length ?? 0}
 <span className="text-sm text-muted-foreground">
 {""}
 / {gaps?.expected_today ?? 8}
 </span>
 </p>
 </div>
 </div>
 </div>

 {/* ------------------------------------------------------------------ */}
 {/* Patrones Detectados */}
 {/* ------------------------------------------------------------------ */}
 {patterns && (
 <div className="mb-8">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-3">
 Patrones Detectados
 </span>
 <div className="border border-border bg-grid-palantir p-4 space-y-5">
 {/* Horario típico */}
 <div className="flex items-center gap-4">
 <Clock className="w-4 h-4 text-primary shrink-0"/>
 <div>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block">
 Horario típico
 </span>
 <span className="font-mono tabular-nums tracking-tight text-sm">
 {formatHour(patterns.typical_start_hour)} —{""}
 {formatHour(patterns.typical_end_hour)}
 </span>
 </div>
 <div className="ml-auto">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block">
 Días analizados
 </span>
 <span className="font-mono tabular-nums tracking-tight text-sm">
 {patterns.total_days_analyzed}
 </span>
 </div>
 </div>

 {/* Promedio diario por día de la semana */}
 <div>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-2">
 Promedio diario
 </span>
 <div className="flex items-end gap-1 h-20">
 {DAY_ORDER.map((day) => {
 const hours = patterns.avg_hours_per_day[day] ?? 0;
 const maxHours = Math.max(
 ...Object.values(patterns.avg_hours_per_day),
 1
 );
 const heightPct = (hours / maxHours) * 100;

 return (
 <div
 key={day}
 className="flex-1 flex flex-col items-center gap-1">
 <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
 {hours > 0 ? hours :""}
 </span>
 <div className="w-full relative"style={{ height:"48px"}}>
 <div
 className="absolute bottom-0 left-0 right-0 bg-primary/30 border border-primary/20 transition-all duration-300"style={{ height:`${Math.max(heightPct, 2)}%`}}
 />
 </div>
 <span className="font-mono text-[8px] tracking-wider text-muted-foreground/60 uppercase">
 {day}
 </span>
 </div>
 );
 })}
 </div>
 </div>

 {/* Categoría por hora — visual timeline */}
 <div>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-2">
 Categoría por hora
 </span>
 <div className="flex gap-px">
 {Array.from(
 { length: patterns.typical_end_hour - patterns.typical_start_hour + 1 },
 (_, i) => {
 const hour = patterns.typical_start_hour + i;
 const category = patterns.category_by_hour[String(hour)] as
 | WorkCategory
 | undefined;
 const bgColor = category
 ? CATEGORY_COLORS[category] ??"bg-muted":"bg-muted/30";
 const label = category
 ? CATEGORIES[category]?.emoji ??"":"";

 return (
 <div
 key={hour}
 className="flex-1 flex flex-col items-center gap-1">
 <div
 className={cn(
"w-full h-6 border border-border/50 flex items-center justify-center text-[10px]",
 bgColor,
"opacity-70")}
 title={
 category
 ?`${formatHour(hour)}: ${CATEGORIES[category]?.label}`: formatHour(hour)
 }
 >
 {label}
 </div>
 <span className="font-mono text-[7px] tabular-nums text-muted-foreground">
 {hour}
 </span>
 </div>
 );
 }
 )}
 </div>
 </div>
 </div>
 </div>
 )}

 {/* ------------------------------------------------------------------ */}
 {/* Huecos de Hoy */}
 {/* ------------------------------------------------------------------ */}
 <div className="mb-8">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-3">
 Huecos de Hoy
 </span>

 {gaps && (
 <div className="flex items-center gap-3 mb-3">
 <span className="font-mono text-xs text-muted-foreground">
 <span className="tabular-nums tracking-tight font-bold text-foreground">
 {gaps.logged_today}
 </span>
 {""}registradas /{""}
 <span className="tabular-nums tracking-tight">
 {gaps.expected_today}
 </span>
 {""}esperadas
 </span>
 <div className="flex-1 h-1.5 bg-muted border border-border overflow-hidden">
 <div
 className="h-full bg-primary transition-all duration-500"style={{
 width:`${Math.min(
 (gaps.logged_today / Math.max(gaps.expected_today, 1)) * 100,
 100
 )}%`,
 }}
 />
 </div>
 </div>
 )}

 {suggestions.length === 0 ? (
 <div className="border border-border p-8 flex flex-col items-center gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <CheckCircle2 className="w-6 h-6 text-primary"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground">
 Sin huecos pendientes. Todas las horas registradas.
 </p>
 </div>
 ) : (
 <div className="border border-border divide-y divide-border">
 {suggestions.map((suggestion) => {
 const cat = CATEGORIES[suggestion.category];
 const isAccepting = acceptingHour === suggestion.hour;

 return (
 <div
 key={suggestion.hour}
 className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/20">
 {/* Hour */}
 <span className="font-mono tabular-nums tracking-tight text-sm w-16 shrink-0">
 {formatHour(suggestion.hour)}
 </span>

 {/* Category badge */}
 <span
 className={cn(
"px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider border",
 cat?.bgColor,
 cat?.color
 )}
 >
 {cat?.emoji} {cat?.label}
 </span>

 {/* Title */}
 <span className="flex-1 font-mono text-xs text-foreground truncate">
 {suggestion.title}
 </span>

 {/* Confidence */}
 <span
 className={cn(
"font-mono tabular-nums tracking-tight text-xs shrink-0",
 suggestion.confidence >= 80
 ?"text-emerald-600 dark:text-emerald-400": suggestion.confidence >= 50
 ?"text-amber-600 dark:text-amber-400":"text-muted-foreground")}
 >
 {suggestion.confidence}%
 </span>

 {/* Source indicator */}
 {suggestion.source ==="github"&& (
 <GitBranch className="w-3 h-3 text-muted-foreground shrink-0"/>
 )}
 {suggestion.source ==="pattern"&& (
 <Brain className="w-3 h-3 text-muted-foreground shrink-0"/>
 )}

 {/* Accept button */}
 <Button
 variant="outline"size="sm"className="font-mono text-xs h-7 px-3 shrink-0"disabled={isAccepting}
 onClick={() => acceptGapSuggestion(suggestion)}
 >
 {isAccepting ? (
 <RefreshCw className="w-3 h-3 animate-spin"/>
 ) : (
"Aceptar")}
 </Button>
 </div>
 );
 })}
 </div>
 )}
 </div>

 {/* ------------------------------------------------------------------ */}
 {/* GitHub Auto-Captura */}
 {/* ------------------------------------------------------------------ */}
 <div className="mb-8">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-3">
 GitHub Auto-Captura
 </span>

 <div className="flex items-center gap-3 mb-3">
 <Button
 variant="outline"className="font-mono text-xs gap-2"disabled={loadingGithub}
 onClick={scanGithub}
 >
 {loadingGithub ? (
 <RefreshCw className="w-3.5 h-3.5 animate-spin"/>
 ) : (
 <GitBranch className="w-3.5 h-3.5"/>
 )}
 Escanear GitHub
 </Button>

 {createdCount !== null && (
 <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
 <CheckCircle2 className="w-3.5 h-3.5"/>
 {createdCount} entradas creadas
 </span>
 )}
 </div>

 {githubSuggestions.length > 0 && (
 <>
 <div className="flex items-center gap-3 mb-2">
 <button
 onClick={selectAllGithub}
 className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider cursor-pointer">
 {selectedGithub.size === githubSuggestions.length
 ?"Deseleccionar todo":"Seleccionar todo"}
 </button>
 {selectedGithub.size > 0 && (
 <Button
 size="sm"className="font-mono text-xs h-7 px-3 gap-1.5"disabled={acceptingGithub}
 onClick={acceptSelectedGithub}
 >
 {acceptingGithub ? (
 <RefreshCw className="w-3 h-3 animate-spin"/>
 ) : (
 <Sparkles className="w-3 h-3"/>
 )}
 Aceptar seleccionados ({selectedGithub.size})
 </Button>
 )}
 </div>

 <div className="border border-border divide-y divide-border">
 {githubSuggestions.map((suggestion) => {
 const cat = CATEGORIES[suggestion.category];
 const isSelected = selectedGithub.has(suggestion.github_event_id);

 // Derive event type from title prefix
 let EventIcon = GitCommit;
 if (suggestion.title.startsWith("PR")) EventIcon = GitPullRequest;
 else if (suggestion.title.startsWith("Code review"))
 EventIcon = GitBranch;
 else if (suggestion.title.startsWith("Issue"))
 EventIcon = AlertCircle;

 return (
 <label
 key={suggestion.github_event_id}
 className={cn(
"flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
 isSelected
 ?"bg-primary/5":"hover:bg-accent/20")}
 >
 {/* Checkbox */}
 <input
 type="checkbox"checked={isSelected}
 onChange={() =>
 toggleGithubSelection(suggestion.github_event_id)
 }
 className="accent-primary w-3.5 h-3.5 shrink-0"/>

 {/* Event icon */}
 <EventIcon className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0"/>

 {/* Category */}
 <span
 className={cn(
"px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider border shrink-0",
 cat?.bgColor,
 cat?.color
 )}
 >
 {cat?.emoji} {cat?.label}
 </span>

 {/* Title */}
 <span className="flex-1 font-mono text-xs text-foreground truncate">
 {suggestion.title}
 </span>

 {/* Repo */}
 {suggestion.description && (
 <span className="font-mono text-[10px] text-muted-foreground truncate max-w-32 shrink-0 hidden sm:block">
 {suggestion.description.replace("Repo:","")}
 </span>
 )}

 {/* Date + Hour */}
 <span className="font-mono tabular-nums text-[10px] text-muted-foreground shrink-0">
 {suggestion.date} {formatHour(suggestion.hour)}
 </span>
 </label>
 );
 })}
 </div>
 </>
 )}

 {githubSuggestions.length === 0 && !loadingGithub && (
 <div className="border border-border p-6 flex flex-col items-center gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <GitBranch className="w-6 h-6 text-muted-foreground"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground text-center">
 Presiona"Escanear GitHub"para detectar actividad de los últimos 7 días.
 </p>
 </div>
 )}
 </div>

 {/* ------------------------------------------------------------------ */}
 {/* Patterns — Top Titles */}
 {/* ------------------------------------------------------------------ */}
 {patterns && Object.keys(patterns.top_titles).length > 0 && (
 <div className="mb-8">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-3">
 Títulos Frecuentes
 </span>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {Object.entries(patterns.top_titles).map(([category, titles]) => {
 const cat = CATEGORIES[category as WorkCategory];
 if (!cat || titles.length === 0) return null;

 return (
 <div
 key={category}
 className="border border-border p-3 transition-colors hover:border-primary/30">
 <span
 className={cn(
"font-mono text-[10px] uppercase tracking-wider",
 cat.color
 )}
 >
 {cat.emoji} {cat.label}
 </span>
 <div className="mt-2 space-y-1">
 {titles.map((title) => (
 <p
 key={title}
 className="font-mono text-[11px] text-muted-foreground truncate">
 {title}
 </p>
 ))}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}
 </div>
 );
}
