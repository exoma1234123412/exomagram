"use client";

// PROOF ENFORCER — tracks entries logged without proof_urls.
// After 30 minutes, shows persistent notifications until evidence is added.
// Stacks up to 3 visible, dismissals reset after 30 min.

import { useEffect, useState, useCallback, useRef } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { getTodayMTY, formatHour } from "@/lib/utils";
import { ImageOff, X } from "lucide-react";

interface ProoflessEntry {
  id: string;
  hour: number;
  title: string;
  logged_at: string;
}

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

const GRACE_MINUTES = 30;
const MAX_VISIBLE = 3;
const REDISMISS_MINUTES = 30;

export function ProofEnforcer() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();
  const [entries, setEntries] = useState<ProoflessEntry[]>([]);
  // Map of entry id -> dismiss timestamp
  const dismissedRef = useRef<Map<string, number>>(new Map());
  const [, forceUpdate] = useState(0);

  const fetchProofless = useCallback(async () => {
    if (!orgId || !userId) return;
    const today = getTodayMTY();

    const { data } = await supabase
      .from("time_entries")
      .select("id, hour, title, logged_at, proof_urls")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", today)
      .is("deleted_at", null)
      .order("hour", { ascending: true });

    if (!data) return;

    const proofless = data.filter(
      (e) => !e.proof_urls || e.proof_urls.length === 0
    );

    const eligible = proofless
      .filter((e) => minutesAgo(e.logged_at) >= GRACE_MINUTES)
      .map((e) => ({ id: e.id, hour: e.hour, title: e.title, logged_at: e.logged_at }));

    setEntries(eligible);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial fetch + polling every 60s
  useEffect(() => {
    if (!orgId || !userId) return;
    fetchProofless();
    const interval = setInterval(fetchProofless, 60_000);
    return () => clearInterval(interval);
  }, [orgId, userId, fetchProofless]);

  // Real-time subscription — refetch when time_entries change
  useEffect(() => {
    if (!orgId || !userId) return;
    const channel = supabase
      .channel("proof-enforcer")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `user_id=eq.${userId}`,
        },
        () => fetchProofless()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, userId, fetchProofless]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = useCallback((entryId: string) => {
    dismissedRef.current.set(entryId, Date.now());
    forceUpdate((n) => n + 1);
  }, []);

  // Filter out dismissed entries (unless dismiss expired)
  const now = Date.now();
  const visible = entries.filter((e) => {
    const dismissedAt = dismissedRef.current.get(e.id);
    if (!dismissedAt) return true;
    if (now - dismissedAt > REDISMISS_MINUTES * 60_000) {
      dismissedRef.current.delete(e.id);
      return true;
    }
    return false;
  });

  if (visible.length === 0) return null;

  const shown = visible.slice(0, MAX_VISIBLE);
  const overflow = visible.length - MAX_VISIBLE;

  return (
    <div className="fixed bottom-4 left-60 z-[70] hidden md:flex flex-col space-y-1">
      {shown.map((entry) => {
        const ago = minutesAgo(entry.logged_at);
        const agoLabel = ago >= 60 ? `${Math.round(ago / 60)}h` : `${ago}m`;

        return (
          <div
            key={entry.id}
            className="border border-amber-500/30 bg-amber-950/10 px-3 py-2 w-72 group"
          >
            <div className="flex items-start gap-2">
              <ImageOff className="w-3.5 h-3.5 text-amber-500/70 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[10px] text-muted-foreground leading-tight">
                  Entrada de las {formatHour(entry.hour)} — sin evidencia
                </p>
                <p className="font-mono text-[11px] font-medium text-foreground truncate leading-tight mt-0.5">
                  {entry.title}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <a
                    href="/dashboard"
                    className="font-mono text-[9px] text-primary underline hover:text-primary/80 transition-colors"
                  >
                    Agregar evidencia &rarr;
                  </a>
                  <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
                    Hace {agoLabel}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleDismiss(entry.id)}
                className="text-muted-foreground/60 hover:text-muted-foreground transition-colors shrink-0"
                aria-label="Descartar"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}
      {overflow > 0 && (
        <p className="font-mono text-[9px] text-muted-foreground px-3">
          +{overflow} más sin evidencia
        </p>
      )}
    </div>
  );
}
