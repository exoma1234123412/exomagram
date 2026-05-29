"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  ShieldX,
  X,
  ArrowRight,
  AlertTriangle,
  Copy,
  Ban,
  RefreshCw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

// ============================================================
// Types
// ============================================================

interface EntryData {
  category: string;
  title: string;
  description: string;
  hour: number;
  date: string;
  proof_urls: string[];
}

interface EntryValidatorProps {
  entry: EntryData;
  recentEntries: { title: string; description: string }[];
  onApproved: (updatedEntry?: { title: string; description: string }) => void;
  onNegativeSubmit: () => void;
  onCancel: () => void;
}

interface ValidationResult {
  approved: boolean;
  issues: string[];
  suggestions: string[];
  quality_score: number;
  red_flags: string[];
  copycat_score: number;
}

type ValidatorState = "scanning" | "approved" | "rejected" | "error";

// ============================================================
// Grade helpers
// ============================================================

function getGrade(score: number): { letter: string; color: string } {
  if (score >= 85) return { letter: "A", color: "text-green-500" };
  if (score >= 70) return { letter: "B", color: "text-blue-500" };
  if (score >= 55) return { letter: "C", color: "text-amber-500" };
  if (score >= 40) return { letter: "D", color: "text-orange-500" };
  return { letter: "F", color: "text-red-500" };
}

// ============================================================
// Component
// ============================================================

export function EntryValidator({
  entry,
  recentEntries,
  onApproved,
  onNegativeSubmit,
  onCancel,
}: EntryValidatorProps) {
  const [state, setState] = useState<ValidatorState>("scanning");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [scanLine, setScanLine] = useState(0);
  const [attempt, setAttempt] = useState(1);

  // Editable fields for inline correction
  const [editTitle, setEditTitle] = useState(entry.title);
  const [editDescription, setEditDescription] = useState(entry.description);

  // Scanning animation
  useEffect(() => {
    if (state !== "scanning") return;
    const interval = setInterval(() => {
      setScanLine((prev) => (prev >= 100 ? 0 : prev + 2));
    }, 30);
    return () => clearInterval(interval);
  }, [state]);

  // Call validation API
  const validate = useCallback(
    async (titleOverride?: string, descOverride?: string) => {
      setState("scanning");
      setScanLine(0);
      const startTime = Date.now();

      const evalTitle = titleOverride ?? editTitle;
      const evalDesc = descOverride ?? editDescription;

      try {
        const res = await fetch("/api/validate-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: entry.category,
            title: evalTitle,
            description: evalDesc,
            hour: entry.hour,
            date: entry.date,
            proof_urls: entry.proof_urls,
            recent_entries: recentEntries.map((e) => ({
              title: e.title,
              description: e.description,
              category: "",
              hour: 0,
              date: "",
            })),
          }),
        });

        // Ensure scanning shows for at least 2 seconds
        const elapsed = Date.now() - startTime;
        if (elapsed < 2000) {
          await new Promise((r) => setTimeout(r, 2000 - elapsed));
        }

        if (!res.ok) {
          // Auth or server error — approve by default, don't block the user
          console.warn("[EntryValidator] API returned", res.status, "— approving by default");
          setState("approved");
          setResult({ approved: true, issues: [], suggestions: [], quality_score: 50, red_flags: [], copycat_score: 0 });
          return;
        }

        const data = (await res.json()) as ValidationResult;
        setResult(data);

        if (data.approved) {
          setState("approved");
        } else {
          setState("rejected");
        }
      } catch (err) {
        console.warn("[EntryValidator] Fetch error — approving by default:", err);
        const elapsed = Date.now() - startTime;
        if (elapsed < 2000) {
          await new Promise((r) => setTimeout(r, 2000 - elapsed));
        }
        // Network error — approve by default, don't block
        setState("approved");
        setResult({ approved: true, issues: [], suggestions: [], quality_score: 50, red_flags: [], copycat_score: 0 });
      }
    },
    [entry, recentEntries, editTitle, editDescription]
  );

  // Initial validation on mount
  useEffect(() => {
    validate(entry.title, entry.description);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-proceed after approval — show for 2 seconds
  useEffect(() => {
    if (state !== "approved") return;
    const timer = setTimeout(() => {
      // Pass updated title/description if they were edited
      if (editTitle !== entry.title || editDescription !== entry.description) {
        onApproved({ title: editTitle, description: editDescription });
      } else {
        onApproved();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-submit with corrected text
  function handleRetry() {
    if (!editTitle.trim()) return;
    setAttempt((a) => a + 1);
    validate(editTitle, editDescription);
  }

  const grade = result ? getGrade(result.quality_score) : null;

  return (
    <div className="absolute inset-0 z-10 bg-background/95 backdrop-blur flex flex-col font-mono">
      {/* ---- SCANNING STATE ---- */}
      {state === "scanning" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 relative overflow-hidden">
          {/* Scan line */}
          <div
            className="absolute left-0 right-0 h-px bg-primary/60 transition-none pointer-events-none"
            style={{ top: `${scanLine}%` }}
          />
          <div
            className="absolute left-0 right-0 h-8 bg-gradient-to-b from-primary/10 to-transparent transition-none pointer-events-none"
            style={{ top: `${scanLine}%` }}
          />

          <div className="w-12 h-12 border border-primary/40 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-primary animate-pulse" />
          </div>

          <div className="text-center space-y-2">
            <p className="text-xs tracking-[0.2em] uppercase text-foreground font-bold">
              {attempt > 1
                ? `Claude re-evaluando (intento ${attempt})...`
                : "Claude esta evaluando tu entrada..."}
            </p>
            <p className="text-[10px] text-muted-foreground tracking-wide">
              Analizando calidad, especificidad y originalidad
            </p>
          </div>

          {/* Entry preview */}
          <div className="w-full max-w-sm border border-border p-3 space-y-1.5 bg-accent/20">
            <div className="flex items-center gap-2">
              <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                Categoria
              </span>
              <span className="text-[11px] text-foreground">{entry.category}</span>
            </div>
            <div className="text-[11px] text-foreground truncate">{editTitle}</div>
            {editDescription && (
              <div className="text-[10px] text-muted-foreground line-clamp-2">
                {editDescription}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- APPROVED STATE ---- */}
      {state === "approved" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <div className="w-16 h-16 border-2 border-green-500 flex items-center justify-center animate-in zoom-in duration-300">
            <ShieldCheck className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-sm tracking-[0.15em] uppercase text-green-500 font-bold">
            Entrada aprobada
          </p>
          {result && (
            <div className="flex items-center gap-3">
              <span className={cn("text-2xl font-bold tabular-nums", grade?.color)}>
                {grade?.letter}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {result.quality_score}/100
              </span>
            </div>
          )}
          {attempt > 1 && (
            <p className="text-[10px] text-green-500/70 tracking-wide">
              Aprobada en el intento {attempt}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground tracking-wide">Guardando...</p>
        </div>
      )}

      {/* ---- REJECTED STATE — with inline editing ---- */}
      {state === "rejected" && result && (
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="border-b border-red-500/30 bg-red-500/5 px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 border-2 border-red-500 flex items-center justify-center">
              <ShieldX className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1">
              <p className="text-xs tracking-[0.15em] uppercase text-red-500 font-bold">
                Entrada rechazada
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Corrige abajo y vuelve a enviar — intento {attempt}
              </p>
            </div>
            {grade && (
              <span className={cn("text-xl font-bold tabular-nums", grade.color)}>
                {grade.letter}
              </span>
            )}
          </div>

          <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
            {/* Issues from Claude */}
            {result.issues.length > 0 && (
              <div className="space-y-2">
                <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                  Problemas detectados por Claude
                </span>
                <div className="space-y-1.5">
                  {result.issues.map((issue, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-[11px] text-red-500 bg-red-500/5 border border-red-500/20 px-3 py-2"
                    >
                      <X className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions */}
            {result.suggestions.length > 0 && (
              <div className="space-y-2">
                <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                  Claude sugiere
                </span>
                <div className="space-y-1.5">
                  {result.suggestions.map((suggestion, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-[11px] text-primary bg-primary/5 border border-primary/20 px-3 py-2"
                    >
                      <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{suggestion}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Red flags */}
            {result.red_flags.length > 0 && (
              <div className="space-y-2">
                <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                  Frases rechazadas
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {result.red_flags.map((flag, i) => (
                    <span
                      key={i}
                      className="text-[10px] text-red-600 bg-red-500/10 border border-red-500/30 px-2 py-1"
                    >
                      <Ban className="w-3 h-3 inline mr-1" />
                      &quot;{flag}&quot;
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Copycat */}
            {result.copycat_score > 50 && (
              <div className="flex items-center gap-2 border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                <Copy className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-[11px] text-amber-600">
                  Similitud con entradas recientes:{" "}
                  <span className="font-bold tabular-nums">{result.copycat_score}%</span>
                </p>
              </div>
            )}

            {/* ---- INLINE EDIT SECTION ---- */}
            <div className="border-t border-border pt-4 space-y-3">
              <span className="text-[9px] tracking-[0.18em] uppercase text-primary font-bold">
                Corrige aqui y reenviar
              </span>

              <div className="space-y-1.5">
                <label className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                  Titulo
                </label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="font-mono text-xs h-8 border-border"
                  placeholder="Se especifico..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                  Descripcion — se especifico, menciona entregables y resultados
                </label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="font-mono text-xs min-h-[100px] border-border resize-none"
                  placeholder="¿Que hiciste exactamente? ¿Que entregaste? ¿Que resultado obtuviste?"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    {editDescription.split(/\s+/).filter(Boolean).length} palabras
                    {editDescription.split(/\s+/).filter(Boolean).length < 15 && (
                      <span className="text-red-500 ml-1">(minimo 15)</span>
                    )}
                  </span>
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    {editDescription.length} caracteres
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="border-t border-border px-4 py-3 shrink-0 space-y-2">
            <div className="flex gap-2">
              <Button
                onClick={onCancel}
                variant="outline"
                className="flex-1 font-mono text-[10px] uppercase tracking-wider"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleRetry}
                disabled={!editTitle.trim() || editDescription.split(/\s+/).filter(Boolean).length < 5}
                className="flex-1 font-mono text-[10px] uppercase tracking-wider bg-primary text-primary-foreground gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                Re-evaluar con Claude
              </Button>
            </div>

            {/* Negative submit — admit you did nothing, register with penalty */}
            {attempt >= 2 && (
              <div className="border-t border-red-500/20 pt-2">
                <Button
                  onClick={onNegativeSubmit}
                  variant="outline"
                  className="w-full font-mono text-[10px] uppercase tracking-wider text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-600 gap-1.5"
                >
                  <AlertTriangle className="w-3 h-3" />
                  No fui productivo — registrar con penalidad
                </Button>
                <p className="text-[9px] text-red-500/60 text-center mt-1.5 font-mono">
                  Se registra la hora como improductiva. Afecta tu Trust Score.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- ERROR STATE ---- */}
      {state === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <div className="w-12 h-12 border border-amber-500/40 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
          </div>
          <p className="text-xs tracking-[0.15em] uppercase text-amber-500 font-bold">
            Validacion no disponible
          </p>
          <p className="text-[10px] text-muted-foreground text-center max-w-xs">
            No se pudo conectar con Claude. La entrada se enviara con una marca de advertencia.
          </p>
          <Button
            onClick={() => onApproved()}
            variant="outline"
            className="font-mono text-xs uppercase tracking-wider"
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            Enviar sin validacion
          </Button>
        </div>
      )}
    </div>
  );
}
