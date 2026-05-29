"use client";

// ===============================================================
// PROMISE ENFORCER — PENDING PROMISE ACCOUNTABILITY BANNER
// ===============================================================
//
// If the user made a promise today and it's 4pm+ MTY time without
// marking it delivered, shows a persistent banner per promise.
// Real-time: disappears instantly when promise is marked delivered.
// At 6pm+ escalates to red "VENCIDA" state.

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { getTodayMTY, cn } from "@/lib/utils";
import { Target } from "lucide-react";
import Link from "next/link";

interface PendingPromise {
  id: string;
  title: string;
}

function getMTYHour(): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Monterrey",
      hour: "numeric",
      hour12: false,
    }).format(new Date());
    const parsed = parseInt(h, 10);
    return isNaN(parsed) ? 16 : parsed % 24;
  } catch {
    return 16;
  }
}

function isMTYWeekday(): boolean {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  );
  const day = now.getDay();
  return day !== 0 && day !== 6;
}

export function PromiseEnforcer() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [promises, setPromises] = useState<PendingPromise[]>([]);
  const [hour, setHour] = useState(getMTYHour);
  const [marking, setMarking] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    if (!orgId || !userId) return;
    const today = getTodayMTY();
    const { data } = await supabase
      .from("daily_promises")
      .select("id, title")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", today)
      .eq("status", "pending");
    setPromises(data ?? []);
    setHour(getMTYHour());
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load + 60s polling for hour changes
  useEffect(() => {
    if (!orgId || !userId) return;
    fetchPending();
    const interval = setInterval(fetchPending, 60_000);
    return () => clearInterval(interval);
  }, [orgId, userId, fetchPending]);

  // Real-time: disappear instantly when delivered
  useEffect(() => {
    if (!orgId || !userId) return;
    const channel = supabase
      .channel("promise_enforcer_rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_promises",
          filter: `user_id=eq.${userId}`,
        },
        () => fetchPending(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, userId, fetchPending]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark promise as delivered
  const markDelivered = useCallback(async (id: string) => {
    setMarking(id);
    await supabase
      .from("daily_promises")
      .update({ status: "delivered" })
      .eq("id", id);
    setMarking(null);
    // Real-time will handle removal, but optimistic update too
    setPromises((prev) => prev.filter((p) => p.id !== id));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Guard: only show 4pm+ weekday with pending promises
  if (!orgId || !userId) return null;
  if (!isMTYWeekday()) return null;
  if (hour < 16) return null;
  if (promises.length === 0) return null;

  const isOverdue = hour >= 18;

  return (
    <>
      {promises.map((p) => (
        <div
          key={p.id}
          className={cn(
            "w-full",
            isOverdue
              ? "border-b border-red-500/50 bg-red-950/15"
              : "border-b border-amber-500/30 bg-amber-950/10",
          )}
        >
          <div className="flex items-center gap-3 px-3 py-1.5">
            <Target className={cn(
              "w-3.5 h-3.5 shrink-0",
              isOverdue ? "text-red-400" : "text-amber-400",
            )} />

            <span className={cn(
              "font-mono text-[11px] shrink-0",
              isOverdue ? "text-red-400" : "text-amber-400",
            )}>
              Tu promesa
            </span>

            <span className="font-mono text-[11px] italic text-foreground truncate min-w-0">
              &ldquo;{p.title}&rdquo;
            </span>

            <span className={cn(
              "font-mono text-[10px] shrink-0",
              isOverdue
                ? "text-red-400 font-bold tracking-[0.1em] uppercase"
                : "text-amber-400",
            )}>
              {isOverdue ? "VENCIDA" : "Vence hoy"}
            </span>

            <div className="flex-1" />

            <button
              onClick={() => markDelivered(p.id)}
              disabled={marking === p.id}
              className="bg-primary text-primary-foreground font-mono text-[10px] px-2 py-1 shrink-0 disabled:opacity-40 transition-opacity"
            >
              {marking === p.id ? "..." : "Marcar cumplida \u2713"}
            </button>

            <Link
              href="/promises"
              className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              Ver todas
            </Link>
          </div>
        </div>
      ))}
    </>
  );
}
