// @ts-nocheck
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory, Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, getInitials } from "@/lib/utils";
import { format, differenceInDays, eachDayOfInterval, parseISO, isWeekend } from "date-fns";
import { es } from "date-fns/locale";
import {
  Flag,
  Calendar,
  Target,
  TrendingUp,
  BarChart3,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/* ─── Sprint types ──────────────────────────────────────────── */

interface Sprint {
  id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  goal_hours_per_person: number;
  goal_category_focus: string; // e.g. "deep_work:80"
  status: "active" | "completed" | "cancelled";
}

interface MemberSprintStats {
  profile: Profile;
  hoursLogged: number;
  goalHours: number;
  proofRate: number;
  categoryBreakdown: Record<string, number>;
  dailyHours: Record<string, number>;
}

/* ─── localStorage helpers ──────────────────────────────────── */

function storageKey(orgId: string) {
  return `exomagram_sprints_${orgId}`;
}

function loadSprints(orgId: string): Sprint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSprints(orgId: string, sprints: Sprint[]) {
  localStorage.setItem(storageKey(orgId), JSON.stringify(sprints));
}

/* ─── Helpers ───────────────────────────────────────────────── */

function generateId() {
  return `sprint_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function workdaysBetween(start: string, end: string): number {
  const days = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) });
  return days.filter((d) => !isWeekend(d)).length;
}

function parseCategoryFocus(focus: string): { category: WorkCategory; percent: number } | null {
  if (!focus || !focus.includes(":")) return null;
  const [cat, pct] = focus.split(":");
  return { category: cat as WorkCategory, percent: parseInt(pct) || 0 };
}

/* ─── Component ─────────────────────────────────────────────── */

export default function SprintsPage() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Board data
  const [memberStats, setMemberStats] = useState<MemberSprintStats[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);

  // History expansion
  const [expandedSprintId, setExpandedSprintId] = useState<string | null>(null);
  const [historyStats, setHistoryStats] = useState<Record<string, MemberSprintStats[]>>({});

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formGoalHours, setFormGoalHours] = useState("40");
  const [formFocusCategory, setFormFocusCategory] = useState("");
  const [formFocusPercent, setFormFocusPercent] = useState("80");

  const supabase = createClient();

  /* ─── Active sprint ─────────────────────────────────────── */

  const activeSprint = useMemo(
    () => sprints.find((s) => s.status === "active") ?? null,
    [sprints]
  );

  const pastSprints = useMemo(
    () =>
      sprints
        .filter((s) => s.status !== "active")
        .sort((a, b) => b.end_date.localeCompare(a.end_date)),
    [sprints]
  );

  /* ─── Active sprint progress ────────────────────────────── */

  const sprintProgress = useMemo(() => {
    if (!activeSprint) return null;
    const today = new Date();
    const start = parseISO(activeSprint.start_date);
    const end = parseISO(activeSprint.end_date);
    const totalDays = Math.max(differenceInDays(end, start) + 1, 1);
    const elapsed = Math.max(differenceInDays(today, start) + 1, 0);
    const remaining = Math.max(differenceInDays(end, today), 0);
    const percent = Math.min(Math.round((elapsed / totalDays) * 100), 100);
    return { totalDays, elapsed, remaining, percent };
  }, [activeSprint]);

  /* ─── Load org + sprints ────────────────────────────────── */

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!membership) {
        setLoading(false);
        return;
      }

      setOrgId(membership.org_id);
      setSprints(loadSprints(membership.org_id));
      setLoading(false);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Load board data for active sprint ─────────────────── */

  const loadBoardData = useCallback(
    async (sprint: Sprint) => {
      if (!orgId) return [];
      setBoardLoading(true);

      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        ;

      if (!members) {
        setBoardLoading(false);
        return [];
      }

      const { data: entries } = await supabase
        .from("time_entries")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", sprint.start_date)
        .lte("date", sprint.end_date);

      const stats: MemberSprintStats[] = members.map((m) => {
        const userEntries =
          entries?.filter((e) => e.user_id === m.user_id) ?? [];
        const withProof = userEntries.filter(
          (e) => e.proof_urls && e.proof_urls.length > 0
        );

        const catBreakdown: Record<string, number> = {};
        const dailyHours: Record<string, number> = {};

        for (const e of userEntries) {
          catBreakdown[e.category] = (catBreakdown[e.category] ?? 0) + 1;
          dailyHours[e.date] = (dailyHours[e.date] ?? 0) + 1;
        }

        return {
          profile: m.profiles,
          hoursLogged: userEntries.length,
          goalHours: sprint.goal_hours_per_person,
          proofRate:
            userEntries.length > 0
              ? Math.round((withProof.length / userEntries.length) * 100)
              : 0,
          categoryBreakdown: catBreakdown,
          dailyHours,
        };
      });

      stats.sort((a, b) => b.hoursLogged - a.hoursLogged);
      return stats;
    },
    [orgId, supabase]
  );

  useEffect(() => {
    if (!activeSprint || !orgId) return;
    loadBoardData(activeSprint).then((stats) => {
      setMemberStats(stats);
      setBoardLoading(false);
    });
  }, [activeSprint, orgId, loadBoardData]);

  /* ─── Load history details ──────────────────────────────── */

  async function loadHistoryDetail(sprint: Sprint) {
    if (historyStats[sprint.id]) return;
    const stats = await loadBoardData(sprint);
    setHistoryStats((prev) => ({ ...prev, [sprint.id]: stats }));
  }

  /* ─── Create sprint ────────────────────────────────────── */

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSubmitting(true);

    const newSprint: Sprint = {
      id: generateId(),
      name: formName,
      description: formDesc,
      start_date: formStart,
      end_date: formEnd,
      goal_hours_per_person: parseInt(formGoalHours) || 40,
      goal_category_focus: formFocusCategory
        ? `${formFocusCategory}:${formFocusPercent}`
        : "",
      status: "active",
    };

    // Close any currently active sprint
    const updated = sprints.map((s) =>
      s.status === "active" ? { ...s, status: "completed" as const } : s
    );
    const all = [...updated, newSprint];
    setSprints(all);
    saveSprints(orgId, all);

    // Reset form
    setFormName("");
    setFormDesc("");
    setFormStart("");
    setFormEnd("");
    setFormGoalHours("40");
    setFormFocusCategory("");
    setFormFocusPercent("80");
    setDialogOpen(false);
    setSubmitting(false);
  }

  /* ─── Complete / cancel sprint ──────────────────────────── */

  function endSprint(id: string, status: "completed" | "cancelled") {
    if (!orgId) return;
    const updated = sprints.map((s) =>
      s.id === id ? { ...s, status } : s
    );
    setSprints(updated);
    saveSprints(orgId, updated);
  }

  /* ─── Burndown data ─────────────────────────────────────── */

  const burndownData = useMemo(() => {
    if (!activeSprint || memberStats.length === 0) return null;

    const totalGoal = activeSprint.goal_hours_per_person * memberStats.length;
    const days = eachDayOfInterval({
      start: parseISO(activeSprint.start_date),
      end: parseISO(activeSprint.end_date),
    }).filter((d) => !isWeekend(d));

    const totalWorkdays = days.length;
    const dailyIdealBurn = totalGoal / Math.max(totalWorkdays, 1);

    let cumulativeActual = 0;
    const points = days.map((day, i) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayHours = memberStats.reduce(
        (sum, m) => sum + (m.dailyHours[dateStr] ?? 0),
        0
      );
      cumulativeActual += dayHours;
      const idealRemaining = Math.max(totalGoal - dailyIdealBurn * (i + 1), 0);
      const actualRemaining = Math.max(totalGoal - cumulativeActual, 0);

      return {
        date: dateStr,
        label: format(day, "d MMM", { locale: es }),
        ideal: Math.round(idealRemaining),
        actual: Math.round(actualRemaining),
        isPast: day <= new Date(),
      };
    });

    return { totalGoal, points };
  }, [activeSprint, memberStats]);

  /* ─── Team aggregate stats ──────────────────────────────── */

  const teamStats = useMemo(() => {
    if (memberStats.length === 0) return null;
    const totalHours = memberStats.reduce((s, m) => s + m.hoursLogged, 0);
    const totalGoal = memberStats.reduce((s, m) => s + m.goalHours, 0);
    const avgProof =
      memberStats.length > 0
        ? Math.round(
            memberStats.reduce((s, m) => s + m.proofRate, 0) / memberStats.length
          )
        : 0;
    const membersOnTrack = memberStats.filter(
      (m) => m.hoursLogged >= m.goalHours * (sprintProgress?.percent ?? 0) / 100 * 0.85
    ).length;

    return { totalHours, totalGoal, avgProof, membersOnTrack };
  }, [memberStats, sprintProgress]);

  /* ─── Loading state ─────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      </div>
    );
  }

  /* ─── Render ────────────────────────────────────────────── */

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Flag className="w-6 h-6 text-primary" />
            Sprints
          </h1>
          <p className="text-muted-foreground text-sm">
            Ciclos de trabajo con metas de equipo
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nuevo sprint
        </Button>
      </div>

      {/* ─── Active Sprint Banner ─────────────────────────── */}
      {activeSprint && sprintProgress && (
        <Card className="mb-8 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                    Sprint activo
                  </Badge>
                  <Badge variant="outline" className="text-xs gap-1">
                    <Clock className="w-3 h-3" />
                    {sprintProgress.remaining} dias restantes
                  </Badge>
                </div>
                <h2 className="text-xl font-bold mt-2">{activeSprint.name}</h2>
                {activeSprint.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {activeSprint.description}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(parseISO(activeSprint.start_date), "d MMM", { locale: es })} -{" "}
                    {format(parseISO(activeSprint.end_date), "d MMM yyyy", { locale: es })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    {activeSprint.goal_hours_per_person}h / persona
                  </span>
                  {parseCategoryFocus(activeSprint.goal_category_focus) && (
                    <span>
                      {CATEGORIES[parseCategoryFocus(activeSprint.goal_category_focus)!.category]?.emoji}{" "}
                      {parseCategoryFocus(activeSprint.goal_category_focus)!.percent}%{" "}
                      {CATEGORIES[parseCategoryFocus(activeSprint.goal_category_focus)!.category]?.label}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-green-600 border-green-200 hover:bg-green-50"
                  onClick={() => endSprint(activeSprint.id, "completed")}
                >
                  <CheckCircle2 className="w-3 h-3" /> Completar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-red-500 border-red-200 hover:bg-red-50"
                  onClick={() => endSprint(activeSprint.id, "cancelled")}
                >
                  <XCircle className="w-3 h-3" /> Cancelar
                </Button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-5">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>Dia {sprintProgress.elapsed} de {sprintProgress.totalDays}</span>
                <span>{sprintProgress.percent}% transcurrido</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    sprintProgress.percent >= 90
                      ? "bg-gradient-to-r from-red-400 to-red-500"
                      : sprintProgress.percent >= 60
                        ? "bg-gradient-to-r from-amber-400 to-amber-500"
                        : "bg-gradient-to-r from-primary to-primary/80"
                  )}
                  style={{ width: `${sprintProgress.percent}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── No active sprint empty state ─────────────────── */}
      {!activeSprint && sprints.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Flag className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="mb-2">No tienes sprints creados.</p>
          <p className="text-xs">
            Crea un sprint para rastrear el progreso del equipo hacia metas de horas.
          </p>
        </div>
      )}

      {/* ─── Sprint Board ─────────────────────────────────── */}
      {activeSprint && (
        <div className="mb-10">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Tablero del sprint
          </h2>

          {/* Team aggregate */}
          {teamStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-primary">
                    {teamStats.totalHours}h
                  </p>
                  <p className="text-xs text-muted-foreground">
                    de {teamStats.totalGoal}h objetivo equipo
                  </p>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${Math.min(Math.round((teamStats.totalHours / Math.max(teamStats.totalGoal, 1)) * 100), 100)}%`,
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{teamStats.avgProof}%</p>
                  <p className="text-xs text-muted-foreground">Evidencia promedio</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {teamStats.membersOnTrack}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    de {memberStats.length} en ritmo
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{memberStats.length}</p>
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Users className="w-3 h-3" /> Miembros
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Per-member cards */}
          {boardLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground animate-pulse">
                Cargando datos del sprint...
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {memberStats.map((m) => {
                const pct = Math.round(
                  (m.hoursLogged / Math.max(m.goalHours, 1)) * 100
                );
                const focusParsed = parseCategoryFocus(
                  activeSprint.goal_category_focus
                );
                const focusCatHours = focusParsed
                  ? m.categoryBreakdown[focusParsed.category] ?? 0
                  : 0;
                const focusCatPct =
                  focusParsed && m.hoursLogged > 0
                    ? Math.round((focusCatHours / m.hoursLogged) * 100)
                    : 0;

                return (
                  <Card
                    key={m.profile.id}
                    className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Avatar className="w-10 h-10 ring-2 ring-background shadow-sm">
                          <AvatarImage src={m.profile.avatar_url ?? undefined} />
                          <AvatarFallback>
                            {getInitials(m.profile.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm truncate">
                            {m.profile.full_name ?? m.profile.email}
                          </h3>
                          {m.profile.role && (
                            <p className="text-xs text-muted-foreground">
                              {m.profile.role}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            pct >= 100
                              ? "border-green-300 text-green-600"
                              : pct >= 70
                                ? "border-amber-300 text-amber-600"
                                : "border-red-300 text-red-500"
                          )}
                        >
                          {pct}% del objetivo
                        </Badge>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-accent/40 rounded-xl p-2 text-center">
                          <p className="text-lg font-bold">{m.hoursLogged}h</p>
                          <p className="text-[10px] text-muted-foreground">
                            de {m.goalHours}h meta
                          </p>
                        </div>
                        <div className="bg-accent/40 rounded-xl p-2 text-center">
                          <p
                            className={cn(
                              "text-lg font-bold",
                              m.proofRate >= 80
                                ? "text-green-600"
                                : m.proofRate >= 50
                                  ? "text-amber-600"
                                  : "text-red-500"
                            )}
                          >
                            {m.proofRate}%
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Evidencia
                          </p>
                        </div>
                        {focusParsed && (
                          <div className="bg-accent/40 rounded-xl p-2 text-center">
                            <p
                              className={cn(
                                "text-lg font-bold",
                                focusCatPct >= focusParsed.percent
                                  ? "text-green-600"
                                  : "text-amber-600"
                              )}
                            >
                              {focusCatPct}%
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {CATEGORIES[focusParsed.category]?.emoji}{" "}
                              {CATEGORIES[focusParsed.category]?.label}
                            </p>
                          </div>
                        )}
                        <div className="bg-accent/40 rounded-xl p-2 text-center">
                          <p className="text-lg font-bold">
                            {Object.keys(m.dailyHours).length}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Dias activos
                          </p>
                        </div>
                      </div>

                      {/* Category distribution bar */}
                      {Object.keys(m.categoryBreakdown).length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-muted-foreground mb-1">
                            Distribucion
                          </p>
                          <div className="flex h-2 rounded-full overflow-hidden">
                            {Object.entries(m.categoryBreakdown)
                              .sort((a, b) => b[1] - a[1])
                              .map(([cat, hours]) => {
                                const catPct =
                                  (hours / Math.max(m.hoursLogged, 1)) * 100;
                                const catInfo =
                                  CATEGORIES[cat as WorkCategory];
                                return (
                                  <div
                                    key={cat}
                                    className={cn(
                                      catInfo?.bgColor ?? "bg-muted",
                                      "transition-all duration-500"
                                    )}
                                    style={{ width: `${catPct}%` }}
                                    title={`${catInfo?.label ?? cat}: ${hours}h (${Math.round(catPct)}%)`}
                                  />
                                );
                              })}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {Object.entries(m.categoryBreakdown)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 4)
                              .map(([cat, hours]) => {
                                const catInfo =
                                  CATEGORIES[cat as WorkCategory];
                                return (
                                  <span
                                    key={cat}
                                    className="text-[10px] text-muted-foreground"
                                  >
                                    {catInfo?.emoji} {catInfo?.label} {hours}h
                                  </span>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-700",
                              pct >= 100
                                ? "bg-green-500"
                                : pct >= 70
                                  ? "bg-amber-500"
                                  : "bg-red-400"
                            )}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Sprint Burndown ──────────────────────────────── */}
      {activeSprint && burndownData && burndownData.points.length > 0 && (
        <div className="mb-10">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Burndown del sprint
          </h2>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
                <span>
                  Meta total: {burndownData.totalGoal}h equipo
                </span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-muted-foreground/40 inline-block" /> Ideal
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-primary inline-block" /> Actual
                  </span>
                </div>
              </div>

              {/* Chart area */}
              <div className="relative h-48 sm:h-56">
                {/* Y-axis labels */}
                <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-[9px] text-muted-foreground">
                  <span>{burndownData.totalGoal}h</span>
                  <span>{Math.round(burndownData.totalGoal / 2)}h</span>
                  <span>0h</span>
                </div>

                {/* Chart body */}
                <div className="ml-12 h-full relative">
                  {/* Grid lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="border-t border-border/30 w-full"
                      />
                    ))}
                  </div>

                  {/* SVG lines */}
                  <svg
                    className="absolute inset-0 w-full"
                    style={{ height: "calc(100% - 24px)" }}
                    viewBox={`0 0 ${burndownData.points.length * 100} 100`}
                    preserveAspectRatio="none"
                    fill="none"
                  >
                    {/* Ideal line */}
                    <polyline
                      points={burndownData.points
                        .map((p, i) => {
                          const x =
                            (i / Math.max(burndownData.points.length - 1, 1)) *
                            (burndownData.points.length * 100);
                          const y =
                            100 -
                            (p.ideal / Math.max(burndownData.totalGoal, 1)) *
                              100;
                          return `${x},${y}`;
                        })
                        .join(" ")}
                      stroke="currentColor"
                      className="text-muted-foreground/30"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* Actual line */}
                    <polyline
                      points={burndownData.points
                        .filter((p) => p.isPast)
                        .map((p, i, arr) => {
                          const x =
                            (i / Math.max(burndownData.points.length - 1, 1)) *
                            (burndownData.points.length * 100);
                          const y =
                            100 -
                            (p.actual / Math.max(burndownData.totalGoal, 1)) *
                              100;
                          return `${x},${y}`;
                        })
                        .join(" ")}
                      stroke="currentColor"
                      className={cn(
                        burndownData.points.filter((p) => p.isPast).length > 0 &&
                          burndownData.points.filter((p) => p.isPast).at(-1)!
                            .actual >
                            burndownData.points.filter((p) => p.isPast).at(-1)!
                              .ideal
                          ? "text-red-500"
                          : "text-primary"
                      )}
                      strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>

                  {/* Dots */}
                  <div className="absolute inset-0 flex items-end" style={{ paddingBottom: "24px" }}>
                    <div className="flex w-full justify-between">
                      {burndownData.points.map((p, i) => {
                        if (!p.isPast) return <div key={i} className="flex-1" />;
                        const topPct =
                          (p.actual / Math.max(burndownData.totalGoal, 1)) * 100;
                        const behind = p.actual > p.ideal;
                        return (
                          <div key={i} className="flex-1 relative">
                            <div
                              className={cn(
                                "absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full",
                                behind ? "bg-red-500" : "bg-primary"
                              )}
                              style={{
                                bottom: `${topPct}%`,
                              }}
                              title={`${p.label}: ${p.actual}h restantes (ideal: ${p.ideal}h)`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* X-axis labels */}
                  <div className="absolute bottom-0 left-0 right-0 flex justify-between">
                    {burndownData.points.map((p, i) => {
                      // Show every nth label to avoid crowding
                      const step = Math.max(
                        Math.floor(burndownData.points.length / 7),
                        1
                      );
                      if (
                        i % step !== 0 &&
                        i !== burndownData.points.length - 1
                      )
                        return <span key={i} className="flex-1" />;
                      return (
                        <span
                          key={i}
                          className="text-[9px] text-muted-foreground flex-1 text-center"
                        >
                          {p.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Sprint History ───────────────────────────────── */}
      {pastSprints.length > 0 && (
        <div className="mb-10">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Historial de sprints
          </h2>
          <div className="space-y-3">
            {pastSprints.map((sprint) => {
              const focusParsed = parseCategoryFocus(sprint.goal_category_focus);
              const expanded = expandedSprintId === sprint.id;
              const stats = historyStats[sprint.id];

              const totalHoursAchieved = stats
                ? stats.reduce((s, m) => s + m.hoursLogged, 0)
                : null;
              const totalGoalHours = stats
                ? sprint.goal_hours_per_person * stats.length
                : null;
              const metGoal =
                totalHoursAchieved !== null &&
                totalGoalHours !== null &&
                totalHoursAchieved >= totalGoalHours * 0.85;

              return (
                <Card key={sprint.id}>
                  <CardContent className="p-4">
                    <button
                      className="w-full text-left"
                      onClick={() => {
                        if (expanded) {
                          setExpandedSprintId(null);
                        } else {
                          setExpandedSprintId(sprint.id);
                          loadHistoryDetail(sprint);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-sm">
                                {sprint.name}
                              </h3>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  sprint.status === "completed"
                                    ? "border-green-300 text-green-600"
                                    : "border-red-300 text-red-500"
                                )}
                              >
                                {sprint.status === "completed"
                                  ? "Completado"
                                  : "Cancelado"}
                              </Badge>
                              {stats && (
                                <Badge
                                  className={cn(
                                    "text-[10px]",
                                    metGoal
                                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                  )}
                                >
                                  {metGoal ? "Meta cumplida" : "Meta no cumplida"}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {format(parseISO(sprint.start_date), "d MMM", {
                                locale: es,
                              })}{" "}
                              -{" "}
                              {format(parseISO(sprint.end_date), "d MMM yyyy", {
                                locale: es,
                              })}
                              {" | "}
                              {sprint.goal_hours_per_person}h/persona
                              {focusParsed && (
                                <>
                                  {" | "}
                                  {CATEGORIES[focusParsed.category]?.emoji}{" "}
                                  {focusParsed.percent}%
                                </>
                              )}
                            </p>
                            {stats && totalHoursAchieved !== null && totalGoalHours !== null && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {totalHoursAchieved}h logradas de {totalGoalHours}h planificadas (
                                {Math.round((totalHoursAchieved / Math.max(totalGoalHours, 1)) * 100)}
                                %)
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 ml-2">
                          {expanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded details */}
                    {expanded && stats && (
                      <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
                        {stats.map((m) => {
                          const pct = Math.round(
                            (m.hoursLogged / Math.max(m.goalHours, 1)) * 100
                          );
                          return (
                            <div
                              key={m.profile.id}
                              className="flex items-center gap-3 py-2"
                            >
                              <Avatar className="w-8 h-8">
                                <AvatarImage
                                  src={m.profile.avatar_url ?? undefined}
                                />
                                <AvatarFallback className="text-xs">
                                  {getInitials(m.profile.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {m.profile.full_name ?? m.profile.email}
                                </p>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                                  <div
                                    className={cn(
                                      "h-full rounded-full",
                                      pct >= 85
                                        ? "bg-green-500"
                                        : pct >= 60
                                          ? "bg-amber-500"
                                          : "bg-red-400"
                                    )}
                                    style={{
                                      width: `${Math.min(pct, 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-semibold">
                                  {m.hoursLogged}h
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  de {m.goalHours}h ({pct}%)
                                </p>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] shrink-0",
                                  m.proofRate >= 80
                                    ? "text-green-600"
                                    : "text-amber-600"
                                )}
                              >
                                {m.proofRate}% evidencia
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {expanded && !stats && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <p className="text-sm text-muted-foreground animate-pulse text-center py-4">
                          Cargando detalles...
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Create Sprint Dialog ─────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="w-5 h-5 text-primary" />
              Nuevo sprint
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre del sprint</Label>
              <Input
                placeholder="Ej: Sprint 12 - Lanzamiento MVP"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Descripcion / objetivo</Label>
              <Textarea
                placeholder="Que queremos lograr en este sprint..."
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha inicio</Label>
                <Input
                  type="date"
                  value={formStart}
                  onChange={(e) => setFormStart(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha fin</Label>
                <Input
                  type="date"
                  value={formEnd}
                  onChange={(e) => setFormEnd(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Horas objetivo por persona</Label>
              <Input
                type="number"
                min="1"
                placeholder="40"
                value={formGoalHours}
                onChange={(e) => setFormGoalHours(e.target.value)}
                required
              />
              <p className="text-[10px] text-muted-foreground">
                Total de horas que cada miembro debe registrar durante el sprint
              </p>
            </div>
            <div className="space-y-2">
              <Label>Enfoque de categoria (opcional)</Label>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  value={formFocusCategory}
                  onValueChange={(v) => v && setFormFocusCategory(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Ninguna</SelectItem>
                    {Object.entries(CATEGORIES).map(([key, cat]) => (
                      <SelectItem key={key} value={key}>
                        {cat.emoji} {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    placeholder="80"
                    value={formFocusPercent}
                    onChange={(e) => setFormFocusPercent(e.target.value)}
                    disabled={!formFocusCategory}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Ej: 80% Deep Work significa que el equipo debe dedicar al menos el
                80% de su tiempo a esa categoria
              </p>
            </div>
            <Button
              type="submit"
              className="w-full gap-2"
              disabled={submitting || !formName || !formStart || !formEnd}
            >
              {submitting ? (
                "Creando..."
              ) : (
                <>
                  <Flag className="w-4 h-4" /> Crear sprint
                </>
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
