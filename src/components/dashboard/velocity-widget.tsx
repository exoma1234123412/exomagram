"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { subDays } from "date-fns";
import { Gauge, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface VelocityData {
  hoursThisWeek: number;
  hoursLastWeek: number;
  hoursDelta: number;
  proofThisWeek: number;
  proofLastWeek: number;
  proofDelta: number;
  // 7-day rolling sparkline
  dailyHours: number[];
}

export function VelocityWidget({ orgId }: { orgId: string }) {
  const [data, setData] = useState<VelocityData | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const twoWeeksAgo = subDays(now, 14).toISOString().split("T")[0];
      const oneWeekAgo = subDays(now, 7).toISOString().split("T")[0];
      const today = now.toISOString().split("T")[0];

      const { data: entries } = await supabase
        .from("time_entries")
        .select("date, proof_urls")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .gte("date", twoWeeksAgo);

      if (!entries) return;

      const thisWeek = entries.filter((e) => e.date >= oneWeekAgo);
      const lastWeek = entries.filter((e) => e.date < oneWeekAgo);

      const thisProof = thisWeek.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
      const lastProof = lastWeek.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);

      const thisProofPct = thisWeek.length > 0 ? Math.round((thisProof.length / thisWeek.length) * 100) : 0;
      const lastProofPct = lastWeek.length > 0 ? Math.round((lastProof.length / lastWeek.length) * 100) : 0;

      // Daily sparkline (last 7 days)
      const dailyHours: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = subDays(now, i).toISOString().split("T")[0];
        dailyHours.push(entries.filter((e) => e.date === d).length);
      }

      setData({
        hoursThisWeek: thisWeek.length,
        hoursLastWeek: lastWeek.length,
        hoursDelta: thisWeek.length - lastWeek.length,
        proofThisWeek: thisProofPct,
        proofLastWeek: lastProofPct,
        proofDelta: thisProofPct - lastProofPct,
        dailyHours,
      });
    }
    load();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;

  const maxDaily = Math.max(...data.dailyHours, 1);

  return (
    <Card className="mb-4">
      <CardContent className="p-3 flex items-center gap-4">
        <Gauge className="w-5 h-5 text-primary shrink-0" />

        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Hours velocity */}
          <div className="text-center">
            <p className="text-sm font-bold tabular-nums tracking-tight">{data.hoursThisWeek}h</p>
            <div className="flex items-center justify-center gap-0.5">
              {data.hoursDelta > 0 ? (
                <TrendingUp className="w-3 h-3 text-green-500" />
              ) : data.hoursDelta < 0 ? (
                <TrendingDown className="w-3 h-3 text-red-500" />
              ) : (
                <Minus className="w-3 h-3 text-muted-foreground" />
              )}
              <span className={cn("text-[10px] font-medium",
                data.hoursDelta > 0 ? "text-green-600" : data.hoursDelta < 0 ? "text-red-600" : "text-muted-foreground"
              )}>
                {data.hoursDelta > 0 ? "+" : ""}{data.hoursDelta}
              </span>
            </div>
          </div>

          {/* Sparkline */}
          <div className="flex items-end gap-px h-6 flex-1">
            {data.dailyHours.map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-violet-400 dark:bg-violet-600 rounded-t transition-all duration-500"
                style={{ height: `${Math.max((h / maxDaily) * 100, 8)}%` }}
              />
            ))}
          </div>

          {/* Proof velocity */}
          <div className="text-center">
            <p className="text-sm font-bold tabular-nums tracking-tight">{data.proofThisWeek}%</p>
            <div className="flex items-center justify-center gap-0.5">
              {data.proofDelta > 0 ? (
                <TrendingUp className="w-3 h-3 text-green-500" />
              ) : data.proofDelta < 0 ? (
                <TrendingDown className="w-3 h-3 text-red-500" />
              ) : (
                <Minus className="w-3 h-3 text-muted-foreground" />
              )}
              <span className={cn("text-[10px] font-medium",
                data.proofDelta > 0 ? "text-green-600" : data.proofDelta < 0 ? "text-red-600" : "text-muted-foreground"
              )}>
                {data.proofDelta > 0 ? "+" : ""}{data.proofDelta}%
              </span>
            </div>
          </div>
        </div>

        <span className="text-[9px] text-muted-foreground shrink-0">vs sem. pasada</span>
      </CardContent>
    </Card>
  );
}
