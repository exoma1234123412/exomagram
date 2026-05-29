"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, RoulettePairing, TimeEntry } from "@/lib/types/database";
import { CATEGORIES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Shuffle,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Zap,
  Target,
  Timer,
  ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberProfile {
  user_id: string;
  profile: Profile;
}

interface EnrichedPairing extends RoulettePairing {
  profile_a: Profile | null;
  profile_b: Profile | null;
  entry_a: TimeEntry | null;
  entry_b: TimeEntry | null;
}

// ---------------------------------------------------------------------------
// Spin Slot Machine Component
// ---------------------------------------------------------------------------

function SpinSlot({
  names,
  finalName,
  spinning,
  duration,
}: {
  names: string[];
  finalName: string;
  spinning: boolean;
  duration: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayName, setDisplayName] = useState(finalName || names[0] || "...");

  useEffect(() => {
    if (!spinning || names.length === 0) {
      setDisplayName(finalName);
      return;
    }

    let idx = 0;
    const totalTicks = Math.floor(duration / 60);
    let tick = 0;

    const interval = setInterval(() => {
      tick++;
      idx = (idx + 1) % names.length;
      setDisplayName(names[idx]);

      if (tick >= totalTicks) {
        clearInterval(interval);
        setDisplayName(finalName);
      }
    }, 60 + tick * 2);

    return () => clearInterval(interval);
  }, [spinning, names, finalName, duration]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "text-lg font-bold text-center tabular-nums tracking-tight truncate px-2",
        spinning && "text-primary animate-pulse"
      )}
    >
      {displayName}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Countdown Timer Component
// ---------------------------------------------------------------------------

function CountdownTimer({ deadline }: { deadline: string }) {
  const [remaining, setRemaining] = useState(() => {
    const diff = new Date(deadline).getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = new Date(deadline).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(diff / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isUrgent = remaining <= 300; // last 5 minutes
  const isExpired = remaining <= 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-3 rounded-xl font-mono text-2xl font-bold tabular-nums tracking-tight transition-all duration-300",
        isExpired
          ? "bg-red-500/10 text-red-600 dark:text-red-400"
          : isUrgent
            ? "bg-red-500/10 text-red-600 dark:text-red-400 animate-pulse"
            : "bg-accent/40 text-foreground"
      )}
    >
      <Timer
        className={cn(
          "w-5 h-5",
          isExpired
            ? "text-red-500"
            : isUrgent
              ? "text-red-500 animate-pulse"
              : "text-primary"
        )}
      />
      {isExpired ? (
        <span className="text-base font-semibold">Tiempo agotado</span>
      ) : (
        <span>
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function RoulettePage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();
  const today = getTodayMTY();

  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [activePairing, setActivePairing] = useState<EnrichedPairing | null>(null);
  const [pastPairings, setPastPairings] = useState<EnrichedPairing[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalRounds: 0,
    successRate: 0,
    avgResponseMinutes: 0,
    mostPaired: null as { name: string; count: number } | null,
  });

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const enrichPairing = useCallback(
    async (
      pairing: RoulettePairing,
      profileMap: Map<string, Profile>
    ): Promise<EnrichedPairing> => {
      const profileA = profileMap.get(pairing.user_a) ?? null;
      const profileB = profileMap.get(pairing.user_b) ?? null;

      // Get latest time entry for each user
      const [{ data: entryA }, { data: entryB }] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*")
          .eq("user_id", pairing.user_a)
          .eq("org_id", pairing.org_id)
          .order("date", { ascending: false })
          .order("hour", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("time_entries")
          .select("*")
          .eq("user_id", pairing.user_b)
          .eq("org_id", pairing.org_id)
          .order("date", { ascending: false })
          .order("hour", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      return {
        ...pairing,
        profile_a: profileA,
        profile_b: profileB,
        entry_a: entryA as TimeEntry | null,
        entry_b: entryB as TimeEntry | null,
      };
    },
    [supabase]
  );

  const loadData = useCallback(async () => {
    if (!orgId) return;

    // Load members
    const { data: memberData } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    const profileMap = new Map<string, Profile>();
    const memberProfiles: MemberProfile[] = [];
    if (memberData) {
      for (const m of memberData) {
        const p = m.profiles as unknown as Profile;
        profileMap.set(m.user_id, p);
        memberProfiles.push({ user_id: m.user_id, profile: p });
      }
    }
    setMembers(memberProfiles);

    // Load today's active pairing (not yet both verified, not expired more than 30 min)
    const { data: todayPairings } = await supabase
      .from("roulette_pairings")
      .select("*")
      .eq("org_id", orgId)
      .eq("date", today)
      .order("created_at", { ascending: false });

    if (todayPairings && todayPairings.length > 0) {
      // Find the latest active one (has deadline, not both verified yet)
      const active = todayPairings.find(
        (p: RoulettePairing) =>
          p.triggered_at && !(p.user_a_verified && p.user_b_verified)
      );
      if (active) {
        const enriched = await enrichPairing(active as RoulettePairing, profileMap);
        setActivePairing(enriched);
      }

      // Completed pairings for today
      const completed = todayPairings.filter(
        (p: RoulettePairing) =>
          p.user_a_verified && p.user_b_verified
      );
      const enrichedPast = await Promise.all(
        completed.map((p: RoulettePairing) => enrichPairing(p, profileMap))
      );
      setPastPairings(enrichedPast);
    }

    // Load stats from all-time pairings
    const { data: allPairings } = await supabase
      .from("roulette_pairings")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (allPairings && allPairings.length > 0) {
      const total = allPairings.length;
      const successCount = allPairings.filter(
        (p: RoulettePairing) => p.user_a_verified && p.user_b_verified
      ).length;

      // Average response time for verified pairings
      let totalResponseMinutes = 0;
      let responseCount = 0;
      for (const p of allPairings as RoulettePairing[]) {
        if (p.triggered_at && (p.user_a_verified || p.user_b_verified)) {
          // Approximate: use time between triggered_at and created_at + some buffer
          // Since we don't store verification timestamps, estimate from deadline
          if (p.deadline && p.triggered_at) {
            const deadlineMs = new Date(p.deadline).getTime();
            const triggeredMs = new Date(p.triggered_at).getTime();
            const totalWindow = (deadlineMs - triggeredMs) / 1000 / 60;
            // If both verified, average response is roughly half the window
            if (p.user_a_verified && p.user_b_verified) {
              totalResponseMinutes += totalWindow * 0.5;
              responseCount++;
            }
          }
        }
      }

      // Most paired person
      const pairCount = new Map<string, number>();
      for (const p of allPairings as RoulettePairing[]) {
        pairCount.set(p.user_a, (pairCount.get(p.user_a) ?? 0) + 1);
        pairCount.set(p.user_b, (pairCount.get(p.user_b) ?? 0) + 1);
      }
      let mostPairedId = "";
      let mostPairedCount = 0;
      for (const [uid, count] of pairCount) {
        if (count > mostPairedCount) {
          mostPairedId = uid;
          mostPairedCount = count;
        }
      }
      const mostPairedProfile = profileMap.get(mostPairedId);

      setStats({
        totalRounds: total,
        successRate: total > 0 ? Math.round((successCount / total) * 100) : 0,
        avgResponseMinutes:
          responseCount > 0 ? Math.round(totalResponseMinutes / responseCount) : 0,
        mostPaired: mostPairedProfile
          ? { name: mostPairedProfile.full_name ?? mostPairedProfile.email, count: mostPairedCount }
          : null,
      });
    }

    setLoading(false);
  }, [orgId, supabase, today, enrichPairing]);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }
    loadData();
  }, [orgLoading, orgId, userId, loadData]);

  // Real-time subscription
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel("roulette_pairings_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "roulette_pairings",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, supabase, loadData]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function handleSpin() {
    if (!orgId || !userId || members.length < 2) return;

    setSpinning(true);

    // Pick 2 random, different members
    const shuffled = [...members].sort(() => Math.random() - 0.5);
    const pickedA = shuffled[0];
    const pickedB = shuffled[1];

    // Wait for the spin animation (2.5 seconds)
    await new Promise((r) => setTimeout(r, 2500));

    const now = new Date();
    const deadline = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes

    const { data: newPairing, error } = await supabase
      .from("roulette_pairings")
      .insert({
        org_id: orgId,
        date: today,
        user_a: pickedA.user_id,
        user_b: pickedB.user_id,
        triggered_at: now.toISOString(),
        deadline: deadline.toISOString(),
        user_a_verified: false,
        user_b_verified: false,
      })
      .select()
      .single();

    setSpinning(false);

    if (newPairing && !error) {
      const profileMap = new Map<string, Profile>();
      for (const m of members) profileMap.set(m.user_id, m.profile);
      const enriched = await enrichPairing(newPairing as RoulettePairing, profileMap);
      setActivePairing(enriched);
    }
  }

  async function handleVerify(side: "a" | "b") {
    if (!activePairing || !userId) return;

    // Only the paired person can verify
    const expectedUser = side === "a" ? activePairing.user_a : activePairing.user_b;
    if (userId !== expectedUser) return;

    setVerifying(true);

    const updateField = side === "a" ? "user_a_verified" : "user_b_verified";
    await supabase
      .from("roulette_pairings")
      .update({ [updateField]: true })
      .eq("id", activePairing.id);

    setActivePairing((prev) =>
      prev ? { ...prev, [updateField]: true } : null
    );
    setVerifying(false);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function isPairingExpired(pairing: EnrichedPairing): boolean {
    if (!pairing.deadline) return false;
    return new Date(pairing.deadline).getTime() < Date.now();
  }

  function isPairingSuccess(pairing: EnrichedPairing): boolean {
    return pairing.user_a_verified && pairing.user_b_verified;
  }

  function getPairingStatus(pairing: EnrichedPairing) {
    if (isPairingSuccess(pairing)) {
      return { label: "Completado", color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/40" };
    }
    if (isPairingExpired(pairing)) {
      return { label: "Expirado", color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/40" };
    }
    return { label: "En progreso", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/40" };
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  if (loading || orgLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const memberNames = members.map((m) => m.profile.full_name ?? m.profile.email);
  const canSpin = members.length >= 2 && !spinning && !activePairing;
  const isMyPairing =
    activePairing &&
    userId &&
    (activePairing.user_a === userId || activePairing.user_b === userId);
  const mySide =
    activePairing?.user_a === userId
      ? "a"
      : activePairing?.user_b === userId
        ? "b"
        : null;
  const myVerified =
    mySide === "a"
      ? activePairing?.user_a_verified
      : mySide === "b"
        ? activePairing?.user_b_verified
        : false;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Shuffle className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Ruleta de Accountability</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Empareja a dos miembros al azar para que verifiquen el trabajo del otro en 30 minutos
        </p>
      </div>

      {/* Spin Button / Active Pairing */}
      {!activePairing && !spinning && (
        <Card className="mb-8 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-8 flex flex-col items-center gap-6">
            {members.length < 2 ? (
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Users className="w-8 h-8 text-primary" />
                </div>
                <p className="text-muted-foreground text-sm">
                  Se necesitan al menos 2 miembros para girar la ruleta
                </p>
              </div>
            ) : (
              <>
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Shuffle className="w-10 h-10 text-primary" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-semibold">
                    {members.length} miembros disponibles
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Gira la ruleta para emparejar a dos personas al azar
                  </p>
                </div>
                <Button
                  onClick={handleSpin}
                  disabled={!canSpin}
                  size="lg"
                  className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25 gap-2 text-base px-8"
                >
                  <Shuffle className="w-5 h-5" />
                  Girar Ruleta
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Spinning Animation */}
      {spinning && (
        <Card className="mb-8 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-center gap-4">
              {/* Slot A */}
              <div className="flex-1 bg-accent/40 rounded-xl p-6 border-2 border-primary/20">
                <p className="text-xs text-muted-foreground text-center mb-2 uppercase tracking-wider">
                  Jugador A
                </p>
                <SpinSlot
                  names={memberNames}
                  finalName=""
                  spinning={true}
                  duration={2500}
                />
              </div>

              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center animate-spin">
                  <Shuffle className="w-5 h-5 text-primary" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  VS
                </span>
              </div>

              {/* Slot B */}
              <div className="flex-1 bg-accent/40 rounded-xl p-6 border-2 border-primary/20">
                <p className="text-xs text-muted-foreground text-center mb-2 uppercase tracking-wider">
                  Jugador B
                </p>
                <SpinSlot
                  names={[...memberNames].reverse()}
                  finalName=""
                  spinning={true}
                  duration={2500}
                />
              </div>
            </div>

            <p className="text-center text-sm text-muted-foreground mt-4 animate-pulse">
              Seleccionando pareja al azar...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Active Pairing */}
      {activePairing && !spinning && (
        <Card className="mb-8 border-primary/20 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Ronda activa
              </div>
              {isPairingSuccess(activePairing) ? (
                <Badge variant="default" className="bg-green-600 text-white gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Completado
                </Badge>
              ) : isPairingExpired(activePairing) ? (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="w-3 h-3" />
                  Expirado
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <Clock className="w-3 h-3" />
                  En progreso
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Countdown */}
            {activePairing.deadline &&
              !isPairingSuccess(activePairing) &&
              !isPairingExpired(activePairing) && (
                <div className="flex justify-center">
                  <CountdownTimer deadline={activePairing.deadline} />
                </div>
              )}

            {/* Paired members */}
            <div className="flex items-stretch gap-4">
              {/* User A */}
              <div
                className={cn(
                  "flex-1 rounded-xl p-4 border transition-all duration-300",
                  activePairing.user_a_verified
                    ? "border-green-500/30 bg-green-50 dark:bg-green-900/10"
                    : "border-border bg-card"
                )}
              >
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="ring-2 ring-background shadow-sm">
                    <AvatarImage
                      src={activePairing.profile_a?.avatar_url ?? undefined}
                    />
                    <AvatarFallback className="text-xs">
                      {getInitials(activePairing.profile_a?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">
                      {activePairing.profile_a?.full_name ??
                        activePairing.profile_a?.email ??
                        "?"}
                    </p>
                    {activePairing.user_a_verified ? (
                      <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Verificado
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Pendiente</p>
                    )}
                  </div>
                </div>

                {/* Last entry */}
                {activePairing.entry_a ? (
                  <div className="bg-accent/40 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          "text-[10px]",
                          CATEGORIES[activePairing.entry_a.category]?.bgColor,
                          CATEGORIES[activePairing.entry_a.category]?.color
                        )}
                      >
                        {CATEGORIES[activePairing.entry_a.category]?.emoji}{" "}
                        {CATEGORIES[activePairing.entry_a.category]?.label}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">{activePairing.entry_a.title}</p>
                    {activePairing.entry_a.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {activePairing.entry_a.description}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {activePairing.entry_a.date} &middot;{" "}
                      {activePairing.entry_a.hour}:00
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Sin entradas recientes
                  </p>
                )}

                {/* Verify button */}
                {mySide === "a" &&
                  !myVerified &&
                  !isPairingExpired(activePairing) && (
                    <Button
                      onClick={() => handleVerify("a")}
                      disabled={verifying}
                      className="w-full mt-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25 gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {verifying ? "Verificando..." : "Verificar"}
                    </Button>
                  )}
              </div>

              {/* VS divider */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-accent/40 flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-muted-foreground rotate-0" />
                </div>
                <span className="text-[10px] text-muted-foreground font-bold mt-1">
                  VS
                </span>
                <div className="w-10 h-10 rounded-full bg-accent/40 flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-muted-foreground rotate-180" />
                </div>
              </div>

              {/* User B */}
              <div
                className={cn(
                  "flex-1 rounded-xl p-4 border transition-all duration-300",
                  activePairing.user_b_verified
                    ? "border-green-500/30 bg-green-50 dark:bg-green-900/10"
                    : "border-border bg-card"
                )}
              >
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="ring-2 ring-background shadow-sm">
                    <AvatarImage
                      src={activePairing.profile_b?.avatar_url ?? undefined}
                    />
                    <AvatarFallback className="text-xs">
                      {getInitials(activePairing.profile_b?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">
                      {activePairing.profile_b?.full_name ??
                        activePairing.profile_b?.email ??
                        "?"}
                    </p>
                    {activePairing.user_b_verified ? (
                      <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Verificado
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Pendiente</p>
                    )}
                  </div>
                </div>

                {/* Last entry */}
                {activePairing.entry_b ? (
                  <div className="bg-accent/40 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          "text-[10px]",
                          CATEGORIES[activePairing.entry_b.category]?.bgColor,
                          CATEGORIES[activePairing.entry_b.category]?.color
                        )}
                      >
                        {CATEGORIES[activePairing.entry_b.category]?.emoji}{" "}
                        {CATEGORIES[activePairing.entry_b.category]?.label}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">{activePairing.entry_b.title}</p>
                    {activePairing.entry_b.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {activePairing.entry_b.description}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {activePairing.entry_b.date} &middot;{" "}
                      {activePairing.entry_b.hour}:00
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Sin entradas recientes
                  </p>
                )}

                {/* Verify button */}
                {mySide === "b" &&
                  !myVerified &&
                  !isPairingExpired(activePairing) && (
                    <Button
                      onClick={() => handleVerify("b")}
                      disabled={verifying}
                      className="w-full mt-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25 gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {verifying ? "Verificando..." : "Verificar"}
                    </Button>
                  )}
              </div>
            </div>

            {/* New spin after completion/expiry */}
            {(isPairingSuccess(activePairing) || isPairingExpired(activePairing)) && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  className="rounded-xl gap-2"
                  onClick={() => {
                    // Move active to past and allow new spin
                    setPastPairings((prev) => [activePairing, ...prev]);
                    setActivePairing(null);
                  }}
                >
                  <Shuffle className="w-4 h-4" />
                  Nueva ronda
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-accent/40 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {stats.totalRounds}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Rondas totales</p>
        </div>
        <div className="bg-accent/40 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold tabular-nums tracking-tight text-green-600 dark:text-green-400">
            {stats.successRate}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">Tasa de éxito</p>
        </div>
        <div className="bg-accent/40 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {stats.avgResponseMinutes > 0 ? `${stats.avgResponseMinutes}m` : "--"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Tiempo promedio</p>
        </div>
        <div className="bg-accent/40 rounded-xl p-4 text-center">
          <p className="text-sm font-semibold truncate">
            {stats.mostPaired?.name ?? "--"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Más emparejado{stats.mostPaired ? ` (${stats.mostPaired.count})` : ""}
          </p>
        </div>
      </div>

      {/* Past pairings */}
      {pastPairings.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Historial de hoy
          </h2>
          <div className="space-y-3">
            {pastPairings.map((p) => {
              const status = getPairingStatus(p);
              return (
                <Card
                  key={p.id}
                  className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* User A */}
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7 ring-2 ring-background shadow-sm" size="sm">
                            <AvatarImage
                              src={p.profile_a?.avatar_url ?? undefined}
                            />
                            <AvatarFallback className="text-[10px]">
                              {getInitials(p.profile_a?.full_name ?? null)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">
                            {p.profile_a?.full_name?.split(" ")[0] ?? "?"}
                          </span>
                          {p.user_a_verified ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                          )}
                        </div>

                        <span className="text-xs text-muted-foreground">vs</span>

                        {/* User B */}
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7 ring-2 ring-background shadow-sm" size="sm">
                            <AvatarImage
                              src={p.profile_b?.avatar_url ?? undefined}
                            />
                            <AvatarFallback className="text-[10px]">
                              {getInitials(p.profile_b?.full_name ?? null)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">
                            {p.profile_b?.full_name?.split(" ")[0] ?? "?"}
                          </span>
                          {p.user_b_verified ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className={cn("text-[10px]", status.bg, status.color)}>
                          {status.label}
                        </Badge>
                        {p.triggered_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(p.triggered_at), "h:mm a", {
                              locale: es,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state if no pairings at all */}
      {!activePairing && pastPairings.length === 0 && stats.totalRounds === 0 && !spinning && (
        <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-8 text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Target className="w-8 h-8 text-primary" />
            </div>
            <p className="text-muted-foreground text-sm">
              Aún no hay rondas registradas. Gira la ruleta para empezar.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
