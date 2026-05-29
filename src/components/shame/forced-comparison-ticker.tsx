"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TimeEntry } from "@/lib/types/database";
import { cn, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeammatEntry {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  title: string;
  category: string;
}

type EntryWithProfile = TimeEntry & { profiles: Profile };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 60_000;
const TICKER_DURATION_S = 30; // full scroll cycle

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentHourMTY(): number {
  const now = new Date();
  const mtyTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Monterrey",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return parseInt(mtyTime, 10);
}

function getTodayMTY(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
  }).format(new Date());
}

function formatHourLabel(h: number): string {
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:00 ${suffix}`;
}

function getFirstName(fullName: string | null): string {
  if (!fullName) return "Alguien";
  return fullName.split(" ")[0];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ForcedComparisonTicker() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [teammateEntries, setTeammateEntries] = useState<TeammatEntry[]>([]);
  const [userEntry, setUserEntry] = useState<string | null>(null); // null = not loaded, "" = nothing logged
  const [loading, setLoading] = useState(true);
  const [currentHour, setCurrentHour] = useState(getCurrentHourMTY);
  const tickerRef = useRef<HTMLDivElement>(null);

  // ---- Fetch data ----
  const fetchComparisons = useCallback(async () => {
    if (!orgId || !userId) return;

    const hour = getCurrentHourMTY();
    const today = getTodayMTY();
    setCurrentHour(hour);

    const { data: entries } = await supabase
      .from("time_entries")
      .select("*, profiles(full_name, avatar_url)")
      .eq("org_id", orgId)
      .eq("date", today)
      .eq("hour", hour);

    if (!entries) {
      setTeammateEntries([]);
      setUserEntry("");
      setLoading(false);
      return;
    }

    const typedEntries = entries as EntryWithProfile[];

    // Separate user entry from teammates
    const myEntry = typedEntries.find((e) => e.user_id === userId);
    const othersEntries = typedEntries.filter((e) => e.user_id !== userId);

    setUserEntry(myEntry ? myEntry.title : "");

    // Build teammate summaries (one per user, take latest)
    const byUser = new Map<string, TeammatEntry>();
    for (const entry of othersEntries) {
      if (!byUser.has(entry.user_id)) {
        byUser.set(entry.user_id, {
          userId: entry.user_id,
          fullName: entry.profiles?.full_name ?? "Desconocido",
          avatarUrl: entry.profiles?.avatar_url ?? null,
          title: entry.title,
          category: entry.category,
        });
      }
    }

    setTeammateEntries(Array.from(byUser.values()));
    setLoading(false);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Initial load + polling ----
  useEffect(() => {
    if (!orgId || !userId) return;
    fetchComparisons();
    const interval = setInterval(fetchComparisons, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [orgId, userId, fetchComparisons]);

  // ---- Real-time subscription ----
  useEffect(() => {
    if (!orgId || !userId) return;
    const channel = supabase
      .channel("forced_comparison_rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          fetchComparisons();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, userId, fetchComparisons]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Don't render until loaded / no org ----
  if (loading || !orgId || !userId) return null;

  // Nothing to compare against -- no teammates logged this hour
  if (teammateEntries.length === 0) return null;

  const userHasNothing = !userEntry;
  const hourLabel = formatHourLabel(currentHour);

  // Build ticker content items
  const tickerItems = teammateEntries.map((t) => ({
    key: t.userId,
    name: getFirstName(t.fullName),
    avatarUrl: t.avatarUrl,
    title: t.title,
  }));

  // Duplicate items for seamless infinite scroll
  const scrollItems = [...tickerItems, ...tickerItems];

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden border-b",
        userHasNothing
          ? "bg-red-950/30 border-red-900/50"
          : "bg-accent/20 border-border",
      )}
    >
      {/* Left label: what the user is doing */}
      <div className="flex items-center">
        <div
          className={cn(
            "shrink-0 px-3 py-1.5 border-r font-mono text-[11px] font-semibold uppercase tracking-wider z-10",
            userHasNothing
              ? "border-red-900/50 bg-red-950/50 text-red-400"
              : "border-border bg-accent/30 text-muted-foreground",
          )}
        >
          <span className="text-muted-foreground">Mientras tu: </span>
          {userHasNothing ? (
            <span className="text-red-400 animate-pulse font-bold">
              NADA REGISTRADO
            </span>
          ) : (
            <span className="text-foreground">{userEntry}</span>
          )}
        </div>

        {/* Scrolling ticker of teammate entries */}
        <div className="flex-1 overflow-hidden">
          <div
            ref={tickerRef}
            className="flex items-center gap-6 whitespace-nowrap animate-ticker-scroll"
            style={{
              // @ts-expect-error -- CSS custom property
              "--ticker-duration": `${TICKER_DURATION_S}s`,
            }}
          >
            {scrollItems.map((item, i) => (
              <div
                key={`${item.key}-${i}`}
                className="flex items-center gap-1.5 shrink-0 py-1.5"
              >
                <Avatar size="sm" className="ring-1 ring-border">
                  {item.avatarUrl ? (
                    <AvatarImage src={item.avatarUrl} alt={item.name} />
                  ) : null}
                  <AvatarFallback className="text-[9px]">
                    {getInitials(item.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-mono text-[11px]">
                  <span className="font-semibold text-foreground">
                    {item.name}:
                  </span>{" "}
                  <span
                    className={cn(
                      userHasNothing
                        ? "text-red-300"
                        : "text-muted-foreground",
                    )}
                  >
                    &ldquo;{item.title}&rdquo;
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Hour indicator */}
        <div
          className={cn(
            "shrink-0 px-3 py-1.5 border-l font-mono text-[10px] uppercase tracking-wider",
            userHasNothing
              ? "border-red-900/50 text-red-400/80"
              : "border-border text-muted-foreground",
          )}
        >
          {hourLabel}
        </div>
      </div>

      {/* Inline CSS for marquee animation */}
      <style jsx>{`
        @keyframes ticker-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-ticker-scroll {
          animation: ticker-scroll var(--ticker-duration, 30s) linear infinite;
        }
        .animate-ticker-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
