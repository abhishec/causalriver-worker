/**
 * Token-Aware Connector Client
 * ============================
 * Gets a valid access token for a connector, automatically refreshing if expired.
 *
 * This is the single entry point for retrieving tokens before any connector API
 * call. It enforces the 5-minute expiry buffer and handles Jira's short-lived
 * OAuth 2.0 tokens transparently.
 *
 * Token expiry model:
 * - Jira OAuth 2.0: expires in ~1 hour, has refresh_token, auto-refreshed here.
 * - GitHub classic tokens: do not expire, no refresh needed.
 * - GitHub App installation tokens: expire but are regenerated from private key
 *   at the install layer — not handled here.
 * - Slack bot tokens: do not expire, no refresh needed.
 * - Confluence: uses same Atlassian OAuth as Jira, auto-refreshed here.
 *
 * Usage:
 *   const token = await getConnectorToken(serviceClient, orgId, 'jira');
 *   if (!token) { return 404; }  // Connector not connected
 *   // use token in Authorization: Bearer header
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { refreshJiraToken } from "@/lib/connectors/token-refresh";
import { getConnectorCredentials } from "@/lib/connectors/get-credentials";

/** Connectors that use expiring OAuth 2.0 tokens and support refresh */
const REFRESHABLE_CONNECTOR_TYPES = new Set(["jira", "confluence"]);

/** Refresh if within this many milliseconds of expiry */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export interface ConnectorTokenResult {
  /** The valid access token, or null if connector not found / has no token */
  token: string | null;
  /** The connector row id (useful for callers that need to update status) */
  connectorId: string | null;
}

/**
 * Gets a valid access token for a connector, refreshing if expired.
 *
 * Checks credentials->expires_at before returning. If within 5 minutes of
 * expiry (or already expired), calls refreshJiraToken() for Jira/Confluence.
 *
 * @param supabase        - Service-role Supabase client (bypasses RLS)
 * @param organizationId  - The org to look up the connector for
 * @param connectorType   - 'jira' | 'github' | 'slack' | 'confluence'
 * @returns Token string (fresh or refreshed), or null if not found/no token
 */
export async function getConnectorToken(
  supabase: SupabaseClient,
  organizationId: string,
  connectorType: "jira" | "github" | "slack" | "confluence"
): Promise<string | null> {
  const result = await getConnectorTokenWithId(supabase, organizationId, connectorType);
  return result.token;
}

/**
 * Same as getConnectorToken but also returns the connector row ID.
 * Used by callers that need to update connector status on API failure.
 */
export async function getConnectorTokenWithId(
  supabase: SupabaseClient,
  organizationId: string,
  connectorType: "jira" | "github" | "slack" | "confluence"
): Promise<ConnectorTokenResult> {
  try {
    // Fetch the connector row — only active connectors (no plaintext credentials column)
    const { data: row, error } = await supabase
      .from("org_connectors")
      .select("id, status")
      .eq("organization_id", organizationId)
      .eq("connector_type", connectorType)
      .in("status", ["active", "connected"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn("[get-connector-token] Query error", {
        organizationId,
        connectorType,
        error: error.message,
      });
      return { token: null, connectorId: null };
    }

    if (!row) {
      // No active connector — caller should show "connect" flow
      return { token: null, connectorId: null };
    }

    const connectorId = row.id as string;

    // Use secure RPC to get decrypted credentials (Phase 2: no plaintext read)
    const credentials = await getConnectorCredentials(supabase, organizationId, connectorType);

    if (!credentials) {
      logger.warn("[get-connector-token] Connector has no credentials (encrypted lookup returned null)", {
        connectorId,
        connectorType,
      });
      return { token: null, connectorId };
    }

    const accessToken = credentials.access_token;

    // Non-OAuth connectors (GitHub classic tokens, Slack bot tokens, API keys):
    // just return the token as-is, no expiry check needed.
    if (!REFRESHABLE_CONNECTOR_TYPES.has(connectorType)) {
      if (typeof accessToken !== "string" || !accessToken) {
        logger.warn("[get-connector-token] Non-OAuth connector has no access_token", {
          connectorId,
          connectorType,
        });
        return { token: null, connectorId };
      }
      return { token: accessToken, connectorId };
    }

    // OAuth connectors (Jira, Confluence): check expiry
    const expiresAt = credentials.expires_at;
    const refreshToken = credentials.refresh_token;

    if (typeof expiresAt === "string" && expiresAt) {
      const expiresAtMs = new Date(expiresAt).getTime();
      const msUntilExpiry = expiresAtMs - Date.now();

      if (msUntilExpiry <= EXPIRY_BUFFER_MS) {
        // Token is expired or within 5 minutes of expiry — refresh it
        if (typeof refreshToken !== "string" || !refreshToken) {
          logger.warn("[get-connector-token] Token expired but no refresh_token stored", {
            connectorId,
            connectorType,
            expiresAt,
          });
          // Mark as error so UI shows reconnect button
          await supabase
            .from("org_connectors")
            .update({
              status: "error",
              error_message: "Token expired — reconnect required (no refresh token available)",
            })
            .eq("id", connectorId);
          return { token: null, connectorId };
        }

        logger.warn("[get-connector-token] Token expired, attempting refresh", {
          connectorId,
          connectorType,
          expiresAt,
          msUntilExpiry,
        });

        // Load OAuth client credentials for refresh
        const { clientId, clientSecret } = await getOAuthClientCredentials(
          supabase,
          organizationId,
          connectorType
        );

        if (!clientId || !clientSecret) {
          logger.error("[get-connector-token] Cannot refresh — OAuth client credentials not found", {
            connectorId,
            connectorType,
          });
          await supabase
            .from("org_connectors")
            .update({
              status: "error",
              error_message: "Token expired and OAuth credentials not configured — reconnect required",
            })
            .eq("id", connectorId);
          return { token: null, connectorId };
        }

        try {
          const freshToken = await refreshJiraToken(
            supabase,
            connectorId,
            refreshToken,
            clientId,
            clientSecret
          );
          return { token: freshToken, connectorId };
        } catch (refreshErr) {
          // refreshJiraToken already set status='error' and logged
          return { token: null, connectorId };
        }
      }
    }

    // Token is valid and not near expiry — return it
    if (typeof accessToken !== "string" || !accessToken) {
      logger.warn("[get-connector-token] OAuth connector has no access_token in credentials", {
        connectorId,
        connectorType,
      });
      return { token: null, connectorId };
    }

    return { token: accessToken, connectorId };
  } catch (err) {
    logger.error("[get-connector-token] Unexpected error", {
      organizationId,
      connectorType,
      error: err instanceof Error ? err.message : String(err),
    });
    return { token: null, connectorId: null };
  }
}

/**
 * Marks a connector as errored when an API call returns 401/403.
 * Call this from connector sync routes when the API rejects the token.
 */
export async function markConnectorError(
  supabase: SupabaseClient,
  connectorId: string,
  errorMessage: string
): Promise<void> {
  try {
    await supabase
      .from("org_connectors")
      .update({
        status: "error",
        error_message: errorMessage,
      })
      .eq("id", connectorId);

    logger.warn("[get-connector-token] Connector marked as errored", {
      connectorId,
      errorMessage,
    });
  } catch (err) {
    logger.error("[get-connector-token] Failed to mark connector error", {
      connectorId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Load OAuth client credentials for token refresh.
 * Checks org-level credentials first (via get_org_oauth_credentials RPC),
 * then falls back to platform-level env vars.
 */
async function getOAuthClientCredentials(
  supabase: SupabaseClient,
  organizationId: string,
  connectorType: string
): Promise<{ clientId: string | null; clientSecret: string | null }> {
  // Try org-level credentials first
  try {
    const { data: orgOAuthData } = await supabase.rpc("get_org_oauth_credentials", {
      p_organization_id: organizationId,
      p_connector_type: connectorType,
    });

    if (orgOAuthData?.client_id && orgOAuthData?.client_secret) {
      return {
        clientId: orgOAuthData.client_id as string,
        clientSecret: orgOAuthData.client_secret as string,
      };
    }
  } catch {
    // RPC may not exist in all environments — fall through to env vars
  }

  // Fall back to platform-level env vars
  const envPrefix = connectorType.toUpperCase(); // JIRA_CLIENT_ID, CONFLUENCE_CLIENT_ID, etc.
  const clientId = process.env[`${envPrefix}_CLIENT_ID`] ?? null;
  const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`] ?? null;

  return { clientId, clientSecret };
}
