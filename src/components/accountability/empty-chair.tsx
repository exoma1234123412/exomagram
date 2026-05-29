"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { WORK_HOURS } from "@/lib/constants";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import { Ghost } from "lucide-react";

// PSYCHOLOGY: The Empty Chair
// Instead of showing who IS working, we highlight who ISN'T
// Absence is more psychologically powerful than presence
// An empty, glowing red avatar with your name is deeply uncomfortable
// This leverages shame avoidance — the strongest motivator

interface AbsentMember {
  profile: Profile;
  hoursLogged: number;
  lastActiveHour: number | null;
  gapHours: number; // hours since last entry
}

export function EmptyChair({ orgId }: { orgId: string }) {
  const [absent, setAbsent] = useState<AbsentMember[]>([]);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const currentHour = new Date().getHours();

  useEffect(() => {
    async function check() {
      // Only show during work hours
      if (currentHour < 8 || currentHour > 18) return;

      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        ;

      if (!members) return;

      const { data: entries } = await supabase
        .from("time_entries")
        .select("user_id, hour")
        .eq("org_id", orgId)
        .eq("date", today);

      const entryMap = new Map<string, number[]>();
      for (const e of entries ?? []) {
        const hours = entryMap.get(e.user_id) ?? [];
        hours.push(e.hour);
        entryMap.set(e.user_id, hours);
      }

      // Expected hours that should be logged by now
      const expectedHours = WORK_HOURS.filter((h) => h < currentHour);
      if (expectedHours.length === 0) return;

      const absentMembers: AbsentMember[] = [];

      for (const m of members) {
        const logged = entryMap.get(m.user_id) ?? [];
        const lastActive = logged.length > 0 ? Math.max(...logged) : null;
        const gapHours = lastActive !== null ? currentHour - lastActive : currentHour - 7;

        // Absent if: logged less than half of expected hours OR gap of 3+ hours
        if (logged.length < expectedHours.length * 0.4 || gapHours >= 3) {
          absentMembers.push({
            profile: m.profiles,
            hoursLogged: logged.length,
            lastActiveHour: lastActive,
            gapHours,
          });
        }
      }

      // Sort by most absent first
      absentMembers.sort((a, b) => b.gapHours - a.gapHours);
      setAbsent(absentMembers);
    }
    check();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (absent.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Ghost className="w-4 h-4 text-red-500" />
        <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
          La silla vacía — {absent.length} sin actividad
        </h3>
      </div>
      <div className="flex flex-wrap gap-3">
        {absent.map((m) => {
          const severity = m.gapHours >= 5 ? "high" : m.gapHours >= 3 ? "medium" : "low";
          return (
            <div
              key={m.profile.id}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all",
                severity === "high" && "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 animate-pulse",
                severity === "medium" && "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800",
                severity === "low" && "bg-yellow-50 dark:bg-yellow-950/15 border-yellow-200 dark:border-yellow-800",
              )}
            >
              <div className="relative">
                <Avatar className={cn(
                  "w-9 h-9",
                  severity === "high" && "opacity-40 grayscale",
                  severity === "medium" && "opacity-60",
                )}>
                  <AvatarImage src={m.profile.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs">{getInitials(m.profile.full_name)}</AvatarFallback>
                </Avatar>
                {severity === "high" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Ghost className="w-4 h-4 text-red-500" />
                  </div>
                )}
              </div>
              <div>
                <p className={cn(
                  "text-sm font-semibold",
                  severity === "high" && "text-red-700 dark:text-red-400",
                  severity === "medium" && "text-orange-700 dark:text-orange-400",
                  severity === "low" && "text-yellow-700 dark:text-yellow-400",
                )}>
                  {m.profile.full_name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {m.hoursLogged === 0
                    ? "0 horas hoy"
                    : m.lastActiveHour
                    ? `Última actividad: ${m.lastActiveHour > 12 ? m.lastActiveHour - 12 : m.lastActiveHour}${m.lastActiveHour >= 12 ? "pm" : "am"} (${m.gapHours}h sin actividad)`
                    : `${m.hoursLogged}h registradas`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
