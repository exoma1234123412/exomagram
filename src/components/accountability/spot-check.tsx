"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, Send, Shield } from "lucide-react";

// PSYCHOLOGY: Random Spot Checks
// At random times, a popup asks "¿Qué estás haciendo AHORA MISMO?"
// You have 5 minutes to respond. If you don't respond, it's flagged.
// The randomness makes it impossible to game — you can't predict when it'll ask.
// Based on "random drug testing" principle — the fear of the test is the deterrent.

export function SpotCheckProvider({ children }: { children: React.ReactNode }) {
  const [showCheck, setShowCheck] = useState(false);
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [deadline, setDeadline] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const supabase = createClient();

  useEffect(() => {
    // Random check: ~1-2 times per workday (every 3-5 hours)
    function scheduleNext() {
      const now = new Date();
      const hour = now.getHours();

      // Only during work hours
      if (hour < 8 || hour > 17) return;

      // Random delay: 90-240 minutes
      const delayMinutes = 90 + Math.floor(Math.random() * 150);
      const delayMs = delayMinutes * 60 * 1000;

      setTimeout(() => {
        const currentHour = new Date().getHours();
        if (currentHour >= 8 && currentHour <= 17) {
          setShowCheck(true);
          setDeadline(Date.now() + 5 * 60 * 1000);
          setTimeLeft(300);
          setSubmitted(false);
          setResponse("");
        }
        scheduleNext(); // Schedule next one
      }, delayMs);
    }

    scheduleNext();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!showCheck || submitted) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) {
        // Time's up — log missed spot check
        logSpotCheck("missed", "No respondió en 5 minutos");
        setShowCheck(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [showCheck, deadline, submitted]);

  async function logSpotCheck(status: string, text: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: membership } = await supabase
      .from("org_members").select("org_id").eq("user_id", user.id).limit(1).single<{ org_id: string }>();
    if (!membership) return;

    await supabase.from("audit_log").insert({
      org_id: membership.org_id,
      user_id: user.id,
      action: "entry_created",
      target_type: "spot_check",
      new_data: {
        status,
        response: text,
        response_time_seconds: 300 - timeLeft,
        timestamp: new Date().toISOString(),
      },
    });

    // If missed, create a flag
    if (status === "missed") {
      await supabase.from("accountability_flags").insert({
        user_id: user.id,
        org_id: membership.org_id,
        flag_type: "suspicious_pattern",
        date: new Date().toISOString().split("T")[0],
        details: "No respondió spot check en 5 minutos",
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!response.trim()) return;
    setSubmitting(true);
    await logSpotCheck("responded", response);
    setSubmitted(true);
    setSubmitting(false);
    setTimeout(() => setShowCheck(false), 2000);
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <>
      {children}
      <Dialog open={showCheck} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md [&>button]:hidden rounded-2xl">
          {submitted ? (
            <div className="text-center py-8">
              <Shield className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold">Verificado</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Respondiste en {300 - timeLeft} segundos. Registrado.
              </p>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  Spot Check
                </DialogTitle>
              </DialogHeader>

              <div className="text-center mb-2">
                <div className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-mono font-bold",
                  timeLeft > 120 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : timeLeft > 60 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 animate-pulse"
                )}>
                  <Clock className="w-4 h-4" />
                  {minutes}:{String(seconds).padStart(2, "0")}
                </div>
              </div>

              <p className="text-sm text-center text-muted-foreground mb-4">
                ¿Qué estás haciendo <span className="font-bold text-foreground">AHORA MISMO</span>?
                <br />
                <span className="text-[10px]">Si no respondes en 5 minutos, se registra como ausencia.</span>
              </p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <Textarea
                  placeholder="Estoy trabajando en..."
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={3}
                  required
                  minLength={10}
                  autoFocus
                />
                <Button type="submit" className="w-full gap-2" disabled={submitting || response.length < 10}>
                  <Send className="w-4 h-4" />
                  {submitting ? "Enviando..." : "Verificar"}
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
