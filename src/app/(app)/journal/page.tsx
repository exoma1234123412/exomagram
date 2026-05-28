"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, EXPECTED_DAILY_HOURS, ACHIEVEMENTS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfWeek, subWeeks, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";
import { BookOpen, ChevronLeft, ChevronRight, Save, Flame, Trophy, Clock, Shield } from "lucide-react";

interface WeekJournal {
  totalHours: number;
  proofPercent: number;
  topCategory: WorkCategory | null;
  topCategoryHours: number;
  avgMood: number;
  avgEnergy: number;
  streak: number;
  achievements: string[];
  dailyHours: { date: string; hours: number }[];
  highlights: string[];
  blockers: string[];
}

export default function JournalPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [journal, setJournal] = useState<WeekJournal | null>(null);
  const [reflection, setReflection] = useState("");
  const [savedReflection, setSavedReflection] = useState("");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM yyyy", { locale: es })}`;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string }>();

      if (!membership) { setLoading(false); return; }

      const startStr = weekStart.toISOString().split("T")[0];
      const endStr = weekEnd.toISOString().split("T")[0];

      const [{ data: entries }, { data: closeouts }, { data: streakData }, { data: achievementData }] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*")
          .eq("user_id", user.id)
          .eq("org_id", membership.org_id)
          .gte("date", startStr)
          .lte("date", endStr),
        supabase
          .from("daily_closeouts")
          .select("summary, blockers")
          .eq("user_id", user.id)
          .eq("org_id", membership.org_id)
          .gte("date", startStr)
          .lte("date", endStr),
        supabase
          .from("activity_streaks")
          .select("current_streak")
          .eq("user_id", user.id)
          .eq("org_id", membership.org_id)
          .limit(1)
          .single(),
        supabase
          .from("achievements")
          .select("achievement_type")
          .eq("user_id", user.id)
          .eq("org_id", membership.org_id),
      ]);

      const allEntries = entries ?? [];
      const withProof = allEntries.filter((e) => e.proof_urls && e.proof_urls.length > 0);
      const moods = allEntries.filter((e) => e.mood).map((e) => e.mood as number);
      const energies = allEntries.filter((e) => e.energy).map((e) => e.energy as number);

      // Top category
      const catCounts = new Map<WorkCategory, number>();
      for (const e of allEntries) catCounts.set(e.category, (catCounts.get(e.category) ?? 0) + 1);
      let topCat: WorkCategory | null = null;
      let topCount = 0;
      for (const [c, n] of catCounts) { if (n > topCount) { topCat = c; topCount = n; } }

      // Daily hours
      const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
      const dailyHours = days.map((d) => {
        const dateStr = d.toISOString().split("T")[0];
        return { date: dateStr, hours: allEntries.filter((e) => e.date === dateStr).length };
      });

      // Highlights from closeouts
      const highlights = (closeouts ?? [])
        .map((c) => c.summary)
        .filter(Boolean);

      // Blockers
      const blockers = (closeouts ?? [])
        .map((c) => c.blockers)
        .filter((b): b is string => !!b && b.length > 0);

      setJournal({
        totalHours: allEntries.length,
        proofPercent: allEntries.length > 0 ? Math.round((withProof.length / allEntries.length) * 100) : 0,
        topCategory: topCat,
        topCategoryHours: topCount,
        avgMood: moods.length > 0 ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : 0,
        avgEnergy: energies.length > 0 ? Math.round((energies.reduce((a, b) => a + b, 0) / energies.length) * 10) / 10 : 0,
        streak: streakData?.current_streak ?? 0,
        achievements: achievementData?.map((a) => a.achievement_type) ?? [],
        dailyHours,
        highlights,
        blockers,
      });

      // Load saved reflection
      const key = `exomagram_journal_${startStr}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        setReflection(saved);
        setSavedReflection(saved);
      } else {
        setReflection("");
        setSavedReflection("");
      }

      setLoading(false);
    }
    load();
  }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveReflection() {
    const key = `exomagram_journal_${weekStart.toISOString().split("T")[0]}`;
    localStorage.setItem(key, reflection);
    setSavedReflection(reflection);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Cargando...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <BookOpen className="w-6 h-6 text-violet-600" />
        <h1 className="text-2xl font-bold">Work Journal</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6 capitalize">{weekLabel}</p>

      {/* Week nav */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          Esta semana
        </Button>
        <Button variant="outline" size="icon" onClick={() => {
          const next = new Date(weekStart);
          next.setDate(next.getDate() + 7);
          setWeekStart(next);
        }}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {!journal ? (
        <div className="text-center py-20 text-muted-foreground">Sin datos para esta semana.</div>
      ) : (
        <div className="space-y-6">
          {/* Stats overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <Clock className="w-4 h-4 mx-auto text-violet-500 mb-1" />
                <p className="text-xl font-bold">{journal.totalHours}h</p>
                <p className="text-[10px] text-muted-foreground">Total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <Shield className="w-4 h-4 mx-auto text-green-500 mb-1" />
                <p className={cn("text-xl font-bold", journal.proofPercent >= 70 ? "text-green-600" : "text-yellow-600")}>{journal.proofPercent}%</p>
                <p className="text-[10px] text-muted-foreground">Evidencia</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold">{journal.avgMood || "-"}</p>
                <p className="text-[10px] text-muted-foreground">Animo prom.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <Flame className={cn("w-4 h-4 mx-auto mb-1", journal.streak > 0 ? "text-orange-500" : "text-muted-foreground")} />
                <p className="text-xl font-bold">{journal.streak}</p>
                <p className="text-[10px] text-muted-foreground">Racha</p>
              </CardContent>
            </Card>
          </div>

          {/* Daily breakdown mini chart */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Horas por dia</p>
              <div className="flex items-end gap-2 h-16">
                {journal.dailyHours.map((d) => {
                  const pct = Math.min((d.hours / EXPECTED_DAILY_HOURS) * 100, 100);
                  const dayName = format(new Date(d.date + "T12:00:00"), "EEE", { locale: es });
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={cn(
                          "w-full rounded-t",
                          d.hours >= EXPECTED_DAILY_HOURS ? "bg-green-500" : d.hours >= 4 ? "bg-yellow-500" : d.hours > 0 ? "bg-red-400" : "bg-muted"
                        )}
                        style={{ height: `${Math.max(pct, 4)}%` }}
                      />
                      <span className="text-[9px] text-muted-foreground">{dayName}</span>
                    </div>
                  );
                })}
              </div>
              {journal.topCategory && (
                <p className="text-xs text-muted-foreground mt-3">
                  Principal: {CATEGORIES[journal.topCategory].emoji} {CATEGORIES[journal.topCategory].label} ({journal.topCategoryHours}h)
                </p>
              )}
            </CardContent>
          </Card>

          {/* Highlights from closeouts */}
          {journal.highlights.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lo que hice</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {journal.highlights.map((h, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-violet-500 mt-1">•</span>
                      {h}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Blockers */}
          {journal.blockers.length > 0 && (
            <Card className="border-orange-200 dark:border-orange-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Blockers</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {journal.blockers.map((b, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-orange-500 mt-1">•</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Achievements earned */}
          {journal.achievements.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  Logros desbloqueados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {journal.achievements.map((type) => {
                    const ach = ACHIEVEMENTS[type];
                    if (!ach) return null;
                    return (
                      <Badge key={type} variant="outline" className="text-sm gap-1 py-1 px-2">
                        {ach.emoji} {ach.label}
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Personal reflection */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Reflexion personal</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="Que aprendiste esta semana? Que harias diferente? Que te hace sentir orgulloso?"
                rows={4}
                className="mb-2"
              />
              <Button
                size="sm"
                onClick={saveReflection}
                disabled={reflection === savedReflection}
                className="gap-2"
              >
                <Save className="w-3 h-3" />
                {reflection === savedReflection ? "Guardado" : "Guardar reflexion"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
