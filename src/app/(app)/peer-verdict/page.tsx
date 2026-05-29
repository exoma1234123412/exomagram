"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, getInitials } from "@/lib/utils";
import {
  Scale,
  Eye,
  Crown,
  Skull,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  MessageSquare,
  Send,
} from "lucide-react";
import { startOfWeek, format, subWeeks } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────

interface PeerRating {
  raterId: string;
  raterName: string;
  targetId: string;
  targetName: string;
  productividad: number;
  confiabilidad: number;
  calidad: number;
  colaboracion: number;
  comment: string;
}

interface WeekVerdicts {
  ratings: PeerRating[];
  submittedBy: string[]; // user IDs who have submitted
  submittedAt: string; // ISO date
}

interface MemberSummary {
  userId: string;
  profile: Profile;
  avgProductividad: number;
  avgConfiabilidad: number;
  avgCalidad: number;
  avgColaboracion: number;
  overallAvg: number;
  ratingsReceived: PeerRating[];
  rank: number;
}

const DIMENSIONS = [
  { key: "productividad" as const, label: "Productividad", desc: "Rendimiento y output" },
  { key: "confiabilidad" as const, label: "Confiabilidad", desc: "Cumple lo que promete" },
  { key: "calidad" as const, label: "Calidad", desc: "Nivel del trabajo entregado" },
  { key: "colaboracion" as const, label: "Colaboración", desc: "Ayuda al equipo" },
];

function getWeekKey(): string {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  return format(weekStart, "yyyy-MM-dd");
}

function getPreviousWeekKey(): string {
  const now = new Date();
  const prevWeek = subWeeks(now, 1);
  const weekStart = startOfWeek(prevWeek, { weekStartsOn: 1 });
  return format(weekStart, "yyyy-MM-dd");
}

function getStorageKey(orgId: string, weekStart: string): string {
  return `peer_verdict_results_${orgId}_${weekStart}`;
}

function getUserSubmittedKey(orgId: string, weekStart: string, userId: string): string {
  return `peer_verdict_${orgId}_${weekStart}_${userId}`;
}

// ─── Page ──────────────────────────────────────────────────────

export default function PeerVerdictPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentWeek] = useState(getWeekKey());
  const [previousWeek] = useState(getPreviousWeekKey());
  const [weekResults, setWeekResults] = useState<WeekVerdicts | null>(null);
  const [prevWeekResults, setPrevWeekResults] = useState<WeekVerdicts | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [tab, setTab] = useState<"votar" | "resultados">("votar");

  // Rating form state: { [targetUserId]: { productividad, confiabilidad, calidad, colaboracion, comment } }
  const [ratings, setRatings] = useState<
    Record<string, { productividad: number; confiabilidad: number; calidad: number; colaboracion: number; comment: string }>
  >({});

  const supabase = createClient();

  // Load team members
  useEffect(() => {
    if (orgLoading || !orgId || !userId) return;

    async function loadData() {
      // Get all org members with profiles
      const { data: memberData } = await supabase
        .from("org_members")
        .select("user_id, profiles(id, email, full_name, avatar_url)")
        .eq("org_id", orgId!);

      if (memberData) {
        const profiles = memberData
          .map((m) => (m.profiles as unknown as Profile))
          .filter(Boolean);
        setMembers(profiles);

        // Initialize ratings for non-self members
        const initialRatings: typeof ratings = {};
        profiles.forEach((p) => {
          if (p.id !== userId) {
            initialRatings[p.id] = {
              productividad: 0,
              confiabilidad: 0,
              calidad: 0,
              colaboracion: 0,
              comment: "",
            };
          }
        });
        setRatings(initialRatings);
      }

      // Check if user has already submitted this week
      const submittedKey = getUserSubmittedKey(orgId!, currentWeek, userId!);
      const submitted = localStorage.getItem(submittedKey);
      if (submitted) {
        setHasSubmitted(true);
        setTab("resultados");
      }

      // Load current week results
      const resultsKey = getStorageKey(orgId!, currentWeek);
      const stored = localStorage.getItem(resultsKey);
      if (stored) {
        try {
          setWeekResults(JSON.parse(stored));
        } catch { /* ignore */ }
      }

      // Load previous week results for trends
      const prevResultsKey = getStorageKey(orgId!, previousWeek);
      const prevStored = localStorage.getItem(prevResultsKey);
      if (prevStored) {
        try {
          setPrevWeekResults(JSON.parse(prevStored));
        } catch { /* ignore */ }
      }

      setLoading(false);
    }
    loadData();
  }, [orgId, userId, orgLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute member summaries from results
  const summaries = useMemo((): MemberSummary[] => {
    if (!weekResults || weekResults.ratings.length === 0) return [];

    const grouped: Record<string, PeerRating[]> = {};
    weekResults.ratings.forEach((r) => {
      if (!grouped[r.targetId]) grouped[r.targetId] = [];
      grouped[r.targetId].push(r);
    });

    const results: MemberSummary[] = [];
    Object.entries(grouped).forEach(([targetId, ratings]) => {
      const profile = members.find((m) => m.id === targetId);
      if (!profile) return;

      const avgP = ratings.reduce((a, r) => a + r.productividad, 0) / ratings.length;
      const avgC = ratings.reduce((a, r) => a + r.confiabilidad, 0) / ratings.length;
      const avgQ = ratings.reduce((a, r) => a + r.calidad, 0) / ratings.length;
      const avgCol = ratings.reduce((a, r) => a + r.colaboracion, 0) / ratings.length;
      const overall = (avgP + avgC + avgQ + avgCol) / 4;

      results.push({
        userId: targetId,
        profile,
        avgProductividad: avgP,
        avgConfiabilidad: avgC,
        avgCalidad: avgQ,
        avgColaboracion: avgCol,
        overallAvg: overall,
        ratingsReceived: ratings,
        rank: 0,
      });
    });

    // Sort by overall average descending
    results.sort((a, b) => b.overallAvg - a.overallAvg);
    results.forEach((r, i) => (r.rank = i + 1));

    return results;
  }, [weekResults, members]);

  // Previous week summaries for trend
  const prevSummaries = useMemo((): Record<string, number> => {
    if (!prevWeekResults || prevWeekResults.ratings.length === 0) return {};
    const grouped: Record<string, PeerRating[]> = {};
    prevWeekResults.ratings.forEach((r) => {
      if (!grouped[r.targetId]) grouped[r.targetId] = [];
      grouped[r.targetId].push(r);
    });
    const result: Record<string, number> = {};
    Object.entries(grouped).forEach(([targetId, ratings]) => {
      const avgP = ratings.reduce((a, r) => a + r.productividad, 0) / ratings.length;
      const avgC = ratings.reduce((a, r) => a + r.confiabilidad, 0) / ratings.length;
      const avgQ = ratings.reduce((a, r) => a + r.calidad, 0) / ratings.length;
      const avgCol = ratings.reduce((a, r) => a + r.colaboracion, 0) / ratings.length;
      result[targetId] = (avgP + avgC + avgQ + avgCol) / 4;
    });
    return result;
  }, [prevWeekResults]);

  const bestMember = summaries.length > 0 ? summaries[0] : null;
  const worstMember = summaries.length > 0 ? summaries[summaries.length - 1] : null;

  // Set a dimension rating
  function setDimensionRating(targetId: string, dimension: keyof typeof ratings[string], value: number) {
    setRatings((prev) => ({
      ...prev,
      [targetId]: {
        ...prev[targetId],
        [dimension]: value,
      },
    }));
  }

  // Set comment
  function setComment(targetId: string, comment: string) {
    setRatings((prev) => ({
      ...prev,
      [targetId]: {
        ...prev[targetId],
        comment,
      },
    }));
  }

  // Check if all ratings are complete
  const allRated = Object.entries(ratings).every(
    ([, r]) => r.productividad > 0 && r.confiabilidad > 0 && r.calidad > 0 && r.colaboracion > 0
  );

  // Submit all verdicts
  async function handleSubmit() {
    if (!orgId || !userId || !allRated) return;
    setSubmitting(true);

    const myProfile = members.find((m) => m.id === userId);
    const myName = myProfile?.full_name || myProfile?.email || "Anónimo";

    // Build ratings array
    const newRatings: PeerRating[] = Object.entries(ratings).map(([targetId, r]) => {
      const targetProfile = members.find((m) => m.id === targetId);
      return {
        raterId: userId,
        raterName: myName,
        targetId,
        targetName: targetProfile?.full_name || targetProfile?.email || "?",
        productividad: r.productividad,
        confiabilidad: r.confiabilidad,
        calidad: r.calidad,
        colaboracion: r.colaboracion,
        comment: r.comment,
      };
    });

    // Load existing results and merge
    const resultsKey = getStorageKey(orgId, currentWeek);
    let existing: WeekVerdicts = { ratings: [], submittedBy: [], submittedAt: "" };
    const stored = localStorage.getItem(resultsKey);
    if (stored) {
      try {
        existing = JSON.parse(stored);
      } catch { /* ignore */ }
    }

    // Remove any previous ratings from this user (in case of re-submit)
    existing.ratings = existing.ratings.filter((r) => r.raterId !== userId);
    existing.ratings.push(...newRatings);

    if (!existing.submittedBy.includes(userId)) {
      existing.submittedBy.push(userId);
    }
    existing.submittedAt = new Date().toISOString();

    // Save to localStorage
    localStorage.setItem(resultsKey, JSON.stringify(existing));
    localStorage.setItem(getUserSubmittedKey(orgId, currentWeek, userId), "true");

    setWeekResults(existing);
    setHasSubmitted(true);
    setTab("resultados");
    setSubmitting(false);
  }

  // ─── Render ──────────────────────────────────────────────────

  if (loading || orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground font-mono text-sm">No perteneces a ninguna organización.</p>
      </div>
    );
  }

  const weekLabel = format(new Date(currentWeek + "T12:00:00"), "'Semana del' d 'de' MMMM", { locale: es });
  const otherMembers = members.filter((m) => m.id !== userId);
  const participationCount = weekResults?.submittedBy.length || 0;
  const totalVoters = otherMembers.length > 0 ? members.length : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* ─── Header ──────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Scale className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            Peer Verdict
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          {weekLabel} &mdash; Calificaciones 100% públicas con nombre
        </p>

        {/* Participation meter */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-mono text-[11px] text-muted-foreground">
              Participación:
            </span>
          </div>
          <div className="flex-1 h-1.5 bg-accent/40 border border-border overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: totalVoters > 0 ? `${(participationCount / totalVoters) * 100}%` : "0%" }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {participationCount}/{totalVoters}
          </span>
        </div>
      </div>

      {/* ─── Warning banner ──────────────────────────────── */}
      <div className="mb-8 border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-mono text-[11px] font-semibold text-amber-500 uppercase tracking-wide">
            Advertencia
          </p>
          <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
            Tus calificaciones serán públicas para todo el equipo. Cada miembro verá exactamente qué puntuación le diste y tu nombre adjunto.
          </p>
        </div>
      </div>

      {/* ─── Tabs ──────────────────────────────────────── */}
      <div className="flex gap-0 mb-8 border border-border">
        <button
          onClick={() => setTab("votar")}
          className={cn(
            "flex-1 px-4 py-2 font-mono text-xs uppercase tracking-wide transition-colors",
            tab === "votar"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent/30"
          )}
        >
          Votar
        </button>
        <button
          onClick={() => setTab("resultados")}
          className={cn(
            "flex-1 px-4 py-2 font-mono text-xs uppercase tracking-wide transition-colors border-l border-border",
            tab === "resultados"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent/30"
          )}
        >
          Resultados
        </button>
      </div>

      {/* ─── VOTING TAB ──────────────────────────────────── */}
      {tab === "votar" && (
        <>
          {hasSubmitted ? (
            <div className="border border-border p-8 text-center">
              <div className="w-16 h-16 border border-border mx-auto flex items-center justify-center mb-4">
                <Scale className="w-8 h-8 text-primary" />
              </div>
              <p className="font-mono text-sm font-semibold mb-1">Ya enviaste tus veredictos esta semana</p>
              <p className="font-mono text-xs text-muted-foreground">
                Revisa los resultados en la pestaña de Resultados.
              </p>
            </div>
          ) : otherMembers.length === 0 ? (
            <div className="border border-border p-8 text-center">
              <div className="w-16 h-16 border border-border mx-auto flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="font-mono text-sm text-muted-foreground">
                No hay otros miembros para calificar.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {otherMembers.map((member) => (
                <RatingCard
                  key={member.id}
                  member={member}
                  rating={ratings[member.id]}
                  onRatingChange={(dim, val) => setDimensionRating(member.id, dim, val)}
                  onCommentChange={(c) => setComment(member.id, c)}
                />
              ))}

              {/* Submit button */}
              <div className="border-t border-border pt-6">
                <Button
                  onClick={handleSubmit}
                  disabled={!allRated || submitting}
                  className="w-full bg-primary text-primary-foreground font-mono text-xs uppercase tracking-wide py-3 disabled:opacity-40"
                >
                  {submitting ? (
                    <span className="animate-pulse">Enviando veredictos...</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      Enviar Veredictos
                    </span>
                  )}
                </Button>
                {!allRated && (
                  <p className="font-mono text-[10px] text-destructive mt-2 text-center">
                    Debes calificar todas las dimensiones (1-5) para cada miembro antes de enviar.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── RESULTS TAB ──────────────────────────────────── */}
      {tab === "resultados" && (
        <>
          {summaries.length === 0 ? (
            <div className="border border-border p-8 text-center">
              <div className="w-16 h-16 border border-border mx-auto flex items-center justify-center mb-4">
                <Eye className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="font-mono text-sm text-muted-foreground">
                Aún no hay veredictos esta semana.
              </p>
              <p className="font-mono text-[10px] text-muted-foreground mt-1">
                Los resultados aparecerán cuando alguien envíe sus calificaciones.
              </p>
            </div>
          ) : (
            <>
              {/* Best & Worst banner */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                {bestMember && (
                  <div className="border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown className="w-4 h-4 text-emerald-500" />
                      <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-emerald-500 font-semibold">
                        Mejor Calificado
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 ring-1 ring-emerald-500/30">
                        <AvatarImage src={bestMember.profile.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px] font-mono bg-emerald-500/10 text-emerald-500">
                          {getInitials(bestMember.profile.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-mono text-sm font-bold">
                          {bestMember.profile.full_name || bestMember.profile.email}
                        </p>
                        <p className="font-mono text-xs tabular-nums text-emerald-500">
                          {bestMember.overallAvg.toFixed(1)}/5.0 promedio del equipo
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {worstMember && summaries.length > 1 && (
                  <div className="border border-red-500/30 bg-red-500/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Skull className="w-4 h-4 text-red-500" />
                      <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500 font-semibold">
                        Peor Calificado
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 ring-1 ring-red-500/30">
                        <AvatarImage src={worstMember.profile.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px] font-mono bg-red-500/10 text-red-500">
                          {getInitials(worstMember.profile.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-mono text-sm font-bold">
                          {worstMember.profile.full_name || worstMember.profile.email}
                        </p>
                        <p className="font-mono text-xs tabular-nums text-red-500">
                          {worstMember.overallAvg.toFixed(1)}/5.0 promedio del equipo
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Ranking table */}
              <div className="mb-8">
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
                  Ranking Semanal
                </p>

                {/* Table header */}
                <div className="hidden sm:grid grid-cols-[2.5rem_1fr_repeat(4,5rem)_4.5rem] gap-2 px-3 py-2 border border-border bg-accent/20 font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                  <span>#</span>
                  <span>Miembro</span>
                  <span className="text-center">PROD</span>
                  <span className="text-center">CONF</span>
                  <span className="text-center">CAL</span>
                  <span className="text-center">COL</span>
                  <span className="text-center">PROM</span>
                </div>

                {summaries.map((s) => {
                  const isExpanded = expandedMember === s.userId;
                  const prevAvg = prevSummaries[s.userId];
                  const trend = prevAvg !== undefined ? s.overallAvg - prevAvg : null;
                  const isFirst = s.rank === 1;
                  const isLast = s.rank === summaries.length && summaries.length > 1;

                  return (
                    <div key={s.userId}>
                      <button
                        onClick={() => setExpandedMember(isExpanded ? null : s.userId)}
                        className={cn(
                          "w-full grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_repeat(4,5rem)_4.5rem] gap-2 px-3 py-3 border border-t-0 border-border transition-colors hover:bg-accent/20 text-left",
                          isFirst && "border-l-emerald-500/50 border-l-2",
                          isLast && "border-l-red-500/50 border-l-2"
                        )}
                      >
                        {/* Rank */}
                        <span className={cn(
                          "font-mono text-sm tabular-nums font-bold",
                          isFirst && "text-emerald-500",
                          isLast && "text-red-500",
                          !isFirst && !isLast && "text-muted-foreground"
                        )}>
                          {s.rank}
                        </span>

                        {/* Name + trend */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar className="h-7 w-7 ring-1 ring-border shrink-0">
                            <AvatarImage src={s.profile.avatar_url || undefined} />
                            <AvatarFallback className="text-[9px] font-mono">
                              {getInitials(s.profile.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-mono text-xs font-semibold truncate">
                            {s.profile.full_name || s.profile.email}
                          </span>
                          {trend !== null && (
                            <span className={cn(
                              "flex items-center gap-0.5 font-mono text-[10px] tabular-nums shrink-0",
                              trend > 0 ? "text-emerald-500" : trend < 0 ? "text-red-500" : "text-muted-foreground"
                            )}>
                              {trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                              {trend > 0 ? "+" : ""}{trend.toFixed(1)}
                            </span>
                          )}
                        </div>

                        {/* Dimension scores - hidden on mobile */}
                        <span className="hidden sm:block font-mono text-xs tabular-nums text-center">
                          {s.avgProductividad.toFixed(1)}
                        </span>
                        <span className="hidden sm:block font-mono text-xs tabular-nums text-center">
                          {s.avgConfiabilidad.toFixed(1)}
                        </span>
                        <span className="hidden sm:block font-mono text-xs tabular-nums text-center">
                          {s.avgCalidad.toFixed(1)}
                        </span>
                        <span className="hidden sm:block font-mono text-xs tabular-nums text-center">
                          {s.avgColaboracion.toFixed(1)}
                        </span>

                        {/* Overall + chevron on mobile */}
                        <div className="flex items-center gap-1 justify-end sm:justify-center">
                          <span className={cn(
                            "font-mono text-sm tabular-nums font-bold",
                            isFirst && "text-emerald-500",
                            isLast && "text-red-500"
                          )}>
                            {s.overallAvg.toFixed(1)}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground sm:hidden" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground sm:hidden" />
                          )}
                        </div>
                      </button>

                      {/* Expanded detail - individual ratings */}
                      {isExpanded && (
                        <div className="border border-t-0 border-border bg-accent/10 p-4 space-y-3">
                          {/* Mobile dimension summary */}
                          <div className="sm:hidden grid grid-cols-4 gap-2 mb-3">
                            {[
                              { label: "PROD", val: s.avgProductividad },
                              { label: "CONF", val: s.avgConfiabilidad },
                              { label: "CAL", val: s.avgCalidad },
                              { label: "COL", val: s.avgColaboracion },
                            ].map((d) => (
                              <div key={d.label} className="text-center border border-border p-2">
                                <p className="font-mono text-[8px] tracking-[0.15em] uppercase text-muted-foreground">{d.label}</p>
                                <p className="font-mono text-sm tabular-nums font-bold mt-0.5">{d.val.toFixed(1)}</p>
                              </div>
                            ))}
                          </div>

                          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
                            Veredictos individuales ({s.ratingsReceived.length})
                          </p>
                          {s.ratingsReceived.map((r, i) => (
                            <div key={i} className="border border-border p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Eye className="w-3 h-3 text-primary" />
                                <span className="font-mono text-[11px] font-semibold">
                                  {r.raterName}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">te dio:</span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[10px]">
                                <span>
                                  Productividad{" "}
                                  <strong className="tabular-nums">{r.productividad}</strong>
                                </span>
                                <span>
                                  Confiabilidad{" "}
                                  <strong className="tabular-nums">{r.confiabilidad}</strong>
                                </span>
                                <span>
                                  Calidad{" "}
                                  <strong className="tabular-nums">{r.calidad}</strong>
                                </span>
                                <span>
                                  Colaboración{" "}
                                  <strong className="tabular-nums">{r.colaboracion}</strong>
                                </span>
                              </div>
                              {r.comment && (
                                <div className="mt-2 flex items-start gap-1.5">
                                  <MessageSquare className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                                  <p className="font-mono text-[10px] text-muted-foreground italic">
                                    &ldquo;{r.comment}&rdquo;
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── RatingCard Component ──────────────────────────────────────

function RatingCard({
  member,
  rating,
  onRatingChange,
  onCommentChange,
}: {
  member: Profile;
  rating: { productividad: number; confiabilidad: number; calidad: number; colaboracion: number; comment: string } | undefined;
  onRatingChange: (dim: "productividad" | "confiabilidad" | "calidad" | "colaboracion", val: number) => void;
  onCommentChange: (c: string) => void;
}) {
  if (!rating) return null;

  return (
    <div className="border border-border transition-colors duration-200 hover:border-primary/30">
      {/* Member header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <Avatar className="h-10 w-10 ring-1 ring-border">
          <AvatarImage src={member.avatar_url || undefined} />
          <AvatarFallback className="text-xs font-mono">
            {getInitials(member.full_name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-mono text-sm font-bold">
            {member.full_name || member.email}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {member.email}
          </p>
        </div>
      </div>

      {/* Dimensions */}
      <div className="p-4 space-y-4">
        {DIMENSIONS.map((dim) => (
          <div key={dim.key}>
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-mono text-[11px] font-semibold">{dim.label}</span>
              <span className="font-mono text-[9px] text-muted-foreground">{dim.desc}</span>
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((val) => {
                const isSelected = rating[dim.key] === val;
                return (
                  <button
                    key={val}
                    onClick={() => onRatingChange(dim.key, val)}
                    className={cn(
                      "w-10 h-10 font-mono text-sm tabular-nums font-bold border transition-colors",
                      isSelected
                        ? val <= 2
                          ? "bg-red-500/20 border-red-500/50 text-red-500"
                          : val === 3
                          ? "bg-amber-500/20 border-amber-500/50 text-amber-500"
                          : "bg-emerald-500/20 border-emerald-500/50 text-emerald-500"
                        : "border-border text-muted-foreground hover:bg-accent/30 hover:border-primary/30"
                    )}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Comment */}
        <div>
          <p className="font-mono text-[11px] font-semibold mb-2 flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3 text-muted-foreground" />
            Comentario público (opcional)
          </p>
          <Textarea
            value={rating.comment}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Todos verán este comentario con tu nombre..."
            className="font-mono text-xs min-h-[60px] resize-none"
          />
        </div>
      </div>
    </div>
  );
}
