import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EXPECTED_DAILY_HOURS = 8;

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const date =
    dateParam ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

  // Get all orgs
  const { data: orgs } = await supabase.from("organizations").select("id");
  if (!orgs) return NextResponse.json({ error: "No orgs" }, { status: 500 });

  const flagsCreated: Array<{
    user_id: string;
    org_id: string;
    flag_type: string;
    details: string;
  }> = [];

  for (const org of orgs) {
    // Get org members
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", org.id);

    if (!members) continue;

    // Get all time entries for this org+date
    const { data: entries } = await supabase
      .from("time_entries")
      .select("*")
      .eq("org_id", org.id)
      .eq("date", date);

    // Get closeouts for this org+date
    const { data: closeouts } = await supabase
      .from("daily_closeouts")
      .select("user_id")
      .eq("org_id", org.id)
      .eq("date", date);

    const closeoutUserIds = new Set(closeouts?.map((c) => c.user_id) ?? []);

    for (const member of members) {
      const userEntries =
        entries?.filter((e) => e.user_id === member.user_id) ?? [];
      const flags: Array<{
        flag_type: string;
        details: string;
      }> = [];

      // 1. missing_hours: less than expected hours
      if (userEntries.length < EXPECTED_DAILY_HOURS) {
        flags.push({
          flag_type: "missing_hours",
          details: `Registr\u00f3 ${userEntries.length}/${EXPECTED_DAILY_HOURS} horas`,
        });
      }

      // 2. no_proof: >50% entries without proof
      const withoutProof = userEntries.filter(
        (e) => !e.proof_urls || e.proof_urls.length === 0
      );
      if (
        userEntries.length >= 3 &&
        withoutProof.length / userEntries.length > 0.5
      ) {
        flags.push({
          flag_type: "no_proof",
          details: `${withoutProof.length}/${userEntries.length} entradas sin evidencia`,
        });
      }

      // 3. late_entries: >50% entries are late
      const lateOnes = userEntries.filter((e) => e.is_late);
      if (userEntries.length >= 3 && lateOnes.length / userEntries.length > 0.5) {
        flags.push({
          flag_type: "late_entries",
          details: `${lateOnes.length}/${userEntries.length} entradas tard\u00edas`,
        });
      }

      // 4. no_closeout: didn't submit daily closeout
      if (!closeoutUserIds.has(member.user_id) && userEntries.length > 0) {
        flags.push({
          flag_type: "no_closeout",
          details: "No hizo cierre del d\u00eda",
        });
      }

      // 5. low_detail: average title length < 15 chars
      if (userEntries.length >= 3) {
        const avgLen =
          userEntries.reduce((sum, e) => sum + (e.title?.length ?? 0), 0) /
          userEntries.length;
        if (avgLen < 15) {
          flags.push({
            flag_type: "low_detail",
            details: `Promedio de ${Math.round(avgLen)} caracteres por t\u00edtulo`,
          });
        }
      }

      // 6. suspicious_pattern: all entries same category (if >= 6 entries)
      if (userEntries.length >= 6) {
        const categories = new Set(userEntries.map((e) => e.category));
        if (categories.size === 1) {
          flags.push({
            flag_type: "suspicious_pattern",
            details: `Todas las entradas son "${[...categories][0]}" \u2014 patr\u00f3n inusual`,
          });
        }
      }

      // Insert flags (skip duplicates)
      for (const flag of flags) {
        const { data: existing } = await supabase
          .from("accountability_flags")
          .select("id")
          .eq("user_id", member.user_id)
          .eq("org_id", org.id)
          .eq("flag_type", flag.flag_type)
          .eq("date", date)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from("accountability_flags").insert({
            user_id: member.user_id,
            org_id: org.id,
            flag_type: flag.flag_type,
            date,
            details: flag.details,
          });
          flagsCreated.push({
            user_id: member.user_id,
            org_id: org.id,
            ...flag,
          });
        }
      }

      // Save trust score snapshot
      const withProof = userEntries.filter(
        (e) => e.proof_urls && e.proof_urls.length > 0
      );
      const lateCount = userEntries.filter((e) => e.is_late).length;
      const hasCloseout = closeoutUserIds.has(member.user_id);

      // Get suspicious reaction count for this user's entries
      const userEntryIds = userEntries.map((e) => e.id);
      let suspiciousCount = 0;
      if (userEntryIds.length > 0) {
        const { count } = await supabase
          .from("entry_reactions")
          .select("*", { count: "exact", head: true })
          .in("entry_id", userEntryIds)
          .eq("reaction", "suspicious");
        suspiciousCount = count ?? 0;
      }

      const hoursRatio = Math.min(userEntries.length / EXPECTED_DAILY_HOURS, 1);
      const proofRatio =
        userEntries.length > 0 ? withProof.length / userEntries.length : 0;
      const closeoutBonus = hasCloseout ? 0.1 : 0;
      const latePenalty =
        userEntries.length > 0
          ? (lateCount / userEntries.length) * 0.2
          : 0;
      const suspiciousPenalty = suspiciousCount * 0.1;
      const rawScore =
        hoursRatio * 0.4 +
        proofRatio * 0.4 +
        closeoutBonus -
        latePenalty -
        suspiciousPenalty;
      const trustScore = Math.max(
        0,
        Math.min(100, Math.round(rawScore * 100))
      );

      await supabase.from("trust_score_history").upsert(
        {
          user_id: member.user_id,
          org_id: org.id,
          date,
          score: trustScore,
          hours_logged: userEntries.length,
          hours_with_proof: withProof.length,
          late_entries: lateCount,
          has_closeout: hasCloseout,
          suspicious_reactions: suspiciousCount,
        },
        { onConflict: "user_id,org_id,date" }
      );

      // Update activity streak
      const { data: streak } = await supabase
        .from("activity_streaks")
        .select("*")
        .eq("user_id", member.user_id)
        .eq("org_id", org.id)
        .limit(1)
        .single();

      if (userEntries.length > 0) {
        const yesterday = new Date(date);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        if (streak) {
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
            .eq("user_id", member.user_id)
            .eq("org_id", org.id);
        } else {
          await supabase.from("activity_streaks").insert({
            user_id: member.user_id,
            org_id: org.id,
            current_streak: 1,
            longest_streak: 1,
            last_active_date: date,
            total_days_logged: 1,
          });
        }
      } else if (streak && streak.last_active_date !== date) {
        // No entries today — break streak
        const lastDate = new Date(streak.last_active_date ?? date);
        const today = new Date(date);
        const diffDays = Math.floor(
          (today.getTime() - lastDate.getTime()) / 86400000
        );
        if (diffDays > 1) {
          await supabase
            .from("activity_streaks")
            .update({ current_streak: 0, updated_at: new Date().toISOString() })
            .eq("user_id", member.user_id)
            .eq("org_id", org.id);
        }
      }
    }
  }

  return NextResponse.json({
    date,
    flags_created: flagsCreated.length,
    flags: flagsCreated,
  });
}
