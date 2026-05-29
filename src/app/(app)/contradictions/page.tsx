"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  TimeEntry,
  DailyCloseout,
  Standup,
  DailyPromise,
  MeetingVerification,
  AccountabilityFlag,
} from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import { CATEGORIES, MOOD_LABELS } from "@/lib/constants";
import { format, subDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Split,
  AlertTriangle,
  Users,
  Filter,
  Ghost,
  Clock,
  ThumbsDown,
  MessageSquareWarning,
  ShieldX,
  Handshake,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

type ContradictionType =
  | "blocked_no_evidence"
  | "mood_inconsistent"
  | "ghost_hours"
  | "optimistic_closeout"
  | "broken_promise_denied"
  | "suspicious_meeting";

interface Contradiction {
  id: string;
  type: ContradictionType;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  date: string;
  claim: string;
  reality: string;
  credibilityImpact: number;
  dataPoints: string[];
}

const TYPE_CONFIG: Record<
  ContradictionType,
  { label: string; icon: typeof AlertTriangle }
> = {
  blocked_no_evidence: { label: "Bloqueado sin evidencia", icon: ShieldX },
  mood_inconsistent: { label: "Mood inconsistente", icon: ThumbsDown },
  ghost_hours: { label: "Horas fantasma", icon: Ghost },
  optimistic_closeout: { label: "Closeout optimista", icon: MessageSquareWarning },
  broken_promise_denied: { label: "Promesa rota negada", icon: Handshake },
  suspicious_meeting: { label: "Reunión sospechosa", icon: Users },
};

// ============================================================
// Contradiction Detection Engine
// ============================================================

function detectContradictions(
  entries: TimeEntry[],
  closeouts: DailyCloseout[],
  standups: Standup[],
  promises: DailyPromise[],
  meetingVerifications: MeetingVerification[],
  profiles: Record<string, Profile>,
  expectedDailyHours: number
): Contradiction[] {
  const results: Contradiction[] = [];
  let idCounter = 0;
  const nextId = () => `ctr-${++idCounter}`;

  const getName = (uid: string) => profiles[uid]?.full_name || "Desconocido";
  const getAvatar = (uid: string) => profiles[uid]?.avatar_url || null;

  // Group by user
  const entriesByUser = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    if (e.deleted_at) continue;
    if (!entriesByUser.has(e.user_id)) entriesByUser.set(e.user_id, []);
    entriesByUser.get(e.user_id)!.push(e);
  }

  const closeoutsByUser = new Map<string, DailyCloseout[]>();
  for (const c of closeouts) {
    if (!closeoutsByUser.has(c.user_id)) closeoutsByUser.set(c.user_id, []);
    closeoutsByUser.get(c.user_id)!.push(c);
  }

  const standupsByUser = new Map<string, Standup[]>();
  for (const s of standups) {
    if (!standupsByUser.has(s.user_id)) standupsByUser.set(s.user_id, []);
    standupsByUser.get(s.user_id)!.push(s);
  }

  const promisesByUser = new Map<string, DailyPromise[]>();
  for (const p of promises) {
    if (!promisesByUser.has(p.user_id)) promisesByUser.set(p.user_id, []);
    promisesByUser.get(p.user_id)!.push(p);
  }

  // Verification requests indexed by entry_id
  const verificationByEntry = new Map<string, MeetingVerification[]>();
  for (const v of meetingVerifications) {
    if (!verificationByEntry.has(v.entry_id))
      verificationByEntry.set(v.entry_id, []);
    verificationByEntry.get(v.entry_id)!.push(v);
  }

  for (const [userId, userEntries] of entriesByUser) {
    const userName = getName(userId);
    const avatarUrl = getAvatar(userId);
    const userCloseouts = closeoutsByUser.get(userId) || [];
    const userStandups = standupsByUser.get(userId) || [];
    const userPromises = promisesByUser.get(userId) || [];

    // Group entries by date
    const byDate = new Map<string, TimeEntry[]>();
    for (const e of userEntries) {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date)!.push(e);
    }

    // ─────────────────────────────────────────
    // 1. "Bloqueado" pero sin evidencia de bloqueo
    // ─────────────────────────────────────────
    for (const entry of userEntries) {
      if (entry.category !== "blocked") continue;
      const hasBlockerDetail = entry.blocker_detail && entry.blocker_detail.trim().length > 0;
      const hasDescription = entry.description && entry.description.trim().length > 5;
      const hasLinks = entry.links && entry.links.length > 0;

      if (!hasBlockerDetail && !hasDescription && !hasLinks) {
        const formattedDate = format(parseISO(entry.date), "d MMM", { locale: es });
        const h = entry.hour > 12 ? `${entry.hour - 12}PM` : entry.hour === 12 ? "12PM" : `${entry.hour}AM`;
        results.push({
          id: nextId(),
          type: "blocked_no_evidence",
          userId,
          userName,
          avatarUrl,
          date: entry.date,
          claim: `Reporto "Bloqueado" a las ${h} el ${formattedDate}: "${entry.title}"`,
          reality: `Sin detalle de bloqueo, sin descripcion, sin links. No hay evidencia de que exista un bloqueador real.`,
          credibilityImpact: 8,
          dataPoints: [
            "blocker_detail: vacio",
            "description: vacia",
            `links: ${entry.links?.length || 0}`,
          ],
        });
      }
    }

    // ─────────────────────────────────────────
    // 2. Mood inconsistente
    // ─────────────────────────────────────────
    for (const [date, dayEntries] of byDate) {
      const entryMoods = dayEntries.filter((e) => e.mood != null).map((e) => e.mood!);
      if (entryMoods.length === 0) continue;
      const avgEntryMood = Math.round(entryMoods.reduce((a, b) => a + b, 0) / entryMoods.length);

      const closeout = userCloseouts.find((c) => c.date === date);
      const standup = userStandups.find((s) => s.date === date);

      const moods: { source: string; value: number }[] = [];
      moods.push({ source: "Entradas", value: avgEntryMood });
      if (closeout?.mood) moods.push({ source: "Closeout", value: closeout.mood });
      if (standup?.mood) moods.push({ source: "Standup", value: standup.mood });

      if (moods.length < 2) continue;

      const values = moods.map((m) => m.value);
      const maxDiff = Math.max(...values) - Math.min(...values);

      if (maxDiff >= 2) {
        const formattedDate = format(parseISO(date), "d MMM", { locale: es });
        const moodStrings = moods.map(
          (m) => `${m.source}: ${MOOD_LABELS[m.value] || m.value} (${m.value}/5)`
        );
        results.push({
          id: nextId(),
          type: "mood_inconsistent",
          userId,
          userName,
          avatarUrl,
          date,
          claim: `Reporto moods diferentes el mismo dia (${formattedDate}): ${moods.find((m) => m.value === Math.max(...values))?.source} dice "${MOOD_LABELS[Math.max(...values)]}"`,
          reality: `Los datos del mismo dia se contradicen. ${moods.find((m) => m.value === Math.min(...values))?.source} dice "${MOOD_LABELS[Math.min(...values)]}". Diferencia de ${maxDiff} niveles.`,
          credibilityImpact: maxDiff >= 3 ? 7 : 5,
          dataPoints: moodStrings,
        });
      }
    }

    // ─────────────────────────────────────────
    // 3. Horas fantasma
    // ─────────────────────────────────────────
    for (const entry of userEntries) {
      const hasProof = entry.proof_urls && entry.proof_urls.length > 0;
      const hasDescription = entry.description && entry.description.trim().length > 10;
      const hasLinks = entry.links && entry.links.length > 0;
      const hasTitle = entry.title.trim().length > 15;

      if (!hasProof && !hasDescription && !hasLinks && !hasTitle) {
        const formattedDate = format(parseISO(entry.date), "d MMM", { locale: es });
        const h = entry.hour > 12 ? `${entry.hour - 12}PM` : entry.hour === 12 ? "12PM" : `${entry.hour}AM`;
        results.push({
          id: nextId(),
          type: "ghost_hours",
          userId,
          userName,
          avatarUrl,
          date: entry.date,
          claim: `Registro 1 hora a las ${h} el ${formattedDate}: "${entry.title}"`,
          reality: `Sin prueba, sin descripcion detallada, sin links, titulo menor a 15 caracteres. Hora fantasma: no hay evidencia de que haya trabajado.`,
          credibilityImpact: 10,
          dataPoints: [
            `proof_urls: 0`,
            `description: ${(entry.description || "").length} chars`,
            `links: 0`,
            `title: "${entry.title}" (${entry.title.length} chars)`,
          ],
        });
      }
    }

    // ─────────────────────────────────────────
    // 4. Closeout optimista
    // ─────────────────────────────────────────
    const positivePatterns =
      /\b(productiv[oa]|excelente|buen dia|gran dia|muy bien|satisfech[oa]|logr[eé]|avancé mucho|rindi[oó]|eficiente)\b/i;

    for (const closeout of userCloseouts) {
      const dayEntries = byDate.get(closeout.date) || [];
      const hoursLogged = dayEntries.length;
      const expectedHalf = Math.floor(expectedDailyHours * 0.5);
      const isPositive = positivePatterns.test(closeout.summary);

      if (isPositive && hoursLogged < expectedHalf && hoursLogged > 0) {
        const formattedDate = format(parseISO(closeout.date), "d MMM", { locale: es });
        results.push({
          id: nextId(),
          type: "optimistic_closeout",
          userId,
          userName,
          avatarUrl,
          date: closeout.date,
          claim: `Closeout del ${formattedDate}: "${closeout.summary.slice(0, 120)}${closeout.summary.length > 120 ? "..." : ""}"`,
          reality: `Solo registro ${hoursLogged} de ${expectedDailyHours} horas esperadas (${Math.round((hoursLogged / expectedDailyHours) * 100)}%). Los datos no respaldan un dia "productivo".`,
          credibilityImpact: 6,
          dataPoints: [
            `horas_registradas: ${hoursLogged}`,
            `horas_esperadas: ${expectedDailyHours}`,
            `porcentaje: ${Math.round((hoursLogged / expectedDailyHours) * 100)}%`,
            `mood_closeout: ${closeout.mood ? MOOD_LABELS[closeout.mood] : "---"}`,
          ],
        });
      }
    }

    // ─────────────────────────────────────────
    // 5. Promesa rota negada
    // ─────────────────────────────────────────
    const brokenPromises = userPromises.filter((p) => p.status === "broken");

    for (const broken of brokenPromises) {
      const nextDay = format(
        subDays(parseISO(broken.date), -1),
        "yyyy-MM-dd"
      );
      const nextStandup = userStandups.find((s) => s.date === nextDay);

      if (nextStandup) {
        const blockersText = (nextStandup.blockers || "").toLowerCase();
        const yesterdayText = (nextStandup.yesterday || "").toLowerCase();
        const promiseTitle = broken.title.toLowerCase();

        // Check if the broken promise is mentioned
        const words = promiseTitle.split(/\s+/).filter((w) => w.length > 4);
        const mentioned = words.some(
          (w) => blockersText.includes(w) || yesterdayText.includes(w)
        );

        if (!mentioned) {
          const formattedDate = format(parseISO(broken.date), "d MMM", { locale: es });
          const nextFormatted = format(parseISO(nextDay), "d MMM", { locale: es });
          results.push({
            id: nextId(),
            type: "broken_promise_denied",
            userId,
            userName,
            avatarUrl,
            date: broken.date,
            claim: `Standup del ${nextFormatted}: no menciona la promesa rota del dia anterior`,
            reality: `Prometio "${broken.title}" el ${formattedDate} y no la cumplio. Al dia siguiente, su standup no menciona esto como bloqueador ni en el resumen de ayer.`,
            credibilityImpact: 7,
            dataPoints: [
              `promesa: "${broken.title}"`,
              `status: broken`,
              `mencionado_en_standup: no`,
              `blockers_standup: "${(nextStandup.blockers || "---").slice(0, 80)}"`,
            ],
          });
        }
      }
    }

    // ─────────────────────────────────────────
    // 6. Categoria sospechosa — meetings sin verificacion
    // ─────────────────────────────────────────
    for (const [date, dayEntries] of byDate) {
      const meetingEntries = dayEntries.filter((e) => e.category === "meeting");

      if (meetingEntries.length >= 3) {
        // Check how many have verification requests
        const withVerification = meetingEntries.filter((me) => {
          const verifs = verificationByEntry.get(me.id) || [];
          return verifs.length > 0;
        });

        if (withVerification.length === 0) {
          const formattedDate = format(parseISO(date), "d MMM", { locale: es });
          const titles = meetingEntries.map((e) => `"${e.title}"`).join(", ");
          results.push({
            id: nextId(),
            type: "suspicious_meeting",
            userId,
            userName,
            avatarUrl,
            date,
            claim: `Reporto ${meetingEntries.length} horas de reunion el ${formattedDate}: ${titles}`,
            reality: `${meetingEntries.length} horas de "Reunion" pero 0 solicitudes de verificacion enviadas. Nadie confirma estas reuniones.`,
            credibilityImpact: 6,
            dataPoints: [
              `horas_reunion: ${meetingEntries.length}`,
              `verificaciones_enviadas: 0`,
              ...meetingEntries.map(
                (e) => {
                  const h = e.hour > 12 ? `${e.hour - 12}PM` : e.hour === 12 ? "12PM" : `${e.hour}AM`;
                  return `${h}: "${e.title}"`;
                }
              ),
            ],
          });
        }
      }
    }
  }

  // Sort by credibility impact (highest first)
  results.sort((a, b) => b.credibilityImpact - a.credibilityImpact);

  return results;
}

// ============================================================
// Page Component
// ============================================================

export default function ContradictionsPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [closeouts, setCloseouts] = useState<DailyCloseout[]>([]);
  const [standups, setStandups] = useState<Standup[]>([]);
  const [promises, setPromises] = useState<DailyPromise[]>([]);
  const [meetingVerifications, setMeetingVerifications] = useState<MeetingVerification[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [expectedHours, setExpectedHours] = useState(8);
  const [loading, setLoading] = useState(true);
  const [filterPerson, setFilterPerson] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<ContradictionType | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Load data
  useEffect(() => {
    if (orgLoading || !orgId) return;
    const supabase = createClient();

    async function loadData() {
      setLoading(true);
      const today = getTodayMTY();
      const from = format(subDays(parseISO(today), 7), "yyyy-MM-dd");

      const [
        entriesRes,
        closeoutsRes,
        standupsRes,
        promisesRes,
        verificationsRes,
        profilesRes,
        settingsRes,
      ] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*")
          .eq("org_id", orgId!)
          .gte("date", from)
          .lte("date", today)
          .is("deleted_at", null)
          .order("date", { ascending: true })
          .order("hour", { ascending: true }),
        supabase
          .from("daily_closeouts")
          .select("*")
          .eq("org_id", orgId!)
          .gte("date", from)
          .lte("date", today),
        supabase
          .from("standups")
          .select("*")
          .eq("org_id", orgId!)
          .gte("date", from)
          .lte("date", today),
        supabase
          .from("daily_promises")
          .select("*")
          .eq("org_id", orgId!)
          .gte("date", from)
          .lte("date", today),
        supabase
          .from("meeting_verifications")
          .select("*")
          .eq("org_id", orgId!),
        supabase
          .from("org_members")
          .select("user_id, profiles!inner(id, email, full_name, avatar_url)")
          .eq("org_id", orgId!),
        supabase
          .from("org_settings")
          .select("expected_daily_hours")
          .eq("org_id", orgId!)
          .single(),
      ]);

      if (entriesRes.data) setEntries(entriesRes.data);
      if (closeoutsRes.data) setCloseouts(closeoutsRes.data);
      if (standupsRes.data) setStandups(standupsRes.data as Standup[]);
      if (promisesRes.data) setPromises(promisesRes.data as DailyPromise[]);
      if (verificationsRes.data)
        setMeetingVerifications(verificationsRes.data as MeetingVerification[]);
      if (settingsRes.data) setExpectedHours(settingsRes.data.expected_daily_hours);

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

  // Run detection
  const contradictions = useMemo(() => {
    if (entries.length === 0 || Object.keys(profiles).length === 0) return [];
    return detectContradictions(
      entries,
      closeouts,
      standups,
      promises,
      meetingVerifications,
      profiles,
      expectedHours
    );
  }, [entries, closeouts, standups, promises, meetingVerifications, profiles, expectedHours]);

  // Filter
  const filtered = useMemo(() => {
    return contradictions.filter((c) => {
      if (filterPerson && c.userId !== filterPerson) return false;
      if (filterType && c.type !== filterType) return false;
      return true;
    });
  }, [contradictions, filterPerson, filterType]);

  // Stats
  const stats = useMemo(() => {
    const perPerson = new Map<string, number>();
    const perType = new Map<ContradictionType, number>();
    let totalImpact = 0;

    for (const c of contradictions) {
      perPerson.set(c.userId, (perPerson.get(c.userId) || 0) + 1);
      perType.set(c.type, (perType.get(c.type) || 0) + 1);
      totalImpact += c.credibilityImpact;
    }

    let mostContradictory = { name: "---", count: 0, userId: "" };
    for (const [uid, count] of perPerson) {
      if (count > mostContradictory.count) {
        mostContradictory = { name: profiles[uid]?.full_name || "Desconocido", count, userId: uid };
      }
    }

    let mostCommonType: { type: ContradictionType; count: number } = {
      type: "ghost_hours",
      count: 0,
    };
    for (const [type, count] of perType) {
      if (count > mostCommonType.count) {
        mostCommonType = { type, count };
      }
    }

    return {
      total: contradictions.length,
      totalImpact,
      mostContradictory,
      mostCommonType,
      perPerson,
    };
  }, [contradictions, profiles]);

  // People list
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
          Analizando contradicciones...
        </div>
      </div>
    );
  }

  if (!orgId || !userId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground font-mono text-xs">
          Crea o unete a un equipo desde el Dashboard.
        </p>
      </div>
    );
  }

  // Group contradictions by person for per-person rendering
  const byPerson = new Map<string, Contradiction[]>();
  for (const c of filtered) {
    if (!byPerson.has(c.userId)) byPerson.set(c.userId, []);
    byPerson.get(c.userId)!.push(c);
  }
  // Sort people by number of contradictions desc
  const sortedPeople = Array.from(byPerson.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Split className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Detector de Contradicciones
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Cross-referencia automatica de entradas, closeouts, standups y promesas
          --- ultimos 7 dias
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div
          className={cn(
            "border p-3",
            stats.total > 0
              ? "bg-red-950/10 border-red-500/20"
              : "bg-accent/30 border-border"
          )}
        >
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Contradicciones
          </div>
          <div
            className={cn(
              "font-mono text-2xl tabular-nums tracking-tight",
              stats.total > 0 && "text-red-500"
            )}
          >
            {stats.total}
          </div>
        </div>

        <div className="bg-accent/30 border border-border p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Impacto total
          </div>
          <div className="font-mono text-2xl tabular-nums tracking-tight">
            -{stats.totalImpact}
          </div>
        </div>

        <div
          className={cn(
            "border p-3",
            stats.mostContradictory.count > 0
              ? "bg-red-950/10 border-red-500/20"
              : "bg-accent/30 border-border"
          )}
        >
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Mas contradictorio
          </div>
          <div className="font-mono text-sm tabular-nums tracking-tight truncate">
            {stats.mostContradictory.name}
          </div>
          <div
            className={cn(
              "font-mono text-[10px] tabular-nums",
              stats.mostContradictory.count > 0 && "text-red-500"
            )}
          >
            {stats.mostContradictory.count} contradiccion
            {stats.mostContradictory.count !== 1 && "es"}
          </div>
        </div>

        <div className="bg-accent/30 border border-border p-3">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Tipo mas comun
          </div>
          <div className="font-mono text-xs tracking-tight truncate">
            {stats.total > 0
              ? TYPE_CONFIG[stats.mostCommonType.type].label
              : "---"}
          </div>
          {stats.total > 0 && (
            <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {stats.mostCommonType.count} caso
              {stats.mostCommonType.count !== 1 && "s"}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 border-b border-border pb-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase">
            Filtros
          </span>
        </div>

        <select
          value={filterType || ""}
          onChange={(e) =>
            setFilterType(
              (e.target.value || null) as ContradictionType | null
            )
          }
          className="bg-background border border-border px-2 py-1 font-mono text-xs cursor-pointer"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_CONFIG).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={filterPerson || ""}
          onChange={(e) => setFilterPerson(e.target.value || null)}
          className="bg-background border border-border px-2 py-1 font-mono text-xs cursor-pointer"
        >
          <option value="">Todas las personas</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {(filterPerson || filterType) && (
          <button
            onClick={() => {
              setFilterPerson(null);
              setFilterType(null);
            }}
            className="font-mono text-[10px] text-primary hover:underline cursor-pointer"
          >
            Limpiar filtros
          </button>
        )}

        <span className="ml-auto font-mono text-[10px] text-muted-foreground tabular-nums">
          {filtered.length} de {contradictions.length} resultados
        </span>
      </div>

      {/* Results — per person */}
      {sortedPeople.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
            <Split className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="font-mono text-sm text-muted-foreground mb-1">
            {contradictions.length === 0
              ? "Sin contradicciones detectadas"
              : "Sin resultados para estos filtros"}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {contradictions.length === 0
              ? "Todos los datos de los ultimos 7 dias son coherentes."
              : "Ajusta los filtros para ver resultados."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedPeople.map(([personId, personContradictions]) => {
            const profile = profiles[personId];
            const totalImpact = personContradictions.reduce(
              (sum, c) => sum + c.credibilityImpact,
              0
            );

            return (
              <div key={personId}>
                {/* Person header */}
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="w-8 h-8 ring-1 ring-border">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px] font-mono font-bold bg-accent">
                      {getInitials(profile?.full_name || null)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm font-bold tracking-tight truncate">
                      {profile?.full_name || profile?.email || "---"}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      {personContradictions.length} contradiccion
                      {personContradictions.length !== 1 && "es"} --- impacto
                      total: -{totalImpact} puntos
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-bold tabular-nums tracking-tight text-red-500">
                      -{totalImpact}
                    </div>
                    <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                      Credibilidad
                    </div>
                  </div>
                </div>

                {/* Contradiction cards */}
                <div className="space-y-2">
                  {personContradictions.map((c) => {
                    const typeConfig = TYPE_CONFIG[c.type];
                    const TypeIcon = typeConfig.icon;
                    const isExpanded = expandedCards.has(c.id);
                    const formattedDate = format(parseISO(c.date), "d MMM", {
                      locale: es,
                    });

                    return (
                      <div
                        key={c.id}
                        className="border border-red-500/20 transition-colors duration-200 hover:border-red-500/40"
                      >
                        {/* Card header — type + date */}
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-red-500/10">
                          <TypeIcon className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          <span className="font-mono text-[10px] tracking-wide uppercase text-red-500">
                            {typeConfig.label}
                          </span>
                          <span className="font-mono text-[9px] text-muted-foreground ml-auto tabular-nums">
                            {formattedDate}
                          </span>
                          <span className="font-mono text-[10px] font-bold tabular-nums text-red-500">
                            -{c.credibilityImpact}
                          </span>
                        </div>

                        {/* Claim vs Reality — two columns */}
                        <div className="grid grid-cols-1 sm:grid-cols-2">
                          {/* Claim side */}
                          <div className="px-4 py-3 bg-accent/20">
                            <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
                              Lo que dijo
                            </div>
                            <p className="font-mono text-xs leading-relaxed">
                              {c.claim}
                            </p>
                          </div>

                          {/* Reality side */}
                          <div className="px-4 py-3 bg-red-950/10 border-t sm:border-t-0 sm:border-l border-red-500/10">
                            <div className="flex items-center gap-1.5 mb-2">
                              <ArrowRight className="w-3 h-3 text-red-500 hidden sm:block" />
                              <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500">
                                Lo que muestran los datos
                              </div>
                            </div>
                            <p className="font-mono text-xs leading-relaxed">
                              {c.reality}
                            </p>
                          </div>
                        </div>

                        {/* Bottom — impact + expand */}
                        <button
                          onClick={() => toggleCard(c.id)}
                          className="w-full flex items-center justify-between px-4 py-2 border-t border-red-500/10 cursor-pointer hover:bg-accent/10 transition-colors"
                        >
                          <span className="font-mono text-[10px] text-muted-foreground">
                            Impacto en credibilidad:{" "}
                            <span className="text-red-500 font-bold tabular-nums">
                              -{c.credibilityImpact} puntos
                            </span>
                          </span>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <span className="font-mono text-[9px] uppercase">
                              {isExpanded ? "Ocultar" : "Datos"}
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </div>
                        </button>

                        {/* Expanded data points */}
                        {isExpanded && (
                          <div className="border-t border-border px-4 py-3 bg-accent/10">
                            <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
                              Datos crudos
                            </div>
                            <div className="space-y-1">
                              {c.dataPoints.map((dp, idx) => (
                                <div
                                  key={idx}
                                  className="font-mono text-[11px] text-muted-foreground"
                                >
                                  <span className="text-red-500/70 mr-1.5">
                                    //
                                  </span>
                                  {dp}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 border-t border-border pt-4">
        <p className="font-mono text-[9px] text-muted-foreground text-center tracking-wide">
          ANALISIS AUTOMATIZADO --- {entries.length} ENTRADAS ---{" "}
          {closeouts.length} CLOSEOUTS --- {standups.length} STANDUPS ---{" "}
          {promises.length} PROMESAS --- {Object.keys(profiles).length} PERSONAS
          --- ULTIMOS 7 DIAS
        </p>
      </div>
    </div>
  );
}
