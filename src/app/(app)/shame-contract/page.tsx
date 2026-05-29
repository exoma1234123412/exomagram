"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  Loader2,
  MessageSquareOff,
  FileX,
  ScrollText,
  Send,
  ShieldAlert,
} from "lucide-react";
import { format, subDays, isWeekend } from "date-fns";
import { es } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ViolationType = "broken_promise" | "missed_standup" | "no_closeout";

interface Violation {
  userId: string;
  profile: Profile | null;
  type: ViolationType;
  date: string;
  detail: string | null;
  hasExplanation: boolean;
  explanationId: string | null;
  explanationText: string | null;
  explanationAt: string | null;
}

const VIOLATION_LABELS: Record<ViolationType, { label: string; icon: typeof AlertTriangle }> = {
  broken_promise: { label: "Promesa rota", icon: ScrollText },
  missed_standup: { label: "Standup perdido", icon: MessageSquareOff },
  no_closeout: { label: "Sin cierre del dia", icon: FileX },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ShameContractPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  /* ---------- data loader ---------- */

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const today = getTodayMTY();
    const sevenDaysAgo = format(subDays(new Date(today + "T12:00:00"), 7), "yyyy-MM-dd");
    const workdays = getWorkdaysInRange(sevenDaysAgo, today);
    // Exclude today from violation checks (day is still in progress)
    const pastWorkdays = workdays.filter((d) => d < today);

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
      if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
    }

    // 2. Broken promises (last 7 days)
    const { data: brokenPromises } = await supabase
      .from("daily_promises")
      .select("user_id, date, title")
      .eq("org_id", orgId)
      .eq("status", "broken")
      .gte("date", sevenDaysAgo)
      .lte("date", today);

    // 3. Standups in the period
    const { data: standups } = await supabase
      .from("standups")
      .select("user_id, date")
      .eq("org_id", orgId)
      .gte("date", sevenDaysAgo)
      .lte("date", today);

    // 4. Closeouts in the period
    const { data: closeouts } = await supabase
      .from("daily_closeouts")
      .select("user_id, date")
      .eq("org_id", orgId)
      .gte("date", sevenDaysAgo)
      .lte("date", today);

    // 5. Existing shame explanations from public_feed
    const { data: shameEntries } = await supabase
      .from("public_feed")
      .select("id, target_user_id, title, body, created_at")
      .eq("org_id", orgId)
      .eq("type", "shame")
      .gte("created_at", new Date(sevenDaysAgo + "T00:00:00").toISOString());

    // Build lookup sets
    const standupSet = new Set(
      (standups ?? []).map((s) => `${s.user_id}::${s.date}`)
    );
    const closeoutSet = new Set(
      (closeouts ?? []).map((c) => `${c.user_id}::${c.date}`)
    );

    // Build shame explanation lookup: key = "userId::type::date"
    const shameMap = new Map<
      string,
      { id: string; body: string; created_at: string }
    >();
    for (const se of shameEntries ?? []) {
      // Parse the title to extract violation info
      // Title format: "CONTRATO::type::date"
      const parts = (se.title as string).split("::");
      if (parts.length === 3 && se.target_user_id) {
        const key = `${se.target_user_id}::${parts[1]}::${parts[2]}`;
        shameMap.set(key, {
          id: se.id as string,
          body: se.body as string,
          created_at: se.created_at as string,
        });
      }
    }

    // Build violations list
    const allViolations: Violation[] = [];

    // Broken promises
    for (const bp of brokenPromises ?? []) {
      const key = `${bp.user_id}::broken_promise::${bp.date}`;
      const explanation = shameMap.get(key);
      allViolations.push({
        userId: bp.user_id as string,
        profile: profileMap.get(bp.user_id as string) ?? null,
        type: "broken_promise",
        date: bp.date as string,
        detail: bp.title as string,
        hasExplanation: !!explanation,
        explanationId: explanation?.id ?? null,
        explanationText: explanation?.body ?? null,
        explanationAt: explanation?.created_at ?? null,
      });
    }

    // Missed standups
    for (const uid of userIds) {
      for (const day of pastWorkdays) {
        if (!standupSet.has(`${uid}::${day}`)) {
          const key = `${uid}::missed_standup::${day}`;
          const explanation = shameMap.get(key);
          allViolations.push({
            userId: uid,
            profile: profileMap.get(uid) ?? null,
            type: "missed_standup",
            date: day,
            detail: null,
            hasExplanation: !!explanation,
            explanationId: explanation?.id ?? null,
            explanationText: explanation?.body ?? null,
            explanationAt: explanation?.created_at ?? null,
          });
        }
      }
    }

    // Missing closeouts
    for (const uid of userIds) {
      for (const day of pastWorkdays) {
        if (!closeoutSet.has(`${uid}::${day}`)) {
          const key = `${uid}::no_closeout::${day}`;
          const explanation = shameMap.get(key);
          allViolations.push({
            userId: uid,
            profile: profileMap.get(uid) ?? null,
            type: "no_closeout",
            date: day,
            detail: null,
            hasExplanation: !!explanation,
            explanationId: explanation?.id ?? null,
            explanationText: explanation?.body ?? null,
            explanationAt: explanation?.created_at ?? null,
          });
        }
      }
    }

    // Sort: pending first, then by date descending
    allViolations.sort((a, b) => {
      if (a.hasExplanation !== b.hasExplanation) return a.hasExplanation ? 1 : -1;
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.userId.localeCompare(b.userId);
    });

    setViolations(allViolations);
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
      .channel("shame-contract-feed")
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- submit explanation ---------- */

  async function submitExplanation(violation: Violation) {
    if (!orgId || !userId) return;
    const key = `${violation.userId}::${violation.type}::${violation.date}`;
    const text = explanations[key]?.trim();
    if (!text || text.length < 20) return;

    setSubmittingId(key);

    const violationLabel = VIOLATION_LABELS[violation.type].label;
    const dateLabel = format(new Date(violation.date + "T12:00:00"), "d MMM", { locale: es });

    await supabase.from("public_feed").insert({
      org_id: orgId,
      type: "shame",
      title: `CONTRATO::${violation.type}::${violation.date}`,
      body: text,
      target_user_id: violation.userId,
      urgency: "high",
      emoji: null,
      is_ai_generated: false,
    });

    // Clear the textarea
    setExplanations((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    setSubmittingId(null);
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

  /* ---------- computed ---------- */

  const pending = violations.filter((v) => !v.hasExplanation);
  const fulfilled = violations.filter((v) => v.hasExplanation);
  const myPending = pending.filter((v) => v.userId === userId);

  /* ---------- render ---------- */

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <ShieldAlert className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Contrato de Verguenza
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Rompes un compromiso, explicas publicamente por que. Sin explicacion, no hay manana.
      </p>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Pendientes
          </p>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
            pending.length > 0 && "text-red-500"
          )}>
            {pending.length}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Cumplidos
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-green-600 dark:text-green-400">
            {fulfilled.length}
          </p>
        </div>
        <div className={cn(
          "border p-3",
          myPending.length > 0
            ? "bg-red-500/10 border-red-500/30"
            : "bg-accent/30 border-border"
        )}>
          <p className={cn(
            "font-mono text-[9px] tracking-[0.18em] uppercase",
            myPending.length > 0 ? "text-red-500/80" : "text-muted-foreground"
          )}>
            Mis pendientes
          </p>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
            myPending.length > 0 ? "text-red-500" : "text-foreground"
          )}>
            {myPending.length}
          </p>
        </div>
      </div>

      {/* ─── Pending Contracts ─────────────────── */}
      <section className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Contratos pendientes
        </p>

        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              No hay contratos pendientes. Todos cumplieron.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((v) => {
              const key = `${v.userId}::${v.type}::${v.date}`;
              const isMine = v.userId === userId;
              const VIcon = VIOLATION_LABELS[v.type].icon;

              return (
                <div
                  key={key}
                  className={cn(
                    "border p-4 transition-colors",
                    isMine
                      ? "border-2 border-red-500/50 bg-red-500/5"
                      : "border-border hover:border-primary/30"
                  )}
                >
                  {/* Violation header */}
                  <div className="flex items-start gap-3">
                    <Avatar className="w-8 h-8 ring-1 ring-border shrink-0">
                      <AvatarImage src={v.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="font-mono text-xs">
                        {getInitials(v.profile?.full_name ?? null)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono font-bold text-sm tracking-tight">
                          {v.profile?.full_name ?? "Sin nombre"}
                        </p>
                        {isMine && (
                          <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
                            (tu)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-red-500 border border-red-500/30 bg-red-500/10 px-1.5 py-0.5">
                          <VIcon className="w-3 h-3" />
                          {VIOLATION_LABELS[v.type].label}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {format(new Date(v.date + "T12:00:00"), "d MMM yyyy", { locale: es })}
                        </span>
                      </div>
                      {v.detail && (
                        <p className="text-xs text-muted-foreground mt-1.5 font-mono">
                          &quot;{v.detail}&quot;
                        </p>
                      )}
                    </div>

                    <div className="shrink-0">
                      <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-red-500 font-bold">
                        SIN EXPLICAR
                      </span>
                    </div>
                  </div>

                  {/* Explanation form — only for the violator */}
                  {isMine && (
                    <div className="mt-4 pt-3 border-t border-border">
                      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
                        Escribe tu explicacion publica
                      </p>
                      <Textarea
                        placeholder="Explica por que fallaste. Minimo 20 caracteres. Todos lo veran."
                        value={explanations[key] ?? ""}
                        onChange={(e) =>
                          setExplanations((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        rows={3}
                        className="font-mono text-sm"
                      />
                      <div className="flex items-center justify-between mt-2">
                        <p className="font-mono text-[9px] text-muted-foreground">
                          {(explanations[key] ?? "").length}/20 caracteres minimo
                        </p>
                        <Button
                          onClick={() => submitExplanation(v)}
                          disabled={
                            submittingId === key ||
                            (explanations[key] ?? "").trim().length < 20
                          }
                          className="bg-primary font-mono text-xs gap-1.5"
                          size="sm"
                        >
                          {submittingId === key ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Send className="w-3 h-3" />
                          )}
                          Publicar explicacion
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Fulfilled Contracts ─────────────────── */}
      <section className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Contratos cumplidos &mdash; ultimos 7 dias
        </p>

        {fulfilled.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <FileWarning className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              Nadie ha explicado nada aun.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {fulfilled.map((v) => {
              const key = `${v.userId}::${v.type}::${v.date}`;
              const VIcon = VIOLATION_LABELS[v.type].icon;

              return (
                <div
                  key={key}
                  className="border border-border p-4 transition-colors hover:border-primary/30"
                >
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <Avatar className="w-8 h-8 ring-1 ring-border shrink-0">
                      <AvatarImage src={v.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="font-mono text-xs">
                        {getInitials(v.profile?.full_name ?? null)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono font-bold text-sm tracking-tight">
                          {v.profile?.full_name ?? "Sin nombre"}
                        </p>
                        <span className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-amber-600 dark:text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5">
                          <VIcon className="w-3 h-3" />
                          {VIOLATION_LABELS[v.type].label}
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                        {format(new Date(v.date + "T12:00:00"), "d MMM yyyy", { locale: es })}
                        {v.detail && <> &mdash; &quot;{v.detail}&quot;</>}
                      </p>
                    </div>

                    <div className="shrink-0">
                      <span className="flex items-center gap-1 font-mono text-[9px] tracking-[0.15em] uppercase text-green-600 dark:text-green-400 font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        EXPLICADO
                      </span>
                    </div>
                  </div>

                  {/* Explanation body */}
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-sm text-foreground leading-relaxed">
                      {v.explanationText}
                    </p>
                    {v.explanationAt && (
                      <p className="font-mono text-[9px] text-muted-foreground mt-2">
                        Publicado {format(new Date(v.explanationAt), "d MMM yyyy HH:mm", { locale: es })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Bottom */}
      <div className="mt-10 text-center py-6 border-t border-border/30">
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
          Fallas, explicas. No hay atajos.
        </p>
      </div>
    </div>
  );
}
