"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import type { Profile, TrustScoreHistory } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertTriangle, TrendingDown, Users, Skull, ShieldCheck } from "lucide-react";
import { subDays, format } from "date-fns";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface MemberDebt {
  userId: string;
  profile: Profile | null;
  currentScore: number | null;
  consecutiveDaysBelow: number;
  rawDebt: number; // sum of (80 - daily_score) for days below 80
  compoundDebt: number; // debt with 5% daily compounding
  targetToClear: number; // 80 + (days * 3)
  history: TrustScoreHistory[];
  inDebt: boolean;
}

/* ------------------------------------------------------------------ */
/* Compound debt calculation                                           */
/* ------------------------------------------------------------------ */

function calculateDebt(history: TrustScoreHistory[]): {
  consecutiveDaysBelow: number;
  rawDebt: number;
  compoundDebt: number;
  targetToClear: number;
  currentScore: number | null;
} {
  if (history.length === 0) {
    return { consecutiveDaysBelow: 0, rawDebt: 0, compoundDebt: 0, targetToClear: 80, currentScore: null };
  }

  // Sort by date descending (most recent first)
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const currentScore = sorted[0]?.score ?? null;

  // Count consecutive days below 80 from most recent
  let consecutiveDaysBelow = 0;
  for (const entry of sorted) {
    if (entry.score < 80) {
      consecutiveDaysBelow++;
    } else {
      break;
    }
  }

  if (consecutiveDaysBelow === 0) {
    return { consecutiveDaysBelow: 0, rawDebt: 0, compoundDebt: 0, targetToClear: 80, currentScore };
  }

  // Calculate compound debt
  // For each day below 80, the deficit is (80 - score)
  // Each day's deficit compounds at 5% per day for each subsequent day
  const debtDays = sorted.slice(0, consecutiveDaysBelow).reverse(); // oldest first
  let rawDebt = 0;
  let compoundDebt = 0;

  for (let i = 0; i < debtDays.length; i++) {
    const deficit = 80 - debtDays[i].score;
    rawDebt += deficit;
    // This day's deficit compounds for (debtDays.length - 1 - i) remaining days
    const daysCompounding = debtDays.length - 1 - i;
    compoundDebt += deficit * Math.pow(1.05, daysCompounding);
  }

  const targetToClear = 80 + consecutiveDaysBelow * 3;

  return {
    consecutiveDaysBelow,
    rawDebt: Math.round(rawDebt * 10) / 10,
    compoundDebt: Math.round(compoundDebt * 10) / 10,
    targetToClear: Math.min(targetToClear, 100),
    currentScore,
  };
}

/* ------------------------------------------------------------------ */
/* Animated debt counter                                               */
/* ------------------------------------------------------------------ */

function DebtCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const start = display;
    const end = value;
    const duration = 1200;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round((start + (end - start) * eased) * 10) / 10);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    }

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span className="font-mono tabular-nums font-bold text-red-500">
      {display.toFixed(1)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Debt meter bar                                                      */
/* ------------------------------------------------------------------ */

function DebtMeter({ score, target }: { score: number; target: number }) {
  // Visual bar: 0 = worst (full red), 100 = best (empty)
  // Show how far from target they are
  const fillPercent = score <= 0 ? 100 : Math.min(100, Math.max(0, ((target - score) / target) * 100));

  return (
    <div className="w-full h-1.5 bg-accent/30 border border-border overflow-hidden">
      <div
        className="h-full bg-red-500 transition-all duration-700"
        style={{ width: `${fillPercent}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function TrustDebtPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [members, setMembers] = useState<MemberDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---------- data loader ---------- */

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const today = getTodayMTY();
    const thirtyDaysAgo = format(subDays(new Date(today + "T12:00:00"), 30), "yyyy-MM-dd");

    // 1. All org members with profiles
    const { data: orgMembers } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    if (!orgMembers) {
      setLoading(false);
      return;
    }

    const userIds = orgMembers.map((m) => m.user_id);

    // 2. Trust score history for last 30 days
    const { data: trustHistory } = await supabase
      .from("trust_score_history")
      .select("*")
      .eq("org_id", orgId)
      .gte("date", thirtyDaysAgo)
      .in("user_id", userIds)
      .order("date", { ascending: false });

    // Group trust history by user
    const historyMap = new Map<string, TrustScoreHistory[]>();
    for (const entry of trustHistory ?? []) {
      const uid = entry.user_id as string;
      if (!historyMap.has(uid)) historyMap.set(uid, []);
      historyMap.get(uid)!.push(entry as TrustScoreHistory);
    }

    // Build member debt data
    const result: MemberDebt[] = orgMembers.map((m) => {
      const history = historyMap.get(m.user_id) ?? [];
      const debt = calculateDebt(history);

      return {
        userId: m.user_id,
        profile: (m.profiles as unknown as Profile) ?? null,
        currentScore: debt.currentScore,
        consecutiveDaysBelow: debt.consecutiveDaysBelow,
        rawDebt: debt.rawDebt,
        compoundDebt: debt.compoundDebt,
        targetToClear: debt.targetToClear,
        history,
        inDebt: debt.consecutiveDaysBelow > 0,
      };
    });

    // Sort: highest debt first, then debt-free sorted by score ascending
    result.sort((a, b) => {
      if (a.inDebt && !b.inDebt) return -1;
      if (!a.inDebt && b.inDebt) return 1;
      if (a.inDebt && b.inDebt) return b.compoundDebt - a.compoundDebt;
      return (a.currentScore ?? 0) - (b.currentScore ?? 0);
    });

    setMembers(result);
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- initial load + 60s refresh ---------- */

  useEffect(() => {
    if (orgLoading || !orgId) {
      if (!orgLoading) setLoading(false);
      return;
    }

    loadData();

    intervalRef.current = setInterval(loadData, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [orgLoading, orgId, loadData]);

  /* ---------- real-time subscription ---------- */

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("trust-debt-scores")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trust_score_history",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- loading state ---------- */

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          CARGANDO...
        </p>
      </div>
    );
  }

  /* ---------- computed team stats ---------- */

  const membersInDebt = members.filter((m) => m.inDebt);
  const totalTeamDebt = membersInDebt.reduce((s, m) => s + m.compoundDebt, 0);
  const worstDebtor = membersInDebt.length > 0 ? membersInDebt[0] : null;
  const maxDaysInDebt = membersInDebt.reduce((max, m) => Math.max(max, m.consecutiveDaysBelow), 0);

  /* ---------- render ---------- */

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <TrendingDown className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Deuda de Confianza
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Interes compuesto al 5% diario. Cada dia bajo 80 aumenta lo que necesitas para salir.
      </p>

      {/* Team stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-8">
        <div className={cn(
          "bg-accent/30 border border-border p-3",
          totalTeamDebt > 0 && "bg-red-500/5 border-red-500/30",
        )}>
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Deuda total equipo
          </p>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
            totalTeamDebt > 0 ? "text-red-500" : "text-foreground",
          )}>
            {totalTeamDebt > 0 ? totalTeamDebt.toFixed(1) : "0"} pts
          </p>
        </div>

        <div className={cn(
          "bg-accent/30 border border-border p-3",
          worstDebtor && "bg-red-500/5 border-red-500/30",
        )}>
          <p className={cn(
            "font-mono text-[9px] tracking-[0.18em] uppercase",
            worstDebtor ? "text-red-500/60" : "text-muted-foreground",
          )}>
            Mayor deudor
          </p>
          <p className={cn(
            "text-sm font-mono font-bold tracking-tight mt-1 truncate",
            worstDebtor ? "text-red-500" : "text-foreground",
          )}>
            {worstDebtor?.profile?.full_name ?? "---"}
          </p>
        </div>

        <div className={cn(
          "bg-accent/30 border border-border p-3 col-span-2 sm:col-span-1",
          maxDaysInDebt > 0 && "bg-red-500/5 border-red-500/30",
        )}>
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Max dias en deuda
          </p>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
            maxDaysInDebt > 0 ? "text-red-500" : "text-foreground",
          )}>
            {maxDaysInDebt}
          </p>
        </div>
      </div>

      {/* Section label */}
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
        Estado por persona &mdash; mayor deuda primero
      </p>

      {/* Member cards */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <Users className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            No hay miembros en la organizacion.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => {
            const isMe = m.userId === userId;
            const isCritical = m.consecutiveDaysBelow >= 7;
            const isSevere = m.consecutiveDaysBelow >= 3 && m.consecutiveDaysBelow < 7;

            return (
              <div
                key={m.userId}
                className={cn(
                  "border border-border p-4 transition-colors duration-200 hover:border-primary/30",
                  m.inDebt && isCritical && "border-red-500/50 bg-red-500/5 animate-danger-pulse",
                  m.inDebt && isSevere && "border-red-500/30 bg-red-500/3",
                  m.inDebt && !isCritical && !isSevere && "border-red-500/20",
                )}
              >
                {/* Top row: avatar + name + badge + score */}
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <Avatar className={cn(
                    "w-9 h-9 shrink-0 ring-1 ring-border",
                    m.inDebt && "ring-red-500/40",
                  )}>
                    <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                    <AvatarFallback className={cn(
                      "font-mono text-xs",
                      m.inDebt && "bg-red-500/10 text-red-500",
                    )}>
                      {getInitials(m.profile?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name + badge */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn(
                        "font-mono font-bold tracking-tight text-sm",
                        m.inDebt && "text-red-500",
                      )}>
                        {m.profile?.full_name ?? "Sin nombre"}
                      </p>
                      {isMe && (
                        <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
                          (tu)
                        </span>
                      )}
                      {m.inDebt ? (
                        <span className="bg-red-600 text-white font-mono text-[9px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 animate-danger-pulse">
                          EN DEUDA
                        </span>
                      ) : (
                        <span className="bg-green-600 text-white font-mono text-[9px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5">
                          LIBRE
                        </span>
                      )}
                    </div>

                    {/* Debt details */}
                    {m.inDebt ? (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center gap-4 flex-wrap">
                          <div>
                            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                              Deuda
                            </span>
                            <p className="text-lg font-mono tabular-nums font-bold text-red-500 leading-tight">
                              <DebtCounter value={m.compoundDebt} /> pts
                            </p>
                          </div>
                          <div>
                            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                              Dias en deuda
                            </span>
                            <p className="text-lg font-mono tabular-nums font-bold text-red-500 leading-tight">
                              {m.consecutiveDaysBelow}
                            </p>
                          </div>
                          <div>
                            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                              Necesitas
                            </span>
                            <p className="text-lg font-mono tabular-nums font-bold text-amber-500 leading-tight">
                              {m.targetToClear}
                            </p>
                          </div>
                        </div>

                        {/* Raw vs compound comparison */}
                        {m.rawDebt !== m.compoundDebt && (
                          <p className="font-mono text-[10px] text-muted-foreground">
                            Deuda base: {m.rawDebt} pts + intereses: {(m.compoundDebt - m.rawDebt).toFixed(1)} pts
                          </p>
                        )}

                        {/* Debt meter */}
                        <DebtMeter
                          score={m.currentScore ?? 0}
                          target={m.targetToClear}
                        />
                      </div>
                    ) : (
                      <p className="font-mono text-[10px] text-muted-foreground mt-1">
                        Sin deuda acumulada
                      </p>
                    )}
                  </div>

                  {/* Right side: current trust score */}
                  <div className="text-right shrink-0">
                    <p className={cn(
                      "text-3xl font-mono font-black tabular-nums tracking-tight",
                      m.inDebt ? "text-red-500" : "text-green-600 dark:text-green-400",
                      m.currentScore === null && "text-muted-foreground",
                    )}>
                      {m.currentScore !== null ? m.currentScore : "--"}
                    </p>
                    <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                      Trust Score
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom oppressive message */}
      <div className="mt-10 text-center py-6 border-t border-border/30">
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60">
          La deuda crece. El interes no perdona. Solo la consistencia te libera.
        </p>
      </div>
    </div>
  );
}
