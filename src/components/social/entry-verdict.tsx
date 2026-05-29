"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory, Profile } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Verdict {
  id: string;
  variant: "good" | "bad" | "late_start" | "backfill";
  message: string;
  emoji: string;
  createdAt: number;
}

interface RealtimeEntryPayload {
  id: string;
  user_id: string;
  org_id: string;
  date: string;
  hour: number;
  category: WorkCategory;
  title: string;
  description: string | null;
  proof_urls: string[] | null;
  is_late: boolean;
  minutes_late: number;
  logged_at: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERDICT_DISPLAY_MS = 3_000;
const MAX_VISIBLE = 2;
const BACKFILL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BACKFILL_THRESHOLD = 3; // 3+ entries in 5 min = suspicious

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntryVerdict() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Track recent entries per user for backfill detection
  const recentEntriesRef = useRef<Map<string, number[]>>(new Map());
  // Track whether user has any entries today (for first-entry-of-day detection)
  const userEntryCountRef = useRef<Map<string, number>>(new Map());
  // Profile cache to avoid repeated fetches
  const profileCacheRef = useRef<Map<string, string>>(new Map());

  // Dismiss a verdict
  const dismiss = useCallback((id: string) => {
    setVerdicts((prev) => prev.filter((v) => v.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  // Add a verdict with auto-dismiss
  const addVerdict = useCallback(
    (verdict: Verdict) => {
      setVerdicts((prev) => {
        const existing = prev.find((v) => v.id === verdict.id);
        if (existing) return prev;
        // Prepend new verdict, keep max visible
        return [verdict, ...prev].slice(0, MAX_VISIBLE + 1);
      });

      const timeout = setTimeout(() => {
        dismiss(verdict.id);
        timeoutsRef.current.delete(verdict.id);
      }, VERDICT_DISPLAY_MS);
      timeoutsRef.current.set(verdict.id, timeout);
    },
    [dismiss],
  );

  // Fetch profile name (with cache)
  const getProfileName = useCallback(
    async (uid: string): Promise<string> => {
      const cached = profileCacheRef.current.get(uid);
      if (cached) return cached;

      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", uid)
        .single();

      const name = (data as Profile | null)?.full_name ?? "Desconocido";
      profileCacheRef.current.set(uid, name);
      return name;
    },
    [supabase],
  );

  // Load existing entry counts for today on mount
  useEffect(() => {
    if (!orgId) return;

    async function loadTodayCounts() {
      const today = getTodayMTY();
      const { data } = await supabase
        .from("time_entries")
        .select("user_id")
        .eq("org_id", orgId!)
        .eq("date", today);

      if (data) {
        const counts = new Map<string, number>();
        for (const entry of data) {
          counts.set(entry.user_id, (counts.get(entry.user_id) ?? 0) + 1);
        }
        userEntryCountRef.current = counts;
      }
    }

    loadTodayCounts();
  }, [orgId, supabase]);

  // Process a new entry and generate a verdict
  const processEntry = useCallback(
    async (entry: RealtimeEntryPayload) => {
      // Only process entries for our org
      if (entry.org_id !== orgId) return;
      // Only process today's entries
      const today = getTodayMTY();
      if (entry.date !== today) return;

      const fullName = await getProfileName(entry.user_id);
      const firstName = fullName.split(" ")[0];
      const category = CATEGORIES[entry.category];
      const categoryLabel = category
        ? `${category.emoji} ${category.label}`
        : entry.category;

      const now = Date.now();

      // --- Backfill detection ---
      const userRecent = recentEntriesRef.current.get(entry.user_id) ?? [];
      userRecent.push(now);
      // Keep only entries within the window
      const windowStart = now - BACKFILL_WINDOW_MS;
      const filtered = userRecent.filter((t) => t >= windowStart);
      recentEntriesRef.current.set(entry.user_id, filtered);

      if (filtered.length >= BACKFILL_THRESHOLD) {
        addVerdict({
          id: `backfill-${entry.user_id}-${now}`,
          variant: "backfill",
          emoji: "\u{1F6A8}",
          message: `${firstName} \u2014 ${filtered.length} entradas en 5 min \u2014 \u00BFLlenado retroactivo?`,
          createdAt: now,
        });
        return; // Don't show other verdicts for this entry
      }

      // --- First entry of the day detection ---
      const prevCount = userEntryCountRef.current.get(entry.user_id) ?? 0;
      userEntryCountRef.current.set(entry.user_id, prevCount + 1);

      if (prevCount === 0) {
        // This is their first entry today
        const nowMTY = new Date(
          new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" }),
        );
        const currentHour = nowMTY.getHours();

        if (currentHour >= 11) {
          const timeStr = `${currentHour > 12 ? currentHour - 12 : currentHour}:${String(nowMTY.getMinutes()).padStart(2, "0")}${currentHour >= 12 ? "pm" : "am"}`;
          addVerdict({
            id: `late-start-${entry.user_id}-${today}`,
            variant: "late_start",
            emoji: "\u{1F634}",
            message: `${firstName} por fin apareci\u00F3 \u2014 primera entrada a las ${timeStr}`,
            createdAt: now,
          });
          return;
        }
      }

      // --- Good vs Bad entry ---
      const hasProof =
        entry.proof_urls !== null && entry.proof_urls.length > 0;
      const hasGoodDescription =
        (entry.description?.length ?? 0) >= 20;
      const isLate = entry.is_late;
      const minutesLate = entry.minutes_late ?? 0;

      if (hasProof && !isLate && hasGoodDescription) {
        // Good entry
        addVerdict({
          id: `good-${entry.id}`,
          variant: "good",
          emoji: "\u2705",
          message: `${firstName} \u2014 ${categoryLabel} \u2014 Con evidencia`,
          createdAt: now,
        });
      } else {
        // Bad entry - build reason
        const reasons: string[] = [];
        if (!hasProof) reasons.push("Sin evidencia");
        if (isLate) reasons.push(`Tard\u00EDa ${minutesLate} min`);
        if (!hasGoodDescription && !hasProof)
          reasons.push("Bajo detalle");

        addVerdict({
          id: `bad-${entry.id}`,
          variant: "bad",
          emoji: "\u26A0\uFE0F",
          message: `${firstName} \u2014 ${reasons.join(" / ")}`,
          createdAt: now,
        });
      }
    },
    [orgId, getProfileName, addVerdict],
  );

  // Subscribe to real-time INSERT events on time_entries
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`entry_verdict_${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const entry = payload.new as RealtimeEntryPayload;
          processEntry(entry);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, supabase, processEntry]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      for (const timeout of timeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
    };
  }, []);

  const visible = verdicts.slice(0, MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] space-y-1.5 pointer-events-none">
      {visible.map((v, idx) => (
        <div
          key={v.id}
          className={cn(
            "pointer-events-auto border bg-card/95 backdrop-blur-sm px-3 py-2 max-w-md animate-ticker-in",
            "font-mono text-xs select-none",
            v.variant === "good" && "border-green-500/40",
            v.variant === "bad" && "border-red-500/40",
            v.variant === "late_start" && "border-amber-500/40",
            v.variant === "backfill" && "border-red-500/60",
          )}
          style={{
            animationDelay: `${idx * 80}ms`,
            animationFillMode: "both",
          }}
        >
          <div className="flex items-center gap-2">
            {/* Left accent bar */}
            <div
              className={cn(
                "w-0.5 h-4 shrink-0",
                v.variant === "good" && "bg-green-500",
                v.variant === "bad" && "bg-red-500",
                v.variant === "late_start" && "bg-amber-500",
                v.variant === "backfill" && "bg-red-600",
              )}
            />

            {/* Emoji */}
            <span className="text-sm shrink-0">{v.emoji}</span>

            {/* Message */}
            <span
              className={cn(
                "text-[11px] leading-snug tracking-tight whitespace-nowrap overflow-hidden text-ellipsis",
                v.variant === "good" && "text-green-600 dark:text-green-400",
                v.variant === "bad" && "text-red-600 dark:text-red-400",
                v.variant === "late_start" && "text-amber-600 dark:text-amber-400",
                v.variant === "backfill" && "text-red-600 dark:text-red-300",
              )}
            >
              {v.message}
            </span>

            {/* Scanning dot for surveillance feel */}
            <span className="relative flex h-1.5 w-1.5 shrink-0 ml-1">
              <span
                className={cn(
                  "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                  v.variant === "good" && "bg-green-400",
                  v.variant === "bad" && "bg-red-400",
                  v.variant === "late_start" && "bg-amber-400",
                  v.variant === "backfill" && "bg-red-500",
                )}
              />
              <span
                className={cn(
                  "relative inline-flex rounded-full h-1.5 w-1.5",
                  v.variant === "good" && "bg-green-500",
                  v.variant === "bad" && "bg-red-500",
                  v.variant === "late_start" && "bg-amber-500",
                  v.variant === "backfill" && "bg-red-600",
                )}
              />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
