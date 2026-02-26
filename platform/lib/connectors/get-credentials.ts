/**
 * Secure credential access for org_connectors
 *
 * Phase 2 migration helper: all credential reads MUST go through these
 * functions, which call the get_connector_credentials() PostgreSQL RPC.
 * The RPC decrypts credentials_encrypted with pgcrypto and returns JSONB.
 *
 * Once all TypeScript reads use these helpers, run:
 *   SELECT finalize_credential_encryption(false);
 * to NULL out the plaintext credentials column.
 *
 * Usage (replaces direct .select("credentials")):
 *
 *   // Before (Phase 1):
 *   const { data } = await service
 *     .from("org_connectors")
 *     .select("credentials, config")
 *     .eq("organization_id", orgId)
 *     .eq("connector_type", "github")
 *     .maybeSingle();
 *
 *   // After (Phase 2):
 *   const { creds, row } = await getConnectorWithCredentials(service, orgId, "github");
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/**
 * Get decrypted credentials for a single connector type.
 * Returns null if the connector doesn't exist or isn't active.
 */
export async function getConnectorCredentials(
  supabase: SupabaseClient,
  organizationId: string,
  connectorType: string
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.rpc("get_connector_credentials", {
      p_organization_id: organizationId,
      p_connector_type: connectorType,
    });

    if (error) {
      logger.warn(`[get-credentials] RPC error for ${connectorType}:`, error.message);
      return null;
    }

    return (data as Record<string, unknown>) ?? null;
  } catch (err) {
    logger.warn(`[get-credentials] Failed to get credentials for ${connectorType}:`, err);
    return null;
  }
}

export interface ConnectorWithCredentials {
  id: string;
  connector_type: string;
  config: Record<string, unknown>;
  status: string;
  signals_count: number | null;
  credentials: Record<string, unknown> | null; // decrypted via RPC
}

/**
 * Get a connector row with its decrypted credentials.
 * Combines a metadata query (id, config, status) with a credentials RPC call.
 *
 * This replaces:
 *   .from("org_connectors").select("id, config, credentials, status").eq(...)
 */
export async function getConnectorWithCredentials(
  supabase: SupabaseClient,
  organizationId: string,
  connectorType: string
): Promise<ConnectorWithCredentials | null> {
  const { data: row, error } = await supabase
    .from("org_connectors")
    .select("id, connector_type, config, status, signals_count")
    .eq("organization_id", organizationId)
    .eq("connector_type", connectorType)
    .eq("status", "active")
    .maybeSingle();

  if (error || !row) return null;

  const credentials = await getConnectorCredentials(supabase, organizationId, connectorType);

  return {
    id: row.id,
    connector_type: row.connector_type,
    config: (row.config as Record<string, unknown>) ?? {},
    status: row.status,
    signals_count: row.signals_count ?? null,
    credentials,
  };
}

/**
 * Get multiple connectors with their decrypted credentials.
 * Replaces multi-connector reads with .in("connector_type", [...]).
 */
export async function getConnectorsWithCredentials(
  supabase: SupabaseClient,
  organizationId: string,
  connectorTypes: string[]
): Promise<ConnectorWithCredentials[]> {
  const { data: rows, error } = await supabase
    .from("org_connectors")
    .select("id, connector_type, config, status, signals_count")
    .eq("organization_id", organizationId)
    .in("connector_type", connectorTypes)
    .in("status", ["active", "connected"]);

  if (error || !rows) return [];

  // Fetch credentials in parallel
  const withCreds = await Promise.all(
    rows.map(async (row) => {
      const credentials = await getConnectorCredentials(
        supabase,
        organizationId,
        row.connector_type
      );
      return {
        id: row.id,
        connector_type: row.connector_type,
        config: (row.config as Record<string, unknown>) ?? {},
        status: row.status,
        signals_count: row.signals_count ?? null,
        credentials,
      };
    })
  );

  return withCreds;
}
