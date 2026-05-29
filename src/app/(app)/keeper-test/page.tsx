"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import type { Profile, PublicFeedItem } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ShieldAlert,
  Check,
  X,
  AlertTriangle,
  Users,
  ChevronDown,
  ChevronUp,
  History,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// ─── Helpers ──────────────────────────────────────────────────────

function getCurrentMonth(): string {
  // Use MTY timezone for month key
  const today = getTodayMTY(); // "YYYY-MM-DD"
  return today.slice(0, 7); // "YYYY-MM"
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 15);
  return format(date, "MMMM yyyy", { locale: es });
}

function isNextMonthOrLater(monthKey: string): boolean {
  const currentMonth = getCurrentMonth();
  return monthKey < currentMonth;
}

function parseVoteBody(body: string): {
  voterId: string;
  targetId: string;
  vote: "yes" | "no";
  month: string;
} | null {
  // Format: KEEPER|voter_id|target_id|yes_or_no|YYYY-MM
  const parts = body.split("|");
  if (parts.length < 5 || parts[0] !== "KEEPER") return null;
  const vote = parts[3] as "yes" | "no";
  if (vote !== "yes" && vote !== "no") return null;
  return {
    voterId: parts[1],
    targetId: parts[2],
    vote,
    month: parts[4],
  };
}

// ─── Types ──────────────────────────────────────────────────────

interface MemberResult {
  userId: string;
  profile: Profile;
  yesCount: number;
  noCount: number;
  totalVotes: number;
  yesPercent: number;
  isCritical: boolean;
}

// ─── Page ──────────────────────────────────────────────────────

export default function KeeperTestPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [members, setMembers] = useState<Profile[]>([]);
  const [votes, setVotes] = useState<PublicFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const currentMonth = useMemo(() => getCurrentMonth(), []);

  // ─── Load data ──────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!orgId) return;

    // Fetch team members
    const { data: memberData } = await supabase
      .from("org_members")
      .select("user_id, profiles(id, email, full_name, avatar_url)")
      .eq("org_id", orgId);

    if (memberData) {
      const profiles = memberData
        .map((m) => m.profiles as unknown as Profile)
        .filter(Boolean);
      setMembers(profiles);
    }

    // Fetch all keeper votes for this org
    const { data: feedData } = await supabase
      .from("public_feed")
      .select("*")
      .eq("org_id", orgId)
      .eq("type", "team_update")
      .like("body", "KEEPER|%")
      .order("created_at", { ascending: false });

    if (feedData) {
      setVotes(feedData as PublicFeedItem[]);
    }

    setLoading(false);
  }, [orgId, supabase]);

  useEffect(() => {
    if (orgLoading || !orgId) return;
    loadData();
  }, [orgId, orgLoading, loadData]);

  // ─── Derived data ──────────────────────────────────────────

  // Votes parsed by month
  const votesByMonth = useMemo(() => {
    const map: Record<string, { voterId: string; targetId: string; vote: "yes" | "no" }[]> = {};
    for (const item of votes) {
      const parsed = parseVoteBody(item.body);
      if (!parsed) continue;
      if (!map[parsed.month]) map[parsed.month] = [];
      map[parsed.month].push({
        voterId: parsed.voterId,
        targetId: parsed.targetId,
        vote: parsed.vote,
      });
    }
    return map;
  }, [votes]);

  // Current month votes
  const currentVotes = votesByMonth[currentMonth] || [];

  // What has the current user already voted on this month?
  const myVotes = useMemo(() => {
    const map: Record<string, "yes" | "no"> = {};
    for (const v of currentVotes) {
      if (v.voterId === userId) {
        map[v.targetId] = v.vote;
      }
    }
    return map;
  }, [currentVotes, userId]);

  // Members to vote on (everyone except self, not yet voted)
  const pendingMembers = useMemo(() => {
    return members.filter((m) => m.id !== userId && !(m.id in myVotes));
  }, [members, userId, myVotes]);

  const votedMembers = useMemo(() => {
    return members.filter((m) => m.id !== userId && m.id in myVotes);
  }, [members, userId, myVotes]);

  // Determine if results should be visible for a given month
  // Visible if: all members have voted for all others, OR it's past the 1st of next month
  function shouldShowResults(monthKey: string): boolean {
    if (isNextMonthOrLater(monthKey)) return true;

    // Check if all eligible voters have voted for all eligible targets
    const otherMembers = members.filter((m) => m.id !== undefined);
    const monthVotes = votesByMonth[monthKey] || [];

    for (const voter of otherMembers) {
      for (const target of otherMembers) {
        if (voter.id === target.id) continue;
        const hasVoted = monthVotes.some(
          (v) => v.voterId === voter.id && v.targetId === target.id
        );
        if (!hasVoted) return false;
      }
    }
    return true;
  }

  // Compute results for a month
  function computeResults(monthKey: string): MemberResult[] {
    const monthVotes = votesByMonth[monthKey] || [];
    const results: MemberResult[] = [];

    for (const member of members) {
      const votesForMember = monthVotes.filter((v) => v.targetId === member.id);
      if (votesForMember.length === 0) continue;

      const yesCount = votesForMember.filter((v) => v.vote === "yes").length;
      const noCount = votesForMember.filter((v) => v.vote === "no").length;
      const total = yesCount + noCount;
      const yesPercent = total > 0 ? (yesCount / total) * 100 : 0;

      results.push({
        userId: member.id,
        profile: member,
        yesCount,
        noCount,
        totalVotes: total,
        yesPercent,
        isCritical: noCount > yesCount, // >50% said no
      });
    }

    // Sort by % "Si" ascending (worst first)
    results.sort((a, b) => a.yesPercent - b.yesPercent);
    return results;
  }

  const currentResults = useMemo(
    () => computeResults(currentMonth),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentMonth, votesByMonth, members]
  );
  const showCurrentResults = shouldShowResults(currentMonth);

  // Historical months (excluding current)
  const historyMonths = useMemo(() => {
    return Object.keys(votesByMonth)
      .filter((m) => m !== currentMonth)
      .sort()
      .reverse();
  }, [votesByMonth, currentMonth]);

  // ─── Vote handler ──────────────────────────────────────────

  async function handleVote(targetId: string, vote: "yes" | "no") {
    if (!orgId || !userId) return;
    setSubmitting(targetId);

    const body = `KEEPER|${userId}|${targetId}|${vote}|${currentMonth}`;

    await supabase.from("public_feed").insert({
      org_id: orgId,
      type: "team_update",
      title: "Keeper Test Vote",
      body,
      target_user_id: targetId,
      urgency: vote === "no" ? "high" : "normal",
      emoji: vote === "yes" ? "OK" : "!!",
      is_ai_generated: false,
    });

    // Reload data
    await loadData();
    setSubmitting(null);
  }

  // ─── Participation ──────────────────────────────────────────

  const totalVoters = members.length;
  const votersWhoVoted = useMemo(() => {
    const voterIds = new Set(currentVotes.map((v) => v.voterId));
    return voterIds.size;
  }, [currentVotes]);

  // ─── Render ──────────────────────────────────────────────────

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
        <p className="text-muted-foreground font-mono text-sm">
          No perteneces a ninguna organizacion.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* ─── Header ──────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Keeper Test
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          {getMonthLabel(currentMonth)} &mdash; &iquest;Luchar&iacute;as por mantener a cada miembro?
        </p>

        {/* Participation meter */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-mono text-[11px] text-muted-foreground">
              Participacion:
            </span>
          </div>
          <div className="flex-1 h-1.5 bg-accent/40 border border-border overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{
                width:
                  totalVoters > 0
                    ? `${(votersWhoVoted / totalVoters) * 100}%`
                    : "0%",
              }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {votersWhoVoted}/{totalVoters}
          </span>
        </div>
      </div>

      {/* ─── Warning banner ──────────────────────────────── */}
      <div className="mb-8 border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-mono text-[11px] font-semibold text-amber-500 uppercase tracking-wide">
            Resultados publicos
          </p>
          <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
            Los resultados seran visibles para todo el equipo una vez que todos
            voten o al inicio del proximo mes. Los votos son anonimos pero los
            conteos son publicos.
          </p>
        </div>
      </div>

      {/* ─── Voting Section ──────────────────────────────── */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Votar &mdash; {getMonthLabel(currentMonth)}
        </p>

        {pendingMembers.length === 0 && votedMembers.length === 0 && (
          <div className="border border-border p-8 text-center">
            <div className="w-16 h-16 border border-border mx-auto flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-mono text-sm text-muted-foreground">
              No hay otros miembros para evaluar.
            </p>
          </div>
        )}

        {/* Pending votes */}
        {pendingMembers.length > 0 && (
          <div className="space-y-2 mb-4">
            {pendingMembers.map((member) => (
              <div
                key={member.id}
                className="border border-border p-4 flex items-center gap-4"
              >
                <Avatar className="h-10 w-10 ring-1 ring-border shrink-0">
                  <AvatarImage src={member.avatar_url || undefined} />
                  <AvatarFallback className="text-xs font-mono">
                    {getInitials(member.full_name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-bold truncate">
                    {member.full_name || member.email}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    &iquest;Luchar&iacute;as por mantener a esta persona?
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleVote(member.id, "yes")}
                    disabled={submitting === member.id}
                    className={cn(
                      "px-4 py-2 bg-green-600 text-white font-mono text-xs uppercase tracking-wide transition-colors hover:bg-green-700 disabled:opacity-40",
                      submitting === member.id && "animate-pulse"
                    )}
                  >
                    Si
                  </button>
                  <button
                    onClick={() => handleVote(member.id, "no")}
                    disabled={submitting === member.id}
                    className={cn(
                      "px-4 py-2 bg-red-600 text-white font-mono text-xs uppercase tracking-wide transition-colors hover:bg-red-700 disabled:opacity-40",
                      submitting === member.id && "animate-pulse"
                    )}
                  >
                    No
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Already voted */}
        {votedMembers.length > 0 && (
          <div className="space-y-2">
            {votedMembers.map((member) => (
              <div
                key={member.id}
                className="border border-border p-4 flex items-center gap-4 opacity-70"
              >
                <Avatar className="h-10 w-10 ring-1 ring-border shrink-0">
                  <AvatarImage src={member.avatar_url || undefined} />
                  <AvatarFallback className="text-xs font-mono">
                    {getInitials(member.full_name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-bold truncate">
                    {member.full_name || member.email}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Voto registrado
                  </p>
                </div>

                <div className="shrink-0">
                  <div
                    className={cn(
                      "w-8 h-8 flex items-center justify-center border",
                      myVotes[member.id] === "yes"
                        ? "border-green-500/50 bg-green-500/10 text-green-500"
                        : "border-red-500/50 bg-red-500/10 text-red-500"
                    )}
                  >
                    {myVotes[member.id] === "yes" ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Results Section ──────────────────────────────── */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Resultados &mdash; {getMonthLabel(currentMonth)}
        </p>

        {!showCurrentResults ? (
          <div className="border border-border p-8 text-center">
            <div className="w-16 h-16 border border-border mx-auto flex items-center justify-center mb-4">
              <ShieldAlert className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-mono text-sm text-muted-foreground">
              Los resultados se revelan cuando todos votan o al inicio del
              proximo mes.
            </p>
            <p className="font-mono text-[10px] text-muted-foreground mt-2">
              {votersWhoVoted}/{totalVoters} miembros han votado
            </p>
          </div>
        ) : currentResults.length === 0 ? (
          <div className="border border-border p-8 text-center">
            <div className="w-16 h-16 border border-border mx-auto flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-mono text-sm text-muted-foreground">
              No hay votos registrados este mes.
            </p>
          </div>
        ) : (
          <ResultsTable results={currentResults} members={members} />
        )}
      </div>

      {/* ─── History ──────────────────────────────────────── */}
      {historyMonths.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Historial
            </p>
          </div>

          <div className="space-y-2">
            {historyMonths.map((monthKey) => {
              const isExpanded = expandedMonth === monthKey;
              const results = computeResults(monthKey);
              const hasCritical = results.some((r) => r.isCritical);

              return (
                <div key={monthKey}>
                  <button
                    onClick={() =>
                      setExpandedMonth(isExpanded ? null : monthKey)
                    }
                    className={cn(
                      "w-full border border-border p-3 flex items-center gap-3 transition-colors hover:bg-accent/20",
                      hasCritical && "border-red-500/30"
                    )}
                  >
                    <span className="font-mono text-sm font-bold capitalize flex-1 text-left">
                      {getMonthLabel(monthKey)}
                    </span>
                    {hasCritical && (
                      <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-red-500 font-semibold">
                        Alerta
                      </span>
                    )}
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {results.length} miembros
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border border-t-0 border-border p-4">
                      <ResultsTable results={results} members={members} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Results Table Component ──────────────────────────────────────

function ResultsTable({
  results,
  members,
}: {
  results: MemberResult[];
  members: Profile[];
}) {
  if (results.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Table header */}
      <div className="hidden sm:grid grid-cols-[1fr_5rem_5rem_6rem_6rem] gap-2 px-3 py-2 border border-border bg-accent/20 font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
        <span>Miembro</span>
        <span className="text-center">Si</span>
        <span className="text-center">No</span>
        <span className="text-center">%&nbsp;Si</span>
        <span className="text-center">Estado</span>
      </div>

      {results.map((r) => (
        <div
          key={r.userId}
          className={cn(
            "grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_5rem_5rem_6rem_6rem] gap-2 px-3 py-3 border border-border items-center",
            r.isCritical && "border-2 border-red-500/50 animate-danger-pulse"
          )}
        >
          {/* Member */}
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              className={cn(
                "h-8 w-8 shrink-0 ring-1",
                r.isCritical ? "ring-red-500/50" : "ring-border"
              )}
            >
              <AvatarImage src={r.profile.avatar_url || undefined} />
              <AvatarFallback
                className={cn(
                  "text-[10px] font-mono",
                  r.isCritical && "bg-red-500/10 text-red-500"
                )}
              >
                {getInitials(r.profile.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold truncate">
                {r.profile.full_name || r.profile.email}
              </p>
              {/* Mobile stats */}
              <div className="sm:hidden flex items-center gap-3 mt-1">
                <span className="font-mono text-[10px] tabular-nums text-green-500">
                  Si: {r.yesCount}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-red-500">
                  No: {r.noCount}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {r.yesPercent.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Mobile status badge */}
          <div className="sm:hidden flex items-center justify-end">
            {r.isCritical ? (
              <span className="font-mono text-[9px] tracking-[0.1em] uppercase font-bold text-red-500 bg-red-500/10 border border-red-500/30 px-2 py-1">
                Alerta Critica
              </span>
            ) : (
              <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-green-500 bg-green-500/10 border border-green-500/30 px-2 py-1">
                Seguro
              </span>
            )}
          </div>

          {/* Desktop columns */}
          <span className="hidden sm:block font-mono text-sm tabular-nums text-center text-green-500 font-bold">
            {r.yesCount}
          </span>
          <span className="hidden sm:block font-mono text-sm tabular-nums text-center text-red-500 font-bold">
            {r.noCount}
          </span>

          {/* Percentage bar */}
          <div className="hidden sm:flex flex-col items-center gap-1">
            <span
              className={cn(
                "font-mono text-sm tabular-nums font-bold",
                r.isCritical ? "text-red-500" : "text-green-500"
              )}
            >
              {r.yesPercent.toFixed(0)}%
            </span>
            <div className="w-full h-1 bg-accent/40 border border-border overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  r.isCritical ? "bg-red-500" : "bg-green-500"
                )}
                style={{ width: `${r.yesPercent}%` }}
              />
            </div>
          </div>

          {/* Status badge */}
          <div className="hidden sm:flex justify-center">
            {r.isCritical ? (
              <span className="font-mono text-[9px] tracking-[0.1em] uppercase font-bold text-red-500 bg-red-500/10 border border-red-500/30 px-2 py-1">
                Alerta Critica
              </span>
            ) : (
              <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-green-500 bg-green-500/10 border border-green-500/30 px-2 py-1">
                Seguro
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
