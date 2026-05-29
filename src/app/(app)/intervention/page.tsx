"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Send,
  ShieldAlert,
  TrendingUp,
  Users,
  UserX,
  MessageSquare,
  Clock,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Intervention {
  id: string;
  target_user_id: string;
  org_id: string;
  triggered_at: string;
  status: "active" | "acknowledged";
  feedbacks: { from_user_id: string; message: string; created_at: string }[];
}

interface InterventionTarget {
  userId: string;
  profile: Profile | null;
  currentScore: number;
  lowestScore: number;
  daysBelow60: number;
  feedbacks: FeedbackMessage[];
}

interface FeedbackMessage {
  id: string;
  fromUserId: string;
  fromProfile: Profile | null;
  message: string;
  createdAt: string;
}

interface RecoveredMember {
  userId: string;
  profile: Profile | null;
  lowestScore: number;
  currentScore: number;
  recoveredAt: string;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function InterventionPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [targets, setTargets] = useState<InterventionTarget[]>([]);
  const [recovered, setRecovered] = useState<RecoveredMember[]>([]);
  const [feedbackInputs, setFeedbackInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());

  // Stats
  const [totalInterventions, setTotalInterventions] = useState(0);
  const [mostIntervened, setMostIntervened] = useState<{ name: string; count: number } | null>(null);

  /* ---------- data loader ---------- */

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const today = getTodayMTY();
    const sevenDaysAgo = format(subDays(new Date(today + "T12:00:00"), 7), "yyyy-MM-dd");

    // 1. All org members with profiles
    const { data: orgMembers } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    if (!orgMembers) {
      setLoading(false);
      return;
    }

    const pMap = new Map<string, Profile>();
    for (const m of orgMembers) {
      if (m.profiles) pMap.set(m.user_id, m.profiles as unknown as Profile);
    }
    setProfileMap(pMap);

    // 2. Trust score history for last 7 days
    const { data: trustHistory } = await supabase
      .from("trust_score_history")
      .select("user_id, date, score")
      .eq("org_id", orgId)
      .gte("date", sevenDaysAgo)
      .order("date", { ascending: false });

    // 3. Feedback messages from public_feed (type = "warning", with target_user_id)
    const { data: feedItems } = await supabase
      .from("public_feed")
      .select("*")
      .eq("org_id", orgId)
      .eq("type", "warning")
      .not("target_user_id", "is", null)
      .order("created_at", { ascending: false });

    // Build trust data per user
    const userScores = new Map<string, { scores: { date: string; score: number }[]; current: number; lowest: number; daysBelow: number }>();

    for (const entry of trustHistory ?? []) {
      const uid = entry.user_id as string;
      if (!userScores.has(uid)) {
        userScores.set(uid, { scores: [], current: 0, lowest: 100, daysBelow: 0 });
      }
      const data = userScores.get(uid)!;
      const score = entry.score as number;
      data.scores.push({ date: entry.date as string, score });
      if (data.scores.length === 1) data.current = score; // first = most recent (ordered desc)
      if (score < data.lowest) data.lowest = score;
      if (score < 60) data.daysBelow++;
    }

    // Build feedback map: target_user_id -> messages
    const feedbackMap = new Map<string, FeedbackMessage[]>();
    for (const item of feedItems ?? []) {
      const targetId = item.target_user_id as string;
      if (!feedbackMap.has(targetId)) feedbackMap.set(targetId, []);
      // Parse body — format: "INTERVENCIÓN|from_user_id|message"
      const body = item.body as string;
      const parts = body.split("|");
      if (parts.length >= 3 && parts[0] === "INTERVENCIÓN") {
        feedbackMap.get(targetId)!.push({
          id: item.id as string,
          fromUserId: parts[1],
          fromProfile: pMap.get(parts[1]) ?? null,
          message: parts.slice(2).join("|"),
          createdAt: item.created_at as string,
        });
      }
    }

    // Classify: active interventions (current score < 60) vs recovered
    const activeTargets: InterventionTarget[] = [];
    const recoveredMembers: RecoveredMember[] = [];
    let totalCount = 0;
    const interventionCounts = new Map<string, number>();

    for (const [uid, data] of userScores) {
      if (data.daysBelow > 0) {
        totalCount++;
        interventionCounts.set(uid, (interventionCounts.get(uid) ?? 0) + data.daysBelow);

        if (data.current < 60) {
          activeTargets.push({
            userId: uid,
            profile: pMap.get(uid) ?? null,
            currentScore: data.current,
            lowestScore: data.lowest,
            daysBelow60: data.daysBelow,
            feedbacks: feedbackMap.get(uid) ?? [],
          });
        } else if (data.lowest < 60) {
          recoveredMembers.push({
            userId: uid,
            profile: pMap.get(uid) ?? null,
            lowestScore: data.lowest,
            currentScore: data.current,
            recoveredAt: data.scores[0]?.date ?? today,
          });
        }
      }
    }

    // Sort active by worst score first
    activeTargets.sort((a, b) => a.currentScore - b.currentScore);
    recoveredMembers.sort((a, b) => a.lowestScore - a.currentScore > b.lowestScore - b.currentScore ? -1 : 1);

    // Find most intervened
    let maxIntervened: { name: string; count: number } | null = null;
    for (const [uid, count] of interventionCounts) {
      if (!maxIntervened || count > maxIntervened.count) {
        maxIntervened = { name: pMap.get(uid)?.full_name ?? "Desconocido", count };
      }
    }

    setTargets(activeTargets);
    setRecovered(recoveredMembers);
    setTotalInterventions(totalCount);
    setMostIntervened(maxIntervened);
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

  /* ---------- real-time: refresh on new feed items ---------- */

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("intervention-feed")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "public_feed",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trust_score_history",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- submit feedback ---------- */

  async function submitFeedback(targetUserId: string) {
    const message = feedbackInputs[targetUserId]?.trim();
    if (!message || !orgId || !userId) return;

    setSubmitting((prev) => ({ ...prev, [targetUserId]: true }));

    const targetProfile = profileMap.get(targetUserId);
    const myProfile = profileMap.get(userId);

    await supabase.from("public_feed").insert({
      org_id: orgId,
      type: "warning",
      title: `Feedback de intervención para ${targetProfile?.full_name ?? "miembro"}`,
      body: `INTERVENCIÓN|${userId}|${message}`,
      target_user_id: targetUserId,
      urgency: "critical",
      emoji: null,
      is_ai_generated: false,
    });

    setFeedbackInputs((prev) => ({ ...prev, [targetUserId]: "" }));
    setSubmitting((prev) => ({ ...prev, [targetUserId]: false }));
    loadData();
  }

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

  /* ---------- render ---------- */

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <ShieldAlert className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Intervenci&oacute;n Grupal
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Trust Score &lt; 60 activa intervenci&oacute;n obligatoria. Feedback permanente y p&uacute;blico. Sin escapatoria.
      </p>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Intervenciones activas
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-red-500">
            {targets.length}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Total hist&oacute;rico (7d)
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
            {totalInterventions}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Recuperados
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-green-600 dark:text-green-400">
            {recovered.length}
          </p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/60">
            M&aacute;s intervenido
          </p>
          <p className="text-sm font-mono font-bold tracking-tight mt-1 text-red-500 truncate">
            {mostIntervened?.name ?? "---"}
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ACTIVE INTERVENTIONS                                    */}
      {/* ═══════════════════════════════════════════════════════ */}

      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
        Intervenciones activas &mdash; Trust Score &lt; 60
      </p>

      {targets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 mb-8">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <Users className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            Nadie bajo intervenci&oacute;n. Todos por encima de 60.
          </p>
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          {targets.map((target) => {
            const isMe = target.userId === userId;
            const alreadySubmitted = target.feedbacks.some((f) => f.fromUserId === userId);

            return (
              <div
                key={target.userId}
                className="border-2 border-red-500/50 animate-danger-pulse"
              >
                {/* Target header */}
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <Avatar className="w-12 h-12 sm:w-14 sm:h-14 ring-1 ring-red-500/40 shrink-0">
                      <AvatarImage src={target.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="font-mono text-sm bg-red-500/20 text-red-500">
                        {getInitials(target.profile?.full_name ?? null)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono font-bold tracking-tight text-lg sm:text-xl text-red-500">
                          {target.profile?.full_name ?? "Sin nombre"}
                        </p>
                        {isMe && (
                          <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
                            (t&uacute;)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border text-red-500 border-red-500/40 bg-red-500/10">
                          BAJO INTERVENCI&Oacute;N
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {target.daysBelow60} {target.daysBelow60 === 1 ? "d&iacute;a" : "d&iacute;as"} bajo 60
                        </span>
                      </div>
                    </div>

                    {/* Trust score — big red number */}
                    <div className="text-right shrink-0">
                      <p className="text-3xl font-mono font-black tabular-nums tracking-tight text-red-500">
                        {target.currentScore}
                      </p>
                      <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                        Trust Score
                      </p>
                    </div>
                  </div>
                </div>

                {/* Feedback messages */}
                {target.feedbacks.length > 0 && (
                  <div className="border-t border-red-500/20">
                    <div className="p-4 sm:p-5 space-y-2">
                      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
                        Feedback del equipo ({target.feedbacks.length})
                      </p>
                      {target.feedbacks.map((fb) => (
                        <div
                          key={fb.id}
                          className="border border-border p-3 flex items-start gap-3"
                        >
                          <Avatar className="w-7 h-7 ring-1 ring-border shrink-0">
                            <AvatarImage src={fb.fromProfile?.avatar_url ?? undefined} />
                            <AvatarFallback className="font-mono text-[10px]">
                              {getInitials(fb.fromProfile?.full_name ?? null)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-xs font-bold tracking-tight">
                                {fb.fromProfile?.full_name ?? "Desconocido"}
                              </p>
                              <span className="font-mono text-[9px] text-muted-foreground">
                                {format(new Date(fb.createdAt), "d MMM, H:mm", { locale: es })}
                              </span>
                            </div>
                            <p className="text-sm text-foreground mt-1">
                              {fb.message}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input — only if not the target and hasn't submitted yet */}
                {!isMe && (
                  <div className="border-t border-red-500/20 p-4 sm:p-5">
                    {alreadySubmitted ? (
                      <p className="font-mono text-[10px] text-muted-foreground tracking-wide">
                        Ya enviaste feedback para esta intervenci&oacute;n.
                      </p>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Escribe tu feedback obligatorio..."
                          value={feedbackInputs[target.userId] ?? ""}
                          onChange={(e) =>
                            setFeedbackInputs((prev) => ({
                              ...prev,
                              [target.userId]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              submitFeedback(target.userId);
                            }
                          }}
                          className="flex-1 font-mono text-xs"
                        />
                        <Button
                          onClick={() => submitFeedback(target.userId)}
                          disabled={
                            !feedbackInputs[target.userId]?.trim() ||
                            submitting[target.userId]
                          }
                          className="bg-primary font-mono text-xs gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Enviar
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* If it's the target user, they see a message */}
                {isMe && (
                  <div className="border-t border-red-500/20 p-4 sm:p-5 bg-red-500/5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <p className="font-mono text-xs text-red-500">
                        Est&aacute;s bajo intervenci&oacute;n. Lee el feedback de tu equipo. No puedes ignorarlo.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* RECOVERED                                               */}
      {/* ═══════════════════════════════════════════════════════ */}

      {recovered.length > 0 && (
        <>
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Recuperados &mdash; cayeron bajo 60 pero se recuperaron
          </p>

          <div className="space-y-2 mb-8">
            {recovered.map((r) => (
              <div
                key={r.userId}
                className="border border-green-500/30 p-3 sm:p-4 flex items-center gap-3"
              >
                <Avatar className="w-9 h-9 ring-1 ring-border shrink-0">
                  <AvatarImage src={r.profile?.avatar_url ?? undefined} />
                  <AvatarFallback className="font-mono text-xs">
                    {getInitials(r.profile?.full_name ?? null)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-bold tracking-tight">
                    {r.profile?.full_name ?? "Sin nombre"}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {r.lowestScore} &rarr; {r.currentScore}
                    </span>
                    <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10">
                      RECUPERADO
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-xl font-mono font-bold tabular-nums tracking-tight text-green-600 dark:text-green-400">
                    {r.currentScore}
                  </p>
                  <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                    actual
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bottom oppressive message */}
      <div className="mt-10 text-center py-6 border-t border-border/30">
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60">
          La intervenci&oacute;n es p&uacute;blica. El feedback es permanente. Todos participan o todos caen.
        </p>
      </div>
    </div>
  );
}
