"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import type { WorkCategory } from "@/lib/types/database";
import { CATEGORIES } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { subDays } from "date-fns";
import { Activity, TrendingDown, TrendingUp, ArrowRight } from "lucide-react";

interface Drift {
  profile: Profile;
  driftScore: number; // 0-100, how much pattern changed
  shifts: { category: WorkCategory; before: number; after: number; delta: number }[];
  hoursChange: number;
  proofChange: number;
}

export function DriftDetection({ orgId }: { orgId: string }) {
  const [drifts, setDrifts] = useState<Drift[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const now = new Date();
      const thisWeekStart = subDays(now, 7).toISOString().split("T")[0];
      const lastWeekStart = subDays(now, 14).toISOString().split("T")[0];
      const today = now.toISOString().split("T")[0];

      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        ;

      if (!members) { setLoading(false); return; }

      const { data: entries } = await supabase
        .from("time_entries")
        .select("user_id, category, proof_urls, date")
        .eq("org_id", orgId)
        .gte("date", lastWeekStart)
        .lte("date", today);

      if (!entries) { setLoading(false); return; }

      const detectedDrifts: Drift[] = [];

      for (const member of members) {
        const lastWeek = entries.filter(
          (e) => e.user_id === member.user_id && e.date >= lastWeekStart && e.date < thisWeekStart
        );
        const thisWeek = entries.filter(
          (e) => e.user_id === member.user_id && e.date >= thisWeekStart
        );

        if (lastWeek.length < 5 || thisWeek.length < 5) continue; // need enough data

        // Category distribution change
        const beforeCats = new Map<WorkCategory, number>();
        const afterCats = new Map<WorkCategory, number>();
        for (const e of lastWeek) beforeCats.set(e.category as WorkCategory, (beforeCats.get(e.category as WorkCategory) ?? 0) + 1);
        for (const e of thisWeek) afterCats.set(e.category as WorkCategory, (afterCats.get(e.category as WorkCategory) ?? 0) + 1);

        const allCats = new Set([...beforeCats.keys(), ...afterCats.keys()]);
        const shifts: Drift["shifts"] = [];
        let totalDrift = 0;

        for (const cat of allCats) {
          const beforePct = lastWeek.length > 0 ? ((beforeCats.get(cat) ?? 0) / lastWeek.length) * 100 : 0;
          const afterPct = thisWeek.length > 0 ? ((afterCats.get(cat) ?? 0) / thisWeek.length) * 100 : 0;
          const delta = Math.round(afterPct - beforePct);
          if (Math.abs(delta) >= 10) { // only significant shifts
            shifts.push({ category: cat, before: Math.round(beforePct), after: Math.round(afterPct), delta });
          }
          totalDrift += Math.abs(afterPct - beforePct);
        }

        const driftScore = Math.min(100, Math.round(totalDrift / 2));

        // Hours change
        const hoursChange = thisWeek.length - lastWeek.length;

        // Proof change
        const beforeProof = lastWeek.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
        const afterProof = thisWeek.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
        const beforeProofPct = lastWeek.length > 0 ? Math.round((beforeProof / lastWeek.length) * 100) : 0;
        const afterProofPct = thisWeek.length > 0 ? Math.round((afterProof / thisWeek.length) * 100) : 0;
        const proofChange = afterProofPct - beforeProofPct;

        if (driftScore >= 15 || Math.abs(hoursChange) >= 5) { // meaningful drift
          detectedDrifts.push({
            profile: member.profiles,
            driftScore,
            shifts: shifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
            hoursChange,
            proofChange,
          });
        }
      }

      detectedDrifts.sort((a, b) => b.driftScore - a.driftScore);
      setDrifts(detectedDrifts);
      setLoading(false);
    }
    load();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return null;
  if (drifts.length === 0) return null;

  return (
    <Card className="mb-6 border-amber-200 dark:border-amber-800">
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-amber-500" />
          Drift Detectado
          <Badge variant="outline" className="text-[10px]">{drifts.length} persona{drifts.length > 1 ? "s" : ""}</Badge>
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Cambios significativos en patrones de trabajo vs la semana pasada
        </p>
        <div className="space-y-3">
          {drifts.map((d) => (
            <div key={d.profile.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/20">
              <Avatar className="w-8 h-8 mt-0.5">
                <AvatarImage src={d.profile.avatar_url ?? undefined} />
                <AvatarFallback className="text-[10px]">{getInitials(d.profile.full_name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{d.profile.full_name ?? d.profile.email}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      d.driftScore >= 40 ? "text-red-600 border-red-300" :
                      d.driftScore >= 25 ? "text-amber-600 border-amber-300" :
                      "text-yellow-600 border-yellow-300"
                    )}
                  >
                    {d.driftScore}% drift
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {d.shifts.slice(0, 3).map((s) => (
                    <span key={s.category} className="inline-flex items-center gap-0.5 text-[10px]">
                      {CATEGORIES[s.category].emoji}
                      <span className="text-muted-foreground">{s.before}%</span>
                      <ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
                      <span className={s.delta > 0 ? "text-green-600" : "text-red-600"}>
                        {s.after}%
                      </span>
                    </span>
                  ))}
                  {d.hoursChange !== 0 && (
                    <span className={cn("text-[10px]", d.hoursChange > 0 ? "text-green-600" : "text-red-600")}>
                      {d.hoursChange > 0 ? "+" : ""}{d.hoursChange}h
                    </span>
                  )}
                  {Math.abs(d.proofChange) >= 10 && (
                    <span className={cn("text-[10px]", d.proofChange > 0 ? "text-green-600" : "text-red-600")}>
                      evidencia {d.proofChange > 0 ? "+" : ""}{d.proofChange}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
