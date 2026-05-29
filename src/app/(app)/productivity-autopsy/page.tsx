"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Skull,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Stethoscope,
  Clock,
  AlertTriangle,
  TrendingDown,
  RotateCw,
  DollarSign,
  Crosshair,
} from "lucide-react";
import { format, subDays, addDays } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ───────────────────────────────────────────────────────────────

interface TeamMemberDay {
  user_id: string;
  full_name: string;
  hours: number;
  trustScore: number | null;
  categories: Record<string, number>;
}

interface HourEntry {
  hora: number;
  status: "vacia" | "registrada" | "parcial";
  detalle: string;
}

interface AutopsyReport {
  persona: string;
  fecha: string;
  horas_registradas: number;
  horas_esperadas: number;
  hora_por_hora: HourEntry[];
  causa_de_muerte: string;
  factores_contribuyentes: string[];
  comparacion_mejor_dia: {
    mejor_dia_fecha: string;
    mejor_dia_horas: number;
    diferencias_clave: string[];
    que_falta: string;
  };
  patron_recurrente: {
    existe: boolean;
    descripcion: string;
    frecuencia: string;
  };
  tiempo_perdido: {
    horas: number;
    costo_estimado: string;
  };
  veredicto: string;
  recomendacion: string;
}

interface AutopsyState {
  loading: boolean;
  report: AutopsyReport | null;
  error: string | null;
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function ProductivityAutopsyPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [date, setDate] = useState(getTodayMTY());
  const [members, setMembers] = useState<TeamMemberDay[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [autopsies, setAutopsies] = useState<Record<string, AutopsyState>>({});
  const supabase = createClient();

  // Load team members and their day stats
  useEffect(() => {
    if (!orgId) return;

    async function loadTeamDay() {
      setLoadingMembers(true);

      const [{ data: orgMembers }, { data: entries }, { data: trustScores }] =
        await Promise.all([
          supabase
            .from("org_members")
            .select("user_id, profiles(full_name)")
            .eq("org_id", orgId!),
          supabase
            .from("time_entries")
            .select("user_id, category")
            .eq("org_id", orgId!)
            .eq("date", date),
          supabase
            .from("trust_score_history")
            .select("user_id, score")
            .eq("org_id", orgId!)
            .eq("date", date),
        ]);

      const trustMap = new Map<string, number>();
      for (const t of trustScores ?? []) {
        trustMap.set(t.user_id, t.score);
      }

      const memberMap = new Map<string, TeamMemberDay>();
      for (const m of orgMembers ?? []) {
        const p = m.profiles as unknown as { full_name: string } | null;
        memberMap.set(m.user_id, {
          user_id: m.user_id,
          full_name: p?.full_name ?? "Sin nombre",
          hours: 0,
          trustScore: trustMap.get(m.user_id) ?? null,
          categories: {},
        });
      }

      for (const e of entries ?? []) {
        const member = memberMap.get(e.user_id);
        if (member) {
          member.hours++;
          member.categories[e.category] = (member.categories[e.category] ?? 0) + 1;
        }
      }

      // Sort: bad days first, then by hours ascending
      const sorted = Array.from(memberMap.values()).sort(
        (a, b) => a.hours - b.hours,
      );
      setMembers(sorted);
      setLoadingMembers(false);
    }

    loadTeamDay();
  }, [orgId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runAutopsy(targetUserId: string) {
    if (!orgId) return;

    setAutopsies((prev) => ({
      ...prev,
      [targetUserId]: { loading: true, report: null, error: null },
    }));

    try {
      const res = await fetch("/api/productivity-autopsy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          target_user_id: targetUserId,
          date,
        }),
      });
      const json = await res.json();
      if (json.error) {
        setAutopsies((prev) => ({
          ...prev,
          [targetUserId]: { loading: false, report: null, error: json.error },
        }));
      } else {
        setAutopsies((prev) => ({
          ...prev,
          [targetUserId]: { loading: false, report: json.autopsy, error: null },
        }));
      }
    } catch {
      setAutopsies((prev) => ({
        ...prev,
        [targetUserId]: {
          loading: false,
          report: null,
          error: "Error conectando con Claude",
        },
      }));
    }
  }

  function isBadDay(m: TeamMemberDay): boolean {
    return m.hours < 4 || (m.trustScore !== null && m.trustScore < 50);
  }

  const isToday = date === getTodayMTY();
  const displayDate = format(
    new Date(date + "T12:00:00"),
    "EEEE, d MMMM yyyy",
    { locale: es },
  );

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Stethoscope className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Autopsia de Productividad
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground capitalize">
          {displayDate}
        </p>
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mt-2">
          Cuando alguien tiene un dia malo, Claude analiza hora por hora que salio mal
        </p>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2 mb-8">
        <Button
          variant="outline"
          size="icon"
          onClick={() =>
            setDate(
              subDays(new Date(date + "T12:00:00"), 1)
                .toISOString()
                .split("T")[0],
            )
          }
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 px-1">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto font-mono text-xs"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() =>
            setDate(
              addDays(new Date(date + "T12:00:00"), 1)
                .toISOString()
                .split("T")[0],
            )
          }
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        {!isToday && (
          <Button
            variant="secondary"
            size="sm"
            className="font-mono text-xs"
            onClick={() => setDate(getTodayMTY())}
          >
            Hoy
          </Button>
        )}
      </div>

      {/* Team members list */}
      {loadingMembers ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
            Cargando equipo...
          </div>
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <Stethoscope className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Sin datos para este dia
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Equipo &mdash; {date}
          </p>
          {members.map((m) => {
            const bad = isBadDay(m);
            const autopsyState = autopsies[m.user_id];

            return (
              <div key={m.user_id}>
                {/* Member row */}
                <div
                  className={cn(
                    "border p-4 transition-colors duration-200",
                    bad
                      ? "border-red-500/40 bg-red-950/10"
                      : "border-border hover:border-primary/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div
                        className={cn(
                          "w-9 h-9 flex items-center justify-center shrink-0 font-mono text-xs font-bold ring-1",
                          bad
                            ? "bg-red-950/30 text-red-400 ring-red-500/30"
                            : "bg-accent/30 text-muted-foreground ring-border",
                        )}
                      >
                        {getInitials(m.full_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-medium truncate">
                          {m.full_name}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span
                            className={cn(
                              "font-mono text-xs tabular-nums",
                              bad ? "text-red-400" : "text-muted-foreground",
                            )}
                          >
                            {m.hours}h registradas
                          </span>
                          {m.trustScore !== null && (
                            <span
                              className={cn(
                                "font-mono text-[10px] tabular-nums",
                                m.trustScore < 50
                                  ? "text-red-400"
                                  : "text-muted-foreground",
                              )}
                            >
                              Trust: {m.trustScore}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Mini category bars */}
                      <div className="hidden sm:flex items-center gap-0.5">
                        {Object.entries(m.categories).map(([cat, count]) => {
                          const catConf =
                            CATEGORIES[cat as WorkCategory];
                          if (!catConf) return null;
                          return (
                            <div
                              key={cat}
                              className={cn(
                                "h-5 flex items-center justify-center font-mono text-[8px] tabular-nums px-1",
                                catConf.bgColor,
                                catConf.color,
                              )}
                              title={`${catConf.label}: ${count}h`}
                              style={{ minWidth: `${count * 16}px` }}
                            >
                              {count}
                            </div>
                          );
                        })}
                      </div>

                      {/* Status badge */}
                      {bad ? (
                        <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-red-400 border border-red-500/30 px-2 py-0.5">
                          Dia malo
                        </span>
                      ) : (
                        <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-green-600 border border-green-600/30 px-2 py-0.5">
                          OK
                        </span>
                      )}

                      {/* Autopsy button */}
                      {bad && !autopsyState?.report && (
                        <Button
                          size="sm"
                          onClick={() => runAutopsy(m.user_id)}
                          disabled={autopsyState?.loading}
                          className="bg-primary text-primary-foreground font-mono text-xs gap-1.5 h-7"
                        >
                          {autopsyState?.loading ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Analizando
                            </>
                          ) : (
                            <>
                              <Stethoscope className="w-3 h-3" />
                              Autopsia
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Loading state */}
                {autopsyState?.loading && (
                  <div className="border border-t-0 border-border p-6">
                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                      <div className="relative">
                        <Stethoscope className="w-10 h-10 text-primary animate-pulse" />
                        <div className="absolute inset-0 w-10 h-10 border border-primary/30 animate-ping" />
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">
                        Claude esta realizando la autopsia...
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        Analizando hora por hora, comparando con mejores dias
                      </p>
                    </div>
                  </div>
                )}

                {/* Error */}
                {autopsyState?.error && (
                  <div className="border border-t-0 border-destructive/20 bg-destructive/5 p-4">
                    <p className="font-mono text-xs text-destructive">
                      {autopsyState.error}
                    </p>
                  </div>
                )}

                {/* Autopsy report */}
                {autopsyState?.report && (
                  <AutopsyReportCard report={autopsyState.report} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Autopsy Report Card ─────────────────────────────────────────────────

function AutopsyReportCard({ report }: { report: AutopsyReport }) {
  return (
    <div className="border border-t-0 border-border corner-marks">
      {/* Report header */}
      <div className="border-b border-border p-4 bg-accent/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Informe de autopsia
            </p>
            <p className="font-mono text-sm font-bold mt-1">
              {report.persona} &mdash; {report.fecha}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                Registradas
              </p>
              <p className="font-mono text-lg font-bold tabular-nums text-red-400">
                {report.horas_registradas}h
              </p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-right">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                Esperadas
              </p>
              <p className="font-mono text-lg font-bold tabular-nums text-muted-foreground">
                {report.horas_esperadas}h
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Hour-by-hour timeline */}
      <div className="p-4 border-b border-border">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Timeline hora por hora
        </p>
        <div className="flex gap-0.5">
          {(report.hora_por_hora ?? []).map((h) => {
            const isGood = h.status === "registrada";
            const isPartial = h.status === "parcial";
            const isEmpty = h.status === "vacia";
            return (
              <div
                key={h.hora}
                className="flex-1 group relative"
                title={`${h.hora}:00 - ${h.detalle}`}
              >
                <div
                  className={cn(
                    "h-8 flex items-center justify-center font-mono text-[8px] tabular-nums transition-colors",
                    isGood && "bg-green-600/80 text-green-50",
                    isPartial && "bg-amber-500/60 text-amber-50",
                    isEmpty && "bg-red-500/20 text-red-400",
                  )}
                >
                  {h.hora}
                </div>
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                  <div className="bg-popover border border-border p-2 max-w-48 whitespace-normal">
                    <p className="font-mono text-[9px] text-foreground">
                      {h.hora}:00 &mdash; {h.detalle}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-green-600/80" />
            <span className="font-mono text-[8px] text-muted-foreground">
              Registrada
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-amber-500/60" />
            <span className="font-mono text-[8px] text-muted-foreground">
              Parcial
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-red-500/20" />
            <span className="font-mono text-[8px] text-muted-foreground">
              Vacia
            </span>
          </div>
        </div>
      </div>

      {/* Causa de muerte */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Skull className="w-4 h-4 text-red-400" />
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Causa de muerte
          </p>
        </div>
        <p className="font-mono text-sm text-foreground leading-relaxed">
          {report.causa_de_muerte}
        </p>
        {report.factores_contribuyentes?.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Factores contribuyentes
            </p>
            {report.factores_contribuyentes.map((f, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                <p className="font-mono text-xs text-muted-foreground">{f}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comparacion con mejor dia */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <TrendingDown className="w-4 h-4 text-primary" />
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Comparacion con su mejor dia
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="border border-red-500/30 bg-red-950/10 p-3">
            <p className="font-mono text-[8px] tracking-[0.15em] uppercase text-red-400">
              Este dia
            </p>
            <p className="font-mono text-2xl font-bold tabular-nums text-red-400 mt-1">
              {report.horas_registradas}h
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {report.fecha}
            </p>
          </div>
          <div className="border border-green-600/30 bg-green-950/10 p-3">
            <p className="font-mono text-[8px] tracking-[0.15em] uppercase text-green-600">
              Mejor dia
            </p>
            <p className="font-mono text-2xl font-bold tabular-nums text-green-600 mt-1">
              {report.comparacion_mejor_dia?.mejor_dia_horas ?? 0}h
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {report.comparacion_mejor_dia?.mejor_dia_fecha ?? "N/A"}
            </p>
          </div>
        </div>
        {report.comparacion_mejor_dia?.diferencias_clave?.length > 0 && (
          <div className="space-y-1 mb-2">
            {report.comparacion_mejor_dia.diferencias_clave.map((d, i) => (
              <p key={i} className="font-mono text-xs text-muted-foreground">
                &mdash; {d}
              </p>
            ))}
          </div>
        )}
        {report.comparacion_mejor_dia?.que_falta && (
          <div className="bg-accent/30 border border-border p-3 mt-2">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
              Que falta
            </p>
            <p className="font-mono text-xs text-foreground">
              {report.comparacion_mejor_dia.que_falta}
            </p>
          </div>
        )}
      </div>

      {/* Patron recurrente */}
      {report.patron_recurrente && (
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <RotateCw className="w-4 h-4 text-primary" />
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Patron recurrente
            </p>
          </div>
          {report.patron_recurrente.existe ? (
            <div className="border border-red-500/20 bg-red-950/5 p-3 space-y-2">
              <p className="font-mono text-xs text-foreground">
                {report.patron_recurrente.descripcion}
              </p>
              <p className="font-mono text-[10px] text-red-400">
                Frecuencia: {report.patron_recurrente.frecuencia}
              </p>
            </div>
          ) : (
            <p className="font-mono text-xs text-muted-foreground">
              {report.patron_recurrente.descripcion}
            </p>
          )}
        </div>
      )}

      {/* Tiempo perdido */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-4 h-4 text-red-400" />
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Tiempo perdido
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <p className="font-mono text-2xl font-bold tabular-nums text-red-400">
              {report.tiempo_perdido?.horas ?? 0}h
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              horas no productivas
            </p>
          </div>
          <div className="w-px h-10 bg-border" />
          <div>
            <p className="font-mono text-2xl font-bold tabular-nums text-red-400">
              {report.tiempo_perdido?.costo_estimado ?? "$0"}
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              costo estimado
            </p>
          </div>
        </div>
      </div>

      {/* Veredicto */}
      <div className="p-4 border-b border-border bg-accent/10">
        <div className="flex items-center gap-2 mb-2">
          <Crosshair className="w-4 h-4 text-foreground" />
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Veredicto
          </p>
        </div>
        <p className="font-mono text-sm font-bold text-foreground leading-relaxed">
          {report.veredicto}
        </p>
      </div>

      {/* Recomendacion */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Stethoscope className="w-4 h-4 text-primary" />
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            Recomendacion
          </p>
        </div>
        <p className="font-mono text-xs text-foreground">
          {report.recomendacion}
        </p>
      </div>
    </div>
  );
}
