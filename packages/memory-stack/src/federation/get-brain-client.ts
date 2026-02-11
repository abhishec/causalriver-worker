/**
 * Brain Client Factory — Provides Supabase client for federated table access
 * ==========================================================================
 *
 * Brain Analog: Synaptic vesicle pool — the chemical machinery that lets one
 * neuron talk to another across the synapse. Without it, no signal crosses.
 *
 * This module provides the Supabase client used by the Federated Brain to
 * query both ORG and CORE brain tables. In edge-function (Deno) environments,
 * a different implementation may be used.
 *
 * TODO: implement full edge-function client with per-table routing
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// Module-level client reference — set via `setBrainClient()`
let _client: SupabaseClient | null = null;

/**
 * Initialize the brain client for federated queries.
 * Must be called once at startup before any federated queries.
 */
export function setBrainClient(client: SupabaseClient): void {
  _client = client;
}

/**
 * Get a Supabase client for the given table.
 * In the current implementation, all tables share one client.
 * Future: per-table routing for edge-function environments.
 *
 * @param _tableName - The table to query (reserved for future routing)
 * @returns A Supabase client instance
 * @throws Error if setBrainClient() has not been called
 */
export function getClientForTableInEdge(_tableName: string): SupabaseClient {
  if (!_client) {
    throw new Error(
      '[BrainClient] No Supabase client configured. Call setBrainClient() at startup. ' +
      'Brain Analog: synaptic vesicle pool is empty — no signals can cross the synapse.'
    );
  }
  return _client;
}
