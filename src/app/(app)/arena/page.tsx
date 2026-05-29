"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
 TribunalSession,
 TribunalVote,
 AuditLottery,
 TimeEntry,
} from "@/lib/types/database";
import { CATEGORIES } from "@/lib/constants";
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
 Scale,
 XCircle,
 CheckCircle2,
 Shield,
 AlertTriangle,
 FileText,
 ImageOff,
 Ticket,
 Shuffle,
 Users,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────

type Tab ="tribunal"|"duelos"|"bounties"|"mercado"|"apuestas";

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

interface SessionWithDetails extends TribunalSession {
 entry: TimeEntry | null;
 nominated_profile: Profile | null;
 votes: (TribunalVote & { profile: Profile | null })[];
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

// ─── Tab Config ─────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
 { id:"tribunal", label:"TRIBUNAL", icon: Scale },
 { id:"duelos", label:"DUELOS", icon: Swords },
 { id:"bounties", label:"BOUNTIES", icon: Crosshair },
 { id:"mercado", label:"MERCADO", icon: CandlestickChart },
 { id:"apuestas", label:"APUESTAS", icon: Coins },
];

// ─── Main Page ──────────────────────────────────────────────────

export default function ArenaPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [tab, setTab] = useState<Tab>("tribunal");
 const [loading, setLoading] = useState(true);
 const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
 const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
 const [allMembers, setAllMembers] = useState<TeamMember[]>([]);

 // Tribunal state
 const [tribunalSession, setTribunalSession] = useState<SessionWithDetails | null>(null);
 const [creatingTribunal, setCreatingTribunal] = useState(false);
 const [votingTribunal, setVotingTribunal] = useState(false);

 // Lottery state
 const [todayLottery, setTodayLottery] = useState<EnrichedLottery | null>(null);
 const [todayFindings, setTodayFindings] = useState<AuditFindings | null>(null);
 const [spinningLottery, setSpinningLottery] = useState(false);
 const [auditingLottery, setAuditingLottery] = useState(false);

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
 const all: TeamMember[] = [];
 for (const m of members ?? []) {
 if (m.profiles) {
 const p = m.profiles as unknown as Profile;
 map.set(m.user_id, p);
 all.push({ user_id: m.user_id, profile: p });
 if (m.user_id !== userId) {
 team.push({ user_id: m.user_id, profile: p });
 }
 }
 }
 setProfileMap(map);
 setTeamMembers(team);
 setAllMembers(all);
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
 .eq("status","active");

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

 // ─── Load tribunal ─────────────────────────────────────────────

 const loadTribunal = useCallback(async (pMap: Map<string, Profile>) => {
 if (!orgId) return;
 const { data: todaySession } = await supabase
 .from("tribunal_sessions")
 .select("*")
 .eq("org_id", orgId)
 .eq("date", today)
 .limit(1)
 .single();

 if (todaySession) {
 const { data: entry } = await supabase
 .from("time_entries")
 .select("*")
 .eq("id", todaySession.entry_id)
 .single();

 const { data: votes } = await supabase
 .from("tribunal_votes")
 .select("*")
 .eq("session_id", todaySession.id)
 .order("created_at", { ascending: true });

 setTribunalSession({
 ...todaySession,
 entry: entry ?? null,
 nominated_profile: pMap.get(todaySession.nominated_user_id) ?? null,
 votes: (votes ?? []).map((v) => ({
 ...v,
 profile: pMap.get(v.user_id) ?? null,
 })),
 });
 } else {
 setTribunalSession(null);
 }
 }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

 // ─── Load lottery ─────────────────────────────────────────────

 const loadLottery = useCallback(async (pMap: Map<string, Profile>) => {
 if (!orgId) return;
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
 profile: pMap.get(lottery.selected_user_id) ?? null,
 });
 if (lottery.findings) {
 setTodayFindings(lottery.findings as unknown as AuditFindings);
 }
 } else {
 setTodayLottery(null);
 setTodayFindings(null);
 }
 }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

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
 loadTribunal(pMap),
 loadLottery(pMap),
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
 status:"pending",
 challenger_hours: 0,
 opponent_hours: 0,
 });
 setDuelOpponent("");
 const pMap = await loadProfiles();
 await loadDuels(pMap);
 setCreatingDuel(false);
 }

 async function acceptDuel(duelId: string) {
 await supabase.from("focus_duels").update({ status:"active"}).eq("id", duelId);
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
 status:"open",
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

 // ─── Tribunal actions ───────────────────────────────────────────

 async function createTribunalSession() {
 if (!orgId || !userId) return;
 setCreatingTribunal(true);

 const { data: entries } = await supabase
 .from("time_entries")
 .select("*")
 .eq("org_id", orgId)
 .eq("date", today)
 .order("created_at", { ascending: true });

 if (!entries || entries.length === 0) {
 setCreatingTribunal(false);
 return;
 }

 const scored = entries.map((e) => {
 let suspicion = 0;
 if (!e.proof_urls || e.proof_urls.length === 0) suspicion += 3;
 if (!e.description || e.description.length < 10) suspicion += 2;
 if (e.title.length < 15) suspicion += 1;
 if (e.verification_status ==="flagged") suspicion += 4;
 if (e.is_late) suspicion += 1;
 return { entry: e, suspicion };
 });
 scored.sort((a, b) => b.suspicion - a.suspicion);
 const target = scored[0].entry;

 const reasons: string[] = [];
 if (!target.proof_urls || target.proof_urls.length === 0) reasons.push("Sin evidencia");
 if (!target.description || target.description.length < 10) reasons.push("Descripcion vaga");
 if (target.title.length < 15) reasons.push("Titulo corto");
 if (target.verification_status ==="flagged") reasons.push("Marcado sospechoso");
 if (target.is_late) reasons.push("Entrada tardia");

 const { error } = await supabase.from("tribunal_sessions").insert({
 org_id: orgId,
 date: today,
 entry_id: target.id,
 nominated_user_id: target.user_id,
 reason: reasons.join(","),
 status:"voting",
 guilty_votes: 0,
 innocent_votes: 0,
 });

 if (!error) {
 const pMap = await loadProfiles();
 await loadTribunal(pMap);
 }
 setCreatingTribunal(false);
 }

 async function castTribunalVote(vote:"guilty"|"innocent") {
 if (!tribunalSession || !userId) return;
 setVotingTribunal(true);

 const alreadyVoted = tribunalSession.votes.some((v) => v.user_id === userId);
 if (alreadyVoted) {
 setVotingTribunal(false);
 return;
 }

 await supabase.from("tribunal_votes").insert({
 session_id: tribunalSession.id,
 user_id: userId,
 vote,
 });

 const newGuilty = tribunalSession.guilty_votes + (vote ==="guilty"? 1 : 0);
 const newInnocent = tribunalSession.innocent_votes + (vote ==="innocent"? 1 : 0);
 const totalVotes = newGuilty + newInnocent;

 let newStatus: TribunalSession["status"] ="voting";
 if (totalVotes >= 3) {
 if (newGuilty > newInnocent) newStatus ="guilty";
 else if (newInnocent > newGuilty) newStatus ="innocent";
 }

 await supabase
 .from("tribunal_sessions")
 .update({ guilty_votes: newGuilty, innocent_votes: newInnocent, status: newStatus })
 .eq("id", tribunalSession.id);

 if (newStatus ==="guilty") {
 await supabase
 .from("time_entries")
 .update({ verification_status:"flagged"})
 .eq("id", tribunalSession.entry_id);
 } else if (newStatus ==="innocent") {
 await supabase
 .from("time_entries")
 .update({ verification_status:"verified"})
 .eq("id", tribunalSession.entry_id);
 }

 const pMap = await loadProfiles();
 await loadTribunal(pMap);
 setVotingTribunal(false);
 }

 // ─── Lottery actions ──────────────────────────────────────────

 async function auditUser(targetUserId: string): Promise<AuditFindings> {
 if (!orgId) {
 return { hoursLogged: 0, totalEntries: 0, entriesWithProof: 0, proofPercent: 0, lateEntries: 0, hasCloseout: false, categories: {}, score: 0 };
 }

 const { data: entries } = await supabase
 .from("time_entries")
 .select("*")
 .eq("user_id", targetUserId)
 .eq("org_id", orgId)
 .eq("date", today);

 const { data: closeout } = await supabase
 .from("daily_closeouts")
 .select("*")
 .eq("user_id", targetUserId)
 .eq("org_id", orgId)
 .eq("date", today)
 .maybeSingle();

 const entryList = (entries ?? []) as TimeEntry[];
 const hoursLogged = entryList.length;
 const entriesWithProof = entryList.filter((e) => e.proof_urls && e.proof_urls.length > 0).length;
 const proofPercent = hoursLogged > 0 ? Math.round((entriesWithProof / hoursLogged) * 100) : 0;
 const lateEntries = entryList.filter((e) => e.is_late).length;
 const hasCloseout = !!closeout;
 const categories: Record<string, number> = {};
 for (const e of entryList) {
 categories[e.category] = (categories[e.category] ?? 0) + 1;
 }

 const hoursScore = Math.min(30, Math.round((hoursLogged / 8) * 30));
 const proofScore = Math.round((proofPercent / 100) * 30);
 const closeoutScore = hasCloseout ? 20 : 0;
 const punctualityScore = Math.max(0, 20 - lateEntries * 5);
 const score = hoursScore + proofScore + closeoutScore + punctualityScore;

 return { hoursLogged, totalEntries: entryList.length, entriesWithProof, proofPercent, lateEntries, hasCloseout, categories, score };
 }

 async function handleLotterySpinComplete(selectedUserId: string) {
 if (!orgId) return;
 setSpinningLottery(false);
 setAuditingLottery(true);

 const { data: newLottery, error } = await supabase
 .from("audit_lotteries")
 .insert({
 org_id: orgId,
 date: today,
 selected_user_id: selectedUserId,
 status:"auditing",
 findings: null,
 passed: null,
 })
 .select()
 .single();

 if (error || !newLottery) {
 setAuditingLottery(false);
 return;
 }

 const findings = await auditUser(selectedUserId);
 const passed = findings.score >= 70;
 const finalStatus = passed ?"passed":"failed";

 await supabase
 .from("audit_lotteries")
 .update({ findings: findings as unknown as Record<string, unknown>, passed, status: finalStatus })
 .eq("id", newLottery.id);

 const pMap = await loadProfiles();
 setTodayLottery({
 ...(newLottery as AuditLottery),
 findings: findings as unknown as Record<string, unknown>,
 passed,
 status: finalStatus,
 profile: pMap.get(selectedUserId) ?? null,
 });
 setTodayFindings(findings);
 setAuditingLottery(false);
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

 const activeDuels = duels.filter((d) => d.status ==="active"|| d.status ==="pending");
 const completedDuels = duels.filter((d) => d.status ==="completed");

 const openAuctions = auctions.filter((a) => a.status ==="open");
 const closedAuctions = auctions.filter((a) => a.status !=="open");

 const openPredictions = predictions.filter((p) => p.status ==="open");
 const resolvedPredictions = predictions.filter((p) => p.status !=="open");

 // ─── Render ────────────────────────────────────────────────────

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-6">
 <div className="flex items-center gap-2 mb-1">
 <Swords className="w-4 h-4 text-primary"/>
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
 ?"border-b-2 border-primary text-primary":"text-muted-foreground hover:text-foreground")}
 >
 <t.icon className="w-3 h-3"/>
 {t.label}
 </button>
 ))}
 </div>

 {/* Tab content */}
 {tab ==="tribunal"&& (
 <TribunalTab
 session={tribunalSession}
 userId={userId}
 creating={creatingTribunal}
 voting={votingTribunal}
 createSession={createTribunalSession}
 castVote={castTribunalVote}
 todayLottery={todayLottery}
 todayFindings={todayFindings}
 spinning={spinningLottery}
 auditing={auditingLottery}
 allMembers={allMembers}
 onStartSpin={() => setSpinningLottery(true)}
 onSpinComplete={handleLotterySpinComplete}
 profileMap={profileMap}
 />
 )}
 {tab ==="duelos"&& (
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
 {tab ==="bounties"&& (
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
 {tab ==="mercado"&& (
 <MercadoTab
 stocks={stocks}
 myInvestments={myInvestments}
 userId={userId}
 />
 )}
 {tab ==="apuestas"&& (
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
// TAB 0: TRIBUNAL + LOTERIA
// ═══════════════════════════════════════════════════════════════════

function TribunalTab({
 session,
 userId,
 creating,
 voting,
 createSession,
 castVote,
 todayLottery,
 todayFindings,
 spinning,
 auditing,
 allMembers,
 onStartSpin,
 onSpinComplete,
 profileMap,
}: {
 session: SessionWithDetails | null;
 userId: string | null;
 creating: boolean;
 voting: boolean;
 createSession: () => void;
 castVote: (vote:"guilty"|"innocent") => void;
 todayLottery: EnrichedLottery | null;
 todayFindings: AuditFindings | null;
 spinning: boolean;
 auditing: boolean;
 allMembers: TeamMember[];
 onStartSpin: () => void;
 onSpinComplete: (selectedId: string) => void;
 profileMap: Map<string, Profile>;
}) {
 const userAlreadyVoted = session?.votes.some((v) => v.user_id === userId) ?? false;
 const isOwnEntry = session?.nominated_user_id === userId;
 const isResolved = session?.status ==="guilty"|| session?.status ==="innocent";
 const totalVotes = (session?.guilty_votes ?? 0) + (session?.innocent_votes ?? 0);
 const guiltyPct = totalVotes > 0 ? Math.round(((session?.guilty_votes ?? 0) / totalVotes) * 100) : 0;

 const canSpin = allMembers.length >= 2 && !spinning && !auditing && !todayLottery;
 const hasLotteryResults = todayLottery && todayFindings && todayLottery.profile;

 return (
 <div className="space-y-8">
 {/* ── Section 1: Tribunal del Dia ─────────────────────────── */}
 <div>
 <p className="palantir-divider text-muted-foreground mb-3">TRIBUNAL DEL DIA</p>

 {!session ? (
 <div className="border border-border p-6 flex flex-col items-center gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Scale className="w-6 h-6 text-primary/40"/>
 </div>
 <div className="text-center">
 <p className="font-mono text-xs text-muted-foreground mb-3">
 Identifica la entrada mas sospechosa del dia y somete a votacion.
 </p>
 <Button
 onClick={createSession}
 disabled={creating}
 className="bg-primary text-primary-foreground font-mono text-xs gap-2">
 {creating ? (
 <Loader2 className="w-3 h-3 animate-spin"/>
 ) : (
 <Gavel className="w-3 h-3"/>
 )}
 {creating ?"Buscando...":"Iniciar Tribunal"}
 </Button>
 </div>
 </div>
 ) : (
 <div className="space-y-3">
 {/* Status badge */}
 <div className={cn(
"flex items-center gap-2 px-3 py-2 border font-mono text-xs",
 session.status ==="voting"&&"border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400",
 session.status ==="guilty"&&"border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400",
 session.status ==="innocent"&&"border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400",
 session.status ==="expired"&&"border-border bg-accent/20 text-muted-foreground")}>
 {session.status ==="voting"&& <><Scale className="w-3 h-3"/> Votacion en curso</>}
 {session.status ==="guilty"&& <><XCircle className="w-3 h-3"/> CULPABLE</>}
 {session.status ==="innocent"&& <><CheckCircle2 className="w-3 h-3"/> INOCENTE</>}
 {session.status ==="expired"&& <><Clock className="w-3 h-3"/> Expirada</>}
 </div>

 {/* Accused entry card */}
 <div className="border border-border p-4 transition-colors hover:border-primary/30">
 {/* Accused user */}
 <div className="flex items-center gap-2 mb-3">
 <Avatar className="w-7 h-7 ring-1 ring-border">
 <AvatarImage src={session.nominated_profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px] font-mono">
 {getInitials(session.nominated_profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div>
 <p className="text-xs font-mono font-medium">
 {session.nominated_profile?.full_name ??"Desconocido"}
 </p>
 <p className="font-mono text-[9px] text-muted-foreground">Acusado</p>
 </div>
 </div>

 {session.entry && (
 <div className="space-y-2">
 {/* Category + hour */}
 <div className="flex items-center gap-2 flex-wrap">
 <Badge className={cn("text-[9px] font-mono", CATEGORIES[session.entry.category]?.bgColor, CATEGORIES[session.entry.category]?.color)}>
 {CATEGORIES[session.entry.category]?.emoji} {CATEGORIES[session.entry.category]?.label}
 </Badge>
 <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
 {session.entry.hour}:00
 </span>
 {session.entry.is_late && (
 <Badge variant="outline"className="text-[9px] font-mono text-amber-600 border-amber-300">
 Tardia
 </Badge>
 )}
 </div>

 {/* Title */}
 <p className="text-sm font-mono font-medium">{session.entry.title}</p>
 {session.entry.description ? (
 <p className="text-xs text-muted-foreground line-clamp-2">{session.entry.description}</p>
 ) : (
 <p className="text-xs text-red-500 font-mono flex items-center gap-1">
 <AlertTriangle className="w-3 h-3"/> Sin descripcion
 </p>
 )}

 {/* Proof status */}
 <div className="flex items-center gap-2 text-xs font-mono">
 {session.entry.proof_urls && session.entry.proof_urls.length > 0 ? (
 <span className="flex items-center gap-1 text-green-600">
 <FileText className="w-3 h-3"/>
 {session.entry.proof_urls.length} evidencia{session.entry.proof_urls.length > 1 ?"s":""}
 </span>
 ) : (
 <span className="flex items-center gap-1 text-red-500">
 <ImageOff className="w-3 h-3"/> Sin evidencia
 </span>
 )}
 </div>

 {/* Reason */}
 {session.reason && (
 <div className="bg-accent/30 border border-border p-2">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
 Motivo
 </p>
 <p className="text-xs font-mono">{session.reason}</p>
 </div>
 )}
 </div>
 )}

 {/* Voting area */}
 {session.status ==="voting"&& (
 <div className="mt-3 pt-3 border-t border-border">
 {isOwnEntry ? (
 <div className="text-center py-2">
 <Shield className="w-4 h-4 text-muted-foreground mx-auto mb-1"/>
 <p className="font-mono text-[9px] text-muted-foreground">No puedes votar tu propia entrada</p>
 </div>
 ) : userAlreadyVoted ? (
 <div className="text-center py-2">
 <Check className="w-4 h-4 text-primary mx-auto mb-1"/>
 <p className="font-mono text-[9px] text-muted-foreground">Voto registrado. Esperando al equipo.</p>
 </div>
 ) : (
 <div className="flex gap-2">
 <Button
 onClick={() => castVote("guilty")}
 disabled={voting}
 className="flex-1 bg-red-600 text-white font-mono text-xs gap-1.5 hover:bg-red-700">
 {voting ? <Loader2 className="w-3 h-3 animate-spin"/> : <XCircle className="w-3 h-3"/>}
 Culpable
 </Button>
 <Button
 onClick={() => castVote("innocent")}
 disabled={voting}
 className="flex-1 bg-green-600 text-white font-mono text-xs gap-1.5 hover:bg-green-700">
 {voting ? <Loader2 className="w-3 h-3 animate-spin"/> : <CheckCircle2 className="w-3 h-3"/>}
 Inocente
 </Button>
 </div>
 )}
 </div>
 )}

 {/* Vote tally */}
 {totalVotes > 0 && (
 <div className="mt-3 pt-3 border-t border-border">
 <div className="flex items-center gap-2 mb-2">
 <Users className="w-3 h-3 text-muted-foreground"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Votos ({totalVotes})
 </span>
 </div>

 {/* Vote bar */}
 <div className="flex h-1.5 w-full overflow-hidden bg-accent/30 mb-2">
 {(session?.guilty_votes ?? 0) > 0 && (
 <div className="bg-red-500 transition-all duration-500"style={{ width:`${guiltyPct}%`}} />
 )}
 {(session?.innocent_votes ?? 0) > 0 && (
 <div className="bg-green-500 transition-all duration-500"style={{ width:`${100 - guiltyPct}%`}} />
 )}
 </div>

 <div className="grid grid-cols-2 gap-2 mb-2">
 <div className="bg-red-500/5 border border-red-500/20 p-2 text-center">
 <p className="text-lg font-mono font-bold tabular-nums tracking-tight text-red-600 dark:text-red-400">
 {session?.guilty_votes ?? 0}
 </p>
 <p className="font-mono text-[9px] text-red-600/60">Culpable</p>
 </div>
 <div className="bg-green-500/5 border border-green-500/20 p-2 text-center">
 <p className="text-lg font-mono font-bold tabular-nums tracking-tight text-green-600 dark:text-green-400">
 {session?.innocent_votes ?? 0}
 </p>
 <p className="font-mono text-[9px] text-green-600/60">Inocente</p>
 </div>
 </div>

 {/* Individual votes */}
 <div className="space-y-1">
 {session?.votes.map((v) => (
 <div key={v.id} className="flex items-center gap-2">
 <Avatar className="w-5 h-5 ring-1 ring-border">
 <AvatarImage src={v.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[7px] font-mono">
 {getInitials(v.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-mono truncate flex-1">
 {v.profile?.full_name?.split("")[0] ??"?"}
 </span>
 <Badge
 variant="outline"className={cn(
"font-mono text-[8px]",
 v.vote ==="guilty"?"border-red-500/30 text-red-500":"border-green-500/30 text-green-500")}
 >
 {v.vote ==="guilty"?"Culpable":"Inocente"}
 </Badge>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 </div>
 )}
 </div>

 {/* ── Section 2: Loteria Auditoria ────────────────────────── */}
 <div>
 <p className="palantir-divider text-muted-foreground mb-3">LOTERIA AUDITORIA</p>

 {!todayLottery && !spinning && !auditing ? (
 <div className="border border-border p-6 flex flex-col items-center gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Ticket className="w-6 h-6 text-primary/40"/>
 </div>
 <div className="text-center">
 <p className="font-mono text-xs text-muted-foreground mb-3">
 {allMembers.length < 2
 ?"Se necesitan al menos 2 miembros para la loteria.":"Nadie ha sido auditado hoy. Gira la ruleta."}
 </p>
 {allMembers.length >= 2 && (
 <Button
 onClick={onStartSpin}
 disabled={!canSpin}
 className="bg-primary text-primary-foreground font-mono text-xs gap-2">
 <Shuffle className="w-3 h-3"/>
 Girar Ruleta
 </Button>
 )}
 </div>
 </div>
 ) : spinning ? (
 <div className="border border-primary/30 p-6">
 <LotterySpinCompact
 members={allMembers}
 onComplete={onSpinComplete}
 />
 </div>
 ) : auditing ? (
 <div className="border border-border p-6 flex flex-col items-center gap-3">
 <Loader2 className="w-6 h-6 text-primary animate-spin"/>
 <p className="font-mono text-xs text-muted-foreground">Analizando ultimas 24 horas...</p>
 </div>
 ) : hasLotteryResults && todayLottery.profile ? (
 <div className="border border-border p-4 transition-colors hover:border-primary/30">
 {/* Result header */}
 <div className="flex items-center gap-3 mb-3">
 <Avatar className="w-8 h-8 ring-1 ring-border">
 <AvatarImage src={todayLottery.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px] font-mono font-bold">
 {getInitials(todayLottery.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-mono font-medium truncate">
 {todayLottery.profile.full_name ?? todayLottery.profile.email}
 </p>
 <p className="font-mono text-[9px] text-muted-foreground">Auditado hoy</p>
 </div>
 <div className={cn(
"text-center px-3 py-1.5 border",
 todayFindings.score >= 70
 ?"border-green-500/20 bg-green-500/5":"border-red-500/20 bg-red-500/5")}>
 <p className={cn(
"text-xl font-mono font-black tabular-nums tracking-tight",
 todayFindings.score >= 70 ?"text-green-600 dark:text-green-400":"text-red-600 dark:text-red-400")}>
 {todayFindings.score}
 </p>
 </div>
 <Badge className={cn(
"font-mono text-[9px]",
 todayFindings.score >= 70
 ?"bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400":"bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400")}>
 {todayFindings.score >= 70 ? (
 <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> APROBADO</span>
 ) : (
 <span className="flex items-center gap-1"><XCircle className="w-3 h-3"/> REPROBADO</span>
 )}
 </Badge>
 </div>

 {/* Compact findings grid */}
 <div className="grid grid-cols-4 gap-2">
 <div className="bg-accent/30 border border-border p-2 text-center">
 <p className="text-sm font-mono font-bold tabular-nums tracking-tight">{todayFindings.hoursLogged}</p>
 <p className="font-mono text-[9px] text-muted-foreground">Horas</p>
 </div>
 <div className="bg-accent/30 border border-border p-2 text-center">
 <p className="text-sm font-mono font-bold tabular-nums tracking-tight">{todayFindings.proofPercent}%</p>
 <p className="font-mono text-[9px] text-muted-foreground">Evidencia</p>
 </div>
 <div className="bg-accent/30 border border-border p-2 text-center">
 <p className="text-sm font-mono font-bold tabular-nums tracking-tight">{todayFindings.lateEntries}</p>
 <p className="font-mono text-[9px] text-muted-foreground">Tardias</p>
 </div>
 <div className="bg-accent/30 border border-border p-2 text-center">
 <p className="text-sm font-mono font-bold tabular-nums tracking-tight">{todayFindings.hasCloseout ?"Si":"No"}</p>
 <p className="font-mono text-[9px] text-muted-foreground">Cierre</p>
 </div>
 </div>
 </div>
 ) : null}
 </div>
 </div>
 );
}

// ─── Compact Lottery Spin ────────────────────────────────────────

function LotterySpinCompact({
 members,
 onComplete,
}: {
 members: TeamMember[];
 onComplete: (selectedId: string) => void;
}) {
 const [currentIdx, setCurrentIdx] = useState(0);
 const [phase, setPhase] = useState<"fast"|"slowing"|"done">("fast");
 const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
 <div className="flex flex-col items-center gap-4">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground animate-pulse">
 Seleccionando candidato...
 </p>
 <Avatar className={cn(
"w-16 h-16 ring-1 ring-border transition-all duration-300",
 phase ==="done"&&"ring-2 ring-primary scale-110")}>
 <AvatarImage src={current.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-lg font-mono font-bold bg-primary text-primary-foreground">
 {getInitials(current.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <p className={cn(
"font-mono font-bold tabular-nums tracking-tight transition-all duration-300",
 phase ==="fast"&&"text-muted-foreground blur-[1px] text-xs",
 phase ==="slowing"&&"text-foreground text-sm",
 phase ==="done"&&"text-primary text-base")}>
 {current.profile.full_name ?? current.profile.email}
 </p>
 <div className="flex items-center gap-1">
 {members.map((m, i) => (
 <Avatar
 key={m.user_id}
 className={cn(
"w-6 h-6 transition-all duration-200 shrink-0",
 i === currentIdx
 ?"ring-2 ring-primary scale-125":"ring-1 ring-border/30 opacity-40 scale-90")}
 >
 <AvatarImage src={m.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px] font-mono">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 ))}
 </div>
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
 <p className="palantir-divider text-muted-foreground mb-3">RETAR</p>
 <div className="border border-border p-4">
 <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
 {teamMembers.map((m) => (
 <button
 key={m.user_id}
 onClick={() => setDuelOpponent(m.user_id)}
 className={cn(
"flex items-center gap-2 p-2 text-left transition-colors border cursor-pointer",
 duelOpponent === m.user_id
 ?"border-primary/50 bg-primary/5":"border-border hover:border-primary/30")}
 >
 <Avatar className="w-6 h-6 ring-1 ring-border">
 <AvatarImage src={m.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px] font-mono">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-mono truncate">
 {m.profile.full_name?.split("")[0] ?? m.profile.email}
 </span>
 {duelOpponent === m.user_id && (
 <Check className="w-3 h-3 text-primary ml-auto shrink-0"/>
 )}
 </button>
 ))}
 </div>
 <Button
 className="w-full bg-primary font-mono text-xs gap-2"disabled={!duelOpponent || creatingDuel}
 onClick={createDuel}
 >
 {creatingDuel ? <Loader2 className="w-3 h-3 animate-spin"/> : <Swords className="w-3 h-3"/>}
 {creatingDuel ?"Creando...":"Retar a Focus Duel"}
 </Button>
 </div>
 </div>

 {/* Active duels */}
 <div>
 <p className="palantir-divider text-muted-foreground mb-3">DUELOS ACTIVOS</p>
 {duels.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-10 gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Swords className="w-6 h-6 text-primary/40"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground">La arena está vacía. Nadie se atreve a competir.</p>
 </div>
 ) : (
 <div className="space-y-2">
 {duels.map((d) => {
 const isPending = d.status ==="pending";
 const isOpponent = d.opponent_id === userId;
 const leading =
 d.challenger_hours > d.opponent_hours
 ?"challenger": d.opponent_hours > d.challenger_hours
 ?"opponent":"tie";

 return (
 <div
 key={d.id}
 className="border border-border p-3 transition-colors hover:border-primary/30">
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
 {d.challenger_profile?.full_name?.split("")[0] ??"?"}
 </p>
 <p className={cn(
"text-sm font-mono tabular-nums tracking-tight font-bold",
 leading ==="challenger"&&"text-green-500")}>
 {d.challenger_hours}h
 </p>
 </div>
 </div>

 {/* VS */}
 <div className="flex flex-col items-center gap-1 shrink-0">
 <span className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground uppercase">VS</span>
 <Badge variant="outline"className="font-mono text-[9px]">
 {isPending ?"Pendiente": d.date}
 </Badge>
 </div>

 {/* Opponent */}
 <div className="flex items-center gap-2 flex-1 min-w-0 justify-end text-right">
 <div className="min-w-0">
 <p className="text-xs font-mono truncate">
 {d.opponent_profile?.full_name?.split("")[0] ??"?"}
 </p>
 <p className={cn(
"text-sm font-mono tabular-nums tracking-tight font-bold",
 leading ==="opponent"&&"text-green-500")}>
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
 variant="outline"size="sm"className="font-mono text-xs gap-1.5"onClick={() => acceptDuel(d.id)}
 >
 <Check className="w-3 h-3"/>
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
 <p className="palantir-divider text-muted-foreground mb-3">HISTORIAL</p>
 <div className="space-y-1">
 {completedDuels.slice(0, 10).map((d) => {
 const challengerWon = d.winner_id === d.challenger_id;
 return (
 <div key={d.id} className="border border-border/50 p-2 flex items-center gap-3">
 <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-20 shrink-0">
 {d.date}
 </span>
 <span className={cn("text-xs font-mono truncate", challengerWon &&"text-green-500")}>
 {d.challenger_profile?.full_name?.split("")[0] ??"?"} ({d.challenger_hours}h)
 </span>
 <span className="text-[10px] font-mono text-muted-foreground">vs</span>
 <span className={cn("text-xs font-mono truncate", !challengerWon && d.winner_id &&"text-green-500")}>
 {d.opponent_profile?.full_name?.split("")[0] ??"?"} ({d.opponent_hours}h)
 </span>
 <Trophy className="w-3 h-3 text-amber-500 ml-auto shrink-0"/>
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
 <p className="palantir-divider text-muted-foreground flex-1">SUBASTAS DE TAREAS</p>
 <Button
 variant="outline"size="sm"className="font-mono text-xs gap-1.5"onClick={() => setShowForm(!showForm)}
 >
 <Plus className="w-3 h-3"/>
 Nueva
 </Button>
 </div>

 {showForm && (
 <div className="border border-border p-4 mb-4 space-y-3">
 <Input
 placeholder="Titulo de la tarea"value={auctionTitle}
 onChange={(e) => setAuctionTitle(e.target.value)}
 className="font-mono text-xs"/>
 <Textarea
 placeholder="Descripción (opcional)"value={auctionDesc}
 onChange={(e) => setAuctionDesc(e.target.value)}
 className="font-mono text-xs"rows={2}
 />
 <div className="flex gap-3">
 <div className="flex-1">
 <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1 block">
 Max horas
 </label>
 <Input
 type="number"value={auctionMaxHours}
 onChange={(e) => setAuctionMaxHours(e.target.value)}
 className="font-mono text-xs"/>
 </div>
 <div className="flex-1">
 <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1 block">
 Deadline
 </label>
 <Input
 type="date"value={auctionDeadline}
 onChange={(e) => setAuctionDeadline(e.target.value)}
 className="font-mono text-xs"/>
 </div>
 </div>
 <Button
 className="w-full bg-primary font-mono text-xs gap-2"disabled={!auctionTitle || creating}
 onClick={createAuction}
 >
 {creating ? <Loader2 className="w-3 h-3 animate-spin"/> : <Hammer className="w-3 h-3"/>}
 {creating ?"Creando...":"Publicar subasta"}
 </Button>
 </div>
 )}

 {/* Open auctions */}
 {auctions.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-10 gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Crosshair className="w-6 h-6 text-primary/40"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground">Sin subastas activas. El mercado está cerrado.</p>
 </div>
 ) : (
 <div className="space-y-2">
 {auctions.map((a) => {
 const lowestBid = a.bids.length > 0 ? Math.min(...a.bids.map((b) => b.hours_bid)) : null;
 const myBid = a.bids.find((b) => b.user_id === userId);

 return (
 <div
 key={a.id}
 className="border border-border p-3 transition-colors hover:border-primary/30">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0 flex-1">
 <p className="text-sm font-mono font-medium">{a.title}</p>
 {a.description && (
 <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.description}</p>
 )}
 <div className="flex items-center gap-3 mt-2">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground flex items-center gap-1">
 <Clock className="w-3 h-3"/>
 Max {a.max_hours}h
 </span>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
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
 type="number"placeholder="Horas"className="font-mono text-xs w-20"value={bidAmounts[a.id] ??""}
 onChange={(e) => setBidAmounts({ ...bidAmounts, [a.id]: e.target.value })}
 />
 <Button
 size="sm"variant="outline"className="font-mono text-xs gap-1"disabled={!bidAmounts[a.id]}
 onClick={() => {
 placeBid(a.id, Number(bidAmounts[a.id]));
 setBidAmounts({ ...bidAmounts, [a.id]:""});
 }}
 >
 <Gavel className="w-3 h-3"/>
 Ofertar
 </Button>
 </div>
 )}
 {myBid && (
 <div className="mt-2 pt-2 border-t border-border">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-primary flex items-center gap-1">
 <Check className="w-3 h-3"/>
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
 <p className="palantir-divider text-muted-foreground mb-3">COMPLETADAS</p>
 <div className="space-y-1">
 {closedAuctions.slice(0, 8).map((a) => (
 <div key={a.id} className="border border-border/50 p-2 flex items-center gap-3">
 <Badge variant="outline"className="font-mono text-[8px] shrink-0">
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
 <p className="palantir-divider text-muted-foreground mb-3">MI PORTAFOLIO</p>
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
 {inv.target_profile?.full_name?.split("")[0] ??"?"}
 </span>
 </div>
 <div className="flex items-baseline gap-2">
 <span className="font-mono text-lg tabular-nums tracking-tight font-bold">
 {inv.current_value}
 </span>
 <span className={cn(
"font-mono text-xs tabular-nums",
 isUp ?"text-green-500":"text-red-500")}>
 {isUp ?"+":""}{gain}
 </span>
 </div>
 <p className="font-mono text-[9px] text-muted-foreground mt-1">
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
 <p className="palantir-divider text-muted-foreground mb-3">TRUST MARKET</p>
 {stocks.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-10 gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <CandlestickChart className="w-6 h-6 text-primary/40"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground">Sin datos de Trust Score. Nadie ha generado historial.</p>
 </div>
 ) : (
 <div className="border border-border divide-y divide-border">
 {/* Table header */}
 <div className="grid grid-cols-12 gap-2 p-2 text-muted-foreground">
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
 isMe &&"bg-primary/5")}
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
 <span className={cn("text-xs font-mono truncate", isMe &&"text-primary font-medium")}>
 {s.profile.full_name?.split("")[0] ?? s.profile.email}
 </span>
 </div>
 <span className="col-span-2 font-mono text-sm tabular-nums tracking-tight font-bold text-right">
 {s.current_score}
 </span>
 <div className="col-span-2 flex items-center justify-end gap-1">
 {isUp ? (
 <TrendingUp className="w-3 h-3 text-green-500"/>
 ) : (
 <TrendingDown className="w-3 h-3 text-red-500"/>
 )}
 <span className={cn(
"font-mono text-xs tabular-nums",
 isUp ?"text-green-500":"text-red-500")}>
 {isUp ?"+":""}{s.trend_pct.toFixed(1)}%
 </span>
 </div>
 <span className="col-span-3 font-mono text-xs tabular-nums text-right text-muted-foreground">
 {s.investments_in > 0 ?`${s.investments_in} pts`:"-"}
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
 <p className="palantir-divider text-muted-foreground mb-3">PREDICCIONES ACTIVAS</p>
 {predictions.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-10 gap-3">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <Target className="w-6 h-6 text-primary/40"/>
 </div>
 <p className="font-mono text-xs text-muted-foreground">Sin predicciones activas. Nadie se compromete con el futuro.</p>
 </div>
 ) : (
 <div className="space-y-2">
 {predictions.map((p) => {
 const totalBets = p.bets.length;
 const yesBets = p.bets.filter((b) => b.bet ==="yes"|| b.bet ==="si").length;
 const yesPercent = totalBets > 0 ? Math.round((yesBets / totalBets) * 100) : 50;

 return (
 <div
 key={p.id}
 className="border border-border p-3 transition-colors hover:border-primary/30">
 <div className="flex items-start justify-between gap-3">
 <div className="flex-1 min-w-0">
 <p className="text-sm font-mono font-medium">{p.question}</p>
 <div className="flex items-center gap-3 mt-1.5">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground flex items-center gap-1">
 <Clock className="w-3 h-3"/>
 {p.resolution_date}
 </span>
 <Badge variant="outline"className="font-mono text-[8px]">
 {p.type ==="yes_no"?"Si/No": p.type}
 </Badge>
 <span className="font-mono text-[9px] text-muted-foreground">
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
 className="h-full bg-green-500 transition-all"style={{ width:`${yesPercent}%`}}
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
 <ShieldCheck className="w-3 h-3"/>
 Tu apuesta: {p.my_bet.bet} (confianza: {p.my_bet.confidence}%)
 </span>
 </div>
 ) : p.type ==="yes_no"? (
 <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
 <Button
 size="sm"variant="outline"className="font-mono text-xs gap-1 flex-1"onClick={() => placeBet(p.id,"yes", 75)}
 >
 <Check className="w-3 h-3 text-green-500"/>
 Si
 </Button>
 <Button
 size="sm"variant="outline"className="font-mono text-xs gap-1 flex-1"onClick={() => placeBet(p.id,"no", 75)}
 >
 <X className="w-3 h-3 text-red-500"/>
 No
 </Button>
 </div>
 ) : (
 <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
 <Input
 placeholder="Tu predicción"className="font-mono text-xs flex-1"value={betInputs[p.id]?.bet ??""}
 onChange={(e) =>
 setBetInputs({
 ...betInputs,
 [p.id]: { bet: e.target.value, confidence: betInputs[p.id]?.confidence ?? 75 },
 })
 }
 />
 <Button
 size="sm"variant="outline"className="font-mono text-xs gap-1"disabled={!betInputs[p.id]?.bet}
 onClick={() => {
 const input = betInputs[p.id];
 if (input?.bet) {
 placeBet(p.id, input.bet, input.confidence);
 setBetInputs({ ...betInputs, [p.id]: { bet:"", confidence: 75 } });
 }
 }}
 >
 <ArrowRight className="w-3 h-3"/>
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
 <span className="font-mono text-[9px] text-muted-foreground">
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
 <p className="palantir-divider text-muted-foreground mb-3">RESUELTAS</p>
 <div className="space-y-1">
 {resolvedPredictions.slice(0, 10).map((p) => (
 <div key={p.id} className="border border-border/50 p-2 flex items-center gap-3">
 <Badge
 variant="outline"className={cn(
"font-mono text-[8px] shrink-0",
 p.status ==="resolved_yes"&&"border-green-500/30 text-green-500",
 p.status ==="resolved_no"&&"border-red-500/30 text-red-500")}
 >
 {p.status ==="resolved_yes"?"SI": p.status ==="resolved_no"?"NO": p.status}
 </Badge>
 <span className="text-xs font-mono truncate flex-1">{p.question}</span>
 {p.my_bet && (
 <Badge
 variant="outline"className={cn(
"font-mono text-[8px]",
 p.my_bet.is_correct === true &&"border-green-500/30 text-green-500",
 p.my_bet.is_correct === false &&"border-red-500/30 text-red-500")}
 >
 {p.my_bet.is_correct === true ?"Acertaste": p.my_bet.is_correct === false ?"Fallaste":"Pendiente"}
 </Badge>
 )}
 <span className="font-mono text-[9px] text-muted-foreground tabular-nums shrink-0">
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
