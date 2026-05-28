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
    <div className="bg-card border rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          En vivo ahora
        </h3>
        <span className="text-xs text-muted-foreground">
          {online.length} activos · {offline.length} offline
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {statuses.map((s) => {
          const config = LIVE_STATUS_CONFIG[s.status];
          return (
            <div
              key={s.user_id}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
                s.status === "offline" ? "bg-muted/30 opacity-50" : "bg-muted/60"
              )}
            >
              <div className="relative">
                <Avatar className="w-7 h-7">
                  <AvatarImage src={s.profiles?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px]">
                    {getInitials(s.profiles?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card",
                    config.dotColor
                  )}
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">
                  {s.profiles?.full_name?.split(" ")[0] ?? "?"}
                </p>
                {s.current_task && s.status !== "offline" ? (
                  <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                    {s.current_task}
                  </p>
                ) : (
                  <p className={cn("text-[10px]", config.color)}>{config.label}</p>
                )}
              </div>
              {s.status !== "offline" && (
                <span className="text-[10px] text-muted-foreground/60">
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
