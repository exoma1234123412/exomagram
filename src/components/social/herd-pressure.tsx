"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
 CheckCircle2,
 X,
 Clock,
 AlertTriangle,
 Users,
} from "lucide-react";

// ====================================================================
// HERD PRESSURE
// ====================================================================
//
// Maximum social pressure through isolation.
//
// When EVERY other org member has logged today but you haven't,
// a full-screen overlay appears naming you as the last holdout.
// It cannot be dismissed for 10 seconds.
//
// When most (but not all) have logged and you haven't, a banner
// reminds you that you're falling behind.
//
// Checks once per minute. Only fires once per hour (localStorage).
// ====================================================================

const STORAGE_KEY ="herd_pressure_last_shown";
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const DISMISS_LOCK_SECONDS = 10;
const CHECK_INTERVAL_MS = 60_000; // 1 minute

interface LoggedMember {
 userId: string;
 fullName: string;
 avatarUrl: string | null;
 totalHours: number;
}

export function HerdPressure() {
 const { orgId, userId } = useOrg();
 const supabase = createClient();

 // Data
 const [loggedMembers, setLoggedMembers] = useState<LoggedMember[]>([]);
 const [totalMembers, setTotalMembers] = useState(0);
 const [currentUserName, setCurrentUserName] = useState("");
 const [currentUserHasLogged, setCurrentUserHasLogged] = useState(true);
 const [firstEntryTime, setFirstEntryTime] = useState<string | null>(null);

 // UI state
 const [showOverlay, setShowOverlay] = useState(false);
 const [showBanner, setShowBanner] = useState(false);
 const [dismissCountdown, setDismissCountdown] = useState(DISMISS_LOCK_SECONDS);
 const [canDismiss, setCanDismiss] = useState(false);
 const [logDialogOpen, setLogDialogOpen] = useState(false);

 // Elapsed timer (how long since first member logged but you haven't)
 const [elapsedTick, setElapsedTick] = useState(0);

 // Refs
 const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
 const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

 // ---- Cooldown check ----
 function isOnCooldown(): boolean {
 try {
 const last = localStorage.getItem(STORAGE_KEY);
 if (!last) return false;
 return Date.now() - parseInt(last, 10) < COOLDOWN_MS;
 } catch {
 return false;
 }
 }

 function markShown(): void {
 try {
 localStorage.setItem(STORAGE_KEY, Date.now().toString());
 } catch {
 // localStorage unavailable
 }
 }

 // ---- Fetch data ----
 const fetchData = useCallback(async () => {
 if (!orgId || !userId) return;

 const today = getTodayMTY();

 // Fetch all org members with profiles
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(full_name, avatar_url)")
 .eq("org_id", orgId);

 if (!members || members.length <= 1) return; // need at least 2 members

 // Fetch current user's profile
 const currentMember = members.find((m) => m.user_id === userId);
 const currentProfile = currentMember?.profiles as unknown as {
 full_name: string | null;
 avatar_url: string | null;
 } | null;
 setCurrentUserName(currentProfile?.full_name ??"");

 // Fetch today's entries for the org
 const { data: entries } = await supabase
 .from("time_entries")
 .select("user_id, logged_at")
 .eq("org_id", orgId)
 .eq("date", today);

 // Build per-user entry counts
 const entryMap = new Map<string, number>();
 let earliestLog: string | null = null;
 for (const entry of entries ?? []) {
 entryMap.set(entry.user_id, (entryMap.get(entry.user_id) ?? 0) + 1);
 if (!earliestLog || entry.logged_at < earliestLog) {
 earliestLog = entry.logged_at;
 }
 }

 const userHasLogged = (entryMap.get(userId) ?? 0) > 0;
 setCurrentUserHasLogged(userHasLogged);
 setTotalMembers(members.length);

 // Build logged members list (excluding current user)
 const logged: LoggedMember[] = [];
 for (const m of members) {
 if (m.user_id === userId) continue;
 const hours = entryMap.get(m.user_id) ?? 0;
 if (hours > 0) {
 const profile = m.profiles as unknown as {
 full_name: string | null;
 avatar_url: string | null;
 } | null;
 logged.push({
 userId: m.user_id,
 fullName: profile?.full_name ??"Desconocido",
 avatarUrl: profile?.avatar_url ?? null,
 totalHours: hours,
 });
 }
 }

 // Sort by most hours first
 logged.sort((a, b) => b.totalHours - a.totalHours);
 setLoggedMembers(logged);
 setFirstEntryTime(earliestLog);

 const otherMemberCount = members.length - 1; // everyone except current user

 // Determine what to show
 if (userHasLogged) {
 // User has logged, no pressure needed
 setShowOverlay(false);
 setShowBanner(false);
 return;
 }

 if (isOnCooldown()) {
 // Already shown in the last hour, skip overlay but banner is fine
 setShowOverlay(false);
 // Still show the soft banner if applicable
 if (logged.length >= 2 && logged.length < otherMemberCount) {
 setShowBanner(true);
 } else {
 setShowBanner(false);
 }
 return;
 }

 // ALL other members have logged but user has NOT
 if (logged.length >= otherMemberCount && otherMemberCount > 0) {
 setShowOverlay(true);
 setShowBanner(false);
 markShown();
 return;
 }

 // Most (but not all) have logged
 if (logged.length >= 2) {
 setShowBanner(true);
 setShowOverlay(false);
 return;
 }

 setShowOverlay(false);
 setShowBanner(false);
 }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

 // ---- Initial load + polling ----
 useEffect(() => {
 if (!orgId || !userId) return;
 fetchData();
 const poll = setInterval(fetchData, CHECK_INTERVAL_MS);
 return () => clearInterval(poll);
 }, [orgId, userId, fetchData]);

 // ---- Real-time: refetch on new entries ----
 useEffect(() => {
 if (!orgId) return;

 const channel = supabase
 .channel("herd_pressure_rt")
 .on(
"postgres_changes",
 {
 event:"INSERT",
 schema:"public",
 table:"time_entries",
 filter:`org_id=eq.${orgId}`,
 },
 () => fetchData()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId, fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

 // ---- 10-second dismiss countdown ----
 useEffect(() => {
 if (!showOverlay) {
 setDismissCountdown(DISMISS_LOCK_SECONDS);
 setCanDismiss(false);
 if (countdownRef.current) clearInterval(countdownRef.current);
 return;
 }

 setDismissCountdown(DISMISS_LOCK_SECONDS);
 setCanDismiss(false);

 countdownRef.current = setInterval(() => {
 setDismissCountdown((prev) => {
 if (prev <= 1) {
 setCanDismiss(true);
 if (countdownRef.current) clearInterval(countdownRef.current);
 return 0;
 }
 return prev - 1;
 });
 }, 1000);

 return () => {
 if (countdownRef.current) clearInterval(countdownRef.current);
 };
 }, [showOverlay]);

 // ---- Elapsed time ticker ----
 useEffect(() => {
 if (!showOverlay && !showBanner) {
 if (elapsedRef.current) clearInterval(elapsedRef.current);
 return;
 }

 elapsedRef.current = setInterval(() => {
 setElapsedTick((t) => t + 1);
 }, 1000);

 return () => {
 if (elapsedRef.current) clearInterval(elapsedRef.current);
 };
 }, [showOverlay, showBanner]);

 // ---- Helpers ----
 function getElapsedSinceFirstEntry(): string {
 if (!firstEntryTime) return"0h 00m";
 const diff = Date.now() - new Date(firstEntryTime).getTime();
 const totalMinutes = Math.max(0, Math.floor(diff / 60000));
 const hours = Math.floor(totalMinutes / 60);
 const minutes = totalMinutes % 60;
 // Force re-render via elapsedTick dependency (used implicitly)
 void elapsedTick;
 return`${hours}h ${String(minutes).padStart(2,"0")}m`;
 }

 function handleDismiss() {
 if (!canDismiss) return;
 setShowOverlay(false);
 }

 function handleRegister() {
 setLogDialogOpen(true);
 }

 // ---- When log dialog closes, refetch ----
 function handleLogDialogChange(open: boolean) {
 setLogDialogOpen(open);
 if (!open) {
 // Refetch after closing dialog (user might have logged)
 setTimeout(fetchData, 1000);
 }
 }

 // Don't render anything if user has logged or nothing to show
 if (currentUserHasLogged || (!showOverlay && !showBanner)) {
 return <LogEntryDialog open={logDialogOpen} onOpenChange={handleLogDialogChange} />;
 }

 // ================================================================
 // SOFT BANNER (most but not all have logged)
 // ================================================================
 if (showBanner && !showOverlay) {
 return (
 <>
 <div
 className={cn(
"w-full px-4 py-2.5 border-b",
"bg-amber-500/10 border-amber-500/30",
"flex items-center justify-between gap-3",
"font-mono text-xs")}
 >
 <div className="flex items-center gap-2">
 <Users className="w-4 h-4 text-amber-500 shrink-0"/>
 <span className="text-amber-700 dark:text-amber-300 uppercase tracking-wide">
 <span className="font-bold tabular-nums">
 {loggedMembers.length} de {totalMembers}
 </span>
 {""}ya registraron hoy.{""}
 <span className="font-bold">Tu no.</span>
 </span>
 </div>
 <Button
 variant="outline"size="sm"onClick={handleRegister}
 className="font-mono text-xs uppercase tracking-wide h-7 px-3 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20">
 Registrar
 </Button>
 </div>
 <LogEntryDialog open={logDialogOpen} onOpenChange={handleLogDialogChange} />
 </>
 );
 }

 // ================================================================
 // FULL OVERLAY (everyone logged except you)
 // ================================================================
 return (
 <>
 <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
 {/* Card */}
 <div
 className={cn(
"relative w-full max-w-md mx-auto",
"bg-card border-2 border-red-500/40",
"overflow-hidden font-mono")}
 >
 {/* Top red accent */}
 <div className="h-1 w-full bg-gradient-to-r from-red-600 via-red-500 to-red-600 animate-pulse"/>

 {/* Dismiss button (locked for 10 seconds) */}
 <div className="absolute top-3 right-3 z-10">
 {canDismiss ? (
 <button
 onClick={handleDismiss}
 className={cn(
"w-7 h-7 flex items-center justify-center",
"border border-border text-muted-foreground",
"hover:bg-accent transition-colors")}
 >
 <X className="w-4 h-4"/>
 </button>
 ) : (
 <div
 className={cn(
"w-7 h-7 flex items-center justify-center",
"border border-red-500/30 text-red-500",
"font-mono text-xs font-bold tabular-nums")}
 >
 {dismissCountdown}
 </div>
 )}
 </div>

 {/* Content */}
 <div className="px-6 pt-8 pb-6 space-y-6">
 {/* Big headline */}
 <div className="text-center space-y-1">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Alerta de equipo
 </p>
 <h2 className="font-mono font-bold uppercase tracking-tight text-xl text-foreground">
 TODOS YA REGISTRARON
 </h2>
 </div>

 {/* Members who have logged */}
 <div className="space-y-2">
 {loggedMembers.map((member) => (
 <div
 key={member.userId}
 className={cn(
"flex items-center gap-3 px-3 py-2",
"bg-emerald-500/10 border border-emerald-500/20")}
 >
 <Avatar className="w-7 h-7 ring-1 ring-border">
 <AvatarImage src={member.avatarUrl ?? undefined} />
 <AvatarFallback className="text-[9px] font-mono font-bold">
 {getInitials(member.fullName)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-mono font-medium truncate text-emerald-700 dark:text-emerald-300">
 {member.fullName}
 </p>
 </div>
 <div className="flex items-center gap-1.5 shrink-0">
 <span className="font-mono text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
 {member.totalHours}h
 </span>
 <CheckCircle2 className="w-4 h-4 text-emerald-500"/>
 </div>
 </div>
 ))}
 </div>

 {/* YOU section */}
 <div className="text-center space-y-2 pt-2">
 <p className="font-mono font-bold uppercase tracking-tight text-lg text-red-600 dark:text-red-400">
 SOLO FALTAS TU,{""}
 <span className="underline decoration-red-500/50 decoration-2 underline-offset-2">
 {currentUserName ||"???"}
 </span>
 </p>

 {/* Elapsed timer */}
 <div className="flex items-center justify-center gap-2 text-muted-foreground">
 <Clock className="w-4 h-4"/>
 <span className="font-mono text-sm tabular-nums tracking-tight">
 Llevas{""}
 <span className="font-bold text-red-600 dark:text-red-400">
 {getElapsedSinceFirstEntry()}
 </span>
 {""}sin registrar
 </span>
 </div>
 </div>

 {/* CTA */}
 <Button
 onClick={handleRegister}
 className={cn(
"w-full font-mono text-xs uppercase tracking-wider",
"bg-primary text-primary-foreground",
"h-11")}
 >
 <AlertTriangle className="w-4 h-4 mr-2"/>
 Registrar ahora
 </Button>

 {/* Countdown note */}
 {!canDismiss && (
 <p className="text-center font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
 No puedes cerrar esto por{""}
 <span className="font-bold tabular-nums text-red-500">
 {dismissCountdown}s
 </span>
 </p>
 )}
 </div>
 </div>
 </div>

 <LogEntryDialog open={logDialogOpen} onOpenChange={handleLogDialogChange} />
 </>
 );
}
