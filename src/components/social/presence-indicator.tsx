"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, getInitials } from "@/lib/utils";

interface OnlineUser {
  user_id: string;
  current_task: string | null;
  last_heartbeat: string;
  profiles: Profile;
}

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds
const ONLINE_THRESHOLD = 2 * 60 * 1000; // 2 minutes

export function PresenceIndicator() {
  const { orgId, userId } = useOrg();
  const pathname = usePathname();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const supabase = createClient();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Upsert current user's presence with the page path
  const upsertPresence = useCallback(async () => {
    if (!orgId || !userId) return;

    await supabase.from("live_status").upsert({
      user_id: userId,
      org_id: orgId,
      status: "online",
      current_task: pathname,
      last_heartbeat: new Date().toISOString(),
    });
  }, [orgId, userId, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch online users
  const fetchOnline = useCallback(async () => {
    if (!orgId) return;

    const cutoff = new Date(Date.now() - ONLINE_THRESHOLD).toISOString();

    const { data } = await supabase
      .from("live_status")
      .select("user_id, current_task, last_heartbeat, profiles(*)")
      .eq("org_id", orgId)
      .gte("last_heartbeat", cutoff)
      .neq("status", "offline");

    if (data) {
      setOnlineUsers(data as unknown as OnlineUser[]);
    }
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial presence + heartbeat
  useEffect(() => {
    if (!orgId || !userId) return;

    upsertPresence();
    fetchOnline();

    // Heartbeat every 30s
    heartbeatRef.current = setInterval(() => {
      upsertPresence();
    }, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [orgId, userId, upsertPresence, fetchOnline]);

  // Re-upsert when page changes
  useEffect(() => {
    upsertPresence();
  }, [pathname, upsertPresence]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("presence_indicator")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_status",
          filter: `org_id=eq.${orgId}`,
        },
        () => fetchOnline()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render until we have data
  if (!orgId || onlineUsers.length === 0) return null;

  // Exclude current user from count but show them in the list
  const othersOnline = onlineUsers.filter((u) => u.user_id !== userId);
  const totalOnline = onlineUsers.length;

  // Page-label helper for tooltips
  function pageLabel(path: string | null): string {
    if (!path) return "Navegando";
    if (path === "/") return "Inicio";
    if (path.startsWith("/timeline")) return "Timeline";
    if (path.startsWith("/team")) return "Equipo";
    if (path.startsWith("/settings")) return "Configuración";
    if (path.startsWith("/profile")) return "Perfil";
    if (path.startsWith("/compare")) return "Comparar";
    if (path.startsWith("/reports")) return "Reportes";
    return path.replace(/^\//, "").split("/")[0] ?? "Navegando";
  }

  return (
    <div className="fixed top-3 right-4 z-40 hidden md:block">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full",
              "bg-card/90 backdrop-blur-sm border border-border/50 shadow-sm",
              "cursor-default select-none transition-all duration-300",
              "hover:shadow-md hover:border-border/80"
            )}
          >
            {/* Pulsing dot */}
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>

            {/* Stacked avatar dots */}
            <div className="flex -space-x-1.5">
              {onlineUsers.slice(0, 4).map((u) => (
                <div
                  key={u.user_id}
                  className="w-5 h-5 rounded-full ring-1 ring-card overflow-hidden bg-muted"
                >
                  {u.profiles?.avatar_url ? (
                    <img
                      src={u.profiles.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                      {getInitials(u.profiles?.full_name)}
                    </div>
                  )}
                </div>
              ))}
              {onlineUsers.length > 4 && (
                <div className="w-5 h-5 rounded-full ring-1 ring-card bg-muted flex items-center justify-center text-[8px] font-medium text-muted-foreground">
                  +{onlineUsers.length - 4}
                </div>
              )}
            </div>

            {/* Count label */}
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {totalOnline} en línea
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" className="p-0">
            <div className="px-3 py-2 space-y-1.5 min-w-[180px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-1.5">
                {totalOnline} {totalOnline === 1 ? "persona" : "personas"} viendo esta app
              </p>
              {onlineUsers.map((u) => (
                <div key={u.user_id} className="flex items-center gap-2">
                  <Avatar size="sm" className="ring-0">
                    <AvatarImage src={u.profiles?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[8px] font-semibold">
                      {getInitials(u.profiles?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium truncate">
                      {u.profiles?.full_name?.split(" ")[0] ?? "?"}
                      {u.user_id === userId && (
                        <span className="text-muted-foreground/60 ml-1">(tú)</span>
                      )}
                    </p>
                    <p className="text-[9px] opacity-60 truncate">
                      {pageLabel(u.current_task)}
                    </p>
                  </div>
                </div>
              ))}
              {othersOnline.length === 0 && (
                <p className="text-[10px] opacity-50">Solo tú por aquí</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
