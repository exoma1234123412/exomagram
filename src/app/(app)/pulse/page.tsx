"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { HeartPulse, Send, CheckCircle2, TrendingUp, TrendingDown, Minus } from "lucide-react";

const QUESTIONS = [
  { id: "happiness", text: "Que tan contento estoy con el equipo esta semana?" },
  { id: "workload", text: "Mi carga de trabajo es manejable?" },
  { id: "clarity", text: "Tengo claridad sobre mis prioridades?" },
];

interface PulseResponse {
  question_id: string;
  score: number;
}

interface PulseTrend {
  question_id: string;
  weeks: { week: string; avgScore: number; count: number }[];
}

export default function PulsePage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [hasResponded, setHasResponded] = useState(false);
  const [responses, setResponses] = useState<Map<string, number>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [trends, setTrends] = useState<PulseTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().split("T")[0];

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!membership) { setLoading(false); return; }
      setOrgId(membership.org_id);

      // Check if already responded this week
      const { data: existing } = await supabase
        .from("pulse_responses")
        .select("question_id, score")
        .eq("user_id", user.id)
        .eq("org_id", membership.org_id)
        .eq("week", currentWeek);

      if (existing && existing.length > 0) {
        setHasResponded(true);
        const map = new Map<string, number>();
        for (const r of existing) map.set(r.question_id, r.score);
        setResponses(map);
      }

      // Load trends (last 8 weeks)
      const { data: allResponses } = await supabase
        .from("pulse_responses")
        .select("question_id, score, week")
        .eq("org_id", membership.org_id)
        .order("week", { ascending: true });

      if (allResponses && allResponses.length > 0) {
        const trendMap = new Map<string, Map<string, { sum: number; count: number }>>();
        for (const r of allResponses) {
          const qMap = trendMap.get(r.question_id) ?? new Map();
          const wData = qMap.get(r.week) ?? { sum: 0, count: 0 };
          wData.sum += r.score;
          wData.count++;
          qMap.set(r.week, wData);
          trendMap.set(r.question_id, qMap);
        }

        const trendResults: PulseTrend[] = [];
        for (const [qid, weekMap] of trendMap) {
          const weeks = Array.from(weekMap.entries())
            .map(([week, data]) => ({
              week,
              avgScore: Math.round((data.sum / data.count) * 10) / 10,
              count: data.count,
            }))
            .sort((a, b) => a.week.localeCompare(b.week))
            .slice(-8);
          trendResults.push({ question_id: qid, weeks });
        }
        setTrends(trendResults);
      }

      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!orgId || responses.size < QUESTIONS.length) return;
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSubmitting(false); return; }

    const inserts = QUESTIONS.map((q) => ({
      user_id: user.id,
      org_id: orgId,
      week: currentWeek,
      question_id: q.id,
      score: responses.get(q.id) ?? 3,
    }));

    await supabase.from("pulse_responses").upsert(inserts, { onConflict: "user_id,org_id,week,question_id" });
    setHasResponded(true);
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <HeartPulse className="w-6 h-6 text-pink-500" />
        <h1 className="text-2xl font-bold tracking-tight">Pulse Check</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Encuesta anonima semanal del equipo
      </p>

      {/* Survey */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Semana del {format(new Date(currentWeek + "T12:00:00"), "d MMM", { locale: es })}
            {hasResponded && (
              <Badge variant="default" className="text-[10px] gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Respondido
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {QUESTIONS.map((q) => {
              const score = responses.get(q.id);
              return (
                <div key={q.id}>
                  <p className="text-sm mb-2">{q.text}</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        onClick={() => {
                          if (hasResponded) return;
                          const newMap = new Map(responses);
                          newMap.set(q.id, val);
                          setResponses(newMap);
                        }}
                        disabled={hasResponded}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                          score === val
                            ? val >= 4 ? "bg-green-600 text-white" : val >= 3 ? "bg-blue-600 text-white" : "bg-red-500 text-white"
                            : "bg-muted hover:bg-muted/80",
                          hasResponded && "cursor-default"
                        )}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Muy mal</span>
                    <span>Excelente</span>
                  </div>
                </div>
              );
            })}

            {!hasResponded && (
              <Button
                onClick={handleSubmit}
                disabled={submitting || responses.size < QUESTIONS.length}
                className="w-full gap-2"
              >
                <Send className="w-4 h-4" />
                {submitting ? "Enviando..." : "Enviar (anonimo)"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Trends */}
      {trends.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Tendencias del equipo</h2>
          {trends.map((t) => {
            const question = QUESTIONS.find((q) => q.id === t.question_id);
            if (!question) return null;
            const latest = t.weeks[t.weeks.length - 1];
            const prev = t.weeks.length >= 2 ? t.weeks[t.weeks.length - 2] : null;
            const delta = prev ? Math.round((latest.avgScore - prev.avgScore) * 10) / 10 : 0;

            return (
              <Card key={t.question_id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{question.text}</p>
                    <div className="flex items-center gap-1">
                      <span className={cn(
                        "text-lg font-bold",
                        latest.avgScore >= 4 ? "text-green-600" :
                        latest.avgScore >= 3 ? "text-blue-600" : "text-red-600"
                      )}>
                        {latest.avgScore}
                      </span>
                      {delta !== 0 ? (
                        delta > 0 ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />
                      ) : (
                        <Minus className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-end gap-1 h-12">
                    {t.weeks.map((w) => (
                      <div key={w.week} className="flex-1 flex flex-col items-center gap-0.5">
                        <div
                          className={cn(
                            "w-full rounded-t",
                            w.avgScore >= 4 ? "bg-green-400" :
                            w.avgScore >= 3 ? "bg-blue-400" :
                            w.avgScore >= 2 ? "bg-yellow-400" : "bg-red-400"
                          )}
                          style={{ height: `${(w.avgScore / 5) * 40}px` }}
                          title={`${w.week}: ${w.avgScore} (${w.count} respuestas)`}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {latest.count} respuesta{latest.count !== 1 ? "s" : ""} esta semana
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
