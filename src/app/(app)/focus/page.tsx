"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { CATEGORIES, LIVE_STATUS_CONFIG } from "@/lib/constants";
import type { WorkCategory, LiveStatus, Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import {
  Brain,
  Play,
  Pause,
  RotateCcw,
  Timer,
  Clock,
  Flame,
  Target,
  TrendingUp,
  Users,
  Zap,
  CheckCircle2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PomodoroSession {
  id: string;
  user_id: string;
  org_id: string;
  duration_minutes: number;
  category: WorkCategory;
  task: string | null;
  completed: boolean;
  started_at: string;
  completed_at: string | null;
}

type StatusWithProfile = LiveStatus & { profiles: Profile };

// ---------------------------------------------------------------------------
// Timer Presets
// ---------------------------------------------------------------------------

const PRESETS = [
  { label: "15 min", minutes: 15, description: "Sprint corto" },
  { label: "25 min", minutes: 25, description: "Pomodoro clasico" },
  { label: "50 min", minutes: 50, description: "Deep work" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Circular Progress Ring Component
// ---------------------------------------------------------------------------

function CircularProgress({
  progress,
  size = 280,
  strokeWidth = 10,
  isRunning,
  timeDisplay,
  presetLabel,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  isRunning: boolean;
  timeDisplay: string;
  presetLabel: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/30"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#timerGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-linear"
        />
        {/* Gradient definition */}
        <defs>
          <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "text-5xl font-bold tracking-tight tabular-nums transition-colors",
            isRunning ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {timeDisplay}
        </span>
        <span className="text-xs text-muted-foreground mt-1">{presetLabel}</span>
        {isRunning && (
          <div className="flex items-center gap-1 mt-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <span className="text-[10px] font-medium text-blue-500 uppercase tracking-wider">
              Enfocado
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function FocusPage() {
  // Auth / org
  const { orgId, userId, loading: orgLoading } = useOrg();

  // Timer state
  const [presetMinutes, setPresetMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Task / category
  const [currentTask, setCurrentTask] = useState("");
  const [category, setCategory] = useState<WorkCategory>("deep_work");

  // Session data
  const [todaySessions, setTodaySessions] = useState<PomodoroSession[]>([]);
  const [teamFocus, setTeamFocus] = useState<StatusWithProfile[]>([]);

  const supabase = createClient();

  // -----------------------------------------------------------------------
  // Load today's sessions + team focus
  // -----------------------------------------------------------------------

  const loadData = useCallback(async () => {
    if (!orgId || !userId) return;

    const today = new Date().toISOString().split("T")[0];

    const [{ data: sessions }, { data: statuses }] = await Promise.all([
      supabase
        .from("pomodoro_sessions")
        .select("*")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .gte("started_at", today + "T00:00:00")
        .lte("started_at", today + "T23:59:59")
        .order("started_at", { ascending: false })
        ,
      supabase
        .from("live_status")
        .select("*, profiles(*)")
        .eq("org_id", orgId)
        .eq("status", "deep_work")
        .neq("user_id", userId)
        ,
    ]);

    setTodaySessions(sessions ?? []);
    setTeamFocus(statuses ?? []);
  }, [orgId, userId, supabase]);

  useEffect(() => {
    if (!orgId || !userId) return;
    loadData();

    // Real-time subscription for team focus changes
    const channel = supabase
      .channel("focus_live_status")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_status",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, userId, supabase, loadData]);

  // -----------------------------------------------------------------------
  // Timer logic
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (isRunning && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setIsRunning(false);
            handleSessionComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSessionComplete() {
    if (!orgId || !userId || !sessionStartedAt) return;

    // Save completed session
    await supabase.from("pomodoro_sessions").insert({
      user_id: userId,
      org_id: orgId,
      duration_minutes: presetMinutes,
      category,
      task: currentTask || null,
      completed: true,
      started_at: sessionStartedAt.toISOString(),
      completed_at: new Date().toISOString(),
    });

    // Update live_status back to online
    await supabase
      .from("live_status")
      .upsert(
        {
          user_id: userId,
          org_id: orgId,
          status: "online",
          current_task: null,
          started_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
        },
        { onConflict: "user_id,org_id" }
      );

    setSessionStartedAt(null);
    loadData();
  }

  function handleStart() {
    if (secondsLeft === 0) {
      setSecondsLeft(presetMinutes * 60);
    }
    setIsRunning(true);
    setSessionStartedAt(new Date());

    // Set live_status to deep_work
    if (orgId && userId) {
      supabase.from("live_status").upsert(
        {
          user_id: userId,
          org_id: orgId,
          status: "deep_work" as const,
          current_task: currentTask || null,
          started_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
        },
        { onConflict: "user_id,org_id" }
      );
    }
  }

  function handlePause() {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  function handleReset() {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSecondsLeft(presetMinutes * 60);
    setSessionStartedAt(null);

    // Restore live_status
    if (orgId && userId) {
      supabase.from("live_status").upsert(
        {
          user_id: userId,
          org_id: orgId,
          status: "online" as const,
          current_task: null,
          started_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
        },
        { onConflict: "user_id,org_id" }
      );
    }
  }

  function selectPreset(minutes: number) {
    if (isRunning) return;
    setPresetMinutes(minutes);
    setSecondsLeft(minutes * 60);
  }

  // -----------------------------------------------------------------------
  // Derived stats
  // -----------------------------------------------------------------------

  const completedSessions = todaySessions.filter((s) => s.completed);
  const totalFocusMinutes = completedSessions.reduce(
    (sum, s) => sum + s.duration_minutes,
    0
  );
  const avgSessionLength =
    completedSessions.length > 0
      ? Math.round(totalFocusMinutes / completedSessions.length)
      : 0;

  // Longest streak = max consecutive completed sessions without large gaps (>10 min between end -> start)
  function computeLongestStreak(): number {
    if (completedSessions.length === 0) return 0;
    const sorted = [...completedSessions]
      .filter((s) => s.completed_at)
      .sort(
        (a, b) =>
          new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
      );
    let maxStreak = 1;
    let currentStreak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = new Date(sorted[i - 1].completed_at!).getTime();
      const currStart = new Date(sorted[i].started_at).getTime();
      const gapMinutes = (currStart - prevEnd) / 1000 / 60;
      if (gapMinutes <= 10) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }
    return maxStreak;
  }

  const longestStreak = computeLongestStreak();
  const totalSeconds = presetMinutes * 60;
  const progress = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 0;
  const currentPreset =
    PRESETS.find((p) => p.minutes === presetMinutes) ?? PRESETS[1];

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (orgLoading) {
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

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="w-6 h-6 text-blue-500" />
          Modo Focus
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Timer Pomodoro integrado. Tu equipo ve que estas en deep work.
        </p>
      </div>

      {/* ================================================================= */}
      {/* HERO: Timer Card                                                   */}
      {/* ================================================================= */}
      <Card className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 via-white to-sky-50 dark:from-blue-950/30 dark:via-card dark:to-sky-950/20 shadow-lg border-0 ring-1 ring-blue-200/50 dark:ring-blue-800/30">
        <CardContent className="flex flex-col items-center py-10 px-6 gap-6">
          {/* Preset selector */}
          <div className="flex gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                onClick={() => selectPreset(preset.minutes)}
                disabled={isRunning}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  presetMinutes === preset.minutes
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                    : "bg-white/80 dark:bg-white/5 text-muted-foreground hover:bg-blue-100 dark:hover:bg-blue-900/30",
                  isRunning && "cursor-default opacity-60"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Circular Timer */}
          <CircularProgress
            progress={progress}
            isRunning={isRunning}
            timeDisplay={formatDuration(secondsLeft)}
            presetLabel={currentPreset.description}
          />

          {/* Controls */}
          <div className="flex items-center gap-3">
            {!isRunning ? (
              <Button
                onClick={handleStart}
                size="lg"
                className="gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25 text-white px-8"
              >
                <Play className="w-5 h-5" />
                {secondsLeft < totalSeconds && secondsLeft > 0
                  ? "Continuar"
                  : "Iniciar"}
              </Button>
            ) : (
              <Button
                onClick={handlePause}
                size="lg"
                variant="outline"
                className="gap-2 rounded-xl px-8"
              >
                <Pause className="w-5 h-5" />
                Pausar
              </Button>
            )}
            <Button
              onClick={handleReset}
              variant="ghost"
              size="lg"
              className="gap-2 rounded-xl"
              disabled={secondsLeft === totalSeconds && !isRunning}
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
          </div>

          {/* Task + Category */}
          <div className="w-full max-w-md space-y-3">
            <Input
              placeholder="En que vas a trabajar..."
              value={currentTask}
              onChange={(e) => setCurrentTask(e.target.value)}
              disabled={isRunning}
              className="rounded-xl text-center bg-white/70 dark:bg-white/5 border-blue-200/50 dark:border-blue-800/30 focus-visible:ring-blue-500/30"
            />
            <div className="flex justify-center">
              <Select
                value={category}
                onValueChange={(v) => v && setCategory(v as WorkCategory)}
                disabled={isRunning}
              >
                <SelectTrigger className="w-auto rounded-xl bg-white/70 dark:bg-white/5 border-blue-200/50 dark:border-blue-800/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORIES) as WorkCategory[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span>{CATEGORIES[key].emoji}</span>
                        <span>{CATEGORIES[key].label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Timer completed notification */}
          {secondsLeft === 0 && !isRunning && sessionStartedAt === null && (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium text-sm">
                Sesion completada y guardada
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* Stats Grid                                                         */}
      {/* ================================================================= */}
      <div>
        <h2 className="font-semibold text-lg flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          Estadisticas de hoy
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="rounded-2xl bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-card shadow-lg border-0 ring-1 ring-blue-200/30 dark:ring-blue-800/20">
            <CardContent className="p-4 text-center">
              <Clock className="w-5 h-5 mx-auto text-blue-500 mb-2" />
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {formatMinutes(totalFocusMinutes)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Tiempo enfocado
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-card shadow-lg border-0 ring-1 ring-indigo-200/30 dark:ring-indigo-800/20">
            <CardContent className="p-4 text-center">
              <Target className="w-5 h-5 mx-auto text-indigo-500 mb-2" />
              <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                {completedSessions.length}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Sesiones completas
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-card shadow-lg border-0 ring-1 ring-blue-200/30 dark:ring-blue-800/20">
            <CardContent className="p-4 text-center">
              <Timer className="w-5 h-5 mx-auto text-blue-500 mb-2" />
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {avgSessionLength > 0 ? `${avgSessionLength}min` : "--"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Promedio por sesion
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-card shadow-lg border-0 ring-1 ring-amber-200/30 dark:ring-amber-800/20">
            <CardContent className="p-4 text-center">
              <Flame className="w-5 h-5 mx-auto text-amber-500 mb-2" />
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                {longestStreak > 0 ? longestStreak : "--"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Racha mas larga
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Today's Sessions                                                   */}
      {/* ================================================================= */}
      <div>
        <h2 className="font-semibold text-lg flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-blue-500" />
          Sesiones de hoy
        </h2>

        {todaySessions.length === 0 ? (
          <Card className="rounded-2xl shadow-lg border-0 ring-1 ring-foreground/5">
            <CardContent className="p-8 text-center">
              <Timer className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Aun no tienes sesiones hoy. Inicia tu primer Pomodoro.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {todaySessions.map((session) => {
              const cat = CATEGORIES[session.category];
              const startTime = new Date(session.started_at);
              const hours = String(startTime.getHours()).padStart(2, "0");
              const mins = String(startTime.getMinutes()).padStart(2, "0");

              return (
                <Card
                  key={session.id}
                  className="rounded-2xl shadow-lg border-0 ring-1 ring-foreground/5"
                >
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex items-center justify-center w-10 h-10 rounded-xl text-lg shrink-0",
                          cat.bgColor
                        )}
                      >
                        {cat.emoji}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {session.task || cat.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {hours}:{mins} · {session.duration_minutes}min
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={session.completed ? "default" : "outline"}
                        className={cn(
                          "text-[10px]",
                          session.completed
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "text-muted-foreground"
                        )}
                      >
                        {session.completed ? "Completada" : "Cancelada"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* Team Focus                                                         */}
      {/* ================================================================= */}
      <div>
        <h2 className="font-semibold text-lg flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-blue-500" />
          Equipo en Focus
        </h2>

        {teamFocus.length === 0 ? (
          <Card className="rounded-2xl shadow-lg border-0 ring-1 ring-foreground/5">
            <CardContent className="p-8 text-center">
              <Users className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Nadie mas esta en deep work ahora mismo.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {teamFocus.map((s) => {
              const config = LIVE_STATUS_CONFIG[s.status];
              return (
                <Card
                  key={s.user_id}
                  className="rounded-2xl shadow-lg border-0 ring-1 ring-blue-200/30 dark:ring-blue-800/20 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/10 dark:to-card"
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <Avatar className="w-10 h-10 ring-2 ring-blue-200 dark:ring-blue-800">
                      <AvatarImage src={s.profiles.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        {getInitials(s.profiles.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {s.profiles.full_name ?? s.profiles.email}
                      </p>
                      {s.current_task && (
                        <p className="text-xs text-muted-foreground truncate">
                          {s.current_task}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                          <span
                            className={cn(
                              "relative inline-flex rounded-full h-2 w-2",
                              config.dotColor
                            )}
                          />
                        </span>
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                          {config.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          · {timeAgo(s.started_at)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
