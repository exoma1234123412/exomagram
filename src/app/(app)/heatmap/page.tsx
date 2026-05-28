"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { WORK_HOURS, CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, subDays, eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Grid3X3 } from "lucide-react";

function formatHour(h: number) {
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}${suffix}`;
}

export default function HeatmapPage() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [orgId, setOrgId] = useState<string | null>(null);
  const [heatData, setHeatData] = useState<
    Map<string, { count: number; topCategory: WorkCategory | null }>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const datesStr = days.map((d) => d.toISOString().split("T")[0]);

  useEffect(() => {
    async function loadOrg() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string }>();
      if (membership) setOrgId(membership.org_id);
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId) return;

    async function loadHeatmap() {
      setLoading(true);

      const { data: entries } = await supabase
        .from("time_entries")
        .select("date, hour, category")
        .eq("org_id", orgId)
        .gte("date", datesStr[0])
        .lte("date", datesStr[datesStr.length - 1]);

      const map = new Map<
        string,
        { count: number; topCategory: WorkCategory | null; cats: Map<string, number> }
      >();

      for (const entry of entries ?? []) {
        const key = `${entry.date}-${entry.hour}`;
        const cell = map.get(key) ?? { count: 0, topCategory: null, cats: new Map() };
        cell.count++;
        cell.cats.set(entry.category, (cell.cats.get(entry.category) ?? 0) + 1);
        map.set(key, cell);
      }

      // Resolve top category per cell
      const result = new Map<
        string,
        { count: number; topCategory: WorkCategory | null }
      >();
      for (const [key, cell] of map) {
        let topCat: WorkCategory | null = null;
        let topCount = 0;
        for (const [c, n] of cell.cats) {
          if (n > topCount) {
            topCat = c as WorkCategory;
            topCount = n;
          }
        }
        result.set(key, { count: cell.count, topCategory: topCat });
      }

      setHeatData(result);
      setLoading(false);
    }

    loadHeatmap();
  }, [orgId, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxCount = Math.max(
    1,
    ...Array.from(heatData.values()).map((v) => v.count)
  );

  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM yyyy", { locale: es })}`;

  const CATEGORY_COLORS: Record<string, string> = {
    deep_work: "bg-violet-500",
    meeting: "bg-blue-500",
    review: "bg-amber-500",
    admin: "bg-slate-400",
    planning: "bg-emerald-500",
    learning: "bg-pink-500",
    break: "bg-green-400",
    blocked: "bg-red-500",
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Grid3X3 className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Team Heatmap</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6 capitalize">
        {weekLabel}
      </p>

      {/* Week nav */}
      <div className="flex items-center gap-2 mb-6 bg-card/80 border border-border/50 rounded-2xl p-2 w-fit">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl"
          onClick={() => setWeekStart(subDays(weekStart, 7))}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl"
          onClick={() =>
            setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
          }
        >
          Esta semana
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl"
          onClick={() => {
            const next = new Date(weekStart);
            next.setDate(next.getDate() + 7);
            setWeekStart(next);
          }}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 animate-pulse" /><p className="text-sm text-muted-foreground animate-pulse">Cargando...</p></div>
      ) : (
        <Card>
          <CardContent className="p-4 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-xs text-muted-foreground font-normal p-1 text-left w-16">
                    Hora
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.toISOString()}
                      className="text-xs text-muted-foreground font-normal p-1 text-center"
                    >
                      <div>
                        {format(d, "EEE", { locale: es })}
                      </div>
                      <div className="text-[10px] opacity-60">
                        {format(d, "d/M")}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WORK_HOURS.map((hour) => (
                  <tr key={hour}>
                    <td className="text-xs text-muted-foreground p-1 font-mono">
                      {formatHour(hour)}
                    </td>
                    {datesStr.map((dateStr) => {
                      const key = `${dateStr}-${hour}`;
                      const cell = heatData.get(key);
                      const count = cell?.count ?? 0;
                      const intensity = count / maxCount;
                      const topCat = cell?.topCategory;

                      return (
                        <td key={key} className="p-0.5">
                          <div
                            className={cn(
                              "w-full h-8 rounded-sm flex items-center justify-center text-[10px] font-medium transition-colors",
                              count === 0
                                ? "bg-muted/20"
                                : topCat
                                  ? cn(CATEGORY_COLORS[topCat], intensity < 0.5 ? "opacity-50" : "opacity-90")
                                  : intensity < 0.33
                                    ? "bg-violet-200 dark:bg-violet-900/40"
                                    : intensity < 0.66
                                      ? "bg-violet-400 dark:bg-violet-700"
                                      : "bg-violet-600"
                            )}
                            title={
                              count > 0
                                ? `${count} entrada${count > 1 ? "s" : ""}${topCat ? " - " + CATEGORIES[topCat].label : ""}`
                                : "Sin actividad"
                            }
                          >
                            {count > 0 && (
                              <span
                                className={cn(
                                  count > 0 && topCat
                                    ? "text-white"
                                    : "text-violet-700 dark:text-violet-300"
                                )}
                              >
                                {count}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t">
              {(Object.keys(CATEGORIES) as WorkCategory[]).map((key) => {
                const cat = CATEGORIES[key];
                return (
                  <div key={key} className="flex items-center gap-1.5 text-xs">
                    <div
                      className={cn(
                        "w-3 h-3 rounded-sm",
                        CATEGORY_COLORS[key]
                      )}
                    />
                    <span className="text-muted-foreground">
                      {cat.emoji} {cat.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
