"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { History, ChevronDown, ChevronUp } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  profiles?: Profile;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function getDiffFields(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): { field: string; from: string; to: string }[] {
  if (!oldData || !newData) return [];
  const diffs: { field: string; from: string; to: string }[] = [];
  const skipFields = new Set(["updated_at", "logged_at", "created_at"]);

  for (const key of Object.keys(newData)) {
    if (skipFields.has(key)) continue;
    const oldVal = JSON.stringify(oldData[key] ?? null);
    const newVal = JSON.stringify(newData[key] ?? null);
    if (oldVal !== newVal) {
      diffs.push({
        field: key,
        from: String(oldData[key] ?? "-"),
        to: String(newData[key] ?? "-"),
      });
    }
  }
  return diffs;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  entry_created: { label: "Creado", color: "text-green-600" },
  entry_updated: { label: "Editado", color: "text-blue-600" },
  entry_deleted: { label: "Eliminado", color: "text-red-600" },
  flag_created: { label: "Flag creado", color: "text-orange-600" },
  flag_resolved: { label: "Flag resuelto", color: "text-green-600" },
  reaction_added: { label: "Reaccion", color: "text-primary" },
};

export function EntryChangelog({ entryId }: { entryId: string }) {
  const [changes, setChanges] = useState<AuditEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!expanded) return;

    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("audit_log")
        .select("id, action, old_data, new_data, created_at, profiles:user_id(id, full_name, avatar_url, email)")
        .eq("target_id", entryId)
        .eq("target_type", "time_entry")
        .order("created_at", { ascending: false })
        .limit(20)
        .returns<AuditEntry[]>();

      setChanges(data ?? []);
      setLoading(false);
    }
    load();
  }, [expanded, entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <History className="w-3 h-3" />
        Historial
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-muted">
          {loading && <p className="text-[10px] text-muted-foreground">Cargando...</p>}
          {!loading && changes.length === 0 && (
            <p className="text-[10px] text-muted-foreground">Sin historial de cambios.</p>
          )}
          {changes.map((c) => {
            const actionInfo = ACTION_LABELS[c.action] ?? { label: c.action, color: "text-muted-foreground" };
            const diffs = getDiffFields(c.old_data, c.new_data);

            return (
              <div key={c.id} className="flex gap-2 text-[10px]">
                {c.profiles && (
                  <Avatar className="w-4 h-4 mt-0.5">
                    <AvatarImage src={(c.profiles as unknown as Profile).avatar_url ?? undefined} />
                    <AvatarFallback className="text-[7px]">
                      {getInitials((c.profiles as unknown as Profile).full_name)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="flex-1 min-w-0">
                  <span className={cn("font-medium", actionInfo.color)}>
                    {actionInfo.label}
                  </span>
                  <span className="text-muted-foreground ml-1">
                    {format(new Date(c.created_at), "d MMM HH:mm", { locale: es })}
                  </span>
                  {diffs.length > 0 && (
                    <div className="mt-0.5 space-y-0.5">
                      {diffs.slice(0, 3).map((d) => (
                        <p key={d.field} className="text-muted-foreground">
                          <span className="font-medium text-foreground">{d.field}</span>:{" "}
                          <span className="line-through text-red-500/70">{d.from}</span>{" "}
                          → <span className="text-green-600">{d.to}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
