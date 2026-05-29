"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  RefreshCw,
  AlertTriangle,
  TrendingDown,
  Users,
  Zap,
  Lock,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersonPrediction {
  name: string;
  resignation_risk: number;
  risk_level: "low" | "medium" | "high" | "critical";
  signals: string[];
  prediction: string;
  recommended_action: string;
}

interface PredictionResponse {
  success: boolean;
  model: string;
  analysis_date: string;
  predictions: PersonPrediction[];
  team_summary: string;
  highest_risk: string;
  immediate_actions: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RISK_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; barColor: string }
> = {
  low: {
    label: "Bajo",
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    barColor: "bg-green-500",
  },
  medium: {
    label: "Medio",
    color: "text-yellow-700 dark:text-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/30",
    barColor: "bg-yellow-500",
  },
  high: {
    label: "Alto",
    color: "text-orange-700 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    barColor: "bg-orange-500",
  },
  critical: {
    label: "Crítico",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    barColor: "bg-red-500",
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RetentionPage() {
  const { orgId, loading: orgLoading } = useOrg();

  const [data, setData] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!orgId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/claude-resign-predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Error en análisis");
        setLoading(false);
        return;
      }

      const result = (await res.json()) as PredictionResponse;
      setData(result);
    } catch {
      setError("Error de conexión");
    }

    setLoading(false);
  }

  // Sort predictions by risk (highest first)
  const sorted = data?.predictions
    ? [...data.predictions].sort(
        (a, b) => b.resignation_risk - a.resignation_risk
      )
    : [];

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Management warning banner */}
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
        <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Solo para management. Esta información es confidencial y no debe
          compartirse con el equipo.
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">
            Predictor de Retención
          </h1>
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={loading || orgLoading}
          className="rounded-xl gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25"
        >
          {loading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Analizando...
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              Analizar equipo
            </>
          )}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-8">
        Claude analiza 30 días de datos de cada persona para predecir riesgo de
        renuncia. Sin preconcepción de roles — todos evaluados igual.
      </p>

      {/* Error */}
      {error && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3 mb-6">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Claude está analizando patrones de los últimos 30 días...
          </p>
        </div>
      ) : !data ? (
        /* Initial empty state */
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-primary/60" />
          </div>
          <p className="text-lg font-semibold">Sin análisis todavía</p>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Presiona &quot;Analizar equipo&quot; para que Claude evalúe señales
            de riesgo de renuncia basándose en datos objetivos.
          </p>
        </div>
      ) : (
        <>
          {/* Team Summary */}
          <div className="mb-8 space-y-4">
            {/* Summary card */}
            <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold">Resumen del equipo</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {data.team_summary}
                </p>
              </CardContent>
            </Card>

            {/* Highest risk callout */}
            {data.highest_risk && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">
                    Mayor riesgo
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {data.highest_risk}
                  </p>
                </div>
              </div>
            )}

            {/* Immediate actions */}
            {data.immediate_actions && data.immediate_actions.length > 0 && (
              <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold">
                      Acciones inmediatas
                    </h3>
                  </div>
                  <ul className="space-y-2">
                    {data.immediate_actions.map((action, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="text-primary font-semibold tabular-nums tracking-tight shrink-0">
                          {i + 1}.
                        </span>
                        {action}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Individual predictions */}
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-primary" />
            Análisis individual
          </h2>

          <div className="space-y-4">
            {sorted.map((person, idx) => {
              const risk =
                RISK_CONFIG[person.risk_level] ?? RISK_CONFIG.low;

              return (
                <Card
                  key={idx}
                  className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                >
                  <CardContent className="p-5">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-base font-semibold">
                          {person.name}
                        </h3>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] font-semibold rounded-lg",
                            risk.color,
                            risk.bgColor
                          )}
                        >
                          {risk.label}
                        </Badge>
                      </div>
                      <span className="text-2xl font-bold tabular-nums tracking-tight">
                        {person.resignation_risk}
                        <span className="text-sm text-muted-foreground font-normal">
                          /100
                        </span>
                      </span>
                    </div>

                    {/* Risk bar */}
                    <div className="w-full h-2 bg-accent rounded-full mb-4 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          risk.barColor
                        )}
                        style={{
                          width: `${person.resignation_risk}%`,
                        }}
                      />
                    </div>

                    {/* Prediction text */}
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      {person.prediction}
                    </p>

                    {/* Signals */}
                    {person.signals && person.signals.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-muted-foreground/70 mb-1.5">
                          Señales detectadas
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {person.signals.map((signal, si) => (
                            <Badge
                              key={si}
                              variant="outline"
                              className="text-[10px] rounded-lg font-normal"
                            >
                              {signal}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommended action */}
                    {person.recommended_action && (
                      <div className="bg-accent/40 rounded-xl px-3 py-2.5">
                        <p className="text-xs font-medium text-muted-foreground/70 mb-1">
                          Acción recomendada
                        </p>
                        <p className="text-sm text-foreground">
                          {person.recommended_action}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Model info */}
          <p className="text-[10px] text-muted-foreground/50 text-center mt-8">
            Análisis generado por {data.model} el{" "}
            {data.analysis_date}. Basado en datos objetivos, sin
            preconcepción de roles.
          </p>
        </>
      )}
    </div>
  );
}
