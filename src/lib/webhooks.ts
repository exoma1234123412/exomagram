import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * Dispatch an outgoing webhook to all active custom_webhook integrations for an org.
 * Never throws — failures are logged and recorded in webhook_deliveries.
 */
export async function dispatchWebhook(
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Look up active webhooks for this org
    const { data: webhooks, error: lookupError } = await supabase
      .from("integration_configs")
      .select("id, config")
      .eq("org_id", orgId)
      .eq("provider", "custom_webhook")
      .eq("status", "connected");

    if (lookupError) {
      console.error(
        `[webhooks] Failed to look up webhooks for org ${orgId}:`,
        lookupError.message
      );
      return;
    }

    if (!webhooks || webhooks.length === 0) return;

    for (const webhook of webhooks) {
      const url = webhook.config?.url as string | undefined;
      const secret = webhook.config?.secret as string | undefined;

      if (!url) {
        console.warn(
          `[webhooks] Webhook ${webhook.id} has no URL configured, skipping`
        );
        continue;
      }

      await deliverWebhook(supabase, orgId, url, secret, eventType, payload);
    }
  } catch (err) {
    console.error(`[webhooks] Unexpected error dispatching webhooks:`, err);
  }
}

/**
 * Send a single webhook delivery and record the result.
 * Exported so the test endpoint can use it directly.
 */
export async function deliverWebhook(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  orgId: string,
  url: string,
  secret: string | undefined,
  eventType: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; status_code: number | null }> {
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Exomagram-Event": eventType,
  };

  if (secret) {
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    headers["X-Exomagram-Signature"] = signature;
  }

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    statusCode = response.status;
    responseBody = await response.text().catch(() => null);
    success = response.ok;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown delivery error";
    console.error(`[webhooks] Delivery to ${url} failed:`, message);
    responseBody = message;
  }

  // Record delivery
  try {
    await supabase.from("webhook_deliveries").insert({
      org_id: orgId,
      url,
      event_type: eventType,
      payload,
      status_code: statusCode,
      response_body: responseBody,
      success,
    });
  } catch (recordErr) {
    console.error(`[webhooks] Failed to record delivery:`, recordErr);
  }

  return { success, status_code: statusCode };
}
