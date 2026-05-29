"use client";

import { useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  UserMinus,
  Brain,
  AlertTriangle,
  TrendingDown,
  Shield,
  Loader2,
  Scan,
  Target,
  Zap,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Prediction {
  name: string;
  resignation_risk: number;
  risk_level: "low" | "medium" | "high" | "critical";
  signals: string[];
  prediction: string;
  recommended_action: string;
}

interface ResignAnalysis {
  success: boolean;
  analysis_date: string;
  predictions: Prediction[];
  team_summary: string;
  highest_risk: string;
  immediate_actions: string[];
}

/* ------------------------------------------------------------------ */
/*  Risk level styling                                                 */
/* ------------------------------------------------------------------ */

const RISK_CONFIG: Record<
  Prediction["risk_level"],
  { label: string; color: string; bg: string; bar: string; border: string; icon: string }
> = {
  low: {
    label: "Bajo",
    color: "text-green-700 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/20",
    bar: "bg-green-500",
    border: "border-green-200 dark:border-green-800",
    icon: "text-green-500",
  },
  medium: {
    label: "Medio",
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    bar: "bg-amber-500",
    border: "border-amber-200 dark:border-amber-800",
    icon: "text-amber-500",
  },
  high: {
    label: "Alto",
    color: "text-orange-700 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/20",
    bar: "bg-orange-500",
    border: "border-orange-200 dark:border-orange-800",
    icon: "text-orange-500",
  },
  critical: {
    label: "Critico",
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/20",
    bar: "bg-red-600",
    border: "border-red-300 dark:border-red-800",
    icon: "text-red-500",
  },
};

/* ------------------------------------------------------------------ */
/*  Scanning phrases (rotated while loading)                           */
/* ------------------------------------------------------------------ */

const SCAN_PHRASES = [
  "Analizando 30 dias de datos...",
  "Detectando patrones de desconexion...",
  "Evaluando tendencias de mood y energia...",
  "Cruzando standups, closeouts y promesas...",
  "Midiendo engagement del equipo...",
  "Correlacionando Trust Scores...",
  "Generando predicciones...",
];

/* ------------------------------------------------------------------ */
/*  Risk gauge component                                               */
/* ------------------------------------------------------------------ */

function RiskGauge({ value, level }: { value: number; level: Prediction["risk_level"] }) {
  const cfg = RISK_CONFIG[level];
  return (
    <div className="flex items-center gap-3 w-full">
      <div className="flex-1 h-2 bg-accent/30 border border-border overflow-hidden">
        <div
          className={cn("h-full transition-all duration-1000 ease-out", cfg.bar)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className={cn("font-mono text-lg font-bold tabular-nums tracking-tight min-w-[3ch] text-right", cfg.color)}>
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Person card                                                        */
/* ------------------------------------------------------------------ */

function PersonCard({ person }: { person: Prediction }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = RISK_CONFIG[person.risk_level];

  return (
    <Card className={cn("border border-border transition-colors hover:border-primary/30", cfg.border)}>
      <CardContent className="p-5">
        {/* Header row */}
        <div className="flex items-start gap-4 mb-4">
          <div
            className={cn(
              "w-10 h-10 border border-border flex items-center justify-center shrink-0",
              cfg.bg
            )}
          >
            <UserMinus className={cn("w-4 h-4", cfg.icon)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-mono font-bold truncate">{person.name}</h3>
              <Badge
                className={cn(
                  "font-mono text-[9px] uppercase font-bold tracking-wider",
                  cfg.bg,
                  cfg.color
                )}
              >
                {cfg.label}
              </Badge>
              {person.risk_level === "critical" && (
                <Badge variant="destructive" className="font-mono text-[9px] animate-pulse gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  ALERTA
                </Badge>
              )}
            </div>
            {/* Risk gauge */}
            <div className="mt-2">
              <RiskGauge value={person.resignation_risk} level={person.risk_level} />
            </div>
          </div>
        </div>

        {/* Prediction text */}
        <div className="mb-3 p-3 bg-accent/30 border border-border">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-1 flex items-center gap-1">
            <Brain className="w-3 h-3" />
            Prediccion
          </p>
          <p className="text-xs leading-relaxed">{person.prediction}</p>
        </div>

        {/* Signals */}
        {person.signals?.length > 0 && (
          <div className="mb-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-1.5 cursor-pointer hover:text-foreground transition-colors"
            >
              <AlertTriangle className={cn("w-3 h-3", cfg.icon)} />
              {person.signals.length} señal{person.signals.length !== 1 ? "es" : ""} detectada{person.signals.length !== 1 ? "s" : ""}
              {expanded ? (
                <ChevronUp className="w-3 h-3 ml-1" />
              ) : (
                <ChevronDown className="w-3 h-3 ml-1" />
              )}
            </button>
            {expanded && (
              <div className={cn("p-3 border", cfg.bg, cfg.border)}>
                {person.signals.map((signal, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1 last:mb-0">
                    <TrendingDown className={cn("w-3 h-3 mt-0.5 shrink-0", cfg.icon)} />
                    <p className={cn("text-xs font-mono", cfg.color)}>{signal}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recommended action */}
        {person.recommended_action && (
          <div className="p-3 bg-primary/5 border border-primary/20">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-primary/60 mb-1 flex items-center gap-1">
              <Target className="w-3 h-3" />
              Accion recomendada
            </p>
            <p className="text-xs">{person.recommended_action}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function ResignRiskPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResignAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanIdx, setScanIdx] = useState(0);

  async function runAnalysis() {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setScanIdx(0);

    // Rotate scanning phrases every 2 seconds
    const interval = setInterval(() => {
      setScanIdx((prev) => (prev + 1) % SCAN_PHRASES.length);
    }, 2000);

    try {
      const res = await fetch("/api/claude-resign-predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        // Sort by risk, highest first
        const sorted: ResignAnalysis = {
          ...json,
          predictions: [...(json.predictions ?? [])].sort(
            (a: Prediction, b: Prediction) => b.resignation_risk - a.resignation_risk
          ),
        };
        setResults(sorted);
      }
    } catch {
      setError("Error conectando con Claude");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  }

  /* Org loading state */
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">Cargando...</div>
      </div>
    );
  }

  const criticalCount = results?.predictions.filter((p) => p.risk_level === "critical").length ?? 0;
  const highCount = results?.predictions.filter((p) => p.risk_level === "high").length ?? 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
          <UserMinus className="w-5 h-5 text-primary" />
          Prediccion de Renuncia
        </h1>
        <p className="text-xs font-mono text-muted-foreground mt-1">
          Claude analiza 30 dias de comportamiento y predice riesgo de renuncia por persona.
        </p>
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mt-0.5">
          Datos analizados: horas, mood, energia, standups, closeouts, promesas, shoutouts, Trust Score.
        </p>
      </div>

      {/* CTA button */}
      {!loading && !results && (
        <div className="flex flex-col items-center justify-center py-16 gap-6">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <Scan className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center max-w-sm">
            <p className="text-xs font-mono text-muted-foreground mb-1">
              Analisis confidencial con inteligencia artificial.
            </p>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Evalua señales de riesgo: engagement decreciente, mood en declive, desconexion del equipo.
            </p>
          </div>
          <Button
            onClick={runAnalysis}
            disabled={!orgId}
            className="gap-2 bg-primary font-mono text-xs text-primary-foreground px-6 h-9"
          >
            <Brain className="w-4 h-4" />
            Analizar Equipo
          </Button>
        </div>
      )}

      {/* Loading state - dramatic scanning */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-5">
          <div className="relative w-14 h-14 border border-primary/30 flex items-center justify-center animate-scan">
            <Brain className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center space-y-2">
            <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
              Claude esta analizando patrones de comportamiento...
            </p>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-primary/60 transition-all duration-500">
              {SCAN_PHRASES[scanIdx]}
            </p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                Esto toma 10-20 segundos
              </p>
            </div>
          </div>
          {/* Scanning progress bar */}
          <div className="w-64 h-px bg-border overflow-hidden mt-2">
            <div className="h-full bg-primary animate-shimmer" />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="bg-destructive/5 border border-destructive/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && !loading && (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="bg-accent/30 border border-border p-3 text-center">
              <p className="font-mono text-2xl font-bold tabular-nums tracking-tight">{results.predictions.length}</p>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Analizados</p>
            </div>
            <div className={cn("border border-border p-3 text-center", criticalCount > 0 ? "bg-red-50 dark:bg-red-950/20" : "bg-accent/30")}>
              <p className={cn("font-mono text-2xl font-bold tabular-nums tracking-tight", criticalCount > 0 ? "text-red-600" : "")}>
                {criticalCount}
              </p>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Criticos</p>
            </div>
            <div className={cn("border border-border p-3 text-center", highCount > 0 ? "bg-orange-50 dark:bg-orange-950/20" : "bg-accent/30")}>
              <p className={cn("font-mono text-2xl font-bold tabular-nums tracking-tight", highCount > 0 ? "text-orange-600" : "")}>
                {highCount}
              </p>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Riesgo alto</p>
            </div>
            <div className="bg-accent/30 border border-border p-3 text-center">
              <p className="font-mono text-sm font-bold tabular-nums tracking-tight">{results.analysis_date}</p>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Fecha</p>
            </div>
          </div>

          {/* Team summary card */}
          <Card className="border border-border transition-colors hover:border-primary/30">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 border border-border bg-primary/5 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-mono font-bold uppercase mb-1">Resumen del equipo</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{results.team_summary}</p>
                </div>
              </div>

              {/* Highest risk callout */}
              {results.highest_risk && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                  <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-600/60 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Mayor riesgo
                  </p>
                  <p className="text-xs font-mono font-medium text-red-700 dark:text-red-400">
                    {results.highest_risk}
                  </p>
                </div>
              )}

              {/* Immediate actions */}
              {results.immediate_actions?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-primary/60 mb-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Acciones inmediatas
                  </p>
                  <div className="space-y-2">
                    {results.immediate_actions.map((action, i) => (
                      <div key={i} className="flex items-start gap-2 p-2.5 bg-primary/5 border border-primary/10">
                        <Target className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                        <p className="text-xs">{action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Person cards */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-muted-foreground/40" />
              <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                Analisis individual
              </h2>
              <span className="font-mono text-[9px] text-muted-foreground/30">(ordenado por riesgo)</span>
            </div>
            {results.predictions.map((person, i) => (
              <PersonCard key={i} person={person} />
            ))}
          </div>

          {/* Re-analyze button */}
          <div className="flex justify-center pt-4 pb-8">
            <Button
              variant="outline"
              onClick={runAnalysis}
              className="gap-2 font-mono text-xs border-border"
            >
              <Brain className="w-4 h-4" />
              Analizar de nuevo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
