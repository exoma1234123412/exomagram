import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { deliverWebhook } from "@/lib/webhooks";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { org_id?: string; url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { org_id, url } = body;

  if (!org_id || !url) {
    return NextResponse.json(
      { error: "org_id and url are required" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const testPayload = {
    event: "test",
    org_id,
    timestamp: new Date().toISOString(),
    message: "This is a test webhook from Exomagram",
  };

  const result = await deliverWebhook(
    supabase,
    org_id,
    url,
    undefined,
    "test",
    testPayload
  );

  if (result.success) {
    return NextResponse.json({
      success: true,
      status_code: result.status_code,
    });
  }

  return NextResponse.json(
    {
      success: false,
      status_code: result.status_code,
      error: "Webhook delivery failed",
    },
    { status: 502 }
  );
}
