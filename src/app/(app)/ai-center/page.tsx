"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Zap,
  Activity,
  AlertTriangle,
  TrendingUp,
  Users,
  Heart,
  Target,
  Shield,
  RefreshCw,
  Clock,
  Sparkles,
  FileText,
  BarChart3,
  Cpu,
  Eye,
  GitBranch,
  Download,
} from "lucide-react";

// =====================================================================
// AI COMMAND CENTER
// =====================================================================
// Central hub for all AI systems. Shows status, recent insights,
// on-demand analysis triggers, AI consciousness stream, work profiles,
// processing history, and stats.

interface MemberProfile {
  user_id: string;
  full_name: string;
  profile_data: Record<string, unknown>;
  last_updated: string | null;
}

interface InsightRow {
  id: string;
  user_id: string;
  date: string;
  insight: Record<string, unknown>;
  predictive: Record<string, unknown> | null;
  relationships: Record<string, unknown> | null;
  recommendation: string | null;
  created_at: string;
}

interface ReviewRow {
  id: string;
  org_id: string;
  date: string;
  user_id: string | null;
  review_type: string;
  findings: Record<string, unknown>;
  summary: string;
  trust_impact: number;
  created_at: string;
}

interface FeedRow {
  id: string;
  type: string;
  title: string;
  body: string;
  urgency: string;
  target_user_id: string | null;
  is_ai_generated: boolean;
  created_at: string;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
}

// Grade colors for team briefing
const GRADE_COLORS: Record<string, string> = {
  A: "text-green-600 dark:text-green-400",
  B: "text-green-600 dark:text-green-400",
  C: "text-amber-600 dark:text-amber-400",
  D: "text-red-600 dark:text-red-400",
  F: "text-red-600 dark:text-red-400",
};

const GRADE_BG: Record<string, string> = {
  A: "bg-green-500/10",
  B: "bg-green-500/10",
  C: "bg-amber-500/10",
  D: "bg-red-500/10",
  F: "bg-red-500/10",
};

// Analysis button definitions
const ANALYSIS_BUTTONS = [
  {
    key: "daily_report",
    title: "Reporte Ejecutivo",
    description: "Narrativa del dia actual con datos reales",
    icon: FileText,
    endpoint: "/api/ai/executive-report",
    body: (orgId: string) => {
      const today = new Date().toISOString().split("T")[0];
      return { org_id: orgId, start_date: today, end_date: today, report_type: "daily", focus: "team" };
    },
  },
  {
    key: "weekly_report",
    title: "Reporte Semanal",
    description: "Resumen ejecutivo de los ultimos 7 dias",
    icon: BarChart3,
    endpoint: "/api/ai/executive-report",
    body: (orgId: string) => {
      const end = new Date().toISOString().split("T")[0];
      const start = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      return { org_id: orgId, start_date: start, end_date: end, report_type: "weekly", focus: "team" };
    },
  },
  {
    key: "health_productivity",
    title: "Salud <> Productividad",
    description: "Correlaciones entre salud y rendimiento",
    icon: Heart,
    endpoint: "/api/ai/deep-analysis",
    body: (orgId: string) => ({ org_id: orgId, analysis_type: "health_productivity" }),
  },
  {
    key: "focus_quality",
    title: "Calidad de Enfoque",
    description: "Analisis de sesiones de enfoque y flow",
    icon: Target,
    endpoint: "/api/ai/deep-analysis",
    body: (orgId: string) => ({ org_id: orgId, analysis_type: "focus_quality" }),
  },
  {
    key: "team_dynamics",
    title: "Dinamica de Equipo",
    description: "Interacciones, colaboracion, y dinamicas",
    icon: Users,
    endpoint: "/api/ai/deep-analysis",
    body: (orgId: string) => ({ org_id: orgId, analysis_type: "team_dynamics" }),
  },
  {
    key: "burnout_risk",
    title: "Riesgo de Burnout",
    description: "Deteccion temprana de agotamiento",
    icon: AlertTriangle,
    endpoint: "/api/ai/deep-analysis",
    body: (orgId: string) => ({ org_id: orgId, analysis_type: "burnout_risk" }),
  },
  {
    key: "optimal_schedule",
    title: "Horario Optimo",
    description: "Cuando trabaja mejor cada persona",
    icon: Clock,
    endpoint: "/api/ai/deep-analysis",
    body: (orgId: string) => ({ org_id: orgId, analysis_type: "optimal_schedule" }),
  },
  {
    key: "enrich",
    title: "Enriquecer Datos",
    description: "Completar campos faltantes con AI",
    icon: Sparkles,
    endpoint: "/api/ai/enrich",
    body: (orgId: string) => ({ org_id: orgId }),
  },
  {
    key: "claude_audit",
    title: "Auditoria Claude",
    description: "Auditoria completa del equipo hoy",
    icon: Shield,
    endpoint: null as string | null,
    body: (orgId: string) => ({ org_id: orgId }),
  },
];

export default function AiCenterPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();

  // Data state
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [feedItems, setFeedItems] = useState<FeedRow[]>([]);
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [entryCountToday, setEntryCountToday] = useState(0);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  // Analysis state
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null);
  const [analysisType, setAnalysisType] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Expanded review
  const [expandedReview, setExpandedReview] = useState<string | null>(null);

  // Stats
  const [totalReviews, setTotalReviews] = useState(0);
  const [totalAiInsightsWithRisk, setTotalAiInsightsWithRisk] = useState(0);
  const [profilesUpdatedThisWeek, setProfilesUpdatedThisWeek] = useState(0);
  const [feedItemsThisMonth, setFeedItemsThisMonth] = useState(0);
  const [enrichmentRate, setEnrichmentRate] = useState(0);

  const supabase = createClient();

  const fetchAllData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    const [
      insightsRes,
      reviewsRes,
      feedRes,
      profilesRes,
      notificationsRes,
      entryCountRes,
      membersRes,
      // Stats queries
      totalReviewsRes,
      profilesWeekRes,
      feedMonthRes,
      entriesWithOutputRes,
      entriesTotalRes,
    ] = await Promise.all([
      // 1. Latest insights
      supabase
        .from("ai_daily_insights")
        .select("id, user_id, date, insight, predictive, relationships, recommendation, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(20),
      // 2. Latest reviews
      supabase
        .from("ai_reviews")
        .select("id, org_id, date, user_id, review_type, findings, summary, trust_impact, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10),
      // 3. AI feed items
      supabase
        .from("public_feed")
        .select("id, type, title, body, urgency, target_user_id, is_ai_generated, created_at")
        .eq("org_id", orgId)
        .eq("is_ai_generated", true)
        .order("created_at", { ascending: false })
        .limit(20),
      // 4. AI work profiles
      supabase
        .from("ai_work_profiles")
        .select("id, user_id, profile_data, last_updated, created_at")
        .eq("org_id", orgId),
      // 5. AI notifications
      supabase
        .from("notifications")
        .select("id, user_id, type, title, body, created_at")
        .eq("org_id", orgId)
        .like("type", "%ai%")
        .order("created_at", { ascending: false })
        .limit(10),
      // 6. Entries today
      supabase
        .from("time_entries")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("date", today),
      // Members for name resolution
      supabase
        .from("org_members")
        .select("user_id, profiles(full_name)")
        .eq("org_id", orgId),
      // Stats: total reviews all time
      supabase
        .from("ai_reviews")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId),
      // Stats: profiles updated this week
      supabase
        .from("ai_work_profiles")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .gte("last_updated", weekAgo),
      // Stats: feed items this month
      supabase
        .from("public_feed")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("is_ai_generated", true)
        .gte("created_at", `${monthAgo}T00:00:00`),
      // Stats: entries with output_type
      supabase
        .from("time_entries")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .not("output_type", "is", null)
        .neq("output_type", "none"),
      // Stats: total entries
      supabase
        .from("time_entries")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId),
    ]);

    // Build name map
    const nm = new Map<string, string>();
    for (const m of membersRes.data ?? []) {
      const p = m.profiles as unknown as { full_name: string } | null;
      nm.set(m.user_id, p?.full_name ?? "Desconocido");
    }
    setNameMap(nm);

    setInsights((insightsRes.data as InsightRow[]) ?? []);
    setReviews((reviewsRes.data as ReviewRow[]) ?? []);
    setFeedItems((feedRes.data as FeedRow[]) ?? []);
    setNotifications((notificationsRes.data as NotificationRow[]) ?? []);
    setEntryCountToday(entryCountRes.count ?? 0);

    // Map profiles with names
    const rawProfiles = (profilesRes.data ?? []) as Array<{
      user_id: string;
      profile_data: Record<string, unknown>;
      last_updated: string | null;
    }>;
    setProfiles(
      rawProfiles.map((p) => ({
        user_id: p.user_id,
        full_name: nm.get(p.user_id) ?? "Desconocido",
        profile_data: p.profile_data ?? {},
        last_updated: p.last_updated,
      }))
    );

    // Stats
    setTotalReviews(totalReviewsRes.count ?? 0);
    setTotalAiInsightsWithRisk(
      ((insightsRes.data as InsightRow[]) ?? []).filter(
        (i) => i.predictive && Object.keys(i.predictive).length > 0
      ).length
    );
    setProfilesUpdatedThisWeek(profilesWeekRes.count ?? 0);
    setFeedItemsThisMonth(feedMonthRes.count ?? 0);

    const totalEntries = entriesTotalRes.count ?? 0;
    const enrichedEntries = entriesWithOutputRes.count ?? 0;
    setEnrichmentRate(totalEntries > 0 ? Math.round((enrichedEntries / totalEntries) * 100) : 0);

    setLoading(false);
  }, [orgId, supabase]);

  useEffect(() => {
    if (!orgLoading && orgId) fetchAllData();
  }, [orgLoading, orgId, fetchAllData]);

  // Run on-demand analysis
  async function runAnalysis(btn: (typeof ANALYSIS_BUTTONS)[number]) {
    if (!orgId) return;
    setRunningKey(btn.key);
    setAnalysisResult(null);
    setAnalysisType(btn.key);
    setAnalysisError(null);

    try {
      const endpoint = btn.key === "claude_audit"
        ? `/api/claude-audit?org_id=${orgId}`
        : btn.endpoint!;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(btn.body(orgId)),
      });

      const json = await res.json();
      if (json.error) {
        setAnalysisError(json.error);
      } else {
        setAnalysisResult(json);
      }
    } catch {
      setAnalysisError("Error de conexion con el servidor");
    }
    setRunningKey(null);
  }

  // Helpers
  function getName(uid: string | null): string {
    if (!uid) return "Equipo";
    return nameMap.get(uid) ?? "Desconocido";
  }

  function getProfileFreshness(lastUpdated: string | null): "green" | "amber" | "red" {
    if (!lastUpdated) return "red";
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    if (lastUpdated >= today) return "green";
    if (lastUpdated >= weekAgo) return "amber";
    return "red";
  }

  // Compute AI activity today
  const todayStr = new Date().toISOString().split("T")[0];
  const aiActivityToday =
    feedItems.filter((f) => f.created_at.startsWith(todayStr)).length +
    notifications.filter((n) => n.created_at.startsWith(todayStr)).length +
    reviews.filter((r) => r.created_at.startsWith(todayStr)).length;

  const lastAnalysisTime = reviews[0]?.created_at ?? insights[0]?.created_at ?? null;
  const isClaudeActive = aiActivityToday > 0 || (lastAnalysisTime && (Date.now() - new Date(lastAnalysisTime).getTime()) < 12 * 3600000);

  // Loading state
  if (loading || orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <Brain className="w-8 h-8 text-primary animate-pulse" />
          <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
            Cargando...
          </div>
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="font-mono text-sm text-muted-foreground">Sin organizacion</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          CENTRO DE INTELIGENCIA AI
        </h1>
        <p className="text-xs font-mono text-muted-foreground mt-1">
          Todos los sistemas AI del equipo en un solo lugar
        </p>
      </div>

      {/* ============================================================ */}
      {/* 1. AI STATUS PANEL */}
      {/* ============================================================ */}
      <div className="corner-marks bg-grid-palantir border border-border p-6 mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Brain className={cn(
                "w-10 h-10 text-primary",
                isClaudeActive && "animate-pulse"
              )} />
              {isClaudeActive && (
                <span className="absolute -top-0.5 -right-0.5 status-dot status-dot-active text-green-500 bg-green-500" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold uppercase tracking-tight">
                  {isClaudeActive ? "CLAUDE ACTIVO" : "CLAUDE EN ESPERA"}
                </span>
                <span className={cn(
                  "status-dot status-dot-active",
                  isClaudeActive ? "text-green-500 bg-green-500" : "text-amber-500 bg-amber-500"
                )} />
              </div>
              {lastAnalysisTime && (
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                  Ultimo analisis: {timeAgo(lastAnalysisTime)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">MODELOS</p>
              <p className="font-mono text-[10px] text-foreground">Sonnet 4-6 (Analisis) / Haiku 4-5 (Reacciones)</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">INTERACCIONES HOY</p>
              <p className="font-mono text-lg font-bold tabular-nums tracking-tight text-foreground">{aiActivityToday}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">ENTRADAS HOY</p>
              <p className="font-mono text-lg font-bold tabular-nums tracking-tight text-foreground">{entryCountToday}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. BRIEFING DEL EQUIPO */}
      {/* ============================================================ */}
      <div className="mb-8">
        <div className="palantir-divider text-muted-foreground mb-4">BRIEFING DEL EQUIPO</div>

        {insights.length > 0 ? (
          <div className="space-y-2">
            {/* Deduplicate by user - show latest per person */}
            {Array.from(
              insights.reduce((map, i) => {
                if (!map.has(i.user_id)) map.set(i.user_id, i);
                return map;
              }, new Map<string, InsightRow>())
            ).map(([uid, insight]) => {
              const grade = (insight.insight as Record<string, unknown>)?.grade as string ?? "?";
              const keyInsight = (insight.insight as Record<string, unknown>)?.summary as string ??
                (insight.insight as Record<string, unknown>)?.key_insight as string ?? "";
              const burnout = (insight.predictive as Record<string, unknown>)?.burnout_risk as string;
              const trajectory = (insight.predictive as Record<string, unknown>)?.trust_trajectory as string;

              return (
                <div key={uid} className="border border-border p-3 flex items-center gap-3">
                  {/* Grade badge */}
                  <div className={cn(
                    "w-10 h-10 flex items-center justify-center font-mono font-black text-lg shrink-0",
                    GRADE_BG[grade] ?? "bg-accent/30",
                    GRADE_COLORS[grade] ?? "text-muted-foreground"
                  )}>
                    {grade}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold truncate">{getName(uid)}</span>
                      {trajectory && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {trajectory === "up" ? "^" : trajectory === "down" ? "v" : "="}
                        </span>
                      )}
                    </div>
                    {keyInsight && (
                      <p className="text-[11px] font-mono text-muted-foreground truncate">{keyInsight}</p>
                    )}
                  </div>

                  {/* Risk badges */}
                  <div className="flex gap-1.5 shrink-0">
                    {burnout && burnout !== "low" && (
                      <Badge
                        variant={burnout === "high" || burnout === "critical" ? "destructive" : "outline"}
                        className="text-[8px] font-mono"
                      >
                        {burnout === "critical" ? "CRIT" : burnout.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-border p-6 flex flex-col items-center gap-2">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <Brain className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">Sin insights generados aun</p>
            <p className="font-mono text-[10px] text-muted-foreground">Ejecuta un analisis para generar datos</p>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 3. ANALISIS ON-DEMAND */}
      {/* ============================================================ */}
      <div className="mb-8">
        <div className="palantir-divider text-muted-foreground mb-4">ANALISIS ON-DEMAND</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ANALYSIS_BUTTONS.map((btn) => {
            const Icon = btn.icon;
            const isRunning = runningKey === btn.key;

            return (
              <button
                key={btn.key}
                onClick={() => runAnalysis(btn)}
                disabled={runningKey !== null}
                className={cn(
                  "border border-border p-4 text-left cursor-pointer transition-colors hover:border-primary/30",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  isRunning && "animate-border-pulse"
                )}
              >
                <div className="flex items-start gap-3">
                  {isRunning ? (
                    <RefreshCw className="w-4 h-4 text-primary animate-spin shrink-0 mt-0.5" />
                  ) : (
                    <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-mono text-xs font-bold uppercase">{btn.title}</p>
                    <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{btn.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Analysis results panel */}
        {(analysisResult || analysisError) && (
          <div className={cn(
            "mt-4 p-4 border",
            analysisError ? "border-destructive/30" : "border-primary/20"
          )}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                RESULTADO: {analysisType?.replace(/_/g, " ").toUpperCase()}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => { setAnalysisResult(null); setAnalysisError(null); setAnalysisType(null); }}
              >
                <span className="font-mono text-xs">X</span>
              </Button>
            </div>

            {analysisError && (
              <div className="bg-destructive/5 border border-destructive/20 p-3">
                <p className="font-mono text-xs text-destructive">{analysisError}</p>
              </div>
            )}

            {analysisResult && (
              <AnalysisResultDisplay data={analysisResult} type={analysisType} />
            )}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 4. FLUJO DE CONCIENCIA AI */}
      {/* ============================================================ */}
      <div className="mb-8">
        <div className="palantir-divider text-muted-foreground mb-4">FLUJO DE CONCIENCIA AI</div>

        <div className="border border-border overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            {(() => {
              // Merge all AI activity into a single chronological stream
              type StreamItem = {
                id: string;
                type: "feed" | "notification" | "review";
                label: string;
                content: string;
                target: string;
                timestamp: string;
              };

              const stream: StreamItem[] = [
                ...feedItems.map((f) => ({
                  id: `feed-${f.id}`,
                  type: "feed" as const,
                  label: f.type.replace(/_/g, " ").toUpperCase(),
                  content: f.title,
                  target: getName(f.target_user_id),
                  timestamp: f.created_at,
                })),
                ...notifications.map((n) => ({
                  id: `notif-${n.id}`,
                  type: "notification" as const,
                  label: n.type.toUpperCase(),
                  content: n.title,
                  target: getName(n.user_id),
                  timestamp: n.created_at,
                })),
                ...reviews.map((r) => ({
                  id: `review-${r.id}`,
                  type: "review" as const,
                  label: r.review_type.replace(/_/g, " ").toUpperCase(),
                  content: r.summary,
                  target: getName(r.user_id),
                  timestamp: r.created_at,
                })),
              ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

              if (stream.length === 0) {
                return (
                  <div className="p-6 flex flex-col items-center gap-2">
                    <div className="w-16 h-16 border border-border flex items-center justify-center">
                      <Activity className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">Sin actividad AI registrada</p>
                  </div>
                );
              }

              return stream.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-accent/20 transition-colors"
                >
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums w-10 shrink-0">
                    {timeAgo(item.timestamp)}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[7px] font-mono shrink-0 w-24 justify-center",
                      item.type === "feed" && "border-primary/30 text-primary",
                      item.type === "notification" && "border-amber-500/30 text-amber-600 dark:text-amber-400",
                      item.type === "review" && "border-green-500/30 text-green-600 dark:text-green-400",
                    )}
                  >
                    {item.label.length > 14 ? item.label.slice(0, 14) : item.label}
                  </Badge>
                  <span className="font-mono text-[11px] text-foreground truncate flex-1">
                    {item.content}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                    {item.target}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 5. PERFILES DE TRABAJO AI */}
      {/* ============================================================ */}
      <div className="mb-8">
        <div className="palantir-divider text-muted-foreground mb-4">PERFILES DE TRABAJO AI</div>

        {profiles.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {profiles.map((profile) => {
              const freshness = getProfileFreshness(profile.last_updated);
              const archetype = profile.profile_data?.archetype as string ?? profile.profile_data?.work_archetype as string;
              const chronotype = profile.profile_data?.chronotype as string;
              const strengths = profile.profile_data?.strengths as string[] ?? [];
              const risks = profile.profile_data?.risk_factors as string[] ?? profile.profile_data?.risks as string[] ?? [];

              return (
                <div key={profile.user_id} className="bg-accent/30 border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold truncate">{profile.full_name}</span>
                    <span className={cn(
                      "status-dot",
                      freshness === "green" ? "bg-green-500" :
                      freshness === "amber" ? "bg-amber-500" :
                      "bg-red-500"
                    )} />
                  </div>

                  {archetype && (
                    <p className="font-mono text-[10px] text-primary mb-1.5">{archetype}</p>
                  )}
                  {chronotype && (
                    <p className="font-mono text-[10px] text-muted-foreground mb-1.5">Cronotype: {chronotype}</p>
                  )}

                  {strengths.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {strengths.slice(0, 4).map((s, i) => (
                        <span key={i} className="font-mono text-[8px] px-1.5 py-0.5 border border-green-500/20 text-green-600 dark:text-green-400">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {risks.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {risks.slice(0, 3).map((r, i) => (
                        <span key={i} className="font-mono text-[8px] px-1.5 py-0.5 border border-red-500/20 text-red-600 dark:text-red-400">
                          {r}
                        </span>
                      ))}
                    </div>
                  )}

                  {!archetype && strengths.length === 0 && (
                    <p className="font-mono text-[10px] text-muted-foreground">Sin datos de perfil</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-border p-6 flex flex-col items-center gap-2">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <Cpu className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">Sin perfiles AI generados</p>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 6. PROCESAMIENTO HISTORICO */}
      {/* ============================================================ */}
      <div className="mb-8">
        <div className="palantir-divider text-muted-foreground mb-4">PROCESAMIENTO HISTORICO</div>

        {reviews.length > 0 ? (
          <div className="border border-border overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[80px_100px_100px_1fr_60px] gap-2 px-4 py-2 border-b border-border bg-accent/20">
              <span className="label-mono text-muted-foreground">FECHA</span>
              <span className="label-mono text-muted-foreground">TIPO</span>
              <span className="label-mono text-muted-foreground">PERSONA</span>
              <span className="label-mono text-muted-foreground">RESUMEN</span>
              <span className="label-mono text-muted-foreground text-right">TRUST</span>
            </div>

            {reviews.map((review) => (
              <div key={review.id}>
                <button
                  onClick={() => setExpandedReview(expandedReview === review.id ? null : review.id)}
                  className="w-full grid grid-cols-[80px_100px_100px_1fr_60px] gap-2 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-accent/20 transition-colors text-left cursor-pointer"
                >
                  <span className="data-cell text-foreground">{review.date}</span>
                  <span className="data-cell text-foreground">{review.review_type.replace(/_/g, " ")}</span>
                  <span className="data-cell text-foreground truncate">{getName(review.user_id)}</span>
                  <span className="data-cell text-foreground truncate">{review.summary}</span>
                  <span className={cn(
                    "data-cell text-right font-bold",
                    review.trust_impact > 0 ? "text-green-600 dark:text-green-400" :
                    review.trust_impact < 0 ? "text-red-600 dark:text-red-400" :
                    "text-muted-foreground"
                  )}>
                    {review.trust_impact > 0 ? "+" : ""}{review.trust_impact}
                  </span>
                </button>

                {/* Expanded findings */}
                {expandedReview === review.id && review.findings && (
                  <div className="px-4 py-3 bg-accent/10 border-b border-border">
                    <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
                      HALLAZGOS COMPLETOS
                    </p>
                    <pre className="font-mono text-[10px] text-foreground whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
                      {JSON.stringify(review.findings, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-border p-6 flex flex-col items-center gap-2">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <GitBranch className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">Sin procesamiento historico</p>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 7. ESTADISTICAS AI */}
      {/* ============================================================ */}
      <div className="mb-8">
        <div className="palantir-divider text-muted-foreground mb-4">ESTADISTICAS AI</div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatBox
            label="Analisis realizados"
            value={totalReviews}
            icon={<Eye className="w-3.5 h-3.5 text-primary" />}
          />
          <StatBox
            label="Alertas con riesgo"
            value={totalAiInsightsWithRisk}
            icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
          />
          <StatBox
            label="Perfiles actualizados"
            value={profilesUpdatedThisWeek}
            subtitle="esta semana"
            icon={<Cpu className="w-3.5 h-3.5 text-primary" />}
          />
          <StatBox
            label="Feed items AI"
            value={feedItemsThisMonth}
            subtitle="este mes"
            icon={<Zap className="w-3.5 h-3.5 text-primary" />}
          />
          <StatBox
            label="Tasa enriquecimiento"
            value={`${enrichmentRate}%`}
            icon={<Download className="w-3.5 h-3.5 text-primary" />}
          />
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// STAT BOX — Small stat display
// =====================================================================
function StatBox({
  label,
  value,
  subtitle,
  icon,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-accent/30 border border-border p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground truncate">
          {label}
        </span>
      </div>
      <p className="font-mono text-xl font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {subtitle && (
        <p className="font-mono text-[9px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

// =====================================================================
// ANALYSIS RESULT DISPLAY — Rich formatting for API responses
// =====================================================================
function AnalysisResultDisplay({
  data,
  type,
}: {
  data: Record<string, unknown>;
  type: string | null;
}) {
  // Executive report format
  if (type === "daily_report" || type === "weekly_report") {
    const report = (data.report ?? data) as Record<string, unknown>;
    const title = String(report.title ?? "");
    const execSummary = String(report.executive_summary ?? "");
    const perfNarrative = String(report.performance_narrative ?? "");
    const highlights = Array.isArray(report.highlights)
      ? (report.highlights as Array<{ type: string; text: string; person: string | null }>)
      : [];
    const correlations = Array.isArray(report.correlations_found)
      ? (report.correlations_found as Array<{ insight: string; confidence: string }>)
      : [];
    const recommendations = Array.isArray(report.recommendations)
      ? (report.recommendations as Array<{ priority: string; action: string; rationale: string }>)
      : [];
    const riskAssessment = report.risk_assessment as Record<string, unknown> | undefined;
    const aiConfidence = typeof report.ai_confidence === "number" ? report.ai_confidence : null;
    const dataQuality = typeof report.data_quality === "string" ? report.data_quality : null;

    return (
      <div className="space-y-4">
        {title && (
          <h3 className="font-mono text-sm font-bold uppercase">{title}</h3>
        )}

        {execSummary && (
          <div className="border-l-2 border-primary pl-3">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">RESUMEN EJECUTIVO</p>
            <p className="font-mono text-xs text-foreground">{execSummary}</p>
          </div>
        )}

        {perfNarrative && (
          <div>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">NARRATIVA DE RENDIMIENTO</p>
            <p className="font-mono text-xs text-foreground whitespace-pre-line">{perfNarrative}</p>
          </div>
        )}

        {highlights.length > 0 && (
          <div>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">PUNTOS CLAVE</p>
            <div className="space-y-1">
              {highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-2 font-mono text-[11px]">
                  <span className={cn(
                    "shrink-0 mt-0.5",
                    h.type === "positive" ? "text-green-600 dark:text-green-400" :
                    h.type === "negative" ? "text-red-600 dark:text-red-400" :
                    "text-muted-foreground"
                  )}>
                    {h.type === "positive" ? "+" : h.type === "negative" ? "-" : "="}
                  </span>
                  <span className="text-foreground">{h.text}</span>
                  {h.person && (
                    <span className="text-muted-foreground shrink-0">({h.person})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {riskAssessment && (
          <div>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">EVALUACION DE RIESGO</p>
            <RiskDisplay risk={riskAssessment} />
          </div>
        )}

        {correlations.length > 0 && (
          <div>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">CORRELACIONES</p>
            <div className="space-y-1">
              {correlations.map((c, i) => (
                <div key={i} className="flex items-start gap-2 font-mono text-[11px]">
                  <Badge variant="outline" className="text-[7px] font-mono shrink-0 mt-0.5">
                    {c.confidence}
                  </Badge>
                  <span className="text-foreground">{c.insight}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {recommendations.length > 0 && (
          <div>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">RECOMENDACIONES</p>
            <div className="space-y-1.5">
              {recommendations.map((r, i) => (
                <div key={i} className="border border-border p-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge
                      variant={r.priority === "high" ? "destructive" : "outline"}
                      className="text-[7px] font-mono"
                    >
                      {r.priority}
                    </Badge>
                    <span className="font-mono text-[11px] font-bold text-foreground">{r.action}</span>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">{r.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {aiConfidence != null && (
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              CONFIANZA AI
            </span>
            <span className="font-mono text-xs font-bold tabular-nums text-foreground">
              {aiConfidence}%
            </span>
            {dataQuality && (
              <>
                <span className="text-muted-foreground font-mono text-[10px]">/</span>
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                  CALIDAD: {dataQuality.toUpperCase()}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // Deep analysis or enrichment or audit — render as formatted JSON sections
  if (type === "enrich") {
    const enrichedVal = data.enriched_count ?? data.count ?? data.total;
    const enrichedStr = String(enrichedVal ?? "N/A");
    const errorsVal = data.errors;
    const errorsStr = errorsVal
      ? String(Array.isArray(errorsVal) ? errorsVal.length : errorsVal)
      : null;

    return (
      <div className="space-y-2">
        <p className="font-mono text-xs text-foreground">
          Entradas enriquecidas: <span className="font-bold tabular-nums">{enrichedStr}</span>
        </p>
        {errorsStr && (
          <p className="font-mono text-xs text-red-600 dark:text-red-400">
            Errores: {errorsStr}
          </p>
        )}
      </div>
    );
  }

  // Claude audit — render team verdict and people
  if (type === "claude_audit") {
    const teamVerdict = typeof data.team_verdict === "string" ? data.team_verdict : "";
    const teamScore = typeof data.team_score === "number" ? data.team_score : null;
    const people = Array.isArray(data.people)
      ? (data.people as Array<Record<string, unknown>>)
      : null;

    return (
      <div className="space-y-3">
        {teamVerdict && (
          <div className="border-l-2 border-primary pl-3">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">VEREDICTO</p>
            <p className="font-mono text-xs text-foreground">{teamVerdict}</p>
            {teamScore != null && (
              <p className="font-mono text-lg font-bold tabular-nums mt-1 text-foreground">{teamScore}/100</p>
            )}
          </div>
        )}
        {people && people.length > 0 && (
          <div className="space-y-2">
            {people.map((p, i) => {
              const grade = String(p.grade ?? "?");
              const name = String(p.name ?? "?");
              const verdict = typeof p.verdict === "string" ? p.verdict : "";
              return (
                <div key={i} className="border border-border p-2">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-mono text-sm font-black",
                      GRADE_COLORS[grade] ?? "text-muted-foreground"
                    )}>
                      {grade}
                    </span>
                    <span className="font-mono text-xs font-bold">{name}</span>
                  </div>
                  {verdict && (
                    <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{verdict}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!teamVerdict && !people && (
          <FallbackJsonDisplay data={data} />
        )}
      </div>
    );
  }

  // Generic deep analysis or unknown type
  return <FallbackJsonDisplay data={data} />;
}

// =====================================================================
// RISK DISPLAY — Burnout + disengagement risk
// =====================================================================
function RiskDisplay({ risk }: { risk: Record<string, unknown> }) {
  const burnoutRisks = risk.burnout_risk as Array<{ person: string; level: string; signals: string[] }> | undefined;
  const disengagementRisks = risk.disengagement_risk as Array<{ person: string; level: string; signals: string[] }> | undefined;
  const teamHealth = risk.team_health as string | undefined;

  return (
    <div className="space-y-2">
      {teamHealth && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">Salud del equipo:</span>
          <Badge
            variant={teamHealth === "critical" ? "destructive" : teamHealth === "concerning" ? "outline" : "secondary"}
            className="text-[8px] font-mono"
          >
            {teamHealth.toUpperCase()}
          </Badge>
        </div>
      )}
      {burnoutRisks && burnoutRisks.length > 0 && (
        <div className="space-y-1">
          {burnoutRisks
            .filter((r) => r.level !== "low")
            .map((r, i) => (
              <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
                <AlertTriangle className={cn(
                  "w-3 h-3",
                  r.level === "critical" || r.level === "high" ? "text-red-500" : "text-amber-500"
                )} />
                <span className="font-bold">{r.person}</span>
                <Badge variant="destructive" className="text-[7px]">{r.level}</Badge>
                <span className="text-muted-foreground truncate">{r.signals?.join(", ")}</span>
              </div>
            ))}
        </div>
      )}
      {disengagementRisks && disengagementRisks.length > 0 && (
        <div className="space-y-1">
          {disengagementRisks
            .filter((r) => r.level !== "low")
            .map((r, i) => (
              <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
                <TrendingUp className={cn(
                  "w-3 h-3",
                  r.level === "critical" || r.level === "high" ? "text-red-500" : "text-amber-500"
                )} />
                <span className="font-bold">{r.person}</span>
                <Badge variant="outline" className="text-[7px]">{r.level}</Badge>
                <span className="text-muted-foreground truncate">{r.signals?.join(", ")}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// FALLBACK JSON DISPLAY
// =====================================================================
function FallbackJsonDisplay({ data }: { data: Record<string, unknown> }) {
  // Try to extract meaningful sections from the JSON
  const sections = Object.entries(data).filter(
    ([key]) => !["success", "model", "period", "report_type", "focus"].includes(key)
  );

  if (sections.length === 0) {
    return <p className="font-mono text-xs text-muted-foreground">Sin datos en la respuesta</p>;
  }

  return (
    <div className="space-y-3">
      {sections.map(([key, value]) => {
        if (typeof value === "string") {
          return (
            <div key={key}>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
                {key.replace(/_/g, " ")}
              </p>
              <p className="font-mono text-xs text-foreground">{value}</p>
            </div>
          );
        }

        if (typeof value === "number") {
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                {key.replace(/_/g, " ")}:
              </span>
              <span className="font-mono text-sm font-bold tabular-nums text-foreground">{value}</span>
            </div>
          );
        }

        return (
          <div key={key}>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
              {key.replace(/_/g, " ")}
            </p>
            <pre className="font-mono text-[10px] text-foreground whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto bg-accent/20 border border-border p-2">
              {JSON.stringify(value, null, 2)}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
