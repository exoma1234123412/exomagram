"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, MOOD_LABELS, CATEGORY_COLORS } from "@/lib/constants";
import type { WorkCategory, Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  FileText,
  Download,
  Copy,
  Printer,
  Share2,
  Calendar,
  Users,
  FolderKanban,
  BarChart3,
  Trash2,
  Play,
  Save,
  ChevronDown,
  ChevronUp,
  Check,
  Clock,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReportType =
  | "client"
  | "executive"
  | "team_performance"
  | "project_breakdown";

const REPORT_TYPES: Record<ReportType, { label: string; description: string }> =
  {
    client: {
      label: "Reporte para Cliente",
      description: "Resumen de horas y avances para facturacion",
    },
    executive: {
      label: "Resumen Ejecutivo",
      description: "Vista de alto nivel para directivos",
    },
    team_performance: {
      label: "Rendimiento del Equipo",
      description: "Metricas de productividad por persona",
    },
    project_breakdown: {
      label: "Desglose por Proyecto",
      description: "Detalle de horas y categorias por proyecto",
    },
  };

interface ReportConfig {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  reportType: ReportType;
  projectFilter: string;
  memberFilter: string;
  includeProofLinks: boolean;
  includeMoodData: boolean;
  includeCategoryBreakdown: boolean;
  includeIndividualDetails: boolean;
  createdAt: string;
}

interface TimeEntryRow {
  id: string;
  user_id: string;
  date: string;
  hour: number;
  category: WorkCategory;
  title: string;
  mood: number | null;
  proof_urls: string[] | null;
  project: string | null;
  profiles: Pick<Profile, "id" | "full_name" | "email">;
}

interface ReportData {
  totalHours: number;
  proofRate: number;
  avgMood: number;
  entriesWithProof: number;
  totalEntries: number;
  topProjects: { name: string; hours: number }[];
  perProject: {
    name: string;
    hours: number;
    contributors: string[];
    categories: Record<string, number>;
  }[];
  perPerson: {
    name: string;
    hours: number;
    proofPercent: number;
    categories: Record<string, number>;
  }[];
  dailyHours: { date: string; hours: number }[];
  categoryTotals: { category: WorkCategory; hours: number; percent: number }[];
  highlights: string[];
  concerns: string[];
}

const STORAGE_KEY = "exomagram_saved_reports";

function loadSavedReports(): ReportConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedReports(configs: ReportConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const supabase = createClient();

  // Filters
  const today = new Date();
  const thirtyAgo = new Date();
  thirtyAgo.setDate(today.getDate() - 30);
  const [startDate, setStartDate] = useState(
    thirtyAgo.toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);
  const [reportType, setReportType] = useState<ReportType>("executive");
  const [projectFilter, setProjectFilter] = useState("");
  const [memberFilter, setMemberFilter] = useState("");

  // Include/exclude
  const [includeProofLinks, setIncludeProofLinks] = useState(true);
  const [includeMoodData, setIncludeMoodData] = useState(false);
  const [includeCategoryBreakdown, setIncludeCategoryBreakdown] = useState(true);
  const [includeIndividualDetails, setIncludeIndividualDetails] = useState(true);

  // State
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [members, setMembers] = useState<
    Pick<Profile, "id" | "full_name" | "email">[]
  >([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareLink, setShareLink] = useState("");

  // Saved reports
  const [savedReports, setSavedReports] = useState<ReportConfig[]>([]);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [showSavedPanel, setShowSavedPanel] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------------------
  // Initial load: org, members, projects
  // -----------------------------------------------------------------------
  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setInitialLoading(false);
        return;
      }

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (!membership) {
        setInitialLoading(false);
        return;
      }
      setOrgId(membership.org_id);
      setUserId(user.id);

      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", membership.org_id)
        .single();
      if (org) setOrgName(org.name);

      // Members
      const { data: mems } = await supabase
        .from("org_members")
        .select("user_id, profiles(id, full_name, email)")
        .eq("org_id", membership.org_id);

      if (mems) {
        const profileList = mems
          .map((m: Record<string, unknown>) => m.profiles as Pick<Profile, "id" | "full_name" | "email">)
          .filter(Boolean);
        setMembers(profileList);
      }

      // Distinct projects from time_entries
      const { data: projData } = await supabase
        .from("time_entries")
        .select("project")
        .eq("org_id", membership.org_id)
        .not("project", "is", null);

      if (projData) {
        const unique = [
          ...new Set(
            projData
              .map((p: { project: string | null }) => p.project)
              .filter(Boolean) as string[],
          ),
        ];
        unique.sort();
        setProjects(unique);
      }

      setSavedReports(loadSavedReports());
      setInitialLoading(false);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Generate report
  // -----------------------------------------------------------------------
  const generateReport = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setReportData(null);

    let query = supabase
      .from("time_entries")
      .select("id, user_id, date, hour, category, title, mood, proof_urls, project, profiles(id, full_name, email)")
      .eq("org_id", orgId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true })
      .order("hour", { ascending: true });

    if (projectFilter) {
      query = query.eq("project", projectFilter);
    }
    if (memberFilter) {
      query = query.eq("user_id", memberFilter);
    }

    const { data: entries } = await query;

    if (!entries || entries.length === 0) {
      setReportData({
        totalHours: 0,
        proofRate: 0,
        avgMood: 0,
        entriesWithProof: 0,
        totalEntries: 0,
        topProjects: [],
        perProject: [],
        perPerson: [],
        dailyHours: [],
        categoryTotals: [],
        highlights: [],
        concerns: ["No se encontraron entradas para el periodo seleccionado."],
      });
      setLoading(false);
      return;
    }

    const rows = entries as unknown as TimeEntryRow[];

    // Total hours
    const totalHours = rows.length;

    // Proof rate
    const entriesWithProof = rows.filter(
      (e) => e.proof_urls && e.proof_urls.length > 0,
    ).length;
    const proofRate =
      totalHours > 0 ? Math.round((entriesWithProof / totalHours) * 100) : 0;

    // Avg mood
    const moods = rows.filter((e) => e.mood !== null).map((e) => e.mood!);
    const avgMood =
      moods.length > 0
        ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) /
          10
        : 0;

    // Top projects
    const projectHours = new Map<string, number>();
    for (const e of rows) {
      const p = e.project ?? "Sin proyecto";
      projectHours.set(p, (projectHours.get(p) ?? 0) + 1);
    }
    const topProjects = Array.from(projectHours.entries())
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours);

    // Per-project breakdown
    const projMap = new Map<
      string,
      { hours: number; contributors: Set<string>; categories: Map<string, number> }
    >();
    for (const e of rows) {
      const pName = e.project ?? "Sin proyecto";
      const d = projMap.get(pName) ?? {
        hours: 0,
        contributors: new Set<string>(),
        categories: new Map<string, number>(),
      };
      d.hours++;
      d.contributors.add(
        e.profiles?.full_name ?? e.profiles?.email ?? e.user_id,
      );
      d.categories.set(e.category, (d.categories.get(e.category) ?? 0) + 1);
      projMap.set(pName, d);
    }
    const perProject = Array.from(projMap.entries())
      .map(([name, d]) => ({
        name,
        hours: d.hours,
        contributors: Array.from(d.contributors),
        categories: Object.fromEntries(d.categories),
      }))
      .sort((a, b) => b.hours - a.hours);

    // Per-person breakdown
    const personMap = new Map<
      string,
      {
        name: string;
        hours: number;
        withProof: number;
        categories: Map<string, number>;
      }
    >();
    for (const e of rows) {
      const uid = e.user_id;
      const name =
        e.profiles?.full_name ?? e.profiles?.email ?? uid;
      const d = personMap.get(uid) ?? {
        name,
        hours: 0,
        withProof: 0,
        categories: new Map<string, number>(),
      };
      d.hours++;
      if (e.proof_urls && e.proof_urls.length > 0) d.withProof++;
      d.categories.set(e.category, (d.categories.get(e.category) ?? 0) + 1);
      personMap.set(uid, d);
    }
    const perPerson = Array.from(personMap.values())
      .map((d) => ({
        name: d.name,
        hours: d.hours,
        proofPercent:
          d.hours > 0 ? Math.round((d.withProof / d.hours) * 100) : 0,
        categories: Object.fromEntries(d.categories),
      }))
      .sort((a, b) => b.hours - a.hours);

    // Daily hours
    const dayMap = new Map<string, number>();
    for (const e of rows) {
      dayMap.set(e.date, (dayMap.get(e.date) ?? 0) + 1);
    }
    const allDays = eachDayOfInterval({
      start: parseISO(startDate),
      end: parseISO(endDate),
    });
    const dailyHours = allDays.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      return { date: key, hours: dayMap.get(key) ?? 0 };
    });

    // Category totals
    const catMap = new Map<WorkCategory, number>();
    for (const e of rows) {
      catMap.set(
        e.category,
        (catMap.get(e.category) ?? 0) + 1,
      );
    }
    const categoryTotals = Array.from(catMap.entries())
      .map(([category, hours]) => ({
        category,
        hours,
        percent: Math.round((hours / totalHours) * 100),
      }))
      .sort((a, b) => b.hours - a.hours);

    // Highlights & concerns
    const highlights: string[] = [];
    const concerns: string[] = [];

    if (proofRate >= 80) {
      highlights.push(
        `Alta tasa de evidencia: ${proofRate}% de las entradas incluyen pruebas verificables.`,
      );
    }
    if (topProjects.length > 0) {
      highlights.push(
        `Proyecto principal: ${topProjects[0].name} con ${topProjects[0].hours}h registradas.`,
      );
    }
    const deepWorkCat = categoryTotals.find((c) => c.category === "deep_work");
    if (deepWorkCat && deepWorkCat.percent >= 40) {
      highlights.push(
        `${deepWorkCat.percent}% del tiempo en Deep Work — enfoque solido del equipo.`,
      );
    }
    if (perPerson.length > 0) {
      const topPerson = perPerson[0];
      highlights.push(
        `Mayor contribuyente: ${topPerson.name} con ${topPerson.hours}h.`,
      );
    }

    if (proofRate < 50) {
      concerns.push(
        `Baja tasa de evidencia (${proofRate}%). Se recomienda adjuntar pruebas a las entradas.`,
      );
    }
    const meetingCat = categoryTotals.find((c) => c.category === "meeting");
    if (meetingCat && meetingCat.percent > 30) {
      concerns.push(
        `Las reuniones representan ${meetingCat.percent}% del tiempo total. Considerar reducir.`,
      );
    }
    const blockedCat = categoryTotals.find((c) => c.category === "blocked");
    if (blockedCat && blockedCat.percent > 10) {
      concerns.push(
        `${blockedCat.percent}% del tiempo bloqueado (${blockedCat.hours}h). Investigar causas.`,
      );
    }
    const lowProofMembers = perPerson.filter((p) => p.proofPercent < 30 && p.hours >= 5);
    if (lowProofMembers.length > 0) {
      concerns.push(
        `${lowProofMembers.length} miembros con menos de 30% de evidencia.`,
      );
    }

    setReportData({
      totalHours,
      proofRate,
      avgMood,
      entriesWithProof,
      totalEntries: totalHours,
      topProjects,
      perProject,
      perPerson,
      dailyHours,
      categoryTotals,
      highlights,
      concerns,
    });
    setLoading(false);
  }, [orgId, startDate, endDate, projectFilter, memberFilter, supabase]);

  // -----------------------------------------------------------------------
  // Export functions
  // -----------------------------------------------------------------------
  const generateMarkdown = useCallback(() => {
    if (!reportData) return "";
    const lines: string[] = [];
    const typeLabel = REPORT_TYPES[reportType].label;
    lines.push(`# ${typeLabel} — ${orgName || "Organizacion"}`);
    lines.push(
      `**Periodo:** ${format(parseISO(startDate), "d MMM yyyy", { locale: es })} - ${format(parseISO(endDate), "d MMM yyyy", { locale: es })}`,
    );
    lines.push(
      `**Generado:** ${format(new Date(), "d MMM yyyy HH:mm", { locale: es })}`,
    );
    lines.push("");

    lines.push("## Resumen");
    lines.push(`- **Total horas:** ${reportData.totalHours}h`);
    lines.push(`- **Tasa de evidencia:** ${reportData.proofRate}%`);
    if (includeMoodData && reportData.avgMood > 0) {
      lines.push(
        `- **Animo promedio:** ${reportData.avgMood}/5 (${MOOD_LABELS[Math.round(reportData.avgMood)] ?? ""})`,
      );
    }
    lines.push(
      `- **Proyectos activos:** ${reportData.topProjects.length}`,
    );
    lines.push("");

    if (reportData.topProjects.length > 0) {
      lines.push("## Proyectos principales");
      for (const p of reportData.topProjects.slice(0, 5)) {
        lines.push(`- ${p.name}: ${p.hours}h`);
      }
      lines.push("");
    }

    if (includeCategoryBreakdown && reportData.categoryTotals.length > 0) {
      lines.push("## Distribucion por categoria");
      for (const c of reportData.categoryTotals) {
        lines.push(
          `- ${CATEGORIES[c.category].label}: ${c.hours}h (${c.percent}%)`,
        );
      }
      lines.push("");
    }

    if (includeIndividualDetails && reportData.perPerson.length > 0) {
      lines.push("## Desglose por persona");
      for (const p of reportData.perPerson) {
        lines.push(
          `### ${p.name} — ${p.hours}h (evidencia: ${p.proofPercent}%)`,
        );
        if (includeCategoryBreakdown) {
          for (const [cat, hrs] of Object.entries(p.categories)) {
            const catKey = cat as WorkCategory;
            lines.push(`  - ${CATEGORIES[catKey]?.label ?? cat}: ${hrs}h`);
          }
        }
        lines.push("");
      }
    }

    if (reportData.perProject.length > 0) {
      lines.push("## Desglose por proyecto");
      for (const proj of reportData.perProject) {
        lines.push(`### ${proj.name} — ${proj.hours}h`);
        lines.push(`Contribuyentes: ${proj.contributors.join(", ")}`);
        if (includeCategoryBreakdown) {
          for (const [cat, hrs] of Object.entries(proj.categories)) {
            const catKey = cat as WorkCategory;
            lines.push(`  - ${CATEGORIES[catKey]?.label ?? cat}: ${hrs}h`);
          }
        }
        lines.push("");
      }
    }

    if (reportData.highlights.length > 0) {
      lines.push("## Destacados");
      for (const h of reportData.highlights) lines.push(`- ${h}`);
      lines.push("");
    }
    if (reportData.concerns.length > 0) {
      lines.push("## Puntos de atencion");
      for (const c of reportData.concerns) lines.push(`- ${c}`);
      lines.push("");
    }

    return lines.join("\n");
  }, [
    reportData,
    reportType,
    orgName,
    startDate,
    endDate,
    includeMoodData,
    includeCategoryBreakdown,
    includeIndividualDetails,
  ]);

  const copyMarkdown = useCallback(async () => {
    const md = generateMarkdown();
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generateMarkdown]);

  const downloadCSV = useCallback(() => {
    if (!reportData) return;
    const headers = [
      "Persona",
      "Horas",
      "Evidencia %",
      ...Object.keys(CATEGORIES).map(
        (k) => CATEGORIES[k as WorkCategory].label,
      ),
    ];
    const csvRows = [headers.join(",")];
    for (const p of reportData.perPerson) {
      const row = [
        `"${p.name}"`,
        p.hours,
        p.proofPercent,
        ...Object.keys(CATEGORIES).map(
          (k) => p.categories[k] ?? 0,
        ),
      ];
      csvRows.push(row.join(","));
    }
    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [reportData, startDate, endDate]);

  const printReport = useCallback(() => {
    window.print();
  }, []);

  const generateShareLink = useCallback(async () => {
    if (!orgId || !userId) return;
    const token = crypto.randomUUID();
    const { error } = await supabase.from("public_dashboards").insert({
      org_id: orgId,
      token,
      created_by: userId,
      label: "Dashboard público",
      show_names: true,
      show_details: true,
      active: true,
    });
    if (error) {
      console.error("Error creating share link:", error);
      return;
    }
    const link = `${window.location.origin}/public/${token}`;
    setShareLink(link);
    navigator.clipboard.writeText(link);
  }, [orgId, userId, supabase]);

  // -----------------------------------------------------------------------
  // Saved reports
  // -----------------------------------------------------------------------
  const saveReport = useCallback(() => {
    if (!saveName.trim()) return;
    const config: ReportConfig = {
      id: crypto.randomUUID(),
      name: saveName.trim(),
      description: saveDescription.trim(),
      startDate,
      endDate,
      reportType,
      projectFilter,
      memberFilter,
      includeProofLinks,
      includeMoodData,
      includeCategoryBreakdown,
      includeIndividualDetails,
      createdAt: new Date().toISOString(),
    };
    const updated = [...savedReports, config];
    setSavedReports(updated);
    persistSavedReports(updated);
    setSaveName("");
    setSaveDescription("");
    setShowSaveForm(false);
  }, [
    saveName,
    saveDescription,
    startDate,
    endDate,
    reportType,
    projectFilter,
    memberFilter,
    includeProofLinks,
    includeMoodData,
    includeCategoryBreakdown,
    includeIndividualDetails,
    savedReports,
  ]);

  const loadReport = useCallback((config: ReportConfig) => {
    setStartDate(config.startDate);
    setEndDate(config.endDate);
    setReportType(config.reportType);
    setProjectFilter(config.projectFilter);
    setMemberFilter(config.memberFilter);
    setIncludeProofLinks(config.includeProofLinks);
    setIncludeMoodData(config.includeMoodData);
    setIncludeCategoryBreakdown(config.includeCategoryBreakdown);
    setIncludeIndividualDetails(config.includeIndividualDetails);
  }, []);

  const deleteSavedReport = useCallback(
    (id: string) => {
      const updated = savedReports.filter((r) => r.id !== id);
      setSavedReports(updated);
      persistSavedReports(updated);
    },
    [savedReports],
  );

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">
          Cargando...
        </p>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------
  const maxDailyHours =
    reportData && reportData.dailyHours.length > 0
      ? Math.max(1, ...reportData.dailyHours.map((d) => d.hours))
      : 1;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 print:px-0 print:py-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <FileText className="w-6 h-6 text-blue-500" />
        <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Genera reportes para clientes, ejecutivos o equipo
      </p>

      {/* ----------------------------------------------------------------- */}
      {/* REPORT GENERATOR                                                    */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 print:hidden">
        {/* Filters card */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Configurar reporte
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Desde
                </Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Hasta
                </Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            {/* Report type */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1">
                Tipo de reporte
              </Label>
              <Select
                value={reportType}
                onValueChange={(v) => v && setReportType(v as ReportType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORT_TYPES).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                {REPORT_TYPES[reportType].description}
              </p>
            </div>

            {/* Optional filters */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <FolderKanban className="w-3 h-3" /> Proyecto (opcional)
                </Label>
                <Select
                  value={projectFilter}
                  onValueChange={(v) => v && setProjectFilter(v === "__all__" ? "" : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos los proyectos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos los proyectos</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Miembro (opcional)
                </Label>
                <Select
                  value={memberFilter}
                  onValueChange={(v) => v && setMemberFilter(v === "__all__" ? "" : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todo el equipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todo el equipo</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name ?? m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Include / exclude toggles */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">
                Incluir en el reporte
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: "Links de evidencia",
                    checked: includeProofLinks,
                    toggle: () => setIncludeProofLinks(!includeProofLinks),
                  },
                  {
                    label: "Datos de animo",
                    checked: includeMoodData,
                    toggle: () => setIncludeMoodData(!includeMoodData),
                  },
                  {
                    label: "Desglose por categoria",
                    checked: includeCategoryBreakdown,
                    toggle: () =>
                      setIncludeCategoryBreakdown(!includeCategoryBreakdown),
                  },
                  {
                    label: "Detalle individual",
                    checked: includeIndividualDetails,
                    toggle: () =>
                      setIncludeIndividualDetails(!includeIndividualDetails),
                  },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={opt.toggle}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors text-left",
                      opt.checked
                        ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                        : "border-muted bg-muted/20 text-muted-foreground",
                    )}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                        opt.checked
                          ? "bg-blue-500 border-blue-500"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {opt.checked && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={generateReport}
                disabled={loading}
                className="flex-1"
              >
                {loading ? (
                  "Generando..."
                ) : (
                  <>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Generar reporte
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSaveForm(!showSaveForm)}
              >
                <Save className="w-4 h-4" />
              </Button>
            </div>

            {/* Save form */}
            {showSaveForm && (
              <div className="border rounded-lg p-3 space-y-2 bg-accent/30">
                <Input
                  placeholder="Nombre del reporte guardado"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="text-sm"
                />
                <Input
                  placeholder="Descripcion (opcional)"
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={saveReport}
                  disabled={!saveName.trim()}
                  className="w-full"
                >
                  <Save className="w-3 h-3 mr-1" /> Guardar configuracion
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Saved reports panel */}
        <Card>
          <CardHeader className="pb-2">
            <button
              type="button"
              className="flex items-center gap-2 w-full"
              onClick={() => setShowSavedPanel(!showSavedPanel)}
            >
              <CardTitle className="text-sm flex items-center gap-2 flex-1">
                <Save className="w-4 h-4 text-emerald-500" />
                Reportes guardados
                {savedReports.length > 0 && (
                  <Badge variant="outline" className="text-[10px] ml-1">
                    {savedReports.length}
                  </Badge>
                )}
              </CardTitle>
              {showSavedPanel ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {showSavedPanel && (
            <CardContent className="space-y-2">
              {savedReports.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No hay reportes guardados. Configura uno y presiona el icono
                  de guardar.
                </p>
              ) : (
                savedReports.map((r) => (
                  <div
                    key={r.id}
                    className="border rounded-lg p-2.5 space-y-1 bg-accent/20"
                  >
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    {r.description && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {r.description}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {REPORT_TYPES[r.reportType]?.label} |{" "}
                      {format(parseISO(r.startDate), "d MMM", { locale: es })} -{" "}
                      {format(parseISO(r.endDate), "d MMM", { locale: es })}
                    </p>
                    <div className="flex gap-1 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-[10px]"
                        onClick={() => loadReport(r)}
                      >
                        <Play className="w-3 h-3 mr-1" /> Cargar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] text-red-500 hover:text-red-600"
                        onClick={() => deleteSavedReport(r.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* REPORT PREVIEW                                                     */}
      {/* ----------------------------------------------------------------- */}
      {reportData && (
        <div ref={reportRef}>
          {/* Export toolbar */}
          <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
            <Button size="sm" variant="outline" onClick={copyMarkdown}>
              {copied ? (
                <>
                  <Check className="w-3 h-3 mr-1" /> Copiado
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" /> Copiar Markdown
                </>
              )}
            </Button>
            <Button size="sm" variant="outline" onClick={downloadCSV}>
              <Download className="w-3 h-3 mr-1" /> Descargar CSV
            </Button>
            <Button size="sm" variant="outline" onClick={printReport}>
              <Printer className="w-3 h-3 mr-1" /> Imprimir / PDF
            </Button>
            <Button size="sm" variant="outline" onClick={generateShareLink}>
              <Share2 className="w-3 h-3 mr-1" /> Compartir link
            </Button>
            {shareLink && (
              <span className="text-[10px] text-muted-foreground bg-accent/50 px-2 py-1 rounded truncate max-w-xs">
                {shareLink}
              </span>
            )}
          </div>

          {/* Report header */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-xl font-bold">
                    {REPORT_TYPES[reportType].label}
                  </h2>
                  <p className="text-lg text-muted-foreground">
                    {orgName || "Organizacion"}
                  </p>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <p>
                    {format(parseISO(startDate), "d MMM yyyy", { locale: es })} -{" "}
                    {format(parseISO(endDate), "d MMM yyyy", { locale: es })}
                  </p>
                  <p className="text-xs">
                    Generado:{" "}
                    {format(new Date(), "d MMM yyyy HH:mm", { locale: es })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Executive summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <Clock className="w-5 h-5 mx-auto text-blue-500 mb-1" />
                <p className="text-2xl font-bold">{reportData.totalHours}h</p>
                <p className="text-[10px] text-muted-foreground">
                  Total horas
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <ShieldCheck className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
                <p className="text-2xl font-bold">{reportData.proofRate}%</p>
                <p className="text-[10px] text-muted-foreground">
                  Con evidencia
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <FolderKanban className="w-5 h-5 mx-auto text-amber-500 mb-1" />
                <p className="text-2xl font-bold">
                  {reportData.topProjects.length}
                </p>
                <p className="text-[10px] text-muted-foreground">Proyectos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="w-5 h-5 mx-auto text-primary mb-1" />
                <p className="text-2xl font-bold">
                  {reportData.perPerson.length}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Contribuyentes
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Highlights & concerns */}
          {(reportData.highlights.length > 0 ||
            reportData.concerns.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {reportData.highlights.length > 0 && (
                <Card className="border-emerald-200 dark:border-emerald-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      Destacados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {reportData.highlights.map((h, i) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground flex items-start gap-2"
                        >
                          <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {reportData.concerns.length > 0 && (
                <Card className="border-amber-200 dark:border-amber-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Puntos de atencion
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {reportData.concerns.map((c, i) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground flex items-start gap-2"
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Daily hours bar chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-500" />
                  Horas por dia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-[2px] h-28 overflow-x-auto">
                  {reportData.dailyHours.map((d) => {
                    const pct =
                      maxDailyHours > 0
                        ? (d.hours / maxDailyHours) * 100
                        : 0;
                    const isWeekend = [0, 6].includes(
                      parseISO(d.date).getDay(),
                    );
                    return (
                      <div
                        key={d.date}
                        className="flex-1 min-w-[6px] flex flex-col items-center gap-0.5"
                      >
                        <div
                          className={cn(
                            "w-full rounded-t transition-all",
                            d.hours === 0
                              ? "bg-muted/30"
                              : isWeekend
                                ? "bg-blue-300 dark:bg-blue-800"
                                : pct >= 70
                                  ? "bg-blue-600"
                                  : "bg-blue-400",
                          )}
                          style={{
                            height: `${Math.max(pct, 3)}%`,
                          }}
                          title={`${format(parseISO(d.date), "d MMM", { locale: es })}: ${d.hours}h`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-muted-foreground">
                    {format(parseISO(startDate), "d MMM", { locale: es })}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {format(parseISO(endDate), "d MMM", { locale: es })}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Category donut (simplified as horizontal bars) */}
            {includeCategoryBreakdown && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    Distribucion por categoria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Donut-style ring */}
                  <div className="flex items-center gap-4">
                    <div className="relative w-24 h-24 shrink-0">
                      <svg
                        viewBox="0 0 36 36"
                        className="w-full h-full -rotate-90"
                      >
                        {(() => {
                          let offset = 0;
                          const ringColors: Record<string, string> = {
                            deep_work: "#8b5cf6",
                            meeting: "#3b82f6",
                            review: "#f59e0b",
                            admin: "#94a3b8",
                            planning: "#10b981",
                            learning: "#ec4899",
                            break: "#4ade80",
                            blocked: "#ef4444",
                          };
                          return reportData.categoryTotals.map((c) => {
                            const dash = c.percent;
                            const gap = 100 - dash;
                            const el = (
                              <circle
                                key={c.category}
                                cx="18"
                                cy="18"
                                r="15.9155"
                                fill="transparent"
                                stroke={ringColors[c.category] ?? "#6b7280"}
                                strokeWidth="3"
                                strokeDasharray={`${dash} ${gap}`}
                                strokeDashoffset={`${-offset}`}
                              />
                            );
                            offset += dash;
                            return el;
                          });
                        })()}
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold">
                          {reportData.totalHours}h
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-1">
                      {reportData.categoryTotals.map((c) => (
                        <div
                          key={c.category}
                          className="flex items-center gap-1.5"
                        >
                          <div
                            className={cn(
                              "w-2.5 h-2.5 rounded-sm shrink-0",
                              CATEGORY_COLORS[c.category],
                            )}
                          />
                          <span className="text-[10px] flex-1 truncate">
                            {CATEGORIES[c.category].label}
                          </span>
                          <span className="text-[10px] font-medium">
                            {c.hours}h
                          </span>
                          <span className="text-[9px] text-muted-foreground w-7 text-right">
                            {c.percent}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Per-project breakdown */}
          {reportData.perProject.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-amber-500" />
                  Desglose por proyecto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reportData.perProject.map((proj) => (
                    <div
                      key={proj.name}
                      className="border rounded-lg p-3 bg-accent/10"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium">{proj.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          {proj.hours}h
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-2">
                        Contribuyentes: {proj.contributors.join(", ")}
                      </p>
                      {includeCategoryBreakdown && (
                        <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                          {Object.entries(proj.categories)
                            .sort(([, a], [, b]) => b - a)
                            .map(([cat, hrs]) => (
                              <div
                                key={cat}
                                className={cn(
                                  "transition-all",
                                  CATEGORY_COLORS[cat] ?? "bg-gray-400",
                                )}
                                style={{
                                  width: `${(hrs / proj.hours) * 100}%`,
                                }}
                                title={`${CATEGORIES[cat as WorkCategory]?.label ?? cat}: ${hrs}h`}
                              />
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-person breakdown */}
          {includeIndividualDetails && reportData.perPerson.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Desglose por persona
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {reportData.perPerson.map((person) => (
                    <div
                      key={person.name}
                      className="border rounded-lg p-3 bg-accent/10"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <h4 className="text-sm font-medium">{person.name}</h4>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {person.hours}h
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              person.proofPercent >= 80
                                ? "text-emerald-600 border-emerald-300"
                                : person.proofPercent >= 50
                                  ? "text-yellow-600 border-yellow-300"
                                  : "text-red-600 border-red-300",
                            )}
                          >
                            {person.proofPercent}% evidencia
                          </Badge>
                        </div>
                      </div>

                      {includeCategoryBreakdown && (
                        <>
                          <div className="flex gap-1 h-2.5 rounded-full overflow-hidden mb-1.5">
                            {Object.entries(person.categories)
                              .sort(([, a], [, b]) => b - a)
                              .map(([cat, hrs]) => (
                                <div
                                  key={cat}
                                  className={cn(
                                    "transition-all",
                                    CATEGORY_COLORS[cat] ?? "bg-gray-400",
                                  )}
                                  style={{
                                    width: `${(hrs / person.hours) * 100}%`,
                                  }}
                                  title={`${CATEGORIES[cat as WorkCategory]?.label ?? cat}: ${hrs}h`}
                                />
                              ))}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {Object.entries(person.categories)
                              .sort(([, a], [, b]) => b - a)
                              .map(([cat, hrs]) => (
                                <span
                                  key={cat}
                                  className="text-[9px] text-muted-foreground"
                                >
                                  {CATEGORIES[cat as WorkCategory]?.emoji}{" "}
                                  {CATEGORIES[cat as WorkCategory]?.label ?? cat}{" "}
                                  {hrs}h
                                </span>
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mood summary (if included) */}
          {includeMoodData && reportData.avgMood > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-yellow-500" />
                  Datos de animo del equipo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-center p-4 bg-accent/40 rounded-xl">
                    <p className="text-3xl font-bold">
                      {reportData.avgMood}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Promedio /5
                    </p>
                    <p className="text-xs mt-0.5">
                      {MOOD_LABELS[Math.round(reportData.avgMood)] ?? ""}
                    </p>
                  </div>
                  <div className="flex-1">
                    <div className="w-full bg-muted/30 rounded-full h-3 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          reportData.avgMood >= 4
                            ? "bg-emerald-500"
                            : reportData.avgMood >= 3
                              ? "bg-yellow-500"
                              : "bg-red-500",
                        )}
                        style={{
                          width: `${(reportData.avgMood / 5) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px] text-muted-foreground">
                        Muy mal
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        Excelente
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Empty state (no report generated yet) */}
      {!reportData && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              Configura los filtros y presiona &quot;Generar reporte&quot; para
              ver la vista previa
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
