"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Target } from "lucide-react";

interface ProgressData {
  hoursLogged: number;
  expectedHours: number;
  percentage: number;
}

function getMessage(hours: number, expected: number, pct: number): string {
  if (hours === 0) return "0 horas. El dia se va.";
  if (hours === 1) return "Primera hora registrada. El momentum arranco.";
  if (pct >= 100) return "Dia completo. Mision cumplida.";
  if (pct >= 75) return `Te faltan ${expected - hours}h. Ya casi. No pares ahora.`;
  if (pct >= 50) return `Te faltan ${expected - hours}h. Estas al ${pct}%. No pares ahora.`;
  return `Te faltan ${expected - hours}h. Hay que moverse.`;
}

function getBarColor(pct: number): string {
  if (pct >= 60) return "bg-primary";
  if (pct >= 30) return "bg-amber-500";
  return "bg-red-500";
}

function getTextColor(pct: number): string {
  if (pct >= 60) return "text-primary";
  if (pct >= 30) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function GoalGradient({ orgId }: { orgId: string }) {
  const { userId } = useOrg();
  const supabase = createClient();
  const [data, setData] = useState<ProgressData | null>(null);

  useEffect(() => {
    if (!userId || !orgId) return;

    async function load() {
      const today = getTodayMTY();

      const [entriesRes, settingsRes] = await Promise.all([
        supabase
          .from("time_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId!)
          .eq("org_id", orgId)
          .eq("date", today)
          .is("deleted_at", null),
        supabase
          .from("org_settings")
          .select("expected_daily_hours")
          .eq("org_id", orgId)
          .limit(1)
          .single(),
      ]);

      const hoursLogged = entriesRes.count ?? 0;
      const expectedHours = settingsRes.data?.expected_daily_hours ?? EXPECTED_DAILY_HOURS;
      const percentage = expectedHours > 0
        ? Math.min(100, Math.round((hoursLogged / expectedHours) * 100))
        : 0;

      setData({ hoursLogged, expectedHours, percentage });
    }

    load();
  }, [userId, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;

  const message = getMessage(data.hoursLogged, data.expectedHours, data.percentage);
  const barColor = getBarColor(data.percentage);
  const textColor = getTextColor(data.percentage);

  return (
    <div className="border border-border p-3 mb-6 font-mono">
      {/* Section label */}
      <div className="palantir-divider text-muted-foreground mb-3">
        <Target className="w-3 h-3 inline-block mr-1" />
        Progreso del dia
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="h-3 w-full bg-muted/30 border border-border overflow-hidden">
          <div
            className={cn("h-full transition-all duration-700 ease-out", barColor)}
            style={{ width: `${data.percentage}%` }}
          />
        </div>

        {/* Numbers */}
        <div className="flex items-center justify-between">
          <span className={cn("text-sm font-bold tabular-nums tracking-tight", textColor)}>
            {data.hoursLogged}/{data.expectedHours} horas
          </span>
          <span className={cn("text-sm font-bold tabular-nums tracking-tight", textColor)}>
            {data.percentage}%
          </span>
        </div>

        {/* Message */}
        <div className="pt-2 border-t border-border">
          <p className={cn("text-[10px] uppercase tracking-wide font-bold", textColor)}>
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
