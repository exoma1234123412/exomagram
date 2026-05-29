"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { WORK_HOURS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { subDays } from "date-fns";
import { Globe } from "lucide-react";

interface MemberSchedule {
  profile: Profile;
  activeHours: Set<number>;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatHour(h: number) {
  return `${h > 12 ? h - 12 : h}${h >= 12 ? "p" : "a"}`;
}

export function TimezoneOverlap({ orgId }: { orgId: string }) {
  const [schedules, setSchedules] = useState<MemberSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const startDate = subDays(new Date(), 14).toISOString().split("T")[0];

      const [{ data: members }, { data: entries }] = await Promise.all([
        supabase
          .from("org_members")
          .select("user_id, profiles(*)")
          .eq("org_id", orgId)
          .returns<{ user_id: string; profiles: Profile }[]>(),
        supabase
          .from("time_entries")
          .select("user_id, hour")
          .eq("org_id", orgId)
          .gte("date", startDate),
      ]);

      if (!members || !entries) { setLoading(false); return; }

      // Find each member's typical active hours (top hours by frequency)
      const memberHours = new Map<string, Map<number, number>>();
      for (const e of entries) {
        const hours = memberHours.get(e.user_id) ?? new Map();
        hours.set(e.hour, (hours.get(e.hour) ?? 0) + 1);
        memberHours.set(e.user_id, hours);
      }

      const result: MemberSchedule[] = members.map((m) => {
        const hours = memberHours.get(m.user_id) ?? new Map();
        const activeHours = new Set<number>();
        // Consider a hour "active" if they've worked it at least 3 times in 14 days
        for (const [hour, count] of hours) {
          if (count >= 3) activeHours.add(hour);
        }
        return { profile: m.profiles, activeHours };
      }).filter((s) => s.activeHours.size > 0);

      setSchedules(result);
      setLoading(false);
    }
    load();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || schedules.length < 2) return null;

  // Calculate overlap: hours where ALL members are active
  const overlapHours = WORK_HOURS.filter((h) =>
    schedules.every((s) => s.activeHours.has(h))
  );

  // Calculate per-hour activity density
  const hourDensity = new Map<number, number>();
  for (const h of WORK_HOURS) {
    let count = 0;
    for (const s of schedules) {
      if (s.activeHours.has(h)) count++;
    }
    hourDensity.set(h, count);
  }

  const maxDensity = schedules.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-500" />
          Ventanas de Sincronizacion
          {overlapHours.length > 0 && (
            <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">
              {overlapHours.length}h de overlap total
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Per-member timeline */}
        <div className="space-y-2 mb-4">
          {schedules.map((s) => (
            <div key={s.profile.id} className="flex items-center gap-2">
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={s.profile.avatar_url ?? undefined} />
                <AvatarFallback className="text-[8px]">{getInitials(s.profile.full_name)}</AvatarFallback>
              </Avatar>
              <span className="text-[10px] text-muted-foreground w-16 truncate shrink-0">
                {s.profile.full_name?.split(" ")[0]}
              </span>
              <div className="flex gap-px flex-1">
                {WORK_HOURS.map((h) => {
                  const active = s.activeHours.has(h);
                  const isOverlap = overlapHours.includes(h);
                  return (
                    <div
                      key={h}
                      className={cn(
                        "flex-1 h-4 rounded-sm transition-colors",
                        active && isOverlap ? "bg-green-400 dark:bg-green-600" :
                        active ? "bg-violet-300 dark:bg-violet-700" :
                        "bg-muted/20"
                      )}
                      title={`${formatHour(h)}: ${active ? "Activo" : "Inactivo"}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Density bar */}
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Densidad del equipo</p>
          <div className="flex gap-px">
            {WORK_HOURS.map((h) => {
              const density = hourDensity.get(h) ?? 0;
              const pct = (density / maxDensity) * 100;
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className={cn(
                      "w-full h-6 rounded-sm",
                      pct >= 100 ? "bg-green-500" :
                      pct >= 60 ? "bg-blue-400" :
                      pct >= 30 ? "bg-yellow-300 dark:bg-yellow-700" :
                      density > 0 ? "bg-muted" : "bg-muted/20"
                    )}
                    title={`${formatHour(h)}: ${density}/${maxDensity} activos`}
                  />
                  <span className="text-[7px] text-muted-foreground">
                    {h > 12 ? h - 12 : h}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sync windows */}
        {overlapHours.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Sync:</span>
            {/* Group contiguous hours */}
            {(() => {
              const blocks: number[][] = [];
              let block = [overlapHours[0]];
              for (let i = 1; i < overlapHours.length; i++) {
                if (overlapHours[i] === overlapHours[i - 1] + 1) {
                  block.push(overlapHours[i]);
                } else {
                  blocks.push(block);
                  block = [overlapHours[i]];
                }
              }
              blocks.push(block);
              return blocks.map((b, i) => (
                <Badge key={i} variant="outline" className="text-[10px] text-green-600 border-green-300">
                  {formatHour(b[0])} - {formatHour(b[b.length - 1] + 1)}
                </Badge>
              ));
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
