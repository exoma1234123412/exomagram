import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/digest?org_id=xxx&date=2026-05-27
// Returns accountability summary for all org members on a given date
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  if (!orgId) {
    return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get members
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, profiles(id, full_name, email, role)")
    .eq("org_id", orgId);

  // Get entries for date
  const { data: entries } = await supabase
    .from("time_entries")
    .select("*")
    .eq("org_id", orgId)
    .eq("date", date);

  // Get closeouts
  const { data: closeouts } = await supabase
    .from("daily_closeouts")
    .select("*")
    .eq("org_id", orgId)
    .eq("date", date);

  // Get suspicious reactions for entries on this date
  const entryIds = (entries ?? []).map((e) => e.id);
  let suspiciousCounts: Record<string, number> = {};

  if (entryIds.length > 0) {
    const { data: reactions } = await supabase
      .from("entry_reactions")
      .select("entry_id")
      .eq("reaction", "suspicious")
      .in("entry_id", entryIds);

    for (const r of reactions ?? []) {
      const entry = entries?.find((e) => e.id === r.entry_id);
      if (entry) {
        suspiciousCounts[entry.user_id] =
          (suspiciousCounts[entry.user_id] ?? 0) + 1;
      }
    }
  }

  const closeoutUserIds = new Set((closeouts ?? []).map((c) => c.user_id));

  const digest = (members ?? []).map((m) => {
    const profile = m.profiles as unknown as Record<string, unknown> | null;
    const userEntries = (entries ?? []).filter(
      (e) => e.user_id === m.user_id
    );
    const withProof = userEntries.filter(
      (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
    );
    const lateEntries = userEntries.filter((e) => e.is_late);

    const hoursLogged = userEntries.length;
    const hoursWithProof = withProof.length;
    const proofPercent =
      hoursLogged > 0 ? Math.round((hoursWithProof / hoursLogged) * 100) : 0;

    // Trust score
    const hoursRatio = Math.min(hoursLogged / 8, 1);
    const proofRatio =
      hoursLogged > 0 ? hoursWithProof / hoursLogged : 0;
    const closeoutBonus = closeoutUserIds.has(m.user_id) ? 0.1 : 0;
    const latePenalty =
      hoursLogged > 0 ? (lateEntries.length / hoursLogged) * 0.2 : 0;
    const suspiciousPenalty = (suspiciousCounts[m.user_id] ?? 0) * 0.1;
    const trustScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (hoursRatio * 0.4 + proofRatio * 0.4 + closeoutBonus - latePenalty - suspiciousPenalty) * 100
        )
      )
    );

    // Flags
    const flags: string[] = [];
    if (hoursLogged === 0) flags.push("missing_hours");
    if (hoursLogged > 0 && proofPercent < 50) flags.push("no_proof");
    if (lateEntries.length > hoursLogged / 2) flags.push("late_entries");
    if (!closeoutUserIds.has(m.user_id)) flags.push("no_closeout");
    if ((suspiciousCounts[m.user_id] ?? 0) > 0)
      flags.push("suspicious_pattern");

    return {
      user_id: m.user_id,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      role: profile?.role ?? null,
      hours_logged: hoursLogged,
      hours_with_proof: hoursWithProof,
      proof_percent: proofPercent,
      late_entries: lateEntries.length,
      has_closeout: closeoutUserIds.has(m.user_id),
      trust_score: trustScore,
      suspicious_reactions: suspiciousCounts[m.user_id] ?? 0,
      flags,
    };
  });

  // Sort worst first
  digest.sort((a, b) => a.trust_score - b.trust_score);

  const teamAvg = digest.length > 0
    ? Math.round(digest.reduce((sum, d) => sum + d.trust_score, 0) / digest.length)
    : 0;

  return NextResponse.json({
    date,
    org_id: orgId,
    team_avg_trust: teamAvg,
    total_members: digest.length,
    members_with_flags: digest.filter((d) => d.flags.length > 0).length,
    digest,
  });
}
