"use client";

import { useEffect, useState, useRef } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Profile } from "@/lib/types/database";
import { CATEGORIES, WORK_HOURS, CATEGORY_COLORS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatHour, getInitials } from "@/lib/utils";
import { Play, Pause, SkipForward, RotateCcw, Film, Clock } from "lucide-react";

type EntryWithProfile = TimeEntry & { profiles: Profile };

export default function ReplayPage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [entries, setEntries] = useState<EntryWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentHourIdx, setCurrentHourIdx] = useState(0);
  const [visibleEntries, setVisibleEntries] = useState<EntryWithProfile[]>([]);
  const [speed, setSpeed] = useState(1500); // ms per hour
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createClient();

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
        .single();

      if (!membership) { setLoading(false); return; }

      const { data } = await supabase
        .from("time_entries")
        .select("*, profiles(*)")
        .eq("org_id", membership.org_id)
        .eq("date", date)
        .order("hour", { ascending: true })
        ;

      setEntries(data ?? []);
      setVisibleEntries([]);
      setCurrentHourIdx(0);
      setPlaying(false);
      setLoading(false);
    }
    load();
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Playback logic
  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setCurrentHourIdx((prev) => {
        const nextIdx = prev + 1;
        if (nextIdx > WORK_HOURS.length) {
          setPlaying(false);
          return prev;
        }

        const currentHour = WORK_HOURS[nextIdx - 1];
        const hourEntries = entries.filter((e) => e.hour === currentHour);
        if (hourEntries.length > 0) {
          setVisibleEntries((ve) => [...ve, ...hourEntries]);
        }

        return nextIdx;
      });
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, speed, entries]);

  function reset() {
    setPlaying(false);
    setCurrentHourIdx(0);
    setVisibleEntries([]);
  }

  function skipToEnd() {
    setPlaying(false);
    setCurrentHourIdx(WORK_HOURS.length);
    setVisibleEntries(entries);
  }

  const currentHour = currentHourIdx > 0 ? WORK_HOURS[Math.min(currentHourIdx - 1, WORK_HOURS.length - 1)] : null;
  const progress = (currentHourIdx / WORK_HOURS.length) * 100;

  // Group visible entries by person for the "stage"
  const byPerson = new Map<string, EntryWithProfile[]>();
  for (const e of visibleEntries) {
    const list = byPerson.get(e.user_id) ?? [];
    list.push(e);
    byPerson.set(e.user_id, list);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Film className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Work Replay</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        Reproduce el dia del equipo como una pelicula
      </p>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-8">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto"
          max={new Date().toISOString().split("T")[0]}
        />
        <div className="flex items-center gap-1 border rounded-lg p-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={reset} title="Reiniciar">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            variant={playing ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setPlaying(!playing)}
            disabled={entries.length === 0}
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={skipToEnd} title="Saltar al final">
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex gap-1">
          {[2000, 1500, 800, 400].map((s, i) => (
            <Button
              key={s}
              variant={speed === s ? "default" : "outline"}
              size="sm"
              className="text-xs h-8"
              onClick={() => setSpeed(s)}
            >
              {["0.5x", "1x", "2x", "4x"][i]}
            </Button>
          ))}
        </div>
        {currentHour !== null && (
          <Badge variant="outline" className="text-sm gap-1 ml-auto">
            <Clock className="w-3.5 h-3.5" />
            {formatHour(currentHour)}
          </Badge>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>{formatHour(WORK_HOURS[0])}</span>
          <span>{visibleEntries.length} entradas</span>
          <span>{formatHour(WORK_HOURS[WORK_HOURS.length - 1])}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        {/* Hour markers */}
        <div className="flex mt-1">
          {WORK_HOURS.map((h, i) => (
            <div
              key={h}
              className="flex-1 text-center"
            >
              <div
                className={cn(
                  "w-1 h-1 rounded-full mx-auto",
                  i < currentHourIdx ? "bg-blue-500" : "bg-muted"
                )}
              />
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" /><p className="text-sm text-muted-foreground animate-pulse">Cargando...</p></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          No hay entradas para este dia.
        </div>
      ) : (
        /* Stage: entries appear with animation */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from(byPerson.entries()).map(([userId, userEntries]) => {
            const profile = userEntries[0].profiles;
            const latestEntry = userEntries[userEntries.length - 1];
            const latestCat = CATEGORIES[latestEntry.category];

            return (
              <Card
                key={userId}
                className="animate-in fade-in slide-in-from-bottom-2 duration-500 transition-all hover:shadow-lg hover:shadow-primary/5"
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
                      <AvatarImage src={profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">{getInitials(profile?.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{profile?.full_name ?? "?"}</p>
                      <p className="text-[10px] text-muted-foreground">{userEntries.length}h registradas</p>
                    </div>
                  </div>

                  {/* Hour blocks */}
                  <div className="flex gap-1 flex-wrap">
                    {userEntries.map((e) => (
                      <div
                        key={e.id}
                        className={cn(
                          "w-7 h-7 rounded-md flex items-center justify-center text-[10px] text-white font-medium animate-in zoom-in duration-300",
                          CATEGORY_COLORS[e.category]
                        )}
                        title={`${formatHour(e.hour)}: ${e.title}`}
                      >
                        {e.hour > 12 ? e.hour - 12 : e.hour}
                      </div>
                    ))}
                  </div>

                  {/* Latest entry */}
                  <div className="mt-2 p-2 bg-accent/40 rounded-xl">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className={cn("text-[9px]", latestCat.color, latestCat.bgColor)}>
                        {latestCat.emoji}
                      </Badge>
                      <span className="text-xs font-medium truncate">{latestEntry.title}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
