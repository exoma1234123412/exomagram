"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { WORK_HOURS, CATEGORIES } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatHour, formatHourShort } from "@/lib/utils";
import { subDays } from "date-fns";
import { Sparkles, Brain, Users, Coffee, Zap } from "lucide-react";

interface HourProfile {
  hour: number;
  avgEnergy: number;
  avgMood: number;
  deepWorkSuccess: number; // % of deep work entries at this hour
  meetingFrequency: number;
  recommendation: "deep_work" | "meeting" | "admin" | "break" | "flexible";
}

export function ScheduleOptimizer({ orgId }: { orgId: string }) {
  const [profiles, setProfiles] = useState<HourProfile[]>([]);
  const [bestDeepWork, setBestDeepWork] = useState<string>("");
  const [bestMeetings, setBestMeetings] = useState<string>("");
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const startDate = subDays(new Date(), 30).toISOString().split("T")[0];

      const { data: entries } = await supabase
        .from("time_entries")
        .select("hour, category, mood, energy")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .gte("date", startDate);

      if (!entries || entries.length < 10) return;

      const hourData = new Map<number, {
        energies: number[];
        moods: number[];
        deepWork: number;
        meetings: number;
        total: number;
      }>();

      for (const e of entries) {
        const d = hourData.get(e.hour) ?? { energies: [], moods: [], deepWork: 0, meetings: 0, total: 0 };
        d.total++;
        if (e.energy) d.energies.push(e.energy);
        if (e.mood) d.moods.push(e.mood);
        if (e.category === "deep_work") d.deepWork++;
        if (e.category === "meeting") d.meetings++;
        hourData.set(e.hour, d);
      }

      const result: HourProfile[] = WORK_HOURS.map((hour) => {
        const d = hourData.get(hour);
        if (!d || d.total === 0) {
          return { hour, avgEnergy: 3, avgMood: 3, deepWorkSuccess: 0, meetingFrequency: 0, recommendation: "flexible" as const };
        }

        const avgEnergy = d.energies.length > 0 ? d.energies.reduce((a, b) => a + b, 0) / d.energies.length : 3;
        const avgMood = d.moods.length > 0 ? d.moods.reduce((a, b) => a + b, 0) / d.moods.length : 3;
        const deepPct = (d.deepWork / d.total) * 100;
        const meetPct = (d.meetings / d.total) * 100;

        let rec: HourProfile["recommendation"] = "flexible";
        if (avgEnergy >= 3.5 && deepPct >= 30) rec = "deep_work";
        else if (meetPct >= 40) rec = "meeting";
        else if (avgEnergy < 2.5) rec = "break";
        else if (avgEnergy < 3) rec = "admin";

        return {
          hour,
          avgEnergy: Math.round(avgEnergy * 10) / 10,
          avgMood: Math.round(avgMood * 10) / 10,
          deepWorkSuccess: Math.round(deepPct),
          meetingFrequency: Math.round(meetPct),
          recommendation: rec,
        };
      });

      setProfiles(result);

      // Find best windows
      const deepHours = result.filter((h) => h.recommendation === "deep_work").map((h) => h.hour);
      const meetHours = result.filter((h) => h.recommendation === "meeting").map((h) => h.hour);

      if (deepHours.length > 0) {
        // Find contiguous blocks
        const blocks: number[][] = [];
        let block = [deepHours[0]];
        for (let i = 1; i < deepHours.length; i++) {
          if (deepHours[i] === deepHours[i - 1] + 1) {
            block.push(deepHours[i]);
          } else {
            blocks.push(block);
            block = [deepHours[i]];
          }
        }
        blocks.push(block);
        const longest = blocks.sort((a, b) => b.length - a.length)[0];
        setBestDeepWork(`${formatHourShort(longest[0])} - ${formatHourShort(longest[longest.length - 1] + 1)}`);
      }

      if (meetHours.length > 0) {
        setBestMeetings(meetHours.map(formatHour).join(", "));
      }
    }
    load();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (profiles.length === 0) return null;

  const recConfig = {
    deep_work: { label: "Deep Work", color: "bg-violet-500", icon: <Brain className="w-3 h-3" /> },
    meeting: { label: "Reuniones", color: "bg-blue-500", icon: <Users className="w-3 h-3" /> },
    admin: { label: "Admin", color: "bg-slate-400", icon: <Zap className="w-3 h-3" /> },
    break: { label: "Descanso", color: "bg-green-400", icon: <Coffee className="w-3 h-3" /> },
    flexible: { label: "Flexible", color: "bg-gray-300", icon: <Sparkles className="w-3 h-3" /> },
  };

  return (
    <Card className="mb-8 transition-all duration-300">
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-yellow-500" />
          Horario Optimo
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Basado en tu energia y patrones de los ultimos 30 dias
        </p>

        {/* Schedule bar */}
        <div className="flex gap-0.5 mb-3">
          {profiles.map((p) => {
            const rec = recConfig[p.recommendation];
            return (
              <div
                key={p.hour}
                className="flex-1 flex flex-col items-center gap-1"
                title={`${formatHourShort(p.hour)}: ${rec.label} (Energia: ${p.avgEnergy}, Animo: ${p.avgMood})`}
              >
                <div className={cn("w-full h-8 rounded-sm flex items-center justify-center", rec.color)}>
                  <span className="text-white">{rec.icon}</span>
                </div>
                <span className="text-[8px] text-muted-foreground">
                  {p.hour > 12 ? p.hour - 12 : p.hour}{p.hour >= 12 ? "p" : "a"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Recommendations */}
        <div className="flex flex-wrap gap-2 text-xs">
          {bestDeepWork && (
            <Badge variant="outline" className="gap-1 text-primary border-blue-300">
              <Brain className="w-3 h-3" />
              Deep work: {bestDeepWork}
            </Badge>
          )}
          {bestMeetings && (
            <Badge variant="outline" className="gap-1 text-blue-600 border-blue-300">
              <Users className="w-3 h-3" />
              Reuniones: {bestMeetings}
            </Badge>
          )}
        </div>

        {/* Legend */}
        <div className="flex gap-3 mt-3 text-[10px] text-muted-foreground">
          {Object.entries(recConfig).map(([key, conf]) => (
            <div key={key} className="flex items-center gap-1">
              <div className={cn("w-2.5 h-2.5 rounded-sm", conf.color)} />
              {conf.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
