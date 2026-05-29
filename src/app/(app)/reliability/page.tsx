"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  CheckCircle2,
  Clock,
  FileCheck,
  MessageSquare,
  Shield,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { format, subDays, isWeekend } from "date-fns";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ReliabilityBreakdown {
  promiseRate: number;     // 0-100
  standupRate: number;     // 0-100
  closeoutRate: number;    // 0-100
  onTimeRate: number;      // 0-100
  contractRate: number;    // 0-100
}

interface MemberReliability {
  userId: string;
  profile: Profile | null;
  score: number;           // 0-100 weighted
  breakdown: ReliabilityBreakdown;
  badge: "CONFIABLE" | "INCONSISTENTE" | "NO CONFIABLE";
  // Raw counts for tooltips
  promisesDelivered: number;
  promisesTotal: number;
  standupsSubmitted: number;
  standupsDays: number;
  closeoutsSubmitted: number;
  closeoutsDays: number;
  onTimeEntries: number;
  totalEntries: number;
  contractsDelivered: number;
  contractsTotal: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function countWorkdays(startDate: string, endDate: string): number {
  let count = 0;
  const current = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  while (current <= end) {
    if (!isWeekend(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function getWorkdaysInRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  const current = new Date(start);
  while (current <= end) {
    if (!isWeekend(current)) {
      days.push(format(current, "yyyy-MM-dd"));
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 100; // No obligations = perfect
  return Math.round((numerator / denominator) * 100);
}

function getBadge(score: number): MemberReliability["badge"] {
  if (score >= 80) return "CONFIABLE";
  if (score >= 50) return "INCONSISTENTE";
  return "NO CONFIABLE";
}

/* ------------------------------------------------------------------ */
/* Breakdown Bar Component                                             */
/* ------------------------------------------------------------------ */

function BreakdownBar({
  label,
  rate,
  detail,
  icon: Icon,
}: {
  label: string;
  rate: number;
  detail: string;
  icon: typeof Target;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted-foreground">
            {label}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {detail}
          </span>
        </div>
        <div className="h-1.5 bg-accent/40 overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-500",
              rate >= 80 && "bg-green-500",
              rate >= 50 && rate < 80 && "bg-amber-500",
              rate < 50 && "bg-red-500"
            )}
            style={{ width: `${Math.min(rate, 100)}%` }}
          />
        </div>
      </div>
      <span
        className={cn(
          "font-mono text-xs font-bold tabular-nums w-9 text-right shrink-0",
          rate >= 80 && "text-green-600 dark:text-green-400",
          rate >= 50 && rate < 80 && "text-amber-600 dark:text-amber-400",
          rate < 50 && "text-red-500"
        )}
      >
        {rate}%
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ReliabilityPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [members, setMembers] = useState<MemberReliability[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------- data loader ---------- */

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const today = format(new Date(), "yyyy-MM-dd");
    const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
    const workdays = getWorkdaysInRange(thirtyDaysAgo, today);
    // Exclude today for standup/closeout checks (day still in progress)
    const pastWorkdays = workdays.filter((d) => d < today);
    const totalWorkdays = pastWorkdays.length;

    // 1. Org members with profiles
    const { data: orgMembers } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    if (!orgMembers) {
      setLoading(false);
      return;
    }

    const profileMap = new Map<string, Profile>();
    const userIds: string[] = [];
    for (const m of orgMembers) {
      userIds.push(m.user_id);
      if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
    }

    // 2. Promises (last 30 days, exclude pending)
    const { data: promises } = await supabase
      .from("daily_promises")
      .select("user_id, status")
      .eq("org_id", orgId)
      .neq("status", "pending")
      .gte("date", thirtyDaysAgo)
      .lte("date", today);

    // 3. Standups (last 30 days)
    const { data: standups } = await supabase
      .from("standups")
      .select("user_id, date")
      .eq("org_id", orgId)
      .gte("date", thirtyDaysAgo)
      .lte("date", today);

    // 4. Closeouts (last 30 days)
    const { data: closeouts } = await supabase
      .from("daily_closeouts")
      .select("user_id, date")
      .eq("org_id", orgId)
      .gte("date", thirtyDaysAgo)
      .lte("date", today);

    // 5. Time entries (for on-time rate)
    const { data: entries } = await supabase
      .from("time_entries")
      .select("user_id, is_late")
      .eq("org_id", orgId)
      .gte("date", thirtyDaysAgo)
      .lte("date", today);

    // 6. Weekly contracts (for contract delivery rate)
    const { data: contracts } = await supabase
      .from("weekly_contracts")
      .select("user_id, commitments, status")
      .eq("org_id", orgId)
      .gte("week_start", thirtyDaysAgo);

    // Build lookups
    // Promises per user
    const promiseMap = new Map<string, { delivered: number; total: number }>();
    for (const p of promises ?? []) {
      const uid = p.user_id as string;
      const cur = promiseMap.get(uid) ?? { delivered: 0, total: 0 };
      cur.total++;
      if (p.status === "delivered") cur.delivered++;
      promiseMap.set(uid, cur);
    }

    // Standups per user
    const standupMap = new Map<string, number>();
    for (const s of standups ?? []) {
      const uid = s.user_id as string;
      standupMap.set(uid, (standupMap.get(uid) ?? 0) + 1);
    }

    // Closeouts per user
    const closeoutMap = new Map<string, number>();
    for (const c of closeouts ?? []) {
      const uid = c.user_id as string;
      closeoutMap.set(uid, (closeoutMap.get(uid) ?? 0) + 1);
    }

    // Entries per user (on-time vs late)
    const entryMap = new Map<string, { onTime: number; total: number }>();
    for (const e of entries ?? []) {
      const uid = e.user_id as string;
      const cur = entryMap.get(uid) ?? { onTime: 0, total: 0 };
      cur.total++;
      if (!e.is_late) cur.onTime++;
      entryMap.set(uid, cur);
    }

    // Contracts per user
    const contractMap = new Map<string, { delivered: number; total: number }>();
    for (const c of contracts ?? []) {
      const uid = c.user_id as string;
      const commitments = c.commitments as { text: string; delivered: boolean }[];
      const cur = contractMap.get(uid) ?? { delivered: 0, total: 0 };
      for (const cm of commitments) {
        cur.total++;
        if (cm.delivered) cur.delivered++;
      }
      contractMap.set(uid, cur);
    }

    // Build member reliability list
    const result: MemberReliability[] = userIds.map((uid) => {
      const promiseData = promiseMap.get(uid) ?? { delivered: 0, total: 0 };
      const standupCount = standupMap.get(uid) ?? 0;
      const closeoutCount = closeoutMap.get(uid) ?? 0;
      const entryData = entryMap.get(uid) ?? { onTime: 0, total: 0 };
      const contractData = contractMap.get(uid) ?? { delivered: 0, total: 0 };

      const promiseRate = safeRate(promiseData.delivered, promiseData.total);
      const standupRate = safeRate(standupCount, totalWorkdays);
      const closeoutRate = safeRate(closeoutCount, totalWorkdays);
      const onTimeRate = safeRate(entryData.onTime, entryData.total);
      const contractRate = safeRate(contractData.delivered, contractData.total);

      // Weighted average
      const score = Math.round(
        promiseRate * 0.3 +
        standupRate * 0.2 +
        closeoutRate * 0.2 +
        onTimeRate * 0.15 +
        contractRate * 0.15
      );

      return {
        userId: uid,
        profile: profileMap.get(uid) ?? null,
        score,
        breakdown: {
          promiseRate,
          standupRate,
          closeoutRate,
          onTimeRate,
          contractRate,
        },
        badge: getBadge(score),
        promisesDelivered: promiseData.delivered,
        promisesTotal: promiseData.total,
        standupsSubmitted: standupCount,
        standupsDays: totalWorkdays,
        closeoutsSubmitted: closeoutCount,
        closeoutsDays: totalWorkdays,
        onTimeEntries: entryData.onTime,
        totalEntries: entryData.total,
        contractsDelivered: contractData.delivered,
        contractsTotal: contractData.total,
      };
    });

    // Sort by score descending
    result.sort((a, b) => b.score - a.score);

    setMembers(result);
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- initial load ---------- */

  useEffect(() => {
    if (orgLoading || !orgId) {
      if (!orgLoading) setLoading(false);
      return;
    }
    loadData();
  }, [orgLoading, orgId, loadData]);

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

  /* ---------- computed ---------- */

  const teamAvg = members.length > 0
    ? Math.round(members.reduce((s, m) => s + m.score, 0) / members.length)
    : 0;
  const confiables = members.filter((m) => m.badge === "CONFIABLE").length;
  const noConfiables = members.filter((m) => m.badge === "NO CONFIABLE").length;

  /* ---------- render ---------- */

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Ranking de Confiabilidad
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        No es rendimiento. Es si haces lo que dices que vas a hacer. Ultimos 30 dias.
      </p>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Promedio equipo
          </p>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
            teamAvg >= 80 && "text-green-600 dark:text-green-400",
            teamAvg >= 50 && teamAvg < 80 && "text-amber-600 dark:text-amber-400",
            teamAvg < 50 && "text-red-500"
          )}>
            {teamAvg}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Miembros
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-muted-foreground" />
            {members.length}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Confiables
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-green-600 dark:text-green-400">
            {confiables}
          </p>
        </div>
        <div className={cn(
          "border p-3",
          noConfiables > 0
            ? "bg-red-500/10 border-red-500/30"
            : "bg-accent/30 border-border"
        )}>
          <p className={cn(
            "font-mono text-[9px] tracking-[0.18em] uppercase",
            noConfiables > 0 ? "text-red-500/80" : "text-muted-foreground"
          )}>
            No confiables
          </p>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
            noConfiables > 0 ? "text-red-500" : "text-foreground"
          )}>
            {noConfiables}
          </p>
        </div>
      </div>

      {/* Section label */}
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
        Leaderboard &mdash; mayor confiabilidad primero
      </p>

      {/* Member cards */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <Shield className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            No hay miembros en la organizacion.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((m, idx) => {
            const isMe = m.userId === userId;
            const isTop = idx === 0;
            const badgeColor =
              m.badge === "CONFIABLE"
                ? "text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10"
                : m.badge === "INCONSISTENTE"
                  ? "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
                  : "text-red-500 border-red-500/30 bg-red-500/10";

            const scoreColor =
              m.score >= 80
                ? "text-green-600 dark:text-green-400"
                : m.score >= 50
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-500";

            return (
              <div
                key={m.userId}
                className={cn(
                  "border p-4 transition-colors",
                  isMe && "border-primary/40 bg-primary/3",
                  !isMe && "border-border hover:border-primary/30",
                  isTop && !isMe && "border-green-500/30"
                )}
              >
                {/* Top row: rank + avatar + name + score */}
                <div className="flex items-start gap-3">
                  {/* Rank number */}
                  <div className="w-7 h-7 border border-border flex items-center justify-center shrink-0">
                    <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
                      {idx + 1}
                    </span>
                  </div>

                  {/* Avatar */}
                  <Avatar className="w-9 h-9 ring-1 ring-border shrink-0">
                    <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="font-mono text-xs">
                      {getInitials(m.profile?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name + badge */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono font-bold text-sm tracking-tight">
                        {m.profile?.full_name ?? "Sin nombre"}
                      </p>
                      {isMe && (
                        <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
                          (tu)
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <span
                        className={cn(
                          "font-mono text-[10px] font-bold tracking-[0.15em] uppercase px-1.5 py-0.5 border",
                          badgeColor
                        )}
                      >
                        {m.badge}
                      </span>
                    </div>
                  </div>

                  {/* Big score */}
                  <div className="text-right shrink-0">
                    <p className={cn("text-3xl font-mono font-black tabular-nums tracking-tight", scoreColor)}>
                      {m.score}
                    </p>
                    <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                      /100
                    </p>
                  </div>
                </div>

                {/* Breakdown bars */}
                <div className="mt-4 space-y-2">
                  <BreakdownBar
                    label="Promesas"
                    rate={m.breakdown.promiseRate}
                    detail={`${m.promisesDelivered}/${m.promisesTotal}`}
                    icon={Target}
                  />
                  <BreakdownBar
                    label="Standups"
                    rate={m.breakdown.standupRate}
                    detail={`${m.standupsSubmitted}/${m.standupsDays}`}
                    icon={MessageSquare}
                  />
                  <BreakdownBar
                    label="Cierres"
                    rate={m.breakdown.closeoutRate}
                    detail={`${m.closeoutsSubmitted}/${m.closeoutsDays}`}
                    icon={FileCheck}
                  />
                  <BreakdownBar
                    label="A tiempo"
                    rate={m.breakdown.onTimeRate}
                    detail={`${m.onTimeEntries}/${m.totalEntries}`}
                    icon={Clock}
                  />
                  <BreakdownBar
                    label="Contratos"
                    rate={m.breakdown.contractRate}
                    detail={`${m.contractsDelivered}/${m.contractsTotal}`}
                    icon={CheckCircle2}
                  />
                </div>

                {/* Weight legend (only on first card) */}
                {idx === 0 && (
                  <div className="mt-3 pt-2 border-t border-border/30 flex flex-wrap gap-x-3 gap-y-0.5">
                    {[
                      { label: "Promesas", w: "30%" },
                      { label: "Standups", w: "20%" },
                      { label: "Cierres", w: "20%" },
                      { label: "A tiempo", w: "15%" },
                      { label: "Contratos", w: "15%" },
                    ].map((item) => (
                      <span
                        key={item.label}
                        className="font-mono text-[8px] tracking-[0.1em] text-muted-foreground"
                      >
                        {item.label}: {item.w}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom */}
      <div className="mt-10 text-center py-6 border-t border-border/30">
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
          La confiabilidad se demuestra con consistencia, no con promesas.
        </p>
      </div>
    </div>
  );
}
