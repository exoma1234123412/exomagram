// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { BookOpen, ChevronLeft, ChevronRight, Star, AlertTriangle } from "lucide-react";

interface NarrativeData {
  narrative: string;
  highlights: string[];
  concerns: string[];
  stats: { total_hours: number; members: number; proof_percent: number; late_percent: number };
}

export default function NarrativePage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<NarrativeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (membership) setOrgId(membership.org_id);
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId) return;
    async function loadNarrative() {
      setLoading(true);
      const res = await fetch(`/api/ai-narrative?org_id=${orgId}&date=${date}`);
      const json = await res.json();
      setData(json);
      setLoading(false);
    }
    loadNarrative();
  }, [orgId, date]);

  const isToday = date === new Date().toISOString().split("T")[0];
  const displayDate = format(new Date(date + "T12:00:00"), "EEEE, d MMMM yyyy", { locale: es });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" />
          Narrativa del día
        </h1>
        <p className="text-muted-foreground text-sm capitalize">{displayDate}</p>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="outline" size="icon"
          onClick={() => setDate(subDays(new Date(date + "T12:00:00"), 1).toISOString().split("T")[0])}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
        <Button variant="outline" size="icon"
          onClick={() => {
            const next = new Date(date + "T12:00:00");
            next.setDate(next.getDate() + 1);
            setDate(next.toISOString().split("T")[0]);
          }}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        {!isToday && (
          <Button variant="ghost" size="sm" onClick={() => setDate(new Date().toISOString().split("T")[0])}>
            Hoy
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Generando narrativa...</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Stats bar */}
          {data.stats && (
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-accent/40 rounded-xl p-3 text-center">
                <p className="text-xl font-bold">{data.stats.total_hours}</p>
                <p className="text-[10px] text-muted-foreground">Horas</p>
              </div>
              <div className="bg-accent/40 rounded-xl p-3 text-center">
                <p className="text-xl font-bold">{data.stats.members}</p>
                <p className="text-[10px] text-muted-foreground">Miembros</p>
              </div>
              <div className="bg-accent/40 rounded-xl p-3 text-center">
                <p className={cn("text-xl font-bold", data.stats.proof_percent >= 70 ? "text-green-600" : "text-yellow-600")}>
                  {data.stats.proof_percent}%
                </p>
                <p className="text-[10px] text-muted-foreground">Evidencia</p>
              </div>
              <div className="bg-accent/40 rounded-xl p-3 text-center">
                <p className={cn("text-xl font-bold", data.stats.late_percent <= 20 ? "text-green-600" : "text-orange-600")}>
                  {data.stats.late_percent}%
                </p>
                <p className="text-[10px] text-muted-foreground">Tardías</p>
              </div>
            </div>
          )}

          {/* Narrative */}
          <Card>
            <CardContent className="p-6 prose prose-sm dark:prose-invert max-w-none">
              {data.narrative.split("\n").map((line, i) => {
                if (line.startsWith("## ")) {
                  return <h2 key={i} className="text-lg font-bold mt-4 mb-2">{line.replace("## ", "")}</h2>;
                }
                if (line.startsWith("- ")) {
                  return <li key={i} className="ml-4">{line.replace("- ", "")}</li>;
                }
                if (line.startsWith("  - ")) {
                  return <li key={i} className="ml-8 text-muted-foreground italic">{line.replace("  - ", "")}</li>;
                }
                if (line.trim() === "") return <br key={i} />;
                return (
                  <p key={i} className="mb-1" dangerouslySetInnerHTML={{
                    __html: line
                      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                      .replace(/✅/g, '<span class="text-green-600">✅</span>')
                      .replace(/⚠️/g, '<span class="text-yellow-600">⚠️</span>')
                  }} />
                );
              })}
            </CardContent>
          </Card>

          {/* Quick highlights/concerns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.highlights.length > 0 && (
              <Card className="border-green-200 dark:border-green-800 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-green-500" /> Destacados
                  </h3>
                  <ul className="space-y-1">
                    {data.highlights.map((h, i) => (
                      <li key={i} className="text-sm text-green-700 dark:text-green-400">{h}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            {data.concerns.length > 0 && (
              <Card className="border-orange-200 dark:border-orange-800 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" /> Atención
                  </h3>
                  <ul className="space-y-1">
                    {data.concerns.map((c, i) => (
                      <li key={i} className="text-sm text-orange-700 dark:text-orange-400">{c}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
