"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  LiveStatus,
  TimeEntry,
  TrustScoreHistory,
} from "@/lib/types/database";
import { EXPECTED_DAILY_HOURS, LIVE_STATUS_CONFIG } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import {
  Users,
  Heart,
  Handshake,
  AlertTriangle,
  Trophy,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// ACCOUNTABILITY BUDDY — Forced pairing system
// ═══════════════════════════════════════════════════════════════
//
// Inspired by: Military battle buddy system, AA sponsors, workout partners.
//
// Two people are mutually accountable for each other's performance.
// If one fails, the other sees it. If both succeed, both are celebrated.
// If both fail, the shame is public.
//
// Psychological levers:
// - You can't let your buddy down (obligation)
// - Your buddy's failure reflects on you (shared fate)
// - Consecutive duo streaks create commitment escalation
// - Monthly buddy-lock prevents gaming by switching partners

// ─── Types ───────────────────────────────────────────────────

interface BuddyPairing {
  buddyUserId: string;
  pairedAt: string; // ISO date
  lastChangedAt: string; // ISO date — used to enforce monthly lock
}

interface BuddyData {
  profile: Profile;
  liveStatus: LiveStatus | null;
  hoursToday: number;
  hoursWithProofToday: number;
  proofRate: number;
  trustScore: number;
  yesterdayCompleted: boolean;
}

interface BuddyPairLeaderboardEntry {
  user1: Profile;
  user2: Profile;
  combinedScore: number;
  duoStreak: number;
}

type QuickMessage = "como_vas" | "animo" | "custom";

const QUICK_MESSAGES: Record<QuickMessage, string> = {
  como_vas: "¿Cómo vas hoy?",
  animo: "¡Ánimo, tú puedes!",
  custom: "",
};

// ─── Helpers ─────────────────────────────────────────────────

function firstName(name: string | null) {
  if (!name) return "?";
  return name.split(" ")[0];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function getBarWidth(hours: number): number {
  return Math.min((hours / EXPECTED_DAILY_HOURS) * 100, 100);
}

function getBarColor(hours: number): string {
  const ratio = hours / EXPECTED_DAILY_HOURS;
  if (ratio >= 1) return "bg-green-500";
  if (ratio >= 0.75) return "bg-blue-500";
  if (ratio >= 0.5) return "bg-yellow-500";
  if (ratio >= 0.25) return "bg-orange-500";
  return "bg-red-500";
}

function storageKey(orgId: string, userId: string) {
  return `exomagram_buddy_${orgId}_${userId}`;
}

function checkinStorageKey(orgId: string, userId: string) {
  return `exomagram_buddy_checkin_${orgId}_${userId}_${todayISO()}`;
}

function duoStreakKey(orgId: string,
  user1: string,
  user2: string
) {
  const sorted = [user1, user2].sort().join("_");
  return `exomagram_duo_streak_${orgId}_${sorted}`;
}

// ─── Storage helpers ─────────────────────────────────────────

function loadPairing(orgId: string, userId: string): BuddyPairing | null {
  try {
    const raw = localStorage.getItem(storageKey(orgId, userId));
    if (!raw) return null;
    return JSON.parse(raw) as BuddyPairing;
  } catch {
    return null;
  }
}

function savePairing(orgId: string, userId: string, pairing: BuddyPairing) {
  localStorage.setItem(storageKey(orgId, userId), JSON.stringify(pairing));
}

function loadDuoStreak(orgId: string, user1: string, user2: string): number {
  try {
    const raw = localStorage.getItem(duoStreakKey(orgId, user1, user2));
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return parsed.streak ?? 0;
  } catch {
    return 0;
  }
}

function saveDuoStreak(
  orgId: string,
  user1: string,
  user2: string,
  streak: number,
  lastDate: string
) {
  localStorage.setItem(
    duoStreakKey(orgId, user1, user2),
    JSON.stringify({ streak, lastDate })
  );
}

function hasCheckedInToday(orgId: string, userId: string): boolean {
  try {
    return localStorage.getItem(checkinStorageKey(orgId, userId)) === "true";
  } catch {
    return false;
  }
}

function markCheckedIn(orgId: string, userId: string) {
  localStorage.setItem(checkinStorageKey(orgId, userId), "true");
}

function canChangeBuddy(pairing: BuddyPairing | null): boolean {
  if (!pairing) return true;
  return daysSince(pairing.lastChangedAt) >= 30;
}

function daysUntilChange(pairing: BuddyPairing | null): number {
  if (!pairing) return 0;
  return Math.max(0, 30 - daysSince(pairing.lastChangedAt));
}

// ─── Component ───────────────────────────────────────────────

export function AccountabilityBuddy({ orgId: orgIdProp }: { orgId?: string } = {}) {
  const supabase = createClient();

  const orgIdRef = useRef<string>(orgIdProp ?? "");
  const [orgId, setOrgId] = useState<string>(orgIdProp ?? "");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myData, setMyData] = useState<BuddyData | null>(null);
  const [buddyData, setBuddyData] = useState<BuddyData | null>(null);
  const [pairing, setPairing] = useState<BuddyPairing | null>(null);
  const [allPairs, setAllPairs] = useState<BuddyPairLeaderboardEntry[]>([]);
  const [duoStreak, setDuoStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCheckin, setShowCheckin] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [checkedIn, setCheckedIn] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [changingBuddy, setChangingBuddy] = useState(false);

  const today = todayISO();
  const yesterday = yesterdayISO();

  // ─── Auto-pair logic ─────────────────────────────────────

  const findBestBuddy = useCallback(
    async (
      userId: string,
      members: { user_id: string; profiles: Profile }[],
      trustScores: TrustScoreHistory[]
    ): Promise<string | null> => {
      const others = members.filter((m) => m.user_id !== userId);
      if (others.length === 0) return null;

      const myProfile = members.find((m) => m.user_id === userId)?.profiles;
      const myRole = myProfile?.role?.toLowerCase() ?? "";
      const myTrust =
        trustScores.find((t) => t.user_id === userId)?.score ?? 50;

      // Score each candidate: prefer same role, closest trust score
      let best: { userId: string; score: number } | null = null;

      for (const other of others) {
        let matchScore = 0;
        const otherRole = other.profiles.role?.toLowerCase() ?? "";
        const otherTrust =
          trustScores.find((t) => t.user_id === other.user_id)?.score ?? 50;

        // Role similarity: exact match = 100, partial match = 50
        if (myRole && otherRole) {
          if (myRole === otherRole) {
            matchScore += 100;
          } else if (
            myRole.includes(otherRole) ||
            otherRole.includes(myRole)
          ) {
            matchScore += 50;
          }
        }

        // Trust score proximity: closer = better (max 100)
        const trustDiff = Math.abs(myTrust - otherTrust);
        matchScore += Math.max(0, 100 - trustDiff);

        if (!best || matchScore > best.score) {
          best = { userId: other.user_id, score: matchScore };
        }
      }

      return best?.userId ?? others[0].user_id;
    },
    []
  );

  // ─── Load data ───────────────────────────────────────────

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    // Auto-fetch orgId if not provided
    let resolvedOrgId = orgIdRef.current;
    if (!resolvedOrgId) {
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (!membership) { setLoading(false); return; }
      resolvedOrgId = membership.org_id as string;
      orgIdRef.current = resolvedOrgId;
      setOrgId(resolvedOrgId);
    }

    // Fetch org data in parallel
    const [membersRes, entriesRes, yesterdayEntriesRes, statusRes, trustRes] =
      await Promise.all([
        supabase
          .from("org_members")
          .select("user_id, profiles(*)")
          .eq("org_id", resolvedOrgId)
          ,
        supabase
          .from("time_entries")
          .select("user_id, hour, proof_urls")
          .eq("org_id", resolvedOrgId)
          .eq("date", today),
        supabase
          .from("time_entries")
          .select("user_id, hour, proof_urls")
          .eq("org_id", resolvedOrgId)
          .eq("date", yesterday),
        supabase
          .from("live_status")
          .select("*")
          .eq("org_id", resolvedOrgId)
          ,
        supabase
          .from("trust_score_history")
          .select("*")
          .eq("org_id", resolvedOrgId)
          .order("date", { ascending: false })
          ,
      ]);

    const members = membersRes.data ?? [];
    const entries = entriesRes.data ?? [];
    const yesterdayEntries = yesterdayEntriesRes.data ?? [];
    const statuses = statusRes.data ?? [];
    const trustScores = trustRes.data ?? [];

    // Dedup trust scores — keep only latest per user
    const latestTrust = new Map<string, TrustScoreHistory>();
    for (const t of trustScores) {
      if (!latestTrust.has(t.user_id)) {
        latestTrust.set(t.user_id, t);
      }
    }

    // Status map
    const statusMap = new Map<string, LiveStatus>();
    for (const s of statuses) {
      statusMap.set(s.user_id, s);
    }

    // Helper: build BuddyData for a user
    function buildBuddyData(userId: string): BuddyData | null {
      const member = members.find((m) => m.user_id === userId);
      if (!member) return null;

      const userEntries = entries.filter((e) => e.user_id === userId);
      const withProof = userEntries.filter(
        (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
      );
      const yesterdayUserEntries = yesterdayEntries.filter(
        (e) => e.user_id === userId
      );
      const yesterdayHours = yesterdayUserEntries.length;

      return {
        profile: member.profiles,
        liveStatus: statusMap.get(userId) ?? null,
        hoursToday: userEntries.length,
        hoursWithProofToday: withProof.length,
        proofRate:
          userEntries.length > 0 ? withProof.length / userEntries.length : 0,
        trustScore: latestTrust.get(userId)?.score ?? 50,
        yesterdayCompleted: yesterdayHours >= EXPECTED_DAILY_HOURS,
      };
    }

    // Check or create pairing
    let currentPairing = loadPairing(orgId, user.id);

    // Validate pairing — buddy must still be in org
    if (currentPairing) {
      const buddyStillInOrg = members.some(
        (m) => m.user_id === currentPairing!.buddyUserId
      );
      if (!buddyStillInOrg) {
        currentPairing = null;
      }
    }

    if (!currentPairing) {
      const buddyId = await findBestBuddy(
        user.id,
        members,
        Array.from(latestTrust.values())
      );
      if (buddyId) {
        currentPairing = {
          buddyUserId: buddyId,
          pairedAt: new Date().toISOString(),
          lastChangedAt: new Date().toISOString(),
        };
        savePairing(orgId, user.id, currentPairing);
        // Also save reverse pairing so buddy sees you
        const reversePairing: BuddyPairing = {
          buddyUserId: user.id,
          pairedAt: currentPairing.pairedAt,
          lastChangedAt: currentPairing.lastChangedAt,
        };
        savePairing(orgId, buddyId, reversePairing);
      }
    }

    setPairing(currentPairing);

    // Build my data
    const me = buildBuddyData(user.id);
    setMyData(me);

    // Build buddy data
    if (currentPairing) {
      const buddy = buildBuddyData(currentPairing.buddyUserId);
      setBuddyData(buddy);

      // Load duo streak
      const streak = loadDuoStreak(
        orgId,
        user.id,
        currentPairing.buddyUserId
      );

      // Check yesterday completion to update streak
      if (me && buddy) {
        const bothCompletedYesterday =
          me.yesterdayCompleted && buddy.yesterdayCompleted;
        const storedRaw = localStorage.getItem(
          duoStreakKey(orgId, user.id, currentPairing.buddyUserId)
        );
        const stored = storedRaw ? JSON.parse(storedRaw) : null;
        const lastStreakDate = stored?.lastDate ?? "";

        if (lastStreakDate !== yesterday) {
          if (bothCompletedYesterday) {
            const newStreak = streak + 1;
            saveDuoStreak(
              orgId,
              user.id,
              currentPairing.buddyUserId,
              newStreak,
              yesterday
            );
            setDuoStreak(newStreak);
          } else if (lastStreakDate) {
            // Streak broken
            saveDuoStreak(
              orgId,
              user.id,
              currentPairing.buddyUserId,
              0,
              yesterday
            );
            setDuoStreak(0);
          }
        } else {
          setDuoStreak(streak);
        }
      }
    }

    // Check-in status
    setCheckedIn(hasCheckedInToday(orgId, user.id));

    // Build leaderboard of all buddy pairs
    const pairsMap = new Map<string, BuddyPairLeaderboardEntry>();
    for (const m of members) {
      const mPairing = loadPairing(orgId, m.user_id);
      if (!mPairing) continue;
      const key = [m.user_id, mPairing.buddyUserId].sort().join("_");
      if (pairsMap.has(key)) continue;

      const buddyMember = members.find(
        (mm) => mm.user_id === mPairing.buddyUserId
      );
      if (!buddyMember) continue;

      const t1 = latestTrust.get(m.user_id)?.score ?? 50;
      const t2 = latestTrust.get(mPairing.buddyUserId)?.score ?? 50;
      const pairStreak = loadDuoStreak(
        orgId,
        m.user_id,
        mPairing.buddyUserId
      );

      pairsMap.set(key, {
        user1: m.profiles,
        user2: buddyMember.profiles,
        combinedScore: Math.round((t1 + t2) / 2),
        duoStreak: pairStreak,
      });
    }

    const pairsArr = Array.from(pairsMap.values());
    pairsArr.sort(
      (a, b) =>
        b.combinedScore - a.combinedScore || b.duoStreak - a.duoStreak
    );
    setAllPairs(pairsArr);

    setLoading(false);
  }, [today, yesterday]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Initial load + realtime ─────────────────────────────

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("buddy_rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_status",
          filter: `org_id=eq.${orgId}`,
        },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived values ──────────────────────────────────────

  const sharedAccountabilityScore = useMemo(() => {
    if (!myData || !buddyData) return 0;
    return Math.round((myData.trustScore + buddyData.trustScore) / 2);
  }, [myData, buddyData]);

  const buddyBehind = useMemo(() => {
    if (!myData || !buddyData) return false;
    return buddyData.hoursToday < myData.hoursToday && buddyData.hoursToday < EXPECTED_DAILY_HOURS;
  }, [myData, buddyData]);

  const iAmBehind = useMemo(() => {
    if (!myData || !buddyData) return false;
    return myData.hoursToday < buddyData.hoursToday && myData.hoursToday < EXPECTED_DAILY_HOURS;
  }, [myData, buddyData]);

  const bothCompleted = useMemo(() => {
    if (!myData || !buddyData) return false;
    return (
      myData.hoursToday >= EXPECTED_DAILY_HOURS &&
      buddyData.hoursToday >= EXPECTED_DAILY_HOURS &&
      myData.proofRate > 0 &&
      buddyData.proofRate > 0
    );
  }, [myData, buddyData]);

  const bothFailed = useMemo(() => {
    if (!myData || !buddyData) return false;
    const hour = new Date().getHours();
    if (hour < 18) return false; // Don't flag before 6pm
    return (
      myData.hoursToday < EXPECTED_DAILY_HOURS &&
      buddyData.hoursToday < EXPECTED_DAILY_HOURS
    );
  }, [myData, buddyData]);

  const buddyFailedYesterday = useMemo(() => {
    if (!buddyData) return false;
    return !buddyData.yesterdayCompleted;
  }, [buddyData]);

  // ─── Handlers ────────────────────────────────────────────

  const handleSendMessage = (type: QuickMessage) => {
    if (!currentUserId) return;
    const message =
      type === "custom" ? customMessage : QUICK_MESSAGES[type];
    if (!message.trim()) return;

    // Store the check-in notification for buddy to see
    if (buddyData) {
      const notifKey = `exomagram_buddy_notif_${orgId}_${buddyData.profile.id}_${todayISO()}`;
      const existing = localStorage.getItem(notifKey);
      const notifs = existing ? JSON.parse(existing) : [];
      notifs.push({
        from: myData?.profile.full_name ?? "Tu buddy",
        message,
        sentAt: new Date().toISOString(),
      });
      localStorage.setItem(notifKey, JSON.stringify(notifs));
    }

    markCheckedIn(orgId, currentUserId);
    setCheckedIn(true);
    setShowCheckin(false);
    setCustomMessage("");
  };

  const handleChangeBuddy = async () => {
    if (!currentUserId || !pairing || !canChangeBuddy(pairing)) return;
    setChangingBuddy(true);

    // Remove current pairing and re-pair
    localStorage.removeItem(storageKey(orgId, currentUserId));
    localStorage.removeItem(storageKey(orgId, pairing.buddyUserId));
    setPairing(null);
    setBuddyData(null);

    // Reload — will auto-pair with next best match
    await loadData();
    setChangingBuddy(false);
  };

  // ─── Buddy notification check ────────────────────────────

  const buddyNotifications = useMemo(() => {
    if (!currentUserId) return [];
    try {
      const notifKey = `exomagram_buddy_notif_${orgId}_${currentUserId}_${todayISO()}`;
      const raw = localStorage.getItem(notifKey);
      if (!raw) return [];
      return JSON.parse(raw) as { from: string; message: string; sentAt: string }[];
    } catch {
      return [];
    }
  }, [orgId, currentUserId]);

  // ─── Render helpers ──────────────────────────────────────

  function renderStatusDot(status: LiveStatus | null) {
    const statusType = status?.status ?? "offline";
    const config = LIVE_STATUS_CONFIG[statusType];
    return (
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "w-2 h-2 rounded-full",
            config.dotColor,
            statusType === "online" && "animate-pulse"
          )}
        />
        <span className={cn("text-[10px] font-medium", config.color)}>
          {config.label}
        </span>
      </div>
    );
  }

  function renderComparisonBar(
    label: string,
    myValue: number,
    buddyValue: number,
    max: number,
    suffix: string = ""
  ) {
    const myWidth = Math.min((myValue / max) * 100, 100);
    const buddyWidth = Math.min((buddyValue / max) * 100, 100);
    const myAhead = myValue >= buddyValue;

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{label}</span>
          <span className="text-[10px] font-bold tabular-nums">
            {myValue}{suffix} vs {buddyValue}{suffix}
          </span>
        </div>
        <div className="flex gap-1 items-center">
          {/* My bar */}
          <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                myAhead ? "bg-green-500" : "bg-red-400"
              )}
              style={{ width: `${myWidth}%` }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground w-5 text-center">
            vs
          </span>
          {/* Buddy bar */}
          <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                !myAhead ? "bg-green-500" : "bg-blue-400"
              )}
              style={{ width: `${buddyWidth}%` }}
            />
          </div>
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>Tú</span>
          <span>{firstName(buddyData?.profile.full_name ?? null)}</span>
        </div>
      </div>
    );
  }

  // ─── Loading state ───────────────────────────────────────

  if (loading) {
    return (
      <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardContent className="p-5">
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 animate-pulse" />
            <p className="text-xs text-muted-foreground animate-pulse">
              Buscando tu buddy...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── No buddy found ──────────────────────────────────────

  if (!buddyData || !myData || !pairing) {
    return (
      <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardContent className="p-5">
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <p className="text-sm font-medium text-center">
              No hay suficientes miembros para asignar un buddy
            </p>
            <p className="text-xs text-muted-foreground text-center">
              Invita a alguien a la organización para activar el sistema de buddies
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Main render ─────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Buddy Card ─────────────────────────────────────── */}
      <Card
        className={cn(
          "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
          bothFailed && "border-red-400 dark:border-red-700",
          bothCompleted && "border-green-400 dark:border-green-700"
        )}
      >
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Handshake className="w-4 h-4 text-primary" />
            <CardTitle>Accountability Buddy</CardTitle>
          </div>
          <CardAction>
            <div className="flex items-center gap-2">
              {duoStreak > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-2 py-0 h-5 gap-1 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20"
                >
                  <Trophy className="w-3 h-3" />
                  Racha de duo: {duoStreak} días
                </Badge>
              )}
              {bothCompleted && (
                <Badge className="text-[10px] px-2 py-0 h-5 gap-1 bg-green-600 hover:bg-green-700 text-white">
                  Duo Imparable 🤝
                </Badge>
              )}
              {bothFailed && (
                <Badge className="text-[10px] px-2 py-0 h-5 gap-1 bg-red-600 hover:bg-red-700 text-white">
                  Par en crisis
                </Badge>
              )}
            </div>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ── Buddy info + status ──────────────────────── */}
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12 ring-2 ring-background shadow-sm">
              <AvatarImage src={buddyData.profile.avatar_url ?? undefined} />
              <AvatarFallback className="text-sm font-semibold">
                {getInitials(buddyData.profile.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold truncate">
                  {buddyData.profile.full_name ?? "Sin nombre"}
                </span>
                <Heart className="w-3.5 h-3.5 text-pink-500 shrink-0" />
              </div>
              {buddyData.profile.role && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {buddyData.profile.role}
                </p>
              )}
              {renderStatusDot(buddyData.liveStatus)}
            </div>
            <div className="text-right shrink-0">
              <div className="bg-accent/40 rounded-xl px-3 py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                  Score compartido
                </p>
                <p
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    sharedAccountabilityScore >= 80
                      ? "text-green-600"
                      : sharedAccountabilityScore >= 60
                        ? "text-yellow-600"
                        : "text-red-600"
                  )}
                >
                  {sharedAccountabilityScore}
                </p>
              </div>
            </div>
          </div>

          {/* ── Buddy failed yesterday warning ───────────── */}
          {buddyFailedYesterday && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-xs font-medium text-destructive">
                Tu buddy falló ayer — no completó sus {EXPECTED_DAILY_HOURS}h
              </p>
            </div>
          )}

          {/* ── Buddy notifications from buddy ───────────── */}
          {buddyNotifications.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2 space-y-1">
              <p className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                Mensaje de tu buddy
              </p>
              {buddyNotifications.map((n, i) => (
                <p key={i} className="text-xs text-blue-800 dark:text-blue-300">
                  <MessageSquare className="w-3 h-3 inline mr-1" />
                  {n.message}
                </p>
              ))}
            </div>
          )}

          {/* ── Comparison bars ──────────────────────────── */}
          <div className="space-y-3">
            {renderComparisonBar(
              "Horas hoy",
              myData.hoursToday,
              buddyData.hoursToday,
              EXPECTED_DAILY_HOURS,
              "h"
            )}
            {renderComparisonBar(
              "Tasa de evidencia",
              Math.round(myData.proofRate * 100),
              Math.round(buddyData.proofRate * 100),
              100,
              "%"
            )}
            {renderComparisonBar(
              "Trust Score",
              myData.trustScore,
              buddyData.trustScore,
              100,
              ""
            )}
          </div>

          {/* ── Contextual pressure messages ──────────────── */}
          {buddyBehind && (
            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-xl px-3 py-2">
              <p className="text-xs font-medium text-yellow-800 dark:text-yellow-300">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                Tu buddy necesita ayuda — solo lleva{" "}
                <span className="font-bold">{buddyData.hoursToday}h</span>
              </p>
            </div>
          )}

          {iAmBehind && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
              <p className="text-xs font-medium text-red-800 dark:text-red-300">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                No decepciones a{" "}
                <span className="font-bold">
                  {firstName(buddyData.profile.full_name)}
                </span>{" "}
                — lleva{" "}
                <span className="font-bold">{buddyData.hoursToday}h</span>{" "}
                y tú solo{" "}
                <span className="font-bold">{myData.hoursToday}h</span>
              </p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex-wrap gap-2">
          {/* ── Buddy check-in ───────────────────────────── */}
          {!checkedIn ? (
            <div className="flex items-center gap-2 flex-wrap w-full">
              {!showCheckin ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs gap-1.5"
                  onClick={() => setShowCheckin(true)}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Enviar ánimo a tu buddy
                </Button>
              ) : (
                <div className="flex flex-wrap gap-2 w-full">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs"
                    onClick={() => handleSendMessage("como_vas")}
                  >
                    ¿Cómo vas hoy?
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs"
                    onClick={() => handleSendMessage("animo")}
                  >
                    ¡Ánimo!
                  </Button>
                  <div className="flex gap-1 flex-1 min-w-[160px]">
                    <input
                      type="text"
                      placeholder="Mensaje personalizado..."
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customMessage.trim()) {
                          handleSendMessage("custom");
                        }
                      }}
                      className="flex-1 text-xs rounded-xl border border-input bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <Button
                      variant="default"
                      size="sm"
                      className="rounded-xl text-xs"
                      disabled={!customMessage.trim()}
                      onClick={() => handleSendMessage("custom")}
                    >
                      Enviar
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl text-xs text-muted-foreground"
                    onClick={() => setShowCheckin(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">
              ✓ Check-in enviado hoy
            </p>
          )}

          {/* ── Spacer ───────────────────────────────────── */}
          <div className="flex-1" />

          {/* ── Change buddy ─────────────────────────────── */}
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl text-xs text-muted-foreground gap-1"
            disabled={!canChangeBuddy(pairing) || changingBuddy}
            onClick={handleChangeBuddy}
            title={
              canChangeBuddy(pairing)
                ? "Solicitar nuevo buddy"
                : `Podrás cambiar en ${daysUntilChange(pairing)} días`
            }
          >
            <RefreshCw
              className={cn(
                "w-3.5 h-3.5",
                changingBuddy && "animate-spin"
              )}
            />
            {canChangeBuddy(pairing)
              ? "Cambiar buddy"
              : `Bloqueado ${daysUntilChange(pairing)}d`}
          </Button>
        </CardFooter>
      </Card>

      {/* ── Buddy Leaderboard ──────────────────────────────── */}
      <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowLeaderboard(!showLeaderboard)}>
            <Users className="w-4 h-4 text-primary" />
            <CardTitle>Leaderboard de Buddies</CardTitle>
          </div>
          <CardAction>
            <Badge variant="outline" className="text-[10px] px-2 py-0 h-5">
              {allPairs.length} {allPairs.length === 1 ? "par" : "pares"}
            </Badge>
          </CardAction>
        </CardHeader>

        {showLeaderboard && (
          <CardContent>
            {allPairs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No hay pares formados aún
              </p>
            ) : (
              <div className="space-y-2">
                {allPairs.map((pair, index) => {
                  const rank = index + 1;
                  const isMyPair =
                    currentUserId &&
                    (pair.user1.id === currentUserId ||
                      pair.user2.id === currentUserId);

                  return (
                    <div
                      key={`${pair.user1.id}_${pair.user2.id}`}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200",
                        "hover:bg-accent/30",
                        isMyPair && "bg-primary/5 ring-1 ring-primary/20"
                      )}
                    >
                      {/* Rank */}
                      <span
                        className={cn(
                          "text-xs font-bold tabular-nums w-6 text-center shrink-0",
                          rank === 1
                            ? "text-yellow-600"
                            : rank === 2
                              ? "text-gray-500"
                              : rank === 3
                                ? "text-amber-700"
                                : "text-muted-foreground"
                        )}
                      >
                        #{rank}
                      </span>

                      {/* Avatars */}
                      <div className="flex -space-x-2 shrink-0">
                        <Avatar className="w-7 h-7 ring-2 ring-background shadow-sm">
                          <AvatarImage
                            src={pair.user1.avatar_url ?? undefined}
                          />
                          <AvatarFallback className="text-[9px] font-semibold">
                            {getInitials(pair.user1.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <Avatar className="w-7 h-7 ring-2 ring-background shadow-sm">
                          <AvatarImage
                            src={pair.user2.avatar_url ?? undefined}
                          />
                          <AvatarFallback className="text-[9px] font-semibold">
                            {getInitials(pair.user2.full_name)}
                          </AvatarFallback>
                        </Avatar>
                      </div>

                      {/* Names */}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">
                          {firstName(pair.user1.full_name)} &{" "}
                          {firstName(pair.user2.full_name)}
                          {isMyPair && (
                            <span className="text-[9px] text-primary ml-1">
                              (tu par)
                            </span>
                          )}
                        </p>
                        {pair.duoStreak > 0 && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            🔥 Racha: {pair.duoStreak} días
                          </p>
                        )}
                      </div>

                      {/* Combined Score */}
                      <div className="text-right shrink-0">
                        <span
                          className={cn(
                            "text-sm font-bold tabular-nums",
                            pair.combinedScore >= 80
                              ? "text-green-600"
                              : pair.combinedScore >= 60
                                ? "text-yellow-600"
                                : "text-red-600"
                          )}
                        >
                          {pair.combinedScore}
                        </span>
                        <p className="text-[9px] text-muted-foreground">
                          score
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
