"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MOOD_LABELS } from "@/lib/constants";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { MessageSquare, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface Standup {
  id: string;
  user_id: string;
  yesterday: string;
  today_plan: string;
  blockers: string | null;
  mood: number | null;
  submitted_at: string;
  profiles: Profile;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function StandupPage() {
  const [standups, setStandups] = useState<Standup[]>([]);
  const [myStandup, setMyStandup] = useState<Standup | null>(null);
  const [yesterday, setYesterday] = useState("");
  const [todayPlan, setTodayPlan] = useState("");
  const [blockers, setBlockers] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string }>();

      if (!membership) { setLoading(false); return; }
      setOrgId(membership.org_id);

      const { data } = await supabase
        .from("standups")
        .select("*, profiles(*)")
        .eq("org_id", membership.org_id)
        .eq("date", today)
        .order("submitted_at", { ascending: true })
        .returns<Standup[]>();

      setStandups(data ?? []);
      const mine = data?.find((s) => s.user_id === user.id);
      if (mine) setMyStandup(mine);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !orgId) return;

    const { data } = await supabase.from("standups").upsert({
      user_id: user.id,
      org_id: orgId,
      date: today,
      yesterday,
      today_plan: todayPlan,
      blockers: blockers || null,
      mood: mood as 1 | 2 | 3 | 4 | 5 | null,
    }, { onConflict: "user_id,org_id,date" }).select("*, profiles(*)").single();

    if (data) {
      setMyStandup(data as unknown as Standup);
      setStandups((prev) => {
        const filtered = prev.filter((s) => s.user_id !== user.id);
        return [...filtered, data as unknown as Standup];
      });
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      </div>
    );
  }

  const displayDate = format(new Date(), "EEEE, d MMMM yyyy", { locale: es });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-primary" />
          Standup del día
        </h1>
        <p className="text-muted-foreground text-sm capitalize">{displayDate}</p>
      </div>

      {/* My standup form */}
      {!myStandup ? (
        <Card className="mb-8 border-violet-200 dark:border-violet-800">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Aún no has hecho tu standup
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>¿Qué hiciste ayer?</Label>
                <Textarea
                  placeholder="Resumen de lo que lograste ayer..."
                  value={yesterday}
                  onChange={(e) => setYesterday(e.target.value)}
                  required
                  minLength={10}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>¿Qué vas a hacer hoy?</Label>
                <Textarea
                  placeholder="Plan para hoy, sé específico..."
                  value={todayPlan}
                  onChange={(e) => setTodayPlan(e.target.value)}
                  required
                  minLength={10}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>¿Algún bloqueo o problema?</Label>
                <Textarea
                  placeholder="¿Algo que necesitas de alguien más? ¿Algo que te impide avanzar?"
                  value={blockers}
                  onChange={(e) => setBlockers(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>¿Cómo te sientes?</Label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setMood(mood === level ? null : level)}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                        mood === level ? "bg-violet-600 text-white" : "bg-muted hover:bg-muted/80"
                      )}
                    >
                      {MOOD_LABELS[level]}
                    </button>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Enviando..." : "Enviar standup"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-8 bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-800">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Standup enviado a las {format(new Date(myStandup.submitted_at), "h:mm a")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Team standups */}
      <h2 className="font-semibold text-lg mb-4">
        Equipo ({standups.length} de hoy)
      </h2>

      {standups.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">
          Nadie ha hecho su standup todavía.
        </p>
      ) : (
        <div className="space-y-4">
          {standups.map((s) => (
            <Card key={s.id} className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
                    <AvatarImage src={s.profiles?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(s.profiles?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{s.profiles?.full_name ?? "?"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(s.submitted_at), "h:mm a")}
                      {s.mood && ` · Ánimo: ${MOOD_LABELS[s.mood]}`}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase">Ayer</p>
                    <p>{s.yesterday}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase">Hoy</p>
                    <p>{s.today_plan}</p>
                  </div>
                  {s.blockers && (
                    <div>
                      <p className="text-xs font-medium text-red-600 uppercase flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Bloqueado
                      </p>
                      <p className="text-red-700 dark:text-red-400">{s.blockers}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
