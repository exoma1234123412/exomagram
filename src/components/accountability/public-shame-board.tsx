"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { AlertTriangle, Shield, XCircle, Clock, Ghost } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// PSYCHOLOGICAL TECHNIQUE: Public Accountability Board
// ═══════════════════════════════════════════════════════════════
//
// Based on: Loss Aversion + Social Identity Theory
//
// Shows the WORST performers with their specific failures.
// Nobody wants to be on this board.
//
// Research shows that public accountability is 3x more effective
// than private feedback. The fear of appearing here is the deterrent.
//
// Rules:
// - Only shows people with actual red flags (not just low scores)
// - Shows specific, undeniable facts (not opinions)
// - Updates in real-time
// - Cannot be hidden or dismissed

interface ShameEntry {
  profile: Profile;
  reasons: string[];
  severity: "warning" | "critical";
}

export function PublicAccountabilityBoard({ orgId }: { orgId: string }) {
  const [entries, setEntries] = useState<ShameEntry[]>([]);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const currentHour = new Date().getHours();

  useEffect(() => {
    if (currentHour < 10) return; // Don't show before 10am

    async function check() {
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        ;

      const { data: allEntries } = await supabase
        .from("time_entries")
        .select("user_id, hour, proof_urls, is_late, category")
        .eq("org_id", orgId)
        .eq("date", today);

      const { data: standups } = await supabase
        .from("standups")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("date", today);

      const { data: promises } = await supabase
        .from("daily_promises")
        .select("user_id, status")
        .eq("org_id", orgId)
        .eq("date", today);

      const standupSet = new Set(standups?.map((s) => s.user_id) ?? []);
      const result: ShameEntry[] = [];

      for (const m of members ?? []) {
        const userEntries = (allEntries ?? []).filter((e) => e.user_id === m.user_id);
        const reasons: string[] = [];
        let severity: ShameEntry["severity"] = "warning";

        // Zero hours after 10am
        if (userEntries.length === 0 && currentHour >= 10) {
          reasons.push(`0 horas registradas (son las ${currentHour > 12 ? currentHour - 12 : currentHour}${currentHour >= 12 ? "pm" : "am"})`);
          severity = currentHour >= 14 ? "critical" : "warning";
        }

        // No standup after 10am
        if (!standupSet.has(m.user_id) && currentHour >= 10) {
          reasons.push("No hizo standup");
        }

        // Broken promises
        const userPromises = (promises ?? []).filter((p) => p.user_id === m.user_id);
        const broken = userPromises.filter((p) => p.status === "broken");
        if (broken.length > 0) {
          reasons.push(`${broken.length} promesa(s) rota(s)`);
          severity = "critical";
        }

        // Heavy idle (3+ hours blocked/break)
        const wasted = userEntries.filter((e) => e.category === "blocked" || e.category === "break");
        if (wasted.length >= 3) {
          reasons.push(`${wasted.length}h en bloqueado/descanso`);
        }

        // All late
        const lateOnes = userEntries.filter((e) => e.is_late);
        if (lateOnes.length === userEntries.length && userEntries.length >= 3) {
          reasons.push("100% entradas tardías");
        }

        // Zero proof
        const withProof = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
        if (userEntries.length >= 4 && withProof.length === 0) {
          reasons.push("0% evidencia");
        }

        if (reasons.length >= 2 || (reasons.length >= 1 && severity === "critical")) {
          result.push({ profile: m.profiles, reasons, severity });
        }
      }

      result.sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));
      setEntries(result);
    }
    check();

    const interval = setInterval(check, 180_000); // Refresh every 3 min
    return () => clearInterval(interval);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (entries.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
          Accountability pública — {entries.length} persona(s) con problemas
        </h3>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.profile.id}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all",
              entry.severity === "critical"
                ? "bg-red-50 dark:bg-red-950/15 border-red-200 dark:border-red-800 animate-pulse"
                : "bg-yellow-50 dark:bg-yellow-950/10 border-yellow-200 dark:border-yellow-800"
            )}
          >
            <Avatar className={cn("w-9 h-9", entry.severity === "critical" && "opacity-50 grayscale")}>
              <AvatarImage src={entry.profile.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs">{getInitials(entry.profile.full_name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{entry.profile.full_name}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {entry.reasons.map((r, i) => (
                  <Badge key={i} variant={entry.severity === "critical" ? "destructive" : "outline"} className="text-[10px]">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
            {entry.severity === "critical" && (
              <XCircle className="w-5 h-5 text-red-500 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
