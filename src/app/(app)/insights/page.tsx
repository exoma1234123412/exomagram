"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { CATEGORIES, WORK_HOURS, MOOD_LABELS, ENERGY_LABELS, EXPECTED_DAILY_HOURS, CATEGORY_COLORS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Lightbulb,
  Brain,
  Clock,
  TrendingUp,
  Zap,
  Sun,
  Moon,
  BarChart3,
} from "lucide-react";

interface DayPattern {
  dayOfWeek: number;
  avgHours: number;
  avgMood: number;
  avgEnergy: number;
}

const DAY_NAMES = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];

export default function InsightsPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [peakHours, setPeakHours] = useState<{ hour: number; count: number }[]>([]);
  const [dayPatterns, setDayPatterns] = useState<DayPattern[]>([]);
  const [focusScore, setFocusScore] = useState(0);
  const [avgDeepWorkBlock, setAvgDeepWorkBlock] = useState(0);
  const [moodByCategory, setMoodByCategory] = useState<{ category: WorkCategory; avgMood: number; count: number }[]>([]);
  const [energyByHour, setEnergyByHour] = useState<Map<number, number>>(new Map());
  const [insights, setInsights] = useState<string[]>([]);
  const [categoryTrend, setCategoryTrend] = useState<{ category: WorkCategory; percent: number; delta: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!orgId || !userId) return;

    async function load() {
      // Get last 30 days of entries
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split("T")[0];

      const { data: entries } = await supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", userId!)
        .eq("org_id", orgId!)
        .gte("date", startDate)
        .order("date", { ascending: true })
        .order("hour", { ascending: true });

      if (!entries || entries.length === 0) { setLoading(false); return; }

      // 1. Peak productivity hours
      const hourCounts = new Map<number, number>();
      for (const e of entries) {
        hourCounts.set(e.hour, (hourCounts.get(e.hour) ?? 0) + 1);
      }
      const peakHoursList = Array.from(hourCounts.entries())
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => b.count - a.count);
      setPeakHours(peakHoursList);

      // 2. Day of week patterns
      const dayData = new Map<number, { hours: number; moods: number[]; energies: number[]; days: Set<string> }>();
      for (const e of entries) {
        const dow = new Date(e.date + "T12:00:00").getDay();
        const d = dayData.get(dow) ?? { hours: 0, moods: [], energies: [], days: new Set() };
        d.hours++;
        d.days.add(e.date);
        if (e.mood) d.moods.push(e.mood);
        if (e.energy) d.energies.push(e.energy);
        dayData.set(dow, d);
      }
      const patterns: DayPattern[] = [];
      for (let dow = 0; dow < 7; dow++) {
        const d = dayData.get(dow);
        if (!d) { patterns.push({ dayOfWeek: dow, avgHours: 0, avgMood: 0, avgEnergy: 0 }); continue; }
        patterns.push({
          dayOfWeek: dow,
          avgHours: d.days.size > 0 ? Math.round((d.hours / d.days.size) * 10) / 10 : 0,
          avgMood: d.moods.length > 0 ? Math.round((d.moods.reduce((a, b) => a + b, 0) / d.moods.length) * 10) / 10 : 0,
          avgEnergy: d.energies.length > 0 ? Math.round((d.energies.reduce((a, b) => a + b, 0) / d.energies.length) * 10) / 10 : 0,
        });
      }
      setDayPatterns(patterns);

      // 3. Focus score (contiguous deep_work blocks)
      const deepByDate = new Map<string, number[]>();
      for (const e of entries) {
        if (e.category === "deep_work") {
          const arr = deepByDate.get(e.date) ?? [];
          arr.push(e.hour);
          deepByDate.set(e.date, arr);
        }
      }
      let totalDeep = 0;
      let contiguous = 0;
      const blockLengths: number[] = [];
      for (const [, hours] of deepByDate) {
        hours.sort((a, b) => a - b);
        totalDeep += hours.length;
        let blockLen = 1;
        for (let i = 1; i < hours.length; i++) {
          if (hours[i] === hours[i - 1] + 1) {
            blockLen++;
          } else {
            if (blockLen >= 2) contiguous += blockLen;
            blockLengths.push(blockLen);
            blockLen = 1;
          }
        }
        if (blockLen >= 2) contiguous += blockLen;
        blockLengths.push(blockLen);
      }
      setFocusScore(totalDeep > 0 ? Math.round((contiguous / totalDeep) * 100) : 0);
      setAvgDeepWorkBlock(blockLengths.length > 0 ? Math.round((blockLengths.reduce((a, b) => a + b, 0) / blockLengths.length) * 10) / 10 : 0);

      // 4. Mood by category
      const catMoods = new Map<WorkCategory, { moods: number[]; count: number }>();
      for (const e of entries) {
        const d = catMoods.get(e.category as WorkCategory) ?? { moods: [], count: 0 };
        d.count++;
        if (e.mood) d.moods.push(e.mood);
        catMoods.set(e.category as WorkCategory, d);
      }
      setMoodByCategory(
        Array.from(catMoods.entries())
          .filter(([, d]) => d.moods.length > 0)
          .map(([cat, d]) => ({
            category: cat,
            avgMood: Math.round((d.moods.reduce((a, b) => a + b, 0) / d.moods.length) * 10) / 10,
            count: d.count,
          }))
          .sort((a, b) => b.avgMood - a.avgMood)
      );

      // 5. Energy by hour
      const energyByH = new Map<number, { sum: number; count: number }>();
      for (const e of entries) {
        if (e.energy) {
          const d = energyByH.get(e.hour) ?? { sum: 0, count: 0 };
          d.sum += e.energy;
          d.count++;
          energyByH.set(e.hour, d);
        }
      }
      const energyMap = new Map<number, number>();
      for (const [h, d] of energyByH) {
        energyMap.set(h, Math.round((d.sum / d.count) * 10) / 10);
      }
      setEnergyByHour(energyMap);

      // 6. Category trend (first half vs second half of period)
      const mid = Math.floor(entries.length / 2);
      const firstHalf = entries.slice(0, mid);
      const secondHalf = entries.slice(mid);
      const firstCats = new Map<WorkCategory, number>();
      const secondCats = new Map<WorkCategory, number>();
      for (const e of firstHalf) firstCats.set(e.category as WorkCategory, (firstCats.get(e.category as WorkCategory) ?? 0) + 1);
      for (const e of secondHalf) secondCats.set(e.category as WorkCategory, (secondCats.get(e.category as WorkCategory) ?? 0) + 1);
      const allCats = new Set([...firstCats.keys(), ...secondCats.keys()]);
      const trends: { category: WorkCategory; percent: number; delta: number }[] = [];
      for (const cat of allCats) {
        const firstPct = firstHalf.length > 0 ? ((firstCats.get(cat) ?? 0) / firstHalf.length) * 100 : 0;
        const secondPct = secondHalf.length > 0 ? ((secondCats.get(cat) ?? 0) / secondHalf.length) * 100 : 0;
        trends.push({ category: cat, percent: Math.round(secondPct), delta: Math.round(secondPct - firstPct) });
      }
      trends.sort((a, b) => b.percent - a.percent);
      setCategoryTrend(trends);

      // 7. Generate text insights
      const textInsights: string[] = [];
      const topHour = peakHoursList[0];
      if (topHour) {
        const hLabel = topHour.hour > 12 ? `${topHour.hour - 12}PM` : `${topHour.hour}AM`;
        textInsights.push(`Tu hora mas productiva es las ${hLabel} (${topHour.count} entradas)`);
      }

      const bestDay = patterns.filter((p) => p.avgHours > 0).sort((a, b) => b.avgHours - a.avgHours)[0];
      if (bestDay) {
        textInsights.push(`${DAY_NAMES[bestDay.dayOfWeek].charAt(0).toUpperCase() + DAY_NAMES[bestDay.dayOfWeek].slice(1)} es tu dia mas productivo (${bestDay.avgHours}h promedio)`);
      }

      const worstMoodDay = patterns.filter((p) => p.avgMood > 0).sort((a, b) => a.avgMood - b.avgMood)[0];
      if (worstMoodDay && worstMoodDay.avgMood < 3) {
        textInsights.push(`Tu animo tiende a bajar los ${DAY_NAMES[worstMoodDay.dayOfWeek]} (${worstMoodDay.avgMood}/5)`);
      }

      if (focusScore < 40 && totalDeep > 0) {
        textInsights.push(`Tu deep work esta fragmentado (${focusScore}% en bloques de 2h+). Intenta proteger bloques largos.`);
      } else if (focusScore >= 70) {
        textInsights.push(`Excelente focus! ${focusScore}% de tu deep work es en bloques continuos.`);
      }

      const meetingPct = trends.find((t) => t.category === "meeting");
      if (meetingPct && meetingPct.percent > 30) {
        textInsights.push(`Las reuniones ocupan ${meetingPct.percent}% de tu tiempo. Considera reducirlas.`);
      }

      setInsights(textInsights);
      setLoading(false);
    }
    load();
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (orgLoading || loading) {
    return <div className="flex flex-col items-center justify-center py-24 gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" /><p className="text-sm text-muted-foreground animate-pulse">Cargando...</p></div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Lightbulb className="w-6 h-6 text-yellow-500" />
        <h1 className="text-2xl font-bold tracking-tight">Mis Insights</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">Patrones de trabajo de los ultimos 30 dias</p>

      {/* Key Insights */}
      {insights.length > 0 && (
        <Card className="mb-6 border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                {insights.map((text, i) => (
                  <p key={i} className="text-sm">{text}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Peak Hours */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Horas pico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {WORK_HOURS.map((h) => {
                const peak = peakHours.find((p) => p.hour === h);
                const count = peak?.count ?? 0;
                const maxCount = Math.max(1, ...peakHours.map((p) => p.count));
                const pct = (count / maxCount) * 100;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        "w-full rounded-t transition-all",
                        count === 0 ? "bg-muted/30" :
                        pct >= 80 ? "bg-blue-600" :
                        pct >= 50 ? "bg-blue-400" : "bg-blue-200 dark:bg-blue-800"
                      )}
                      style={{ height: `${Math.max(pct, 4)}%` }}
                      title={`${h}:00 - ${count} entradas`}
                    />
                    <span className="text-[8px] text-muted-foreground">
                      {h > 12 ? h - 12 : h}{h >= 12 ? "p" : "a"}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Weekly Rhythm */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              Ritmo semanal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dayPatterns.filter((p) => p.dayOfWeek >= 1 && p.dayOfWeek <= 5).map((p) => (
                <div key={p.dayOfWeek} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-8 capitalize">{DAY_NAMES[p.dayOfWeek]}</span>
                  <div className="flex-1 h-4 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        p.avgHours >= EXPECTED_DAILY_HOURS ? "bg-green-500" :
                        p.avgHours >= 4 ? "bg-yellow-500" : "bg-red-400"
                      )}
                      style={{ width: `${Math.min((p.avgHours / EXPECTED_DAILY_HOURS) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-10 text-right">{p.avgHours}h</span>
                  {p.avgMood > 0 && (
                    <span className="text-[10px] text-muted-foreground w-12">
                      {"★".repeat(Math.round(p.avgMood))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Focus Analysis */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-500" />
              Focus Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-accent/40 rounded-xl">
                <p className={cn(
                  "text-2xl font-bold",
                  focusScore >= 60 ? "text-green-600" : focusScore >= 30 ? "text-yellow-600" : "text-red-600"
                )}>
                  {focusScore}%
                </p>
                <p className="text-[10px] text-muted-foreground">Focus Score</p>
                <p className="text-[9px] text-muted-foreground/60">% deep work en bloques 2h+</p>
              </div>
              <div className="text-center p-3 bg-accent/40 rounded-xl">
                <p className="text-2xl font-bold">{avgDeepWorkBlock}h</p>
                <p className="text-[10px] text-muted-foreground">Bloque promedio</p>
                <p className="text-[9px] text-muted-foreground/60">de deep work continuo</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Energy Curve */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Curva de energia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-20">
              {WORK_HOURS.map((h) => {
                const energy = energyByHour.get(h) ?? 0;
                const pct = energy > 0 ? (energy / 5) * 100 : 0;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        "w-full rounded-t transition-all",
                        energy === 0 ? "bg-muted/30" :
                        energy >= 4 ? "bg-amber-500" :
                        energy >= 3 ? "bg-amber-300" : "bg-amber-200 dark:bg-amber-800"
                      )}
                      style={{ height: `${Math.max(pct, 4)}%` }}
                      title={`${h}:00 - Energia: ${energy}/5`}
                    />
                    <span className="text-[8px] text-muted-foreground">
                      {h > 12 ? h - 12 : h}{h >= 12 ? "p" : "a"}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Mood by Category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sun className="w-4 h-4 text-yellow-500" />
              Animo por categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {moodByCategory.map(({ category, avgMood, count }) => (
                <div key={category} className="flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-sm shrink-0", CATEGORY_COLORS[category])} />
                  <span className="text-xs flex-1">
                    {CATEGORIES[category].emoji} {CATEGORIES[category].label}
                  </span>
                  <span className="text-xs text-muted-foreground">{count}h</span>
                  <span className="text-xs font-medium w-8 text-right">{avgMood}</span>
                  <div className="w-12">
                    <span className="text-[10px]">{"★".repeat(Math.round(avgMood))}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Category Trends */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Tendencias de categorias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {categoryTrend.map(({ category, percent, delta }) => (
                <div key={category} className="flex items-center gap-2">
                  <span className="text-xs">{CATEGORIES[category].emoji}</span>
                  <span className="text-xs flex-1">{CATEGORIES[category].label}</span>
                  <span className="text-xs font-medium">{percent}%</span>
                  {delta !== 0 && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] py-0",
                        delta > 0 ? "text-green-600 border-green-300" : "text-red-600 border-red-300"
                      )}
                    >
                      {delta > 0 ? "+" : ""}{delta}%
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
