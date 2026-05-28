"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { MOOD_LABELS } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

interface DailyCloseoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DailyCloseoutDialog({ open, onOpenChange }: DailyCloseoutDialogProps) {
  const [summary, setSummary] = useState("");
  const [blockers, setBlockers] = useState("");
  const [tomorrowPlan, setTomorrowPlan] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [hoursLogged, setHoursLogged] = useState(0);
  const [hoursWithProof, setHoursWithProof] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const supabase = createClient();

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    async function loadStats() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: entries } = await supabase
        .from("time_entries")
        .select("id, proof_urls")
        .eq("user_id", user.id)
        .eq("date", today);

      if (entries) {
        setHoursLogged(entries.length);
        setHoursWithProof(entries.filter((e) => e.proof_urls && e.proof_urls.length > 0).length);
      }

      // Check if already submitted
      const { data: existing } = await supabase
        .from("daily_closeouts")
        .select("id")
        .eq("user_id", user.id)
        .eq("date", today)
        .limit(1)
        .single();

      if (existing) setSubmitted(true);
    }
    if (open) loadStats();
  }, [open, today]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single<{ org_id: string }>();

    if (!membership) return;

    await supabase.from("daily_closeouts").upsert({
      user_id: user.id,
      org_id: membership.org_id,
      date: today,
      summary,
      blockers: blockers || null,
      tomorrow_plan: tomorrowPlan || null,
      mood: mood as 1 | 2 | 3 | 4 | 5 | null,
      hours_logged: hoursLogged,
      hours_with_proof: hoursWithProof,
    }, { onConflict: "user_id,org_id,date" });

    setSubmitted(true);
    setLoading(false);
    setTimeout(() => onOpenChange(false), 1500);
  }

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md text-center py-10">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold">Cierre del día enviado</h3>
          <p className="text-muted-foreground mt-2">
            Tu equipo puede ver tu resumen. Descansa bien.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Cierre del día</DialogTitle>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{hoursLogged}</p>
            <p className="text-xs text-muted-foreground">Horas registradas</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className={cn(
              "text-2xl font-bold",
              hoursWithProof === hoursLogged ? "text-green-600" : "text-yellow-600"
            )}>
              {hoursLogged > 0 ? Math.round((hoursWithProof / hoursLogged) * 100) : 0}%
            </p>
            <p className="text-xs text-muted-foreground">Con evidencia</p>
          </div>
        </div>

        {hoursLogged < 8 && (
          <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm text-yellow-700 dark:text-yellow-400">
            Solo registraste {hoursLogged} horas hoy. Se esperan al menos 8.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Resumen del día</Label>
            <Textarea
              placeholder="¿Qué lograste hoy? Sé específico..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              required
              minLength={20}
            />
          </div>

          <div className="space-y-2">
            <Label>Bloqueos / problemas (si hubo)</Label>
            <Textarea
              placeholder="¿Algo te bloqueó o retrasó?"
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Plan para mañana</Label>
            <Textarea
              placeholder="¿Qué vas a hacer mañana?"
              value={tomorrowPlan}
              onChange={(e) => setTomorrowPlan(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>¿Cómo te sentiste hoy?</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setMood(mood === level ? null : level)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                    mood === level
                      ? "bg-violet-600 text-white"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  {MOOD_LABELS[level]}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Enviando..." : "Enviar cierre del día"}
          </Button>

          <p className="text-[11px] text-center text-muted-foreground/60">
            Todo tu equipo verá este resumen junto con tus estadísticas del día.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
