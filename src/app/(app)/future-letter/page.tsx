"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { cn, getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Mail,
  Lock,
  Send,
  Clock,
  Loader2,
  MailOpen,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import { format, differenceInDays, differenceInHours, addDays, isPast } from "date-fns";
import { es } from "date-fns/locale";

interface FutureLetter {
  id: string;
  user_id: string;
  new_data: {
    letter: string;
    open_date: string;
    opened: boolean;
  };
  created_at: string;
  profile?: Profile;
}

function isMonday(): boolean {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  );
  return now.getDay() === 1;
}

function getCountdown(openDate: string): string {
  const target = new Date(openDate);
  const now = new Date();
  const days = differenceInDays(target, now);
  const hours = differenceInHours(target, now) % 24;

  if (days > 1) return `${days} días`;
  if (days === 1) return `1 día y ${hours}h`;
  if (hours > 0) return `${hours} horas`;
  return "Abriendo...";
}

export default function FutureLetterPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [letters, setLetters] = useState<FutureLetter[]>([]);
  const [myPending, setMyPending] = useState<FutureLetter | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadLetters = useCallback(async () => {
    if (!orgId) return;

    const { data: logs } = await supabase
      .from("audit_log")
      .select("id, user_id, new_data, created_at")
      .eq("org_id", orgId)
      .eq("action", "entry_created")
      .eq("target_type", "future_letter")
      .order("created_at", { ascending: false });

    // Load profiles
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id, profiles(*)")
      .eq("org_id", orgId);

    const profileMap = new Map<string, Profile>();
    for (const m of members ?? []) {
      if (m.profiles) profileMap.set(m.user_id, m.profiles as unknown as Profile);
    }

    const enriched: FutureLetter[] = (logs ?? []).map((l) => ({
      id: l.id,
      user_id: l.user_id,
      new_data: l.new_data as FutureLetter["new_data"],
      created_at: l.created_at,
      profile: profileMap.get(l.user_id),
    }));

    setLetters(enriched);

    // Find my pending (sealed, not yet opened) letter
    const pending = enriched.find(
      (l) => l.user_id === userId && !isPast(new Date(l.new_data.open_date))
    );
    setMyPending(pending ?? null);

    setLoading(false);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      return;
    }
    loadLetters();
  }, [orgLoading, orgId, loadLetters]);

  async function submitLetter() {
    if (!orgId || !userId || text.trim().length < 20) return;
    setSubmitting(true);

    const openDate = addDays(new Date(), 30).toISOString().split("T")[0];

    await supabase.from("audit_log").insert({
      org_id: orgId,
      user_id: userId,
      action: "entry_created",
      target_type: "future_letter",
      new_data: {
        letter: text.trim(),
        open_date: openDate,
        opened: false,
      },
    });

    setText("");
    await loadLetters();
    setSubmitting(false);
  }

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      </div>
    );
  }

  // Separate letters into sealed (pending) and opened (past open_date)
  const sealedLetters = letters.filter(
    (l) => !isPast(new Date(l.new_data.open_date))
  );
  const openedLetters = letters.filter(
    (l) => isPast(new Date(l.new_data.open_date))
  );

  const canWrite = !myPending && isMonday();
  const hasPendingButNotMonday = !myPending && !isMonday();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Mail className="w-6 h-6 text-primary" />
          Carta al Futuro
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Cada lunes, escribe una carta a tu yo del futuro. Se sella y se abre en 30 días frente a todo el equipo.
        </p>
      </div>

      {/* Warning if not Monday */}
      {hasPendingButNotMonday && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Solo puedes escribir una carta los lunes.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Vuelve el próximo lunes para escribir tu carta.
            </p>
          </div>
        </div>
      )}

      {/* Already have pending letter */}
      {myPending && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Ya tienes una carta sellada esperando abrirse.
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Se abre en {getCountdown(myPending.new_data.open_date)} ({format(new Date(myPending.new_data.open_date), "d MMMM yyyy", { locale: es })})
            </p>
          </div>
        </div>
      )}

      {/* Write form */}
      {canWrite && (
        <Card className="mb-8 border-2 border-dashed">
          <CardContent className="p-6">
            <label className="text-sm font-semibold mb-1 block">
              Escribe a tu yo del futuro
            </label>
            <p className="text-xs text-muted-foreground/60 mb-3">
              &ldquo;En 1 mes quiero haber logrado...&rdquo; &mdash; Esta carta se sella y no podrás verla ni editarla hasta que se abra en 30 días.
            </p>
            <Textarea
              placeholder="En 1 mes quiero haber logrado..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[120px] mb-3"
              maxLength={2000}
              autoComplete="off"
            />
            <div className="flex items-center justify-between">
              <p
                className={cn(
                  "text-xs",
                  text.length < 20 ? "text-muted-foreground" : "text-green-600"
                )}
              >
                {text.length}/2000
                {text.length > 0 && text.length < 20 && (
                  <span className="ml-2">(mínimo 20 caracteres)</span>
                )}
              </p>
              <Button
                className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0 shadow-lg shadow-blue-600/25 gap-2"
                disabled={text.trim().length < 20 || submitting}
                onClick={submitLetter}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submitting ? "Sellando..." : "Sellar carta"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sealed letters */}
      {sealedLetters.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Cartas selladas
          </h2>
          <div className="space-y-3">
            {sealedLetters.map((l) => (
              <Card
                key={l.id}
                className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 border-dashed"
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
                      <AvatarImage src={l.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {getInitials(l.profile?.full_name ?? null)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">
                        {l.profile?.full_name ?? "?"}
                      </p>
                      <p className="text-xs text-muted-foreground italic">
                        Carta sellada el {format(new Date(l.created_at), "d MMM yyyy", { locale: es })}
                      </p>
                    </div>
                    <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] gap-1">
                      <CalendarClock className="w-3 h-3" />
                      {getCountdown(l.new_data.open_date)}
                    </Badge>
                  </div>
                  <div className="mt-3 bg-accent/40 rounded-xl p-4 flex items-center justify-center gap-2 text-muted-foreground">
                    <Lock className="w-4 h-4" />
                    <span className="text-sm font-medium">Contenido sellado hasta el {format(new Date(l.new_data.open_date), "d MMMM yyyy", { locale: es })}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Opened letters */}
      {openedLetters.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <MailOpen className="w-4 h-4" />
            Cartas abiertas
          </h2>
          <div className="space-y-3">
            {openedLetters.map((l) => (
              <Card
                key={l.id}
                className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Avatar className="w-10 h-10 ring-2 ring-background shadow-sm">
                      <AvatarImage src={l.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {getInitials(l.profile?.full_name ?? null)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-sm">
                          {l.profile?.full_name ?? "?"}
                        </p>
                        <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px]">
                          Abierta
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-2">
                        Escrita el {format(new Date(l.created_at), "d MMM yyyy", { locale: es })} &mdash; Abierta el {format(new Date(l.new_data.open_date), "d MMM yyyy", { locale: es })}
                      </p>
                      <div className="bg-accent/40 rounded-xl p-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                          Lo que prometió
                        </p>
                        <p className="text-sm italic">
                          &ldquo;{l.new_data.letter}&rdquo;
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {letters.length === 0 && !canWrite && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Mail className="w-7 h-7 text-primary/40" />
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              No hay cartas todavía.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Vuelve el lunes para escribir tu primera carta al futuro.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
