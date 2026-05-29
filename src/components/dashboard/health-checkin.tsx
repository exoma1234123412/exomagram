"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { EXERCISE_TYPES } from "@/lib/constants";
import type { DailyHealth, MoodLevel } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, getTodayMTY } from "@/lib/utils";
import {
  Heart,
  Moon,
  Dumbbell,
  Droplets,
  UtensilsCrossed,
  Brain,
  Flame,
  Monitor,
  Coffee,
  AlertTriangle,
  Check,
} from "lucide-react";

// ─────────────────────────────────────────────
// Rating button row (1-5)
// ─────────────────────────────────────────────
function RatingButtons({
  value,
  onChange,
  labels,
}: {
  value: MoodLevel | null;
  onChange: (v: MoodLevel) => void;
  labels?: Record<number, string>;
}) {
  return (
    <div className="flex gap-1">
      {([1, 2, 3, 4, 5] as MoodLevel[]).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          title={labels?.[n] ?? String(n)}
          className={cn(
            "w-6 h-6 text-[10px] font-mono border border-border cursor-pointer transition-colors",
            value === n
              ? "bg-primary text-primary-foreground border-primary"
              : "hover:border-primary/40"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
export function HealthCheckin({ orgId }: { orgId: string }) {
  const { userId } = useOrg();
  const supabase = createClient();
  const today = getTodayMTY();

  const [existing, setExisting] = useState<DailyHealth | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [sleepHours, setSleepHours] = useState<string>("");
  const [sleepQuality, setSleepQuality] = useState<MoodLevel | null>(null);
  const [exerciseMinutes, setExerciseMinutes] = useState<string>("");
  const [exerciseType, setExerciseType] = useState<string>("none");
  const [hydration, setHydration] = useState<MoodLevel | null>(null);
  const [meals, setMeals] = useState<string>("");
  const [stressMorning, setStressMorning] = useState<MoodLevel | null>(null);
  const [mentalClarity, setMentalClarity] = useState<MoodLevel | null>(null);
  const [motivation, setMotivation] = useState<MoodLevel | null>(null);
  const [screenTime, setScreenTime] = useState<string>("");
  const [breaks, setBreaks] = useState<string>("");
  const [overtime, setOvertime] = useState(false);
  const [personalIssues, setPersonalIssues] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function load() {
      if (!userId) return;
      const { data } = await supabase
        .from("daily_health")
        .select("*")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("date", today)
        .limit(1)
        .single();

      if (data) setExisting(data as DailyHealth);
      setLoaded(true);
    }
    load();
  }, [userId, orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);

    const payload = {
      user_id: userId,
      org_id: orgId,
      date: today,
      sleep_hours: sleepHours ? parseFloat(sleepHours) : null,
      sleep_quality: sleepQuality,
      exercise_minutes: exerciseMinutes ? parseInt(exerciseMinutes, 10) : 0,
      exercise_type: exerciseType !== "none" ? exerciseType : null,
      hydration_level: hydration,
      meals_count: meals ? parseInt(meals, 10) : null,
      stress_morning: stressMorning,
      stress_evening: null,
      mental_clarity: mentalClarity,
      motivation_level: motivation,
      screen_time_hours: screenTime ? parseFloat(screenTime) : 0,
      breaks_taken: breaks ? parseInt(breaks, 10) : 0,
      worked_overtime: overtime,
      personal_issues: personalIssues,
      notes: notes.trim() || null,
    };

    const { data, error } = await supabase
      .from("daily_health")
      .upsert(payload, { onConflict: "user_id,org_id,date" })
      .select("*")
      .single();

    if (!error && data) {
      setExisting(data as DailyHealth);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  if (!loaded) return null;

  // ─── Summary view (already submitted) ────
  if (existing && !saved) {
    return (
      <div className="border border-border p-4 mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
            CHECK-IN DE SALUD
          </span>
          <span className="flex items-center gap-1 text-[10px] font-mono text-green-600">
            <Check className="w-3 h-3" /> Registrado
          </span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {existing.sleep_hours != null && (
            <div className="bg-accent/30 border border-border p-2 text-center">
              <Moon className="w-3 h-3 text-primary mx-auto mb-1" />
              <p className="font-mono text-xs tabular-nums font-bold">{existing.sleep_hours}h</p>
              <p className="font-mono text-[8px] text-muted-foreground/50 uppercase">Sueno</p>
            </div>
          )}
          {existing.exercise_minutes > 0 && (
            <div className="bg-accent/30 border border-border p-2 text-center">
              <Dumbbell className="w-3 h-3 text-primary mx-auto mb-1" />
              <p className="font-mono text-xs tabular-nums font-bold">{existing.exercise_minutes}m</p>
              <p className="font-mono text-[8px] text-muted-foreground/50 uppercase">Ejercicio</p>
            </div>
          )}
          {existing.hydration_level != null && (
            <div className="bg-accent/30 border border-border p-2 text-center">
              <Droplets className="w-3 h-3 text-primary mx-auto mb-1" />
              <p className="font-mono text-xs tabular-nums font-bold">{existing.hydration_level}/5</p>
              <p className="font-mono text-[8px] text-muted-foreground/50 uppercase">Agua</p>
            </div>
          )}
          {existing.mental_clarity != null && (
            <div className="bg-accent/30 border border-border p-2 text-center">
              <Brain className="w-3 h-3 text-primary mx-auto mb-1" />
              <p className="font-mono text-xs tabular-nums font-bold">{existing.mental_clarity}/5</p>
              <p className="font-mono text-[8px] text-muted-foreground/50 uppercase">Claridad</p>
            </div>
          )}
          {existing.motivation_level != null && (
            <div className="bg-accent/30 border border-border p-2 text-center">
              <Flame className="w-3 h-3 text-primary mx-auto mb-1" />
              <p className="font-mono text-xs tabular-nums font-bold">{existing.motivation_level}/5</p>
              <p className="font-mono text-[8px] text-muted-foreground/50 uppercase">Motivacion</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Saved confirmation ───────────────────
  if (saved) {
    return (
      <div className="border border-green-500/30 bg-green-500/5 p-4 mb-8">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-green-600" />
          <span className="font-mono text-xs text-green-600 font-bold uppercase tracking-wide">
            Registrado
          </span>
        </div>
      </div>
    );
  }

  // ─── Form view ────────────────────────────
  return (
    <div className="border border-border p-4 mb-8">
      <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3 block">
        CHECK-IN DE SALUD
      </span>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1: Sueno */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 min-w-[80px]">
            <Moon className="w-3 h-3 text-muted-foreground/60" />
            <span className="font-mono text-[10px] uppercase text-muted-foreground/60">Sueno</span>
          </div>
          <Input
            type="number"
            min={0}
            max={24}
            step={0.5}
            placeholder="h"
            value={sleepHours}
            onChange={(e) => setSleepHours(e.target.value)}
            className="font-mono text-xs w-16 h-7 px-2"
          />
          <RatingButtons value={sleepQuality} onChange={setSleepQuality} />
        </div>

        {/* Row 2: Ejercicio */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 min-w-[80px]">
            <Dumbbell className="w-3 h-3 text-muted-foreground/60" />
            <span className="font-mono text-[10px] uppercase text-muted-foreground/60">Ejercicio</span>
          </div>
          <Input
            type="number"
            min={0}
            max={300}
            placeholder="min"
            value={exerciseMinutes}
            onChange={(e) => setExerciseMinutes(e.target.value)}
            className="font-mono text-xs w-16 h-7 px-2"
          />
          <select
            value={exerciseType}
            onChange={(e) => setExerciseType(e.target.value)}
            className="font-mono text-xs h-7 px-2 border border-border bg-transparent"
          >
            {Object.entries(EXERCISE_TYPES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Row 3: Hidratacion */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 min-w-[80px]">
            <Droplets className="w-3 h-3 text-muted-foreground/60" />
            <span className="font-mono text-[10px] uppercase text-muted-foreground/60">Hidratacion</span>
          </div>
          <RatingButtons value={hydration} onChange={setHydration} />
        </div>

        {/* Row 4: Comidas */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 min-w-[80px]">
            <UtensilsCrossed className="w-3 h-3 text-muted-foreground/60" />
            <span className="font-mono text-[10px] uppercase text-muted-foreground/60">Comidas</span>
          </div>
          <Input
            type="number"
            min={0}
            max={10}
            placeholder="#"
            value={meals}
            onChange={(e) => setMeals(e.target.value)}
            className="font-mono text-xs w-16 h-7 px-2"
          />
        </div>

        {/* Row 5: Estres manana */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 min-w-[80px]">
            <AlertTriangle className="w-3 h-3 text-muted-foreground/60" />
            <span className="font-mono text-[10px] uppercase text-muted-foreground/60">Estres</span>
          </div>
          <RatingButtons value={stressMorning} onChange={setStressMorning} />
        </div>

        {/* Row 6: Claridad mental */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 min-w-[80px]">
            <Brain className="w-3 h-3 text-muted-foreground/60" />
            <span className="font-mono text-[10px] uppercase text-muted-foreground/60">Claridad</span>
          </div>
          <RatingButtons value={mentalClarity} onChange={setMentalClarity} />
        </div>

        {/* Row 7: Motivacion */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 min-w-[80px]">
            <Flame className="w-3 h-3 text-muted-foreground/60" />
            <span className="font-mono text-[10px] uppercase text-muted-foreground/60">Motivacion</span>
          </div>
          <RatingButtons value={motivation} onChange={setMotivation} />
        </div>

        {/* Row 8: Pantalla + Descansos */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Monitor className="w-3 h-3 text-muted-foreground/60" />
            <span className="font-mono text-[10px] uppercase text-muted-foreground/60">Pantalla</span>
            <Input
              type="number"
              min={0}
              max={24}
              step={0.5}
              placeholder="h"
              value={screenTime}
              onChange={(e) => setScreenTime(e.target.value)}
              className="font-mono text-xs w-16 h-7 px-2"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Coffee className="w-3 h-3 text-muted-foreground/60" />
            <span className="font-mono text-[10px] uppercase text-muted-foreground/60">Descansos</span>
            <Input
              type="number"
              min={0}
              max={20}
              placeholder="#"
              value={breaks}
              onChange={(e) => setBreaks(e.target.value)}
              className="font-mono text-xs w-16 h-7 px-2"
            />
          </div>
        </div>

        {/* Row 9: Checkboxes */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={overtime}
              onChange={(e) => setOvertime(e.target.checked)}
              className="accent-primary"
            />
            <span className="font-mono text-[10px] uppercase text-muted-foreground/60">Overtime</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={personalIssues}
              onChange={(e) => setPersonalIssues(e.target.checked)}
              className="accent-primary"
            />
            <span className="font-mono text-[10px] uppercase text-muted-foreground/60">Problemas personales</span>
          </label>
        </div>

        {/* Row 10: Notas */}
        <Textarea
          placeholder="Notas (opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="font-mono text-xs min-h-[48px]"
        />

        {/* Submit */}
        <Button
          type="submit"
          disabled={saving}
          className="font-mono text-xs"
        >
          {saving ? "Guardando..." : "Registrar"}
        </Button>
      </form>
    </div>
  );
}
