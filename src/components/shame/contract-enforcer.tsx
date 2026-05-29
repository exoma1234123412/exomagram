"use client";

// CONTRACT ENFORCER — Monday-through-Wednesday banner that shames
// users who haven't created their weekly contract (Pacto Semanal).
// Escalates from amber (Mon) → red (Tue) → pulsing red (Wed).
// Shows how many teammates already submitted theirs.

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { FileSignature, Users } from "lucide-react";
import Link from "next/link";
import { startOfWeek, format } from "date-fns";

function getMTYNow(): Date {
  try {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
    );
  } catch {
    const now = new Date();
    return new Date(now.getTime() - 6 * 60 * 60 * 1000);
  }
}

function getWeekStartStr(d: Date = getMTYNow()): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

type Urgency = "monday" | "tuesday" | "wednesday";

const URGENCY_STYLES: Record<Urgency, string> = {
  monday: "border-b border-amber-500/30 bg-amber-950/10",
  tuesday: "border-b border-red-500/30 bg-red-950/10",
  wednesday: "border-b-2 border-red-500 bg-red-950/20 animate-pulse",
};

const URGENCY_MESSAGES: Record<Urgency, string> = {
  monday: "Es lunes. Crea tu pacto semanal.",
  tuesday: "Martes y aún sin pacto semanal.",
  wednesday: "MIÉRCOLES — última oportunidad para tu pacto semanal.",
};

export function ContractEnforcer() {
  const { orgId, userId } = useOrg();
  const [visible, setVisible] = useState(false);
  const [urgency, setUrgency] = useState<Urgency>("monday");
  const [teamCount, setTeamCount] = useState({ done: 0, total: 0 });

  const check = useCallback(async () => {
    if (!orgId || !userId) return;

    const now = getMTYNow();
    const day = now.getDay(); // 0=Sun,1=Mon,...
    if (day < 1 || day > 3) { setVisible(false); return; }

    const dayMap: Record<number, Urgency> = { 1: "monday", 2: "tuesday", 3: "wednesday" };
    setUrgency(dayMap[day]);

    const weekStart = getWeekStartStr(now);
    const supabase = createClient();

    // Check if current user has a contract this week
    const { data: mine } = await supabase
      .from("weekly_contracts")
      .select("id")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("week_start", weekStart)
      .limit(1);

    if (mine && mine.length > 0) { setVisible(false); return; }

    // Count teammates who have contracts
    const [members, contracts] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id", { count: "exact", head: true })
        .eq("org_id", orgId),
      supabase
        .from("weekly_contracts")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("week_start", weekStart),
    ]);

    const total = (members.count ?? 1) - 1; // exclude self
    const done = (contracts.data ?? []).filter((c) => c.user_id !== userId).length;
    setTeamCount({ done, total: Math.max(total, 0) });
    setVisible(true);
  }, [orgId, userId]);

  // Initial check + real-time subscription
  useEffect(() => {
    check();
    if (!orgId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("contract-enforcer")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "weekly_contracts", filter: `org_id=eq.${orgId}` },
        () => check()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, userId, check]);

  if (!visible) return null;

  return (
    <div className={cn("px-4 py-2 flex items-center justify-between gap-3", URGENCY_STYLES[urgency])}>
      <div className="flex items-center gap-2 min-w-0">
        <FileSignature className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono text-[11px] text-foreground truncate">
          {URGENCY_MESSAGES[urgency]}
        </span>
        {teamCount.total > 0 && (
          <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <Users className="w-3 h-3" />
            <span className="tabular-nums font-bold">{teamCount.done}</span>
            <span>de</span>
            <span className="tabular-nums font-bold">{teamCount.total}</span>
            <span>ya tienen su pacto</span>
          </span>
        )}
      </div>
      <Link
        href="/contract"
        className="shrink-0 text-primary font-mono text-[10px] underline hover:text-primary/80 transition-colors"
      >
        Crear Pacto &rarr;
      </Link>
    </div>
  );
}
