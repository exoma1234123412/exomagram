"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import {
  FileText,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Shield,
  Users,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface ReviewData {
  employee_name: string;
  period: string;
  executive_summary: string;
  key_metrics: {
    total_hours: number;
    evidence_percent: number;
    deep_work_percent: number;
    consistency_score: number;
    late_percent: number;
  };
  strengths: Array<{ title: string; evidence: string }>;
  areas_for_improvement: Array<{
    title: string;
    evidence: string;
    recommendation: string;
  }>;
  peer_perception: {
    shoutouts_received: number;
    suspicious_flags: number;
    verified_by_peers: number;
    summary: string;
  };
  reliability_score: {
    promises_kept: number;
    promises_broken: number;
    ratio_percent: number;
    verdict: string;
  };
  trajectory: {
    direction: "improving" | "declining" | "stable";
    evidence: string;
    risk_level: "low" | "medium" | "high";
  };
  recommendation: "promote" | "maintain" | "concern" | "warning";
  recommendation_detail: string;
  goals_next_quarter: Array<{
    goal: string;
    metric: string;
    target: string;
  }>;
}

const RECOMMENDATION_STYLE: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  promote: {
    label: "Promover",
    color: "text-green-700 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/30",
  },
  maintain: {
    label: "Mantener",
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  concern: {
    label: "Preocupación",
    color: "text-yellow-700 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
  },
  warning: {
    label: "Advertencia",
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
};

export default function ReviewPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!orgId) return;
    async function loadMembers() {
      const { data: memberData } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId!);
      setMembers(
        (memberData ?? [])
          .map((md) => md.profiles)
          .filter((p): p is Profile => p !== null)
      );
    }
    loadMembers();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generateReview(userId: string) {
    if (!orgId) return;
    setSelectedUser(userId);
    setLoading(true);
    setReview(null);
    setError(null);

    try {
      const res = await fetch("/api/claude-performance-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          user_id: userId,
          period: "quarter",
        }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else if (json.review && typeof json.review === "object") {
        setReview(json.review as ReviewData);
      } else {
        setError("No se pudo generar la evaluación.");
      }
    } catch {
      setError("Error de conexión.");
    }
    setLoading(false);
  }

  const recStyle = review
    ? RECOMMENDATION_STYLE[review.recommendation] ??
      RECOMMENDATION_STYLE.maintain
    : null;
  const TrajIcon =
    review?.trajectory?.direction === "improving"
      ? TrendingUp
      : review?.trajectory?.direction === "declining"
        ? TrendingDown
        : Minus;
  const trajColor =
    review?.trajectory?.direction === "improving"
      ? "text-green-600"
      : review?.trajectory?.direction === "declining"
        ? "text-red-600"
        : "text-muted-foreground";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" />
          Auto Performance Review
        </h1>
        <p className="text-muted-foreground text-sm">
          Evaluación de desempeño generada por Claude con datos reales. Selecciona
          a una persona.
        </p>
      </div>

      {/* Member selector */}
      <div className="flex flex-wrap gap-3 mb-8">
        {members.map((m) => (
          <Button
            key={m.id}
            variant={selectedUser === m.id ? "default" : "outline"}
            onClick={() => generateReview(m.id)}
            disabled={loading}
            className="gap-2 rounded-xl"
          >
            <Avatar className="w-6 h-6">
              <AvatarImage src={m.avatar_url ?? undefined} />
              <AvatarFallback className="text-[9px]">
                {getInitials(m.full_name)}
              </AvatarFallback>
            </Avatar>
            {m.full_name}
          </Button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative">
            <FileText className="w-12 h-12 text-primary animate-pulse" />
            <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-primary/30 animate-ping" />
          </div>
          <p className="text-sm text-muted-foreground">
            Claude está generando la evaluación de desempeño...
          </p>
          <p className="text-xs text-muted-foreground/50">
            Esto toma 20-40 segundos
          </p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Review document */}
      {review && recStyle && !loading && (
        <div className="space-y-6">
          {/* Header */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Evaluación de desempeño
                  </p>
                  <h2 className="text-2xl font-bold mt-1">
                    {review.employee_name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {review.period}
                  </p>
                </div>
                <Badge
                  className={cn(
                    "text-sm font-bold px-4 py-1.5 border",
                    recStyle.bg,
                    recStyle.color
                  )}
                >
                  {recStyle.label}
                </Badge>
              </div>

              {/* Executive summary */}
              <div className="bg-accent/40 rounded-xl p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
                  Resumen ejecutivo
                </p>
                <p className="text-sm leading-relaxed">
                  {review.executive_summary}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Key metrics */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Métricas clave
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums">
                    {review.key_metrics.total_hours}h
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Total horas
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      review.key_metrics.evidence_percent >= 80
                        ? "text-green-600"
                        : review.key_metrics.evidence_percent >= 50
                          ? "text-yellow-600"
                          : "text-red-600"
                    )}
                  >
                    {review.key_metrics.evidence_percent}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Evidencia
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums">
                    {review.key_metrics.deep_work_percent}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Deep Work
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums">
                    {review.key_metrics.consistency_score}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Consistencia
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      review.key_metrics.late_percent <= 10
                        ? "text-green-600"
                        : "text-orange-600"
                    )}
                  >
                    {review.key_metrics.late_percent}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Tardías
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Strengths */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 border-green-200/50 dark:border-green-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-green-600">
                <ArrowUpRight className="w-4 h-4" />
                Fortalezas
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {(review.strengths ?? []).map((s, i) => (
                  <div
                    key={i}
                    className="p-3 bg-green-500/5 rounded-xl border border-green-500/10"
                  >
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {s.evidence}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Areas for improvement */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 border-orange-200/50 dark:border-orange-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-600">
                <ArrowDownRight className="w-4 h-4" />
                Áreas de mejora
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {(review.areas_for_improvement ?? []).map((a, i) => (
                  <div
                    key={i}
                    className="p-3 bg-orange-500/5 rounded-xl border border-orange-500/10"
                  >
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {a.evidence}
                    </p>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-medium">
                      Recomendación: {a.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Peer perception */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Percepción del equipo
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums text-green-600">
                    {review.peer_perception.shoutouts_received}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Shoutouts
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums text-red-500">
                    {review.peer_perception.suspicious_flags}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Sospechoso
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums text-blue-600">
                    {review.peer_perception.verified_by_peers}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Verificado
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {review.peer_perception.summary}
              </p>
            </CardContent>
          </Card>

          {/* Reliability */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Reliability Score
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums text-green-600">
                    {review.reliability_score.promises_kept}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Cumplidas
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p className="text-2xl font-bold tabular-nums text-red-500">
                    {review.reliability_score.promises_broken}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Rotas
                  </p>
                </div>
                <div className="text-center p-3 bg-accent/40 rounded-xl">
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      review.reliability_score.ratio_percent >= 80
                        ? "text-green-600"
                        : review.reliability_score.ratio_percent >= 50
                          ? "text-yellow-600"
                          : "text-red-600"
                    )}
                  >
                    {review.reliability_score.ratio_percent}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Ratio
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {review.reliability_score.verdict}
              </p>
            </CardContent>
          </Card>

          {/* Trajectory */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrajIcon className={cn("w-4 h-4", trajColor)} />
                Trayectoria
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-3 mb-2">
                <Badge
                  className={cn(
                    "text-xs border",
                    review.trajectory.direction === "improving"
                      ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800"
                      : review.trajectory.direction === "declining"
                        ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800"
                        : "bg-accent text-muted-foreground border-border"
                  )}
                >
                  {review.trajectory.direction === "improving"
                    ? "Mejorando"
                    : review.trajectory.direction === "declining"
                      ? "Declinando"
                      : "Estable"}
                </Badge>
                <Badge
                  className={cn(
                    "text-xs border",
                    review.trajectory.risk_level === "low"
                      ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800"
                      : review.trajectory.risk_level === "high"
                        ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800"
                        : "bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800"
                  )}
                >
                  Riesgo{" "}
                  {review.trajectory.risk_level === "low"
                    ? "bajo"
                    : review.trajectory.risk_level === "high"
                      ? "alto"
                      : "medio"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {review.trajectory.evidence}
              </p>
            </CardContent>
          </Card>

          {/* Recommendation */}
          <Card
            className={cn(
              "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 border-2",
              review.recommendation === "promote"
                ? "border-green-300 dark:border-green-800"
                : review.recommendation === "warning"
                  ? "border-red-300 dark:border-red-800"
                  : review.recommendation === "concern"
                    ? "border-yellow-300 dark:border-yellow-800"
                    : "border-border"
            )}
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                {review.recommendation === "promote" ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : review.recommendation === "warning" ? (
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                ) : (
                  <Shield className="w-5 h-5 text-primary" />
                )}
                <p className="text-sm font-semibold uppercase tracking-wider">
                  Recomendación
                </p>
              </div>
              <p
                className={cn(
                  "text-xl font-bold mb-2",
                  recStyle.color
                )}
              >
                {recStyle.label}
              </p>
              <p className="text-sm text-muted-foreground">
                {review.recommendation_detail}
              </p>
            </CardContent>
          </Card>

          {/* Goals for next quarter */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Objetivos para el próximo trimestre
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {(review.goals_next_quarter ?? []).map((g, i) => (
                  <div
                    key={i}
                    className="p-3 bg-accent/40 rounded-xl"
                  >
                    <p className="text-sm font-medium">{g.goal}</p>
                    <div className="flex items-center gap-4 mt-1">
                      <p className="text-xs text-muted-foreground">
                        Métrica: {g.metric}
                      </p>
                      <p className="text-xs font-medium text-primary">
                        Objetivo: {g.target}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!loading && !review && !error && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Selecciona a una persona para generar su evaluación.
          </p>
        </div>
      )}
    </div>
  );
}
