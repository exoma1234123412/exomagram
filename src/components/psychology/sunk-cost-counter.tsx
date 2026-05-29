"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn } from "@/lib/utils";
import { Flame, Clock, Shield, Trophy } from "lucide-react";

interface InvestmentData {
  currentStreak: number;
  totalDaysLogged: number;
  totalEntries: number;
  trustScore: number | null;
}

export function SunkCostCounter({ orgId }: { orgId: string }) {
  const { userId } = useOrg();
  const supabase = createClient();
  const [data, setData] = useState<InvestmentData | null>(null);

  useEffect(() => {
    if (!userId || !orgId) return;

    async function load() {
      const [streakRes, entriesRes, trustRes] = await Promise.all([
        supabase
          .from("activity_streaks")
          .select("current_streak, total_days_logged")
          .eq("user_id", userId!)
          .eq("org_id", orgId)
          .limit(1)
          .single(),
        supabase
          .from("time_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId!)
          .eq("org_id", orgId)
          .is("deleted_at", null),
        supabase
          .from("trust_score_history")
          .select("score")
          .eq("user_id", userId!)
          .eq("org_id", orgId)
          .order("date", { ascending: false })
          .limit(1)
          .single(),
      ]);

      setData({
        currentStreak: streakRes.data?.current_streak ?? 0,
        totalDaysLogged: streakRes.data?.total_days_logged ?? 0,
        totalEntries: entriesRes.count ?? 0,
        trustScore: trustRes.data?.score ?? null,
      });
    }

    load();
  }, [userId, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;

  const hasStreak = data.currentStreak > 0;
  const strongStreak = data.currentStreak > 7;
  const showMessage = data.currentStreak > 3;

  return (
    <div
      className={cn(
        "border border-border p-3 mb-6 font-mono",
        strongStreak && "animate-border-pulse"
      )}
    >
      {/* Section label */}
      <div className="palantir-divider text-muted-foreground mb-3">
        Tu inversion
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Streak */}
        <div className="flex items-center gap-2">
          <Flame
            className={cn(
              "w-3.5 h-3.5 shrink-0",
              hasStreak ? "text-amber-500" : "text-muted-foreground"
            )}
          />
          <span
            className={cn(
              "text-sm tabular-nums tracking-tight",
              strongStreak && "animate-streak-fire font-bold"
            )}
          >
            {data.currentStreak}
          </span>
          <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            dias de racha
          </span>
        </div>

        {/* Total hours (entries) */}
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <span className="text-sm font-bold tabular-nums tracking-tight">
            {data.totalEntries}
          </span>
          <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            horas registradas
          </span>
        </div>

        {/* Trust Score */}
        <div className="flex items-center gap-2">
          <Shield
            className={cn(
              "w-3.5 h-3.5 shrink-0",
              data.trustScore && data.trustScore >= 80
                ? "text-primary"
                : "text-muted-foreground"
            )}
          />
          <span className="text-sm font-bold tabular-nums tracking-tight">
            {data.trustScore !== null ? data.trustScore : "--"}
          </span>
          <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Trust Score
          </span>
        </div>

        {/* Total days */}
        <div className="flex items-center gap-2">
          <Trophy
            className={cn(
              "w-3.5 h-3.5 shrink-0",
              data.totalDaysLogged >= 30
                ? "text-amber-500"
                : "text-muted-foreground"
            )}
          />
          <span className="text-sm font-bold tabular-nums tracking-tight">
            {data.totalDaysLogged}
          </span>
          <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            dias activos
          </span>
        </div>
      </div>

      {/* Endowment message */}
      {showMessage && (
        <div className="mt-3 pt-2 border-t border-border">
          <p className="text-[10px] font-mono uppercase tracking-wide text-primary font-bold">
            Todo esto es TUYO. No lo pierdas.
          </p>
        </div>
      )}
    </div>
  );
}
