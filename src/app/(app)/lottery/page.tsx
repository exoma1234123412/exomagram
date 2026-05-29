"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, AuditLottery, TimeEntry } from "@/lib/types/database";
import { CATEGORIES } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  Ticket,
  Shuffle,
  Loader2,
  CheckCircle2,
  XCircle,
  Shield,
  AlertTriangle,
  Clock,
  FileText,
  Target,
  Trophy,
  Flame,
  ImageIcon,
  Users,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberProfile {
  user_id: string;
  profile: Profile;
}

interface AuditFindings {
  hoursLogged: number;
  totalEntries: number;
  entriesWithProof: number;
  proofPercent: number;
  lateEntries: number;
  hasCloseout: boolean;
  categories: Record<string, number>;
  score: number;
}

interface EnrichedLottery extends AuditLottery {
  profile: Profile | null;
}

// ---------------------------------------------------------------------------
// Spin Animation Component
// ---------------------------------------------------------------------------

function LotterySpin({
  members,
  onComplete,
}: {
  members: MemberProfile[];
  onComplete: (selectedId: string) => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState<"fast" | "slowing" | "done">("fast");
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef(0);
  const finalIdxRef = useRef(Math.floor(Math.random() * members.length));

  useEffect(() => {
    if (members.length === 0) return;

    const totalFastTicks = 20;
    const totalSlowTicks = 12;
    let tick = 0;
    let idx = 0;

    function nextTick() {
      tick++;
      idx = (idx + 1) % members.length;
      setCurrentIdx(idx);
      tickRef.current = tick;

      if (tick < totalFastTicks) {
        intervalRef.current = setTimeout(nextTick, 60);
      } else if (tick < totalFastTicks + totalSlowTicks) {
        const slowTick = tick - totalFastTicks;
        const delay = 100 + slowTick * 60;
        setPhase("slowing");
        intervalRef.current = setTimeout(() => {
          if (slowTick === totalSlowTicks - 2) {
            setCurrentIdx(finalIdxRef.current);
            setPhase("done");
            setTimeout(() => {
              onComplete(members[finalIdxRef.current].user_id);
            }, 600);
          } else {
            nextTick();
          }
        }, delay);
      }
    }

    intervalRef.current = setTimeout(nextTick, 60);

    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = members[currentIdx];

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 animate-pulse">
        Seleccionando candidato...
      </p>

      {/* Spinning avatar display */}
      <div className="relative">
        <div
          className={cn(
            "absolute inset-0 transition-all duration-500",
            phase === "fast" && "ring-2 ring-primary/30 animate-spin",
            phase === "slowing" && "ring-2 ring-primary/50 animate-pulse",
            phase === "done" && "ring-2 ring-primary"
          )}
          style={{ margin: -8 }}
        />

        <Avatar
          className={cn(
            "w-24 h-24 ring-1 ring-border transition-all duration-300",
            phase === "fast" && "scale-95",
            phase === "slowing" && "scale-100",
            phase === "done" && "scale-110"
          )}
        >
          <AvatarImage src={current.profile.avatar_url ?? undefined} />
          <AvatarFallback className="text-2xl font-mono font-bold bg-primary text-primary-foreground">
            {getInitials(current.profile.full_name)}
          </AvatarFallback>
        </Avatar>
      </div>

      <p
        className={cn(
          "font-mono font-bold tabular-nums tracking-tight transition-all duration-300",
          phase === "fast" && "text-muted-foreground blur-[1px] text-base",
          phase === "slowing" && "text-foreground text-lg",
          phase === "done" && "text-primary text-xl"
        )}
      >
        {current.profile.full_name ?? current.profile.email}
      </p>

      {/* Member strip showing all candidates */}
      <div className="flex items-center gap-1 overflow-hidden max-w-full px-4">
        {members.map((m, i) => (
          <Avatar
            key={m.user_id}
            className={cn(
              "w-8 h-8 transition-all duration-200 shrink-0",
              i === currentIdx
                ? "ring-2 ring-primary scale-125"
                : "ring-1 ring-border/30 opacity-40 scale-90"
            )}
          >
            <AvatarImage src={m.profile.avatar_url ?? undefined} />
            <AvatarFallback className="text-[10px] font-mono">
              {getInitials(m.profile.full_name)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit Report Card
// ---------------------------------------------------------------------------

function AuditReportCard({
  findings,
  profile,
  status,
  date,
}: {
  findings: AuditFindings;
  profile: Profile;
  status: AuditLottery["status"];
  date: string;
}) {
  const passed = findings.score >= 70;
  const scoreColor = passed
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
  const scoreBg = passed
    ? "bg-green-500/5 border border-green-500/20"
    : "bg-red-500/5 border border-red-500/20";

  const categoryEntries = Object.entries(findings.categories).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <Card className="border border-border transition-colors duration-200 hover:border-primary/30 overflow-hidden">
      {/* Verdict banner */}
      <div
        className={cn(
          "px-6 py-4 flex items-center justify-between border-b border-border",
          passed
            ? "bg-green-500/5"
            : "bg-red-500/5"
        )}
      >
        <div className="flex items-center gap-3">
          <Avatar className="w-12 h-12 ring-1 ring-border shrink-0">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="font-mono font-bold">
              {getInitials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-mono font-semibold text-sm">{profile.full_name ?? profile.email}</p>
            <p className="text-xs font-mono text-muted-foreground">
              Auditado el {format(new Date(date + "T12:00:00"), "d MMM yyyy", { locale: es })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={cn("text-center px-4 py-2", scoreBg)}>
            <p className={cn("text-3xl font-mono font-black tabular-nums tracking-tight", scoreColor)}>
              {findings.score}
            </p>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Puntaje
            </p>
          </div>
          <Badge
            className={cn(
              "text-xs font-mono px-3 py-1",
              passed
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
            )}
          >
            {passed ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> APROBADO
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> REPROBADO
              </span>
            )}
          </Badge>
        </div>
      </div>

      {/* Findings grid */}
      <CardContent className="p-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-accent/30 border border-border p-4 text-center">
            <Clock className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
              {findings.hoursLogged}
            </p>
            <p className="text-xs font-mono text-muted-foreground">Horas registradas</p>
          </div>

          <div className="bg-accent/30 border border-border p-4 text-center">
            <ImageIcon className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
              {findings.proofPercent}%
            </p>
            <p className="text-xs font-mono text-muted-foreground">Con evidencia</p>
          </div>

          <div className="bg-accent/30 border border-border p-4 text-center">
            <AlertTriangle
              className={cn(
                "w-5 h-5 mx-auto mb-1",
                findings.lateEntries > 0
                  ? "text-amber-500"
                  : "text-primary"
              )}
            />
            <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
              {findings.lateEntries}
            </p>
            <p className="text-xs font-mono text-muted-foreground">Entradas tardías</p>
          </div>

          <div className="bg-accent/30 border border-border p-4 text-center">
            <FileText
              className={cn(
                "w-5 h-5 mx-auto mb-1",
                findings.hasCloseout ? "text-green-500" : "text-red-500"
              )}
            />
            <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
              {findings.hasCloseout ? "Sí" : "No"}
            </p>
            <p className="text-xs font-mono text-muted-foreground">Cierre del día</p>
          </div>
        </div>

        {/* Categories breakdown */}
        {categoryEntries.length > 0 && (
          <div>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
              Distribución de categorías
            </p>
            <div className="flex flex-wrap gap-2">
              {categoryEntries.map(([cat, count]) => {
                const catConfig = CATEGORIES[cat as keyof typeof CATEGORIES];
                return (
                  <Badge
                    key={cat}
                    className={cn(
                      "gap-1 px-3 py-1 text-xs font-mono",
                      catConfig?.bgColor,
                      catConfig?.color
                    )}
                  >
                    <span>{catConfig?.emoji}</span>
                    <span>{catConfig?.label ?? cat}</span>
                    <span className="font-bold tabular-nums">{count}h</span>
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Score breakdown */}
        <div className="mt-6 pt-4 border-t border-border/40">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Desglose del puntaje
          </p>
          <div className="space-y-2 text-sm">
            <ScoreRow
              label="Horas registradas"
              detail={`${findings.hoursLogged}/8 horas`}
              points={Math.min(30, Math.round((findings.hoursLogged / 8) * 30))}
              max={30}
            />
            <ScoreRow
              label="Evidencia"
              detail={`${findings.proofPercent}% con prueba`}
              points={Math.round((findings.proofPercent / 100) * 30)}
              max={30}
            />
            <ScoreRow
              label="Cierre del día"
              detail={findings.hasCloseout ? "Enviado" : "No enviado"}
              points={findings.hasCloseout ? 20 : 0}
              max={20}
            />
            <ScoreRow
              label="Puntualidad"
              detail={`${findings.lateEntries} tardías`}
              points={Math.max(0, 20 - findings.lateEntries * 5)}
              max={20}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreRow({
  label,
  detail,
  points,
  max,
}: {
  label: string;
  detail: string;
  points: number;
  max: number;
}) {
  const pct = max > 0 ? (points / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs text-muted-foreground w-36 shrink-0">{label}</span>
      <div className="flex-1 bg-accent/30 border border-border h-2 overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-700",
            pct >= 80
              ? "bg-green-500"
              : pct >= 50
                ? "bg-amber-500"
                : "bg-red-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums tracking-tight text-muted-foreground w-16 text-right">
        {points}/{max}
      </span>
      <span className="text-xs font-mono text-muted-foreground/60 w-28 text-right truncate">
        {detail}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function LotteryPage() {
  const { orgId, userId, role, loading: orgLoading } = useOrg();
  const supabase = createClient();
  const today = getTodayMTY();

  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [todayLottery, setTodayLottery] = useState<EnrichedLottery | null>(null);
  const [todayFindings, setTodayFindings] = useState<AuditFindings | null>(null);
  const [pastLotteries, setPastLotteries] = useState<EnrichedLottery[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Stats
  const [stats, setStats] = useState({
    totalAudits: 0,
    passRate: 0,
    avgScore: 0,
    lastAudited: null as string | null,
  });

  // -------------------------------------------------------------------------
  // Build profile map
  // -------------------------------------------------------------------------

  const buildProfileMap = useCallback(
    async (): Promise<Map<string, Profile>> => {
      if (!orgId) return new Map();
      const { data: memberData } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId);

      const profileMap = new Map<string, Profile>();
      const memberList: MemberProfile[] = [];
      if (memberData) {
        for (const m of memberData) {
          const p = m.profiles as unknown as Profile;
          profileMap.set(m.user_id, p);
          memberList.push({ user_id: m.user_id, profile: p });
        }
      }
      setMembers(memberList);
      return profileMap;
    },
    [orgId, supabase]
  );

  // -------------------------------------------------------------------------
  // Audit logic: compute findings for a user
  // -------------------------------------------------------------------------

  const auditUser = useCallback(
    async (targetUserId: string): Promise<AuditFindings> => {
      if (!orgId) {
        return {
          hoursLogged: 0,
          totalEntries: 0,
          entriesWithProof: 0,
          proofPercent: 0,
          lateEntries: 0,
          hasCloseout: false,
          categories: {},
          score: 0,
        };
      }

      const yesterday = format(
        subDays(new Date(today + "T12:00:00"), 1),
        "yyyy-MM-dd"
      );

      // Fetch entries for the last 24h (yesterday + today)
      const { data: entries } = await supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", targetUserId)
        .eq("org_id", orgId)
        .in("date", [yesterday, today])
        .order("date", { ascending: false })
        .order("hour", { ascending: false });

      // Fetch closeout for yesterday (most recent completed day)
      const { data: closeout } = await supabase
        .from("daily_closeouts")
        .select("*")
        .eq("user_id", targetUserId)
        .eq("org_id", orgId)
        .eq("date", yesterday)
        .maybeSingle();

      const entryList = (entries ?? []) as TimeEntry[];

      const hoursLogged = entryList.length;
      const entriesWithProof = entryList.filter(
        (e) => e.proof_urls && e.proof_urls.length > 0
      ).length;
      const proofPercent =
        hoursLogged > 0 ? Math.round((entriesWithProof / hoursLogged) * 100) : 0;
      const lateEntries = entryList.filter((e) => e.is_late).length;
      const hasCloseout = !!closeout;

      // Category breakdown
      const categories: Record<string, number> = {};
      for (const e of entryList) {
        categories[e.category] = (categories[e.category] ?? 0) + 1;
      }

      // Score calculation (0-100)
      // Hours: 30 points (8 hours = full)
      const hoursScore = Math.min(30, Math.round((hoursLogged / 8) * 30));
      // Proof: 30 points
      const proofScore = Math.round((proofPercent / 100) * 30);
      // Closeout: 20 points
      const closeoutScore = hasCloseout ? 20 : 0;
      // Punctuality: 20 points (lose 5 per late entry)
      const punctualityScore = Math.max(0, 20 - lateEntries * 5);

      const score = hoursScore + proofScore + closeoutScore + punctualityScore;

      return {
        hoursLogged,
        totalEntries: entryList.length,
        entriesWithProof,
        proofPercent,
        lateEntries,
        hasCloseout,
        categories,
        score,
      };
    },
    [orgId, supabase, today]
  );

  // -------------------------------------------------------------------------
  // Load data
  // -------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    if (!orgId) return;
    const profileMap = await buildProfileMap();

    // Load today's lottery
    const { data: todayData } = await supabase
      .from("audit_lotteries")
      .select("*")
      .eq("org_id", orgId)
      .eq("date", today)
      .limit(1)
      .maybeSingle();

    if (todayData) {
      const lottery = todayData as AuditLottery;
      setTodayLottery({
        ...lottery,
        profile: profileMap.get(lottery.selected_user_id) ?? null,
      });
      if (lottery.findings) {
        setTodayFindings(lottery.findings as unknown as AuditFindings);
      }
    } else {
      setTodayLottery(null);
      setTodayFindings(null);
    }

    // Load past lotteries (last 30 days, not today)
    const { data: pastData } = await supabase
      .from("audit_lotteries")
      .select("*")
      .eq("org_id", orgId)
      .neq("date", today)
      .order("date", { ascending: false })
      .limit(30);

    if (pastData && pastData.length > 0) {
      const enriched: EnrichedLottery[] = (pastData as AuditLottery[]).map(
        (l) => ({
          ...l,
          profile: profileMap.get(l.selected_user_id) ?? null,
        })
      );
      setPastLotteries(enriched);
    } else {
      setPastLotteries([]);
    }

    // Compute stats
    const allLotteries = [
      ...(todayData ? [todayData as AuditLottery] : []),
      ...((pastData ?? []) as AuditLottery[]),
    ];
    const resolved = allLotteries.filter(
      (l) => l.status === "passed" || l.status === "failed"
    );
    const passCount = resolved.filter((l) => l.status === "passed").length;
    const scores = resolved
      .map((l) => (l.findings as unknown as AuditFindings)?.score)
      .filter((s): s is number => typeof s === "number");

    setStats({
      totalAudits: allLotteries.length,
      passRate: resolved.length > 0 ? Math.round((passCount / resolved.length) * 100) : 0,
      avgScore:
        scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      lastAudited: allLotteries.length > 0 ? allLotteries[0].date : null,
    });

    setLoading(false);
  }, [orgId, supabase, today, buildProfileMap]);

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
      .channel("audit_lotteries_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "audit_lotteries",
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
  // Handle spin complete
  // -------------------------------------------------------------------------

  async function handleSpinComplete(selectedUserId: string) {
    if (!orgId) return;
    setSpinning(false);
    setAuditing(true);

    // Create the lottery record
    const { data: newLottery, error } = await supabase
      .from("audit_lotteries")
      .insert({
        org_id: orgId,
        date: today,
        selected_user_id: selectedUserId,
        status: "auditing",
        findings: null,
        passed: null,
      })
      .select()
      .single();

    if (error || !newLottery) {
      setAuditing(false);
      return;
    }

    // Run the audit
    const findings = await auditUser(selectedUserId);
    const passed = findings.score >= 70;
    const finalStatus = passed ? "passed" : "failed";

    // Update with results
    await supabase
      .from("audit_lotteries")
      .update({
        findings: findings as unknown as Record<string, unknown>,
        passed,
        status: finalStatus,
      })
      .eq("id", newLottery.id);

    const profileMap = await buildProfileMap();

    setTodayLottery({
      ...(newLottery as AuditLottery),
      findings: findings as unknown as Record<string, unknown>,
      passed,
      status: finalStatus,
      profile: profileMap.get(selectedUserId) ?? null,
    });
    setTodayFindings(findings);
    setAuditing(false);
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading || orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const canSpin = members.length >= 2 && !spinning && !auditing && !todayLottery;
  const hasResults = todayLottery && todayFindings && todayLottery.profile;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Ticket className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Lotería de Auditoría
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Cada día, un miembro al azar es auditado. Si pasa, gana puntos de confianza. Si no... vergüenza pública.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-accent/30 border border-border p-4 text-center">
          <Target className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">{stats.totalAudits}</p>
          <p className="text-xs font-mono text-muted-foreground">Auditorías</p>
        </div>
        <div className="bg-accent/30 border border-border p-4 text-center">
          <Shield className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">{stats.passRate}%</p>
          <p className="text-xs font-mono text-muted-foreground">Aprobación</p>
        </div>
        <div className="bg-accent/30 border border-border p-4 text-center">
          <Trophy className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">{stats.avgScore}</p>
          <p className="text-xs font-mono text-muted-foreground">Puntaje prom.</p>
        </div>
        <div className="bg-accent/30 border border-border p-4 text-center">
          <Flame className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-sm font-mono font-semibold tabular-nums tracking-tight">
            {stats.lastAudited
              ? format(new Date(stats.lastAudited + "T12:00:00"), "d MMM", { locale: es })
              : "—"}
          </p>
          <p className="text-xs font-mono text-muted-foreground">Última</p>
        </div>
      </div>

      {/* Today's Lottery */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-4">
          Sorteo de hoy
        </p>

        {/* No lottery yet — show spin button */}
        {!todayLottery && !spinning && !auditing && (
          <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
            <CardContent className="p-8 flex flex-col items-center gap-6">
              {members.length < 2 ? (
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto">
                    <Users className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-muted-foreground text-xs font-mono">
                    Se necesitan al menos 2 miembros para la lotería
                  </p>
                </div>
              ) : (
                <>
                  <div className="w-20 h-20 border border-border flex items-center justify-center">
                    <Ticket className="w-10 h-10 text-primary" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="font-mono font-semibold text-sm">
                      {members.length} miembros en la lotería
                    </p>
                    <p className="text-xs font-mono text-muted-foreground">
                      Nadie ha sido auditado hoy. Gira la ruleta para seleccionar al candidato.
                    </p>
                  </div>
                  <Button
                    onClick={() => setSpinning(true)}
                    disabled={!canSpin}
                    size="lg"
                    className="font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-2 px-8"
                  >
                    <Shuffle className="w-4 h-4" />
                    Girar Ruleta
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Spinning animation */}
        {spinning && (
          <Card className="border border-primary/30 overflow-hidden">
            <CardContent className="p-8">
              <LotterySpin
                members={members}
                onComplete={handleSpinComplete}
              />
            </CardContent>
          </Card>
        )}

        {/* Auditing state */}
        {auditing && !spinning && (
          <Card className="border border-border overflow-hidden">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <div className="text-center space-y-1">
                <p className="font-mono font-semibold text-sm">Analizando últimas 24 horas...</p>
                <p className="text-xs font-mono text-muted-foreground">
                  Revisando entradas, evidencia, puntualidad y cierre del día
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {hasResults && todayFindings && todayLottery.profile && (
          <AuditReportCard
            findings={todayFindings}
            profile={todayLottery.profile}
            status={todayLottery.status}
            date={todayLottery.date}
          />
        )}
      </div>

      {/* Past Audits */}
      {pastLotteries.length > 0 && (
        <div>
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-4">
            Historial de auditorías
          </p>

          <div className="space-y-2">
            {pastLotteries.map((lottery) => {
              const findings = lottery.findings as unknown as AuditFindings | null;
              const passed = lottery.status === "passed";
              const failed = lottery.status === "failed";

              return (
                <Card
                  key={lottery.id}
                  className="border border-border transition-colors duration-200 hover:border-primary/30"
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    {/* Avatar */}
                    <Avatar className="w-10 h-10 ring-1 ring-border shrink-0">
                      <AvatarImage src={lottery.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-sm font-mono">
                        {getInitials(lottery.profile?.full_name ?? null)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Name + date */}
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-medium text-sm truncate">
                        {lottery.profile?.full_name ?? lottery.profile?.email ?? "Desconocido"}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground">
                        {format(new Date(lottery.date + "T12:00:00"), "d MMM yyyy", {
                          locale: es,
                        })}
                      </p>
                    </div>

                    {/* Score */}
                    {findings && (
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs font-mono text-muted-foreground">
                            {findings.hoursLogged}h / {findings.proofPercent}% prueba
                          </p>
                        </div>
                        <div
                          className={cn(
                            "text-lg font-mono font-bold tabular-nums tracking-tight w-10 text-center",
                            passed && "text-green-600 dark:text-green-400",
                            failed && "text-red-600 dark:text-red-400"
                          )}
                        >
                          {findings.score}
                        </div>
                      </div>
                    )}

                    {/* Status badge */}
                    <Badge
                      className={cn(
                        "shrink-0 font-mono text-xs",
                        passed &&
                          "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
                        failed &&
                          "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
                        !passed &&
                          !failed &&
                          "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                      )}
                    >
                      {passed && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Aprobado
                        </span>
                      )}
                      {failed && (
                        <span className="flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Reprobado
                        </span>
                      )}
                      {!passed && !failed && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Pendiente
                        </span>
                      )}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state — no past audits and no today */}
      {pastLotteries.length === 0 && !todayLottery && !spinning && !auditing && (
        <div className="text-center py-12">
          <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-4">
            <Ticket className="w-8 h-8 text-primary" />
          </div>
          <p className="text-muted-foreground text-xs font-mono">
            No hay auditorías anteriores. Gira la ruleta para empezar.
          </p>
        </div>
      )}
    </div>
  );
}
