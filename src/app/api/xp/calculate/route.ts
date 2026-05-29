import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/xp/calculate
// Body: { org_id, date }
//
// Calculate XP for each person based on today's actions:
// - Register hour: 10 XP
// - With evidence: +10 XP (20 total)
// - Standup: 15 XP
// - Closeout: 15 XP
// - Promise kept: 30 XP
// - Promise broken: -20 XP
// - Shoutout given: 5 XP
// - Shoutout received: 10 XP
//
// Level = floor(sqrt(totalXP / 100)) + 1, max 50

function calculateLevel(totalXp: number): number {
  if (totalXp <= 0) return 1;
  return Math.min(50, Math.floor(Math.sqrt(totalXp / 100)) + 1);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { org_id, date } = body;

  if (!org_id || !date) {
    return NextResponse.json({ error: "org_id and date required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all org members
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", org_id);

  if (!members || members.length === 0) {
    return NextResponse.json({ success: true, data: { processed: 0 } });
  }

  // Fetch all data for the day in parallel
  const [
    { data: entries },
    { data: standups },
    { data: closeouts },
    { data: promises },
    { data: shoutouts },
    { data: existingXp },
  ] = await Promise.all([
    supabase
      .from("time_entries")
      .select("user_id, proof_urls")
      .eq("org_id", org_id)
      .eq("date", date),
    supabase
      .from("standups")
      .select("user_id")
      .eq("org_id", org_id)
      .eq("date", date),
    supabase
      .from("daily_closeouts")
      .select("user_id")
      .eq("org_id", org_id)
      .eq("date", date),
    supabase
      .from("daily_promises")
      .select("user_id, status")
      .eq("org_id", org_id)
      .eq("date", date),
    supabase
      .from("shoutouts")
      .select("from_user_id, to_user_id")
      .eq("org_id", org_id)
      .eq("date", date),
    supabase
      .from("user_xp")
      .select("user_id, total_xp")
      .eq("org_id", org_id),
  ]);

  const xpMap = new Map<string, number>();
  for (const row of existingXp ?? []) {
    xpMap.set(row.user_id, row.total_xp);
  }

  const results: Array<{ user_id: string; daily_xp: number; total_xp: number; level: number }> = [];

  for (const member of members) {
    const uid = member.user_id;
    let dailyXp = 0;

    // Time entries: 10 XP each, +10 if with evidence
    const userEntries = (entries ?? []).filter((e) => e.user_id === uid);
    for (const entry of userEntries) {
      dailyXp += 10;
      if (entry.proof_urls && (entry.proof_urls as string[]).length > 0) {
        dailyXp += 10;
      }
    }

    // Standup: 15 XP
    const hasStandup = (standups ?? []).some((s) => s.user_id === uid);
    if (hasStandup) dailyXp += 15;

    // Closeout: 15 XP
    const hasCloseout = (closeouts ?? []).some((c) => c.user_id === uid);
    if (hasCloseout) dailyXp += 15;

    // Promises: +30 for kept, -20 for broken
    const userPromises = (promises ?? []).filter((p) => p.user_id === uid);
    for (const p of userPromises) {
      if (p.status === "delivered") dailyXp += 30;
      if (p.status === "broken") dailyXp -= 20;
    }

    // Shoutouts given: 5 XP each
    const givenShoutouts = (shoutouts ?? []).filter((s) => s.from_user_id === uid);
    dailyXp += givenShoutouts.length * 5;

    // Shoutouts received: 10 XP each
    const receivedShoutouts = (shoutouts ?? []).filter((s) => s.to_user_id === uid);
    dailyXp += receivedShoutouts.length * 10;

    const previousXp = xpMap.get(uid) ?? 0;
    const totalXp = Math.max(0, previousXp + dailyXp);
    const level = calculateLevel(totalXp);

    // Upsert user_xp
    await supabase.from("user_xp").upsert(
      {
        user_id: uid,
        org_id: org_id,
        total_xp: totalXp,
        level,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Log to audit_log
    await supabase.from("audit_log").insert({
      org_id: org_id,
      user_id: uid,
      action: "entry_created",
      target_type: "xp_update",
      new_data: {
        total_xp: totalXp,
        level,
        daily_xp: dailyXp,
        date,
      },
    });

    results.push({ user_id: uid, daily_xp: dailyXp, total_xp: totalXp, level });
  }

  return NextResponse.json({ success: true, data: { processed: results.length, results } });
}
