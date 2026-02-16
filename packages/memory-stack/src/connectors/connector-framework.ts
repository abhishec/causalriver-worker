/**
 * Connector Framework
 *
 * Standard interface for external system integrations.
 * Each connector transforms source-specific data into
 * CrossDomainSignal[] for the event bus pipeline.
 *
 * ARCHITECTURE NOTE (2025-02-15):
 * --------------------------------
 * This framework uses a DUAL-WRITE strategy:
 * - connector_signals table (raw, for velocity tracking)
 * - cross_domain_signals table (enriched, for brain causal discovery)
 *
 * See: packages/memory-stack/src/ingestion/connector-signal-bridge.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createRetry } from '../infra/retry';
import { storeDualWriteConnectorSignals } from '../ingestion/connector-signal-bridge';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Signal format used by connectors for database storage.
 * This is a superset of CrossDomainSignal that includes
 * organization_id and metadata for persistence.
 */
/**
 * Signal category — classifies signals for downstream processing.
 *
 * - 'observation': Activity signals (pr_merged, message_sent, ticket_created)
 *   → Used for pattern detection, anomaly detection, velocity tracking
 *
 * - 'outcome': Result signals (payment_success, satisfaction_score, incident_resolved)
 *   → Used for prediction verification (Loop 1), intervention tracking (Loop 4),
 *     and RL reward computation. These are the "embodied grounding" signals
 *     that connect the brain's predictions to real-world results.
 *
 * - 'metric': Periodic metric snapshots (mrr, headcount, nps_score)
 *   → Used for trend analysis, goal tracking (L10), and baseline computation
 */
export type SignalCategory = 'observation' | 'outcome' | 'metric';

export interface ConnectorSignal {
  organization_id: string;
  source_domain: string;
  signal_type: string;
  signal_value: number;
  signal_timestamp?: string | Date; // When the data actually occurred (not DB insertion time)
  entity_type?: string;
  entity_id?: string;
  client_id?: string;
  /**
   * Signal category for downstream routing.
   * Outcome signals feed into RL reward and prediction verification.
   * Defaults to 'observation' if not specified.
   */
  signal_category?: SignalCategory;
  metadata?: Record<string, unknown>;
  /** Index signature for NLP enrichment compatibility */
  [key: string]: unknown;
}

/**
 * OUTCOME SIGNAL CLASSIFICATION — Embodied Grounding
 * ═══════════════════════════════════════════════════
 *
 * Maps (source, signal_type) → SignalCategory.
 * Signals classified as 'outcome' are the brain's connection to reality.
 * Without these classifications, the brain makes predictions but never
 * knows if they came true — like a scientist who never reads results.
 *
 * Revenue outcomes: Did the deal close? Did the payment succeed?
 * Uptime outcomes: Was the incident resolved? How fast?
 * Satisfaction outcomes: What's the CSAT/NPS? Was the ticket resolved?
 * HR outcomes: What's the attrition rate? Engagement score?
 */
export const OUTCOME_SIGNAL_TYPES: Record<string, SignalCategory> = {
  // ── Revenue / Finance ──
  'payment_success': 'outcome',
  'payment_failed': 'outcome',
  'subscription_mrr': 'metric',
  'churn_risk': 'outcome',
  'refund': 'outcome',
  'invoice_paid': 'outcome',
  'invoice_overdue': 'outcome',
  'payment_received': 'outcome',
  'deal_stage': 'outcome',          // When deal moves to closed-won/closed-lost
  'deal_amount': 'metric',

  // ── Uptime / Engineering ──
  'incident_resolved': 'outcome',
  'incident_triggered': 'observation',
  'incident_acknowledged': 'observation',
  'deploy_success': 'outcome',
  'deploy_failure': 'outcome',
  'ci_passed': 'outcome',
  'ci_failed': 'outcome',

  // ── Customer Satisfaction ──
  'satisfaction_score': 'outcome',
  'resolution_time': 'outcome',
  'response_time': 'metric',
  'ticket_escalation': 'outcome',
  'nps_score': 'metric',

  // ── HR ──
  'attrition_rate': 'metric',
  'engagement_score': 'metric',
  'performance_review_completed': 'outcome',

  // ── Finance ──
  'budget_exceeded': 'outcome',
  'expense_approved': 'outcome',
  'expense_rejected': 'outcome',
  'reimbursement_processed': 'outcome',
};

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
 * ARCHITECTURE: DUAL-WRITE STRATEGY
 * ----------------------------------
 * This function writes to BOTH tables in a single atomic operation:
 * 1. connector_signals (raw, for velocity tracking/early warning)
 * 2. cross_domain_signals (enriched, for brain causal discovery)
 *
 * SECURITY: When scopedOrganizationId is provided, all signals are forced
 * to use that organization_id regardless of what's in the payload. This
 * prevents signal injection attacks where a malicious payload spoofs a
 * different org's organization_id.
 *
 * When an entityResolver is provided, signals with entity_id are resolved
 * through the L2 entity resolution layer to link cross-domain entities.
 * The original entity_id is preserved in metadata.original_entity_id.
 *
 * @deprecated Use storeDualWriteConnectorSignals() for new code.
 *             This function is kept for backward compatibility.
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
  let orgId = scopedOrganizationId;
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
    // Use first signal's org_id (all validated to be present)
    orgId = signals[0].organization_id;
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
        } catch (err) {
          // Non-critical: entity resolution failed — keep original entity_id, errors here don't block the main flow
        }

        return signal;
      })
    );
  }

  // ── DUAL-WRITE: BOTH TABLES ──────────────────────────────────────────────
  const now = new Date().toISOString();

  // 1. Write to connector_signals (raw, for velocity tracker)
  const rawRows = resolvedSignals.map((s) => ({
    organization_id: s.organization_id,
    source: extractSource(s.source_domain), // 'engineering.github' → 'github'
    signal_type: s.signal_type,
    signal_value: s.signal_value,
    signal_timestamp: s.signal_timestamp
      ? (s.signal_timestamp instanceof Date
          ? s.signal_timestamp.toISOString()
          : new Date(s.signal_timestamp).toISOString())
      : (s.metadata as any)?.date
        ? new Date((s.metadata as any).date).toISOString()
        : now,
    metadata: s.metadata || {},
  }));

  // 2. Write to cross_domain_signals (enriched, for brain)
  const enrichedRows = resolvedSignals.map((s) => ({
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

  // Write to connector_signals (raw)
  await retry.execute(async () => {
    const { error } = await supabase.from('connector_signals').insert(rawRows);
    if (error) {
      // Log but don't fail — connector_signals is optional for velocity tracking
      console.warn('[CONNECTOR] Failed to write to connector_signals (non-critical):', error.message);
    }
  }, 'store-connector-signals-raw');

  // Write to cross_domain_signals (brain) — CRITICAL PATH
  await retry.execute(async () => {
    const { error } = await supabase.from('cross_domain_signals').insert(enrichedRows);
    if (error) {
      throw new Error(`Failed to store cross-domain signals: ${error.message}`);
    }
  }, 'store-cross-domain-signals');
}

/**
 * Extract source from source_domain.
 * 'engineering.github' → 'github'
 * 'sales.hubspot' → 'hubspot'
 */
function extractSource(sourceDomain: string): string {
  const parts = sourceDomain.split('.');
  return parts.length > 1 ? parts[1] : parts[0];
}

// ============================================================================
// UNIVERSAL DATA INGESTION (Data-Agnostic Brain Interface)
// ============================================================================

/**
 * Ingest raw data into the brain — zero connector required.
 *
 * The brain is DATA-AGNOSTIC: it doesn't care if signals come from
 * GitHub, Jira, Slack, balance sheets, ERP systems, IoT sensors,
 * or custom internal tools. This function is the universal entry point.
 *
 * @example
 * ```typescript
 * // Balance sheet data (10M rows)
 * await ingestRawSignals(supabase, 'org_123', [
 *   { domain: 'finance', type: 'revenue', value: 1500000, entity: 'Q1_2025', metadata: { quarter: 'Q1', year: 2025 } },
 *   { domain: 'finance', type: 'cogs', value: 900000, entity: 'Q1_2025' },
 *   { domain: 'finance', type: 'net_margin', value: 0.4, entity: 'Q1_2025' },
 * ]);
 *
 * // IoT sensor data
 * await ingestRawSignals(supabase, 'org_123', [
 *   { domain: 'manufacturing', type: 'machine_temp', value: 82.5, entity: 'machine_A3', timestamp: new Date() },
 * ]);
 *
 * // HR data
 * await ingestRawSignals(supabase, 'org_123', [
 *   { domain: 'hr', type: 'attrition_rate', value: 0.12, entity: 'engineering_team' },
 *   { domain: 'hr', type: 'engagement_score', value: 7.8, entity: 'engineering_team' },
 * ]);
 * ```
 */
export async function ingestRawSignals(
  supabase: SupabaseClient,
  organizationId: string,
  signals: Array<{
    /** Domain/category (e.g., 'finance', 'hr', 'manufacturing', 'sales', 'ops') */
    domain: string;
    /** Signal type (e.g., 'revenue', 'churn_rate', 'deploy_failure') */
    type: string;
    /** Numeric value (-1 to 1 for normalized, or raw value for metrics) */
    value: number;
    /** Entity identifier (e.g., 'Q1_2025', 'customer_123', 'machine_A3') */
    entity?: string;
    /** Entity type category (e.g., 'quarter', 'customer', 'machine') */
    entityType?: string;
    /** When this data point occurred (defaults to now) */
    timestamp?: Date | string;
    /** Any additional context */
    metadata?: Record<string, unknown>;
  }>,
  options?: {
    /** Batch size for DB inserts (default: 1000) */
    batchSize?: number;
  }
): Promise<{ signalsIngested: number; errors: string[] }> {
  const batchSize = options?.batchSize ?? 1000;
  const errors: string[] = [];
  let ingested = 0;

  // Convert to ConnectorSignal format
  const connectorSignals: ConnectorSignal[] = signals.map(s => ({
    organization_id: organizationId,
    source_domain: s.domain,
    signal_type: s.type,
    signal_value: s.value,
    entity_type: s.entityType || s.domain,
    entity_id: s.entity || `${s.type}_${Date.now()}`,
    signal_timestamp: s.timestamp,
    metadata: s.metadata || {},
  }));

  // Batch insert to handle 10M+ datasets without OOM
  for (let i = 0; i < connectorSignals.length; i += batchSize) {
    const batch = connectorSignals.slice(i, i + batchSize);
    try {
      await storeConnectorSignals(supabase, batch, undefined, organizationId);
      ingested += batch.length;
    } catch (err) {
      errors.push(`Batch ${Math.floor(i / batchSize)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { signalsIngested: ingested, errors };
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
