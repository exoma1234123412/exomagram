"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  CheckCircle2,
  XCircle,
  Shield,
  Clock,
  Flame,
  Target,
  Sparkles,
  Skull,
} from "lucide-react";

interface PersonAudit {
  user_id: string;
  name: string;
  grade: "A" | "B" | "C" | "D" | "F";
  score_impact: number;
  verdict: string;
  details: string[];
  red_flags: string[];
  strengths: string[];
  hours: number;
  proof_percent: number;
  deep_work_hours: number;
  meeting_hours: number;
  late_percent: number;
  has_standup: boolean;
  has_closeout: boolean;
  promises_delivered: number;
  promises_broken: number;
}

interface AuditData {
  date: string;
  team_verdict: string;
  team_avg_score: number;
  a_count: number;
  f_count: number;
  audits: PersonAudit[];
}

const GRADE_CONFIG: Record<string, { color: string; bg: string; emoji: string; border: string }> = {
  A: { color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/20", emoji: "🏆", border: "border-green-300 dark:border-green-800" },
  B: { color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/20", emoji: "👍", border: "border-blue-300 dark:border-blue-800" },
  C: { color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/20", emoji: "😐", border: "border-yellow-300 dark:border-yellow-800" },
  D: { color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20", emoji: "👎", border: "border-orange-300 dark:border-orange-800" },
  F: { color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20", emoji: "💀", border: "border-red-300 dark:border-red-800" },
};

export default function DailyAuditPage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase
        .from("org_members").select("org_id").eq("user_id", user.id).limit(1).single();
      if (membership) setOrgId(membership.org_id);
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function runAudit() {
    if (!orgId) return;
    setLoading(true);
    const res = await fetch(`/api/ai-audit?org_id=${orgId}&date=${date}`, { method: "POST" });
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  useEffect(() => {
    if (orgId) runAudit();
  }, [orgId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const isToday = date === new Date().toISOString().split("T")[0];
  const displayDate = format(new Date(date + "T12:00:00"), "EEEE, d MMMM yyyy", { locale: es });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" />
          Auditoría diaria
        </h1>
        <p className="text-muted-foreground text-sm capitalize">{displayDate}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          AI evalúa el desempeño de cada persona sin filtros. Grado A-F. Impacta el trust score.
        </p>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-2 mb-8">
        <Button variant="outline" size="icon"
          onClick={() => setDate(subDays(new Date(date + "T12:00:00"), 1).toISOString().split("T")[0])}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
        <Button variant="outline" size="icon"
          onClick={() => {
            const d = new Date(date + "T12:00:00");
            d.setDate(d.getDate() + 1);
            setDate(d.toISOString().split("T")[0]);
          }}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        {!isToday && (
          <Button variant="ghost" size="sm" onClick={() => setDate(new Date().toISOString().split("T")[0])}>Hoy</Button>
        )}
        <Button variant="outline" size="sm" onClick={runAudit} disabled={loading} className="ml-auto">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Re-auditar"}
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Brain className="w-10 h-10 text-primary animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">AI analizando el día del equipo...</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Team verdict */}
          <Card className={cn(
            "border-2",
            data.team_avg_score >= 70 ? "border-green-300 dark:border-green-800" :
            data.team_avg_score >= 50 ? "border-yellow-300 dark:border-yellow-800" :
            "border-red-300 dark:border-red-800"
          )}>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0",
                  data.team_avg_score >= 70 ? "bg-green-100 dark:bg-green-900/30 text-green-700" :
                  data.team_avg_score >= 50 ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700" :
                  "bg-red-100 dark:bg-red-900/30 text-red-700"
                )}>
                  {data.team_avg_score}
                </div>
                <div>
                  <h3 className="text-lg font-bold">Veredicto del equipo</h3>
                  <p className="text-muted-foreground mt-1">{data.team_verdict}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300">
                      🏆 {data.a_count} A&apos;s
                    </Badge>
                    {data.f_count > 0 && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        💀 {data.f_count} F&apos;s
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Individual audits */}
          {data.audits.map((audit) => {
            const gc = GRADE_CONFIG[audit.grade];
            return (
              <Card key={audit.user_id} className={cn("border transition-all", gc.border)}>
                <CardContent className="p-5">
                  {/* Header with grade */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 font-bold",
                      gc.bg,
                    )}>
                      <span className="text-xl">{gc.emoji}</span>
                      <span className={cn("text-lg font-black -mt-1", gc.color)}>{audit.grade}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold">{audit.name}</h3>
                        <Badge className={cn("text-xs", gc.bg, gc.color)}>
                          {audit.score_impact > 0 ? "+" : ""}{audit.score_impact} trust
                        </Badge>
                      </div>
                      <p className={cn("text-sm mt-1 font-medium", gc.color)}>{audit.verdict}</p>
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                    <div className="text-center p-2 bg-accent/40 rounded-lg">
                      <Clock className="w-3.5 h-3.5 mx-auto text-muted-foreground mb-0.5" />
                      <p className={cn("text-sm font-bold", audit.hours >= 8 ? "text-green-600" : audit.hours >= 5 ? "text-yellow-600" : "text-red-600")}>
                        {audit.hours}h
                      </p>
                    </div>
                    <div className="text-center p-2 bg-accent/40 rounded-lg">
                      <Shield className="w-3.5 h-3.5 mx-auto text-muted-foreground mb-0.5" />
                      <p className={cn("text-sm font-bold", audit.proof_percent >= 70 ? "text-green-600" : "text-yellow-600")}>
                        {audit.proof_percent}%
                      </p>
                    </div>
                    <div className="text-center p-2 bg-accent/40 rounded-lg">
                      <Flame className="w-3.5 h-3.5 mx-auto text-muted-foreground mb-0.5" />
                      <p className="text-sm font-bold">{audit.deep_work_hours}h</p>
                    </div>
                    <div className="text-center p-2 bg-accent/40 rounded-lg">
                      <p className="text-sm font-bold">{audit.meeting_hours}h</p>
                      <p className="text-[9px] text-muted-foreground">reuniones</p>
                    </div>
                    <div className="text-center p-2 bg-accent/40 rounded-lg">
                      {audit.has_standup ? <CheckCircle2 className="w-3.5 h-3.5 mx-auto text-green-600 mb-0.5" /> : <XCircle className="w-3.5 h-3.5 mx-auto text-red-500 mb-0.5" />}
                      <p className="text-[9px] text-muted-foreground">standup</p>
                    </div>
                    <div className="text-center p-2 bg-accent/40 rounded-lg">
                      {audit.has_closeout ? <CheckCircle2 className="w-3.5 h-3.5 mx-auto text-green-600 mb-0.5" /> : <XCircle className="w-3.5 h-3.5 mx-auto text-red-500 mb-0.5" />}
                      <p className="text-[9px] text-muted-foreground">cierre</p>
                    </div>
                  </div>

                  {/* Red flags */}
                  {audit.red_flags.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-red-600 uppercase flex items-center gap-1 mb-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Red Flags
                      </p>
                      <ul className="space-y-1">
                        {audit.red_flags.map((f, i) => (
                          <li key={i} className="text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                            <span className="text-red-400 mt-0.5">-</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Details */}
                  {audit.details.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-yellow-600 uppercase flex items-center gap-1 mb-1.5">
                        <Target className="w-3.5 h-3.5" /> Observaciones
                      </p>
                      <ul className="space-y-1">
                        {audit.details.map((d, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-yellow-400 mt-0.5">-</span> {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Strengths */}
                  {audit.strengths.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-green-600 uppercase flex items-center gap-1 mb-1.5">
                        <Sparkles className="w-3.5 h-3.5" /> Fortalezas
                      </p>
                      <ul className="space-y-1">
                        {audit.strengths.map((s, i) => (
                          <li key={i} className="text-sm text-green-700 dark:text-green-400 flex items-start gap-2">
                            <span className="text-green-400 mt-0.5">+</span> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Promises */}
                  {(audit.promises_delivered > 0 || audit.promises_broken > 0) && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t">
                      {audit.promises_delivered > 0 && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {audit.promises_delivered} promesa(s) cumplida(s)
                        </span>
                      )}
                      {audit.promises_broken > 0 && (
                        <span className="text-xs text-red-600 flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> {audit.promises_broken} promesa(s) rota(s)
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
