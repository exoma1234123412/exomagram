"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Eye } from "lucide-react";

export function SpotlightIndicator({ orgId }: { orgId: string }) {
  const supabase = createClient();
  const [activeCount, setActiveCount] = useState<number>(0);

  useEffect(() => {
    if (!orgId) return;

    async function load() {
      const { count } = await supabase
        .from("live_status")
        .select("user_id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .in("status", ["online", "deep_work", "in_meeting"]);

      setActiveCount(count ?? 0);
    }

    load();

    // Refresh every 60 seconds
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-2 font-mono text-[9px] tracking-wide text-muted-foreground mb-6">
      <Eye className="w-3 h-3 shrink-0 text-primary animate-eye-blink" />
      <span>Claude observa</span>
      <span className="text-border">|</span>
      <span>Tu perfil es publico</span>
      <span className="text-border">|</span>
      <span className="tabular-nums">
        {activeCount} {activeCount === 1 ? "persona activa" : "personas activas"}
      </span>
    </div>
  );
}
