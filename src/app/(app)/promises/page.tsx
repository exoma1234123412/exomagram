"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Target,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Trash2,
} from "lucide-react";

// PSYCHOLOGY: Public commitment + consistency principle
// Once you promise something publicly, you're 3x more likely to follow through
// At end of day, your promises show GREEN (delivered) or RED (broken)
// Your team sees everything

interface Promise {
  id: string;
  user_id: string;
  title: string;
  status: "pending" | "delivered" | "broken";
  created_at: string;
  profiles?: Profile;
}

export default function PromisesPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [promises, setPromises] = useState<Promise[]>([]);
  const [myPromises, setMyPromises] = useState<Promise[]>([]);
  const [newPromise, setNewPromise] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId || !userId) { setLoading(false); return; }

    async function load() {
      // Get all promises for today from the org
      const { data } = await supabase
        .from("daily_promises")
        .select("*, profiles(full_name, avatar_url, role)")
        .eq("org_id", orgId!)
        .eq("date", today)
        .order("created_at")
        ;

      const all = data ?? [];
      setPromises(all);
      setMyPromises(all.filter((p) => p.user_id === userId));
      setLoading(false);
    }
    load();
  }, [orgLoading, orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addPromise(e: React.FormEvent) {
    e.preventDefault();
    if (!newPromise.trim() || !userId || !orgId) return;
    setSubmitting(true);

    const { data } = await supabase.from("daily_promises").insert({
      user_id: userId,
      org_id: orgId,
      date: today,
      title: newPromise.trim(),
      status: "pending",
    }).select("*, profiles(full_name, avatar_url, role)").single();

    if (data) {
      const typed = data as unknown as Promise;
      setPromises((prev) => [...prev, typed]);
      setMyPromises((prev) => [...prev, typed]);
    }
    setNewPromise("");
    setSubmitting(false);
  }

  async function markPromise(id: string, status: "delivered" | "broken") {
    await supabase.from("daily_promises").update({ status }).eq("id", id);
    setPromises((prev) => prev.map((p) => p.id === id ? { ...p, status } : p));
    setMyPromises((prev) => prev.map((p) => p.id === id ? { ...p, status } : p));
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group promises by user
  const byUser = new Map<string, Promise[]>();
  for (const p of promises) {
    const list = byUser.get(p.user_id) ?? [];
    list.push(p);
    byUser.set(p.user_id, list);
  }

  const displayDate = format(new Date(), "EEEE, d MMMM yyyy", { locale: es });

  // Stats
  const totalPromises = promises.length;
  const delivered = promises.filter((p) => p.status === "delivered").length;
  const broken = promises.filter((p) => p.status === "broken").length;
  const pending = promises.filter((p) => p.status === "pending").length;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Target className="w-6 h-6 text-primary" />
          Promesas del día
        </h1>
        <p className="text-muted-foreground text-sm capitalize">{displayDate}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Compromete públicamente lo que vas a entregar hoy. Tu equipo ve si cumples.
        </p>
      </div>

      {/* Team stats */}
      {totalPromises > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-green-50 dark:bg-green-950/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{delivered}</p>
            <p className="text-[10px] text-muted-foreground">Entregadas</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-950/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">{pending}</p>
            <p className="text-[10px] text-muted-foreground">Pendientes</p>
          </div>
          <div className="bg-red-50 dark:bg-red-950/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{broken}</p>
            <p className="text-[10px] text-muted-foreground">Rotas</p>
          </div>
        </div>
      )}

      {/* My promises */}
      <Card className="mb-8 border-primary/20">
        <CardContent className="p-5">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Mis promesas de hoy
          </h3>

          {myPromises.length > 0 && (
            <div className="space-y-2 mb-4">
              {myPromises.map((p) => (
                <div key={p.id} className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-all",
                  p.status === "delivered" && "bg-green-50 dark:bg-green-950/20",
                  p.status === "broken" && "bg-red-50 dark:bg-red-950/20 line-through opacity-60",
                  p.status === "pending" && "bg-accent/40",
                )}>
                  {p.status === "delivered" && <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />}
                  {p.status === "broken" && <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
                  {p.status === "pending" && <Clock className="w-5 h-5 text-yellow-500 shrink-0" />}
                  <span className="flex-1 text-sm font-medium">{p.title}</span>
                  {p.status === "pending" && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600" onClick={() => markPromise(p.id, "delivered")}>
                        Cumplida
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => markPromise(p.id, "broken")}>
                        No pude
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={addPromise} className="flex gap-2">
            <Input
              placeholder="Hoy voy a entregar..."
              value={newPromise}
              onChange={(e) => setNewPromise(e.target.value)}
              required
              minLength={5}
              className="flex-1"
            />
            <Button type="submit" disabled={submitting} className="gap-1.5">
              <Plus className="w-4 h-4" /> Prometer
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground/60 mt-2">
            Tu equipo ve estas promesas. Al final del día, marca si cumpliste o no.
          </p>
        </CardContent>
      </Card>

      {/* Team promises */}
      <h2 className="font-semibold text-lg mb-4">Promesas del equipo</h2>

      {promises.length === 0 ? (
        <div className="text-center py-16">
          <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
          <p className="text-muted-foreground">Nadie ha hecho promesas hoy.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Sé el primero en comprometerte.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(byUser.entries()).map(([uid, userPromises]) => {
            if (uid === userId) return null; // Skip self, already shown above
            const profile = userPromises[0]?.profiles;
            const deliveredCount = userPromises.filter((p) => p.status === "delivered").length;
            const brokenCount = userPromises.filter((p) => p.status === "broken").length;
            const total = userPromises.length;

            return (
              <Card key={uid} className={cn(
                "transition-all",
                brokenCount > 0 && "border-red-200 dark:border-red-900",
                deliveredCount === total && total > 0 && "border-green-200 dark:border-green-900",
              )}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">{getInitials(profile?.full_name ?? null)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{profile?.full_name ?? "?"}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {deliveredCount}/{total} cumplidas
                        {brokenCount > 0 && <span className="text-red-500 ml-1">· {brokenCount} rotas</span>}
                      </p>
                    </div>
                    {deliveredCount === total && total > 0 && (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">
                        100%
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {userPromises.map((p) => (
                      <div key={p.id} className={cn(
                        "flex items-center gap-2 text-sm pl-1",
                        p.status === "broken" && "line-through opacity-50",
                      )}>
                        {p.status === "delivered" && <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />}
                        {p.status === "broken" && <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                        {p.status === "pending" && <Clock className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                        <span>{p.title}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
