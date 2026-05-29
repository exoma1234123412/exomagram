"use client";

// ===============================================================
// UNLOGGED HOURS COUNTER -- PERSISTENT SHAME BAR
// ===============================================================
//
// A persistent, UNDISMISSABLE bar showing how many work hours
// today haven't been logged. Gets redder and more dramatic as
// unlogged hours pile up. Always visible during work hours.
//
// Escalation levels:
//   1 unlogged  -- subtle amber
//   2-3         -- medium red
//   4-5         -- critical pulsing red
//   6+          -- extreme: "DIA PRACTICAMENTE PERDIDO"

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { getTodayMTY } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNowMTY(): Date {
  try {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
    );
  } catch {
    const now = new Date();
    return new Date(now.getTime() - 6 * 60 * 60 * 1000);
  }
}

function getMTYHour(): number {
  try {
    const mtyTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Monterrey",
      hour: "numeric",
      hour12: false,
    }).format(new Date());
    const parsed = parseInt(mtyTime, 10);
    return isNaN(parsed) ? getNowMTY().getHours() : parsed % 24;
  } catch {
    return getNowMTY().getHours();
  }
}

function isMTYWeekday(): boolean {
  const now = getNowMTY();
  const day = now.getDay();
  return day !== 0 && day !== 6;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UnloggedHoursCounter() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [workStart, setWorkStart] = useState(7);
  const [workEnd, setWorkEnd] = useState(18);
  const [loggedHours, setLoggedHours] = useState<Set<number>>(new Set());
  const [currentHour, setCurrentHour] = useState(getMTYHour);
  const [ready, setReady] = useState(false);

  // ---- Load profile work schedule ----
  useEffect(() => {
    if (!userId) return;
    createClient()
      .from("profiles")
      .select("work_start_hour, work_end_hour")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setWorkStart(data.work_start_hour ?? 7);
          setWorkEnd(data.work_end_hour ?? 18);
        }
      });
  }, [userId]);

  // ---- Fetch logged hours ----
  const fetchLogged = useCallback(async () => {
    if (!orgId || !userId) return;
    const today = getTodayMTY();
    const { data } = await supabase
      .from("time_entries")
      .select("hour")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", today);

    const hours = new Set<number>();
    if (data) for (const e of data) hours.add(e.hour);
    setLoggedHours(hours);
    setCurrentHour(getMTYHour());
    setReady(true);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Initial load + 60s polling ----
  useEffect(() => {
    if (!orgId || !userId) return;
    fetchLogged();
    const interval = setInterval(fetchLogged, 60_000);
    return () => clearInterval(interval);
  }, [orgId, userId, fetchLogged]);

  // ---- Real-time subscription ----
  useEffect(() => {
    if (!orgId || !userId) return;
    const channel = supabase
      .channel("unlogged_hours_rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `user_id=eq.${userId}`,
        },
        () => fetchLogged(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, userId, fetchLogged]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Compute ----
  if (!ready || !orgId || !userId) return null;
  if (!isMTYWeekday()) return null;
  if (currentHour < workStart) return null;

  // Elapsed work hours (not counting current hour which is in progress)
  const elapsedEnd = Math.min(currentHour, workEnd);
  const elapsedCount = Math.max(0, elapsedEnd - workStart);
  if (elapsedCount === 0) return null;

  // Count unlogged among elapsed hours
  let unlogged = 0;
  for (let h = workStart; h < elapsedEnd; h++) {
    if (!loggedHours.has(h)) unlogged++;
  }

  if (unlogged === 0) return null;

  // ---- Escalation level ----
  const isExtreme = unlogged >= 6;
  const isCritical = unlogged >= 4;
  const isMedium = unlogged >= 2;

  const barClass = isExtreme
    ? "border-b-2 border-red-500 bg-red-950/20 animate-danger-pulse"
    : isCritical
      ? "border-b-2 border-red-500 bg-red-950/20 animate-danger-pulse"
      : isMedium
        ? "border-b border-red-500/30 bg-red-950/10"
        : "border-b border-amber-500/30 bg-amber-950/5";

  const textClass = isExtreme
    ? "text-red-400 font-bold"
    : isCritical
      ? "text-red-400 font-bold"
      : isMedium
        ? "text-red-400 font-semibold"
        : "text-amber-400 font-medium";

  // ---- Hour segment visualization ----
  const segments: { hour: number; status: "logged" | "current" | "unlogged" | "future" }[] = [];
  for (let h = workStart; h < workEnd; h++) {
    if (h === currentHour) {
      segments.push({ hour: h, status: "current" });
    } else if (h < elapsedEnd) {
      segments.push({ hour: h, status: loggedHours.has(h) ? "logged" : "unlogged" });
    } else {
      segments.push({ hour: h, status: "future" });
    }
  }

  return (
    <div className={cn("w-full", barClass)}>
      <div className="flex items-center gap-3 px-3 py-1.5">
        {/* Icon */}
        {isCritical ? (
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        ) : (
          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        )}

        {/* Message */}
        <span className={cn("font-mono text-[11px] shrink-0", textClass)}>
          <span className="font-mono tabular-nums font-bold">{unlogged}</span>
          {" hora"}{unlogged !== 1 ? "s" : ""} sin registrar hoy
        </span>

        {isExtreme && (
          <span className="font-mono text-[10px] font-bold text-red-400 tracking-[0.1em] uppercase animate-pulse shrink-0">
            DÍA PRÁCTICAMENTE PERDIDO
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Hour segments */}
        <div className="flex items-center gap-px shrink-0">
          {segments.map((seg) => (
            <div
              key={seg.hour}
              className={cn(
                "w-5 h-3",
                seg.status === "logged" && "bg-green-500",
                seg.status === "current" && "bg-primary/30 animate-pulse",
                seg.status === "unlogged" && "bg-red-500/60",
                seg.status === "future" && "bg-accent/20",
              )}
              title={`${seg.hour}:00 — ${seg.status === "logged" ? "registrada" : seg.status === "current" ? "en curso" : seg.status === "unlogged" ? "sin registrar" : "pendiente"}`}
            />
          ))}
        </div>

        {/* Ratio */}
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground shrink-0">
          {elapsedCount - unlogged}/{elapsedCount}
        </span>
      </div>
    </div>
  );
}
