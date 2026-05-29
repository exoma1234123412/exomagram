"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TimeEntry } from "@/lib/types/database";
import { cn, getTodayMTY } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";
import { format, subDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ScanSearch,
  AlertTriangle,
  AlertCircle,
  Info,
  Filter,
  Users,
  ChevronDown,
  ChevronRight,
  Clock,
  Ghost,
  Repeat,
  MessageSquareWarning,
  FileSearch,
  BarChart3,
  Calendar,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

type Severity = "ALTO" | "MEDIO" | "BAJO";

type CheckType =
  | "finished_but_continued"
  | "effort_mismatch"
  | "meeting_ghost"
  | "repeated_work"
  | "skill_inconsistency"
  | "hours_vs_output"
  | "timeline_logic";

interface Inconsistency {
  id: string;
  type: CheckType;
  severity: Severity;
  userId: string;
  userName: string;
  title: string;
  explanation: string;
  entries: TimeEntry[];
  dateRange: string;
}

const CHECK_LABELS: Record<CheckType, { label: string; icon: typeof AlertTriangle }> = {
  finished_but_continued: { label: "Terminado pero continuado", icon: Ghost },
  effort_mismatch: { label: "Esfuerzo inconsistente", icon: Clock },
  meeting_ghost: { label: "Reunión fantasma", icon: Users },
  repeated_work: { label: "Trabajo repetido", icon: Repeat },
  skill_inconsistency: { label: "Skill inconsistente", icon: FileSearch },
  hours_vs_output: { label: "Horas vs output", icon: BarChart3 },
  timeline_logic: { label: "Lógica temporal", icon: Calendar },
};

const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string; border: string; label: string }> = {
  ALTO: {
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    label: "ALTO",
  },
  MEDIO: {
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    label: "MEDIO",
  },
  BAJO: {
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    label: "BAJO",
  },
};

// ============================================================
// Consistency Analysis Engine
// ============================================================

function runConsistencyChecks(
  entries: TimeEntry[],
  profiles: Record<string, Profile>
): Inconsistency[] {
  const results: Inconsistency[] = [];
  let idCounter = 0;
  const nextId = () => `inc-${++idCounter}`;

  // Group entries by user
  const byUser = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    if (!byUser.has(e.user_id)) byUser.set(e.user_id, []);
    byUser.get(e.user_id)!.push(e);
  }

  // Group entries by date per user
  function groupByDate(userEntries: TimeEntry[]): Map<string, TimeEntry[]> {
    const map = new Map<string, TimeEntry[]>();
    for (const e of userEntries) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }

  const getName = (userId: string) => profiles[userId]?.full_name || "Desconocido";

  for (const [userId, userEntries] of byUser) {
    const userName = getName(userId);
    const byDate = groupByDate(userEntries);
    const sortedDates = Array.from(byDate.keys()).sort();

    // ─────────────────────────────────────────
    // CHECK 1: "Terminé" but continued
    // ─────────────────────────────────────────
    const finishPatterns = /\b(termin[eéo]|complet[eéo]|finalic[eéo]|listo|acabé|cerré)\b/i;

    for (let i = 0; i < sortedDates.length - 1; i++) {
      const dateEntries = byDate.get(sortedDates[i])!;
      const nextDateEntries = byDate.get(sortedDates[i + 1]);
      if (!nextDateEntries) continue;

      for (const entry of dateEntries) {
        const desc = (entry.description || "").toLowerCase();
        const titleLower = entry.title.toLowerCase();

        if (finishPatterns.test(desc) || finishPatterns.test(titleLower)) {
          // Check if next day has similar title/category
          const similarNext = nextDateEntries.filter(
            (ne) =>
              ne.category === entry.category &&
              (ne.title.toLowerCase().includes(titleLower.slice(0, 15)) ||
                titleLower.includes(ne.title.toLowerCase().slice(0, 15)) ||
                (entry.project && ne.project === entry.project))
          );

          if (similarNext.length > 0) {
            const formattedDate = format(parseISO(sortedDates[i]), "d MMM", { locale: es });
            const formattedNextDate = format(parseISO(sortedDates[i + 1]), "d MMM", { locale: es });
            results.push({
              id: nextId(),
              type: "finished_but_continued",
              severity: "ALTO",
              userId,
              userName,
              title: `Dijo que terminó pero siguió`,
              explanation: `${userName} dijo que terminó "${entry.title}" el ${formattedDate} pero siguió trabajando en lo mismo el ${formattedNextDate}`,
              entries: [entry, ...similarNext],
              dateRange: `${formattedDate} - ${formattedNextDate}`,
            });
          }
        }
      }
    }

    // ─────────────────────────────────────────
    // CHECK 2: Effort mismatch
    // ─────────────────────────────────────────
    const taskHours = new Map<string, { total: number; hasDeepWork: boolean; entries: TimeEntry[] }>();
    for (const entry of userEntries) {
      const key = entry.title.toLowerCase().trim();
      if (!taskHours.has(key)) taskHours.set(key, { total: 0, hasDeepWork: false, entries: [] });
      const t = taskHours.get(key)!;
      t.total += 1;
      if (entry.category === "deep_work") t.hasDeepWork = true;
      t.entries.push(entry);
    }

    for (const [taskTitle, data] of taskHours) {
      if (data.hasDeepWork && data.total <= 2 && taskTitle.length > 15) {
        results.push({
          id: nextId(),
          type: "effort_mismatch",
          severity: "MEDIO",
          userId,
          userName,
          title: `Deep Work con poco tiempo total`,
          explanation: `${userName} registró Deep Work en "${data.entries[0].title}" pero solo dedicó ${data.total} hora${data.total === 1 ? "" : "s"} en toda la semana`,
          entries: data.entries,
          dateRange: `${format(parseISO(data.entries[0].date), "d MMM", { locale: es })} - ${format(parseISO(data.entries[data.entries.length - 1].date), "d MMM", { locale: es })}`,
        });
      }
    }

    // ─────────────────────────────────────────
    // CHECK 3: Meeting ghost
    // ─────────────────────────────────────────
    const meetingEntries = userEntries.filter((e) => e.category === "meeting");
    for (const me of meetingEntries) {
      const desc = (me.description || "").toLowerCase();
      // Find mentioned names
      for (const [otherUserId, otherProfile] of Object.entries(profiles)) {
        if (otherUserId === userId) continue;
        const otherName = (otherProfile.full_name || "").toLowerCase();
        if (!otherName || otherName.length < 3) continue;

        const firstName = otherName.split(" ")[0];
        if (desc.includes(firstName) || desc.includes(otherName)) {
          // Check if that person has a meeting at the same hour on the same date
          const otherEntries = byUser.get(otherUserId) || [];
          const otherMeetingAtSameTime = otherEntries.find(
            (oe) =>
              oe.date === me.date &&
              oe.hour === me.hour &&
              oe.category === "meeting"
          );

          if (!otherMeetingAtSameTime) {
            const formattedDate = format(parseISO(me.date), "d MMM", { locale: es });
            const h = me.hour > 12 ? `${me.hour - 12}PM` : me.hour === 12 ? "12PM" : `${me.hour}AM`;
            results.push({
              id: nextId(),
              type: "meeting_ghost",
              severity: "ALTO",
              userId,
              userName,
              title: `Reunión fantasma`,
              explanation: `${userName} dice que tuvo reunión con ${otherProfile.full_name} a las ${h} el ${formattedDate} pero ${otherProfile.full_name} no tiene reunión registrada`,
              entries: [me],
              dateRange: formattedDate,
            });
          }
        }
      }
    }

    // ─────────────────────────────────────────
    // CHECK 4: Repeated identical work
    // ─────────────────────────────────────────
    const titleDays = new Map<string, Set<string>>();
    for (const entry of userEntries) {
      const key = entry.title.toLowerCase().trim();
      if (!titleDays.has(key)) titleDays.set(key, new Set());
      titleDays.get(key)!.add(entry.date);
    }

    for (const [title, days] of titleDays) {
      if (days.size >= 3 && title.length > 5) {
        const daysArr = Array.from(days).sort();
        const matchingEntries = userEntries.filter(
          (e) => e.title.toLowerCase().trim() === title
        );
        results.push({
          id: nextId(),
          type: "repeated_work",
          severity: "MEDIO",
          userId,
          userName,
          title: `Trabajo idéntico repetido`,
          explanation: `${userName} registró "${matchingEntries[0].title}" en ${days.size} días diferentes. ¿Es la misma tarea sin avance?`,
          entries: matchingEntries,
          dateRange: `${format(parseISO(daysArr[0]), "d MMM", { locale: es })} - ${format(parseISO(daysArr[daysArr.length - 1]), "d MMM", { locale: es })}`,
        });
      }
    }

    // ─────────────────────────────────────────
    // CHECK 5: Skill inconsistency (review without PRs)
    // ─────────────────────────────────────────
    const reviewEntries = userEntries.filter((e) => e.category === "review");
    if (reviewEntries.length >= 3) {
      const prPattern = /\b(pr|pull request|merge|branch|commit|#\d+)\b/i;
      const withPrMention = reviewEntries.filter(
        (e) => prPattern.test(e.description || "") || prPattern.test(e.title)
      );

      if (withPrMention.length === 0) {
        results.push({
          id: nextId(),
          type: "skill_inconsistency",
          severity: "BAJO",
          userId,
          userName,
          title: `Code Review sin mencionar PRs`,
          explanation: `${userName} registra Code Review frecuentemente (${reviewEntries.length} veces) pero nunca menciona PRs específicos`,
          entries: reviewEntries.slice(0, 5),
          dateRange: `${format(parseISO(reviewEntries[0].date), "d MMM", { locale: es })} - ${format(parseISO(reviewEntries[reviewEntries.length - 1].date), "d MMM", { locale: es })}`,
        });
      }
    }

    // ─────────────────────────────────────────
    // CHECK 6: Hours vs output
    // ─────────────────────────────────────────
    const deepWorkEntries = userEntries.filter((e) => e.category === "deep_work");
    if (deepWorkEntries.length >= 8) {
      const totalWords = deepWorkEntries.reduce((sum, e) => {
        const words = (e.description || "").split(/\s+/).filter(Boolean).length;
        return sum + words;
      }, 0);
      const avgWords = Math.round(totalWords / deepWorkEntries.length);

      if (avgWords < 10) {
        results.push({
          id: nextId(),
          type: "hours_vs_output",
          severity: "MEDIO",
          userId,
          userName,
          title: `Muchas horas, poca descripción`,
          explanation: `${userName} registró ${deepWorkEntries.length} horas de Deep Work esta semana con un promedio de ${avgWords} palabras por descripción`,
          entries: deepWorkEntries.slice(0, 5),
          dateRange: `${format(parseISO(deepWorkEntries[0].date), "d MMM", { locale: es })} - ${format(parseISO(deepWorkEntries[deepWorkEntries.length - 1].date), "d MMM", { locale: es })}`,
        });
      }
    }

    // ─────────────────────────────────────────
    // CHECK 7: Timeline logic
    // ─────────────────────────────────────────
    const followUpPattern = /\b(seguimiento|follow.?up|continuaci[oó]n)\b.*\b(reuni[oó]n|meeting|junta)\b.*\b(ayer|anterior)\b/i;
    const followUpPattern2 = /\b(reuni[oó]n|meeting|junta)\b.*\b(ayer|anterior)\b.*\b(seguimiento|follow.?up|continuaci[oó]n)\b/i;

    for (const entry of userEntries) {
      const desc = (entry.description || "").toLowerCase();
      const titleText = entry.title.toLowerCase();
      const combined = `${titleText} ${desc}`;

      if (followUpPattern.test(combined) || followUpPattern2.test(combined)) {
        // Check if previous day has a meeting
        const prevDate = format(subDays(parseISO(entry.date), 1), "yyyy-MM-dd");
        const prevDayEntries = byDate.get(prevDate) || [];
        const hadMeeting = prevDayEntries.some((pe) => pe.category === "meeting");

        if (!hadMeeting) {
          const formattedDate = format(parseISO(entry.date), "d MMM", { locale: es });
          results.push({
            id: nextId(),
            type: "timeline_logic",
            severity: "ALTO",
            userId,
            userName,
            title: `Seguimiento sin reunión previa`,
            explanation: `${userName} menciona seguimiento de reunión el ${formattedDate} pero no hay reunión registrada el día anterior`,
            entries: [entry],
            dateRange: formattedDate,
          });
        }
      }
    }
  }

  // Sort by severity
  const severityOrder: Record<Severity, number> = { ALTO: 0, MEDIO: 1, BAJO: 2 };
  results.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return results;
}

// ============================================================
// Page Component
// ============================================================

export default function ConsistencyPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [filterPerson, setFilterPerson] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<CheckType | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<Severity | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Load data
  useEffect(() => {
    if (orgLoading || !orgId) return;
    const supabase = createClient();

    async function loadData() {
      setLoading(true);
      const today = getTodayMTY();
      const from = format(subDays(parseISO(today), 14), "yyyy-MM-dd");

      // Fetch entries and profiles in parallel
      const [entriesRes, profilesRes] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*")
          .eq("org_id", orgId!)
          .gte("date", from)
          .lte("date", today)
          .order("date", { ascending: true })
          .order("hour", { ascending: true }),
        supabase
          .from("org_members")
          .select("user_id, profiles!inner(id, email, full_name, avatar_url)")
          .eq("org_id", orgId!),
      ]);

      if (entriesRes.data) setEntries(entriesRes.data);

      if (profilesRes.data) {
        const pMap: Record<string, Profile> = {};
        for (const m of profilesRes.data) {
          const p = m.profiles as unknown as Profile;
          if (p) pMap[p.id] = p;
        }
        setProfiles(pMap);
      }

      setLoading(false);
    }

    loadData();
  }, [orgId, orgLoading]);

  // Run analysis
  const inconsistencies = useMemo(() => {
    if (entries.length === 0 || Object.keys(profiles).length === 0) return [];
    return runConsistencyChecks(entries, profiles);
  }, [entries, profiles]);

  // Filter
  const filtered = useMemo(() => {
    return inconsistencies.filter((inc) => {
      if (filterPerson && inc.userId !== filterPerson) return false;
      if (filterType && inc.type !== filterType) return false;
      if (filterSeverity && inc.severity !== filterSeverity) return false;
      return true;
    });
  }, [inconsistencies, filterPerson, filterType, filterSeverity]);

  // Stats
  const stats = useMemo(() => {
    const perPerson = new Map<string, number>();
    for (const inc of inconsistencies) {
      perPerson.set(inc.userId, (perPerson.get(inc.userId) || 0) + 1);
    }

    let worstPerson = { name: "---", count: 0 };
    for (const [uid, count] of perPerson) {
      if (count > worstPerson.count) {
        worstPerson = { name: profiles[uid]?.full_name || "Desconocido", count };
      }
    }

    const bySeverity = { ALTO: 0, MEDIO: 0, BAJO: 0 };
    for (const inc of inconsistencies) {
      bySeverity[inc.severity]++;
    }

    return { perPerson, worstPerson, bySeverity, total: inconsistencies.length };
  }, [inconsistencies, profiles]);

  // People list for filter
  const people = useMemo(() => {
    return Object.entries(profiles)
      .map(([id, p]) => ({ id, name: p.full_name || p.email }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles]);

  function toggleCard(id: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────
  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Analizando consistencia...
        </div>
      </div>
    );
  }

  if (!orgId || !userId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground font-mono text-xs">
          Crea o únete a un equipo desde el Dashboard.
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 bg-grid-palantir min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <ScanSearch className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Análisis de Consistencia
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Cross-referencia automática de entradas en los últimos 14 días --- detectando
          inconsistencias entre días, personas y categorías
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Total
          </div>
          <div className="font-mono text-2xl tabular-nums tracking-tight">
            {stats.total}
          </div>
        </div>
        <div className={cn("border p-3", stats.bySeverity.ALTO > 0 ? "bg-red-500/5 border-red-500/20" : "bg-accent/30 border-border")}>
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Severidad alta
          </div>
          <div className={cn("font-mono text-2xl tabular-nums tracking-tight", stats.bySeverity.ALTO > 0 && "text-red-500")}>
            {stats.bySeverity.ALTO}
          </div>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Severidad media
          </div>
          <div className="font-mono text-2xl tabular-nums tracking-tight text-amber-500">
            {stats.bySeverity.MEDIO}
          </div>
        </div>
        <div className={cn("border p-3", stats.worstPerson.count > 0 ? "bg-red-500/5 border-red-500/20" : "bg-accent/30 border-border")}>
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Más inconsistente
          </div>
          <div className="font-mono text-sm tabular-nums tracking-tight truncate">
            {stats.worstPerson.name}
          </div>
          <div className={cn("font-mono text-[10px] tabular-nums", stats.worstPerson.count > 0 && "text-red-500")}>
            {stats.worstPerson.count} hallazgo{stats.worstPerson.count !== 1 && "s"}
          </div>
        </div>
      </div>

      {/* Per-person breakdown */}
      {stats.perPerson.size > 0 && (
        <div className="mb-8">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Inconsistencias por persona
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(stats.perPerson.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([uid, count]) => (
                <button
                  key={uid}
                  onClick={() => setFilterPerson(filterPerson === uid ? null : uid)}
                  className={cn(
                    "border px-3 py-1.5 font-mono text-xs transition-colors cursor-pointer",
                    filterPerson === uid
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/30"
                  )}
                >
                  <span>{profiles[uid]?.full_name || "---"}</span>
                  <span className="ml-2 tabular-nums text-red-500 font-bold">{count}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 border-b border-border pb-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase">Filtros</span>
        </div>

        {/* Type filter */}
        <select
          value={filterType || ""}
          onChange={(e) => setFilterType((e.target.value || null) as CheckType | null)}
          className="bg-background border border-border px-2 py-1 font-mono text-xs cursor-pointer"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(CHECK_LABELS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {/* Severity filter */}
        <select
          value={filterSeverity || ""}
          onChange={(e) => setFilterSeverity((e.target.value || null) as Severity | null)}
          className="bg-background border border-border px-2 py-1 font-mono text-xs cursor-pointer"
        >
          <option value="">Toda severidad</option>
          <option value="ALTO">ALTO</option>
          <option value="MEDIO">MEDIO</option>
          <option value="BAJO">BAJO</option>
        </select>

        {/* Person filter */}
        <select
          value={filterPerson || ""}
          onChange={(e) => setFilterPerson(e.target.value || null)}
          className="bg-background border border-border px-2 py-1 font-mono text-xs cursor-pointer"
        >
          <option value="">Todas las personas</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {(filterPerson || filterType || filterSeverity) && (
          <button
            onClick={() => {
              setFilterPerson(null);
              setFilterType(null);
              setFilterSeverity(null);
            }}
            className="font-mono text-[10px] text-primary hover:underline cursor-pointer"
          >
            Limpiar filtros
          </button>
        )}

        <span className="ml-auto font-mono text-[10px] text-muted-foreground tabular-nums">
          {filtered.length} de {inconsistencies.length} resultados
        </span>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
            <ScanSearch className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="font-mono text-sm text-muted-foreground mb-1">
            {inconsistencies.length === 0
              ? "Sin inconsistencias detectadas"
              : "Sin resultados para estos filtros"}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {inconsistencies.length === 0
              ? "Todas las entradas de los últimos 14 días son consistentes."
              : "Ajusta los filtros para ver resultados."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inc) => {
            const sevConfig = SEVERITY_CONFIG[inc.severity];
            const checkConfig = CHECK_LABELS[inc.type];
            const isExpanded = expandedCards.has(inc.id);
            const CheckIcon = checkConfig.icon;

            return (
              <div
                key={inc.id}
                className={cn(
                  "border transition-colors duration-200",
                  sevConfig.border,
                  "hover:border-primary/30"
                )}
              >
                {/* Card header */}
                <button
                  onClick={() => toggleCard(inc.id)}
                  className="w-full text-left px-4 py-3 cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    {/* Severity badge */}
                    <div
                      className={cn(
                        "shrink-0 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider border",
                        sevConfig.bg,
                        sevConfig.border,
                        sevConfig.color
                      )}
                    >
                      {inc.severity}
                    </div>

                    {/* Type icon + content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground">
                          {checkConfig.label}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground ml-auto shrink-0">
                          {inc.dateRange}
                        </span>
                      </div>
                      <p className="font-mono text-xs leading-relaxed">
                        {inc.explanation}
                      </p>
                    </div>

                    {/* Expand toggle */}
                    <div className="shrink-0 mt-1">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded: show entries side by side */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 bg-accent/10">
                    <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
                      Entradas relacionadas
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {inc.entries.map((entry, idx) => {
                        const cat = CATEGORIES[entry.category];
                        const h = entry.hour > 12 ? `${entry.hour - 12}PM` : entry.hour === 12 ? "12PM" : `${entry.hour}AM`;
                        return (
                          <div
                            key={entry.id || idx}
                            className="border border-border p-2.5 bg-background"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn("px-1.5 py-0.5 text-[9px] font-mono font-bold", cat?.bgColor, cat?.color)}>
                                {cat?.emoji || "??"}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {format(parseISO(entry.date), "d MMM", { locale: es })} {h}
                              </span>
                            </div>
                            <p className="font-mono text-xs font-medium truncate mb-0.5">
                              {entry.title}
                            </p>
                            {entry.description && (
                              <p className="font-mono text-[10px] text-muted-foreground line-clamp-2">
                                {entry.description}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline view */}
      {inconsistencies.length > 0 && (
        <div className="mt-8">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Timeline de inconsistencias (14 días)
          </div>
          <div className="border border-border p-4 bg-accent/10">
            <div className="flex gap-1 items-end h-24">
              {Array.from({ length: 14 }, (_, i) => {
                const d = format(subDays(parseISO(getTodayMTY()), 13 - i), "yyyy-MM-dd");
                const dayLabel = format(parseISO(d), "dd", { locale: es });
                const count = inconsistencies.filter((inc) =>
                  inc.entries.some((e) => e.date === d)
                ).length;
                const maxCount = Math.max(
                  1,
                  ...Array.from({ length: 14 }, (_, j) => {
                    const dd = format(subDays(parseISO(getTodayMTY()), 13 - j), "yyyy-MM-dd");
                    return inconsistencies.filter((inc) =>
                      inc.entries.some((e) => e.date === dd)
                    ).length;
                  })
                );
                const height = count > 0 ? Math.max(8, (count / maxCount) * 80) : 4;
                const hasHigh = inconsistencies.some(
                  (inc) =>
                    inc.severity === "ALTO" && inc.entries.some((e) => e.date === d)
                );

                return (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        "w-full transition-all duration-300",
                        count === 0
                          ? "bg-muted"
                          : hasHigh
                            ? "bg-red-500"
                            : "bg-amber-500"
                      )}
                      style={{ height: `${height}px` }}
                      title={`${d}: ${count} inconsistencia${count !== 1 ? "s" : ""}`}
                    />
                    <span className="font-mono text-[8px] text-muted-foreground tabular-nums">
                      {dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-4 mt-3 border-t border-border pt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-red-500" />
                <span className="font-mono text-[8px] text-muted-foreground">Incluye ALTO</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-amber-500" />
                <span className="font-mono text-[8px] text-muted-foreground">MEDIO/BAJO</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-muted" />
                <span className="font-mono text-[8px] text-muted-foreground">Sin hallazgos</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 border-t border-border pt-4">
        <p className="font-mono text-[9px] text-muted-foreground text-center tracking-wide">
          ANÁLISIS AUTOMATIZADO --- {entries.length} ENTRADAS --- {Object.keys(profiles).length} PERSONAS --- ÚLTIMOS 14 DÍAS
        </p>
      </div>
    </div>
  );
}
