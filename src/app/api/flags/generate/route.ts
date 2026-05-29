import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const EXPECTED_DAILY_HOURS = 8;

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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

      // 7. Ghost hours: entries logged during idle/offline heartbeat periods
      const { data: liveStatus } = await supabase
        .from("live_status")
        .select("status, last_heartbeat")
        .eq("user_id", member.user_id)
        .eq("org_id", org.id)
        .limit(1)
        .single();

      if (liveStatus) {
        const heartbeat = new Date(liveStatus.last_heartbeat);
        const dateObj = new Date(date + "T18:00:00");
        const heartbeatAge = (dateObj.getTime() - heartbeat.getTime()) / 1000 / 60 / 60;
        // If last heartbeat was >8 hours before end of workday but they logged entries
        if (heartbeatAge > 8 && userEntries.length >= 4) {
          flags.push({
            flag_type: "idle_long",
            details: `Ultimo heartbeat hace ${Math.round(heartbeatAge)}h pero registro ${userEntries.length} horas`,
          });
        }
      }

      // 8. Bulk entry forensics: multiple entries with identical logged_at (within 30s)
      if (userEntries.length >= 3) {
        const loggedAtTimes = userEntries
          .map((e) => new Date(e.logged_at).getTime())
          .sort((a, b) => a - b);
        let bulkCount = 0;
        for (let i = 1; i < loggedAtTimes.length; i++) {
          if (loggedAtTimes[i] - loggedAtTimes[i - 1] < 30000) {
            bulkCount++;
          }
        }
        if (bulkCount >= 4) {
          flags.push({
            flag_type: "suspicious_pattern",
            details: `${bulkCount + 1} entradas registradas en <30s \u2014 posible backfill masivo`,
          });
        }
      }

      // 9. Copy-paste detection: near-identical titles across entries
      if (userEntries.length >= 4) {
        const titles = userEntries.map((e) => e.title?.toLowerCase().trim());
        const uniqueTitles = new Set(titles);
        if (uniqueTitles.size === 1 && userEntries.length >= 4) {
          flags.push({
            flag_type: "low_detail",
            details: `Todas las entradas tienen el mismo titulo: "${userEntries[0].title}"`,
          });
        }
      }

      // 10. Burnout detection: check last 7 days for overwork + declining mood
      const weekAgo = new Date(date);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().split("T")[0];
      const { data: weekEntries } = await supabase
        .from("time_entries")
        .select("mood, energy, date")
        .eq("user_id", member.user_id)
        .eq("org_id", org.id)
        .gte("date", weekAgoStr)
        .lte("date", date);

      if (weekEntries && weekEntries.length > 0) {
        const totalWeekHours = weekEntries.length;
        const moodValues = weekEntries.filter((e) => e.mood).map((e) => e.mood as number);
        const energyValues = weekEntries.filter((e) => e.energy).map((e) => e.energy as number);
        const avgMood = moodValues.length > 0 ? moodValues.reduce((a, b) => a + b, 0) / moodValues.length : 3;
        const avgEnergy = energyValues.length > 0 ? energyValues.reduce((a, b) => a + b, 0) / energyValues.length : 3;

        // Burnout: >50h/week + avg mood < 2.5 + avg energy < 2.5
        if (totalWeekHours > 50 && avgMood < 2.5 && avgEnergy < 2.5) {
          flags.push({
            flag_type: "suspicious_pattern",
            details: `Posible burnout: ${totalWeekHours}h/semana, animo ${avgMood.toFixed(1)}, energia ${avgEnergy.toFixed(1)}`,
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
      // Check and grant achievements
      const achievementsToGrant: string[] = [];

      // streak_7 / streak_30
      const currentStreak = streak?.current_streak ?? 0;
      if (currentStreak >= 7) achievementsToGrant.push("streak_7");
      if (currentStreak >= 30) achievementsToGrant.push("streak_30");

      // proof_100: all entries today have proof
      if (userEntries.length >= EXPECTED_DAILY_HOURS) {
        const allHaveProof = userEntries.every(
          (e) => e.proof_urls && e.proof_urls.length > 0
        );
        if (allHaveProof) achievementsToGrant.push("proof_100");
      }

      // zero_late: no late entries today (with at least 6 entries)
      if (userEntries.length >= 6 && lateCount === 0) {
        achievementsToGrant.push("zero_late");
      }

      // closeout_streak: check last 5 closeouts
      const { data: recentCloseouts } = await supabase
        .from("daily_closeouts")
        .select("date")
        .eq("user_id", member.user_id)
        .eq("org_id", org.id)
        .order("date", { ascending: false })
        .limit(5);
      if (recentCloseouts && recentCloseouts.length >= 5) {
        achievementsToGrant.push("closeout_streak");
      }

      // high_trust: trust score >90
      if (trustScore > 90) {
        const { data: highScores } = await supabase
          .from("trust_score_history")
          .select("score")
          .eq("user_id", member.user_id)
          .eq("org_id", org.id)
          .order("date", { ascending: false })
          .limit(7);
        if (
          highScores &&
          highScores.length >= 7 &&
          highScores.every((s) => s.score > 90)
        ) {
          achievementsToGrant.push("high_trust");
        }
      }

      // helpful: 10+ helped_me reactions received
      if (userEntryIds.length > 0) {
        const { count: helpedCount } = await supabase
          .from("entry_reactions")
          .select("*", { count: "exact", head: true })
          .in("entry_id", userEntryIds)
          .eq("reaction", "helped_me");
        if ((helpedCount ?? 0) >= 10) achievementsToGrant.push("helpful");

        const { count: impressiveCount } = await supabase
          .from("entry_reactions")
          .select("*", { count: "exact", head: true })
          .in("entry_id", userEntryIds)
          .eq("reaction", "impressive");
        if ((impressiveCount ?? 0) >= 10) achievementsToGrant.push("impressive_10");
      }

      // team_player: 20+ verified reactions given
      const { count: verifiedGiven } = await supabase
        .from("entry_reactions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", member.user_id)
        .eq("reaction", "verified");
      if ((verifiedGiven ?? 0) >= 20) achievementsToGrant.push("team_player");

      // Upsert achievements (ignore duplicates)
      for (const achType of achievementsToGrant) {
        await supabase.from("achievements").upsert(
          {
            user_id: member.user_id,
            org_id: org.id,
            achievement_type: achType,
          },
          { onConflict: "user_id,org_id,achievement_type" }
        );
      }
    }
  }

  return NextResponse.json({
    date,
    flags_created: flagsCreated.length,
    flags: flagsCreated,
  });
}
