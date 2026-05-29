"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// TEAM DEBT
// ═══════════════════════════════════════════════════════════════
//
// When ONE person gets a D or F grade, EVERYONE sees it.
// Individual failure is collective debt.
// "El rendimiento individual afecta a todos."

interface DebtEntry {
  userName: string;
  grade: string;
  date: string;
}

export function TeamDebt({ orgId }: { orgId: string }) {
  const { userId } = useOrg();
  const [debts, setDebts] = useState<DebtEntry[]>([]);
  const supabase = createClient();

  useEffect(() => {
    if (!orgId) return;

    async function fetchDebts() {
      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      // Query ai_daily_insights for yesterday — look for D or F grades
      const { data: insights } = await supabase
        .from("ai_daily_insights")
        .select("user_id, insight, date, profiles:user_id(full_name)")
        .eq("org_id", orgId)
        .eq("date", yesterdayStr);

      if (!insights || insights.length === 0) {
        setDebts([]);
        return;
      }

      const failures: DebtEntry[] = [];

      for (const row of insights) {
        const insightData = row.insight as Record<string, unknown> | null;
        const grade = insightData?.grade as string | undefined;

        if (grade && (grade === "D" || grade === "F")) {
          const profile = row.profiles as unknown as { full_name: string | null } | null;
          failures.push({
            userName: profile?.full_name?.split(" ")[0] ?? "Alguien",
            grade,
            date: row.date,
          });
        }
      }

      setDebts(failures);
    }

    fetchDebts();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (debts.length === 0) return null;

  return (
    <div
      className={cn(
        "mb-8 px-4 py-3 rounded-xl border",
        "bg-destructive/5 border-destructive/20",
        "transition-all duration-300"
      )}
    >
      <div className="space-y-2">
        {debts.map((debt, i) => (
          <p key={i} className="text-sm">
            <span className="mr-1">⚠️</span>
            <span className="font-medium">Deuda de equipo:</span>{" "}
            <span className="font-semibold">{debt.userName}</span>{" "}
            sacó <span className="font-bold text-destructive">{debt.grade}</span> ayer.{" "}
            <span className="text-muted-foreground">El rendimiento individual afecta a todos.</span>
          </p>
        ))}
      </div>
    </div>
  );
}
