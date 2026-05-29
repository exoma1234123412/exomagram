"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TimeEntry, LiveStatus } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials, getTodayMTY, formatHour, timeAgo } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";
import { format, subDays, differenceInHours, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  Users,
  Clock,
  Ghost,
  Eye,
  Copy,
  Layers,
  TimerOff,
  ChevronDown,
  ChevronRight,
  Shield,
  UserX,
  BarChart3,
  Search,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

type ConflictSeverity = "BAJO" | "MEDIO" | "ALTO";

type ConflictType =
  | "meeting_mismatch"
  | "status_vs_entry"
  | "duplicate_description"
  | "impossible_overlap"
  | "ghost_work"
  | "time_travel";

interface Conflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  date: string;
  hour?: number;
  involvedUsers: string[]; // user IDs
  title: string;
  description: string;
  evidence: {
    sideA: string;
    sideB?: string;
  };
  aiAssessment: string;
}

interface MemberData {
  profile: Profile;
  entries: TimeEntry[];
  liveStatus: LiveStatus | null;
}

// ============================================================
// Conflict type metadata
// ============================================================

const CONFLICT_META: Record<
  ConflictType,
  { label: string; icon: typeof AlertTriangle; color: string }
> = {
  meeting_mismatch: {
    label: "Reunión sin par",
    icon: Users,
    color: "text-amber-500",
  },
  status_vs_entry: {
    label: "Status vs Entrada",
    icon: Eye,
    color: "text-red-500",
  },
  duplicate_description: {
    label: "Descripción duplicada",
    icon: Copy,
    color: "text-orange-500",
  },
  impossible_overlap: {
    label: "Solapamiento imposible",
    icon: Layers,
    color: "text-red-500",
  },
  ghost_work: {
    label: "Trabajo fantasma",
    icon: Ghost,
    color: "text-violet-500",
  },
  time_travel: {
    label: "Viaje en el tiempo",
    icon: TimerOff,
    color: "text-blue-500",
  },
};

const SEVERITY_CONFIG: Record<
  ConflictSeverity,
  { color: string; bgColor: string; borderColor: string }
> = {
  BAJO: {
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
  },
  MEDIO: {
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
  },
  ALTO: {
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
  },
};

// ============================================================
// Similarity check for duplicate descriptions
// ============================================================

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-záéíóúüñ0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return 1;
  if (na.length < 5 || nb.length < 5) return 0;
  // Jaccard on word sets
  const setA = new Set(na.split(" "));
  const setB = new Set(nb.split(" "));
  const intersection = new Set([...setA].filter((w) => setB.has(w)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// ============================================================
// Detection engine
// ============================================================

function detectConflicts(
  members: Map<string, MemberData>,
  today: string
): Conflict[] {
  const conflicts: Conflict[] = [];
  let idCounter = 0;
  const nextId = () => `conflict-${++idCounter}`;

  const allEntries: (TimeEntry & { _name: string })[] = [];
  members.forEach((m) => {
    m.entries.forEach((e) => {
      allEntries.push({ ...e, _name: m.profile.full_name || m.profile.email });
    });
  });

  const getName = (userId: string) => {
    const m = members.get(userId);
    return m?.profile.full_name || m?.profile.email || userId.slice(0, 8);
  };

  // ── CONFLICT TYPE 1: Meeting Mismatch ──
  // For each meeting entry, check if anyone else has a meeting at the same hour on the same date
  const meetingEntries = allEntries.filter((e) => e.category === "meeting");
  const meetingsByDateHour = new Map<string, typeof meetingEntries>();
  meetingEntries.forEach((e) => {
    const key = `${e.date}-${e.hour}`;
    if (!meetingsByDateHour.has(key)) meetingsByDateHour.set(key, []);
    meetingsByDateHour.get(key)!.push(e);
  });

  meetingsByDateHour.forEach((entries, key) => {
    // Group by unique users
    const uniqueUsers = new Set(entries.map((e) => e.user_id));
    if (uniqueUsers.size === 1) {
      // Only one person has a meeting — no corroboration
      const entry = entries[0];
      const name = getName(entry.user_id);
      const [date, hourStr] = key.split("-");
      const hour = parseInt(hourStr);
      conflicts.push({
        id: nextId(),
        type: "meeting_mismatch",
        severity: "MEDIO",
        date,
        hour,
        involvedUsers: [entry.user_id],
        title: `Reunión sin corroborar`,
        description: `${name} registró una reunión a las ${formatHour(hour)} pero nadie más tiene reunión a esa hora`,
        evidence: {
          sideA: `${name}: "${entry.title}" (${CATEGORIES.meeting.label})`,
          sideB: `Resto del equipo: sin reuniones a las ${formatHour(hour)}`,
        },
        aiAssessment:
          "Posible reunión externa legítima, o reunión inventada. Si se repite con frecuencia, patrón sospechoso.",
      });
    } else if (uniqueUsers.size >= 2) {
      // Multiple people have meetings — check if descriptions are consistent
      const descs = entries.map((e) => ({
        userId: e.user_id,
        title: e.title,
        desc: e.description || e.title,
      }));
      // Check all pairs for low similarity
      for (let i = 0; i < descs.length; i++) {
        for (let j = i + 1; j < descs.length; j++) {
          const sim = similarity(descs[i].desc, descs[j].desc);
          if (sim < 0.25) {
            const [date, hourStr] = key.split("-");
            const hour = parseInt(hourStr);
            const nameA = getName(descs[i].userId);
            const nameB = getName(descs[j].userId);
            conflicts.push({
              id: nextId(),
              type: "meeting_mismatch",
              severity: "BAJO",
              date,
              hour,
              involvedUsers: [descs[i].userId, descs[j].userId],
              title: `Reuniones no coinciden`,
              description: `${nameA} y ${nameB} tienen reuniones a las ${formatHour(hour)} pero las descripciones no coinciden`,
              evidence: {
                sideA: `${nameA}: "${descs[i].title}"`,
                sideB: `${nameB}: "${descs[j].title}"`,
              },
              aiAssessment:
                "Podrían ser reuniones distintas. Verificar si realmente son la misma reunión con distintas descripciones.",
            });
          }
        }
      }
    }
  });

  // ── CONFLICT TYPE 2: Status vs Entry ──
  members.forEach((m) => {
    const ls = m.liveStatus;
    if (!ls) return;
    if (ls.status !== "idle" && ls.status !== "offline") return;

    // Check how long they've been in that status
    const lastBeat = new Date(ls.last_heartbeat);
    const now = new Date();
    const idleHours = differenceInHours(now, lastBeat);

    if (idleHours < 2) return;

    // Check if they have entries logged during the idle period
    const todayEntries = m.entries.filter((e) => e.date === today);
    const currentHour = new Date().getHours();
    const idleStartHour = Math.max(0, currentHour - idleHours);
    const entriesDuringIdle = todayEntries.filter(
      (e) => e.hour >= idleStartHour && e.hour <= currentHour
    );

    if (entriesDuringIdle.length > 0) {
      const name = getName(m.profile.id);
      const categories = [
        ...new Set(entriesDuringIdle.map((e) => CATEGORIES[e.category]?.label)),
      ].join(", ");
      conflicts.push({
        id: nextId(),
        type: "status_vs_entry",
        severity: "ALTO",
        date: today,
        involvedUsers: [m.profile.id],
        title: `Status contradice entradas`,
        description: `${name} estaba ${ls.status === "idle" ? "inactivo" : "offline"} según el sistema pero registró ${categories} de ${formatHour(idleStartHour)} a ${formatHour(currentHour)}`,
        evidence: {
          sideA: `Sistema: ${ls.status} desde ${timeAgo(ls.last_heartbeat)}`,
          sideB: `Entradas: ${entriesDuringIdle.length} horas registradas (${categories})`,
        },
        aiAssessment:
          "Discrepancia directa entre presencia y registro. Alta probabilidad de entradas inventadas a menos que el sistema de heartbeat falló.",
      });
    }
  });

  // ── CONFLICT TYPE 3: Duplicate Descriptions ──
  // Cross-user: similar descriptions at the same hour but different categories
  const entriesByDateHour = new Map<string, typeof allEntries>();
  allEntries.forEach((e) => {
    const key = `${e.date}-${e.hour}`;
    if (!entriesByDateHour.has(key)) entriesByDateHour.set(key, []);
    entriesByDateHour.get(key)!.push(e);
  });

  entriesByDateHour.forEach((entries, key) => {
    if (entries.length < 2) return;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[i].user_id === entries[j].user_id) continue;
        const descA = entries[i].description || entries[i].title;
        const descB = entries[j].description || entries[j].title;
        const sim = similarity(descA, descB);
        if (sim > 0.7) {
          const [date, hourStr] = key.split("-");
          const hour = parseInt(hourStr);
          const nameA = getName(entries[i].user_id);
          const nameB = getName(entries[j].user_id);
          const sameCat = entries[i].category === entries[j].category;
          conflicts.push({
            id: nextId(),
            type: "duplicate_description",
            severity: sameCat ? "BAJO" : "MEDIO",
            date,
            hour,
            involvedUsers: [entries[i].user_id, entries[j].user_id],
            title: `Descripciones casi idénticas`,
            description: `${nameA} y ${nameB} registraron descripciones casi idénticas a las ${formatHour(hour)}`,
            evidence: {
              sideA: `${nameA} [${CATEGORIES[entries[i].category]?.label}]: "${entries[i].title}"`,
              sideB: `${nameB} [${CATEGORIES[entries[j].category]?.label}]: "${entries[j].title}"`,
            },
            aiAssessment: sameCat
              ? "Posible trabajo colaborativo legítimo, pero verificar que ambos contribuyeron."
              : "Categorías distintas con descripción idéntica es altamente sospechoso. Posible copia.",
          });
        }
      }
    }
  });

  // ── CONFLICT TYPE 4: Impossible Overlap ──
  members.forEach((m) => {
    const name = getName(m.profile.id);

    // Check for same hour with conflicting categories on same date
    const byDateHour = new Map<string, TimeEntry[]>();
    m.entries.forEach((e) => {
      const key = `${e.date}-${e.hour}`;
      if (!byDateHour.has(key)) byDateHour.set(key, []);
      byDateHour.get(key)!.push(e);
    });

    byDateHour.forEach((entries, key) => {
      if (entries.length < 2) return;
      const cats = [...new Set(entries.map((e) => e.category))];
      if (cats.length >= 2) {
        const [date, hourStr] = key.split("-");
        const hour = parseInt(hourStr);
        const catLabels = cats
          .map((c) => CATEGORIES[c]?.label || c)
          .join(" + ");
        conflicts.push({
          id: nextId(),
          type: "impossible_overlap",
          severity: "ALTO",
          date,
          hour,
          involvedUsers: [m.profile.id],
          title: `Categorías contradictorias`,
          description: `${name} registró ${catLabels} para la misma hora (${formatHour(hour)})`,
          evidence: {
            sideA: entries.map((e) => `${CATEGORIES[e.category]?.label}: "${e.title}"`).join(" | "),
          },
          aiAssessment:
            "No se puede hacer deep work y estar en reunión simultáneamente. Una de las entradas es falsa.",
        });
      }
    });

    // Check for 12+ hours in a day
    const byDate = new Map<string, Set<number>>();
    m.entries.forEach((e) => {
      if (!byDate.has(e.date)) byDate.set(e.date, new Set());
      byDate.get(e.date)!.add(e.hour);
    });

    byDate.forEach((hours, date) => {
      if (hours.size >= 12) {
        conflicts.push({
          id: nextId(),
          type: "impossible_overlap",
          severity: "MEDIO",
          date,
          involvedUsers: [m.profile.id],
          title: `Día excesivo: ${hours.size}h`,
          description: `${name} registró ${hours.size} horas el ${format(parseISO(date), "d MMM", { locale: es })}`,
          evidence: {
            sideA: `${hours.size} horas registradas en un solo día`,
          },
          aiAssessment:
            hours.size >= 14
              ? "Humanamente cuestionable. Posible padding de horas."
              : "Día largo pero posible. Verificar si hay evidencia en las entradas.",
        });
      }
    });
  });

  // ── CONFLICT TYPE 5: Ghost Work ──
  // Entry says "meeting with [NAME]" but [NAME] has no meeting logged
  allEntries.forEach((entry) => {
    if (entry.category !== "meeting") return;
    const desc = (entry.description || entry.title).toLowerCase();

    members.forEach((m) => {
      if (m.profile.id === entry.user_id) return;
      const targetName = (m.profile.full_name || "").toLowerCase();
      if (!targetName || targetName.length < 3) return;

      // Check if the description mentions this person
      const firstName = targetName.split(" ")[0];
      if (!desc.includes(firstName)) return;

      // Check if the mentioned person has a meeting at the same date/hour
      const hasMeeting = m.entries.some(
        (e) =>
          e.date === entry.date &&
          e.hour === entry.hour &&
          e.category === "meeting"
      );

      if (!hasMeeting) {
        const authorName = getName(entry.user_id);
        const mentionedName = getName(m.profile.id);
        conflicts.push({
          id: nextId(),
          type: "ghost_work",
          severity: "ALTO",
          date: entry.date,
          hour: entry.hour,
          involvedUsers: [entry.user_id, m.profile.id],
          title: `Reunión fantasma`,
          description: `${authorName} dice reunión con ${mentionedName} pero ${mentionedName} no tiene reunión registrada`,
          evidence: {
            sideA: `${authorName}: "${entry.title}" a las ${formatHour(entry.hour)}`,
            sideB: `${mentionedName}: sin reunión a las ${formatHour(entry.hour)} el ${entry.date}`,
          },
          aiAssessment:
            "Reunión mencionando a alguien que no la registró. Posible fabricación o la otra persona olvidó registrar.",
        });
      }
    });
  });

  // Entry says "code review" but no matching entry from another user
  allEntries.forEach((entry) => {
    if (entry.category !== "review") return;
    const desc = (entry.description || entry.title).toLowerCase();

    // Check if description mentions "PR" or a specific person
    if (!desc.includes("pr") && !desc.includes("pull request") && !desc.includes("review de")) return;

    // Check if any other member has an entry that could be the PR author
    let hasCorroboration = false;
    members.forEach((m) => {
      if (m.profile.id === entry.user_id) return;
      // Look for deep_work or code-related entries near the same time
      const nearEntries = m.entries.filter(
        (e) =>
          e.date === entry.date &&
          Math.abs(e.hour - entry.hour) <= 2 &&
          (e.category === "deep_work" || e.category === "review")
      );
      if (nearEntries.length > 0) hasCorroboration = true;
    });

    if (!hasCorroboration && allEntries.length > 5) {
      // Only flag if team is active enough
      const name = getName(entry.user_id);
      conflicts.push({
        id: nextId(),
        type: "ghost_work",
        severity: "BAJO",
        date: entry.date,
        hour: entry.hour,
        involvedUsers: [entry.user_id],
        title: `Code review sin autor`,
        description: `${name} registró code review pero no hay actividad de desarrollo correspondiente de otros miembros`,
        evidence: {
          sideA: `${name}: "${entry.title}" (Code Review)`,
          sideB: `Nadie registró desarrollo o PR cerca de esa hora`,
        },
        aiAssessment:
          "Podría ser un review de PR externo o antiguo. Pero si es recurrente, posible fabricación.",
      });
    }
  });

  // ── CONFLICT TYPE 6: Time Travel ──
  allEntries.forEach((entry) => {
    // Compare logged_at with the entry's date+hour
    const entryTime = new Date(`${entry.date}T${String(entry.hour).padStart(2, "0")}:00:00`);
    const loggedAt = new Date(entry.logged_at || entry.created_at);
    const hoursLate = differenceInHours(loggedAt, entryTime);

    if (hoursLate >= 24) {
      const name = getName(entry.user_id);
      const entryDay = format(parseISO(entry.date), "EEEE", { locale: es });
      const logDay = format(loggedAt, "EEEE", { locale: es });
      const logTime = format(loggedAt, "h:mm a");

      conflicts.push({
        id: nextId(),
        type: "time_travel",
        severity: hoursLate >= 48 ? "ALTO" : "MEDIO",
        date: entry.date,
        hour: entry.hour,
        involvedUsers: [entry.user_id],
        title: `Entrada retroactiva (${hoursLate}h tarde)`,
        description: `${name} registró el ${entryDay} a las ${formatHour(entry.hour)}... pero lo subió el ${logDay} a las ${logTime}`,
        evidence: {
          sideA: `Hora registrada: ${entry.date} ${formatHour(entry.hour)}`,
          sideB: `Momento de subida: ${format(loggedAt, "yyyy-MM-dd")} ${logTime} (${hoursLate}h después)`,
        },
        aiAssessment:
          hoursLate >= 48
            ? "Más de 2 días después. Altamente probable que sea inventada — la memoria no retiene detalles hora por hora."
            : "24+ horas después. La precisión del recuerdo se degrada significativamente.",
      });
    }
  });

  // Deduplicate: keep only the highest-severity conflict for the same users + date + hour + type
  const seen = new Map<string, Conflict>();
  conflicts.forEach((c) => {
    const key = `${c.type}-${c.date}-${c.hour ?? "x"}-${c.involvedUsers.sort().join(",")}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, c);
    } else {
      const sevOrder: ConflictSeverity[] = ["BAJO", "MEDIO", "ALTO"];
      if (sevOrder.indexOf(c.severity) > sevOrder.indexOf(existing.severity)) {
        seen.set(key, c);
      }
    }
  });

  return [...seen.values()].sort((a, b) => {
    // Sort: ALTO first, then by date descending
    const sevOrder: ConflictSeverity[] = ["ALTO", "MEDIO", "BAJO"];
    const sevDiff =
      sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity);
    if (sevDiff !== 0) return sevDiff;
    return b.date.localeCompare(a.date);
  });
}

// ============================================================
// Main Page
// ============================================================

export default function ConflictsPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [members, setMembers] = useState<Map<string, MemberData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedConflicts, setExpandedConflicts] = useState<Set<string>>(
    new Set()
  );
  const [filterType, setFilterType] = useState<ConflictType | "all">("all");
  const [filterSeverity, setFilterSeverity] = useState<ConflictSeverity | "all">("all");

  const today = getTodayMTY();

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    const sevenDaysAgo = format(
      subDays(new Date(today + "T12:00:00"), 7),
      "yyyy-MM-dd"
    );

    // Fetch all org members with profiles
    const { data: orgMembers } = await supabase
      .from("org_members")
      .select("user_id, profiles(id, email, full_name, avatar_url, role, timezone, work_start_hour, work_end_hour, setup_completed, created_at, updated_at)")
      .eq("org_id", orgId);

    if (!orgMembers) {
      setLoading(false);
      return;
    }

    const userIds = orgMembers.map((m) => m.user_id);

    // Fetch entries for last 7 days + today
    const { data: entries } = await supabase
      .from("time_entries")
      .select("*")
      .eq("org_id", orgId)
      .gte("date", sevenDaysAgo)
      .lte("date", today)
      .in("user_id", userIds);

    // Fetch live statuses
    const { data: liveStatuses } = await supabase
      .from("live_status")
      .select("*")
      .eq("org_id", orgId)
      .in("user_id", userIds);

    // Build member map
    const memberMap = new Map<string, MemberData>();
    orgMembers.forEach((m) => {
      const profile = m.profiles as unknown as Profile;
      if (!profile) return;
      memberMap.set(m.user_id, {
        profile: { ...profile, id: m.user_id },
        entries: (entries || []).filter((e) => e.user_id === m.user_id) as TimeEntry[],
        liveStatus:
          (liveStatuses || []).find((ls) => ls.user_id === m.user_id) as LiveStatus | null,
      });
    });

    setMembers(memberMap);
    setLoading(false);
  }, [orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (orgLoading) return;
    loadData();
  }, [orgLoading, loadData]);

  // Detect conflicts
  const allConflicts = useMemo(
    () => (members.size > 0 ? detectConflicts(members, today) : []),
    [members, today]
  );

  // Filter
  const filteredConflicts = useMemo(() => {
    return allConflicts.filter((c) => {
      if (filterType !== "all" && c.type !== filterType) return false;
      if (filterSeverity !== "all" && c.severity !== filterSeverity) return false;
      return true;
    });
  }, [allConflicts, filterType, filterSeverity]);

  // Split into today vs history
  const todayConflicts = useMemo(
    () => filteredConflicts.filter((c) => c.date === today),
    [filteredConflicts, today]
  );
  const historyConflicts = useMemo(
    () => filteredConflicts.filter((c) => c.date !== today),
    [filteredConflicts, today]
  );

  // Stats
  const stats = useMemo(() => {
    const byType = new Map<ConflictType, number>();
    const byPerson = new Map<string, number>();

    allConflicts.forEach((c) => {
      byType.set(c.type, (byType.get(c.type) || 0) + 1);
      c.involvedUsers.forEach((uid) => {
        byPerson.set(uid, (byPerson.get(uid) || 0) + 1);
      });
    });

    const topPerson = [...byPerson.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0];

    return {
      total: allConflicts.length,
      alto: allConflicts.filter((c) => c.severity === "ALTO").length,
      medio: allConflicts.filter((c) => c.severity === "MEDIO").length,
      bajo: allConflicts.filter((c) => c.severity === "BAJO").length,
      byType,
      topPerson: topPerson
        ? {
            userId: topPerson[0],
            name:
              members.get(topPerson[0])?.profile.full_name ||
              members.get(topPerson[0])?.profile.email ||
              "Desconocido",
            count: topPerson[1],
          }
        : null,
    };
  }, [allConflicts, members]);

  function toggleConflict(id: string) {
    setExpandedConflicts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Loading state ──
  if (loading || orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 bg-grid-palantir min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Detección de Conflictos
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          AI cross-referencia entradas, status y descripciones para detectar
          inconsistencias
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Total conflictos
          </p>
          <p className="font-mono text-2xl font-bold tabular-nums tracking-tight">
            {stats.total}
          </p>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/80 mb-1">
            Severidad alta
          </p>
          <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-red-500">
            {stats.alto}
          </p>
        </div>
        <div className="bg-orange-500/5 border border-orange-500/20 p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-orange-500/80 mb-1">
            Severidad media
          </p>
          <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-orange-500">
            {stats.medio}
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Severidad baja
          </p>
          <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-yellow-500">
            {stats.bajo}
          </p>
        </div>
      </div>

      {/* Worst offender */}
      {stats.topPerson && (
        <div className="mb-8 bg-red-500/5 border border-red-500/20 p-4 flex items-center gap-3">
          <UserX className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <p className="font-mono text-xs font-bold text-red-500">
              Persona con más conflictos
            </p>
            <p className="font-mono text-sm mt-0.5">
              <span className="font-bold">{stats.topPerson.name}</span>
              <span className="text-muted-foreground">
                {" "}
                -- {stats.topPerson.count} conflicto
                {stats.topPerson.count !== 1 ? "s" : ""} detectados
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <div className="flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Filtrar:
          </span>
        </div>
        <select
          value={filterType}
          onChange={(e) =>
            setFilterType(e.target.value as ConflictType | "all")
          }
          className="bg-accent/30 border border-border px-2 py-1 font-mono text-[11px] text-foreground"
        >
          <option value="all">Todos los tipos</option>
          {Object.entries(CONFLICT_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
        <select
          value={filterSeverity}
          onChange={(e) =>
            setFilterSeverity(e.target.value as ConflictSeverity | "all")
          }
          className="bg-accent/30 border border-border px-2 py-1 font-mono text-[11px] text-foreground"
        >
          <option value="all">Todas las severidades</option>
          <option value="ALTO">ALTO</option>
          <option value="MEDIO">MEDIO</option>
          <option value="BAJO">BAJO</option>
        </select>
      </div>

      {/* ── TODAY'S CONFLICTS ── */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4">
          Conflictos activos hoy
        </p>

        {todayConflicts.length === 0 ? (
          <div className="border border-border p-8 text-center">
            <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-4">
              <Shield className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              Sin conflictos detectados hoy
            </p>
            <p className="font-mono text-[10px] text-muted-foreground mt-1">
              Las entradas de hoy son consistentes entre sí
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayConflicts.map((conflict) => (
              <ConflictCard
                key={conflict.id}
                conflict={conflict}
                members={members}
                expanded={expandedConflicts.has(conflict.id)}
                onToggle={() => toggleConflict(conflict.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── HISTORY ── */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4">
          Historial de conflictos (últimos 7 días)
        </p>

        {historyConflicts.length === 0 ? (
          <div className="border border-border p-6 text-center">
            <p className="font-mono text-xs text-muted-foreground">
              Sin conflictos en los últimos 7 días
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {historyConflicts.map((conflict) => (
              <ConflictCard
                key={conflict.id}
                conflict={conflict}
                members={members}
                expanded={expandedConflicts.has(conflict.id)}
                onToggle={() => toggleConflict(conflict.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── BREAKDOWN BY TYPE ── */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4">
          Estadísticas por tipo
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(CONFLICT_META).map(([key, meta]) => {
            const count = stats.byType.get(key as ConflictType) || 0;
            const Icon = meta.icon;
            return (
              <div
                key={key}
                className="bg-accent/30 border border-border p-3 flex items-center gap-3"
              >
                <Icon className={cn("w-4 h-4 shrink-0", meta.color)} />
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-muted-foreground truncate">
                    {meta.label}
                  </p>
                  <p className="font-mono text-lg font-bold tabular-nums tracking-tight">
                    {count}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── PER-PERSON BREAKDOWN ── */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-4">
          Conflictos por persona
        </p>
        <div className="border border-border divide-y divide-border">
          {[...members.entries()]
            .map(([uid, m]) => ({
              uid,
              name: m.profile.full_name || m.profile.email,
              avatar: m.profile.avatar_url,
              count: allConflicts.filter((c) =>
                c.involvedUsers.includes(uid)
              ).length,
              alto: allConflicts.filter(
                (c) =>
                  c.involvedUsers.includes(uid) && c.severity === "ALTO"
              ).length,
            }))
            .sort((a, b) => b.count - a.count)
            .map((person) => (
              <div
                key={person.uid}
                className="flex items-center gap-3 p-3"
              >
                <Avatar className="w-7 h-7 ring-1 ring-border">
                  <AvatarImage src={person.avatar || undefined} />
                  <AvatarFallback className="text-[9px] font-mono font-bold bg-accent">
                    {getInitials(person.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs font-medium truncate">
                    {person.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {person.alto > 0 && (
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px] border-red-500/30 text-red-500 bg-red-500/5"
                    >
                      {person.alto} ALTO
                    </Badge>
                  )}
                  <span className="font-mono text-sm font-bold tabular-nums tracking-tight">
                    {person.count}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    conflictos
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Conflict Card Component
// ============================================================

function ConflictCard({
  conflict,
  members,
  expanded,
  onToggle,
}: {
  conflict: Conflict;
  members: Map<string, MemberData>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = CONFLICT_META[conflict.type];
  const sev = SEVERITY_CONFIG[conflict.severity];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "border transition-colors duration-200",
        sev.borderColor,
        expanded && sev.bgColor
      )}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-3 text-left cursor-pointer hover:bg-accent/20 transition-colors"
      >
        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", meta.color)} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold">
              {conflict.title}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "font-mono text-[9px] font-bold",
                sev.borderColor,
                sev.color,
                sev.bgColor
              )}
            >
              {conflict.severity}
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground">
              {format(parseISO(conflict.date), "d MMM", { locale: es })}
              {conflict.hour !== undefined && ` ${formatHour(conflict.hour)}`}
            </span>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground mt-1 leading-relaxed">
            {conflict.description}
          </p>
        </div>

        {/* Avatars */}
        <div className="flex -space-x-2 shrink-0">
          {conflict.involvedUsers.map((uid) => {
            const m = members.get(uid);
            return (
              <Avatar key={uid} className="w-6 h-6 ring-1 ring-border">
                <AvatarImage src={m?.profile.avatar_url || undefined} />
                <AvatarFallback className="text-[8px] font-mono font-bold bg-accent">
                  {getInitials(m?.profile.full_name || m?.profile.email || "?")}
                </AvatarFallback>
              </Avatar>
            );
          })}
        </div>

        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        )}
      </button>

      {/* Expanded evidence */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/50">
          {/* Evidence */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            <div className="bg-background border border-border p-3">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1.5">
                Lado A
              </p>
              <p className="font-mono text-[11px] leading-relaxed">
                {conflict.evidence.sideA}
              </p>
            </div>
            {conflict.evidence.sideB && (
              <div className="bg-background border border-border p-3">
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1.5">
                  Lado B
                </p>
                <p className="font-mono text-[11px] leading-relaxed">
                  {conflict.evidence.sideB}
                </p>
              </div>
            )}
          </div>

          {/* AI Assessment */}
          <div className="bg-primary/5 border border-primary/20 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <BarChart3 className="w-3 h-3 text-primary" />
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-primary">
                Análisis AI
              </p>
            </div>
            <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
              {conflict.aiAssessment}
            </p>
          </div>

          {/* Involved parties */}
          <div>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
              Involucrados
            </p>
            <div className="flex flex-wrap gap-2">
              {conflict.involvedUsers.map((uid) => {
                const m = members.get(uid);
                return (
                  <div
                    key={uid}
                    className="flex items-center gap-2 bg-accent/30 border border-border px-2 py-1"
                  >
                    <Avatar className="w-5 h-5 ring-1 ring-border">
                      <AvatarImage
                        src={m?.profile.avatar_url || undefined}
                      />
                      <AvatarFallback className="text-[7px] font-mono font-bold bg-accent">
                        {getInitials(
                          m?.profile.full_name || m?.profile.email || "?"
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-mono text-[10px] font-medium">
                      {m?.profile.full_name || m?.profile.email || uid.slice(0, 8)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
