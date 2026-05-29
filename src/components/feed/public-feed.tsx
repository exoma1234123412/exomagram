// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Brain, Trophy, AlertTriangle, Sparkles, Target, Users, Zap, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface FeedItem {
  id: string;
  type: string;
  title: string;
  body: string;
  emoji: string | null;
  urgency: string;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof Brain; color: string }> = {
  ai_announcement: { icon: Brain, color: "text-foreground" },
  achievement: { icon: Trophy, color: "text-yellow-600" },
  praise: { icon: Sparkles, color: "text-green-600" },
  milestone: { icon: Target, color: "text-blue-600" },
  challenge: { icon: Zap, color: "text-orange-600" },
  team_update: { icon: Users, color: "text-foreground" },
  warning: { icon: AlertTriangle, color: "text-red-600" },
  shame: { icon: AlertTriangle, color: "text-red-600" },
};

export function PublicFeed({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("public_feed")
        .select("*")
        .eq("org_id", orgId)
        .gte("created_at", today + "T00:00:00")
        .order("created_at", { ascending: false })
        .limit(20);
      setItems((data ?? []) as FeedItem[]);
    }
    load();

    // Real-time
    const channel = supabase
      .channel("public_feed_rt")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "public_feed",
        filter: `org_id=eq.${orgId}`,
      }, (payload) => {
        setItems((prev) => [payload.new as FeedItem, ...prev.slice(0, 19)]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId]);

  if (items.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Feed</h3>
      </div>
      <div className="space-y-2">
        {items.slice(0, 5).map((item) => {
          const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.ai_announcement;
          const Icon = config.icon;
          return (
            <div key={item.id} className={cn(
              "flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border/50 bg-card/50",
              item.urgency === "critical" && "border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/10",
              item.urgency === "high" && "border-orange-200/50 dark:border-orange-900/50",
            )}>
              {item.emoji ? (
                <span className="text-base mt-0.5">{item.emoji}</span>
              ) : (
                <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", config.color)} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.body}</p>
              </div>
              <span className="text-[10px] text-muted-foreground/50 shrink-0">
                {format(new Date(item.created_at), "H:mm")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
