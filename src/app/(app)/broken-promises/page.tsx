"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skull, ScrollText, Trophy, AlertTriangle } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface BrokenPromise {
  id: string;
  user_id: string;
  date: string;
  title: string;
  created_at: string;
  profile: Profile | null;
}

interface InfamyEntry {
  userId: string;
  profile: Profile | null;
  count: number;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function BrokenPromisesPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [promises, setPromises] = useState<BrokenPromise[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------- data loader ---------- */

  const loadData = useCallback(async () => {
    if (!orgId) return;

    // 1. All org members with profiles
    const { data: orgMembers } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    const profileMap = new Map<string, Profile>();
    for (const m of orgMembers ?? []) {
      if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
    }

    // 2. ALL broken promises — no date filter, permanent record
    const { data: broken } = await supabase
      .from("daily_promises")
      .select("id, user_id, date, title, created_at")
      .eq("org_id", orgId)
      .eq("status", "broken")
      .order("date", { ascending: false });

    const result: BrokenPromise[] = (broken ?? []).map((p) => ({
      id: p.id,
      user_id: p.user_id,
      date: p.date,
      title: p.title,
      created_at: p.created_at,
      profile: profileMap.get(p.user_id) ?? null,
    }));

    setPromises(result);
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

  /* ---------- real-time subscription ---------- */

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("broken-promises")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_promises",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
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

  /* ---------- computed data ---------- */

  // Hall of Infamy leaderboard — count per person
  const infamyMap = new Map<string, { count: number; profile: Profile | null }>();
  for (const p of promises) {
    const existing = infamyMap.get(p.user_id);
    if (existing) {
      existing.count++;
    } else {
      infamyMap.set(p.user_id, { count: 1, profile: p.profile });
    }
  }

  const infamyLeaderboard: InfamyEntry[] = Array.from(infamyMap.entries())
    .map(([uid, data]) => ({
      userId: uid,
      profile: data.profile,
      count: data.count,
    }))
    .sort((a, b) => b.count - a.count);

  const totalBroken = promises.length;
  const uniqueOffenders = infamyLeaderboard.length;
  const worstOffender = infamyLeaderboard.length > 0 ? infamyLeaderboard[0] : null;

  /* ---------- helper ---------- */

  function daysAgoLabel(dateStr: string): string {
    const days = differenceInDays(new Date(), new Date(dateStr + "T12:00:00"));
    if (days === 0) return "hoy";
    if (days === 1) return "ayer";
    return `hace ${days} dias`;
  }

  /* ---------- render ---------- */

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <Skull className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Muro de Promesas Rotas
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Registro permanente. Sin eliminacion. Sin olvido. Cada palabra queda grabada.
      </p>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Total promesas rotas
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
            {totalBroken}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Personas con rotas
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
            {uniqueOffenders}
          </p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 p-3 col-span-2 sm:col-span-1">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500">
            Mayor infractor
          </p>
          <p className="text-sm font-mono font-bold tracking-tight mt-1 text-red-500 truncate">
            {worstOffender?.profile?.full_name ?? "---"}
          </p>
          {worstOffender && (
            <p className="font-mono text-[10px] text-red-500/80 mt-0.5">
              {worstOffender.count} {worstOffender.count === 1 ? "promesa rota" : "promesas rotas"}
            </p>
          )}
        </div>
      </div>

      {/* Hall of Infamy */}
      {infamyLeaderboard.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Hall of Infamy &mdash; Leaderboard
            </p>
          </div>
          <div className="space-y-1">
            {infamyLeaderboard.map((entry, idx) => {
              const isMe = entry.userId === userId;
              return (
                <div
                  key={entry.userId}
                  className={cn(
                    "flex items-center gap-3 p-2.5 border border-border transition-colors duration-200 hover:border-primary/30",
                    idx === 0 && "border-red-500/40 bg-red-500/5"
                  )}
                >
                  {/* Rank */}
                  <span
                    className={cn(
                      "font-mono font-bold tabular-nums text-sm w-6 text-center shrink-0",
                      idx === 0 && "text-red-500",
                      idx === 1 && "text-red-400",
                      idx === 2 && "text-amber-500",
                      idx > 2 && "text-muted-foreground"
                    )}
                  >
                    #{idx + 1}
                  </span>

                  {/* Avatar */}
                  <Avatar className="w-7 h-7 ring-1 ring-border shrink-0">
                    <AvatarImage src={entry.profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="font-mono text-[10px]">
                      {getInitials(entry.profile?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-bold tracking-tight truncate">
                      {entry.profile?.full_name ?? "Sin nombre"}
                      {isMe && (
                        <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase ml-2">
                          (tu)
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Count */}
                  <div className="text-right shrink-0">
                    <span
                      className={cn(
                        "font-mono font-black tabular-nums tracking-tight text-lg",
                        idx === 0 && "text-red-500",
                        idx > 0 && "text-foreground"
                      )}
                    >
                      {entry.count}
                    </span>
                    <p className="font-mono text-[8px] tracking-[0.12em] uppercase text-muted-foreground">
                      {entry.count === 1 ? "rota" : "rotas"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section label */}
      <div className="flex items-center gap-2 mb-3">
        <ScrollText className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
          Registro completo &mdash; todas las promesas rotas
        </p>
      </div>

      {/* Broken promise cards */}
      {promises.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <ScrollText className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            No hay promesas rotas registradas. Aun.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {promises.map((p) => {
            const isMe = p.user_id === userId;
            const formattedDate = format(
              new Date(p.date + "T12:00:00"),
              "d MMM yyyy",
              { locale: es }
            );
            const ago = daysAgoLabel(p.date);

            return (
              <div
                key={p.id}
                className="border border-border p-4 transition-colors duration-200 hover:border-primary/30 relative"
              >
                {/* PROMESA ROTA stamp */}
                <div className="absolute top-3 right-3">
                  <span className="bg-red-600 text-white font-mono text-[9px] tracking-widest uppercase px-2 py-0.5 select-none">
                    PROMESA ROTA
                  </span>
                </div>

                {/* User info */}
                <div className="flex items-center gap-2.5 mb-3">
                  <Avatar className="w-8 h-8 ring-1 ring-border shrink-0">
                    <AvatarImage src={p.profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="font-mono text-[10px]">
                      {getInitials(p.profile?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-mono text-sm font-bold tracking-tight">
                      {p.profile?.full_name ?? "Sin nombre"}
                      {isMe && (
                        <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase ml-2">
                          (tu)
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {formattedDate}
                      </p>
                      <span className="text-muted-foreground/60">·</span>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {ago}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Promise text — the exact words */}
                <div className="pl-10">
                  <p className="font-mono text-sm italic text-foreground leading-relaxed">
                    &ldquo;{p.title}&rdquo;
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom oppressive message */}
      <div className="mt-10 text-center py-6 border-t border-border/30">
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
          Las promesas no se borran. Las palabras quedan. La confianza se destruye.
        </p>
      </div>
    </div>
  );
}
