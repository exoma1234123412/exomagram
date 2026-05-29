"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  TrustScoreHistory,
  TimeEntry,
  Standup,
  DailyPromise,
  WeeklyContract,
  AiDailyInsight,
  AccountabilityFlag,
  AuditLottery,
  LiveStatus,
} from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, getInitials, getTodayMTY, timeAgo } from "@/lib/utils";
import { MOOD_LABELS, FLAG_TYPES, LIVE_STATUS_CONFIG } from "@/lib/constants";
import { format, subDays, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import {
  Users,
  Calendar,
  Brain,
  AlertTriangle,
  Shield,
  FileSearch,
  Ghost,
  Timer,
  Target,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Plus,
  Scan,
  Activity,
  Eye,
  Crosshair,
  TrendingDown,
  TrendingUp,
  Minus,
  FileSignature,
  MessageSquare,
} from "lucide-react";

// ─────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────

type TabKey = "equipo" | "rituales" | "ai" | "riesgo" | "vigilancia" | "auditoria";

const TABS: { key: TabKey; label: string; icon: typeof Users }[] = [
  { key: "equipo", label: "Equipo", icon: Users },
  { key: "rituales", label: "Rituales", icon: Calendar },
  { key: "ai", label: "AI", icon: Brain },
  { key: "riesgo", label: "Riesgo", icon: AlertTriangle },
  { key: "vigilancia", label: "Vigilancia", icon: Shield },
  { key: "auditoria", label: "Auditoría", icon: FileSearch },
];

// ─────────────────────────────────────────────
// Grade styling helper
// ─────────────────────────────────────────────

const GRADE_STYLE: Record<string, { color: string; bg: string }> = {
  A: { color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/20" },
  B: { color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/20" },
  C: { color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/20" },
  D: { color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20" },
  F: { color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20" },
};

function gradeStyle(grade: string | null | undefined) {
  return GRADE_STYLE[grade ?? ""] ?? GRADE_STYLE.C;
}

// ─────────────────────────────────────────────
// Risk level config
// ─────────────────────────────────────────────

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string; bar: string }> = {
  low: { label: "Bajo", color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/20", bar: "bg-green-500" },
  medium: { label: "Medio", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20", bar: "bg-amber-500" },
  high: { label: "Alto", color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20", bar: "bg-orange-500" },
  critical: { label: "Crítico", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20", bar: "bg-red-500" },
};

// ─────────────────────────────────────────────
// Helper: week start (Monday)
// ─────────────────────────────────────────────

function getWeekStart(date: Date = new Date()): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function IntelPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [activeTab, setActiveTab] = useState<TabKey>("equipo");
  const [loadedTabs, setLoadedTabs] = useState<Set<TabKey>>(new Set());

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  if (!orgId || !userId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground font-mono text-xs">
          Crea o únete a un equipo desde el Dashboard.
        </p>
      </div>
    );
  }

  function selectTab(tab: TabKey) {
    setActiveTab(tab);
    setLoadedTabs((prev) => new Set(prev).add(tab));
  }

  // Ensure current tab is in loaded set
  if (!loadedTabs.has(activeTab)) {
    setLoadedTabs((prev) => new Set(prev).add(activeTab));
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 bg-grid-palantir min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <Crosshair className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Intel
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Centro de inteligencia unificado
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => selectTab(tab.key)}
            className={cn(
              "px-4 py-2 font-mono text-[11px] uppercase tracking-wide cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1.5",
              activeTab === tab.key
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — lazy load */}
      {activeTab === "equipo" && loadedTabs.has("equipo") && (
        <TabEquipo orgId={orgId} userId={userId} />
      )}
      {activeTab === "rituales" && loadedTabs.has("rituales") && (
        <TabRituales orgId={orgId} userId={userId} />
      )}
      {activeTab === "ai" && loadedTabs.has("ai") && (
        <TabAI orgId={orgId} />
      )}
      {activeTab === "riesgo" && loadedTabs.has("riesgo") && (
        <TabRiesgo orgId={orgId} />
      )}
      {activeTab === "vigilancia" && loadedTabs.has("vigilancia") && (
        <TabVigilancia orgId={orgId} />
      )}
      {activeTab === "auditoria" && loadedTabs.has("auditoria") && (
        <TabAuditoria orgId={orgId} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 1: EQUIPO — Team grid with live status
// ═══════════════════════════════════════════════════════════

interface MemberData {
  profile: Profile;
  hoursToday: number;
  trustScore: number | null;
  lastActivity: string | null;
  liveStatus: LiveStatus | null;
  isGhost: boolean;
  isDeadman: boolean;
}

function TabEquipo({ orgId, userId }: { orgId: string; userId: string }) {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const today = getTodayMTY();

  const loadData = useCallback(async () => {
    const [
      { data: memberData },
      { data: entries },
      { data: trustData },
      { data: liveData },
    ] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId),
      supabase
        .from("time_entries")
        .select("user_id, hour, logged_at")
        .eq("org_id", orgId)
        .eq("date", today),
      supabase
        .from("trust_score_history")
        .select("user_id, score, date")
        .eq("org_id", orgId)
        .gte("date", format(subDays(new Date(), 7), "yyyy-MM-dd"))
        .order("date", { ascending: false }),
      supabase
        .from("live_status")
        .select("*")
        .eq("org_id", orgId),
    ]);

    if (!memberData) { setLoading(false); return; }

    // Build hours lookup
    const hoursMap = new Map<string, number>();
    const lastActivityMap = new Map<string, string>();
    for (const e of entries ?? []) {
      hoursMap.set(e.user_id, (hoursMap.get(e.user_id) ?? 0) + 1);
      const existing = lastActivityMap.get(e.user_id);
      if (!existing || e.logged_at > existing) {
        lastActivityMap.set(e.user_id, e.logged_at);
      }
    }

    // Trust: latest per user
    const trustMap = new Map<string, number>();
    for (const t of trustData ?? []) {
      if (!trustMap.has(t.user_id)) trustMap.set(t.user_id, t.score);
    }

    // Live status map
    const liveMap = new Map<string, LiveStatus>();
    for (const l of liveData ?? []) {
      liveMap.set(l.user_id, l as LiveStatus);
    }

    // Determine ghost/deadman
    const now = new Date();
    const nowHour = new Date().toLocaleString("en-US", { timeZone: "America/Monterrey", hour: "numeric", hour12: false });
    const currentHour = parseInt(nowHour, 10);

    const result: MemberData[] = memberData.map((m) => {
      const profile = m.profiles as unknown as Profile;
      const hours = hoursMap.get(m.user_id) ?? 0;
      const lastAct = lastActivityMap.get(m.user_id) ?? null;
      const live = liveMap.get(m.user_id) ?? null;

      // Ghost: no entries in last 2 days
      const lastEntryTime = lastAct ? new Date(lastAct) : null;
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const isGhost = !lastEntryTime || lastEntryTime < twoDaysAgo;

      // Deadman: 4+ hours silent during work hours (8-18)
      const isWorkHours = currentHour >= 8 && currentHour < 18;
      const heartbeat = live?.last_heartbeat ? new Date(live.last_heartbeat) : null;
      const hoursSinceHeartbeat = heartbeat
        ? (now.getTime() - heartbeat.getTime()) / (1000 * 60 * 60)
        : Infinity;
      const isDeadman = isWorkHours && hours === 0 && currentHour >= 12 && hoursSinceHeartbeat > 4;

      return {
        profile,
        hoursToday: hours,
        trustScore: trustMap.get(m.user_id) ?? null,
        lastActivity: lastAct,
        liveStatus: live,
        isGhost,
        isDeadman,
      };
    });

    // Sort: alerts first (ghost/deadman), then by hours desc
    result.sort((a, b) => {
      const aAlert = (a.isGhost || a.isDeadman) ? 1 : 0;
      const bAlert = (b.isGhost || b.isDeadman) ? 1 : 0;
      if (aAlert !== bAlert) return bAlert - aAlert;
      return b.hoursToday - a.hoursToday;
    });

    setMembers(result);
    setLoading(false);
  }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();

    // Real-time subscription on time_entries
    const channel = supabase
      .channel("intel_equipo_rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_entries", filter: `org_id=eq.${orgId}` },
        () => { loadData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <TabLoading />;
  }

  if (members.length === 0) {
    return (
      <TabEmpty icon={Users} text="No hay miembros en este equipo." />
    );
  }

  function statusDot(m: MemberData) {
    if (m.isGhost) return "bg-gray-400";
    if (m.isDeadman) return "bg-red-500 animate-pulse";
    const status = m.liveStatus?.status ?? "offline";
    return LIVE_STATUS_CONFIG[status]?.dotColor ?? "bg-gray-400";
  }

  return (
    <div>
      <div className="palantir-divider text-muted-foreground/40 mb-4">
        Estado del equipo — {format(new Date(), "d MMM yyyy", { locale: es })}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatBox label="Miembros" value={members.length} />
        <StatBox label="Horas hoy" value={members.reduce((s, m) => s + m.hoursToday, 0)} />
        <StatBox label="Fantasmas" value={members.filter((m) => m.isGhost).length} alert />
        <StatBox label="Deadman" value={members.filter((m) => m.isDeadman).length} alert />
      </div>

      {/* Member grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {members.map((m) => (
          <div
            key={m.profile.id}
            className={cn(
              "card-palantir p-4 relative",
              (m.isGhost || m.isDeadman) && "animate-border-pulse"
            )}
          >
            {/* Corner marks on alert members */}
            {(m.isGhost || m.isDeadman) && <div className="corner-marks absolute inset-0 pointer-events-none" />}

            <div className="flex items-start gap-3">
              <div className="relative">
                <Avatar className="w-9 h-9 ring-1 ring-border">
                  <AvatarImage src={m.profile.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px] font-mono">
                    {getInitials(m.profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background", statusDot(m))} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-semibold truncate">
                    {m.profile.full_name ?? m.profile.email}
                  </span>
                  {m.isGhost && (
                    <Badge variant="outline" className="text-[8px] font-mono h-4 px-1.5 border-gray-400 text-gray-500">
                      <Ghost className="w-2.5 h-2.5 mr-0.5" />
                      GHOST
                    </Badge>
                  )}
                  {m.isDeadman && (
                    <Badge variant="outline" className="text-[8px] font-mono h-4 px-1.5 border-red-400 text-red-500">
                      <Timer className="w-2.5 h-2.5 mr-0.5" />
                      DEADMAN
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
                  <span>
                    <span className="data-number text-base text-foreground">{m.hoursToday}</span>
                    <span className="ml-0.5">hrs</span>
                  </span>
                  {m.trustScore !== null && (
                    <span>
                      Trust{" "}
                      <span className={cn(
                        "data-number text-base",
                        m.trustScore >= 80 ? "text-green-600 dark:text-green-400" :
                        m.trustScore >= 50 ? "text-amber-600 dark:text-amber-400" :
                        "text-red-600 dark:text-red-400"
                      )}>
                        {m.trustScore}
                      </span>
                    </span>
                  )}
                  {m.lastActivity && (
                    <span className="text-muted-foreground/60">
                      {timeAgo(m.lastActivity)}
                    </span>
                  )}
                </div>

                {m.liveStatus && m.liveStatus.status !== "offline" && m.liveStatus.current_task && (
                  <p className="text-[9px] font-mono text-muted-foreground/60 mt-1 truncate">
                    {m.liveStatus.current_task}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 2: RITUALES — Standup + Promises + Weekly Contract
// ═══════════════════════════════════════════════════════════

interface StandupWithProfile extends Standup {
  profiles?: Profile;
}

interface PromiseWithProfile extends DailyPromise {
  profiles?: { full_name: string | null; avatar_url: string | null };
}

interface ContractWithProfile extends WeeklyContract {
  profiles?: Profile;
}

function TabRituales({ orgId, userId }: { orgId: string; userId: string }) {
  const supabase = createClient();
  const today = getTodayMTY();
  const weekStart = getWeekStart();

  // Standup state
  const [standups, setStandups] = useState<StandupWithProfile[]>([]);
  const [myStandup, setMyStandup] = useState<StandupWithProfile | null>(null);
  const [yesterday, setYesterday] = useState("");
  const [todayPlan, setTodayPlan] = useState("");
  const [blockers, setBlockers] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [standupSubmitting, setStandupSubmitting] = useState(false);

  // Promises state
  const [promises, setPromises] = useState<PromiseWithProfile[]>([]);
  const [myPromises, setMyPromises] = useState<PromiseWithProfile[]>([]);
  const [newPromise, setNewPromise] = useState("");
  const [promiseSubmitting, setPromiseSubmitting] = useState(false);

  // Contract state
  const [myContract, setMyContract] = useState<ContractWithProfile | null>(null);
  const [newCommitments, setNewCommitments] = useState<string[]>([""]);
  const [contractSubmitting, setContractSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [
      { data: standupData },
      { data: promiseData },
      { data: contractData },
    ] = await Promise.all([
      supabase
        .from("standups")
        .select("*, profiles(*)")
        .eq("org_id", orgId)
        .eq("date", today)
        .order("submitted_at", { ascending: true }),
      supabase
        .from("daily_promises")
        .select("*, profiles(full_name, avatar_url)")
        .eq("org_id", orgId)
        .eq("date", today)
        .order("created_at"),
      supabase
        .from("weekly_contracts")
        .select("*, profiles(*)")
        .eq("org_id", orgId)
        .eq("week_start", weekStart)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    setStandups((standupData ?? []) as StandupWithProfile[]);
    const mine = (standupData ?? []).find((s) => s.user_id === userId);
    if (mine) setMyStandup(mine as StandupWithProfile);

    const allPromises = (promiseData ?? []) as PromiseWithProfile[];
    setPromises(allPromises);
    setMyPromises(allPromises.filter((p) => p.user_id === userId));

    setMyContract((contractData as ContractWithProfile) ?? null);
    setLoading(false);
  }, [orgId, userId, today, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  async function submitStandup(e: React.FormEvent) {
    e.preventDefault();
    if (!yesterday.trim() || !todayPlan.trim()) return;
    setStandupSubmitting(true);
    const { data } = await supabase.from("standups").upsert({
      user_id: userId, org_id: orgId, date: today,
      yesterday, today_plan: todayPlan,
      blockers: blockers || null,
      mood: mood as 1 | 2 | 3 | 4 | 5 | null,
    }, { onConflict: "user_id,org_id,date" }).select("*, profiles(*)").single();
    if (data) {
      setMyStandup(data as unknown as StandupWithProfile);
      loadData();
    }
    setStandupSubmitting(false);
  }

  async function addPromise(e: React.FormEvent) {
    e.preventDefault();
    if (!newPromise.trim()) return;
    setPromiseSubmitting(true);
    await supabase.from("daily_promises").insert({
      user_id: userId, org_id: orgId, date: today,
      title: newPromise.trim(), status: "pending",
    });
    setNewPromise("");
    setPromiseSubmitting(false);
    loadData();
  }

  async function togglePromise(id: string, current: string) {
    const next = current === "pending" ? "delivered" : current === "delivered" ? "broken" : "pending";
    await supabase.from("daily_promises").update({ status: next }).eq("id", id);
    loadData();
  }

  async function submitContract(e: React.FormEvent) {
    e.preventDefault();
    const filtered = newCommitments.filter((c) => c.trim());
    if (filtered.length === 0) return;
    setContractSubmitting(true);
    await supabase.from("weekly_contracts").upsert({
      user_id: userId, org_id: orgId, week_start: weekStart,
      commitments: filtered.map((text) => ({ text, delivered: false })),
      status: "active",
    }, { onConflict: "user_id,org_id,week_start" });
    setContractSubmitting(false);
    loadData();
  }

  async function toggleCommitment(idx: number) {
    if (!myContract) return;
    const updated = [...myContract.commitments];
    updated[idx] = { ...updated[idx], delivered: !updated[idx].delivered };
    await supabase.from("weekly_contracts").update({ commitments: updated }).eq("id", myContract.id);
    loadData();
  }

  if (loading) return <TabLoading />;

  return (
    <div className="space-y-8">
      {/* ─── STANDUP ─── */}
      <section>
        <div className="palantir-divider text-muted-foreground/40 mb-4">
          <MessageSquare className="w-3 h-3" />
          Standup — {format(new Date(today + "T12:00:00"), "d MMM", { locale: es })}
        </div>

        {!myStandup ? (
          <form onSubmit={submitStandup} className="card-palantir p-4 space-y-3 mb-4">
            <div>
              <label className="label-mono text-muted-foreground/60 mb-1 block">Ayer</label>
              <Textarea
                value={yesterday}
                onChange={(e) => setYesterday(e.target.value)}
                placeholder="Qué lograste ayer..."
                className="font-mono text-xs min-h-[60px]"
                required
              />
            </div>
            <div>
              <label className="label-mono text-muted-foreground/60 mb-1 block">Hoy</label>
              <Textarea
                value={todayPlan}
                onChange={(e) => setTodayPlan(e.target.value)}
                placeholder="Qué harás hoy..."
                className="font-mono text-xs min-h-[60px]"
                required
              />
            </div>
            <div>
              <label className="label-mono text-muted-foreground/60 mb-1 block">Blockers</label>
              <Input
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                placeholder="Opcional"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label className="label-mono text-muted-foreground/60 mb-1 block">Mood</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMood(v)}
                    className={cn(
                      "w-8 h-8 font-mono text-xs border transition-colors",
                      mood === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/30"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={standupSubmitting} className="font-mono text-xs bg-primary text-primary-foreground">
              {standupSubmitting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Enviar Standup
            </Button>
          </form>
        ) : (
          <div className="card-palantir p-4 mb-4 corner-marks">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span className="font-mono text-[10px] uppercase tracking-wide text-green-600 dark:text-green-400">
                Standup enviado
              </span>
              {myStandup.mood && (
                <span className="font-mono text-[9px] text-muted-foreground/60 ml-auto">
                  Mood: {MOOD_LABELS[myStandup.mood]}
                </span>
              )}
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div>
                <span className="text-muted-foreground/50">Ayer:</span>{" "}
                <span className="text-foreground">{myStandup.yesterday}</span>
              </div>
              <div>
                <span className="text-muted-foreground/50">Hoy:</span>{" "}
                <span className="text-foreground">{myStandup.today_plan}</span>
              </div>
              {myStandup.blockers && (
                <div>
                  <span className="text-muted-foreground/50">Blockers:</span>{" "}
                  <span className="text-red-600 dark:text-red-400">{myStandup.blockers}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Team standups */}
        {standups.filter((s) => s.user_id !== userId).length > 0 && (
          <div className="space-y-2">
            <span className="label-mono text-muted-foreground/40">Equipo</span>
            {standups.filter((s) => s.user_id !== userId).map((s) => (
              <div key={s.id} className="card-palantir p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Avatar className="w-5 h-5 ring-1 ring-border">
                    <AvatarImage src={(s.profiles as Profile | undefined)?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[7px] font-mono">
                      {getInitials((s.profiles as Profile | undefined)?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-mono text-[10px] font-semibold">
                    {(s.profiles as Profile | undefined)?.full_name ?? "?"}
                  </span>
                  {s.mood && (
                    <span className="text-[9px] font-mono text-muted-foreground/50 ml-auto">
                      {MOOD_LABELS[s.mood]}
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono space-y-1 text-muted-foreground">
                  <p><span className="text-muted-foreground/40">Hoy:</span> {s.today_plan}</p>
                  {s.blockers && <p className="text-red-500">{s.blockers}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── PROMESAS ─── */}
      <section>
        <div className="palantir-divider text-muted-foreground/40 mb-4">
          <Target className="w-3 h-3" />
          Promesas — Hoy
        </div>

        <form onSubmit={addPromise} className="flex gap-2 mb-4">
          <Input
            value={newPromise}
            onChange={(e) => setNewPromise(e.target.value)}
            placeholder="Nueva promesa..."
            className="font-mono text-xs flex-1"
          />
          <Button type="submit" disabled={promiseSubmitting} className="font-mono text-xs bg-primary text-primary-foreground">
            <Plus className="w-3 h-3" />
          </Button>
        </form>

        {myPromises.length > 0 && (
          <div className="space-y-1.5 mb-4">
            <span className="label-mono text-muted-foreground/40">Mis promesas</span>
            {myPromises.map((p) => (
              <div key={p.id} className="card-palantir p-3 flex items-center gap-3">
                <button
                  onClick={() => togglePromise(p.id, p.status)}
                  className="shrink-0"
                >
                  {p.status === "delivered" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : p.status === "broken" ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <Clock className="w-4 h-4 text-muted-foreground/40" />
                  )}
                </button>
                <span className={cn(
                  "font-mono text-xs flex-1",
                  p.status === "delivered" && "line-through text-muted-foreground/60",
                  p.status === "broken" && "text-red-500 line-through"
                )}>
                  {p.title}
                </span>
                <Badge variant="outline" className={cn(
                  "text-[8px] font-mono h-4",
                  p.status === "delivered" && "border-green-400 text-green-600",
                  p.status === "broken" && "border-red-400 text-red-600",
                  p.status === "pending" && "border-border text-muted-foreground"
                )}>
                  {p.status === "delivered" ? "Cumplida" : p.status === "broken" ? "Rota" : "Pendiente"}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Team promises */}
        {promises.filter((p) => p.user_id !== userId).length > 0 && (
          <div className="space-y-1.5">
            <span className="label-mono text-muted-foreground/40">Equipo</span>
            {promises.filter((p) => p.user_id !== userId).map((p) => (
              <div key={p.id} className="card-palantir p-2.5 flex items-center gap-2 text-[10px] font-mono">
                {p.status === "delivered" ? (
                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                ) : p.status === "broken" ? (
                  <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                ) : (
                  <Clock className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                )}
                <span className="text-muted-foreground/60">{p.profiles?.full_name ?? "?"}</span>
                <span className={cn("flex-1 truncate", p.status === "broken" && "text-red-500")}>
                  {p.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── PACTO SEMANAL ─── */}
      <section>
        <div className="palantir-divider text-muted-foreground/40 mb-4">
          <FileSignature className="w-3 h-3" />
          Pacto Semanal — Semana del {format(new Date(weekStart + "T12:00:00"), "d MMM", { locale: es })}
        </div>

        {myContract ? (
          <div className="card-palantir p-4 corner-marks">
            <div className="flex items-center gap-2 mb-3">
              <span className="label-mono text-muted-foreground/40">Compromisos</span>
              {myContract.overall_grade && (
                <span className={cn(
                  "font-mono text-sm font-bold ml-auto",
                  gradeStyle(myContract.overall_grade).color
                )}>
                  {myContract.overall_grade}
                </span>
              )}
              <Badge variant="outline" className="text-[8px] font-mono h-4 ml-1">
                {myContract.status === "graded" ? "Calificado" : "Activo"}
              </Badge>
            </div>
            <div className="space-y-2">
              {myContract.commitments.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button onClick={() => toggleCommitment(i)} className="shrink-0">
                    {c.delivered ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <Clock className="w-4 h-4 text-muted-foreground/30" />
                    )}
                  </button>
                  <span className={cn(
                    "font-mono text-xs",
                    c.delivered && "line-through text-muted-foreground/60"
                  )}>
                    {c.text}
                  </span>
                  {c.grade && (
                    <span className={cn("font-mono text-[10px] font-bold ml-auto", gradeStyle(c.grade).color)}>
                      {c.grade}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {myContract.ai_assessment && (
              <div className="mt-3 pt-3 border-t border-border text-[10px] font-mono text-muted-foreground">
                <span className="label-mono text-primary/40 mb-1 block">AI Assessment</span>
                {myContract.ai_assessment}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={submitContract} className="card-palantir p-4 space-y-3">
            <span className="label-mono text-muted-foreground/60">Crear pacto semanal</span>
            {newCommitments.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={c}
                  onChange={(e) => {
                    const upd = [...newCommitments];
                    upd[i] = e.target.value;
                    setNewCommitments(upd);
                  }}
                  placeholder={`Compromiso ${i + 1}...`}
                  className="font-mono text-xs"
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewCommitments([...newCommitments, ""])}
                className="font-mono text-[10px]"
              >
                <Plus className="w-3 h-3 mr-1" />
                Agregar
              </Button>
              <Button type="submit" disabled={contractSubmitting} className="font-mono text-xs bg-primary text-primary-foreground">
                {contractSubmitting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Crear Pacto
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 3: AI — Claude Brain insights
// ═══════════════════════════════════════════════════════════

function TabAI({ orgId }: { orgId: string }) {
  const supabase = createClient();
  const today = getTodayMTY();
  const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const [insights, setInsights] = useState<(AiDailyInsight & { profiles?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const { data } = await supabase
      .from("ai_daily_insights")
      .select("*, profiles(*)")
      .eq("org_id", orgId)
      .gte("date", yesterdayStr)
      .lte("date", today)
      .order("date", { ascending: false });

    setInsights((data ?? []) as (AiDailyInsight & { profiles?: Profile })[]);
    setLoading(false);
  }, [orgId, today, yesterdayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <TabLoading />;

  if (insights.length === 0) {
    return <TabEmpty icon={Brain} text="Sin insights de AI para hoy o ayer." />;
  }

  // Group by user, show latest first
  const byUser = new Map<string, (AiDailyInsight & { profiles?: Profile })[]>();
  for (const ins of insights) {
    const uid = ins.user_id;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(ins);
  }

  return (
    <div>
      <div className="palantir-divider text-muted-foreground/40 mb-4">
        <Brain className="w-3 h-3" />
        Insights AI — Últimas 48h
      </div>

      <div className="space-y-3">
        {Array.from(byUser.entries()).map(([uid, userInsights]) => {
          const latest = userInsights[0];
          const insightData = latest.insight as Record<string, unknown>;
          const grade = (insightData.grade as string) ?? null;
          const summary = (insightData.summary as string) ??
            (insightData.resumen as string) ??
            (insightData.verdict as string) ?? null;
          const keyInsight = (insightData.key_insight as string) ??
            (insightData.insight_clave as string) ??
            (insightData.recommendation as string) ?? null;
          const profile = latest.profiles;

          return (
            <div key={uid} className="card-palantir p-4">
              <div className="flex items-center gap-3 mb-2">
                <Avatar className="w-7 h-7 ring-1 ring-border">
                  <AvatarImage src={profile?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[8px] font-mono">
                    {getInitials(profile?.full_name ?? null)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-mono text-xs font-semibold">
                  {profile?.full_name ?? "?"}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground/50 ml-auto">
                  {latest.date}
                </span>
                {grade && (
                  <span className={cn(
                    "font-mono text-lg font-black",
                    gradeStyle(grade).color
                  )}>
                    {grade}
                  </span>
                )}
              </div>

              {summary && (
                <p className="text-xs font-mono text-foreground mb-1.5">{summary}</p>
              )}
              {keyInsight && (
                <p className="text-[10px] font-mono text-muted-foreground/70 border-l-2 border-primary/30 pl-2">
                  {keyInsight}
                </p>
              )}
              {latest.recommendation && !keyInsight && (
                <p className="text-[10px] font-mono text-primary/70 mt-1">
                  {latest.recommendation}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 4: RIESGO — Resignation risk predictor
// ═══════════════════════════════════════════════════════════

interface RiskPrediction {
  name: string;
  resignation_risk: number;
  risk_level: string;
  signals: string[];
  prediction: string;
  recommended_action: string;
}

interface RiskAnalysis {
  analysis_date: string;
  predictions: RiskPrediction[];
  team_summary: string;
  highest_risk: string;
  immediate_actions: string[];
}

function TabRiesgo({ orgId }: { orgId: string }) {
  const [data, setData] = useState<RiskAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/claude-resign-predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al analizar");
      setData(json as RiskAnalysis);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="palantir-divider text-muted-foreground/40 mb-4">
        <AlertTriangle className="w-3 h-3" />
        Predicción de riesgo de renuncia
      </div>

      {!data && !loading && (
        <div className="card-palantir p-8 flex flex-col items-center gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <Scan className="w-7 h-7 text-primary/40" />
          </div>
          <p className="text-xs font-mono text-muted-foreground text-center max-w-sm">
            Analiza 30 días de datos comportamentales por persona para predecir riesgo de renuncia.
          </p>
          {error && (
            <p className="text-xs font-mono text-red-500 bg-destructive/5 border border-destructive/20 px-3 py-1.5">
              {error}
            </p>
          )}
          <Button onClick={analyze} className="font-mono text-xs bg-primary text-primary-foreground">
            <Scan className="w-3 h-3 mr-1.5" />
            Analizar Riesgo de Renuncia
          </Button>
        </div>
      )}

      {loading && (
        <div className="card-palantir p-12 flex flex-col items-center gap-4">
          <div className="w-12 h-12 border border-primary/30 flex items-center justify-center animate-border-pulse">
            <Brain className="w-6 h-6 text-primary animate-pulse" />
          </div>
          <p className="text-xs font-mono text-muted-foreground animate-pulse tracking-widest uppercase">
            Analizando señales...
          </p>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {/* Team summary */}
          <div className="card-palantir p-4 corner-marks">
            <span className="label-mono text-muted-foreground/40 mb-2 block">Resumen del equipo</span>
            <p className="text-xs font-mono text-foreground">{data.team_summary}</p>
            {data.highest_risk && (
              <p className="text-[10px] font-mono text-red-500 mt-2">
                Mayor riesgo: {data.highest_risk}
              </p>
            )}
          </div>

          {/* Immediate actions */}
          {data.immediate_actions && data.immediate_actions.length > 0 && (
            <div className="card-palantir p-4 border-red-500/20">
              <span className="label-mono text-red-500/60 mb-2 block">Acciones inmediatas</span>
              <ul className="space-y-1">
                {data.immediate_actions.map((a, i) => (
                  <li key={i} className="text-[10px] font-mono text-foreground flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Per-person risk cards */}
          <div className="space-y-3">
            {(data.predictions ?? [])
              .sort((a, b) => b.resignation_risk - a.resignation_risk)
              .map((p, i) => {
                const cfg = RISK_CONFIG[p.risk_level] ?? RISK_CONFIG.low;
                return (
                  <div
                    key={i}
                    className={cn(
                      "card-palantir p-4",
                      p.risk_level === "critical" && "animate-border-pulse"
                    )}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-xs font-semibold">{p.name}</span>
                      <Badge variant="outline" className={cn("text-[8px] font-mono h-4 ml-auto", cfg.color)}>
                        {cfg.label}
                      </Badge>
                    </div>

                    {/* Risk bar */}
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1 h-2 bg-accent/30 border border-border overflow-hidden">
                        <div
                          className={cn("h-full transition-all duration-700", cfg.bar)}
                          style={{ width: `${p.resignation_risk}%` }}
                        />
                      </div>
                      <span className={cn("font-mono text-sm font-bold tabular-nums", cfg.color)}>
                        {p.resignation_risk}%
                      </span>
                    </div>

                    <p className="text-[10px] font-mono text-foreground mb-2">{p.prediction}</p>

                    {p.signals.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {p.signals.map((s, si) => (
                          <span key={si} className="text-[8px] font-mono px-1.5 py-0.5 bg-accent/30 border border-border text-muted-foreground">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-[9px] font-mono text-primary/70 border-l-2 border-primary/30 pl-2">
                      {p.recommended_action}
                    </p>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 5: VIGILANCIA — Trust trends + flags + mood
// ═══════════════════════════════════════════════════════════

interface VigilanceMember {
  profile: Profile;
  trustHistory: TrustScoreHistory[];
  currentScore: number | null;
  delta7d: number | null;
  avgMood: number | null;
  avgEnergy: number | null;
  activeFlags: AccountabilityFlag[];
}

function TabVigilancia({ orgId }: { orgId: string }) {
  const supabase = createClient();
  const [members, setMembers] = useState<VigilanceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
  const today = getTodayMTY();

  const loadData = useCallback(async () => {
    const [
      { data: memberData },
      { data: trustData },
      { data: flagData },
      { data: entryData },
    ] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId),
      supabase
        .from("trust_score_history")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", sevenDaysAgo)
        .lte("date", today)
        .order("date", { ascending: true }),
      supabase
        .from("accountability_flags")
        .select("*")
        .eq("org_id", orgId)
        .eq("resolved", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("time_entries")
        .select("user_id, mood, energy")
        .eq("org_id", orgId)
        .gte("date", sevenDaysAgo)
        .lte("date", today),
    ]);

    if (!memberData) { setLoading(false); return; }

    const result: VigilanceMember[] = memberData.map((m) => {
      const profile = m.profiles as unknown as Profile;
      const uid = m.user_id;

      // Trust history for this user
      const userTrust = (trustData ?? []).filter((t) => t.user_id === uid) as TrustScoreHistory[];

      // Current = latest, delta = latest - oldest
      const current = userTrust.length > 0 ? userTrust[userTrust.length - 1].score : null;
      const oldest = userTrust.length > 1 ? userTrust[0].score : null;
      const delta = current !== null && oldest !== null ? current - oldest : null;

      // Flags
      const flags = (flagData ?? []).filter((f) => f.user_id === uid) as AccountabilityFlag[];

      // Mood/energy avg
      const userEntries = (entryData ?? []).filter((e) => e.user_id === uid);
      const moods = userEntries.filter((e) => e.mood).map((e) => e.mood as number);
      const energies = userEntries.filter((e) => e.energy).map((e) => e.energy as number);
      const avgMood = moods.length > 0 ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null;
      const avgEnergy = energies.length > 0 ? Math.round((energies.reduce((a, b) => a + b, 0) / energies.length) * 10) / 10 : null;

      return { profile, trustHistory: userTrust, currentScore: current, delta7d: delta, avgMood, avgEnergy, activeFlags: flags };
    });

    // Sort by flags count desc, then trust score asc
    result.sort((a, b) => {
      if (a.activeFlags.length !== b.activeFlags.length) return b.activeFlags.length - a.activeFlags.length;
      return (a.currentScore ?? 0) - (b.currentScore ?? 0);
    });

    setMembers(result);
    setLoading(false);
  }, [orgId, sevenDaysAgo, today]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <TabLoading />;

  if (members.length === 0) {
    return <TabEmpty icon={Shield} text="No hay datos de vigilancia." />;
  }

  // Get all 7 days for the trust bar chart
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    days.push(format(subDays(new Date(), i), "yyyy-MM-dd"));
  }

  return (
    <div>
      <div className="palantir-divider text-muted-foreground/40 mb-4">
        <Shield className="w-3 h-3" />
        Trust Score y salud — Últimos 7 días
      </div>

      <div className="space-y-3">
        {members.map((m) => {
          // Build trust bar data for 7 days
          const trustByDate = new Map<string, number>();
          for (const t of m.trustHistory) {
            trustByDate.set(t.date, t.score);
          }

          return (
            <div key={m.profile.id} className="card-palantir p-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="w-7 h-7 ring-1 ring-border">
                  <AvatarImage src={m.profile.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[8px] font-mono">
                    {getInitials(m.profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-mono text-xs font-semibold">
                  {m.profile.full_name ?? m.profile.email}
                </span>

                <div className="ml-auto flex items-center gap-3 text-[10px] font-mono">
                  {m.avgMood !== null && (
                    <span className="text-muted-foreground/60">
                      Mood <span className="data-number text-sm text-foreground">{m.avgMood}</span>
                    </span>
                  )}
                  {m.avgEnergy !== null && (
                    <span className="text-muted-foreground/60">
                      Energy <span className="data-number text-sm text-foreground">{m.avgEnergy}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Trust bar chart — 7 days */}
              <div className="flex items-end gap-1 h-10 mb-2">
                {days.map((day) => {
                  const score = trustByDate.get(day);
                  const height = score ? `${Math.max(score, 5)}%` : "2%";
                  const color = score
                    ? score >= 80 ? "bg-green-500" : score >= 50 ? "bg-amber-500" : "bg-red-500"
                    : "bg-border";
                  return (
                    <div key={day} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full relative" style={{ height: "40px" }}>
                        <div
                          className={cn("absolute bottom-0 w-full transition-all duration-500", color)}
                          style={{ height }}
                        />
                      </div>
                      <span className="text-[7px] font-mono text-muted-foreground/40">
                        {format(new Date(day + "T12:00:00"), "EEE", { locale: es }).slice(0, 2)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Score + delta */}
              <div className="flex items-center gap-3">
                {m.currentScore !== null && (
                  <span className={cn(
                    "data-number text-xl",
                    m.currentScore >= 80 ? "text-green-600 dark:text-green-400" :
                    m.currentScore >= 50 ? "text-amber-600 dark:text-amber-400" :
                    "text-red-600 dark:text-red-400"
                  )}>
                    {m.currentScore}
                  </span>
                )}
                {m.delta7d !== null && (
                  <span className={cn(
                    "flex items-center gap-0.5 font-mono text-[10px] font-semibold",
                    m.delta7d > 0 ? "text-green-500" : m.delta7d < 0 ? "text-red-500" : "text-muted-foreground"
                  )}>
                    {m.delta7d > 0 ? <TrendingUp className="w-3 h-3" /> :
                     m.delta7d < 0 ? <TrendingDown className="w-3 h-3" /> :
                     <Minus className="w-3 h-3" />}
                    {m.delta7d > 0 ? "+" : ""}{m.delta7d}
                  </span>
                )}

                {/* Flags */}
                {m.activeFlags.length > 0 && (
                  <div className="flex gap-1 ml-auto flex-wrap justify-end">
                    {m.activeFlags.slice(0, 3).map((f) => {
                      const cfg = FLAG_TYPES[f.flag_type as keyof typeof FLAG_TYPES];
                      return (
                        <Badge
                          key={f.id}
                          variant="outline"
                          className={cn(
                            "text-[7px] font-mono h-4",
                            cfg?.severity === "high" ? "border-red-400 text-red-500" :
                            cfg?.severity === "medium" ? "border-amber-400 text-amber-500" :
                            "border-border text-muted-foreground"
                          )}
                        >
                          {cfg?.emoji} {cfg?.label ?? f.flag_type}
                        </Badge>
                      );
                    })}
                    {m.activeFlags.length > 3 && (
                      <span className="text-[8px] font-mono text-muted-foreground">
                        +{m.activeFlags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 6: AUDITORÍA — Lottery + flags + stats
// ═══════════════════════════════════════════════════════════

function TabAuditoria({ orgId }: { orgId: string }) {
  const supabase = createClient();
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const [lotteries, setLotteries] = useState<(AuditLottery & { profiles?: Profile })[]>([]);
  const [flags, setFlags] = useState<(AccountabilityFlag & { profiles?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [
      { data: lotteryData },
      { data: flagData },
    ] = await Promise.all([
      supabase
        .from("audit_lotteries")
        .select("*, profiles:selected_user_id(full_name, avatar_url)")
        .eq("org_id", orgId)
        .gte("date", thirtyDaysAgo)
        .order("date", { ascending: false })
        .limit(20),
      supabase
        .from("accountability_flags")
        .select("*, profiles:user_id(full_name, avatar_url)")
        .eq("org_id", orgId)
        .gte("created_at", thirtyDaysAgo + "T00:00:00")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    setLotteries((lotteryData ?? []) as (AuditLottery & { profiles?: Profile })[]);
    setFlags((flagData ?? []) as (AccountabilityFlag & { profiles?: Profile })[]);
    setLoading(false);
  }, [orgId, thirtyDaysAgo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <TabLoading />;

  // Stats
  const totalAudits = lotteries.length;
  const passed = lotteries.filter((l) => l.status === "passed").length;
  const failed = lotteries.filter((l) => l.status === "failed").length;
  const passRate = totalAudits > 0 ? Math.round((passed / totalAudits) * 100) : 0;
  const totalFlags = flags.length;
  const unresolvedFlags = flags.filter((f) => !f.resolved).length;

  return (
    <div>
      <div className="palantir-divider text-muted-foreground/40 mb-4">
        <Eye className="w-3 h-3" />
        Auditorías y flags — Últimos 30 días
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatBox label="Auditorías" value={totalAudits} />
        <StatBox label="Pass Rate" value={`${passRate}%`} />
        <StatBox label="Total Flags" value={totalFlags} alert={totalFlags > 0} />
        <StatBox label="Sin resolver" value={unresolvedFlags} alert={unresolvedFlags > 0} />
      </div>

      {/* Lottery results */}
      {lotteries.length > 0 && (
        <section className="mb-8">
          <span className="label-mono text-muted-foreground/40 mb-3 block">Lotería de auditoría</span>
          <div className="space-y-2">
            {lotteries.map((l) => {
              const profile = l.profiles as unknown as { full_name: string | null; avatar_url: string | null } | null;
              return (
                <div key={l.id} className="card-palantir p-3 flex items-center gap-3">
                  <Avatar className="w-6 h-6 ring-1 ring-border">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[7px] font-mono">
                      {getInitials(profile?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-mono text-[10px] font-semibold">
                    {profile?.full_name ?? "?"}
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground/50">
                    {l.date}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[8px] font-mono h-4 ml-auto",
                      l.status === "passed" ? "border-green-400 text-green-600" :
                      l.status === "failed" ? "border-red-400 text-red-600" :
                      "border-border text-muted-foreground"
                    )}
                  >
                    {l.status === "passed" ? "PASSED" :
                     l.status === "failed" ? "FAILED" :
                     l.status === "auditing" ? "EN CURSO" :
                     "PENDIENTE"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Active flags */}
      {flags.length > 0 && (
        <section>
          <span className="label-mono text-muted-foreground/40 mb-3 block">Flags recientes</span>
          <div className="space-y-2">
            {flags.map((f) => {
              const profile = f.profiles as unknown as { full_name: string | null; avatar_url: string | null } | null;
              const cfg = FLAG_TYPES[f.flag_type as keyof typeof FLAG_TYPES];
              return (
                <div key={f.id} className="card-palantir p-3 flex items-center gap-3">
                  <span className="text-sm">{cfg?.emoji ?? "?"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-semibold">
                        {profile?.full_name ?? "?"}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[7px] font-mono h-3.5",
                          cfg?.severity === "high" ? "border-red-400 text-red-500" :
                          cfg?.severity === "medium" ? "border-amber-400 text-amber-500" :
                          "border-border text-muted-foreground"
                        )}
                      >
                        {cfg?.label ?? f.flag_type}
                      </Badge>
                    </div>
                    {f.details && (
                      <p className="text-[9px] font-mono text-muted-foreground/60 truncate mt-0.5">
                        {f.details}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[8px] text-muted-foreground/40">
                      {f.date}
                    </span>
                    {f.resolved ? (
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {lotteries.length === 0 && flags.length === 0 && (
        <TabEmpty icon={FileSearch} text="Sin auditorías ni flags en los últimos 30 días." />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════

function TabLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
        Cargando...
      </div>
    </div>
  );
}

function TabEmpty({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 border border-border flex items-center justify-center">
        <Icon className="w-7 h-7 text-primary/40" />
      </div>
      <p className="text-xs font-mono text-muted-foreground">{text}</p>
    </div>
  );
}

function StatBox({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className={cn("bg-accent/30 border border-border p-3", alert && Number(value) > 0 && "border-red-500/30")}>
      <span className="label-mono text-muted-foreground/40 block mb-1">{label}</span>
      <span className={cn(
        "data-number text-2xl",
        alert && Number(value) > 0 ? "text-red-500" : "text-foreground"
      )}>
        {value}
      </span>
    </div>
  );
}
