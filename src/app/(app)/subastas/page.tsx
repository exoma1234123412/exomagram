"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import type { Profile, TaskAuction, AuctionBid } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import {
 Hammer,
 Clock,
 ArrowDown,
 Trophy,
 Loader2,
 Plus,
 Users,
 CheckCircle2,
 XCircle,
 AlertTriangle,
 Flame,
 Timer,
 History,
} from "lucide-react";

type AuctionWithBids = TaskAuction & {
 bids: (AuctionBid & { profile?: Profile })[];
 creator_profile?: Profile;
 winner_profile?: Profile;
};

function useCountdown(deadline: string) {
 const [remaining, setRemaining] = useState("");
 const [isExpired, setIsExpired] = useState(false);

 useEffect(() => {
 function update() {
 const diff = new Date(deadline).getTime() - Date.now();
 if (diff <= 0) {
 setRemaining("Expirada");
 setIsExpired(true);
 return;
 }
 const hours = Math.floor(diff / (1000 * 60 * 60));
 const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
 const secs = Math.floor((diff % (1000 * 60)) / 1000);
 if (hours > 24) {
 const days = Math.floor(hours / 24);
 setRemaining(`${days}d ${hours % 24}h`);
 } else if (hours > 0) {
 setRemaining(`${hours}h ${mins}m`);
 } else {
 setRemaining(`${mins}m ${secs}s`);
 }
 setIsExpired(false);
 }
 update();
 const interval = setInterval(update, 1000);
 return () => clearInterval(interval);
 }, [deadline]);

 return { remaining, isExpired };
}

function CountdownBadge({ deadline }: { deadline: string }) {
 const { remaining, isExpired } = useCountdown(deadline);

 return (
 <Badge
 variant="outline"className={cn(
"font-mono text-[10px] gap-1 tabular-nums tracking-tight",
 isExpired
 ?"border-red-300 dark:border-red-700 text-red-600 dark:text-red-400":"border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400")}
 >
 <Timer className="w-3 h-3"/>
 {remaining}
 </Badge>
 );
}

function AuctionCard({
 auction,
 userId,
 onBid,
 onClaim,
 onComplete,
 onFail,
}: {
 auction: AuctionWithBids;
 userId: string | null;
 onBid: (auctionId: string, hours: number) => Promise<void>;
 onClaim: (auctionId: string) => Promise<void>;
 onComplete: (auctionId: string) => Promise<void>;
 onFail: (auctionId: string) => Promise<void>;
}) {
 const [bidValue, setBidValue] = useState("");
 const [bidding, setBidding] = useState(false);
 const [showBidInput, setShowBidInput] = useState(false);
 const [acting, setActing] = useState(false);
 const { isExpired } = useCountdown(auction.deadline);

 const sortedBids = [...auction.bids].sort((a, b) => a.hours_bid - b.hours_bid);
 const lowestBid = sortedBids[0];
 const myBid = auction.bids.find((b) => b.user_id === userId);
 const isCreator = auction.created_by === userId;
 const isWinner = auction.winner_id === userId;
 const isOpen = auction.status ==="open";
 const isClaimed = auction.status ==="claimed";

 async function handleBid() {
 const hours = parseFloat(bidValue);
 if (isNaN(hours) || hours <= 0 || hours > auction.max_hours) return;
 setBidding(true);
 await onBid(auction.id, hours);
 setBidValue("");
 setShowBidInput(false);
 setBidding(false);
 }

 async function handleClaim() {
 setActing(true);
 await onClaim(auction.id);
 setActing(false);
 }

 async function handleComplete() {
 setActing(true);
 await onComplete(auction.id);
 setActing(false);
 }

 async function handleFail() {
 setActing(true);
 await onFail(auction.id);
 setActing(false);
 }

 return (
 <Card
 className={cn(
"border border-border transition-colors hover:border-primary/30",
 isOpen && !isExpired &&"border-green-300 dark:border-green-800",
 isOpen && isExpired &&"border-amber-300 dark:border-amber-800",
 isClaimed &&"border-blue-300 dark:border-blue-800",
 auction.status ==="completed"&&"border-green-300 dark:border-green-800 opacity-75",
 auction.status ==="failed"&&"border-red-300 dark:border-red-800 opacity-75")}
 >
 <CardContent className="p-4">
 {/* Header */}
 <div className="flex items-start justify-between gap-3 mb-3">
 <div className="flex items-start gap-3 min-w-0 flex-1">
 <Avatar className="w-8 h-8 ring-1 ring-border mt-0.5 shrink-0">
 <AvatarImage src={auction.creator_profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(auction.creator_profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0">
 <h3 className="font-mono font-semibold text-sm leading-tight">{auction.title}</h3>
 {auction.description && (
 <p className="text-xs text-muted-foreground mt-1">{auction.description}</p>
 )}
 <p className="text-[10px] text-muted-foreground mt-1">
 por {auction.creator_profile?.full_name ??"?"} · {timeAgo(auction.created_at)}
 </p>
 </div>
 </div>
 <div className="flex flex-col items-end gap-1.5 shrink-0">
 {isOpen && <CountdownBadge deadline={auction.deadline} />}
 {isClaimed && (
 <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px]">
 Asignada
 </Badge>
 )}
 {auction.status ==="completed"&& (
 <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] gap-1">
 <CheckCircle2 className="w-3 h-3"/>
 Completada
 </Badge>
 )}
 {auction.status ==="failed"&& (
 <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] gap-1">
 <XCircle className="w-3 h-3"/>
 Fallida
 </Badge>
 )}
 </div>
 </div>

 {/* Stats row */}
 <div className="grid grid-cols-3 gap-2 mb-3">
 <div className="bg-accent/30 border border-border p-2 text-center">
 <p className="text-lg font-mono tabular-nums tracking-tight">{auction.max_hours}h</p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">Máximo</p>
 </div>
 <div
 className={cn(
"border border-border p-2 text-center",
 lowestBid
 ?"bg-green-50 dark:bg-green-950/20":"bg-accent/30")}
 >
 <p
 className={cn(
"text-lg font-mono tabular-nums tracking-tight",
 lowestBid ?"text-green-600":"text-muted-foreground")}
 >
 {lowestBid ?`${lowestBid.hours_bid}h`:"—"}
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">Mejor oferta</p>
 </div>
 <div className="bg-accent/30 border border-border p-2 text-center">
 <p className="text-lg font-mono tabular-nums tracking-tight flex items-center justify-center gap-1">
 <Users className="w-3.5 h-3.5 text-muted-foreground"/>
 {auction.bids.length}
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">Ofertas</p>
 </div>
 </div>

 {/* Bids list */}
 {sortedBids.length > 0 && (
 <div className="space-y-1.5 mb-3">
 {sortedBids.map((bid, i) => {
 const isLowest = i === 0;
 const isMine = bid.user_id === userId;
 return (
 <div
 key={bid.id}
 className={cn(
"flex items-center gap-2 p-2 text-xs transition-colors",
 isLowest
 ?"bg-green-50 dark:bg-green-950/20 border border-green-300 dark:border-green-800":"bg-accent/30 border border-border",
 isMine &&"border-primary/30")}
 >
 <Avatar className="w-5 h-5 ring-1 ring-border">
 <AvatarImage src={bid.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px]">
 {getInitials(bid.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <span className="font-medium truncate flex-1">
 {bid.profile?.full_name ??"?"}
 {isMine && (
 <span className="text-primary ml-1">(tú)</span>
 )}
 </span>
 <span
 className={cn(
"font-mono tabular-nums tracking-tight",
 isLowest ?"text-green-600 dark:text-green-400":"text-muted-foreground")}
 >
 {bid.hours_bid}h
 </span>
 {isLowest && (
 <ArrowDown className="w-3 h-3 text-green-500"/>
 )}
 </div>
 );
 })}
 </div>
 )}

 {/* Winner info for claimed/completed/failed */}
 {(isClaimed || auction.status ==="completed"|| auction.status ==="failed") && auction.winner_profile && (
 <div
 className={cn(
"border border-border p-3 mb-3",
 auction.status ==="completed"?"bg-green-50 dark:bg-green-950/20": auction.status ==="failed"?"bg-red-50 dark:bg-red-950/20":"bg-blue-50 dark:bg-blue-950/20")}
 >
 <div className="flex items-center gap-2">
 <Trophy
 className={cn(
"w-4 h-4",
 auction.status ==="failed"?"text-red-500":"text-amber-500")}
 />
 <Avatar className="w-6 h-6 ring-1 ring-border">
 <AvatarImage src={auction.winner_profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px]">
 {getInitials(auction.winner_profile.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-medium">
 {auction.winner_profile.full_name ??"?"}
 </span>
 <span className="text-xs text-muted-foreground">
 se comprometió a{" "}
 <span className="font-mono tabular-nums tracking-tight">
 {auction.winning_bid}h
 </span>
 </span>
 </div>
 {auction.status ==="failed"&& (
 <p className="text-[10px] text-red-600 dark:text-red-400 mt-1 ml-6">
 No cumplió en el tiempo prometido. Pierde XP.
 </p>
 )}
 </div>
 )}

 {/* Actions */}
 <div className="flex flex-wrap gap-2">
 {/* Bid action: open, not creator, not expired */}
 {isOpen && !isCreator && !isExpired && (
 <>
 {showBidInput ? (
 <div className="flex items-center gap-2 flex-1">
 <div className="relative flex-1">
 <Input
 type="number"step="0.5"min="0.5"max={auction.max_hours}
 placeholder={
 lowestBid
 ?`Menos de ${lowestBid.hours_bid}h`:`Máx ${auction.max_hours}h`}
 value={bidValue}
 onChange={(e) => setBidValue(e.target.value)}
 className="pr-8 text-sm"/>
 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
 h
 </span>
 </div>
 <Button
 size="sm"className="bg-primary font-mono text-xs gap-1"disabled={
 bidding ||
 !bidValue ||
 parseFloat(bidValue) <= 0 ||
 parseFloat(bidValue) > auction.max_hours
 }
 onClick={handleBid}
 >
 {bidding ? (
 <Loader2 className="w-3 h-3 animate-spin"/>
 ) : (
 <ArrowDown className="w-3 h-3"/>
 )}
 Ofertar
 </Button>
 <Button
 size="sm"variant="ghost"className="font-mono text-xs"onClick={() => {
 setShowBidInput(false);
 setBidValue("");
 }}
 >
 Cancelar
 </Button>
 </div>
 ) : (
 <Button
 size="sm"variant="outline"className="font-mono text-xs gap-1"onClick={() => setShowBidInput(true)}
 >
 <ArrowDown className="w-3 h-3"/>
 {myBid ?"Mejorar oferta":"Ofertar"}
 </Button>
 )}
 </>
 )}

 {/* Claim: creator can assign when expired or has bids */}
 {isOpen && isCreator && sortedBids.length > 0 && (
 <Button
 size="sm"className="bg-primary font-mono text-xs gap-1"disabled={acting}
 onClick={handleClaim}
 >
 {acting ? (
 <Loader2 className="w-3 h-3 animate-spin"/>
 ) : (
 <Trophy className="w-3 h-3"/>
 )}
 Asignar al mejor postor
 </Button>
 )}

 {/* Complete / Fail: only creator can mark when claimed */}
 {isClaimed && isCreator && (
 <>
 <Button
 size="sm"className="bg-green-600 hover:bg-green-700 text-white font-mono text-xs gap-1"disabled={acting}
 onClick={handleComplete}
 >
 {acting ? (
 <Loader2 className="w-3 h-3 animate-spin"/>
 ) : (
 <CheckCircle2 className="w-3 h-3"/>
 )}
 Completada
 </Button>
 <Button
 size="sm"variant="outline"className="font-mono text-xs gap-1 text-red-600 border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/20"disabled={acting}
 onClick={handleFail}
 >
 {acting ? (
 <Loader2 className="w-3 h-3 animate-spin"/>
 ) : (
 <XCircle className="w-3 h-3"/>
 )}
 No cumplió
 </Button>
 </>
 )}

 {/* Info badge for winner */}
 {isClaimed && isWinner && (
 <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-mono text-[10px] gap-1">
 <Clock className="w-3 h-3"/>
 Te toca entregar en{" "}
 <span className="tabular-nums tracking-tight">{auction.winning_bid}h</span>
 </Badge>
 )}
 </div>
 </CardContent>
 </Card>
 );
}

export default function SubastasPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [auctions, setAuctions] = useState<AuctionWithBids[]>([]);
 const [loading, setLoading] = useState(true);
 const [showCreateDialog, setShowCreateDialog] = useState(false);
 const [submitting, setSubmitting] = useState(false);

 // Form state
 const [title, setTitle] = useState("");
 const [description, setDescription] = useState("");
 const [maxHours, setMaxHours] = useState(8);
 const [deadlineHours, setDeadlineHours] = useState(24);

 const profileMapRef = useRef(new Map<string, Profile>());

 const loadData = useCallback(async () => {
 if (!orgId) return;

 // Load team profiles
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
 profileMapRef.current = profileMap;

 // Load auctions
 const { data: auctionRows } = await supabase
 .from("task_auctions")
 .select("*")
 .eq("org_id", orgId)
 .order("created_at", { ascending: false });

 if (!auctionRows || auctionRows.length === 0) {
 setAuctions([]);
 setLoading(false);
 return;
 }

 // Load all bids for these auctions
 const auctionIds = auctionRows.map((a) => a.id);
 const { data: bidRows } = await supabase
 .from("auction_bids")
 .select("*")
 .in("auction_id", auctionIds)
 .order("hours_bid", { ascending: true });

 const bidsByAuction = new Map<string, (AuctionBid & { profile?: Profile })[]>();
 for (const bid of bidRows ?? []) {
 const existing = bidsByAuction.get(bid.auction_id) ?? [];
 existing.push({ ...bid, profile: profileMap.get(bid.user_id) });
 bidsByAuction.set(bid.auction_id, existing);
 }

 const enriched: AuctionWithBids[] = auctionRows.map((a) => ({
 ...a,
 bids: bidsByAuction.get(a.id) ?? [],
 creator_profile: profileMap.get(a.created_by),
 winner_profile: a.winner_id ? profileMap.get(a.winner_id) : undefined,
 }));

 setAuctions(enriched);
 setLoading(false);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId) {
 setLoading(false);
 return;
 }
 loadData();
 }, [orgLoading, orgId, loadData]);

 // Real-time subscriptions
 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("subastas-rt")
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"task_auctions",
 filter:`org_id=eq.${orgId}`,
 },
 () => loadData()
 )
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"auction_bids",
 },
 () => loadData()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

 async function createAuction(e: React.FormEvent) {
 e.preventDefault();
 if (!orgId || !userId || !title.trim()) return;
 setSubmitting(true);

 const deadline = new Date(
 Date.now() + deadlineHours * 60 * 60 * 1000
 ).toISOString();

 await supabase.from("task_auctions").insert({
 org_id: orgId,
 created_by: userId,
 title: title.trim(),
 description: description.trim() || null,
 max_hours: Math.min(40, Math.max(1, maxHours)),
 status:"open",
 deadline,
 });

 setTitle("");
 setDescription("");
 setMaxHours(8);
 setDeadlineHours(24);
 setShowCreateDialog(false);
 await loadData();
 setSubmitting(false);
 }

 async function placeBid(auctionId: string, hours: number) {
 if (!userId) return;

 // Upsert: delete old bid then insert new one
 await supabase
 .from("auction_bids")
 .delete()
 .eq("auction_id", auctionId)
 .eq("user_id", userId);

 await supabase.from("auction_bids").insert({
 auction_id: auctionId,
 user_id: userId,
 hours_bid: hours,
 });

 await loadData();
 }

 async function claimAuction(auctionId: string) {
 const auction = auctions.find((a) => a.id === auctionId);
 if (!auction || auction.bids.length === 0) return;

 const sorted = [...auction.bids].sort((a, b) => a.hours_bid - b.hours_bid);
 const winner = sorted[0];

 await supabase
 .from("task_auctions")
 .update({
 status:"claimed",
 winner_id: winner.user_id,
 winning_bid: winner.hours_bid,
 })
 .eq("id", auctionId);

 await loadData();
 }

 async function completeAuction(auctionId: string) {
 await supabase
 .from("task_auctions")
 .update({ status:"completed"})
 .eq("id", auctionId);

 await loadData();
 }

 async function failAuction(auctionId: string) {
 await supabase
 .from("task_auctions")
 .update({ status:"failed"})
 .eq("id", auctionId);

 await loadData();
 }

 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">Cargando...</div>
 </div>
 );
 }

 const openAuctions = auctions.filter((a) => a.status ==="open");
 const claimedAuctions = auctions.filter((a) => a.status ==="claimed");
 const completedAuctions = auctions.filter((a) => a.status ==="completed");
 const failedAuctions = auctions.filter((a) => a.status ==="failed");

 const totalAuctions = auctions.length;
 const totalBids = auctions.reduce((sum, a) => sum + a.bids.length, 0);
 const completionRate =
 completedAuctions.length + failedAuctions.length > 0
 ? Math.round(
 (completedAuctions.length /
 (completedAuctions.length + failedAuctions.length)) *
 100
 )
 : 0;

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-start justify-between gap-4 mb-8">
 <div>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Hammer className="w-5 h-5 text-primary"/>
 Subasta de Tareas
 </h1>
 <p className="text-xs font-mono text-muted-foreground mt-1">
 Subasta inversa: publica una tarea, el equipo oferta el menor tiempo
 para completarla. Quien promete menos, gana.
 </p>
 </div>
 <Button
 onClick={() => setShowCreateDialog(true)}
 className="bg-primary font-mono text-xs gap-2 shrink-0">
 <Plus className="w-4 h-4"/>
 Nueva subasta
 </Button>
 </div>

 {/* Stats */}
 {totalAuctions > 0 && (
 <div className="grid grid-cols-4 gap-3 mb-8">
 <div className="bg-accent/30 border border-border p-3 text-center">
 <p className="text-2xl font-mono tabular-nums tracking-tight text-green-600">
 {openAuctions.length}
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">Abiertas</p>
 </div>
 <div className="bg-accent/30 border border-border p-3 text-center">
 <p className="text-2xl font-mono tabular-nums tracking-tight text-blue-600">
 {claimedAuctions.length}
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">En progreso</p>
 </div>
 <div className="bg-accent/30 border border-border p-3 text-center">
 <p className="text-2xl font-mono tabular-nums tracking-tight">
 {totalBids}
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">Ofertas totales</p>
 </div>
 <div className="bg-accent/30 border border-border p-3 text-center">
 <p className="text-2xl font-mono tabular-nums tracking-tight">
 {completionRate}%
 </p>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">Cumplimiento</p>
 </div>
 </div>
 )}

 {/* Open auctions */}
 {openAuctions.length > 0 && (
 <div className="mb-8">
 <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
 <Flame className="w-3 h-3"/>
 Subastas abiertas
 </h2>
 <div className="space-y-3">
 {openAuctions.map((auction) => (
 <AuctionCard
 key={auction.id}
 auction={auction}
 userId={userId}
 onBid={placeBid}
 onClaim={claimAuction}
 onComplete={completeAuction}
 onFail={failAuction}
 />
 ))}
 </div>
 </div>
 )}

 {/* Claimed / In Progress */}
 {claimedAuctions.length > 0 && (
 <div className="mb-8">
 <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
 <Clock className="w-3 h-3"/>
 En progreso
 </h2>
 <div className="space-y-3">
 {claimedAuctions.map((auction) => (
 <AuctionCard
 key={auction.id}
 auction={auction}
 userId={userId}
 onBid={placeBid}
 onClaim={claimAuction}
 onComplete={completeAuction}
 onFail={failAuction}
 />
 ))}
 </div>
 </div>
 )}

 {/* History: Completed + Failed */}
 {(completedAuctions.length > 0 || failedAuctions.length > 0) && (
 <div className="mb-8">
 <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
 <History className="w-3 h-3"/>
 Historial
 </h2>
 <div className="space-y-3">
 {[...completedAuctions, ...failedAuctions]
 .sort(
 (a, b) =>
 new Date(b.created_at).getTime() -
 new Date(a.created_at).getTime()
 )
 .map((auction) => (
 <AuctionCard
 key={auction.id}
 auction={auction}
 userId={userId}
 onBid={placeBid}
 onClaim={claimAuction}
 onComplete={completeAuction}
 onFail={failAuction}
 />
 ))}
 </div>
 </div>
 )}

 {/* Empty state */}
 {auctions.length === 0 && (
 <div className="flex flex-col items-center justify-center py-16 gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Hammer className="w-7 h-7 text-primary/40"/>
 </div>
 <div className="text-center">
 <p className="text-xs font-mono text-muted-foreground">
 No hay subastas activas.
 </p>
 <p className="text-xs font-mono text-muted-foreground mt-1">
 Publica una tarea que nadie quiere hacer y deja que el equipo
 compita por hacerla.
 </p>
 </div>
 <Button
 onClick={() => setShowCreateDialog(true)}
 className="bg-primary font-mono text-xs gap-2">
 <Plus className="w-4 h-4"/>
 Crear primera subasta
 </Button>
 </div>
 )}

 {/* Create auction dialog */}
 <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 font-mono uppercase tracking-tight text-base">
 <Hammer className="w-4 h-4 text-primary"/>
 Nueva subasta de tarea
 </DialogTitle>
 <DialogDescription className="font-mono text-xs">
 Publica una tarea para que el equipo oferte. Gana quien prometa
 completarla en menos tiempo.
 </DialogDescription>
 </DialogHeader>

 <form onSubmit={createAuction} className="space-y-4">
 <div>
 <Label htmlFor="auction-title"className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Tarea
 </Label>
 <Input
 id="auction-title"placeholder="Ej: Limpiar base de datos de prueba"value={title}
 onChange={(e) => setTitle(e.target.value)}
 required
 minLength={5}
 maxLength={200}
 className="mt-1"/>
 </div>

 <div>
 <Label
 htmlFor="auction-description"className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Detalles (opcional)
 </Label>
 <Textarea
 id="auction-description"placeholder="Contexto adicional, requisitos, entregables..."value={description}
 onChange={(e) => setDescription(e.target.value)}
 maxLength={1000}
 className="mt-1 min-h-[60px]"/>
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div>
 <Label
 htmlFor="auction-max-hours"className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Máximo de horas
 </Label>
 <Input
 id="auction-max-hours"type="number"min={1}
 max={40}
 step={1}
 value={maxHours}
 onChange={(e) => setMaxHours(Number(e.target.value))}
 required
 className="mt-1"/>
 <p className="text-[10px] text-muted-foreground mt-1">
 Tope para las ofertas
 </p>
 </div>
 <div>
 <Label
 htmlFor="auction-deadline"className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Cierre subasta (horas)
 </Label>
 <Input
 id="auction-deadline"type="number"min={1}
 max={168}
 step={1}
 value={deadlineHours}
 onChange={(e) => setDeadlineHours(Number(e.target.value))}
 required
 className="mt-1"/>
 <p className="text-[10px] text-muted-foreground mt-1">
 Tiempo para recibir ofertas
 </p>
 </div>
 </div>

 {/* Preview */}
 {title.trim() && (
 <div className="bg-accent/30 border border-border p-3 text-sm">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">Vista previa</p>
 <p>
 La tarea{" "}
 <span className="font-bold">&quot;{title.trim()}&quot;</span>{" "}
 acepta ofertas por{" "}
 <span className="font-bold tabular-nums tracking-tight">
 {deadlineHours}h
 </span>
 . Máximo{" "}
 <span className="font-bold tabular-nums tracking-tight">
 {maxHours}h
 </span>{" "}
 para completarla.
 </p>
 </div>
 )}

 <DialogFooter>
 <Button
 type="button"variant="outline"className="font-mono text-xs"onClick={() => setShowCreateDialog(false)}
 >
 Cancelar
 </Button>
 <Button
 type="submit"disabled={submitting || title.trim().length < 5}
 className="bg-primary font-mono text-xs gap-2">
 {submitting ? (
 <Loader2 className="w-4 h-4 animate-spin"/>
 ) : (
 <Hammer className="w-4 h-4"/>
 )}
 {submitting ?"Creando...":"Publicar subasta"}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 </div>
 );
}
