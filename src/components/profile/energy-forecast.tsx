"use client";

import { WORK_HOURS, MOOD_LABELS, ENERGY_LABELS } from "@/lib/constants";
import type { TimeEntry } from "@/lib/types/database";
import { cn, formatHour } from "@/lib/utils";
import { Zap, Heart, TrendingUp, TrendingDown, Minus } from "lucide-react";

// Predicts energy and mood patterns based on historical data
export function EnergyForecast({ entries }: { entries: TimeEntry[] }) {
  const entriesWithMood = entries.filter((e) => e.mood);
  const entriesWithEnergy = entries.filter((e) => e.energy);

  if (entriesWithMood.length < 10 && entriesWithEnergy.length < 10) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Necesitas al menos 10 entradas con ánimo/energía para generar un pronóstico.
      </p>
    );
  }

  // Build hour -> avg mood/energy
  const moodByHour = new Map<number, number[]>();
  const energyByHour = new Map<number, number[]>();
  const moodByDow = new Map<number, number[]>();
  const energyByDow = new Map<number, number[]>();

  for (const e of entries) {
    if (e.mood) {
      const list = moodByHour.get(e.hour) ?? [];
      list.push(e.mood);
      moodByHour.set(e.hour, list);

      const dow = new Date(e.date + "T12:00:00").getDay();
      const dowList = moodByDow.get(dow) ?? [];
      dowList.push(e.mood);
      moodByDow.set(dow, dowList);
    }
    if (e.energy) {
      const list = energyByHour.get(e.hour) ?? [];
      list.push(e.energy);
      energyByHour.set(e.hour, list);

      const dow = new Date(e.date + "T12:00:00").getDay();
      const dowList = energyByDow.get(dow) ?? [];
      dowList.push(e.energy);
      energyByDow.set(dow, dowList);
    }
  }

  function avg(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  // Find peak and low hours
  let peakEnergyHour = 9;
  let peakEnergyVal = 0;
  let lowEnergyHour = 14;
  let lowEnergyVal = 5;

  for (const h of WORK_HOURS) {
    const vals = energyByHour.get(h);
    if (vals && vals.length >= 2) {
      const a = avg(vals);
      if (a > peakEnergyVal) { peakEnergyHour = h; peakEnergyVal = a; }
      if (a < lowEnergyVal) { lowEnergyHour = h; lowEnergyVal = a; }
    }
  }

  // Best and worst days of week
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  let bestDay = 1;
  let bestDayMood = 0;
  let worstDay = 5;
  let worstDayMood = 5;

  for (const [dow, moods] of moodByDow) {
    const a = avg(moods);
    if (a > bestDayMood) { bestDay = dow; bestDayMood = a; }
    if (a < worstDayMood) { worstDay = dow; worstDayMood = a; }
  }

  return (
    <div className="space-y-4">
      {/* Hour-by-hour forecast */}
      <div className="space-y-1">
        {WORK_HOURS.map((h) => {
          const moods = moodByHour.get(h);
          const energies = energyByHour.get(h);
          const avgMood = moods && moods.length >= 2 ? avg(moods) : null;
          const avgEnergy = energies && energies.length >= 2 ? avg(energies) : null;

          return (
            <div key={h} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-mono w-14 text-right">
                {h > 12 ? h - 12 : h}{h >= 12 ? "pm" : "am"}
              </span>

              {/* Mood bar */}
              <div className="flex-1 h-4 bg-muted/20 rounded overflow-hidden relative">
                {avgMood !== null && (
                  <div
                    className={cn(
                      "h-full rounded transition-all duration-500",
                      avgMood >= 4 ? "bg-green-400" : avgMood >= 3 ? "bg-yellow-400" : "bg-red-400"
                    )}
                    style={{ width: `${(avgMood / 5) * 100}%` }}
                  />
                )}
              </div>

              {/* Energy bar */}
              <div className="flex-1 h-4 bg-muted/20 rounded overflow-hidden">
                {avgEnergy !== null && (
                  <div
                    className={cn(
                      "h-full rounded transition-all duration-500",
                      avgEnergy >= 4 ? "bg-primary" : avgEnergy >= 3 ? "bg-blue-400" : "bg-orange-400"
                    )}
                    style={{ width: `${(avgEnergy / 5) * 100}%` }}
                  />
                )}
              </div>

              <span className="text-[10px] text-muted-foreground w-6 text-center tabular-nums tracking-tight">
                {avgMood?.toFixed(1) ?? "-"}
              </span>
              <span className="text-[10px] text-muted-foreground w-6 text-center tabular-nums tracking-tight">
                {avgEnergy?.toFixed(1) ?? "-"}
              </span>
            </div>
          );
        })}
        <div className="flex items-center gap-3 mt-1">
          <span className="w-14" />
          <div className="flex-1 flex items-center gap-1">
            <Heart className="w-3 h-3 text-green-400" />
            <span className="text-[10px] text-muted-foreground">Ánimo</span>
          </div>
          <div className="flex-1 flex items-center gap-1">
            <Zap className="w-3 h-3 text-primary" />
            <span className="text-[10px] text-muted-foreground">Energía</span>
          </div>
          <span className="w-6" />
          <span className="w-6" />
        </div>
      </div>

      {/* Predictions */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 dark:bg-green-950/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span className="text-xs font-semibold text-green-700 dark:text-green-400">Hora pico</span>
          </div>
          <p className="text-lg font-bold tabular-nums tracking-tight text-green-700 dark:text-green-400">{formatHour(peakEnergyHour)}</p>
          <p className="text-[10px] text-green-600/70">Aquí tienes más energía. Agenda deep work.</p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-950/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-orange-600" />
            <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">Hora baja</span>
          </div>
          <p className="text-lg font-bold tabular-nums tracking-tight text-orange-700 dark:text-orange-400">{formatHour(lowEnergyHour)}</p>
          <p className="text-[10px] text-orange-600/70">Baja energía. Haz tareas livianas o descansa.</p>
        </div>
        <div className="bg-primary/5 dark:bg-primary/10 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Heart className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-primary">Mejor día</span>
          </div>
          <p className="text-lg font-bold text-primary">{days[bestDay]}</p>
          <p className="text-[10px] text-primary/60">Tu ánimo promedio es <span className="tabular-nums">{bestDayMood.toFixed(1)}</span>/5</p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Minus className="w-4 h-4 text-red-600" />
            <span className="text-xs font-semibold text-red-700 dark:text-red-400">Peor día</span>
          </div>
          <p className="text-lg font-bold text-red-700 dark:text-red-400">{days[worstDay]}</p>
          <p className="text-[10px] text-red-600/70">Tu ánimo promedio es <span className="tabular-nums">{worstDayMood.toFixed(1)}</span>/5</p>
        </div>
      </div>
    </div>
  );
}
