import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/achievements/check
// Body: { org_id, user_id }
//
// Secret achievements:
// - "madrugador" — 3 entries before 9am in a week
// - "maquina" — 8+ hours with 100% evidence in 1 day
// - "imparable" — 10 day streak
// - "primer_sangre" — First entry of the day for the team, 5 times
// - "sin_excusas" — 0 late entries in a full week (Mon-Fri, at least 5 days with entries)
// - "cumplidor" — 10 promises kept with 0 broken

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any, "public", any>;

interface AchievementDef {
  key: string;
  check: (ctx: CheckContext) => Promise<boolean>;
}

interface CheckContext {
  userId: string;
  orgId: string;
  supabase: Supabase;
}

const ACHIEVEMENT_CHECKS: AchievementDef[] = [
  {
    key: "madrugador",
    check: async ({ userId, orgId, supabase }) => {
      // 3 entries before 9am in last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoff = sevenDaysAgo.toISOString().split("T")[0];

      const { data: entries } = await supabase
        .from("time_entries")
        .select("hour")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .gte("date", cutoff)
        .lt("hour", 9);

      return (entries?.length ?? 0) >= 3;
    },
  },
  {
    key: "maquina",
    check: async ({ userId, orgId, supabase }) => {
      // 8+ hours with 100% evidence in a single day (any day in last 30)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

      const { data: entries } = await supabase
        .from("time_entries")
        .select("date, proof_urls")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .gte("date", cutoff);

      if (!entries || entries.length === 0) return false;

      // Group by date
      const byDate = new Map<string, { total: number; withProof: number }>();
      for (const e of entries) {
        const d = byDate.get(e.date) ?? { total: 0, withProof: 0 };
        d.total++;
        if (e.proof_urls && (e.proof_urls as string[]).length > 0) d.withProof++;
        byDate.set(e.date, d);
      }

      for (const [, stats] of byDate) {
        if (stats.total >= 8 && stats.withProof === stats.total) return true;
      }
      return false;
    },
  },
  {
    key: "imparable",
    check: async ({ userId, orgId, supabase }) => {
      // 10 day streak
      const { data: streak } = await supabase
        .from("activity_streaks")
        .select("current_streak")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .limit(1)
        .single();

      return (streak?.current_streak ?? 0) >= 10;
    },
  },
  {
    key: "primer_sangre",
    check: async ({ userId, orgId, supabase }) => {
      // First entry of the day for the team, 5 times in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

      const { data: allEntries } = await supabase
        .from("time_entries")
        .select("user_id, date, logged_at")
        .eq("org_id", orgId)
        .gte("date", cutoff)
        .order("logged_at", { ascending: true });

      if (!allEntries || allEntries.length === 0) return false;

      // For each date, find who logged first
      const firstByDate = new Map<string, string>();
      for (const e of allEntries) {
        if (!firstByDate.has(e.date)) {
          firstByDate.set(e.date, e.user_id);
        }
      }

      let firstCount = 0;
      for (const [, firstUserId] of firstByDate) {
        if (firstUserId === userId) firstCount++;
      }

      return firstCount >= 5;
    },
  },
  {
    key: "sin_excusas",
    check: async ({ userId, orgId, supabase }) => {
      // 0 late entries in a full week (last 7 days, at least 5 days with entries)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoff = sevenDaysAgo.toISOString().split("T")[0];

      const { data: entries } = await supabase
        .from("time_entries")
        .select("date, is_late")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .gte("date", cutoff);

      if (!entries || entries.length === 0) return false;

      const uniqueDays = new Set(entries.map((e) => e.date));
      if (uniqueDays.size < 5) return false;

      return entries.every((e) => !e.is_late);
    },
  },
  {
    key: "cumplidor",
    check: async ({ userId, orgId, supabase }) => {
      // 10 promises kept with 0 broken (all time)
      const { data: promises } = await supabase
        .from("daily_promises")
        .select("status")
        .eq("user_id", userId)
        .eq("org_id", orgId);

      if (!promises || promises.length === 0) return false;

      const kept = promises.filter((p) => p.status === "delivered").length;
      const broken = promises.filter((p) => p.status === "broken").length;

      return kept >= 10 && broken === 0;
    },
  },
];

export async function POST(request: Request) {
  const body = await request.json();
  const { org_id, user_id } = body;

  if (!org_id || !user_id) {
    return NextResponse.json({ error: "org_id and user_id required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get existing achievements for this user
  const { data: existing } = await supabase
    .from("achievements")
    .select("achievement_type")
    .eq("user_id", user_id)
    .eq("org_id", org_id);

  const existingSet = new Set((existing ?? []).map((a) => a.achievement_type));

  const granted: string[] = [];

  for (const def of ACHIEVEMENT_CHECKS) {
    if (existingSet.has(def.key)) continue;

    const earned = await def.check({ userId: user_id, orgId: org_id, supabase });
    if (earned) {
      await supabase.from("achievements").insert({
        user_id: user_id,
        org_id: org_id,
        achievement_type: def.key,
      });
      granted.push(def.key);
    }
  }

  return NextResponse.json({ success: true, data: { checked: ACHIEVEMENT_CHECKS.length, granted } });
}
