"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import {
  ScanEye,
  AlertTriangle,
  Calendar,
  Repeat,
  Users,
  TrendingDown,
} from "lucide-react";
import { format, subDays, getDay } from "date-fns";
import { es } from "date-fns/locale";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ExcuseRecord {
  text: string;
  userId: string;
  date: string;
  source: "blocked_entry" | "closeout_blocker" | "standup_blocker" | "flag";
}

interface ProfileMap {
  [userId: string]: { full_name: string | null; avatar_url: string | null };
}

interface PatternMatch {
  keyword: string;
  count: number;
  dates: string[];
  sources: ExcuseRecord[];
}

interface PersonPatterns {
  userId: string;
  totalExcuses: number;
  patterns: PatternMatch[];
  dayOfWeekCounts: number[]; // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  legitimacyScore: number; // 0-100, lower = more suspicious
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

const EXCUSE_KEYWORDS: { keywords: string[]; label: string }[] = [
  { keywords: ["internet", "wifi", "conexion", "conexión", "red", "lag", "vpn"], label: "problemas de internet" },
  { keywords: ["reunion", "reunión", "meeting", "junta", "call", "llamada"], label: "exceso de reuniones" },
  { keywords: ["enfermo", "doctor", "salud", "gripe", "fiebre", "medico", "médico"], label: "problemas de salud" },
  { keywords: ["sistema", "servidor", "deploy", "bug", "error", "crash", "caido", "caído"], label: "fallas técnicas" },
  { keywords: ["bloqueado", "esperando", "dependo", "dependencia", "aprobacion", "aprobación", "permiso"], label: "dependencias externas" },
  { keywords: ["personal", "familia", "hijo", "casa", "emergencia"], label: "asuntos personales" },
  { keywords: ["tráfico", "trafico", "transporte", "tarde", "llegué", "llegue"], label: "problemas de transporte" },
  { keywords: ["cansado", "cansancio", "sueño", "dormí", "dormi", "agotado"], label: "fatiga / cansancio" },
  { keywords: ["luz", "electricidad", "apagón", "apagon", "corte"], label: "cortes de energía" },
  { keywords: ["no tuve tiempo", "no me dio tiempo", "no alcancé", "no alcance", "faltó tiempo"], label: "falta de tiempo" },
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function extractPatterns(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const group of EXCUSE_KEYWORDS) {
    if (group.keywords.some((kw) => lower.includes(kw))) {
      matched.push(group.label);
    }
  }
  // If no known pattern matched, use a generic bucket
  if (matched.length === 0) matched.push("excusa genérica");
  return matched;
}

function computeLegitimacy(patterns: PatternMatch[]): number {
  if (patterns.length === 0) return 100;
  // The more a single excuse repeats, the less likely it's legitimate
  const maxRepeat = Math.max(...patterns.map((p) => p.count));
  // Base: 80% for 1 use, drops by 15% per additional repeat, floor at 5%
  const score = Math.max(5, Math.round(80 - (maxRepeat - 1) * 15));
  return score;
}

function legitimacyColor(score: number): string {
  if (score >= 60) return "text-green-600";
  if (score >= 40) return "text-amber-600";
  if (score >= 20) return "text-orange-600";
  return "text-red-600";
}

function legitimacyBarColor(score: number): string {
  if (score >= 60) return "bg-green-600";
  if (score >= 40) return "bg-amber-600";
  if (score >= 20) return "bg-orange-600";
  return "bg-red-600";
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function ExcusePatternsPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [excuses, setExcuses] = useState<ExcuseRecord[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(true);

  // ─── Data loading ───

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    const since = format(subDays(new Date(), 90), "yyyy-MM-dd");

    const [
      { data: blockedEntries },
      { data: closeouts },
      { data: standups },
      { data: flags },
      { data: orgMembers },
    ] = await Promise.all([
      // 1. Blocked entries + low-detail entries from last 90 days
      supabase
        .from("time_entries")
        .select("id, user_id, date, title, description, category")
        .eq("org_id", orgId)
        .eq("category", "blocked")
        .gte("date", since)
        .order("date", { ascending: false }),
      // 2. Closeout blockers
      supabase
        .from("daily_closeouts")
        .select("id, user_id, date, blockers")
        .eq("org_id", orgId)
        .not("blockers", "is", null)
        .gte("date", since)
        .order("date", { ascending: false }),
      // 3. Standup blockers
      supabase
        .from("standups")
        .select("id, user_id, date, blockers")
        .eq("org_id", orgId)
        .not("blockers", "is", null)
        .gte("date", since)
        .order("date", { ascending: false }),
      // 4. Accountability flags
      supabase
        .from("accountability_flags")
        .select("id, user_id, date, details, flag_type")
        .eq("org_id", orgId)
        .gte("date", since)
        .order("date", { ascending: false }),
      // 5. Profiles
      supabase
        .from("org_members")
        .select("user_id, profiles(id, full_name, avatar_url)")
        .eq("org_id", orgId),
    ]);

    // Build profile map
    const pMap: ProfileMap = {};
    for (const m of orgMembers ?? []) {
      const p = m.profiles as unknown as Profile;
      if (p) pMap[m.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url };
    }
    setProfiles(pMap);

    // Build excuse records
    const allExcuses: ExcuseRecord[] = [];

    for (const entry of blockedEntries ?? []) {
      const text = entry.description?.trim() || entry.title?.trim();
      if (text && text.length > 0) {
        allExcuses.push({
          text,
          userId: entry.user_id,
          date: entry.date,
          source: "blocked_entry",
        });
      }
    }

    for (const co of closeouts ?? []) {
      if (co.blockers && co.blockers.trim().length > 0) {
        allExcuses.push({
          text: co.blockers.trim(),
          userId: co.user_id,
          date: co.date,
          source: "closeout_blocker",
        });
      }
    }

    for (const su of standups ?? []) {
      if (su.blockers && su.blockers.trim().length > 0) {
        allExcuses.push({
          text: su.blockers.trim(),
          userId: su.user_id,
          date: su.date,
          source: "standup_blocker",
        });
      }
    }

    for (const flag of flags ?? []) {
      if (flag.details && flag.details.trim().length > 0) {
        allExcuses.push({
          text: flag.details.trim(),
          userId: flag.user_id,
          date: flag.date,
          source: "flag",
        });
      }
    }

    setExcuses(allExcuses);
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgLoading && orgId) loadData();
  }, [orgLoading, orgId, loadData]);

  // ─── Computed: per-person patterns ───

  const personPatterns = useMemo(() => {
    const map = new Map<string, ExcuseRecord[]>();
    for (const ex of excuses) {
      const arr = map.get(ex.userId) ?? [];
      arr.push(ex);
      map.set(ex.userId, arr);
    }

    const results: PersonPatterns[] = [];

    for (const [userId, records] of map) {
      // Group by pattern keyword
      const patternMap = new Map<string, PatternMatch>();
      const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];

      for (const rec of records) {
        const labels = extractPatterns(rec.text);
        const dayIdx = getDay(new Date(rec.date + "T12:00:00"));
        dayOfWeekCounts[dayIdx]++;

        for (const label of labels) {
          const existing = patternMap.get(label);
          if (existing) {
            existing.count++;
            if (!existing.dates.includes(rec.date)) existing.dates.push(rec.date);
            existing.sources.push(rec);
          } else {
            patternMap.set(label, {
              keyword: label,
              count: 1,
              dates: [rec.date],
              sources: [rec],
            });
          }
        }
      }

      const patterns = [...patternMap.values()].sort((a, b) => b.count - a.count);
      const legitimacyScore = computeLegitimacy(patterns);

      results.push({
        userId,
        totalExcuses: records.length,
        patterns,
        dayOfWeekCounts,
        legitimacyScore,
      });
    }

    // Sort by most excuses first
    return results.sort((a, b) => b.totalExcuses - a.totalExcuses);
  }, [excuses]);

  // ─── Computed: all detected patterns (cross-person) ───

  const detectedPatterns = useMemo(() => {
    const map = new Map<string, { keyword: string; count: number; users: Set<string>; dates: string[] }>();
    for (const person of personPatterns) {
      for (const pattern of person.patterns) {
        if (pattern.count < 2) continue; // Only flag patterns with 2+ occurrences
        const existing = map.get(pattern.keyword);
        if (existing) {
          existing.count += pattern.count;
          existing.users.add(person.userId);
          for (const d of pattern.dates) {
            if (!existing.dates.includes(d)) existing.dates.push(d);
          }
        } else {
          map.set(pattern.keyword, {
            keyword: pattern.keyword,
            count: pattern.count,
            users: new Set([person.userId]),
            dates: [...pattern.dates],
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [personPatterns]);

  // ─── Computed: leaderboard ───

  const leaderboard = useMemo(
    () => [...personPatterns].sort((a, b) => b.totalExcuses - a.totalExcuses),
    [personPatterns]
  );

  // ─── Loading state ───

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Analizando patrones...
        </p>
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

  // ─── Empty state ───

  if (excuses.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-1">
            <ScanEye className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
              Detector de Patrones de Excusas
            </h1>
          </div>
          <p className="text-xs font-mono text-muted-foreground">
            Ultimos 90 dias - sin datos
          </p>
        </div>
        <div className="border border-border p-8 text-center">
          <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto mb-3">
            <ScanEye className="w-8 h-8 text-primary" />
          </div>
          <p className="text-sm font-mono text-muted-foreground">
            No se detectaron excusas ni bloqueos en los ultimos 90 dias.
          </p>
        </div>
      </div>
    );
  }

  // ─── Stats ───

  const totalPatterns = detectedPatterns.length;
  const totalPersonsWithExcuses = personPatterns.length;
  const avgLegitimacy =
    personPatterns.length > 0
      ? Math.round(personPatterns.reduce((s, p) => s + p.legitimacyScore, 0) / personPatterns.length)
      : 0;
  const worstOffender = leaderboard[0];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* ── Header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <ScanEye className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Detector de Patrones de Excusas
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          Analisis automatico de excusas recurrentes - ultimos 90 dias
        </p>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-accent/30 border border-border p-4 text-center">
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
            {excuses.length}
          </p>
          <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground">
            Excusas totales
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-4 text-center">
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight text-red-600">
            {totalPatterns}
          </p>
          <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground">
            Patrones detectados
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-4 text-center">
          <p className="text-2xl font-mono font-bold tabular-nums tracking-tight">
            {totalPersonsWithExcuses}
          </p>
          <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground">
            Personas implicadas
          </p>
        </div>
        <div className="bg-accent/30 border border-border p-4 text-center">
          <p className={cn("text-2xl font-mono font-bold tabular-nums tracking-tight", legitimacyColor(avgLegitimacy))}>
            {avgLegitimacy}%
          </p>
          <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground">
            Legitimidad promedio
          </p>
        </div>
      </div>

      {/* ── Detected Pattern Cards ── */}
      {detectedPatterns.length > 0 && (
        <section className="mb-8">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Patrones Detectados
          </div>
          <div className="space-y-2">
            {detectedPatterns.map((pattern) => (
              <div
                key={pattern.keyword}
                className="border border-red-500/30 bg-red-950/10 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <span className="text-sm font-mono font-bold uppercase truncate">
                        {pattern.keyword}
                      </span>
                      <Badge
                        variant="destructive"
                        className="text-[9px] font-mono font-bold uppercase shrink-0"
                      >
                        Patron Detectado
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Repeat className="w-3 h-3" />
                        {pattern.count} veces
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {pattern.users.size} persona{pattern.users.size !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {/* Dates list */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {pattern.dates
                        .sort()
                        .slice(0, 12)
                        .map((d) => (
                          <span
                            key={d}
                            className="font-mono text-[10px] text-muted-foreground border border-border px-1.5 py-0.5"
                          >
                            {format(new Date(d + "T12:00:00"), "d MMM", { locale: es })}
                          </span>
                        ))}
                      {pattern.dates.length > 12 && (
                        <span className="font-mono text-[10px] text-muted-foreground px-1.5 py-0.5">
                          +{pattern.dates.length - 12} mas
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-2xl font-mono font-bold tabular-nums tracking-tight text-red-500">
                      {pattern.count}x
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Ranking de Excusas ── */}
      <section className="mb-8">
        <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Ranking de Excusas
        </div>
        <div className="border border-border">
          {/* Header row */}
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-4 py-2 border-b border-border bg-accent/20">
            <span className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground w-6">#</span>
            <span className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground">Persona</span>
            <span className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground text-right">Excusas</span>
            <span className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground text-right w-20">Legitimidad</span>
          </div>
          {leaderboard.map((person, i) => (
            <div
              key={person.userId}
              className={cn(
                "grid grid-cols-[auto_1fr_auto_auto] gap-3 px-4 py-3 items-center",
                i < leaderboard.length - 1 && "border-b border-border"
              )}
            >
              <span className="text-sm font-mono font-bold tabular-nums text-muted-foreground w-6">
                {i + 1}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <Avatar size="sm" className="ring-1 ring-border">
                  <AvatarImage src={profiles[person.userId]?.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {getInitials(profiles[person.userId]?.full_name ?? null)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-mono truncate">
                  {profiles[person.userId]?.full_name ?? "Desconocido"}
                </span>
              </div>
              <span className="text-sm font-mono font-bold tabular-nums tracking-tight text-right">
                {person.totalExcuses}
              </span>
              <div className="w-20 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-accent/30 border border-border overflow-hidden">
                  <div
                    className={cn("h-full transition-all", legitimacyBarColor(person.legitimacyScore))}
                    style={{ width: `${person.legitimacyScore}%` }}
                  />
                </div>
                <span className={cn("text-xs font-mono font-bold tabular-nums", legitimacyColor(person.legitimacyScore))}>
                  {person.legitimacyScore}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Per-Person Detail ── */}
      <section className="mb-8">
        <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Detalle por Persona
        </div>
        <div className="space-y-4">
          {personPatterns.map((person) => {
            const profile = profiles[person.userId];
            const maxDay = Math.max(...person.dayOfWeekCounts, 1);

            return (
              <div
                key={person.userId}
                className="border border-border p-4"
              >
                {/* Person header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="ring-1 ring-border">
                      <AvatarImage src={profile?.avatar_url ?? undefined} />
                      <AvatarFallback>
                        {getInitials(profile?.full_name ?? null)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-mono font-bold">
                        {profile?.full_name ?? "Desconocido"}
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground">
                        Indice de Excusas: {person.totalExcuses} instancias en 90 dias
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-0.5">
                      Legitimidad
                    </p>
                    <p className={cn("text-xl font-mono font-bold tabular-nums tracking-tight", legitimacyColor(person.legitimacyScore))}>
                      {person.legitimacyScore}%
                    </p>
                  </div>
                </div>

                {/* Legitimacy bar */}
                <div className="mb-4">
                  <div className="h-2 bg-accent/20 border border-border w-full overflow-hidden">
                    <div
                      className={cn("h-full transition-all duration-500", legitimacyBarColor(person.legitimacyScore))}
                      style={{ width: `${person.legitimacyScore}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] font-mono text-red-600">Sospechoso</span>
                    <span className="text-[9px] font-mono text-green-600">Legitimo</span>
                  </div>
                </div>

                {/* Day-of-week heatmap */}
                <div className="mb-4">
                  <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">
                    Distribucion por dia de semana
                  </p>
                  <div className="grid grid-cols-7 gap-1">
                    {DAY_LABELS.map((label, idx) => {
                      const count = person.dayOfWeekCounts[idx];
                      const intensity = count > 0 ? Math.max(0.15, count / maxDay) : 0;
                      return (
                        <div key={label} className="text-center">
                          <div
                            className="h-6 border border-border mb-1 flex items-center justify-center transition-colors"
                            style={{
                              backgroundColor: count > 0 ? `rgba(239, 68, 68, ${intensity})` : undefined,
                            }}
                          >
                            {count > 0 && (
                              <span className="text-[10px] font-mono font-bold tabular-nums text-red-400">
                                {count}
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] font-mono text-muted-foreground">
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top recurring excuses */}
                {person.patterns.length > 0 && (
                  <div>
                    <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">
                      Excusas recurrentes
                    </p>
                    <div className="space-y-2">
                      {person.patterns.slice(0, 5).map((pattern) => (
                        <div
                          key={pattern.keyword}
                          className={cn(
                            "border p-3",
                            pattern.count >= 3
                              ? "border-red-500/30 bg-red-950/10"
                              : "border-border"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-mono font-bold uppercase truncate">
                              {pattern.keyword}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              {pattern.count >= 3 && (
                                <Badge
                                  variant="destructive"
                                  className="text-[8px] font-mono font-bold uppercase"
                                >
                                  Patron Detectado
                                </Badge>
                              )}
                              <span className="text-sm font-mono font-bold tabular-nums text-red-500">
                                {pattern.count}x
                              </span>
                            </div>
                          </div>
                          {/* Pattern narrative */}
                          {pattern.count >= 2 && (
                            <p className="text-[11px] font-mono text-muted-foreground mb-1.5">
                              Esta es la {pattern.count}a vez que{" "}
                              {profile?.full_name?.split(" ")[0] ?? "esta persona"} menciona{" "}
                              &ldquo;{pattern.keyword}&rdquo;.
                              {pattern.count >= 3 && (
                                <span className="text-red-500 font-bold">
                                  {" "}Probabilidad de excusa real: {computeLegitimacy([pattern])}%
                                </span>
                              )}
                            </p>
                          )}
                          {/* Dates */}
                          <div className="flex flex-wrap gap-1">
                            {pattern.dates
                              .sort()
                              .map((d) => (
                                <span
                                  key={d}
                                  className="font-mono text-[10px] text-muted-foreground border border-border px-1.5 py-0.5"
                                >
                                  {format(new Date(d + "T12:00:00"), "d MMM", { locale: es })}
                                </span>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Footer ── */}
      <div className="border-t border-border pt-4">
        <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground text-center">
          Analisis automatico basado en {excuses.length} registros de los ultimos 90 dias
        </p>
      </div>
    </div>
  );
}
