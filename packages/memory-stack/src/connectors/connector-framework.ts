/**
 * Connector Framework
 *
 * Standard interface for external system integrations.
 * Each connector transforms source-specific data into
 * CrossDomainSignal[] for the event bus pipeline.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createRetry } from '../infra/retry';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Signal format used by connectors for database storage.
 * This is a superset of CrossDomainSignal that includes
 * organization_id and metadata for persistence.
 */
export interface ConnectorSignal {
  organization_id: string;
  source_domain: string;
  signal_type: string;
  signal_value: number;
  signal_timestamp?: string | Date; // When the data actually occurred (not DB insertion time)
  entity_type?: string;
  entity_id?: string;
  client_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorSyncResult {
  success: boolean;
  signalsGenerated: number;
  recordsProcessed: number;
  errors: string[];
  duration_ms: number;
  lastSyncedAt: Date;
}

export interface NexusConnector {
  /** Unique connector identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Domain this connector feeds (finance, revenue, cs, etc.) */
  domain: string;
  /** Full sync from source system */
  fullSync(
    supabase: SupabaseClient,
    organizationId: string
  ): Promise<ConnectorSyncResult>;
  /** Incremental sync since last sync */
  incrementalSync(
    supabase: SupabaseClient,
    organizationId: string,
    since: Date
  ): Promise<ConnectorSyncResult>;
  /** Handle real-time webhook from source system (optional) */
  handleWebhook?(payload: unknown): ConnectorSignal[];
}

// ============================================================================
// ENTITY RESOLUTION INTEGRATION
// ============================================================================

/**
 * Entity resolver hook for connectors.
 * When provided to storeConnectorSignals, signals are resolved through
 * the entity resolver to link cross-domain entities.
 */
export interface ConnectorEntityResolver {
  resolve(input: {
    source: string;
    externalId: string;
    displayName?: string;
    entityType?: string;
    email?: string;
    domain?: string;
  }): Promise<{ canonicalId: string; confidence: number } | null>;
}

// ============================================================================
// CAUSAL SIGNAL WEIGHTING
// ============================================================================

/**
 * Causal prior for signal weighting.
 * When the causal graph knows that domain X has a strong effect on domain Y,
 * signals from domain X get a causal importance weight.
 */
export interface CausalSignalWeight {
  /** Domain name (e.g., "engineering") */
  domain: string;
  /** Causal importance weight (0-2, default: 1.0). Higher = stronger causal role */
  weight: number;
}

/**
 * Apply causal graph priors to weight incoming signals.
 *
 * Domains that are strong causal drivers (many outgoing edges, high effect sizes)
 * get their signals amplified. This makes the brain pay more attention to
 * signals from domains that drive cross-domain effects.
 *
 * The weight is stored in signal_metadata.causal_weight for downstream
 * processing (anomaly detection, pattern mining, etc.)
 *
 * @param signals - Incoming connector signals
 * @param causalWeights - Causal weights per domain (from causal graph analysis)
 * @returns Signals with causal_weight in metadata
 */
export function applyCausalSignalWeights(
  signals: ConnectorSignal[],
  causalWeights: CausalSignalWeight[]
): ConnectorSignal[] {
  if (causalWeights.length === 0) return signals;

  const weightMap = new Map(causalWeights.map(w => [w.domain.toLowerCase(), w.weight]));

  return signals.map(signal => {
    const domain = signal.source_domain.toLowerCase();
    const causalWeight = weightMap.get(domain);

    if (causalWeight !== undefined && causalWeight !== 1.0) {
      return {
        ...signal,
        metadata: {
          ...signal.metadata,
          causal_weight: causalWeight,
          original_value: signal.signal_value,
        },
      };
    }

    return signal;
  });
}

/**
 * Compute causal weights from a set of causal graph edges.
 *
 * For each domain, the weight is based on:
 * - Number of outgoing edges (how many things it causes)
 * - Average effect size of outgoing edges
 * - Normalized to 0.5-2.0 range
 *
 * Domains with no causal role get weight 1.0 (neutral).
 */
export function computeCausalWeightsFromEdges(
  edges: Array<{
    sourceDomain: string;
    targetDomain: string;
    effectSize: number;
    knockoutScore?: number;
    isLikelyConfounded?: boolean;
  }>
): CausalSignalWeight[] {
  const domainStats = new Map<string, { outCount: number; totalEffect: number }>();

  for (const edge of edges) {
    const src = edge.sourceDomain.toLowerCase();
    const existing = domainStats.get(src) || { outCount: 0, totalEffect: 0 };
    existing.outCount++;
    // Discount confounded edges (CF knockout disagrees with VAR)
    const confoundDiscount = edge.isLikelyConfounded ? 0.5 : 1.0;
    // Slight boost for knockout-validated edges (empirically proven true causes)
    const knockoutBoost = (edge.knockoutScore !== undefined && edge.knockoutScore > 0.5) ? 1.1 : 1.0;
    existing.totalEffect += Math.abs(edge.effectSize) * confoundDiscount * knockoutBoost;
    domainStats.set(src, existing);
  }

  if (domainStats.size === 0) return [];

  // Find max score for normalization
  const scores = new Map<string, number>();
  let maxScore = 0;
  for (const [domain, stats] of domainStats) {
    const score = stats.outCount * (stats.totalEffect / stats.outCount);
    scores.set(domain, score);
    maxScore = Math.max(maxScore, score);
  }

  // Normalize to 0.5 - 2.0 range
  const weights: CausalSignalWeight[] = [];
  for (const [domain, score] of scores) {
    const normalized = maxScore > 0
      ? 0.5 + (score / maxScore) * 1.5
      : 1.0;
    weights.push({ domain, weight: Math.round(normalized * 100) / 100 });
  }

  return weights;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Store signals generated by a connector into the database.
 *
 * SECURITY: When scopedOrganizationId is provided, all signals are forced
 * to use that organization_id regardless of what's in the payload. This
 * prevents signal injection attacks where a malicious payload spoofs a
 * different org's organization_id.
 *
 * When an entityResolver is provided, signals with entity_id are resolved
 * through the L2 entity resolution layer to link cross-domain entities.
 * The original entity_id is preserved in metadata.original_entity_id.
 */
export async function storeConnectorSignals(
  supabase: SupabaseClient,
  signals: ConnectorSignal[],
  entityResolver?: ConnectorEntityResolver,
  scopedOrganizationId?: string
): Promise<void> {
  if (signals.length === 0) return;

  // SECURITY: Enforce organization_id scoping to prevent cross-tenant injection.
  // When scopedOrganizationId is provided, override all signal org IDs.
  // When not provided, validate that all signals have an organization_id.
  if (scopedOrganizationId) {
    signals = signals.map((s) => ({
      ...s,
      organization_id: scopedOrganizationId,
    }));
  } else {
    // Validate every signal has an organization_id
    const missingOrgId = signals.filter((s) => !s.organization_id);
    if (missingOrgId.length > 0) {
      throw new Error(
        `Signal injection blocked: ${missingOrgId.length} signal(s) missing organization_id. ` +
        `Provide scopedOrganizationId parameter or ensure all signals have organization_id.`
      );
    }
  }

  // Resolve entities through L2 if resolver is provided
  let resolvedSignals = signals;
  if (entityResolver) {
    resolvedSignals = await Promise.all(
      signals.map(async (signal) => {
        if (!signal.entity_id || !signal.entity_type) return signal;

        try {
          const resolved = await entityResolver.resolve({
            source: signal.source_domain,
            externalId: signal.entity_id,
            displayName: signal.metadata?.display_name as string | undefined,
            entityType: signal.entity_type,
            email: signal.metadata?.email as string | undefined,
            domain: signal.metadata?.domain as string | undefined,
          });

          if (resolved) {
            return {
              ...signal,
              entity_id: resolved.canonicalId,
              metadata: {
                ...signal.metadata,
                original_entity_id: signal.entity_id,
                resolution_confidence: resolved.confidence,
              },
            };
          }
        } catch {
          // Entity resolution failure is non-fatal — keep original entity_id
        }

        return signal;
      })
    );
  }

  const now = new Date().toISOString();
  const rows = resolvedSignals.map((s) => ({
    organization_id: s.organization_id,
    source_domain: s.source_domain.toLowerCase(),
    signal_type: s.signal_type,
    signal_value: s.signal_value,
    signal_timestamp: s.signal_timestamp
      ? (s.signal_timestamp instanceof Date
          ? s.signal_timestamp.toISOString()
          : new Date(s.signal_timestamp).toISOString())
      : (s.metadata as any)?.date
        ? new Date((s.metadata as any).date).toISOString()
        : now,
    entity_type: s.entity_type || null,
    entity_id: s.entity_id || null,
    client_id: s.client_id || null,
    signal_metadata: s.metadata || {},
    created_at: now,
  }));

  // Retry transient Supabase failures (timeouts, connection resets)
  const retry = createRetry({ maxRetries: 3, baseDelayMs: 500, maxDelayMs: 5000 });
  await retry.execute(async () => {
    const { error } = await supabase.from('cross_domain_signals').insert(rows);
    if (error) {
      throw new Error(`Failed to store connector signals: ${error.message}`);
    }
  }, 'store-connector-signals');
}

/**
 * Record sync result in tracking table
 */
export async function recordSyncResult(
  supabase: SupabaseClient,
  connectorId: string,
  organizationId: string,
  result: ConnectorSyncResult
): Promise<void> {
  const retry = createRetry({ maxRetries: 2, baseDelayMs: 500, maxDelayMs: 3000 });
  await retry.execute(async () => {
    const { error } = await supabase.from('connector_sync_log').insert({
      connector_id: connectorId,
      organization_id: organizationId,
      success: result.success,
      signals_generated: result.signalsGenerated,
      records_processed: result.recordsProcessed,
      errors: result.errors,
      duration_ms: result.duration_ms,
      synced_at: result.lastSyncedAt.toISOString(),
    });
    if (error) {
      throw new Error(`Failed to record sync result: ${error.message}`);
    }
  }, 'record-sync-result');
}
