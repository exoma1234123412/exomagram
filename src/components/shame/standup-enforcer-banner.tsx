"use client";

// ===============================================================
// STANDUP ENFORCER BANNER -- PERSISTENT SHAME
// ===============================================================
//
// Until the user submits their daily standup, a full-width banner
// persists on EVERY page. Never blocks access -- just shame.
//
// Escalation:
//   0-30 min late:  amber -- gentle reminder
//   30-60 min late: red   -- getting serious
//   60+ min late:   pulsing red -- full shame with teammate count
//
// Disappears instantly via real-time subscription when standup submitted.

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { getTodayMTY } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { MessageSquare, Clock } from "lucide-react";
import Link from "next/link";

type Phase = "hidden" | "amber" | "red" | "critical";

function getNowMTY(): Date {
  try {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" }));
  } catch {
    const now = new Date();
    return new Date(now.getTime() - 6 * 60 * 60 * 1000);
  }
}

function isMTYWeekday(): boolean {
  const day = getNowMTY().getDay();
  return day !== 0 && day !== 6;
}

export function StandupEnforcerBanner() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [hasStandup, setHasStandup] = useState<boolean | null>(null);
  const [workStartHour, setWorkStartHour] = useState(7);
  const [minutesLate, setMinutesLate] = useState(0);
  const [phase, setPhase] = useState<Phase>("hidden");
  const [teamDone, setTeamDone] = useState(0);
  const [teamTotal, setTeamTotal] = useState(0);

  // -- Load profile work_start_hour --
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("work_start_hour")
        .eq("id", userId)
        .single();
      if (data?.work_start_hour != null) setWorkStartHour(data.work_start_hour);
    })();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Check user standup --
  const checkStandup = useCallback(async () => {
    if (!orgId || !userId) return;
    const today = getTodayMTY();
    const { data } = await supabase
      .from("standups")
      .select("id")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", today)
      .limit(1);
    setHasStandup((data ?? []).length > 0);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Count team standups --
  const countTeam = useCallback(async () => {
    if (!orgId) return;
    const today = getTodayMTY();

    const [membersRes, standupsRes] = await Promise.all([
      supabase.from("org_members").select("user_id").eq("org_id", orgId),
      supabase.from("standups").select("user_id").eq("org_id", orgId).eq("date", today),
    ]);

    setTeamTotal((membersRes.data ?? []).length);
    setTeamDone((standupsRes.data ?? []).length);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Initial load --
  useEffect(() => {
    if (!orgId || !userId) return;
    checkStandup();
    countTeam();
  }, [orgId, userId, checkStandup, countTeam]);

  // -- Real-time: standups table --
  useEffect(() => {
    if (!orgId || !userId) return;

    const channel = supabase
      .channel("standup_enforcer_rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "standups",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const newRow = payload.new as { user_id: string };
          if (newRow.user_id === userId) setHasStandup(true);
          countTeam();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, userId, countTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Tick: compute minutes late + phase --
  useEffect(() => {
    function tick() {
      if (!isMTYWeekday()) { setPhase("hidden"); return; }

      const now = getNowMTY();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Before work_start_hour: hidden
      if (currentHour < workStartHour) { setPhase("hidden"); return; }

      const late = (currentHour - workStartHour) * 60 + currentMinute;
      setMinutesLate(late);

      if (late <= 30) setPhase("amber");
      else if (late <= 60) setPhase("red");
      else setPhase("critical");
    }

    tick();
    const id = setInterval(tick, 30_000); // update every 30s
    return () => clearInterval(id);
  }, [workStartHour]);

  // -- Guard: don't render if loading, done, weekend, or before work --
  if (hasStandup === null || hasStandup || !orgId || !userId) return null;
  if (phase === "hidden") return null;

  // -- Phase config --
  const config = {
    amber: {
      border: "border-amber-500/30",
      bg: "bg-amber-950/10",
      text: "text-amber-300/80",
      label: "text-amber-400",
      icon: "text-amber-400",
      animation: "",
    },
    red: {
      border: "border-red-500/50",
      bg: "bg-red-950/15",
      text: "text-red-400/80",
      label: "text-red-400",
      icon: "text-red-400",
      animation: "",
    },
    critical: {
      border: "border-red-500/50",
      bg: "bg-red-950/15",
      text: "text-red-400",
      label: "text-red-400",
      icon: "text-red-500",
      animation: "animate-danger-pulse",
    },
  }[phase]!;

  // -- Message per phase --
  let message: string;
  if (phase === "amber") {
    message = "Aun no has hecho tu standup";
  } else if (phase === "red") {
    message = `Llevas ${minutesLate} minutos sin standup`;
  } else {
    message = `STANDUP PENDIENTE -- ${minutesLate} minutos tarde. El equipo te espera.`;
  }

  const teamLabel = teamTotal > 0 ? `${teamDone} de ${teamTotal} ya hicieron standup` : null;

  return (
    <div
      className={cn(
        "w-full border-b px-4 py-2",
        config.border,
        config.bg,
        config.animation
      )}
    >
      <div className="flex items-center gap-3">
        <MessageSquare className={cn("w-4 h-4 shrink-0", config.icon)} />

        <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
          <span className={cn("font-mono text-[11px]", config.text)}>
            {message}
          </span>

          {phase === "critical" && (
            <span className={cn("font-mono tabular-nums font-bold text-[11px]", config.label)}>
              <Clock className="w-3 h-3 inline mr-1" />
              {minutesLate}m
            </span>
          )}

          {teamLabel && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {teamLabel}
            </span>
          )}
        </div>

        <Link
          href="/standup"
          className="shrink-0 font-mono text-[10px] text-primary underline hover:text-primary/80 transition-colors"
        >
          Ir a Standup &rarr;
        </Link>
      </div>
    </div>
  );
}
