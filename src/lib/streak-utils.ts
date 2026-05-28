import { createClient } from "@/lib/supabase/client";

export async function updateStreakOnEntry(userId: string, orgId: string, date: string) {
  const supabase = createClient();

  const { data: streak } = await supabase
    .from("activity_streaks")
    .select("*")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .limit(1)
    .single();

  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  if (streak) {
    // Already logged today
    if (streak.last_active_date === date) return;

    const isConsecutive = streak.last_active_date === yesterdayStr;
    const newStreak = isConsecutive ? streak.current_streak + 1 : 1;
    const newLongest = Math.max(newStreak, streak.longest_streak);

    await supabase
      .from("activity_streaks")
      .update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_active_date: date,
        total_days_logged: streak.total_days_logged + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("org_id", orgId);
  } else {
    await supabase.from("activity_streaks").upsert({
      user_id: userId,
      org_id: orgId,
      current_streak: 1,
      longest_streak: 1,
      last_active_date: date,
      total_days_logged: 1,
    });
  }
}
