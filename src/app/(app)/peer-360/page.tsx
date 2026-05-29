"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import {
  Radar,
  Send,
  Users,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Crown,
  Skull,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
} from "lucide-react";
import { startOfWeek, format, subWeeks } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────

const DIMENSIONS = [
  { key: "calidad" as const, label: "Calidad", desc: "Calidad del trabajo entregado" },
  { key: "velocidad" as const, label: "Velocidad", desc: "Velocidad de entrega" },
  { key: "comunicacion" as const, label: "Comunicación", desc: "Claridad y capacidad de respuesta" },
  { key: "confiabilidad" as const, label: "Confiabilidad", desc: "Cumple lo que dice" },
  { key: "actitud" as const, label: "Actitud", desc: "Trabajo en equipo y disposición" },
] as const;

type DimensionKey = (typeof DIMENSIONS)[number]["key"];

interface Rating360 {
  raterId: string;
  raterName: string;
  targetId: string;
  targetName: string;
  calidad: number;
  velocidad: number;
  comunicacion: number;
  confiabilidad: number;
  actitud: number;
}

interface Week360Data {
  ratings: Rating360[];
  submittedBy: string[];
}

interface MemberResult {
  userId: string;
  profile: Profile;
  avgCalidad: number;
  avgVelocidad: number;
  avgComunicacion: number;
  avgConfiabilidad: number;
  avgActitud: number;
  overallAvg: number;
  worstDim: DimensionKey;
  ratingsReceived: Rating360[];
  rank: number;
}

// ─── Helpers ────────────────────────────────────────────────────

function getWeekKey(offset = 0): string {
  const d = offset === 0 ? new Date() : subWeeks(new Date(), Math.abs(offset));
  const weekStart = startOfWeek(d, { weekStartsOn: 1 });
  return format(weekStart, "yyyy-MM-dd");
}

function buildFeedBody(
  raterId: string,
  targetId: string,
  week: string,
  r: { calidad: number; velocidad: number; comunicacion: number; confiabilidad: number; actitud: number }
): string {
  return `360|${raterId}|${targetId}|${week}|cal:${r.calidad}|vel:${r.velocidad}|com:${r.comunicacion}|con:${r.confiabilidad}|act:${r.actitud}`;
}

function parseFeedBody(body: string): {
  raterId: string;
  targetId: string;
  week: string;
  calidad: number;
  velocidad: number;
  comunicacion: number;
  confiabilidad: number;
  actitud: number;
} | null {
  const parts = body.split("|");
  if (parts[0] !== "360" || parts.length < 9) return null;
  const dims: Record<string, number> = {};
  for (let i = 4; i < parts.length; i++) {
    const [key, val] = parts[i].split(":");
    if (key && val) dims[key] = parseInt(val, 10);
  }
  return {
    raterId: parts[1],
    targetId: parts[2],
    week: parts[3],
    calidad: dims.cal || 0,
    velocidad: dims.vel || 0,
    comunicacion: dims.com || 0,
    confiabilidad: dims.con || 0,
    actitud: dims.act || 0,
  };
}

function computeSummaries(
  data: Week360Data,
  members: Profile[]
): MemberResult[] {
  if (!data || data.ratings.length === 0) return [];

  const grouped: Record<string, Rating360[]> = {};
  data.ratings.forEach((r) => {
    if (!grouped[r.targetId]) grouped[r.targetId] = [];
    grouped[r.targetId].push(r);
  });

  const results: MemberResult[] = [];
  Object.entries(grouped).forEach(([targetId, ratings]) => {
    const profile = members.find((m) => m.id === targetId);
    if (!profile) return;

    const n = ratings.length;
    const avgCal = ratings.reduce((a, r) => a + r.calidad, 0) / n;
    const avgVel = ratings.reduce((a, r) => a + r.velocidad, 0) / n;
    const avgCom = ratings.reduce((a, r) => a + r.comunicacion, 0) / n;
    const avgCon = ratings.reduce((a, r) => a + r.confiabilidad, 0) / n;
    const avgAct = ratings.reduce((a, r) => a + r.actitud, 0) / n;
    const overall = (avgCal + avgVel + avgCom + avgCon + avgAct) / 5;

    const dimMap: Record<DimensionKey, number> = {
      calidad: avgCal,
      velocidad: avgVel,
      comunicacion: avgCom,
      confiabilidad: avgCon,
      actitud: avgAct,
    };
    const worstDim = (Object.entries(dimMap) as [DimensionKey, number][]).sort(
      (a, b) => a[1] - b[1]
    )[0][0];

    results.push({
      userId: targetId,
      profile,
      avgCalidad: avgCal,
      avgVelocidad: avgVel,
      avgComunicacion: avgCom,
      avgConfiabilidad: avgCon,
      avgActitud: avgAct,
      overallAvg: overall,
      worstDim,
      ratingsReceived: ratings,
      rank: 0,
    });
  });

  results.sort((a, b) => b.overallAvg - a.overallAvg);
  results.forEach((r, i) => (r.rank = i + 1));
  return results;
}

// ─── Page ───────────────────────────────────────────────────────

export default function Peer360Page() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [tab, setTab] = useState<"evaluar" | "resultados" | "historial">("evaluar");
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const currentWeek = getWeekKey(0);
  const previousWeek = getWeekKey(1);

  const [currentData, setCurrentData] = useState<Week360Data | null>(null);
  const [prevData, setPrevData] = useState<Week360Data | null>(null);

  // History weeks
  const [historyWeeks, setHistoryWeeks] = useState<string[]>([]);
  const [selectedHistoryWeek, setSelectedHistoryWeek] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<Week360Data | null>(null);

  // Rating form: { [targetUserId]: { calidad, velocidad, comunicacion, confiabilidad, actitud } }
  const [ratings, setRatings] = useState<
    Record<string, Record<DimensionKey, number>>
  >({});

  // ─── Load data ──────────────────────────────────────────────

  useEffect(() => {
    if (orgLoading || !orgId || !userId) return;

    async function loadData() {
      // 1. Load org members
      const { data: memberData } = await supabase
        .from("org_members")
        .select("user_id, profiles(id, email, full_name, avatar_url)")
        .eq("org_id", orgId!);

      const profiles: Profile[] = [];
      if (memberData) {
        memberData.forEach((m) => {
          const p = m.profiles as unknown as Profile;
          if (p) profiles.push(p);
        });
      }
      setMembers(profiles);

      // Init ratings for non-self members
      const initial: Record<string, Record<DimensionKey, number>> = {};
      profiles.forEach((p) => {
        if (p.id !== userId) {
          initial[p.id] = { calidad: 0, velocidad: 0, comunicacion: 0, confiabilidad: 0, actitud: 0 };
        }
      });
      setRatings(initial);

      // 2. Load 360 ratings from public_feed for current week & previous
      const { data: feedItems } = await supabase
        .from("public_feed")
        .select("body, target_user_id, created_at")
        .eq("org_id", orgId!)
        .like("body", "360|%")
        .order("created_at", { ascending: false });

      if (feedItems) {
        const currentRatings: Rating360[] = [];
        const currentSubmitters: string[] = [];
        const prevRatings: Rating360[] = [];
        const prevSubmitters: string[] = [];
        const weeksSet = new Set<string>();

        feedItems.forEach((item) => {
          const parsed = parseFeedBody(item.body);
          if (!parsed) return;
          weeksSet.add(parsed.week);

          const raterProfile = profiles.find((p) => p.id === parsed.raterId);
          const targetProfile = profiles.find((p) => p.id === parsed.targetId);

          const rating: Rating360 = {
            raterId: parsed.raterId,
            raterName: raterProfile?.full_name || raterProfile?.email || "?",
            targetId: parsed.targetId,
            targetName: targetProfile?.full_name || targetProfile?.email || "?",
            calidad: parsed.calidad,
            velocidad: parsed.velocidad,
            comunicacion: parsed.comunicacion,
            confiabilidad: parsed.confiabilidad,
            actitud: parsed.actitud,
          };

          if (parsed.week === currentWeek) {
            currentRatings.push(rating);
            if (!currentSubmitters.includes(parsed.raterId)) {
              currentSubmitters.push(parsed.raterId);
            }
          } else if (parsed.week === previousWeek) {
            prevRatings.push(rating);
            if (!prevSubmitters.includes(parsed.raterId)) {
              prevSubmitters.push(parsed.raterId);
            }
          }
        });

        setCurrentData({ ratings: currentRatings, submittedBy: currentSubmitters });
        setPrevData({ ratings: prevRatings, submittedBy: prevSubmitters });

        // Check if current user submitted this week
        if (currentSubmitters.includes(userId!)) {
          setHasSubmitted(true);
          setTab("resultados");
        }

        // Build history weeks (excluding current)
        const pastWeeks = Array.from(weeksSet)
          .filter((w) => w !== currentWeek)
          .sort((a, b) => b.localeCompare(a));
        setHistoryWeeks(pastWeeks);
      }

      setLoading(false);
    }
    loadData();
  }, [orgId, userId, orgLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load history data for selected week
  useEffect(() => {
    if (!selectedHistoryWeek || !orgId || !members.length) {
      setHistoryData(null);
      return;
    }

    async function loadHistory() {
      const { data: feedItems } = await supabase
        .from("public_feed")
        .select("body")
        .eq("org_id", orgId!)
        .like("body", `360|%|${selectedHistoryWeek}|%`);

      if (!feedItems) {
        setHistoryData(null);
        return;
      }

      const ratings: Rating360[] = [];
      const submitters: string[] = [];
      feedItems.forEach((item) => {
        const parsed = parseFeedBody(item.body);
        if (!parsed || parsed.week !== selectedHistoryWeek) return;
        const raterProfile = members.find((p) => p.id === parsed.raterId);
        const targetProfile = members.find((p) => p.id === parsed.targetId);
        ratings.push({
          raterId: parsed.raterId,
          raterName: raterProfile?.full_name || raterProfile?.email || "?",
          targetId: parsed.targetId,
          targetName: targetProfile?.full_name || targetProfile?.email || "?",
          calidad: parsed.calidad,
          velocidad: parsed.velocidad,
          comunicacion: parsed.comunicacion,
          confiabilidad: parsed.confiabilidad,
          actitud: parsed.actitud,
        });
        if (!submitters.includes(parsed.raterId)) submitters.push(parsed.raterId);
      });

      setHistoryData({ ratings, submittedBy: submitters });
    }
    loadHistory();
  }, [selectedHistoryWeek, orgId, members]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Computed ─────────────────────────────────────────────────

  const currentSummaries = useMemo(
    () => computeSummaries(currentData || { ratings: [], submittedBy: [] }, members),
    [currentData, members]
  );

  const prevSummaryMap = useMemo((): Record<string, number> => {
    const s = computeSummaries(prevData || { ratings: [], submittedBy: [] }, members);
    const map: Record<string, number> = {};
    s.forEach((r) => (map[r.userId] = r.overallAvg));
    return map;
  }, [prevData, members]);

  const historySummaries = useMemo(
    () => computeSummaries(historyData || { ratings: [], submittedBy: [] }, members),
    [historyData, members]
  );

  const otherMembers = members.filter((m) => m.id !== userId);
  const participationCount = currentData?.submittedBy.length || 0;
  const totalVoters = members.length;

  const allRated = Object.values(ratings).every((r) =>
    DIMENSIONS.every((d) => r[d.key] > 0)
  );

  // ─── Handlers ─────────────────────────────────────────────────

  function setDimensionRating(targetId: string, dim: DimensionKey, val: number) {
    setRatings((prev) => ({
      ...prev,
      [targetId]: { ...prev[targetId], [dim]: val },
    }));
  }

  async function handleSubmit() {
    if (!orgId || !userId || !allRated) return;
    setSubmitting(true);

    const myProfile = members.find((m) => m.id === userId);
    const myName = myProfile?.full_name || myProfile?.email || "?";

    // Insert one public_feed row per target
    const inserts = Object.entries(ratings).map(([targetId, r]) => ({
      org_id: orgId,
      type: "team_update" as const,
      title: `360° Semanal — ${myName}`,
      body: buildFeedBody(userId!, targetId, currentWeek, r),
      target_user_id: targetId,
      urgency: "normal" as const,
      emoji: "360",
      is_ai_generated: false,
    }));

    const { error } = await supabase.from("public_feed").insert(inserts);

    if (!error) {
      // Refresh current data
      const newRatings: Rating360[] = Object.entries(ratings).map(([targetId, r]) => {
        const tp = members.find((m) => m.id === targetId);
        return {
          raterId: userId!,
          raterName: myName,
          targetId,
          targetName: tp?.full_name || tp?.email || "?",
          ...r,
        };
      });

      setCurrentData((prev) => {
        const existing = prev || { ratings: [], submittedBy: [] };
        const filtered = existing.ratings.filter((r) => r.raterId !== userId);
        return {
          ratings: [...filtered, ...newRatings],
          submittedBy: existing.submittedBy.includes(userId!)
            ? existing.submittedBy
            : [...existing.submittedBy, userId!],
        };
      });

      setHasSubmitted(true);
      setTab("resultados");
    }

    setSubmitting(false);
  }

  // ─── Render ───────────────────────────────────────────────────

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
        <p className="text-muted-foreground font-mono text-sm">
          No perteneces a ninguna organización.
        </p>
      </div>
    );
  }

  const weekLabel = format(
    new Date(currentWeek + "T12:00:00"),
    "'Semana del' d 'de' MMMM",
    { locale: es }
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* ─── Header ──────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Radar className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
            360° Semanal
          </h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          {weekLabel} — Evaluación entre pares, 100% pública con nombre
        </p>

        {/* Participation */}
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
              style={{
                width:
                  totalVoters > 0
                    ? `${(participationCount / totalVoters) * 100}%`
                    : "0%",
              }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {participationCount}/{totalVoters}
          </span>
        </div>
      </div>

      {/* ─── Warning ──────────────────────────────────────── */}
      <div className="mb-8 border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-mono text-[11px] font-semibold text-amber-500 uppercase tracking-wide">
            Sin anonimato
          </p>
          <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
            Cada miembro verá tu nombre y las puntuaciones exactas que le diste en cada dimensión.
          </p>
        </div>
      </div>

      {/* ─── Tabs ──────────────────────────────────────── */}
      <div className="flex gap-0 mb-8 border border-border">
        {(["evaluar", "resultados", "historial"] as const).map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 px-4 py-2 font-mono text-xs uppercase tracking-wide transition-colors",
              i > 0 && "border-l border-border",
              tab === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/30"
            )}
          >
            {t === "evaluar" ? "Evaluar" : t === "resultados" ? "Resultados" : "Historial"}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* EVALUAR TAB                                         */}
      {/* ═══════════════════════════════════════════════════ */}
      {tab === "evaluar" && (
        <>
          {hasSubmitted ? (
            <div className="border border-border p-8 text-center">
              <div className="w-16 h-16 border border-border mx-auto flex items-center justify-center mb-4">
                <Radar className="w-8 h-8 text-primary" />
              </div>
              <p className="font-mono text-sm font-semibold mb-1">
                Ya evaluaste a todos esta semana
              </p>
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
                No hay otros miembros para evaluar.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {otherMembers.map((member) => (
                <RatingCard
                  key={member.id}
                  member={member}
                  values={ratings[member.id]}
                  onRate={(dim, val) => setDimensionRating(member.id, dim, val)}
                />
              ))}

              {/* Submit */}
              <div className="border-t border-border pt-6">
                <Button
                  onClick={handleSubmit}
                  disabled={!allRated || submitting}
                  className="w-full bg-primary text-primary-foreground font-mono text-xs uppercase tracking-wide py-3 disabled:opacity-40"
                >
                  {submitting ? (
                    <span className="animate-pulse">Enviando evaluaciones...</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      Enviar evaluación 360°
                    </span>
                  )}
                </Button>
                {!allRated && (
                  <p className="font-mono text-[10px] text-destructive mt-2 text-center">
                    Debes calificar todas las dimensiones (1-5) para cada miembro.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* RESULTADOS TAB                                      */}
      {/* ═══════════════════════════════════════════════════ */}
      {tab === "resultados" && (
        <ResultsView
          summaries={currentSummaries}
          prevSummaryMap={prevSummaryMap}
          expandedMember={expandedMember}
          onToggleExpand={(id) =>
            setExpandedMember(expandedMember === id ? null : id)
          }
          weekLabel={weekLabel}
          members={members}
        />
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* HISTORIAL TAB                                       */}
      {/* ═══════════════════════════════════════════════════ */}
      {tab === "historial" && (
        <>
          {historyWeeks.length === 0 ? (
            <div className="border border-border p-8 text-center">
              <div className="w-16 h-16 border border-border mx-auto flex items-center justify-center mb-4">
                <Clock className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="font-mono text-sm text-muted-foreground">
                No hay historial de semanas anteriores.
              </p>
            </div>
          ) : (
            <>
              {/* Week selector */}
              <div className="mb-6">
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
                  Seleccionar semana
                </p>
                <div className="flex flex-wrap gap-2">
                  {historyWeeks.map((w) => {
                    const label = format(
                      new Date(w + "T12:00:00"),
                      "d MMM yyyy",
                      { locale: es }
                    );
                    return (
                      <button
                        key={w}
                        onClick={() => setSelectedHistoryWeek(w === selectedHistoryWeek ? null : w)}
                        className={cn(
                          "px-3 py-1.5 border font-mono text-xs transition-colors",
                          selectedHistoryWeek === w
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:bg-accent/30"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedHistoryWeek && historyData ? (
                <ResultsView
                  summaries={historySummaries}
                  prevSummaryMap={{}}
                  expandedMember={expandedMember}
                  onToggleExpand={(id) =>
                    setExpandedMember(expandedMember === id ? null : id)
                  }
                  weekLabel={format(
                    new Date(selectedHistoryWeek + "T12:00:00"),
                    "'Semana del' d 'de' MMMM yyyy",
                    { locale: es }
                  )}
                  members={members}
                />
              ) : selectedHistoryWeek ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
                    Cargando...
                  </div>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Results View ───────────────────────────────────────────────

function ResultsView({
  summaries,
  prevSummaryMap,
  expandedMember,
  onToggleExpand,
  weekLabel,
  members,
}: {
  summaries: MemberResult[];
  prevSummaryMap: Record<string, number>;
  expandedMember: string | null;
  onToggleExpand: (id: string) => void;
  weekLabel: string;
  members: Profile[];
}) {
  if (summaries.length === 0) {
    return (
      <div className="border border-border p-8 text-center">
        <div className="w-16 h-16 border border-border mx-auto flex items-center justify-center mb-4">
          <Eye className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="font-mono text-sm text-muted-foreground">
          Aún no hay evaluaciones esta semana.
        </p>
        <p className="font-mono text-[10px] text-muted-foreground mt-1">
          Los resultados aparecerán cuando alguien envíe sus calificaciones.
        </p>
      </div>
    );
  }

  const best = summaries[0];
  const worst = summaries.length > 1 ? summaries[summaries.length - 1] : null;

  return (
    <>
      {/* Best & Worst */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        <div className="border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-4 h-4 text-emerald-500" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-emerald-500 font-semibold">
              Mejor evaluado
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 ring-1 ring-emerald-500/30">
              <AvatarImage src={best.profile.avatar_url || undefined} />
              <AvatarFallback className="text-[10px] font-mono bg-emerald-500/10 text-emerald-500">
                {getInitials(best.profile.full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-mono text-sm font-bold">
                {best.profile.full_name || best.profile.email}
              </p>
              <p className="font-mono text-xs tabular-nums text-emerald-500">
                {best.overallAvg.toFixed(2)}/5.00
              </p>
            </div>
          </div>
        </div>
        {worst && (
          <div className="border border-red-500/30 bg-red-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Skull className="w-4 h-4 text-red-500" />
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500 font-semibold">
                Peor evaluado
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 ring-1 ring-red-500/30">
                <AvatarImage src={worst.profile.avatar_url || undefined} />
                <AvatarFallback className="text-[10px] font-mono bg-red-500/10 text-red-500">
                  {getInitials(worst.profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-mono text-sm font-bold">
                  {worst.profile.full_name || worst.profile.email}
                </p>
                <p className="font-mono text-xs tabular-nums text-red-500">
                  {worst.overallAvg.toFixed(2)}/5.00
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="mb-8">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Leaderboard 360°
        </p>

        {/* Table header */}
        <div className="hidden sm:grid grid-cols-[2rem_1fr_repeat(5,4rem)_4rem] gap-2 px-3 py-2 border border-border bg-accent/20 font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
          <span>#</span>
          <span>Miembro</span>
          <span className="text-center">CAL</span>
          <span className="text-center">VEL</span>
          <span className="text-center">COM</span>
          <span className="text-center">CON</span>
          <span className="text-center">ACT</span>
          <span className="text-center">PROM</span>
        </div>

        {summaries.map((s) => {
          const isExpanded = expandedMember === s.userId;
          const prevAvg = prevSummaryMap[s.userId];
          const trend = prevAvg !== undefined ? s.overallAvg - prevAvg : null;
          const isFirst = s.rank === 1;
          const isLast = s.rank === summaries.length && summaries.length > 1;

          const dimValues: { key: DimensionKey; label: string; avg: number }[] = [
            { key: "calidad", label: "CAL", avg: s.avgCalidad },
            { key: "velocidad", label: "VEL", avg: s.avgVelocidad },
            { key: "comunicacion", label: "COM", avg: s.avgComunicacion },
            { key: "confiabilidad", label: "CON", avg: s.avgConfiabilidad },
            { key: "actitud", label: "ACT", avg: s.avgActitud },
          ];

          return (
            <div key={s.userId}>
              <button
                onClick={() => onToggleExpand(s.userId)}
                className={cn(
                  "w-full grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_repeat(5,4rem)_4rem] gap-2 px-3 py-3 border border-t-0 border-border transition-colors hover:bg-accent/20 text-left",
                  isFirst && "border-l-emerald-500/50 border-l-2",
                  isLast && "border-l-red-500/50 border-l-2"
                )}
              >
                {/* Rank */}
                <span
                  className={cn(
                    "font-mono text-sm tabular-nums font-bold",
                    isFirst && "text-emerald-500",
                    isLast && "text-red-500",
                    !isFirst && !isLast && "text-muted-foreground"
                  )}
                >
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
                    <span
                      className={cn(
                        "flex items-center gap-0.5 font-mono text-[10px] tabular-nums shrink-0",
                        trend > 0
                          ? "text-emerald-500"
                          : trend < 0
                          ? "text-red-500"
                          : "text-muted-foreground"
                      )}
                    >
                      {trend > 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : trend < 0 ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : (
                        <Minus className="w-3 h-3" />
                      )}
                      {trend > 0 ? "+" : ""}
                      {trend.toFixed(1)}
                    </span>
                  )}
                </div>

                {/* Dimension scores (desktop) */}
                {dimValues.map((d) => (
                  <span
                    key={d.key}
                    className={cn(
                      "hidden sm:block font-mono text-xs tabular-nums text-center",
                      d.key === s.worstDim && "text-red-500 font-bold"
                    )}
                  >
                    {d.avg.toFixed(1)}
                  </span>
                ))}

                {/* Overall */}
                <div className="flex items-center gap-1 justify-end sm:justify-center">
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums font-bold",
                      isFirst && "text-emerald-500",
                      isLast && "text-red-500"
                    )}
                  >
                    {s.overallAvg.toFixed(1)}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground sm:hidden" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground sm:hidden" />
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border border-t-0 border-border bg-accent/10 p-4 space-y-4">
                  {/* Dimension bars */}
                  <div className="space-y-3">
                    {dimValues.map((d) => (
                      <div key={d.key}>
                        <div className="flex items-baseline justify-between mb-1">
                          <span
                            className={cn(
                              "font-mono text-[9px] tracking-[0.18em] uppercase",
                              d.key === s.worstDim
                                ? "text-red-500 font-bold"
                                : "text-muted-foreground"
                            )}
                          >
                            {DIMENSIONS.find((dim) => dim.key === d.key)?.label}
                            {d.key === s.worstDim && " — PEOR DIMENSIÓN"}
                          </span>
                          <span
                            className={cn(
                              "font-mono text-xs tabular-nums font-bold",
                              d.key === s.worstDim && "text-red-500"
                            )}
                          >
                            {d.avg.toFixed(2)}
                          </span>
                        </div>
                        <div className="h-2 bg-accent/30 border border-border overflow-hidden">
                          <div
                            className={cn(
                              "h-full transition-all duration-500",
                              d.key === s.worstDim
                                ? "bg-red-500"
                                : d.avg >= 4
                                ? "bg-emerald-500"
                                : d.avg >= 3
                                ? "bg-primary"
                                : "bg-amber-500"
                            )}
                            style={{ width: `${(d.avg / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Mobile dimension grid */}
                  <div className="sm:hidden grid grid-cols-5 gap-1.5">
                    {dimValues.map((d) => (
                      <div
                        key={d.key}
                        className={cn(
                          "text-center border p-2",
                          d.key === s.worstDim
                            ? "border-red-500/50 bg-red-500/5"
                            : "border-border"
                        )}
                      >
                        <p className="font-mono text-[7px] tracking-[0.12em] uppercase text-muted-foreground">
                          {d.label}
                        </p>
                        <p
                          className={cn(
                            "font-mono text-sm tabular-nums font-bold mt-0.5",
                            d.key === s.worstDim && "text-red-500"
                          )}
                        >
                          {d.avg.toFixed(1)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Individual ratings */}
                  <div>
                    <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
                      Evaluaciones individuales ({s.ratingsReceived.length})
                    </p>
                    {s.ratingsReceived.map((r, i) => (
                      <div
                        key={i}
                        className="border border-border p-3 mb-2 last:mb-0"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Eye className="w-3 h-3 text-primary" />
                          <span className="font-mono text-[11px] font-semibold">
                            {r.raterName}
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-2 font-mono text-[10px]">
                          {[
                            { label: "CAL", val: r.calidad },
                            { label: "VEL", val: r.velocidad },
                            { label: "COM", val: r.comunicacion },
                            { label: "CON", val: r.confiabilidad },
                            { label: "ACT", val: r.actitud },
                          ].map((d) => (
                            <div key={d.label} className="text-center">
                              <span className="text-muted-foreground">
                                {d.label}
                              </span>
                              <span
                                className={cn(
                                  "block tabular-nums font-bold",
                                  d.val <= 2
                                    ? "text-red-500"
                                    : d.val >= 4
                                    ? "text-emerald-500"
                                    : "text-foreground"
                                )}
                              >
                                {d.val}
                              </span>
                            </div>
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
    </>
  );
}

// ─── Rating Card ────────────────────────────────────────────────

function RatingCard({
  member,
  values,
  onRate,
}: {
  member: Profile;
  values: Record<DimensionKey, number> | undefined;
  onRate: (dim: DimensionKey, val: number) => void;
}) {
  if (!values) return null;

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
              <span className="font-mono text-[11px] font-semibold">
                {dim.label}
              </span>
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                {dim.desc}
              </span>
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((val) => {
                const isSelected = values[dim.key] === val;
                return (
                  <button
                    key={val}
                    onClick={() => onRate(dim.key, val)}
                    className={cn(
                      "w-8 h-8 border font-mono text-xs tabular-nums font-bold transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
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
      </div>
    </div>
  );
}
