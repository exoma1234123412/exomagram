"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { WeeklyReflection, MoodLevel } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { startOfWeek, endOfWeek, addWeeks, subWeeks, format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Trophy,
  AlertTriangle,
  Lightbulb,
  RefreshCw,
  Target,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  Check,
  Sparkles,
} from "lucide-react";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function getWeekStart(date: Date = new Date()): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function getWeekEnd(weekStartStr: string): string {
  const d = new Date(weekStartStr + "T12:00:00");
  return format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function formatWeekRange(weekStartStr: string): string {
  const start = new Date(weekStartStr + "T12:00:00");
  const end = endOfWeek(start, { weekStartsOn: 1 });
  return `${format(start, "d MMM", { locale: es })} - ${format(end, "d MMM yyyy", { locale: es })}`;
}

// ─────────────────────────────────────────────
// Rating row (1-5 inline)
// ─────────────────────────────────────────────
function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MoodLevel | null;
  onChange: (v: MoodLevel) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-[10px] uppercase text-muted-foreground/60 shrink-0">
        {label}
      </span>
      <div className="flex gap-1">
        {([1, 2, 3, 4, 5] as MoodLevel[]).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
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
    </div>
  );
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
export default function ReflectionPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  // Week navigation
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const isCurrentWeek = weekStart === getWeekStart();

  // Data
  const [currentReflection, setCurrentReflection] = useState<WeeklyReflection | null>(null);
  const [pastReflections, setPastReflections] = useState<WeeklyReflection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedPast, setExpandedPast] = useState<string | null>(null);

  // Form state
  const [biggestWin, setBiggestWin] = useState("");
  const [biggestStruggle, setBiggestStruggle] = useState("");
  const [whatLearned, setWhatLearned] = useState("");
  const [whatWouldChange, setWhatWouldChange] = useState("");
  const [nextWeekPriorities, setNextWeekPriorities] = useState("");
  const [goalsHitPercent, setGoalsHitPercent] = useState(50);
  const [satisfaction, setSatisfaction] = useState<MoodLevel | null>(null);
  const [workLifeBalance, setWorkLifeBalance] = useState<MoodLevel | null>(null);
  const [teamCollaboration, setTeamCollaboration] = useState<MoodLevel | null>(null);
  const [growthFeeling, setGrowthFeeling] = useState<MoodLevel | null>(null);
  const [managerSupport, setManagerSupport] = useState<MoodLevel | null>(null);
  const [growthAreas, setGrowthAreas] = useState("");
  const [skillsDeveloped, setSkillsDeveloped] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [oneWord, setOneWord] = useState("");

  const loadData = useCallback(async () => {
    if (!orgId || !userId) return;
    setLoading(true);

    // Load reflection for selected week
    const { data: current } = await supabase
      .from("weekly_reflections")
      .select("*")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("week_start", weekStart)
      .limit(1)
      .single();

    setCurrentReflection(current as WeeklyReflection | null);

    // Load past reflections (last 12, excluding current)
    const { data: past } = await supabase
      .from("weekly_reflections")
      .select("*")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .neq("week_start", weekStart)
      .order("week_start", { ascending: false })
      .limit(12);

    setPastReflections((past ?? []) as WeeklyReflection[]);
    setLoading(false);
  }, [orgId, userId, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }
    loadData();
  }, [orgLoading, orgId, userId, loadData]);

  // ─── Actions ──────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !orgId) return;
    setSaving(true);

    const priorities = nextWeekPriorities
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const growth = growthAreas
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const skills = skillsDeveloped
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      user_id: userId,
      org_id: orgId,
      week_start: weekStart,
      biggest_win: biggestWin.trim() || null,
      biggest_struggle: biggestStruggle.trim() || null,
      what_learned: whatLearned.trim() || null,
      what_would_change: whatWouldChange.trim() || null,
      next_week_priorities: priorities,
      goals_hit_percent: goalsHitPercent,
      satisfaction,
      work_life_balance: workLifeBalance,
      team_collaboration: teamCollaboration,
      growth_feeling: growthFeeling,
      manager_support: managerSupport,
      growth_areas: growth,
      skills_developed: skills,
      would_recommend_week: wouldRecommend,
      one_word_summary: oneWord.trim() || null,
    };

    const { data, error } = await supabase
      .from("weekly_reflections")
      .upsert(payload, { onConflict: "user_id,org_id,week_start" })
      .select("*")
      .single();

    if (!error && data) {
      setCurrentReflection(data as WeeklyReflection);
    }
    setSaving(false);
  }

  // ─── Week navigation ─────────────────────

  function goToPrevWeek() {
    const d = new Date(weekStart + "T12:00:00");
    setWeekStart(getWeekStart(subWeeks(d, 1)));
  }

  function goToNextWeek() {
    const d = new Date(weekStart + "T12:00:00");
    const next = getWeekStart(addWeeks(d, 1));
    if (next <= getWeekStart()) {
      setWeekStart(next);
    }
  }

  // ─── Loading ──────────────────────────────

  if (loading || orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Reflexion Semanal
        </h1>
        <p className="text-xs font-mono text-muted-foreground mt-1">
          Reflexiona sobre tu semana para mejorar continuamente.
        </p>
      </div>

      {/* Week selector */}
      <div className="flex items-center justify-between mb-8">
        <Button variant="ghost" size="sm" onClick={goToPrevWeek}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-mono font-semibold capitalize">
            {formatWeekRange(weekStart)}
          </p>
          {isCurrentWeek && (
            <p className="text-[10px] font-mono text-muted-foreground">Semana actual</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={goToNextWeek} disabled={isCurrentWeek}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {!isCurrentWeek && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart(getWeekStart())}
              className="font-mono text-xs"
            >
              Hoy
            </Button>
          )}
        </div>
      </div>

      {/* ─── Past reflections (collapsible) ──── */}
      {pastReflections.length > 0 && (
        <section className="mb-8">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3 block">
            REFLEXIONES ANTERIORES
          </span>
          <div className="space-y-1">
            {pastReflections.map((r) => (
              <div key={r.id} className="border border-border">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedPast(expandedPast === r.id ? null : r.id)
                  }
                  className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer hover:bg-accent/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs capitalize">
                      {formatWeekRange(r.week_start)}
                    </span>
                    {r.one_word_summary && (
                      <Badge variant="outline" className="text-[9px] font-mono">
                        {r.one_word_summary}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.goals_hit_percent != null && (
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {r.goals_hit_percent}%
                      </span>
                    )}
                    <ChevronDown
                      className={cn(
                        "w-3 h-3 text-muted-foreground/40 transition-transform",
                        expandedPast === r.id && "rotate-180"
                      )}
                    />
                  </div>
                </button>
                {expandedPast === r.id && (
                  <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                    <ReflectionReadOnly reflection={r} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Current week: form or view ──────── */}
      {currentReflection ? (
        <section className="mb-8">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3 block">
            REFLEXION DE ESTA SEMANA
          </span>
          <div className="border border-green-500/30 bg-green-500/5 p-1 mb-3">
            <div className="flex items-center gap-2 px-2 py-1">
              <Check className="w-3 h-3 text-green-600" />
              <span className="font-mono text-[10px] text-green-600 uppercase tracking-wide">
                Guardada
              </span>
              {currentReflection.one_word_summary && (
                <Badge variant="outline" className="text-[9px] font-mono ml-auto">
                  {currentReflection.one_word_summary}
                </Badge>
              )}
            </div>
          </div>
          <div className="border border-border p-4">
            <ReflectionReadOnly reflection={currentReflection} />
          </div>
        </section>
      ) : (
        <section className="mb-8">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3 block">
            NUEVA REFLEXION
          </span>
          <form onSubmit={handleSubmit} className="border border-border p-4 space-y-5">
            {/* Biggest win */}
            <div>
              <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
                <Trophy className="w-3 h-3 inline mr-1 -mt-0.5" />
                Tu mayor logro esta semana
              </label>
              <Textarea
                value={biggestWin}
                onChange={(e) => setBiggestWin(e.target.value)}
                placeholder="Describe tu mayor logro..."
                rows={2}
                className="font-mono text-xs min-h-[48px]"
              />
            </div>

            {/* Biggest struggle */}
            <div>
              <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
                <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />
                Tu mayor reto
              </label>
              <Textarea
                value={biggestStruggle}
                onChange={(e) => setBiggestStruggle(e.target.value)}
                placeholder="Describe tu mayor reto..."
                rows={2}
                className="font-mono text-xs min-h-[48px]"
              />
            </div>

            {/* What learned */}
            <div>
              <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
                <Lightbulb className="w-3 h-3 inline mr-1 -mt-0.5" />
                Algo que aprendiste
              </label>
              <Textarea
                value={whatLearned}
                onChange={(e) => setWhatLearned(e.target.value)}
                placeholder="Que aprendiste esta semana..."
                rows={2}
                className="font-mono text-xs min-h-[48px]"
              />
            </div>

            {/* What would change */}
            <div>
              <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
                <RefreshCw className="w-3 h-3 inline mr-1 -mt-0.5" />
                Algo que harias diferente
              </label>
              <Textarea
                value={whatWouldChange}
                onChange={(e) => setWhatWouldChange(e.target.value)}
                placeholder="Si pudieras repetir la semana..."
                rows={2}
                className="font-mono text-xs min-h-[48px]"
              />
            </div>

            {/* Next week priorities */}
            <div>
              <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
                <Target className="w-3 h-3 inline mr-1 -mt-0.5" />
                Prioridades para la proxima semana (separar con comas)
              </label>
              <Input
                value={nextWeekPriorities}
                onChange={(e) => setNextWeekPriorities(e.target.value)}
                placeholder="Prioridad 1, Prioridad 2, Prioridad 3"
                className="font-mono text-xs"
              />
            </div>

            {/* Goals hit percent */}
            <div>
              <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
                Metas cumplidas: <span className="font-bold tabular-nums text-foreground">{goalsHitPercent}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={goalsHitPercent}
                onChange={(e) => setGoalsHitPercent(parseInt(e.target.value, 10))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* 5 ratings */}
            <div className="border border-border p-3 space-y-2">
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 block mb-2">
                EVALUACIONES
              </span>
              <RatingRow label="Satisfaccion" value={satisfaction} onChange={setSatisfaction} />
              <RatingRow label="Balance vida-trabajo" value={workLifeBalance} onChange={setWorkLifeBalance} />
              <RatingRow label="Colaboracion del equipo" value={teamCollaboration} onChange={setTeamCollaboration} />
              <RatingRow label="Sensacion de crecimiento" value={growthFeeling} onChange={setGrowthFeeling} />
              <RatingRow label="Soporte del manager" value={managerSupport} onChange={setManagerSupport} />
            </div>

            {/* Growth areas */}
            <div>
              <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
                <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" />
                Areas de crecimiento (separar con comas)
              </label>
              <Input
                value={growthAreas}
                onChange={(e) => setGrowthAreas(e.target.value)}
                placeholder="Comunicacion, liderazgo, tecnico"
                className="font-mono text-xs"
              />
            </div>

            {/* Skills developed */}
            <div>
              <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
                Skills desarrollados (separar con comas)
              </label>
              <Input
                value={skillsDeveloped}
                onChange={(e) => setSkillsDeveloped(e.target.value)}
                placeholder="React, SQL, presentaciones"
                className="font-mono text-xs"
              />
            </div>

            {/* Would recommend */}
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase text-muted-foreground/60">
                Recomendarias esta semana?
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setWouldRecommend(true)}
                  className={cn(
                    "w-8 h-8 border border-border flex items-center justify-center cursor-pointer transition-colors",
                    wouldRecommend === true && "bg-green-500/10 border-green-500 text-green-600"
                  )}
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setWouldRecommend(false)}
                  className={cn(
                    "w-8 h-8 border border-border flex items-center justify-center cursor-pointer transition-colors",
                    wouldRecommend === false && "bg-red-500/10 border-red-500 text-red-600"
                  )}
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* One word */}
            <div>
              <label className="font-mono text-[10px] uppercase text-muted-foreground/60 mb-1 block">
                Una palabra para describir la semana
              </label>
              <Input
                value={oneWord}
                onChange={(e) => setOneWord(e.target.value)}
                placeholder="productiva"
                maxLength={30}
                className="font-mono text-xs w-48"
              />
            </div>

            {/* Submit */}
            <Button type="submit" disabled={saving} className="font-mono text-xs">
              {saving ? "Guardando..." : "Guardar reflexion"}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Read-only view of a reflection
// ─────────────────────────────────────────────
function ReflectionReadOnly({ reflection }: { reflection: WeeklyReflection }) {
  const r = reflection;

  return (
    <div className="space-y-3">
      {r.biggest_win && (
        <div>
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
            Mayor logro
          </span>
          <p className="text-sm mt-0.5">{r.biggest_win}</p>
        </div>
      )}
      {r.biggest_struggle && (
        <div>
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
            Mayor reto
          </span>
          <p className="text-sm mt-0.5">{r.biggest_struggle}</p>
        </div>
      )}
      {r.what_learned && (
        <div>
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
            Aprendizaje
          </span>
          <p className="text-sm mt-0.5">{r.what_learned}</p>
        </div>
      )}
      {r.what_would_change && (
        <div>
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
            Haria diferente
          </span>
          <p className="text-sm mt-0.5">{r.what_would_change}</p>
        </div>
      )}
      {r.next_week_priorities.length > 0 && (
        <div>
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
            Prioridades
          </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {r.next_week_priorities.map((p, i) => (
              <Badge key={i} variant="outline" className="text-[10px] font-mono">
                {p}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {r.goals_hit_percent != null && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
            Metas cumplidas
          </span>
          <span className="font-mono text-xs tabular-nums font-bold">{r.goals_hit_percent}%</span>
        </div>
      )}

      {/* Ratings grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: "Satisfaccion", value: r.satisfaction },
          { label: "Balance", value: r.work_life_balance },
          { label: "Equipo", value: r.team_collaboration },
          { label: "Crecimiento", value: r.growth_feeling },
          { label: "Manager", value: r.manager_support },
        ]
          .filter((item) => item.value != null)
          .map((item) => (
            <div
              key={item.label}
              className="bg-accent/30 border border-border p-2 text-center"
            >
              <p className="font-mono text-xs tabular-nums font-bold">{item.value}/5</p>
              <p className="font-mono text-[8px] text-muted-foreground/50 uppercase">
                {item.label}
              </p>
            </div>
          ))}
      </div>

      {/* Tags */}
      {r.growth_areas.length > 0 && (
        <div>
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
            Areas de crecimiento
          </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {r.growth_areas.map((a, i) => (
              <Badge key={i} variant="outline" className="text-[10px] font-mono">
                {a}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {r.skills_developed.length > 0 && (
        <div>
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
            Skills
          </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {r.skills_developed.map((s, i) => (
              <Badge key={i} variant="outline" className="text-[10px] font-mono">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Recommend */}
      {r.would_recommend_week != null && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
            Recomendaria
          </span>
          {r.would_recommend_week ? (
            <ThumbsUp className="w-3.5 h-3.5 text-green-600" />
          ) : (
            <ThumbsDown className="w-3.5 h-3.5 text-red-500" />
          )}
        </div>
      )}
    </div>
  );
}
