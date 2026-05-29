"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Flame, Brain, Loader2, Target, AlertTriangle, Sparkles,
  TrendingUp, TrendingDown, Minus, Shield, Skull, Trophy,
  MessageSquare, ArrowRight,
} from "lucide-react";

interface HotSeatData {
  name: string;
  overall_grade: string;
  overall_score: number;
  one_line_verdict: string;
  detailed_analysis: string;
  se_hizo_pendejo: boolean;
  biggest_strength: string;
  biggest_weakness: string;
  patterns: string[];
  red_flags: string[];
  inconsistencies: string[];
  survivability: string;
  roi_assessment: string;
  trajectory: string;
  peer_perception: string;
  coaching_plan: string[];
  what_to_stop: string[];
  what_to_start: string[];
  prediction_next_week: string;
  hard_truth: string;
}

const GRADE_STYLE: Record<string, { color: string; bg: string; emoji: string }> = {
  A: { color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/20", emoji: "🏆" },
  B: { color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/20", emoji: "👍" },
  C: { color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/20", emoji: "😐" },
  D: { color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20", emoji: "👎" },
  F: { color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20", emoji: "💀" },
};

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function HotSeatPage() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [data, setData] = useState<HotSeatData | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1).single<{ org_id: string }>();
      if (!m) return;
      setOrgId(m.org_id);
      const { data: memberData } = await supabase.from("org_members").select("user_id, profiles(*)").eq("org_id", m.org_id)
        .returns<{ user_id: string; profiles: Profile }[]>();
      setMembers(memberData?.map((md) => md.profiles) ?? []);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function runHotSeat(userId: string) {
    if (!orgId) return;
    setSelectedUser(userId);
    setLoading(true);
    setData(null);
    const res = await fetch(`/api/claude-hotseat?org_id=${orgId}&user_id=${userId}`, { method: "POST" });
    const json = await res.json();
    if (!json.error) setData(json);
    setLoading(false);
  }

  const gs = data ? (GRADE_STYLE[data.overall_grade] ?? GRADE_STYLE.C) : null;
  const TrajIcon = data?.trajectory === "improving" ? TrendingUp : data?.trajectory === "declining" ? TrendingDown : Minus;
  const trajColor = data?.trajectory === "improving" ? "text-green-600" : data?.trajectory === "declining" ? "text-red-600" : "text-muted-foreground";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Flame className="w-6 h-6 text-red-500" />
          The Hot Seat
        </h1>
        <p className="text-muted-foreground text-sm">
          Auditoría profunda de 30 días. Selecciona a quien quieras poner en el Hot Seat.
        </p>
      </div>

      {/* Member selector */}
      <div className="flex flex-wrap gap-3 mb-8">
        {members.map((m) => (
          <Button
            key={m.id}
            variant={selectedUser === m.id ? "default" : "outline"}
            onClick={() => runHotSeat(m.id)}
            disabled={loading}
            className="gap-2"
          >
            <Avatar className="w-6 h-6">
              <AvatarImage src={m.avatar_url ?? undefined} />
              <AvatarFallback className="text-[9px]">{getInitials(m.full_name)}</AvatarFallback>
            </Avatar>
            {m.full_name}
          </Button>
        ))}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative">
            <Flame className="w-12 h-12 text-red-500 animate-pulse" />
            <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-red-400/30 animate-ping" />
          </div>
          <p className="text-sm text-muted-foreground">Claude está analizando 30 días de datos...</p>
          <p className="text-xs text-muted-foreground/50">Esto toma 15-30 segundos</p>
        </div>
      )}

      {data && gs && !loading && (
        <div className="space-y-6">
          {/* Header */}
          <Card className={cn("border-2", gs.color.includes("green") ? "border-green-300" : gs.color.includes("red") ? "border-red-300" : "border-border")}>
            <CardContent className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className={cn("w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0", gs.bg)}>
                  <span className="text-3xl">{gs.emoji}</span>
                  <span className={cn("text-2xl font-black -mt-1", gs.color)}>{data.overall_grade}</span>
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold">{data.name}</h2>
                    <TrajIcon className={cn("w-5 h-5", trajColor)} />
                    {data.se_hizo_pendejo && (
                      <Badge variant="destructive" className="animate-pulse">SE HIZO PENDEJO</Badge>
                    )}
                  </div>
                  <p className={cn("text-lg font-medium mt-1", gs.color)}>{data.one_line_verdict}</p>
                </div>
              </div>

              {/* Score + key metrics */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 bg-accent/40 rounded-xl text-center">
                  <p className={cn("text-2xl font-bold", gs.color)}>{data.overall_score}</p>
                  <p className="text-[10px] text-muted-foreground">Score</p>
                </div>
                <div className="p-3 bg-accent/40 rounded-xl text-center">
                  <p className="text-2xl">{data.trajectory === "improving" ? "📈" : data.trajectory === "declining" ? "📉" : "➡️"}</p>
                  <p className="text-[10px] text-muted-foreground">Trayectoria</p>
                </div>
                <div className="p-3 bg-accent/40 rounded-xl text-center">
                  <p className="text-2xl">{data.survivability?.toLowerCase().startsWith("sí") ? "✅" : "❌"}</p>
                  <p className="text-[10px] text-muted-foreground">Sobrevive recorte</p>
                </div>
                <div className="p-3 bg-accent/40 rounded-xl text-center">
                  <p className="text-2xl">{data.se_hizo_pendejo ? "🤥" : "💪"}</p>
                  <p className="text-[10px] text-muted-foreground">Integridad</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed analysis */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-bold mb-3 flex items-center gap-2"><Brain className="w-4 h-4 text-primary" /> Análisis profundo</h3>
              <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{data.detailed_analysis}</div>
            </CardContent>
          </Card>

          {/* Hard truth */}
          {data.hard_truth && (
            <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10">
              <CardContent className="p-5">
                <h3 className="font-bold text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                  <Skull className="w-4 h-4" /> La verdad que nadie te dice
                </h3>
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">{data.hard_truth}</p>
              </CardContent>
            </Card>
          )}

          {/* Strength vs weakness */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-green-200 dark:border-green-800">
              <CardContent className="p-4">
                <h3 className="text-xs font-bold text-green-600 uppercase mb-2 flex items-center gap-1"><Trophy className="w-3 h-3" /> Mayor fortaleza</h3>
                <p className="text-sm">{data.biggest_strength}</p>
              </CardContent>
            </Card>
            <Card className="border-red-200 dark:border-red-800">
              <CardContent className="p-4">
                <h3 className="text-xs font-bold text-red-600 uppercase mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Mayor debilidad</h3>
                <p className="text-sm">{data.biggest_weakness}</p>
              </CardContent>
            </Card>
          </div>

          {/* ROI + Survivability */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-xs font-bold text-primary uppercase mb-2">ROI Assessment</h3>
                <p className="text-sm text-muted-foreground">{data.roi_assessment}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="text-xs font-bold text-primary uppercase mb-2">¿Sobrevive un recorte?</h3>
                <p className="text-sm text-muted-foreground">{data.survivability}</p>
              </CardContent>
            </Card>
          </div>

          {/* Red flags, patterns, inconsistencies */}
          {data.red_flags?.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-xs font-bold text-red-600 uppercase mb-2"><AlertTriangle className="w-3 h-3 inline mr-1" />Red Flags</h3>
                {data.red_flags.map((f, i) => <p key={i} className="text-sm text-red-700 dark:text-red-400 mb-0.5">- {f}</p>)}
              </CardContent>
            </Card>
          )}

          {data.inconsistencies?.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-xs font-bold text-orange-600 uppercase mb-2"><Shield className="w-3 h-3 inline mr-1" />Inconsistencias</h3>
                {data.inconsistencies.map((inc, i) => <p key={i} className="text-sm text-orange-700 dark:text-orange-400 mb-0.5">- {inc}</p>)}
              </CardContent>
            </Card>
          )}

          {/* Coaching plan */}
          <Card className="border-primary/20">
            <CardContent className="p-5">
              <h3 className="font-bold mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Plan de mejora (7 días)</h3>
              <div className="space-y-2">
                {data.coaching_plan?.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{i + 1}</div>
                    <p className="text-sm">{step}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Stop / Start */}
          <div className="grid grid-cols-2 gap-4">
            {data.what_to_stop?.length > 0 && (
              <Card className="border-red-200/50">
                <CardContent className="p-4">
                  <h3 className="text-xs font-bold text-red-600 uppercase mb-2">DEJAR de hacer</h3>
                  {data.what_to_stop.map((s, i) => <p key={i} className="text-sm text-red-700 dark:text-red-400 mb-0.5">✕ {s}</p>)}
                </CardContent>
              </Card>
            )}
            {data.what_to_start?.length > 0 && (
              <Card className="border-green-200/50">
                <CardContent className="p-4">
                  <h3 className="text-xs font-bold text-green-600 uppercase mb-2">EMPEZAR a hacer</h3>
                  {data.what_to_start.map((s, i) => <p key={i} className="text-sm text-green-700 dark:text-green-400 mb-0.5">✓ {s}</p>)}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Prediction */}
          {data.prediction_next_week && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-xs font-bold text-primary uppercase mb-2 flex items-center gap-1"><Target className="w-3 h-3" /> Predicción próxima semana</h3>
                <p className="text-sm">{data.prediction_next_week}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
