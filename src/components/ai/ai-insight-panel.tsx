"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Brain, AlertTriangle, TrendingUp, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";

// =====================================================================
// AI INSIGHT PANEL — Reusable AI analysis component
// =====================================================================
//
// Drops into any page to show AI-generated insights for a given context.
// Fetches ai_daily_insights, ai_reviews, and AI-generated feed items.
//
// Usage:
//   <AiInsightPanel orgId={orgId} context="dashboard" />
//   <AiInsightPanel orgId={orgId} context="member" userId="xxx" compact />

interface AiInsightPanelProps {
  orgId: string;
  context: "dashboard" | "analytics" | "member" | "team" | "health" | "focus";
  userId?: string;
  date?: string;
  compact?: boolean;
}

interface InsightData {
  id: string;
  user_id: string;
  date: string;
  insight: Record<string, unknown>;
  predictive: Record<string, unknown> | null;
  recommendation: string | null;
  created_at: string;
}

interface ReviewData {
  id: string;
  date: string;
  review_type: string;
  summary: string;
  trust_impact: number;
  user_id: string | null;
  created_at: string;
}

interface FeedItem {
  id: string;
  type: string;
  title: string;
  body: string;
  urgency: string;
  target_user_id: string | null;
  created_at: string;
}

type FreshnessStatus = "active" | "stale" | "none";

function getFreshness(createdAt: string | null): FreshnessStatus {
  if (!createdAt) return "none";
  const diffHours = (Date.now() - new Date(createdAt).getTime()) / 1000 / 60 / 60;
  if (diffHours < 12) return "active";
  if (diffHours < 48) return "stale";
  return "none";
}

const FRESHNESS_COLORS: Record<FreshnessStatus, string> = {
  active: "text-green-500",
  stale: "text-amber-500",
  none: "text-red-500",
};

const FRESHNESS_LABELS: Record<FreshnessStatus, string> = {
  active: "Datos recientes",
  stale: "Datos de hace >12h",
  none: "Sin datos",
};

export function AiInsightPanel({
  orgId,
  context,
  userId,
  date,
  compact = false,
}: AiInsightPanelProps) {
  const [insights, setInsights] = useState<InsightData[]>([]);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Build queries in parallel
    const insightQuery = supabase
      .from("ai_daily_insights")
      .select("id, user_id, date, insight, predictive, recommendation, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (userId) insightQuery.eq("user_id", userId);
    if (date) insightQuery.eq("date", date);

    const reviewQuery = supabase
      .from("ai_reviews")
      .select("id, date, review_type, summary, trust_impact, user_id, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (userId) reviewQuery.eq("user_id", userId);

    const feedQuery = supabase
      .from("public_feed")
      .select("id, type, title, body, urgency, target_user_id, created_at")
      .eq("org_id", orgId)
      .eq("is_ai_generated", true)
      .order("created_at", { ascending: false })
      .limit(5);

    const [insightRes, reviewRes, feedRes] = await Promise.all([
      insightQuery,
      reviewQuery,
      feedQuery,
    ]);

    setInsights((insightRes.data as InsightData[]) ?? []);
    setReviews((reviewRes.data as ReviewData[]) ?? []);
    setFeedItems((feedRes.data as FeedItem[]) ?? []);
    setLoading(false);
  }, [orgId, userId, date, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function requestAnalysis() {
    setRequesting(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      await fetch("/api/ai/executive-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          start_date: today,
          end_date: today,
          report_type: "daily",
          focus: userId ? "individual" : "team",
          user_id: userId,
        }),
      });
      // Refetch after analysis
      await fetchData();
    } catch {
      // Silent fail
    }
    setRequesting(false);
  }

  const latestInsight = insights[0] ?? null;
  const freshness = getFreshness(latestInsight?.created_at ?? null);

  // Extract risk signals from predictive data
  const burnoutRisk = (latestInsight?.predictive as Record<string, unknown>)?.burnout_risk as string | undefined;
  const disengagementRisk = (latestInsight?.predictive as Record<string, unknown>)?.disengagement_risk as string | undefined;

  // Extract insight text
  const insightText =
    (latestInsight?.insight as Record<string, unknown>)?.summary as string ??
    (latestInsight?.insight as Record<string, unknown>)?.text as string ??
    latestInsight?.recommendation ??
    null;

  if (loading) {
    return (
      <div className={cn("border border-border p-4 glow-line-top", compact && "p-3")}>
        <div className="animate-pulse font-mono text-xs tracking-widest uppercase text-muted-foreground">
          Cargando AI...
        </div>
      </div>
    );
  }

  // ----- Compact mode -----
  if (compact) {
    return (
      <div className="border border-border p-3 glow-line-top">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            INTELIGENCIA AI
          </span>
          <span className={cn("status-dot status-dot-active", FRESHNESS_COLORS[freshness])} />
        </div>

        {insightText ? (
          <p className="text-sm font-mono border-l-2 border-primary pl-3 text-foreground line-clamp-2">
            {insightText}
          </p>
        ) : (
          <p className="text-xs font-mono text-muted-foreground">Sin insights disponibles</p>
        )}

        {(burnoutRisk || disengagementRisk) && (
          <div className="flex gap-1.5 mt-2">
            {burnoutRisk && burnoutRisk !== "low" && (
              <Badge variant="destructive" className="text-[9px] font-mono">
                <AlertTriangle className="w-2.5 h-2.5" />
                Burnout: {burnoutRisk}
              </Badge>
            )}
            {disengagementRisk && disengagementRisk !== "low" && (
              <Badge variant="outline" className="text-[9px] font-mono">
                Desenganche: {disengagementRisk}
              </Badge>
            )}
          </div>
        )}
      </div>
    );
  }

  // ----- Full mode -----
  return (
    <div className="border border-border p-4 glow-line-top">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            INTELIGENCIA AI
          </span>
          <span
            className={cn("status-dot status-dot-active", FRESHNESS_COLORS[freshness])}
            title={FRESHNESS_LABELS[freshness]}
          />
        </div>
        <Button
          variant="outline"
          size="xs"
          className="font-mono text-[10px]"
          onClick={requestAnalysis}
          disabled={requesting}
        >
          {requesting ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          Pedir analisis
        </Button>
      </div>

      {/* Latest insight */}
      {insightText ? (
        <div className="mb-4">
          <p className="text-sm font-mono border-l-2 border-primary pl-3 text-foreground">
            {insightText}
          </p>
          {latestInsight && (
            <p className="text-[10px] font-mono text-muted-foreground mt-1 pl-3">
              {timeAgo(latestInsight.created_at)}
            </p>
          )}
        </div>
      ) : (
        <div className="mb-4 p-3 bg-accent/30 border border-border">
          <p className="text-xs font-mono text-muted-foreground">
            Sin insights disponibles para este contexto. Solicita un analisis.
          </p>
        </div>
      )}

      {/* Risk indicators */}
      {(burnoutRisk || disengagementRisk) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {burnoutRisk && (
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 border text-[10px] font-mono",
              burnoutRisk === "critical" || burnoutRisk === "high"
                ? "border-red-500/30 text-red-600 dark:text-red-400"
                : burnoutRisk === "medium"
                ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                : "border-border text-muted-foreground"
            )}>
              <AlertTriangle className="w-3 h-3" />
              Burnout: {burnoutRisk}
            </div>
          )}
          {disengagementRisk && (
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 border text-[10px] font-mono",
              disengagementRisk === "critical" || disengagementRisk === "high"
                ? "border-red-500/30 text-red-600 dark:text-red-400"
                : disengagementRisk === "medium"
                ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                : "border-border text-muted-foreground"
            )}>
              <TrendingUp className="w-3 h-3" />
              Desenganche: {disengagementRisk}
            </div>
          )}
        </div>
      )}

      {/* Latest recommendation */}
      {latestInsight?.recommendation && latestInsight.recommendation !== insightText && (
        <div className="mb-4 p-3 bg-primary/5 border border-primary/10">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-primary mb-1">
            RECOMENDACION
          </p>
          <p className="text-xs font-mono text-foreground">{latestInsight.recommendation}</p>
        </div>
      )}

      {/* Recent AI reviews */}
      {reviews.length > 0 && (
        <div className="mb-4">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
            REVISIONES RECIENTES
          </p>
          <div className="space-y-1.5">
            {reviews.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-foreground truncate flex-1">{r.summary}</span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className={cn(
                    "font-mono tabular-nums",
                    r.trust_impact > 0 ? "text-green-600 dark:text-green-400" :
                    r.trust_impact < 0 ? "text-red-600 dark:text-red-400" :
                    "text-muted-foreground"
                  )}>
                    {r.trust_impact > 0 ? "+" : ""}{r.trust_impact}
                  </span>
                  <span className="text-muted-foreground">{timeAgo(r.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent AI feed items */}
      {feedItems.length > 0 && (
        <div>
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
            ACTIVIDAD AI RECIENTE
          </p>
          <div className="space-y-1.5">
            {feedItems.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-start gap-2 text-[11px] font-mono">
                <Badge variant="outline" className="text-[8px] font-mono shrink-0 mt-0.5">
                  {item.type.replace("_", " ").toUpperCase()}
                </Badge>
                <span className="text-foreground truncate">{item.title}</span>
                <span className="text-muted-foreground shrink-0">{timeAgo(item.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confidence indicator */}
      {latestInsight && (
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            CONTEXTO: {context.toUpperCase()}
          </span>
          <span className={cn("status-dot", FRESHNESS_COLORS[freshness])} />
        </div>
      )}
    </div>
  );
}
