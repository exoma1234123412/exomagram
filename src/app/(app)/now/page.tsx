"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LiveStatus, Profile, TimeEntry } from "@/lib/types/database";
import { LIVE_STATUS_CONFIG, CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import { Radio, Clock, Sparkles } from "lucide-react";
import Link from "next/link";

type StatusWithProfile = LiveStatus & { profiles: Profile };

export default function NowPage() {
  const [statuses, setStatuses] = useState<StatusWithProfile[]>([]);
  const [latestEntries, setLatestEntries] = useState<Map<string, TimeEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (membership) setOrgId(membership.org_id);
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId) return;

    async function loadData() {
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];

      const [{ data: statusData }, { data: entries }] = await Promise.all([
        supabase
          .from("live_status")
          .select("*, profiles(*)")
          .eq("org_id", orgId)
          ,
        supabase
          .from("time_entries")
          .select("*")
          .eq("org_id", orgId)
          .eq("date", today)
          .order("hour", { ascending: false }),
      ]);

      setStatuses(statusData ?? []);

      // Get latest entry per user
      const entryMap = new Map<string, TimeEntry>();
      for (const entry of entries ?? []) {
        if (!entryMap.has(entry.user_id)) {
          entryMap.set(entry.user_id, entry);
        }
      }
      setLatestEntries(entryMap);
      setLoading(false);
    }

    loadData();

    // Real-time subscription
    const channel = supabase
      .channel("now_live_status")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "live_status",
        filter: `org_id=eq.${orgId}`,
      }, () => loadData())
      .subscribe();

    // Refresh every 30s
    const interval = setInterval(loadData, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sort: online first, then by status
  const sorted = [...statuses].sort((a, b) => {
    const order = { online: 0, deep_work: 1, in_meeting: 2, idle: 3, break: 4, offline: 5 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });

  const onlineCount = sorted.filter((s) => s.status !== "offline").length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="relative">
          <Radio className="w-6 h-6 text-green-500" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full animate-ping" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Ahora</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        {onlineCount} persona{onlineCount !== 1 ? "s" : ""} activa{onlineCount !== 1 ? "s" : ""} ahora mismo
      </p>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" /><p className="text-sm text-muted-foreground animate-pulse">Cargando...</p></div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          No hay miembros en el equipo todavia.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sorted.map((s) => {
            const config = LIVE_STATUS_CONFIG[s.status];
            const lastEntry = latestEntries.get(s.user_id);
            const lastEntryCat = lastEntry ? CATEGORIES[lastEntry.category] : null;

            // Flow state: deep_work status or online with recent deep_work entry
            const inFlow = s.status === "deep_work" || (
              s.status === "online" && lastEntry?.category === "deep_work"
            );

            return (
              <Card
                key={s.user_id}
                className={cn(
                  "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
                  s.status === "offline" && "opacity-50",
                  s.status === "deep_work" && "border-blue-200 dark:border-blue-800",
                  s.status === "in_meeting" && "border-blue-200 dark:border-blue-800"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <Avatar className="w-12 h-12 ring-2 ring-background shadow-sm">
                        <AvatarImage src={s.profiles?.avatar_url ?? undefined} />
                        <AvatarFallback>{getInitials(s.profiles?.full_name)}</AvatarFallback>
                      </Avatar>
                      <div
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-card",
                          config.dotColor
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/member/${s.user_id}`}
                          className="font-semibold text-sm hover:underline truncate"
                        >
                          {s.profiles?.full_name ?? "?"}
                        </Link>
                        {inFlow ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0 text-primary border-primary/30 bg-primary/5 dark:bg-primary/10 animate-pulse"
                          >
                            <Sparkles className="w-3 h-3 mr-0.5" />
                            En flow - No molestar
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] shrink-0", config.color)}
                          >
                            {config.label}
                          </Badge>
                        )}
                      </div>
                      {s.profiles?.role && (
                        <p className="text-xs text-muted-foreground">{s.profiles.role}</p>
                      )}

                      {/* Current task */}
                      {s.current_task && s.status !== "offline" && (
                        <p className="text-xs mt-1.5 bg-muted/50 px-2 py-1 rounded inline-block">
                          {s.current_task}
                        </p>
                      )}

                      {/* Last entry */}
                      {lastEntry && (
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>Ultimo registro:</span>
                          {lastEntryCat && (
                            <Badge variant="secondary" className={cn("text-[9px] py-0", lastEntryCat.color, lastEntryCat.bgColor)}>
                              {lastEntryCat.emoji} {lastEntryCat.label}
                            </Badge>
                          )}
                          <span className="truncate">{lastEntry.title}</span>
                        </div>
                      )}

                      <p className="text-[10px] text-muted-foreground/50 mt-1">
                        {s.status !== "offline"
                          ? `Activo desde ${timeAgo(s.started_at)}`
                          : `Ultimo heartbeat ${timeAgo(s.last_heartbeat)}`}
                      </p>
                    </div>
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
