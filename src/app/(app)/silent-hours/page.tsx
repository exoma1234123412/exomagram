"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatHourShort } from "@/lib/utils";
import { WORK_HOURS } from "@/lib/constants";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  EyeOff,
  Clock,
  AlertTriangle,
  Zap,
  ShieldCheck,
  Users,
  User,
} from "lucide-react";

interface RawEntry {
  user_id: string;
  date: string;
  hour: number;
  proof_urls: string[] | null;
}

interface MemberInfo {
  user_id: string;
  full_name: string | null;
  email: string;
}

interface CellData {
  logged: number;
  withProof: number;
  total: number; // total team members
}

interface DarkZone {
  date: string;
  startHour: number;
  endHour: number;
  length: number;
}

function getCellColor(logged: number, total: number): string {
  if (total === 0) return "bg-slate-200 dark:bg-slate-800";
  const ratio = logged / total;
  if (ratio === 0) return "bg-slate-300/60 dark:bg-slate-800/80";
  if (ratio <= 0.25) return "bg-blue-200 dark:bg-blue-900/60";
  if (ratio <= 0.5) return "bg-green-300 dark:bg-green-800/60";
  if (ratio <= 0.75) return "bg-amber-300 dark:bg-amber-700/60";
  return "bg-orange-400 dark:bg-orange-600/70";
}

function getCellColorIndividual(logged: boolean): string {
  if (!logged) return "bg-slate-300/60 dark:bg-slate-800/80";
  return "bg-orange-400 dark:bg-orange-600/70";
}

export default function SilentHoursPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [entries, setEntries] = useState<RawEntry[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const supabase = createClient();

  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => {
    const result: string[] = [];
    for (let i = 13; i >= 0; i--) {
      result.push(format(subDays(today, i), "yyyy-MM-dd"));
    }
    return result;
  }, [today]);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      return;
    }

    async function load() {
      const startDate = days[0];
      const endDate = days[days.length - 1];

      const [entriesResult, membersResult] = await Promise.all([
        supabase
          .from("time_entries")
          .select("user_id, date, hour, proof_urls")
          .eq("org_id", orgId!)
          .gte("date", startDate)
          .lte("date", endDate)
          .in("hour", WORK_HOURS),
        supabase
          .from("org_members")
          .select("user_id, profiles(full_name, email)")
          .eq("org_id", orgId!),
      ]);

      if (entriesResult.data) {
        setEntries(entriesResult.data as RawEntry[]);
      }

      if (membersResult.data) {
        const mapped: MemberInfo[] = membersResult.data.map((m: any) => ({
          user_id: m.user_id,
          full_name: m.profiles?.full_name ?? null,
          email: m.profiles?.email ?? "",
        }));
        setMembers(mapped);
      }

      setLoading(false);
    }
    load();
  }, [orgLoading, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build heatmap data
  const heatmap = useMemo(() => {
    const totalMembers = members.length || 1;
    const grid: Record<string, Record<number, CellData>> = {};

    for (const day of days) {
      grid[day] = {};
      for (const hour of WORK_HOURS) {
        grid[day][hour] = { logged: 0, withProof: 0, total: totalMembers };
      }
    }

    const filtered = selectedMember
      ? entries.filter((e) => e.user_id === selectedMember)
      : entries;

    for (const entry of filtered) {
      const cell = grid[entry.date]?.[entry.hour];
      if (!cell) continue;
      cell.logged++;
      if (entry.proof_urls && entry.proof_urls.length > 0) {
        cell.withProof++;
      }
    }

    if (selectedMember) {
      for (const day of days) {
        for (const hour of WORK_HOURS) {
          grid[day][hour].total = 1;
        }
      }
    }

    return grid;
  }, [entries, members, days, selectedMember]);

  // Calculate stats
  const stats = useMemo(() => {
    let totalSilent = 0;
    let mostActiveHour = WORK_HOURS[0];
    let mostActiveCount = 0;
    const hourTotals: Record<number, number> = {};
    let silenceEntries = 0;
    let silenceProof = 0;

    for (const hour of WORK_HOURS) {
      hourTotals[hour] = 0;
    }

    for (const day of days) {
      for (const hour of WORK_HOURS) {
        const cell = heatmap[day]?.[hour];
        if (!cell) continue;
        if (cell.logged === 0) {
          totalSilent++;
        }
        hourTotals[hour] += cell.logged;

        // Low activity (<=25% of team) counts as "quiet"
        const threshold = selectedMember ? 0 : Math.ceil(cell.total * 0.25);
        if (cell.logged > 0 && cell.logged <= threshold) {
          silenceEntries += cell.logged;
          silenceProof += cell.withProof;
        }
      }
    }

    for (const hour of WORK_HOURS) {
      if (hourTotals[hour] > mostActiveCount) {
        mostActiveCount = hourTotals[hour];
        mostActiveHour = hour;
      }
    }

    // Longest dark zone
    let longestDark = 0;
    for (const day of days) {
      let currentRun = 0;
      for (const hour of WORK_HOURS) {
        const cell = heatmap[day]?.[hour];
        if (cell && cell.logged === 0) {
          currentRun++;
          if (currentRun > longestDark) longestDark = currentRun;
        } else {
          currentRun = 0;
        }
      }
    }

    const proofDensity =
      silenceEntries > 0
        ? Math.round((silenceProof / silenceEntries) * 100)
        : 0;

    return {
      totalSilent,
      longestDark,
      mostActiveHour,
      proofDensity,
    };
  }, [heatmap, days, selectedMember]);

  // Find dark zones (consecutive silent cells per day)
  const darkZones = useMemo(() => {
    const zones: DarkZone[] = [];

    for (const day of days) {
      let runStart: number | null = null;
      let runLength = 0;

      for (let i = 0; i < WORK_HOURS.length; i++) {
        const hour = WORK_HOURS[i];
        const cell = heatmap[day]?.[hour];

        if (cell && cell.logged === 0) {
          if (runStart === null) runStart = hour;
          runLength++;
        } else {
          if (runLength >= 2 && runStart !== null) {
            zones.push({
              date: day,
              startHour: runStart,
              endHour: WORK_HOURS[i - 1],
              length: runLength,
            });
          }
          runStart = null;
          runLength = 0;
        }
      }
      // Close remaining run
      if (runLength >= 2 && runStart !== null) {
        zones.push({
          date: day,
          startHour: runStart,
          endHour: WORK_HOURS[WORK_HOURS.length - 1],
          length: runLength,
        });
      }
    }

    return zones.sort((a, b) => b.length - a.length).slice(0, 10);
  }, [heatmap, days]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">
          Cargando...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <EyeOff className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">
          Horas de Silencio
        </h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        Visualiza cuando el equipo esta en silencio. Identifica zonas oscuras y
        distingue silencio productivo de horas fantasma.
      </p>

      {/* Member filter */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <button
          onClick={() => setSelectedMember(null)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all",
            !selectedMember
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-accent/60 text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Users className="w-3.5 h-3.5" />
          Equipo completo
        </button>
        {members.map((m) => (
          <button
            key={m.user_id}
            onClick={() => setSelectedMember(m.user_id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all",
              selectedMember === m.user_id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-accent/60 text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <User className="w-3.5 h-3.5" />
            {m.full_name || m.email.split("@")[0]}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-accent/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <EyeOff className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Horas silencio
            </span>
          </div>
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {stats.totalSilent}
          </p>
          <p className="text-[10px] text-muted-foreground">
            celdas sin actividad
          </p>
        </div>

        <div className="bg-accent/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Zona oscura mayor
            </span>
          </div>
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {stats.longestDark}h
          </p>
          <p className="text-[10px] text-muted-foreground">
            consecutivas sin entradas
          </p>
        </div>

        <div className="bg-accent/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Hora mas activa
            </span>
          </div>
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {formatHourShort(stats.mostActiveHour)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            mayor concentracion
          </p>
        </div>

        <div className="bg-accent/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Evidencia en silencio
            </span>
          </div>
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {stats.proofDensity}%
          </p>
          <p className="text-[10px] text-muted-foreground">
            entradas con prueba en zonas bajas
          </p>
        </div>
      </div>

      {/* Heatmap */}
      <Card className="mb-8 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Heatmap de actividad
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Legend */}
          <div className="flex items-center gap-4 mb-4 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-slate-300/60 dark:bg-slate-800/80" />
              <span>Sin actividad</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-blue-200 dark:bg-blue-900/60" />
              <span>Poca</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-green-300 dark:bg-green-800/60" />
              <span>Moderada</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-300 dark:bg-amber-700/60" />
              <span>Alta</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-orange-400 dark:bg-orange-600/70" />
              <span>Todos activos</span>
            </div>
          </div>

          {/* Hour headers */}
          <div className="grid gap-1" style={{ gridTemplateColumns: `80px repeat(${WORK_HOURS.length}, 1fr)` }}>
            <div />
            {WORK_HOURS.map((hour) => (
              <div
                key={hour}
                className="text-[10px] text-muted-foreground text-center font-medium"
              >
                {formatHourShort(hour)}
              </div>
            ))}

            {/* Rows */}
            {days.map((day) => (
              <div key={day} className="contents">
                <div className="text-xs text-muted-foreground flex items-center pr-2 truncate">
                  {format(new Date(day + "T12:00:00"), "EEE d MMM", {
                    locale: es,
                  })}
                </div>
                {WORK_HOURS.map((hour) => {
                  const cell = heatmap[day]?.[hour];
                  const isSilent = cell ? cell.logged === 0 : true;
                  const colorClass = selectedMember
                    ? getCellColorIndividual(cell ? cell.logged > 0 : false)
                    : getCellColor(cell?.logged ?? 0, cell?.total ?? 1);

                  return (
                    <div
                      key={hour}
                      className={cn(
                        "aspect-square rounded-sm transition-all duration-200 cursor-default relative group",
                        colorClass,
                        isSilent && "animate-pulse"
                      )}
                      title={`${format(new Date(day + "T12:00:00"), "d MMM", { locale: es })} ${formatHourShort(hour)}: ${cell?.logged ?? 0}/${cell?.total ?? 0} miembros${cell?.withProof ? ` (${cell.withProof} con prueba)` : ""}`}
                    >
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex z-10">
                        <div className="bg-foreground text-background text-[10px] px-2 py-1 rounded whitespace-nowrap">
                          {cell?.logged ?? 0}/{cell?.total ?? 0} miembros
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dark zones */}
      {darkZones.length > 0 && (
        <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Zonas Oscuras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              Periodos de 2+ horas consecutivas sin ninguna entrada registrada.
            </p>
            <div className="space-y-2">
              {darkZones.map((zone, idx) => (
                <div
                  key={`${zone.date}-${zone.startHour}-${idx}`}
                  className="flex items-center gap-3 p-3 bg-accent/30 rounded-xl"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-300/60 dark:bg-slate-700/60 flex items-center justify-center">
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {format(new Date(zone.date + "T12:00:00"), "EEEE d MMM", {
                        locale: es,
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatHourShort(zone.startHour)} -{" "}
                      {formatHourShort(zone.endHour + 1)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="tabular-nums">
                    {zone.length}h silencio
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state if no dark zones */}
      {darkZones.length === 0 && (
        <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <p className="text-sm font-medium mb-1">Sin zonas oscuras</p>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              No se encontraron periodos de 2+ horas consecutivas sin
              actividad. El equipo se mantiene activo.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
