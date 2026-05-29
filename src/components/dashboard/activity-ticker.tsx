"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/constants";
import type { TimeEntry, Profile, WorkCategory } from "@/lib/types/database";
import { cn } from "@/lib/utils";

type EntryWithProfile = TimeEntry & { profiles: Profile };

export function ActivityTicker({ orgId }: { orgId: string }) {
  const [entries, setEntries] = useState<EntryWithProfile[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("time_entries")
        .select("*, profiles(full_name)")
        .eq("org_id", orgId)
        .eq("date", today)
        .order("created_at", { ascending: false })
        .limit(20)
        .returns<EntryWithProfile[]>();
      setEntries(data ?? []);
    }
    load();

    // Real-time updates
    const channel = supabase
      .channel("ticker_rt")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "time_entries",
        filter: `org_id=eq.${orgId}`,
      }, async (payload) => {
        const { data } = await supabase
          .from("time_entries")
          .select("*, profiles(full_name)")
          .eq("id", payload.new.id)
          .single();
        if (data) {
          setEntries((prev) => [data as unknown as EntryWithProfile, ...prev.slice(0, 19)]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (entries.length === 0) return null;

  function timeAgo(dateStr: string) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000 / 60;
    if (diff < 1) return "ahora";
    if (diff < 60) return `${Math.round(diff)}m`;
    return `${Math.round(diff / 60)}h`;
  }

  // Double the items for seamless scrolling
  const doubled = [...entries, ...entries];

  return (
    <div className="relative overflow-hidden mb-4 rounded-xl bg-accent/40 border">
      <div
        ref={tickerRef}
        className="flex items-center gap-6 py-2 px-4 animate-ticker whitespace-nowrap"
        style={{
          animationDuration: `${entries.length * 4}s`,
        }}
      >
        {doubled.map((entry, i) => {
          const cat = CATEGORIES[entry.category as WorkCategory];
          const firstName = entry.profiles?.full_name?.split(" ")[0] ?? "?";
          return (
            <span key={`${entry.id}-${i}`} className="inline-flex items-center gap-1.5 text-xs shrink-0">
              <span>{cat?.emoji}</span>
              <span className="font-medium">{firstName}</span>
              <span className="text-muted-foreground truncate max-w-[200px]">{entry.title}</span>
              <span className="text-muted-foreground/50">{timeAgo(entry.logged_at ?? entry.created_at)}</span>
              <span className="text-muted-foreground/20 mx-2">•</span>
            </span>
          );
        })}
      </div>
      <style jsx>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker linear infinite;
        }
      `}</style>
    </div>
  );
}
