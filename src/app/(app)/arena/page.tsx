"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  FocusDuel,
  TaskAuction,
  AuctionBid,
  TrustInvestment,
  TrustScoreHistory,
  Prediction,
  PredictionBet,
} from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import {
  Swords,
  Crosshair,
  CandlestickChart,
  Coins,
  Trophy,
  Clock,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Plus,
  Loader2,
  Check,
  X,
  Gavel,
  Target,
  Hammer,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────

type Tab = "duelos" | "bounties" | "mercado" | "apuestas";

interface TeamMember {
  user_id: string;
  profile: Profile;
}

interface DuelWithProfiles extends FocusDuel {
  challenger_profile: Profile | null;
  opponent_profile: Profile | null;
}

interface AuctionWithDetails extends TaskAuction {
  creator_profile: Profile | null;
  bids: (AuctionBid & { profile: Profile | null })[];
  winner_profile: Profile | null;
}

interface MemberStock {
  user_id: string;
  profile: Profile;
  current_score: number;
  prev_score: number;
  trend_pct: number;
  investments_in: number;
}

interface PredictionWithBets extends Prediction {
  creator_profile: Profile | null;
  bets: (PredictionBet & { profile: Profile | null })[];
  my_bet: PredictionBet | null;
}

// ─── Tab Config ─────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "duelos", label: "DUELOS", icon: Swords },
  { id: "bounties", label: "BOUNTIES", icon: Crosshair },
  { id: "mercado", label: "MERCADO", icon: CandlestickChart },
  { id: "apuestas", label: "APUESTAS", icon: Coins },
];

// ─── Main Page ──────────────────────────────────────────────────

export default function ArenaPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("duelos");
  const [loading, setLoading] = useState(true);
  const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Duels state
  const [duels, setDuels] = useState<DuelWithProfiles[]>([]);
  const [duelOpponent, setDuelOpponent] = useState("");
  const [creatingDuel, setCreatingDuel] = useState(false);

  // Auctions state
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [showAuctionForm, setShowAuctionForm] = useState(false);
  const [auctionTitle, setAuctionTitle] = useState("");
  const [auctionDesc, setAuctionDesc] = useState("");
  const [auctionMaxHours, setAuctionMaxHours] = useState("4");
  const [auctionDeadline, setAuctionDeadline] = useState("");
  const [creatingAuction, setCreatingAuction] = useState(false);

  // Market state
  const [stocks, setStocks] = useState<MemberStock[]>([]);
  const [myInvestments, setMyInvestments] = useState<(TrustInvestment & { target_profile: Profile | null })[]>([]);

  // Predictions state
  const [predictions, setPredictions] = useState<PredictionWithBets[]>([]);

  const today = getTodayMTY();

  // ─── Load team profiles ────────────────────────────────────────

  const loadProfiles = useCallback(async () => {
    if (!orgId) return new Map<string, Profile>();
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    const map = new Map<string, Profile>();
    const team: TeamMember[] = [];
    for (const m of members ?? []) {
      if (m.profiles) {
        const p = m.profiles as unknown as Profile;
        map.set(m.user_id, p);
        if (m.user_id !== userId) {
          team.push({ user_id: m.user_id, profile: p });
        }
      }
    }
    setProfileMap(map);
    setTeamMembers(team);
    return map;
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load duels ────────────────────────────────────────────────

  const loadDuels = useCallback(async (pMap: Map<string, Profile>) => {
    if (!orgId) return;
    const { data } = await supabase
      .from("focus_duels")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(30);

    setDuels(
      (data ?? []).map((d) => ({
        ...d,
        challenger_profile: pMap.get(d.challenger_id) ?? null,
        opponent_profile: pMap.get(d.opponent_id) ?? null,
      }))
    );
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load auctions ────────────────────────────────────────────

  const loadAuctions = useCallback(async (pMap: Map<string, Profile>) => {
    if (!orgId) return;
    const { data: auctionData } = await supabase
      .from("task_auctions")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20);

    const auctionIds = (auctionData ?? []).map((a) => a.id);

    let bidsData: AuctionBid[] = [];
    if (auctionIds.length > 0) {
      const { data: bd } = await supabase
        .from("auction_bids")
        .select("*")
        .in("auction_id", auctionIds)
        .order("hours_bid", { ascending: true });
      bidsData = bd ?? [];
    }

    setAuctions(
      (auctionData ?? []).map((a) => ({
        ...a,
        creator_profile: pMap.get(a.created_by) ?? null,
        winner_profile: a.winner_id ? pMap.get(a.winner_id) ?? null : null,
        bids: bidsData
          .filter((b) => b.auction_id === a.id)
          .map((b) => ({ ...b, profile: pMap.get(b.user_id) ?? null })),
      }))
    );
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load market ───────────────────────────────────────────────

  const loadMarket = useCallback(async (pMap: Map<string, Profile>) => {
    if (!orgId || !userId) return;

    // Get the last 2 trust score entries for each member
    const { data: scores } = await supabase
      .from("trust_score_history")
      .select("user_id, date, score")
      .eq("org_id", orgId)
      .order("date", { ascending: false })
      .limit(200);

    // Group by user, take last 2 entries
    const byUser = new Map<string, TrustScoreHistory[]>();
    for (const s of scores ?? []) {
      const arr = byUser.get(s.user_id) ?? [];
      if (arr.length < 2) arr.push(s as TrustScoreHistory);
      byUser.set(s.user_id, arr);
    }

    // Get active investments
    const { data: investments } = await supabase
      .from("trust_investments")
      .select("*")
      .eq("org_id", orgId)
      .eq("status", "active");

    const investmentsByTarget = new Map<string, number>();
    for (const inv of investments ?? []) {
      investmentsByTarget.set(inv.target_id, (investmentsByTarget.get(inv.target_id) ?? 0) + inv.amount);
    }

    const memberStocks: MemberStock[] = [];
    for (const [uid, profile] of pMap) {
      const history = byUser.get(uid) ?? [];
      const currentScore = history[0]?.score ?? 50;
      const prevScore = history[1]?.score ?? currentScore;
      const diff = currentScore - prevScore;
      const trendPct = prevScore > 0 ? (diff / prevScore) * 100 : 0;

      memberStocks.push({
        user_id: uid,
        profile,
        current_score: currentScore,
        prev_score: prevScore,
        trend_pct: trendPct,
        investments_in: investmentsByTarget.get(uid) ?? 0,
      });
    }
    memberStocks.sort((a, b) => b.current_score - a.current_score);
    setStocks(memberStocks);

    // My investments
    const myInv = (investments ?? [])
      .filter((i) => i.investor_id === userId)
      .map((i) => ({ ...i, target_profile: pMap.get(i.target_id) ?? null }));
    setMyInvestments(myInv);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load predictions ─────────────────────────────────────────

  const loadPredictions = useCallback(async (pMap: Map<string, Profile>) => {
    if (!orgId || !userId) return;

    const { data: preds } = await supabase
      .from("predictions")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20);

    const predIds = (preds ?? []).map((p) => p.id);
    let betsData: PredictionBet[] = [];
    if (predIds.length > 0) {
      const { data: bd } = await supabase
        .from("prediction_bets")
        .select("*")
        .in("prediction_id", predIds);
      betsData = bd ?? [];
    }

    setPredictions(
      (preds ?? []).map((p) => {
        const allBets = betsData.filter((b) => b.prediction_id === p.id);
        return {
          ...p,
          creator_profile: pMap.get(p.created_by) ?? null,
          bets: allBets.map((b) => ({ ...b, profile: pMap.get(b.user_id) ?? null })),
          my_bet: allBets.find((b) => b.user_id === userId) ?? null,
        };
      })
    );
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Initial load ──────────────────────────────────────────────

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      return;
    }

    async function init() {
      const pMap = await loadProfiles();
      await Promise.all([
        loadDuels(pMap),
        loadAuctions(pMap),
        loadMarket(pMap),
        loadPredictions(pMap),
      ]);
      setLoading(false);
    }
    init();
  }, [orgLoading, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ───────────────────────────────────────────────────

  async function createDuel() {
    if (!orgId || !userId || !duelOpponent) return;
    setCreatingDuel(true);
    await supabase.from("focus_duels").insert({
      org_id: orgId,
      challenger_id: userId,
      opponent_id: duelOpponent,
      date: today,
      status: "pending",
      challenger_hours: 0,
      opponent_hours: 0,
    });
    setDuelOpponent("");
    const pMap = await loadProfiles();
    await loadDuels(pMap);
    setCreatingDuel(false);
  }

  async function acceptDuel(duelId: string) {
    await supabase.from("focus_duels").update({ status: "active" }).eq("id", duelId);
    const pMap = await loadProfiles();
    await loadDuels(pMap);
  }

  async function createAuction() {
    if (!orgId || !userId || !auctionTitle) return;
    setCreatingAuction(true);
    const deadline = auctionDeadline || new Date(Date.now() + 86400000).toISOString().split("T")[0];
    await supabase.from("task_auctions").insert({
      org_id: orgId,
      created_by: userId,
      title: auctionTitle,
      description: auctionDesc || null,
      max_hours: Number(auctionMaxHours) || 4,
      status: "open",
      deadline,
    });
    setAuctionTitle("");
    setAuctionDesc("");
    setAuctionMaxHours("4");
    setAuctionDeadline("");
    setShowAuctionForm(false);
    const pMap = await loadProfiles();
    await loadAuctions(pMap);
    setCreatingAuction(false);
  }

  async function placeBid(auctionId: string, hours: number) {
    if (!userId) return;
    await supabase.from("auction_bids").insert({
      auction_id: auctionId,
      user_id: userId,
      hours_bid: hours,
    });
    const pMap = await loadProfiles();
    await loadAuctions(pMap);
  }

  async function placePredictionBet(predictionId: string, bet: string, confidence: number) {
    if (!userId) return;
    await supabase.from("prediction_bets").insert({
      prediction_id: predictionId,
      user_id: userId,
      bet,
      confidence,
    });
    const pMap = await loadProfiles();
    await loadPredictions(pMap);
  }

  // ─── Loading ───────────────────────────────────────────────────

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando arena...
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="font-mono text-xs text-muted-foreground">Sin organización</p>
      </div>
    );
  }

  // ─── Split duels ───────────────────────────────────────────────

  const activeDuels = duels.filter((d) => d.status === "active" || d.status === "pending");
  const completedDuels = duels.filter((d) => d.status === "completed");

  const openAuctions = auctions.filter((a) => a.status === "open");
  const closedAuctions = auctions.filter((a) => a.status !== "open");

  const openPredictions = predictions.filter((p) => p.status === "open");
  const resolvedPredictions = predictions.filter((p) => p.status !== "open");

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Swords className="w-4 h-4 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Arena
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Competencias, subastas, mercado de confianza y predicciones
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border mb-8">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 font-mono text-xs uppercase tracking-wide transition-colors flex items-center gap-1.5 cursor-pointer",
              tab === t.id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "duelos" && (
        <DuelosTab
          duels={activeDuels}
          completedDuels={completedDuels}
          teamMembers={teamMembers}
          userId={userId}
          duelOpponent={duelOpponent}
          setDuelOpponent={setDuelOpponent}
          creatingDuel={creatingDuel}
          createDuel={createDuel}
          acceptDuel={acceptDuel}
        />
      )}
      {tab === "bounties" && (
        <BountiesTab
          auctions={openAuctions}
          closedAuctions={closedAuctions}
          userId={userId}
          showForm={showAuctionForm}
          setShowForm={setShowAuctionForm}
          auctionTitle={auctionTitle}
          setAuctionTitle={setAuctionTitle}
          auctionDesc={auctionDesc}
          setAuctionDesc={setAuctionDesc}
          auctionMaxHours={auctionMaxHours}
          setAuctionMaxHours={setAuctionMaxHours}
          auctionDeadline={auctionDeadline}
          setAuctionDeadline={setAuctionDeadline}
          creating={creatingAuction}
          createAuction={createAuction}
          placeBid={placeBid}
        />
      )}
      {tab === "mercado" && (
        <MercadoTab
          stocks={stocks}
          myInvestments={myInvestments}
          userId={userId}
        />
      )}
      {tab === "apuestas" && (
        <ApuestasTab
          predictions={openPredictions}
          resolvedPredictions={resolvedPredictions}
          userId={userId}
          placeBet={placePredictionBet}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 1: DUELOS
// ═══════════════════════════════════════════════════════════════════

function DuelosTab({
  duels,
  completedDuels,
  teamMembers,
  userId,
  duelOpponent,
  setDuelOpponent,
  creatingDuel,
  createDuel,
  acceptDuel,
}: {
  duels: DuelWithProfiles[];
  completedDuels: DuelWithProfiles[];
  teamMembers: TeamMember[];
  userId: string | null;
  duelOpponent: string;
  setDuelOpponent: (v: string) => void;
  creatingDuel: boolean;
  createDuel: () => void;
  acceptDuel: (id: string) => void;
}) {
  return (
    <div className="space-y-8">
      {/* Create duel */}
      <div>
        <p className="palantir-divider text-muted-foreground/40 mb-3">RETAR</p>
        <div className="border border-border p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {teamMembers.map((m) => (
              <button
                key={m.user_id}
                onClick={() => setDuelOpponent(m.user_id)}
                className={cn(
                  "flex items-center gap-2 p-2 text-left transition-colors border cursor-pointer",
                  duelOpponent === m.user_id
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/30"
                )}
              >
                <Avatar className="w-6 h-6 ring-1 ring-border">
                  <AvatarImage src={m.profile.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[8px] font-mono">
                    {getInitials(m.profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-mono truncate">
                  {m.profile.full_name?.split(" ")[0] ?? m.profile.email}
                </span>
                {duelOpponent === m.user_id && (
                  <Check className="w-3 h-3 text-primary ml-auto shrink-0" />
                )}
              </button>
            ))}
          </div>
          <Button
            className="w-full bg-primary font-mono text-xs gap-2"
            disabled={!duelOpponent || creatingDuel}
            onClick={createDuel}
          >
            {creatingDuel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Swords className="w-3 h-3" />}
            {creatingDuel ? "Creando..." : "Retar a Focus Duel"}
          </Button>
        </div>
      </div>

      {/* Active duels */}
      <div>
        <p className="palantir-divider text-muted-foreground/40 mb-3">DUELOS ACTIVOS</p>
        {duels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <Swords className="w-6 h-6 text-primary/40" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">Sin duelos activos. Reta a alguien.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {duels.map((d) => {
              const isPending = d.status === "pending";
              const isOpponent = d.opponent_id === userId;
              const leading =
                d.challenger_hours > d.opponent_hours
                  ? "challenger"
                  : d.opponent_hours > d.challenger_hours
                    ? "opponent"
                    : "tie";

              return (
                <div
                  key={d.id}
                  className="border border-border p-3 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-center gap-3">
                    {/* Challenger */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Avatar className="w-7 h-7 ring-1 ring-border">
                        <AvatarImage src={d.challenger_profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[8px] font-mono">
                          {getInitials(d.challenger_profile?.full_name ?? null)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-xs font-mono truncate">
                          {d.challenger_profile?.full_name?.split(" ")[0] ?? "?"}
                        </p>
                        <p className={cn(
                          "text-sm font-mono tabular-nums tracking-tight font-bold",
                          leading === "challenger" && "text-green-500"
                        )}>
                          {d.challenger_hours}h
                        </p>
                      </div>
                    </div>

                    {/* VS */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <span className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground/40 uppercase">VS</span>
                      <Badge variant="outline" className="font-mono text-[9px]">
                        {isPending ? "Pendiente" : d.date}
                      </Badge>
                    </div>

                    {/* Opponent */}
                    <div className="flex items-center gap-2 flex-1 min-w-0 justify-end text-right">
                      <div className="min-w-0">
                        <p className="text-xs font-mono truncate">
                          {d.opponent_profile?.full_name?.split(" ")[0] ?? "?"}
                        </p>
                        <p className={cn(
                          "text-sm font-mono tabular-nums tracking-tight font-bold",
                          leading === "opponent" && "text-green-500"
                        )}>
                          {d.opponent_hours}h
                        </p>
                      </div>
                      <Avatar className="w-7 h-7 ring-1 ring-border">
                        <AvatarImage src={d.opponent_profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[8px] font-mono">
                          {getInitials(d.opponent_profile?.full_name ?? null)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </div>

                  {/* Accept button for pending duels */}
                  {isPending && isOpponent && (
                    <div className="mt-2 pt-2 border-t border-border flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-mono text-xs gap-1.5"
                        onClick={() => acceptDuel(d.id)}
                      >
                        <Check className="w-3 h-3" />
                        Aceptar duelo
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed duels */}
      {completedDuels.length > 0 && (
        <div>
          <p className="palantir-divider text-muted-foreground/40 mb-3">HISTORIAL</p>
          <div className="space-y-1">
            {completedDuels.slice(0, 10).map((d) => {
              const challengerWon = d.winner_id === d.challenger_id;
              return (
                <div key={d.id} className="border border-border/50 p-2 flex items-center gap-3">
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-20 shrink-0">
                    {d.date}
                  </span>
                  <span className={cn("text-xs font-mono truncate", challengerWon && "text-green-500")}>
                    {d.challenger_profile?.full_name?.split(" ")[0] ?? "?"} ({d.challenger_hours}h)
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/40">vs</span>
                  <span className={cn("text-xs font-mono truncate", !challengerWon && d.winner_id && "text-green-500")}>
                    {d.opponent_profile?.full_name?.split(" ")[0] ?? "?"} ({d.opponent_hours}h)
                  </span>
                  <Trophy className="w-3 h-3 text-amber-500 ml-auto shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 2: BOUNTIES + SUBASTAS
// ═══════════════════════════════════════════════════════════════════

function BountiesTab({
  auctions,
  closedAuctions,
  userId,
  showForm,
  setShowForm,
  auctionTitle,
  setAuctionTitle,
  auctionDesc,
  setAuctionDesc,
  auctionMaxHours,
  setAuctionMaxHours,
  auctionDeadline,
  setAuctionDeadline,
  creating,
  createAuction,
  placeBid,
}: {
  auctions: AuctionWithDetails[];
  closedAuctions: AuctionWithDetails[];
  userId: string | null;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  auctionTitle: string;
  setAuctionTitle: (v: string) => void;
  auctionDesc: string;
  setAuctionDesc: (v: string) => void;
  auctionMaxHours: string;
  setAuctionMaxHours: (v: string) => void;
  auctionDeadline: string;
  setAuctionDeadline: (v: string) => void;
  creating: boolean;
  createAuction: () => void;
  placeBid: (auctionId: string, hours: number) => void;
}) {
  const [bidAmounts, setBidAmounts] = useState<Record<string, string>>({});

  return (
    <div className="space-y-8">
      {/* Create auction */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="palantir-divider text-muted-foreground/40 flex-1">SUBASTAS DE TAREAS</p>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs gap-1.5"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="w-3 h-3" />
            Nueva
          </Button>
        </div>

        {showForm && (
          <div className="border border-border p-4 mb-4 space-y-3">
            <Input
              placeholder="Titulo de la tarea"
              value={auctionTitle}
              onChange={(e) => setAuctionTitle(e.target.value)}
              className="font-mono text-xs"
            />
            <Textarea
              placeholder="Descripción (opcional)"
              value={auctionDesc}
              onChange={(e) => setAuctionDesc(e.target.value)}
              className="font-mono text-xs"
              rows={2}
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-1 block">
                  Max horas
                </label>
                <Input
                  type="number"
                  value={auctionMaxHours}
                  onChange={(e) => setAuctionMaxHours(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex-1">
                <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-1 block">
                  Deadline
                </label>
                <Input
                  type="date"
                  value={auctionDeadline}
                  onChange={(e) => setAuctionDeadline(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <Button
              className="w-full bg-primary font-mono text-xs gap-2"
              disabled={!auctionTitle || creating}
              onClick={createAuction}
            >
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hammer className="w-3 h-3" />}
              {creating ? "Creando..." : "Publicar subasta"}
            </Button>
          </div>
        )}

        {/* Open auctions */}
        {auctions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <Crosshair className="w-6 h-6 text-primary/40" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">Sin subastas abiertas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {auctions.map((a) => {
              const lowestBid = a.bids.length > 0 ? Math.min(...a.bids.map((b) => b.hours_bid)) : null;
              const myBid = a.bids.find((b) => b.user_id === userId);

              return (
                <div
                  key={a.id}
                  className="border border-border p-3 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-mono font-medium">{a.title}</p>
                      {a.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Max {a.max_hours}h
                        </span>
                        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                          {a.bids.length} ofertas
                        </span>
                        {lowestBid !== null && (
                          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-green-500">
                            Mejor: {lowestBid}h
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Avatar className="w-5 h-5 ring-1 ring-border">
                        <AvatarImage src={a.creator_profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[7px] font-mono">
                          {getInitials(a.creator_profile?.full_name ?? null)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </div>

                  {/* Bid input */}
                  {a.created_by !== userId && !myBid && (
                    <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="Horas"
                        className="font-mono text-xs w-20"
                        value={bidAmounts[a.id] ?? ""}
                        onChange={(e) => setBidAmounts({ ...bidAmounts, [a.id]: e.target.value })}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-mono text-xs gap-1"
                        disabled={!bidAmounts[a.id]}
                        onClick={() => {
                          placeBid(a.id, Number(bidAmounts[a.id]));
                          setBidAmounts({ ...bidAmounts, [a.id]: "" });
                        }}
                      >
                        <Gavel className="w-3 h-3" />
                        Ofertar
                      </Button>
                    </div>
                  )}
                  {myBid && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-primary flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Tu oferta: {myBid.hours_bid}h
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Closed auctions */}
      {closedAuctions.length > 0 && (
        <div>
          <p className="palantir-divider text-muted-foreground/40 mb-3">COMPLETADAS</p>
          <div className="space-y-1">
            {closedAuctions.slice(0, 8).map((a) => (
              <div key={a.id} className="border border-border/50 p-2 flex items-center gap-3">
                <Badge variant="outline" className="font-mono text-[8px] shrink-0">
                  {a.status}
                </Badge>
                <span className="text-xs font-mono truncate flex-1">{a.title}</span>
                {a.winning_bid && (
                  <span className="text-xs font-mono tabular-nums text-green-500">{a.winning_bid}h</span>
                )}
                {a.winner_profile && (
                  <Avatar className="w-5 h-5 ring-1 ring-border shrink-0">
                    <AvatarImage src={a.winner_profile.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[7px] font-mono">
                      {getInitials(a.winner_profile.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 3: MERCADO
// ═══════════════════════════════════════════════════════════════════

function MercadoTab({
  stocks,
  myInvestments,
  userId,
}: {
  stocks: MemberStock[];
  myInvestments: (TrustInvestment & { target_profile: Profile | null })[];
  userId: string | null;
}) {
  return (
    <div className="space-y-8">
      {/* Portfolio */}
      {myInvestments.length > 0 && (
        <div>
          <p className="palantir-divider text-muted-foreground/40 mb-3">MI PORTAFOLIO</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {myInvestments.map((inv) => {
              const gain = inv.current_value - inv.amount;
              const isUp = gain >= 0;
              return (
                <div key={inv.id} className="bg-accent/30 border border-border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="w-6 h-6 ring-1 ring-border">
                      <AvatarImage src={inv.target_profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[8px] font-mono">
                        {getInitials(inv.target_profile?.full_name ?? null)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-mono truncate">
                      {inv.target_profile?.full_name?.split(" ")[0] ?? "?"}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-lg tabular-nums tracking-tight font-bold">
                      {inv.current_value}
                    </span>
                    <span className={cn(
                      "font-mono text-xs tabular-nums",
                      isUp ? "text-green-500" : "text-red-500"
                    )}>
                      {isUp ? "+" : ""}{gain}
                    </span>
                  </div>
                  <p className="font-mono text-[9px] text-muted-foreground/40 mt-1">
                    Invertido: {inv.amount}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stock board */}
      <div>
        <p className="palantir-divider text-muted-foreground/40 mb-3">TRUST MARKET</p>
        {stocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <CandlestickChart className="w-6 h-6 text-primary/40" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">Sin datos de Trust Score.</p>
          </div>
        ) : (
          <div className="border border-border divide-y divide-border">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 p-2 text-muted-foreground/40">
              <span className="col-span-1 font-mono text-[9px] tracking-[0.18em] uppercase">#</span>
              <span className="col-span-4 font-mono text-[9px] tracking-[0.18em] uppercase">Miembro</span>
              <span className="col-span-2 font-mono text-[9px] tracking-[0.18em] uppercase text-right">Score</span>
              <span className="col-span-2 font-mono text-[9px] tracking-[0.18em] uppercase text-right">Trend</span>
              <span className="col-span-3 font-mono text-[9px] tracking-[0.18em] uppercase text-right">Inversiones</span>
            </div>

            {stocks.map((s, i) => {
              const isMe = s.user_id === userId;
              const isUp = s.trend_pct >= 0;
              return (
                <div
                  key={s.user_id}
                  className={cn(
                    "grid grid-cols-12 gap-2 p-2 items-center transition-colors hover:bg-accent/20",
                    isMe && "bg-primary/5"
                  )}
                >
                  <span className="col-span-1 font-mono text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="col-span-4 flex items-center gap-2 min-w-0">
                    <Avatar className="w-6 h-6 ring-1 ring-border">
                      <AvatarImage src={s.profile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[8px] font-mono">
                        {getInitials(s.profile.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className={cn("text-xs font-mono truncate", isMe && "text-primary font-medium")}>
                      {s.profile.full_name?.split(" ")[0] ?? s.profile.email}
                    </span>
                  </div>
                  <span className="col-span-2 font-mono text-sm tabular-nums tracking-tight font-bold text-right">
                    {s.current_score}
                  </span>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    {isUp ? (
                      <TrendingUp className="w-3 h-3 text-green-500" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-red-500" />
                    )}
                    <span className={cn(
                      "font-mono text-xs tabular-nums",
                      isUp ? "text-green-500" : "text-red-500"
                    )}>
                      {isUp ? "+" : ""}{s.trend_pct.toFixed(1)}%
                    </span>
                  </div>
                  <span className="col-span-3 font-mono text-xs tabular-nums text-right text-muted-foreground">
                    {s.investments_in > 0 ? `${s.investments_in} pts` : "-"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 4: APUESTAS
// ═══════════════════════════════════════════════════════════════════

function ApuestasTab({
  predictions,
  resolvedPredictions,
  userId,
  placeBet,
}: {
  predictions: PredictionWithBets[];
  resolvedPredictions: PredictionWithBets[];
  userId: string | null;
  placeBet: (predictionId: string, bet: string, confidence: number) => void;
}) {
  const [betInputs, setBetInputs] = useState<Record<string, { bet: string; confidence: number }>>({});

  return (
    <div className="space-y-8">
      <div>
        <p className="palantir-divider text-muted-foreground/40 mb-3">PREDICCIONES ACTIVAS</p>
        {predictions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <Target className="w-6 h-6 text-primary/40" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">Sin predicciones abiertas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {predictions.map((p) => {
              const totalBets = p.bets.length;
              const yesBets = p.bets.filter((b) => b.bet === "yes" || b.bet === "si").length;
              const yesPercent = totalBets > 0 ? Math.round((yesBets / totalBets) * 100) : 50;

              return (
                <div
                  key={p.id}
                  className="border border-border p-3 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-medium">{p.question}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {p.resolution_date}
                        </span>
                        <Badge variant="outline" className="font-mono text-[8px]">
                          {p.type === "yes_no" ? "Si/No" : p.type}
                        </Badge>
                        <span className="font-mono text-[9px] text-muted-foreground/40">
                          {totalBets} apuestas
                        </span>
                      </div>
                    </div>
                    {p.creator_profile && (
                      <Avatar className="w-5 h-5 ring-1 ring-border shrink-0">
                        <AvatarImage src={p.creator_profile.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[7px] font-mono">
                          {getInitials(p.creator_profile.full_name ?? null)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>

                  {/* Probability bar */}
                  {totalBets > 0 && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-accent/30 w-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${yesPercent}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="font-mono text-[9px] text-green-500">{yesPercent}% Si</span>
                        <span className="font-mono text-[9px] text-red-500">{100 - yesPercent}% No</span>
                      </div>
                    </div>
                  )}

                  {/* Bet input */}
                  {p.my_bet ? (
                    <div className="mt-2 pt-2 border-t border-border">
                      <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-primary flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        Tu apuesta: {p.my_bet.bet} (confianza: {p.my_bet.confidence}%)
                      </span>
                    </div>
                  ) : p.type === "yes_no" ? (
                    <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-mono text-xs gap-1 flex-1"
                        onClick={() => placeBet(p.id, "yes", 75)}
                      >
                        <Check className="w-3 h-3 text-green-500" />
                        Si
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-mono text-xs gap-1 flex-1"
                        onClick={() => placeBet(p.id, "no", 75)}
                      >
                        <X className="w-3 h-3 text-red-500" />
                        No
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
                      <Input
                        placeholder="Tu predicción"
                        className="font-mono text-xs flex-1"
                        value={betInputs[p.id]?.bet ?? ""}
                        onChange={(e) =>
                          setBetInputs({
                            ...betInputs,
                            [p.id]: { bet: e.target.value, confidence: betInputs[p.id]?.confidence ?? 75 },
                          })
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-mono text-xs gap-1"
                        disabled={!betInputs[p.id]?.bet}
                        onClick={() => {
                          const input = betInputs[p.id];
                          if (input?.bet) {
                            placeBet(p.id, input.bet, input.confidence);
                            setBetInputs({ ...betInputs, [p.id]: { bet: "", confidence: 75 } });
                          }
                        }}
                      >
                        <ArrowRight className="w-3 h-3" />
                        Apostar
                      </Button>
                    </div>
                  )}

                  {/* Who bet */}
                  {p.bets.length > 0 && (
                    <div className="mt-2 flex items-center gap-1">
                      {p.bets.slice(0, 5).map((b) => (
                        <Avatar key={b.id} className="w-4 h-4 ring-1 ring-border">
                          <AvatarImage src={b.profile?.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[6px] font-mono">
                            {getInitials(b.profile?.full_name ?? null)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {p.bets.length > 5 && (
                        <span className="font-mono text-[9px] text-muted-foreground/40">
                          +{p.bets.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Resolved predictions */}
      {resolvedPredictions.length > 0 && (
        <div>
          <p className="palantir-divider text-muted-foreground/40 mb-3">RESUELTAS</p>
          <div className="space-y-1">
            {resolvedPredictions.slice(0, 10).map((p) => (
              <div key={p.id} className="border border-border/50 p-2 flex items-center gap-3">
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-[8px] shrink-0",
                    p.status === "resolved_yes" && "border-green-500/30 text-green-500",
                    p.status === "resolved_no" && "border-red-500/30 text-red-500"
                  )}
                >
                  {p.status === "resolved_yes" ? "SI" : p.status === "resolved_no" ? "NO" : p.status}
                </Badge>
                <span className="text-xs font-mono truncate flex-1">{p.question}</span>
                {p.my_bet && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-mono text-[8px]",
                      p.my_bet.is_correct === true && "border-green-500/30 text-green-500",
                      p.my_bet.is_correct === false && "border-red-500/30 text-red-500"
                    )}
                  >
                    {p.my_bet.is_correct === true ? "Acertaste" : p.my_bet.is_correct === false ? "Fallaste" : "Pendiente"}
                  </Badge>
                )}
                <span className="font-mono text-[9px] text-muted-foreground/40 tabular-nums shrink-0">
                  {p.bets.length} apuestas
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
