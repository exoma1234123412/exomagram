"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Profile } from "@/lib/types/database";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { UserCheck, Send, CheckCircle2, XCircle, Clock } from "lucide-react";

interface CrossVerifyProps {
  entry: TimeEntry & { profiles?: Profile };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CrossVerifyDialog({ entry, open, onOpenChange }: CrossVerifyProps) {
  const [members, setMembers] = useState<{ user_id: string; full_name: string | null; avatar_url: string | null }[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [existing, setExisting] = useState<{ verifier_id: string; status: string }[]>([]);
  const supabase = createClient();

  // Load members and existing verifications on open
  useState(() => {
    if (!open) return;
    async function load() {
      const { data: memberData } = await supabase
        .from("org_members")
        .select("user_id, profiles(full_name, avatar_url)")
        .eq("org_id", entry.org_id)
        .neq("user_id", entry.user_id)
        ;

      setMembers(
        memberData?.map((m) => ({
          user_id: m.user_id,
          full_name: m.profiles?.full_name ?? null,
          avatar_url: m.profiles?.avatar_url ?? null,
        })) ?? []
      );

      const { data: verifications } = await supabase
        .from("meeting_verifications")
        .select("verifier_id, status")
        .eq("entry_id", entry.id);

      setExisting(verifications ?? []);
    }
    load();
  });

  function toggleMember(uid: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function handleSend() {
    if (selectedMembers.size === 0) return;
    setSending(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSending(false); return; }

    const inserts = Array.from(selectedMembers).map((verifierId) => ({
      entry_id: entry.id,
      requester_id: user.id,
      verifier_id: verifierId,
      org_id: entry.org_id,
      status: "pending",
    }));

    await supabase.from("meeting_verifications").upsert(inserts, { onConflict: "entry_id,verifier_id" });
    setSent(true);
    setSending(false);
  }

  const existingMap = new Map(existing.map((e) => [e.verifier_id, e.status]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-blue-500" />
            Solicitar verificacion cruzada
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-3">
          <p className="font-medium text-foreground">{entry.title}</p>
          <p className="text-xs">{entry.date} - Hora {entry.hour}</p>
          <p className="text-xs mt-1">Pide a companeros que confirmen que estuvieron en esta reunion.</p>
        </div>

        {sent ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium">Solicitud enviada</p>
            <p className="text-xs text-muted-foreground">Los participantes recibiran una notificacion.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {members.map((m) => {
                const existingStatus = existingMap.get(m.user_id);
                const isSelected = selectedMembers.has(m.user_id);

                return (
                  <button
                    key={m.user_id}
                    onClick={() => !existingStatus && toggleMember(m.user_id)}
                    disabled={!!existingStatus}
                    className={cn(
                      "w-full flex items-center gap-3 p-2.5 rounded-xl border-2 transition-all text-left",
                      existingStatus
                        ? "border-transparent bg-muted/30 cursor-default"
                        : isSelected
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                          : "border-transparent bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <Avatar className="w-7 h-7">
                      <AvatarImage src={m.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">{getInitials(m.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm flex-1">{m.full_name ?? "Sin nombre"}</span>
                    {existingStatus === "confirmed" && (
                      <Badge variant="default" className="text-[10px] gap-1 bg-green-600">
                        <CheckCircle2 className="w-3 h-3" /> Confirmado
                      </Badge>
                    )}
                    {existingStatus === "denied" && (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        <XCircle className="w-3 h-3" /> Negado
                      </Badge>
                    )}
                    {existingStatus === "pending" && (
                      <Badge variant="outline" className="text-[10px] gap-1 text-yellow-600">
                        <Clock className="w-3 h-3" /> Pendiente
                      </Badge>
                    )}
                    {!existingStatus && isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                    )}
                  </button>
                );
              })}
            </div>

            <Button
              onClick={handleSend}
              disabled={sending || selectedMembers.size === 0}
              className="w-full gap-2"
            >
              <Send className="w-4 h-4" />
              {sending ? "Enviando..." : `Solicitar verificacion (${selectedMembers.size})`}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
