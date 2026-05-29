import { NextResponse } from "next/server";
import { verifyApiKey, createServiceClient } from "@/lib/api-auth";

// GET /api/v1/stats — Get team stats
export async function GET(request: Request) {
  const auth = await verifyApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  if (!auth.permissions.includes("read") && !auth.permissions.includes("admin")) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "day";
  const dateParam = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  if (!["day", "week", "month"].includes(period)) {
    return NextResponse.json(
      { error: "period must be one of: day, week, month" },
      { status: 400 }
    );
  }

  // Calculate date range
  let startDate: string;
  let endDate: string;

  if (period === "day") {
    startDate = dateParam;
    endDate = dateParam;
  } else if (period === "week") {
    const d = new Date(dateParam + "T00:00:00Z");
    const dayOfWeek = d.getUTCDay();
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    startDate = monday.toISOString().split("T")[0];
    endDate = sunday.toISOString().split("T")[0];
  } else {
    // month
    const d = new Date(dateParam + "T00:00:00Z");
    startDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
    endDate = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
  }

  const supabase = createServiceClient();

  // Get entries in range
  const { data: entries, error: entriesError } = await supabase
    .from("time_entries")
    .select("id, user_id, proof_urls")
    .eq("org_id", auth.orgId)
    .gte("date", startDate)
    .lte("date", endDate);

  if (entriesError) {
    return NextResponse.json({ error: entriesError.message }, { status: 500 });
  }

  // Get member count
  const { count: memberCount } = await supabase
    .from("org_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", auth.orgId);

  // Get trust score history for the date range
  const { data: trustHistory } = await supabase
    .from("trust_score_history")
    .select("score")
    .eq("org_id", auth.orgId)
    .gte("date", startDate)
    .lte("date", endDate);

  const allEntries = entries ?? [];
  const totalHours = allEntries.length;
  const withProof = allEntries.filter(
    (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
  ).length;
  const avgProofRate =
    totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0;

  const trustScores = (trustHistory ?? []).map((t) => t.score as number);
  const avgTrustScore =
    trustScores.length > 0
      ? Math.round(trustScores.reduce((sum, s) => sum + s, 0) / trustScores.length)
      : 0;

  return NextResponse.json({
    data: {
      period,
      start_date: startDate,
      end_date: endDate,
      total_hours: totalHours,
      avg_proof_rate: avgProofRate,
      avg_trust_score: avgTrustScore,
      member_count: memberCount ?? 0,
      entries_count: totalHours,
    },
  });
}
