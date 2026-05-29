"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { CATEGORIES, EXPECTED_DAILY_HOURS, CATEGORY_COLORS } from "@/lib/constants";
import type { WorkCategory, Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  subWeeks,
  getDay,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  Gauge,
  Users,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  Target,
  BarChart3,
  UserX,
  Video,
  Ban,
} from "lucide-react";

// -- Tipos internos --

interface MemberCapacity {
  userId: string;
  profile: Profile;
  hoursLogged: number;
  capacity: number;
  utilization: number;
  categories: Map<WorkCategory, number>;
  meetingHours: number;
  blockedHours: number;
  loggedToday: boolean;
}

interface WeeklyHistoryPoint {
  weekLabel: string;
  totalLogged: number;
  totalCapacity: number;
  utilization: number;
}

// Asignacion ideal por categoria (porcentaje objetivo)
const IDEAL_ALLOCATION: Partial<Record<WorkCategory, number>> = {
  deep_work: 40,
  meeting: 15,
  review: 15,
  admin: 10,
  planning: 10,
  learning: 5,
  break: 5,
  blocked: 0,
};

function getUtilizationColor(pct: number): string {
  if (pct > 100) return "text-red-600";
  if (pct >= 80) return "text-green-600";
  if (pct >= 50) return "text-yellow-600";
  return "text-red-600";
}

function getUtilizationBg(pct: number): string {
  if (pct > 100) return "bg-red-500";
  if (pct >= 80) return "bg-green-500";
  if (pct >= 50) return "bg-yellow-500";
  return "bg-red-400";
}

function getUtilizationLabel(pct: number): string {
  if (pct > 100) return "Sobrecargado";
  if (pct >= 80) return "Optimo";
  if (pct >= 50) return "Moderado";
  return "Bajo";
}

export default function CapacityPage() {
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [members, setMembers] = useState<MemberCapacity[]>([]);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [totalLogged, setTotalLogged] = useState(0);
  const [categoryTotals, setCategoryTotals] = useState<{ category: WorkCategory; hours: number; percent: number }[]>([]);
  const [weekHistory, setWeekHistory] = useState<WeeklyHistoryPoint[]>([]);
  const [workdaysThisWeek, setWorkdaysThisWeek] = useState(5);
  const [workdaysElapsed, setWorkdaysElapsed] = useState(0);

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!membership) { setLoading(false); return; }
      const oid = membership.org_id;
      setOrgId(oid);

      // Semana actual (lunes a viernes)
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      const allDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
      const workdays = allDays.filter((d) => {
        const day = getDay(d);
        return day !== 0 && day !== 6;
      });
      setWorkdaysThisWeek(workdays.length);

      // Dias laborales transcurridos (incluyendo hoy si es dia laboral)
      const today = new Date();
      const elapsed = workdays.filter((d) => d <= today).length;
      setWorkdaysElapsed(elapsed);

      const weekStartStr = weekStart.toISOString().split("T")[0];
      const weekEndStr = weekEnd.toISOString().split("T")[0];
      const todayStr = today.toISOString().split("T")[0];

      // Cargar datos en paralelo
      const [
        { data: orgMembers },
        { data: entries },
      ] = await Promise.all([
        supabase
          .from("org_members")
          .select("user_id, profiles(*)")
          .eq("org_id", oid)
          ,
        supabase
          .from("time_entries")
          .select("*")
          .eq("org_id", oid)
          .gte("date", weekStartStr)
          .lte("date", weekEndStr),
      ]);

      if (!orgMembers) { setLoading(false); return; }

      const allEntries = entries ?? [];
      const numMembers = orgMembers.length;
      setMemberCount(numMembers);

      const weeklyCapacity = numMembers * EXPECTED_DAILY_HOURS * workdays.length;
      setTotalCapacity(weeklyCapacity);
      setTotalLogged(allEntries.length);

      // Calcular por miembro
      const memberStats: MemberCapacity[] = orgMembers.map((m) => {
        const userEntries = allEntries.filter((e) => e.user_id === m.user_id);
        const capacity = EXPECTED_DAILY_HOURS * workdays.length;

        const catMap = new Map<WorkCategory, number>();
        let meetings = 0;
        let blocked = 0;
        let hasToday = false;

        for (const e of userEntries) {
          const cat = e.category as WorkCategory;
          catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
          if (cat === "meeting") meetings++;
          if (cat === "blocked") blocked++;
          if (e.date === todayStr) hasToday = true;
        }

        const utilization = capacity > 0 ? Math.round((userEntries.length / capacity) * 100) : 0;

        return {
          userId: m.user_id,
          profile: m.profiles,
          hoursLogged: userEntries.length,
          capacity,
          utilization,
          categories: catMap,
          meetingHours: meetings,
          blockedHours: blocked,
          loggedToday: hasToday,
        };
      });

      memberStats.sort((a, b) => b.utilization - a.utilization);
      setMembers(memberStats);

      // Totales por categoria
      const globalCatMap = new Map<WorkCategory, number>();
      for (const e of allEntries) {
        const cat = e.category as WorkCategory;
        globalCatMap.set(cat, (globalCatMap.get(cat) ?? 0) + 1);
      }
      const catTotals = (Object.keys(CATEGORIES) as WorkCategory[])
        .map((cat) => ({
          category: cat,
          hours: globalCatMap.get(cat) ?? 0,
          percent: allEntries.length > 0 ? Math.round(((globalCatMap.get(cat) ?? 0) / allEntries.length) * 100) : 0,
        }))
        .filter((c) => c.hours > 0)
        .sort((a, b) => b.hours - a.hours);
      setCategoryTotals(catTotals);

      // Historial de 4 semanas
      const historyPoints: WeeklyHistoryPoint[] = [];
      for (let w = 3; w >= 0; w--) {
        const ws = startOfWeek(subWeeks(now, w), { weekStartsOn: 1 });
        const we = endOfWeek(ws, { weekStartsOn: 1 });
        const wDays = eachDayOfInterval({ start: ws, end: we }).filter((d) => {
          const day = getDay(d);
          return day !== 0 && day !== 6;
        });
        const wsStr = ws.toISOString().split("T")[0];
        const weStr = we.toISOString().split("T")[0];

        const { data: weekEntries } = await supabase
          .from("time_entries")
          .select("id")
          .eq("org_id", oid)
          .gte("date", wsStr)
          .lte("date", weStr);

        const logged = weekEntries?.length ?? 0;
        const cap = numMembers * EXPECTED_DAILY_HOURS * wDays.length;
        const util = cap > 0 ? Math.round((logged / cap) * 100) : 0;

        historyPoints.push({
          weekLabel: format(ws, "d MMM", { locale: es }),
          totalLogged: logged,
          totalCapacity: cap,
          utilization: util,
        });
      }
      setWeekHistory(historyPoints);

      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Calculos derivados --

  const utilization = totalCapacity > 0 ? Math.round((totalLogged / totalCapacity) * 100) : 0;
  const availableHours = Math.max(0, totalCapacity - totalLogged);

  // Forecast: horas proyectadas al final de la semana basado en ritmo actual
  const pacePerDay = workdaysElapsed > 0 ? totalLogged / workdaysElapsed : 0;
  const forecastTotal = Math.round(pacePerDay * workdaysThisWeek);
  const forecastDiff = forecastTotal - totalCapacity;
  const isAheadOfPace = forecastTotal >= totalCapacity;

  // Bottlenecks
  const mostMeetings = [...members].sort((a, b) => b.meetingHours - a.meetingHours).slice(0, 3).filter((m) => m.meetingHours > 0);
  const mostBlocked = [...members].sort((a, b) => b.blockedHours - a.blockedHours).slice(0, 3).filter((m) => m.blockedHours > 0);
  const notLoggedToday = members.filter((m) => !m.loggedToday);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando capacidad...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Gauge className="w-6 h-6 text-primary" />
          Capacidad del Equipo
        </h1>
        <p className="text-muted-foreground text-sm">
          Planificacion y forecast semanal ({memberCount} miembros)
        </p>
      </div>

      {/* ===== 1. Team Capacity Overview ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="p-3 text-center">
            <Users className="w-4 h-4 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold tabular-nums tracking-tight">{totalCapacity}h</p>
            <p className="text-[10px] text-muted-foreground">Capacidad total</p>
            <p className="text-[9px] text-muted-foreground/60">
              {memberCount} x {EXPECTED_DAILY_HOURS}h x {workdaysThisWeek}d
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="w-4 h-4 mx-auto text-blue-500 mb-1" />
            <p className="text-2xl font-bold tabular-nums tracking-tight">{totalLogged}h</p>
            <p className="text-[10px] text-muted-foreground">Horas registradas</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 text-center">
            <Target className="w-4 h-4 mx-auto text-green-500 mb-1" />
            <p className={cn("text-2xl font-bold tabular-nums tracking-tight", getUtilizationColor(utilization))}>
              {utilization}%
            </p>
            <p className="text-[10px] text-muted-foreground">Utilizacion</p>
            <p className={cn("text-[9px] font-medium", getUtilizationColor(utilization))}>
              {getUtilizationLabel(utilization)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 text-center">
            <BarChart3 className="w-4 h-4 mx-auto text-orange-500 mb-1" />
            <p className="text-2xl font-bold tabular-nums tracking-tight">{availableHours}h</p>
            <p className="text-[10px] text-muted-foreground">Disponibles</p>
          </CardContent>
        </Card>
      </div>

      {/* Utilization gauge + Available vs Allocated bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Visual gauge */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Medidor de utilizacion</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center pb-4">
            <div className="relative w-40 h-24 overflow-hidden">
              <svg viewBox="0 0 200 110" className="w-full h-full">
                {/* Background arc */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="14"
                  strokeLinecap="round"
                  className="text-muted"
                />
                {/* Filled arc */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke={utilization > 100 ? "#ef4444" : utilization >= 80 ? "#22c55e" : utilization >= 50 ? "#eab308" : "#ef4444"}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.min(utilization, 100) * 2.51} 251`}
                />
                {/* Center text */}
                <text x="100" y="90" textAnchor="middle" className="text-3xl font-bold fill-foreground" fontSize="28">
                  {utilization}%
                </text>
              </svg>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" /> ≥80% Optimo
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-yellow-500" /> 50-79%
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" /> {"<50% o >100%"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Available vs Allocated bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Disponible vs Asignado</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-center gap-4">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Registradas</span>
                <span className="font-medium">{totalLogged}h</span>
              </div>
              <div className="h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700", getUtilizationBg(utilization))}
                  style={{ width: `${Math.min(utilization, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Disponibles</span>
                <span className="font-medium">{availableHours}h</span>
              </div>
              <div className="h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-400 transition-all duration-700"
                  style={{ width: `${totalCapacity > 0 ? Math.round((availableHours / totalCapacity) * 100) : 0}%` }}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              {workdaysElapsed} de {workdaysThisWeek} dias laborales transcurridos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ===== 2. Per-Person Capacity Cards ===== */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Capacidad por Persona
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => {
            const remaining = Math.max(0, m.capacity - m.hoursLogged);
            const barPct = Math.min(m.utilization, 100);

            return (
              <Card
                key={m.userId}
                className={cn(
                  "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
                  m.utilization > 100 && "border-red-300 dark:border-red-700",
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar>
                      <AvatarImage src={m.profile.avatar_url ?? undefined} />
                      <AvatarFallback>{getInitials(m.profile.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.profile.full_name ?? m.profile.email}</p>
                      {m.profile.role && (
                        <p className="text-[10px] text-muted-foreground">{m.profile.role}</p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] shrink-0",
                        m.utilization > 100
                          ? "text-red-600 border-red-300"
                          : m.utilization >= 80
                            ? "text-green-600 border-green-300"
                            : m.utilization >= 50
                              ? "text-yellow-600 border-yellow-300"
                              : "text-red-600 border-red-300",
                      )}
                    >
                      {m.utilization}%
                    </Badge>
                  </div>

                  {/* Mini bar */}
                  <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", getUtilizationBg(m.utilization))}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{m.hoursLogged}h registradas</span>
                    <span>{remaining}h restantes</span>
                  </div>

                  {m.utilization > 100 && (
                    <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Sobrecargado ({m.hoursLogged - m.capacity}h extra)
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ===== 3. Category Allocation ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribucion por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Stacked bar */}
            {totalLogged > 0 && (
              <div className="h-6 rounded-full overflow-hidden flex mb-4">
                {categoryTotals.map(({ category, percent }) => (
                  <div
                    key={category}
                    className={cn(CATEGORY_COLORS[category])}
                    style={{ width: `${Math.max(percent, 1)}%` }}
                    title={`${CATEGORIES[category].label}: ${percent}%`}
                  />
                ))}
              </div>
            )}
            <div className="space-y-2">
              {categoryTotals.map(({ category, hours, percent }) => (
                <div key={category} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <div className={cn("w-3 h-3 rounded-sm", CATEGORY_COLORS[category])} />
                    {CATEGORIES[category].emoji} {CATEGORIES[category].label}
                  </span>
                  <span className="text-muted-foreground">{hours}h ({percent}%)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Actual vs Ideal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(Object.keys(IDEAL_ALLOCATION) as WorkCategory[]).map((cat) => {
                const ideal = IDEAL_ALLOCATION[cat] ?? 0;
                const actual = totalLogged > 0
                  ? Math.round(((categoryTotals.find((c) => c.category === cat)?.hours ?? 0) / totalLogged) * 100)
                  : 0;
                const diff = actual - ideal;

                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <div className={cn("w-3 h-3 rounded-sm", CATEGORY_COLORS[cat])} />
                        {CATEGORIES[cat].label}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">{ideal}% ideal</span>
                        <span className={cn(
                          "font-medium",
                          Math.abs(diff) <= 5 ? "text-green-600" : diff > 0 ? "text-amber-600" : "text-blue-600",
                        )}>
                          {actual}% actual
                        </span>
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden relative">
                      {/* Ideal marker */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-foreground/40 z-10"
                        style={{ left: `${ideal}%` }}
                      />
                      {/* Actual bar */}
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", CATEGORY_COLORS[cat])}
                        style={{ width: `${Math.min(actual, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-[9px] text-muted-foreground mt-2">
                La linea oscura indica el porcentaje ideal configurado.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== 4. Forecast Section ===== */}
      <Card className="mb-8">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Forecast Semanal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-accent/40 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Ritmo actual</p>
              <p className="text-xl font-bold tabular-nums tracking-tight">
                {Math.round(pacePerDay * 10) / 10}h/dia
              </p>
            </div>
            <div className="text-center p-3 bg-accent/40 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Proyeccion fin de semana</p>
              <p className={cn("text-xl font-bold tabular-nums tracking-tight", isAheadOfPace ? "text-green-600" : "text-amber-600")}>
                {forecastTotal}h
              </p>
              <p className="text-[9px] text-muted-foreground">de {totalCapacity}h objetivo</p>
            </div>
            <div className="text-center p-3 bg-accent/40 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Estado</p>
              <div className="flex items-center justify-center gap-1">
                {isAheadOfPace ? (
                  <TrendingUp className="w-5 h-5 text-green-500" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-amber-500" />
                )}
                <p className={cn("text-sm font-semibold", isAheadOfPace ? "text-green-600" : "text-amber-600")}>
                  {isAheadOfPace ? "En meta o adelante" : `${Math.abs(forecastDiff)}h por debajo`}
                </p>
              </div>
            </div>
          </div>

          {/* Individual pace predictions */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Proyeccion individual</p>
            <div className="space-y-1.5">
              {members.map((m) => {
                const memberPace = workdaysElapsed > 0 ? m.hoursLogged / workdaysElapsed : 0;
                const memberForecast = Math.round(memberPace * workdaysThisWeek);
                const memberOnTrack = memberForecast >= m.capacity;

                return (
                  <div key={m.userId} className="flex items-center gap-2 text-xs">
                    <Avatar size="sm">
                      <AvatarImage src={m.profile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[8px]">{getInitials(m.profile.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate flex-1 min-w-0">{m.profile.full_name ?? m.profile.email}</span>
                    <span className="text-muted-foreground tabular-nums">{Math.round(memberPace * 10) / 10}h/d</span>
                    <span className={cn("font-medium tabular-nums", memberOnTrack ? "text-green-600" : "text-amber-600")}>
                      {memberForecast}h proj.
                    </span>
                    {memberOnTrack ? (
                      <TrendingUp className="w-3 h-3 text-green-500 shrink-0" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-amber-500 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== 5. Bottleneck Detection ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Video className="w-4 h-4 text-blue-500" />
              Mas reuniones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mostMeetings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin reuniones esta semana</p>
            ) : (
              <div className="space-y-2">
                {mostMeetings.map((m) => (
                  <div key={m.userId} className="flex items-center gap-2">
                    <Avatar size="sm">
                      <AvatarImage src={m.profile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[8px]">{getInitials(m.profile.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs truncate flex-1">{m.profile.full_name ?? "?"}</span>
                    <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
                      {m.meetingHours}h
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Ban className="w-4 h-4 text-red-500" />
              Mas bloqueados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mostBlocked.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nadie bloqueado esta semana</p>
            ) : (
              <div className="space-y-2">
                {mostBlocked.map((m) => (
                  <div key={m.userId} className="flex items-center gap-2">
                    <Avatar size="sm">
                      <AvatarImage src={m.profile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[8px]">{getInitials(m.profile.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs truncate flex-1">{m.profile.full_name ?? "?"}</span>
                    <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">
                      {m.blockedHours}h
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserX className="w-4 h-4 text-orange-500" />
              Sin registro hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notLoggedToday.length === 0 ? (
              <p className="text-xs text-green-600">Todos registraron hoy</p>
            ) : (
              <div className="space-y-2">
                {notLoggedToday.slice(0, 5).map((m) => (
                  <div key={m.userId} className="flex items-center gap-2">
                    <Avatar size="sm">
                      <AvatarImage src={m.profile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[8px]">{getInitials(m.profile.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs truncate flex-1">{m.profile.full_name ?? "?"}</span>
                    <span className="text-[10px] text-orange-500">Sin actividad</span>
                  </div>
                ))}
                {notLoggedToday.length > 5 && (
                  <p className="text-[10px] text-muted-foreground">
                    +{notLoggedToday.length - 5} mas
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== 6. Historical Capacity Trend (4 weeks) ===== */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Tendencia de Capacidad (4 semanas)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Mini bar chart */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Utilizacion semanal</p>
              <div className="flex items-end gap-2 h-28">
                {weekHistory.map((wh, i) => {
                  const maxUtil = Math.max(1, ...weekHistory.map((w) => w.utilization));
                  const barHeight = (wh.utilization / Math.max(maxUtil, 100)) * 100;
                  const isCurrentWeek = i === weekHistory.length - 1;

                  return (
                    <div key={wh.weekLabel} className="flex-1 flex flex-col items-center gap-1">
                      <span className={cn("text-[10px] font-medium tabular-nums", getUtilizationColor(wh.utilization))}>
                        {wh.utilization}%
                      </span>
                      <div
                        className={cn(
                          "w-full rounded-t-lg transition-all duration-500",
                          isCurrentWeek
                            ? "bg-gradient-to-t from-primary to-primary/70"
                            : getUtilizationBg(wh.utilization),
                        )}
                        style={{ height: `${Math.max(barHeight, 4)}%` }}
                        title={`${wh.weekLabel}: ${wh.totalLogged}h / ${wh.totalCapacity}h`}
                      />
                      <span className={cn("text-[9px]", isCurrentWeek ? "text-primary font-semibold" : "text-muted-foreground")}>
                        {wh.weekLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stats table */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Detalle semanal</p>
              <div className="space-y-2">
                {weekHistory.map((wh, i) => {
                  const isCurrentWeek = i === weekHistory.length - 1;
                  return (
                    <div
                      key={wh.weekLabel}
                      className={cn(
                        "flex items-center justify-between text-xs p-2 rounded-lg",
                        isCurrentWeek ? "bg-primary/10" : "bg-accent/40",
                      )}
                    >
                      <span className={cn("font-medium", isCurrentWeek && "text-primary")}>
                        {wh.weekLabel} {isCurrentWeek && "(actual)"}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground tabular-nums">{wh.totalLogged}h / {wh.totalCapacity}h</span>
                        <span className={cn("font-bold tabular-nums", getUtilizationColor(wh.utilization))}>
                          {wh.utilization}%
                        </span>
                      </div>
                    </div>
                  );
                })}
                {weekHistory.length > 0 && (
                  <div className="flex items-center justify-between text-xs p-2 rounded-lg border border-dashed">
                    <span className="font-medium">Promedio</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground tabular-nums">
                        {Math.round(weekHistory.reduce((s, w) => s + w.totalLogged, 0) / weekHistory.length)}h / sem
                      </span>
                      <span className="font-bold tabular-nums text-primary">
                        {Math.round(weekHistory.reduce((s, w) => s + w.utilization, 0) / weekHistory.length)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
