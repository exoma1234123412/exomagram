"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials } from "@/lib/utils";
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, isAfter } from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Newspaper,
  Crown,
  Skull,
  BarChart3,
  AlertTriangle,
  Quote,
  Trophy,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { TimeEntry, DailyCloseout, Standup, AccountabilityFlag } from "@/lib/types/database";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface MemberProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface DayStats {
  date: string;
  dayLabel: string;
  totalHours: number;
  withProof: number;
  lateCount: number;
  byPerson: Record<string, { hours: number; proof: number; late: number }>;
}

interface PersonStats {
  userId: string;
  name: string;
  avatarUrl: string | null;
  totalHours: number;
  proofHours: number;
  proofRate: number;
  lateCount: number;
  flagCount: number;
  bestDay: { date: string; hours: number } | null;
  worstDay: { date: string; hours: number } | null;
}

interface NarrativeData {
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  dailyAvg: number;
  bestDay: DayStats | null;
  worstDay: DayStats | null;
  proofRate: number;
  lateRate: number;
  totalFlags: number;
  totalEntries: number;
  totalStandups: number;
  totalCloseouts: number;
  hero: PersonStats | null;
  villain: PersonStats | null;
  people: PersonStats[];
  days: DayStats[];
  mondayStats: DayStats | null;
  mvpOfBestDay: { name: string; hours: number } | null;
  worstOfWorstDay: { name: string; hours: number } | null;
}

// ═══════════════════════════════════════════════════════════
// DAY NAMES
// ═══════════════════════════════════════════════════════════

const DAY_NAMES: Record<number, string> = {
  0: "domingo",
  1: "lunes",
  2: "martes",
  3: "miercoles",
  4: "jueves",
  5: "viernes",
  6: "sabado",
};

// ═══════════════════════════════════════════════════════════
// NARRATIVE ADJECTIVES
// ═══════════════════════════════════════════════════════════

function weekAdjective(avgHours: number, proofRate: number): string {
  if (avgHours >= 7 && proofRate >= 80) return "excepcional";
  if (avgHours >= 6 && proofRate >= 60) return "aceptable";
  if (avgHours >= 5) return "mediocre";
  if (avgHours >= 3) return "preocupante";
  return "desastrosa";
}

function startAdjective(mondayHours: number): string {
  if (mondayHours >= 35) return "con fuerza";
  if (mondayHours >= 25) return "bien";
  if (mondayHours >= 15) return "lento";
  if (mondayHours >= 5) return "mal";
  return "con el freno de mano puesto";
}

// ═══════════════════════════════════════════════════════════
// DATA PROCESSING
// ═══════════════════════════════════════════════════════════

function processNarrative(
  entries: TimeEntry[],
  closeouts: DailyCloseout[],
  standups: Standup[],
  flags: AccountabilityFlag[],
  profiles: MemberProfile[],
  weekStart: Date,
  weekEnd: Date
): NarrativeData {
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const ws = format(weekStart, "yyyy-MM-dd");
  const we = format(weekEnd, "yyyy-MM-dd");

  // Group entries by date
  const byDate = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) || [];
    list.push(e);
    byDate.set(e.date, list);
  }

  // Build day stats
  const days: DayStats[] = [];
  const current = new Date(weekStart);
  while (current <= weekEnd) {
    const dateStr = format(current, "yyyy-MM-dd");
    const dayEntries = byDate.get(dateStr) || [];
    const byPerson: Record<string, { hours: number; proof: number; late: number }> = {};

    for (const e of dayEntries) {
      if (!byPerson[e.user_id]) byPerson[e.user_id] = { hours: 0, proof: 0, late: 0 };
      byPerson[e.user_id].hours += 1;
      if (e.proof_urls && e.proof_urls.length > 0) byPerson[e.user_id].proof += 1;
      if (e.is_late) byPerson[e.user_id].late += 1;
    }

    days.push({
      date: dateStr,
      dayLabel: DAY_NAMES[current.getDay()] || dateStr,
      totalHours: dayEntries.length,
      withProof: dayEntries.filter((e) => e.proof_urls && e.proof_urls.length > 0).length,
      lateCount: dayEntries.filter((e) => e.is_late).length,
      byPerson,
    });
    current.setDate(current.getDate() + 1);
  }

  // Work days only (Mon-Fri)
  const workDays = days.filter((d) => {
    const dow = new Date(d.date + "T12:00:00").getDay();
    return dow >= 1 && dow <= 5;
  });

  const totalHours = entries.length;
  const dailyAvg = workDays.length > 0 ? totalHours / workDays.length : 0;
  const proofEntries = entries.filter((e) => e.proof_urls && e.proof_urls.length > 0).length;
  const proofRate = totalHours > 0 ? (proofEntries / totalHours) * 100 : 0;
  const lateEntries = entries.filter((e) => e.is_late).length;
  const lateRate = totalHours > 0 ? (lateEntries / totalHours) * 100 : 0;

  const bestDay = workDays.length > 0
    ? workDays.reduce((a, b) => (a.totalHours >= b.totalHours ? a : b))
    : null;
  const worstDay = workDays.length > 0
    ? workDays.reduce((a, b) => (a.totalHours <= b.totalHours ? a : b))
    : null;

  // Monday
  const mondayStats = days.find((d) => new Date(d.date + "T12:00:00").getDay() === 1) || null;

  // Person stats
  const personMap = new Map<string, PersonStats>();
  for (const e of entries) {
    if (!personMap.has(e.user_id)) {
      const p = profileMap.get(e.user_id);
      personMap.set(e.user_id, {
        userId: e.user_id,
        name: p?.full_name || "Desconocido",
        avatarUrl: p?.avatar_url || null,
        totalHours: 0,
        proofHours: 0,
        proofRate: 0,
        lateCount: 0,
        flagCount: 0,
        bestDay: null,
        worstDay: null,
      });
    }
    const ps = personMap.get(e.user_id)!;
    ps.totalHours += 1;
    if (e.proof_urls && e.proof_urls.length > 0) ps.proofHours += 1;
    if (e.is_late) ps.lateCount += 1;
  }

  // Add flag counts
  for (const f of flags) {
    const ps = personMap.get(f.user_id);
    if (ps) ps.flagCount += 1;
  }

  // Compute proof rates + best/worst days per person
  for (const ps of personMap.values()) {
    ps.proofRate = ps.totalHours > 0 ? (ps.proofHours / ps.totalHours) * 100 : 0;

    // Find per-person best/worst days
    for (const day of workDays) {
      const pd = day.byPerson[ps.userId];
      if (!pd) continue;
      if (!ps.bestDay || pd.hours > ps.bestDay.hours) {
        ps.bestDay = { date: day.date, hours: pd.hours };
      }
      if (!ps.worstDay || pd.hours < ps.worstDay.hours) {
        ps.worstDay = { date: day.date, hours: pd.hours };
      }
    }
  }

  const people = Array.from(personMap.values()).sort((a, b) => b.totalHours - a.totalHours);

  // Hero = most hours + highest proof rate combo
  const hero = people.length > 0
    ? people.reduce((a, b) => {
        const scoreA = a.totalHours * (1 + a.proofRate / 100) - a.flagCount * 5;
        const scoreB = b.totalHours * (1 + b.proofRate / 100) - b.flagCount * 5;
        return scoreA >= scoreB ? a : b;
      })
    : null;

  // Villain = fewest hours + most flags
  const villain = people.length > 1
    ? people.reduce((a, b) => {
        const scoreA = a.totalHours * (1 + a.proofRate / 100) - a.flagCount * 5;
        const scoreB = b.totalHours * (1 + b.proofRate / 100) - b.flagCount * 5;
        return scoreA <= scoreB ? a : b;
      })
    : null;

  // MVP of best day
  let mvpOfBestDay: { name: string; hours: number } | null = null;
  if (bestDay) {
    let maxH = 0;
    let mvpId = "";
    for (const [uid, pd] of Object.entries(bestDay.byPerson)) {
      if (pd.hours > maxH) {
        maxH = pd.hours;
        mvpId = uid;
      }
    }
    if (mvpId) {
      mvpOfBestDay = { name: profileMap.get(mvpId)?.full_name || "Desconocido", hours: maxH };
    }
  }

  // Worst of worst day
  let worstOfWorstDay: { name: string; hours: number } | null = null;
  if (worstDay && Object.keys(worstDay.byPerson).length > 0) {
    let minH = Infinity;
    let worstId = "";
    for (const [uid, pd] of Object.entries(worstDay.byPerson)) {
      if (pd.hours < minH) {
        minH = pd.hours;
        worstId = uid;
      }
    }
    if (worstId) {
      worstOfWorstDay = { name: profileMap.get(worstId)?.full_name || "Desconocido", hours: minH };
    }
  }

  return {
    weekStart: ws,
    weekEnd: we,
    totalHours,
    dailyAvg,
    bestDay,
    worstDay,
    proofRate,
    lateRate,
    totalFlags: flags.length,
    totalEntries: entries.length,
    totalStandups: standups.length,
    totalCloseouts: closeouts.length,
    hero,
    villain,
    people,
    days,
    mondayStats,
    mvpOfBestDay,
    worstOfWorstDay,
  };
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function TeamNarrativePage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  // Week state — default to last completed week (Mon-Sun)
  const [weekOffset, setWeekOffset] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [closeouts, setCloseouts] = useState<DailyCloseout[]>([]);
  const [standups, setStandups] = useState<Standup[]>([]);
  const [flags, setFlags] = useState<AccountabilityFlag[]>([]);
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);

  const weekStart = useMemo(
    () => startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  );
  const weekEnd = useMemo(
    () => endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  );

  const canGoNext = !isAfter(endOfWeek(addWeeks(new Date(), weekOffset + 1), { weekStartsOn: 1 }), new Date());

  // Load data
  useEffect(() => {
    if (orgLoading || !orgId) return;

    async function load() {
      setLoading(true);
      const ws = format(weekStart, "yyyy-MM-dd");
      const we = format(weekEnd, "yyyy-MM-dd");

      const [entriesRes, closeoutsRes, standupsRes, flagsRes, membersRes] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*")
          .eq("org_id", orgId!)
          .gte("date", ws)
          .lte("date", we)
          .order("date")
          .order("hour"),
        supabase
          .from("daily_closeouts")
          .select("*")
          .eq("org_id", orgId!)
          .gte("date", ws)
          .lte("date", we),
        supabase
          .from("standups")
          .select("*")
          .eq("org_id", orgId!)
          .gte("date", ws)
          .lte("date", we),
        supabase
          .from("accountability_flags")
          .select("*")
          .eq("org_id", orgId!)
          .gte("date", ws)
          .lte("date", we),
        supabase
          .from("org_members")
          .select("user_id, profiles(id, full_name, avatar_url)")
          .eq("org_id", orgId!),
      ]);

      setEntries((entriesRes.data as TimeEntry[]) || []);
      setCloseouts((closeoutsRes.data as DailyCloseout[]) || []);
      setStandups((standupsRes.data as Standup[]) || []);
      setFlags((flagsRes.data as AccountabilityFlag[]) || []);

      const profs: MemberProfile[] = (membersRes.data || []).map((m: any) => ({
        id: m.profiles?.id || m.user_id,
        full_name: m.profiles?.full_name || null,
        avatar_url: m.profiles?.avatar_url || null,
      }));
      setProfiles(profs);
      setLoading(false);
    }

    load();
  }, [orgId, orgLoading, weekStart, weekEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const narrative = useMemo(() => {
    if (entries.length === 0 && profiles.length === 0) return null;
    return processNarrative(entries, closeouts, standups, flags, profiles, weekStart, weekEnd);
  }, [entries, closeouts, standups, flags, profiles, weekStart, weekEnd]);

  // ─────────────────────────────────────────────
  // Loading / empty states
  // ─────────────────────────────────────────────

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground font-mono text-xs">
          Crea o unete a un equipo desde el Dashboard.
        </p>
      </div>
    );
  }

  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} al ${format(weekEnd, "d MMM yyyy", { locale: es })}`;
  const nextWeekStart = addWeeks(weekStart, 1);
  const nextWeekEnd = addWeeks(weekEnd, 1);
  const nextWeekLabel = `${format(nextWeekStart, "d MMM", { locale: es })} al ${format(nextWeekEnd, "d MMM", { locale: es })}`;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* ── MASTHEAD ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Newspaper className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Cronica del Equipo
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Narrativa semanal generada a partir de los datos del equipo
        </p>
      </div>

      {/* ── WEEK NAVIGATION ── */}
      <div className="flex items-center justify-between mb-8 border border-border p-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setWeekOffset((o) => o - 1)}
          className="font-mono"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <p className="font-mono text-xs font-bold uppercase tracking-wide">
            Semana del {weekLabel}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setWeekOffset((o) => o + 1)}
          disabled={!canGoNext}
          className="font-mono"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* ── NO DATA ── */}
      {(!narrative || narrative.totalEntries === 0) && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
            <Newspaper className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            Sin datos para esta semana
          </p>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            No se registraron entradas de tiempo
          </p>
        </div>
      )}

      {/* ── THE NARRATIVE ── */}
      {narrative && narrative.totalEntries > 0 && (
        <div className="space-y-0">
          {/* Newspaper title */}
          <div className="border-t-4 border-foreground pt-4 pb-6 mb-0 text-center">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
              Edicion semanal -- Sistema de vigilancia Exomagram
            </p>
            <h2 className="font-mono text-2xl sm:text-3xl font-black uppercase tracking-tight leading-tight">
              Cronica del Equipo
            </h2>
            <p className="font-mono text-sm font-bold uppercase tracking-wide mt-1">
              Semana del {weekLabel}
            </p>
            <div className="h-px bg-foreground mt-4" />
            <div className="h-[3px] bg-foreground mt-[2px]" />
          </div>

          {/* ── CAPITULO 1: EL ARRANQUE ── */}
          <ChapterHeading number={1} title="El Arranque" />
          <div className="mb-8 font-mono text-sm leading-relaxed space-y-3">
            <p>
              La semana comenzo{" "}
              <strong>{startAdjective(narrative.mondayStats?.totalHours || 0)}</strong>.
              {narrative.mondayStats ? (
                <>
                  {" "}El lunes, el equipo registro{" "}
                  <Highlight>{narrative.mondayStats.totalHours}</Highlight> horas totales.
                  {(() => {
                    const mondayPeople = Object.entries(narrative.mondayStats.byPerson);
                    if (mondayPeople.length === 0) return null;
                    const sorted = mondayPeople.sort((a, b) => b[1].hours - a[1].hours);
                    const bestId = sorted[0][0];
                    const bestP = narrative.people.find((p) => p.userId === bestId);
                    const worstId = sorted[sorted.length - 1][0];
                    const worstP = narrative.people.find((p) => p.userId === worstId);
                    return (
                      <>
                        {bestP && (
                          <>
                            {" "}<strong>{bestP.name}</strong> marco el ritmo con{" "}
                            <Highlight>{sorted[0][1].hours}</Highlight> horas
                          </>
                        )}
                        {worstP && bestP && worstP.userId !== bestP.userId && (
                          <>
                            , mientras <strong>{worstP.name}</strong> apenas llego a{" "}
                            <Highlight>{sorted[sorted.length - 1][1].hours}</Highlight>
                          </>
                        )}
                        .
                      </>
                    );
                  })()}
                </>
              ) : (
                " No hubo actividad el lunes."
              )}
            </p>
          </div>

          {/* ── CAPITULO 2: LA BATALLA ── */}
          <ChapterHeading number={2} title="La Batalla" />
          <div className="mb-8 font-mono text-sm leading-relaxed space-y-3">
            {narrative.bestDay && (
              <p>
                El <strong>{narrative.bestDay.dayLabel}</strong> fue el mejor dia con{" "}
                <Highlight>{narrative.bestDay.totalHours}</Highlight> horas totales.
                {narrative.mvpOfBestDay && (
                  <>
                    {" "}<strong>{narrative.mvpOfBestDay.name}</strong> lidero con{" "}
                    <Highlight>{narrative.mvpOfBestDay.hours}</Highlight> horas.
                  </>
                )}
              </p>
            )}
            {narrative.worstDay && narrative.bestDay && narrative.worstDay.date !== narrative.bestDay.date && (
              <p>
                Pero el <strong>{narrative.worstDay.dayLabel}</strong> fue desastroso: solo{" "}
                <Highlight>{narrative.worstDay.totalHours}</Highlight> horas.
                {narrative.worstOfWorstDay && (
                  <>
                    {" "}<strong>{narrative.worstOfWorstDay.name}</strong> fue el responsable con solo{" "}
                    <Highlight>{narrative.worstOfWorstDay.hours}</Highlight> horas registradas.
                  </>
                )}
              </p>
            )}

            {/* Pull quote */}
            {narrative.bestDay && (
              <PullQuote>
                {narrative.bestDay.totalHours} horas el {narrative.bestDay.dayLabel} -- el pico de la semana
              </PullQuote>
            )}
          </div>

          {/* ── CAPITULO 3: HEROES Y VILLANOS ── */}
          <ChapterHeading number={3} title="Los Heroes y Villanos" />
          <div className="mb-8 space-y-4">
            {/* Hero card */}
            {narrative.hero && (
              <div className="border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground font-semibold">
                    Heroe de la semana
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 ring-1 ring-border">
                    <AvatarImage src={narrative.hero.avatarUrl || undefined} />
                    <AvatarFallback className="font-mono text-xs">
                      {getInitials(narrative.hero.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-bold truncate">{narrative.hero.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      <span className="tabular-nums">{narrative.hero.totalHours}</span> horas --{" "}
                      <span className="tabular-nums">{Math.round(narrative.hero.proofRate)}%</span> evidencia --{" "}
                      <span className="tabular-nums">{narrative.hero.flagCount}</span> flags
                    </p>
                  </div>
                  <Trophy className="w-6 h-6 text-amber-500 shrink-0" />
                </div>
              </div>
            )}

            {/* Villain card */}
            {narrative.villain && narrative.villain.userId !== narrative.hero?.userId && (
              <div className="border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Skull className="w-4 h-4 text-destructive" />
                  <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground font-semibold">
                    Villano de la semana
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 ring-1 ring-border">
                    <AvatarImage src={narrative.villain.avatarUrl || undefined} />
                    <AvatarFallback className="font-mono text-xs">
                      {getInitials(narrative.villain.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-bold truncate">{narrative.villain.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      <span className="tabular-nums">{narrative.villain.totalHours}</span> horas --{" "}
                      <span className="tabular-nums">{narrative.villain.flagCount}</span> flags --{" "}
                      <span className="tabular-nums">{Math.round(narrative.villain.proofRate)}%</span> evidencia
                    </p>
                  </div>
                  <TrendingDown className="w-6 h-6 text-destructive shrink-0" />
                </div>
              </div>
            )}

            {/* Narrative paragraph */}
            <div className="font-mono text-sm leading-relaxed">
              {narrative.hero && (
                <p>
                  <strong>{narrative.hero.name}</strong> fue el motor del equipo esta semana
                  con <Highlight>{narrative.hero.totalHours}</Highlight> horas y{" "}
                  <Highlight>{Math.round(narrative.hero.proofRate)}%</Highlight> de evidencia.
                  {narrative.villain && narrative.villain.userId !== narrative.hero.userId && (
                    <>
                      {" "}En el otro extremo, <strong>{narrative.villain.name}</strong> registro solo{" "}
                      <Highlight>{narrative.villain.totalHours}</Highlight> horas con{" "}
                      <Highlight>{narrative.villain.flagCount}</Highlight> flags levantados.
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* ── CAPITULO 4: LOS NUMEROS FRIOS ── */}
          <ChapterHeading number={4} title="Los Numeros Frios" />
          <div className="mb-8">
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px border border-border mb-4 bg-border">
              <StatCell label="Horas totales" value={narrative.totalHours} />
              <StatCell label="Promedio diario" value={Number(narrative.dailyAvg.toFixed(1))} />
              <StatCell label="% evidencia" value={`${Math.round(narrative.proofRate)}%`} />
              <StatCell label="% tardias" value={`${Math.round(narrative.lateRate)}%`} />
              <StatCell label="Flags" value={narrative.totalFlags} />
              <StatCell label="Standups" value={narrative.totalStandups} />
              <StatCell label="Closeouts" value={narrative.totalCloseouts} />
              <StatCell label="Personas" value={narrative.people.length} />
            </div>

            {/* Per-day breakdown */}
            <div className="border border-border">
              <div className="bg-accent/30 px-3 py-2 border-b border-border">
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground font-semibold">
                  Desglose por dia
                </p>
              </div>
              <div className="divide-y divide-border">
                {narrative.days
                  .filter((d) => {
                    const dow = new Date(d.date + "T12:00:00").getDay();
                    return dow >= 1 && dow <= 5;
                  })
                  .map((d) => (
                    <div key={d.date} className="flex items-center justify-between px-3 py-2">
                      <span className="font-mono text-xs capitalize font-medium w-24">
                        {d.dayLabel}
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs tabular-nums">
                          {d.totalHours}h
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {d.withProof} con prueba
                        </span>
                        {d.lateCount > 0 && (
                          <span className="font-mono text-xs tabular-nums text-destructive">
                            {d.lateCount} tardias
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Per-person ranking */}
            <div className="border border-border mt-4">
              <div className="bg-accent/30 px-3 py-2 border-b border-border">
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground font-semibold">
                  Ranking individual
                </p>
              </div>
              <div className="divide-y divide-border">
                {narrative.people.map((p, i) => (
                  <div key={p.userId} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground w-6 text-right">
                      {i + 1}.
                    </span>
                    <Avatar className="w-6 h-6 ring-1 ring-border">
                      <AvatarImage src={p.avatarUrl || undefined} />
                      <AvatarFallback className="font-mono text-[8px]">
                        {getInitials(p.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-mono text-xs font-medium flex-1 truncate">
                      {p.name}
                    </span>
                    <span className="font-mono text-xs tabular-nums">
                      {p.totalHours}h
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {Math.round(p.proofRate)}%
                    </span>
                    {p.flagCount > 0 && (
                      <span className="font-mono text-xs tabular-nums text-destructive flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {p.flagCount}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── CAPITULO 5: EL VEREDICTO ── */}
          <ChapterHeading number={5} title="El Veredicto" />
          <div className="mb-8 font-mono text-sm leading-relaxed space-y-3">
            <p>
              Esta fue una semana{" "}
              <strong>{weekAdjective(narrative.dailyAvg, narrative.proofRate)}</strong>.{" "}
              El equipo{" "}
              {narrative.dailyAvg >= 6
                ? "logro mantener un ritmo aceptable"
                : "no logro mantener el estandar minimo"}.{" "}
              {narrative.proofRate >= 70
                ? `La tasa de evidencia del ${Math.round(narrative.proofRate)}% es respetable.`
                : `Solo el ${Math.round(narrative.proofRate)}% de las entradas tienen evidencia. Inaceptable.`}
            </p>
            {narrative.worstDay && (
              <p>
                Si la proxima semana repite el patron del{" "}
                <strong>{narrative.worstDay.dayLabel}</strong> ({narrative.worstDay.totalHours}h),
                el trimestre estara en riesgo.
              </p>
            )}

            {/* Verdict pull quote */}
            <PullQuote>
              {narrative.dailyAvg >= 6
                ? `Promedio diario de ${narrative.dailyAvg.toFixed(1)}h -- dentro del rango`
                : `Promedio diario de ${narrative.dailyAvg.toFixed(1)}h -- por debajo del estandar`}
            </PullQuote>
          </div>

          {/* ── PROXIMO CAPITULO ── */}
          <div className="border-t-2 border-foreground pt-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground font-semibold">
                Proximo capitulo
              </span>
            </div>
            <p className="font-mono text-sm leading-relaxed mb-2">
              <strong>Semana del {nextWeekLabel}</strong>
            </p>
            <p className="font-mono text-sm leading-relaxed text-muted-foreground">
              {narrative.villain && narrative.villain.userId !== narrative.hero?.userId
                ? `Podra el equipo redimirse? ${narrative.villain.name} cambiara o seguira siendo la carga?`
                : "El equipo tiene la oportunidad de superar los numeros de esta semana."}
            </p>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-border text-center">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Generado automaticamente por Exomagram -- Datos, no opiniones
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

function ChapterHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className="border-b border-border pb-2 mb-4 mt-6">
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
        Capitulo {number}
      </p>
      <h3 className="font-mono text-lg font-bold uppercase tracking-tight">{title}</h3>
    </div>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-bold tabular-nums bg-primary/10 px-1 py-0.5 text-foreground">
      {children}
    </span>
  );
}

function PullQuote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-primary pl-4 py-2 my-4">
      <div className="flex items-start gap-2">
        <Quote className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="font-mono text-sm font-bold italic text-foreground">{children}</p>
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-background px-3 py-3 text-center">
      <p className="font-mono text-lg font-bold tabular-nums tracking-tight">{value}</p>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mt-1">
        {label}
      </p>
    </div>
  );
}
