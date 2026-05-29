"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Profile } from "@/lib/types/database";
import { CATEGORIES, WORK_HOURS, CATEGORY_COLORS } from "@/lib/constants";
import { cn, formatHourShort, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Grid3X3 } from "lucide-react";

type EntryWithProfile = TimeEntry & { profiles: Profile };

const CATEGORY_GRADIENTS: Record<string, string> = {
  deep_work: "from-violet-400 to-violet-600",
  meeting: "from-blue-400 to-blue-600",
  review: "from-amber-400 to-amber-600",
  admin: "from-slate-300 to-slate-500",
  planning: "from-emerald-400 to-emerald-600",
  learning: "from-pink-400 to-pink-600",
  break: "from-green-300 to-green-500",
  blocked: "from-red-400 to-red-600",
};

export function TeamGrid({ date, orgId }: { date: string; orgId: string }) {
  const [entries, setEntries] = useState<EntryWithProfile[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetch() {
      setLoading(true);

      const { data: memberData } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        ;

      if (memberData) {
        setMembers(memberData.map((m) => m.profiles));
      }

      const { data: entryData } = await supabase
        .from("time_entries")
        .select("*, profiles(*)")
        .eq("org_id", orgId)
        .eq("date", date)
        ;

      setEntries(entryData ?? []);
      setLoading(false);
    }

    fetch();

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
            ;
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
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando grid...</p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <Grid3X3 className="w-7 h-7 text-primary/40" />
        </div>
        <p className="text-sm text-muted-foreground">No hay miembros en este equipo.</p>
      </div>
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
      <div className="overflow-x-auto bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
        <div className="min-w-[600px]">
          {/* Header row - member names */}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `72px repeat(${members.length}, 1fr)` }}>
            <div />
            {members.map((member) => (
              <div key={member.id} className="flex flex-col items-center gap-1.5 py-2">
                <Avatar className="w-9 h-9 ring-2 ring-background shadow-sm">
                  <AvatarImage src={member.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px] font-semibold bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/40 dark:to-sky-900/30">
                    {getInitials(member.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[11px] font-semibold truncate max-w-[80px] text-center text-muted-foreground">
                  {member.full_name?.split(" ")[0] ?? "?"}
                </span>
              </div>
            ))}
          </div>

          {/* Grid rows - one per hour */}
          {WORK_HOURS.map((hour) => (
            <div
              key={hour}
              className="grid gap-1.5 mb-1.5"
              style={{ gridTemplateColumns: `72px repeat(${members.length}, 1fr)` }}
            >
              {/* Hour label */}
              <div className="flex items-center justify-end pr-3 text-[11px] text-muted-foreground/60 font-semibold tabular-nums">
                {formatHourShort(hour)}
              </div>

              {/* Cells */}
              {members.map((member) => {
                const entry = lookup.get(member.id)?.get(hour);
                const gradient = entry ? CATEGORY_GRADIENTS[entry.category] : null;
                return (
                  <Tooltip key={`${member.id}-${hour}`}>
                    <TooltipTrigger
                      className={cn(
                        "h-11 rounded-xl transition-all duration-200 cursor-default w-full",
                        entry
                          ? cn(
                              "bg-gradient-to-br",
                              gradient,
                              "opacity-75 hover:opacity-100 hover:shadow-md hover:scale-[1.02]"
                            )
                          : "bg-muted/20 dark:bg-muted/5 hover:bg-muted/30"
                      )}
                    />
                    {entry && (
                      <TooltipContent side="top" className="max-w-[220px] rounded-xl">
                        <p className="font-semibold text-sm">
                          {CATEGORIES[entry.category].emoji}{" "}
                          {entry.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {member.full_name} · {CATEGORIES[entry.category].label}
                        </p>
                        {entry.description && (
                          <p className="text-xs mt-1.5 opacity-70 line-clamp-2">
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
          <div className="flex flex-wrap gap-4 mt-6 pt-5 border-t border-border/30">
            {Object.entries(CATEGORIES).map(([key, cat]) => (
              <div key={key} className="flex items-center gap-2">
                <div
                  className={cn("w-3 h-3 rounded-md", CATEGORY_COLORS[key])}
                />
                <span className="text-[11px] text-muted-foreground/70 font-medium">{cat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
