"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { getTodayMTY } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface DashboardData {
  entries: any[];
  standups: any[];
  closeouts: any[];
  promises: any[];
  members: any[];
  streaks: any[];
  trustScores: any[];
  liveStatus: any[];
  healthChecks: any[];
  feedItems: any[];
  orgSettings: any | null;
  contracts: any[];
  loading: boolean;
  refetch: () => void;
}

const DEFAULT: DashboardData = {
  entries: [],
  standups: [],
  closeouts: [],
  promises: [],
  members: [],
  streaks: [],
  trustScores: [],
  liveStatus: [],
  healthChecks: [],
  feedItems: [],
  orgSettings: null,
  contracts: [],
  loading: true,
  refetch: () => {},
};

// ── Context ────────────────────────────────────────────────────────────────

const DashboardDataContext = createContext<DashboardData>(DEFAULT);

// ── Provider ───────────────────────────────────────────────────────────────

interface Props {
  orgId: string;
  userId: string;
  children: ReactNode;
}

export function DashboardDataProvider({ orgId, userId, children }: Props) {
  const supabase = createClient();
  const [data, setData] = useState<Omit<DashboardData, "loading" | "refetch">>({
    entries: [],
    standups: [],
    closeouts: [],
    promises: [],
    members: [],
    streaks: [],
    trustScores: [],
    liveStatus: [],
    healthChecks: [],
    feedItems: [],
    orgSettings: null,
    contracts: [],
  });
  const [loading, setLoading] = useState(true);

  // Use a ref to allow the realtime callback to always call the latest fetch
  const fetchRef = useRef<() => Promise<void>>(undefined);

  const fetch = useCallback(async () => {
    const today = getTodayMTY();

    // Compute the Monday of the current ISO week (used for weekly_contracts)
    const nowMTY = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
    );
    const dow = nowMTY.getDay(); // 0=Sun, 1=Mon … 6=Sat
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    const weekStart = new Date(nowMTY);
    weekStart.setDate(nowMTY.getDate() - daysFromMonday);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    const [
      entriesRes,
      standupsRes,
      closeoutsRes,
      promisesRes,
      membersRes,
      streaksRes,
      trustRes,
      liveRes,
      healthRes,
      feedRes,
      settingsRes,
      contractsRes,
    ] = await Promise.all([
      supabase
        .from("time_entries")
        .select(
          "id, user_id, hour, category, title, is_late, proof_urls, mood, energy, verification_status, logged_at"
        )
        .eq("org_id", orgId)
        .eq("date", today)
        .is("deleted_at", null),

      supabase
        .from("standups")
        .select("user_id, submitted_at")
        .eq("org_id", orgId)
        .eq("date", today),

      supabase
        .from("daily_closeouts")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("date", today),

      supabase
        .from("daily_promises")
        .select("user_id, title, status")
        .eq("org_id", orgId)
        .eq("date", today),

      supabase
        .from("org_members")
        .select("user_id, role, profiles(full_name)")
        .eq("org_id", orgId),

      supabase
        .from("activity_streaks")
        .select(
          "user_id, current_streak, longest_streak, last_active_date, total_days_logged"
        )
        .eq("org_id", orgId),

      supabase
        .from("trust_score_history")
        .select("user_id, score, date")
        .eq("org_id", orgId)
        .order("date", { ascending: false })
        .limit(20),

      supabase
        .from("live_status")
        .select("user_id, status, current_task, last_heartbeat")
        .eq("org_id", orgId),

      supabase
        .from("daily_health")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("date", today),

      supabase
        .from("public_feed")
        .select("id, type, title, body, emoji, urgency, target_user_id, created_at")
        .eq("org_id", orgId)
        .gte("created_at", `${today}T00:00:00`)
        .eq("is_ai_generated", true)
        .order("created_at", { ascending: false })
        .limit(20),

      supabase
        .from("org_settings")
        .select("*")
        .eq("org_id", orgId)
        .limit(1)
        .maybeSingle(),

      supabase
        .from("weekly_contracts")
        .select("user_id, status")
        .eq("org_id", orgId)
        .gte("week_start", weekStartStr),
    ]);

    setData({
      entries: entriesRes.data ?? [],
      standups: standupsRes.data ?? [],
      closeouts: closeoutsRes.data ?? [],
      promises: promisesRes.data ?? [],
      members: membersRes.data ?? [],
      streaks: streaksRes.data ?? [],
      trustScores: trustRes.data ?? [],
      liveStatus: liveRes.data ?? [],
      healthChecks: healthRes.data ?? [],
      feedItems: feedRes.data ?? [],
      orgSettings: settingsRes.data ?? null,
      contracts: contractsRes.data ?? [],
    });
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the ref current so realtime callbacks don't go stale
  fetchRef.current = fetch;

  // Initial load + 60-second polling (replaces 5 separate timers)
  useEffect(() => {
    fetch();
    const interval = setInterval(() => fetchRef.current?.(), 60_000);
    return () => clearInterval(interval);
  }, [fetch]);

  // ONE realtime subscription on time_entries for this org+today
  useEffect(() => {
    const today = getTodayMTY();
    const channel = supabase
      .channel(`dashboard-entries-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          fetchRef.current?.();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: DashboardData = {
    ...data,
    loading,
    refetch: fetch,
  };

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useDashboardData(): DashboardData {
  return useContext(DashboardDataContext);
}
