"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowRightLeft,
  Heart,
  CheckCircle2,
  MessageSquare,
  Gavel,
  AlertTriangle,
  ArrowRight,
  Users,
} from "lucide-react";
import { format, subDays } from "date-fns";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface PairDebt {
  fromUserId: string;
  toUserId: string;
  fromProfile: Profile | null;
  toProfile: Profile | null;
  reactionsGiven: number;
  reactionsReceived: number;
  shoutoutsGiven: number;
  shoutoutsReceived: number;
  verificationsGiven: number;
  verificationsReceived: number;
  votesGiven: number;
  votesReceived: number;
  totalGiven: number;
  totalReceived: number;
}

interface MemberReciprocity {
  userId: string;
  profile: Profile | null;
  totalGiven: number;
  totalReceived: number;
  index: number; // (given / received) * 100
  badge: "DEUDOR" | "EQUILIBRADO" | "GENEROSO";
  debts: PairDebt[]; // people this user owes (received > given)
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getBadge(index: number): MemberReciprocity["badge"] {
  if (index < 50) return "DEUDOR";
  if (index <= 150) return "EQUILIBRADO";
  return "GENEROSO";
}

function safeIndex(given: number, received: number): number {
  if (received === 0 && given === 0) return 100; // No activity = balanced
  if (received === 0) return 200; // Gives but gets nothing = very generous
  return Math.round((given / received) * 100);
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ReciprocityPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [members, setMembers] = useState<MemberReciprocity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  /* ---------- data loader ---------- */

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const today = format(new Date(), "yyyy-MM-dd");
    const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

    // 1. Org members with profiles
    const { data: orgMembers } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    if (!orgMembers || orgMembers.length === 0) {
      setLoading(false);
      return;
    }

    const profileMap = new Map<string, Profile>();
    const userIds: string[] = [];
    for (const m of orgMembers) {
      userIds.push(m.user_id);
      if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
    }

    // 2. Entry reactions (last 30 days) — need to join with time_entries to get the entry owner
    const { data: reactions } = await supabase
      .from("entry_reactions")
      .select("user_id, entry_id, time_entries(user_id)")
      .gte("created_at", thirtyDaysAgo + "T00:00:00");

    // 3. Shoutouts (last 30 days)
    const { data: shoutouts } = await supabase
      .from("shoutouts")
      .select("from_user_id, to_user_id")
      .eq("org_id", orgId)
      .gte("date", thirtyDaysAgo)
      .lte("date", today);

    // 4. Meeting verifications (last 30 days)
    const { data: verifications } = await supabase
      .from("meeting_verifications")
      .select("requester_id, verifier_id, status")
      .eq("org_id", orgId)
      .eq("status", "confirmed")
      .gte("created_at", thirtyDaysAgo + "T00:00:00");

    // 5. Tribunal votes (last 30 days) — join with sessions
    const { data: tribunalVotes } = await supabase
      .from("tribunal_votes")
      .select("user_id, vote, tribunal_sessions(nominated_user_id, org_id)")
      .gte("created_at", thirtyDaysAgo + "T00:00:00");

    // Build pair map: key = "fromId->toId", value = counts by type
    type PairKey = string;
    const pairMap = new Map<
      PairKey,
      {
        reactions: number;
        shoutouts: number;
        verifications: number;
        votes: number;
      }
    >();

    function addToPair(fromId: string, toId: string, type: "reactions" | "shoutouts" | "verifications" | "votes") {
      if (fromId === toId) return; // Self interactions don't count
      if (!userIds.includes(fromId) || !userIds.includes(toId)) return; // Only org members
      const key: PairKey = `${fromId}->${toId}`;
      const cur = pairMap.get(key) ?? { reactions: 0, shoutouts: 0, verifications: 0, votes: 0 };
      cur[type]++;
      pairMap.set(key, cur);
    }

    // Process reactions: reactor (user_id) gave to entry owner (time_entries.user_id)
    for (const r of reactions ?? []) {
      const reactorId = r.user_id as string;
      const entryOwner = (r.time_entries as unknown as { user_id: string })?.user_id;
      if (entryOwner) {
        addToPair(reactorId, entryOwner, "reactions");
      }
    }

    // Process shoutouts: from_user_id gave to to_user_id
    for (const s of shoutouts ?? []) {
      addToPair(s.from_user_id, s.to_user_id, "shoutouts");
    }

    // Process verifications: verifier confirmed for requester
    for (const v of verifications ?? []) {
      addToPair(v.verifier_id, v.requester_id, "verifications");
    }

    // Process tribunal votes: voter voted for/against nominated user
    // An "innocent" vote = helping the person, "guilty" = condemning
    // We count "innocent" votes as positive reciprocity (giving)
    for (const tv of tribunalVotes ?? []) {
      const session = tv.tribunal_sessions as unknown as { nominated_user_id: string; org_id: string } | null;
      if (!session || session.org_id !== orgId) continue;
      if (tv.vote === "innocent") {
        addToPair(tv.user_id, session.nominated_user_id, "votes");
      }
    }

    // Build per-member reciprocity
    const result: MemberReciprocity[] = userIds.map((uid) => {
      let totalGiven = 0;
      let totalReceived = 0;

      // Per-person debts: who this user owes
      const debtMap = new Map<
        string,
        {
          reactionsGiven: number;
          reactionsReceived: number;
          shoutoutsGiven: number;
          shoutoutsReceived: number;
          verificationsGiven: number;
          verificationsReceived: number;
          votesGiven: number;
          votesReceived: number;
        }
      >();

      // Initialize debt entries for all other users
      for (const otherId of userIds) {
        if (otherId === uid) continue;
        debtMap.set(otherId, {
          reactionsGiven: 0,
          reactionsReceived: 0,
          shoutoutsGiven: 0,
          shoutoutsReceived: 0,
          verificationsGiven: 0,
          verificationsReceived: 0,
          votesGiven: 0,
          votesReceived: 0,
        });
      }

      // uid -> otherId (things uid GAVE)
      for (const otherId of userIds) {
        if (otherId === uid) continue;
        const given = pairMap.get(`${uid}->${otherId}`);
        if (given) {
          const d = debtMap.get(otherId)!;
          d.reactionsGiven += given.reactions;
          d.shoutoutsGiven += given.shoutouts;
          d.verificationsGiven += given.verifications;
          d.votesGiven += given.votes;
          totalGiven += given.reactions + given.shoutouts + given.verifications + given.votes;
        }
      }

      // otherId -> uid (things uid RECEIVED)
      for (const otherId of userIds) {
        if (otherId === uid) continue;
        const received = pairMap.get(`${otherId}->${uid}`);
        if (received) {
          const d = debtMap.get(otherId)!;
          d.reactionsReceived += received.reactions;
          d.shoutoutsReceived += received.shoutouts;
          d.verificationsReceived += received.verifications;
          d.votesReceived += received.votes;
          totalReceived += received.reactions + received.shoutouts + received.verifications + received.votes;
        }
      }

      // Build debt list — only people where user owes (received > given)
      const debts: PairDebt[] = [];
      for (const [otherId, d] of debtMap.entries()) {
        const pairGiven = d.reactionsGiven + d.shoutoutsGiven + d.verificationsGiven + d.votesGiven;
        const pairReceived = d.reactionsReceived + d.shoutoutsReceived + d.verificationsReceived + d.votesReceived;
        if (pairReceived > 0 || pairGiven > 0) {
          debts.push({
            fromUserId: uid,
            toUserId: otherId,
            fromProfile: profileMap.get(uid) ?? null,
            toProfile: profileMap.get(otherId) ?? null,
            reactionsGiven: d.reactionsGiven,
            reactionsReceived: d.reactionsReceived,
            shoutoutsGiven: d.shoutoutsGiven,
            shoutoutsReceived: d.shoutoutsReceived,
            verificationsGiven: d.verificationsGiven,
            verificationsReceived: d.verificationsReceived,
            votesGiven: d.votesGiven,
            votesReceived: d.votesReceived,
            totalGiven: pairGiven,
            totalReceived: pairReceived,
          });
        }
      }

      // Sort debts: highest deficit first
      debts.sort((a, b) => (b.totalReceived - b.totalGiven) - (a.totalReceived - a.totalGiven));

      const index = safeIndex(totalGiven, totalReceived);

      return {
        userId: uid,
        profile: profileMap.get(uid) ?? null,
        totalGiven,
        totalReceived,
        index,
        badge: getBadge(index),
        debts,
      };
    });

    // Sort: debtors first, then by index ascending
    result.sort((a, b) => a.index - b.index);

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

  const teamAvgIndex = members.length > 0
    ? Math.round(members.reduce((s, m) => s + m.index, 0) / members.length)
    : 100;
  const deudores = members.filter((m) => m.badge === "DEUDOR").length;
  const equilibrados = members.filter((m) => m.badge === "EQUILIBRADO").length;
  const generosos = members.filter((m) => m.badge === "GENEROSO").length;

  // Current user's data
  const myData = members.find((m) => m.userId === userId);
  const myDebts = myData?.debts.filter((d) => d.totalReceived > d.totalGiven) ?? [];

  /* ---------- render ---------- */

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <ArrowRightLeft className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Indice de Reciprocidad
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Cuanto das vs. cuanto recibes. Las deudas sociales son publicas. Ultimos 30 dias.
      </p>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Promedio equipo
          </p>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
            teamAvgIndex < 50 && "text-red-500",
            teamAvgIndex >= 50 && teamAvgIndex <= 150 && "text-green-600 dark:text-green-400",
            teamAvgIndex > 150 && "text-primary"
          )}>
            {teamAvgIndex}%
          </p>
        </div>
        <div className={cn(
          "border p-3",
          deudores > 0
            ? "bg-red-500/10 border-red-500/30"
            : "bg-accent/30 border-border"
        )}>
          <p className={cn(
            "font-mono text-[9px] tracking-[0.18em] uppercase",
            deudores > 0 ? "text-red-500/80" : "text-muted-foreground"
          )}>
            Deudores
          </p>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
            deudores > 0 ? "text-red-500" : "text-foreground"
          )}>
            {deudores}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Equilibrados
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-green-600 dark:text-green-400">
            {equilibrados}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Generosos
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-primary">
            {generosos}
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* My personal debts section (only if current user has debts) */}
      {/* ══════════════════════════════════════════════════════════ */}
      {myData && myDebts.length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Tus deudas de reciprocidad
          </p>
          <div className="border border-red-500/30 bg-red-500/5 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <p className="font-mono text-xs font-bold text-red-500 uppercase tracking-wide">
                Debes reciprocidad a {myDebts.length} persona{myDebts.length !== 1 ? "s" : ""}
              </p>
            </div>
            {myDebts.map((debt) => {
              const deficit = debt.totalReceived - debt.totalGiven;
              return (
                <div key={debt.toUserId} className="border border-border bg-background p-3">
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar className="w-7 h-7 ring-1 ring-border shrink-0">
                      <AvatarImage src={debt.toProfile?.avatar_url ?? undefined} />
                      <AvatarFallback className="font-mono text-[10px]">
                        {getInitials(debt.toProfile?.full_name ?? null)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-mono text-sm font-bold tracking-tight">
                      {debt.toProfile?.full_name ?? "Sin nombre"}
                    </span>
                    <span className="ml-auto font-mono text-xs font-bold tabular-nums text-red-500">
                      -{deficit} deficit
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* What they gave you */}
                    <div className="space-y-1">
                      <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                        Te dio
                      </p>
                      {debt.reactionsReceived > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Heart className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono text-xs tabular-nums text-red-500 font-bold">
                            {debt.reactionsReceived} reacciones
                          </span>
                        </div>
                      )}
                      {debt.shoutoutsReceived > 0 && (
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono text-xs tabular-nums text-red-500 font-bold">
                            {debt.shoutoutsReceived} shoutouts
                          </span>
                        </div>
                      )}
                      {debt.verificationsReceived > 0 && (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono text-xs tabular-nums text-red-500 font-bold">
                            {debt.verificationsReceived} verificaciones
                          </span>
                        </div>
                      )}
                      {debt.votesReceived > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Gavel className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono text-xs tabular-nums text-red-500 font-bold">
                            {debt.votesReceived} votos a favor
                          </span>
                        </div>
                      )}
                      {debt.totalReceived === 0 && (
                        <span className="font-mono text-[10px] text-muted-foreground">Nada</span>
                      )}
                    </div>
                    {/* What you gave them */}
                    <div className="space-y-1">
                      <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                        Tu le diste
                      </p>
                      {debt.reactionsGiven > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Heart className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono text-xs tabular-nums text-green-600 dark:text-green-400">
                            {debt.reactionsGiven} reacciones
                          </span>
                        </div>
                      )}
                      {debt.shoutoutsGiven > 0 && (
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono text-xs tabular-nums text-green-600 dark:text-green-400">
                            {debt.shoutoutsGiven} shoutouts
                          </span>
                        </div>
                      )}
                      {debt.verificationsGiven > 0 && (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono text-xs tabular-nums text-green-600 dark:text-green-400">
                            {debt.verificationsGiven} verificaciones
                          </span>
                        </div>
                      )}
                      {debt.votesGiven > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Gavel className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono text-xs tabular-nums text-green-600 dark:text-green-400">
                            {debt.votesGiven} votos a favor
                          </span>
                        </div>
                      )}
                      {debt.totalGiven === 0 && (
                        <span className="font-mono text-[10px] text-red-500 font-bold">
                          0 — Nada
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Leaderboard                                                */}
      {/* ══════════════════════════════════════════════════════════ */}
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
        Leaderboard &mdash; deudores primero
      </p>

      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <ArrowRightLeft className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            No hay datos de reciprocidad aun.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((m) => {
            const isMe = m.userId === userId;
            const isExpanded = expandedUser === m.userId;
            const badgeColor =
              m.badge === "DEUDOR"
                ? "text-red-500 border-red-500/30 bg-red-500/10"
                : m.badge === "EQUILIBRADO"
                  ? "text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10"
                  : "text-primary border-primary/30 bg-primary/10";

            const indexColor =
              m.badge === "DEUDOR"
                ? "text-red-500"
                : m.badge === "EQUILIBRADO"
                  ? "text-green-600 dark:text-green-400"
                  : "text-primary";

            return (
              <div
                key={m.userId}
                className={cn(
                  "border transition-colors",
                  isMe && "border-primary/40 bg-primary/3",
                  !isMe && "border-border hover:border-primary/30"
                )}
              >
                {/* Main row */}
                <button
                  onClick={() => setExpandedUser(isExpanded ? null : m.userId)}
                  className="w-full p-4 text-left cursor-pointer"
                >
                  <div className="flex items-start gap-3">
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
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={cn(
                            "font-mono text-[10px] font-bold tracking-[0.15em] uppercase px-1.5 py-0.5 border",
                            badgeColor
                          )}
                        >
                          {m.badge}
                        </span>
                      </div>

                      {/* Given/received stats */}
                      <div className="mt-2 flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <ArrowRight className="w-3 h-3 text-green-600 dark:text-green-400" />
                          <span className="font-mono text-[10px] tabular-nums text-green-600 dark:text-green-400">
                            {m.totalGiven} dado
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ArrowRight className="w-3 h-3 text-red-500 rotate-180" />
                          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                            {m.totalReceived} recibido
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Big index */}
                    <div className="text-right shrink-0">
                      <p className={cn("text-3xl font-mono font-black tabular-nums tracking-tight", indexColor)}>
                        {m.index}%
                      </p>
                      <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                        reciprocidad
                      </p>
                    </div>
                  </div>
                </button>

                {/* Expanded: per-person breakdown */}
                {isExpanded && m.debts.length > 0 && (
                  <div className="border-t border-border px-4 pb-4 pt-3">
                    <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
                      Desglose por persona
                    </p>
                    <div className="space-y-2">
                      {m.debts.map((debt) => {
                        const deficit = debt.totalReceived - debt.totalGiven;
                        const isDebt = deficit > 0;
                        return (
                          <div
                            key={debt.toUserId}
                            className={cn(
                              "flex items-center gap-3 p-2 border",
                              isDebt ? "border-red-500/20 bg-red-500/5" : "border-border"
                            )}
                          >
                            <Avatar className="w-6 h-6 ring-1 ring-border shrink-0">
                              <AvatarImage src={debt.toProfile?.avatar_url ?? undefined} />
                              <AvatarFallback className="font-mono text-[9px]">
                                {getInitials(debt.toProfile?.full_name ?? null)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-mono text-xs font-bold tracking-tight flex-1 min-w-0 truncate">
                              {debt.toProfile?.full_name ?? "Sin nombre"}
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="font-mono text-[10px] tabular-nums text-green-600 dark:text-green-400">
                                {debt.totalGiven}
                                <ArrowRight className="w-3 h-3 inline ml-0.5" />
                              </span>
                              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                                <ArrowRight className="w-3 h-3 inline mr-0.5 rotate-180" />
                                {debt.totalReceived}
                              </span>
                              {isDebt && (
                                <span className="font-mono text-[10px] font-bold tabular-nums text-red-500">
                                  -{deficit}
                                </span>
                              )}
                              {!isDebt && deficit < 0 && (
                                <span className="font-mono text-[10px] font-bold tabular-nums text-green-600 dark:text-green-400">
                                  +{Math.abs(deficit)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {isExpanded && m.debts.length === 0 && (
                  <div className="border-t border-border px-4 pb-4 pt-3">
                    <p className="font-mono text-[10px] text-muted-foreground">
                      Sin interacciones registradas en los ultimos 30 dias.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Team Heatmap                                               */}
      {/* ══════════════════════════════════════════════════════════ */}
      {members.length > 1 && (
        <div className="mt-8">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Heatmap &mdash; quien da a quien
          </p>
          <div className="border border-border overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="p-2 border-b border-r border-border">
                    <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted-foreground">
                      De / A
                    </span>
                  </th>
                  {members.map((m) => (
                    <th key={m.userId} className="p-2 border-b border-border text-center min-w-[48px]">
                      <Avatar className="w-6 h-6 ring-1 ring-border mx-auto">
                        <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="font-mono text-[8px]">
                          {getInitials(m.profile?.full_name ?? null)}
                        </AvatarFallback>
                      </Avatar>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((fromMember) => (
                  <tr key={fromMember.userId}>
                    <td className="p-2 border-r border-border">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-5 h-5 ring-1 ring-border shrink-0">
                          <AvatarImage src={fromMember.profile?.avatar_url ?? undefined} />
                          <AvatarFallback className="font-mono text-[7px]">
                            {getInitials(fromMember.profile?.full_name ?? null)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-mono text-[10px] tracking-tight truncate max-w-[60px]">
                          {fromMember.profile?.full_name?.split(" ")[0] ?? "?"}
                        </span>
                      </div>
                    </td>
                    {members.map((toMember) => {
                      if (fromMember.userId === toMember.userId) {
                        return (
                          <td key={toMember.userId} className="p-2 text-center border-border bg-accent/20">
                            <span className="font-mono text-[10px] text-muted-foreground">&mdash;</span>
                          </td>
                        );
                      }
                      const debt = fromMember.debts.find((d) => d.toUserId === toMember.userId);
                      const given = debt?.totalGiven ?? 0;
                      return (
                        <td
                          key={toMember.userId}
                          className={cn(
                            "p-2 text-center",
                            given === 0 && "bg-red-500/5",
                            given > 0 && given <= 3 && "bg-green-500/10",
                            given > 3 && given <= 8 && "bg-green-500/20",
                            given > 8 && "bg-green-500/30"
                          )}
                        >
                          <span className={cn(
                            "font-mono text-xs font-bold tabular-nums",
                            given === 0 ? "text-red-500" : "text-green-600 dark:text-green-400"
                          )}>
                            {given}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="font-mono text-[8px] tracking-[0.1em] text-muted-foreground mt-2">
            Filas = quien da. Columnas = quien recibe. Celdas rojas = 0 interacciones.
          </p>
        </div>
      )}

      {/* Bottom */}
      <div className="mt-10 text-center py-6 border-t border-border/30">
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
          La reciprocidad no se pide. Se mide.
        </p>
      </div>
    </div>
  );
}
