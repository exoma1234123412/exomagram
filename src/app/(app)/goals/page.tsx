"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Target, Plus, CheckCircle2, X, Loader2 } from "lucide-react";

interface Goal {
  id: string;
  title: string;
  description: string | null;
  target_hours: number | null;
  target_category: string | null;
  period: "weekly" | "monthly";
  start_date: string;
  end_date: string;
  status: string;
  progress: number;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const supabase = createClient();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetHours, setTargetHours] = useState("");
  const [targetCategory, setTargetCategory] = useState("");
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
  const [submitting, setSubmitting] = useState(false);

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
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setGoals((data ?? []) as Goal[]);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date();
    const startDate = now.toISOString().split("T")[0];
    const endDate = new Date(
      period === "weekly" ? now.getTime() + 7 * 86400000 : now.getTime() + 30 * 86400000
    ).toISOString().split("T")[0];

    const { data } = await supabase.from("goals").insert({
      user_id: user.id,
      org_id: orgId,
      title,
      description: description || null,
      target_hours: targetHours ? parseInt(targetHours) : null,
      target_category: targetCategory || null,
      period,
      start_date: startDate,
      end_date: endDate,
    }).select().single();

    if (data) setGoals((prev) => [data as Goal, ...prev]);

    setTitle("");
    setDescription("");
    setTargetHours("");
    setTargetCategory("");
    setDialogOpen(false);
    setSubmitting(false);
  }

  async function updateGoalStatus(goalId: string, status: string) {
    await supabase.from("goals").update({
      status,
      progress: status === "completed" ? 100 : undefined,
    }).eq("id", goalId);

    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId ? { ...g, status, progress: status === "completed" ? 100 : g.progress } : g
      )
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      </div>
    );
  }

  const activeGoals = goals.filter((g) => g.status === "active");
  const completedGoals = goals.filter((g) => g.status === "completed");
  const failedGoals = goals.filter((g) => g.status === "failed");

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            Mis Objetivos
          </h1>
          <p className="text-muted-foreground text-sm">Visible para todo tu equipo</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nuevo objetivo
        </Button>
      </div>

      {/* Active goals */}
      {activeGoals.length === 0 && completedGoals.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>No tienes objetivos. Crea uno para que tu equipo vea en qué te enfocas.</p>
        </div>
      )}

      {activeGoals.length > 0 && (
        <div className="space-y-3 mb-8">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase">Activos</h2>
          {activeGoals.map((g) => (
            <Card key={g.id} className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-semibold">{g.title}</h3>
                    {g.description && <p className="text-sm text-muted-foreground mt-1">{g.description}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {g.period === "weekly" ? "Semanal" : "Mensual"}
                      </Badge>
                      {g.target_hours && (
                        <Badge variant="secondary" className="text-xs">{g.target_hours}h objetivo</Badge>
                      )}
                      {g.target_category && (
                        <Badge variant="secondary" className="text-xs">
                          {CATEGORIES[g.target_category as WorkCategory]?.emoji}{" "}
                          {CATEGORIES[g.target_category as WorkCategory]?.label}
                        </Badge>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Progreso</span>
                        <span>{g.progress}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${g.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => updateGoalStatus(g.id, "completed")}>
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => updateGoalStatus(g.id, "failed")}>
                      <X className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {completedGoals.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase">Completados</h2>
          {completedGoals.map((g) => (
            <Card key={g.id} className="opacity-60">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="font-medium line-through">{g.title}</p>
                  <p className="text-xs text-muted-foreground">{g.period === "weekly" ? "Semanal" : "Mensual"}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo objetivo</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                placeholder="Ej: Completar el módulo de pagos"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Textarea
                placeholder="Más detalle..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Período</Label>
                <Select value={period} onValueChange={(v) => v && setPeriod(v as "weekly" | "monthly")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Horas objetivo (opcional)</Label>
                <Input
                  type="number"
                  placeholder="20"
                  value={targetHours}
                  onChange={(e) => setTargetHours(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creando..." : "Crear objetivo"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
