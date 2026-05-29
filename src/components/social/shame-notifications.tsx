"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY } from "@/lib/utils";
import type { TimeEntry, Profile, ActivityStreak } from "@/lib/types/database";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EntryWithProfile = TimeEntry & { profiles: Profile };

interface ShameNotification {
  id: string;
  message: string;
  variant: "shame" | "warning";
  createdAt: number;
}

interface MemberData {
  userId: string;
  firstName: string;
  totalEntries: number;
  entriesWithProof: number;
  lateEntries: number;
  maxMinutesLate: number;
  latestLoggedAt: string | null;
  streak: number;
  lastActiveDate: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const NOTIFICATION_DISPLAY_MS = 15_000; // 15 seconds
const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const MAX_VISIBLE = 3;
const STORAGE_KEY = "shame-notifications-seen";

// ---------------------------------------------------------------------------
// LocalStorage dedup helpers
// ---------------------------------------------------------------------------

function getSeenMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

function markSeen(id: string): void {
  const map = getSeenMap();
  map[id] = Date.now();
  // Prune old entries
  const cutoff = Date.now() - DEDUP_WINDOW_MS * 2;
  for (const key of Object.keys(map)) {
    if (map[key] < cutoff) delete map[key];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function wasRecentlySeen(id: string): boolean {
  const map = getSeenMap();
  const lastSeen = map[id];
  if (!lastSeen) return false;
  return Date.now() - lastSeen < DEDUP_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Shame condition generators
// ---------------------------------------------------------------------------

function generateShameConditions(
  members: MemberData[],
  today: string,
): ShameNotification[] {
  const now = new Date();
  const currentHourMTY = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Monterrey" })
  ).getHours();
  const notifications: ShameNotification[] = [];

  for (const m of members) {
    // 1. Zero entries by 11am
    if (m.totalEntries === 0 && currentHourMTY >= 11) {
      const id = `zero-entries-${m.userId}-${today}`;
      if (!wasRecentlySeen(id)) {
        notifications.push({
          id,
          message: `<b>${m.firstName}</b> no ha registrado nada y ya son las ${currentHourMTY > 12 ? currentHourMTY - 12 : currentHourMTY}${currentHourMTY >= 12 ? "pm" : "am"}`,
          variant: "shame",
          createdAt: Date.now(),
        });
      }
    }

    // 2. Last entry was 3+ hours ago
    if (m.latestLoggedAt && m.totalEntries > 0) {
      const lastLog = new Date(m.latestLoggedAt);
      const diffHours = (now.getTime() - lastLog.getTime()) / (1000 * 60 * 60);
      if (diffHours >= 3 && currentHourMTY < 19) {
        const id = `disappeared-${m.userId}-${today}-${Math.floor(diffHours)}`;
        if (!wasRecentlySeen(id)) {
          notifications.push({
            id,
            message: `<b>${m.firstName}</b> desaparecio hace ${Math.floor(diffHours)} horas`,
            variant: "shame",
            createdAt: Date.now(),
          });
        }
      }
    }

    // 3. Logged without proof (again)
    if (m.totalEntries > 0 && m.entriesWithProof === 0) {
      const id = `no-proof-${m.userId}-${today}`;
      if (!wasRecentlySeen(id)) {
        notifications.push({
          id,
          message: `<b>${m.firstName}</b> registro sin evidencia — otra vez`,
          variant: "warning",
          createdAt: Date.now(),
        });
      }
    }

    // 4. Late entries
    if (m.lateEntries > 0 && m.maxMinutesLate > 0) {
      const id = `late-${m.userId}-${today}-${m.lateEntries}`;
      if (!wasRecentlySeen(id)) {
        notifications.push({
          id,
          message: `<b>${m.firstName}</b> registro tarde — ${m.maxMinutesLate} minutos de retraso`,
          variant: "warning",
          createdAt: Date.now(),
        });
      }
    }

    // 5. Broke a streak
    if (m.streak > 3 && m.lastActiveDate && m.lastActiveDate < today && m.totalEntries === 0) {
      const id = `streak-broken-${m.userId}-${today}`;
      if (!wasRecentlySeen(id)) {
        notifications.push({
          id,
          message: `<b>${m.firstName}</b> rompio su racha de ${m.streak} dias`,
          variant: "shame",
          createdAt: Date.now(),
        });
      }
    }
  }

  // 6. Team average below 4 hours
  const membersWithEntries = members.filter((m) => m.totalEntries > 0);
  const totalMembers = members.length;
  if (totalMembers > 0) {
    const totalHours = members.reduce((sum, m) => sum + m.totalEntries, 0);
    const avg = totalHours / totalMembers;
    if (avg < 4 && currentHourMTY >= 14) {
      // Sort by hours ascending to find the worst performers
      const sorted = [...members].sort((a, b) => a.totalEntries - b.totalEntries);
      const worst = sorted.slice(0, 2).map((m) => m.firstName);
      const id = `team-avg-low-${today}-${Math.floor(avg)}`;
      if (!wasRecentlySeen(id)) {
        notifications.push({
          id,
          message: `El equipo lleva solo ${avg.toFixed(1)} hrs promedio. Los peores: <b>${worst.join("</b>, <b>")}</b>`,
          variant: "shame",
          createdAt: Date.now(),
        });
      }
    }
  }

  return notifications;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShameNotifications() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();
  const [notifications, setNotifications] = useState<ShameNotification[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Remove a notification by id
  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  // Add notifications with auto-dismiss
  const addNotifications = useCallback(
    (newOnes: ShameNotification[]) => {
      if (newOnes.length === 0) return;

      setNotifications((prev) => {
        // Merge new ones, avoid duplicates
        const existingIds = new Set(prev.map((n) => n.id));
        const toAdd = newOnes.filter((n) => !existingIds.has(n.id));
        if (toAdd.length === 0) return prev;

        // Mark all as seen for dedup
        for (const n of toAdd) {
          markSeen(n.id);
        }

        const merged = [...toAdd, ...prev];
        return merged;
      });

      // Set auto-dismiss timeouts for new notifications
      for (const n of newOnes) {
        if (!timeoutsRef.current.has(n.id)) {
          const timeout = setTimeout(() => {
            dismiss(n.id);
            timeoutsRef.current.delete(n.id);
          }, NOTIFICATION_DISPLAY_MS);
          timeoutsRef.current.set(n.id, timeout);
        }
      }
    },
    [dismiss],
  );

  // Main data fetch and shame generation
  const checkForShame = useCallback(async () => {
    if (!orgId || !userId) return;

    const today = getTodayMTY();

    // Fetch all org members
    const { data: membersData } = await supabase
      .from("org_members")
      .select("user_id, profiles(full_name)")
      .eq("org_id", orgId);

    if (!membersData || membersData.length === 0) return;

    // Fetch today's entries for everyone
    const { data: entries } = await supabase
      .from("time_entries")
      .select("user_id, proof_urls, is_late, minutes_late, logged_at")
      .eq("org_id", orgId)
      .eq("date", today);

    // Fetch streaks
    const { data: streaks } = await supabase
      .from("activity_streaks")
      .select("user_id, current_streak, last_active_date")
      .eq("org_id", orgId);

    // Build member data map
    const streakMap = new Map<string, { current_streak: number; last_active_date: string | null }>();
    for (const s of streaks ?? []) {
      streakMap.set(s.user_id, {
        current_streak: s.current_streak,
        last_active_date: s.last_active_date,
      });
    }

    const memberDataList: MemberData[] = membersData.map((m) => {
      const profile = m.profiles as unknown as Profile;
      const fullName = profile?.full_name ?? "Desconocido";
      const firstName = fullName.split(" ")[0];
      const userEntries = (entries ?? []).filter((e) => e.user_id === m.user_id);
      const streak = streakMap.get(m.user_id);

      return {
        userId: m.user_id,
        firstName,
        totalEntries: userEntries.length,
        entriesWithProof: userEntries.filter(
          (e) => e.proof_urls && e.proof_urls.length > 0,
        ).length,
        lateEntries: userEntries.filter((e) => e.is_late).length,
        maxMinutesLate: Math.max(
          0,
          ...userEntries.map((e) => e.minutes_late ?? 0),
        ),
        latestLoggedAt: userEntries.length > 0
          ? userEntries.reduce((latest, e) =>
              e.logged_at > latest ? e.logged_at : latest,
            userEntries[0].logged_at)
          : null,
        streak: streak?.current_streak ?? 0,
        lastActiveDate: streak?.last_active_date ?? null,
      };
    });

    // Don't generate shame about yourself? Actually the spec doesn't exclude anyone.
    const shameNotifications = generateShameConditions(memberDataList, today);
    addNotifications(shameNotifications);
  }, [orgId, userId, supabase, addNotifications]);

  // Initial check + interval
  useEffect(() => {
    if (!orgId || !userId) return;

    // Small delay on mount to not block initial render
    const initialTimeout = setTimeout(checkForShame, 3000);
    const interval = setInterval(checkForShame, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [orgId, userId, checkForShame]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      for (const timeout of timeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
    };
  }, []);

  // Only show the most recent MAX_VISIBLE
  const visible = notifications.slice(0, MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[55] space-y-2 pointer-events-none">
      {visible.map((n, idx) => (
        <div
          key={n.id}
          className={cn(
            "pointer-events-auto border bg-card p-3 max-w-sm animate-ticker-in",
            n.variant === "shame"
              ? "border-red-500/30"
              : "border-amber-500/30",
          )}
          style={{
            animationDelay: `${idx * 100}ms`,
            animationFillMode: "both",
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className={cn(
                "size-3.5 mt-0.5 shrink-0",
                n.variant === "shame"
                  ? "text-red-500"
                  : "text-amber-500",
              )}
            />
            <span
              className="font-mono text-[11px] leading-snug text-foreground flex-1"
              dangerouslySetInnerHTML={{ __html: n.message }}
            />
            <button
              onClick={() => dismiss(n.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
