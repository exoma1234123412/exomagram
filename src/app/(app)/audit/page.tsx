"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { History, ChevronLeft, ChevronRight } from "lucide-react";

const ACTION_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  entry_created: { label: "Entrada creada", emoji: "📝", color: "text-green-600" },
  entry_updated: { label: "Entrada editada", emoji: "✏️", color: "text-yellow-600" },
  entry_deleted: { label: "Entrada borrada", emoji: "🗑️", color: "text-red-600" },
  closeout_submitted: { label: "Cierre del día", emoji: "📋", color: "text-blue-600" },
  standup_submitted: { label: "Standup", emoji: "💬", color: "text-primary" },
  reaction_added: { label: "Reacción", emoji: "👍", color: "text-green-600" },
  reaction_removed: { label: "Reacción removida", emoji: "👎", color: "text-gray-600" },
  flag_created: { label: "Flag levantada", emoji: "🚩", color: "text-red-600" },
  flag_resolved: { label: "Flag resuelta", emoji: "✅", color: "text-green-600" },
  profile_updated: { label: "Perfil actualizado", emoji: "👤", color: "text-blue-600" },
  member_joined: { label: "Nuevo miembro", emoji: "🎉", color: "text-green-600" },
  member_removed: { label: "Miembro removido", emoji: "👋", color: "text-red-600" },
  goal_created: { label: "Objetivo creado", emoji: "🎯", color: "text-emerald-600" },
  goal_updated: { label: "Objetivo actualizado", emoji: "🎯", color: "text-yellow-600" },
  shoutout_given: { label: "Shoutout dado", emoji: "⭐", color: "text-yellow-600" },
};

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  target_type: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  profiles: Profile;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterAction, setFilterAction] = useState("");
  const supabase = createClient();
  const pageSize = 50;

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string }>();
      if (!membership) { setLoading(false); return; }

      let query = supabase
        .from("audit_log")
        .select("*, profiles(*)")
        .eq("org_id", membership.org_id)
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (filterAction) {
        query = query.eq("action", filterAction);
      }

      const { data } = await query.returns<AuditEntry[]>();
      setEntries(data ?? []);
      setLoading(false);
    }
    load();
  }, [page, filterAction]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <History className="w-6 h-6 text-primary" />
          Audit Log
        </h1>
        <p className="text-muted-foreground text-sm">
          Registro inmutable de toda la actividad. Nadie puede cambiar el pasado.
        </p>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button
          variant={filterAction === "" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilterAction(""); setPage(0); }}
        >
          Todos
        </Button>
        {["entry_created", "entry_updated", "entry_deleted", "flag_created", "shoutout_given"].map((a) => (
          <Button
            key={a}
            variant={filterAction === a ? "default" : "outline"}
            size="sm"
            onClick={() => { setFilterAction(a); setPage(0); }}
          >
            {ACTION_LABELS[a]?.emoji} {ACTION_LABELS[a]?.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 animate-pulse" /><p className="text-sm text-muted-foreground animate-pulse">Cargando...</p></div>
      ) : entries.length === 0 ? (
        <p className="text-center text-muted-foreground py-20">No hay actividad registrada.</p>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => {
            const actionConfig = ACTION_LABELS[entry.action] ?? { label: entry.action, emoji: "📌", color: "text-gray-600" };
            return (
              <div key={entry.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                <Avatar className="w-7 h-7 ring-2 ring-background shadow-sm">
                  <AvatarImage src={entry.profiles?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px]">
                    {getInitials(entry.profiles?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-lg">{actionConfig.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{entry.profiles?.full_name ?? "?"}</span>
                    {" "}
                    <span className={cn("font-medium", actionConfig.color)}>
                      {actionConfig.label}
                    </span>
                    {entry.new_data?.title ? (
                      <span className="text-muted-foreground"> — &quot;{String(entry.new_data.title as string).slice(0, 60)}&quot;</span>
                    ) : null}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {format(new Date(entry.created_at), "d MMM HH:mm", { locale: es })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
        </Button>
        <span className="text-sm text-muted-foreground">Página {page + 1}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={entries.length < pageSize}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
