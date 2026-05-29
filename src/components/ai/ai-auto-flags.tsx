"use client";

import { useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import type {
  FlagType,
  TimeEntry,
  LiveStatus,
  DailyCloseout,
  Standup,
  Profile,
} from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const WORK_HOUR_START = 7;
const WORK_HOUR_END = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentHourMTY(): number {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  ).getHours();
}

function getCurrentTimeMTY(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  );
}

function formatHourDisplay(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

function getYesterdayMTY(): string {
  const now = new Date();
  const mtyNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Monterrey" })
  );
  mtyNow.setDate(mtyNow.getDate() - 1);
  // Format as YYYY-MM-DD
  const y = mtyNow.getFullYear();
  const m = String(mtyNow.getMonth() + 1).padStart(2, "0");
  const d = String(mtyNow.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Flag detection
// ---------------------------------------------------------------------------

interface MemberContext {
  userId: string;
  fullName: string;
  entries: TimeEntry[];
  liveStatus: LiveStatus | null;
  hasStandup: boolean;
  hasCloseoutYesterday: boolean;
}

interface PendingFlag {
  userId: string;
  flagType: FlagType;
  details: string;
}

function detectFlags(
  members: MemberContext[],
  currentHour: number,
  mtyNow: Date
): PendingFlag[] {
  const flags: PendingFlag[] = [];

  for (const m of members) {
    const name = m.fullName;
    const entryCount = m.entries.length;

    // 1. missing_hours — past 12pm and <3 entries
    if (currentHour >= 12 && entryCount < 3) {
      flags.push({
        userId: m.userId,
        flagType: "missing_hours",
        details: `${name} lleva solo ${entryCount} ${entryCount === 1 ? "entrada" : "entradas"} y ya son las ${formatHourDisplay(currentHour)}`,
      });
    }

    // 2. no_proof — 3+ entries with 0% proof
    if (entryCount >= 3) {
      const withProof = m.entries.filter(
        (e) => e.proof_urls && e.proof_urls.length > 0
      ).length;
      if (withProof === 0) {
        flags.push({
          userId: m.userId,
          flagType: "no_proof",
          details: `${name} tiene ${entryCount} entradas sin evidencia`,
        });
      }
    }

    // 3. suspicious_pattern — 3+ entries within 5 minutes
    if (entryCount >= 3) {
      const loggedAtTimes = m.entries
        .map((e) => new Date(e.logged_at).getTime())
        .sort((a, b) => a - b);

      // Find clusters: sliding window of entries within 5 minutes
      for (let i = 0; i < loggedAtTimes.length - 2; i++) {
        let clusterEnd = i;
        while (
          clusterEnd + 1 < loggedAtTimes.length &&
          loggedAtTimes[clusterEnd + 1] - loggedAtTimes[i] < 5 * 60 * 1000
        ) {
          clusterEnd++;
        }
        const clusterSize = clusterEnd - i + 1;
        if (clusterSize >= 3) {
          const spanMs = loggedAtTimes[clusterEnd] - loggedAtTimes[i];
          const spanMinutes = Math.max(1, Math.round(spanMs / 60000));
          flags.push({
            userId: m.userId,
            flagType: "suspicious_pattern",
            details: `${name} registró ${clusterSize} entradas en ${spanMinutes} minutos — posible backfilling`,
          });
          break; // One flag per member for this type
        }
      }
    }

    // 4. late_entries — 3+ late entries today
    const lateCount = m.entries.filter((e) => e.is_late).length;
    if (lateCount >= 3) {
      flags.push({
        userId: m.userId,
        flagType: "late_entries",
        details: `${name} lleva ${lateCount} entradas tardías hoy`,
      });
    }

    // 5. idle_long — live_status online/active but no entries for 3+ hours
    if (m.liveStatus) {
      const statusIsActive =
        m.liveStatus.status === "online" ||
        m.liveStatus.status === "deep_work" ||
        m.liveStatus.status === "in_meeting";

      if (statusIsActive && entryCount > 0) {
        // Find the most recent entry's logged_at
        const latestEntry = m.entries.reduce((latest, e) =>
          e.logged_at > latest.logged_at ? e : latest
        );
        const hoursSinceLastEntry =
          (mtyNow.getTime() - new Date(latestEntry.logged_at).getTime()) /
          (1000 * 60 * 60);

        if (hoursSinceLastEntry >= 3) {
          flags.push({
            userId: m.userId,
            flagType: "idle_long",
            details: `${name} aparece online pero no registra hace ${Math.floor(hoursSinceLastEntry)} horas`,
          });
        }
      } else if (statusIsActive && entryCount === 0 && currentHour >= 10) {
        // Active but zero entries
        const heartbeatTime = new Date(m.liveStatus.last_heartbeat).getTime();
        const hoursSinceHeartbeat =
          (mtyNow.getTime() - heartbeatTime) / (1000 * 60 * 60);
        if (hoursSinceHeartbeat < 1) {
          // Heartbeat is recent, so they're truly online
          const hoursSinceWorkStart = currentHour - WORK_HOUR_START;
          if (hoursSinceWorkStart >= 3) {
            flags.push({
              userId: m.userId,
              flagType: "idle_long",
              details: `${name} aparece online pero no registra hace ${hoursSinceWorkStart} horas`,
            });
          }
        }
      }
    }

    // 6. low_detail — average description <10 words today
    if (entryCount >= 3) {
      const descriptions = m.entries.map((e) => e.description ?? "");
      const totalWords = descriptions.reduce(
        (sum, d) => sum + d.trim().split(/\s+/).filter(Boolean).length,
        0
      );
      const avgWords = totalWords / entryCount;
      if (avgWords < 10) {
        flags.push({
          userId: m.userId,
          flagType: "low_detail",
          details: `${name} promedia ${Math.round(avgWords)} palabras por descripción — detalle insuficiente`,
        });
      }
    }

    // 7. no_standup — past 10am and no standup
    if (currentHour >= 10 && !m.hasStandup) {
      flags.push({
        userId: m.userId,
        flagType: "no_standup",
        details: `${name} no hizo standup`,
      });
    }

    // 8. no_closeout — past 7pm and no closeout yesterday
    if (currentHour >= 19 && !m.hasCloseoutYesterday) {
      flags.push({
        userId: m.userId,
        flagType: "no_closeout",
        details: `${name} no hizo closeout ayer`,
      });
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Component (renders null — invisible background worker)
// ---------------------------------------------------------------------------

export function AIAutoFlags() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();
  const runningRef = useRef(false);

  const runAnalysis = useCallback(async () => {
    if (!orgId || !userId) return;
    if (runningRef.current) return; // Prevent overlapping runs

    const currentHour = getCurrentHourMTY();

    // Only run during work hours
    if (currentHour < WORK_HOUR_START || currentHour > WORK_HOUR_END) return;

    runningRef.current = true;

    try {
      const today = getTodayMTY();
      const yesterday = getYesterdayMTY();

      // Fetch all data in parallel
      const [
        { data: membersData },
        { data: entries },
        { data: liveStatuses },
        { data: standups },
        { data: closeoutsYesterday },
        { data: existingFlags },
      ] = await Promise.all([
        supabase
          .from("org_members")
          .select("user_id, profiles(full_name)")
          .eq("org_id", orgId),
        supabase
          .from("time_entries")
          .select("*")
          .eq("org_id", orgId)
          .eq("date", today),
        supabase
          .from("live_status")
          .select("*")
          .eq("org_id", orgId),
        supabase
          .from("standups")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("date", today),
        supabase
          .from("daily_closeouts")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("date", yesterday),
        supabase
          .from("accountability_flags")
          .select("user_id, flag_type")
          .eq("org_id", orgId)
          .eq("date", today),
      ]);

      if (!membersData || membersData.length === 0) return;

      // Build dedup set from existing flags
      const existingFlagSet = new Set(
        (existingFlags ?? []).map(
          (f: { user_id: string; flag_type: string }) =>
            `${f.user_id}:${f.flag_type}`
        )
      );

      // Build lookup maps
      const standupUserIds = new Set(
        (standups ?? []).map((s: { user_id: string }) => s.user_id)
      );
      const closeoutUserIds = new Set(
        (closeoutsYesterday ?? []).map((c: { user_id: string }) => c.user_id)
      );
      const liveStatusMap = new Map<string, LiveStatus>();
      for (const ls of (liveStatuses ?? []) as LiveStatus[]) {
        liveStatusMap.set(ls.user_id, ls);
      }

      const mtyNow = getCurrentTimeMTY();
      const currentHourNow = getCurrentHourMTY();

      // Build member contexts
      const memberContexts: MemberContext[] = membersData.map((m) => {
        const profile = m.profiles as unknown as Profile;
        const fullName = profile?.full_name ?? "Desconocido";
        const userEntries = ((entries ?? []) as TimeEntry[]).filter(
          (e) => e.user_id === m.user_id
        );

        return {
          userId: m.user_id,
          fullName,
          entries: userEntries,
          liveStatus: liveStatusMap.get(m.user_id) ?? null,
          hasStandup: standupUserIds.has(m.user_id),
          hasCloseoutYesterday: closeoutUserIds.has(m.user_id),
        };
      });

      // Detect flags
      const pendingFlags = detectFlags(memberContexts, currentHourNow, mtyNow);

      // Insert flags (skip duplicates)
      for (const flag of pendingFlags) {
        const flagKey = `${flag.userId}:${flag.flagType}`;
        if (existingFlagSet.has(flagKey)) continue;

        // Insert flag
        const { error: flagError } = await supabase
          .from("accountability_flags")
          .insert({
            user_id: flag.userId,
            org_id: orgId,
            flag_type: flag.flagType,
            date: today,
            details: flag.details,
          });

        if (flagError) continue;

        existingFlagSet.add(flagKey); // Prevent duplicates within same run

        // Insert notification for the user
        await supabase.from("notifications").insert({
          user_id: flag.userId,
          org_id: orgId,
          type: "flag_raised" as const,
          title: "Accountability flag",
          body: flag.details,
          link: "/flags",
          read: false,
        });
      }
    } catch {
      // Silent fail — background component should never break the app
    } finally {
      runningRef.current = false;
    }
  }, [orgId, userId, supabase]);

  // Initial run + interval
  useEffect(() => {
    if (!orgId || !userId) return;

    // Delay initial run to not block first render
    const initialTimeout = setTimeout(runAnalysis, 5000);
    const interval = setInterval(runAnalysis, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [orgId, userId, runAnalysis]);

  // Real-time subscription: re-analyze when new entries come in
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`ai-auto-flags-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          // Small delay so the entry is fully committed
          setTimeout(runAnalysis, 2000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, supabase, runAnalysis]);

  // Invisible — renders nothing
  return null;
}
