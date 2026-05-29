"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import {
  FileText,
  Download,
  Trash2,
  Save,
  Copy,
  Printer,
  Filter,
  Calendar,
  Users,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────

type MetricKey =
  | "hours"
  | "proof_rate"
  | "trust_score"
  | "mood"
  | "energy"
  | "flags"
  | "streaks"
  | "closeouts"
  | "reactions"
  | "shoutouts"
  | "categories"
  | "late_rate";

type GroupBy = "person" | "date" | "category" | "day_of_week" | "hour";

interface SavedReport {
  id: string;
  name: string;
  report_type: string;
  config: Record<string, unknown>;
  created_at: string;
  last_run_at: string | null;
}

interface OrgMemberInfo {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface SortConfig {
  key: string;
  direction: "asc" | "desc";
}

// ── Constants ──────────────────────────────────────────────────

const ALL_METRICS: { key: MetricKey; label: string }[] = [
  { key: "hours", label: "Horas totales" },
  { key: "proof_rate", label: "Tasa de evidencia" },
  { key: "trust_score", label: "Trust Score" },
  { key: "mood", label: "Animo promedio" },
  { key: "energy", label: "Energia promedio" },
  { key: "flags", label: "Flags" },
  { key: "streaks", label: "Rachas" },
  { key: "closeouts", label: "Closeouts" },
  { key: "reactions", label: "Reacciones" },
  { key: "shoutouts", label: "Shoutouts" },
  { key: "categories", label: "Categorias" },
  { key: "late_rate", label: "Puntualidad" },
];

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "person", label: "Por persona" },
  { key: "date", label: "Por fecha" },
  { key: "category", label: "Por categoria" },
  { key: "day_of_week", label: "Por dia de semana" },
  { key: "hour", label: "Por hora" },
];

const CATEGORY_KEYS = Object.keys(CATEGORIES) as WorkCategory[];

// ── Helpers ────────────────────────────────────────────────────

function getDefaultStartDate(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split("T")[0];
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split("T")[0];
}

function formatCategoryMap(val: unknown): string {
  if (!val || typeof val !== "object") return "-";
  return Object.entries(val as Record<string, number>)
    .map(([k, v]) => `${CATEGORIES[k as WorkCategory]?.label ?? k}: ${v}`)
    .join(", ");
}

// ── Page ───────────────────────────────────────────────────────

export default function ReportsPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  // Saved reports
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);

  // Org members for filters
  const [orgMembers, setOrgMembers] = useState<OrgMemberInfo[]>([]);

  // Form state
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(getDefaultEndDate);
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(
    ALL_METRICS.map((m) => m.key)
  );
  const [groupBy, setGroupBy] = useState<GroupBy>("person");
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  const [filterCategories, setFilterCategories] = useState<WorkCategory[]>([]);
  const [saveName, setSaveName] = useState("");
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");

  // Results
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sort
  const [sort, setSort] = useState<SortConfig | null>(null);

  // Filters panel visibility
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Load saved reports + org members on mount ────────────────
  useEffect(() => {
    if (orgLoading || !orgId) return;

    async function load() {
      const [reportsRes, membersRes] = await Promise.all([
        fetch(`/api/reports/builder?org_id=${orgId}`),
        supabase
          .from("org_members")
          .select("user_id, profiles(full_name, email)")
          .eq("org_id", orgId!),
      ]);

      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setSavedReports(data.reports ?? []);
      }

      if (membersRes.data) {
        setOrgMembers(
          membersRes.data.map((m) => {
            const p = m.profiles as Record<string, unknown> | null;
            return {
              user_id: m.user_id,
              full_name: (p?.full_name as string) ?? null,
              email: (p?.email as string) ?? null,
            };
          })
        );
      }
    }
    load();
  }, [orgId, orgLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle helpers ───────────────────────────────────────────

  function toggleMetric(key: MetricKey) {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  }

  function toggleFilterUser(uid: string) {
    setFilterUserIds((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
    );
  }

  function toggleFilterCategory(cat: WorkCategory) {
    setFilterCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  // ── Load saved report config ─────────────────────────────────

  function loadSavedReport(report: SavedReport) {
    const config = report.config;
    if (config.start_date) setStartDate(config.start_date as string);
    if (config.end_date) setEndDate(config.end_date as string);
    if (config.metrics) setSelectedMetrics(config.metrics as MetricKey[]);
    if (config.group_by) setGroupBy(config.group_by as GroupBy);
    if (config.format) setExportFormat(config.format as "json" | "csv");
    const f = config.filters as Record<string, unknown> | undefined;
    if (f) {
      setFilterUserIds((f.user_ids as string[]) ?? []);
      setFilterCategories((f.categories as WorkCategory[]) ?? []);
    }
    setSavedOpen(false);
  }

  // ── Delete saved report ──────────────────────────────────────

  async function deleteSavedReport(reportId: string) {
    const res = await fetch(
      `/api/reports/builder?report_id=${reportId}&org_id=${orgId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setSavedReports((prev) => prev.filter((r) => r.id !== reportId));
    }
  }

  // ── Generate report ──────────────────────────────────────────

  async function generateReport() {
    if (!orgId) return;
    setGenerating(true);
    setError(null);
    setResults(null);
    setSummary(null);
    setSort(null);

    try {
      const res = await fetch("/api/reports/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          start_date: startDate,
          end_date: endDate,
          metrics: selectedMetrics,
          group_by: groupBy,
          filters: {
            user_ids: filterUserIds.length > 0 ? filterUserIds : null,
            categories: filterCategories.length > 0 ? filterCategories : null,
          },
          format: "json",
          save_as: saveName.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Error generando reporte");
        return;
      }

      const data = await res.json();
      setResults(data.data);
      setSummary(data.summary);

      // Refresh saved reports if we saved
      if (saveName.trim()) {
        setSaveName("");
        const refreshRes = await fetch(`/api/reports/builder?org_id=${orgId}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setSavedReports(refreshData.reports ?? []);
        }
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setGenerating(false);
    }
  }

  // ── Sorted results ──────────────────────────────────────────

  const sortedResults = useMemo(() => {
    if (!results) return null;
    if (!sort) return results;
    const sorted = [...results].sort((a, b) => {
      const aVal = a[sort.key];
      const bVal = b[sort.key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sort.direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sort.direction === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return sorted;
  }, [results, sort]);

  // ── Column definitions based on selected metrics ─────────────

  const columns = useMemo(() => {
    const cols: { key: string; label: string }[] = [{ key: "group_label", label: "Grupo" }];
    if (selectedMetrics.includes("hours")) cols.push({ key: "hours", label: "Horas" });
    if (selectedMetrics.includes("proof_rate")) cols.push({ key: "proof_rate", label: "Evidencia %" });
    if (selectedMetrics.includes("trust_score")) cols.push({ key: "trust_score", label: "Trust Score" });
    if (selectedMetrics.includes("mood")) cols.push({ key: "mood", label: "Animo" });
    if (selectedMetrics.includes("energy")) cols.push({ key: "energy", label: "Energia" });
    if (selectedMetrics.includes("flags")) cols.push({ key: "flags", label: "Flags" });
    if (selectedMetrics.includes("streaks")) cols.push({ key: "current_streak", label: "Racha" });
    if (selectedMetrics.includes("closeouts")) cols.push({ key: "closeouts", label: "Closeouts" });
    if (selectedMetrics.includes("reactions")) cols.push({ key: "reactions", label: "Reacciones" });
    if (selectedMetrics.includes("shoutouts")) cols.push({ key: "shoutouts", label: "Shoutouts" });
    if (selectedMetrics.includes("late_rate")) cols.push({ key: "late_rate", label: "Tardanza %" });
    if (selectedMetrics.includes("categories")) cols.push({ key: "categories", label: "Categorias" });
    return cols;
  }, [selectedMetrics]);

  // ── Export functions ─────────────────────────────────────────

  async function downloadCSV() {
    if (!orgId) return;
    const res = await fetch("/api/reports/builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: orgId,
        start_date: startDate,
        end_date: endDate,
        metrics: selectedMetrics,
        group_by: groupBy,
        filters: {
          user_ids: filterUserIds.length > 0 ? filterUserIds : null,
          categories: filterCategories.length > 0 ? filterCategories : null,
        },
        format: "csv",
        save_as: null,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadJSON() {
    if (!results || !summary) return;
    const payload = { data: results, summary, generated_at: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-${startDate}-${endDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyToClipboard() {
    if (!results) return;
    const text = JSON.stringify(results, null, 2);
    navigator.clipboard.writeText(text);
  }

  function handleSort(key: string) {
    setSort((prev) => {
      if (prev?.key === key) {
        return prev.direction === "asc"
          ? { key, direction: "desc" }
          : null;
      }
      return { key, direction: "asc" };
    });
  }

  // ── Loading state ────────────────────────────────────────────

  if (orgLoading) {
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
        <p className="text-sm text-muted-foreground font-mono">Sin organizacion</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Motor de Reportes
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Construye reportes personalizados desde todos los datos
        </p>
      </div>

      {/* ── Saved Reports ──────────────────────────────────────── */}
      <div className="mb-8 border border-border">
        <button
          onClick={() => setSavedOpen(!savedOpen)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/20 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Save className="w-3.5 h-3.5 text-primary" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Reportes guardados
            </span>
            <span className="font-mono text-[9px] text-muted-foreground/30">
              ({savedReports.length})
            </span>
          </div>
          {savedOpen ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/40" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
          )}
        </button>
        {savedOpen && (
          <div className="border-t border-border">
            {savedReports.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-6 h-6 text-muted-foreground/30" />
                </div>
                <p className="text-xs font-mono text-muted-foreground">
                  No hay reportes guardados
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {savedReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/20 transition-colors"
                  >
                    <button
                      onClick={() => loadSavedReport(report)}
                      className="flex-1 text-left cursor-pointer"
                    >
                      <span className="font-mono text-xs text-foreground">
                        {report.name}
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground/40 ml-3">
                        {report.report_type}
                      </span>
                      {report.last_run_at && (
                        <span className="font-mono text-[9px] text-muted-foreground/30 ml-3">
                          {new Date(report.last_run_at).toLocaleDateString("es-MX")}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => deleteSavedReport(report.id)}
                      className="p-1.5 hover:bg-destructive/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground/40 hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Report Builder Form ────────────────────────────────── */}
      <div className="space-y-6 mb-8">
        {/* Periodo */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Periodo
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="font-mono text-[9px] text-muted-foreground/40 mb-1 block">
                Desde
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-accent/30 border border-border px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex-1">
              <label className="font-mono text-[9px] text-muted-foreground/40 mb-1 block">
                Hasta
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-accent/30 border border-border px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>
        </div>

        {/* Metricas */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Metricas
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
            {ALL_METRICS.map((m) => {
              const checked = selectedMetrics.includes(m.key);
              return (
                <button
                  key={m.key}
                  onClick={() => toggleMetric(m.key)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 border transition-colors text-left cursor-pointer",
                    checked
                      ? "border-primary/40 bg-primary/8 text-foreground"
                      : "border-border bg-accent/20 text-muted-foreground hover:border-primary/20"
                  )}
                >
                  <div
                    className={cn(
                      "w-3.5 h-3.5 border flex items-center justify-center shrink-0",
                      checked ? "border-primary bg-primary" : "border-muted-foreground/30"
                    )}
                  >
                    {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  <span className="font-mono text-[10px]">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Agrupar por */}
        <div>
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3 block">
            Agrupar por
          </span>
          <div className="flex flex-wrap gap-1.5">
            {GROUP_OPTIONS.map((g) => (
              <button
                key={g.key}
                onClick={() => setGroupBy(g.key)}
                className={cn(
                  "px-3 py-2 border font-mono text-[10px] transition-colors cursor-pointer",
                  groupBy === g.key
                    ? "border-primary/40 bg-primary/8 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/20"
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filtros */}
        <div>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="flex items-center gap-2 mb-3 cursor-pointer"
          >
            <Filter className="w-3.5 h-3.5 text-primary" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Filtros
            </span>
            {(filterUserIds.length > 0 || filterCategories.length > 0) && (
              <span className="font-mono text-[9px] text-primary">
                ({filterUserIds.length + filterCategories.length} activos)
              </span>
            )}
            {filtersOpen ? (
              <ChevronUp className="w-3 h-3 text-muted-foreground/40" />
            ) : (
              <ChevronDown className="w-3 h-3 text-muted-foreground/40" />
            )}
          </button>
          {filtersOpen && (
            <div className="border border-border p-4 space-y-4">
              {/* Personas */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-3 h-3 text-muted-foreground/50" />
                  <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                    Personas
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {orgMembers.map((m) => {
                    const checked = filterUserIds.includes(m.user_id);
                    return (
                      <button
                        key={m.user_id}
                        onClick={() => toggleFilterUser(m.user_id)}
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5 border transition-colors text-left cursor-pointer",
                          checked
                            ? "border-primary/40 bg-primary/8"
                            : "border-border/50 hover:border-primary/20"
                        )}
                      >
                        <div
                          className={cn(
                            "w-3 h-3 border flex items-center justify-center shrink-0",
                            checked ? "border-primary bg-primary" : "border-muted-foreground/30"
                          )}
                        >
                          {checked && <Check className="w-2 h-2 text-primary-foreground" />}
                        </div>
                        <span className="font-mono text-[10px] text-foreground truncate">
                          {m.full_name ?? m.email ?? m.user_id.slice(0, 8)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Categorias */}
              <div>
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2 block">
                  Categorias
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                  {CATEGORY_KEYS.map((cat) => {
                    const checked = filterCategories.includes(cat);
                    const catInfo = CATEGORIES[cat];
                    return (
                      <button
                        key={cat}
                        onClick={() => toggleFilterCategory(cat)}
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5 border transition-colors text-left cursor-pointer",
                          checked
                            ? "border-primary/40 bg-primary/8"
                            : "border-border/50 hover:border-primary/20"
                        )}
                      >
                        <div
                          className={cn(
                            "w-3 h-3 border flex items-center justify-center shrink-0",
                            checked ? "border-primary bg-primary" : "border-muted-foreground/30"
                          )}
                        >
                          {checked && <Check className="w-2 h-2 text-primary-foreground" />}
                        </div>
                        <span className="font-mono text-[10px] text-foreground">
                          {catInfo.emoji} {catInfo.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Guardar como + Formato + Generar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          {/* Guardar como */}
          <div className="flex-1 w-full sm:w-auto">
            <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-1 block">
              Guardar como (opcional)
            </label>
            <div className="flex items-center gap-2">
              <Save className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Nombre del reporte"
                className="w-full bg-accent/30 border border-border px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Formato */}
          <div>
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-1 block">
              Formato
            </span>
            <div className="flex gap-0">
              <button
                onClick={() => setExportFormat("json")}
                className={cn(
                  "px-4 py-2 border font-mono text-[10px] transition-colors cursor-pointer",
                  exportFormat === "json"
                    ? "border-primary/40 bg-primary/8 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/20"
                )}
              >
                JSON
              </button>
              <button
                onClick={() => setExportFormat("csv")}
                className={cn(
                  "px-4 py-2 border border-l-0 font-mono text-[10px] transition-colors cursor-pointer",
                  exportFormat === "csv"
                    ? "border-primary/40 bg-primary/8 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/20"
                )}
              >
                CSV
              </button>
            </div>
          </div>

          {/* Generar */}
          <button
            onClick={generateReport}
            disabled={generating || selectedMetrics.length === 0}
            className={cn(
              "px-6 py-2 bg-primary text-primary-foreground font-mono text-xs uppercase tracking-wide transition-colors cursor-pointer",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "hover:bg-primary/90"
            )}
          >
            {generating ? (
              <span className="animate-pulse">Generando...</span>
            ) : (
              <span className="flex items-center gap-2">
                <Plus className="w-3.5 h-3.5" />
                Generar Reporte
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <div className="mb-8 px-4 py-3 bg-destructive/5 border border-destructive/20">
          <p className="font-mono text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* ── Results Table ──────────────────────────────────────── */}
      {sortedResults && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Resultados
            </span>
            <span className="font-mono text-[10px] tabular-nums tracking-tight text-muted-foreground">
              {sortedResults.length} filas
            </span>
          </div>

          <div className="border border-border overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-accent/20">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-3 py-2 font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground/60 cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap"
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        {sort?.key === col.key && (
                          sort.direction === "asc" ? (
                            <ChevronUp className="w-2.5 h-2.5" />
                          ) : (
                            <ChevronDown className="w-2.5 h-2.5" />
                          )
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-border/50 hover:bg-accent/10 transition-colors"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className="data-cell px-3 py-2 font-mono text-xs tabular-nums tracking-tight whitespace-nowrap"
                      >
                        {col.key === "categories"
                          ? formatCategoryMap(row[col.key])
                          : col.key === "group_label"
                            ? String(row[col.key] ?? "-")
                            : row[col.key] != null
                              ? String(row[col.key])
                              : "-"}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Summary row */}
                {summary && (
                  <tr className="border-t-2 border-primary/20 bg-accent/30">
                    {columns.map((col, ci) => (
                      <td
                        key={col.key}
                        className="data-cell px-3 py-2 font-mono text-xs font-bold tabular-nums tracking-tight whitespace-nowrap"
                      >
                        {ci === 0
                          ? "TOTAL"
                          : col.key === "categories"
                            ? "-"
                            : summary[`total_${col.key}`] != null
                              ? String(summary[`total_${col.key}`])
                              : summary[`avg_${col.key}`] != null
                                ? `~${summary[`avg_${col.key}`]}`
                                : "-"}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Export Controls ─────────────────────────────────────── */}
      {results && results.length > 0 && (
        <div>
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3 block">
            Exportar
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadCSV}
              className="flex items-center gap-2 px-4 py-2 border border-border font-mono text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar CSV
            </button>
            <button
              onClick={downloadJSON}
              className="flex items-center gap-2 px-4 py-2 border border-border font-mono text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar JSON
            </button>
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-2 px-4 py-2 border border-border font-mono text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar al portapapeles
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 border border-border font-mono text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
