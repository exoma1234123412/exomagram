"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { CATEGORIES } from "@/lib/constants";
import { cn, getInitials } from "@/lib/utils";
import type { WorkCategory, Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
  Tag,
  Trophy,
  Wallet,
  Activity,
  BarChart3,
  CandlestickChart,
  Zap,
  Minus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarketPrice {
  category: WorkCategory;
  price: number;
  basePrice: number;
  change24h: number; // percentage
  history: number[]; // last 20 prices for sparkline
  volume: number; // fake volume
}

interface Trade {
  id: string;
  userId: string;
  userName: string;
  type: "buy" | "sell";
  category: WorkCategory;
  quantity: number;
  price: number;
  timestamp: number;
}

interface Portfolio {
  [category: string]: number; // quantity of hours held
}

interface LeaderEntry {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  value: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_PRICES: Record<WorkCategory, number> = {
  deep_work: 100,
  meeting: 30,
  review: 60,
  admin: 20,
  planning: 50,
  learning: 70,
  break: 10,
  blocked: 5,
};

const STARTING_CREDITS = 500;

const CATEGORY_TICKER_COLORS: Record<WorkCategory, { up: string; down: string; bg: string }> = {
  deep_work: { up: "text-violet-400", down: "text-violet-300", bg: "bg-violet-500/10" },
  meeting: { up: "text-blue-400", down: "text-blue-300", bg: "bg-blue-500/10" },
  review: { up: "text-amber-400", down: "text-amber-300", bg: "bg-amber-500/10" },
  admin: { up: "text-slate-400", down: "text-slate-300", bg: "bg-slate-500/10" },
  planning: { up: "text-emerald-400", down: "text-emerald-300", bg: "bg-emerald-500/10" },
  learning: { up: "text-pink-400", down: "text-pink-300", bg: "bg-pink-500/10" },
  break: { up: "text-green-400", down: "text-green-300", bg: "bg-green-500/10" },
  blocked: { up: "text-red-400", down: "text-red-300", bg: "bg-red-500/10" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageKey(orgId: string) {
  return `exomagram_market_${orgId}`;
}

function loadMarketState(orgId: string): {
  trades: Trade[];
  portfolios: Record<string, Portfolio>;
  credits: Record<string, number>;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveMarketState(
  orgId: string,
  trades: Trade[],
  portfolios: Record<string, Portfolio>,
  credits: Record<string, number>,
) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    storageKey(orgId),
    JSON.stringify({ trades: trades.slice(-200), portfolios, credits }),
  );
}

function generateInitialHistory(base: number): number[] {
  const history: number[] = [];
  let price = base;
  for (let i = 0; i < 20; i++) {
    const drift = (Math.random() - 0.5) * 0.08;
    price = Math.max(1, Math.round(price * (1 + drift)));
    history.push(price);
  }
  return history;
}

function randomVolume(): number {
  return Math.floor(Math.random() * 500) + 50;
}

// ---------------------------------------------------------------------------
// Mini Sparkline component (pure divs)
// ---------------------------------------------------------------------------

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  return (
    <div className="flex items-end gap-[2px] h-8 w-full">
      {data.map((v, i) => {
        const height = Math.max(2, ((v - min) / range) * 100);
        const isLast = i === data.length - 1;
        return (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-t-sm transition-all duration-500",
              isLast
                ? positive
                  ? "bg-green-400"
                  : "bg-red-400"
                : positive
                  ? "bg-green-400/30"
                  : "bg-red-400/30",
            )}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function BlackMarketPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [portfolios, setPortfolios] = useState<Record<string, Portfolio>>({});
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<WorkCategory | null>(null);

  const pricesRef = useRef(prices);
  pricesRef.current = prices;

  // -------------------------------------------------------------------------
  // Load team members
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!orgId) return;
    async function loadMembers() {
      const { data } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId!);

      const map = new Map<string, Profile>();
      for (const m of data ?? []) {
        if (m.profiles) {
          map.set(m.user_id, m.profiles as unknown as Profile);
        }
      }
      setMembers(map);
    }
    loadMembers();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Initialize market state
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!orgId) return;

    const saved = loadMarketState(orgId);

    // Build initial prices
    const initialPrices: MarketPrice[] = (Object.keys(BASE_PRICES) as WorkCategory[]).map(
      (cat) => {
        const base = BASE_PRICES[cat];
        const history = generateInitialHistory(base);
        const current = history[history.length - 1];
        const prev = history[history.length - 2];
        const change = prev ? ((current - prev) / prev) * 100 : 0;
        return {
          category: cat,
          price: current,
          basePrice: base,
          change24h: parseFloat(change.toFixed(1)),
          history,
          volume: randomVolume(),
        };
      },
    );

    setPrices(initialPrices);

    if (saved) {
      setTrades(saved.trades);
      setPortfolios(saved.portfolios);
      setCredits(saved.credits);
    } else {
      setTrades([]);
      setPortfolios({});
      setCredits({});
    }

    setLoading(false);
  }, [orgId]);

  // -------------------------------------------------------------------------
  // Market tick: adjust prices every 5 seconds
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!orgId || prices.length === 0) return;

    const interval = setInterval(() => {
      setPrices((prev) =>
        prev.map((mp) => {
          const volatility = 0.15;
          const drift = (Math.random() - 0.48) * volatility; // slight upward bias
          const newPrice = Math.max(1, Math.round(mp.price * (1 + drift)));
          const newHistory = [...mp.history.slice(-19), newPrice];
          const first = newHistory[0];
          const change = first ? ((newPrice - first) / first) * 100 : 0;
          return {
            ...mp,
            price: newPrice,
            change24h: parseFloat(change.toFixed(1)),
            history: newHistory,
            volume: mp.volume + Math.floor(Math.random() * 20),
          };
        }),
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [orgId, prices.length]);

  // -------------------------------------------------------------------------
  // Trade execution
  // -------------------------------------------------------------------------
  const executeTrade = useCallback(
    (type: "buy" | "sell", category: WorkCategory) => {
      if (!orgId || !userId) return;

      const mp = pricesRef.current.find((p) => p.category === category);
      if (!mp) return;

      const profile = members.get(userId);
      const userName = profile?.full_name ?? profile?.email ?? "Yo";

      const userCredits = credits[userId] ?? STARTING_CREDITS;
      const userPortfolio = portfolios[userId] ?? {};
      const held = userPortfolio[category] ?? 0;

      if (type === "buy") {
        if (userCredits < mp.price) return; // can't afford
        const newCredits = { ...credits, [userId]: userCredits - mp.price };
        const newPortfolio = {
          ...portfolios,
          [userId]: { ...userPortfolio, [category]: held + 1 },
        };
        const trade: Trade = {
          id: crypto.randomUUID(),
          userId,
          userName,
          type: "buy",
          category,
          quantity: 1,
          price: mp.price,
          timestamp: Date.now(),
        };
        const newTrades = [...trades, trade];

        setCredits(newCredits);
        setPortfolios(newPortfolio);
        setTrades(newTrades);
        saveMarketState(orgId, newTrades, newPortfolio, newCredits);
      } else {
        if (held <= 0) return; // nothing to sell
        const newCredits = { ...credits, [userId]: userCredits + mp.price };
        const newPortfolio = {
          ...portfolios,
          [userId]: { ...userPortfolio, [category]: held - 1 },
        };
        const trade: Trade = {
          id: crypto.randomUUID(),
          userId,
          userName,
          type: "sell",
          category,
          quantity: 1,
          price: mp.price,
          timestamp: Date.now(),
        };
        const newTrades = [...trades, trade];

        setCredits(newCredits);
        setPortfolios(newPortfolio);
        setTrades(newTrades);
        saveMarketState(orgId, newTrades, newPortfolio, newCredits);
      }
    },
    [orgId, userId, credits, portfolios, trades, members],
  );

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const myCredits = userId ? (credits[userId] ?? STARTING_CREDITS) : 0;
  const myPortfolio = userId ? (portfolios[userId] ?? {}) : {};

  const portfolioValue = Object.entries(myPortfolio).reduce((sum, [cat, qty]) => {
    const mp = prices.find((p) => p.category === cat);
    return sum + (mp ? mp.price * (qty as number) : 0);
  }, 0);

  const totalWealth = myCredits + portfolioValue;

  // Leaderboard
  const leaderboard: LeaderEntry[] = Array.from(members.entries())
    .map(([uid, profile]) => {
      const userCredits = credits[uid] ?? STARTING_CREDITS;
      const userPortfolio = portfolios[uid] ?? {};
      const pValue = Object.entries(userPortfolio).reduce((s, [cat, qty]) => {
        const mp = prices.find((p) => p.category === cat);
        return s + (mp ? mp.price * (qty as number) : 0);
      }, 0);
      return {
        userId: uid,
        userName: profile.full_name ?? profile.email ?? "?",
        avatarUrl: profile.avatar_url,
        value: userCredits + pValue,
      };
    })
    .sort((a, b) => b.value - a.value);

  const recentTrades = [...trades].reverse().slice(0, 15);

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <CandlestickChart className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              Mercado Negro de Horas
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Cotizaci&oacute;n en tiempo real &middot; Compra y vende horas de trabajo
            </p>
          </div>
        </div>
      </div>

      {/* Wallet bar */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <Card className="bg-accent/40 border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Cr&eacute;ditos
              </p>
              <p className="text-lg font-bold tabular-nums tracking-tight">{myCredits.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-accent/40 border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Portafolio
              </p>
              <p className="text-lg font-bold tabular-nums tracking-tight">{portfolioValue.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-accent/40 border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Riqueza total
              </p>
              <p className="text-lg font-bold tabular-nums tracking-tight">{totalWealth.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Market Ticker Grid */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Cotizaciones
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {prices.map((mp) => {
            const catInfo = CATEGORIES[mp.category];
            const isUp = mp.change24h >= 0;
            const colors = CATEGORY_TICKER_COLORS[mp.category];
            const isSelected = selectedCategory === mp.category;
            const held = (myPortfolio[mp.category] as number | undefined) ?? 0;

            return (
              <Card
                key={mp.category}
                className={cn(
                  "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 cursor-pointer overflow-hidden",
                  isSelected && "ring-2 ring-primary/40",
                )}
                onClick={() =>
                  setSelectedCategory(isSelected ? null : mp.category)
                }
              >
                <CardContent className="p-4">
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-sm",
                          colors.bg,
                        )}
                      >
                        {catInfo.emoji}
                      </span>
                      <div>
                        <p className="text-xs font-semibold">{catInfo.label}</p>
                        {held > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            {held}h en cartera
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] tabular-nums gap-0.5",
                        isUp
                          ? "text-green-600 dark:text-green-400 border-green-200 dark:border-green-800"
                          : "text-red-600 dark:text-red-400 border-red-200 dark:border-red-800",
                      )}
                    >
                      {isUp ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {isUp ? "+" : ""}
                      {mp.change24h}%
                    </Badge>
                  </div>

                  {/* Price */}
                  <div className="flex items-end justify-between mb-3">
                    <p
                      className={cn(
                        "text-2xl font-bold tabular-nums tracking-tight transition-all duration-500",
                        isUp ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {mp.price}
                      <span className="text-xs font-normal text-muted-foreground ml-1">cr</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      Vol: {mp.volume}
                    </p>
                  </div>

                  {/* Sparkline */}
                  <Sparkline data={mp.history} positive={isUp} />

                  {/* Buy / Sell buttons */}
                  {isSelected && (
                    <div className="flex gap-2 mt-3 pt-3 border-t">
                      <Button
                        size="sm"
                        className="flex-1 rounded-xl bg-green-600 hover:bg-green-700 text-white border-0 gap-1 text-xs"
                        disabled={myCredits < mp.price}
                        onClick={(e) => {
                          e.stopPropagation();
                          executeTrade("buy", mp.category);
                        }}
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        Comprar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 rounded-xl border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 gap-1 text-xs"
                        disabled={held <= 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          executeTrade("sell", mp.category);
                        }}
                      >
                        <Tag className="w-3.5 h-3.5" />
                        Vender
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Two columns: Portfolio + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* My Portfolio */}
        <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="w-4 h-4 text-primary" />
              Mi Portafolio
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(myPortfolio).filter(([, qty]) => (qty as number) > 0).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6 text-primary/40" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Sin horas en cartera. Compra para empezar.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(myPortfolio)
                  .filter(([, qty]) => (qty as number) > 0)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([cat, qty]) => {
                    const catInfo = CATEGORIES[cat as WorkCategory];
                    const mp = prices.find((p) => p.category === cat);
                    const value = mp ? mp.price * (qty as number) : 0;
                    const colors = CATEGORY_TICKER_COLORS[cat as WorkCategory];
                    return (
                      <div
                        key={cat}
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-accent/40"
                      >
                        <span
                          className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center text-xs",
                            colors.bg,
                          )}
                        >
                          {catInfo?.emoji}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{catInfo?.label}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {qty as number}h &times; {mp?.price ?? 0} cr
                          </p>
                        </div>
                        <p className="text-sm font-bold tabular-nums tracking-tight">
                          {value.toLocaleString()}
                          <span className="text-[10px] font-normal text-muted-foreground ml-0.5">
                            cr
                          </span>
                        </p>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Trophy className="w-4 h-4 text-amber-500" />
              Los M&aacute;s Ricos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin datos de participantes
              </p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((entry, idx) => {
                  const isMe = entry.userId === userId;
                  return (
                    <div
                      key={entry.userId}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-xl",
                        isMe ? "bg-primary/5 ring-1 ring-primary/20" : "bg-accent/40",
                      )}
                    >
                      <span
                        className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold tabular-nums",
                          idx === 0
                            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
                            : idx === 1
                              ? "bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400"
                              : idx === 2
                                ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400"
                                : "bg-accent text-muted-foreground",
                        )}
                      >
                        {idx + 1}
                      </span>
                      <Avatar className="w-7 h-7 ring-2 ring-background shadow-sm">
                        <AvatarImage src={entry.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-[9px]">
                          {getInitials(entry.userName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {entry.userName}
                          {isMe && (
                            <span className="text-[10px] text-primary ml-1">(t&uacute;)</span>
                          )}
                        </p>
                      </div>
                      <p className="text-sm font-bold tabular-nums tracking-tight">
                        {entry.value.toLocaleString()}
                        <span className="text-[10px] font-normal text-muted-foreground ml-0.5">
                          cr
                        </span>
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Trades */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          &Oacute;rdenes Activas
        </h2>
        {recentTrades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <CandlestickChart className="w-8 h-8 text-primary/40" />
            </div>
            <p className="text-sm text-muted-foreground">
              No hay transacciones a&uacute;n. S&eacute; el primero en operar.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTrades.map((trade) => {
              const catInfo = CATEGORIES[trade.category];
              const isBuy = trade.type === "buy";
              const isMe = trade.userId === userId;
              const timeAgo = Math.round((Date.now() - trade.timestamp) / 1000 / 60);
              const timeLabel = timeAgo < 1 ? "ahora" : timeAgo < 60 ? `${timeAgo}m` : `${Math.round(timeAgo / 60)}h`;

              return (
                <Card
                  key={trade.id}
                  className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                        isBuy
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                          : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
                      )}
                    >
                      {isBuy ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs">
                        <span className="font-medium">
                          {isMe ? "T\u00fa" : trade.userName}
                        </span>
                        {" "}
                        {isBuy ? "compr\u00f3" : "vendi\u00f3"}{" "}
                        <span className="font-medium">
                          {trade.quantity}h de {catInfo?.label}
                        </span>
                        {" "}
                        {catInfo?.emoji}
                      </p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {trade.price} cr &middot; {timeLabel}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] tabular-nums",
                        isBuy
                          ? "text-green-600 dark:text-green-400 border-green-200 dark:border-green-800"
                          : "text-red-600 dark:text-red-400 border-red-200 dark:border-red-800",
                      )}
                    >
                      {isBuy ? (
                        <Minus className="w-3 h-3" />
                      ) : (
                        <>+</>
                      )}
                      {trade.price} cr
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Market info footer */}
      <div className="text-center text-[11px] text-muted-foreground/60 py-4">
        Los precios se actualizan cada 5 segundos. Econom&iacute;a simulada &mdash; sin valor real.
      </div>
    </div>
  );
}
