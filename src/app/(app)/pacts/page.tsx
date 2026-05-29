// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, getInitials } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { Handshake, Plus, CheckCircle2, XCircle, Clock, Flame } from "lucide-react";

interface Pact {
  id: string;
  creator_id: string;
  partner_id: string;
  org_id: string;
  title: string;
  target_type: string;
  target_value: number;
  duration_days: number;
  start_date: string;
  end_date: string;
  status: string;
  creator_progress: number;
  partner_progress: number;
  created_at: string;
}

type PactWithProfiles = Pact & {
  creator: Profile;
  partner: Profile;
};

export default function PactsPage() {
  const [pacts, setPacts] = useState<PactWithProfiles[]>([]);
  const [members, setMembers] = useState<{ user_id: string; full_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Create form
  const [partnerId, setPartnerId] = useState("");
  const [title, setTitle] = useState("");
  const [targetType, setTargetType] = useState("hours_with_proof");
  const [targetValue, setTargetValue] = useState("40");
  const [durationDays, setDurationDays] = useState("5");
  const [creating, setCreating] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!membership) { setLoading(false); return; }
      setOrgId(membership.org_id);

      const [{ data: memberData }, { data: pactData }] = await Promise.all([
        supabase
          .from("org_members")
          .select("user_id, profiles(full_name)")
          .eq("org_id", membership.org_id)
          ,
        supabase
          .from("accountability_pacts")
          .select("*, creator:profiles!accountability_pacts_creator_id_fkey(*), partner:profiles!accountability_pacts_partner_id_fkey(*)")
          .eq("org_id", membership.org_id)
          .order("created_at", { ascending: false })
          ,
      ]);

      setMembers(
        memberData?.filter((m) => m.user_id !== user.id).map((m) => ({
          user_id: m.user_id,
          full_name: m.profiles?.full_name,
        })) ?? []
      );
      setPacts(pactData ?? []);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!orgId || !userId || !partnerId || !title.trim()) return;
    setCreating(true);

    const startDate = new Date().toISOString().split("T")[0];
    const endDate = new Date(Date.now() + parseInt(durationDays) * 86400000).toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("accountability_pacts")
      .insert({
        creator_id: userId,
        partner_id: partnerId,
        org_id: orgId,
        title: title.trim(),
        target_type: targetType,
        target_value: parseInt(targetValue),
        duration_days: parseInt(durationDays),
        start_date: startDate,
        end_date: endDate,
        status: "active",
        creator_progress: 0,
        partner_progress: 0,
      })
      .select("*, creator:profiles!accountability_pacts_creator_id_fkey(*), partner:profiles!accountability_pacts_partner_id_fkey(*)")
      .single();

    if (data) {
      setPacts((prev) => [data, ...prev]);
      setCreateOpen(false);
      setTitle("");
      setPartnerId("");
    }
    setCreating(false);
  }

  const targetLabels: Record<string, string> = {
    hours_with_proof: "Horas con evidencia",
    total_hours: "Horas totales",
    proof_percent: "% de evidencia",
    closeout_days: "Dias con cierre",
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Handshake className="w-6 h-6 text-primary" />
            Pactos de Accountability
          </h1>
          <p className="text-muted-foreground text-sm">
            Compromisos publicos entre companeros
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 font-semibold">
          <Plus className="w-4 h-4" />
          Nuevo pacto
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" /><p className="text-sm text-muted-foreground animate-pulse">Cargando...</p></div>
      ) : pacts.length === 0 ? (
        <div className="text-center py-20">
          <Handshake className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No hay pactos todavia.</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Crea un pacto con un companero para comprometerse mutuamente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pacts.map((pact) => {
            const daysLeft = Math.max(0, differenceInDays(new Date(pact.end_date), new Date()));
            const totalDays = pact.duration_days;
            const daysPassed = totalDays - daysLeft;
            const progressPct = Math.round((daysPassed / totalDays) * 100);
            const isActive = pact.status === "active" && daysLeft > 0;

            return (
              <Card key={pact.id} className={cn("transition-all duration-300 hover:shadow-lg hover:shadow-primary/5", !isActive && "opacity-60")}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex -space-x-2">
                      <Avatar className="w-9 h-9 ring-2 ring-background shadow-sm">
                        <AvatarImage src={pact.creator?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px]">{getInitials(pact.creator?.full_name)}</AvatarFallback>
                      </Avatar>
                      <Avatar className="w-9 h-9 ring-2 ring-background shadow-sm">
                        <AvatarImage src={pact.partner?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px]">{getInitials(pact.partner?.full_name)}</AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm">{pact.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {pact.creator?.full_name} & {pact.partner?.full_name}
                      </p>
                    </div>
                    <Badge variant={isActive ? "outline" : pact.status === "completed" ? "default" : "destructive"} className="text-[10px]">
                      {isActive ? (
                        <><Clock className="w-3 h-3 mr-1" />{daysLeft}d restantes</>
                      ) : pact.status === "completed" ? (
                        <><CheckCircle2 className="w-3 h-3 mr-1" />Completado</>
                      ) : (
                        <><XCircle className="w-3 h-3 mr-1" />Fallido</>
                      )}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground mb-2">
                    Meta: {pact.target_value} {targetLabels[pact.target_type] ?? pact.target_type} en {pact.duration_days} dias
                  </p>

                  {/* Progress bars */}
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>{pact.creator?.full_name?.split(" ")[0]}</span>
                        <span>{pact.creator_progress}/{pact.target_value}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min((pact.creator_progress / pact.target_value) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>{pact.partner?.full_name?.split(" ")[0]}</span>
                        <span>{pact.partner_progress}/{pact.target_value}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min((pact.partner_progress / pact.target_value) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Time progress */}
                  <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-muted-foreground/20 rounded-full" style={{ width: `${progressPct}%` }} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="w-5 h-5 text-primary" />
              Nuevo Pacto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Companero</Label>
              <Select value={partnerId} onValueChange={(v) => v && setPartnerId(v)}>
                <SelectTrigger><SelectValue placeholder="Selecciona un companero" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name ?? "Sin nombre"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Titulo del pacto</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ej: Semana de 100% evidencia" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo de meta</Label>
                <Select value={targetType} onValueChange={(v) => v && setTargetType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hours_with_proof">Horas con evidencia</SelectItem>
                    <SelectItem value="total_hours">Horas totales</SelectItem>
                    <SelectItem value="proof_percent">% evidencia</SelectItem>
                    <SelectItem value="closeout_days">Dias con cierre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor meta</Label>
                <Input type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Duracion (dias)</Label>
              <div className="flex gap-2">
                {[3, 5, 7, 14].map((d) => (
                  <Button
                    key={d}
                    variant={durationDays === d.toString() ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDurationDays(d.toString())}
                  >
                    {d}d
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={handleCreate} disabled={creating || !partnerId || !title.trim()} className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 font-semibold">
              {creating ? "Creando..." : "Crear pacto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
