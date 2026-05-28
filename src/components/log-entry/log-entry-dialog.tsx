"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORIES,
  WORK_HOURS,
  MOOD_LABELS,
  ENERGY_LABELS,
  MAX_BACKFILL_HOURS,
  MIN_TITLE_LENGTH,
} from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, Link as LinkIcon, Shield, Clock } from "lucide-react";
import { updateStreakOnEntry } from "@/lib/streak-utils";

interface LogEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultHour?: number;
  defaultDate?: string;
}

export function LogEntryDialog({
  open,
  onOpenChange,
  defaultHour,
  defaultDate,
}: LogEntryDialogProps) {
  const now = new Date();
  const [category, setCategory] = useState<WorkCategory | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hour, setHour] = useState<string>(
    defaultHour?.toString() ?? now.getHours().toString()
  );
  const [date, setDate] = useState(
    defaultDate ?? now.toISOString().split("T")[0]
  );
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [proofUrls, setProofUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anti-gaming: calculate if entry is late
  function calculateLateness(): { isLate: boolean; minutesLate: number } {
    const entryDate = new Date(`${date}T${String(parseInt(hour) + 1).padStart(2, "0")}:00:00`);
    const diff = (now.getTime() - entryDate.getTime()) / 1000 / 60;
    return { isLate: diff > 60, minutesLate: Math.max(0, Math.round(diff - 60)) };
  }

  // Anti-gaming: check if backfill is too old
  function isBackfillTooOld(): boolean {
    const entryDate = new Date(`${date}T${String(parseInt(hour)).padStart(2, "0")}:00:00`);
    const diffHours = (now.getTime() - entryDate.getTime()) / 1000 / 60 / 60;
    return diffHours > MAX_BACKFILL_HOURS;
  }

  const lateness = calculateLateness();
  const tooOld = isBackfillTooOld();
  const hasProof = proofUrls.trim().length > 0;
  const titleTooShort = title.length > 0 && title.length < MIN_TITLE_LENGTH;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || tooOld) return;
    if (title.length < MIN_TITLE_LENGTH) {
      setError(`El título debe tener al menos ${MIN_TITLE_LENGTH} caracteres. Sé específico.`);
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("No estás autenticado");
      setLoading(false);
      return;
    }

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single<{ org_id: string }>();

    if (!membership) {
      setError("No perteneces a ninguna organización");
      setLoading(false);
      return;
    }

    const proofArray = proofUrls
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const { error: insertError } = await supabase.from("time_entries").upsert(
      {
        user_id: user.id,
        org_id: membership.org_id,
        date,
        hour: parseInt(hour),
        category: category as WorkCategory,
        title,
        description: description || null,
        mood: mood as 1 | 2 | 3 | 4 | 5 | null,
        energy: energy as 1 | 2 | 3 | 4 | 5 | null,
        links: null,
        proof_urls: proofArray.length > 0 ? proofArray : null,
        is_late: lateness.isLate,
        minutes_late: lateness.minutesLate,
        logged_at: new Date().toISOString(),
        verification_status: proofArray.length > 0 ? "unverified" : "unverified",
      },
      { onConflict: "user_id,org_id,date,hour" }
    );

    if (insertError) {
      setError(insertError.message);
    } else {
      // Update activity streak
      updateStreakOnEntry(user.id, membership.org_id, date);

      setCategory("");
      setTitle("");
      setDescription("");
      setMood(null);
      setEnergy(null);
      setProofUrls("");
      onOpenChange(false);
    }
    setLoading(false);
  }

  function formatHour(h: number) {
    const suffix = h >= 12 ? "PM" : "AM";
    const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${display}:00 ${suffix}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            Registrar hora
            {lateness.isLate && (
              <Badge variant="destructive" className="text-[10px]">
                <Clock className="w-3 h-3 mr-1" />
                {lateness.minutesLate}min tarde
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Anti-gaming warnings */}
        {tooOld && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-red-700 dark:text-red-400">
                No puedes registrar más de {MAX_BACKFILL_HOURS}h hacia atrás
              </p>
              <p className="text-red-600/70 dark:text-red-400/70 text-xs mt-0.5">
                Registra tus horas a tiempo. Las entradas tardías quedan marcadas.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Date & Hour */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={now.toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <Select value={hour} onValueChange={(v) => v && setHour(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_HOURS.map((h) => (
                    <SelectItem key={h} value={h.toString()}>
                      {formatHour(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Categoría</Label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(CATEGORIES) as WorkCategory[]).map((key) => {
                const cat = CATEGORIES[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 text-xs font-medium transition-all",
                      category === key
                        ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30"
                        : "border-transparent bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <span className="text-lg">{cat.emoji}</span>
                    <span className="truncate w-full text-center">
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title - with minimum length enforcement */}
          <div className="space-y-2">
            <Label htmlFor="title">
              ¿Qué hiciste?{" "}
              <span className="text-muted-foreground text-xs">
                (mín. {MIN_TITLE_LENGTH} caracteres)
              </span>
            </Label>
            <Input
              id="title"
              placeholder="Sé específico: 'Implementé validación de formulario de registro con Zod'"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={MIN_TITLE_LENGTH}
              className={cn(titleTooShort && "border-yellow-500")}
            />
            {titleTooShort && (
              <p className="text-xs text-yellow-600">
                {MIN_TITLE_LENGTH - title.length} caracteres más. Sé específico sobre lo que hiciste.
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="desc">Detalles</Label>
            <Textarea
              id="desc"
              placeholder="Explica qué hiciste, qué decisiones tomaste, qué problemas encontraste..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* PROOF OF WORK - The key anti-gaming feature */}
          <div className="space-y-2">
            <Label htmlFor="proof" className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-600" />
              Evidencia de trabajo
              {!hasProof && (
                <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-300">
                  Sin evidencia
                </Badge>
              )}
              {hasProof && (
                <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">
                  Con evidencia
                </Badge>
              )}
            </Label>
            <Textarea
              id="proof"
              placeholder={"Links a commits, PRs, documentos, screenshots...\nhttps://github.com/org/repo/pull/123\nhttps://linear.app/team/issue/EX-45"}
              value={proofUrls}
              onChange={(e) => setProofUrls(e.target.value)}
              rows={2}
              className={cn(!hasProof && "border-yellow-300 dark:border-yellow-700")}
            />
            <p className="text-xs text-muted-foreground">
              Las entradas sin evidencia se marcan como <span className="text-yellow-600 font-medium">sin verificar</span>.
              Tu equipo puede ver cuáles tienen prueba y cuáles no.
            </p>
          </div>

          {/* Mood & Energy */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ánimo</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setMood(mood === level ? null : level)}
                    className={cn(
                      "flex-1 py-1.5 rounded text-xs font-medium transition-all",
                      mood === level
                        ? "bg-violet-600 text-white"
                        : "bg-muted hover:bg-muted/80"
                    )}
                    title={MOOD_LABELS[level]}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Energía</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setEnergy(energy === level ? null : level)}
                    className={cn(
                      "flex-1 py-1.5 rounded text-xs font-medium transition-all",
                      energy === level
                        ? "bg-emerald-600 text-white"
                        : "bg-muted hover:bg-muted/80"
                    )}
                    title={ENERGY_LABELS[level]}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !category || tooOld}
          >
            {loading ? "Guardando..." : "Guardar entrada"}
          </Button>

          {/* Transparency notice */}
          <p className="text-[11px] text-center text-muted-foreground/60">
            Todo tu equipo verá esta entrada, incluyendo si fue registrada tarde
            y si tiene evidencia.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
