// @ts-nocheck
"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TimeEntry, LiveStatus } from "@/lib/types/database";
import { CATEGORIES, LIVE_STATUS_CONFIG, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Maximize, Clock, Users, Flame, Shield, Zap } from "lucide-react";

type EntryWithProfile = TimeEntry & { profiles: Profile };
type StatusWithProfile = LiveStatus & { profiles: Profile };

export default function WarRoomPage() {
  const [entries, setEntries] = useState<EntryWithProfile[]>([]);
  const [statuses, setStatuses] = useState<StatusWithProfile[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [recentEntry, setRecentEntry] = useState<EntryWithProfile | null>(null);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  // Clock tick
  useEffect(() => {
    const tick = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Flash effect for new entries
  useEffect(() => {
    if (recentEntry) {
      const timeout = setTimeout(() => setRecentEntry(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [recentEntry]);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (!membership) return;
      setOrgId(membership.org_id);

      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", membership.org_id)
        .single();
      if (org) setOrgName((org as { name: string }).name);

      // Fetch entries
      const { data: entryData } = await supabase
        .from("time_entries")
        .select("*, profiles(*)")
        .eq("org_id", membership.org_id)
        .eq("date", today)
        .order("created_at", { ascending: false })
        ;
      setEntries(entryData ?? []);

      // Fetch live statuses
      const { data: statusData } = await supabase
        .from("live_status")
        .select("*, profiles(*)")
        .eq("org_id", membership.org_id)
        ;
      setStatuses(statusData ?? []);

      // Real-time
      supabase
        .channel("warroom_entries")
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${membership.org_id}`,
        }, async (payload) => {
          const { data } = await supabase
            .from("time_entries")
            .select("*, profiles(*)")
            .eq("id", payload.new.id)
            .single();
          if (data) {
            const typed = data as unknown as EntryWithProfile;
            setEntries((prev) => [typed, ...prev]);
            setRecentEntry(typed);
          }
        })
        .subscribe();

      supabase
        .channel("warroom_status")
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "live_status",
          filter: `org_id=eq.${membership.org_id}`,
        }, async () => {
          const { data } = await supabase
            .from("live_status")
            .select("*, profiles(*)")
            .eq("org_id", membership.org_id)
            ;
          setStatuses(data ?? []);
        })
        .subscribe();
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stats
  const totalHours = entries.length;
  const uniqueMembers = new Set(entries.map((e) => e.user_id)).size;
  const withProof = entries.filter((e) => e.proof_urls && e.proof_urls.length > 0).length;
  const proofPercent = totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0;
  const onlineCount = statuses.filter((s) => s.status !== "offline").length;
  const deepWorkNow = statuses.filter((s) => s.status === "deep_work").length;

  // Category breakdown
  const catCounts = new Map<WorkCategory, number>();
  for (const e of entries) catCounts.set(e.category, (catCounts.get(e.category) ?? 0) + 1);
  const topCategories = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);

  function goFullscreen() {
    document.documentElement.requestFullscreen?.();
  }

  return (
    <div className="fixed inset-0 bg-gray-950 text-white overflow-hidden z-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{orgName || "Exomagram"}</h1>
            <p className="text-xs text-white/40">War Room — Transparencia en vivo</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-3xl font-mono font-light tracking-wider">
            {format(currentTime, "HH:mm:ss")}
          </span>
          <span className="text-sm text-white/40 capitalize">
            {format(currentTime, "EEEE d MMMM", { locale: es })}
          </span>
          <button onClick={goFullscreen} className="text-white/40 hover:text-white transition-colors">
            <Maximize className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left: Live status + stats */}
        <div className="w-80 border-r border-white/10 p-6 flex flex-col gap-6 overflow-y-auto">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-blue-400">{totalHours}</p>
              <p className="text-[10px] text-white/40 uppercase">Horas hoy</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-green-400">{proofPercent}%</p>
              <p className="text-[10px] text-white/40 uppercase">Con evidencia</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-blue-400">{onlineCount}</p>
              <p className="text-[10px] text-white/40 uppercase">En línea</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-orange-400">{deepWorkNow}</p>
              <p className="text-[10px] text-white/40 uppercase">Deep work</p>
            </div>
          </div>

          {/* Category breakdown */}
          <div>
            <h3 className="text-xs font-semibold text-white/40 uppercase mb-3">Distribución</h3>
            <div className="space-y-2">
              {topCategories.map(([cat, count]) => {
                const percent = Math.round((count / totalHours) * 100);
                return (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-sm">{CATEGORIES[cat].emoji}</span>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="text-xs text-white/60 w-8 text-right">{percent}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live people */}
          <div>
            <h3 className="text-xs font-semibold text-white/40 uppercase mb-3 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              En vivo
            </h3>
            <div className="space-y-2">
              {statuses.map((s) => {
                const config = LIVE_STATUS_CONFIG[s.status];
                return (
                  <div key={s.user_id} className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-all",
                    s.status === "offline" ? "opacity-30" : "bg-white/5"
                  )}>
                    <div className="relative">
                      <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm border border-white/20">
                        <AvatarImage src={s.profiles?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px] bg-gray-800">{getInitials(s.profiles?.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-950", config.dotColor)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{s.profiles?.full_name?.split(" ")[0]}</p>
                      <p className="text-[10px] text-white/40 truncate">
                        {s.current_task || config.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Live feed */}
        <div className="flex-1 p-6 overflow-y-auto">
          <h3 className="text-xs font-semibold text-white/40 uppercase mb-4">Actividad en vivo</h3>

          {/* Flash banner for new entry */}
          {recentEntry && (
            <div className="mb-4 animate-pulse bg-blue-600/20 border border-blue-500/30 rounded-xl p-4">
              <p className="text-sm text-blue-300">
                <span className="font-bold">{recentEntry.profiles?.full_name}</span> acaba de registrar:
              </p>
              <p className="text-lg font-medium mt-1">
                {CATEGORIES[recentEntry.category]?.emoji} {recentEntry.title}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {entries.slice(0, 30).map((entry) => {
              const cat = CATEGORIES[entry.category];
              const hasProof = entry.proof_urls && entry.proof_urls.length > 0;
              return (
                <div key={entry.id} className="flex items-center gap-4 px-4 py-3 bg-white/[0.03] rounded-xl hover:bg-white/[0.06] transition-colors">
                  <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm border border-white/10">
                    <AvatarImage src={entry.profiles?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px] bg-gray-800">{getInitials(entry.profiles?.full_name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-white/30 font-mono w-14">{entry.hour}:00</span>
                  <span className="text-base">{cat?.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{entry.title}</p>
                    <p className="text-[10px] text-white/30">
                      {entry.profiles?.full_name}
                      {entry.is_late && " · ⏰ tardía"}
                    </p>
                  </div>
                  {hasProof ? (
                    <Shield className="w-4 h-4 text-green-400" />
                  ) : (
                    <Shield className="w-4 h-4 text-white/10" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
