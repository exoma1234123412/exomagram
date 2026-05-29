"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { CATEGORIES } from "@/lib/constants";
import { cn, formatHour } from "@/lib/utils";
import { analyzeEntryQuality, type EntryQualityReport } from "@/components/tracking/entry-quality-gate";
import type { WorkCategory } from "@/lib/types/database";
import { Trophy, Skull, Minus, X, Shield, FileText, Clock } from "lucide-react";

// ============================================================
// POST-ENTRY SHAME
// ============================================================
//
// Immediately after logging an entry, show how it compares
// to what everyone else logged at the same hour.
// Every entry is instantly judged against the team.

interface PostEntryShameProps {
  entry: {
    hour: number;
    date: string;
    category: string;
    title: string;
    description: string;
    proof_urls: string[];
  };
  onClose: () => void;
}

interface TeamEntryComparison {
  userName: string;
  category: string;
  title: string;
  descriptionWordCount: number;
  hasProof: boolean;
  qualityScore: number;
  qualityGrade: string;
}

type Verdict = "best" | "worst" | "average";

const MIN_DISPLAY_MS = 3000;
const AUTO_DISMISS_MS = 5000;

export function PostEntryShame({ entry, onClose }: PostEntryShameProps) {
  const { orgId, userId } = useOrg();
  const [teamEntries, setTeamEntries] = useState<TeamEntryComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [canDismiss, setCanDismiss] = useState(false);
  const mountTimeRef = useRef(Date.now());
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minDisplayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // My quality report
  const myReport: EntryQualityReport = analyzeEntryQuality(
    {
      title: entry.title,
      description: entry.description || null,
      proof_urls: entry.proof_urls.length > 0 ? entry.proof_urls : null,
      is_late: false,
      minutes_late: 0,
      project: null,
      mood: null,
      energy: null,
    },
    []
  );

  const myDescWordCount = entry.description
    ? entry.description.trim().split(/\s+/).filter(Boolean).length
    : 0;

  // Fetch team entries for same hour + date
  const fetchTeamEntries = useCallback(async () => {
    if (!orgId || !userId) return;

    const supabase = createClient();

    const { data: entries } = await supabase
      .from("time_entries")
      .select("user_id, category, title, description, proof_urls, is_late, minutes_late, project, mood, energy")
      .eq("org_id", orgId)
      .eq("date", entry.date)
      .eq("hour", entry.hour)
      .neq("user_id", userId);

    if (!entries || entries.length === 0) {
      setTeamEntries([]);
      setLoading(false);
      return;
    }

    // Get profiles for names
    const userIds = [...new Set(entries.map((e) => e.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name ?? "Anonimo"])
    );

    const comparisons: TeamEntryComparison[] = entries.map((e) => {
      const report = analyzeEntryQuality(
        {
          title: e.title,
          description: e.description,
          proof_urls: e.proof_urls,
          is_late: e.is_late,
          minutes_late: e.minutes_late,
          project: e.project,
          mood: e.mood,
          energy: e.energy,
        },
        []
      );

      const words = e.description
        ? e.description.trim().split(/\s+/).filter(Boolean).length
        : 0;

      return {
        userName: profileMap.get(e.user_id) ?? "Anonimo",
        category: e.category,
        title: e.title,
        descriptionWordCount: words,
        hasProof: (e.proof_urls?.length ?? 0) > 0,
        qualityScore: report.score,
        qualityGrade: report.grade,
      };
    });

    // Sort by quality score descending
    comparisons.sort((a, b) => b.qualityScore - a.qualityScore);

    setTeamEntries(comparisons);
    setLoading(false);
  }, [orgId, userId, entry.date, entry.hour]);

  useEffect(() => {
    fetchTeamEntries();
  }, [fetchTeamEntries]);

  // Min display timer (3s before dismiss button appears)
  useEffect(() => {
    minDisplayRef.current = setTimeout(() => {
      setCanDismiss(true);
    }, MIN_DISPLAY_MS);

    return () => {
      if (minDisplayRef.current) clearTimeout(minDisplayRef.current);
    };
  }, []);

  // Auto-dismiss after 5s
  useEffect(() => {
    autoDismissRef.current = setTimeout(() => {
      onClose();
    }, AUTO_DISMISS_MS);

    return () => {
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, [onClose]);

  function handleDismiss() {
    if (!canDismiss) return;
    onClose();
  }

  // Compute verdict
  function getVerdict(): Verdict {
    if (teamEntries.length === 0) return "average";
    const allScores = teamEntries.map((e) => e.qualityScore);
    const isBest = allScores.every((s) => myReport.score >= s);
    const isWorst = allScores.every((s) => myReport.score <= s);
    if (isBest) return "best";
    if (isWorst) return "worst";
    return "average";
  }

  // Compute team averages
  function getTeamAverages() {
    if (teamEntries.length === 0) return null;
    const avgScore =
      teamEntries.reduce((sum, e) => sum + e.qualityScore, 0) / teamEntries.length;
    const avgWords =
      teamEntries.reduce((sum, e) => sum + e.descriptionWordCount, 0) / teamEntries.length;
    const proofPercent =
      (teamEntries.filter((e) => e.hasProof).length / teamEntries.length) * 100;
    return {
      avgScore: Math.round(avgScore),
      avgWords: Math.round(avgWords),
      proofPercent: Math.round(proofPercent),
    };
  }

  const verdict = getVerdict();
  const teamAvg = getTeamAverages();

  const verdictConfig = {
    best: {
      label: "MEJOR",
      icon: Trophy,
      color: "text-green-500",
      border: "border-green-500/30",
      bg: "bg-green-500/5",
    },
    worst: {
      label: "PEOR",
      icon: Skull,
      color: "text-red-500",
      border: "border-red-500/30",
      bg: "bg-red-500/5",
    },
    average: {
      label: "PROMEDIO",
      icon: Minus,
      color: "text-muted-foreground",
      border: "border-border",
      bg: "bg-accent/10",
    },
  };

  const vc = verdictConfig[verdict];
  const VerdictIcon = vc.icon;

  const categoryInfo = CATEGORIES[entry.category as WorkCategory] ?? {
    label: entry.category,
    emoji: "--",
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md mx-4">
        <div className="border border-border bg-background">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-accent/30">
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                Tu entrada vs el equipo
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold tabular-nums">
                {formatHour(entry.hour)}
              </span>
              {canDismiss && (
                <button
                  onClick={handleDismiss}
                  className="p-0.5 hover:bg-accent transition-colors"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="px-3 py-6 flex items-center justify-center">
              <div className="w-4 h-4 border border-primary/40 border-t-primary animate-spin" />
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                Comparando...
              </span>
            </div>
          ) : (
            <>
              {/* Your entry */}
              <div className="px-3 py-2 border-b border-border">
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                  Tu entrada
                </span>
                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-[10px] font-bold text-muted-foreground shrink-0">
                        {categoryInfo.emoji}
                      </span>
                      <span className="font-mono text-xs truncate">
                        {entry.title}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "font-mono text-[10px] font-bold tabular-nums shrink-0 ml-2 px-1 border",
                        myReport.grade === "A" && "text-green-500 border-green-500/30",
                        myReport.grade === "B" && "text-blue-500 border-blue-500/30",
                        myReport.grade === "C" && "text-amber-500 border-amber-500/30",
                        myReport.grade === "D" && "text-orange-500 border-orange-500/30",
                        myReport.grade === "F" && "text-red-500 border-red-500/30"
                      )}
                    >
                      {myReport.grade} {myReport.score}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="w-2.5 h-2.5" />
                      <span className="tabular-nums">{myDescWordCount}</span> palabras
                    </span>
                    <span className="flex items-center gap-1">
                      <Shield className="w-2.5 h-2.5" />
                      {entry.proof_urls.length > 0 ? (
                        <span className="text-green-500">Con evidencia</span>
                      ) : (
                        <span className="text-red-500">Sin evidencia</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Team entries */}
              <div className="px-3 py-2 border-b border-border">
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                  {teamEntries.length > 0
                    ? `Lo que otros registraron a esta hora (${teamEntries.length})`
                    : "Nadie mas registro a esta hora"}
                </span>

                {teamEntries.length === 0 ? (
                  <div className="mt-2 py-2">
                    <p className="font-mono text-xs text-muted-foreground">
                      Nadie mas registro a las {formatHour(entry.hour)}. Eres el unico.
                    </p>
                  </div>
                ) : (
                  <div className="mt-1.5 divide-y divide-border/50">
                    {teamEntries.map((te, i) => {
                      const isBetter = te.qualityScore > myReport.score;
                      const isWorse = te.qualityScore < myReport.score;
                      const teamCat =
                        CATEGORIES[te.category as WorkCategory] ?? {
                          label: te.category,
                          emoji: "--",
                        };

                      return (
                        <div key={i} className="py-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono text-[10px] font-bold text-muted-foreground shrink-0">
                                {teamCat.emoji}
                              </span>
                              <span className="font-mono text-[11px] font-medium truncate">
                                {te.userName}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground truncate">
                                {te.title}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "font-mono text-[10px] font-bold tabular-nums shrink-0 ml-2 px-1 border",
                                te.qualityGrade === "A" && "text-green-500 border-green-500/30",
                                te.qualityGrade === "B" && "text-blue-500 border-blue-500/30",
                                te.qualityGrade === "C" && "text-amber-500 border-amber-500/30",
                                te.qualityGrade === "D" && "text-orange-500 border-orange-500/30",
                                te.qualityGrade === "F" && "text-red-500 border-red-500/30"
                              )}
                            >
                              {te.qualityGrade} {te.qualityScore}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                              <span className="tabular-nums">
                                {te.descriptionWordCount} palabras
                              </span>
                              <span>
                                {te.hasProof ? (
                                  <span className="text-green-500">Evidencia</span>
                                ) : (
                                  <span className="text-red-500">Sin evidencia</span>
                                )}
                              </span>
                            </div>
                            {isBetter && (
                              <span className="font-mono text-[9px] font-bold text-green-500 uppercase tracking-wider">
                                Te supera
                              </span>
                            )}
                            {isWorse && (
                              <span className="font-mono text-[9px] font-bold text-red-500 uppercase tracking-wider">
                                Por debajo de ti
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Team average comparison */}
              {teamAvg && (
                <div className="px-3 py-2 border-b border-border">
                  <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                    Promedio del equipo vs tu
                  </span>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {/* Quality score */}
                    <div className="border border-border p-1.5">
                      <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground block">
                        Calidad
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span
                          className={cn(
                            "font-mono text-sm font-bold tabular-nums",
                            myReport.score > teamAvg.avgScore
                              ? "text-green-500"
                              : myReport.score < teamAvg.avgScore
                                ? "text-red-500"
                                : "text-muted-foreground"
                          )}
                        >
                          {myReport.score}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
                          vs {teamAvg.avgScore}
                        </span>
                      </div>
                    </div>

                    {/* Description length */}
                    <div className="border border-border p-1.5">
                      <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground block">
                        Palabras
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span
                          className={cn(
                            "font-mono text-sm font-bold tabular-nums",
                            myDescWordCount > teamAvg.avgWords
                              ? "text-green-500"
                              : myDescWordCount < teamAvg.avgWords
                                ? "text-red-500"
                                : "text-muted-foreground"
                          )}
                        >
                          {myDescWordCount}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
                          vs {teamAvg.avgWords}
                        </span>
                      </div>
                    </div>

                    {/* Proof */}
                    <div className="border border-border p-1.5">
                      <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground block">
                        Evidencia
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span
                          className={cn(
                            "font-mono text-sm font-bold tabular-nums",
                            entry.proof_urls.length > 0
                              ? "text-green-500"
                              : "text-red-500"
                          )}
                        >
                          {entry.proof_urls.length > 0 ? "SI" : "NO"}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
                          vs {teamAvg.proofPercent}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Verdict */}
              <div className={cn("px-3 py-2.5", vc.bg)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <VerdictIcon className={cn("w-4 h-4", vc.color)} />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider">
                      Tu entrada es la{" "}
                      <span className={vc.color}>{vc.label}</span> de esta hora
                    </span>
                  </div>
                  <span className={cn("font-mono text-lg font-bold tabular-nums", vc.color)}>
                    {myReport.score}
                  </span>
                </div>
              </div>

              {/* Auto-dismiss indicator */}
              <div className="h-0.5 bg-accent/30 overflow-hidden">
                <div
                  className="h-full bg-primary/40 animate-shrink-bar"
                  style={{
                    animation: `shrink-bar ${AUTO_DISMISS_MS}ms linear forwards`,
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Dismiss hint */}
        {!canDismiss && (
          <p className="text-center font-mono text-[9px] text-muted-foreground mt-2">
            Espera {Math.ceil(MIN_DISPLAY_MS / 1000)}s para cerrar...
          </p>
        )}
        {canDismiss && (
          <p className="text-center font-mono text-[9px] text-muted-foreground mt-2">
            Clic en cualquier lugar para cerrar
          </p>
        )}
      </div>

      {/* Click-to-dismiss backdrop */}
      {canDismiss && (
        <div
          className="absolute inset-0 -z-10 cursor-pointer"
          onClick={handleDismiss}
        />
      )}

      {/* Inline keyframes */}
      <style jsx>{`
        @keyframes shrink-bar {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
}
