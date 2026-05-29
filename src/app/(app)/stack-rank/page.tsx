"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  FileWarning,
  Loader2,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Shield,
  Eye,
  Clock,
  Users,
  ThumbsUp,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────

type Tier = "EXCEEDS" | "MEETS" | "NEEDS_IMPROVEMENT";

interface MemberScore {
  userId: string;
  profile: Profile | null;
  rank: number;
  compositeScore: number;
  tier: Tier;
  breakdown: {
    hoursScore: number;
    trustScore: number;
    proofScore: number;
    ritualScore: number;
    peerScore: number;
  };
  rawData: {
    totalHours: number;
    expectedHours: number;
    avgTrust: number;
    proofRate: number;
    standupRate: number;
    closeoutRate: number;
    promiseRate: number;
    impressiveCount: number;
    suspiciousCount: number;
  };
}

interface PipRecord {
  id: string;
  title: string;
  body: string;
  target_user_id: string | null;
  created_at: string;
}

// ─── Page ───────────────────────────────────────────────────────

export default function StackRankPage() {
  const { orgId, userId, role, loading: orgLoading } = useOrg();
  const [rankings, setRankings] = useState<MemberScore[]>([]);
  const [pipHistory, setPipHistory] = useState<PipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedPip, setGeneratedPip] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const supabase = createClient();

  const isAdmin = role === "owner" || role === "admin";

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const today = new Date();
    const sevenDaysAgo = format(subDays(today, 7), "yyyy-MM-dd");
    const todayStr = format(today, "yyyy-MM-dd");

    // Fetch all data in parallel
    const [
      { data: members },
      { data: entries },
      { data: trustHistory },
      { data: closeouts },
      { data: standups },
      { data: promises },
      { data: reactions },
      { data: orgSettings },
      { data: pipFeed },
    ] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id, profiles(id, email, full_name, avatar_url)")
        .eq("org_id", orgId),
      supabase
        .from("time_entries")
        .select("user_id, proof_urls, date, hour")
        .eq("org_id", orgId)
        .gte("date", sevenDaysAgo)
        .lte("date", todayStr)
        .is("deleted_at", null),
      supabase
        .from("trust_score_history")
        .select("user_id, score")
        .eq("org_id", orgId)
        .gte("date", sevenDaysAgo)
        .lte("date", todayStr),
      supabase
        .from("daily_closeouts")
        .select("user_id, date")
        .eq("org_id", orgId)
        .gte("date", sevenDaysAgo)
        .lte("date", todayStr),
      supabase
        .from("standups")
        .select("user_id, date")
        .eq("org_id", orgId)
        .gte("date", sevenDaysAgo)
        .lte("date", todayStr),
      supabase
        .from("daily_promises")
        .select("user_id, status")
        .eq("org_id", orgId)
        .gte("date", sevenDaysAgo)
        .lte("date", todayStr),
      supabase
        .from("entry_reactions")
        .select("entry_id, reaction, time_entries!inner(user_id, org_id, date)")
        .eq("time_entries.org_id", orgId)
        .gte("time_entries.date", sevenDaysAgo)
        .lte("time_entries.date", todayStr),
      supabase
        .from("org_settings")
        .select("expected_daily_hours")
        .eq("org_id", orgId)
        .single(),
      supabase
        .from("public_feed")
        .select("id, title, body, target_user_id, created_at")
        .eq("org_id", orgId)
        .eq("type", "warning")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (!members || members.length === 0) {
      setLoading(false);
      return;
    }

    const expectedDailyHours = orgSettings?.expected_daily_hours ?? 8;
    // 7 days * expected daily hours (skip weekends would be more accurate but we keep it simple)
    const expectedWeeklyHours = 5 * expectedDailyHours;
    const expectedRituals = 5; // 5 working days

    // Build profile map
    const profileMap = new Map<string, Profile>();
    for (const m of members) {
      const p = m.profiles as unknown as Profile | null;
      if (p) profileMap.set(m.user_id, p);
    }
    setProfiles(profileMap);

    // Calculate scores per member
    const scores: MemberScore[] = members.map((m) => {
      const uid = m.user_id;

      // Hours
      const userEntries = (entries ?? []).filter((e) => e.user_id === uid);
      const totalHours = userEntries.length;
      const hoursWithProof = userEntries.filter(
        (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
      ).length;

      // Trust
      const userTrust = (trustHistory ?? []).filter((t) => t.user_id === uid);
      const avgTrust =
        userTrust.length > 0
          ? userTrust.reduce((sum, t) => sum + t.score, 0) / userTrust.length
          : 50;

      // Proof rate
      const proofRate = totalHours > 0 ? (hoursWithProof / totalHours) * 100 : 0;

      // Rituals
      const userCloseouts = new Set(
        (closeouts ?? []).filter((c) => c.user_id === uid).map((c) => c.date)
      ).size;
      const userStandups = new Set(
        (standups ?? []).filter((s) => s.user_id === uid).map((s) => s.date)
      ).size;

      // Promises
      const userPromises = (promises ?? []).filter((p) => p.user_id === uid);
      const promisesDelivered = userPromises.filter(
        (p) => p.status === "delivered"
      ).length;
      const promiseRate =
        userPromises.length > 0
          ? (promisesDelivered / userPromises.length) * 100
          : 50; // default if no promises made

      // Reactions
      const userReactions = (reactions ?? []).filter((r) => {
        const te = r.time_entries as unknown as { user_id: string } | null;
        return te?.user_id === uid;
      });
      const impressiveCount = userReactions.filter(
        (r) => r.reaction === "impressive"
      ).length;
      const suspiciousCount = userReactions.filter(
        (r) => r.reaction === "suspicious"
      ).length;

      // Composite scores (each 0-100)
      const hoursScore = Math.min((totalHours / expectedWeeklyHours) * 100, 100);
      const trustScore = Math.min(avgTrust, 100);
      const proofScore = proofRate;
      const ritualScore =
        ((userStandups + userCloseouts) / (expectedRituals * 2)) * 100;
      const peerScore =
        impressiveCount + suspiciousCount > 0
          ? (impressiveCount / (impressiveCount + suspiciousCount)) * 100
          : 50;

      // Weighted composite (0-100)
      const compositeScore = Math.round(
        hoursScore * 0.25 +
          trustScore * 0.25 +
          proofScore * 0.2 +
          Math.min(ritualScore, 100) * 0.15 +
          peerScore * 0.15
      );

      return {
        userId: uid,
        profile: profileMap.get(uid) ?? null,
        rank: 0,
        compositeScore,
        tier: "MEETS" as Tier,
        breakdown: {
          hoursScore: Math.round(hoursScore),
          trustScore: Math.round(trustScore),
          proofScore: Math.round(proofScore),
          ritualScore: Math.round(Math.min(ritualScore, 100)),
          peerScore: Math.round(peerScore),
        },
        rawData: {
          totalHours,
          expectedHours: expectedWeeklyHours,
          avgTrust: Math.round(avgTrust),
          proofRate: Math.round(proofRate),
          standupRate: Math.round(
            (userStandups / expectedRituals) * 100
          ),
          closeoutRate: Math.round(
            (userCloseouts / expectedRituals) * 100
          ),
          promiseRate: Math.round(promiseRate),
          impressiveCount,
          suspiciousCount,
        },
      };
    });

    // Sort by composite score descending
    scores.sort((a, b) => b.compositeScore - a.compositeScore);

    // Assign ranks
    scores.forEach((s, i) => {
      s.rank = i + 1;
    });

    // Force distribution
    const total = scores.length;
    const exceedsCount = Math.max(1, Math.round(total * 0.2));
    const needsImprovementCount = Math.max(1, Math.round(total * 0.1));

    scores.forEach((s, i) => {
      if (i < exceedsCount) {
        s.tier = "EXCEEDS";
      } else if (i >= total - needsImprovementCount) {
        s.tier = "NEEDS_IMPROVEMENT";
      } else {
        s.tier = "MEETS";
      }
    });

    setRankings(scores);
    setPipHistory((pipFeed as PipRecord[]) ?? []);
    setLoading(false);
  }, [orgId, supabase]);

  useEffect(() => {
    if (orgLoading) return;
    loadData();
  }, [orgLoading, loadData]);

  async function handleGeneratePip() {
    const bottom = rankings[rankings.length - 1];
    if (!bottom || !orgId) return;

    setGenerating(true);
    setGeneratedPip(null);

    try {
      const res = await fetch("/api/generate-pip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: bottom.userId,
        }),
      });

      const data = await res.json();
      if (data.success && data.pip) {
        setGeneratedPip(data.pip);
        // Reload PIP history
        const { data: pipFeed } = await supabase
          .from("public_feed")
          .select("id, title, body, target_user_id, created_at")
          .eq("org_id", orgId)
          .eq("type", "warning")
          .order("created_at", { ascending: false })
          .limit(20);
        setPipHistory((pipFeed as PipRecord[]) ?? []);
      }
    } catch {
      // silent
    } finally {
      setGenerating(false);
    }
  }

  if (loading || orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground font-mono text-xs">
          Sin organizacion
        </p>
      </div>
    );
  }

  const bottomPerformer = rankings.length > 0 ? rankings[rankings.length - 1] : null;
  const weekLabel = `${format(subDays(new Date(), 7), "d MMM", { locale: es })} - ${format(new Date(), "d MMM yyyy", { locale: es })}`;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Stack Ranking Semanal
          </h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            {weekLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Miembros
            </p>
            <p className="font-mono tabular-nums text-lg font-bold">
              {rankings.length}
            </p>
          </div>
        </div>
      </div>

      {/* Distribution legend */}
      <div className="flex items-center gap-4 mb-8 font-mono text-[10px] tracking-wide">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-green-500" />
          <span className="text-muted-foreground">TOP 20% EXCEEDS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-muted-foreground" />
          <span className="text-muted-foreground">70% MEETS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-red-500 animate-pulse" />
          <span className="text-muted-foreground">10% NEEDS IMPROVEMENT</span>
        </div>
      </div>

      {/* Rankings */}
      <div className="space-y-2 mb-8">
        {rankings.map((member, index) => (
          <RankingCard
            key={member.userId}
            member={member}
            index={index}
            total={rankings.length}
            expanded={expandedUser === member.userId}
            onToggle={() =>
              setExpandedUser(
                expandedUser === member.userId ? null : member.userId
              )
            }
          />
        ))}
      </div>

      {/* PIP Section */}
      {bottomPerformer && bottomPerformer.tier === "NEEDS_IMPROVEMENT" && (
        <div className="mb-8">
          <div className="palantir-divider text-muted-foreground mb-4">
            PERFORMANCE IMPROVEMENT PLAN
          </div>

          <div className="border-2 border-red-500/50 p-6 corner-marks">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <div>
                  <p className="font-mono text-sm font-bold uppercase">
                    PIP Requerido
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {bottomPerformer.profile?.full_name ?? "Desconocido"} -
                    Score: {bottomPerformer.compositeScore}/100
                  </p>
                </div>
              </div>

              {isAdmin && (
                <Button
                  onClick={handleGeneratePip}
                  disabled={generating}
                  className="bg-red-600 hover:bg-red-700 text-white font-mono text-xs gap-2"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <FileWarning className="w-3.5 h-3.5" />
                      Generar PIP
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Show generated PIP */}
            {generatedPip && (
              <div className="border border-red-500/30 bg-red-950/5 p-4 mt-4">
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-400 mb-3">
                  PIP Generado por Claude
                </p>
                <div className="font-mono text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {generatedPip}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PIP History */}
      {pipHistory.length > 0 && (
        <div className="mb-8">
          <div className="palantir-divider text-muted-foreground mb-4">
            HISTORIAL DE PIPs
          </div>

          <div className="space-y-2">
            {pipHistory.map((pip) => {
              const targetProfile = pip.target_user_id
                ? profiles.get(pip.target_user_id)
                : null;
              return (
                <div
                  key={pip.id}
                  className="border border-border p-4 transition-colors duration-200 hover:border-primary/30"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileWarning className="w-3.5 h-3.5 text-red-500" />
                      <span className="font-mono text-xs font-bold uppercase">
                        {pip.title}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {format(new Date(pip.created_at), "d MMM yyyy HH:mm", {
                        locale: es,
                      })}
                    </span>
                  </div>
                  {targetProfile && (
                    <p className="font-mono text-[10px] text-muted-foreground mb-2">
                      Sujeto: {targetProfile.full_name}
                    </p>
                  )}
                  <p className="font-mono text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed line-clamp-4">
                    {pip.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Methodology */}
      <div className="mb-8">
        <div className="palantir-divider text-muted-foreground mb-4">
          METODOLOGIA
        </div>
        <div className="border border-border p-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Horas", weight: "25%", icon: Clock },
              { label: "Trust Score", weight: "25%", icon: Shield },
              { label: "Evidencia", weight: "20%", icon: Eye },
              { label: "Rituales", weight: "15%", icon: Users },
              { label: "Peers", weight: "15%", icon: ThumbsUp },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-accent/30 border border-border p-3 text-center"
              >
                <item.icon className="w-3.5 h-3.5 text-primary mx-auto mb-1.5" />
                <p className="font-mono text-[10px] text-muted-foreground">
                  {item.label}
                </p>
                <p className="font-mono tabular-nums text-sm font-bold">
                  {item.weight}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Ranking Card ───────────────────────────────────────────────

function RankingCard({
  member,
  index,
  total,
  expanded,
  onToggle,
}: {
  member: MemberScore;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tierConfig = {
    EXCEEDS: {
      label: "EXCEEDS",
      border: "border-green-500/30 bg-green-950/5",
      badge: "bg-green-500/15 text-green-400 border-green-500/30",
      icon: TrendingUp,
      iconColor: "text-green-500",
    },
    MEETS: {
      label: "MEETS",
      border: "border-border",
      badge: "bg-muted text-muted-foreground border-border",
      icon: Minus,
      iconColor: "text-muted-foreground",
    },
    NEEDS_IMPROVEMENT: {
      label: "NEEDS IMPROVEMENT",
      border: "border-red-500/30 bg-red-950/5 animate-danger-pulse",
      badge: "bg-red-500/15 text-red-400 border-red-500/30",
      icon: TrendingDown,
      iconColor: "text-red-500",
    },
  };

  const config = tierConfig[member.tier];
  const TierIcon = config.icon;

  return (
    <div
      className={cn(
        "border p-4 transition-colors duration-200 hover:border-primary/30",
        config.border
      )}
    >
      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 cursor-pointer"
      >
        {/* Rank number */}
        <div className="flex items-center justify-center w-8">
          <span className="font-mono tabular-nums text-2xl font-bold">
            {member.rank}
          </span>
        </div>

        {/* Avatar + name */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="w-8 h-8 ring-1 ring-border">
            <AvatarImage src={member.profile?.avatar_url ?? undefined} />
            <AvatarFallback className="font-mono text-[10px]">
              {getInitials(member.profile?.full_name ?? null)}
            </AvatarFallback>
          </Avatar>
          <div className="text-left min-w-0">
            <p className="font-mono text-sm font-bold truncate">
              {member.profile?.full_name ?? "Desconocido"}
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {member.rawData.totalHours}h / {member.rawData.expectedHours}h
              &middot; Trust {member.rawData.avgTrust}
            </p>
          </div>
        </div>

        {/* Score */}
        <div className="text-right flex items-center gap-3">
          <div>
            <p className="font-mono tabular-nums text-2xl font-bold">
              {member.compositeScore}
            </p>
            <p className="font-mono text-[9px] text-muted-foreground">
              /100
            </p>
          </div>

          {/* Tier badge */}
          <span
            className={cn(
              "font-mono text-[9px] tracking-[0.1em] font-bold px-2 py-1 border whitespace-nowrap",
              config.badge
            )}
          >
            {config.label}
          </span>

          {/* Expand */}
          <TierIcon className={cn("w-4 h-4 shrink-0", config.iconColor)} />
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
        </div>
      </button>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="grid grid-cols-5 gap-2 mb-4">
            {[
              {
                label: "Horas",
                value: member.breakdown.hoursScore,
                raw: `${member.rawData.totalHours}/${member.rawData.expectedHours}h`,
              },
              {
                label: "Trust",
                value: member.breakdown.trustScore,
                raw: `Avg ${member.rawData.avgTrust}`,
              },
              {
                label: "Evidencia",
                value: member.breakdown.proofScore,
                raw: `${member.rawData.proofRate}%`,
              },
              {
                label: "Rituales",
                value: member.breakdown.ritualScore,
                raw: `S:${member.rawData.standupRate}% C:${member.rawData.closeoutRate}%`,
              },
              {
                label: "Peers",
                value: member.breakdown.peerScore,
                raw: `+${member.rawData.impressiveCount} -${member.rawData.suspiciousCount}`,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-accent/30 border border-border p-2 text-center"
              >
                <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground mb-1">
                  {item.label}
                </p>
                <p
                  className={cn(
                    "font-mono tabular-nums text-lg font-bold",
                    item.value >= 70
                      ? "text-green-500"
                      : item.value >= 40
                        ? "text-foreground"
                        : "text-red-500"
                  )}
                >
                  {item.value}
                </p>
                <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
                  {item.raw}
                </p>
              </div>
            ))}
          </div>

          {/* Promise delivery */}
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-muted-foreground">
              Promesas cumplidas
            </span>
            <span className="tabular-nums font-bold">
              {member.rawData.promiseRate}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
