import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET /api/cron/auto-engine
// Automated Accountability Engine — runs every hour during work hours.
// Handles: deadman detection, ghost detection, tribunal auto-trigger,
// lottery audit auto-trigger, and feed generation for all events.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const mtyDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(now);
  const mtyHour = parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Monterrey" }).format(now)
  );
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Monterrey" });

  // Skip weekends and outside work hours (7-18)
  if (dayOfWeek === "Sat" || dayOfWeek === "Sun") {
    return NextResponse.json({ skipped: true, reason: "Weekend" });
  }
  if (mtyHour < 7 || mtyHour > 18) {
    return NextResponse.json({ skipped: true, reason: "Outside work hours", mtyHour });
  }

  const results: Record<string, unknown> = { date: mtyDate, hour: mtyHour };

  const { data: orgs } = await supabase.from("organizations").select("id");

  for (const org of orgs ?? []) {
    const orgId = org.id as string;
    const orgResults: Record<string, unknown> = {};

    try {
      // Load org members with profiles
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(id, full_name, work_start_hour, work_end_hour)")
        .eq("org_id", orgId);

      if (!members || members.length === 0) {
        orgResults.skipped = "no members";
        results[`org_${orgId}`] = orgResults;
        continue;
      }

      type MemberRow = {
        user_id: string;
        profiles: { id: string; full_name: string | null; work_start_hour: number; work_end_hour: number } | null;
      };
      const memberList = members as unknown as MemberRow[];

      // ---------------------------------------------------------------
      // 1. DEADMAN DETECTION
      // ---------------------------------------------------------------
      let deadmanCount = 0;
      for (const m of memberList) {
        const profile = m.profiles;
        const workStart = profile?.work_start_hour ?? 7;
        const workEnd = profile?.work_end_hour ?? 18;

        // Skip if current hour is outside this user's work hours
        if (mtyHour < workStart || mtyHour > workEnd) continue;

        // Find their latest entry today
        const { data: latestEntry } = await supabase
          .from("time_entries")
          .select("hour")
          .eq("user_id", m.user_id)
          .eq("org_id", orgId)
          .eq("date", mtyDate)
          .order("hour", { ascending: false })
          .limit(1)
          .maybeSingle();

        const lastHour = latestEntry?.hour ?? (workStart - 1);
        const hoursMissing = mtyHour - lastHour;

        if (hoursMissing < 4) continue;

        // Check if alert already exists today
        const { data: existing } = await supabase
          .from("deadman_alerts")
          .select("id")
          .eq("user_id", m.user_id)
          .eq("org_id", orgId)
          .eq("status", "active")
          .gte("triggered_at", mtyDate + "T00:00:00")
          .limit(1)
          .maybeSingle();

        if (existing) continue;

        const name = profile?.full_name ?? "Desconocido";

        await supabase.from("deadman_alerts").insert({
          user_id: m.user_id,
          org_id: orgId,
          triggered_at: now.toISOString(),
          hours_missing: hoursMissing,
          status: "active",
        });

        await supabase.from("public_feed").insert({
          org_id: orgId,
          type: "warning",
          title: "Alerta AMBER",
          body: `${name} lleva ${hoursMissing} horas sin actividad`,
          target_user_id: m.user_id,
          urgency: "high",
          emoji: "🚨",
          is_ai_generated: true,
        });

        deadmanCount++;
      }
      orgResults.deadman_alerts = deadmanCount;

      // ---------------------------------------------------------------
      // 2. GHOST DETECTION
      // ---------------------------------------------------------------
      let ghostCount = 0;
      const twoDaysAgo = new Date(mtyDate + "T12:00:00");
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const twoDaysAgoStr = twoDaysAgo.toISOString().split("T")[0];

      for (const m of memberList) {
        const { count } = await supabase
          .from("time_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", m.user_id)
          .eq("org_id", orgId)
          .gte("date", twoDaysAgoStr);

        if ((count ?? 0) > 0) continue;

        // Check if ghost feed item already posted today
        const { data: existingFeed } = await supabase
          .from("public_feed")
          .select("id")
          .eq("org_id", orgId)
          .eq("target_user_id", m.user_id)
          .eq("title", "Fantasma detectado")
          .gte("created_at", mtyDate + "T00:00:00")
          .limit(1)
          .maybeSingle();

        if (existingFeed) continue;

        // Calculate actual days missing
        const { data: lastEntry } = await supabase
          .from("time_entries")
          .select("date")
          .eq("user_id", m.user_id)
          .eq("org_id", orgId)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const daysMissing = lastEntry
          ? Math.floor((new Date(mtyDate).getTime() - new Date(lastEntry.date).getTime()) / 86400000)
          : 99;

        const name = m.profiles?.full_name ?? "Desconocido";

        await supabase.from("public_feed").insert({
          org_id: orgId,
          type: "warning",
          title: "Fantasma detectado",
          body: `${name} no registra actividad en ${daysMissing} días`,
          target_user_id: m.user_id,
          urgency: "normal",
          emoji: "👻",
          is_ai_generated: true,
        });

        ghostCount++;
      }
      orgResults.ghosts = ghostCount;

      // ---------------------------------------------------------------
      // 3. TRIBUNAL AUTO-TRIGGER (once per day, run at hour 14)
      // ---------------------------------------------------------------
      if (mtyHour === 14) {
        const { data: existingTribunal } = await supabase
          .from("tribunal_sessions")
          .select("id")
          .eq("org_id", orgId)
          .eq("date", mtyDate)
          .limit(1)
          .maybeSingle();

        if (!existingTribunal) {
          // Get today's entries and score them
          const { data: todayEntries } = await supabase
            .from("time_entries")
            .select("id, user_id, title, description, proof_urls, verification_status, is_late")
            .eq("org_id", orgId)
            .eq("date", mtyDate);

          const entries = todayEntries ?? [];

          if (entries.length > 0) {
            const scored = entries.map((e) => {
              let suspicion = 0;
              if (!e.proof_urls || e.proof_urls.length === 0) suspicion += 3;
              if (!e.description || e.description.length < 10) suspicion += 2;
              if (e.title.length < 15) suspicion += 1;
              if (e.verification_status === "flagged") suspicion += 4;
              if (e.is_late) suspicion += 1;
              return { entry: e, suspicion };
            });

            scored.sort((a, b) => b.suspicion - a.suspicion);
            const target = scored[0].entry;

            const reasons: string[] = [];
            if (!target.proof_urls || target.proof_urls.length === 0) reasons.push("Sin evidencia");
            if (!target.description || target.description.length < 10) reasons.push("Descripción vaga");
            if (target.title.length < 15) reasons.push("Título corto");
            if (target.verification_status === "flagged") reasons.push("Ya marcado como sospechoso");
            if (target.is_late) reasons.push("Entrada tardía");

            await supabase.from("tribunal_sessions").insert({
              org_id: orgId,
              date: mtyDate,
              entry_id: target.id,
              nominated_user_id: target.user_id,
              reason: reasons.join(", ") || "Selección aleatoria",
              status: "voting",
              guilty_votes: 0,
              innocent_votes: 0,
            });

            const targetName = memberList.find((m) => m.user_id === target.user_id)?.profiles?.full_name ?? "Alguien";

            await supabase.from("public_feed").insert({
              org_id: orgId,
              type: "team_update",
              title: "Tribunal del día",
              body: `La entrada de ${targetName} ha sido seleccionada para juicio`,
              target_user_id: target.user_id,
              urgency: "normal",
              emoji: "⚖️",
              is_ai_generated: true,
            });

            orgResults.tribunal = "created";
          } else {
            orgResults.tribunal = "no entries";
          }
        } else {
          orgResults.tribunal = "already exists";
        }
      }

      // ---------------------------------------------------------------
      // 4. LOTTERY AUDIT AUTO-TRIGGER (once per day, run at hour 16)
      // ---------------------------------------------------------------
      if (mtyHour === 16) {
        const { data: existingLottery } = await supabase
          .from("audit_lotteries")
          .select("id")
          .eq("org_id", orgId)
          .eq("date", mtyDate)
          .limit(1)
          .maybeSingle();

        if (!existingLottery) {
          // Random selection
          const randomIdx = Math.floor(Math.random() * memberList.length);
          const selected = memberList[randomIdx];
          const selectedId = selected.user_id;

          // Audit: last 24h data
          const yesterday = new Date(mtyDate + "T12:00:00");
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split("T")[0];

          const { data: entries } = await supabase
            .from("time_entries")
            .select("*")
            .eq("user_id", selectedId)
            .eq("org_id", orgId)
            .in("date", [yesterdayStr, mtyDate]);

          const { data: closeout } = await supabase
            .from("daily_closeouts")
            .select("id")
            .eq("user_id", selectedId)
            .eq("org_id", orgId)
            .eq("date", yesterdayStr)
            .maybeSingle();

          const entryList = entries ?? [];
          const hoursLogged = entryList.length;
          const entriesWithProof = entryList.filter(
            (e) => e.proof_urls && e.proof_urls.length > 0
          ).length;
          const proofPercent = hoursLogged > 0 ? Math.round((entriesWithProof / hoursLogged) * 100) : 0;
          const lateEntries = entryList.filter((e) => e.is_late).length;
          const hasCloseout = !!closeout;

          // Score (0-100) — same formula as lottery page
          const hoursScore = Math.min(30, Math.round((hoursLogged / 8) * 30));
          const proofScore = Math.round((proofPercent / 100) * 30);
          const closeoutScore = hasCloseout ? 20 : 0;
          const punctualityScore = Math.max(0, 20 - lateEntries * 5);
          const score = hoursScore + proofScore + closeoutScore + punctualityScore;

          const passed = score >= 70;
          const findings = {
            hoursLogged,
            totalEntries: entryList.length,
            entriesWithProof,
            proofPercent,
            lateEntries,
            hasCloseout,
            score,
          };

          await supabase.from("audit_lotteries").insert({
            org_id: orgId,
            date: mtyDate,
            selected_user_id: selectedId,
            findings,
            passed,
            status: passed ? "passed" : "failed",
          });

          const selectedName = selected.profiles?.full_name ?? "Alguien";
          const resultText = passed ? "APROBADO" : "REPROBADO";

          await supabase.from("public_feed").insert({
            org_id: orgId,
            type: "team_update",
            title: "Lotería de auditoría",
            body: `${selectedName} ha sido seleccionado para auditoría — Resultado: ${resultText}`,
            target_user_id: selectedId,
            urgency: "normal",
            emoji: "🎰",
            is_ai_generated: true,
          });

          orgResults.lottery = { selectedName, score, passed };
        } else {
          orgResults.lottery = "already exists";
        }
      }
    } catch (e) {
      orgResults.error = (e as Error).message;
    }

    results[`org_${orgId}`] = orgResults;
  }

  return NextResponse.json({ success: true, ...results });
}
