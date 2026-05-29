import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET /api/cron/daily — Run daily at midnight
// Generates flags, sends Slack digest, updates streaks
// Call this from Vercel Cron or an external scheduler
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Use Monterrey timezone for correct date calculation
  const mtyNow = new Date();
  const mtyDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(mtyNow);
  const mtyYesterday = new Date(mtyDateStr + "T12:00:00");
  mtyYesterday.setDate(mtyYesterday.getDate() - 1);
  const date = mtyYesterday.toISOString().split("T")[0];

  const results: Record<string, unknown> = { date };

  const cronHeaders = { Authorization: `Bearer ${process.env.CRON_SECRET}` };

  // 1. Generate flags via the flags API
  try {
    const flagsRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(request.url).origin : "http://localhost:3000"}/api/flags/generate?date=${date}`,
      { method: "POST", headers: cronHeaders }
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
            headers: { "Content-Type": "application/json", ...cronHeaders },
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
        { method: "POST", headers: cronHeaders }
      );
    }
    results.ai_review = "completed";
  } catch (e) {
    results.ai_review_error = (e as Error).message;
  }

  // 4. Run AI Audit (grades everyone A-F, impacts trust score)
  try {
    const { data: orgs } = await supabase.from("organizations").select("id");
    for (const org of orgs ?? []) {
      await fetch(
        `${new URL(request.url).origin}/api/ai-audit?org_id=${org.id}&date=${date}`,
        { method: "POST", headers: cronHeaders }
      );
    }
    results.ai_audit = "completed";
  } catch (e) {
    results.ai_audit_error = (e as Error).message;
  }

  // 5. AI Process Day — generate insights, update profiles, predict signals
  try {
    const { data: orgs } = await supabase.from("organizations").select("id");
    for (const org of orgs ?? []) {
      await fetch(
        `${new URL(request.url).origin}/api/ai-process-day?org_id=${org.id}&date=${date}`,
        { method: "POST" }
      );
    }
    results.ai_process_day = "completed";
  } catch (e) {
    results.ai_process_day_error = (e as Error).message;
  }

  // 6. Generate weekly summary (every Sunday)
  const mtyDay = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Monterrey" }).format(mtyNow);
  const isSunday = mtyDay === "Sun";
  if (isSunday) {
    try {
      const lastMonday = new Date();
      lastMonday.setDate(lastMonday.getDate() - 6);
      const weekStart = lastMonday.toISOString().split("T")[0];
      const { data: orgs } = await supabase.from("organizations").select("id");
      for (const org of orgs ?? []) {
        await fetch(
          `${new URL(request.url).origin}/api/weekly-summary/generate?org_id=${org.id}&week_start=${weekStart}`,
          { method: "POST", headers: cronHeaders }
        );
      }
      results.weekly_summary = "generated";
    } catch (e) {
      results.weekly_summary_error = (e as Error).message;
    }
  }

  return NextResponse.json({ success: true, ...results });
}
