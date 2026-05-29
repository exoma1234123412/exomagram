"use client";

// HOURLY ENFORCER — every hour during work hours, checks if the previous
// hour was logged. If not, shows a modal with inline quick-log form.
// User CAN dismiss — but each dismissal is publicly logged and the modal
// escalates visually each time.

import { useEffect, useState, useCallback, useRef } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { getTodayMTY, formatHour, cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";

function getMTYDate(): { hour: number; day: number; dateStr: string } {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" })
  );
  return { hour: now.getHours(), day: now.getDay(), dateStr: getTodayMTY() };
}

function getDismissals(date: string): number {
  try { return parseInt(localStorage.getItem(`enforcer_dismissals_${date}`) ?? "0", 10); }
  catch { return 0; }
}

function incrementDismissals(date: string): number {
  const next = getDismissals(date) + 1;
  try { localStorage.setItem(`enforcer_dismissals_${date}`, String(next)); }
  catch { /* noop */ }
  return next;
}

const categoryKeys = Object.keys(CATEGORIES) as WorkCategory[];

export function HourlyEnforcer() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [visible, setVisible] = useState(false);
  const [targetHour, setTargetHour] = useState<number | null>(null);
  const [dismissCount, setDismissCount] = useState(0);
  const [category, setCategory] = useState<WorkCategory | null>(null);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workStart, setWorkStart] = useState(7);
  const [workEnd, setWorkEnd] = useState(18);
  const lastCheckedHourRef = useRef<number | null>(null);
  const profileLoadedRef = useRef(false);

  // Load user work schedule
  useEffect(() => {
    if (!userId || profileLoadedRef.current) return;
    profileLoadedRef.current = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("work_start_hour, work_end_hour")
        .eq("id", userId)
        .single();
      if (data) {
        setWorkStart(data.work_start_hour ?? 7);
        setWorkEnd(data.work_end_hour ?? 18);
      }
    })();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Core check: is the previous hour logged?
  const checkHour = useCallback(async () => {
    if (!orgId || !userId) return;
    const { hour, day, dateStr } = getMTYDate();
    if (day === 0 || day === 6) return; // weekdays only
    const prevHour = hour - 1;
    if (prevHour < workStart || prevHour >= workEnd) return;
    if (lastCheckedHourRef.current === hour) return;
    lastCheckedHourRef.current = hour;

    const { data } = await supabase
      .from("time_entries")
      .select("id")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("date", dateStr)
      .eq("hour", prevHour)
      .is("deleted_at", null)
      .limit(1);

    if (data && data.length > 0) return;
    setTargetHour(prevHour);
    setDismissCount(getDismissals(dateStr));
    setCategory(null);
    setTitle("");
    setError(null);
    setSuccess(false);
    setVisible(true);
  }, [orgId, userId, workStart, workEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run check on mount + every 60s
  useEffect(() => {
    if (!orgId || !userId) return;
    const initialTimeout = setTimeout(checkHour, 60_000);
    const interval = setInterval(checkHour, 60_000);
    return () => { clearTimeout(initialTimeout); clearInterval(interval); };
  }, [orgId, userId, checkHour]);

  // Dismiss: log to public_feed
  const handleDismiss = useCallback(async () => {
    if (!orgId || !userId || targetHour === null) return;
    const dateStr = getTodayMTY();
    const newCount = incrementDismissals(dateStr);
    setDismissCount(newCount);
    const hourLabel = formatHour(targetHour);
    await supabase.from("public_feed").insert({
      org_id: orgId,
      type: "warning",
      title: "Hora descartada",
      body: `Descarto el registro de las ${hourLabel}`,
      target_user_id: userId,
      urgency: newCount >= 3 ? "critical" : "normal",
      emoji: null,
      is_ai_generated: false,
    });
    setVisible(false);
    lastCheckedHourRef.current = null; // allow recheck next hour
  }, [orgId, userId, targetHour]); // eslint-disable-line react-hooks/exhaustive-deps

  // Submit: upsert time_entry
  const handleSubmit = useCallback(async () => {
    if (!orgId || !userId || targetHour === null || !category) return;
    if (title.trim().length < 10) { setError("Minimo 10 caracteres"); return; }
    setSubmitting(true);
    setError(null);

    const dateStr = getTodayMTY();
    const now = new Date();
    const entryHourEnd = new Date(`${dateStr}T${String(targetHour + 1).padStart(2, "0")}:00:00`);
    const minutesLate = Math.max(0, Math.round((now.getTime() - entryHourEnd.getTime()) / 60_000));

    const { error: insertError } = await supabase.from("time_entries").upsert(
      {
        user_id: userId, org_id: orgId, date: dateStr, hour: targetHour,
        category, title: title.trim(), description: null,
        mood: null, energy: null, links: null,
        project: null, project_id: null, proof_urls: null,
        is_late: minutesLate > 0, minutes_late: minutesLate,
        logged_at: new Date().toISOString(),
        verification_status: "unverified" as const,
        entry_source: "quick" as const,
      },
      { onConflict: "user_id,org_id,date,hour" }
    );

    setSubmitting(false);
    if (insertError) { setError(insertError.message); return; }
    setSuccess(true);
    setTimeout(() => setVisible(false), 800);
  }, [orgId, userId, targetHour, category, title]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────
  if (!visible || targetHour === null) return null;

  const nextHour = targetHour + 1;
  const escalation = dismissCount >= 3 ? "critical" : dismissCount >= 1 ? "warning" : "normal";

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center">
      <div
        className={cn(
          "corner-marks bg-background p-6 max-w-md w-full mx-4",
          escalation === "critical" && "border-2 border-red-500/50 animate-danger-pulse",
          escalation === "warning" && "border border-amber-500/50",
          escalation === "normal" && "border border-border"
        )}
      >
        {success ? (
          <div className="flex flex-col items-center py-8">
            <p className="font-mono text-sm font-bold uppercase tracking-tight text-green-500">
              Registrado
            </p>
          </div>
        ) : (
          <>
            <p className="font-mono text-sm font-bold uppercase tracking-tight text-muted-foreground mb-2">
              {"\u00BF"}Que hiciste de
            </p>
            <p className="font-mono tabular-nums text-2xl font-black text-primary mb-4">
              {formatHour(targetHour)} - {formatHour(nextHour)}
            </p>

            {escalation === "warning" && (
              <p className="font-mono text-[10px] text-amber-500 mb-4">
                Ya descartaste {dismissCount} {dismissCount === 1 ? "vez" : "veces"} hoy
              </p>
            )}
            {escalation === "critical" && (
              <p className="font-mono text-[10px] text-red-400 mb-4 uppercase tracking-wider">
                ADVERTENCIA: {dismissCount} horas sin registrar hoy
              </p>
            )}

            <div className="grid grid-cols-4 gap-1.5 mb-4">
              {categoryKeys.map((key) => {
                const cat = CATEGORIES[key];
                const selected = category === key;
                return (
                  <button
                    key={key}
                    onClick={() => setCategory(key)}
                    className={cn(
                      "border p-2 font-mono text-xs transition-colors duration-150",
                      selected
                        ? "bg-primary/10 border-primary/50 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    {cat.emoji} {cat.label.length > 8 ? cat.label.slice(0, 7) + "." : cat.label}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Que hiciste (min 10 chars)"
              className="w-full bg-transparent border border-border px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 mb-3"
            />

            {error && (
              <p className="font-mono text-[10px] text-red-400 mb-3">{error}</p>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={handleSubmit}
                disabled={!category || title.trim().length < 10 || submitting}
                className="bg-primary text-primary-foreground font-mono text-xs px-6 py-2 disabled:opacity-40 transition-opacity"
              >
                {submitting ? "..." : "Registrar"}
              </button>
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={handleDismiss}
                  className="font-mono text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  Descartar
                </button>
                {dismissCount > 0 && (
                  <span className="font-mono text-[10px] text-red-400">
                    Hoy has descartado {dismissCount} {dismissCount === 1 ? "vez" : "veces"}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
