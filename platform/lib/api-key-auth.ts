import { createServiceClient } from "@/lib/supabase/server";
import crypto from "crypto";

/**
 * API Key Authentication for external agents.
 *
 * Validates `Authorization: Bearer nxb_...` headers against the api_keys table.
 * Returns the org ID and permissions if valid, null if invalid.
 */
export async function validateApiKey(
  authHeader: string | null
): Promise<{
  organizationId: string;
  permissions: string[];
  rateLimitPerMinute: number;
} | null> {
  if (!authHeader || !authHeader.startsWith("Bearer nxb_")) {
    return null;
  }

  const rawKey = authHeader.replace("Bearer ", "");
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  try {
    const service = await createServiceClient();
    const { data } = await service.rpc("validate_api_key", {
      p_key_hash: keyHash,
    });

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      organizationId: row.organization_id,
      permissions: row.permissions || ["read"],
      rateLimitPerMinute: row.rate_limit_per_minute || 60,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a new API key.
 * Returns the raw key (show once to user) and the hash (store in DB).
 */
export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const randomBytes = crypto.randomBytes(32).toString("hex");
  const rawKey = `nxb_${randomBytes}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 12);
  return { rawKey, keyHash, keyPrefix };
}
