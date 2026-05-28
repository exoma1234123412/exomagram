"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Profile } from "@/lib/types/database";
import { CATEGORIES, WORK_HOURS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";

type EntryWithProfile = TimeEntry & { profiles: Profile };

function formatHour(h: number) {
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}${suffix}`;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

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

export function TeamGrid({ date, orgId }: { date: string; orgId: string }) {
  const [entries, setEntries] = useState<EntryWithProfile[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetch() {
      setLoading(true);

      // Fetch members
      const { data: memberData } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        .returns<{ user_id: string; profiles: Profile }[]>();

      if (memberData) {
        setMembers(memberData.map((m) => m.profiles));
      }

      // Fetch entries
      const { data: entryData } = await supabase
        .from("time_entries")
        .select("*, profiles(*)")
        .eq("org_id", orgId)
        .eq("date", date)
        .returns<EntryWithProfile[]>();

      setEntries(entryData ?? []);
      setLoading(false);
    }

    fetch();

    // Real-time
    const channel = supabase
      .channel("grid_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        async () => {
          const { data } = await supabase
            .from("time_entries")
            .select("*, profiles(*)")
            .eq("org_id", orgId)
            .eq("date", date)
            .returns<EntryWithProfile[]>();
          setEntries(data ?? []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [date, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-20">
        No hay miembros en este equipo.
      </p>
    );
  }

  // Build lookup: userId -> hour -> entry
  const lookup = new Map<string, Map<number, EntryWithProfile>>();
  for (const entry of entries) {
    if (!lookup.has(entry.user_id)) lookup.set(entry.user_id, new Map());
    lookup.get(entry.user_id)!.set(entry.hour, entry);
  }

  return (
    <TooltipProvider>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Header row - member names */}
          <div className="grid gap-1" style={{ gridTemplateColumns: `80px repeat(${members.length}, 1fr)` }}>
            <div /> {/* Empty corner */}
            {members.map((member) => (
              <div key={member.id} className="flex flex-col items-center gap-1 py-2">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={member.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs">
                    {getInitials(member.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium truncate max-w-[80px] text-center">
                  {member.full_name?.split(" ")[0] ?? "?"}
                </span>
              </div>
            ))}
          </div>

          {/* Grid rows - one per hour */}
          {WORK_HOURS.map((hour) => (
            <div
              key={hour}
              className="grid gap-1 mb-1"
              style={{ gridTemplateColumns: `80px repeat(${members.length}, 1fr)` }}
            >
              {/* Hour label */}
              <div className="flex items-center justify-end pr-3 text-xs text-muted-foreground font-mono">
                {formatHour(hour)}
              </div>

              {/* Cells */}
              {members.map((member) => {
                const entry = lookup.get(member.id)?.get(hour);
                return (
                  <Tooltip key={`${member.id}-${hour}`}>
                    <TooltipTrigger
                      className={cn(
                        "h-10 rounded-md transition-all cursor-default w-full",
                        entry
                          ? cn(CATEGORY_COLORS[entry.category], "opacity-80 hover:opacity-100")
                          : "bg-muted/30 dark:bg-muted/10"
                      )}
                    />
                    {entry && (
                      <TooltipContent side="top" className="max-w-[200px]">
                        <p className="font-medium text-sm">
                          {CATEGORIES[entry.category].emoji}{" "}
                          {entry.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.full_name} · {CATEGORIES[entry.category].label}
                        </p>
                        {entry.description && (
                          <p className="text-xs mt-1 opacity-70 line-clamp-2">
                            {entry.description}
                          </p>
                        )}
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t">
            {Object.entries(CATEGORIES).map(([key, cat]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div
                  className={cn("w-3 h-3 rounded-sm", CATEGORY_COLORS[key])}
                />
                <span className="text-xs text-muted-foreground">{cat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
