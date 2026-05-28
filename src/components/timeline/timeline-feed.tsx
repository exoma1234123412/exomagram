"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Profile } from "@/lib/types/database";
import { TimeEntryCard } from "./time-entry-card";
import { WORK_HOURS } from "@/lib/constants";
import { Loader2 } from "lucide-react";
import type { TimelineFilters } from "./timeline-filters";

type EntryWithProfile = TimeEntry & { profiles: Profile };

export function TimelineFeed({
  date,
  orgId,
  filters,
}: {
  date: string;
  orgId: string;
  filters?: TimelineFilters;
}) {
  const [entries, setEntries] = useState<EntryWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchEntries() {
      setLoading(true);
      const { data } = await supabase
        .from("time_entries")
        .select("*, profiles(*)")
        .eq("org_id", orgId)
        .eq("date", date)
        .order("hour", { ascending: false })
        .returns<EntryWithProfile[]>();

      setEntries(data ?? []);
      setLoading(false);
    }

    fetchEntries();

    // Real-time subscription
    const channel = supabase
      .channel("time_entries_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        async () => {
          // Refetch on any change
          const { data } = await supabase
            .from("time_entries")
            .select("*, profiles(*)")
            .eq("org_id", orgId)
            .eq("date", date)
            .order("hour", { ascending: false })
            .returns<EntryWithProfile[]>();
          setEntries(data ?? []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [date, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredEntries = useMemo(() => {
    if (!filters) return entries;

    return entries.filter((entry) => {
      if (filters.person && entry.user_id !== filters.person) return false;
      if (filters.category && entry.category !== filters.category) return false;
      if (filters.verification === "with_proof") {
        if (!entry.proof_urls || entry.proof_urls.length === 0) return false;
      }
      if (filters.verification === "without_proof") {
        if (entry.proof_urls && entry.proof_urls.length > 0) return false;
      }
      return true;
    });
  }, [entries, filters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">
          No hay entradas para este d&iacute;a todav&iacute;a.
        </p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          S&eacute; el primero en registrar tu hora.
        </p>
      </div>
    );
  }

  if (filteredEntries.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">
          No hay entradas que coincidan con los filtros.
        </p>
      </div>
    );
  }

  // Group by hour
  const byHour = new Map<number, EntryWithProfile[]>();
  for (const entry of filteredEntries) {
    const list = byHour.get(entry.hour) ?? [];
    list.push(entry);
    byHour.set(entry.hour, list);
  }

  return (
    <div className="space-y-1">
      {WORK_HOURS.slice()
        .reverse()
        .map((hour) => {
          const hourEntries = byHour.get(hour);
          if (!hourEntries) return null;
          return (
            <div key={hour} className="space-y-2">
              {hourEntries.map((entry) => (
                <TimeEntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          );
        })}
    </div>
  );
}
