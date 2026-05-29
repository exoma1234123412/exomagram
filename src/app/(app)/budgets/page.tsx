"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { startOfWeek, endOfWeek } from "date-fns";
import { PieChart, AlertTriangle, CheckCircle2, Settings2, Save } from "lucide-react";

interface Budget {
  category: WorkCategory;
  type: "min" | "max";
  hours: number;
}

interface BudgetStatus extends Budget {
  actual: number;
  onTrack: boolean;
}

const STORAGE_KEY = "exomagram_time_budgets";

function loadBudgets(): Budget[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveBudgets(budgets: Budget[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(budgets));
}

const CATEGORY_COLORS: Record<string, string> = {
  deep_work: "bg-violet-500", meeting: "bg-blue-500", review: "bg-amber-500",
  admin: "bg-slate-400", planning: "bg-emerald-500", learning: "bg-pink-500",
  break: "bg-green-400", blocked: "bg-red-500",
};

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [statuses, setStatuses] = useState<BudgetStatus[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // Draft state for editing
  const [drafts, setDrafts] = useState<Map<string, { type: "min" | "max"; hours: number }>>(new Map());

  useEffect(() => {
    setBudgets(loadBudgets());
  }, []);

  useEffect(() => {
    async function loadActual() {
      if (budgets.length === 0) { setLoading(false); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string }>();

      if (!membership) { setLoading(false); return; }

      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().split("T")[0];
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().split("T")[0];

      const { data: entries } = await supabase
        .from("time_entries")
        .select("category")
        .eq("user_id", user.id)
        .eq("org_id", membership.org_id)
        .gte("date", weekStart)
        .lte("date", weekEnd);

      const catHours = new Map<WorkCategory, number>();
      for (const e of entries ?? []) {
        catHours.set(e.category as WorkCategory, (catHours.get(e.category as WorkCategory) ?? 0) + 1);
      }

      const results: BudgetStatus[] = budgets.map((b) => {
        const actual = catHours.get(b.category) ?? 0;
        const onTrack = b.type === "min" ? actual >= b.hours : actual <= b.hours;
        return { ...b, actual, onTrack };
      });

      setStatuses(results);
      setLoading(false);
    }
    loadActual();
  }, [budgets]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    const newBudgets: Budget[] = [];
    for (const [cat, draft] of drafts) {
      if (draft.hours > 0) {
        newBudgets.push({ category: cat as WorkCategory, type: draft.type, hours: draft.hours });
      }
    }
    saveBudgets(newBudgets);
    setBudgets(newBudgets);
    setEditing(false);
  }

  function startEditing() {
    const map = new Map<string, { type: "min" | "max"; hours: number }>();
    for (const b of budgets) {
      map.set(b.category, { type: b.type, hours: b.hours });
    }
    setDrafts(map);
    setEditing(true);
  }

  const onTrackCount = statuses.filter((s) => s.onTrack).length;
  const offTrackCount = statuses.filter((s) => !s.onTrack).length;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PieChart className="w-6 h-6 text-primary" />
            Time Budgets
          </h1>
          <p className="text-muted-foreground text-sm">
            Limites semanales por categoria
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => editing ? handleSave() : startEditing()}
          className="gap-2"
        >
          {editing ? <><Save className="w-4 h-4" /> Guardar</> : <><Settings2 className="w-4 h-4" /> Configurar</>}
        </Button>
      </div>

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Configurar limites semanales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(Object.keys(CATEGORIES) as WorkCategory[]).map((cat) => {
                const draft = drafts.get(cat) ?? { type: "max" as const, hours: 0 };
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <div className={cn("w-4 h-4 rounded-sm shrink-0", CATEGORY_COLORS[cat])} />
                    <span className="text-sm w-24 shrink-0">
                      {CATEGORIES[cat].emoji} {CATEGORIES[cat].label}
                    </span>
                    <select
                      value={draft.type}
                      onChange={(e) => {
                        const newDrafts = new Map(drafts);
                        newDrafts.set(cat, { ...draft, type: e.target.value as "min" | "max" });
                        setDrafts(newDrafts);
                      }}
                      className="text-sm border rounded px-2 py-1 bg-background"
                    >
                      <option value="min">Minimo</option>
                      <option value="max">Maximo</option>
                    </select>
                    <Input
                      type="number"
                      min={0}
                      max={40}
                      value={draft.hours || ""}
                      onChange={(e) => {
                        const newDrafts = new Map(drafts);
                        newDrafts.set(cat, { ...draft, hours: parseInt(e.target.value) || 0 });
                        setDrafts(newDrafts);
                      }}
                      className="w-20"
                      placeholder="0"
                    />
                    <span className="text-xs text-muted-foreground">h/semana</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : budgets.length === 0 ? (
        <div className="text-center py-20">
          <PieChart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No hay budgets configurados.</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Configura limites semanales para controlar como distribuyes tu tiempo.
          </p>
          <Button variant="outline" className="mt-4" onClick={startEditing}>
            Configurar budgets
          </Button>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="flex gap-3 mb-8">
            {onTrackCount > 0 && (
              <Badge variant="outline" className="text-green-600 border-green-300 gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {onTrackCount} en meta
              </Badge>
            )}
            {offTrackCount > 0 && (
              <Badge variant="outline" className="text-red-600 border-red-300 gap-1">
                <AlertTriangle className="w-3 h-3" />
                {offTrackCount} fuera de meta
              </Badge>
            )}
          </div>

          {/* Budget cards */}
          <div className="space-y-3">
            {statuses.map((s) => {
              const pct = s.hours > 0 ? Math.min((s.actual / s.hours) * 100, 150) : 0;
              const isOver = s.type === "max" && s.actual > s.hours;
              const isUnder = s.type === "min" && s.actual < s.hours;

              return (
                <Card key={s.category} className={cn(
                  "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
                  !s.onTrack && "border-red-200 dark:border-red-800"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-4 h-4 rounded-sm", CATEGORY_COLORS[s.category])} />
                        <span className="text-sm font-medium">
                          {CATEGORIES[s.category].emoji} {CATEGORIES[s.category].label}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {s.type === "min" ? "Min" : "Max"} {s.hours}h
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm font-bold tabular-nums tracking-tight",
                          s.onTrack ? "text-green-600" : "text-red-600"
                        )}>
                          {s.actual}h
                        </span>
                        {s.onTrack ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          s.onTrack ? CATEGORY_COLORS[s.category] : "bg-red-500"
                        )}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    {!s.onTrack && (
                      <p className="text-[10px] text-red-600 mt-1">
                        {isOver && `Excedido por ${s.actual - s.hours}h`}
                        {isUnder && `Faltan ${s.hours - s.actual}h para la meta`}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
