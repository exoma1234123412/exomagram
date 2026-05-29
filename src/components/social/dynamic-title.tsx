"use client";

// =====================================================================
// DYNAMIC TITLES — Daily Performance Suffix System
// =====================================================================
//
// Every org member gets a real-time title suffix based on TODAY's work.
// The title is always visible. There is no way to hide it.
//
// Psychological levers:
// - PUBLIC SHAME: everyone sees your title all day
// - LOSS AVERSION: losing [MAQUINA] hurts more than gaining it
// - SOCIAL COMPARISON: your title vs teammates is instant status check
// - PULSING RED: the worst titles use animate-pulse to draw attention
//
// Title hierarchy (best to worst):
// [MAQUINA] 8+ hours, 80%+ proof (green)
// [IMPARABLE] 7+ hours, standup done, closeout done (blue)
// [RAYO] Fastest avg response time this week (blue)
// [EN RITMO] 5-6 hours, on track (neutral)
// [TORTUGA] Slowest avg response time this week (amber)
// [ATRASADO] 3-4 hours when should have more (amber)
// [VAGO] 1-2 hours, clearly not working (orange)
// [ESLABON ROTO] Broke a team chain yesterday (red)
// [FANTASMA] 0 entries today during work hours (red, pulsing)
// [CARGA DEL EQUIPO] Last place 3+ consecutive days (dark red, pulsing)

import {
 createContext,
 useContext,
 useEffect,
 useState,
 useCallback,
 type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import { cn } from "@/lib/utils";

// --- Types -----------------------------------------------------------

interface TitleInfo {
 title: string;
 color: string;
 pulse: boolean;
}

interface DynamicTitleContextValue {
 titles: Record<string, TitleInfo>;
 loading: boolean;
}

const DEFAULT_TITLE: TitleInfo = {
 title:"",
 color:"text-muted-foreground",
 pulse: false,
};

// --- Title Definitions -----------------------------------------------

const TITLE_DEFS = {
 MAQUINA: {
 title:"[MAQUINA]",
 color:"text-green-600 dark:text-green-400",
 pulse: false,
 },
 IMPARABLE: {
 title:"[IMPARABLE]",
 color:"text-blue-600 dark:text-blue-400",
 pulse: false,
 },
 RAYO: {
 title:"[RAYO]",
 color:"text-blue-500 dark:text-blue-400",
 pulse: false,
 },
 EN_RITMO: {
 title:"[EN RITMO]",
 color:"text-muted-foreground",
 pulse: false,
 },
 TORTUGA: {
 title:"[TORTUGA]",
 color:"text-amber-600 dark:text-amber-400",
 pulse: false,
 },
 ATRASADO: {
 title:"[ATRASADO]",
 color:"text-amber-600 dark:text-amber-400",
 pulse: false,
 },
 VAGO: {
 title:"[VAGO]",
 color:"text-orange-600 dark:text-orange-400",
 pulse: false,
 },
 ESLABON_ROTO: {
 title:"[ESLABON ROTO]",
 color:"text-red-600 dark:text-red-400",
 pulse: false,
 },
 FANTASMA: {
 title:"[FANTASMA]",
 color:"text-red-600 dark:text-red-400",
 pulse: true,
 },
 CARGA_DEL_EQUIPO: {
 title:"[CARGA DEL EQUIPO]",
 color:"text-red-800 dark:text-red-500",
 pulse: true,
 },
} as const;

// --- Context ---------------------------------------------------------

const DynamicTitleContext = createContext<DynamicTitleContextValue>({
 titles: {},
 loading: true,
});

// --- Helpers ---------------------------------------------------------

function getMTYHour(): number {
 const now = new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 return now.getHours();
}

function isWorkHoursMTY(): boolean {
 const hour = getMTYHour();
 return hour >= 7 && hour < 19;
}

function getYesterdayMTY(): string {
 const now = new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 now.setDate(now.getDate() - 1);
 return new Intl.DateTimeFormat("en-CA", { timeZone:"America/Monterrey"}).format(now);
}

function getWeekStartMTY(): string {
 const now = new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 const day = now.getDay();
 const diff = day === 0 ? 6 : day - 1; // Monday = start
 now.setDate(now.getDate() - diff);
 return new Intl.DateTimeFormat("en-CA", { timeZone:"America/Monterrey"}).format(now);
}

// --- Provider --------------------------------------------------------

export function DynamicTitleProvider({ children }: { children: ReactNode }) {
 const { orgId } = useOrg();
 const [titles, setTitles] = useState<Record<string, TitleInfo>>({});
 const [loading, setLoading] = useState(true);

 const computeTitles = useCallback(async () => {
 if (!orgId) return;

 const supabase = createClient();
 const today = getTodayMTY();
 const yesterday = getYesterdayMTY();
 const weekStart = getWeekStartMTY();
 const duringWorkHours = isWorkHoursMTY();
 const currentHourMTY = getMTYHour();

 // --- Fetch all data in parallel ---
 const [
 membersRes,
 todayEntriesRes,
 todayClosoutsRes,
 todayStandupsRes,
 yesterdayEntriesRes,
 yesterdayStreaksRes,
 weekEntriesRes,
 rankingsRes,
 ] = await Promise.all([
 // All org members
 supabase
 .from("org_members")
 .select("user_id, profiles(full_name, work_start_hour, work_end_hour)")
 .eq("org_id", orgId),

 // Today's time entries (all members)
 supabase
 .from("time_entries")
 .select("user_id, proof_urls, logged_at")
 .eq("org_id", orgId)
 .eq("date", today),

 // Today's closeouts (all members)
 supabase
 .from("daily_closeouts")
 .select("user_id")
 .eq("org_id", orgId)
 .eq("date", today),

 // Today's standups (all members)
 supabase
 .from("standups")
 .select("user_id")
 .eq("org_id", orgId)
 .eq("date", today),

 // Yesterday's time entries (for chain-breaking detection)
 supabase
 .from("time_entries")
 .select("user_id")
 .eq("org_id", orgId)
 .eq("date", yesterday),

 // Activity streaks (for chain-breaking detection)
 supabase
 .from("activity_streaks")
 .select("user_id, current_streak, last_active_date")
 .eq("org_id", orgId),

 // Week's entries for response time calculation
 supabase
 .from("time_entries")
 .select("user_id, hour, logged_at, date")
 .eq("org_id", orgId)
 .gte("date", weekStart),

 // Power rankings for consecutive last-place detection
 supabase
 .from("trust_score_history")
 .select("user_id, hours_logged, date")
 .eq("org_id", orgId)
 .gte("date", (() => {
 const d = new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 d.setDate(d.getDate() - 4);
 return new Intl.DateTimeFormat("en-CA").format(d);
 })())
 .order("date", { ascending: false }),
 ]);

 const members = membersRes.data ?? [];
 const todayEntries = todayEntriesRes.data ?? [];
 const todayCloseouts = new Set((todayClosoutsRes.data ?? []).map((c) => c.user_id));
 const todayStandups = new Set((todayStandupsRes.data ?? []).map((s) => s.user_id));
 const yesterdayEntryUsers = new Set((yesterdayEntriesRes.data ?? []).map((e) => e.user_id));
 const streaksRaw = (yesterdayStreaksRes.data ?? []) as {
 user_id: string;
 current_streak: number;
 last_active_date: string | null;
 }[];
 const streaksMap = new Map(
 streaksRaw.map((s) => [s.user_id, s])
 );
 const weekEntries = weekEntriesRes.data ?? [];
 const recentScores = rankingsRes.data ?? [];

 // --- Pre-compute per-member metrics ---

 // Today's entries per user
 const todayByUser = new Map<
 string,
 { count: number; withProof: number; loggedAtTimes: number[] }
 >();
 for (const entry of todayEntries) {
 const existing = todayByUser.get(entry.user_id) ?? {
 count: 0,
 withProof: 0,
 loggedAtTimes: [],
 };
 existing.count++;
 if (entry.proof_urls && (entry.proof_urls as string[]).length > 0) {
 existing.withProof++;
 }
 if (entry.logged_at) {
 existing.loggedAtTimes.push(new Date(entry.logged_at).getTime());
 }
 todayByUser.set(entry.user_id, existing);
 }

 // Week's average response time per user (time between hour slot and logged_at)
 const weekResponseTimes = new Map<string, number[]>();
 for (const entry of weekEntries) {
 if (!entry.logged_at || !entry.date || entry.hour == null) continue;
 // Expected time = date at the entry hour
 const expected = new Date(`${entry.date}T${String(entry.hour).padStart(2,"0")}:00:00`);
 const actual = new Date(entry.logged_at);
 const diffMinutes = (actual.getTime() - expected.getTime()) / (1000 * 60);
 // Only count reasonable diffs (0 to 24h)
 if (diffMinutes >= 0 && diffMinutes <= 1440) {
 const existing = weekResponseTimes.get(entry.user_id) ?? [];
 existing.push(diffMinutes);
 weekResponseTimes.set(entry.user_id, existing);
 }
 }

 // Average response time per user
 const avgResponseTime = new Map<string, number>();
 for (const [userId, times] of weekResponseTimes) {
 if (times.length > 0) {
 avgResponseTime.set(
 userId,
 times.reduce((a, b) => a + b, 0) / times.length
 );
 }
 }

 // Find fastest and slowest response times
 let fastestUserId: string | null = null;
 let slowestUserId: string | null = null;
 let fastestTime = Infinity;
 let slowestTime = -1;
 for (const [userId, avg] of avgResponseTime) {
 if (avg < fastestTime) {
 fastestTime = avg;
 fastestUserId = userId;
 }
 if (avg > slowestTime) {
 slowestTime = avg;
 slowestUserId = userId;
 }
 }
 // Only assign if there are at least 2 people with response data
 if (avgResponseTime.size < 2) {
 fastestUserId = null;
 slowestUserId = null;
 }

 // Consecutive last-place detection (3+ days)
 // Group scores by date, find who was last each day
 const scoresByDate = new Map<string, { user_id: string; hours_logged: number }[]>();
 for (const row of recentScores) {
 const existing = scoresByDate.get(row.date) ?? [];
 existing.push({ user_id: row.user_id, hours_logged: row.hours_logged });
 scoresByDate.set(row.date, existing);
 }

 // Count consecutive last-place days per user (most recent first)
 const lastPlaceConsecutive = new Map<string, number>();
 const sortedDates = [...scoresByDate.keys()].sort().reverse();
 for (const userId of members.map((m) => m.user_id)) {
 let consecutiveDays = 0;
 for (const date of sortedDates) {
 const dayScores = scoresByDate.get(date) ?? [];
 if (dayScores.length < 2) break;
 // Sort ascending by hours
 dayScores.sort((a, b) => a.hours_logged - b.hours_logged);
 if (dayScores[0].user_id === userId) {
 consecutiveDays++;
 } else {
 break;
 }
 }
 if (consecutiveDays >= 3) {
 lastPlaceConsecutive.set(userId, consecutiveDays);
 }
 }

 // --- Calculate titles ---
 const newTitles: Record<string, TitleInfo> = {};

 for (const member of members) {
 const userId = member.user_id;
 const profile = member.profiles as {
 full_name: string | null;
 work_start_hour: number;
 work_end_hour: number;
 } | null;
 const workStart = profile?.work_start_hour ?? 7;
 const workEnd = profile?.work_end_hour ?? 19;

 const data = todayByUser.get(userId) ?? {
 count: 0,
 withProof: 0,
 loggedAtTimes: [],
 };
 const hours = data.count;
 const proofRate = hours > 0 ? data.withProof / hours : 0;
 const hasCloseout = todayCloseouts.has(userId);
 const hasStandup = todayStandups.has(userId);

 // Check if user should be working right now
 const shouldBeWorking = duringWorkHours && currentHourMTY >= workStart && currentHourMTY < workEnd;

 // Check chain-breaking: had a streak but didn't log yesterday
 const streak = streaksMap.get(userId);
 const brokeChain =
 streak &&
 streak.current_streak === 0 &&
 streak.last_active_date &&
 streak.last_active_date < yesterday &&
 yesterdayEntryUsers.size > 0 &&
 !yesterdayEntryUsers.has(userId);

 // Priority order for title assignment:

 // 1. CARGA DEL EQUIPO (worst, 3+ consecutive days last place)
 if (lastPlaceConsecutive.has(userId)) {
 newTitles[userId] = { ...TITLE_DEFS.CARGA_DEL_EQUIPO };
 continue;
 }

 // 2. FANTASMA (0 entries during work hours)
 if (hours === 0 && shouldBeWorking) {
 newTitles[userId] = { ...TITLE_DEFS.FANTASMA };
 continue;
 }

 // 3. ESLABON ROTO (broke a chain yesterday)
 if (brokeChain) {
 newTitles[userId] = { ...TITLE_DEFS.ESLABON_ROTO };
 continue;
 }

 // 4. MAQUINA (8+ hours, 80%+ proof)
 if (hours >= 8 && proofRate >= 0.8) {
 newTitles[userId] = { ...TITLE_DEFS.MAQUINA };
 continue;
 }

 // 5. IMPARABLE (7+ hours, standup + closeout done)
 if (hours >= 7 && hasStandup && hasCloseout) {
 newTitles[userId] = { ...TITLE_DEFS.IMPARABLE };
 continue;
 }

 // 6. RAYO (fastest response this week)
 if (fastestUserId === userId && hours >= 3) {
 newTitles[userId] = { ...TITLE_DEFS.RAYO };
 continue;
 }

 // 7. EN RITMO (5-6 hours, on track)
 if (hours >= 5 && hours <= 7) {
 newTitles[userId] = { ...TITLE_DEFS.EN_RITMO };
 continue;
 }

 // 8. TORTUGA (slowest response this week)
 if (slowestUserId === userId && hours >= 1) {
 newTitles[userId] = { ...TITLE_DEFS.TORTUGA };
 continue;
 }

 // 9. ATRASADO (3-4 hours when should have more)
 if (hours >= 3 && hours <= 4 && shouldBeWorking) {
 newTitles[userId] = { ...TITLE_DEFS.ATRASADO };
 continue;
 }

 // 10. VAGO (1-2 hours)
 if (hours >= 1 && hours <= 2 && shouldBeWorking) {
 newTitles[userId] = { ...TITLE_DEFS.VAGO };
 continue;
 }

 // 11. Outside work hours with 0 entries = no shame title yet
 if (hours === 0 && !shouldBeWorking) {
 newTitles[userId] = { ...TITLE_DEFS.EN_RITMO };
 continue;
 }

 // Fallback: EN RITMO
 newTitles[userId] = { ...TITLE_DEFS.EN_RITMO };
 }

 setTitles(newTitles);
 setLoading(false);
 }, [orgId]);

 // Initial load
 useEffect(() => {
 computeTitles();
 }, [computeTitles]);

 // Refresh every 5 minutes
 useEffect(() => {
 if (!orgId) return;
 const interval = setInterval(computeTitles, 5 * 60 * 1000);
 return () => clearInterval(interval);
 }, [orgId, computeTitles]);

 // Real-time subscription for instant updates on new entries
 useEffect(() => {
 if (!orgId) return;

 const supabase = createClient();
 const channel = supabase
 .channel(`dynamic_titles_${orgId}`)
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"time_entries",
 filter:`org_id=eq.${orgId}`,
 },
 () => computeTitles()
 )
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"daily_closeouts",
 filter:`org_id=eq.${orgId}`,
 },
 () => computeTitles()
 )
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"standups",
 filter:`org_id=eq.${orgId}`,
 },
 () => computeTitles()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, computeTitles]);

 return (
 <DynamicTitleContext.Provider value={{ titles, loading }}>
 {children}
 </DynamicTitleContext.Provider>
 );
}

// --- Hook ------------------------------------------------------------

export function useDynamicTitle(userId: string): TitleInfo {
 const { titles } = useContext(DynamicTitleContext);
 return titles[userId] ?? DEFAULT_TITLE;
}

// --- DynamicTitle Component ------------------------------------------

interface DynamicTitleProps {
 userId: string;
 className?: string;
}

export function DynamicTitleBadge({ userId, className }: DynamicTitleProps) {
 const { titles, loading } = useContext(DynamicTitleContext);
 const info = titles[userId];

 if (loading) {
 return (
 <span
 className={cn(
"font-mono text-[10px] uppercase tracking-wider text-muted-foreground animate-pulse",
 className
 )}
 >
 [...]
 </span>
 );
 }

 if (!info || !info.title) return null;

 return (
 <span
 className={cn(
"font-mono text-[10px] uppercase tracking-wider font-bold select-none",
 info.color,
 info.pulse &&"animate-pulse",
 className
 )}
 >
 {info.title}
 </span>
 );
}
