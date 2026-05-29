"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Brain, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClaudeFollowupProps {
  entryId: string;
  category: string;
  title: string;
  description: string;
  onComplete: () => void;
}

interface FollowupQuestion {
  id: string;
  question: string;
}

// ---------------------------------------------------------------------------
// Question Templates
// ---------------------------------------------------------------------------

const CATEGORY_QUESTIONS: Record<string, string[]> = {
  deep_work: [
    "¿Qué entregable concreto produjo esta hora?",
    "¿En qué archivo o módulo trabajaste?",
  ],
  meeting: [
    "¿Quiénes participaron?",
    "¿Qué decisiones se tomaron?",
  ],
  review: [
    "¿Qué PR o código revisaste?",
    "¿Encontraste problemas?",
  ],
  admin: [
    "¿Qué tarea administrativa completaste?",
    "¿Se puede automatizar?",
  ],
  planning: [
    "¿Qué se planificó?",
    "¿Cuáles son los próximos pasos?",
  ],
  learning: [
    "¿Qué aprendiste específicamente?",
    "¿Cómo lo aplicarás?",
  ],
  blocked: [
    "¿Qué te bloqueó exactamente?",
    "¿Quién puede desbloquearte?",
  ],
};

const SHORT_DESCRIPTION_THRESHOLD = 20;
const SKIP_DELAY_MS = 5000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function generateQuestions(
  category: string,
  description: string,
): FollowupQuestion[] {
  // Break category — no questions
  if (category === "break") return [];

  const questions: FollowupQuestion[] = [];

  // Short description trigger
  if (countWords(description) < SHORT_DESCRIPTION_THRESHOLD) {
    questions.push({
      id: "short_desc",
      question: "Tu descripción es muy corta. ¿Puedes dar más detalle?",
    });
  }

  // Category-specific questions
  const templates = CATEGORY_QUESTIONS[category];
  if (templates) {
    for (let i = 0; i < templates.length; i++) {
      questions.push({
        id: `cat_${i}`,
        question: templates[i],
      });
    }
  }

  // Cap at 2 questions max (short_desc counts as one)
  return questions.slice(0, 2);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClaudeFollowup({
  entryId,
  category,
  title,
  description,
  onComplete,
}: ClaudeFollowupProps) {
  const questions = generateQuestions(category, description);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If no questions (break category), complete immediately
  useEffect(() => {
    if (questions.length === 0) {
      onComplete();
    }
  }, [questions.length, onComplete]);

  // Start skip delay timer
  useEffect(() => {
    skipTimerRef.current = setTimeout(() => {
      setCanSkip(true);
    }, SKIP_DELAY_MS);

    return () => {
      if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
    };
  }, []);

  const handleAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
    },
    [],
  );

  // Save answers by appending to entry description
  const handleSubmit = useCallback(async () => {
    setSaving(true);
    setError(null);

    const supabase = createClient();

    // Build the followup text
    const followupParts: string[] = [];
    for (const q of questions) {
      const answer = (answers[q.id] ?? "").trim();
      if (answer) {
        followupParts.push(`P: ${q.question}\nR: ${answer}`);
      }
    }

    if (followupParts.length === 0) {
      // No answers provided, treat as skip
      handleSkip();
      return;
    }

    const followupText = `\n\n[Seguimiento Claude]\n${followupParts.join("\n\n")}`;
    const newDescription = (description || "") + followupText;

    const { error: updateError } = await supabase
      .from("time_entries")
      .update({ description: newDescription })
      .eq("id", entryId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onComplete();
  }, [answers, description, entryId, onComplete, questions]);

  // Skip — mark entry with note
  const handleSkip = useCallback(async () => {
    setSaving(true);
    setError(null);

    const supabase = createClient();

    const skipNote = "\n\n[Seguimiento Claude]\nSin profundizar";
    const newDescription = (description || "") + skipNote;

    const { error: updateError } = await supabase
      .from("time_entries")
      .update({ description: newDescription })
      .eq("id", entryId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onComplete();
  }, [description, entryId, onComplete]);

  // Has at least one answer filled
  const hasAnyAnswer = Object.values(answers).some(
    (v) => v.trim().length > 0,
  );

  // Don't render if no questions
  if (questions.length === 0) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md mx-4">
        <div className="border border-border bg-background">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-accent/30">
            <div className="flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-primary" />
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-foreground font-bold">
                Claude quiere saber mas
              </span>
            </div>
            <Terminal className="w-3 h-3 text-muted-foreground" />
          </div>

          {/* Entry context */}
          <div className="px-3 py-2 border-b border-border">
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Entrada registrada
            </span>
            <p className="font-mono text-xs mt-1 truncate text-foreground">
              {title}
            </p>
          </div>

          {/* Questions */}
          <div className="px-3 py-3 space-y-4">
            {questions.map((q, idx) => (
              <div key={q.id} className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="font-mono text-[10px] font-bold text-primary tabular-nums shrink-0 mt-0.5">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <p className="font-mono text-xs text-foreground leading-relaxed">
                    {q.question}
                  </p>
                </div>
                <Textarea
                  value={answers[q.id] ?? ""}
                  onChange={(e) =>
                    handleAnswerChange(q.id, e.target.value)
                  }
                  placeholder="Escribe tu respuesta..."
                  rows={2}
                  className="font-mono text-xs resize-none"
                  disabled={saving}
                />
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="mx-3 mb-2 bg-destructive/5 border border-destructive/20 px-2 py-1.5">
              <p className="font-mono text-[10px] text-destructive">
                {error}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="px-3 py-2.5 border-t border-border space-y-2">
            <Button
              onClick={handleSubmit}
              disabled={saving || !hasAnyAnswer}
              className="w-full h-8 bg-primary text-primary-foreground font-mono text-xs border-0 transition-all duration-200"
            >
              {saving ? "Guardando..." : "Responder"}
            </Button>

            <button
              onClick={handleSkip}
              disabled={!canSkip || saving}
              className={cn(
                "w-full py-1.5 font-mono text-[10px] tracking-wide uppercase transition-all duration-200",
                canSkip
                  ? "text-muted-foreground hover:text-foreground cursor-pointer"
                  : "text-muted-foreground/30 cursor-not-allowed",
              )}
            >
              {canSkip
                ? "No tengo mas que agregar"
                : `Espera ${Math.ceil(SKIP_DELAY_MS / 1000)}s para omitir...`}
            </button>
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 border-t border-border bg-accent/20">
            <p className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground text-center">
              Las respuestas se agregan a tu entrada
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
