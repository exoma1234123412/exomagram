"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile, TimeEntry, OutputType } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertTriangle,
  Crosshair,
  Flame,
  Users,
  Zap,
} from "lucide-react";
import { format, subDays } from "date-fns";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ScoredEntry {
  id: string;
  title: string;
  category: string;
  score: number;
  classification: "IMPACTO" | "BUSYWORK";
}

interface MemberImpact {
  userId: string;
  profile: Profile | null;
  totalHours: number;
  impactHours: number;
  busyworkHours: number;
  impactRatio: number; // 0-100
  badge: "ALTO IMPACTO" | "MIXTO" | "MAYORMENTE BUSYWORK";
  busyworkEntries: ScoredEntry[];
}

/* ------------------------------------------------------------------ */
/* Impact scoring                                                      */
/* ------------------------------------------------------------------ */

const HIGH_IMPACT_OUTPUT_TYPES: OutputType[] = [
  "code",
  "document",
  "design",
  "analysis",
  "decision",
];

function scoreEntry(entry: Pick<
  TimeEntry,
  "category" | "proof_urls" | "description" | "links" | "output_type" | "value_rating" | "title"
>): number {
  let score = 0;

  // Category bonuses
  if (entry.category === "deep_work") score += 3;
  if (entry.category === "review") score += 2;
  if (entry.category === "planning") score += 1;
  if (entry.category === "meeting") score += 1;
  if (entry.category === "learning") score += 1;

  // Proof
  if (entry.proof_urls && entry.proof_urls.length > 0) score += 2;

  // Description quality
  if (entry.description && entry.description.length > 100) score += 1;

  // Links present
  if (entry.links && entry.links.length > 0) score += 1;

  // High-impact output types
  if (
    entry.output_type &&
    HIGH_IMPACT_OUTPUT_TYPES.includes(entry.output_type)
  ) {
    score += 2;
  }

  // Value rating
  if (entry.value_rating && entry.value_rating >= 4) score += 1;

  return score;
}

function classifyScore(score: number): "IMPACTO" | "BUSYWORK" {
  return score >= 5 ? "IMPACTO" : "BUSYWORK";
}

function getBadge(ratio: number): MemberImpact["badge"] {
  if (ratio > 70) return "ALTO IMPACTO";
  if (ratio >= 40) return "MIXTO";
  return "MAYORMENTE BUSYWORK";
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ImpactPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [members, setMembers] = useState<MemberImpact[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------- data loader ---------- */

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const today = format(new Date(), "yyyy-MM-dd");
    const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

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

    // 2. Time entries last 7 days
    const { data: entries } = await supabase
      .from("time_entries")
      .select(
        "id, user_id, category, title, description, proof_urls, links, output_type, value_rating"
      )
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .gte("date", sevenDaysAgo)
      .lte("date", today);

    // Group entries by user and score them
    const userEntries = new Map<string, ScoredEntry[]>();
    for (const uid of userIds) {
      userEntries.set(uid, []);
    }

    for (const entry of entries ?? []) {
      const uid = entry.user_id as string;
      const score = scoreEntry(entry as Pick<
        TimeEntry,
        "category" | "proof_urls" | "description" | "links" | "output_type" | "value_rating" | "title"
      >);
      const classification = classifyScore(score);
      const list = userEntries.get(uid) ?? [];
      list.push({
        id: entry.id,
        title: entry.title,
        category: entry.category,
        score,
        classification,
      });
      userEntries.set(uid, list);
    }

    // Build member impact data
    const result: MemberImpact[] = userIds.map((uid) => {
      const scored = userEntries.get(uid) ?? [];
      const totalHours = scored.length;
      const impactHours = scored.filter((e) => e.classification === "IMPACTO").length;
      const busyworkHours = scored.filter((e) => e.classification === "BUSYWORK").length;
      const impactRatio = totalHours > 0 ? Math.round((impactHours / totalHours) * 100) : 0;

      return {
        userId: uid,
        profile: profileMap.get(uid) ?? null,
        totalHours,
        impactHours,
        busyworkHours,
        impactRatio,
        badge: getBadge(impactRatio),
        busyworkEntries: scored
          .filter((e) => e.classification === "BUSYWORK")
          .sort((a, b) => a.score - b.score),
      };
    });

    // Sort by impact ratio descending
    result.sort((a, b) => b.impactRatio - a.impactRatio);

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

  /* ---------- computed stats ---------- */

  const totalImpactHours = members.reduce((s, m) => s + m.impactHours, 0);
  const totalBusyworkHours = members.reduce((s, m) => s + m.busyworkHours, 0);
  const totalAllHours = totalImpactHours + totalBusyworkHours;
  const teamRatio = totalAllHours > 0
    ? Math.round((totalImpactHours / totalAllHours) * 100)
    : 0;
  const bestMember = members.length > 0 ? members[0] : null;

  // All busywork entries across members, grouped by person
  const busyworkOffenders = members
    .filter((m) => m.busyworkEntries.length > 0)
    .sort((a, b) => b.busyworkEntries.length - a.busyworkEntries.length);

  /* ---------- render ---------- */

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <Crosshair className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Impacto vs Busywork
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Cada hora clasificada por evidencia de impacto real. Ultimos 7 dias.
      </p>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Ratio equipo
          </p>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
            teamRatio > 70 && "text-green-500",
            teamRatio >= 40 && teamRatio <= 70 && "text-amber-500",
            teamRatio < 40 && "text-red-500"
          )}>
            {teamRatio}%
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Horas impacto
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-green-500">
            {totalImpactHours}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Horas busywork
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-red-500">
            {totalBusyworkHours}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Mejor ratio
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-green-500 flex items-center gap-1.5">
            <Flame className="w-4 h-4" />
            {bestMember ? `${bestMember.impactRatio}%` : "--"}
          </p>
          {bestMember && (
            <p className="font-mono text-[9px] text-muted-foreground mt-0.5 truncate">
              {bestMember.profile?.full_name ?? "Sin nombre"}
            </p>
          )}
        </div>
      </div>

      {/* Leaderboard section label */}
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
        Leaderboard &mdash; mayor impacto primero
      </p>

      {/* Leaderboard */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <Zap className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            No hay datos de la ultima semana.
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {members.map((m, idx) => {
            const isMe = m.userId === userId;
            const badgeColor =
              m.badge === "ALTO IMPACTO"
                ? "text-green-500 border-green-500/30 bg-green-500/10"
                : m.badge === "MIXTO"
                  ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
                  : "text-red-500 border-red-500/30 bg-red-500/10";

            const ratioColor =
              m.impactRatio > 70
                ? "text-green-500"
                : m.impactRatio >= 40
                  ? "text-amber-500"
                  : "text-red-500";

            return (
              <div
                key={m.userId}
                className={cn(
                  "border p-4 transition-colors",
                  isMe && "border-primary/40 bg-primary/3",
                  !isMe && "border-border hover:border-primary/30"
                )}
              >
                {/* Top row */}
                <div className="flex items-start gap-3">
                  {/* Rank */}
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

                  {/* Name + badge + hours */}
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
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          "font-mono text-[10px] font-bold tracking-[0.15em] uppercase px-1.5 py-0.5 border",
                          badgeColor
                        )}
                      >
                        {m.badge}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        {m.totalHours}h total
                      </span>
                    </div>
                  </div>

                  {/* Big ratio */}
                  <div className="text-right shrink-0">
                    <p className={cn("text-3xl font-mono font-black tabular-nums tracking-tight", ratioColor)}>
                      {m.impactRatio}%
                    </p>
                    <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                      impacto
                    </p>
                  </div>
                </div>

                {/* Impact vs busywork bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted-foreground">
                      Distribucion
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      <span className="text-green-500">{m.impactHours}h impacto</span>
                      {" / "}
                      <span className="text-red-500">{m.busyworkHours}h busywork</span>
                    </span>
                  </div>
                  <div className="h-2.5 bg-accent/40 flex overflow-hidden">
                    {m.totalHours > 0 && (
                      <>
                        <div
                          className="bg-green-500 h-full transition-all duration-500"
                          style={{ width: `${m.impactRatio}%` }}
                        />
                        <div
                          className="bg-red-500 h-full transition-all duration-500"
                          style={{ width: `${100 - m.impactRatio}%` }}
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Scoring legend on first card */}
                {idx === 0 && (
                  <div className="mt-3 pt-2 border-t border-border/30 flex flex-wrap gap-x-3 gap-y-0.5">
                    {[
                      { label: "Deep Work", w: "+3" },
                      { label: "Review", w: "+2" },
                      { label: "Con evidencia", w: "+2" },
                      { label: "Output valioso", w: "+2" },
                      { label: "Descripcion larga", w: "+1" },
                      { label: "Con links", w: "+1" },
                      { label: "Valor alto", w: "+1" },
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

      {/* Busywork offenders section */}
      {busyworkOffenders.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3 mt-10">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Detalle de busywork por persona
            </p>
          </div>

          <div className="space-y-3">
            {busyworkOffenders.map((m) => (
              <div key={m.userId} className="border border-border p-4">
                {/* Person header */}
                <div className="flex items-center gap-2 mb-3">
                  <Avatar className="w-6 h-6 ring-1 ring-border shrink-0">
                    <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="font-mono text-[8px]">
                      {getInitials(m.profile?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-mono font-bold text-xs tracking-tight">
                    {m.profile?.full_name ?? "Sin nombre"}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-red-500 font-bold">
                    {m.busyworkEntries.length}h busywork
                  </span>
                </div>

                {/* Busywork entries list */}
                <div className="space-y-1">
                  {m.busyworkEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 py-1 border-t border-border/30"
                    >
                      <span className="font-mono text-[10px] tabular-nums text-red-500 font-bold w-6 shrink-0 text-center">
                        {entry.score}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-muted-foreground w-14 shrink-0 truncate">
                        {entry.category}
                      </span>
                      <span className="font-mono text-xs text-foreground truncate">
                        {entry.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bottom */}
      <div className="mt-10 text-center py-6 border-t border-border/30">
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
          El impacto se mide en resultados, no en horas sentado.
        </p>
      </div>
    </div>
  );
}
