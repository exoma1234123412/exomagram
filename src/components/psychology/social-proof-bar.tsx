"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

interface ActionCompletion {
  label: string;
  completed: number;
  total: number;
  percentage: number;
  userDone: boolean;
}

export function SocialProofBar({ orgId }: { orgId: string }) {
  const { userId } = useOrg();
  const supabase = createClient();
  const [actions, setActions] = useState<ActionCompletion[]>([]);
  const [callout, setCallout] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !orgId) return;

    async function load() {
      const today = getTodayMTY();

      const [
        { count: memberCount },
        { data: entriesData },
        { data: standupsData },
        { data: closeoutsData },
        { data: healthData },
      ] = await Promise.all([
        supabase
          .from("org_members")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId),
        supabase
          .from("time_entries")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("date", today)
          .is("deleted_at", null),
        supabase
          .from("standups")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("date", today),
        supabase
          .from("daily_closeouts")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("date", today),
        supabase
          .from("daily_health")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("date", today),
      ]);

      const total = memberCount ?? 0;
      if (total === 0) return;

      // Unique users per action
      const entryUsers = new Set((entriesData ?? []).map((e) => e.user_id));
      const standupUsers = new Set((standupsData ?? []).map((s) => s.user_id));
      const closeoutUsers = new Set((closeoutsData ?? []).map((c) => c.user_id));
      const healthUsers = new Set((healthData ?? []).map((h) => h.user_id));

      const results: ActionCompletion[] = [
        {
          label: "Entradas",
          completed: entryUsers.size,
          total,
          percentage: Math.round((entryUsers.size / total) * 100),
          userDone: entryUsers.has(userId!),
        },
        {
          label: "Standup",
          completed: standupUsers.size,
          total,
          percentage: Math.round((standupUsers.size / total) * 100),
          userDone: standupUsers.has(userId!),
        },
        {
          label: "Closeout",
          completed: closeoutUsers.size,
          total,
          percentage: Math.round((closeoutUsers.size / total) * 100),
          userDone: closeoutUsers.has(userId!),
        },
        {
          label: "Health",
          completed: healthUsers.size,
          total,
          percentage: Math.round((healthUsers.size / total) * 100),
          userDone: healthUsers.has(userId!),
        },
      ];

      setActions(results);

      // Find the most-completed action where this user is missing
      const missing = results
        .filter((a) => !a.userDone && a.completed > 0)
        .sort((a, b) => b.percentage - a.percentage);

      if (missing.length > 0) {
        const top = missing[0];
        const remaining = top.total - top.completed;
        if (remaining === 1) {
          setCallout(`Solo tu faltas por hacer ${top.label.toLowerCase()}.`);
        } else if (top.percentage >= 60) {
          setCallout(
            `${top.completed} de ${top.total} ya hicieron ${top.label.toLowerCase()}. Tu no.`
          );
        } else {
          setCallout(null);
        }
      } else {
        // Check if user has done everything
        const allDone = results.every((a) => a.userDone);
        if (allDone && results.some((a) => a.completed < a.total)) {
          setCallout("Vas al dia. No todos pueden decir lo mismo.");
        } else {
          setCallout(null);
        }
      }
    }

    load();
  }, [userId, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (actions.length === 0) return null;

  return (
    <div className="border border-border p-3 mb-6 font-mono">
      {/* Section label */}
      <div className="palantir-divider text-muted-foreground mb-3">
        <Users className="w-3 h-3 inline-block mr-1" />
        El equipo
      </div>

      <div className="space-y-2">
        {actions.map((action) => (
          <div key={action.label} className="flex items-center gap-2">
            {/* Label */}
            <span
              className={cn(
                "text-[10px] uppercase tracking-wide w-16 shrink-0",
                !action.userDone
                  ? "text-red-600 dark:text-red-400 font-bold"
                  : "text-muted-foreground"
              )}
            >
              {action.label}
            </span>

            {/* Bar */}
            <div className="flex-1 h-3 bg-muted/30 border border-border overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  !action.userDone ? "bg-red-500/60" : "bg-primary"
                )}
                style={{ width: `${action.percentage}%` }}
              />
            </div>

            {/* Count */}
            <span
              className={cn(
                "text-[10px] tabular-nums tracking-tight w-16 text-right shrink-0",
                !action.userDone
                  ? "text-red-600 dark:text-red-400 font-bold"
                  : "text-muted-foreground"
              )}
            >
              {action.completed}/{action.total} ({action.percentage}%)
            </span>
          </div>
        ))}
      </div>

      {/* Callout message */}
      {callout && (
        <div className="mt-3 pt-2 border-t border-border">
          <p className="text-[10px] uppercase tracking-wide font-bold text-red-600 dark:text-red-400">
            {callout}
          </p>
        </div>
      )}
    </div>
  );
}
