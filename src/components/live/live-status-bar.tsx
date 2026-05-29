"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LiveStatus, Profile } from "@/lib/types/database";
import { LIVE_STATUS_CONFIG } from "@/lib/constants";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type StatusWithProfile = LiveStatus & { profiles: Profile };

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000 / 60;
  if (diff < 1) return "ahora";
  if (diff < 60) return `${Math.round(diff)}m`;
  return `${Math.round(diff / 60)}h`;
}

export function LiveStatusBar({ orgId }: { orgId: string }) {
  const [statuses, setStatuses] = useState<StatusWithProfile[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("live_status")
        .select("*, profiles(*)")
        .eq("org_id", orgId)
        .returns<StatusWithProfile[]>();
      setStatuses(data ?? []);
    }
    fetch();

    const channel = supabase
      .channel("live_status_rt")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "live_status",
        filter: `org_id=eq.${orgId}`,
      }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (statuses.length === 0) return null;

  const online = statuses.filter((s) => s.status !== "offline");
  const offline = statuses.filter((s) => s.status === "offline");

  return (
    <div className="bg-card/80 glass border border-border/40 rounded-2xl p-5 mb-8 shadow-sm shadow-primary/3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          En vivo ahora
        </h3>
        <span className="text-xs text-muted-foreground/70 font-medium tabular-nums">
          {online.length} activos · {offline.length} offline
        </span>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {statuses.map((s) => {
          const config = LIVE_STATUS_CONFIG[s.status];
          return (
            <div
              key={s.user_id}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
                s.status === "offline"
                  ? "bg-muted/30 opacity-40"
                  : "bg-accent/50 hover:bg-accent hover:shadow-sm"
              )}
            >
              <div className="relative">
                <Avatar className="w-8 h-8 ring-2 ring-background">
                  <AvatarImage src={s.profiles?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px] font-semibold bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/50 dark:to-indigo-900/50">
                    {getInitials(s.profiles?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card",
                    config.dotColor,
                    s.status !== "offline" && "animate-pulse-glow"
                  )}
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">
                  {s.profiles?.full_name?.split(" ")[0] ?? "?"}
                </p>
                {s.current_task && s.status !== "offline" ? (
                  <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                    {s.current_task}
                  </p>
                ) : (
                  <p className={cn("text-[10px] font-medium", config.color)}>{config.label}</p>
                )}
              </div>
              {s.status !== "offline" && (
                <span className="text-[10px] text-muted-foreground/50 font-medium tabular-nums ml-1">
                  {timeAgo(s.started_at)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
