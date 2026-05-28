"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { subDays } from "date-fns";
import { Siren, AlertTriangle, TrendingDown, Users, Brain, BookOpen, Clock } from "lucide-react";

interface AntiPattern {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  icon: React.ReactNode;
  metric: string;
}

export function AntiPatterns({ orgId, days = 7 }: { orgId: string; days?: number }) {
  const [patterns, setPatterns] = useState<AntiPattern[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const now = new Date();
      const startDate = subDays(now, days).toISOString().split("T")[0];
      const prevStart = subDays(now, days * 2).toISOString().split("T")[0];
      const today = now.toISOString().split("T")[0];

      const [{ data: members }, { data: entries }, { data: prevEntries }, { data: flags }] = await Promise.all([
        supabase.from("org_members").select("user_id").eq("org_id", orgId),
        supabase.from("time_entries").select("user_id, category, proof_urls, is_late, date, hour").eq("org_id", orgId).gte("date", startDate),
        supabase.from("time_entries").select("category").eq("org_id", orgId).gte("date", prevStart).lt("date", startDate),
        supabase.from("accountability_flags").select("flag_type, user_id").eq("org_id", orgId).gte("date", startDate).eq("resolved", false),
      ]);

      if (!entries || !members) return;

      const detected: AntiPattern[] = [];
      const memberCount = members.length;

      // 1. Multiple people blocked
      const blockedEntries = entries.filter((e) => e.category === "blocked");
      const blockedPeople = new Set(blockedEntries.map((e) => e.user_id));
      if (blockedPeople.size >= 2) {
        detected.push({
          id: "multi_blocked",
          severity: "critical",
          title: "Multiples personas bloqueadas",
          description: `${blockedPeople.size} personas reportan estar bloqueadas. Posible problema sistemico.`,
          icon: <AlertTriangle className="w-4 h-4" />,
          metric: `${blockedPeople.size}/${memberCount}`,
        });
      }

      // 2. Deep work declining
      const currentDeep = entries.filter((e) => e.category === "deep_work").length;
      const prevDeep = (prevEntries ?? []).filter((e) => e.category === "deep_work").length;
      if (prevDeep > 0) {
        const deepChange = Math.round(((currentDeep - prevDeep) / prevDeep) * 100);
        if (deepChange < -25) {
          detected.push({
            id: "deep_work_decline",
            severity: "warning",
            title: "Deep work en declive",
            description: `El deep work bajo ${Math.abs(deepChange)}% vs el periodo anterior. Las reuniones podrian estar desplazandolo.`,
            icon: <Brain className="w-4 h-4" />,
            metric: `${deepChange}%`,
          });
        }
      }

      // 3. No learning time
      const learningEntries = entries.filter((e) => e.category === "learning");
      if (learningEntries.length === 0 && entries.length > memberCount * 5) {
        detected.push({
          id: "no_learning",
          severity: "info",
          title: "Sin tiempo de aprendizaje",
          description: `Nadie en el equipo registro horas de aprendizaje en ${days} dias. El crecimiento profesional importa.`,
          icon: <BookOpen className="w-4 h-4" />,
          metric: "0h",
        });
      }

      // 4. Meeting overload (>35% of total)
      const meetingEntries = entries.filter((e) => e.category === "meeting");
      const meetingPct = entries.length > 0 ? Math.round((meetingEntries.length / entries.length) * 100) : 0;
      if (meetingPct > 35) {
        detected.push({
          id: "meeting_overload",
          severity: "warning",
          title: "Sobrecarga de reuniones",
          description: `El ${meetingPct}% del tiempo del equipo se va en reuniones. Considera cancelar reuniones innecesarias.`,
          icon: <Users className="w-4 h-4" />,
          metric: `${meetingPct}%`,
        });
      }

      // 5. High late entry rate
      const lateEntries = entries.filter((e) => e.is_late);
      const latePct = entries.length > 0 ? Math.round((lateEntries.length / entries.length) * 100) : 0;
      if (latePct > 40) {
        detected.push({
          id: "high_late",
          severity: "warning",
          title: "Alta tasa de entradas tardias",
          description: `${latePct}% de las entradas se registran tarde. El equipo no esta loggeando en tiempo real.`,
          icon: <Clock className="w-4 h-4" />,
          metric: `${latePct}%`,
        });
      }

      // 6. Low proof rate across team
      const withProof = entries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
      const proofPct = entries.length > 0 ? Math.round((withProof.length / entries.length) * 100) : 0;
      if (proofPct < 40 && entries.length > memberCount * 5) {
        detected.push({
          id: "low_proof",
          severity: "warning",
          title: "Baja tasa de evidencia",
          description: `Solo ${proofPct}% de las entradas tienen evidencia. La transparencia pierde sentido sin pruebas.`,
          icon: <AlertTriangle className="w-4 h-4" />,
          metric: `${proofPct}%`,
        });
      }

      // 7. Flag accumulation
      const unresolvedFlags = flags?.length ?? 0;
      if (unresolvedFlags > memberCount * 2) {
        detected.push({
          id: "flag_accumulation",
          severity: "critical",
          title: "Acumulacion de flags",
          description: `${unresolvedFlags} flags sin resolver. Los problemas se estan ignorando.`,
          icon: <Siren className="w-4 h-4" />,
          metric: `${unresolvedFlags}`,
        });
      }

      setPatterns(detected);
    }
    load();
  }, [orgId, days]); // eslint-disable-line react-hooks/exhaustive-deps

  if (patterns.length === 0) return null;

  const severityOrder = { critical: 0, warning: 1, info: 2 };
  const sorted = [...patterns].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <Card className="border-orange-200 dark:border-orange-800">
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Siren className="w-4 h-4 text-orange-500" />
          Anti-Patrones Detectados
          <Badge variant="destructive" className="text-[10px]">{patterns.length}</Badge>
        </h3>
        <div className="space-y-2">
          {sorted.map((p) => (
            <div
              key={p.id}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg",
                p.severity === "critical" && "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800",
                p.severity === "warning" && "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800",
                p.severity === "info" && "bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800",
              )}
            >
              <div className={cn(
                "shrink-0 mt-0.5",
                p.severity === "critical" && "text-red-600",
                p.severity === "warning" && "text-amber-600",
                p.severity === "info" && "text-blue-600",
              )}>
                {p.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{p.title}</p>
                  <Badge variant="outline" className="text-[10px] shrink-0">{p.metric}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
