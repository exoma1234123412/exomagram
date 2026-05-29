"use client";

// ═══════════════════════════════════════════════════════════════════════
// PSYCHOLOGICAL TECHNIQUE: Military Roll Call + Escalating Consequences
// ═══════════════════════════════════════════════════════════════════════
//
// Inspired by military roll call discipline and Amazon's "disagree and
// commit" culture. The standup is non-negotiable.
//
// Escalation ladder:
// 1) 7-10am  — Gentle reminder banner. Complete inline, no friction.
// 2) 10-12pm — Red alert. Show who completed and who didn't (social proof).
// 3) 12pm+   — Permanent record. Skull banner. Still possible but marked late.
//
// The key psychological lever: showing teammates who DID complete theirs
// triggers social comparison and conformity pressure. Being the only red X
// in a sea of green checks is deeply uncomfortable.
//
// Sorting missing members FIRST ("shame position") leverages negativity
// bias — your brain processes negative social information faster.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import {
  ClipboardCheck,
  AlertTriangle,
  Skull,
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  MessageSquare,
  Loader2,
  Send,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────────

type EscalationLevel = "pending" | "overdue" | "flagged";

interface StandupEntry {
  id: string;
  user_id: string;
  yesterday: string;
  today_plan: string;
  blockers: string | null;
  mood: number | null;
  submitted_at: string;
  is_late?: boolean;
}

interface TeamMemberStatus {
  userId: string;
  profile: Profile;
  standup: StandupEntry | null;
  overdueMinutes: number;
}

interface StandupFormData {
  yesterday: string;
  todayPlan: string;
  blockers: string;
}

// ─── Constants ──────────────────────────────────────────────────────

/** Standup window opens at 7am */
const STANDUP_START_HOUR = 7;

/** Soft deadline: 10am */
const SOFT_DEADLINE_HOUR = 10;

/** Hard deadline: 12pm — after this it's flagged */
const HARD_DEADLINE_HOUR = 12;

/** Re-check interval: every 60 seconds */
const CHECK_INTERVAL_MS = 60 * 1000;

/** Minimum characters for yesterday/today fields */
const MIN_FIELD_LENGTH = 10;

// ─── Helpers ────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function getCurrentHour(): number {
  return new Date().getHours();
}

function getMinutesPastDeadline(): number {
  const now = new Date();
  const deadlineToday = new Date(now);
  deadlineToday.setHours(SOFT_DEADLINE_HOUR, 0, 0, 0);
  if (now <= deadlineToday) return 0;
  return Math.floor((now.getTime() - deadlineToday.getTime()) / 60000);
}

function getEscalationLevel(): EscalationLevel {
  const hour = getCurrentHour();
  if (hour >= HARD_DEADLINE_HOUR) return "flagged";
  if (hour >= SOFT_DEADLINE_HOUR) return "overdue";
  return "pending";
}

function formatOverdueTime(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function wasSubmittedLate(submittedAt: string): boolean {
  const submitted = new Date(submittedAt);
  return submitted.getHours() >= SOFT_DEADLINE_HOUR;
}

// ─── Escalation Banner Config ───────────────────────────────────────

const ESCALATION_CONFIG: Record<
  EscalationLevel,
  {
    icon: typeof ClipboardCheck;
    iconColor: string;
    bgColor: string;
    borderColor: string;
    textColor: string;
    bannerText: string;
    ctaText: string;
  }
> = {
  pending: {
    icon: ClipboardCheck,
    iconColor: "text-blue-500",
    bgColor: "bg-blue-50/80 dark:bg-blue-950/20",
    borderColor: "border-blue-200 dark:border-blue-800/50",
    textColor: "text-blue-800 dark:text-blue-300",
    bannerText: "Tu standup de hoy está pendiente. Complétalo antes de las 10am.",
    ctaText: "Enviar standup",
  },
  overdue: {
    icon: AlertTriangle,
    iconColor: "text-red-500",
    bgColor: "bg-red-50/80 dark:bg-red-950/20",
    borderColor: "border-red-200 dark:border-red-800/50",
    textColor: "text-red-800 dark:text-red-300",
    bannerText: "STANDUP VENCIDO — Tu equipo no sabe qué harás hoy",
    ctaText: "Completa tu standup ahora",
  },
  flagged: {
    icon: Skull,
    iconColor: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100/80 dark:bg-red-950/30",
    borderColor: "border-red-300 dark:border-red-700/60",
    textColor: "text-red-900 dark:text-red-200",
    bannerText: "STANDUP NO COMPLETADO — Esto queda en tu historial",
    ctaText: "Completar standup (tardío)",
  },
};

// ─── Component ──────────────────────────────────────────────────────

export function StandupEnforcer() {
  // ── State ───────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [myStandup, setMyStandup] = useState<StandupEntry | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberStatus[]>([]);
  const [escalation, setEscalation] = useState<EscalationLevel>(getEscalationLevel);
  const [showForm, setShowForm] = useState(false);
  const [showBoard, setShowBoard] = useState(true);
  const [flagInserted, setFlagInserted] = useState(false);
  const [formData, setFormData] = useState<StandupFormData>({
    yesterday: "",
    todayPlan: "",
    blockers: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createClient();
  const today = todayISO();

  // ── Escalation timer ────────────────────────────────────────────

  useEffect(() => {
    const tick = () => setEscalation(getEscalationLevel());
    intervalRef.current = setInterval(tick, CHECK_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ── Auto-insert accountability flag at 12pm+ ───────────────────

  useEffect(() => {
    if (escalation !== "flagged") return;
    if (myStandup) return;
    if (flagInserted) return;
    if (!userId || !orgId) return;

    async function insertFlag() {
      await supabase.from("accountability_flags").insert({
        user_id: userId!,
        org_id: orgId!,
        flag_type: "no_closeout",
        date: today,
        details: "no_standup: Standup no completado antes de las 12pm",
      });
      setFlagInserted(true);
    }
    insertFlag();
  }, [escalation, myStandup, flagInserted, userId, orgId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loading ────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

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

    const currentOrgId = membership.org_id;
    setOrgId(currentOrgId);

    // Parallel: fetch standups, team members, yesterday's closeout
    const [standupsResult, membersResult, closeoutResult] = await Promise.all([
      supabase
        .from("standups")
        .select("id, user_id, yesterday, today_plan, blockers, mood, submitted_at")
        .eq("org_id", currentOrgId)
        .eq("date", today)
        .order("submitted_at", { ascending: true }),

      supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", currentOrgId),

      // Auto-populate yesterday from daily closeout
      supabase
        .from("daily_closeouts")
        .select("summary, tomorrow_plan")
        .eq("user_id", user.id)
        .eq("org_id", currentOrgId)
        .order("date", { ascending: false })
        .limit(1)
        .single(),
    ]);

    const standups = (standupsResult.data ?? []) as StandupEntry[];
    const members = (membersResult.data ?? []) as unknown as Array<{
      user_id: string;
      profiles: Profile;
    }>;

    // Find my standup
    const mine = standups.find((s) => s.user_id === user.id) ?? null;
    setMyStandup(mine);

    // Build team status map
    const standupMap = new Map<string, StandupEntry>();
    for (const s of standups) {
      standupMap.set(s.user_id, s);
    }

    const overdueMin = getMinutesPastDeadline();

    const statuses: TeamMemberStatus[] = members.map((m) => ({
      userId: m.user_id,
      profile: m.profiles,
      standup: standupMap.get(m.user_id) ?? null,
      overdueMinutes: standupMap.has(m.user_id) ? 0 : overdueMin,
    }));

    setTeamMembers(statuses);

    // Auto-populate yesterday from closeout
    if (!mine && closeoutResult.data) {
      const closeout = closeoutResult.data;
      setFormData((prev) => ({
        ...prev,
        yesterday: prev.yesterday || closeout.summary || "",
        todayPlan: prev.todayPlan || closeout.tomorrow_plan || "",
      }));
    }

    // Auto-show form if not yet completed
    if (!mine) {
      setShowForm(true);
    }

    setLoading(false);
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();

    // Refresh data every 60s
    const refresh = setInterval(loadData, CHECK_INTERVAL_MS);
    return () => clearInterval(refresh);
  }, [loadData]);

  // ── Form validation ─────────────────────────────────────────────

  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    if (formData.yesterday.trim().length < MIN_FIELD_LENGTH) {
      errors.yesterday = `Mínimo ${MIN_FIELD_LENGTH} caracteres`;
    }
    if (formData.todayPlan.trim().length < MIN_FIELD_LENGTH) {
      errors.todayPlan = `Mínimo ${MIN_FIELD_LENGTH} caracteres`;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ── Submit handler ──────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;
    if (!userId || !orgId) return;

    setSubmitting(true);

    const { data, error } = await supabase
      .from("standups")
      .upsert(
        {
          user_id: userId,
          org_id: orgId,
          date: today,
          yesterday: formData.yesterday.trim(),
          today_plan: formData.todayPlan.trim(),
          blockers: formData.blockers.trim() || null,
          mood: null,
        },
        { onConflict: "user_id,org_id,date" }
      )
      .select("id, user_id, yesterday, today_plan, blockers, mood, submitted_at")
      .single();

    if (data && !error) {
      const entry = data as StandupEntry;
      setMyStandup(entry);
      setShowForm(false);

      // Update team status
      setTeamMembers((prev) =>
        prev.map((m) =>
          m.userId === userId
            ? { ...m, standup: entry, overdueMinutes: 0 }
            : m
        )
      );
    }

    setSubmitting(false);
  }

  // ── Derived values ──────────────────────────────────────────────

  const completedCount = useMemo(
    () => teamMembers.filter((m) => m.standup !== null).length,
    [teamMembers]
  );

  const missingCount = useMemo(
    () => teamMembers.filter((m) => m.standup === null).length,
    [teamMembers]
  );

  const sortedMembers = useMemo(() => {
    // Missing first (shame position), then completed by submission time
    return [...teamMembers].sort((a, b) => {
      if (a.standup === null && b.standup !== null) return -1;
      if (a.standup !== null && b.standup === null) return 1;
      if (a.standup && b.standup) {
        return (
          new Date(a.standup.submitted_at).getTime() -
          new Date(b.standup.submitted_at).getTime()
        );
      }
      return 0;
    });
  }, [teamMembers]);

  const isInStandupWindow = getCurrentHour() >= STANDUP_START_HOUR;
  const isMyStandupLate = myStandup
    ? wasSubmittedLate(myStandup.submitted_at)
    : false;

  // ── Don't render outside standup window ─────────────────────────

  if (!isInStandupWindow && !myStandup) return null;
  if (loading) {
    return (
      <Card
        size="sm"
        className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
      >
        <CardContent>
          <div className="flex items-center gap-2 py-3">
            <ClipboardCheck className="h-4 w-4 animate-pulse text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Cargando standup...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Escalation config ──────────────────────────────────────────

  const config = ESCALATION_CONFIG[escalation];
  const EscalationIcon = config.icon;

  // ─── Render ────────────────────────────────────────────────────

  return (
    <Card
      size="sm"
      className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
    >
      {/* ── Header ────────────────────────────────────────────── */}
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          <span>Standup Enforcer</span>
        </CardTitle>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end flex items-center gap-2">
          <Badge
            variant={
              completedCount === teamMembers.length
                ? "secondary"
                : "destructive"
            }
            className="tabular-nums"
          >
            <Users className="h-3 w-3" />
            {completedCount}/{teamMembers.length}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Escalation Banner (only if MY standup is missing) ── */}
        {!myStandup && (
          <EscalationBanner
            level={escalation}
            config={config}
            icon={EscalationIcon}
            isLate={escalation === "flagged"}
          />
        )}

        {/* ── My Standup: Completed State ─────────────────────── */}
        {myStandup && (
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl p-3 border",
              isMyStandupLate
                ? "bg-yellow-50/50 dark:bg-yellow-950/10 border-yellow-200/60 dark:border-yellow-800/40"
                : "bg-green-50/50 dark:bg-green-950/10 border-green-200/60 dark:border-green-800/40"
            )}
          >
            <CheckCircle2
              className={cn(
                "w-5 h-5 shrink-0",
                isMyStandupLate
                  ? "text-yellow-500"
                  : "text-green-500"
              )}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-semibold",
                  isMyStandupLate
                    ? "text-yellow-700 dark:text-yellow-400"
                    : "text-green-700 dark:text-green-400"
                )}
              >
                {isMyStandupLate
                  ? "Standup enviado (tardío)"
                  : "Standup completado"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Enviado a las{" "}
                {format(new Date(myStandup.submitted_at), "h:mm a")}
                {isMyStandupLate && " — marcado como tardío"}
              </p>
            </div>
            {isMyStandupLate && (
              <Badge variant="outline" className="text-[10px] border-yellow-300 dark:border-yellow-700 text-yellow-600">
                <Clock className="h-3 w-3" />
                Tardío
              </Badge>
            )}
          </div>
        )}

        {/* ── Inline Standup Form ─────────────────────────────── */}
        {!myStandup && showForm && (
          <StandupForm
            formData={formData}
            formErrors={formErrors}
            submitting={submitting}
            escalation={escalation}
            onFieldChange={(field, value) =>
              setFormData((prev) => ({ ...prev, [field]: value }))
            }
            onSubmit={handleSubmit}
          />
        )}

        {/* ── Show/Hide Form Toggle (when completed, to review) ─ */}
        {!myStandup && !showForm && (
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => setShowForm(true)}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            {config.ctaText}
          </Button>
        )}

        {/* ── Team Standup Board ──────────────────────────────── */}
        <div>
          <button
            type="button"
            onClick={() => setShowBoard((prev) => !prev)}
            className="flex items-center gap-2 w-full text-left group"
          >
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Standup Board — {format(new Date(), "d MMM", { locale: es })}
            </h3>
            <div className="flex items-center gap-1.5 ml-auto">
              {missingCount > 0 && (
                <span className="text-[10px] font-bold text-red-500 tabular-nums">
                  {missingCount} sin standup
                </span>
              )}
              {showBoard ? (
                <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </div>
          </button>

          {showBoard && (
            <div className="mt-3 space-y-1.5">
              {sortedMembers.map((member) => (
                <TeamMemberRow
                  key={member.userId}
                  member={member}
                  isCurrentUser={member.userId === userId}
                  escalation={escalation}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════

// ─── Escalation Banner ──────────────────────────────────────────────

function EscalationBanner({
  level,
  config,
  icon: Icon,
  isLate,
}: {
  level: EscalationLevel;
  config: (typeof ESCALATION_CONFIG)[EscalationLevel];
  icon: typeof ClipboardCheck;
  isLate: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-all duration-300",
        config.bgColor,
        config.borderColor,
        level === "flagged" && "animate-pulse"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            level === "pending"
              ? "bg-blue-100 dark:bg-blue-900/40"
              : "bg-red-100 dark:bg-red-900/40"
          )}
        >
          <Icon className={cn("w-5 h-5", config.iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-bold leading-tight",
              config.textColor
            )}
          >
            {level === "pending" && "\u{1F4CB} "}
            {level === "overdue" && "\u{1F6A8} "}
            {level === "flagged" && "\u{1F480} "}
            {config.bannerText}
          </p>
          {level === "overdue" && (
            <p className="text-[10px] text-red-500/70 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Vencido hace {formatOverdueTime(getMinutesPastDeadline())}
            </p>
          )}
          {level === "flagged" && (
            <p className="text-[10px] text-red-600/80 dark:text-red-400/80 mt-1">
              Puedes completarlo pero quedará marcado como tardío
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Inline Standup Form ────────────────────────────────────────────

function StandupForm({
  formData,
  formErrors,
  submitting,
  escalation,
  onFieldChange,
  onSubmit,
}: {
  formData: StandupFormData;
  formErrors: Record<string, string>;
  submitting: boolean;
  escalation: EscalationLevel;
  onFieldChange: (field: keyof StandupFormData, value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const isUrgent = escalation !== "pending";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {/* Yesterday */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          ¿Qué hiciste ayer?
        </label>
        <Textarea
          placeholder="Resumen de lo que lograste ayer..."
          value={formData.yesterday}
          onChange={(e) => onFieldChange("yesterday", e.target.value)}
          rows={2}
          className={cn(
            "text-sm resize-none rounded-xl",
            formErrors.yesterday &&
              "border-red-300 dark:border-red-700 focus-visible:ring-red-500"
          )}
        />
        {formErrors.yesterday && (
          <p className="text-[10px] text-red-500">{formErrors.yesterday}</p>
        )}
        {formData.yesterday && !formErrors.yesterday && (
          <p className="text-[10px] text-muted-foreground/50 tabular-nums">
            {formData.yesterday.length} caracteres
          </p>
        )}
      </div>

      {/* Today's plan */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <ClipboardCheck className="w-3 h-3" />
          ¿Qué harás hoy?
        </label>
        <Textarea
          placeholder="Plan específico para hoy..."
          value={formData.todayPlan}
          onChange={(e) => onFieldChange("todayPlan", e.target.value)}
          rows={2}
          className={cn(
            "text-sm resize-none rounded-xl",
            formErrors.todayPlan &&
              "border-red-300 dark:border-red-700 focus-visible:ring-red-500"
          )}
        />
        {formErrors.todayPlan && (
          <p className="text-[10px] text-red-500">{formErrors.todayPlan}</p>
        )}
        {formData.todayPlan && !formErrors.todayPlan && (
          <p className="text-[10px] text-muted-foreground/50 tabular-nums">
            {formData.todayPlan.length} caracteres
          </p>
        )}
      </div>

      {/* Blockers */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          Bloqueantes
          <span className="text-muted-foreground/40 font-normal normal-case tracking-normal">
            (opcional)
          </span>
        </label>
        <Input
          placeholder="¿Algo que te impide avanzar?"
          value={formData.blockers}
          onChange={(e) => onFieldChange("blockers", e.target.value)}
          className="text-sm rounded-xl"
        />
      </div>

      {/* Submit button */}
      <Button
        type="submit"
        disabled={submitting}
        className={cn(
          "w-full h-10 rounded-xl font-bold text-sm transition-all duration-300",
          isUrgent
            ? "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg shadow-red-600/25 hover:shadow-red-600/40 text-white border-0"
            : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 text-white border-0"
        )}
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <Send className="w-4 h-4 mr-2" />
            {escalation === "pending"
              ? "Enviar standup"
              : escalation === "overdue"
                ? "Completar standup ahora"
                : "Completar standup (tardío)"}
          </>
        )}
      </Button>

      {/* Urgency reinforcement */}
      {isUrgent && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-2.5">
          <p className="text-[10px] text-red-600/80 dark:text-red-400/80 text-center font-medium leading-relaxed">
            {escalation === "overdue"
              ? `Tu equipo ya completó sus standups. Llevas ${formatOverdueTime(getMinutesPastDeadline())} de retraso.`
              : `Este standup se marcará como tardío y quedará en tu historial de Accountability.`}
          </p>
        </div>
      )}
    </form>
  );
}

// ─── Team Member Row ────────────────────────────────────────────────

function TeamMemberRow({
  member,
  isCurrentUser,
  escalation,
}: {
  member: TeamMemberStatus;
  isCurrentUser: boolean;
  escalation: EscalationLevel;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasStandup = member.standup !== null;
  const isLate = hasStandup && wasSubmittedLate(member.standup!.submitted_at);
  const firstName = member.profile.full_name?.split(" ")[0] ?? "?";

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200",
        hasStandup
          ? "bg-green-50/30 dark:bg-green-950/5 border-green-200/40 dark:border-green-800/20"
          : "bg-red-50/30 dark:bg-red-950/5 border-red-200/40 dark:border-red-800/20",
        isCurrentUser && !hasStandup && "ring-1 ring-red-300 dark:ring-red-700",
        isCurrentUser && hasStandup && "ring-1 ring-green-300 dark:ring-green-700"
      )}
    >
      {/* Compact row */}
      <button
        type="button"
        onClick={() => hasStandup && setExpanded(!expanded)}
        disabled={!hasStandup}
        className={cn(
          "w-full flex items-center gap-2.5 p-2.5 text-left",
          hasStandup && "cursor-pointer hover:bg-green-50/50 dark:hover:bg-green-950/10 rounded-xl"
        )}
      >
        {/* Avatar */}
        <div className="relative shrink-0">
          <Avatar className="w-7 h-7 ring-2 ring-background shadow-sm">
            <AvatarImage src={member.profile.avatar_url ?? undefined} />
            <AvatarFallback
              className={cn(
                "text-[9px] font-semibold",
                !hasStandup && "grayscale opacity-60"
              )}
            >
              {getInitials(member.profile.full_name)}
            </AvatarFallback>
          </Avatar>
          {/* Status indicator */}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background flex items-center justify-center",
              hasStandup ? "bg-green-500" : "bg-red-500"
            )}
          >
            {hasStandup ? (
              <CheckCircle2 className="w-2 h-2 text-white" />
            ) : (
              <XCircle className="w-2 h-2 text-white" />
            )}
          </span>
        </div>

        {/* Name + status */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "text-xs font-semibold truncate",
                !hasStandup && "text-red-600 dark:text-red-400"
              )}
            >
              {firstName}
              {isCurrentUser && (
                <span className="text-muted-foreground font-normal"> (tú)</span>
              )}
            </span>
          </div>

          {hasStandup ? (
            <p className="text-[10px] text-muted-foreground truncate">
              {member.standup!.today_plan.slice(0, 60)}
              {member.standup!.today_plan.length > 60 && "..."}
            </p>
          ) : (
            <p className="text-[10px] text-red-500/70 font-medium">
              Sin standup
              {member.overdueMinutes > 0 &&
                ` · ${formatOverdueTime(member.overdueMinutes)} de retraso`}
            </p>
          )}
        </div>

        {/* Right side badges */}
        <div className="shrink-0 flex items-center gap-1.5">
          {hasStandup && isLate && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1 border-yellow-300 dark:border-yellow-700 text-yellow-600"
            >
              Tardío
            </Badge>
          )}
          {hasStandup && (
            <span className="text-[9px] text-muted-foreground/50 tabular-nums">
              {format(new Date(member.standup!.submitted_at), "h:mm a")}
            </span>
          )}
          {!hasStandup && escalation !== "pending" && (
            <Badge variant="destructive" className="text-[9px] h-4 px-1.5">
              <XCircle className="w-2.5 h-2.5" />
              Falta
            </Badge>
          )}
          {hasStandup && (
            expanded ? (
              <ChevronUp className="w-3 h-3 text-muted-foreground/40" />
            ) : (
              <ChevronDown className="w-3 h-3 text-muted-foreground/40" />
            )
          )}
        </div>
      </button>

      {/* Expanded standup details */}
      {expanded && hasStandup && (
        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-green-200/30 dark:border-green-800/15 ml-9 mr-2">
          {/* Yesterday */}
          <div className="pt-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">
              Ayer
            </p>
            <p className="text-xs text-foreground leading-relaxed">
              {member.standup!.yesterday}
            </p>
          </div>

          {/* Today */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">
              Hoy
            </p>
            <p className="text-xs text-foreground leading-relaxed">
              {member.standup!.today_plan}
            </p>
          </div>

          {/* Blockers */}
          {member.standup!.blockers && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-500/70 mb-0.5 flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />
                Bloqueante
              </p>
              <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                {member.standup!.blockers}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Re-export constants for external reference
export {
  STANDUP_START_HOUR,
  SOFT_DEADLINE_HOUR,
  HARD_DEADLINE_HOUR,
};
