"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Target, CheckCircle2, Users } from "lucide-react";

interface Challenge {
  id: string;
  title: string;
  description: string;
  check: (entries: { proof_urls: string[] | null; is_late: boolean; category: string }[]) => boolean;
}

const CHALLENGES: Challenge[] = [
  {
    id: "zero_late",
    title: "Dia sin tardanzas",
    description: "Ninguna entrada tardia hoy",
    check: (entries) => entries.length > 0 && entries.every((e) => !e.is_late),
  },
  {
    id: "full_proof",
    title: "100% evidencia",
    description: "Todas las entradas de hoy con evidencia",
    check: (entries) => entries.length > 0 && entries.every((e) => e.proof_urls && e.proof_urls.length > 0),
  },
  {
    id: "learning_hour",
    title: "Hora de aprendizaje",
    description: "Registra al menos 1 hora de aprendizaje hoy",
    check: (entries) => entries.some((e) => e.category === "learning"),
  },
  {
    id: "deep_focus",
    title: "Focus profundo",
    description: "Al menos 3 horas de deep work hoy",
    check: (entries) => entries.filter((e) => e.category === "deep_work").length >= 3,
  },
  {
    id: "no_breaks",
    title: "Productividad total",
    description: "8 horas sin descanso registrado",
    check: (entries) => entries.filter((e) => e.category !== "break").length >= 8,
  },
  {
    id: "variety",
    title: "Dia variado",
    description: "Usa al menos 4 categorias diferentes hoy",
    check: (entries) => new Set(entries.map((e) => e.category)).size >= 4,
  },
  {
    id: "early_bird",
    title: "Madrugador",
    description: "Tu primera entrada antes de las 8am",
    check: () => false, // Checked separately with hour data
  },
];

function getDailyChallenge(date: string): Challenge {
  // Deterministic based on date
  const hash = date.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return CHALLENGES[hash % (CHALLENGES.length - 1)]; // Exclude early_bird for simplicity
}

export function DailyChallenge({ orgId }: { orgId: string }) {
  const [challenge] = useState(() => getDailyChallenge(new Date().toISOString().split("T")[0]));
  const [myCompleted, setMyCompleted] = useState(false);
  const [teamCompleted, setTeamCompleted] = useState(0);
  const [teamTotal, setTeamTotal] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split("T")[0];

      const [{ data: myEntries }, { data: members }, { data: allEntries }] = await Promise.all([
        supabase
          .from("time_entries")
          .select("proof_urls, is_late, category")
          .eq("user_id", user.id)
          .eq("org_id", orgId)
          .eq("date", today),
        supabase
          .from("org_members")
          .select("user_id")
          .eq("org_id", orgId),
        supabase
          .from("time_entries")
          .select("user_id, proof_urls, is_late, category")
          .eq("org_id", orgId)
          .eq("date", today),
      ]);

      setMyCompleted(challenge.check(myEntries ?? []));
      setTeamTotal(members?.length ?? 0);

      // Check each member
      let completed = 0;
      const memberIds = new Set(members?.map((m) => m.user_id) ?? []);
      for (const uid of memberIds) {
        const userEntries = (allEntries ?? []).filter((e) => e.user_id === uid);
        if (userEntries.length > 0 && challenge.check(userEntries)) {
          completed++;
        }
      }
      setTeamCompleted(completed);
    }
    check();

    const interval = setInterval(check, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [orgId, challenge]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className={cn(
      "mb-4 transition-all",
      myCompleted
        ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/10"
        : "border-yellow-200 dark:border-yellow-800 bg-yellow-50/30 dark:bg-yellow-950/10"
    )}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          myCompleted ? "bg-green-100 dark:bg-green-900/30" : "bg-yellow-100 dark:bg-yellow-900/30"
        )}>
          {myCompleted ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : (
            <Target className="w-5 h-5 text-yellow-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            Reto del dia: {challenge.title}
            {myCompleted && <Badge variant="default" className="text-[9px] py-0">Completado</Badge>}
          </p>
          <p className="text-xs text-muted-foreground">{challenge.description}</p>
        </div>
        <div className="text-center shrink-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            <span className="font-medium">{teamCompleted}/{teamTotal}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
