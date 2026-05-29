"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TrustInvestment, TrustScoreHistory } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, getInitials } from "@/lib/utils";
import {
  CandlestickChart,
  TrendingUp,
  TrendingDown,
  Coins,
  ArrowUp,
  ArrowDown,
  Loader2,
  Wallet,
  BarChart2,
  Minus,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TeamStock {
  userId: string;
  profile: Profile;
  currentScore: number;
  history: number[]; // last 7 days of scores
  trend: number; // percentage change over 7 days
  marketCap: number; // total active investments from others
}

interface PortfolioItem {
  investment: TrustInvestment;
  targetProfile: Profile;
  targetCurrentScore: number;
  targetScoreAtInvest: number;
  gainLoss: number; // percentage
}

interface InvestorRanking {
  userId: string;
  profile: Profile;
  totalProfit: number;
  totalInvested: number;
  activeCount: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AMOUNT_OPTIONS = [10, 25, 50, 75, 100];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function TrustMarketPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [stocks, setStocks] = useState<TeamStock[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [rankings, setRankings] = useState<InvestorRanking[]>([]);
  const [loading, setLoading] = useState(true);

  // Buy dialog
  const [buyTarget, setBuyTarget] = useState<TeamStock | null>(null);
  const [buyAmount, setBuyAmount] = useState(25);
  const [buying, setBuying] = useState(false);

  // Sell dialog
  const [sellItem, setSellItem] = useState<PortfolioItem | null>(null);
  const [selling, setSelling] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Data loading                                                     */
  /* ---------------------------------------------------------------- */

  const loadData = useCallback(async () => {
    if (!orgId || !userId) return;

    // 1. Load team members + profiles
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    const profileMap = new Map<string, Profile>();
    for (const m of members ?? []) {
      if (m.profiles) {
        profileMap.set(m.user_id, m.profiles as unknown as Profile);
      }
    }

    // 2. Load trust score history (last 7 days for all users)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split("T")[0];

    const { data: scoreHistory } = await supabase
      .from("trust_score_history")
      .select("user_id, date, score")
      .eq("org_id", orgId)
      .gte("date", dateStr)
      .order("date", { ascending: true });

    // 3. Load all investments for this org
    const { data: allInvestments } = await supabase
      .from("trust_investments")
      .select("*")
      .eq("org_id", orgId);

    // Build score maps per user
    const scoresByUser = new Map<string, { scores: number[]; dates: string[] }>();
    for (const s of scoreHistory ?? []) {
      if (!scoresByUser.has(s.user_id)) {
        scoresByUser.set(s.user_id, { scores: [], dates: [] });
      }
      const entry = scoresByUser.get(s.user_id)!;
      entry.scores.push(s.score);
      entry.dates.push(s.date);
    }

    // Build stocks
    const stockList: TeamStock[] = [];
    for (const [uid, profile] of profileMap) {
      const userScores = scoresByUser.get(uid);
      const history = userScores?.scores ?? [];
      const currentScore = history.length > 0 ? history[history.length - 1] : 50;
      const oldScore = history.length >= 2 ? history[0] : currentScore;
      const trend = oldScore > 0 ? ((currentScore - oldScore) / oldScore) * 100 : 0;

      // Market cap = total active investments from others
      const marketCap = (allInvestments ?? [])
        .filter((inv) => inv.target_id === uid && inv.status === "active")
        .reduce((sum, inv) => sum + inv.current_value, 0);

      stockList.push({
        userId: uid,
        profile,
        currentScore,
        history: padHistory(history),
        trend,
        marketCap,
      });
    }
    stockList.sort((a, b) => b.currentScore - a.currentScore);
    setStocks(stockList);

    // Build portfolio (my active investments)
    const myInvestments = (allInvestments ?? []).filter(
      (inv) => inv.investor_id === userId && inv.status === "active"
    );

    const portfolioItems: PortfolioItem[] = myInvestments.map((inv) => {
      const targetProfile = profileMap.get(inv.target_id);
      const targetScores = scoresByUser.get(inv.target_id);
      const currentScore =
        targetScores && targetScores.scores.length > 0
          ? targetScores.scores[targetScores.scores.length - 1]
          : 50;

      // Find the score at invest time (approximate)
      const investDate = inv.invested_at.split("T")[0];
      let scoreAtInvest = currentScore;
      if (targetScores) {
        const idx = targetScores.dates.findIndex((d) => d >= investDate);
        if (idx >= 0) scoreAtInvest = targetScores.scores[idx];
        else if (targetScores.scores.length > 0) scoreAtInvest = targetScores.scores[0];
      }

      const gainLoss = scoreAtInvest > 0 ? ((currentScore - scoreAtInvest) / scoreAtInvest) * 100 : 0;

      return {
        investment: inv,
        targetProfile: targetProfile ?? {
          id: inv.target_id,
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
        targetCurrentScore: currentScore,
        targetScoreAtInvest: scoreAtInvest,
        gainLoss,
      };
    });
    setPortfolio(portfolioItems);

    // Build investor rankings
    const investorMap = new Map<string, { profit: number; invested: number; active: number }>();
    for (const inv of allInvestments ?? []) {
      if (!investorMap.has(inv.investor_id)) {
        investorMap.set(inv.investor_id, { profit: 0, invested: 0, active: 0 });
      }
      const entry = investorMap.get(inv.investor_id)!;
      entry.invested += inv.amount;
      if (inv.status === "active") {
        entry.profit += inv.current_value - inv.amount;
        entry.active += 1;
      } else {
        entry.profit += inv.current_value - inv.amount;
      }
    }

    const rankingList: InvestorRanking[] = [];
    for (const [uid, stats] of investorMap) {
      const profile = profileMap.get(uid);
      if (profile) {
        rankingList.push({
          userId: uid,
          profile,
          totalProfit: stats.profit,
          totalInvested: stats.invested,
          activeCount: stats.active,
        });
      }
    }
    rankingList.sort((a, b) => b.totalProfit - a.totalProfit);
    setRankings(rankingList);

    setLoading(false);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId || !userId) return;
    loadData();
  }, [orgId, userId, loadData]);

  // Real-time subscription
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("trust-market")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trust_investments",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ---------------------------------------------------------------- */

  async function handleBuy() {
    if (!orgId || !userId || !buyTarget) return;
    setBuying(true);

    await supabase.from("trust_investments").insert({
      investor_id: userId,
      target_id: buyTarget.userId,
      org_id: orgId,
      amount: buyAmount,
      current_value: buyAmount,
      status: "active",
      invested_at: new Date().toISOString(),
    });

    setBuyTarget(null);
    setBuyAmount(25);
    await loadData();
    setBuying(false);
  }

  async function handleSell() {
    if (!sellItem) return;
    setSelling(true);

    await supabase
      .from("trust_investments")
      .update({
        status: "sold",
        sold_at: new Date().toISOString(),
        current_value: Math.round(
          sellItem.investment.amount * (1 + sellItem.gainLoss / 100)
        ),
      })
      .eq("id", sellItem.investment.id);

    setSellItem(null);
    await loadData();
    setSelling(false);
  }

  /* ---------------------------------------------------------------- */
  /*  Loading state                                                    */
  /* ---------------------------------------------------------------- */

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Derived values                                                   */
  /* ---------------------------------------------------------------- */

  const totalInvested = portfolio.reduce((s, p) => s + p.investment.amount, 0);
  const totalCurrentValue = portfolio.reduce(
    (s, p) => s + Math.round(p.investment.amount * (1 + p.gainLoss / 100)),
    0
  );
  const totalGainLoss = totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0;

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
          <CandlestickChart className="w-5 h-5 text-primary" />
          Mercado de Confianza
        </h1>
        <p className="text-xs font-mono text-muted-foreground mt-1">
          Invierte puntos de confianza en tus companeros. Si su Trust Score sube, tu inversion crece.
        </p>
      </div>

      {/* Portfolio Summary */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
          Mi Portfolio
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-accent/30 border border-border p-4">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Invertido</p>
            <p className="text-xl font-mono font-bold tabular-nums tracking-tight mt-1">{totalInvested}</p>
          </div>
          <div className="bg-accent/30 border border-border p-4">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Valor actual</p>
            <p className="text-xl font-mono font-bold tabular-nums tracking-tight mt-1">{totalCurrentValue}</p>
          </div>
          <div className={cn(
            "bg-accent/30 border border-border p-4",
            totalGainLoss > 0 && "border-green-600/30",
            totalGainLoss < 0 && "border-red-600/30"
          )}>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Ganancia</p>
            <p className={cn(
              "text-xl font-mono font-bold tabular-nums tracking-tight mt-1 flex items-center gap-1",
              totalGainLoss > 0 && "text-green-600",
              totalGainLoss < 0 && "text-red-600"
            )}>
              {totalGainLoss > 0 ? <ArrowUp className="w-4 h-4" /> : totalGainLoss < 0 ? <ArrowDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
              {totalGainLoss >= 0 ? "+" : ""}{totalGainLoss.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Active Investments */}
      {portfolio.length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Inversiones activas
          </p>
          <div className="space-y-2">
            {portfolio.map((item) => (
              <Card
                key={item.investment.id}
                className="border border-border transition-colors duration-200 hover:border-primary/30"
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8 ring-1 ring-border">
                      <AvatarImage src={item.targetProfile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs font-mono">
                        {getInitials(item.targetProfile.full_name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-medium truncate">
                        {item.targetProfile.full_name ?? item.targetProfile.email}
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground tabular-nums">
                        Invertido: {item.investment.amount} pts · Score actual: {item.targetCurrentScore}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono tabular-nums text-[10px]",
                          item.gainLoss > 0 && "border-green-600/40 text-green-600",
                          item.gainLoss < 0 && "border-red-600/40 text-red-600"
                        )}
                      >
                        {item.gainLoss > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : item.gainLoss < 0 ? <TrendingDown className="w-3 h-3 mr-1" /> : null}
                        {item.gainLoss >= 0 ? "+" : ""}{item.gainLoss.toFixed(1)}%
                      </Badge>

                      <Button
                        variant="outline"
                        size="sm"
                        className="font-mono text-xs text-red-600 border-red-600/30 hover:bg-red-600/10 hover:border-red-600/50"
                        onClick={() => setSellItem(item)}
                      >
                        Vender
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Market */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
          Mercado
        </p>
        <div className="space-y-2">
          {stocks.map((stock) => {
            const isSelf = stock.userId === userId;
            const hasActiveInvestment = portfolio.some(
              (p) => p.investment.target_id === stock.userId
            );

            return (
              <Card
                key={stock.userId}
                className={cn(
                  "border border-border transition-colors duration-200",
                  !isSelf && "hover:border-primary/30",
                  isSelf && "opacity-60"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Avatar + Name */}
                    <Avatar className="w-10 h-10 ring-1 ring-border">
                      <AvatarImage src={stock.profile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs font-mono">
                        {getInitials(stock.profile.full_name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono font-medium truncate">
                          {stock.profile.full_name ?? stock.profile.email}
                        </p>
                        {isSelf && (
                          <Badge variant="outline" className="text-[9px] font-mono">Tu</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Cap: {stock.marketCap} pts
                        </span>
                      </div>
                    </div>

                    {/* Mini sparkline */}
                    <div className="flex items-end gap-[2px] h-6">
                      {stock.history.map((score, i) => {
                        const max = Math.max(...stock.history, 1);
                        const height = Math.max(4, (score / max) * 24);
                        const isLast = i === stock.history.length - 1;
                        return (
                          <div
                            key={i}
                            className={cn(
                              "w-[4px] transition-all",
                              isLast
                                ? stock.trend >= 0
                                  ? "bg-green-500"
                                  : "bg-red-500"
                                : "bg-muted-foreground/20"
                            )}
                            style={{ height: `${height}px` }}
                          />
                        );
                      })}
                    </div>

                    {/* Price + trend */}
                    <div className="text-right shrink-0">
                      <p className="text-lg font-mono font-bold tabular-nums tracking-tight">
                        {stock.currentScore}
                      </p>
                      <div className={cn(
                        "flex items-center gap-0.5 justify-end text-[10px] font-mono tabular-nums",
                        stock.trend > 0 && "text-green-600",
                        stock.trend < 0 && "text-red-600",
                        stock.trend === 0 && "text-muted-foreground"
                      )}>
                        {stock.trend > 0 ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : stock.trend < 0 ? (
                          <ArrowDown className="w-3 h-3" />
                        ) : (
                          <Minus className="w-3 h-3" />
                        )}
                        {stock.trend >= 0 ? "+" : ""}{stock.trend.toFixed(1)}%
                      </div>
                    </div>

                    {/* Buy button */}
                    <div className="shrink-0">
                      {isSelf ? (
                        <Button variant="outline" size="sm" disabled className="font-mono text-xs">
                          N/A
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className={cn(
                            "font-mono text-xs gap-1",
                            hasActiveInvestment
                              ? "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
                              : "bg-primary text-primary-foreground"
                          )}
                          onClick={() => {
                            setBuyTarget(stock);
                            setBuyAmount(25);
                          }}
                        >
                          <Coins className="w-3 h-3" />
                          {hasActiveInvestment ? "Invertir mas" : "Comprar"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {stocks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <CandlestickChart className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-mono text-muted-foreground">
              No hay miembros en el equipo.
            </p>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      {rankings.length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
            Mejores inversionistas
          </p>
          <div className="space-y-1">
            {rankings.slice(0, 10).map((rank, i) => (
              <Card
                key={rank.userId}
                className="border border-border transition-colors duration-200 hover:border-primary/30"
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground tabular-nums w-5 text-center">
                      #{i + 1}
                    </span>

                    <Avatar className="w-7 h-7 ring-1 ring-border">
                      <AvatarImage src={rank.profile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[9px] font-mono">
                        {getInitials(rank.profile.full_name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-medium truncate">
                        {rank.profile.full_name ?? rank.profile.email}
                        {rank.userId === userId && (
                          <span className="text-muted-foreground ml-1">(tu)</span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                        {rank.activeCount} activas
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono tabular-nums text-[10px]",
                          rank.totalProfit > 0 && "border-green-600/40 text-green-600",
                          rank.totalProfit < 0 && "border-red-600/40 text-red-600"
                        )}
                      >
                        {rank.totalProfit >= 0 ? "+" : ""}{rank.totalProfit} pts
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Buy Dialog */}
      <Dialog open={!!buyTarget} onOpenChange={(open) => !open && setBuyTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono">Invertir en {buyTarget?.profile.full_name}</DialogTitle>
            <DialogDescription>
              Trust Score actual: <span className="font-mono font-bold tabular-nums">{buyTarget?.currentScore}</span>.
              Si su score sube, tu inversion crece. Si baja, pierdes.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2">
              Cantidad a invertir
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {AMOUNT_OPTIONS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setBuyAmount(amt)}
                  className={cn(
                    "w-12 h-10 font-mono text-sm font-bold transition-all duration-200 tabular-nums border",
                    buyAmount === amt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-accent/30 text-muted-foreground border-border hover:border-primary/30"
                  )}
                >
                  {amt}
                </button>
              ))}
            </div>

            <div>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2">
                O ingresa una cantidad
              </p>
              <Input
                type="number"
                min={1}
                max={100}
                value={buyAmount}
                onChange={(e) => setBuyAmount(Math.min(100, Math.max(1, parseInt(e.target.value) || 0)))}
                className="font-mono tabular-nums"
              />
              <p className="text-[10px] font-mono text-muted-foreground mt-1">
                Maximo 100 puntos por inversion.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBuyTarget(null)}
              className="font-mono text-xs"
            >
              Cancelar
            </Button>
            <Button
              className="bg-primary text-primary-foreground font-mono text-xs gap-1"
              disabled={buying || buyAmount < 1 || buyAmount > 100}
              onClick={handleBuy}
            >
              {buying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Coins className="w-3.5 h-3.5" />
              )}
              {buying ? "Invirtiendo..." : `Invertir ${buyAmount} pts`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sell Dialog */}
      <Dialog open={!!sellItem} onOpenChange={(open) => !open && setSellItem(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono">Vender inversion</DialogTitle>
            <DialogDescription>
              Inversion en <span className="font-bold">{sellItem?.targetProfile.full_name}</span>.
            </DialogDescription>
          </DialogHeader>

          {sellItem && (
            <div className="py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-accent/30 border border-border p-3">
                  <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Invertido</p>
                  <p className="font-mono font-bold tabular-nums tracking-tight mt-0.5">
                    {sellItem.investment.amount} pts
                  </p>
                </div>
                <div className={cn(
                  "bg-accent/30 border border-border p-3",
                  sellItem.gainLoss > 0 && "border-green-600/30",
                  sellItem.gainLoss < 0 && "border-red-600/30"
                )}>
                  <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">Valor actual</p>
                  <p className={cn(
                    "font-mono font-bold tabular-nums tracking-tight mt-0.5",
                    sellItem.gainLoss > 0 && "text-green-600",
                    sellItem.gainLoss < 0 && "text-red-600"
                  )}>
                    {Math.round(sellItem.investment.amount * (1 + sellItem.gainLoss / 100))} pts
                  </p>
                </div>
              </div>
              <div className={cn(
                "text-center py-2 border",
                sellItem.gainLoss > 0 && "bg-green-600/5 border-green-600/20",
                sellItem.gainLoss < 0 && "bg-red-600/5 border-red-600/20",
                sellItem.gainLoss === 0 && "bg-accent/30 border-border"
              )}>
                <p className={cn(
                  "font-mono font-bold tabular-nums",
                  sellItem.gainLoss > 0 && "text-green-600",
                  sellItem.gainLoss < 0 && "text-red-600"
                )}>
                  {sellItem.gainLoss >= 0 ? "+" : ""}{sellItem.gainLoss.toFixed(1)}%
                  {" "}
                  ({sellItem.gainLoss >= 0 ? "+" : ""}{Math.round(sellItem.investment.amount * (sellItem.gainLoss / 100))} pts)
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSellItem(null)}
              className="font-mono text-xs"
            >
              Cancelar
            </Button>
            <Button
              className="font-mono text-xs gap-1 bg-red-600 text-white hover:bg-red-700"
              disabled={selling}
              onClick={handleSell}
            >
              {selling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5" />
              )}
              {selling ? "Vendiendo..." : "Confirmar venta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function padHistory(scores: number[]): number[] {
  // Always return exactly 7 values for the sparkline
  if (scores.length >= 7) return scores.slice(-7);
  const padding = Array(7 - scores.length).fill(scores[0] ?? 50);
  return [...padding, ...scores];
}
