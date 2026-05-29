"use client";

// ═══════════════════════════════════════════════════════════════
// MORNING SHAME RECAP — DAILY ACCOUNTABILITY OVERLAY
// ═══════════════════════════════════════════════════════════════
//
// The FIRST thing every team member sees when opening the app.
// A full-screen, unskippable overlay recapping yesterday's
// failures across the entire team. Cannot be dismissed until
// a 10-second countdown completes.
//
// Checks localStorage to avoid reshowing the same day.
// Fetches yesterday's time_entries, daily_closeouts, standups,
// and accountability_flags to build the shame report.

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getTodayMTY, cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  X,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  BarChart3,
  Gavel,
  Skull,
  Shield,
  Clock,
  FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackNotificationShown, trackNotificationDismissed } from "@/lib/notification-tracker";
import type {
  Profile,
  TimeEntry,
  DailyCloseout,
  Standup,
  AccountabilityFlag,
} from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberRecap {
  userId: string;
  name: string;
  firstName: string;
  totalHours: number;
  entriesWithProof: number;
  totalEntries: number;
  lateEntries: number;
  hadCloseout: boolean;
  hadStandup: boolean;
  flagCount: number;
  proofRate: number; // 0-100
  lateRate: number; // 0-100
}

type Verdict = "TERRIBLE" | "MALO" | "ACEPTABLE" | "BUENO" | "EXCELENTE";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getYesterdayMTY(): string {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  );
  now.setDate(now.getDate() - 1);
  // Format as YYYY-MM-DD
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getStorageKey(date: string): string {
  return `shame_recap_seen_${date}`;
}

function wasSeenToday(todayDate: string): boolean {
  try {
    return localStorage.getItem(getStorageKey(todayDate)) === "true";
  } catch {
    return false;
  }
}

function markAsSeen(todayDate: string): void {
  try {
    localStorage.setItem(getStorageKey(todayDate), "true");
  } catch {
    // localStorage unavailable
  }
}

function computeVerdict(avgHours: number, proofRate: number, lateRate: number): Verdict {
  const score =
    (avgHours / 8) * 40 + // hours weight
    (proofRate / 100) * 35 + // proof weight
    ((100 - lateRate) / 100) * 25; // punctuality weight

  if (score < 25) return "TERRIBLE";
  if (score < 45) return "MALO";
  if (score < 65) return "ACEPTABLE";
  if (score < 85) return "BUENO";
  return "EXCELENTE";
}

function verdictColor(v: Verdict): string {
  switch (v) {
    case "TERRIBLE":
      return "text-red-500";
    case "MALO":
      return "text-red-400";
    case "ACEPTABLE":
      return "text-amber-400";
    case "BUENO":
      return "text-green-400";
    case "EXCELENTE":
      return "text-green-500";
  }
}

function verdictBorderColor(v: Verdict): string {
  switch (v) {
    case "TERRIBLE":
      return "border-red-500/40";
    case "MALO":
      return "border-red-400/30";
    case "ACEPTABLE":
      return "border-amber-500/30";
    case "BUENO":
      return "border-green-500/30";
    case "EXCELENTE":
      return "border-green-500/40";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MorningShameRecap() {
  const { orgId, userId } = useOrg();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(10);
  const [members, setMembers] = useState<MemberRecap[]>([]);
  const [yesterdayDate, setYesterdayDate] = useState("");

  // Check if we should show the recap
  useEffect(() => {
    if (!orgId || !userId) return;

    const today = getTodayMTY();
    if (wasSeenToday(today)) {
      setVisible(false);
      setLoading(false);
      return;
    }

    // Show the overlay
    setVisible(true);
    trackNotificationShown(`morning-recap-${today}`, "morning_recap", userId);
    fetchYesterdayData();
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer -- only starts when data is loaded
  useEffect(() => {
    if (!visible || loading) return;

    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, loading, countdown]);

  // Fetch yesterday's data
  const fetchYesterdayData = useCallback(async () => {
    if (!orgId) return;

    const supabase = createClient();
    const yesterday = getYesterdayMTY();
    setYesterdayDate(yesterday);

    // Fetch all data in parallel
    const [membersRes, entriesRes, closeoutsRes, standupsRes, flagsRes] =
      await Promise.all([
        supabase
          .from("org_members")
          .select("user_id, profiles(full_name)")
          .eq("org_id", orgId),
        supabase
          .from("time_entries")
          .select("user_id, proof_urls, is_late, hour")
          .eq("org_id", orgId)
          .eq("date", yesterday),
        supabase
          .from("daily_closeouts")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("date", yesterday),
        supabase
          .from("standups")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("date", yesterday),
        supabase
          .from("accountability_flags")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("date", yesterday),
      ]);

    const orgMembers = membersRes.data ?? [];
    const entries = entriesRes.data ?? [];
    const closeouts = closeoutsRes.data ?? [];
    const standups = standupsRes.data ?? [];
    const flags = flagsRes.data ?? [];

    // Build closeout/standup lookup sets
    const closeoutSet = new Set(closeouts.map((c) => c.user_id));
    const standupSet = new Set(standups.map((s) => s.user_id));

    // Build per-member recap
    const recaps: MemberRecap[] = orgMembers.map((m) => {
      const profile = m.profiles as unknown as Profile;
      const fullName = profile?.full_name ?? "Desconocido";
      const firstName = fullName.split(" ")[0];
      const userEntries = entries.filter((e) => e.user_id === m.user_id);
      const withProof = userEntries.filter(
        (e) => e.proof_urls && e.proof_urls.length > 0
      );
      const late = userEntries.filter((e) => e.is_late);
      const userFlags = flags.filter((f) => f.user_id === m.user_id);

      return {
        userId: m.user_id,
        name: fullName,
        firstName,
        totalHours: userEntries.length,
        entriesWithProof: withProof.length,
        totalEntries: userEntries.length,
        lateEntries: late.length,
        hadCloseout: closeoutSet.has(m.user_id),
        hadStandup: standupSet.has(m.user_id),
        flagCount: userFlags.length,
        proofRate:
          userEntries.length > 0
            ? Math.round((withProof.length / userEntries.length) * 100)
            : 0,
        lateRate:
          userEntries.length > 0
            ? Math.round((late.length / userEntries.length) * 100)
            : 0,
      };
    });

    setMembers(recaps);
    setLoading(false);
  }, [orgId]);

  // Computed stats
  const stats = useMemo(() => {
    if (members.length === 0) return null;

    const totalHours = members.reduce((s, m) => s + m.totalHours, 0);
    const avgHours = totalHours / members.length;
    const totalEntries = members.reduce((s, m) => s + m.totalEntries, 0);
    const totalWithProof = members.reduce((s, m) => s + m.entriesWithProof, 0);
    const totalLate = members.reduce((s, m) => s + m.lateEntries, 0);
    const totalFlags = members.reduce((s, m) => s + m.flagCount, 0);
    const proofRate =
      totalEntries > 0 ? Math.round((totalWithProof / totalEntries) * 100) : 0;
    const lateRate =
      totalEntries > 0 ? Math.round((totalLate / totalEntries) * 100) : 0;

    // Sort by hours to find best/worst
    const sorted = [...members].sort((a, b) => a.totalHours - b.totalHours);
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];

    const verdict = computeVerdict(avgHours, proofRate, lateRate);

    // Failures list: who missed what
    const failures: { name: string; issues: string[] }[] = [];
    for (const m of members) {
      const issues: string[] = [];
      if (!m.hadCloseout) issues.push("Sin closeout");
      if (!m.hadStandup) issues.push("Sin Standup");
      if (m.lateEntries > 0) issues.push(`${m.lateEntries} entrada${m.lateEntries > 1 ? "s" : ""} tardia${m.lateEntries > 1 ? "s" : ""}`);
      if (m.totalEntries > 0 && m.proofRate === 0) issues.push("0% evidencia");
      else if (m.totalEntries > 0 && m.proofRate < 50) issues.push(`${m.proofRate}% evidencia`);
      if (m.totalEntries === 0) issues.push("0 entradas registradas");
      if (m.flagCount > 0) issues.push(`${m.flagCount} flag${m.flagCount > 1 ? "s" : ""}`);

      if (issues.length > 0) {
        failures.push({ name: m.firstName, issues });
      }
    }

    return {
      totalHours,
      avgHours,
      proofRate,
      lateRate,
      totalFlags,
      worst,
      best,
      verdict,
      failures,
    };
  }, [members]);

  // Dismiss handler
  function handleDismiss() {
    const today = getTodayMTY();
    trackNotificationDismissed(`morning-recap-${today}`);
    markAsSeen(today);
    setVisible(false);
  }

  // Don't render if not visible
  if (!visible) return null;

  // Format yesterday for display
  let formattedDate = yesterdayDate;
  try {
    if (yesterdayDate) {
      formattedDate = format(parseISO(yesterdayDate), "EEEE d 'de' MMMM, yyyy", {
        locale: es,
      });
      // Capitalize first letter
      formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    }
  } catch {
    // fallback to raw date
  }

  return (
    <div className="fixed inset-0 z-[95] bg-black overflow-y-auto">
      {/* Scanline effect */}
      <div
        className="fixed inset-0 z-[96] pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-[97] max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-32 font-mono">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 border-2 border-red-500/40 flex items-center justify-center bg-red-950/30">
              <Skull className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <p className="font-mono text-[9px] tracking-[0.25em] uppercase text-red-500/50 mb-2">
            Informe obligatorio
          </p>
          <h1 className="font-mono font-bold uppercase tracking-tight text-xl sm:text-2xl text-red-400 mb-2">
            RESUMEN DE VERGUENZA
          </h1>
          <p className="font-mono text-sm text-red-500/60">
            {formattedDate}
          </p>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-red-500/30 to-transparent mt-6" />
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border border-red-500/30 bg-red-950/20 animate-pulse flex items-center justify-center">
              <FileWarning className="w-5 h-5 text-red-500/60" />
            </div>
            <p className="font-mono text-xs text-red-500/40 mt-4 uppercase tracking-wider">
              Recopilando evidencia...
            </p>
          </div>
        )}

        {/* Data loaded */}
        {!loading && stats && (
          <div className="space-y-8">
            {/* ═══════ PEOR RENDIMIENTO ═══════ */}
            <section>
              <SectionHeader
                icon={<TrendingDown className="w-4 h-4 text-red-500" />}
                title="PEOR RENDIMIENTO"
              />
              <div className="border border-red-500/20 bg-red-950/10 p-4">
                <p className="text-lg font-bold text-red-400 mb-1">
                  {stats.worst.firstName}
                </p>
                {stats.worst.totalEntries === 0 ? (
                  <p className="text-sm text-red-400/70">
                    <span className="font-bold">{stats.worst.firstName}</span> no
                    registro NADA ayer.
                  </p>
                ) : (
                  <p className="text-sm text-red-400/70">
                    <span className="font-bold">{stats.worst.firstName}</span>{" "}
                    registro solo{" "}
                    <span className="tabular-nums font-bold text-red-400">
                      {stats.worst.totalHours}
                    </span>{" "}
                    hora{stats.worst.totalHours !== 1 ? "s" : ""}. El equipo
                    promedio{" "}
                    <span className="tabular-nums font-bold text-gray-300">
                      {stats.avgHours.toFixed(1)}
                    </span>
                    .
                  </p>
                )}
              </div>
            </section>

            {/* ═══════ FALTAS DEL DIA ═══════ */}
            <section>
              <SectionHeader
                icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
                title="FALTAS DEL DIA"
              />
              {stats.failures.length === 0 ? (
                <div className="border border-green-500/20 bg-green-950/10 p-4">
                  <p className="text-sm text-green-400">
                    Sin faltas registradas. Dia limpio.
                  </p>
                </div>
              ) : (
                <div className="border border-red-500/20 divide-y divide-red-500/10">
                  {stats.failures.map((f) => (
                    <div
                      key={f.name}
                      className="px-4 py-3 flex items-start gap-3"
                    >
                      <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-bold text-sm text-gray-200">
                          {f.name}
                        </span>
                        <span className="text-sm text-gray-500"> — </span>
                        <span className="text-sm text-red-400/80">
                          {f.issues.join(", ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ═══════ COMPARACION BRUTAL ═══════ */}
            <section>
              <SectionHeader
                icon={<Gavel className="w-4 h-4 text-red-500" />}
                title="COMPARACION BRUTAL"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Best */}
                <div className="border border-green-500/20 bg-green-950/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <p className="text-[9px] tracking-[0.18em] uppercase text-green-500/60">
                      Mejor
                    </p>
                  </div>
                  <p className="font-bold text-green-400 text-base mb-2">
                    {stats.best.firstName}
                  </p>
                  <div className="space-y-1 text-xs text-green-400/70">
                    <p>
                      <span className="tabular-nums font-bold text-green-400">
                        {stats.best.totalHours}h
                      </span>
                      {" registradas"}
                    </p>
                    <p>
                      <span className="tabular-nums font-bold text-green-400">
                        {stats.best.proofRate}%
                      </span>
                      {" evidencia"}
                    </p>
                    <p>
                      {stats.best.lateEntries === 0 ? (
                        <span className="text-green-400">Todo a tiempo</span>
                      ) : (
                        <span>
                          <span className="tabular-nums font-bold">
                            {stats.best.lateEntries}
                          </span>
                          {" tardia(s)"}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Worst */}
                <div className="border border-red-500/20 bg-red-950/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    <p className="text-[9px] tracking-[0.18em] uppercase text-red-500/60">
                      Peor
                    </p>
                  </div>
                  <p className="font-bold text-red-400 text-base mb-2">
                    {stats.worst.firstName}
                  </p>
                  <div className="space-y-1 text-xs text-red-400/70">
                    <p>
                      <span className="tabular-nums font-bold text-red-400">
                        {stats.worst.totalHours}h
                      </span>
                      {" registradas"}
                    </p>
                    <p>
                      <span className="tabular-nums font-bold text-red-400">
                        {stats.worst.proofRate}%
                      </span>
                      {" evidencia"}
                    </p>
                    <p>
                      {stats.worst.lateEntries === 0 ? (
                        <span>Todo a tiempo</span>
                      ) : (
                        <span className="text-red-400">
                          <span className="tabular-nums font-bold">
                            {stats.worst.lateEntries}
                          </span>
                          {" tardia(s)"}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ═══════ EQUIPO EN NUMEROS ═══════ */}
            <section>
              <SectionHeader
                icon={<BarChart3 className="w-4 h-4 text-gray-400" />}
                title="EQUIPO EN NUMEROS"
              />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <StatBox
                  label="Total horas"
                  value={`${stats.totalHours}`}
                  variant="neutral"
                />
                <StatBox
                  label="Promedio"
                  value={stats.avgHours.toFixed(1)}
                  variant={stats.avgHours >= 7 ? "good" : stats.avgHours >= 5 ? "warn" : "bad"}
                />
                <StatBox
                  label="Evidencia"
                  value={`${stats.proofRate}%`}
                  variant={stats.proofRate >= 80 ? "good" : stats.proofRate >= 50 ? "warn" : "bad"}
                />
                <StatBox
                  label="Tardias"
                  value={`${stats.lateRate}%`}
                  variant={stats.lateRate <= 10 ? "good" : stats.lateRate <= 30 ? "warn" : "bad"}
                />
                <StatBox
                  label="Flags"
                  value={`${stats.totalFlags}`}
                  variant={stats.totalFlags === 0 ? "good" : stats.totalFlags <= 3 ? "warn" : "bad"}
                />
              </div>
            </section>

            {/* ═══════ VEREDICTO ═══════ */}
            <section>
              <SectionHeader
                icon={<Shield className="w-4 h-4 text-gray-400" />}
                title="VEREDICTO"
              />
              <div
                className={cn(
                  "border p-5 text-center",
                  verdictBorderColor(stats.verdict),
                  "bg-black"
                )}
              >
                <p className="text-[9px] tracking-[0.25em] uppercase text-gray-500 mb-2">
                  Ayer fue un dia
                </p>
                <p
                  className={cn(
                    "text-3xl font-bold tracking-tight",
                    verdictColor(stats.verdict)
                  )}
                >
                  {stats.verdict}
                </p>
                <p className="text-xs text-gray-500 mt-3 max-w-md mx-auto">
                  {stats.verdict === "TERRIBLE" || stats.verdict === "MALO"
                    ? `${stats.worst.firstName} arrastro al equipo con solo ${stats.worst.totalHours}h y ${stats.worst.proofRate}% de evidencia.`
                    : stats.verdict === "ACEPTABLE"
                    ? `El equipo cumplio lo minimo. ${stats.worst.firstName} fue el eslabon debil.`
                    : stats.verdict === "BUENO"
                    ? `Buen dia en general. ${stats.best.firstName} llevo al equipo con ${stats.best.totalHours}h.`
                    : `Dia excepcional. ${stats.best.firstName} destaco con ${stats.best.totalHours}h y ${stats.best.proofRate}% evidencia.`}
                </p>
              </div>
            </section>
          </div>
        )}

        {/* No data edge case */}
        {!loading && (!stats || members.length === 0) && (
          <div className="text-center py-16">
            <p className="text-sm text-gray-500">
              Sin datos de ayer para mostrar.
            </p>
          </div>
        )}

        {/* ═══════ DISMISS BUTTON ═══════ */}
        <div className="fixed bottom-0 left-0 right-0 z-[98] bg-gradient-to-t from-black via-black/95 to-transparent">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-red-500/20 to-transparent mb-4" />

            {countdown > 0 ? (
              <div className="text-center space-y-3">
                <p className="font-mono text-xs text-gray-500 uppercase tracking-wider">
                  Puedes continuar en{" "}
                  <span className="tabular-nums font-bold text-red-400">
                    {countdown}
                  </span>
                  ...
                </p>
                <Button
                  disabled
                  className={cn(
                    "w-full font-mono text-sm uppercase tracking-wider",
                    "bg-gray-800 text-gray-600 cursor-not-allowed",
                    "h-12 border border-gray-700"
                  )}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Entendido ({countdown})
                </Button>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <p className="font-mono text-[10px] text-gray-600 uppercase tracking-wider">
                  Lectura completada
                </p>
                <Button
                  onClick={handleDismiss}
                  className={cn(
                    "w-full font-mono text-sm uppercase tracking-wider",
                    "bg-red-600 hover:bg-red-500 text-white",
                    "h-12 border border-red-400/30",
                    "transition-all duration-200"
                  )}
                >
                  Entendido
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h2 className="font-mono font-bold uppercase tracking-tight text-sm text-gray-300">
        {title}
      </h2>
      <div className="flex-1 h-px bg-gray-800" />
    </div>
  );
}

function StatBox({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "good" | "warn" | "bad" | "neutral";
}) {
  const borderClass =
    variant === "good"
      ? "border-green-500/20"
      : variant === "warn"
      ? "border-amber-500/20"
      : variant === "bad"
      ? "border-red-500/20"
      : "border-gray-700";

  const valueClass =
    variant === "good"
      ? "text-green-400"
      : variant === "warn"
      ? "text-amber-400"
      : variant === "bad"
      ? "text-red-400"
      : "text-gray-300";

  return (
    <div className={cn("border bg-black p-3 text-center", borderClass)}>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-gray-500 mb-1">
        {label}
      </p>
      <p className={cn("font-mono text-lg font-bold tabular-nums tracking-tight", valueClass)}>
        {value}
      </p>
    </div>
  );
}
