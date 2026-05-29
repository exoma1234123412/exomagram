"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import {
  CATEGORIES,
  EXPECTED_DAILY_HOURS,
  WORK_HOURS,
  CATEGORY_COLORS,
} from "@/lib/constants";
import type { WorkCategory, ReactionType } from "@/lib/types/database";
import { DailyChallenge } from "@/components/dashboard/daily-challenge";
import { MoodWeather } from "@/components/dashboard/mood-weather";
import { DailyCloseoutDialog } from "@/components/closeout/daily-closeout-dialog";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, getTodayMTY, getInitials, timeAgo, formatHourShort } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import {
  Sun,
  Sunrise,
  Moon,
  Clock,
  Flame,
  Shield,
  AlertTriangle,
  Users,
  Bell,
  Heart,
  Plus,
  FileCheck,
  Rss,
  Eye,
  CheckCircle2,
  Target,
  Trophy,
  Activity,
} from "lucide-react";

// ─── GREETING LOGIC ─────────────────────────────────────────
function getGreeting(name: string): { text: string; icon: typeof Sun } {
  const hour = new Date().getHours();
  const first = name.split(" ")[0] || name;
  if (hour < 12) return { text: `Buenos dias, ${first}`, icon: Sunrise };
  if (hour < 19) return { text: `Buenas tardes, ${first}`, icon: Sun };
  return { text: `Buenas noches, ${first}`, icon: Moon };
}

// ─── WORKDAY REMAINING ─────────────────────────────────────
function getWorkdayRemaining(): { hours: number; minutes: number } | null {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const endHour = WORK_HOURS[WORK_HOURS.length - 1] + 1; // 19
  if (h >= endHour) return null;
  const startHour = WORK_HOURS[0]; // 7
  if (h < startHour) {
    const totalMin = (endHour - startHour) * 60;
    return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
  }
  const remaining = (endHour * 60) - (h * 60 + m);
  if (remaining <= 0) return null;
  return { hours: Math.floor(remaining / 60), minutes: remaining % 60 };
}

// ─── INTERFACES ─────────────────────────────────────────────
interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

interface RecentEntry {
  id: string;
  title: string;
  category: WorkCategory;
  hour: number;
  logged_at: string;
  reactions: { reaction: ReactionType; count: number }[];
}

interface BuddyInfo {
  userId: string;
  name: string;
  avatarUrl: string | null;
  hoursToday: number;
  streak: number;
  isOnline: boolean;
}

interface TeamPulse {
  onlineCount: number;
  totalMembers: number;
  completedToday: number;
  topPerformer: { name: string; hours: number } | null;
}

interface IntentionData {
  todayPlan: string;
  focusCategory: WorkCategory | null;
  totalPlanned: number;
  totalActual: number;
}

interface HomeState {
  userId: string;
  orgId: string;
  name: string;
  avatarUrl: string | null;
  hoursLogged: number;
  hoursWithProof: number;
  streak: number;
  trustScore: number | null;
  hourGrid: Map<number, { category: WorkCategory; title: string } | null>;
  recentEntries: RecentEntry[];
  notifications: Notification[];
  teamPulse: TeamPulse;
  buddy: BuddyInfo | null;
  intention: IntentionData | null;
}

// ─── CIRCULAR PROGRESS RING ────────────────────────────────
function ProgressRing({
  value,
  max,
  size = 120,
  strokeWidth = 8,
  className,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct);

  const color =
    pct >= 1
      ? "stroke-green-500"
      : pct >= 0.5
        ? "stroke-blue-500"
        : "stroke-orange-500";

  return (
    <svg
      width={size}
      height={size}
      className={cn("transform -rotate-90", className)}
    >
      {/* Background track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-muted/40"
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={cn("transition-all duration-1000 ease-out", color)}
      />
    </svg>
  );
}

// ─── TYPE EMOJI FOR NOTIFICATIONS ──────────────────────────
const TYPE_EMOJI: Record<string, string> = {
  entry_logged: "📝",
  shoutout_received: "⭐",
  reaction_received: "👍",
  flag_raised: "🚩",
  standup_reminder: "💬",
  closeout_reminder: "📋",
  verification_request: "🔍",
  goal_completed: "🎯",
  streak_milestone: "🔥",
};

const REACTION_EMOJI: Record<ReactionType, string> = {
  verified: "✅",
  suspicious: "🤔",
  impressive: "🔥",
  helped_me: "🙏",
};

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function HomePage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [state, setState] = useState<HomeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const supabase = createClient();
  const today = getTodayMTY();

  useEffect(() => {
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }

    async function load() {

      // Parallel fetches
      const [
        { data: profile },
        { data: entries },
        { data: streakData },
        { data: trustData },
        { data: notifs },
        { data: teamMembers },
        { data: teamStatuses },
        { data: standupData },
        { data: buddyPairs },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", userId!)
          .single(),
        supabase
          .from("time_entries")
          .select("id, title, category, hour, proof_urls, logged_at")
          .eq("user_id", userId!)
          .eq("date", today)
          .order("hour", { ascending: true }),
        supabase
          .from("activity_streaks")
          .select("current_streak")
          .eq("user_id", userId!)
          .eq("org_id", orgId)
          .maybeSingle(),
        supabase
          .from("trust_score_history")
          .select("score")
          .eq("user_id", userId!)
          .eq("org_id", orgId)
          .order("date", { ascending: false })
          .limit(1),
        supabase
          .from("notifications")
          .select("id, type, title, body, link, read, created_at")
          .eq("user_id", userId!)
          .eq("read", false)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("org_members")
          .select("user_id")
          .eq("org_id", orgId),
        supabase
          .from("live_status")
          .select("user_id, status")
          .eq("org_id", orgId)
          .neq("status", "offline"),
        supabase
          .from("standups")
          .select("today_plan")
          .eq("user_id", userId!)
          .eq("date", today)
          .maybeSingle(),
        supabase
          .from("buddy_pairs")
          .select("user_a, user_b")
          .eq("org_id", orgId)
          .or(`user_a.eq.${userId!},user_b.eq.${userId!}`)
          .eq("active", true)
          .limit(1)
          .maybeSingle(),
      ]);

      const myEntries = entries ?? [];
      const hoursLogged = myEntries.length;
      const hoursWithProof = myEntries.filter(
        (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
      ).length;

      // Build hour grid
      const hourGrid = new Map<
        number,
        { category: WorkCategory; title: string } | null
      >();
      for (const h of WORK_HOURS) {
        const entry = myEntries.find((e) => e.hour === h);
        hourGrid.set(
          h,
          entry
            ? { category: entry.category as WorkCategory, title: entry.title }
            : null
        );
      }

      // Fetch reactions for recent entries (last 3)
      const recentRaw = myEntries.slice(-3).reverse();
      let recentEntries: RecentEntry[] = [];
      if (recentRaw.length > 0) {
        const { data: allReactions } = await supabase
          .from("entry_reactions")
          .select("entry_id, reaction")
          .in(
            "entry_id",
            recentRaw.map((e) => e.id)
          );

        recentEntries = recentRaw.map((e) => {
          const entryReactions = (allReactions ?? []).filter(
            (r) => r.entry_id === e.id
          );
          const reactionCounts: Record<string, number> = {};
          entryReactions.forEach((r) => {
            reactionCounts[r.reaction] =
              (reactionCounts[r.reaction] ?? 0) + 1;
          });
          return {
            id: e.id,
            title: e.title,
            category: e.category as WorkCategory,
            hour: e.hour,
            logged_at: e.logged_at,
            reactions: Object.entries(reactionCounts).map(([reaction, count]) => ({
              reaction: reaction as ReactionType,
              count,
            })),
          };
        });
      }

      // Team pulse: count how many completed EXPECTED_DAILY_HOURS
      const allMemberIds = (teamMembers ?? []).map((m) => m.user_id);
      let completedToday = 0;
      let topPerformer: { name: string; hours: number } | null = null;

      if (allMemberIds.length > 0) {
        const { data: allEntries } = await supabase
          .from("time_entries")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("date", today);

        const { data: allProfiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", allMemberIds);

        const countByUser: Record<string, number> = {};
        (allEntries ?? []).forEach((e) => {
          countByUser[e.user_id] = (countByUser[e.user_id] ?? 0) + 1;
        });

        let maxHours = 0;
        let maxUser = "";
        for (const [uid, count] of Object.entries(countByUser)) {
          if (count >= EXPECTED_DAILY_HOURS) completedToday++;
          if (count > maxHours) {
            maxHours = count;
            maxUser = uid;
          }
        }

        if (maxHours > 0 && maxUser !== userId!) {
          const tp = (allProfiles ?? []).find((p) => p.id === maxUser);
          if (tp) {
            topPerformer = {
              name: (tp.full_name as string)?.split(" ")[0] ?? "?",
              hours: maxHours,
            };
          }
        }
      }

      // Buddy info
      let buddy: BuddyInfo | null = null;
      if (buddyPairs) {
        const buddyId =
          (buddyPairs as { user_a: string; user_b: string }).user_a === userId!
            ? (buddyPairs as { user_a: string; user_b: string }).user_b
            : (buddyPairs as { user_a: string; user_b: string }).user_a;

        const [{ data: buddyProfile }, { data: buddyEntries }, { data: buddyStreak }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("full_name, avatar_url")
              .eq("id", buddyId)
              .single(),
            supabase
              .from("time_entries")
              .select("id")
              .eq("user_id", buddyId)
              .eq("date", today),
            supabase
              .from("activity_streaks")
              .select("current_streak")
              .eq("user_id", buddyId)
              .eq("org_id", orgId)
              .maybeSingle(),
          ]);

        const buddyOnline = (teamStatuses ?? []).some(
          (s) => s.user_id === buddyId
        );

        buddy = {
          userId: buddyId,
          name:
            (buddyProfile as { full_name: string | null })?.full_name ?? "Buddy",
          avatarUrl:
            (buddyProfile as { avatar_url: string | null })?.avatar_url ?? null,
          hoursToday: buddyEntries?.length ?? 0,
          streak:
            (buddyStreak as { current_streak: number } | null)
              ?.current_streak ?? 0,
          isOnline: buddyOnline,
        };
      }

      // Intention from standup
      let intention: IntentionData | null = null;
      if (standupData && (standupData as { today_plan: string }).today_plan) {
        // Figure out dominant category from entries
        const categoryCounts: Record<string, number> = {};
        myEntries.forEach((e) => {
          categoryCounts[e.category] =
            (categoryCounts[e.category] ?? 0) + 1;
        });
        const topCat = Object.entries(categoryCounts).sort(
          (a, b) => b[1] - a[1]
        )[0];

        intention = {
          todayPlan: (standupData as { today_plan: string }).today_plan,
          focusCategory: topCat
            ? (topCat[0] as WorkCategory)
            : null,
          totalPlanned: EXPECTED_DAILY_HOURS,
          totalActual: hoursLogged,
        };
      }

      setState({
        userId: userId!,
        orgId: orgId!,
        name:
          (profile as { full_name: string | null })?.full_name ?? "Usuario",
        avatarUrl:
          (profile as { avatar_url: string | null })?.avatar_url ?? null,
        hoursLogged,
        hoursWithProof,
        streak:
          (streakData as { current_streak: number } | null)?.current_streak ??
          0,
        trustScore:
          trustData && trustData.length > 0
            ? (trustData[0] as { score: number }).score
            : null,
        hourGrid,
        recentEntries,
        notifications: (notifs ?? []) as Notification[],
        teamPulse: {
          onlineCount: teamStatuses?.length ?? 0,
          totalMembers: allMemberIds.length,
          completedToday,
          topPerformer,
        },
        buddy,
        intention,
      });
      setLoading(false);
    }

    load();
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── LOADING ──────────────────────────────────────────────
  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Cargando...
          </p>
        </div>
      </div>
    );
  }

  // ── NO ORG ───────────────────────────────────────────────
  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-primary" />
          </div>
          <p className="text-muted-foreground">
            No se encontro organizacion. Ve a Dashboard para crear una.
          </p>
        </div>
      </div>
    );
  }

  const greeting = getGreeting(state.name);
  const GreetingIcon = greeting.icon;
  const displayDate = format(new Date(), "EEEE, d 'de' MMMM yyyy", {
    locale: es,
  });
  const workdayRemaining = getWorkdayRemaining();
  const proofPct =
    state.hoursLogged > 0
      ? Math.round((state.hoursWithProof / state.hoursLogged) * 100)
      : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* ═══════════════════════════════════════════════════════
          1. GREETING
          ═══════════════════════════════════════════════════════ */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <GreetingIcon className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting.text}
          </h1>
        </div>
        <p className="text-muted-foreground text-sm capitalize">
          {displayDate}
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════
          2. YOUR DAY AT A GLANCE — Hero Section
          ═══════════════════════════════════════════════════════ */}
      <Card className="mb-8 overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardContent className="p-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-5">
            Tu dia de un vistazo
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Circular progress ring */}
            <div className="relative flex items-center justify-center shrink-0">
              <ProgressRing
                value={state.hoursLogged}
                max={EXPECTED_DAILY_HOURS}
                size={120}
                strokeWidth={10}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
                <span className="text-3xl font-bold tabular-nums tracking-tight">
                  {state.hoursLogged}
                </span>
                <span className="text-xs text-muted-foreground">
                  / {EXPECTED_DAILY_HOURS}h
                </span>
              </div>
            </div>

            {/* Stat pills + countdown */}
            <div className="flex-1 w-full space-y-4">
              {/* Three stat pills */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-accent/40 rounded-xl px-3 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-green-500" />
                    <span
                      className={cn(
                        "text-lg font-bold tabular-nums tracking-tight",
                        proofPct >= 80
                          ? "text-green-600"
                          : proofPct >= 50
                            ? "text-yellow-600"
                            : "text-red-600"
                      )}
                    >
                      {state.hoursLogged > 0 ? `${proofPct}%` : "-"}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Evidencia
                  </p>
                </div>

                <div className="bg-accent/40 rounded-xl px-3 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-lg font-bold tabular-nums tracking-tight">
                      {state.streak}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Racha
                  </p>
                </div>

                <div className="bg-accent/40 rounded-xl px-3 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-blue-500" />
                    <span
                      className={cn(
                        "text-lg font-bold tabular-nums tracking-tight",
                        state.trustScore === null
                          ? "text-muted-foreground"
                          : state.trustScore >= 80
                            ? "text-green-600"
                            : state.trustScore >= 60
                              ? "text-blue-600"
                              : "text-yellow-600"
                      )}
                    >
                      {state.trustScore ?? "-"}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Trust Score
                  </p>
                </div>
              </div>

              {/* Countdown */}
              {workdayRemaining ? (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Quedan{" "}
                    <span className="font-semibold text-foreground tabular-nums tracking-tight">
                      {workdayRemaining.hours}h {workdayRemaining.minutes}m
                    </span>{" "}
                    de jornada
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-muted-foreground">
                    Jornada laboral finalizada
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════
          3. MORNING INTENTION (if set via standup)
          ═══════════════════════════════════════════════════════ */}
      {state.intention && (
        <Card className="mb-8 border-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm">Plan de hoy</h3>
              {state.intention.focusCategory && (
                <Badge
                  className={cn(
                    "text-[10px]",
                    CATEGORIES[state.intention.focusCategory].bgColor,
                    CATEGORIES[state.intention.focusCategory].color
                  )}
                >
                  {CATEGORIES[state.intention.focusCategory].emoji}{" "}
                  {CATEGORIES[state.intention.focusCategory].label}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3 line-clamp-3">
              {state.intention.todayPlan}
            </p>
            {/* Progress bar: actual vs planned */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progreso</span>
                <span className="font-medium tabular-nums tracking-tight">
                  {state.intention.totalActual}/{state.intention.totalPlanned}h
                </span>
              </div>
              <div className="w-full bg-accent/60 rounded-full h-2 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    state.intention.totalActual >= state.intention.totalPlanned
                      ? "bg-gradient-to-r from-green-500 to-emerald-500"
                      : "bg-gradient-to-r from-blue-500 to-blue-600"
                  )}
                  style={{
                    width: `${Math.min((state.intention.totalActual / state.intention.totalPlanned) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════
          4. QUICK ACTIONS — 4 big buttons
          ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Button
          onClick={() => setLogOpen(true)}
          className="h-auto flex-col gap-2 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 border-0"
        >
          <Plus className="w-5 h-5" />
          <span className="text-xs font-semibold">Registrar hora</span>
        </Button>

        <Button
          onClick={() => setCloseoutOpen(true)}
          variant="outline"
          className="h-auto flex-col gap-2 py-4 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
        >
          <FileCheck className="w-5 h-5 text-primary" />
          <span className="text-xs font-semibold">Cerrar dia</span>
        </Button>

        <Link
          href="/feed"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-xl border border-border bg-background text-sm font-medium transition-all",
            "hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
            "h-auto flex-col gap-2 py-4 hover:shadow-lg hover:shadow-primary/5"
          )}
        >
          <Rss className="w-5 h-5 text-primary" />
          <span className="text-xs font-semibold">Ver feed</span>
        </Link>

        <Link
          href="/mirror"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-xl border border-border bg-background text-sm font-medium transition-all",
            "hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
            "h-auto flex-col gap-2 py-4 hover:shadow-lg hover:shadow-primary/5"
          )}
        >
          <Eye className="w-5 h-5 text-primary" />
          <span className="text-xs font-semibold">Mi espejo</span>
        </Link>
      </div>

      {/* ═══════════════════════════════════════════════════════
          5. YOUR GAPS — hour grid
          ═══════════════════════════════════════════════════════ */}
      <Card className="mb-8 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm">Tus huecos</h3>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums tracking-tight">
              {state.hoursLogged}/{WORK_HOURS.length} horas cubiertas
            </span>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
            {WORK_HOURS.map((h) => {
              const entry = state.hourGrid.get(h);
              const isCurrent = new Date().getHours() === h;
              return (
                <div
                  key={h}
                  title={
                    entry
                      ? `${formatHourShort(h)} — ${CATEGORIES[entry.category].label}: ${entry.title}`
                      : `${formatHourShort(h)} — Sin registro`
                  }
                  className={cn(
                    "aspect-square rounded-lg flex flex-col items-center justify-center text-[9px] font-medium transition-all cursor-default relative",
                    entry
                      ? cn(
                          CATEGORY_COLORS[entry.category],
                          "text-white shadow-sm"
                        )
                      : "bg-muted/50 text-muted-foreground",
                    isCurrent && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                  )}
                >
                  <span className="leading-none">
                    {h > 12 ? h - 12 : h}
                  </span>
                  <span className="leading-none opacity-70">
                    {h >= 12 ? "p" : "a"}
                  </span>
                  {entry && (
                    <span className="absolute -top-0.5 -right-0.5 text-[8px] leading-none">
                      {CATEGORIES[entry.category].emoji}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
            {Object.entries(CATEGORIES)
              .filter(([key]) => {
                // Only show categories that appear in the grid
                for (const entry of state.hourGrid.values()) {
                  if (entry?.category === key) return true;
                }
                return false;
              })
              .map(([key, cat]) => (
                <div key={key} className="flex items-center gap-1">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-sm",
                      CATEGORY_COLORS[key]
                    )}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    {cat.label}
                  </span>
                </div>
              ))}
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-muted/50" />
              <span className="text-[9px] text-muted-foreground">
                Sin registro
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════
          6. TEAM PULSE (compact)
          ═══════════════════════════════════════════════════════ */}
      <Card className="mb-8 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-sm">Pulso del equipo</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Online now */}
            <div className="bg-accent/40 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-xl font-bold tabular-nums tracking-tight">
                  {state.teamPulse.onlineCount}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">En linea</p>
            </div>

            {/* Completed today */}
            <div className="bg-accent/40 rounded-xl p-3 text-center">
              <span className="text-xl font-bold tabular-nums tracking-tight">
                {state.teamPulse.completedToday}
                <span className="text-sm font-medium text-muted-foreground">
                  /{state.teamPulse.totalMembers}
                </span>
              </span>
              <p className="text-[10px] text-muted-foreground mt-1">
                Completados
              </p>
            </div>

            {/* Team mood weather */}
            <div className="col-span-2 sm:col-span-2">
              <MoodWeather orgId={state.orgId} />
            </div>
          </div>

          {/* Top performer */}
          {state.teamPulse.topPerformer && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Trophy className="w-3.5 h-3.5 text-yellow-500" />
              <span>
                Top hoy:{" "}
                <span className="font-semibold text-foreground">
                  {state.teamPulse.topPerformer.name}
                </span>{" "}
                con{" "}
                <span className="font-semibold text-foreground tabular-nums tracking-tight">
                  {state.teamPulse.topPerformer.hours}h
                </span>
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════
          7. RECENT ACTIVITY — last 3 entries with reactions
          ═══════════════════════════════════════════════════════ */}
      {state.recentEntries.length > 0 && (
        <Card className="mb-8 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm">Actividad reciente</h3>
            </div>
            <div className="space-y-3">
              {state.recentEntries.map((entry) => {
                const cat = CATEGORIES[entry.category];
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-accent/30 transition-all"
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm",
                        cat.bgColor
                      )}
                    >
                      {cat.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant="secondary"
                          className={cn("text-[9px] py-0", cat.color)}
                        >
                          {cat.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground tabular-nums tracking-tight">
                          {formatHourShort(entry.hour)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {timeAgo(entry.logged_at)}
                        </span>
                      </div>
                    </div>
                    {/* Reactions */}
                    {entry.reactions.length > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        {entry.reactions.map((r) => (
                          <span
                            key={r.reaction}
                            className="text-xs bg-accent/60 rounded-lg px-1.5 py-0.5 tabular-nums tracking-tight"
                          >
                            {REACTION_EMOJI[r.reaction]} {r.count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════
          8. NOTIFICATIONS PREVIEW — latest 3 unread
          ═══════════════════════════════════════════════════════ */}
      {state.notifications.length > 0 && (
        <Card className="mb-8 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-sm">Notificaciones</h3>
                <Badge className="text-[9px] py-0 bg-red-500 text-white">
                  {state.notifications.length}
                </Badge>
              </div>
            </div>
            <div className="space-y-2">
              {state.notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-2.5 p-2.5 rounded-xl bg-primary/5 transition-all"
                >
                  <span className="text-base mt-0.5 shrink-0">
                    {TYPE_EMOJI[n.type] ?? "📌"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {n.body}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════
          9. YOUR BUDDY — compact buddy card
          ═══════════════════════════════════════════════════════ */}
      {state.buddy && (
        <Card className="mb-8 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm">Tu Buddy</h3>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="ring-2 ring-background shadow-sm">
                  {state.buddy.avatarUrl && (
                    <AvatarImage src={state.buddy.avatarUrl} />
                  )}
                  <AvatarFallback>
                    {getInitials(state.buddy.name)}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
                    state.buddy.isOnline ? "bg-green-500" : "bg-gray-400"
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {state.buddy.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {state.buddy.isOnline ? "En linea" : "Desconectado"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="text-lg font-bold tabular-nums tracking-tight">
                    {state.buddy.hoursToday}
                  </p>
                  <p className="text-[9px] text-muted-foreground">Horas</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <Flame className="w-3 h-3 text-orange-500" />
                    <p className="text-lg font-bold tabular-nums tracking-tight">
                      {state.buddy.streak}
                    </p>
                  </div>
                  <p className="text-[9px] text-muted-foreground">Racha</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════
          10. DAILY CHALLENGE — with progress
          ═══════════════════════════════════════════════════════ */}
      <DailyChallenge orgId={state.orgId} />

      {/* ── Dialogs ───────────────────────────────────────────── */}
      <DailyCloseoutDialog
        open={closeoutOpen}
        onOpenChange={setCloseoutOpen}
      />
      <LogEntryDialog
        open={logOpen}
        onOpenChange={setLogOpen}
      />
    </div>
  );
}
