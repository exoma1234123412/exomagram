"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Play, Pause, RotateCcw, CheckCircle2 } from "lucide-react";

export function PomodoroTimer() {
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 min default
  const [duration, setDuration] = useState(25);
  const [taskTitle, setTaskTitle] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = createClient();

  const stopTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
  }, []);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            stopTimer();
            completeSession();
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

  async function startTimer() {
    if (!taskTitle.trim()) return;
    setCompleted(false);
    setTimeLeft(duration * 60);
    setIsRunning(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single<{ org_id: string }>();
    if (!membership) return;

    const { data } = await supabase.from("pomodoro_sessions").insert({
      user_id: user.id,
      org_id: membership.org_id,
      task_title: taskTitle,
      duration_minutes: duration,
    }).select("id").single();

    if (data) setSessionId(data.id);

    // Update live status
    await supabase.from("live_status").upsert({
      user_id: user.id,
      org_id: membership.org_id,
      status: "deep_work",
      current_task: `🍅 ${taskTitle}`,
      started_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
    });
  }

  async function completeSession() {
    setCompleted(true);
    if (!sessionId) return;

    await supabase.from("pomodoro_sessions").update({
      completed_at: new Date().toISOString(),
      was_interrupted: false,
    }).eq("id", sessionId);

    // Play notification sound
    if (typeof window !== "undefined" && "Notification" in window) {
      new Notification("Pomodoro completado!", {
        body: `Terminaste: ${taskTitle}`,
      });
    }
  }

  function resetTimer() {
    stopTimer();
    setTimeLeft(duration * 60);
    setCompleted(false);
    setSessionId(null);
  }

  async function interruptSession() {
    stopTimer();
    if (sessionId) {
      await supabase.from("pomodoro_sessions").update({
        completed_at: new Date().toISOString(),
        was_interrupted: true,
      }).eq("id", sessionId);
    }
    setSessionId(null);
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = 1 - timeLeft / (duration * 60);

  return (
    <Card className={cn(
      "transition-all",
      isRunning && "border-violet-300 dark:border-violet-700 shadow-lg",
      completed && "border-green-300 dark:border-green-700"
    )}>
      <CardContent className="p-6">
        <div className="text-center">
          {/* Timer display */}
          <div className="relative w-40 h-40 mx-auto mb-4">
            <svg className="w-40 h-40 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="8"
                className="text-muted/20" />
              <circle cx="60" cy="60" r="54" fill="none" strokeWidth="8"
                className={cn(
                  completed ? "text-green-500" : "text-primary"
                )}
                strokeDasharray={`${2 * Math.PI * 54}`}
                strokeDashoffset={`${2 * Math.PI * 54 * (1 - progress)}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {completed ? (
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              ) : (
                <span className="text-3xl font-mono font-bold tabular-nums tracking-tight">
                  {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </span>
              )}
            </div>
          </div>

          {!isRunning && !completed && (
            <div className="space-y-3 mb-4">
              <Input
                placeholder="¿En qué vas a trabajar?"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="text-center"
              />
              <div className="flex items-center justify-center gap-2">
                {[15, 25, 45, 60].map((d) => (
                  <Button
                    key={d}
                    variant={duration === d ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setDuration(d); setTimeLeft(d * 60); }}
                  >
                    {d}m
                  </Button>
                ))}
              </div>
            </div>
          )}

          {isRunning && (
            <p className="text-sm text-muted-foreground mb-4">{taskTitle}</p>
          )}

          {completed && (
            <p className="text-sm text-green-600 font-medium mb-4">
              Pomodoro completado! {taskTitle}
            </p>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-2">
            {!isRunning && !completed && (
              <Button onClick={startTimer} disabled={!taskTitle.trim()} className="gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-lg shadow-violet-500/25">
                <Play className="w-4 h-4" /> Iniciar
              </Button>
            )}
            {isRunning && (
              <>
                <Button variant="outline" onClick={interruptSession} className="gap-2">
                  <Pause className="w-4 h-4" /> Interrumpir
                </Button>
              </>
            )}
            {(completed || (!isRunning && sessionId)) && (
              <Button variant="outline" onClick={resetTimer} className="gap-2">
                <RotateCcw className="w-4 h-4" /> Nuevo
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
