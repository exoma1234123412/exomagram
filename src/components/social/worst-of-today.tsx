"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, cn, formatHour } from "@/lib/utils";
import type { Profile, TimeEntry } from "@/lib/types/database";
import { Skull, RefreshCw } from "lucide-react";

// ================================================================
// WORST OF TODAY
// ================================================================
//
// Shows the single WORST metric of the day on the dashboard.
// Changes throughout the day as new data comes in.
//
// Analyses performed:
//   1. Longest gap without logging (e.g. 4 hours 10am-2pm)
//   2. Lowest quality entry (short title, no proof)
//   3. Most late entries today
//   4. Zero entries past a certain hour
//   5. Copy-paste descriptions (identical descriptions)
//
// Updates every 5 minutes + real-time subscription on time_entries.
// Displayed as a compact card/banner with skull icon, red accent.

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

interface WorstDatum {
  score: number; // Higher = worse, used for ranking
  label: string; // The text to display
  userId: string;
  fullName: string;
}

interface MemberData {
  userId: string;
  fullName: string;
  entries: Pick<
    TimeEntry,
    "hour" | "title" | "description" | "proof_urls" | "is_late" | "logged_at"
  >[];
}

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const WORK_START = 7;
const WORK_END = 18;

// ----------------------------------------------------------------
// Analysis functions
// ----------------------------------------------------------------

function getCurrentHourMTY(): number {
  const now = new Date();
  const mtySring = now.toLocaleString("en-US", { timeZone: "America/Monterrey" });
  return new Date(mtySring).getHours();
}

function findLongestGap(member: MemberData): WorstDatum | null {
  if (member.entries.length === 0) return null;

  const currentHour = getCurrentHourMTY();
  const effectiveEnd = Math.min(currentHour, WORK_END);

  if (effectiveEnd <= WORK_START) return null;

  // Build set of logged hours
  const loggedHours = new Set(member.entries.map((e) => e.hour));

  // Find longest consecutive gap within work hours
  let longestGapStart = -1;
  let longestGapEnd = -1;
  let longestGap = 0;
  let currentGapStart = -1;
  let currentGap = 0;

  for (let h = WORK_START; h < effectiveEnd; h++) {
    if (!loggedHours.has(h)) {
      if (currentGapStart === -1) currentGapStart = h;
      currentGap++;
      if (currentGap > longestGap) {
        longestGap = currentGap;
        longestGapStart = currentGapStart;
        longestGapEnd = h + 1;
      }
    } else {
      currentGapStart = -1;
      currentGap = 0;
    }
  }

  if (longestGap < 2) return null;

  return {
    score: longestGap * 10, // Weight gaps heavily
    label: `${member.fullName} -- ${longestGap} horas sin registrar (${formatHour(longestGapStart)}-${formatHour(longestGapEnd)})`,
    userId: member.userId,
    fullName: member.fullName,
  };
}

function findLowestQuality(member: MemberData): WorstDatum | null {
  if (member.entries.length === 0) return null;

  // Find entry with shortest title and no proof
  let worstEntry: (typeof member.entries)[0] | null = null;
  let worstScore = 0;

  for (const entry of member.entries) {
    let score = 0;
    const titleLen = (entry.title ?? "").length;
    const hasProof = entry.proof_urls && entry.proof_urls.length > 0;
    const descLen = (entry.description ?? "").length;

    if (titleLen < 15) score += 3;
    if (titleLen < 10) score += 5;
    if (!hasProof) score += 2;
    if (descLen < 10) score += 2;
    if (descLen === 0) score += 3;

    // Only flag really low quality
    if (score > worstScore && score >= 7) {
      worstScore = score;
      worstEntry = entry;
    }
  }

  if (!worstEntry || worstScore < 7) return null;

  const wordCount = (worstEntry.title ?? "").trim().split(/\s+/).length;
  const hasProof = worstEntry.proof_urls && worstEntry.proof_urls.length > 0;

  return {
    score: worstScore * 3,
    label: `${member.fullName} -- entrada de ${wordCount} palabras${!hasProof ? " sin evidencia" : ""}`,
    userId: member.userId,
    fullName: member.fullName,
  };
}

function findMostLateEntries(member: MemberData): WorstDatum | null {
  const lateCount = member.entries.filter((e) => e.is_late).length;
  if (lateCount < 2) return null;

  return {
    score: lateCount * 8,
    label: `${member.fullName} -- ${lateCount} entradas tardias hoy`,
    userId: member.userId,
    fullName: member.fullName,
  };
}

function findZeroEntries(member: MemberData): WorstDatum | null {
  const currentHour = getCurrentHourMTY();
  if (currentHour < 11) return null; // Too early to shame
  if (member.entries.length > 0) return null;

  // Format current time in MTY
  const now = new Date();
  const mtyString = now.toLocaleString("en-US", {
    timeZone: "America/Monterrey",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return {
    score: (currentHour - 9) * 15, // Gets worse as the day goes on
    label: `${member.fullName} -- 0 entradas y ya son las ${mtyString}`,
    userId: member.userId,
    fullName: member.fullName,
  };
}

function findCopyPaste(member: MemberData): WorstDatum | null {
  if (member.entries.length < 3) return null;

  // Check for identical descriptions
  const descMap = new Map<string, number>();
  for (const entry of member.entries) {
    const desc = (entry.description ?? entry.title ?? "").toLowerCase().trim();
    if (desc.length > 0) {
      descMap.set(desc, (descMap.get(desc) ?? 0) + 1);
    }
  }

  // Find the most repeated
  let maxRepeats = 0;
  for (const count of descMap.values()) {
    if (count > maxRepeats) maxRepeats = count;
  }

  if (maxRepeats < 3) return null;

  return {
    score: maxRepeats * 9,
    label: `${member.fullName} -- ${maxRepeats} entradas con descripcion identica`,
    userId: member.userId,
    fullName: member.fullName,
  };
}

// ----------------------------------------------------------------
// Component: WorstOfToday
// ----------------------------------------------------------------

export function WorstOfToday() {
  const { orgId } = useOrg();
  const supabase = createClient();
  const [worstDatum, setWorstDatum] = useState<WorstDatum | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const analyze = useCallback(async () => {
    if (!orgId) return;

    const today = getTodayMTY();

    // Fetch all org members
    const { data: membersData } = await supabase
      .from("org_members")
      .select("user_id, profiles(full_name)")
      .eq("org_id", orgId);

    if (!membersData || membersData.length < 2) {
      setLoading(false);
      return;
    }

    // Fetch today's entries
    const { data: entriesData } = await supabase
      .from("time_entries")
      .select("user_id, hour, title, description, proof_urls, is_late, logged_at")
      .eq("org_id", orgId)
      .eq("date", today);

    // Build member data
    const entryMap = new Map<string, MemberData["entries"]>();
    for (const e of (entriesData ?? [])) {
      if (!entryMap.has(e.user_id)) entryMap.set(e.user_id, []);
      entryMap.get(e.user_id)!.push(e);
    }

    const members: MemberData[] = membersData.map((m) => ({
      userId: m.user_id,
      fullName: (m.profiles as unknown as Pick<Profile, "full_name">)?.full_name ?? "Desconocido",
      entries: entryMap.get(m.user_id) ?? [],
    }));

    // Run all analyses and collect candidates
    const candidates: WorstDatum[] = [];

    for (const member of members) {
      const gap = findLongestGap(member);
      if (gap) candidates.push(gap);

      const quality = findLowestQuality(member);
      if (quality) candidates.push(quality);

      const late = findMostLateEntries(member);
      if (late) candidates.push(late);

      const zero = findZeroEntries(member);
      if (zero) candidates.push(zero);

      const copyPaste = findCopyPaste(member);
      if (copyPaste) candidates.push(copyPaste);
    }

    // Pick the single worst
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      setWorstDatum(candidates[0]);
    } else {
      setWorstDatum(null);
    }

    setLastUpdated(new Date());
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load + polling every 5 minutes
  useEffect(() => {
    if (!orgId) return;
    analyze();
    intervalRef.current = setInterval(analyze, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [orgId, analyze]);

  // Real-time subscription
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`worst_of_today_${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => analyze()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, analyze]); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render while loading
  if (loading) {
    return (
      <div className="border border-border bg-card/50 px-4 py-3">
        <div className="flex items-center gap-2 text-muted-foreground font-mono text-[10px] uppercase tracking-wider animate-pulse">
          <Skull className="w-3.5 h-3.5" />
          Analizando datos...
        </div>
      </div>
    );
  }

  // Nothing bad found — still show the container but with a neutral message
  if (!worstDatum) {
    return (
      <div className="border border-border bg-card/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 border border-border flex items-center justify-center shrink-0">
            <Skull className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              PEOR DATO DEL DIA
            </p>
            <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
              Sin datos negativos destacables aun. Sigue asi.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border border-red-500/30 bg-red-500/5",
        "transition-all duration-300",
        "relative overflow-hidden"
      )}
    >
      {/* Top accent line */}
      <div className="absolute inset-x-0 top-0 h-px bg-red-500/40" />

      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Skull icon */}
          <div className="w-7 h-7 border border-red-500/30 bg-red-500/10 flex items-center justify-center shrink-0">
            <Skull className="w-4 h-4 text-red-500 dark:text-red-400" />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            {/* Label */}
            <div className="flex items-center gap-2 mb-1">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-600 dark:text-red-400 font-bold">
                PEOR DATO DEL DIA
              </p>
              {lastUpdated && (
                <span className="flex items-center gap-0.5 font-mono text-[8px] text-muted-foreground">
                  <RefreshCw className="w-2 h-2" />
                  {lastUpdated.toLocaleTimeString("es-MX", {
                    timeZone: "America/Monterrey",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>

            {/* The worst metric */}
            <p className="font-mono text-[11px] leading-snug text-red-700 dark:text-red-300 font-medium">
              {worstDatum.label}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
