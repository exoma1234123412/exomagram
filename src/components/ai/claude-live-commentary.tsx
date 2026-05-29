"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getTodayMTY, formatHour } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory, Profile } from "@/lib/types/database";
import { Eye, ChevronRight, ChevronLeft } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ObservationType = "warning" | "positive" | "neutral" | "critical";

interface Observation {
  id: string;
  type: ObservationType;
  message: string;
  timestamp: number;
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

const MAX_OBSERVATIONS = 30;
const PERIODIC_CHECK_MS = 10 * 60 * 1000; // 10 minutes
const BACKFILL_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const BACKFILL_THRESHOLD = 3; // 3+ entries in 2 min

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNowMTY(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" }),
  );
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${String(h).padStart(2, "0")}:${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClaudeLiveCommentary() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [observations, setObservations] = useState<Observation[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [newCount, setNewCount] = useState(0);

  // Refs for tracking state across callbacks
  const recentEntriesRef = useRef<Map<string, number[]>>(new Map());
  const userTodayCountRef = useRef<Map<string, number>>(new Map());
  const userNoProofStreakRef = useRef<Map<string, number>>(new Map());
  const userNoDescCountRef = useRef<Map<string, number>>(new Map());
  const profileCacheRef = useRef<Map<string, string>>(new Map());
  const lastEntryTimeRef = useRef<number>(Date.now());
  const orgMembersRef = useRef<{ id: string; name: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ------- Add observation -------
  const addObservation = useCallback(
    (type: ObservationType, message: string) => {
      const obs: Observation = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        message,
        timestamp: Date.now(),
      };
      setObservations((prev) => [obs, ...prev].slice(0, MAX_OBSERVATIONS));
      if (collapsed) {
        setNewCount((c) => c + 1);
      }
    },
    [collapsed],
  );

  // ------- Profile name fetching with cache -------
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

  // ------- Load org members -------
  useEffect(() => {
    if (!orgId) return;

    async function loadMembers() {
      const { data } = await supabase
        .from("org_members")
        .select("user_id, profiles(full_name)")
        .eq("org_id", orgId!);

      if (data) {
        orgMembersRef.current = data.map((m) => ({
          id: m.user_id,
          name: (m.profiles as any)?.full_name ?? "Desconocido",
        }));
        // Pre-populate profile cache
        for (const member of orgMembersRef.current) {
          profileCacheRef.current.set(member.id, member.name);
        }
      }
    }

    loadMembers();
  }, [orgId, supabase]);

  // ------- Load today's entries on mount -------
  useEffect(() => {
    if (!orgId) return;

    async function loadTodayEntries() {
      const today = getTodayMTY();
      const { data } = await supabase
        .from("time_entries")
        .select("user_id, proof_urls, description, logged_at")
        .eq("org_id", orgId!)
        .eq("date", today);

      if (data) {
        const counts = new Map<string, number>();
        const noProofStreaks = new Map<string, number>();
        const noDescCounts = new Map<string, number>();
        let latestTime = 0;

        for (const entry of data) {
          counts.set(entry.user_id, (counts.get(entry.user_id) ?? 0) + 1);

          const hasProof = entry.proof_urls && entry.proof_urls.length > 0;
          if (!hasProof) {
            noProofStreaks.set(
              entry.user_id,
              (noProofStreaks.get(entry.user_id) ?? 0) + 1,
            );
          }

          const hasDesc =
            entry.description && entry.description.trim().length > 0;
          if (!hasDesc) {
            noDescCounts.set(
              entry.user_id,
              (noDescCounts.get(entry.user_id) ?? 0) + 1,
            );
          }

          const loggedTime = new Date(entry.logged_at).getTime();
          if (loggedTime > latestTime) latestTime = loggedTime;
        }

        userTodayCountRef.current = counts;
        userNoProofStreakRef.current = noProofStreaks;
        userNoDescCountRef.current = noDescCounts;
        if (latestTime > 0) lastEntryTimeRef.current = latestTime;
      }

      // Initial observation
      addObservation(
        "neutral",
        "CLAUDE EN VIVO iniciado. Monitoreando actividad del equipo.",
      );
    }

    loadTodayEntries();
  }, [orgId, supabase, addObservation]);

  // ------- Process new entry -------
  const processEntry = useCallback(
    async (entry: RealtimeEntryPayload) => {
      if (entry.org_id !== orgId) return;

      const today = getTodayMTY();
      const fullName = await getProfileName(entry.user_id);
      const now = Date.now();
      lastEntryTimeRef.current = now;

      // --- Backfill detection ---
      const userRecent = recentEntriesRef.current.get(entry.user_id) ?? [];
      userRecent.push(now);
      const windowStart = now - BACKFILL_WINDOW_MS;
      const filtered = userRecent.filter((t) => t >= windowStart);
      recentEntriesRef.current.set(entry.user_id, filtered);

      if (filtered.length >= BACKFILL_THRESHOLD) {
        addObservation(
          "critical",
          `${fullName} registró ${filtered.length} entradas en 2 minutos. ¿Backfilling?`,
        );
        return;
      }

      // --- First entry of day ---
      const prevCount = userTodayCountRef.current.get(entry.user_id) ?? 0;
      userTodayCountRef.current.set(entry.user_id, prevCount + 1);

      if (prevCount === 0 && entry.date === today) {
        const nowMTY = getNowMTY();
        const currentHour = nowMTY.getHours();
        const currentMin = nowMTY.getMinutes();
        const timeStr = `${currentHour > 12 ? currentHour - 12 : currentHour}:${String(currentMin).padStart(2, "0")}${currentHour >= 12 ? "pm" : "am"}`;

        // Count how many other members already logged today
        const othersLogged = Array.from(
          userTodayCountRef.current.entries(),
        ).filter(([uid, count]) => uid !== entry.user_id && count > 0).length;

        if (currentHour >= 10) {
          addObservation(
            "warning",
            `${fullName} por fin apareció. Primera entrada a las ${timeStr}. El equipo empezó hace ${currentHour - 8} horas.`,
          );
        } else {
          addObservation(
            "neutral",
            `${fullName} inicia su día. Primera entrada a las ${timeStr}.${othersLogged > 0 ? ` ${othersLogged} ya registraron antes.` : " Es el primero hoy."}`,
          );
        }
        return;
      }

      // --- Late entry ---
      if (entry.is_late && entry.minutes_late > 0) {
        addObservation(
          "warning",
          `${fullName} registró ${formatHour(entry.hour)} con ${entry.minutes_late} minutos de retraso.`,
        );
        return;
      }

      // --- No proof tracking ---
      const hasProof =
        entry.proof_urls !== null && entry.proof_urls.length > 0;
      if (!hasProof) {
        const streak =
          (userNoProofStreakRef.current.get(entry.user_id) ?? 0) + 1;
        userNoProofStreakRef.current.set(entry.user_id, streak);

        if (streak >= 3) {
          addObservation(
            "critical",
            `${fullName} registra sin evidencia. Es la ${streak}a vez consecutiva.`,
          );
          return;
        }
      } else {
        userNoProofStreakRef.current.set(entry.user_id, 0);
      }

      // --- No description tracking ---
      const hasDesc =
        entry.description && entry.description.trim().length > 0;
      if (!hasDesc) {
        const noDescCount =
          (userNoDescCountRef.current.get(entry.user_id) ?? 0) + 1;
        userNoDescCountRef.current.set(entry.user_id, noDescCount);
      }

      // --- Category + time mismatch ---
      if (entry.category === "deep_work" && entry.hour >= 17) {
        addObservation(
          "warning",
          `${fullName} registra Deep Work a las ${formatHour(entry.hour)}. ¿Compensación de última hora?`,
        );
        return;
      }

      // --- High quality entry ---
      const hasGoodDesc =
        entry.description && entry.description.trim().length >= 30;
      if (hasProof && hasGoodDesc && !entry.is_late) {
        addObservation(
          "positive",
          `${fullName} — entrada detallada con evidencia. Así se hace.`,
        );
        return;
      }

      // --- Default neutral log ---
      const catLabel =
        CATEGORIES[entry.category]?.label ?? entry.category;
      addObservation(
        "neutral",
        `${fullName} registró ${catLabel} a las ${formatHour(entry.hour)}.`,
      );
    },
    [orgId, getProfileName, addObservation],
  );

  // ------- Subscribe to real-time INSERT events -------
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`claude_live_${orgId}`)
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

  // ------- Periodic checks (every 10 minutes) -------
  useEffect(() => {
    if (!orgId) return;

    async function periodicCheck() {
      const now = Date.now();
      const today = getTodayMTY();

      // --- Silence detection ---
      const silenceMinutes = Math.round(
        (now - lastEntryTimeRef.current) / 1000 / 60,
      );

      if (silenceMinutes >= 15) {
        // Find who was the last person to log
        const lastLogger = await (async () => {
          const { data } = await supabase
            .from("time_entries")
            .select("user_id, logged_at")
            .eq("org_id", orgId!)
            .eq("date", today)
            .order("logged_at", { ascending: false })
            .limit(1);

          if (data && data.length > 0) {
            const name = await getProfileName(data[0].user_id);
            return name;
          }
          return null;
        })();

        if (lastLogger) {
          addObservation(
            "warning",
            `El equipo lleva ${silenceMinutes} minutos de silencio. Última entrada: ${lastLogger} hace ${silenceMinutes} min.`,
          );
        } else {
          addObservation(
            "critical",
            `Nadie ha registrado hoy. El equipo lleva ${silenceMinutes} minutos de silencio total.`,
          );
        }
      }

      // --- Missing members detection ---
      const totalMembers = orgMembersRef.current.length;
      if (totalMembers > 0) {
        const loggedMembers = new Set(userTodayCountRef.current.keys());
        const missingMembers = orgMembersRef.current.filter(
          (m) => !loggedMembers.has(m.id),
        );
        const loggedCount = totalMembers - missingMembers.length;

        if (missingMembers.length > 0 && loggedCount > 0) {
          const missingNames = missingMembers
            .map((m) => m.name.split(" ")[0])
            .join(", ");
          addObservation(
            "warning",
            `Solo ${loggedCount} de ${totalMembers} han registrado hoy. Faltan: ${missingNames}.`,
          );
        } else if (loggedCount === 0) {
          const nowMTY = getNowMTY();
          if (nowMTY.getHours() >= 9) {
            addObservation(
              "critical",
              `Son las ${nowMTY.getHours()}:${String(nowMTY.getMinutes()).padStart(2, "0")} y nadie ha registrado una sola entrada.`,
            );
          }
        }
      }

      // --- No description pattern ---
      for (const [uid, count] of userNoDescCountRef.current.entries()) {
        if (count >= 3) {
          const name = await getProfileName(uid);
          addObservation(
            "warning",
            `${name} lleva ${count} entradas sin descripción hoy.`,
          );
        }
      }

      // --- Compare to yesterday ---
      const { data: yesterdayData } = await supabase
        .from("time_entries")
        .select("id", { count: "exact" })
        .eq("org_id", orgId!)
        .eq(
          "date",
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Monterrey",
          }).format(new Date(Date.now() - 86400000)),
        );

      const yesterdayCount = yesterdayData?.length ?? 0;
      const todayCount = Array.from(
        userTodayCountRef.current.values(),
      ).reduce((a, b) => a + b, 0);

      if (yesterdayCount > 0 && todayCount > 0) {
        const nowMTY = getNowMTY();
        if (nowMTY.getHours() >= 12 && todayCount < yesterdayCount * 0.5) {
          addObservation(
            "warning",
            `Ayer el equipo registró ${yesterdayCount} entradas. Hoy llevan ${todayCount}. Van a la mitad del ritmo.`,
          );
        }
      }
    }

    // Run immediately on mount, then every 10 min
    const timeout = setTimeout(periodicCheck, 30_000); // first check after 30s
    const interval = setInterval(periodicCheck, PERIODIC_CHECK_MS);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [orgId, supabase, getProfileName, addObservation]);

  // ------- Toggle handler -------
  const handleToggle = useCallback(() => {
    setCollapsed((prev) => !prev);
    setNewCount(0);
  }, []);

  // Don't render on mobile or if no org
  if (!orgId) return null;

  // ------- Color helpers -------
  const typeColors: Record<
    ObservationType,
    { text: string; border: string; dot: string; bg: string }
  > = {
    critical: {
      text: "text-red-600 dark:text-red-400",
      border: "border-red-500/30",
      dot: "bg-red-500",
      bg: "bg-red-500/5",
    },
    warning: {
      text: "text-amber-600 dark:text-amber-400",
      border: "border-amber-500/30",
      dot: "bg-amber-500",
      bg: "bg-amber-500/5",
    },
    positive: {
      text: "text-green-600 dark:text-green-400",
      border: "border-green-500/30",
      dot: "bg-green-500",
      bg: "bg-green-500/5",
    },
    neutral: {
      text: "text-muted-foreground",
      border: "border-border",
      dot: "bg-muted-foreground",
      bg: "",
    },
  };

  return (
    <>
      {/* Toggle tab — always visible */}
      <button
        onClick={handleToggle}
        className={cn(
          "fixed right-0 top-1/2 -translate-y-1/2 z-[36] hidden md:flex items-center justify-center",
          "w-6 h-20 border border-r-0 border-border bg-card/95 backdrop-blur-sm",
          "hover:bg-accent/50 transition-colors duration-200",
          collapsed && "border-primary/30",
        )}
        title={collapsed ? "Abrir CLAUDE EN VIVO" : "Cerrar panel"}
      >
        <div className="flex flex-col items-center gap-1">
          {collapsed ? (
            <>
              <ChevronLeft className="w-3 h-3 text-muted-foreground" />
              {newCount > 0 && (
                <span className="text-[8px] font-mono font-bold text-primary tabular-nums">
                  {newCount}
                </span>
              )}
            </>
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Main panel — desktop only */}
      <div
        className={cn(
          "fixed right-0 top-12 w-72 h-[calc(100vh-48px)] z-[35]",
          "hidden md:flex flex-col",
          "border-l border-border bg-card/95 backdrop-blur-sm",
          "transition-transform duration-300 ease-in-out",
          collapsed && "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500 shadow-[0_0_6px] shadow-green-500/50" />
            </span>
            <h3 className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-foreground">
              Claude en vivo
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <Eye className="w-3 h-3 text-muted-foreground" />
            <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
              {observations.length}
            </span>
          </div>
        </div>

        {/* Feed */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin"
        >
          {observations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <div className="w-10 h-10 border border-border flex items-center justify-center mb-3">
                <Eye className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">
                Esperando actividad del equipo...
              </p>
            </div>
          ) : (
            <div className="py-1">
              {observations.map((obs, idx) => {
                const colors = typeColors[obs.type];
                return (
                  <div
                    key={obs.id}
                    className={cn(
                      "px-3 py-2 border-b border-border/50 transition-colors duration-200",
                      "hover:bg-accent/20",
                      colors.bg,
                      idx === 0 && "animate-in slide-in-from-top-2 duration-300",
                    )}
                  >
                    {/* Timestamp line */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <div
                        className={cn(
                          "w-1 h-1 rounded-full shrink-0",
                          colors.dot,
                        )}
                      />
                      <span className="font-mono text-[8px] text-muted-foreground tabular-nums tracking-wider">
                        {formatTimestamp(obs.timestamp)}
                      </span>
                      <span className="font-mono text-[8px] text-muted-foreground">
                        //
                      </span>
                      <span className="font-mono text-[8px] text-muted-foreground uppercase tracking-wider">
                        {obs.type === "critical"
                          ? "ALERTA"
                          : obs.type === "warning"
                            ? "AVISO"
                            : obs.type === "positive"
                              ? "OK"
                              : "LOG"}
                      </span>
                    </div>

                    {/* Message */}
                    <p
                      className={cn(
                        "font-mono text-[10px] leading-relaxed",
                        colors.text,
                      )}
                    >
                      {obs.message}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-border">
          <p className="font-mono text-[8px] text-muted-foreground tracking-wider uppercase text-center">
            Vigilancia continua — {orgMembersRef.current.length} miembros
          </p>
        </div>
      </div>
    </>
  );
}
