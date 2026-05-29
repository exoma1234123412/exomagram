import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET /api/cron/emails — Triggered by scheduler (Vercel Cron, external cron, etc.)
// Checks the current hour and sends the appropriate emails:
//   8am  → morning_kick (everyone)
//   1pm  → midday_check (underperformers)
//   6pm  → end_of_day (everyone) + shame (D/F) + manager_digest (admins/owners)
//   Friday 6pm → also weekly_report (everyone)

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

  // Get current time in Mexico City timezone
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" })
  );
  const currentHour = now.getHours();
  const dayOfWeek = now.getDay(); // 0=Sunday, 5=Friday
  const today = now.toISOString().split("T")[0];

  // Skip weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return NextResponse.json({
      success: true,
      message: "Weekend — no emails sent",
      hour: currentHour,
      day: dayOfWeek,
    });
  }

  // Get all organizations
  const { data: orgs } = await supabase.from("organizations").select("id");
  if (!orgs || orgs.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No organizations found",
    });
  }

  const origin = new URL(request.url).origin;
  const results: Record<string, unknown> = {
    hour: currentHour,
    day_of_week: dayOfWeek,
    date: today,
    orgs_processed: orgs.length,
  };

  // Determine which email types to send based on current hour
  const emailsToSend: string[] = [];

  if (currentHour === 8) {
    emailsToSend.push("morning_kick");
  } else if (currentHour === 13) {
    emailsToSend.push("midday_check");
  } else if (currentHour === 18) {
    emailsToSend.push("end_of_day");
    emailsToSend.push("shame");
    emailsToSend.push("manager_digest");

    if (dayOfWeek === 5) {
      emailsToSend.push("weekly_report");
    }
  }

  if (emailsToSend.length === 0) {
    return NextResponse.json({
      success: true,
      message: `No emails scheduled for hour ${currentHour}`,
      hour: currentHour,
    });
  }

  results.emails_triggered = emailsToSend;

  // Send emails for each org and each type
  for (const org of orgs) {
    const orgResults: Record<string, unknown> = {};

    for (const emailType of emailsToSend) {
      try {
        const res = await fetch(`${origin}/api/emails/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
          },
          body: JSON.stringify({
            type: emailType,
            org_id: org.id,
            date: today,
          }),
        });

        const data = await res.json();
        orgResults[emailType] = {
          status: res.status,
          sent: data.sent ?? 0,
          failed: data.failed ?? 0,
        };
      } catch (err) {
        orgResults[emailType] = {
          status: "error",
          error: (err as Error).message,
        };
      }
    }

    results[`org_${org.id}`] = orgResults;
  }

  return NextResponse.json({ success: true, ...results });
}
