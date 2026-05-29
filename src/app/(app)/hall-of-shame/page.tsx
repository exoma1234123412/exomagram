"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile, AccountabilityFlag, FlagType } from "@/lib/types/database";
import { FLAG_TYPES } from "@/lib/constants";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Archive,
  AlertTriangle,
  Skull,
  Trophy,
  Clock,
  ShieldOff,
  FileX,
  Eye,
  Target,
  TrendingDown,
  TrendingUp,
  Calendar,
  Users,
} from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, eachWeekOfInterval, parseISO } from "date-fns";
import { es } from "date-fns/locale";

// ============================================================
// Types
// ============================================================

interface MemberFlagData {
  userId: string;
  profile: Profile | null;
  flags: AccountabilityFlag[];
  totalFlags: number;
}

interface ShameRecord {
  label: string;
  name: string;
  value: string;
  icon: React.ElementType;
}

interface TimelineEvent {
  date: string;
  name: string;
  description: string;
  flagType: FlagType;
  severity: "low" | "medium" | "high";
}

// ============================================================
// Helpers
// ============================================================

function getSeverityColor(severity: "low" | "medium" | "high") {
  switch (severity) {
    case "high":
      return "border-red-500/40 bg-red-500/5 text-red-500";
    case "medium":
      return "border-amber-500/40 bg-amber-500/5 text-amber-500";
    case "low":
      return "border-muted-foreground/20 bg-accent/20 text-muted-foreground";
  }
}

function getSeverityDot(severity: "low" | "medium" | "high") {
  switch (severity) {
    case "high":
      return "bg-red-500";
    case "medium":
      return "bg-amber-500";
    case "low":
      return "bg-muted-foreground/40";
  }
}

// ============================================================
// Page
// ============================================================

export default function HallOfShamePage() {
  const { orgId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [flags, setFlags] = useState<AccountabilityFlag[]>([]);
  const [entriesByUserDate, setEntriesByUserDate] = useState<
    Map<string, Set<string>>
  >(new Map());
  const [closeoutsByUserDate, setCloseoutsByUserDate] = useState<
    Map<string, Set<string>>
  >(new Map());
  const [lateEntriesByUserMonth, setLateEntriesByUserMonth] = useState<
    Map<string, number>
  >(new Map());
  const [proofByUserMonth, setProofByUserMonth] = useState<
    Map<string, { total: number; withProof: number }>
  >(new Map());
  const [trustByUserDate, setTrustByUserDate] = useState<
    Map<string, number>
  >(new Map());
  const [userIds, setUserIds] = useState<string[]>([]);

  // ---------- data loader ----------

  useEffect(() => {
    if (orgLoading || !orgId) {
      if (!orgLoading) setLoading(false);
      return;
    }

    async function load() {
      const ninetyDaysAgo = format(subDays(new Date(), 90), "yyyy-MM-dd");

      // 1. Org members + profiles
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId!);

      const profileMap = new Map<string, Profile>();
      const uids: string[] = [];
      for (const m of members ?? []) {
        uids.push(m.user_id);
        if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
      }
      setProfiles(profileMap);
      setUserIds(uids);

      // 2. All flags in last 90 days
      const { data: flagData } = await supabase
        .from("accountability_flags")
        .select("*")
        .eq("org_id", orgId!)
        .gte("date", ninetyDaysAgo)
        .order("created_at", { ascending: false });

      setFlags((flagData ?? []) as AccountabilityFlag[]);

      // 3. Time entries for last 90 days (just user_id, date, is_late, proof_urls)
      const { data: entries } = await supabase
        .from("time_entries")
        .select("user_id, date, is_late, proof_urls")
        .eq("org_id", orgId!)
        .gte("date", ninetyDaysAgo);

      // Build entries by user+date and late entries by user+month
      const eByUD = new Map<string, Set<string>>();
      const lateByUM = new Map<string, number>();
      const proofByUM = new Map<string, { total: number; withProof: number }>();

      for (const e of entries ?? []) {
        const uid = e.user_id as string;
        const date = e.date as string;
        const month = date.slice(0, 7); // YYYY-MM

        // entries by user+date
        if (!eByUD.has(uid)) eByUD.set(uid, new Set());
        eByUD.get(uid)!.add(date);

        // late entries by user+month
        if (e.is_late) {
          const key = `${uid}|${month}`;
          lateByUM.set(key, (lateByUM.get(key) ?? 0) + 1);
        }

        // proof by user+month
        const proofKey = `${uid}|${month}`;
        const cur = proofByUM.get(proofKey) ?? { total: 0, withProof: 0 };
        cur.total++;
        if (e.proof_urls && (e.proof_urls as string[]).length > 0) cur.withProof++;
        proofByUM.set(proofKey, cur);
      }
      setEntriesByUserDate(eByUD);
      setLateEntriesByUserMonth(lateByUM);
      setProofByUserMonth(proofByUM);

      // 4. Closeouts
      const { data: closeouts } = await supabase
        .from("daily_closeouts")
        .select("user_id, date")
        .eq("org_id", orgId!)
        .gte("date", ninetyDaysAgo);

      const cByUD = new Map<string, Set<string>>();
      for (const c of closeouts ?? []) {
        const uid = c.user_id as string;
        if (!cByUD.has(uid)) cByUD.set(uid, new Set());
        cByUD.get(uid)!.add(c.date as string);
      }
      setCloseoutsByUserDate(cByUD);

      // 5. Trust scores for leaderboard tracking (last place detection)
      const { data: trustData } = await supabase
        .from("trust_score_history")
        .select("user_id, date, score")
        .eq("org_id", orgId!)
        .gte("date", ninetyDaysAgo);

      const tByUD = new Map<string, number>();
      // Count how many days each user was last place
      const scoresByDate = new Map<string, { userId: string; score: number }[]>();
      for (const t of trustData ?? []) {
        const date = t.date as string;
        if (!scoresByDate.has(date)) scoresByDate.set(date, []);
        scoresByDate.get(date)!.push({ userId: t.user_id as string, score: t.score as number });
      }
      for (const [, scores] of scoresByDate) {
        if (scores.length < 2) continue;
        scores.sort((a, b) => a.score - b.score);
        const lastUserId = scores[0].userId;
        tByUD.set(lastUserId, (tByUD.get(lastUserId) ?? 0) + 1);
      }
      setTrustByUserDate(tByUD);

      setLoading(false);
    }

    load();
  }, [orgLoading, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- computed: flags grouped by person ----------

  const memberFlags = useMemo<MemberFlagData[]>(() => {
    const map = new Map<string, AccountabilityFlag[]>();
    for (const f of flags) {
      if (!map.has(f.user_id)) map.set(f.user_id, []);
      map.get(f.user_id)!.push(f);
    }

    const result: MemberFlagData[] = userIds.map((uid) => ({
      userId: uid,
      profile: profiles.get(uid) ?? null,
      flags: map.get(uid) ?? [],
      totalFlags: (map.get(uid) ?? []).length,
    }));

    result.sort((a, b) => b.totalFlags - a.totalFlags);
    return result;
  }, [flags, userIds, profiles]);

  const mostFlagged = memberFlags.length > 0 && memberFlags[0].totalFlags > 0 ? memberFlags[0] : null;

  // ---------- computed: shame records ----------

  const shameRecords = useMemo<ShameRecord[]>(() => {
    const records: ShameRecord[] = [];

    // 1. Longest streak of 0 entries (consecutive weekdays with no entries)
    for (const uid of userIds) {
      const datesWithEntries = entriesByUserDate.get(uid) ?? new Set();
      let maxStreak = 0;
      let currentStreak = 0;
      const today = new Date();
      for (let i = 90; i >= 0; i--) {
        const d = subDays(today, i);
        const day = d.getDay();
        if (day === 0 || day === 6) continue; // skip weekends
        const dateStr = format(d, "yyyy-MM-dd");
        if (!datesWithEntries.has(dateStr)) {
          currentStreak++;
          if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else {
          currentStreak = 0;
        }
      }

      if (maxStreak > 0) {
        const name = profiles.get(uid)?.full_name ?? "Sin nombre";
        records.push({
          label: "Mayor racha sin registrar",
          name,
          value: `${maxStreak} días consecutivos sin registrar`,
          icon: Skull,
        });
      }
    }
    // Keep only the worst
    records.sort((a, b) => {
      const aNum = parseInt(a.value);
      const bNum = parseInt(b.value);
      return bNum - aNum;
    });
    const longestZeroStreak = records.length > 0 ? [records[0]] : [];
    records.length = 0;

    // 2. Most late entries in a month
    let worstLate: ShameRecord | null = null;
    let worstLateCount = 0;
    for (const [key, count] of lateEntriesByUserMonth) {
      if (count > worstLateCount) {
        worstLateCount = count;
        const [uid, month] = key.split("|");
        const name = profiles.get(uid)?.full_name ?? "Sin nombre";
        const monthLabel = format(parseISO(`${month}-01`), "MMMM yyyy", { locale: es });
        worstLate = {
          label: "Más entradas tardías en un mes",
          name,
          value: `${count} entradas tardías en ${monthLabel}`,
          icon: Clock,
        };
      }
    }

    // 3. Lowest proof rate ever (min 5 entries to qualify)
    let worstProof: ShameRecord | null = null;
    let worstProofRate = 101;
    for (const [key, data] of proofByUserMonth) {
      if (data.total < 5) continue;
      const rate = Math.round((data.withProof / data.total) * 100);
      if (rate < worstProofRate) {
        worstProofRate = rate;
        const [uid, month] = key.split("|");
        const name = profiles.get(uid)?.full_name ?? "Sin nombre";
        const monthLabel = format(parseISO(`${month}-01`), "MMMM yyyy", { locale: es });
        worstProof = {
          label: "Menor tasa de evidencia",
          name,
          value: `${rate}% evidencia en ${monthLabel}`,
          icon: ShieldOff,
        };
      }
    }

    // 4. Most flags in a single week
    let worstWeekFlags: ShameRecord | null = null;
    let worstWeekCount = 0;
    const today = new Date();
    const ninetyAgo = subDays(today, 90);
    const weeks = eachWeekOfInterval({ start: ninetyAgo, end: today }, { weekStartsOn: 1 });

    for (const uid of userIds) {
      const userFlags = flags.filter((f) => f.user_id === uid);
      for (const weekStart of weeks) {
        const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        const wStartStr = format(weekStart, "yyyy-MM-dd");
        const wEndStr = format(wEnd, "yyyy-MM-dd");
        const count = userFlags.filter((f) => f.date >= wStartStr && f.date <= wEndStr).length;
        if (count > worstWeekCount) {
          worstWeekCount = count;
          const name = profiles.get(uid)?.full_name ?? "Sin nombre";
          worstWeekFlags = {
            label: "Más flags en una semana",
            name,
            value: `${count} flags`,
            icon: AlertTriangle,
          };
        }
      }
    }

    // 5. Most consecutive days without closeout
    let worstCloseout: ShameRecord | null = null;
    let worstCloseoutStreak = 0;
    for (const uid of userIds) {
      const closeoutDates = closeoutsByUserDate.get(uid) ?? new Set();
      let streak = 0;
      let maxStreak = 0;
      for (let i = 90; i >= 0; i--) {
        const d = subDays(today, i);
        const day = d.getDay();
        if (day === 0 || day === 6) continue;
        const dateStr = format(d, "yyyy-MM-dd");
        if (!closeoutDates.has(dateStr)) {
          streak++;
          if (streak > maxStreak) maxStreak = streak;
        } else {
          streak = 0;
        }
      }
      if (maxStreak > worstCloseoutStreak) {
        worstCloseoutStreak = maxStreak;
        const name = profiles.get(uid)?.full_name ?? "Sin nombre";
        worstCloseout = {
          label: "Mayor racha sin cierre del día",
          name,
          value: `${maxStreak} días`,
          icon: FileX,
        };
      }
    }

    // 6. Most times caught in La Inspección (flags of type suspicious_pattern)
    let worstInspection: ShameRecord | null = null;
    let worstInspectionCount = 0;
    for (const uid of userIds) {
      const count = flags.filter(
        (f) => f.user_id === uid && f.flag_type === "suspicious_pattern"
      ).length;
      if (count > worstInspectionCount) {
        worstInspectionCount = count;
        const name = profiles.get(uid)?.full_name ?? "Sin nombre";
        worstInspection = {
          label: "Más veces atrapado en La Inspección",
          name,
          value: `${count} veces atrapado`,
          icon: Eye,
        };
      }
    }

    // 7. Most times in last place
    let worstLastPlace: ShameRecord | null = null;
    let worstLastPlaceCount = 0;
    for (const [uid, count] of trustByUserDate) {
      if (count > worstLastPlaceCount) {
        worstLastPlaceCount = count;
        const name = profiles.get(uid)?.full_name ?? "Sin nombre";
        worstLastPlace = {
          label: "Más días en último lugar",
          name,
          value: `${count} días en último lugar`,
          icon: Trophy,
        };
      }
    }

    const finalRecords: ShameRecord[] = [];
    if (longestZeroStreak.length > 0) finalRecords.push(longestZeroStreak[0]);
    if (worstLate) finalRecords.push(worstLate);
    if (worstProof) finalRecords.push(worstProof);
    if (worstWeekFlags) finalRecords.push(worstWeekFlags);
    if (worstCloseout) finalRecords.push(worstCloseout);
    if (worstInspection && worstInspectionCount > 0) finalRecords.push(worstInspection);
    if (worstLastPlace && worstLastPlaceCount > 0) finalRecords.push(worstLastPlace);

    return finalRecords;
  }, [
    userIds,
    profiles,
    entriesByUserDate,
    lateEntriesByUserMonth,
    proofByUserMonth,
    flags,
    closeoutsByUserDate,
    trustByUserDate,
  ]);

  // ---------- computed: timeline of failures ----------

  const timeline = useMemo<TimelineEvent[]>(() => {
    return flags.map((f) => ({
      date: f.date,
      name: profiles.get(f.user_id)?.full_name ?? "Sin nombre",
      description: `${FLAG_TYPES[f.flag_type]?.emoji ?? ""} ${FLAG_TYPES[f.flag_type]?.label ?? f.flag_type}${f.details ? ` — ${f.details}` : ""}`,
      flagType: f.flag_type,
      severity: FLAG_TYPES[f.flag_type]?.severity ?? "medium",
    }));
  }, [flags, profiles]);

  // ---------- computed: brutal stats ----------

  const brutalStats = useMemo(() => {
    const totalFlags = flags.length;
    const monthsSpan = 3; // 90 days ~ 3 months
    const avgPerPersonPerMonth =
      userIds.length > 0 ? (totalFlags / userIds.length / monthsSpan).toFixed(1) : "0";

    // Most improvement: fewest flags in last 30 days vs first 60 days
    const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
    let bestImprovement: { name: string; delta: number } | null = null;
    let worstDeterioration: { name: string; delta: number } | null = null;

    for (const uid of userIds) {
      const userFlags = flags.filter((f) => f.user_id === uid);
      const recent = userFlags.filter((f) => f.date >= thirtyDaysAgo).length;
      const older = userFlags.filter((f) => f.date < thirtyDaysAgo).length;
      // Normalize: older covers 60 days, recent covers 30 days
      const olderNorm = older / 2;
      const delta = recent - olderNorm;
      const name = profiles.get(uid)?.full_name ?? "Sin nombre";

      if (bestImprovement === null || delta < bestImprovement.delta) {
        bestImprovement = { name, delta };
      }
      if (worstDeterioration === null || delta > worstDeterioration.delta) {
        worstDeterioration = { name, delta };
      }
    }

    return {
      totalFlags,
      avgPerPersonPerMonth,
      bestImprovement,
      worstDeterioration,
    };
  }, [flags, userIds, profiles]);

  // ---------- loading state ----------

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          CARGANDO EXPEDIENTES...
        </p>
      </div>
    );
  }

  // ---------- render ----------

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <Archive className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Hall of Shame
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Registro permanente. Todos los fracasos. Todos los nombres. Para siempre.
        Últimos 90 días.
      </p>

      {/* ============================================================ */}
      {/* MURO DE LA VERGÜENZA PERMANENTE                              */}
      {/* ============================================================ */}

      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
          Muro de la vergüenza permanente
        </p>

        {/* Most flagged callout */}
        {mostFlagged && (
          <div className="border-2 border-red-500/50 bg-red-500/5 p-4 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Skull className="w-4 h-4 text-red-500" />
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/70">
                Más flaggeado
              </span>
            </div>
            <p className="font-mono text-lg font-bold text-red-500 tracking-tight">
              {mostFlagged.profile?.full_name ?? "Sin nombre"}{" "}
              <span className="text-sm text-red-400">
                — {mostFlagged.totalFlags} flags en 90 días
              </span>
            </p>
          </div>
        )}

        {/* Flags by person */}
        {memberFlags.length === 0 || flags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              No hay flags registrados en los últimos 90 días.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {memberFlags
              .filter((m) => m.totalFlags > 0)
              .map((m) => (
                <div
                  key={m.userId}
                  className={cn(
                    "border transition-colors p-3",
                    m.totalFlags >= 10
                      ? "border-2 border-red-500/50 bg-red-500/5"
                      : m.totalFlags >= 5
                        ? "border-red-500/30 bg-red-500/3"
                        : "border-border"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8 ring-1 ring-border shrink-0">
                      <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="font-mono text-xs">
                        {getInitials(m.profile?.full_name ?? null)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono font-bold text-sm tracking-tight">
                          {m.profile?.full_name ?? "Sin nombre"}
                        </p>
                        <span
                          className={cn(
                            "font-mono text-[10px] font-bold tracking-[0.1em] px-1.5 py-0.5 border",
                            m.totalFlags >= 10
                              ? "text-red-500 border-red-500/40 bg-red-500/10"
                              : m.totalFlags >= 5
                                ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
                                : "text-muted-foreground border-border bg-accent/20"
                          )}
                        >
                          {m.totalFlags} FLAGS
                        </span>
                      </div>

                      {/* Flag type breakdown */}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {Object.entries(
                          m.flags.reduce<Record<string, number>>((acc, f) => {
                            acc[f.flag_type] = (acc[f.flag_type] ?? 0) + 1;
                            return acc;
                          }, {})
                        )
                          .sort(([, a], [, b]) => b - a)
                          .map(([type, count]) => (
                            <span
                              key={type}
                              className="font-mono text-[9px] text-muted-foreground/60"
                            >
                              {FLAG_TYPES[type as FlagType]?.emoji}{" "}
                              {FLAG_TYPES[type as FlagType]?.label}: {count}
                            </span>
                          ))}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={cn(
                          "font-mono font-black text-2xl tabular-nums tracking-tight",
                          m.totalFlags >= 10
                            ? "text-red-500"
                            : m.totalFlags >= 5
                              ? "text-amber-500"
                              : "text-foreground"
                        )}
                      >
                        {m.totalFlags}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* RECORDS DE VERGÜENZA                                         */}
      {/* ============================================================ */}

      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
          Records de vergüenza (Shame Records)
        </p>

        {shameRecords.length === 0 ? (
          <div className="border border-border p-6 text-center">
            <p className="font-mono text-xs text-muted-foreground">
              Sin datos suficientes para calcular records.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {shameRecords.map((record, i) => {
              const Icon = record.icon;
              return (
                <div
                  key={i}
                  className="border border-red-500/20 bg-red-500/3 p-3"
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className="w-3.5 h-3.5 text-red-500/60" />
                    <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-red-500/50">
                      {record.label}
                    </span>
                  </div>
                  <p className="font-mono text-sm font-bold tracking-tight text-foreground">
                    {record.name}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">
                    {record.value}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* LÍNEA DEL TIEMPO DE FRACASOS                                  */}
      {/* ============================================================ */}

      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
          Línea del tiempo de fracasos
        </p>

        {timeline.length === 0 ? (
          <div className="border border-border p-6 text-center">
            <p className="font-mono text-xs text-muted-foreground">
              Sin fracasos registrados.
            </p>
          </div>
        ) : (
          <div className="space-y-px max-h-[600px] overflow-y-auto border border-border">
            {timeline.map((event, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-3 p-2.5 border-b border-border/50 font-mono text-xs",
                  event.severity === "high" && "bg-red-500/3",
                  event.severity === "medium" && "bg-amber-500/3"
                )}
              >
                {/* Severity dot */}
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  <span
                    className={cn("w-1.5 h-1.5 rounded-full", getSeverityDot(event.severity))}
                  />
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50 w-20">
                    {format(parseISO(event.date), "dd MMM yy", { locale: es })}
                  </span>
                </div>

                {/* Name */}
                <span
                  className={cn(
                    "font-mono text-[11px] font-bold shrink-0 w-28 truncate",
                    event.severity === "high"
                      ? "text-red-500"
                      : event.severity === "medium"
                        ? "text-amber-500"
                        : "text-foreground"
                  )}
                >
                  {event.name}
                </span>

                {/* Description */}
                <span className="font-mono text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
                  {event.description}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* ESTADÍSTICAS BRUTALES                                         */}
      {/* ============================================================ */}

      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-3">
          Estadísticas brutales
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-accent/30 border border-border p-3">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Total flags
            </p>
            <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1 text-red-500">
              {brutalStats.totalFlags}
            </p>
          </div>

          <div className="bg-accent/30 border border-border p-3">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Promedio / persona / mes
            </p>
            <p className="text-2xl font-mono font-bold tabular-nums tracking-tight mt-1">
              {brutalStats.avgPerPersonPerMonth}
            </p>
          </div>

          <div className="bg-green-500/5 border border-green-500/20 p-3">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="w-3 h-3 text-green-500/60" />
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-green-500/50">
                Más mejoró
              </p>
            </div>
            <p className="text-sm font-mono font-bold tracking-tight text-green-600 dark:text-green-400 truncate">
              {brutalStats.bestImprovement?.name ?? "—"}
            </p>
            {brutalStats.bestImprovement && (
              <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
                {brutalStats.bestImprovement.delta < 0
                  ? `${Math.abs(Math.round(brutalStats.bestImprovement.delta))} menos flags`
                  : "Sin mejora notable"}
              </p>
            )}
          </div>

          <div className="bg-red-500/5 border border-red-500/20 p-3">
            <div className="flex items-center gap-1 mb-1">
              <TrendingDown className="w-3 h-3 text-red-500/60" />
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/50">
                Más empeoró
              </p>
            </div>
            <p className="text-sm font-mono font-bold tracking-tight text-red-500 truncate">
              {brutalStats.worstDeterioration?.name ?? "—"}
            </p>
            {brutalStats.worstDeterioration && (
              <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
                {brutalStats.worstDeterioration.delta > 0
                  ? `+${Math.round(brutalStats.worstDeterioration.delta)} más flags`
                  : "Sin deterioro notable"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom line */}
      <div className="mt-10 text-center py-6 border-t border-border/30">
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/25">
          El internet nunca olvida. Tu historial tampoco.
        </p>
      </div>
    </div>
  );
}
