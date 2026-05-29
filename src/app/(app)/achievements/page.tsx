"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Award } from "lucide-react";

const ALL_ACHIEVEMENTS: Record<
  string,
  { label: string; emoji: string; description: string; secret?: boolean }
> = {
  // Existing achievements
  streak_7: { label: "7 días seguidos", emoji: "🔥", description: "Racha de 7 días registrando horas" },
  streak_30: { label: "30 días seguidos", emoji: "💎", description: "Racha de 30 días registrando horas" },
  proof_100: { label: "100% evidencia", emoji: "🛡️", description: "Semana completa con 100% de entradas con evidencia" },
  zero_late: { label: "Siempre a tiempo", emoji: "⏱️", description: "Semana sin entradas tardías" },
  first_logger: { label: "Madrugador", emoji: "🌅", description: "Primero en registrar 5 veces" },
  helpful: { label: "Servicial", emoji: "🤝", description: "Recibir 10 reacciones de 'me ayudó'" },
  impressive_10: { label: "Estrella", emoji: "⭐", description: "Recibir 10 reacciones de 'impresionante'" },
  closeout_streak: { label: "Disciplina", emoji: "📋", description: "5 cierres de día consecutivos" },
  high_trust: { label: "Confiable", emoji: "🏆", description: "Trust score >90 por 7 días" },
  team_player: { label: "Team Player", emoji: "💪", description: "Verificar 20 entradas de compañeros" },
  // Secret achievements
  madrugador: { label: "Madrugador Secreto", emoji: "🌄", description: "3 entradas antes de las 9am en una semana", secret: true },
  maquina: { label: "Máquina", emoji: "🤖", description: "8+ horas con 100% evidencia en 1 día", secret: true },
  imparable: { label: "Imparable", emoji: "⚡", description: "Racha de 10 días sin fallar", secret: true },
  primer_sangre: { label: "Primer sangre", emoji: "🗡️", description: "Primera entrada del día para el equipo, 5 veces", secret: true },
  sin_excusas: { label: "Sin excusas", emoji: "🎯", description: "0 entradas tardías en una semana completa", secret: true },
  cumplidor: { label: "Cumplidor", emoji: "🤝", description: "10 promesas cumplidas con 0 rotas", secret: true },
};

export default function AchievementsPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId || !userId) return;

    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("achievements")
        .select("achievement_type")
        .eq("user_id", userId!)
        .eq("org_id", orgId!);

      setUnlocked(new Set((data ?? []).map((a) => a.achievement_type)));
      setLoading(false);
    }
    load();
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const keys = Object.keys(ALL_ACHIEVEMENTS);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Award className="w-6 h-6 text-primary" />
          Logros
        </h1>
        <p className="text-muted-foreground text-sm">
          Desbloquea logros con tus acciones diarias. Algunos son secretos.
        </p>
      </div>

      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums tracking-tight">{unlocked.size}</span> /{" "}
          <span className="tabular-nums tracking-tight">{keys.length}</span> desbloqueados
        </p>
      </div>

      {orgLoading || loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {keys.map((key) => {
            const ach = ALL_ACHIEVEMENTS[key];
            const isUnlocked = unlocked.has(key);
            const isSecret = ach.secret && !isUnlocked;

            return (
              <Card
                key={key}
                className={cn(
                  "transition-all duration-300 relative overflow-hidden",
                  isUnlocked
                    ? "border-yellow-300/60 dark:border-yellow-700/40 shadow-lg shadow-yellow-500/10 ring-1 ring-yellow-300/30"
                    : "opacity-50 grayscale"
                )}
              >
                {/* Glow effect for unlocked */}
                {isUnlocked && (
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/5 to-amber-500/5 pointer-events-none" />
                )}
                <CardContent className="p-4 text-center relative">
                  <div
                    className={cn(
                      "text-4xl mb-2",
                      isUnlocked && "drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                    )}
                  >
                    {isSecret ? "❓" : ach.emoji}
                  </div>
                  <h3 className="font-semibold text-sm">
                    {isSecret ? "Secreto" : ach.label}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                    {isSecret ? "Sigue trabajando para descubrirlo" : ach.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
