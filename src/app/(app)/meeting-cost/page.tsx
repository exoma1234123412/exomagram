"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DollarSign,
  Users,
  Clock,
  AlertTriangle,
  Star,
  Ban,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface MeetingSlot {
  date: string;
  startHour: number;
  endHour: number;
  participants: { userId: string; profile: Profile | null; entryId: string }[];
  cost: number;
  ratings: { rating: number; wouldSkip: boolean; comment: string | null }[];
  avgRating: number | null;
  wouldSkipPct: number;
}

interface PersonMeetingStats {
  userId: string;
  profile: Profile | null;
  meetingHours: number;
  totalHours: number;
  meetingTaxRate: number;
  meetingCost: number;
}

const HOURLY_RATE = 50;

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function MeetingCostPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [meetings, setMeetings] = useState<MeetingSlot[]>([]);
  const [personStats, setPersonStats] = useState<PersonMeetingStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Aggregate stats
  const [totalMeetingHours, setTotalMeetingHours] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [avgParticipants, setAvgParticipants] = useState(0);
  const [wouldSkipRate, setWouldSkipRate] = useState(0);

  /* ---------- data loader ---------- */

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateFrom = thirtyDaysAgo.toISOString().split("T")[0];

    // 1. All org members with profiles
    const { data: orgMembers } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    const profileMap = new Map<string, Profile>();
    if (orgMembers) {
      for (const m of orgMembers) {
        if (m.profiles)
          profileMap.set(m.user_id, m.profiles as unknown as Profile);
      }
    }

    // 2. Meeting entries (last 30 days)
    const { data: meetingEntries } = await supabase
      .from("time_entries")
      .select("id, user_id, date, hour")
      .eq("org_id", orgId)
      .eq("category", "meeting")
      .gte("date", dateFrom)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .order("hour", { ascending: true });

    // 3. All entries for total hours per person
    const { data: allEntries } = await supabase
      .from("time_entries")
      .select("user_id, date, hour")
      .eq("org_id", orgId)
      .gte("date", dateFrom)
      .is("deleted_at", null);

    // 4. Meeting ratings
    const meetingEntryIds = (meetingEntries ?? []).map((e) => e.id as string);
    let allRatings: {
      entry_id: string;
      rating: number;
      would_skip: boolean;
      comment: string | null;
    }[] = [];
    if (meetingEntryIds.length > 0) {
      for (let i = 0; i < meetingEntryIds.length; i += 100) {
        const batch = meetingEntryIds.slice(i, i + 100);
        const { data: ratingBatch } = await supabase
          .from("meeting_ratings")
          .select("entry_id, rating, would_skip, comment")
          .in("entry_id", batch);
        if (ratingBatch)
          allRatings = allRatings.concat(
            ratingBatch as {
              entry_id: string;
              rating: number;
              would_skip: boolean;
              comment: string | null;
            }[]
          );
      }
    }

    // Build rating lookup by entry_id
    const ratingsByEntry = new Map<
      string,
      { rating: number; wouldSkip: boolean; comment: string | null }[]
    >();
    for (const r of allRatings) {
      const arr = ratingsByEntry.get(r.entry_id) ?? [];
      arr.push({
        rating: r.rating,
        wouldSkip: r.would_skip,
        comment: r.comment,
      });
      ratingsByEntry.set(r.entry_id, arr);
    }

    // ---- Group meeting entries by date+hour to find meeting slots ----
    const slotMap = new Map<
      string,
      { date: string; hour: number; participants: { userId: string; profile: Profile | null; entryId: string }[] }
    >();

    for (const e of meetingEntries ?? []) {
      const key = `${e.date}_${e.hour}`;
      const slot = slotMap.get(key) ?? {
        date: e.date as string,
        hour: e.hour as number,
        participants: [],
      };
      slot.participants.push({
        userId: e.user_id as string,
        profile: profileMap.get(e.user_id as string) ?? null,
        entryId: e.id as string,
      });
      slotMap.set(key, slot);
    }

    // ---- Merge consecutive hours for same set of participants into meetings ----
    // Sort slots by date desc, hour asc
    const sortedSlots = Array.from(slotMap.values()).sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.hour - b.hour;
    });

    const mergedMeetings: MeetingSlot[] = [];
    let currentMeeting: {
      date: string;
      startHour: number;
      endHour: number;
      participantIds: Set<string>;
      participants: { userId: string; profile: Profile | null; entryId: string }[];
      entryIds: string[];
    } | null = null;

    for (const slot of sortedSlots) {
      const slotParticipantIds = new Set(slot.participants.map((p) => p.userId));

      if (
        currentMeeting &&
        currentMeeting.date === slot.date &&
        slot.hour === currentMeeting.endHour + 1 &&
        setsEqual(currentMeeting.participantIds, slotParticipantIds)
      ) {
        // Extend current meeting
        currentMeeting.endHour = slot.hour;
        for (const p of slot.participants) {
          currentMeeting.participants.push(p);
          currentMeeting.entryIds.push(p.entryId);
        }
      } else {
        // Flush previous meeting
        if (currentMeeting) {
          mergedMeetings.push(buildMeetingSlot(currentMeeting, ratingsByEntry));
        }
        // Start new meeting
        currentMeeting = {
          date: slot.date,
          startHour: slot.hour,
          endHour: slot.hour,
          participantIds: slotParticipantIds,
          participants: [...slot.participants],
          entryIds: slot.participants.map((p) => p.entryId),
        };
      }
    }
    // Flush last meeting
    if (currentMeeting) {
      mergedMeetings.push(buildMeetingSlot(currentMeeting, ratingsByEntry));
    }

    // ---- Per-person stats ----
    const personMeetingHours = new Map<string, number>();
    for (const e of meetingEntries ?? []) {
      const uid = e.user_id as string;
      personMeetingHours.set(uid, (personMeetingHours.get(uid) ?? 0) + 1);
    }

    const personTotalHours = new Map<string, number>();
    for (const e of allEntries ?? []) {
      const uid = e.user_id as string;
      personTotalHours.set(uid, (personTotalHours.get(uid) ?? 0) + 1);
    }

    const pStats: PersonMeetingStats[] = [];
    for (const [uid, mHours] of personMeetingHours) {
      const total = personTotalHours.get(uid) ?? 0;
      pStats.push({
        userId: uid,
        profile: profileMap.get(uid) ?? null,
        meetingHours: mHours,
        totalHours: total,
        meetingTaxRate: total > 0 ? mHours / total : 0,
        meetingCost: mHours * HOURLY_RATE,
      });
    }
    pStats.sort((a, b) => b.meetingTaxRate - a.meetingTaxRate);

    // ---- Aggregates ----
    const totalMH = (meetingEntries ?? []).length;
    const allMeetingRatings = allRatings;
    const totalWouldSkip = allMeetingRatings.filter((r) => r.would_skip).length;
    const wouldSkipPct =
      allMeetingRatings.length > 0
        ? (totalWouldSkip / allMeetingRatings.length) * 100
        : 0;

    const totalParticipantSlots = mergedMeetings.reduce(
      (s, m) => s + m.participants.length / Math.max(1, m.endHour - m.startHour + 1),
      0
    );
    const avgPart =
      mergedMeetings.length > 0
        ? totalParticipantSlots / mergedMeetings.length
        : 0;

    const tCost = mergedMeetings.reduce((s, m) => s + m.cost, 0);

    setMeetings(mergedMeetings);
    setPersonStats(pStats);
    setTotalMeetingHours(totalMH);
    setTotalCost(tCost);
    setAvgParticipants(avgPart);
    setWouldSkipRate(wouldSkipPct);
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- initial load ---------- */

  useEffect(() => {
    if (orgLoading || !orgId) {
      if (!orgLoading) setLoading(false);
      return;
    }
    loadData();
  }, [orgLoading, orgId, loadData]);

  /* ---------- real-time ---------- */

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("meeting-cost-entries")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- loading ---------- */

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          CARGANDO...
        </p>
      </div>
    );
  }

  /* ---------- derived ---------- */

  const worstBySkip = [...meetings]
    .filter((m) => m.ratings.length > 0)
    .sort((a, b) => b.wouldSkipPct - a.wouldSkipPct)
    .slice(0, 5);

  const worstByCost = [...meetings]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  /* ---------- render ---------- */

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <DollarSign className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Costo de Reuniones
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Cada hora de reunion tiene un precio. Participantes x ${HOURLY_RATE}/hora. Ultimos 30 dias.
      </p>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Horas en reuniones
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
            {totalMeetingHours}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Costo total
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-red-500">
            ${totalCost.toLocaleString("en-US")}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Promedio participantes
          </p>
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
            {avgParticipants.toFixed(1)}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            &quot;La saltaria&quot;
          </p>
          <p className={cn(
            "text-2xl font-mono font-bold tabular-nums tracking-tight mt-1",
            wouldSkipRate > 50 ? "text-red-500" : "text-muted-foreground"
          )}>
            {wouldSkipRate.toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Worst meetings by cost */}
      {worstByCost.length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Reuniones mas caras del mes
          </p>
          <div className="space-y-2">
            {worstByCost.map((m, idx) => (
              <MeetingCard key={`cost-${idx}`} meeting={m} rank={idx + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Worst meetings by would-skip */}
      {worstBySkip.length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Reuniones mas innecesarias
          </p>
          <div className="space-y-2">
            {worstBySkip.map((m, idx) => (
              <MeetingCard key={`skip-${idx}`} meeting={m} rank={idx + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Full meeting log */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Registro completo &mdash; por dia, mas reciente primero
        </p>
        {meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <DollarSign className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              No hay reuniones registradas en los ultimos 30 dias.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {meetings.map((m, idx) => (
              <MeetingCard key={`all-${idx}`} meeting={m} />
            ))}
          </div>
        )}
      </div>

      {/* Per-person meeting tax */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Meeting Tax Rate por persona &mdash; mayor primero
        </p>
        {personStats.length === 0 ? (
          <p className="text-sm text-muted-foreground font-mono">
            Sin datos.
          </p>
        ) : (
          <div className="space-y-2">
            {personStats.map((ps, idx) => {
              const taxPct = (ps.meetingTaxRate * 100).toFixed(0);
              const isHigh = ps.meetingTaxRate > 0.3;
              return (
                <div
                  key={ps.userId}
                  className={cn(
                    "border p-3 flex items-center gap-3 transition-colors",
                    isHigh
                      ? "border-red-500/30 hover:border-red-500/50"
                      : "border-border hover:border-primary/30"
                  )}
                >
                  <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground w-6 shrink-0">
                    #{idx + 1}
                  </span>

                  <Avatar className="w-8 h-8 ring-1 ring-border shrink-0">
                    <AvatarImage
                      src={ps.profile?.avatar_url ?? undefined}
                    />
                    <AvatarFallback className="font-mono text-[10px]">
                      {getInitials(ps.profile?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-bold tracking-tight text-sm truncate">
                      {ps.profile?.full_name ?? "Sin nombre"}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {ps.meetingHours}h reuniones / {ps.totalHours}h total
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Costo: <span className="text-red-500 font-bold">${ps.meetingCost.toLocaleString("en-US")}</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className={cn(
                      "font-mono text-xl font-bold tabular-nums tracking-tight",
                      isHigh ? "text-red-500" : "text-foreground"
                    )}>
                      {taxPct}%
                    </p>
                    <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                      meeting tax
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Formula */}
      <div className="border border-border p-4 mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Como se calcula
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-bold">Costo:</span>{" "}
            participantes x horas x ${HOURLY_RATE}/hora
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-bold">Meeting Tax:</span>{" "}
            horas en reuniones / horas totales
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-bold">Innecesaria:</span>{" "}
            &gt;50% votaron &quot;la saltaria&quot;
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-bold">Agrupacion:</span>{" "}
            horas consecutivas con mismos participantes
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-6 border-t border-border/30">
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/25">
          Esta reunion costo $2,400 en productividad. Valio la pena?
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Meeting Card                                                        */
/* ------------------------------------------------------------------ */

function MeetingCard({
  meeting,
  rank,
}: {
  meeting: MeetingSlot;
  rank?: number;
}) {
  const duration = meeting.endHour - meeting.startHour + 1;
  const uniqueParticipants = new Map<string, { userId: string; profile: Profile | null }>();
  for (const p of meeting.participants) {
    uniqueParticipants.set(p.userId, p);
  }
  const participantCount = uniqueParticipants.size;
  const isUnnecessary = meeting.wouldSkipPct > 50 && meeting.ratings.length > 0;

  let dateLabel: string;
  try {
    dateLabel = format(
      new Date(meeting.date + "T12:00:00"),
      "EEE d MMM",
      { locale: es }
    );
  } catch {
    dateLabel = meeting.date;
  }

  return (
    <div
      className={cn(
        "border p-4 transition-colors",
        isUnnecessary
          ? "border-red-500/30 hover:border-red-500/50"
          : "border-border hover:border-primary/30"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Rank (optional) */}
        {rank !== undefined && (
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground w-6 shrink-0 pt-1">
            #{rank}
          </span>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-sm tracking-tight">
              {dateLabel}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {meeting.startHour}:00{duration > 1 ? ` - ${meeting.endHour + 1}:00` : ""}
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {duration}h
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              <Users className="w-3 h-3" />
              {participantCount}
            </span>
            {isUnnecessary && (
              <span className="bg-red-600 text-white font-mono text-[9px] px-1.5 py-0.5 uppercase font-bold tracking-wider">
                Innecesaria
              </span>
            )}
          </div>

          {/* Participants */}
          <div className="flex items-center gap-1 mt-2">
            {Array.from(uniqueParticipants.values()).map((p) => (
              <Avatar
                key={p.userId}
                className="w-6 h-6 ring-1 ring-border"
              >
                <AvatarImage src={p.profile?.avatar_url ?? undefined} />
                <AvatarFallback className="font-mono text-[8px]">
                  {getInitials(p.profile?.full_name ?? null)}
                </AvatarFallback>
              </Avatar>
            ))}
            {participantCount > 6 && (
              <span className="font-mono text-[10px] text-muted-foreground ml-1">
                +{participantCount - 6}
              </span>
            )}
          </div>

          {/* Rating row */}
          {meeting.ratings.length > 0 && (
            <div className="flex items-center gap-3 mt-2">
              {meeting.avgRating !== null && (
                <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                  <Star className="w-3 h-3" />
                  {meeting.avgRating.toFixed(1)}/5
                </span>
              )}
              <span className={cn(
                "flex items-center gap-1 font-mono text-[10px]",
                meeting.wouldSkipPct > 50 ? "text-red-500" : "text-muted-foreground"
              )}>
                <Ban className="w-3 h-3" />
                {meeting.wouldSkipPct.toFixed(0)}% la saltaria
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                ({meeting.ratings.length} rating{meeting.ratings.length !== 1 ? "s" : ""})
              </span>
            </div>
          )}
        </div>

        {/* Cost */}
        <div className="text-right shrink-0">
          <p className="font-mono text-xl font-bold tabular-nums tracking-tight text-red-500">
            ${meeting.cost.toLocaleString("en-US")}
          </p>
          <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
            costo
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function buildMeetingSlot(
  meeting: {
    date: string;
    startHour: number;
    endHour: number;
    participantIds: Set<string>;
    participants: { userId: string; profile: Profile | null; entryId: string }[];
    entryIds: string[];
  },
  ratingsByEntry: Map<
    string,
    { rating: number; wouldSkip: boolean; comment: string | null }[]
  >
): MeetingSlot {
  const duration = meeting.endHour - meeting.startHour + 1;
  const uniqueParticipants = meeting.participantIds.size;
  const cost = uniqueParticipants * duration * HOURLY_RATE;

  // Collect all ratings for entries in this meeting
  const ratings: { rating: number; wouldSkip: boolean; comment: string | null }[] = [];
  for (const entryId of meeting.entryIds) {
    const entryRatings = ratingsByEntry.get(entryId);
    if (entryRatings) {
      ratings.push(...entryRatings);
    }
  }

  const avgRating =
    ratings.length > 0
      ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
      : null;

  const wouldSkipCount = ratings.filter((r) => r.wouldSkip).length;
  const wouldSkipPct =
    ratings.length > 0 ? (wouldSkipCount / ratings.length) * 100 : 0;

  return {
    date: meeting.date,
    startHour: meeting.startHour,
    endHour: meeting.endHour,
    participants: meeting.participants,
    cost,
    ratings,
    avgRating,
    wouldSkipPct,
  };
}
