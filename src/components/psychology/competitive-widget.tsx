"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Swords } from "lucide-react";

interface VersusData {
  myName: string;
  myHours: number;
  rivalName: string;
  rivalHours: number;
  diff: number;
  iAmAhead: boolean;
  isTied: boolean;
}

export function CompetitiveWidget({ orgId }: { orgId: string }) {
  const { userId } = useOrg();
  const supabase = createClient();
  const [data, setData] = useState<VersusData | null>(null);

  useEffect(() => {
    if (!userId || !orgId) return;

    async function load() {
      const today = getTodayMTY();

      const [{ data: members }, { data: entries }] = await Promise.all([
        supabase
          .from("org_members")
          .select("user_id, profiles(full_name)")
          .eq("org_id", orgId),
        supabase
          .from("time_entries")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("date", today)
          .is("deleted_at", null),
      ]);

      if (!members || members.length < 2) return;

      // Count hours per user
      const hoursByUser: Record<string, number> = {};
      for (const m of members) {
        hoursByUser[m.user_id] = 0;
      }
      for (const e of entries ?? []) {
        if (e.user_id in hoursByUser) {
          hoursByUser[e.user_id]++;
        }
      }

      // Name map
      const nameMap = new Map<string, string>();
      for (const m of members) {
        const profile = m.profiles as unknown as { full_name: string | null } | null;
        const firstName = profile?.full_name?.split(" ")[0] ?? "?";
        nameMap.set(m.user_id, firstName);
      }

      const myHours = hoursByUser[userId!] ?? 0;
      const myName = nameMap.get(userId!) ?? "Tu";

      // Find closest competitor (excluding self)
      let closestId: string | null = null;
      let closestDiff = Infinity;

      for (const [uid, hours] of Object.entries(hoursByUser)) {
        if (uid === userId) continue;
        const diff = Math.abs(hours - myHours);
        if (diff < closestDiff || (diff === closestDiff && hours > (hoursByUser[closestId!] ?? 0))) {
          closestDiff = diff;
          closestId = uid;
        }
      }

      if (!closestId) return;

      const rivalHours = hoursByUser[closestId];
      const rivalName = nameMap.get(closestId) ?? "?";
      const diff = Math.abs(myHours - rivalHours);
      const iAmAhead = myHours > rivalHours;
      const isTied = myHours === rivalHours;

      setData({ myName, myHours, rivalName, rivalHours, diff, iAmAhead, isTied });
    }

    load();

    // Refresh every 2 minutes
    const interval = setInterval(load, 120_000);
    return () => clearInterval(interval);
  }, [userId, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;

  const maxHours = Math.max(data.myHours, data.rivalHours, 1);
  const myPct = Math.round((data.myHours / maxHours) * 100);
  const rivalPct = Math.round((data.rivalHours / maxHours) * 100);

  return (
    <div className="border border-border p-3 mb-6 font-mono">
      {/* Section label */}
      <div className="palantir-divider text-muted-foreground mb-3">
        <Swords className="w-3 h-3 inline-block mr-1" />
        Versus
      </div>

      {/* Bars */}
      <div className="space-y-2">
        {/* My bar */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide w-16 truncate text-foreground font-bold">
            {data.myName}
          </span>
          <div className="flex-1 h-4 bg-muted/30 border border-border relative overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${myPct}%` }}
            />
          </div>
          <span className="text-sm font-bold tabular-nums tracking-tight w-8 text-right">
            {data.myHours}h
          </span>
        </div>

        {/* Rival bar */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide w-16 truncate text-muted-foreground">
            {data.rivalName}
          </span>
          <div className="flex-1 h-4 bg-muted/30 border border-border relative overflow-hidden">
            <div
              className="h-full bg-muted-foreground/30 transition-all duration-500"
              style={{ width: `${rivalPct}%` }}
            />
          </div>
          <span className="text-sm tabular-nums tracking-tight w-8 text-right text-muted-foreground">
            {data.rivalHours}h
          </span>
        </div>
      </div>

      {/* Verdict */}
      <div className="mt-3 pt-2 border-t border-border">
        {data.isTied ? (
          <p className="text-[10px] uppercase tracking-wide text-amber-500 font-bold">
            Empate. Quien registra primero, gana.
          </p>
        ) : data.iAmAhead ? (
          <p className="text-[10px] uppercase tracking-wide font-bold">
            <span className="text-emerald-600 dark:text-emerald-400">Vas ganando</span>
            <span className="text-muted-foreground ml-1">
              +{data.diff}h de ventaja
            </span>
          </p>
        ) : (
          <p className="text-[10px] uppercase tracking-wide font-bold">
            <span className="text-red-600 dark:text-red-400">
              {data.rivalName} te lleva {data.diff}h.
            </span>
            <span className="text-muted-foreground ml-1">
              Vas a dejar que gane?
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
