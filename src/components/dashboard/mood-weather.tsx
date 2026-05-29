"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Weather ="sunny"|"partly_cloudy"|"cloudy"|"stormy";

const WEATHER_CONFIG: Record<Weather, { emoji: string; label: string; color: string; bg: string }> = {
 sunny: { emoji:"--", label:"Excelente", color:"text-yellow-600", bg:"bg-yellow-50 dark:bg-yellow-950/15 border-yellow-200/60 dark:border-yellow-800/40"},
 partly_cloudy: { emoji:"⛅", label:"Bien", color:"text-blue-600", bg:"bg-blue-50 dark:bg-blue-950/15 border-blue-200/60 dark:border-blue-800/40"},
 cloudy: { emoji:"--", label:"Regular", color:"text-gray-500", bg:"bg-gray-50 dark:bg-gray-950/15 border-gray-200/60 dark:border-gray-800/40"},
 stormy: { emoji:"--", label:"Bajo", color:"text-red-600", bg:"bg-red-50 dark:bg-red-950/15 border-red-200/60 dark:border-red-800/40"},
};

export function MoodWeather({ orgId }: { orgId: string }) {
 const [weather, setWeather] = useState<Weather | null>(null);
 const [avgMood, setAvgMood] = useState(0);
 const [avgEnergy, setAvgEnergy] = useState(0);
 const [respondents, setRespondents] = useState(0);
 const supabase = createClient();

 useEffect(() => {
 async function load() {
 const today = new Date().toISOString().split("T")[0];

 const { data: entries } = await supabase
 .from("time_entries")
 .select("user_id, mood, energy")
 .eq("org_id", orgId)
 .eq("date", today);

 if (!entries || entries.length === 0) return;

 const moods = entries.filter((e) => e.mood).map((e) => e.mood as number);
 const energies = entries.filter((e) => e.energy).map((e) => e.energy as number);
 const uniqueUsers = new Set(entries.filter((e) => e.mood).map((e) => e.user_id));

 if (moods.length === 0) return;

 const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
 const avgE = energies.length > 0 ? energies.reduce((a, b) => a + b, 0) / energies.length : 3;
 const combined = (avg + avgE) / 2;

 setAvgMood(Math.round(avg * 10) / 10);
 setAvgEnergy(Math.round(avgE * 10) / 10);
 setRespondents(uniqueUsers.size);

 if (combined >= 4) setWeather("sunny");
 else if (combined >= 3) setWeather("partly_cloudy");
 else if (combined >= 2) setWeather("cloudy");
 else setWeather("stormy");
 }
 load();
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 if (!weather) return null;

 const config = WEATHER_CONFIG[weather];

 return (
 <div className={cn(
"flex items-center gap-3 p-3 text-sm mb-4 border transition-all",
 config.bg
 )}>
 <span className="text-2xl">{config.emoji}</span>
 <div className="flex-1">
 <p className={cn("text-sm font-semibold", config.color)}>
 Clima del equipo: {config.label}
 </p>
 <p className="text-[10px] text-muted-foreground">
 Animo <span className="tabular-nums tracking-tight">{avgMood}/5</span> | Energia <span className="tabular-nums tracking-tight">{avgEnergy}/5</span> | {respondents} persona{respondents !== 1 ?"s":""}
 </p>
 </div>
 </div>
 );
}
