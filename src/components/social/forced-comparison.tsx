"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// FORCED COMPARISON POPUP
// ═══════════════════════════════════════════════════════════════
//
// Every time you open the dashboard, you see how you compare.
// Can't dismiss for 5 seconds. Full Palantir brutality.

interface ComparisonData {
  myHours: number;
  teamAverage: number;
  leaderName: string;
  leaderHours: number;
  worstName: string;
  worstHours: number;
  iAmWorst: boolean;
  iAmLeader: boolean;
  teamSize: number;
}

const LOCK_DURATION = 5; // seconds before dismiss is allowed

export function ForcedComparison() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();
  const [data, setData] = useState<ComparisonData | null>(null);
  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState(LOCK_DURATION);
  const [canDismiss, setCanDismiss] = useState(false);
  const shownRef = useRef(false);

  // Fetch comparison data on mount — only once
  useEffect(() => {
    if (!orgId || !userId || shownRef.current) return;
    shownRef.current = true;

    async function fetchComparison() {
      const today = getTodayMTY();

      // Get all org members
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(full_name)")
        .eq("org_id", orgId!);

      if (!members || members.length < 2) return;

      // Get today's entries
      const { data: entries } = await supabase
        .from("time_entries")
        .select("user_id")
        .eq("org_id", orgId!)
        .eq("date", today);

      // Count hours per user
      const hoursByUser: Record<string, number> = {};
      for (const m of members) {
        hoursByUser[m.user_id] = 0;
      }
      for (const entry of entries ?? []) {
        if (entry.user_id in hoursByUser) {
          hoursByUser[entry.user_id]++;
        }
      }

      const nameMap = new Map<string, string>();
      for (const m of members) {
        const profile = m.profiles as unknown as { full_name: string | null } | null;
        nameMap.set(m.user_id, profile?.full_name ?? "Desconocido");
      }

      const sorted = Object.entries(hoursByUser).sort(([, a], [, b]) => b - a);
      const totalHours = Object.values(hoursByUser).reduce((s, h) => s + h, 0);
      const teamAverage = totalHours / members.length;

      const [leaderId, leaderHours] = sorted[0];
      const [worstId, worstHours] = sorted[sorted.length - 1];

      const myHours = hoursByUser[userId!] ?? 0;
      const iAmWorst = worstId === userId;
      const iAmLeader = leaderId === userId;

      setData({
        myHours,
        teamAverage: Math.round(teamAverage * 10) / 10,
        leaderName: nameMap.get(leaderId) ?? "?",
        leaderHours,
        worstName: nameMap.get(worstId) ?? "?",
        worstHours,
        iAmWorst,
        iAmLeader,
        teamSize: members.length,
      });
      setVisible(true);
    }

    fetchComparison();
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer
  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setCanDismiss(true);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible]);

  if (!visible || !data) return null;

  const belowAverage = data.myHours < data.teamAverage;
  const worstFirstName = data.worstName.split(" ")[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => canDismiss && setVisible(false)}
      />

      {/* Modal */}
      <div
        className={cn(
          "relative z-10 w-full max-w-md mx-4",
          "border border-border bg-card",
          "p-6 space-y-6",
          "font-mono"
        )}
      >
        {/* Header */}
        <div className="space-y-1">
          <p className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
            Comparacion diaria
          </p>
          <h2 className="text-xl font-bold tracking-tight uppercase">
            Tu posicion en el equipo
          </h2>
        </div>

        {/* Team average line */}
        <div className="space-y-4">
          <div className="border border-border p-4">
            <p className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2">
              Promedio del equipo
            </p>
            <p className="text-sm">
              Tus companeros llevan{" "}
              <span className="font-bold tabular-nums text-lg">{data.teamAverage}</span>
              {" "}hrs promedio hoy.
            </p>
          </div>

          {/* Your hours */}
          <div
            className={cn(
              "border p-4",
              belowAverage
                ? "border-red-500/30 bg-red-500/5"
                : "border-emerald-500/30 bg-emerald-500/5"
            )}
          >
            <p className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2">
              Tu llevas
            </p>
            <p
              className={cn(
                "text-3xl font-bold tabular-nums tracking-tight",
                belowAverage
                  ? "text-red-600 dark:text-red-400"
                  : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {data.myHours} hrs
            </p>
          </div>

          {/* Verdict */}
          <div className="border border-border p-4">
            <p className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2">
              Veredicto
            </p>
            {data.iAmWorst ? (
              <p className="text-sm text-red-600 dark:text-red-400 font-bold uppercase">
                Eres el ultimo. Todo el equipo te supera.
              </p>
            ) : belowAverage ? (
              <p className="text-sm">
                <span className="text-red-600 dark:text-red-400 font-bold">
                  Estas por debajo.
                </span>{" "}
                {worstFirstName} lleva menos que tu:{" "}
                <span className="font-bold tabular-nums">{data.worstHours} hrs.</span>
              </p>
            ) : (
              <p className="text-sm">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  Vas bien.
                </span>{" "}
                {worstFirstName} va en ultimo con{" "}
                <span className="font-bold tabular-nums">{data.worstHours} hrs.</span>
              </p>
            )}
          </div>
        </div>

        {/* Dismiss countdown / button */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          {canDismiss ? (
            <button
              onClick={() => setVisible(false)}
              className={cn(
                "flex items-center gap-2 px-4 py-2",
                "border border-border text-xs uppercase tracking-wide",
                "hover:bg-accent transition-colors",
                "font-mono font-bold"
              )}
            >
              <X className="w-3.5 h-3.5" />
              Cerrar
            </button>
          ) : (
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Puedes cerrar en{" "}
              <span className="font-bold tabular-nums text-foreground">
                {countdown}
              </span>
            </p>
          )}
          <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">
            {data.teamSize} miembros
          </p>
        </div>
      </div>
    </div>
  );
}
