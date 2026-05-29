import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET /api/throne?org_id=xxx
//
// THE THRONE — who wears the crown this week?
// Crown (👑) = most deep_work hours in last 7 days
// Sleepy (💤) = least total hours in last 7 days

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");

  if (!orgId) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toISOString().split("T")[0];

  // Get all org members
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, profiles(full_name)")
    .eq("org_id", orgId);

  if (!members || members.length === 0) {
    return NextResponse.json({ crown_user_id: null, crown_name: null, sleepy_user_id: null, sleepy_name: null });
  }

  // Get all time entries for the last 7 days
  const { data: entries } = await supabase
    .from("time_entries")
    .select("user_id, category")
    .eq("org_id", orgId)
    .gte("date", cutoffDate);

  const entryList = entries ?? [];

  // Calculate stats per member
  const stats = members.map((m) => {
    const userEntries = entryList.filter((e) => e.user_id === m.user_id);
    const deepWorkHours = userEntries.filter((e) => e.category === "deep_work").length;
    const totalHours = userEntries.length;
    const name = (m.profiles as any)?.full_name ?? "?";

    return {
      userId: m.user_id,
      name,
      deepWorkHours,
      totalHours,
    };
  });

  // Crown: most deep work hours
  const sortedByDeepWork = [...stats].sort((a, b) => b.deepWorkHours - a.deepWorkHours);
  const crown = sortedByDeepWork[0];

  // Sleepy: least total hours (only if there are at least 2 members)
  const sortedByTotal = [...stats].sort((a, b) => a.totalHours - b.totalHours);
  const sleepy = stats.length >= 2 ? sortedByTotal[0] : null;

  // Don't give sleepy to the same person who has the crown
  const effectiveSleepy = sleepy && sleepy.userId !== crown.userId ? sleepy : (sortedByTotal.length > 1 ? sortedByTotal[1] : null);

  return NextResponse.json({
    crown_user_id: crown?.userId ?? null,
    crown_name: crown?.name ?? null,
    crown_deep_work_hours: crown?.deepWorkHours ?? 0,
    sleepy_user_id: effectiveSleepy?.userId ?? null,
    sleepy_name: effectiveSleepy?.name ?? null,
    sleepy_total_hours: effectiveSleepy?.totalHours ?? 0,
  });
}
