import { createClient } from "@supabase/supabase-js";

/**
 * Create a Supabase admin client using the service role key.
 * This bypasses RLS so API routes can read/write across orgs
 * after verifying the caller's API key.
 */
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface ApiKeyPayload {
  orgId: string;
  permissions: string[];
}

/**
 * Verify a Bearer token from the Authorization header against the api_keys table.
 *
 * Flow:
 * 1. Extract the token from `Authorization: Bearer <token>`
 * 2. Derive key_prefix (first 8 chars) and look it up
 * 3. Check not revoked & not expired
 * 4. Update last_used_at
 * 5. Return { orgId, permissions } or null
 *
 * NOTE: The key_hash column stores the full key. In a real-world deployment
 * you would hash the token and compare hashes. Here we compare the raw
 * value stored in key_hash for simplicity (the column already exists and
 * the integrations page stores the raw key there).
 */
export async function verifyApiKey(
  request: Request
): Promise<ApiKeyPayload | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;

  const token = parts[1];
  if (!token || token.length < 8) return null;

  const keyPrefix = token.substring(0, 8);

  const supabase = createServiceClient();

  // Look up by prefix
  const { data: keyRow, error } = await supabase
    .from("api_keys")
    .select("id, org_id, key_hash, permissions, expires_at, revoked")
    .eq("key_prefix", keyPrefix)
    .eq("revoked", false)
    .maybeSingle();

  if (error || !keyRow) return null;

  // Verify the full key matches
  if (keyRow.key_hash !== token) return null;

  // Check expiry
  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return null;
  }

  // Update last_used_at (fire and forget)
  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id)
    .then(() => {});

  return {
    orgId: keyRow.org_id,
    permissions: keyRow.permissions ?? ["read"],
  };
}

export { createServiceClient };
