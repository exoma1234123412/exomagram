"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { getTodayMTY } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { format, startOfWeek } from "date-fns";
import Link from "next/link";

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  status: string;
  href: string;
  section: "morning" | "during" | "evening";
}

function getWeekStart(date: Date = new Date()): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function DailyChecklist() {
  const { orgId, userId } = useOrg();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    if (!orgId || !userId) return;

    const today = getTodayMTY();
    const weekStart = getWeekStart();

    const [
      { data: standup },
      { data: promises },
      { data: entries },
      { data: closeout },
      { data: contract },
    ] = await Promise.all([
      supabase
        .from("standups")
        .select("id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("date", today)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("daily_promises")
        .select("id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("date", today),
      supabase
        .from("time_entries")
        .select("id, proof_urls")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("date", today)
        .is("deleted_at", null),
      supabase
        .from("daily_closeouts")
        .select("id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("date", today)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("weekly_contracts")
        .select("id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("week_start", weekStart)
        .limit(1)
        .maybeSingle(),
    ]);

    const hoursLogged = entries?.length ?? 0;
    const withProof = entries?.filter(
      (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
    ).length ?? 0;
    const proofPercent = hoursLogged > 0 ? Math.round((withProof / hoursLogged) * 100) : 0;
    const promiseCount = promises?.length ?? 0;

    const checklist: ChecklistItem[] = [
      // Morning
      {
        id: "standup",
        label: "Standup",
        done: !!standup,
        status: standup ? "Enviado" : "Pendiente",
        href: "/auto-standup",
        section: "morning",
      },
      {
        id: "promises",
        label: "Promesas",
        done: promiseCount > 0,
        status: promiseCount > 0 ? `${promiseCount} creada${promiseCount !== 1 ? "s" : ""}` : "Sin promesas",
        href: "/broken-promises",
        section: "morning",
      },
      // During day
      {
        id: "hours",
        label: "Horas registradas",
        done: hoursLogged >= EXPECTED_DAILY_HOURS,
        status: `${hoursLogged}/${EXPECTED_DAILY_HOURS}`,
        href: "/dashboard",
        section: "during",
      },
      {
        id: "proof",
        label: "Evidencia",
        done: hoursLogged > 0 && proofPercent >= 80,
        status: hoursLogged > 0 ? `${proofPercent}%` : "—",
        href: "/dashboard",
        section: "during",
      },
      // Evening
      {
        id: "closeout",
        label: "Closeout",
        done: !!closeout,
        status: closeout ? "Completado" : "Pendiente",
        href: "/dashboard",
        section: "evening",
      },
      {
        id: "contract",
        label: "Contrato actualizado",
        done: !!contract,
        status: contract ? "Activo" : "Sin contrato",
        href: "/contract",
        section: "evening",
      },
    ];

    setItems(checklist);
    setLoading(false);
  }, [orgId, userId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time subscriptions
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("daily-checklist")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_entries", filter: `org_id=eq.${orgId}` },
        () => fetchData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "standups", filter: `org_id=eq.${orgId}` },
        () => fetchData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_closeouts", filter: `org_id=eq.${orgId}` },
        () => fetchData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_promises", filter: `org_id=eq.${orgId}` },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchData, supabase]);

  if (loading || items.length === 0) return null;

  const completed = items.filter((i) => i.done).length;
  const total = items.length;
  const percent = Math.round((completed / total) * 100);

  const sections: { key: ChecklistItem["section"]; label: string }[] = [
    { key: "morning", label: "MANANA" },
    { key: "during", label: "DURANTE EL DIA" },
    { key: "evening", label: "CIERRE" },
  ];

  return (
    <div className="border border-border p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
          CHECKLIST DIARIO
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          <span className={cn(
            "font-bold",
            completed === total ? "text-green-500" : "text-foreground"
          )}>
            {completed}/{total}
          </span>
          {" "}completados
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-border/30 mb-4 overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-500",
            completed === total ? "bg-green-500" : "bg-primary"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {sections.map((section) => {
          const sectionItems = items.filter((i) => i.section === section.key);
          if (sectionItems.length === 0) return null;

          return (
            <div key={section.key}>
              <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-muted-foreground block mb-1.5">
                {section.label}
              </span>
              <div className="space-y-1">
                {sectionItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between px-2 py-1.5 transition-colors duration-200",
                      "hover:bg-accent/30",
                      !item.done && "cursor-pointer"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {item.done ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      )}
                      <span
                        className={cn(
                          "font-mono text-[11px]",
                          item.done ? "text-green-500" : "text-foreground"
                        )}
                      >
                        {item.label}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "font-mono text-[10px] tabular-nums",
                        item.done ? "text-green-500/70" : "text-red-400/70"
                      )}
                    >
                      {item.status}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
