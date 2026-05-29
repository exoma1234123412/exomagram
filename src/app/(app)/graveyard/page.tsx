"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { format, subDays, differenceInCalendarDays, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { Skull, Cross } from "lucide-react";

// ─── TYPES ──────────────────────────────────────────────────

interface MemberProfile {
  id: string;
  full_name: string | null;
  email: string;
}

interface DeadStreak {
  userId: string;
  name: string;
  length: number;
  startDate: string;
  endDate: string;
  causeOfDeath: string;
  epitaph: string;
}

// ─── EPITAPHS ───────────────────────────────────────────────

const EPITAPHS = [
  "Muri\u00f3 joven pero con potencial.",
  "Nadie fue al funeral.",
  "Promet\u00eda tanto, entreg\u00f3 tan poco.",
  "La pereza gan\u00f3 esta batalla.",
  "Ni un standup de despedida.",
  "El equipo ni se enter\u00f3.",
  "Descansa en productividad.",
  "Aqu\u00ed yace la disciplina que pudo ser.",
  "Se fue sin dejar evidencia.",
  "No hubo cierre del d\u00eda. No hubo cierre de nada.",
  "El Slack sigui\u00f3 sonando. \u00c9l no.",
  "Sobrevivi\u00f3 a las reuniones, pero no a la constancia.",
  "Un d\u00eda simplemente dej\u00f3 de registrar.",
  "Lo \u00faltimo que log\u00f3 fue un break.",
];

function getEpitaph(userId: string, index: number): string {
  // Deterministic but varied: hash based on userId + index
  const hash = (userId + index.toString()).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return EPITAPHS[hash % EPITAPHS.length];
}

// ─── HELPERS ────────────────────────────────────────────────

function findDeadStreaks(
  userId: string,
  name: string,
  dates: string[],
  entriesByDate: Map<string, string[]>,
): DeadStreak[] {
  if (dates.length === 0) return [];

  const sorted = [...dates].sort();
  const streaks: DeadStreak[] = [];

  let seqStart = sorted[0];
  let seqEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(seqEnd + "T12:00:00");
    const curr = new Date(sorted[i] + "T12:00:00");
    const gap = differenceInCalendarDays(curr, prev);

    if (gap === 1) {
      // Consecutive day
      seqEnd = sorted[i];
    } else {
      // Gap found -- the previous sequence ended, so it's a dead streak
      // (only count streaks of 2+ days as "notable")
      const length = differenceInCalendarDays(
        new Date(seqEnd + "T12:00:00"),
        new Date(seqStart + "T12:00:00"),
      ) + 1;

      if (length >= 2) {
        // Determine cause of death: what happened the day after?
        const dayAfter = format(addDays(new Date(seqEnd + "T12:00:00"), 1), "yyyy-MM-dd");
        const dayAfterCategories = entriesByDate.get(dayAfter) ?? [];
        let cause = "Sin actividad";
        if (dayAfterCategories.length > 0) {
          const allBreaks = dayAfterCategories.every((c) => c === "break");
          if (allBreaks) {
            cause = "Solo breaks";
          } else {
            cause = "Desconocido";
          }
        }

        streaks.push({
          userId,
          name,
          length,
          startDate: seqStart,
          endDate: seqEnd,
          causeOfDeath: cause,
          epitaph: getEpitaph(userId, streaks.length),
        });
      }

      seqStart = sorted[i];
      seqEnd = sorted[i];
    }
  }

  // The last sequence is the CURRENT streak (still alive), so we don't add it
  // Unless it ended more than 1 day ago -- then it's also dead
  const today = new Date();
  const lastDate = new Date(seqEnd + "T12:00:00");
  const daysSinceLast = differenceInCalendarDays(today, lastDate);

  if (daysSinceLast > 1) {
    const length = differenceInCalendarDays(
      new Date(seqEnd + "T12:00:00"),
      new Date(seqStart + "T12:00:00"),
    ) + 1;

    if (length >= 2) {
      const dayAfter = format(addDays(new Date(seqEnd + "T12:00:00"), 1), "yyyy-MM-dd");
      const dayAfterCategories = entriesByDate.get(dayAfter) ?? [];
      let cause = "Sin actividad";
      if (dayAfterCategories.length > 0) {
        const allBreaks = dayAfterCategories.every((c) => c === "break");
        cause = allBreaks ? "Solo breaks" : "Desconocido";
      }

      streaks.push({
        userId,
        name,
        length,
        startDate: seqStart,
        endDate: seqEnd,
        causeOfDeath: cause,
        epitaph: getEpitaph(userId, streaks.length),
      });
    }
  }

  return streaks;
}

// ─── MAIN PAGE ──────────────────────────────────────────────

export default function GraveyardPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const supabase = createClient();
  const [graves, setGraves] = useState<DeadStreak[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;

    async function load() {
      setLoading(true);

      // Get all org members with profiles
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(id, full_name, email)")
        .eq("org_id", orgId!);

      if (!members || members.length === 0) {
        setGraves([]);
        setLoading(false);
        return;
      }

      const memberMap = new Map<string, string>();
      for (const m of members) {
        const p = m.profiles as unknown as MemberProfile | null;
        memberMap.set(m.user_id, p?.full_name ?? p?.email ?? "Desconocido");
      }

      // Get all time entries for the last 90 days for all org members
      const ninetyDaysAgo = format(subDays(new Date(), 90), "yyyy-MM-dd");
      const todayStr = format(new Date(), "yyyy-MM-dd");

      const { data: entries } = await supabase
        .from("time_entries")
        .select("user_id, date, category")
        .eq("org_id", orgId!)
        .gte("date", ninetyDaysAgo)
        .lte("date", todayStr);

      if (!entries || entries.length === 0) {
        setGraves([]);
        setLoading(false);
        return;
      }

      // Group entries by user -> distinct dates and categories per date
      const userDates = new Map<string, Set<string>>();
      const userEntriesByDate = new Map<string, Map<string, string[]>>();

      for (const e of entries) {
        // Distinct dates per user
        if (!userDates.has(e.user_id)) {
          userDates.set(e.user_id, new Set());
        }
        userDates.get(e.user_id)!.add(e.date);

        // Categories per date per user
        if (!userEntriesByDate.has(e.user_id)) {
          userEntriesByDate.set(e.user_id, new Map());
        }
        const dateMap = userEntriesByDate.get(e.user_id)!;
        if (!dateMap.has(e.date)) {
          dateMap.set(e.date, []);
        }
        dateMap.get(e.date)!.push(e.category);
      }

      // Find dead streaks for each member
      const allGraves: DeadStreak[] = [];

      for (const [userId, dates] of userDates) {
        const name = memberMap.get(userId) ?? "Desconocido";
        const entriesByDate = userEntriesByDate.get(userId) ?? new Map();
        const deadStreaks = findDeadStreaks(userId, name, [...dates], entriesByDate);
        allGraves.push(...deadStreaks);
      }

      // Sort by streak length descending (most dramatic deaths first)
      allGraves.sort((a, b) => b.length - a.length);

      setGraves(allGraves);
      setLoading(false);
    }

    load();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── COMPUTED STATS ─────────────────────────────────────────

  const stats = useMemo(() => {
    if (graves.length === 0) return null;

    const totalGraves = graves.length;
    const longestDead = graves[0]?.length ?? 0;

    // Most deaths (person with most dead streaks)
    const deathCount = new Map<string, number>();
    for (const g of graves) {
      deathCount.set(g.name, (deathCount.get(g.name) ?? 0) + 1);
    }
    let mostDeaths = { name: "", count: 0 };
    for (const [name, count] of deathCount) {
      if (count > mostDeaths.count) {
        mostDeaths = { name, count };
      }
    }

    return { totalGraves, longestDead, mostDeaths };
  }, [graves]);

  // ─── RENDER ─────────────────────────────────────────────────

  if (orgLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 bg-primary animate-pulse" />
          <p className="text-xs font-mono text-muted-foreground animate-pulse tracking-widest uppercase">
            Cargando...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Cross className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
          Cementerio de Rachas
        </h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-8">
        Rachas rotas en los \u00faltimos 90 d\u00edas. Cada l\u00e1pida es una promesa incumplida.
      </p>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="border border-border bg-accent/30 p-4 corner-marks">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
              Tumbas totales
            </p>
            <p className="font-mono tabular-nums text-2xl font-bold tracking-tight">
              {stats.totalGraves}
            </p>
          </div>
          <div className="border border-border bg-accent/30 p-4 corner-marks">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
              Racha m\u00e1s larga muerta
            </p>
            <p className="font-mono tabular-nums text-2xl font-bold tracking-tight">
              {stats.longestDead}
              <span className="text-sm text-muted-foreground ml-1">d\u00edas</span>
            </p>
          </div>
          <div className="border border-border bg-accent/30 p-4 corner-marks">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
              M\u00e1s muertes
            </p>
            <p className="font-mono text-sm font-bold tracking-tight truncate">
              {stats.mostDeaths.name}
            </p>
            <p className="font-mono tabular-nums text-xs text-muted-foreground">
              {stats.mostDeaths.count} rachas rotas
            </p>
          </div>
        </div>
      )}

      {/* Tombstones */}
      {graves.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <Cross className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            No hay rachas rotas en los \u00faltimos 90 d\u00edas.
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            Todos siguen vivos. Por ahora.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {graves.map((grave, i) => (
            <Tombstone key={`${grave.userId}-${grave.endDate}-${i}`} grave={grave} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TOMBSTONE COMPONENT ────────────────────────────────────

function Tombstone({ grave }: { grave: DeadStreak }) {
  const causeColor =
    grave.causeOfDeath === "Sin actividad"
      ? "text-red-500"
      : grave.causeOfDeath === "Solo breaks"
        ? "text-amber-500"
        : "text-muted-foreground";

  return (
    <div className="border border-border bg-accent/10 p-5 corner-marks flex flex-col items-center text-center transition-colors duration-200 hover:border-primary/30">
      {/* R.I.P. */}
      <p className="font-mono text-lg font-bold text-muted-foreground/60 mb-3 tracking-widest">
        R.I.P.
      </p>

      {/* Streak length */}
      <p className="font-mono tabular-nums text-3xl font-bold tracking-tight mb-0.5">
        {grave.length}
      </p>
      <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-3">
        d\u00edas de racha
      </p>

      {/* Name */}
      <p className="font-mono font-bold text-sm mb-2 truncate max-w-full">
        {grave.name}
      </p>

      {/* Date range */}
      <p className="font-mono text-[10px] text-muted-foreground mb-3">
        {format(new Date(grave.startDate + "T12:00:00"), "dd MMM yyyy", { locale: es })}
        {" \u2014 "}
        {format(new Date(grave.endDate + "T12:00:00"), "dd MMM yyyy", { locale: es })}
      </p>

      {/* Cause of death */}
      <div className="border-t border-border/50 pt-3 mt-auto w-full">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-0.5">
          Causa de muerte
        </p>
        <p className={cn("font-mono text-xs font-bold", causeColor)}>
          {grave.causeOfDeath}
        </p>
      </div>

      {/* Epitaph */}
      <p className="font-mono text-xs italic text-muted-foreground mt-3 leading-relaxed">
        &ldquo;{grave.epitaph}&rdquo;
      </p>
    </div>
  );
}
