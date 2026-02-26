/**
 * Jira OAuth Token Refresh
 * ========================
 * Refreshes an expired Jira OAuth 2.0 access token using the stored refresh_token.
 * Updates org_connectors.credentials with the new token data.
 *
 * Jira OAuth 2.0 tokens expire in ~1 hour. This helper is called automatically
 * by getConnectorToken() before any Jira API call when the token is within
 * 5 minutes of expiry.
 *
 * Atlassian token endpoint: https://auth.atlassian.com/oauth/token
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/**
 * Refreshes an expired Jira OAuth token and writes the new credentials back
 * to org_connectors. Returns the fresh access_token on success, throws on failure.
 *
 * @param supabase      - Service-role client (needs write access to org_connectors)
 * @param connectorId   - org_connectors.id row to update
 * @param refreshToken  - The stored refresh_token from credentials
 * @param clientId      - Jira OAuth app client ID (from env or org-level config)
 * @param clientSecret  - Jira OAuth app client secret
 * @returns Fresh access_token string
 * @throws Error if the refresh request fails (caller should set connector status to 'error')
 */
export async function refreshJiraToken(
  supabase: SupabaseClient,
  connectorId: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  logger.warn("[token-refresh] Refreshing Jira OAuth token", { connectorId });

  const response = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json() as Record<string, unknown>;
      errorDetail = `${errorBody.error ?? response.status}: ${errorBody.error_description ?? response.statusText}`;
    } catch {
      // JSON parse failed — use status text
    }

    logger.error("[token-refresh] Jira token refresh failed", {
      connectorId,
      error: errorDetail,
    });

    // Mark connector as errored so the health indicator turns red
    await supabase
      .from("org_connectors")
      .update({
        status: "error",
        error_message: `Token refresh failed — reconnect required (${errorDetail})`,
      })
      .eq("id", connectorId);

    throw new Error(`Jira token refresh failed: ${errorDetail}`);
  }

  const tokenData = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };

  if (!tokenData.access_token) {
    const msg = "Jira token refresh returned no access_token";
    logger.error("[token-refresh]", msg, { connectorId });

    await supabase
      .from("org_connectors")
      .update({
        status: "error",
        error_message: "Token refresh returned no access_token — reconnect required",
      })
      .eq("id", connectorId);

    throw new Error(msg);
  }

  const expiresIn = tokenData.expires_in ?? 3600;
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Fetch the current credentials to merge (preserve cloud_id, site_url, etc.)
  const { data: row } = await supabase
    .from("org_connectors")
    .select("credentials")
    .eq("id", connectorId)
    .maybeSingle();

  const existingCreds = (row?.credentials as Record<string, unknown>) ?? {};

  const updatedCredentials: Record<string, unknown> = {
    ...existingCreds,
    access_token: tokenData.access_token,
    expires_in: expiresIn,
    expires_at: newExpiresAt,
    // Only update refresh_token if a new one was returned
    // (Atlassian rotates refresh tokens on each use)
    ...(tokenData.refresh_token ? { refresh_token: tokenData.refresh_token } : {}),
    ...(tokenData.scope ? { scope: tokenData.scope } : {}),
  };

  const { error: updateError } = await supabase
    .from("org_connectors")
    .update({
      credentials: updatedCredentials,
      status: "active",
      error_message: null,
    })
    .eq("id", connectorId);

  if (updateError) {
    logger.error("[token-refresh] Failed to persist refreshed token", {
      connectorId,
      error: updateError.message,
    });
    // Still return the new token — it's valid even if we couldn't persist it
    // (next call will refresh again, which is acceptable)
  } else {
    logger.warn("[token-refresh] Jira token refreshed and persisted", {
      connectorId,
      newExpiresAt,
    });
  }

  return tokenData.access_token;
}
