"use client";

// ═══════════════════════════════════════════════════════════════════════
// PSYCHOLOGICAL TECHNIQUE: Public Rank + Loss Aversion + Status Anxiety
// ═══════════════════════════════════════════════════════════════════════
//
// Assigns visible performance titles that change based on 30-day behavior.
// Inspired by Amazon's stack ranking, military ranks, and credit score tiers.
//
// Why it works:
// - PUBLIC STATUS creates social pressure — your title is visible to everyone
// - LOSS AVERSION: dropping from "De Confianza"to"En Desarrollo"triggers
// the endowment effect — the title felt like *yours*, and now it's gone
// - WHOLE-ORG NOTIFICATIONS on demotion activate social pain circuits
// (dorsal anterior cingulate cortex, same region as physical pain)
// - TIER PROXIMITY: seeing you're 3 points from the next tier up creates
// a"goal gradient"effect — effort increases as the goal gets closer
// - COLORED BADGES act as instant social signals, like military rank insignia
//
// The asymmetry is intentional: gaining a title feels good for a day.
// Losing one stings for weeks. That's the motivational architecture.

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
 Card,
 CardHeader,
 CardTitle,
 CardDescription,
 CardContent,
} from "@/components/ui/card";
import {
 Tooltip,
 TooltipTrigger,
 TooltipContent,
 TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
 Star,
 Shield,
 CheckCircle2,
 Zap,
 Eye,
 AlertTriangle,
 TrendingUp,
 TrendingDown,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

type TitleTier ="S"|"A"|"B"|"C"|"D"|"F";

interface TierConfig {
 tier: TitleTier;
 label: string;
 emoji: string;
 description: string;
 icon: typeof Star;
 gradientFrom: string;
 gradientTo: string;
 textColor: string;
 bgColor: string;
 borderColor: string;
 badgeBg: string;
 ringColor: string;
}

interface TitleData {
 tier: TitleTier;
 trustAvg: number;
 proofRate: number;
 currentStreak: number;
 unresolvedFlags: number;
 daysInOrg: number;
 criteriaDetails: CriteriaCheck[];
}

interface CriteriaCheck {
 label: string;
 met: boolean;
 value: string;
 required: string;
}

interface StoredTitle {
 tier: TitleTier;
 timestamp: number;
 userId: string;
}

// ─── Tier Configuration ─────────────────────────────────────────

const TIER_CONFIG: Record<TitleTier, TierConfig> = {
 S: {
 tier:"S",
 label:"Elite",
 emoji:"\u2B50",
 description:"Rendimiento excepcional sostenido. Ejemplo para el equipo.",
 icon: Star,
 gradientFrom:"from-amber-400",
 gradientTo:"to-yellow-600",
 textColor:"text-amber-600 dark:text-amber-400",
 bgColor:"bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20",
 borderColor:"border-amber-300 dark:border-amber-700/50",
 badgeBg:"bg-gradient-to-r from-amber-400 to-yellow-500 text-white",
 ringColor:"ring-amber-400/30",
 },
 A: {
 tier:"A",
 label:"De Confianza",
 emoji:"\uD83D\uDEE1\uFE0F",
 description:"Confiable y consistente. El equipo puede contar contigo.",
 icon: Shield,
 gradientFrom:"from-emerald-400",
 gradientTo:"to-green-600",
 textColor:"text-emerald-600 dark:text-emerald-400",
 bgColor:"bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20",
 borderColor:"border-emerald-300 dark:border-emerald-700/50",
 badgeBg:"bg-gradient-to-r from-emerald-500 to-green-600 text-white",
 ringColor:"ring-emerald-400/30",
 },
 B: {
 tier:"B",
 label:"Consistente",
 emoji:"\u2713",
 description:"Cumple con lo básico. Hay espacio para mejorar.",
 icon: CheckCircle2,
 gradientFrom:"from-blue-400",
 gradientTo:"to-blue-600",
 textColor:"text-blue-600 dark:text-blue-400",
 bgColor:"bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/20 dark:to-sky-950/20",
 borderColor:"border-blue-300 dark:border-blue-700/50",
 badgeBg:"bg-gradient-to-r from-blue-500 to-blue-600 text-white",
 ringColor:"ring-blue-400/30",
 },
 C: {
 tier:"C",
 label:"En Desarrollo",
 emoji:"\u26A1",
 description:"Nuevo o con rendimiento irregular. Se espera mejora.",
 icon: Zap,
 gradientFrom:"from-yellow-400",
 gradientTo:"to-amber-500",
 textColor:"text-yellow-600 dark:text-yellow-400",
 bgColor:"bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20",
 borderColor:"border-yellow-300 dark:border-yellow-700/50",
 badgeBg:"bg-gradient-to-r from-yellow-500 to-amber-500 text-white",
 ringColor:"ring-yellow-400/30",
 },
 D: {
 tier:"D",
 label:"En Observación",
 emoji:"\uD83D\uDC41\uFE0F",
 description:"Múltiples señales de alerta. Bajo supervisión activa.",
 icon: Eye,
 gradientFrom:"from-orange-400",
 gradientTo:"to-orange-600",
 textColor:"text-orange-600 dark:text-orange-400",
 bgColor:"bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20",
 borderColor:"border-orange-300 dark:border-orange-700/50",
 badgeBg:"bg-gradient-to-r from-orange-500 to-orange-600 text-white",
 ringColor:"ring-orange-400/30",
 },
 F: {
 tier:"F",
 label:"Bajo Revisión",
 emoji:"\u26A0\uFE0F",
 description:"Situación crítica. Se requiere acción inmediata.",
 icon: AlertTriangle,
 gradientFrom:"from-red-400",
 gradientTo:"to-red-600",
 textColor:"text-red-600 dark:text-red-400",
 bgColor:"bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20",
 borderColor:"border-red-300 dark:border-red-700/50",
 badgeBg:"bg-gradient-to-r from-red-500 to-red-600 text-white",
 ringColor:"ring-red-400/30",
 },
};

const TIER_ORDER: TitleTier[] = ["S","A","B","C","D","F"];

// ─── Title Calculation ──────────────────────────────────────────

function calculateTier(
 trustAvg: number,
 proofRate: number,
 currentStreak: number,
 unresolvedFlags: number,
 daysInOrg: number
): { tier: TitleTier; criteria: CriteriaCheck[] } {
 const criteria: CriteriaCheck[] = [];

 // S-tier checks
 const sTrust = trustAvg > 90;
 const sStreak = currentStreak > 14;
 const sProof = proofRate > 90;
 const sFlags = unresolvedFlags === 0;
 criteria.push(
 { label:"Trust Score > 90", met: sTrust, value:`${trustAvg.toFixed(0)}`, required:"> 90"},
 { label:"Racha > 14 días", met: sStreak, value:`${currentStreak}`, required:"> 14"},
 { label:"Evidencia > 90%", met: sProof, value:`${proofRate.toFixed(0)}%`, required:"> 90%"},
 { label:"Sin flags pendientes", met: sFlags, value:`${unresolvedFlags}`, required:"0"}
 );
 if (sTrust && sStreak && sProof && sFlags) {
 return { tier:"S", criteria };
 }

 // A-tier checks
 const aTrust = trustAvg > 75;
 const aProof = proofRate > 75;
 const aStreak = currentStreak > 7;
 criteria.push(
 { label:"Trust Score > 75", met: aTrust, value:`${trustAvg.toFixed(0)}`, required:"> 75"},
 { label:"Evidencia > 75%", met: aProof, value:`${proofRate.toFixed(0)}%`, required:"> 75%"},
 { label:"Racha > 7 días", met: aStreak, value:`${currentStreak}`, required:"> 7"}
 );
 if (aTrust && aProof && aStreak) {
 return { tier:"A", criteria };
 }

 // B-tier checks
 const bTrust = trustAvg > 60;
 const bProof = proofRate > 50;
 criteria.push(
 { label:"Trust Score > 60", met: bTrust, value:`${trustAvg.toFixed(0)}`, required:"> 60"},
 { label:"Evidencia > 50%", met: bProof, value:`${proofRate.toFixed(0)}%`, required:"> 50%"}
 );
 if (bTrust && bProof) {
 return { tier:"B", criteria };
 }

 // C-tier checks
 const cTrust = trustAvg > 40;
 const cNew = daysInOrg < 30;
 criteria.push(
 { label:"Trust Score > 40", met: cTrust, value:`${trustAvg.toFixed(0)}`, required:"> 40"},
 { label:"Menos de 30 días en org", met: cNew, value:`${daysInOrg}`, required:"< 30"}
 );
 if (cTrust || cNew) {
 return { tier:"C", criteria };
 }

 // D-tier checks
 const dTrust = trustAvg > 25;
 const dFlags = unresolvedFlags >= 2;
 criteria.push(
 { label:"Trust Score > 25", met: dTrust, value:`${trustAvg.toFixed(0)}`, required:"> 25"},
 { label:"Múltiples flags", met: dFlags, value:`${unresolvedFlags}`, required:">= 2"}
 );
 if (dTrust && dFlags) {
 return { tier:"D", criteria };
 }

 // F-tier: Trust < 25 or > 5 unresolved flags
 criteria.push(
 { label:"Trust Score < 25", met: trustAvg < 25, value:`${trustAvg.toFixed(0)}`, required:"< 25"},
 { label:"Más de 5 flags sin resolver", met: unresolvedFlags > 5, value:`${unresolvedFlags}`, required:"> 5"}
 );
 return { tier:"F", criteria };
}

function getStorageKey(userId: string): string {
 return`exomagram_title_${userId}`;
}

function getStoredTitle(userId: string): StoredTitle | null {
 if (typeof window ==="undefined") return null;
 try {
 const raw = localStorage.getItem(getStorageKey(userId));
 if (!raw) return null;
 return JSON.parse(raw) as StoredTitle;
 } catch {
 return null;
 }
}

function storeTitle(userId: string, tier: TitleTier): void {
 if (typeof window ==="undefined") return;
 const stored: StoredTitle = { tier, timestamp: Date.now(), userId };
 localStorage.setItem(getStorageKey(userId), JSON.stringify(stored));
}

function tierRank(tier: TitleTier): number {
 return TIER_ORDER.indexOf(tier);
}

function getNextTierUp(tier: TitleTier): TitleTier | null {
 const idx = TIER_ORDER.indexOf(tier);
 return idx > 0 ? TIER_ORDER[idx - 1] : null;
}

function getNextTierDown(tier: TitleTier): TitleTier | null {
 const idx = TIER_ORDER.indexOf(tier);
 return idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
}

// Progress toward next tier up (0-100)
function progressToNextTier(trustAvg: number, tier: TitleTier): number {
 const thresholds: Record<TitleTier, number> = {
 S: 100,
 A: 90,
 B: 75,
 C: 60,
 D: 40,
 F: 25,
 };
 const nextUp = getNextTierUp(tier);
 if (!nextUp) return 100;
 const target = thresholds[nextUp];
 const currentFloor = thresholds[tier];
 const range = target - currentFloor;
 if (range <= 0) return 100;
 const progress = ((trustAvg - currentFloor) / range) * 100;
 return Math.max(0, Math.min(100, progress));
}

// Distance to demotion (0-100, 100 = safe)
function distanceToDemotion(trustAvg: number, tier: TitleTier): number {
 const thresholds: Record<TitleTier, number> = {
 S: 90,
 A: 75,
 B: 60,
 C: 40,
 D: 25,
 F: 0,
 };
 const floor = thresholds[tier];
 if (floor === 0) return 100;
 const buffer = trustAvg - floor;
 const range = 15; // normalized scale
 const safety = (buffer / range) * 100;
 return Math.max(0, Math.min(100, safety));
}

// ─── Data Fetching Hook ─────────────────────────────────────────

function useTitleData(userId: string) {
 const [data, setData] = useState<TitleData | null>(null);
 const [loading, setLoading] = useState(true);
 const [justChanged, setJustChanged] = useState(false);
 const [changeDirection, setChangeDirection] = useState<"up"|"down"| null>(null);
 const [previousTier, setPreviousTier] = useState<TitleTier | null>(null);
 const hasFetchedRef = useRef(false);

 const fetchData = useCallback(async () => {
 if (!userId) return;

 const supabase = createClient();
 const thirtyDaysAgo = new Date();
 thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
 const thirtyDaysStr = thirtyDaysAgo.toISOString().split("T")[0];

 // Get org membership
 const { data: membership } = await supabase
 .from("org_members")
 .select("org_id, joined_at")
 .eq("user_id", userId)
 .limit(1)
 .single();

 if (!membership) {
 setLoading(false);
 return;
 }

 const orgId = membership.org_id;
 const joinedAt = new Date(membership.joined_at);
 const daysInOrg = Math.floor(
 (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24)
 );

 // Parallel queries for 30-day data
 const [trustResult, streakResult, flagsResult, entriesResult] =
 await Promise.all([
 // Trust score history (last 30 days)
 supabase
 .from("trust_score_history")
 .select("score")
 .eq("user_id", userId)
 .eq("org_id", orgId)
 .gte("date", thirtyDaysStr)
 .order("date", { ascending: false }),

 // Activity streak
 supabase
 .from("activity_streaks")
 .select("current_streak")
 .eq("user_id", userId)
 .eq("org_id", orgId)
 .limit(1)
 .single(),

 // Unresolved accountability flags
 supabase
 .from("accountability_flags")
 .select("id")
 .eq("user_id", userId)
 .eq("org_id", orgId)
 .eq("resolved", false),

 // Time entries (last 30 days) for proof rate
 supabase
 .from("time_entries")
 .select("id, proof_urls")
 .eq("user_id", userId)
 .eq("org_id", orgId)
 .gte("date", thirtyDaysStr),
 ]);

 // Compute 30-day trust average
 const trustScores = trustResult.data ?? [];
 const trustAvg =
 trustScores.length > 0
 ? trustScores.reduce((sum, row) => sum + row.score, 0) /
 trustScores.length
 : 50;

 // Current streak
 const currentStreak = streakResult.data?.current_streak ?? 0;

 // Unresolved flags count
 const unresolvedFlags = flagsResult.data?.length ?? 0;

 // Proof rate
 const entries = entriesResult.data ?? [];
 const totalEntries = entries.length;
 const entriesWithProof = entries.filter(
 (e) => e.proof_urls && e.proof_urls.length > 0
 ).length;
 const proofRate =
 totalEntries > 0
 ? Math.round((entriesWithProof / totalEntries) * 100)
 : 0;

 // Calculate tier
 const { tier, criteria } = calculateTier(
 trustAvg,
 proofRate,
 currentStreak,
 unresolvedFlags,
 daysInOrg
 );

 // Check for title change
 const stored = getStoredTitle(userId);
 if (stored && stored.tier !== tier) {
 const oldRank = tierRank(stored.tier);
 const newRank = tierRank(tier);
 const direction = newRank > oldRank ?"down":"up";

 setPreviousTier(stored.tier);
 setChangeDirection(direction);
 setJustChanged(true);

 // Clear the animation after 3 seconds
 setTimeout(() => setJustChanged(false), 3000);

 // If demoted, create a demotion notification via Supabase
 if (direction ==="down") {
 const oldConfig = TIER_CONFIG[stored.tier];
 const newConfig = TIER_CONFIG[tier];
 // Fire and forget — notification insert
 supabase.from("notifications").insert({
 user_id: userId,
 org_id: orgId,
 type:"title_demotion",
 title:"Cambio de título",
 message:`Bajó de"${oldConfig.label}"a"${newConfig.label}"`,
 metadata: {
 old_tier: stored.tier,
 new_tier: tier,
 old_label: oldConfig.label,
 new_label: newConfig.label,
 },
 });
 }
 }

 // Store current title
 storeTitle(userId, tier);

 setData({
 tier,
 trustAvg,
 proofRate,
 currentStreak,
 unresolvedFlags,
 daysInOrg,
 criteriaDetails: criteria,
 });
 setLoading(false);
 }, [userId]);

 useEffect(() => {
 if (hasFetchedRef.current) return;
 hasFetchedRef.current = true;
 fetchData();
 }, [fetchData]);

 return { data, loading, justChanged, changeDirection, previousTier };
}

// ─── DynamicTitle Component (Inline Badge) ──────────────────────

interface DynamicTitleProps {
 userId: string;
 className?: string;
}

export function DynamicTitle({ userId, className }: DynamicTitleProps) {
 const { data, loading, justChanged } = useTitleData(userId);

 if (loading || !data) {
 return (
 <Badge
 variant="secondary"className={cn(
"animate-pulse bg-muted text-muted-foreground",
 className
 )}
 >
 ...
 </Badge>
 );
 }

 const config = TIER_CONFIG[data.tier];
 const TierIcon = config.icon;

 // Build criteria breakdown for tooltip
 const relevantCriteria = data.criteriaDetails.filter((c) => {
 // Show criteria relevant to the current tier and one above
 const currentIdx = TIER_ORDER.indexOf(data.tier);
 const tierAbove = currentIdx > 0 ? TIER_ORDER[currentIdx - 1] : null;
 // Show all criteria that are either met or belong to next tier
 return c.met || tierAbove;
 });

 // Deduplicate by label — keep only the first occurrence
 const seen = new Set<string>();
 const uniqueCriteria = relevantCriteria.filter((c) => {
 if (seen.has(c.label)) return false;
 seen.add(c.label);
 return true;
 });

 return (
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger>
 <Badge
 className={cn(
 config.badgeBg,
"cursor-default select-none font-semibold border-0",
"transition-all duration-300",
 justChanged &&"animate-pulse ring-2",
 justChanged && config.ringColor,
 className
 )}
 >
 <TierIcon className="w-3 h-3"/>
 {config.emoji} {config.label}
 </Badge>
 </TooltipTrigger>
 <TooltipContent
 side="bottom"className="max-w-xs p-3">
 <div className="space-y-2">
 <p className="text-xs font-semibold">
 Basado en los últimos 30 días
 </p>
 <div className="space-y-1">
 {uniqueCriteria.slice(0, 6).map((c, i) => (
 <div key={i} className="flex items-center gap-1.5 text-[11px]">
 {c.met ? (
 <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0"/>
 ) : (
 <AlertTriangle className="w-3 h-3 text-red-400 shrink-0"/>
 )}
 <span className={c.met ?"opacity-100":"opacity-70"}>
 {c.label}: {c.value} (req: {c.required})
 </span>
 </div>
 ))}
 </div>
 <p className="text-[10px] opacity-60 pt-1 border-t border-white/10">
 Trust Score promedio: {data.trustAvg.toFixed(0)} | Racha:{" "}
 {data.currentStreak}d | Flags: {data.unresolvedFlags}
 </p>
 </div>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 );
}

// ─── TitleCard Component (Dashboard/Profile) ────────────────────

interface TitleCardProps {
 userId: string;
 className?: string;
}

export function TitleCard({ userId, className }: TitleCardProps) {
 const { data, loading, justChanged, changeDirection, previousTier } =
 useTitleData(userId);

 if (loading || !data) {
 return (
 <Card
 className={cn(
"transition-all duration-300 hover:border-primary/30",
"animate-pulse",
 className
 )}
 >
 <CardHeader>
 <CardTitle className="h-6 w-32 bg-muted rounded"/>
 <CardDescription className="h-4 w-48 bg-muted rounded mt-1"/>
 </CardHeader>
 <CardContent>
 <div className="space-y-3">
 <div className="h-8 bg-muted rounded"/>
 <div className="h-4 bg-muted rounded w-3/4"/>
 </div>
 </CardContent>
 </Card>
 );
 }

 const config = TIER_CONFIG[data.tier];
 const TierIcon = config.icon;
 const nextUp = getNextTierUp(data.tier);
 const nextDown = getNextTierDown(data.tier);
 const nextUpConfig = nextUp ? TIER_CONFIG[nextUp] : null;
 const nextDownConfig = nextDown ? TIER_CONFIG[nextDown] : null;
 const promotionProgress = progressToNextTier(data.trustAvg, data.tier);
 const demotionSafety = distanceToDemotion(data.trustAvg, data.tier);

 // Deduplicate criteria by label
 const seen = new Set<string>();
 const uniqueCriteria = data.criteriaDetails.filter((c) => {
 if (seen.has(c.label)) return false;
 seen.add(c.label);
 return true;
 });

 return (
 <Card
 className={cn(
"transition-all duration-300 hover:border-primary/30",
"overflow-hidden",
 justChanged &&"ring-2",
 justChanged && config.ringColor,
 className
 )}
 >
 {/* Title header with gradient */}
 <div
 className={cn(
"px-4 py-5 border-b",
 config.bgColor,
 config.borderColor
 )}
 >
 <div className="flex items-center gap-3">
 <div
 className={cn(
"w-12 h-12 flex items-center justify-center shrink-0",
"bg-white/60 dark:bg-white/10 shadow-md border",
 config.borderColor,
 justChanged &&"animate-pulse")}
 >
 <TierIcon className={cn("w-6 h-6", config.textColor)} />
 </div>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2">
 <h3
 className={cn(
"text-lg font-black tracking-tight",
 config.textColor
 )}
 >
 {config.emoji} {config.label}
 </h3>
 <span className="text-xs font-bold text-muted-foreground/60 bg-accent/50 px-1.5 py-0.5 rounded">
 Tier {config.tier}
 </span>
 </div>
 <p className="text-xs text-muted-foreground mt-0.5">
 {config.description}
 </p>
 </div>
 </div>

 {/* Demotion/promotion notification */}
 {justChanged && previousTier && (
 <div
 className={cn(
"mt-3 p-3 border flex items-center gap-2",
 changeDirection ==="down"?"bg-red-50/80 dark:bg-red-950/20 border-red-200 dark:border-red-800/50":"bg-green-50/80 dark:bg-green-950/20 border-green-200 dark:border-green-800/50")}
 >
 {changeDirection ==="down"? (
 <TrendingDown className="w-4 h-4 text-red-500 shrink-0"/>
 ) : (
 <TrendingUp className="w-4 h-4 text-green-500 shrink-0"/>
 )}
 <p
 className={cn(
"text-xs font-semibold",
 changeDirection ==="down"?"text-red-700 dark:text-red-400":"text-green-700 dark:text-green-400")}
 >
 {changeDirection ==="down"?`Bajó de"${TIER_CONFIG[previousTier].label}"a"${config.label}"`:`Subió de"${TIER_CONFIG[previousTier].label}"a"${config.label}"`}
 </p>
 </div>
 )}
 </div>

 <CardContent className="pt-4 space-y-4">
 {/* Stats overview */}
 <div className="grid grid-cols-4 gap-2">
 <div className="bg-accent/40 p-2.5 text-center">
 <p className="text-xl font-black tabular-nums leading-none">
 {data.trustAvg.toFixed(0)}
 </p>
 <p className="text-[9px] text-muted-foreground font-medium mt-1">
 Trust Score
 </p>
 </div>
 <div className="bg-accent/40 p-2.5 text-center">
 <p className="text-xl font-black tabular-nums leading-none">
 {data.proofRate}%
 </p>
 <p className="text-[9px] text-muted-foreground font-medium mt-1">
 Evidencia
 </p>
 </div>
 <div className="bg-accent/40 p-2.5 text-center">
 <p className="text-xl font-black tabular-nums leading-none">
 {data.currentStreak}
 </p>
 <p className="text-[9px] text-muted-foreground font-medium mt-1">
 Racha
 </p>
 </div>
 <div className="bg-accent/40 p-2.5 text-center">
 <p
 className={cn(
"text-xl font-black tabular-nums leading-none",
 data.unresolvedFlags > 0
 ?"text-red-600 dark:text-red-400":"text-green-600 dark:text-green-400")}
 >
 {data.unresolvedFlags}
 </p>
 <p className="text-[9px] text-muted-foreground font-medium mt-1">
 Flags
 </p>
 </div>
 </div>

 {/* Progress to next tier UP */}
 {nextUpConfig && (
 <div className="space-y-1.5">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-1.5">
 <TrendingUp className="w-3.5 h-3.5 text-muted-foreground"/>
 <span className="text-xs font-medium text-muted-foreground">
 Progreso hacia"{nextUpConfig.label}"</span>
 </div>
 <span className="text-xs font-bold tabular-nums">
 {promotionProgress.toFixed(0)}%
 </span>
 </div>
 <div className="h-2.5 bg-accent/60 rounded-full overflow-hidden">
 <div
 className={cn(
"h-full rounded-full transition-all duration-700",
"bg-gradient-to-r",
 nextUpConfig.gradientFrom,
 nextUpConfig.gradientTo
 )}
 style={{ width:`${promotionProgress}%`}}
 />
 </div>
 </div>
 )}

 {/* Distance to demotion */}
 {nextDownConfig && (
 <div className="space-y-1.5">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-1.5">
 <TrendingDown className="w-3.5 h-3.5 text-muted-foreground"/>
 <span className="text-xs font-medium text-muted-foreground">
 Margen antes de bajar a"{nextDownConfig.label}"</span>
 </div>
 <span
 className={cn(
"text-xs font-bold tabular-nums",
 demotionSafety < 30
 ?"text-red-600 dark:text-red-400": demotionSafety < 60
 ?"text-yellow-600 dark:text-yellow-400":"text-green-600 dark:text-green-400")}
 >
 {demotionSafety.toFixed(0)}%
 </span>
 </div>
 <div className="h-2.5 bg-accent/60 rounded-full overflow-hidden">
 <div
 className={cn(
"h-full rounded-full transition-all duration-700",
 demotionSafety >= 60
 ?"bg-green-500": demotionSafety >= 30
 ?"bg-yellow-500":"bg-red-500")}
 style={{ width:`${demotionSafety}%`}}
 />
 </div>
 {demotionSafety < 30 && (
 <p className="text-[10px] text-red-500/80 flex items-center gap-1">
 <AlertTriangle className="w-3 h-3"/>
 Peligro de descenso. Mejora tu Trust Score para mantener tu
 título.
 </p>
 )}
 </div>
 )}

 {/* Criteria breakdown */}
 <div className="space-y-2">
 <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
 Criterios evaluados
 </h4>
 <div className="space-y-1.5">
 {uniqueCriteria.map((c, i) => (
 <div
 key={i}
 className={cn(
"flex items-center justify-between px-2.5 py-1.5 text-xs",
 c.met
 ?"bg-green-50/50 dark:bg-green-950/10":"bg-red-50/50 dark:bg-red-950/10")}
 >
 <div className="flex items-center gap-2">
 {c.met ? (
 <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0"/>
 ) : (
 <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0"/>
 )}
 <span
 className={cn(
"font-medium",
 c.met
 ?"text-green-700 dark:text-green-400":"text-red-700 dark:text-red-400")}
 >
 {c.label}
 </span>
 </div>
 <div className="flex items-center gap-2 text-muted-foreground">
 <span className="tabular-nums font-semibold">{c.value}</span>
 <span className="text-[10px] opacity-60">
 / {c.required}
 </span>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Tier ladder visualization */}
 <div className="space-y-2">
 <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
 Escalafón de títulos
 </h4>
 <div className="space-y-1">
 {TIER_ORDER.map((t) => {
 const tc = TIER_CONFIG[t];
 const isCurrentTier = t === data.tier;
 const TIcon = tc.icon;
 return (
 <div
 key={t}
 className={cn(
"flex items-center gap-2 px-2.5 py-1.5 text-xs transition-all duration-300",
 isCurrentTier
 ? cn(tc.bgColor,"border", tc.borderColor,"font-bold")
 :"opacity-40 hover:opacity-70")}
 >
 <TIcon
 className={cn(
"w-3.5 h-3.5 shrink-0",
 isCurrentTier ? tc.textColor :"text-muted-foreground")}
 />
 <span
 className={cn(
"font-medium",
 isCurrentTier ? tc.textColor :"text-muted-foreground")}
 >
 {tc.emoji} {tc.label}
 </span>
 <span className="ml-auto text-[10px] text-muted-foreground">
 Tier {t}
 </span>
 {isCurrentTier && (
 <span className="text-[10px] bg-foreground/10 px-1.5 py-0.5 rounded font-semibold">
 Tú
 </span>
 )}
 </div>
 );
 })}
 </div>
 </div>
 </CardContent>

 {/* Footer */}
 <div className="px-4 py-3 border-t bg-muted/30">
 <p className="text-[10px] text-muted-foreground text-center">
 Basado en los últimos 30 días de actividad. Actualizado automáticamente.
 </p>
 </div>
 </Card>
 );
}
