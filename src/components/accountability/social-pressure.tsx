"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import { Trophy, TrendingDown, Flame } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// PSYCHOLOGICAL TECHNIQUE: Social Comparison + Relative Deprivation
// ═══════════════════════════════════════════════════════════════
//
// People don't care about absolute numbers.
// They care about how they compare to OTHERS.
//
// "You logged 6 hours" = meh
// "You logged 6 hours. Everyone else logged 8+." = panic
//
// This widget shows:
// - Who's ahead of you TODAY (makes you want to catch up)
// - Who's behind you (makes you not want to fall there)
// - Your rank changes in real-time (dopamine from climbing, cortisol from falling)

interface MemberRank {
  profile: Profile;
  hours: number;
  proofPercent: number;
  isYou: boolean;
}

export function SocialPressureWidget({ orgId }: { orgId: string }) {
  const [ranks, setRanks] = useState<MemberRank[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        ;

      const { data: entries } = await supabase
        .from("time_entries")
        .select("user_id, proof_urls")
        .eq("org_id", orgId)
        .eq("date", today);

      if (!members) return;

      const memberRanks: MemberRank[] = members.map((m) => {
        const userEntries = (entries ?? []).filter((e) => e.user_id === m.user_id);
        const withProof = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
        return {
          profile: m.profiles,
          hours: userEntries.length,
          proofPercent: userEntries.length > 0 ? Math.round((withProof.length / userEntries.length) * 100) : 0,
          isYou: m.user_id === user.id,
        };
      });

      memberRanks.sort((a, b) => b.hours - a.hours || b.proofPercent - a.proofPercent);
      setRanks(memberRanks);
    }
    load();

    // Refresh every 2 minutes for real-time pressure
    const interval = setInterval(load, 120_000);
    return () => clearInterval(interval);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ranks.length < 2) return null;

  const myRank = ranks.findIndex((r) => r.isYou);
  const isFirst = myRank === 0;
  const isLast = myRank === ranks.length - 1;
  const myHours = ranks[myRank]?.hours ?? 0;
  const leaderHours = ranks[0]?.hours ?? 0;
  const gap = leaderHours - myHours;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-yellow-500" />
        <h3 className="text-sm font-semibold">Ranking en vivo</h3>
        {isFirst && <span className="text-[10px] text-green-600 font-semibold ml-auto">Vas primero</span>}
        {isLast && <span className="text-[10px] text-red-600 font-semibold ml-auto animate-pulse">Vas último</span>}
        {!isFirst && !isLast && gap > 0 && (
          <span className="text-[10px] text-yellow-600 font-semibold ml-auto">{gap}h detrás del líder</span>
        )}
      </div>

      <div className="space-y-1.5">
        {ranks.map((r, i) => (
          <div
            key={r.profile.id}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl transition-all",
              r.isYou && "bg-primary/5 border border-primary/20 shadow-sm",
              !r.isYou && "bg-accent/30",
              r.isYou && isLast && "bg-red-50 dark:bg-red-950/10 border-red-200 dark:border-red-800",
            )}
          >
            <span className={cn(
              "text-sm font-bold w-5 text-center",
              i === 0 ? "text-yellow-500" : i === ranks.length - 1 ? "text-red-500" : "text-muted-foreground"
            )}>
              {i + 1}
            </span>
            <Avatar className="w-6 h-6">
              <AvatarImage src={r.profile.avatar_url ?? undefined} />
              <AvatarFallback className="text-[9px]">{getInitials(r.profile.full_name)}</AvatarFallback>
            </Avatar>
            <span className={cn("text-sm flex-1 truncate", r.isYou && "font-bold")}>
              {r.profile.full_name?.split(" ")[0] ?? "?"}
              {r.isYou && " (tú)"}
            </span>
            <span className="text-sm font-bold tabular-nums">{r.hours}h</span>
            <span className={cn(
              "text-[10px] tabular-nums w-10 text-right",
              r.proofPercent >= 80 ? "text-green-600" : "text-muted-foreground"
            )}>
              {r.proofPercent}%
            </span>
          </div>
        ))}
      </div>

      {/* Motivational message based on position */}
      {isLast && myHours < leaderHours && (
        <p className="text-[10px] text-red-600 mt-2 text-center font-medium animate-pulse">
          Estás en último lugar. {ranks[0].profile.full_name?.split(" ")[0]} lleva {gap}h más que tú.
        </p>
      )}
      {myRank === 1 && gap <= 1 && (
        <p className="text-[10px] text-yellow-600 mt-2 text-center">
          Solo {gap}h para el primer lugar. Una hora más y lo alcanzas.
        </p>
      )}
    </div>
  );
}
