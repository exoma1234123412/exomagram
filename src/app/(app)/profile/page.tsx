"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Profile } from "@/lib/types/database";
import { CATEGORIES, WORK_HOURS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Loader2, Clock, Flame, TrendingUp, Calendar } from "lucide-react";

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

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: profileData }, { data: entryData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase
          .from("time_entries")
          .select("*")
          .eq("user_id", user.id)
          .order("date", { ascending: false })
          .order("hour", { ascending: false })
          .limit(200),
      ]);

      setProfile(profileData);
      setEntries(entryData ?? []);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">No se encontró el perfil.</p>
      </div>
    );
  }

  // Stats
  const totalHours = entries.length;
  const categoryCount = new Map<WorkCategory, number>();
  const hourCount = new Map<number, number>();
  let totalMood = 0;
  let moodEntries = 0;
  let totalEnergy = 0;
  let energyEntries = 0;
  const dateCounts = new Map<string, number>();

  for (const entry of entries) {
    categoryCount.set(
      entry.category,
      (categoryCount.get(entry.category) ?? 0) + 1
    );
    hourCount.set(entry.hour, (hourCount.get(entry.hour) ?? 0) + 1);
    if (entry.mood) {
      totalMood += entry.mood;
      moodEntries++;
    }
    if (entry.energy) {
      totalEnergy += entry.energy;
      energyEntries++;
    }
    dateCounts.set(entry.date, (dateCounts.get(entry.date) ?? 0) + 1);
  }

  const avgMood = moodEntries > 0 ? (totalMood / moodEntries).toFixed(1) : "-";
  const avgEnergy =
    energyEntries > 0 ? (totalEnergy / energyEntries).toFixed(1) : "-";
  const daysActive = dateCounts.size;

  // Most productive hour
  let peakHour = 9;
  let peakCount = 0;
  for (const [h, c] of hourCount) {
    if (c > peakCount) {
      peakHour = h;
      peakCount = c;
    }
  }
  const peakHourLabel = `${peakHour > 12 ? peakHour - 12 : peakHour}:00 ${peakHour >= 12 ? "PM" : "AM"}`;

  // Category breakdown sorted
  const categoryBreakdown = Array.from(categoryCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({
      category: cat,
      count,
      percent: Math.round((count / totalHours) * 100),
    }));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        <Avatar className="w-16 h-16">
          <AvatarImage src={profile.avatar_url ?? undefined} />
          <AvatarFallback className="text-lg">
            {getInitials(profile.full_name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold">
            {profile.full_name ?? profile.email}
          </h1>
          {profile.role && (
            <p className="text-muted-foreground">{profile.role}</p>
          )}
          <p className="text-xs text-muted-foreground/60">{profile.timezone}</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="w-5 h-5 mx-auto text-violet-500 mb-1" />
            <p className="text-2xl font-bold">{totalHours}</p>
            <p className="text-xs text-muted-foreground">Horas registradas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="w-5 h-5 mx-auto text-blue-500 mb-1" />
            <p className="text-2xl font-bold">{daysActive}</p>
            <p className="text-xs text-muted-foreground">Días activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
            <p className="text-2xl font-bold">{avgMood}</p>
            <p className="text-xs text-muted-foreground">Ánimo promedio</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Flame className="w-5 h-5 mx-auto text-amber-500 mb-1" />
            <p className="text-2xl font-bold">{peakHourLabel}</p>
            <p className="text-xs text-muted-foreground">Hora pico</p>
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Distribución de trabajo</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryBreakdown.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aún no hay datos. Empieza a registrar horas.
            </p>
          ) : (
            <div className="space-y-3">
              {categoryBreakdown.map(({ category, count, percent }) => (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span>{CATEGORIES[category].emoji}</span>
                      <span className="font-medium">
                        {CATEGORIES[category].label}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {count}h ({percent}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        CATEGORY_COLORS[category]
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hour heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Actividad por hora</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1 flex-wrap">
            {WORK_HOURS.map((h) => {
              const count = hourCount.get(h) ?? 0;
              const maxCount = Math.max(...Array.from(hourCount.values()), 1);
              const intensity = count / maxCount;
              return (
                <div key={h} className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-md flex items-center justify-center text-xs font-mono transition-colors",
                      intensity === 0
                        ? "bg-muted/30 text-muted-foreground/50"
                        : intensity < 0.33
                        ? "bg-violet-200 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                        : intensity < 0.66
                        ? "bg-violet-400 dark:bg-violet-700 text-white"
                        : "bg-violet-600 text-white"
                    )}
                  >
                    {count}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {h > 12 ? h - 12 : h}
                    {h >= 12 ? "p" : "a"}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
