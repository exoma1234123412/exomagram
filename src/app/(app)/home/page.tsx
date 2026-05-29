"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MOOD_LABELS, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { DailyScoreWidget } from "@/components/dashboard/daily-score-widget";
import { QuickLog } from "@/components/dashboard/quick-log";
import { SocialPressureWidget } from "@/components/accountability/social-pressure";
import { WorkSessionTracker } from "@/components/accountability/work-session";
import { MissingHoursAlert } from "@/components/alerts/missing-hours-alert";
import { LiveStatusBar } from "@/components/live/live-status-bar";
import { DailyChallenge } from "@/components/dashboard/daily-challenge";
import { DailyCloseoutDialog } from "@/components/closeout/daily-closeout-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn, getTodayMTY } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Sun,
  Sunrise,
  Coffee,
  Moon,
  Sparkles,
  Target,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Flame,
  Loader2,
  AlertTriangle,
  TrendingUp,
  FileCheck,
  Calendar,
  Users,
  Brain,
  Zap,
} from "lucide-react";

// ─── TIME MODES ─────────────────────────────────────────────
type TimeMode = "morning" | "deep_work" | "production" | "review";

function getTimeMode(): TimeMode {
  const hour = new Date().getHours();
  if (hour < 9) return "morning";
  if (hour < 12) return "deep_work";
  if (hour < 17) return "production";
  return "review";
}

function getGreeting(name: string): { text: string; icon: typeof Sun; sub: string } {
  const mode = getTimeMode();
  const first = name.split(" ")[0] || name;
  switch (mode) {
    case "morning":
      return { text: `Buenos días, ${first}`, icon: Sunrise, sub: "Prepara tu día. Tu equipo ya está mirando." };
    case "deep_work":
      return { text: `A trabajar, ${first}`, icon: Coffee, sub: "Hora de Deep Work. Enfócate y registra." };
    case "production":
      return { text: `Sigue así, ${first}`, icon: Sun, sub: "Tarde productiva. Revisa tu progreso vs promesas." };
    case "review":
      return { text: `Hora de cerrar, ${first}`, icon: Moon, sub: "Evalúa tu día y planifica mañana." };
  }
}

// ─── INTERFACES ─────────────────────────────────────────────
interface Promise {
  id: string;
  user_id: string;
  title: string;
  status: "pending" | "delivered" | "broken";
}

interface Standup {
  id: string;
  yesterday: string;
  today_plan: string;
  blockers: string | null;
  mood: number | null;
  submitted_at: string;
}

interface UserState {
  userId: string;
  orgId: string;
  name: string;
  hoursLogged: number;
  hoursWithProof: number;
  streak: number;
  hasStandup: boolean;
  standup: Standup | null;
  promises: Promise[];
  pendingPromises: number;
  teamOnlineCount: number;
}

interface CoachMessage {
  message: string;
  loading: boolean;
}

// ─── MAIN PAGE ──────────────────────────────────────────────
export default function HomePage() {
  const [state, setState] = useState<UserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeMode, setTimeMode] = useState<TimeMode>(getTimeMode);
  const [coach, setCoach] = useState<CoachMessage>({ message: "", loading: false });
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const supabase = createClient();
  const today = getTodayMTY();

  // Update time mode every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeMode(getTimeMode());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Load user state
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!membership) { setLoading(false); return; }

      const [
        { data: profile },
        { data: entries },
        { data: streakData },
        { data: standupData },
        { data: promisesData },
        { data: teamStatuses },
      ] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).single(),
        supabase.from("time_entries").select("id, proof_urls").eq("user_id", user.id).eq("date", today),
        supabase.from("activity_streaks").select("current_streak").eq("user_id", user.id).eq("org_id", membership.org_id).maybeSingle(),
        supabase.from("standups").select("*").eq("user_id", user.id).eq("date", today).maybeSingle(),
        supabase.from("daily_promises").select("*").eq("user_id", user.id).eq("date", today).order("created_at"),
        supabase.from("live_status").select("id").eq("org_id", membership.org_id).neq("status", "offline"),
      ]);

      const hoursLogged = entries?.length ?? 0;
      const hoursWithProof = entries?.filter((e) => e.proof_urls && e.proof_urls.length > 0).length ?? 0;

      setState({
        userId: user.id,
        orgId: membership.org_id,
        name: (profile as { full_name: string } | null)?.full_name ?? "?",
        hoursLogged,
        hoursWithProof,
        streak: (streakData as { current_streak: number } | null)?.current_streak ?? 0,
        hasStandup: !!standupData,
        standup: standupData as Standup | null,
        promises: (promisesData ?? []) as Promise[],
        pendingPromises: (promisesData ?? []).filter((p) => (p as Promise).status === "pending").length,
        teamOnlineCount: teamStatuses?.length ?? 0,
      });
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Claude coach message
  const fetchCoach = useCallback(async (type: string) => {
    if (!state) return;
    setCoach({ message: "", loading: true });
    try {
      const res = await fetch("/api/claude-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: state.orgId, user_id: state.userId, type }),
      });
      const data = await res.json();
      setCoach({ message: data.message ?? data.coaching ?? "Sin respuesta.", loading: false });
    } catch {
      setCoach({ message: "No se pudo conectar con Claude.", loading: false });
    }
  }, [state]);

  // Auto-fetch coach on load based on time mode
  useEffect(() => {
    if (!state) return;
    const type = timeMode === "review" ? "end_of_day" : "realtime_nudge";
    fetchCoach(type);
  }, [state, timeMode, fetchCoach]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-primary" />
          </div>
          <p className="text-muted-foreground">No se encontró organización. Ve a Dashboard para crear una.</p>
        </div>
      </div>
    );
  }

  const greeting = getGreeting(state.name);
  const GreetingIcon = greeting.icon;
  const displayDate = format(new Date(), "EEEE, d MMMM yyyy", { locale: es });
  const hoursProgress = Math.min((state.hoursLogged / EXPECTED_DAILY_HOURS) * 100, 100);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* ─── HEADER ───────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <GreetingIcon className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">{greeting.text}</h1>
        </div>
        <p className="text-muted-foreground text-sm capitalize">{displayDate}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{greeting.sub}</p>
      </div>

      {/* ─── STATUS STRIP ─────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <div className="bg-accent/40 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold tabular-nums tracking-tight">{state.hoursLogged}</p>
          <p className="text-[10px] text-muted-foreground">Horas hoy</p>
        </div>
        <div className="bg-accent/40 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold tabular-nums tracking-tight">{state.hoursWithProof}</p>
          <p className="text-[10px] text-muted-foreground">Con evidencia</p>
        </div>
        <div className="bg-accent/40 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <Flame className="w-4 h-4 text-orange-500" />
            <p className="text-2xl font-bold tabular-nums tracking-tight">{state.streak}</p>
          </div>
          <p className="text-[10px] text-muted-foreground">Racha</p>
        </div>
        <div className="bg-accent/40 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <Users className="w-4 h-4 text-green-500" />
            <p className="text-2xl font-bold tabular-nums tracking-tight">{state.teamOnlineCount}</p>
          </div>
          <p className="text-[10px] text-muted-foreground">En línea</p>
        </div>
      </div>

      {/* ─── HOURS PROGRESS RING ──────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Progreso de horas</span>
          <span className="text-xs font-bold tabular-nums">{state.hoursLogged}/{EXPECTED_DAILY_HOURS}h</span>
        </div>
        <div className="w-full bg-accent/60 rounded-full h-3 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              hoursProgress >= 100
                ? "bg-gradient-to-r from-green-500 to-emerald-500"
                : hoursProgress >= 50
                  ? "bg-gradient-to-r from-blue-500 to-blue-600"
                  : "bg-gradient-to-r from-yellow-500 to-orange-500"
            )}
            style={{ width: `${hoursProgress}%` }}
          />
        </div>
      </div>

      {/* ─── CLAUDE AI INSIGHT ────────────────────────────── */}
      <Card className="mb-8 border-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/20">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-sm">Claude Coach</p>
                <Badge variant="secondary" className="text-[10px]">
                  {timeMode === "morning" ? "Predicción" : timeMode === "review" ? "Evaluación" : "Nudge"}
                </Badge>
              </div>
              {coach.loading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Analizando tu estado...</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {coach.message}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── TIME-BASED SECTIONS ──────────────────────────── */}
      {timeMode === "morning" && (
        <MorningSection state={state} setState={setState} />
      )}

      {timeMode === "deep_work" && (
        <DeepWorkSection state={state} />
      )}

      {timeMode === "production" && (
        <ProductionSection state={state} setState={setState} />
      )}

      {timeMode === "review" && (
        <ReviewSection state={state} onOpenCloseout={() => setCloseoutOpen(true)} />
      )}

      {/* ─── ALWAYS VISIBLE ───────────────────────────────── */}
      <LiveStatusBar orgId={state.orgId} />

      <DailyCloseoutDialog open={closeoutOpen} onOpenChange={setCloseoutOpen} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MORNING MODE (before 9am)
// ═══════════════════════════════════════════════════════════════

function MorningSection({ state, setState }: { state: UserState; setState: React.Dispatch<React.SetStateAction<UserState | null>> }) {
  return (
    <div className="space-y-6 mb-8">
      {/* Daily challenge / dare */}
      <DailyChallenge orgId={state.orgId} />

      {/* Inline standup */}
      {!state.hasStandup ? (
        <InlineStandup state={state} setState={setState} />
      ) : (
        <Card className="bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-800 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Standup enviado a las {state.standup ? format(new Date(state.standup.submitted_at), "h:mm a") : ""}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Inline promise maker */}
      <InlinePromiseMaker state={state} setState={setState} />

      {/* Quick log for early starters */}
      <QuickLog orgId={state.orgId} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DEEP WORK MODE (9am - 12pm)
// ═══════════════════════════════════════════════════════════════

function DeepWorkSection({ state }: { state: UserState }) {
  return (
    <div className="space-y-6 mb-8">
      {/* Work session tracker */}
      <WorkSessionTracker orgId={state.orgId} />

      {/* Quick log */}
      <QuickLog orgId={state.orgId} />

      {/* Daily score */}
      <DailyScoreWidget orgId={state.orgId} />

      {/* AI nudge if falling behind */}
      {state.hoursLogged < Math.max(new Date().getHours() - 8, 1) && (
        <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/10 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Zap className="w-5 h-5 text-yellow-600" />
            <div>
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                Vas por detrás del ritmo esperado
              </p>
              <p className="text-xs text-muted-foreground">
                {state.hoursLogged} horas registradas, se esperan al menos {Math.max(new Date().getHours() - 8, 1)}.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRODUCTION MODE (12pm - 5pm)
// ═══════════════════════════════════════════════════════════════

function ProductionSection({ state, setState }: { state: UserState; setState: React.Dispatch<React.SetStateAction<UserState | null>> }) {
  return (
    <div className="space-y-6 mb-8">
      {/* Progress vs promises */}
      <PromisesProgress state={state} setState={setState} />

      {/* Social pressure ranking */}
      <SocialPressureWidget orgId={state.orgId} />

      {/* Missing hours */}
      <MissingHoursAlert date={getTodayMTY()} />

      {/* Work session tracker */}
      <WorkSessionTracker orgId={state.orgId} />

      {/* Quick log */}
      <QuickLog orgId={state.orgId} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// REVIEW MODE (after 5pm)
// ═══════════════════════════════════════════════════════════════

function ReviewSection({ state, onOpenCloseout }: { state: UserState; onOpenCloseout: () => void }) {
  return (
    <div className="space-y-6 mb-8">
      {/* Day grade */}
      <DailyScoreWidget orgId={state.orgId} />

      {/* Closeout CTA */}
      <Card className="border-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardContent className="p-5 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <FileCheck className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Cierra tu día</p>
            <p className="text-sm text-muted-foreground mt-1">
              Resumen de logros, bloqueos y plan para mañana. Tu equipo lo ve.
            </p>
          </div>
          <Button
            onClick={onOpenCloseout}
            className="gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 border-0"
          >
            <FileCheck className="w-4 h-4" />
            Cerrar día
          </Button>
        </CardContent>
      </Card>

      {/* Tomorrow planning inline */}
      <TomorrowPlanning state={state} />

      {/* Trust score projection */}
      <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-primary" />
            <p className="font-semibold text-sm">Proyección Trust Score</p>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold tabular-nums tracking-tight">
              {Math.min(
                Math.round(
                  (state.hoursLogged / EXPECTED_DAILY_HOURS) * 40 +
                  (state.hoursWithProof / Math.max(state.hoursLogged, 1)) * 30 +
                  (state.hasStandup ? 15 : 0) +
                  (state.pendingPromises === 0 && state.promises.length > 0 ? 15 : 5)
                ),
                100
              )}
            </p>
            <span className="text-sm text-muted-foreground">/100</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Basado en horas ({state.hoursLogged}h), evidencia ({state.hoursWithProof}), standup y promesas cumplidas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INLINE STANDUP FORM
// ═══════════════════════════════════════════════════════════════

function InlineStandup({ state, setState }: { state: UserState; setState: React.Dispatch<React.SetStateAction<UserState | null>> }) {
  const [yesterday, setYesterday] = useState("");
  const [todayPlan, setTodayPlan] = useState("");
  const [blockers, setBlockers] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();
  const today = getTodayMTY();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const { data } = await supabase.from("standups").upsert({
      user_id: state.userId,
      org_id: state.orgId,
      date: today,
      yesterday,
      today_plan: todayPlan,
      blockers: blockers || null,
      mood: mood as 1 | 2 | 3 | 4 | 5 | null,
    }, { onConflict: "user_id,org_id,date" }).select("*").single();

    if (data) {
      setState((prev) => prev ? {
        ...prev,
        hasStandup: true,
        standup: data as unknown as Standup,
      } : prev);
    }
    setSubmitting(false);
  }

  return (
    <Card className="border-yellow-200 dark:border-yellow-800 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-sm">Standup rápido</h3>
          <Badge variant="secondary" className="text-[10px]">Pendiente</Badge>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">¿Qué hiciste ayer?</Label>
            <Textarea
              placeholder="Resumen breve..."
              value={yesterday}
              onChange={(e) => setYesterday(e.target.value)}
              required
              minLength={10}
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">¿Qué vas a hacer hoy?</Label>
            <Textarea
              placeholder="Plan para hoy, sé específico..."
              value={todayPlan}
              onChange={(e) => setTodayPlan(e.target.value)}
              required
              minLength={10}
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">¿Algún bloqueo?</Label>
            <Textarea
              placeholder="Opcional — ¿algo que te impide avanzar?"
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              rows={1}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">¿Cómo te sientes?</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setMood(mood === level ? null : level)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-medium transition-all",
                    mood === level ? "bg-blue-600 text-white" : "bg-muted hover:bg-muted/80"
                  )}
                >
                  {MOOD_LABELS[level]}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full rounded-xl gap-2" disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
            {submitting ? "Enviando..." : "Enviar standup"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// INLINE PROMISE MAKER
// ═══════════════════════════════════════════════════════════════

function InlinePromiseMaker({ state, setState }: { state: UserState; setState: React.Dispatch<React.SetStateAction<UserState | null>> }) {
  const [newPromise, setNewPromise] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();
  const today = getTodayMTY();

  async function addPromise(e: React.FormEvent) {
    e.preventDefault();
    if (!newPromise.trim()) return;
    setSubmitting(true);

    const { data } = await supabase.from("daily_promises").insert({
      user_id: state.userId,
      org_id: state.orgId,
      date: today,
      title: newPromise.trim(),
      status: "pending",
    }).select("*").single();

    if (data) {
      const p = data as unknown as Promise;
      setState((prev) => prev ? {
        ...prev,
        promises: [...prev.promises, p],
        pendingPromises: prev.pendingPromises + 1,
      } : prev);
    }
    setNewPromise("");
    setSubmitting(false);
  }

  async function markPromise(id: string, status: "delivered" | "broken") {
    await supabase.from("daily_promises").update({ status }).eq("id", id);
    setState((prev) => {
      if (!prev) return prev;
      const updated = prev.promises.map((p) => p.id === id ? { ...p, status } : p);
      return {
        ...prev,
        promises: updated,
        pendingPromises: updated.filter((p) => p.status === "pending").length,
      };
    });
  }

  return (
    <Card className="border-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-sm">Promesas de hoy</h3>
          {state.promises.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {state.promises.filter((p) => p.status === "delivered").length}/{state.promises.length}
            </Badge>
          )}
        </div>

        {state.promises.length > 0 && (
          <div className="space-y-2 mb-4">
            {state.promises.map((p) => (
              <div key={p.id} className={cn(
                "flex items-center gap-3 p-2.5 rounded-xl transition-all text-sm",
                p.status === "delivered" && "bg-green-50 dark:bg-green-950/20",
                p.status === "broken" && "bg-red-50 dark:bg-red-950/20 line-through opacity-60",
                p.status === "pending" && "bg-accent/40",
              )}>
                {p.status === "delivered" && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                {p.status === "broken" && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                {p.status === "pending" && <Clock className="w-4 h-4 text-yellow-500 shrink-0" />}
                <span className="flex-1 font-medium">{p.title}</span>
                {p.status === "pending" && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] text-green-600 rounded-lg" onClick={() => markPromise(p.id, "delivered")}>
                      Cumplida
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-500 rounded-lg" onClick={() => markPromise(p.id, "broken")}>
                      No pude
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addPromise} className="flex gap-2">
          <Input
            placeholder="Hoy voy a entregar..."
            value={newPromise}
            onChange={(e) => setNewPromise(e.target.value)}
            required
            minLength={5}
            className="flex-1 text-sm rounded-xl"
          />
          <Button type="submit" disabled={submitting} className="gap-1.5 rounded-xl" size="sm">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Prometer
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground/60 mt-2">
          Tu equipo ve estas promesas. Al final del día, marca si cumpliste.
        </p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// PROMISES PROGRESS (production mode)
// ═══════════════════════════════════════════════════════════════

function PromisesProgress({ state, setState }: { state: UserState; setState: React.Dispatch<React.SetStateAction<UserState | null>> }) {
  const supabase = createClient();

  async function markPromise(id: string, status: "delivered" | "broken") {
    await supabase.from("daily_promises").update({ status }).eq("id", id);
    setState((prev) => {
      if (!prev) return prev;
      const updated = prev.promises.map((p) => p.id === id ? { ...p, status } : p);
      return {
        ...prev,
        promises: updated,
        pendingPromises: updated.filter((p) => p.status === "pending").length,
      };
    });
  }

  if (state.promises.length === 0) return null;

  const delivered = state.promises.filter((p) => p.status === "delivered").length;
  const total = state.promises.length;
  const pct = Math.round((delivered / total) * 100);

  return (
    <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-sm">Progreso vs promesas</h3>
          </div>
          <Badge
            className={cn(
              "text-[10px]",
              pct === 100 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            )}
          >
            {pct}%
          </Badge>
        </div>
        <div className="w-full bg-accent/60 rounded-full h-2 overflow-hidden mb-4">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              pct === 100 ? "bg-green-500" : "bg-primary"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="space-y-2">
          {state.promises.map((p) => (
            <div key={p.id} className={cn(
              "flex items-center gap-3 p-2.5 rounded-xl transition-all text-sm",
              p.status === "delivered" && "bg-green-50 dark:bg-green-950/20",
              p.status === "broken" && "bg-red-50 dark:bg-red-950/20 line-through opacity-60",
              p.status === "pending" && "bg-accent/40",
            )}>
              {p.status === "delivered" && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
              {p.status === "broken" && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
              {p.status === "pending" && <Clock className="w-4 h-4 text-yellow-500 shrink-0" />}
              <span className="flex-1 font-medium">{p.title}</span>
              {p.status === "pending" && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] text-green-600 rounded-lg" onClick={() => markPromise(p.id, "delivered")}>
                    Cumplida
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-500 rounded-lg" onClick={() => markPromise(p.id, "broken")}>
                    No pude
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// TOMORROW PLANNING (review mode)
// ═══════════════════════════════════════════════════════════════

function TomorrowPlanning({ state }: { state: UserState }) {
  const [plan, setPlan] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!plan.trim()) return;
    setSaving(true);

    // Save as tomorrow's standup draft (today_plan field)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split("T")[0];

    await supabase.from("standups").upsert({
      user_id: state.userId,
      org_id: state.orgId,
      date: tomorrowDate,
      yesterday: "",
      today_plan: plan.trim(),
      blockers: null,
      mood: null,
    }, { onConflict: "user_id,org_id,date" });

    setSaved(true);
    setSaving(false);
  }

  if (saved) {
    return (
      <Card className="bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-800 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            Plan de mañana guardado.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-sm">Planifica mañana</h3>
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          <Textarea
            placeholder="¿Qué vas a hacer mañana? Esto se carga como borrador de tu standup."
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            required
            minLength={10}
            rows={3}
            className="text-sm"
          />
          <Button type="submit" className="w-full rounded-xl gap-2" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            {saving ? "Guardando..." : "Guardar plan para mañana"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
