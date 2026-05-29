"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { cn, getTodayMTY, getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Link2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Unlink,
} from "lucide-react";
import { format, subDays, isWeekend } from "date-fns";
import { es } from "date-fns/locale";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberData {
  userId: string;
  profile: Profile;
  hoursToday: number;
  hasCloseout: boolean;
  hasStandup: boolean;
  proofPercent: number;
  pointsCost: number;
}

interface ChainBreak {
  date: string;
  breakerNames: string[];
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWorkdaysBack(fromDate: string, count: number): string[] {
  const dates: string[] = [];
  let current = new Date(fromDate + "T12:00:00");
  current = subDays(current, 1); // start from yesterday
  while (dates.length < count) {
    if (!isWeekend(current)) {
      dates.push(current.toISOString().split("T")[0]);
    }
    current = subDays(current, 1);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChainPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [chainStreak, setChainStreak] = useState(0);
  const [chainBreaks, setChainBreaks] = useState<ChainBreak[]>([]);
  const [todayMembers, setTodayMembers] = useState<MemberData[]>([]);
  const [collectiveScore, setCollectiveScore] = useState(100);
  const [loading, setLoading] = useState(true);

  const today = getTodayMTY();

  const loadData = useCallback(async () => {
    if (!orgId) return;

    // 1. Load all org members with profiles
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    if (!members || members.length === 0) {
      setLoading(false);
      return;
    }

    const profileMap = new Map<string, Profile>();
    const userIds: string[] = [];
    for (const m of members) {
      if (m.profiles) {
        profileMap.set(m.user_id, m.profiles as unknown as Profile);
      }
      userIds.push(m.user_id);
    }
    setProfiles(profileMap);
    setMemberIds(userIds);

    // 2. Load last 30 workdays of data
    const workdays = getWorkdaysBack(today, 30);
    const earliest = workdays[workdays.length - 1];

    const [
      { data: entries },
      { data: closeouts },
      { data: standups },
    ] = await Promise.all([
      supabase
        .from("time_entries")
        .select("user_id, date, hour, proof_urls")
        .eq("org_id", orgId)
        .gte("date", earliest)
        .lte("date", today),
      supabase
        .from("daily_closeouts")
        .select("user_id, date")
        .eq("org_id", orgId)
        .gte("date", earliest)
        .lte("date", today),
      supabase
        .from("standups")
        .select("user_id, date")
        .eq("org_id", orgId)
        .gte("date", earliest)
        .lte("date", today),
    ]);

    // Build lookup maps
    // entries by user+date -> count of unique hours
    const entryMap = new Map<string, Set<number>>();
    const proofMap = new Map<string, { total: number; withProof: number }>();
    for (const e of entries ?? []) {
      const key = `${e.user_id}|${e.date}`;
      if (!entryMap.has(key)) entryMap.set(key, new Set());
      entryMap.get(key)!.add(e.hour);

      if (!proofMap.has(key)) proofMap.set(key, { total: 0, withProof: 0 });
      const pm = proofMap.get(key)!;
      pm.total++;
      if (e.proof_urls && (e.proof_urls as string[]).length > 0) {
        pm.withProof++;
      }
    }

    const closeoutSet = new Set<string>();
    for (const c of closeouts ?? []) {
      closeoutSet.add(`${c.user_id}|${c.date}`);
    }

    const standupSet = new Set<string>();
    for (const s of standups ?? []) {
      standupSet.add(`${s.user_id}|${s.date}`);
    }

    // 3. Calculate team chain (consecutive days where ALL members passed)
    let streak = 0;
    const breaks: ChainBreak[] = [];

    for (const day of workdays) {
      const failedUsers: string[] = [];
      const failReasons: string[] = [];

      for (const uid of userIds) {
        const key = `${uid}|${day}`;
        const hours = entryMap.get(key)?.size ?? 0;
        const hasCloseout = closeoutSet.has(key);
        const reasons: string[] = [];

        if (hours < 6) reasons.push(`${hours}h registradas`);
        if (!hasCloseout) reasons.push("sin closeout");

        if (reasons.length > 0) {
          const name = profileMap.get(uid)?.full_name ?? "Desconocido";
          failedUsers.push(name);
          failReasons.push(`${name}: ${reasons.join(", ")}`);
        }
      }

      if (failedUsers.length === 0) {
        // Only count streak if we haven't hit a break yet
        if (breaks.length === 0 || streak > 0) {
          streak++;
        }
      } else {
        // Chain broke
        if (streak > 0 || breaks.length === 0) {
          breaks.push({
            date: day,
            breakerNames: failedUsers,
            reasons: failReasons,
          });
        } else {
          breaks.push({
            date: day,
            breakerNames: failedUsers,
            reasons: failReasons,
          });
        }
        if (breaks.length === 1 && streak === 0) {
          // First break means streak is 0
        }
        // After first break, stop counting streak
        if (streak > 0) {
          // streak was counting, now it stops
        }
        break; // stop at first break for streak count
      }
    }

    // Rebuild: calculate streak properly
    // Streak = consecutive workdays from yesterday backwards where ALL passed
    let properStreak = 0;
    const properBreaks: ChainBreak[] = [];

    for (const day of workdays) {
      const failedUsers: string[] = [];
      const failReasons: string[] = [];

      for (const uid of userIds) {
        const key = `${uid}|${day}`;
        const hours = entryMap.get(key)?.size ?? 0;
        const hasCloseout = closeoutSet.has(key);
        const reasons: string[] = [];

        if (hours < 6) reasons.push(`${hours}h registradas`);
        if (!hasCloseout) reasons.push("sin closeout");

        if (reasons.length > 0) {
          const name = profileMap.get(uid)?.full_name ?? "Desconocido";
          failedUsers.push(name);
          failReasons.push(`${name}: ${reasons.join(", ")}`);
        }
      }

      if (failedUsers.length === 0 && properBreaks.length === 0) {
        properStreak++;
      } else {
        properBreaks.push({
          date: day,
          breakerNames: failedUsers.length > 0 ? failedUsers : [],
          reasons: failReasons,
        });
      }
    }

    setChainStreak(properStreak);
    setChainBreaks(properBreaks.filter((b) => b.breakerNames.length > 0).slice(0, 10));

    // 4. Calculate today's collective score and member data
    let score = 100;
    const todayData: MemberData[] = [];

    for (const uid of userIds) {
      const key = `${uid}|${today}`;
      const hours = entryMap.get(key)?.size ?? 0;
      const hasCloseout = closeoutSet.has(key);
      const hasStandup = standupSet.has(key);
      const proof = proofMap.get(key);
      const proofPct = proof && proof.total > 0
        ? Math.round((proof.withProof / proof.total) * 100)
        : 0;

      let pointsCost = 0;
      if (hours < 6) { pointsCost += 10; score -= 10; }
      if (!hasCloseout) { pointsCost += 5; score -= 5; }
      if (!hasStandup) { pointsCost += 5; score -= 5; }
      if (proof && proof.total > 0 && proof.withProof === 0) {
        pointsCost += 3;
        score -= 3;
      }

      todayData.push({
        userId: uid,
        profile: profileMap.get(uid) ?? {
          id: uid,
          email: "",
          full_name: "Desconocido",
          avatar_url: null,
          role: null,
          timezone: "America/Monterrey",
          work_start_hour: 9,
          work_end_hour: 18,
          setup_completed: false,
          created_at: "",
          updated_at: "",
        },
        hoursToday: hours,
        hasCloseout,
        hasStandup,
        proofPercent: proofPct,
        pointsCost,
      });
    }

    // Sort: worst offenders first
    todayData.sort((a, b) => b.pointsCost - a.pointsCost);

    setCollectiveScore(Math.max(0, score));
    setTodayMembers(todayData);
    setLoading(false);
  }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) { setLoading(false); return; }
    loadData();
  }, [orgLoading, orgId, loadData]);

  // Derived state
  const scoreStatus = useMemo(() => {
    if (collectiveScore >= 80) return { label: "OPERATIVO", color: "text-green-500", bg: "bg-green-500/10 border-green-500/20" };
    if (collectiveScore >= 60) return { label: "DEGRADADO", color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" };
    if (collectiveScore >= 40) return { label: "EQUIPO EN CRISIS", color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" };
    return { label: "EMERGENCIA", color: "text-red-600", bg: "bg-red-600/15 border-red-600/30" };
  }, [collectiveScore]);

  const lastBreak = chainBreaks[0] ?? null;

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Link2 className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Cadena del Equipo
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Si uno falla, la cadena se rompe para todos. Su nombre queda registrado.
        </p>
      </div>

      {/* Chain visualization */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
          Racha actual
        </p>

        <div className="border border-border p-6">
          {/* Chain links */}
          <div className="flex items-center justify-center gap-0 mb-6 overflow-x-auto py-2">
            {Array.from({ length: Math.max(chainStreak, 1) }).map((_, i) => (
              <div key={i} className="relative flex-shrink-0">
                <ChainLink
                  active={i < chainStreak}
                  index={i}
                />
              </div>
            ))}
            {chainStreak === 0 && lastBreak && (
              <div className="relative flex-shrink-0">
                <ChainLink active={false} index={0} broken />
              </div>
            )}
          </div>

          {/* Streak number */}
          <div className="text-center">
            <p className={cn(
              "font-mono tabular-nums tracking-tight",
              chainStreak > 0 ? "text-7xl font-black" : "text-7xl font-black text-red-500",
            )}>
              {chainStreak}
            </p>
            <p className="font-mono text-xs text-muted-foreground mt-1 uppercase tracking-wider">
              {chainStreak === 1 ? "dia consecutivo" : "dias consecutivos"}
            </p>
          </div>

          {/* Last breaker */}
          {lastBreak && (
            <div className="mt-6 border border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Unlink className="w-4 h-4 text-red-500" />
                <p className="font-mono text-xs text-red-500 uppercase tracking-wider font-bold">
                  Cadena rota
                </p>
              </div>
              <p className="font-mono text-sm text-red-400">
                <span className="text-red-500 font-bold">
                  {lastBreak.breakerNames.join(", ")}
                </span>
                {" "}&mdash;{" "}
                {format(new Date(lastBreak.date + "T12:00:00"), "d 'de' MMMM, yyyy", { locale: es })}
              </p>
              <div className="mt-2 space-y-1">
                {lastBreak.reasons.map((r, i) => (
                  <p key={i} className="font-mono text-[10px] text-red-400/70">
                    {r}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collective score gauge */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
          Score colectivo de hoy
        </p>

        <div className={cn("border p-6", scoreStatus.bg)}>
          {/* Score display */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className={cn(
                "font-mono tabular-nums tracking-tight text-6xl font-black",
                collectiveScore >= 60 ? "" : "text-red-500",
              )}>
                {collectiveScore}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                de 100 puntos
              </p>
            </div>
            <div className={cn(
              "px-3 py-1.5 border font-mono text-xs font-bold uppercase tracking-wider",
              scoreStatus.bg, scoreStatus.color,
            )}>
              {scoreStatus.label}
            </div>
          </div>

          {/* Score bar */}
          <div className="w-full h-3 bg-accent/30 border border-border overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-1000",
                collectiveScore >= 80 ? "bg-green-500" :
                collectiveScore >= 60 ? "bg-amber-500" :
                collectiveScore >= 40 ? "bg-red-500" :
                "bg-red-600 animate-pulse",
              )}
              style={{ width: `${collectiveScore}%` }}
            />
          </div>

          {/* Crisis banners */}
          {collectiveScore < 40 && (
            <div className="mt-4 border border-red-600/50 bg-red-600/10 p-3 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse flex-shrink-0" />
              <p className="font-mono text-sm text-red-500 font-bold uppercase tracking-wider">
                {collectiveScore < 40 ? "EMERGENCIA" : "EQUIPO EN CRISIS"} &mdash; El equipo necesita reaccionar ahora
              </p>
            </div>
          )}
          {collectiveScore >= 40 && collectiveScore < 60 && (
            <div className="mt-4 border border-red-500/30 bg-red-500/5 p-3 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="font-mono text-sm text-red-500 font-bold uppercase tracking-wider">
                EQUIPO EN CRISIS &mdash; Demasiados miembros fallando
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Individual contributions */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
          Contribuciones individuales &mdash; Hoy
        </p>

        <div className="border border-border divide-y divide-border">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_60px_60px_60px_60px_70px] gap-2 px-4 py-2 bg-accent/20">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Miembro
            </p>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 text-center">
              Horas
            </p>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 text-center">
              Cierre
            </p>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 text-center">
              Standup
            </p>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 text-center">
              Prueba
            </p>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 text-right">
              Costo
            </p>
          </div>

          {todayMembers.map((m) => {
            const isHurting = m.pointsCost > 0;
            const isClean = m.pointsCost === 0;

            return (
              <div
                key={m.userId}
                className={cn(
                  "grid grid-cols-[1fr_60px_60px_60px_60px_70px] gap-2 px-4 py-3 items-center transition-colors duration-200",
                  isHurting && "bg-red-500/5",
                  isClean && "bg-green-500/5",
                )}
              >
                {/* Name */}
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="w-6 h-6 ring-1 ring-border flex-shrink-0">
                    <AvatarImage src={m.profile.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[8px] font-mono">
                      {getInitials(m.profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <p className={cn(
                    "font-mono text-xs truncate",
                    isHurting && "text-red-500 font-bold",
                    isClean && "text-green-600",
                  )}>
                    {m.profile.full_name ?? "Desconocido"}
                    {m.userId === userId && (
                      <span className="text-muted-foreground/50 font-normal ml-1">(tu)</span>
                    )}
                  </p>
                </div>

                {/* Hours */}
                <div className="text-center">
                  <p className={cn(
                    "font-mono tabular-nums text-sm font-bold",
                    m.hoursToday >= 6 ? "text-green-600" : "text-red-500",
                  )}>
                    {m.hoursToday}h
                  </p>
                </div>

                {/* Closeout */}
                <div className="flex justify-center">
                  {m.hasCloseout ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>

                {/* Standup */}
                <div className="flex justify-center">
                  {m.hasStandup ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>

                {/* Proof % */}
                <div className="text-center">
                  <p className={cn(
                    "font-mono tabular-nums text-xs font-bold",
                    m.proofPercent >= 50 ? "text-green-600" : m.proofPercent > 0 ? "text-amber-500" : "text-red-500",
                  )}>
                    {m.proofPercent}%
                  </p>
                </div>

                {/* Points cost */}
                <div className="text-right">
                  {m.pointsCost > 0 ? (
                    <p className="font-mono tabular-nums text-sm font-black text-red-500">
                      -{m.pointsCost}
                    </p>
                  ) : (
                    <p className="font-mono tabular-nums text-sm font-bold text-green-600">
                      0
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Penalty legend */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1">
          <p className="font-mono text-[9px] text-muted-foreground/40">
            &lt;6h = -10pts
          </p>
          <p className="font-mono text-[9px] text-muted-foreground/40">
            sin closeout = -5pts
          </p>
          <p className="font-mono text-[9px] text-muted-foreground/40">
            sin standup = -5pts
          </p>
          <p className="font-mono text-[9px] text-muted-foreground/40">
            0% prueba = -3pts
          </p>
        </div>
      </div>

      {/* Broken links history */}
      {chainBreaks.length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Eslabones rotos &mdash; Historial
          </p>

          <div className="border border-border divide-y divide-border">
            {chainBreaks.map((brk, i) => (
              <div key={brk.date} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 border border-red-500/30 bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Unlink className="w-3 h-3 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-xs text-red-500 font-bold">
                        {brk.breakerNames.join(", ")}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground/50">
                        {format(new Date(brk.date + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}
                      </p>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {brk.reasons.map((r, j) => (
                        <p key={j} className="font-mono text-[10px] text-muted-foreground/60">
                          {r}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-6 border-t border-border/50">
        <p className="font-mono text-[9px] text-muted-foreground/30 uppercase tracking-widest">
          La cadena es tan fuerte como su eslabón más débil
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chain Link Component
// ---------------------------------------------------------------------------

function ChainLink({ active, index, broken }: { active: boolean; index: number; broken?: boolean }) {
  return (
    <div
      className={cn(
        "relative w-10 h-16 flex items-center justify-center",
        index > 0 && "-ml-2",
      )}
    >
      {/* Outer oval (chain link shape) */}
      <div
        className={cn(
          "w-8 h-14 border-2 rounded-full transition-all duration-300",
          active && "border-primary bg-primary/5",
          !active && !broken && "border-muted-foreground/20 bg-accent/10",
          broken && "border-red-500/50 bg-red-500/5",
        )}
      />
      {/* Inner connection line */}
      {index > 0 && (
        <div
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 w-3 h-0.5",
            active ? "bg-primary/40" : broken ? "bg-red-500/30" : "bg-muted-foreground/10",
          )}
        />
      )}
      {/* Break indicator */}
      {broken && (
        <div className="absolute inset-0 flex items-center justify-center">
          <XCircle className="w-4 h-4 text-red-500" />
        </div>
      )}
    </div>
  );
}
