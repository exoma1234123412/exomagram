"use client";

// ═══════════════════════════════════════════════════════════════
// FOMO ENGINE — WHILE YOU WERE GONE
// ═══════════════════════════════════════════════════════════════
//
// Generates anxiety about not being connected. When the user
// loads the app after 2+ hours offline, this panel shows
// everything that happened without them: shoutouts, reactions,
// duels, rank changes, achievements, feed items.
//
// Stores last_seen timestamp in localStorage. Queries all
// relevant tables for events since that timestamp.

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import {
  X,
  Trophy,
  Swords,
  TrendingUp,
  TrendingDown,
  Star,
  MessageSquare,
  Megaphone,
  Eye,
  Radio,
} from "lucide-react";
import type { Profile } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FomoItem {
  id: string;
  icon: React.ReactNode;
  text: string;
  variant: "amber" | "red" | "neutral";
  timestamp: string;
}

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "exoma_fomo_last_seen";
const DISMISS_KEY = "exoma_fomo_dismissed";

function getLastSeen(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function setLastSeen(ts: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, ts);
  } catch {
    // localStorage unavailable
  }
}

function wasDismissedRecently(): boolean {
  try {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) return false;
    // Don't re-show for 30 minutes after dismissal
    const diff = Date.now() - parseInt(dismissed, 10);
    return diff < 30 * 60 * 1000;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFirstName(fullName: string | null): string {
  if (!fullName) return "Alguien";
  return fullName.split(" ")[0];
}

function formatTimeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000 / 60;
  if (diff < 1) return "hace 1m";
  if (diff < 60) return `hace ${Math.round(diff)}m`;
  if (diff < 1440) return `hace ${Math.round(diff / 60)}h`;
  return `hace ${Math.round(diff / 1440)}d`;
}

// Two hours in milliseconds
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FomoEngine() {
  const { orgId, userId } = useOrg();
  const supabase = createClient();

  const [items, setItems] = useState<FomoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  const fetchFomoData = useCallback(async () => {
    if (!orgId || !userId) return;

    // Determine the "since" timestamp
    let since = getLastSeen();

    if (!since) {
      // First time: check live_status or last time_entry for this user
      const [liveRes, entryRes] = await Promise.all([
        supabase
          .from("live_status")
          .select("last_heartbeat")
          .eq("user_id", userId)
          .single(),
        supabase
          .from("time_entries")
          .select("logged_at")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .order("logged_at", { ascending: false })
          .limit(1)
          .single(),
      ]);

      const heartbeat = liveRes.data?.last_heartbeat;
      const lastEntry = entryRes.data?.logged_at;

      // Use whichever is most recent
      if (heartbeat && lastEntry) {
        since = new Date(heartbeat) > new Date(lastEntry) ? heartbeat : lastEntry;
      } else {
        since = heartbeat ?? lastEntry ?? null;
      }
    }

    // Update last_seen to now
    setLastSeen(new Date().toISOString());

    if (!since) {
      setLoading(false);
      return;
    }

    // Check if they were offline for 2+ hours
    const offlineMs = Date.now() - new Date(since).getTime();
    if (offlineMs < TWO_HOURS_MS) {
      setLoading(false);
      return;
    }

    // Check if already dismissed recently
    if (wasDismissedRecently()) {
      setLoading(false);
      return;
    }

    // Build name lookup for org members
    const { data: membersRaw } = await supabase
      .from("org_members")
      .select("user_id, profiles(full_name)")
      .eq("org_id", orgId);

    const nameMap = new Map<string, string>();
    for (const m of membersRaw ?? []) {
      const profile = m.profiles as unknown as Profile;
      nameMap.set(m.user_id, getFirstName(profile?.full_name ?? null));
    }

    const getName = (id: string) => nameMap.get(id) ?? "Alguien";

    // Fetch everything that happened since the user was last seen
    const [
      shoutoutsRes,
      reactionsRes,
      duelsRes,
      rankingsRes,
      feedRes,
      achievementsRes,
    ] = await Promise.all([
      // 1. Shoutouts given/received since last activity
      supabase
        .from("shoutouts")
        .select("id, from_user_id, to_user_id, message, category, created_at")
        .eq("org_id", orgId)
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20),

      // 2. Entry reactions (impressive, verified) since last activity
      supabase
        .from("entry_reactions")
        .select("id, user_id, reaction, created_at, time_entries!inner(user_id, org_id, title)")
        .eq("time_entries.org_id", orgId)
        .gt("created_at", since)
        .in("reaction", ["impressive", "verified"])
        .order("created_at", { ascending: false })
        .limit(20),

      // 3. Focus duels created/completed since last activity
      supabase
        .from("focus_duels")
        .select("id, challenger_id, opponent_id, status, winner_id, created_at")
        .eq("org_id", orgId)
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10),

      // 4. Power rankings — latest snapshot
      supabase
        .from("power_rankings")
        .select("user_id, rank, total, updated_at")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(10),

      // 5. Public feed items since last activity
      supabase
        .from("public_feed")
        .select("id, type, title, body, target_user_id, urgency, created_at")
        .eq("org_id", orgId)
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(15),

      // 6. Achievements unlocked by others since last activity
      supabase
        .from("achievements")
        .select("id, user_id, achievement_type, unlocked_at")
        .eq("org_id", orgId)
        .neq("user_id", userId)
        .gt("unlocked_at", since)
        .order("unlocked_at", { ascending: false })
        .limit(10),
    ]);

    const fomoItems: FomoItem[] = [];

    // --- Process shoutouts ---
    for (const s of shoutoutsRes.data ?? []) {
      const from = getName(s.from_user_id);
      const to = getName(s.to_user_id);
      const isAboutUser = s.to_user_id === userId || s.from_user_id === userId;

      fomoItems.push({
        id: `shoutout-${s.id}`,
        icon: <Megaphone className="w-3.5 h-3.5 text-amber-500" />,
        text: isAboutUser
          ? s.to_user_id === userId
            ? `${from} te dio un shoutout: "${s.message}"`
            : `Diste un shoutout a ${to}`
          : `${from} dio un shoutout a ${to}`,
        variant: "amber",
        timestamp: s.created_at,
      });
    }

    // --- Process reactions ---
    for (const r of reactionsRes.data ?? []) {
      const reactor = getName(r.user_id);
      const entry = r.time_entries as unknown as { user_id: string; title: string };
      const entryOwner = getName(entry?.user_id ?? "");
      const isImpressive = r.reaction === "impressive";

      fomoItems.push({
        id: `reaction-${r.id}`,
        icon: isImpressive
          ? <Star className="w-3.5 h-3.5 text-amber-500" />
          : <Eye className="w-3.5 h-3.5 text-muted-foreground" />,
        text: isImpressive
          ? `${reactor} marco como notable el trabajo de ${entryOwner}`
          : `${reactor} verifico una entrada de ${entryOwner}`,
        variant: isImpressive ? "amber" : "neutral",
        timestamp: r.created_at,
      });
    }

    // --- Process duels ---
    for (const d of duelsRes.data ?? []) {
      const challenger = getName(d.challenger_id);
      const opponent = getName(d.opponent_id);

      if (d.status === "completed" && d.winner_id) {
        const winner = getName(d.winner_id);
        const loser = d.winner_id === d.challenger_id ? opponent : challenger;
        fomoItems.push({
          id: `duel-done-${d.id}`,
          icon: <Swords className="w-3.5 h-3.5 text-amber-500" />,
          text: `${winner} derroto a ${loser} en un duelo de focus`,
          variant: "amber",
          timestamp: d.created_at,
        });
      } else if (d.status === "pending" || d.status === "active") {
        fomoItems.push({
          id: `duel-open-${d.id}`,
          icon: <Swords className="w-3.5 h-3.5 text-amber-500" />,
          text: d.status === "active"
            ? `Duelo en curso: ${challenger} vs ${opponent}`
            : `${challenger} reto a ${opponent} a un duelo`,
          variant: "amber",
          timestamp: d.created_at,
        });
      }
    }

    // --- Process rank changes ---
    // Find the user's current rank vs others
    const rankings = rankingsRes.data ?? [];
    const userRank = rankings.find((r) => r.user_id === userId);
    if (userRank && rankings.length > 1) {
      // Find who is above the user now
      const aboveUser = rankings
        .filter((r) => r.user_id !== userId && r.rank < (userRank.rank ?? 999))
        .sort((a, b) => a.rank - b.rank);

      if (aboveUser.length > 0) {
        const top = aboveUser[0];
        fomoItems.push({
          id: `rank-above-${top.user_id}`,
          icon: <TrendingUp className="w-3.5 h-3.5 text-amber-500" />,
          text: `${getName(top.user_id)} esta en #${top.rank} en el ranking. Tu estas en #${userRank.rank}.`,
          variant: userRank.rank > 3 ? "red" : "amber",
          timestamp: top.updated_at,
        });
      }

      // Check if user dropped (rank > 1)
      if (userRank.rank > 1) {
        const topOne = rankings.find((r) => r.rank === 1);
        if (topOne && topOne.user_id !== userId) {
          fomoItems.push({
            id: `rank-top-${topOne.user_id}`,
            icon: <Trophy className="w-3.5 h-3.5 text-amber-500" />,
            text: `${getName(topOne.user_id)} es el #1 del equipo`,
            variant: "amber",
            timestamp: topOne.updated_at,
          });
        }
      }
    }

    // --- Process feed items ---
    for (const f of feedRes.data ?? []) {
      const target = f.target_user_id ? getName(f.target_user_id) : null;
      const isHighUrgency = f.urgency === "high" || f.urgency === "critical";

      fomoItems.push({
        id: `feed-${f.id}`,
        icon: <Radio className="w-3.5 h-3.5 text-muted-foreground" />,
        text: target ? `${f.title} — ${target}` : f.title,
        variant: isHighUrgency ? "red" : "neutral",
        timestamp: f.created_at,
      });
    }

    // --- Process achievements ---
    for (const a of achievementsRes.data ?? []) {
      const who = getName(a.user_id);
      fomoItems.push({
        id: `achievement-${a.id}`,
        icon: <Trophy className="w-3.5 h-3.5 text-amber-500" />,
        text: `${who} desbloqueo el logro "${a.achievement_type}"`,
        variant: "amber",
        timestamp: a.unlocked_at,
      });
    }

    // Sort by timestamp descending
    fomoItems.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Deduplicate by id
    const seen = new Set<string>();
    const deduped = fomoItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    setItems(deduped);
    setVisible(deduped.length > 0);
    setLoading(false);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId || !userId) return;
    fetchFomoData();
  }, [orgId, userId, fetchFomoData]);

  // --- Dismiss handler ---
  function handleDismiss() {
    markDismissed();
    setVisible(false);
  }

  // --- Don't render ---
  if (loading || !visible || items.length === 0) return null;

  const missedCount = items.length;
  const amberCount = items.filter((i) => i.variant === "amber").length;
  const redCount = items.filter((i) => i.variant === "red").length;

  return (
    <div className="border border-amber-500/20 bg-amber-950/5 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-amber-500" />
            <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-amber-500">
              Mientras estabas offline
            </span>
          </div>
          <span className="font-mono tabular-nums text-xl font-bold text-amber-400">
            {missedCount}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {missedCount === 1 ? "cosa paso" : "cosas pasaron"} sin ti
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="font-mono text-[9px] text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
        >
          Cerrar
        </button>
      </div>

      {/* Summary badges */}
      {(amberCount > 0 || redCount > 0) && (
        <div className="flex items-center gap-3 mb-3">
          {amberCount > 0 && (
            <span className="font-mono text-[10px] text-amber-500">
              {amberCount} oportunidad{amberCount !== 1 ? "es" : ""}
            </span>
          )}
          {redCount > 0 && (
            <span className="font-mono text-[10px] text-red-400">
              {redCount} alerta{redCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="h-px w-full bg-amber-500/10 mb-3" />

      {/* Scrollable list */}
      <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2 py-1.5"
          >
            <div className="mt-0.5 shrink-0">{item.icon}</div>
            <div className="flex-1 min-w-0">
              <p
                className={
                  item.variant === "red"
                    ? "font-mono text-[11px] text-red-400"
                    : item.variant === "amber"
                    ? "font-mono text-[11px] text-amber-400/90"
                    : "font-mono text-[11px] text-muted-foreground"
                }
              >
                {item.text}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground tabular-nums">
              {formatTimeAgo(item.timestamp)}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="h-px w-full bg-amber-500/10 mt-3 mb-2" />
      <p className="font-mono text-[9px] text-muted-foreground text-center">
        La proxima vez, no te desconectes.
      </p>
    </div>
  );
}
