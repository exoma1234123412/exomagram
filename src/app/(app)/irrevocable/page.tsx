"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { getTodayMTY, getInitials, cn } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
 startOfWeek,
 endOfWeek,
 differenceInCalendarDays,
 format,
 getDay,
 isAfter,
 isBefore,
 addWeeks,
 subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import {
 Lock,
 ShieldAlert,
 Clock,
 TrendingUp,
 AlertTriangle,
 CheckCircle2,
 XCircle,
 Loader2,
 ChevronLeft,
 ChevronRight,
 Users,
 Target,
 FileWarning,
 Minus,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface IrrevocableBet {
 hours_committed: number;
 hours_with_proof: number;
 signed_at: string;
 result?:"success"|"failure";
}

interface BetContract {
 id: string;
 user_id: string;
 org_id: string;
 week_start: string;
 commitments: { text: string; delivered: boolean; grade?: string }[];
 overall_grade: string | null;
 ai_assessment: string | null;
 status:"active"|"graded";
 created_at: string;
 graded_at: string | null;
 profiles?: Profile;
}

interface WeekProgress {
 total_hours: number;
 hours_with_proof: number;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getWeekStartMon(date: Date = new Date()): string {
 return format(startOfWeek(date, { weekStartsOn: 1 }),"yyyy-MM-dd");
}

function getWeekEndDate(weekStartStr: string): Date {
 const d = new Date(weekStartStr +"T12:00:00");
 return endOfWeek(d, { weekStartsOn: 1 });
}

function daysLeftWorkdays(weekStartStr: string): number {
 const today = new Date();
 const end = getWeekEndDate(weekStartStr);
 // Friday = day 5 from Monday start, so end of work week
 const friday = new Date(weekStartStr +"T12:00:00");
 friday.setDate(friday.getDate() + 4); // Monday + 4 = Friday
 const target = isBefore(today, friday) ? friday : end;
 const diff = differenceInCalendarDays(target, today);
 return Math.max(0, diff + 1);
}

function formatWeekRange(weekStartStr: string): string {
 const start = new Date(weekStartStr +"T12:00:00");
 const end = getWeekEndDate(weekStartStr);
 return`${format(start,"d MMM", { locale: es })} - ${format(end,"d MMM yyyy", { locale: es })}`;
}

function parseBetFromCommitments(
 commitments: { text: string; delivered: boolean; grade?: string }[]
): IrrevocableBet | null {
 // We store the irrevocable bet as a special commitment with a JSON prefix
 const betEntry = commitments.find((c) => c.text.startsWith("__IRREVOCABLE_BET__:"));
 if (!betEntry) return null;
 try {
 const json = betEntry.text.replace("__IRREVOCABLE_BET__:","");
 return JSON.parse(json) as IrrevocableBet;
 } catch {
 return null;
 }
}

function createBetCommitment(bet: IrrevocableBet): { text: string; delivered: boolean } {
 return {
 text:`__IRREVOCABLE_BET__:${JSON.stringify(bet)}`,
 delivered: false,
 };
}

function canPlaceBet(): boolean {
 // Can only place bets Monday (1) or Tuesday (2)
 const now = new Date();
 // Use MTY timezone
 const mtyDate = new Date(
 now.toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 const day = getDay(mtyDate);
 return day === 1 || day === 2; // Monday or Tuesday
}

function isWeekFinished(weekStartStr: string): boolean {
 const friday = new Date(weekStartStr +"T12:00:00");
 friday.setDate(friday.getDate() + 4);
 friday.setHours(23, 59, 59);
 const now = new Date();
 return isAfter(now, friday);
}

function getCurrentDayOfWeek(): number {
 const now = new Date();
 const mtyDate = new Date(
 now.toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 return getDay(mtyDate);
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function IrrevocablePage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [myBet, setMyBet] = useState<IrrevocableBet | null>(null);
 const [myContractId, setMyContractId] = useState<string | null>(null);
 const [myProgress, setMyProgress] = useState<WeekProgress>({ total_hours: 0, hours_with_proof: 0 });
 const [teamBets, setTeamBets] = useState<(BetContract & { bet: IrrevocableBet; progress: WeekProgress })[]>([]);
 const [teamWithout, setTeamWithout] = useState<Profile[]>([]);
 const [history, setHistory] = useState<{ week: string; bet: IrrevocableBet; progress: WeekProgress }[]>([]);
 const [loading, setLoading] = useState(true);
 const [submitting, setSubmitting] = useState(false);

 // Form
 const [hoursCommitted, setHoursCommitted] = useState(30);
 const [proofCommitted, setProofCommitted] = useState(20);

 // Week nav
 const [currentWeek, setCurrentWeek] = useState(getWeekStartMon());
 const isCurrentWeek = currentWeek === getWeekStartMon();
 const weekFinished = isWeekFinished(currentWeek);
 const canBet = canPlaceBet() && isCurrentWeek && !myBet;

 // ─── Load Data ─────────────────────────────

 const loadData = useCallback(async () => {
 if (!orgId || !userId) return;
 setLoading(true);

 const weekStart = currentWeek;
 const weekEndStr = format(getWeekEndDate(weekStart),"yyyy-MM-dd");

 // 1. Load my contract for this week (that has an irrevocable bet)
 const { data: myContracts } = await supabase
 .from("weekly_contracts")
 .select("*")
 .eq("user_id", userId)
 .eq("org_id", orgId)
 .eq("week_start", weekStart);

 let foundBet: IrrevocableBet | null = null;
 let foundContractId: string | null = null;

 if (myContracts) {
 for (const c of myContracts) {
 const bet = parseBetFromCommitments(
 c.commitments as { text: string; delivered: boolean; grade?: string }[]
 );
 if (bet) {
 foundBet = bet;
 foundContractId = c.id;
 break;
 }
 }
 }

 setMyBet(foundBet);
 setMyContractId(foundContractId);

 // 2. Load my time entries for this week
 const { data: myEntries } = await supabase
 .from("time_entries")
 .select("id, proof_urls, links")
 .eq("user_id", userId)
 .eq("org_id", orgId)
 .gte("date", weekStart)
 .lte("date", weekEndStr);

 const totalHours = myEntries?.length ?? 0;
 const withProof = myEntries?.filter(
 (e) => (e.proof_urls && e.proof_urls.length > 0) || (e.links && e.links.length > 0)
 ).length ?? 0;

 setMyProgress({ total_hours: totalHours, hours_with_proof: withProof });

 // 3. Load all org members
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 const allMembers = (members ?? []) as unknown as { user_id: string; profiles: Profile }[];
 const otherMembers = allMembers.filter((m) => m.user_id !== userId);

 // 4. Load all team contracts for this week
 const { data: teamContractsRaw } = await supabase
 .from("weekly_contracts")
 .select("*, profiles(full_name, avatar_url)")
 .eq("org_id", orgId)
 .eq("week_start", weekStart)
 .neq("user_id", userId);

 const teamBetsArr: (BetContract & { bet: IrrevocableBet; progress: WeekProgress })[] = [];
 const teamUserIdsWithBets = new Set<string>();

 if (teamContractsRaw) {
 for (const tc of teamContractsRaw) {
 const bet = parseBetFromCommitments(
 tc.commitments as { text: string; delivered: boolean; grade?: string }[]
 );
 if (bet) {
 // Load this user's entries
 const { data: theirEntries } = await supabase
 .from("time_entries")
 .select("id, proof_urls, links")
 .eq("user_id", tc.user_id)
 .eq("org_id", orgId)
 .gte("date", weekStart)
 .lte("date", weekEndStr);

 const theirTotal = theirEntries?.length ?? 0;
 const theirProof = theirEntries?.filter(
 (e) => (e.proof_urls && e.proof_urls.length > 0) || (e.links && e.links.length > 0)
 ).length ?? 0;

 teamBetsArr.push({
 ...(tc as unknown as BetContract),
 bet,
 progress: { total_hours: theirTotal, hours_with_proof: theirProof },
 });
 teamUserIdsWithBets.add(tc.user_id);
 }
 }
 }

 setTeamBets(teamBetsArr);

 // 5. People without bets
 const withoutBets = otherMembers
 .filter((m) => !teamUserIdsWithBets.has(m.user_id))
 .map((m) => m.profiles);
 setTeamWithout(withoutBets);

 // 6. Load history (past weeks with irrevocable bets)
 const { data: pastContracts } = await supabase
 .from("weekly_contracts")
 .select("*")
 .eq("user_id", userId)
 .eq("org_id", orgId)
 .neq("week_start", weekStart)
 .order("week_start", { ascending: false })
 .limit(12);

 const historyArr: { week: string; bet: IrrevocableBet; progress: WeekProgress }[] = [];

 if (pastContracts) {
 for (const pc of pastContracts) {
 const bet = parseBetFromCommitments(
 pc.commitments as { text: string; delivered: boolean; grade?: string }[]
 );
 if (bet) {
 // Load entries for that week
 const pastWeekEnd = format(getWeekEndDate(pc.week_start),"yyyy-MM-dd");
 const { data: pastEntries } = await supabase
 .from("time_entries")
 .select("id, proof_urls, links")
 .eq("user_id", userId)
 .eq("org_id", orgId)
 .gte("date", pc.week_start)
 .lte("date", pastWeekEnd);

 const pastTotal = pastEntries?.length ?? 0;
 const pastProof = pastEntries?.filter(
 (e) => (e.proof_urls && e.proof_urls.length > 0) || (e.links && e.links.length > 0)
 ).length ?? 0;

 // Determine result
 const result:"success"|"failure"=
 pastTotal >= bet.hours_committed && pastProof >= bet.hours_with_proof
 ?"success":"failure";

 historyArr.push({
 week: pc.week_start,
 bet: { ...bet, result },
 progress: { total_hours: pastTotal, hours_with_proof: pastProof },
 });
 }
 }
 }

 setHistory(historyArr);
 setLoading(false);
 }, [orgId, userId, currentWeek]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId || !userId) {
 setLoading(false);
 return;
 }
 loadData();
 }, [orgLoading, orgId, userId, loadData]);

 // Real-time
 useEffect(() => {
 if (!orgId) return;
 const channel = supabase
 .channel("irrevocable_bets_rt")
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"weekly_contracts",
 filter:`org_id=eq.${orgId}`,
 },
 () => loadData()
 )
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"time_entries",
 filter:`org_id=eq.${orgId}`,
 },
 () => loadData()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

 // ─── Sign Bet ──────────────────────────────

 async function signBet() {
 if (!userId || !orgId || submitting) return;
 if (hoursCommitted < 20 || hoursCommitted > 50) return;
 if (proofCommitted < 0 || proofCommitted > hoursCommitted) return;

 setSubmitting(true);

 const bet: IrrevocableBet = {
 hours_committed: hoursCommitted,
 hours_with_proof: proofCommitted,
 signed_at: new Date().toISOString(),
 };

 const commitment = createBetCommitment(bet);

 // Check if we already have a weekly_contract for this week
 const { data: existing } = await supabase
 .from("weekly_contracts")
 .select("id, commitments")
 .eq("user_id", userId)
 .eq("org_id", orgId)
 .eq("week_start", currentWeek)
 .limit(1)
 .single();

 if (existing) {
 // Append bet to existing contract commitments
 const existingCommitments = existing.commitments as { text: string; delivered: boolean }[];
 await supabase
 .from("weekly_contracts")
 .update({
 commitments: [...existingCommitments, commitment],
 })
 .eq("id", existing.id);
 } else {
 // Create new contract with just the bet
 await supabase.from("weekly_contracts").insert({
 user_id: userId,
 org_id: orgId,
 week_start: currentWeek,
 commitments: [commitment],
 status:"active",
 });
 }

 setMyBet(bet);
 setSubmitting(false);
 loadData();
 }

 // ─── Week Navigation ──────────────────────

 function goToPrevWeek() {
 const d = new Date(currentWeek +"T12:00:00");
 setCurrentWeek(getWeekStartMon(subWeeks(d, 1)));
 }

 function goToNextWeek() {
 const d = new Date(currentWeek +"T12:00:00");
 const next = getWeekStartMon(addWeeks(d, 1));
 if (next <= getWeekStartMon()) {
 setCurrentWeek(next);
 }
 }

 // ─── Derived ───────────────────────────────

 const remaining = daysLeftWorkdays(currentWeek);
 const dayOfWeek = getCurrentDayOfWeek(); // 0=Sun, 1=Mon, ..., 5=Fri
 const workdaysPassed = isCurrentWeek ? Math.max(0, Math.min(dayOfWeek - 1, 4)) + 1 : 5;

 // Projection
 const projectedHours = myBet && workdaysPassed > 0
 ? Math.round((myProgress.total_hours / workdaysPassed) * 5)
 : 0;
 const projectedProof = myBet && workdaysPassed > 0
 ? Math.round((myProgress.hours_with_proof / workdaysPassed) * 5)
 : 0;

 // Result determination
 const betResult:"success"|"failure"|"pending"= myBet
 ? weekFinished
 ? myProgress.total_hours >= myBet.hours_committed &&
 myProgress.hours_with_proof >= myBet.hours_with_proof
 ?"success":"failure":"pending":"pending";

 // On track?
 function isOnTrack(committed: number, current: number): boolean {
 if (workdaysPassed <= 0) return true;
 const expected = (committed / 5) * workdaysPassed;
 return current >= expected * 0.85; // 15% grace
 }

 // ─── Loading ───────────────────────────────

 if (loading || orgLoading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="flex flex-col items-center gap-3">
 <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-700 animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
 </div>
 </div>
 );
 }

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* ─── Header ─────────────────────────── */}
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Lock className="w-5 h-5 text-primary"/>
 Apuesta Irrevocable
 </h1>
 <p className="text-xs font-mono text-muted-foreground mt-1">
 Comprometete el lunes. Si no cumples el viernes, consecuencia automatica.
 </p>
 </div>

 {/* ─── Week Navigation ─────────────────── */}
 <div className="flex items-center justify-between mb-8">
 <Button variant="ghost"size="sm"onClick={goToPrevWeek}>
 <ChevronLeft className="w-4 h-4"/>
 </Button>
 <div className="text-center">
 <p className="text-sm font-mono font-semibold capitalize">{formatWeekRange(currentWeek)}</p>
 {isCurrentWeek && (
 <p className="text-[10px] font-mono text-muted-foreground">
 {remaining > 0
 ?`${remaining} dia${remaining !== 1 ?"s":""} laborable${remaining !== 1 ?"s":""} restante${remaining !== 1 ?"s":""}`:"Semana terminada"}
 </p>
 )}
 </div>
 <div className="flex items-center gap-1">
 <Button variant="ghost"size="sm"onClick={goToNextWeek} disabled={isCurrentWeek}>
 <ChevronRight className="w-4 h-4"/>
 </Button>
 {!isCurrentWeek && (
 <Button variant="outline"size="sm"onClick={() => setCurrentWeek(getWeekStartMon())} className="text-xs font-mono">
 Hoy
 </Button>
 )}
 </div>
 </div>

 {/* ─── Stats Row ─────────────────────── */}
 {myBet && (
 <div className="grid grid-cols-3 gap-3 mb-8">
 <div className="bg-accent/40 p-4 text-center">
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
 {myProgress.total_hours}/{myBet.hours_committed}
 </p>
 <p className="text-[10px] font-mono text-muted-foreground flex items-center justify-center gap-1">
 <Clock className="w-3 h-3"/> Horas
 </p>
 </div>
 <div className="bg-accent/40 p-4 text-center">
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
 {myProgress.hours_with_proof}/{myBet.hours_with_proof}
 </p>
 <p className="text-[10px] font-mono text-muted-foreground flex items-center justify-center gap-1">
 <ShieldAlert className="w-3 h-3"/> Con evidencia
 </p>
 </div>
 <div className="bg-accent/40 p-4 text-center">
 <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">{remaining}</p>
 <p className="text-[10px] font-mono text-muted-foreground flex items-center justify-center gap-1">
 <Target className="w-3 h-3"/> Dias restantes
 </p>
 </div>
 </div>
 )}

 {/* ─── My Bet Section ────────────────── */}
 <section className="mb-8">
 <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4">
 Mi apuesta
 </h2>

 {/* No bet + can place */}
 {!myBet && canBet && isCurrentWeek && (
 <BetCreationForm
 hoursCommitted={hoursCommitted}
 setHoursCommitted={setHoursCommitted}
 proofCommitted={proofCommitted}
 setProofCommitted={setProofCommitted}
 submitting={submitting}
 onSign={signBet}
 />
 )}

 {/* No bet + can't place (wrong day or past week) */}
 {!myBet && !canBet && (
 <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="p-6 text-center">
 <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-3">
 <Lock className="w-8 h-8 text-muted-foreground"/>
 </div>
 {isCurrentWeek ? (
 <>
 <p className="text-sm font-mono font-medium">Ventana de apuesta cerrada</p>
 <p className="text-xs font-mono text-muted-foreground mt-1">
 Solo puedes firmar tu apuesta los lunes y martes.
 </p>
 </>
 ) : (
 <>
 <p className="text-sm font-mono font-medium">Sin apuesta esta semana</p>
 <p className="text-xs font-mono text-muted-foreground mt-1">
 No firmaste apuesta irrevocable.
 </p>
 </>
 )}
 </CardContent>
 </Card>
 )}

 {/* Bet placed + week in progress */}
 {myBet && !weekFinished && (
 <ActiveBetCard
 bet={myBet}
 progress={myProgress}
 remaining={remaining}
 projectedHours={projectedHours}
 projectedProof={projectedProof}
 isOnTrackHours={isOnTrack(myBet.hours_committed, myProgress.total_hours)}
 isOnTrackProof={isOnTrack(myBet.hours_with_proof, myProgress.hours_with_proof)}
 />
 )}

 {/* Bet placed + week finished */}
 {myBet && weekFinished && (
 <ResultCard
 bet={myBet}
 progress={myProgress}
 result={betResult as"success"|"failure"}
 />
 )}
 </section>

 {/* ─── Team Bets ────────────────────── */}
 <section className="mb-8">
 <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4">
 Apuestas del equipo
 </h2>

 {teamBets.length === 0 && teamWithout.length === 0 && (
 <div className="text-center py-12">
 <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-3">
 <Users className="w-8 h-8 text-muted-foreground"/>
 </div>
 <p className="text-sm font-mono text-muted-foreground">Ningun miembro ha apostado esta semana.</p>
 </div>
 )}

 <div className="space-y-3">
 {teamBets.map((tb) => (
 <TeamBetCard
 key={tb.id}
 profile={tb.profiles as Profile | undefined}
 bet={tb.bet}
 progress={tb.progress}
 weekFinished={weekFinished}
 workdaysPassed={workdaysPassed}
 />
 ))}

 {/* People without bets */}
 {teamWithout.map((profile) => (
 <Card
 key={profile.id}
 className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="p-4 flex items-center gap-3">
 <Avatar className="w-8 h-8 ring-1 ring-border">
 <AvatarImage src={profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs font-mono">
 {getInitials(profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="font-mono text-sm font-medium truncate">{profile.full_name ??"Miembro"}</p>
 </div>
 <Badge
 variant="outline"className="text-[10px] font-mono text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700">
 SIN COMPROMISO
 </Badge>
 </CardContent>
 </Card>
 ))}
 </div>
 </section>

 {/* ─── History ──────────────────────── */}
 {history.length > 0 && (
 <section>
 <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4">
 Historial
 </h2>
 <div className="space-y-3">
 {history.map((h) => (
 <HistoryRow key={h.week} week={h.week} bet={h.bet} progress={h.progress} />
 ))}
 </div>
 </section>
 )}
 </div>
 );
}

// ─────────────────────────────────────────────
// Bet Creation Form
// ─────────────────────────────────────────────

function BetCreationForm({
 hoursCommitted,
 setHoursCommitted,
 proofCommitted,
 setProofCommitted,
 submitting,
 onSign,
}: {
 hoursCommitted: number;
 setHoursCommitted: (v: number) => void;
 proofCommitted: number;
 setProofCommitted: (v: number) => void;
 submitting: boolean;
 onSign: () => void;
}) {
 return (
 <Card className="border-2 border-dashed border-red-400/40 dark:border-red-600/30">
 <CardContent className="p-6">
 <div className="text-center mb-6">
 <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-3">
 <Lock className="w-8 h-8 text-red-500"/>
 </div>
 <h3 className="font-mono font-bold text-lg uppercase tracking-tight">Firma tu apuesta</h3>
 <p className="text-xs font-mono text-muted-foreground mt-1">
 Una vez firmada, NO se puede cancelar.
 </p>
 </div>

 <div className="space-y-5">
 {/* Hours input */}
 <div>
 <label className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground block mb-2">
 ¿Cuantas horas te comprometes esta semana?
 </label>
 <div className="flex items-center gap-3">
 <Input
 type="number"min={20}
 max={50}
 value={hoursCommitted}
 onChange={(e) => setHoursCommitted(Math.max(20, Math.min(50, parseInt(e.target.value) || 20)))}
 className="w-24 font-mono text-center text-lg tabular-nums"/>
 <span className="text-xs font-mono text-muted-foreground">horas (min 20, max 50)</span>
 </div>
 </div>

 {/* Proof input */}
 <div>
 <label className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground block mb-2">
 ¿Cuantas con evidencia?
 </label>
 <div className="flex items-center gap-3">
 <Input
 type="number"min={0}
 max={hoursCommitted}
 value={proofCommitted}
 onChange={(e) =>
 setProofCommitted(Math.max(0, Math.min(hoursCommitted, parseInt(e.target.value) || 0)))
 }
 className="w-24 font-mono text-center text-lg tabular-nums"/>
 <span className="text-xs font-mono text-muted-foreground">horas con prueba</span>
 </div>
 </div>

 {/* Consequence preview */}
 <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-sm p-4">
 <div className="flex items-start gap-2">
 <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5"/>
 <div>
 <p className="text-xs font-mono font-bold text-red-700 dark:text-red-400 uppercase">
 Consecuencia si no cumples:
 </p>
 <p className="text-xs font-mono text-red-600/80 dark:text-red-400/70 mt-1 leading-relaxed">
 Tu peor entrada de la semana sera destacada publicamente y perderas 50 puntos de Trust Capital.
 </p>
 </div>
 </div>
 </div>

 {/* Sign button */}
 <Button
 onClick={onSign}
 disabled={submitting || hoursCommitted < 20}
 className="w-full bg-red-600 hover:bg-red-700 text-white font-mono text-xs uppercase tracking-wider gap-2">
 {submitting ? (
 <Loader2 className="w-4 h-4 animate-spin"/>
 ) : (
 <Lock className="w-4 h-4"/>
 )}
 Firmar apuesta irrevocable
 </Button>

 <p className="text-[9px] font-mono text-center text-muted-foreground uppercase tracking-wider">
 Una vez firmada, no se puede cancelar ni modificar
 </p>
 </div>
 </CardContent>
 </Card>
 );
}

// ─────────────────────────────────────────────
// Active Bet Card (in progress)
// ─────────────────────────────────────────────

function ActiveBetCard({
 bet,
 progress,
 remaining,
 projectedHours,
 projectedProof,
 isOnTrackHours,
 isOnTrackProof,
}: {
 bet: IrrevocableBet;
 progress: WeekProgress;
 remaining: number;
 projectedHours: number;
 projectedProof: number;
 isOnTrackHours: boolean;
 isOnTrackProof: boolean;
}) {
 const hoursPercent = Math.min(100, Math.round((progress.total_hours / bet.hours_committed) * 100));
 const proofPercent = Math.min(100, Math.round((progress.hours_with_proof / bet.hours_with_proof) * 100));
 const allOnTrack = isOnTrackHours && isOnTrackProof;

 return (
 <Card className={cn(
"border transition-colors duration-200",
 allOnTrack ?"border-green-300 dark:border-green-800":"border-red-300 dark:border-red-800")}>
 <CardContent className="p-5">
 {/* Header */}
 <div className="flex items-center justify-between mb-4">
 <Badge
 variant="outline"className="text-[10px] font-mono gap-1 text-red-600 border-red-300 dark:text-red-400 dark:border-red-700 uppercase tracking-wider">
 <Lock className="w-3 h-3"/> Irrevocable
 </Badge>
 <span className="text-[10px] font-mono text-muted-foreground">
 Firmada {format(new Date(bet.signed_at),"d MMM HH:mm", { locale: es })}
 </span>
 </div>

 {/* Hours progress */}
 <div className="mb-4">
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-xs font-mono text-muted-foreground">Horas registradas</span>
 <div className="flex items-center gap-2">
 <span className="font-mono text-sm font-bold tabular-nums">
 {progress.total_hours} / {bet.hours_committed}
 </span>
 {isOnTrackHours ? (
 <CheckCircle2 className="w-3.5 h-3.5 text-green-500"/>
 ) : (
 <AlertTriangle className="w-3.5 h-3.5 text-red-500"/>
 )}
 </div>
 </div>
 <div className="h-2.5 bg-accent/60 rounded-full overflow-hidden">
 <div
 className={cn(
"h-full rounded-full transition-all duration-500",
 isOnTrackHours
 ?"bg-green-500":"bg-red-500")}
 style={{ width:`${hoursPercent}%`}}
 />
 </div>
 </div>

 {/* Proof progress */}
 <div className="mb-4">
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-xs font-mono text-muted-foreground">Con evidencia</span>
 <div className="flex items-center gap-2">
 <span className="font-mono text-sm font-bold tabular-nums">
 {progress.hours_with_proof} / {bet.hours_with_proof}
 </span>
 {isOnTrackProof ? (
 <CheckCircle2 className="w-3.5 h-3.5 text-green-500"/>
 ) : (
 <AlertTriangle className="w-3.5 h-3.5 text-red-500"/>
 )}
 </div>
 </div>
 <div className="h-2.5 bg-accent/60 rounded-full overflow-hidden">
 <div
 className={cn(
"h-full rounded-full transition-all duration-500",
 isOnTrackProof
 ?"bg-green-500":"bg-red-500")}
 style={{ width:`${proofPercent}%`}}
 />
 </div>
 </div>

 {/* Projection */}
 <div className="bg-accent/30 border border-border rounded-sm p-3">
 <div className="flex items-start gap-2">
 <TrendingUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5"/>
 <div className="text-xs font-mono text-muted-foreground leading-relaxed">
 <p>
 A este ritmo, llegaras a{""}
 <span className={cn(
"font-bold tabular-nums",
 projectedHours >= bet.hours_committed ?"text-green-600 dark:text-green-400":"text-red-600 dark:text-red-400")}>
 {projectedHours} hrs
 </span>
 {""}(necesitas {bet.hours_committed}).
 </p>
 <p className="mt-0.5">
 Evidencia proyectada:{""}
 <span className={cn(
"font-bold tabular-nums",
 projectedProof >= bet.hours_with_proof ?"text-green-600 dark:text-green-400":"text-red-600 dark:text-red-400")}>
 {projectedProof} hrs
 </span>
 {""}(necesitas {bet.hours_with_proof}).
 </p>
 </div>
 </div>
 </div>

 {/* Remaining days */}
 <div className="mt-3 text-center">
 <p className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
 {remaining} dia{remaining !== 1 ?"s":""} laborable{remaining !== 1 ?"s":""} restante{remaining !== 1 ?"s":""}
 </p>
 </div>
 </CardContent>
 </Card>
 );
}

// ─────────────────────────────────────────────
// Result Card (week finished)
// ─────────────────────────────────────────────

function ResultCard({
 bet,
 progress,
 result,
}: {
 bet: IrrevocableBet;
 progress: WeekProgress;
 result:"success"|"failure";
}) {
 const isSuccess = result ==="success";

 return (
 <Card className={cn(
"border-2 transition-colors duration-200",
 isSuccess ?"border-green-400 dark:border-green-700":"border-red-400 dark:border-red-700")}>
 <CardContent className="p-6">
 <div className="text-center mb-5">
 <div className={cn(
"w-16 h-16 border-2 flex items-center justify-center mx-auto mb-3",
 isSuccess ?"border-green-400 dark:border-green-600":"border-red-400 dark:border-red-600")}>
 {isSuccess ? (
 <CheckCircle2 className="w-8 h-8 text-green-500"/>
 ) : (
 <XCircle className="w-8 h-8 text-red-500"/>
 )}
 </div>

 <Badge
 variant="outline"className={cn(
"text-xs font-mono uppercase tracking-wider",
 isSuccess
 ?"text-green-700 border-green-300 dark:text-green-400 dark:border-green-700":"text-red-700 border-red-300 dark:text-red-400 dark:border-red-700")}
 >
 {isSuccess ?"CUMPLIDO":"INCUMPLIDO"}
 </Badge>

 <p className="text-sm font-mono text-muted-foreground mt-2">
 {isSuccess
 ?"Mantuviste tu palabra. Apuesta cumplida.":"No cumpliste tu compromiso irrevocable."}
 </p>
 </div>

 {/* Final numbers */}
 <div className="grid grid-cols-2 gap-3">
 <div className={cn(
"p-3 rounded-sm border text-center",
 progress.total_hours >= bet.hours_committed
 ?"border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20":"border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20")}>
 <p className="font-mono text-lg font-bold tabular-nums">
 {progress.total_hours} / {bet.hours_committed}
 </p>
 <p className="text-[10px] font-mono text-muted-foreground">Horas</p>
 </div>
 <div className={cn(
"p-3 rounded-sm border text-center",
 progress.hours_with_proof >= bet.hours_with_proof
 ?"border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20":"border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20")}>
 <p className="font-mono text-lg font-bold tabular-nums">
 {progress.hours_with_proof} / {bet.hours_with_proof}
 </p>
 <p className="text-[10px] font-mono text-muted-foreground">Con evidencia</p>
 </div>
 </div>

 {/* Consequence for failure */}
 {!isSuccess && (
 <div className="mt-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-sm p-3">
 <div className="flex items-start gap-2">
 <FileWarning className="w-4 h-4 text-red-500 shrink-0 mt-0.5"/>
 <p className="text-xs font-mono text-red-600 dark:text-red-400 leading-relaxed">
 Consecuencia activada: Tu peor entrada de la semana sera destacada publicamente.
 -50 puntos de Trust Capital.
 </p>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
}

// ─────────────────────────────────────────────
// Team Bet Card
// ─────────────────────────────────────────────

function TeamBetCard({
 profile,
 bet,
 progress,
 weekFinished,
 workdaysPassed,
}: {
 profile: Profile | undefined;
 bet: IrrevocableBet;
 progress: WeekProgress;
 weekFinished: boolean;
 workdaysPassed: number;
}) {
 const hoursPercent = Math.min(100, Math.round((progress.total_hours / bet.hours_committed) * 100));

 function checkOnTrack(committed: number, current: number): boolean {
 if (workdaysPassed <= 0) return true;
 const expected = (committed / 5) * workdaysPassed;
 return current >= expected * 0.85;
 }

 const onTrack = checkOnTrack(bet.hours_committed, progress.total_hours);
 const result = weekFinished
 ? progress.total_hours >= bet.hours_committed && progress.hours_with_proof >= bet.hours_with_proof
 ?"success":"failure": null;

 return (
 <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="p-4">
 <div className="flex items-center gap-3 mb-3">
 <Avatar className="w-8 h-8 ring-1 ring-border">
 <AvatarImage src={profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs font-mono">
 {getInitials(profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="font-mono text-sm font-medium truncate">{profile?.full_name ??"Miembro"}</p>
 <p className="text-[10px] font-mono text-muted-foreground tabular-nums">
 {progress.total_hours}/{bet.hours_committed} hrs · {progress.hours_with_proof}/{bet.hours_with_proof} con prueba
 </p>
 </div>
 {result ==="success"&& (
 <Badge variant="outline"className="text-[10px] font-mono text-green-600 border-green-300 dark:text-green-400 dark:border-green-700 uppercase">
 Cumplido
 </Badge>
 )}
 {result ==="failure"&& (
 <Badge variant="outline"className="text-[10px] font-mono text-red-600 border-red-300 dark:text-red-400 dark:border-red-700 uppercase">
 Incumplido
 </Badge>
 )}
 {!result && (
 <Badge
 variant="outline"className={cn(
"text-[10px] font-mono uppercase",
 onTrack
 ?"text-green-600 border-green-300 dark:text-green-400 dark:border-green-700":"text-red-600 border-red-300 dark:text-red-400 dark:border-red-700")}
 >
 {onTrack ?"En ritmo":"Atrasado"}
 </Badge>
 )}
 </div>

 {/* Compact progress bar */}
 <div className="h-1.5 bg-accent/60 rounded-full overflow-hidden">
 <div
 className={cn(
"h-full rounded-full transition-all duration-500",
 result ==="success"?"bg-green-500": result ==="failure"?"bg-red-500": onTrack
 ?"bg-green-500":"bg-red-500")}
 style={{ width:`${hoursPercent}%`}}
 />
 </div>
 </CardContent>
 </Card>
 );
}

// ─────────────────────────────────────────────
// History Row
// ─────────────────────────────────────────────

function HistoryRow({
 week,
 bet,
 progress,
}: {
 week: string;
 bet: IrrevocableBet;
 progress: WeekProgress;
}) {
 const isSuccess = bet.result ==="success";

 return (
 <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="p-4 flex items-center gap-4">
 <div className={cn(
"w-10 h-10 border flex items-center justify-center shrink-0",
 isSuccess ?"border-green-300 dark:border-green-700":"border-red-300 dark:border-red-700")}>
 {isSuccess ? (
 <CheckCircle2 className="w-5 h-5 text-green-500"/>
 ) : (
 <XCircle className="w-5 h-5 text-red-500"/>
 )}
 </div>

 <div className="flex-1 min-w-0">
 <p className="text-sm font-mono font-medium capitalize">{formatWeekRange(week)}</p>
 <p className="text-[10px] font-mono text-muted-foreground tabular-nums">
 {progress.total_hours}/{bet.hours_committed} hrs · {progress.hours_with_proof}/{bet.hours_with_proof} con prueba
 </p>
 </div>

 <Badge
 variant="outline"className={cn(
"text-[10px] font-mono uppercase tracking-wider",
 isSuccess
 ?"text-green-600 border-green-300 dark:text-green-400 dark:border-green-700":"text-red-600 border-red-300 dark:text-red-400 dark:border-red-700")}
 >
 {isSuccess ?"Cumplido":"Incumplido"}
 </Badge>
 </CardContent>
 </Card>
 );
}
