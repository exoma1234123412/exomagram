"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { WeeklyContract, Profile } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { startOfWeek, endOfWeek, differenceInCalendarDays, format } from "date-fns";
import { es } from "date-fns/locale";
import {
  FileSignature,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Trophy,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Pen,
} from "lucide-react";

// ─────────────────────────────────────────────
// Grade styling — shared across the page
// ─────────────────────────────────────────────
const GRADE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  A: {
    color: "text-green-700 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/20",
    border: "border-green-200 dark:border-green-900",
  },
  B: {
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-900",
  },
  C: {
    color: "text-yellow-700 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-950/20",
    border: "border-yellow-200 dark:border-yellow-900",
  },
  D: {
    color: "text-orange-700 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/20",
    border: "border-orange-200 dark:border-orange-900",
  },
  F: {
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/20",
    border: "border-red-200 dark:border-red-900",
  },
};

function gradeStyle(grade: string | null | undefined) {
  return GRADE_STYLE[grade ?? ""] ?? GRADE_STYLE.C;
}

// ─────────────────────────────────────────────
// Helper: week start (Monday)
// ─────────────────────────────────────────────
function getWeekStart(date: Date = new Date()): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function getWeekEnd(weekStartStr: string): Date {
  const d = new Date(weekStartStr + "T12:00:00");
  return endOfWeek(d, { weekStartsOn: 1 });
}

function daysLeftInWeek(weekStartStr: string): number {
  const end = getWeekEnd(weekStartStr);
  const today = new Date();
  const diff = differenceInCalendarDays(end, today);
  return Math.max(0, diff + 1); // +1 to include today
}

function formatWeekRange(weekStartStr: string): string {
  const start = new Date(weekStartStr + "T12:00:00");
  const end = getWeekEnd(weekStartStr);
  return `${format(start, "d MMM", { locale: es })} - ${format(end, "d MMM yyyy", { locale: es })}`;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface ContractWithProfile extends WeeklyContract {
  profiles?: Profile;
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function ContractPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [myContract, setMyContract] = useState<WeeklyContract | null>(null);
  const [teamContracts, setTeamContracts] = useState<ContractWithProfile[]>([]);
  const [historyContracts, setHistoryContracts] = useState<WeeklyContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state for new contract
  const [c1, setC1] = useState("");
  const [c2, setC2] = useState("");
  const [c3, setC3] = useState("");
  const [consequence, setConsequence] = useState("");

  // Week navigation
  const [currentWeek, setCurrentWeek] = useState(getWeekStart());
  const isCurrentWeek = currentWeek === getWeekStart();

  const loadData = useCallback(async () => {
    if (!orgId || !userId) return;
    setLoading(true);

    // Load my contract for selected week
    const { data: mine } = await supabase
      .from("weekly_contracts")
      .select("*")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("week_start", currentWeek)
      .limit(1)
      .single();

    setMyContract(mine as WeeklyContract | null);

    // Load team contracts for selected week
    const { data: team } = await supabase
      .from("weekly_contracts")
      .select("*, profiles(full_name, avatar_url)")
      .eq("org_id", orgId)
      .eq("week_start", currentWeek)
      .neq("user_id", userId)
      .order("created_at");

    setTeamContracts((team ?? []) as unknown as ContractWithProfile[]);

    // Load my historical contracts (last 8 weeks, excluding current)
    const { data: history } = await supabase
      .from("weekly_contracts")
      .select("*")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .neq("week_start", currentWeek)
      .order("week_start", { ascending: false })
      .limit(8);

    setHistoryContracts((history ?? []) as WeeklyContract[]);
    setLoading(false);
  }, [orgId, userId, currentWeek]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }
    loadData();
  }, [orgLoading, orgId, userId, loadData]);

  // Real-time subscription
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("weekly_contracts_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "weekly_contracts",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ───────────────────────────────

  async function signContract(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !orgId) return;
    const texts = [c1.trim(), c2.trim(), c3.trim()].filter(Boolean);
    if (texts.length < 3) return;
    setSubmitting(true);

    const commitments = texts.map((text) => ({ text, delivered: false }));
    const { data } = await supabase
      .from("weekly_contracts")
      .insert({
        user_id: userId,
        org_id: orgId,
        week_start: currentWeek,
        commitments,
        status: "active",
      })
      .select("*")
      .single();

    if (data) {
      // Store in audit_log with consequence
      await supabase.from("audit_log").insert({
        org_id: orgId,
        user_id: userId,
        action: "entry_created",
        target_type: "weekly_contract",
        target_id: data.id,
        new_data: {
          commitments: texts,
          consequence: consequence.trim() || null,
          week_start: currentWeek,
        },
      });

      setMyContract(data as WeeklyContract);
      setC1("");
      setC2("");
      setC3("");
      setConsequence("");
    }
    setSubmitting(false);
  }

  async function toggleDelivered(index: number) {
    if (!myContract || myContract.status !== "active") return;
    const updated = myContract.commitments.map((c, i) =>
      i === index ? { ...c, delivered: !c.delivered } : c
    );

    await supabase
      .from("weekly_contracts")
      .update({ commitments: updated })
      .eq("id", myContract.id);

    setMyContract({ ...myContract, commitments: updated });
  }

  // ─── Week navigation ──────────────────────

  function goToPrevWeek() {
    const d = new Date(currentWeek + "T12:00:00");
    d.setDate(d.getDate() - 7);
    setCurrentWeek(getWeekStart(d));
  }

  function goToNextWeek() {
    const d = new Date(currentWeek + "T12:00:00");
    d.setDate(d.getDate() + 7);
    const next = getWeekStart(d);
    if (next <= getWeekStart()) {
      setCurrentWeek(next);
    }
  }

  function goToCurrentWeek() {
    setCurrentWeek(getWeekStart());
  }

  // ─── Cumplimiento calculation ──────────────

  function calcCumplimiento(): number {
    const allContracts = [...historyContracts, ...(myContract ? [myContract] : [])].filter(
      (c) => c.status === "graded"
    );
    if (allContracts.length === 0) return 0;
    const total = allContracts.reduce((sum, c) => sum + c.commitments.length, 0);
    const delivered = allContracts.reduce(
      (sum, c) => sum + c.commitments.filter((cm) => cm.delivered).length,
      0
    );
    return total > 0 ? Math.round((delivered / total) * 100) : 0;
  }

  // ─── Loading state ─────────────────────────

  if (loading || orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      </div>
    );
  }

  const remaining = daysLeftInWeek(currentWeek);
  const cumplimiento = calcCumplimiento();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* ─── Header ─────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileSignature className="w-6 h-6 text-primary" />
          Pacto Semanal
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          3 compromisos concretos cada lunes. El viernes, se evalua la entrega.
        </p>
      </div>

      {/* ─── Week navigation ─────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <Button variant="ghost" size="sm" onClick={goToPrevWeek} className="rounded-xl">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-semibold capitalize">{formatWeekRange(currentWeek)}</p>
          {isCurrentWeek && (
            <p className="text-xs text-muted-foreground">
              {remaining > 0 ? `${remaining} dia${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}` : "Semana terminada"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={goToNextWeek}
            disabled={isCurrentWeek}
            className="rounded-xl"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          {!isCurrentWeek && (
            <Button variant="outline" size="sm" onClick={goToCurrentWeek} className="rounded-xl text-xs">
              Hoy
            </Button>
          )}
        </div>
      </div>

      {/* ─── Stats row ─────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-accent/40 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold tabular-nums tracking-tight">{cumplimiento}%</p>
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
            <TrendingUp className="w-3 h-3" /> Cumplimiento
          </p>
        </div>
        <div className="bg-accent/40 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold tabular-nums tracking-tight">{teamContracts.length + (myContract ? 1 : 0)}</p>
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
            <FileSignature className="w-3 h-3" /> Pactos firmados
          </p>
        </div>
        <div className="bg-accent/40 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold tabular-nums tracking-tight">{remaining}</p>
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
            <CalendarDays className="w-3 h-3" /> Dias restantes
          </p>
        </div>
      </div>

      {/* ─── My Contract ────────────────────── */}
      <section className="mb-8">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Pen className="w-4 h-4 text-primary" />
          Mi pacto
        </h2>

        {!myContract && isCurrentWeek ? (
          <Card className="border-2 border-dashed border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <FileSignature className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-bold text-lg">Firma tu pacto semanal</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Escribe 3 compromisos concretos para esta semana. Tu equipo los vera.
                </p>
              </div>

              <form onSubmit={signContract} className="space-y-3">
                <div className="space-y-3">
                  {[
                    { value: c1, setter: setC1, n: 1 },
                    { value: c2, setter: setC2, n: 2 },
                    { value: c3, setter: setC3, n: 3 },
                  ].map(({ value, setter, n }) => (
                    <div key={n} className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {n}
                      </span>
                      <Input
                        placeholder={`Compromiso ${n}`}
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        required
                        minLength={5}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>

                {/* Consequence */}
                <div className="pt-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Si no cumplo... (consecuencia publica)
                  </label>
                  <textarea
                    placeholder="Ej: Invito el almuerzo al equipo / Hago la presentacion que nadie quiere / Limpio el backlog"
                    value={consequence}
                    onChange={(e) => setConsequence(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting || !c1.trim() || !c2.trim() || !c3.trim()}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 transition-all duration-300 gap-2"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSignature className="w-4 h-4" />
                  )}
                  Firmar Pacto
                </Button>

                <p className="text-[10px] text-center text-muted-foreground/60">
                  Al firmar, te comprometes publicamente con tu equipo.
                </p>
              </form>
            </CardContent>
          </Card>
        ) : !myContract ? (
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No firmaste pacto esta semana.</p>
            </CardContent>
          </Card>
        ) : myContract.status === "active" ? (
          <ActiveContract contract={myContract} onToggle={toggleDelivered} remaining={remaining} isMine />
        ) : (
          <GradedContract contract={myContract} isMine />
        )}
      </section>

      {/* ─── Team Contracts ─────────────────── */}
      <section className="mb-8">
        <h2 className="font-semibold text-lg mb-4">Pactos del equipo</h2>

        {teamContracts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <FileSignature className="w-8 h-8 text-primary" />
            </div>
            <p className="text-muted-foreground text-sm">Nadie mas ha firmado pacto esta semana.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {teamContracts.map((tc) => (
              <TeamContractCard key={tc.id} contract={tc} />
            ))}
          </div>
        )}
      </section>

      {/* ─── History ────────────────────────── */}
      {historyContracts.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Historial
          </h2>
          <div className="space-y-3">
            {historyContracts.map((hc) => (
              <HistoryRow key={hc.id} contract={hc} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Active Contract (status = "active")
// ─────────────────────────────────────────────
function ActiveContract({
  contract,
  onToggle,
  remaining,
  isMine,
}: {
  contract: WeeklyContract;
  onToggle?: (i: number) => void;
  remaining: number;
  isMine: boolean;
}) {
  const delivered = contract.commitments.filter((c) => c.delivered).length;
  const total = contract.commitments.length;

  return (
    <Card className="border-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs gap-1 text-primary border-primary/30">
              <FileSignature className="w-3 h-3" /> Activo
            </Badge>
            <span className="text-xs text-muted-foreground">
              {delivered}/{total} entregados
            </span>
          </div>
          {remaining > 0 && (
            <span className="text-xs text-muted-foreground">
              {remaining} dia{remaining !== 1 ? "s" : ""} restante{remaining !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-accent/60 mb-4 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-700 transition-all duration-500"
            style={{ width: `${total > 0 ? (delivered / total) * 100 : 0}%` }}
          />
        </div>

        <div className="space-y-2">
          {contract.commitments.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => isMine && onToggle?.(i)}
              disabled={!isMine}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                c.delivered
                  ? "bg-green-50 dark:bg-green-950/20"
                  : "bg-accent/40 hover:bg-accent/60",
                !isMine && "cursor-default"
              )}
            >
              {c.delivered ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />
              )}
              <span
                className={cn(
                  "flex-1 text-sm font-medium",
                  c.delivered && "line-through text-muted-foreground"
                )}
              >
                {c.text}
              </span>
            </button>
          ))}
        </div>

        {isMine && (
          <p className="text-[10px] text-muted-foreground/60 mt-3 text-center">
            Marca cada compromiso conforme lo vayas entregando.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// Graded Contract (status = "graded")
// ─────────────────────────────────────────────
function GradedContract({
  contract,
  isMine,
}: {
  contract: WeeklyContract;
  isMine: boolean;
}) {
  const gs = gradeStyle(contract.overall_grade);

  return (
    <Card className={cn("transition-all duration-300 hover:shadow-lg hover:shadow-primary/5", gs.border)}>
      <CardContent className="p-5">
        {/* Grade header */}
        <div className="flex items-start gap-4 mb-4">
          <div
            className={cn(
              "w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0",
              gs.bg
            )}
          >
            <Trophy className={cn("w-5 h-5", gs.color)} />
            <span className={cn("text-2xl font-black -mt-0.5 tabular-nums", gs.color)}>
              {contract.overall_grade ?? "?"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={cn("text-xs", gs.color, gs.border)}>
                Calificado
              </Badge>
              {contract.graded_at && (
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(contract.graded_at), "d MMM yyyy", { locale: es })}
                </span>
              )}
            </div>
            {contract.ai_assessment && (
              <p className="text-sm text-muted-foreground leading-relaxed">{contract.ai_assessment}</p>
            )}
          </div>
        </div>

        {/* Commitments with individual grades */}
        <div className="space-y-2">
          {contract.commitments.map((c, i) => {
            const cgs = gradeStyle(c.grade);
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl",
                  c.delivered ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"
                )}
              >
                {c.delivered ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-red-400 shrink-0" />
                )}
                <span
                  className={cn(
                    "flex-1 text-sm font-medium",
                    !c.delivered && "text-muted-foreground"
                  )}
                >
                  {c.text}
                </span>
                {c.grade && (
                  <span className={cn("text-sm font-bold tabular-nums", cgs.color)}>
                    {c.grade}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// Team member contract card
// ─────────────────────────────────────────────
function TeamContractCard({ contract }: { contract: ContractWithProfile }) {
  const profile = contract.profiles;
  const delivered = contract.commitments.filter((c) => c.delivered).length;
  const total = contract.commitments.length;
  const isGraded = contract.status === "graded";
  const gs = gradeStyle(contract.overall_grade);

  return (
    <Card className={cn(
      "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
      isGraded && gs.border
    )}>
      <CardContent className="p-4">
        {/* User header */}
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">
              {getInitials(profile?.full_name ?? null)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{profile?.full_name ?? "Miembro"}</p>
            <p className="text-[10px] text-muted-foreground">
              {delivered}/{total} entregados
            </p>
          </div>
          {isGraded && contract.overall_grade && (
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", gs.bg)}>
              <span className={cn("text-lg font-black tabular-nums", gs.color)}>
                {contract.overall_grade}
              </span>
            </div>
          )}
          {!isGraded && (
            <Badge variant="outline" className="text-[10px] gap-1 text-primary border-primary/30">
              Activo
            </Badge>
          )}
        </div>

        {/* Commitments */}
        <div className="space-y-1.5">
          {contract.commitments.map((c, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 text-sm pl-1",
                !c.delivered && isGraded && "opacity-50"
              )}
            >
              {c.delivered ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              )}
              <span className={cn("flex-1", c.delivered && isGraded && "line-through text-muted-foreground")}>
                {c.text}
              </span>
              {c.grade && (
                <span className={cn("text-xs font-bold tabular-nums", gradeStyle(c.grade).color)}>
                  {c.grade}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* AI Assessment */}
        {isGraded && contract.ai_assessment && (
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t leading-relaxed">
            {contract.ai_assessment}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// History row (compact)
// ─────────────────────────────────────────────
function HistoryRow({ contract }: { contract: WeeklyContract }) {
  const gs = gradeStyle(contract.overall_grade);
  const delivered = contract.commitments.filter((c) => c.delivered).length;
  const total = contract.commitments.length;

  return (
    <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
      <CardContent className="p-4 flex items-center gap-4">
        {/* Grade badge */}
        {contract.overall_grade ? (
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", gs.bg)}>
            <span className={cn("text-lg font-black tabular-nums", gs.color)}>
              {contract.overall_grade}
            </span>
          </div>
        ) : (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-accent/40">
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
        )}

        {/* Week info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium capitalize">{formatWeekRange(contract.week_start)}</p>
          <p className="text-xs text-muted-foreground">
            {delivered}/{total} entregados
          </p>
        </div>

        {/* Status */}
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            contract.status === "graded" ? gs.color : "text-primary"
          )}
        >
          {contract.status === "graded" ? "Calificado" : "Activo"}
        </Badge>
      </CardContent>
    </Card>
  );
}
