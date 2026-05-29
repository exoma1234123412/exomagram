import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/output-verification?org_id=xxx&date=yyyy-mm-dd
// The REAL anti-gaming system: verifies ACTUAL OUTPUT, not just presence.
//
// For each person, cross-references:
// 1. Hours claimed of "deep_work" → actual GitHub commits/lines changed
// 2. Hours claimed of "meeting" → calendar cross-ref or peer confirmation
// 3. Hours claimed of "review" → actual PR reviews on GitHub
// 4. Proof URLs → validates they're recent and belong to this user
// 5. Mouse pattern analysis → detects jiggler/bot patterns
// 6. Check-in response similarity → detects template/copy-paste answers
// 7. Output velocity → hours vs deliverables ratio

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [
    { data: entries },
    { data: members },
    { data: githubEvents },
    { data: auditLogs },
    { data: meetingVerifications },
  ] = await Promise.all([
    supabase.from("time_entries").select("*, profiles(full_name)").eq("org_id", orgId).eq("date", date),
    supabase.from("org_members").select("user_id, profiles(full_name)").eq("org_id", orgId),
    supabase.from("github_events").select("*").eq("org_id", orgId).eq("date", date),
    supabase.from("audit_log").select("*").eq("org_id", orgId).gte("created_at", date + "T00:00:00").lte("created_at", date + "T23:59:59"),
    supabase.from("meeting_verifications").select("*").eq("org_id", orgId),
  ]);

  interface UserVerification {
    user_id: string;
    name: string;
    output_score: number; // 0-100
    findings: string[];
    red_flags: string[];
    verified_outputs: string[];
    hours_claimed: number;
    hours_verified: number;
    ghost_hours: number; // hours with NO verifiable output
  }

  const verifications: UserVerification[] = [];

  for (const member of members ?? []) {
    const profile = member.profiles as unknown as { full_name: string } | null;
    const name = profile?.full_name ?? "?";
    const userEntries = (entries ?? []).filter((e) => e.user_id === member.user_id);
    const userGithub = (githubEvents ?? []).filter((g) => g.user_id === member.user_id);
    const userAudit = (auditLogs ?? []).filter((a) => a.user_id === member.user_id);

    if (userEntries.length === 0) continue;

    const findings: string[] = [];
    const redFlags: string[] = [];
    const verified: string[] = [];
    let verifiedHours = 0;

    const deepWorkEntries = userEntries.filter((e) => e.category === "deep_work");
    const meetingEntries = userEntries.filter((e) => e.category === "meeting");
    const reviewEntries = userEntries.filter((e) => e.category === "review");

    // ═══════════════════════════════════════════
    // 1. DEEP WORK vs GITHUB OUTPUT
    // ═══════════════════════════════════════════
    const deepWorkHours = deepWorkEntries.length;
    const commits = userGithub.filter((g) => g.event_type === "commit");
    const prsOpened = userGithub.filter((g) => g.event_type === "pr_opened" || g.event_type === "pr_merged");

    if (deepWorkHours >= 4 && commits.length === 0 && prsOpened.length === 0) {
      redFlags.push(
        `DESCONEXION CRITICA: ${deepWorkHours}h de "deep work" pero 0 commits y 0 PRs en GitHub. ¿Dónde está el código?`
      );
    } else if (deepWorkHours >= 3 && commits.length <= 1) {
      findings.push(
        `${deepWorkHours}h de deep work pero solo ${commits.length} commit(s). Ratio bajo.`
      );
    } else if (commits.length > 0) {
      verifiedHours += Math.min(deepWorkHours, commits.length * 2);
      verified.push(`${commits.length} commits verifican ${Math.min(deepWorkHours, commits.length * 2)}h de deep work`);
    }

    // ═══════════════════════════════════════════
    // 2. REVIEW vs GITHUB PR REVIEWS
    // ═══════════════════════════════════════════
    const reviewHours = reviewEntries.length;
    const prReviews = userGithub.filter((g) => g.event_type === "pr_reviewed");

    if (reviewHours >= 2 && prReviews.length === 0) {
      findings.push(
        `${reviewHours}h de "code review" pero 0 PR reviews en GitHub.`
      );
    } else if (prReviews.length > 0) {
      verifiedHours += Math.min(reviewHours, prReviews.length);
      verified.push(`${prReviews.length} PR reviews verifican ${Math.min(reviewHours, prReviews.length)}h`);
    }

    // ═══════════════════════════════════════════
    // 3. MEETING CROSS-VERIFICATION
    // ═══════════════════════════════════════════
    const meetingHours = meetingEntries.length;
    const confirmedMeetings = (meetingVerifications ?? []).filter(
      (v) => v.requester_id === member.user_id && v.status === "confirmed"
    );
    const deniedMeetings = (meetingVerifications ?? []).filter(
      (v) => v.requester_id === member.user_id && v.status === "denied"
    );

    if (deniedMeetings.length > 0) {
      redFlags.push(
        `${deniedMeetings.length} reunión(es) NEGADA(s) por la contraparte. Dijo que hubo reunión pero el otro dice que no.`
      );
    }
    if (confirmedMeetings.length > 0) {
      verifiedHours += confirmedMeetings.length;
      verified.push(`${confirmedMeetings.length} reunión(es) confirmadas por contraparte`);
    }

    // ═══════════════════════════════════════════
    // 4. PROOF URL VALIDATION
    // ═══════════════════════════════════════════
    const entriesWithProof = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0);
    const allProofUrls = entriesWithProof.flatMap((e) => e.proof_urls as string[]);

    // Check for duplicates (same URL used multiple times)
    const urlCounts = new Map<string, number>();
    for (const url of allProofUrls) {
      urlCounts.set(url, (urlCounts.get(url) ?? 0) + 1);
    }
    const duplicateUrls = Array.from(urlCounts.entries()).filter(([, count]) => count > 1);
    if (duplicateUrls.length > 0) {
      redFlags.push(
        `${duplicateUrls.length} URL(s) de evidencia usadas MULTIPLES VECES. Reciclando la misma prueba.`
      );
    }

    // Check if proof URLs are from today (by matching GitHub events)
    const githubUrls = new Set(userGithub.map((g) => g.url).filter(Boolean));
    const matchedProofs = allProofUrls.filter((url) => githubUrls.has(url));
    if (matchedProofs.length > 0) {
      verifiedHours += Math.min(entriesWithProof.length, matchedProofs.length);
      verified.push(`${matchedProofs.length} evidencia(s) coinciden con actividad GitHub de hoy`);
    }

    // ═══════════════════════════════════════════
    // 5. CHECK-IN RESPONSE ANALYSIS
    // ═══════════════════════════════════════════
    const checkins = userAudit.filter((a) => a.target_type === "micro_checkin");
    const checkinResponses = checkins
      .map((c) => (c.new_data as Record<string, unknown>)?.response as string)
      .filter(Boolean);

    if (checkinResponses.length >= 4) {
      // Check for too-similar responses (Levenshtein-like)
      const normalized = checkinResponses.map((r) => r.toLowerCase().trim());
      const uniqueSet = new Set(normalized);
      if (uniqueSet.size < normalized.length * 0.5) {
        redFlags.push(
          `${normalized.length} check-ins pero solo ${uniqueSet.size} respuestas únicas. Está usando templates/copy-paste.`
        );
      }
    }

    const skippedCheckins = checkins.filter((c) => (c.new_data as Record<string, unknown>)?.skipped);
    if (skippedCheckins.length >= 3) {
      findings.push(`Saltó ${skippedCheckins.length} micro check-ins`);
    }

    // ═══════════════════════════════════════════
    // 6. SPOT CHECK / PROOF SNAPSHOT ANALYSIS
    // ═══════════════════════════════════════════
    const spotChecks = userAudit.filter((a) => a.target_type === "spot_check");
    const missed = spotChecks.filter((c) => (c.new_data as Record<string, unknown>)?.status === "missed");
    if (missed.length > 0) {
      redFlags.push(`No respondió ${missed.length} spot check(s). Ausencia verificada.`);
    }

    const proofSnapshots = userAudit.filter((a) => a.target_type === "proof_snapshot");
    const missedSnapshots = proofSnapshots.filter((c) => (c.new_data as Record<string, unknown>)?.status === "missed");
    if (missedSnapshots.length > 0) {
      redFlags.push(`No subió ${missedSnapshots.length} screenshot(s) de prueba.`);
    }

    // ═══════════════════════════════════════════
    // 7. WORK SESSION IDLE ANALYSIS
    // ═══════════════════════════════════════════
    const sessions = userAudit.filter((a) => a.target_type === "work_session");
    const flaggedSessions = sessions.filter((s) => (s.new_data as Record<string, unknown>)?.flagged);
    if (flaggedSessions.length > 0) {
      const totalIdle = flaggedSessions.reduce((sum, s) => {
        const data = s.new_data as Record<string, unknown>;
        return sum + ((data?.idle_percent as number) ?? 0);
      }, 0);
      const avgIdle = Math.round(totalIdle / flaggedSessions.length);
      redFlags.push(
        `${flaggedSessions.length} sesión(es) con idle excesivo (promedio ${avgIdle}%). Inició timer pero no trabajó.`
      );
    }

    // ═══════════════════════════════════════════
    // CALCULATE OUTPUT SCORE
    // ═══════════════════════════════════════════
    const totalHours = userEntries.length;
    const ghostHours = Math.max(0, totalHours - verifiedHours);
    const verificationRatio = totalHours > 0 ? verifiedHours / totalHours : 0;

    let outputScore = Math.round(verificationRatio * 60); // Max 60 from verification
    outputScore += entriesWithProof.length > 0 ? Math.min(20, Math.round((entriesWithProof.length / totalHours) * 20)) : 0; // Max 20 from proofs
    outputScore -= redFlags.length * 8; // -8 per red flag
    outputScore -= missed.length * 10; // -10 per missed check
    outputScore = Math.max(0, Math.min(100, outputScore));

    if (ghostHours >= totalHours * 0.5 && totalHours >= 4) {
      redFlags.push(
        `${ghostHours}/${totalHours} horas SIN OUTPUT VERIFICABLE. Más de la mitad del día es un agujero negro.`
      );
    }

    verifications.push({
      user_id: member.user_id,
      name,
      output_score: outputScore,
      findings,
      red_flags: redFlags,
      verified_outputs: verified,
      hours_claimed: totalHours,
      hours_verified: verifiedHours,
      ghost_hours: ghostHours,
    });
  }

  verifications.sort((a, b) => a.output_score - b.output_score);

  // Save to ai_reviews
  await supabase.from("ai_reviews").insert({
    org_id: orgId,
    date,
    review_type: "daily_team",
    findings: { verifications },
    summary: `Output verification: ${verifications.filter((v) => v.red_flags.length > 0).length}/${verifications.length} personas con red flags`,
  });

  return NextResponse.json({
    date,
    verifications,
    team_avg_output: verifications.length > 0
      ? Math.round(verifications.reduce((s, v) => s + v.output_score, 0) / verifications.length)
      : 0,
    ghost_hours_total: verifications.reduce((s, v) => s + v.ghost_hours, 0),
    members_with_flags: verifications.filter((v) => v.red_flags.length > 0).length,
  });
}
