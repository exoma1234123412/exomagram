"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Sparkles,
  Target,
  Gauge,
  Shield,
  MessageSquare,
} from "lucide-react";

interface PersonAudit {
  name: string;
  grade: string;
  score: number;
  verdict: string;
  red_flags: string[];
  inconsistencies: string[];
  strengths: string[];
  coaching: string;
  trust_impact: number;
  efficiency_rating: string;
  bullshit_meter: number;
}

interface AuditData {
  date: string;
  model: string;
  team_verdict: string;
  team_score: number;
  people: PersonAudit[];
  team_patterns: string[];
  recommendation: string;
}

const GRADE_STYLE: Record<string, { color: string; bg: string; emoji: string }> = {
  A: { color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/20", emoji: "🏆" },
  B: { color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/20", emoji: "👍" },
  C: { color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/20", emoji: "😐" },
  D: { color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20", emoji: "👎" },
  F: { color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20", emoji: "💀" },
};

export default function ClaudeAuditPage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1).single<{ org_id: string }>();
      if (m) setOrgId(m.org_id);
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function runAudit() {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/claude-audit?org_id=${orgId}&date=${date}`, { method: "POST" });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setData(json);
      }
    } catch (e) {
      setError("Error conectando con Claude");
    }
    setLoading(false);
  }

  const isToday = date === new Date().toISOString().split("T")[0];
  const displayDate = format(new Date(date + "T12:00:00"), "EEEE, d MMMM yyyy", { locale: es });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" />
          Claude AI Audit
        </h1>
        <p className="text-muted-foreground text-sm capitalize">{displayDate}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          AI real (Claude) analiza el día completo del equipo. Detecta mentiras, inconsistencias, y bullshit.
        </p>
      </div>

      {/* Date nav + run button */}
      <div className="flex items-center gap-2 mb-8">
        <Button variant="outline" size="icon" onClick={() => setDate(subDays(new Date(date + "T12:00:00"), 1).toISOString().split("T")[0])}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
        <Button variant="outline" size="icon" onClick={() => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); setDate(d.toISOString().split("T")[0]); }}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        {!isToday && <Button variant="ghost" size="sm" onClick={() => setDate(new Date().toISOString().split("T")[0])}>Hoy</Button>}
        <Button onClick={runAudit} disabled={loading} className="ml-auto gap-2">
          <Brain className="w-4 h-4" />
          {loading ? "Analizando..." : "Auditar con Claude"}
        </Button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative">
            <Brain className="w-12 h-12 text-primary animate-pulse" />
            <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-primary/30 animate-ping" />
          </div>
          <p className="text-sm text-muted-foreground">Claude está leyendo cada entrada, cruzando datos, y analizando patrones...</p>
          <p className="text-xs text-muted-foreground/50">Esto toma 10-20 segundos</p>
        </div>
      )}

      {error && (
        <Card className="border-red-300 dark:border-red-800">
          <CardContent className="p-4 text-red-600">{error}</CardContent>
        </Card>
      )}

      {data && !loading && (
        <div className="space-y-6">
          {/* Team verdict */}
          <Card className="border-2">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0",
                  data.team_score >= 70 ? "bg-green-100 dark:bg-green-900/30 text-green-700" :
                  data.team_score >= 50 ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700" :
                  "bg-red-100 dark:bg-red-900/30 text-red-700"
                )}>
                  {data.team_score}
                </div>
                <div>
                  <h3 className="text-lg font-bold">Veredicto del equipo</h3>
                  <p className="text-sm text-muted-foreground mt-1">{data.team_verdict}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="outline" className="text-[10px]">
                      <Brain className="w-3 h-3 mr-1" /> {data.model}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Team patterns */}
              {data.team_patterns?.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Patrones del equipo</p>
                  {data.team_patterns.map((p, i) => (
                    <p key={i} className="text-sm text-muted-foreground mb-1">- {p}</p>
                  ))}
                </div>
              )}

              {data.recommendation && (
                <div className="mt-3 p-3 bg-primary/5 rounded-xl">
                  <p className="text-xs font-semibold text-primary uppercase mb-1 flex items-center gap-1">
                    <Target className="w-3 h-3" /> Recomendación
                  </p>
                  <p className="text-sm font-medium">{data.recommendation}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per person */}
          {data.people?.map((person, i) => {
            const gs = GRADE_STYLE[person.grade] ?? GRADE_STYLE.C;
            return (
              <Card key={i} className="border transition-all">
                <CardContent className="p-5">
                  {/* Header */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={cn("w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0", gs.bg)}>
                      <span className="text-xl">{gs.emoji}</span>
                      <span className={cn("text-lg font-black -mt-1", gs.color)}>{person.grade}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-bold">{person.name}</h3>
                        <Badge className={cn("text-xs", gs.bg, gs.color)}>
                          {person.trust_impact > 0 ? "+" : ""}{person.trust_impact} trust
                        </Badge>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Gauge className="w-3 h-3" /> Eficiencia: {person.efficiency_rating}
                        </Badge>
                        {person.bullshit_meter > 30 && (
                          <Badge variant="destructive" className="text-[10px]">
                            BS: {person.bullshit_meter}%
                          </Badge>
                        )}
                      </div>
                      <p className={cn("text-sm mt-1 font-medium", gs.color)}>{person.verdict}</p>
                    </div>
                  </div>

                  {/* Inconsistencies — the killer feature */}
                  {person.inconsistencies?.length > 0 && (
                    <div className="mb-3 p-3 bg-red-50 dark:bg-red-950/15 rounded-xl border border-red-200/50 dark:border-red-800/30">
                      <p className="text-[10px] font-semibold text-red-600 uppercase mb-1.5 flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Inconsistencias detectadas
                      </p>
                      {person.inconsistencies.map((inc, j) => (
                        <p key={j} className="text-xs text-red-700 dark:text-red-400 mb-0.5">- {inc}</p>
                      ))}
                    </div>
                  )}

                  {/* Red flags */}
                  {person.red_flags?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-red-600 uppercase mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Red Flags
                      </p>
                      {person.red_flags.map((f, j) => (
                        <p key={j} className="text-xs text-red-700 dark:text-red-400 mb-0.5">- {f}</p>
                      ))}
                    </div>
                  )}

                  {/* Strengths */}
                  {person.strengths?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-green-600 uppercase mb-1 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Fortalezas
                      </p>
                      {person.strengths.map((s, j) => (
                        <p key={j} className="text-xs text-green-700 dark:text-green-400 mb-0.5">+ {s}</p>
                      ))}
                    </div>
                  )}

                  {/* AI Coaching */}
                  {person.coaching && (
                    <div className="p-3 bg-primary/5 rounded-xl">
                      <p className="text-[10px] font-semibold text-primary uppercase mb-1 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> Coaching de Claude
                      </p>
                      <p className="text-sm">{person.coaching}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
