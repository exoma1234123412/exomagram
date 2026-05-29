"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  ShieldCheck,
  FileText,
  Star,
  AlertTriangle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface MemberHourPrice {
  userId: string;
  profile: Profile | null;
  totalHours: number;
  hoursWithProof: number;
  hoursWithGoodDesc: number;
  hoursVerified: number;
  lateHours: number;
  impressiveReactions: number;
  suspiciousReactions: number;
  avgTrustScore: number;
  unresolvedFlags: number;
  shoutoutsReceived: number;
  // Multipliers
  proofMultiplier: number;
  qualityMultiplier: number;
  trustMultiplier: number;
  peerMultiplier: number;
  penalty: number;
  // Final
  hourValue: number;
  // Trend
  prevWeekValue: number | null;
}

/* ------------------------------------------------------------------ */
/* Calculation                                                         */
/* ------------------------------------------------------------------ */

function calculateHourValue(data: {
  totalHours: number;
  hoursWithProof: number;
  hoursWithGoodDesc: number;
  avgTrustScore: number;
  impressiveReactions: number;
  suspiciousReactions: number;
  unresolvedFlags: number;
  lateHours: number;
}): {
  proofMult: number;
  qualityMult: number;
  trustMult: number;
  peerMult: number;
  penalty: number;
  value: number;
} {
  const base = 100;

  const proofMult =
    data.totalHours > 0 ? data.hoursWithProof / data.totalHours : 0;
  const qualityMult =
    data.totalHours > 0 ? data.hoursWithGoodDesc / data.totalHours : 0;
  const trustMult = data.avgTrustScore / 100;
  const peerMult = Math.max(
    0,
    1.0 + data.impressiveReactions * 0.02 - data.suspiciousReactions * 0.05
  );

  const penalty =
    data.unresolvedFlags * 0.1 * base + data.lateHours * 0.02 * base;

  const value = Math.max(
    0,
    base * proofMult * qualityMult * trustMult * peerMult - penalty
  );

  return { proofMult, qualityMult, trustMult, peerMult, penalty, value };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function HourPricePage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [members, setMembers] = useState<MemberHourPrice[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------- data loader ---------- */

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateFrom = thirtyDaysAgo.toISOString().split("T")[0];

    // Previous week range (7-14 days ago) for trend comparison
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const prevWeekFrom = fourteenDaysAgo.toISOString().split("T")[0];
    const prevWeekTo = sevenDaysAgo.toISOString().split("T")[0];

    // 1. All org members with profiles
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
      if (m.profiles)
        profileMap.set(m.user_id, m.profiles as unknown as Profile);
    }

    // 2. Time entries (last 30 days)
    const { data: entries } = await supabase
      .from("time_entries")
      .select(
        "user_id, proof_urls, description, verification_status, is_late, date"
      )
      .eq("org_id", orgId)
      .gte("date", dateFrom);

    // 3. Reactions on those entries
    const { data: allEntries } = await supabase
      .from("time_entries")
      .select("id, user_id")
      .eq("org_id", orgId)
      .gte("date", dateFrom);

    const entryIds = (allEntries ?? []).map((e) => e.id as string);
    const entryOwnerMap = new Map<string, string>();
    for (const e of allEntries ?? []) {
      entryOwnerMap.set(e.id as string, e.user_id as string);
    }

    let reactions: { entry_id: string; reaction: string }[] = [];
    if (entryIds.length > 0) {
      // Batch in groups of 100
      for (let i = 0; i < entryIds.length; i += 100) {
        const batch = entryIds.slice(i, i + 100);
        const { data: rxBatch } = await supabase
          .from("entry_reactions")
          .select("entry_id, reaction")
          .in("entry_id", batch);
        if (rxBatch) reactions = reactions.concat(rxBatch as { entry_id: string; reaction: string }[]);
      }
    }

    // 4. Trust score history (last 30 days)
    const { data: trustHistory } = await supabase
      .from("trust_score_history")
      .select("user_id, score")
      .eq("org_id", orgId)
      .gte("date", dateFrom);

    // 5. Unresolved accountability flags
    const { data: flags } = await supabase
      .from("accountability_flags")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("resolved", false);

    // 6. Shoutouts received (last 30 days)
    const { data: shoutouts } = await supabase
      .from("shoutouts")
      .select("to_user_id")
      .eq("org_id", orgId)
      .gte("date", dateFrom);

    // 7. Previous week entries for trend
    const { data: prevEntries } = await supabase
      .from("time_entries")
      .select(
        "user_id, proof_urls, description, verification_status, is_late"
      )
      .eq("org_id", orgId)
      .gte("date", prevWeekFrom)
      .lt("date", prevWeekTo);

    const { data: prevTrust } = await supabase
      .from("trust_score_history")
      .select("user_id, score")
      .eq("org_id", orgId)
      .gte("date", prevWeekFrom)
      .lt("date", prevWeekTo);

    // ---- Aggregate per user ----

    // Current 30 days
    const userStats = new Map<
      string,
      {
        totalHours: number;
        hoursWithProof: number;
        hoursWithGoodDesc: number;
        hoursVerified: number;
        lateHours: number;
      }
    >();

    for (const e of entries ?? []) {
      const uid = e.user_id as string;
      const cur = userStats.get(uid) ?? {
        totalHours: 0,
        hoursWithProof: 0,
        hoursWithGoodDesc: 0,
        hoursVerified: 0,
        lateHours: 0,
      };
      cur.totalHours++;
      if (e.proof_urls && (e.proof_urls as string[]).length > 0)
        cur.hoursWithProof++;
      if (e.description && (e.description as string).length > 50)
        cur.hoursWithGoodDesc++;
      if (e.verification_status === "verified") cur.hoursVerified++;
      if (e.is_late) cur.lateHours++;
      userStats.set(uid, cur);
    }

    // Reactions per user
    const userReactions = new Map<
      string,
      { impressive: number; suspicious: number }
    >();
    for (const r of reactions) {
      const owner = entryOwnerMap.get(r.entry_id);
      if (!owner) continue;
      const cur = userReactions.get(owner) ?? {
        impressive: 0,
        suspicious: 0,
      };
      if (r.reaction === "impressive") cur.impressive++;
      if (r.reaction === "suspicious") cur.suspicious++;
      userReactions.set(owner, cur);
    }

    // Trust scores per user
    const userTrust = new Map<string, number[]>();
    for (const t of trustHistory ?? []) {
      const uid = t.user_id as string;
      const arr = userTrust.get(uid) ?? [];
      arr.push(t.score as number);
      userTrust.set(uid, arr);
    }

    // Flags per user
    const userFlags = new Map<string, number>();
    for (const f of flags ?? []) {
      const uid = f.user_id as string;
      userFlags.set(uid, (userFlags.get(uid) ?? 0) + 1);
    }

    // Shoutouts per user
    const userShoutouts = new Map<string, number>();
    for (const s of shoutouts ?? []) {
      const uid = s.to_user_id as string;
      userShoutouts.set(uid, (userShoutouts.get(uid) ?? 0) + 1);
    }

    // Previous week stats for trend
    const prevStats = new Map<
      string,
      {
        totalHours: number;
        hoursWithProof: number;
        hoursWithGoodDesc: number;
        lateHours: number;
      }
    >();
    for (const e of prevEntries ?? []) {
      const uid = e.user_id as string;
      const cur = prevStats.get(uid) ?? {
        totalHours: 0,
        hoursWithProof: 0,
        hoursWithGoodDesc: 0,
        lateHours: 0,
      };
      cur.totalHours++;
      if (e.proof_urls && (e.proof_urls as string[]).length > 0)
        cur.hoursWithProof++;
      if (e.description && (e.description as string).length > 50)
        cur.hoursWithGoodDesc++;
      if (e.is_late) cur.lateHours++;
      prevStats.set(uid, cur);
    }

    const prevUserTrust = new Map<string, number[]>();
    for (const t of prevTrust ?? []) {
      const uid = t.user_id as string;
      const arr = prevUserTrust.get(uid) ?? [];
      arr.push(t.score as number);
      prevUserTrust.set(uid, arr);
    }

    // ---- Build member list ----

    const result: MemberHourPrice[] = userIds.map((uid) => {
      const stats = userStats.get(uid) ?? {
        totalHours: 0,
        hoursWithProof: 0,
        hoursWithGoodDesc: 0,
        hoursVerified: 0,
        lateHours: 0,
      };
      const rx = userReactions.get(uid) ?? { impressive: 0, suspicious: 0 };
      const trustScores = userTrust.get(uid) ?? [];
      const avgTrust =
        trustScores.length > 0
          ? trustScores.reduce((a, b) => a + b, 0) / trustScores.length
          : 50;
      const flagCount = userFlags.get(uid) ?? 0;
      const shoutoutCount = userShoutouts.get(uid) ?? 0;

      const calc = calculateHourValue({
        totalHours: stats.totalHours,
        hoursWithProof: stats.hoursWithProof,
        hoursWithGoodDesc: stats.hoursWithGoodDesc,
        avgTrustScore: avgTrust,
        impressiveReactions: rx.impressive,
        suspiciousReactions: rx.suspicious,
        unresolvedFlags: flagCount,
        lateHours: stats.lateHours,
      });

      // Previous week value for trend
      let prevWeekValue: number | null = null;
      const prev = prevStats.get(uid);
      if (prev && prev.totalHours > 0) {
        const prevTrustScores = prevUserTrust.get(uid) ?? [];
        const prevAvgTrust =
          prevTrustScores.length > 0
            ? prevTrustScores.reduce((a, b) => a + b, 0) /
              prevTrustScores.length
            : 50;
        const prevCalc = calculateHourValue({
          totalHours: prev.totalHours,
          hoursWithProof: prev.hoursWithProof,
          hoursWithGoodDesc: prev.hoursWithGoodDesc,
          avgTrustScore: prevAvgTrust,
          impressiveReactions: 0,
          suspiciousReactions: 0,
          unresolvedFlags: 0,
          lateHours: prev.lateHours,
        });
        prevWeekValue = prevCalc.value;
      }

      return {
        userId: uid,
        profile: profileMap.get(uid) ?? null,
        totalHours: stats.totalHours,
        hoursWithProof: stats.hoursWithProof,
        hoursWithGoodDesc: stats.hoursWithGoodDesc,
        hoursVerified: stats.hoursVerified,
        lateHours: stats.lateHours,
        impressiveReactions: rx.impressive,
        suspiciousReactions: rx.suspicious,
        avgTrustScore: avgTrust,
        unresolvedFlags: flagCount,
        shoutoutsReceived: shoutoutCount,
        proofMultiplier: calc.proofMult,
        qualityMultiplier: calc.qualityMult,
        trustMultiplier: calc.trustMult,
        peerMultiplier: calc.peerMult,
        penalty: calc.penalty,
        hourValue: calc.value,
        prevWeekValue,
      };
    });

    // Sort by hour value (highest first)
    result.sort((a, b) => b.hourValue - a.hourValue);

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

  /* ---------- real-time ---------- */

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("hour-price-entries")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- loading ---------- */

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

  const teamAvg =
    members.length > 0
      ? members.reduce((s, m) => s + m.hourValue, 0) / members.length
      : 0;

  const highestValue =
    members.length > 0 ? members[0] : null;

  const lowestValue =
    members.length > 0 ? members[members.length - 1] : null;

  const totalTeamHours = members.reduce((s, m) => s + m.totalHours, 0);

  /* ---------- render ---------- */

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <DollarSign className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Precio de tu Hora
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Valor calculado por hora basado en calidad, evidencia, confianza y
        reacciones de pares. Ultimos 30 dias.
      </p>

      {/* Team stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Promedio equipo
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
            ${teamAvg.toFixed(2)}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Horas totales
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
            {totalTeamHours}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Mas valiosa
          </p>
          <p className="text-sm font-mono font-bold tracking-tight mt-1 text-green-500 truncate">
            {highestValue?.profile?.full_name ?? "---"}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Menos valiosa
          </p>
          <p className="text-sm font-mono font-bold tracking-tight mt-1 text-red-500 truncate">
            {lowestValue?.profile?.full_name ?? "---"}
          </p>
        </div>
      </div>

      {/* Section label */}
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
        Ranking por valor de hora &mdash; mayor primero
      </p>

      {/* Member cards */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <DollarSign className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            No hay datos suficientes para calcular valores.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m, idx) => {
            const isMe = m.userId === userId;
            const aboveAvg = m.hourValue >= teamAvg;
            const diff = m.hourValue - teamAvg;
            const diffPct =
              teamAvg > 0 ? ((diff / teamAvg) * 100).toFixed(1) : "0.0";

            // Trend
            const hasTrend = m.prevWeekValue !== null;
            const trendDiff = hasTrend
              ? m.hourValue - m.prevWeekValue!
              : 0;
            const trendUp = trendDiff > 0.5;
            const trendDown = trendDiff < -0.5;

            // Proof percentage
            const proofPct =
              m.totalHours > 0
                ? Math.round((m.hoursWithProof / m.totalHours) * 100)
                : 0;
            // Quality percentage
            const qualityPct =
              m.totalHours > 0
                ? Math.round((m.hoursWithGoodDesc / m.totalHours) * 100)
                : 0;

            return (
              <div
                key={m.userId}
                className={cn(
                  "border transition-colors p-4",
                  aboveAvg
                    ? "border-green-500/30 hover:border-green-500/50"
                    : "border-red-500/30 hover:border-red-500/50"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Rank */}
                  <div className="flex flex-col items-center shrink-0 w-8">
                    <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Avatar */}
                  <Avatar className="w-10 h-10 ring-1 ring-border shrink-0">
                    <AvatarImage
                      src={m.profile?.avatar_url ?? undefined}
                    />
                    <AvatarFallback className="font-mono text-xs">
                      {getInitials(m.profile?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono font-bold tracking-tight text-sm truncate">
                        {m.profile?.full_name ?? "Sin nombre"}
                      </p>
                      {isMe && (
                        <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
                          (tu)
                        </span>
                      )}
                    </div>

                    {/* Breakdown row */}
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                        <ShieldCheck className="w-3 h-3" />
                        {proofPct}% evidencia
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                        <FileText className="w-3 h-3" />
                        {qualityPct}% calidad
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                        <Star className="w-3 h-3" />
                        Trust {Math.round(m.avgTrustScore)}
                      </span>
                      {m.impressiveReactions > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-green-500">
                          <TrendingUp className="w-3 h-3" />
                          +{m.impressiveReactions} notable
                        </span>
                      )}
                      {m.suspiciousReactions > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-red-500">
                          <AlertTriangle className="w-3 h-3" />
                          {m.suspiciousReactions} sospechoso
                        </span>
                      )}
                      {m.unresolvedFlags > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-red-500">
                          <AlertTriangle className="w-3 h-3" />
                          {m.unresolvedFlags} flag{m.unresolvedFlags !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Value + trend */}
                  <div className="text-right shrink-0">
                    <p
                      className={cn(
                        "font-mono text-2xl font-bold tabular-nums tracking-tight",
                        aboveAvg ? "text-green-500" : "text-red-500"
                      )}
                    >
                      ${m.hourValue.toFixed(2)}
                    </p>
                    <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                      por hora
                    </p>

                    {/* Trend arrow */}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      {hasTrend ? (
                        trendUp ? (
                          <>
                            <TrendingUp className="w-3 h-3 text-green-500" />
                            <span className="font-mono text-[10px] tabular-nums text-green-500">
                              +{trendDiff.toFixed(1)}
                            </span>
                          </>
                        ) : trendDown ? (
                          <>
                            <TrendingDown className="w-3 h-3 text-red-500" />
                            <span className="font-mono text-[10px] tabular-nums text-red-500">
                              {trendDiff.toFixed(1)}
                            </span>
                          </>
                        ) : (
                          <>
                            <Minus className="w-3 h-3 text-muted-foreground" />
                            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                              0.0
                            </span>
                          </>
                        )
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          --
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Difference from average */}
                <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2">
                  <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                    Diferencia vs promedio
                  </p>
                  <p
                    className={cn(
                      "font-mono text-xs font-bold tabular-nums",
                      aboveAvg ? "text-green-500" : "text-red-500"
                    )}
                  >
                    {diff >= 0 ? "+" : ""}
                    {diff.toFixed(2)} ({diff >= 0 ? "+" : ""}
                    {diffPct}%)
                  </p>
                </div>

                {/* Multiplier breakdown bar */}
                <div className="mt-2 grid grid-cols-4 gap-1">
                  <div className="bg-accent/30 border border-border p-1.5 text-center">
                    <p className="font-mono text-[8px] tracking-[0.15em] uppercase text-muted-foreground">
                      Evidencia
                    </p>
                    <p className="font-mono text-xs font-bold tabular-nums mt-0.5">
                      x{m.proofMultiplier.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-accent/30 border border-border p-1.5 text-center">
                    <p className="font-mono text-[8px] tracking-[0.15em] uppercase text-muted-foreground">
                      Calidad
                    </p>
                    <p className="font-mono text-xs font-bold tabular-nums mt-0.5">
                      x{m.qualityMultiplier.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-accent/30 border border-border p-1.5 text-center">
                    <p className="font-mono text-[8px] tracking-[0.15em] uppercase text-muted-foreground">
                      Trust
                    </p>
                    <p className="font-mono text-xs font-bold tabular-nums mt-0.5">
                      x{m.trustMultiplier.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-accent/30 border border-border p-1.5 text-center">
                    <p className="font-mono text-[8px] tracking-[0.15em] uppercase text-muted-foreground">
                      Pares
                    </p>
                    <p className="font-mono text-xs font-bold tabular-nums mt-0.5">
                      x{m.peerMultiplier.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Penalty line */}
                {m.penalty > 0 && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                    <p className="font-mono text-[10px] text-red-500">
                      Penalizacion: -${m.penalty.toFixed(2)} ({m.unresolvedFlags} flags, {m.lateHours} horas tarde)
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Formula explanation */}
      <div className="mt-8 border border-border p-4">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Formula de calculo
        </p>
        <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
          Valor = 100 x (evidencia) x (calidad) x (trust/100) x (pares) - penalizaciones
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
          <div className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-bold">Evidencia:</span>{" "}
            horas con prueba / total
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-bold">Calidad:</span>{" "}
            descripciones &gt;50 chars / total
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-bold">Trust:</span>{" "}
            promedio Trust Score / 100
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-bold">Pares:</span> 1.0 +
            (notables x 0.02) - (sospechosos x 0.05)
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-bold">Penalizacion:</span>{" "}
            -10 por flag, -2 por hora tarde
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="mt-10 text-center py-6 border-t border-border/30">
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/25">
          Tu valor se calcula. Tu valor se publica. Tu valor te persigue.
        </p>
      </div>
    </div>
  );
}
