"use client";

import {
 useEffect,
 useState,
 useCallback,
 useRef,
 useMemo,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, EXPECTED_DAILY_HOURS, WORK_HOURS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatHourShort } from "@/lib/utils";
import {
 ShieldBan,
 AlertTriangle,
 Clock,
 Lock,
 Timer,
 CheckCircle2,
 Send,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum hours the user must have logged the previous workday */
const MIN_REQUIRED_HOURS = 6;

const KEYFRAMES_ID ="mandatory-proof-gate-keyframes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns yesterday's date as ISO string (YYYY-MM-DD).
 * If today is Monday, returns Friday. If today is Sunday, returns Friday.
 * Essentially: the most recent workday before today.
 */
function getPreviousWorkday(): { date: string; isWeekendSkip: boolean } {
 const now = new Date();
 const today = now.getDay(); // 0=Sun, 1=Mon, ...

 // Sunday: previous workday is Friday, but we skip the check entirely
 if (today === 0) {
 const fri = new Date(now);
 fri.setDate(fri.getDate() - 2);
 return { date: fri.toISOString().slice(0, 10), isWeekendSkip: true };
 }

 // Saturday: previous workday is Friday, but skip
 if (today === 6) {
 const fri = new Date(now);
 fri.setDate(fri.getDate() - 1);
 return { date: fri.toISOString().slice(0, 10), isWeekendSkip: true };
 }

 // Monday: yesterday is Sunday — check should look at Friday
 if (today === 1) {
 const fri = new Date(now);
 fri.setDate(fri.getDate() - 3);
 return { date: fri.toISOString().slice(0, 10), isWeekendSkip: false };
 }

 // Tue-Fri: yesterday is a normal workday
 const yesterday = new Date(now);
 yesterday.setDate(yesterday.getDate() - 1);
 return { date: yesterday.toISOString().slice(0, 10), isWeekendSkip: false };
}

function todayISO(): string {
 return new Date().toISOString().slice(0, 10);
}

function ensureKeyframes() {
 if (typeof document ==="undefined") return;
 if (document.getElementById(KEYFRAMES_ID)) return;

 const style = document.createElement("style");
 style.id = KEYFRAMES_ID;
 style.textContent =`@keyframes gate-pulse {
 0%, 100% { opacity: 1; }
 50% { opacity: 0.85; }
 }
 @keyframes gate-lock-spin {
 0% { transform: rotate(0deg); }
 10% { transform: rotate(15deg); }
 20% { transform: rotate(-15deg); }
 30% { transform: rotate(10deg); }
 40% { transform: rotate(-10deg); }
 50% { transform: rotate(0deg); }
 100% { transform: rotate(0deg); }
 }
 @keyframes gate-timer-tick {
 0%, 100% { color: rgb(239, 68, 68); }
 50% { color: rgb(185, 28, 28); }
 }
`;
 document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface YesterdayStats {
 hoursLogged: number;
 loggedHours: Set<number>;
 hasCloseout: boolean;
 previousDate: string;
}

interface QuickLogSlot {
 hour: number;
 category: WorkCategory |"";
 title: string;
 submitted: boolean;
 loading: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MandatoryProofGate({
 orgId,
 userId,
 userName,
}: {
 orgId?: string;
 userId?: string;
 userName?: string;
}) {
 const supabase = createClient();

 // Gate state
 const [checking, setChecking] = useState(true);
 const [blocked, setBlocked] = useState(false);
 const [stats, setStats] = useState<YesterdayStats | null>(null);
 const [dismissed, setDismissed] = useState(false);

 // Quick-log form state
 const [slots, setSlots] = useState<QuickLogSlot[]>([]);

 // Timer: how long user has been blocked
 const [blockedSince, setBlockedSince] = useState<number | null>(null);
 const [elapsedMinutes, setElapsedMinutes] = useState(0);
 const [elapsedSeconds, setElapsedSeconds] = useState(0);

 // Track whether we already notified admins for this session
 const adminNotified = useRef(false);

 // ---------------------------------------------------------------------------
 // Inject keyframes
 // ---------------------------------------------------------------------------

 useEffect(() => {
 ensureKeyframes();
 }, []);

 // ---------------------------------------------------------------------------
 // Check on mount: did the user log enough hours yesterday?
 // ---------------------------------------------------------------------------

 const checkYesterday = useCallback(async () => {
 setChecking(true);

 const { date: previousDate, isWeekendSkip } = getPreviousWorkday();

 // Exception: weekends — skip entirely
 if (isWeekendSkip) {
 setBlocked(false);
 setChecking(false);
 return;
 }

 // Resolve user if not passed
 let resolvedUserId: string | undefined = userId;
 let resolvedOrgId: string | undefined = orgId;

 if (!resolvedUserId) {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) {
 setChecking(false);
 return;
 }
 resolvedUserId = user.id;
 }

 if (!resolvedOrgId) {
 const { data: membership } = await supabase
 .from("org_members")
 .select("org_id, joined_at")
 .eq("user_id", resolvedUserId)
 .limit(1)
 .single();

 if (!membership) {
 setChecking(false);
 return;
 }
 resolvedOrgId = membership.org_id;

 // Exception: user has <3 days in the org
 const joinedAt = new Date(membership.joined_at);
 const now = new Date();
 const daysSinceJoin = Math.floor(
 (now.getTime() - joinedAt.getTime()) / (1000 * 60 * 60 * 24)
 );
 if (daysSinceJoin < 3) {
 setBlocked(false);
 setChecking(false);
 return;
 }
 }

 // Fetch yesterday's time entries
 const { data: entries } = await supabase
 .from("time_entries")
 .select("hour")
 .eq("user_id", resolvedUserId)
 .eq("org_id", resolvedOrgId)
 .eq("date", previousDate);

 const loggedHoursSet = new Set<number>(
 entries?.map((e: { hour: number }) => e.hour) ?? []
 );
 const hoursLogged = loggedHoursSet.size;

 // Fetch yesterday's closeout
 const { data: closeout } = await supabase
 .from("daily_closeouts")
 .select("id")
 .eq("user_id", resolvedUserId)
 .eq("org_id", resolvedOrgId)
 .eq("date", previousDate)
 .limit(1)
 .single();

 const hasCloseout = !!closeout;

 const yesterdayStats: YesterdayStats = {
 hoursLogged,
 loggedHours: loggedHoursSet,
 hasCloseout,
 previousDate,
 };

 setStats(yesterdayStats);

 // Decide if blocked
 const isBlocked = hoursLogged < MIN_REQUIRED_HOURS;

 if (isBlocked) {
 setBlocked(true);
 setBlockedSince(Date.now());

 // Build missing hour slots
 const missingHours = WORK_HOURS.filter((h) => !loggedHoursSet.has(h));
 const slotsNeeded = Math.min(
 missingHours.length,
 EXPECTED_DAILY_HOURS - hoursLogged
 );
 setSlots(
 missingHours.slice(0, slotsNeeded).map((hour) => ({
 hour,
 category:"",
 title:"",
 submitted: false,
 loading: false,
 }))
 );

 // Auto-notify admins
 if (!adminNotified.current && resolvedOrgId) {
 adminNotified.current = true;
 notifyAdmins(
 supabase,
 resolvedOrgId,
 resolvedUserId as string,
 userName ??"Un miembro",
 previousDate,
 hoursLogged
 );
 }
 } else {
 setBlocked(false);
 }

 setChecking(false);
 }, [userId, orgId, userName, supabase]);

 useEffect(() => {
 checkYesterday();
 }, [checkYesterday]);

 // ---------------------------------------------------------------------------
 // Block escape key & prevent scroll
 // ---------------------------------------------------------------------------

 useEffect(() => {
 if (!blocked || dismissed) return;

 function blockEscape(e: KeyboardEvent) {
 if (e.key ==="Escape") {
 e.preventDefault();
 e.stopPropagation();
 }
 }

 document.addEventListener("keydown", blockEscape, true);
 document.body.style.overflow ="hidden";

 return () => {
 document.removeEventListener("keydown", blockEscape, true);
 document.body.style.overflow ="";
 };
 }, [blocked, dismissed]);

 // ---------------------------------------------------------------------------
 // Timer tick
 // ---------------------------------------------------------------------------

 useEffect(() => {
 if (!blocked || dismissed || !blockedSince) return;

 const interval = setInterval(() => {
 const elapsed = Date.now() - blockedSince;
 setElapsedMinutes(Math.floor(elapsed / 60_000));
 setElapsedSeconds(Math.floor((elapsed % 60_000) / 1_000));
 }, 1_000);

 return () => clearInterval(interval);
 }, [blocked, dismissed, blockedSince]);

 // ---------------------------------------------------------------------------
 // Derived: how many hours are now covered (original + submitted slots)
 // ---------------------------------------------------------------------------

 const totalHoursNow = useMemo(() => {
 if (!stats) return 0;
 const submittedCount = slots.filter((s) => s.submitted).length;
 return stats.hoursLogged + submittedCount;
 }, [stats, slots]);

 const canDismiss = totalHoursNow >= MIN_REQUIRED_HOURS;

 // Auto-dismiss when threshold met
 useEffect(() => {
 if (canDismiss && blocked) {
 const timeout = setTimeout(() => setDismissed(true), 800);
 return () => clearTimeout(timeout);
 }
 }, [canDismiss, blocked]);

 // ---------------------------------------------------------------------------
 // Quick-log submit handler
 // ---------------------------------------------------------------------------

 const handleSlotSubmit = useCallback(
 async (index: number) => {
 const slot = slots[index];
 if (!slot || !slot.category || slot.title.length < 10) return;
 if (!stats) return;

 // Mark loading
 setSlots((prev) =>
 prev.map((s, i) => (i === index ? { ...s, loading: true } : s))
 );

 let resolvedUserId = userId;
 let resolvedOrgId = orgId;

 if (!resolvedUserId) {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;
 resolvedUserId = user.id;
 }

 if (!resolvedOrgId) {
 const { data: membership } = await supabase
 .from("org_members")
 .select("org_id")
 .eq("user_id", resolvedUserId)
 .limit(1)
 .single();
 if (!membership) return;
 resolvedOrgId = membership.org_id;
 }

 const { error } = await supabase.from("time_entries").upsert(
 {
 user_id: resolvedUserId,
 org_id: resolvedOrgId,
 date: stats.previousDate,
 hour: slot.hour,
 category: slot.category,
 title: slot.title,
 logged_at: new Date().toISOString(),
 is_late: true,
 minutes_late: Math.floor(
 (Date.now() -
 new Date(stats.previousDate +"T23:59:59").getTime()) /
 60_000
 ),
 verification_status:"unverified",
 },
 { onConflict:"user_id,org_id,date,hour"}
 );

 if (!error) {
 setSlots((prev) =>
 prev.map((s, i) =>
 i === index ? { ...s, submitted: true, loading: false } : s
 )
 );
 } else {
 setSlots((prev) =>
 prev.map((s, i) => (i === index ? { ...s, loading: false } : s))
 );
 }
 },
 [slots, stats, userId, orgId, supabase]
 );

 // ---------------------------------------------------------------------------
 // Update slot field
 // ---------------------------------------------------------------------------

 const updateSlot = useCallback(
 (index: number, field:"category"|"title", value: string) => {
 setSlots((prev) =>
 prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
 );
 },
 []
 );

 // ---------------------------------------------------------------------------
 // Render nothing if not blocked or dismissed
 // ---------------------------------------------------------------------------

 if (checking || !blocked || dismissed) {
 return null;
 }

 const missingCount = Math.max(0, MIN_REQUIRED_HOURS - (stats?.hoursLogged ?? 0));
 const pendingSlots = slots.filter((s) => !s.submitted);
 const submittedSlots = slots.filter((s) => s.submitted);

 return (
 <div
 className="fixed inset-0 z-50 flex items-center justify-center"role="alertdialog"aria-modal="true"aria-label="Acceso bloqueado por registro incompleto">
 {/* Dark overlay — no click handler, cannot dismiss */}
 <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"/>

 {/* Centered card */}
 <Card
 className={cn(
"relative z-10 mx-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto",
"border-red-500/30 bg-background p-0 shadow-2xl shadow-red-900/20")}
 >
 {/* Header strip */}
 <div
 className="flex items-center gap-3 border-b border-red-500/20 bg-red-950/60 px-6 py-4 rounded-t-2xl"style={{ animation:"gate-pulse 3s ease-in-out infinite"}}
 >
 <div
 className="flex h-10 w-10 items-center justify-center bg-red-500/20"style={{ animation:"gate-lock-spin 4s ease-in-out infinite"}}
 >
 <ShieldBan className="h-5 w-5 text-red-400"/>
 </div>
 <div className="flex-1">
 <h2 className="text-lg font-black tracking-tight text-red-400">
 ACCESO BLOQUEADO
 </h2>
 <p className="text-xs text-red-300/70">
 No completaste tu registro del día anterior
 </p>
 </div>
 <Lock className="h-5 w-5 text-red-500/50"/>
 </div>

 {/* Body */}
 <div className="space-y-5 px-6 py-5">
 {/* Yesterday's stats */}
 <div className="grid grid-cols-2 gap-3">
 <div className="bg-red-500/5 border border-red-500/10 p-4 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight text-red-500">
 {stats?.hoursLogged ?? 0}/{EXPECTED_DAILY_HOURS}
 </p>
 <p className="text-[11px] text-muted-foreground font-medium">
 Horas registradas
 </p>
 </div>
 <div className="bg-red-500/5 border border-red-500/10 p-4 text-center">
 <p className="text-2xl font-bold tabular-nums tracking-tight">
 {stats?.hasCloseout ? (
 <span className="text-green-500">Sí</span>
 ) : (
 <span className="text-red-500">No</span>
 )}
 </p>
 <p className="text-[11px] text-muted-foreground font-medium">
 Cierre del día
 </p>
 </div>
 </div>

 {/* Date reference */}
 <div className="bg-destructive/5 border border-destructive/20 p-3 text-center">
 <p className="text-sm text-red-600 dark:text-red-400 flex items-center justify-center gap-2">
 <AlertTriangle className="h-4 w-4 shrink-0"/>
 <span>
 Registraste{" "}
 <strong className="font-bold">
 {stats?.hoursLogged ?? 0}/{EXPECTED_DAILY_HOURS}
 </strong>{" "}
 horas el{" "}
 <strong className="font-bold">{stats?.previousDate}</strong>
 {"|"}Cierre:{" "}
 <strong className="font-bold">
 {stats?.hasCloseout ?"Sí":"No"}
 </strong>
 </span>
 </p>
 </div>

 {/* Shame notice */}
 <div className="bg-amber-500/5 border border-amber-500/20 px-4 py-3">
 <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
 <AlertTriangle className="h-3.5 w-3.5 shrink-0"/>
 Tu equipo ya fue notificado de este bloqueo
 </p>
 </div>

 {/* Blocked timer */}
 <div className="flex items-center justify-center gap-3 py-2">
 <Timer className="h-4 w-4 text-red-500"/>
 <p className="text-sm text-muted-foreground">
 Llevas{" "}
 <span
 className="font-mono font-bold text-red-500 tabular-nums"style={{
 animation:"gate-timer-tick 1s ease-in-out infinite",
 }}
 >
 {elapsedMinutes}:{elapsedSeconds.toString().padStart(2,"0")}
 </span>{" "}
 minutos bloqueado
 </p>
 </div>

 {/* Progress bar */}
 <div className="space-y-1.5">
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground font-medium">
 Progreso: {totalHoursNow}/{MIN_REQUIRED_HOURS} horas mínimas
 </span>
 <Badge
 variant={canDismiss ?"default":"destructive"}
 className="h-5 text-[10px] px-2">
 {canDismiss
 ?"Completado":`Faltan ${MIN_REQUIRED_HOURS - totalHoursNow}`}
 </Badge>
 </div>
 <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
 <div
 className={cn(
"h-full rounded-full transition-all duration-500",
 canDismiss ?"bg-green-500":"bg-red-500")}
 style={{
 width:`${Math.min(100, (totalHoursNow / MIN_REQUIRED_HOURS) * 100)}%`,
 }}
 />
 </div>
 </div>

 {/* Divider */}
 <div className="relative">
 <div className="absolute inset-0 flex items-center">
 <div className="w-full border-t border-border"/>
 </div>
 <div className="relative flex justify-center text-xs">
 <span className="bg-background px-3 text-muted-foreground font-semibold uppercase tracking-wider">
 Registra tus horas faltantes
 </span>
 </div>
 </div>

 {/* Already submitted slots */}
 {submittedSlots.length > 0 && (
 <div className="space-y-2">
 {submittedSlots.map((slot) => (
 <div
 key={`done-${slot.hour}`}
 className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 px-4 py-3">
 <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0"/>
 <span className="text-xs font-semibold text-green-700 dark:text-green-400 tabular-nums">
 {formatHourShort(slot.hour)}
 </span>
 <span className="text-xs text-muted-foreground">
 {slot.category
 ? CATEGORIES[slot.category as WorkCategory]?.emoji
 :""}{" "}
 {slot.title}
 </span>
 </div>
 ))}
 </div>
 )}

 {/* Pending slots - quick log forms */}
 {pendingSlots.length > 0 && (
 <div className="space-y-3">
 {slots.map((slot, index) => {
 if (slot.submitted) return null;

 const isValid =
 slot.category !==""&& slot.title.length >= 10;

 return (
 <div
 key={`slot-${slot.hour}`}
 className="border border-border bg-accent/20 p-4 space-y-3">
 {/* Hour label */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Clock className="h-3.5 w-3.5 text-muted-foreground"/>
 <span className="text-sm font-semibold tabular-nums">
 {formatHourShort(slot.hour)}
 </span>
 <Badge
 variant="secondary"className="h-4 text-[10px] px-1.5">
 {stats?.previousDate}
 </Badge>
 </div>
 </div>

 {/* Category quick-pick */}
 <div className="flex flex-wrap gap-1.5">
 {(Object.keys(CATEGORIES) as WorkCategory[]).map(
 (key) => {
 const cat = CATEGORIES[key];
 return (
 <button
 key={key}
 type="button"onClick={() =>
 updateSlot(
 index,
"category",
 slot.category === key ?"": key
 )
 }
 className={cn(
"inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-all",
 slot.category === key
 ?"bg-primary/10 dark:bg-primary/20 ring-2 ring-primary scale-105":"bg-accent/60 hover:bg-accent opacity-60 hover:opacity-100")}
 title={cat.label}
 >
 <span>{cat.emoji}</span>
 <span className="hidden sm:inline">
 {cat.label}
 </span>
 </button>
 );
 }
 )}
 </div>

 {/* Title + submit */}
 <div className="flex gap-2">
 <Input
 placeholder={
 slot.category
 ?`¿Qué hiciste en ${CATEGORIES[slot.category as WorkCategory]?.label}?`:"Selecciona una categoría primero..."}
 value={slot.title}
 onChange={(e) =>
 updateSlot(index,"title", e.target.value)
 }
 className="flex-1"disabled={!slot.category}
 minLength={10}
 />
 <Button
 type="button"size="icon"disabled={!isValid || slot.loading}
 onClick={() => handleSlotSubmit(index)}
 className={cn(
"border-0 transition-all",
 isValid
 ?"bg-primary hover:from-blue-700 hover:to-blue-800 text-white shadow-blue-600/25":"")}
 >
 {slot.loading ? (
 <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"/>
 ) : (
 <Send className="h-4 w-4"/>
 )}
 </Button>
 </div>

 {/* Validation hint */}
 {slot.category && slot.title.length > 0 && slot.title.length < 10 && (
 <p className="text-[10px] text-destructive">
 Mínimo 10 caracteres ({slot.title.length}/10)
 </p>
 )}
 </div>
 );
 })}
 </div>
 )}

 {/* Success state */}
 {canDismiss && (
 <div className="bg-green-500/10 border border-green-500/20 p-4 text-center space-y-2">
 <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto"/>
 <p className="text-sm font-semibold text-green-700 dark:text-green-400">
 Horas completadas. Desbloqueando acceso...
 </p>
 <p className="text-[11px] text-muted-foreground">
 Estuviste bloqueado por {elapsedMinutes} minuto
 {elapsedMinutes !== 1 ?"s":""} y{" "}
 {elapsedSeconds} segundo{elapsedSeconds !== 1 ?"s":""}.
 Esto queda registrado.
 </p>
 </div>
 )}

 {/* Footer warnings */}
 {!canDismiss && (
 <div className="space-y-2 pt-2">
 <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground/60">
 <Lock className="h-3 w-3"/>
 <span>
 No puedes cerrar, minimizar ni evadir este bloqueo
 </span>
 </div>
 <p className="text-center text-[10px] text-muted-foreground">
 Registra al menos {missingCount} hora
 {missingCount !== 1 ?"s":""} más del día{" "}
 {stats?.previousDate} para desbloquear el acceso.
 </p>
 </div>
 )}
 </div>
 </Card>
 </div>
 );
}

// ---------------------------------------------------------------------------
// Admin notification helper
// ---------------------------------------------------------------------------

async function notifyAdmins(
 supabase: ReturnType<typeof createClient>,
 orgId: string,
 blockedUserId: string,
 blockedUserName: string,
 date: string,
 hoursLogged: number
) {
 // Find org admins and owners
 const { data: admins } = await supabase
 .from("org_members")
 .select("user_id")
 .eq("org_id", orgId)
 .in("role", ["admin","owner"])
 .neq("user_id", blockedUserId);

 if (!admins || admins.length === 0) return;

 // Insert a notification for each admin
 const notifications = admins.map(
 (admin: { user_id: string }) => ({
 user_id: admin.user_id,
 org_id: orgId,
 type:"flag_raised",
 title:`${blockedUserName} fue bloqueado por registro incompleto`,
 body:`Solo registró ${hoursLogged}/${EXPECTED_DAILY_HOURS} horas el ${date}. El acceso a la plataforma fue bloqueado hasta completar el registro.`,
 link: null,
 read: false,
 })
 );

 await supabase.from("notifications").insert(notifications);

 // Also insert an accountability flag
 await supabase.from("accountability_flags").insert({
 user_id: blockedUserId,
 org_id: orgId,
 flag_type:"missing_hours"as const,
 date,
 details:`Bloqueo activado: solo ${hoursLogged}/${EXPECTED_DAILY_HOURS} horas registradas. El usuario fue bloqueado al intentar acceder a la plataforma.`,
 resolved: false,
 });
}
