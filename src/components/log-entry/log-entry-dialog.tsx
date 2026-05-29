"use client";

import { useState, useEffect, useRef } from "react";
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
import { cn, formatHour } from "@/lib/utils";
import { AlertTriangle, Shield, Clock, BookTemplate, CheckCircle2 } from "lucide-react";
import { updateStreakOnEntry } from "@/lib/streak-utils";
import { EntryTemplates, ManageTemplatesDialog, type EntryTemplate } from "./entry-templates";

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
  const [project, setProject] = useState("");
  const [proofUrls, setProofUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const savedTitleRef = useRef("");

  // Reset form state when dialog closes
  useEffect(() => {
    if (!open) {
      setCategory("");
      setTitle("");
      setDescription("");
      setHour(defaultHour?.toString() ?? new Date().getHours().toString());
      setDate(defaultDate ?? new Date().toISOString().split("T")[0]);
      setMood(null);
      setEnergy(null);
      setProject("");
      setProofUrls("");
      setError(null);
      setShowSuccess(false);
    }
  }, [open, defaultHour, defaultDate]);

  function applyTemplate(template: EntryTemplate) {
    setCategory(template.category);
    setTitle(template.title);
    setDescription(template.description);
    setProject(template.project);
  }

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
      .single();

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
        project: project.trim() || null,
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
      setLoading(false);
      return;
    }

    // Update activity streak
    updateStreakOnEntry(user.id, membership.org_id, date);

    // Show success state before closing
    savedTitleRef.current = title;
    setShowSuccess(true);
    setLoading(false);

    // Fire claude-react in background (fire and forget)
    const profilePromise = supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    profilePromise.then(({ data: profile }) => {
      fetch("/api/claude-react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: membership.org_id,
          event_type: "entry_created",
          event_data: {
            user_name: profile?.full_name ?? "Usuario",
            title: title,
            category: category,
            hour: parseInt(hour),
            has_proof: proofArray.length > 0,
          },
        }),
      }).catch(() => {});
    });

    // Wait 1.5s then close and reset form
    setTimeout(() => {
      setCategory("");
      setTitle("");
      setDescription("");
      setMood(null);
      setEnergy(null);
      setProject("");
      setProofUrls("");
      setShowSuccess(false);
      onOpenChange(false);
    }, 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2.5 tracking-tight">
            Registrar hora
            {lateness.isLate && (
              <Badge variant="destructive" className="text-[10px] rounded-lg font-semibold">
                <Clock className="w-3 h-3 mr-1" />
                {lateness.minutesLate}min tarde
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Quick templates */}
        <EntryTemplates onApply={applyTemplate} />

        {/* Anti-gaming warnings */}
        {tooOld && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40 rounded-xl p-3.5 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-red-700 dark:text-red-400">
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
              <Label className="text-sm font-medium">Fecha</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={now.toISOString().split("T")[0]}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Hora</Label>
              <Select value={hour} onValueChange={(v) => v && setHour(v)}>
                <SelectTrigger className="rounded-xl">
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
          <div className="space-y-2.5">
            <Label className="text-sm font-medium">Categoría</Label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(CATEGORIES) as WorkCategory[]).map((key) => {
                const cat = CATEGORIES[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-semibold transition-all duration-200",
                      category === key
                        ? "border-primary bg-primary/5 shadow-sm shadow-primary/10 scale-[1.02]"
                        : "border-transparent bg-accent/50 hover:bg-accent hover:scale-[1.01]"
                    )}
                  >
                    <span className="text-xl">{cat.emoji}</span>
                    <span className="truncate w-full text-center text-[11px]">
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium">
              ¿Qué hiciste?{" "}
              <span className="text-muted-foreground/60 text-xs font-normal">
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
              className={cn("rounded-xl", titleTooShort && "border-yellow-500 focus-visible:ring-yellow-500/30")}
            />
            {titleTooShort && (
              <p className="text-xs text-yellow-600 font-medium">
                {MIN_TITLE_LENGTH - title.length} caracteres más. Sé específico sobre lo que hiciste.
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="desc" className="text-sm font-medium">Detalles</Label>
            <Textarea
              id="desc"
              placeholder="Explica qué hiciste, qué decisiones tomaste, qué problemas encontraste..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-xl"
            />
          </div>

          {/* Project tag */}
          <div className="space-y-2">
            <Label htmlFor="project" className="text-sm font-medium">
              Proyecto{" "}
              <span className="text-muted-foreground/60 text-xs font-normal">(opcional)</span>
            </Label>
            <Input
              id="project"
              placeholder="ej: landing-page, api-v2, onboarding"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* PROOF OF WORK */}
          <div className="space-y-2">
            <Label htmlFor="proof" className="flex items-center gap-2 text-sm font-medium">
              <Shield className="w-4 h-4 text-primary" />
              Evidencia de trabajo
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] rounded-md font-semibold ml-auto",
                  hasProof
                    ? "text-green-600 border-green-300/50 bg-green-50/50 dark:bg-green-950/20"
                    : "text-yellow-600 border-yellow-300/50 bg-yellow-50/50 dark:bg-yellow-950/20"
                )}
              >
                {hasProof ? "Con evidencia" : "Sin evidencia"}
              </Badge>
            </Label>
            <Textarea
              id="proof"
              placeholder={"Links a commits, PRs, documentos, screenshots...\nhttps://github.com/org/repo/pull/123\nhttps://linear.app/team/issue/EX-45"}
              value={proofUrls}
              onChange={(e) => setProofUrls(e.target.value)}
              rows={2}
              className={cn(
                "rounded-xl",
                !hasProof && "border-yellow-300/60 dark:border-yellow-700/40"
              )}
            />
            <p className="text-[11px] text-muted-foreground/70">
              Las entradas sin evidencia se marcan como <span className="text-yellow-600 font-semibold">sin verificar</span>.
              Tu equipo puede ver cuáles tienen prueba y cuáles no.
            </p>
          </div>

          {/* Mood & Energy */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Ánimo</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setMood(mood === level ? null : level)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200",
                      mood === level
                        ? "bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-600/25 scale-105"
                        : "bg-accent/60 hover:bg-accent text-foreground/70"
                    )}
                    title={MOOD_LABELS[level]}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Energía</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setEnergy(energy === level ? null : level)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200",
                      energy === level
                        ? "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/25 scale-105"
                        : "bg-accent/60 hover:bg-accent text-foreground/70"
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
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl px-3 py-2">
              <p className="text-sm text-destructive font-medium">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-10 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 font-semibold"
            disabled={loading || !category || tooOld}
          >
            {loading ? "Guardando..." : "Guardar entrada"}
          </Button>

          {/* Transparency notice */}
          <p className="text-[11px] text-center text-muted-foreground/50">
            Todo tu equipo vera esta entrada, incluyendo si fue registrada tarde
            y si tiene evidencia.
          </p>

          {/* Manage templates link */}
          <button
            type="button"
            onClick={() => setTemplatesOpen(true)}
            className="text-[11px] text-center text-primary/60 hover:text-primary w-full flex items-center justify-center gap-1 transition-colors"
          >
            <BookTemplate className="w-3 h-3" />
            Gestionar plantillas
          </button>
        </form>

        <ManageTemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />

        {/* Success overlay */}
        {showSuccess && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm rounded-2xl animate-in fade-in duration-200">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-in zoom-in duration-300">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-foreground/80 max-w-[280px] text-center truncate">
                {savedTitleRef.current}
              </p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                Registrado
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
