import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET /api/cron/daily — Run daily at midnight
// Generates flags, sends Slack digest, updates streaks
// Call this from Vercel Cron or an external scheduler
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split("T")[0];

  const results: Record<string, unknown> = { date };

  // 1. Generate flags via the flags API
  try {
    const flagsRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(request.url).origin : "http://localhost:3000"}/api/flags/generate?date=${date}`,
      { method: "POST" }
    );
    results.flags = await flagsRes.json();
  } catch (e) {
    results.flags_error = (e as Error).message;
  }

  // 2. Send Slack digest if webhook is configured
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    try {
      const { data: orgs } = await supabase.from("organizations").select("id");
      for (const org of orgs ?? []) {
        await fetch(
          `${new URL(request.url).origin}/api/slack/webhook`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ webhook_url: slackWebhook, org_id: org.id, date }),
          }
        );
      }
      results.slack = "sent";
    } catch (e) {
      results.slack_error = (e as Error).message;
    }
  }

  // 3. Run AI review
  try {
    const { data: orgs } = await supabase.from("organizations").select("id");
    for (const org of orgs ?? []) {
      await fetch(
        `${new URL(request.url).origin}/api/ai-review?org_id=${org.id}&date=${date}`,
        { method: "POST" }
      );
    }
    results.ai_review = "completed";
  } catch (e) {
    results.ai_review_error = (e as Error).message;
  }

  return NextResponse.json({ success: true, ...results });
}
