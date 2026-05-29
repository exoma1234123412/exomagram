"use client";

// CLOSEOUT ENFORCER — Starting at 5pm MTY, nudges user every 15 minutes
// to complete their daily closeout. Escalates visually with each dismissal.
// Non-blocking: always dismissable, but keeps returning.

import { useEffect, useState, useCallback, useRef } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { getTodayMTY, cn } from "@/lib/utils";
import { FileCheck, X } from "lucide-react";
import Link from "next/link";

function getMTY(): { hour: number; day: number; dateStr: string; minutesSince5: number } {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" }));
  const hour = now.getHours();
  const minutesSince5 = Math.max(0, (hour - 17) * 60 + now.getMinutes());
  return { hour, day: now.getDay(), dateStr: getTodayMTY(), minutesSince5 };
}

function getDismissals(date: string): number {
  try { return parseInt(localStorage.getItem(`closeout_enforcer_${date}`) ?? "0", 10); }
  catch { return 0; }
}

function incrementDismissals(date: string): number {
  const next = getDismissals(date) + 1;
  try { localStorage.setItem(`closeout_enforcer_${date}`, String(next)); }
  catch { /* noop */ }
  return next;
}

export function CloseoutEnforcer() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [visible, setVisible] = useState(false);
  const [dismissCount, setDismissCount] = useState(0);
  const [hasCloseout, setHasCloseout] = useState(false);
  const [hoursLogged, setHoursLogged] = useState(0);
  const [proofPct, setProofPct] = useState(0);
  const [teamDone, setTeamDone] = useState(0);
  const [teamTotal, setTeamTotal] = useState(0);
  const [minutesSince5, setMinutesSince5] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if closeout exists for today
  const checkCloseout = useCallback(async () => {
    if (!orgId || !userId) return;
    const { hour, day, dateStr, minutesSince5: m } = getMTY();

    // Weekdays only, 17:00+, before midnight
    if (day === 0 || day === 6 || hour < 17) { setVisible(false); return; }
    setMinutesSince5(m);

    const [closeoutRes, entriesRes, membersRes, teamCloseoutsRes] = await Promise.all([
      supabase.from("daily_closeouts").select("id").eq("user_id", userId).eq("org_id", orgId).eq("date", dateStr).limit(1).single(),
      supabase.from("time_entries").select("hour, proof_urls").eq("user_id", userId).eq("org_id", orgId).eq("date", dateStr).is("deleted_at", null),
      supabase.from("org_members").select("user_id").eq("org_id", orgId),
      supabase.from("daily_closeouts").select("user_id").eq("org_id", orgId).eq("date", dateStr),
    ]);

    if (closeoutRes.data) { setHasCloseout(true); setVisible(false); return; }

    // Entry stats
    const entries = entriesRes.data ?? [];
    const uniqueHours = new Set(entries.map((e) => e.hour));
    setHoursLogged(uniqueHours.size);
    const withProof = entries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
    setProofPct(entries.length > 0 ? Math.round((withProof / entries.length) * 100) : 0);

    // Team stats
    const total = membersRes.data?.length ?? 1;
    const done = teamCloseoutsRes.data?.length ?? 0;
    setTeamTotal(total);
    setTeamDone(done);

    setDismissCount(getDismissals(dateStr));
    setVisible(true);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial check + 60s polling
  useEffect(() => {
    if (!orgId || !userId) return;
    checkCloseout();
    const interval = setInterval(checkCloseout, 60_000);
    return () => clearInterval(interval);
  }, [orgId, userId, checkCloseout]);

  // Real-time: disappear when closeout is inserted
  useEffect(() => {
    if (!orgId || !userId) return;
    const channel = supabase
      .channel("closeout-enforcer")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "daily_closeouts",
        filter: `user_id=eq.${userId}`,
      }, () => { setHasCloseout(true); setVisible(false); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss handler — re-shows after 15 min
  const handleDismiss = useCallback(() => {
    const dateStr = getTodayMTY();
    const newCount = incrementDismissals(dateStr);
    setDismissCount(newCount);
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!hasCloseout) checkCloseout();
    }, 15 * 60 * 1000);
  }, [hasCloseout, checkCloseout]);

  // Cleanup timer
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  if (!visible || hasCloseout) return null;

  // Escalation level
  const level = dismissCount >= 2 ? "critical" : dismissCount >= 1 ? "warning" : "normal";

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-[80] w-80 corner-marks bg-background p-4",
        level === "critical" && "border border-red-500/50 animate-danger-pulse",
        level === "warning" && "border border-amber-500/50",
        level === "normal" && "border border-border"
      )}
    >
      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <FileCheck className={cn(
          "w-4 h-4",
          level === "critical" ? "text-red-400" : level === "warning" ? "text-amber-400" : "text-primary"
        )} />
        <p className={cn(
          "font-mono text-xs font-bold uppercase",
          level === "critical" ? "text-red-400" : level === "warning" ? "text-amber-400" : "text-muted-foreground"
        )}>
          {level === "critical" ? "CLOSEOUT PENDIENTE" : level === "warning" ? "Closeout pendiente" : "Es hora de cerrar tu día"}
        </p>
      </div>

      {/* Body */}
      <div className="space-y-1.5 mb-3">
        {level === "normal" && (
          <p className="font-mono text-[11px] text-muted-foreground">
            ¿Ya terminaste tu día? Haz tu closeout.
          </p>
        )}
        {level === "warning" && (
          <p className="font-mono text-[11px] text-amber-400">
            Aún no has hecho closeout. Llevas {minutesSince5} min desde las 5pm.
          </p>
        )}
        {level === "critical" && (
          <p className="font-mono text-[11px] text-red-400">
            {dismissCount} apariciones ignoradas. Haz tu closeout ahora.
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
          <span className="tabular-nums">{hoursLogged}h registradas</span>
          <span className="text-border">|</span>
          <span className="tabular-nums">{proofPct}% con prueba</span>
        </div>

        {/* Team progress */}
        {teamTotal > 1 && (
          <p className="font-mono text-[11px] text-muted-foreground">
            <span className="tabular-nums">{teamDone} de {teamTotal}</span> ya cerraron su día
          </p>
        )}
      </div>

      {/* CTA */}
      <Link
        href="/dashboard"
        className="bg-primary text-primary-foreground font-mono text-xs px-3 py-1.5 inline-block transition-colors hover:bg-primary/90"
      >
        Ir a Closeout →
      </Link>
    </div>
  );
}
