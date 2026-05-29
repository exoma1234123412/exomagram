"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { subDays, format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Heart,
  Brain,
  Zap,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
} from "lucide-react";

interface DayStats {
  date: string;
  avgMood: number | null;
  avgEnergy: number | null;
  totalHours: number;
  deepWorkHours: number;
  meetingHours: number;
  blockedHours: number;
  uniqueCategories: number;
}

export default function HealthPage() {
  const [dayStats, setDayStats] = useState<DayStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusScores, setFocusScores] = useState<Map<string, number>>(new Map());
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string }>();
      if (!membership) { setLoading(false); return; }

      const endDate = new Date().toISOString().split("T")[0];
      const startDate = subDays(new Date(), 14).toISOString().split("T")[0];

      const { data: entries } = await supabase
        .from("time_entries")
        .select("*")
        .eq("org_id", membership.org_id)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date")
        .order("hour");

      if (!entries) { setLoading(false); return; }

      // Group by date
      const byDate = new Map<string, typeof entries>();
      for (const e of entries) {
        const list = byDate.get(e.date) ?? [];
        list.push(e);
        byDate.set(e.date, list);
      }

      const stats: DayStats[] = [];
      const focusMap = new Map<string, number>();

      for (const [date, dayEntries] of byDate) {
        const moods = dayEntries.filter((e) => e.mood).map((e) => e.mood as number);
        const energies = dayEntries.filter((e) => e.energy).map((e) => e.energy as number);
        const deepWork = dayEntries.filter((e) => e.category === "deep_work");
        const meetings = dayEntries.filter((e) => e.category === "meeting");
        const blocked = dayEntries.filter((e) => e.category === "blocked");
        const categories = new Set(dayEntries.map((e) => e.category));

        // Focus score: consecutive deep work hours without switching
        let maxConsecutive = 0;
        let current = 0;
        const sorted = [...dayEntries].sort((a, b) => a.hour - b.hour);
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].category === "deep_work") {
            current++;
            if (i > 0 && sorted[i].hour === sorted[i - 1].hour + 1 && sorted[i - 1].category === "deep_work") {
              // consecutive
            } else if (current > 1) {
              current = 1;
            }
            maxConsecutive = Math.max(maxConsecutive, current);
          } else {
            current = 0;
          }
        }

        // Context switching penalty
        let switches = 0;
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].category !== sorted[i - 1].category) switches++;
        }
        const switchPenalty = sorted.length > 1 ? switches / (sorted.length - 1) : 0;
        const focusScore = Math.max(0, Math.min(100,
          Math.round((maxConsecutive / Math.max(EXPECTED_DAILY_HOURS * 0.5, 1)) * 60 + (1 - switchPenalty) * 40)
        ));
        focusMap.set(date, focusScore);

        stats.push({
          date,
          avgMood: moods.length > 0 ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
          avgEnergy: energies.length > 0 ? energies.reduce((a, b) => a + b, 0) / energies.length : null,
          totalHours: dayEntries.length,
          deepWorkHours: deepWork.length,
          meetingHours: meetings.length,
          blockedHours: blocked.length,
          uniqueCategories: categories.size,
        });
      }

      setDayStats(stats);
      setFocusScores(focusMap);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" /><p className="text-sm text-muted-foreground animate-pulse">Cargando...</p></div>
    );
  }

  // Aggregate stats
  const last7 = dayStats.slice(-7);
  const prev7 = dayStats.slice(-14, -7);

  function avg(arr: (number | null)[]) {
    const valid = arr.filter((n): n is number => n !== null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  }

  const currentMood = avg(last7.map((d) => d.avgMood));
  const prevMood = avg(prev7.map((d) => d.avgMood));
  const currentEnergy = avg(last7.map((d) => d.avgEnergy));
  const prevEnergy = avg(prev7.map((d) => d.avgEnergy));
  const currentDeepWork = avg(last7.map((d) => d.deepWorkHours));
  const prevDeepWork = avg(prev7.map((d) => d.deepWorkHours));
  const currentMeetings = avg(last7.map((d) => d.meetingHours));
  const currentBlocked = avg(last7.map((d) => d.blockedHours));
  const avgFocus = avg(last7.map((d) => focusScores.get(d.date) ?? null));

  function trend(curr: number | null, prev: number | null) {
    if (curr === null || prev === null) return "flat";
    if (curr > prev + 0.3) return "up";
    if (curr < prev - 0.3) return "down";
    return "flat";
  }

  const TrendIcon = ({ t }: { t: string }) =>
    t === "up" ? <TrendingUp className="w-4 h-4 text-green-500" /> :
    t === "down" ? <TrendingDown className="w-4 h-4 text-red-500" /> :
    <Minus className="w-4 h-4 text-gray-400" />;

  // Burnout detection
  const burnoutRisk =
    (currentMood !== null && currentMood < 2.5) ||
    (currentEnergy !== null && currentEnergy < 2.5) ||
    (currentBlocked !== null && currentBlocked > 2);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Heart className="w-6 h-6 text-red-500" />
          Salud del Equipo
        </h1>
        <p className="text-muted-foreground text-sm">Últimos 14 días de datos del equipo</p>
      </div>

      {burnoutRisk && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-700 dark:text-red-400">Riesgo de burnout detectado</p>
            <p className="text-sm text-red-600/70 mt-0.5">
              El ánimo y/o energía del equipo están bajos, o hay muchas horas de bloqueo.
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-4 text-center">
            <Heart className="w-5 h-5 mx-auto text-red-500 mb-1" />
            <div className="flex items-center justify-center gap-1">
              <p className="text-2xl font-bold">{currentMood?.toFixed(1) ?? "-"}</p>
              <TrendIcon t={trend(currentMood, prevMood)} />
            </div>
            <p className="text-xs text-muted-foreground">Ánimo promedio</p>
          </CardContent>
        </Card>
        <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-4 text-center">
            <Zap className="w-5 h-5 mx-auto text-yellow-500 mb-1" />
            <div className="flex items-center justify-center gap-1">
              <p className="text-2xl font-bold">{currentEnergy?.toFixed(1) ?? "-"}</p>
              <TrendIcon t={trend(currentEnergy, prevEnergy)} />
            </div>
            <p className="text-xs text-muted-foreground">Energía promedio</p>
          </CardContent>
        </Card>
        <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-4 text-center">
            <Brain className="w-5 h-5 mx-auto text-primary mb-1" />
            <div className="flex items-center justify-center gap-1">
              <p className="text-2xl font-bold">{avgFocus?.toFixed(0) ?? "-"}</p>
            </div>
            <p className="text-xs text-muted-foreground">Focus Score</p>
          </CardContent>
        </Card>
        <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-4 text-center">
            <Flame className="w-5 h-5 mx-auto text-orange-500 mb-1" />
            <div className="flex items-center justify-center gap-1">
              <p className="text-2xl font-bold">{currentDeepWork?.toFixed(1) ?? "-"}h</p>
              <TrendIcon t={trend(currentDeepWork, prevDeepWork)} />
            </div>
            <p className="text-xs text-muted-foreground">Deep work/día</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily breakdown chart (text-based) */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Tendencia diaria</CardTitle>
        </CardHeader>
        <CardContent>
          {dayStats.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay datos suficientes.</p>
          ) : (
            <div className="space-y-2">
              {last7.map((d) => {
                const focus = focusScores.get(d.date) ?? 0;
                return (
                  <div key={d.date} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20 capitalize">
                      {format(new Date(d.date + "T12:00:00"), "EEE d", { locale: es })}
                    </span>
                    {/* Stacked bar */}
                    <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden flex">
                      {d.deepWorkHours > 0 && (
                        <div className="bg-violet-500 h-full" style={{ width: `${(d.deepWorkHours / EXPECTED_DAILY_HOURS) * 100}%` }}
                          title={`${d.deepWorkHours}h deep work`}
                        />
                      )}
                      {d.meetingHours > 0 && (
                        <div className="bg-blue-500 h-full" style={{ width: `${(d.meetingHours / EXPECTED_DAILY_HOURS) * 100}%` }}
                          title={`${d.meetingHours}h meetings`}
                        />
                      )}
                      {d.blockedHours > 0 && (
                        <div className="bg-red-500 h-full" style={{ width: `${(d.blockedHours / EXPECTED_DAILY_HOURS) * 100}%` }}
                          title={`${d.blockedHours}h blocked`}
                        />
                      )}
                      {(d.totalHours - d.deepWorkHours - d.meetingHours - d.blockedHours) > 0 && (
                        <div className="bg-slate-400 h-full" style={{
                          width: `${((d.totalHours - d.deepWorkHours - d.meetingHours - d.blockedHours) / EXPECTED_DAILY_HOURS) * 100}%`
                        }} />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{d.totalHours}h</span>
                    <span className={cn(
                      "text-xs w-10 text-right font-medium",
                      focus >= 70 ? "text-green-600" : focus >= 40 ? "text-yellow-600" : "text-red-600"
                    )}>
                      F:{focus}
                    </span>
                    {d.avgMood !== null && (
                      <span className="text-xs w-6">{"★".repeat(Math.round(d.avgMood))}</span>
                    )}
                  </div>
                );
              })}
              {/* Legend */}
              <div className="flex gap-4 mt-3 pt-3 border-t">
                <span className="flex items-center gap-1 text-xs">
                  <div className="w-3 h-3 bg-violet-500 rounded-sm" /> Deep Work
                </span>
                <span className="flex items-center gap-1 text-xs">
                  <div className="w-3 h-3 bg-blue-500 rounded-sm" /> Reuniones
                </span>
                <span className="flex items-center gap-1 text-xs">
                  <div className="w-3 h-3 bg-red-500 rounded-sm" /> Bloqueado
                </span>
                <span className="flex items-center gap-1 text-xs">
                  <div className="w-3 h-3 bg-slate-400 rounded-sm" /> Otro
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {currentMeetings !== null && currentMeetings > 3 && (
            <p className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              El equipo pasa ~{currentMeetings.toFixed(1)}h/día en reuniones. Consideren reducirlas.
            </p>
          )}
          {currentBlocked !== null && currentBlocked > 1 && (
            <p className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Promedio de {currentBlocked.toFixed(1)}h/día bloqueados. Investigar las causas.
            </p>
          )}
          {currentDeepWork !== null && prevDeepWork !== null && currentDeepWork < prevDeepWork - 1 && (
            <p className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              Deep work bajó de {prevDeepWork.toFixed(1)}h a {currentDeepWork.toFixed(1)}h esta semana.
            </p>
          )}
          {currentMood !== null && currentMood >= 4 && (
            <p className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-green-500" />
              El ánimo del equipo está bien ({currentMood.toFixed(1)}/5).
            </p>
          )}
          {dayStats.length === 0 && (
            <p className="text-muted-foreground">No hay datos suficientes para generar insights.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
