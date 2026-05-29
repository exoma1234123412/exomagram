import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET /api/cron/hourly
// Runs every hour during work hours (8am-6pm CST).
// Claude AI Autopilot: analyzes team state and takes autonomous actions.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check if within work hours (Monterrey time)
  const now = new Date();
  const mtyHour = parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Monterrey" }).format(now)
  );

  if (mtyHour < 8 || mtyHour > 18) {
    return NextResponse.json({ skipped: true, reason: "Outside work hours", mtyHour });
  }

  // Skip weekends
  const mtyDay = parseInt(
    new Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "America/Monterrey" }).format(now)
  );
  // 0=Sun, 6=Sat in getDay() but DateTimeFormat returns different
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Monterrey" });
  if (dayOfWeek === "Sat" || dayOfWeek === "Sun") {
    return NextResponse.json({ skipped: true, reason: "Weekend" });
  }

  const results: Record<string, unknown> = { hour: mtyHour };

  // Run AI Autopilot for all orgs
  const { data: orgs } = await supabase.from("organizations").select("id");
  for (const org of orgs ?? []) {
    try {
      const res = await fetch(
        `${new URL(request.url).origin}/api/ai-autopilot?org_id=${org.id}`,
        { method: "POST" }
      );
      const data = await res.json();
      results[`autopilot_${org.id}`] = {
        assessment: data.assessment,
        actions: data.actions_executed?.length ?? 0,
        watch_list: data.watch_list,
      };
    } catch (e) {
      results[`autopilot_error_${org.id}`] = (e as Error).message;
    }
  }

  return NextResponse.json({ success: true, ...results });
}
