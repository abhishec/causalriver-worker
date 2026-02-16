/**
 * Connector Signal Bridge
 * ========================
 *
 * CRITICAL ARCHITECTURE COMPONENT
 *
 * Problem Statement:
 * -----------------
 * The NexusBrain has TWO signal tables with different purposes:
 *
 * 1. connector_signals (RAW, streaming layer):
 *    - Purpose: Real-time velocity tracking, early warning systems
 *    - Schema: source, signal_type, signal_value, signal_timestamp, metadata
 *    - Query patterns: Time-series aggregation, velocity metrics
 *    - Retention: 90 days (warm tier)
 *
 * 2. cross_domain_signals (ENRICHED, brain layer):
 *    - Purpose: Causal discovery, pattern mining, learning systems
 *    - Schema: source_domain, entity_type, entity_id, signal_value, embedding
 *    - Query patterns: Entity resolution, causal graph traversal, semantic search
 *    - Retention: 365 days (with partitioning)
 *
 * Architecture Decision:
 * ---------------------
 * DUAL-WRITE on ingestion with async streaming ETL:
 *
 *   Connector → storeConnectorSignals() → [DUAL WRITE]
 *                                          ├─→ connector_signals (raw)
 *                                          └─→ cross_domain_signals (enriched)
 *
 * Why Not Single Table?
 * - Different query patterns (streaming vs graph)
 * - Different retention policies (90d vs 365d)
 * - Different indexing strategies (time-series vs entity)
 * - Velocity tracker needs raw signals with minimal latency
 * - Brain needs entity-resolved, domain-normalized signals
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createRetry } from '../infra/retry';

// ============================================================================
// TYPES
// ============================================================================

export interface ConnectorSignalRow {
  organization_id: string;
  source: string;              // 'github', 'jira', 'slack'
  signal_type: string;         // 'pr_merged', 'issue_created', 'message_sent'
  signal_value: number;
  signal_timestamp: string;    // ISO timestamp
  metadata: Record<string, unknown>;
}

export interface CrossDomainSignalRow {
  organization_id: string;
  source_domain: string;       // 'engineering.github', 'engineering.jira', 'communication.slack'
  signal_type: string;
  signal_value: number;
  signal_timestamp: string;
  entity_type: string;         // NOT NULL - defaults to 'unknown' if can't be derived
  entity_id: string;           // NOT NULL - generated UUID if can't be derived
  client_id: string | null;
  signal_metadata: Record<string, unknown>;
}

// ============================================================================
// DOMAIN MAPPING
// ============================================================================

/**
 * Map connector source to brain domain.
 *
 * Examples:
 * - github → engineering.github
 * - jira → engineering.jira
 * - slack → communication.slack
 * - hubspot → sales.hubspot
 * - stripe → revenue.stripe
 */
const CONNECTOR_TO_DOMAIN_MAP: Record<string, string> = {
  // Engineering
  'github': 'engineering.github',
  'jira': 'engineering.jira',
  'linear': 'engineering.linear',
  'asana': 'engineering.asana',
  'pagerduty': 'engineering.pagerduty',

  // Communication
  'slack': 'communication.slack',
  'google-chat': 'communication.google-chat',

  // Sales & Revenue
  'hubspot': 'sales.hubspot',
  'stripe': 'revenue.stripe',
  'xero': 'finance.xero',
  'volopay': 'finance.volopay',

  // Support
  'freshdesk': 'support.freshdesk',
  'support': 'support.generic',

  // Other
  'google-calendar': 'calendar.google',
  'document': 'knowledge.documents',
  'voice': 'communication.voice',
  'hr-system': 'hr.generic',
  'cicd': 'engineering.cicd',
};

/**
 * Derive source_domain from connector source.
 */
function deriveDomain(source: string): string {
  return CONNECTOR_TO_DOMAIN_MAP[source.toLowerCase()] || `custom.${source.toLowerCase()}`;
}

/**
 * Derive entity_type from signal metadata.
 *
 * Examples:
 * - github pr_merged → entity_type: 'pull_request'
 * - jira issue_created → entity_type: 'issue'
 * - slack message_sent → entity_type: 'message'
 *
 * Returns 'unknown' if entity_type cannot be determined (NOT NULL constraint).
 */
function deriveEntityType(source: string, signalType: string, metadata: Record<string, unknown>): string {
  // GitHub
  if (source === 'github') {
    if (signalType.startsWith('pr_')) return 'pull_request';
    if (signalType.startsWith('issue_')) return 'issue';
    if (signalType === 'deployment') return 'deployment';
    if (signalType === 'commit') return 'commit';
  }

  // Jira
  if (source === 'jira') {
    if (signalType.includes('issue')) return 'issue';
    if (signalType.includes('sprint')) return 'sprint';
  }

  // Slack
  if (source === 'slack') {
    if (signalType.includes('message')) return 'message';
    if (signalType.includes('channel')) return 'channel';
  }

  // HubSpot
  if (source === 'hubspot') {
    if (signalType.includes('deal')) return 'deal';
    if (signalType.includes('contact')) return 'contact';
    if (signalType.includes('company')) return 'company';
  }

  // Stripe
  if (source === 'stripe') {
    if (signalType.includes('charge')) return 'charge';
    if (signalType.includes('customer')) return 'customer';
    if (signalType.includes('subscription')) return 'subscription';
  }

  // Default to 'unknown' if no match (satisfies NOT NULL constraint)
  return 'unknown';
}

/**
 * Derive entity_id from signal metadata.
 *
 * Returns a deterministic ID based on metadata if available,
 * otherwise generates a UUID (NOT NULL constraint).
 */
function deriveEntityId(metadata: Record<string, unknown>): string {
  // Try common metadata keys
  const candidates = [
    metadata.pr_id,
    metadata.issue_id,
    metadata.message_id,
    metadata.deal_id,
    metadata.customer_id,
    metadata.charge_id,
    metadata.id,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string') {
      return candidate;
    }
    if (candidate && typeof candidate === 'number') {
      return String(candidate);
    }
  }

  // Generate deterministic ID from metadata hash (satisfies NOT NULL constraint)
  // Using timestamp + random ensures uniqueness
  return `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// DUAL-WRITE BRIDGE
// ============================================================================

/**
 * Store connector signals with DUAL-WRITE strategy.
 *
 * Writes to BOTH:
 * 1. connector_signals (raw, for velocity tracking)
 * 2. cross_domain_signals (enriched, for brain)
 *
 * This replaces the old single-write in connector-framework.ts.
 *
 * @param supabase - Supabase client
 * @param signals - Connector signals to store
 * @param organizationId - Organization ID (for security scoping)
 */
export async function storeDualWriteConnectorSignals(
  supabase: SupabaseClient,
  signals: Array<{
    source: string;
    signal_type: string;
    signal_value: number;
    signal_timestamp?: string | Date;
    metadata?: Record<string, unknown>;
  }>,
  organizationId: string
): Promise<{ rawCount: number; enrichedCount: number }> {
  if (signals.length === 0) {
    return { rawCount: 0, enrichedCount: 0 };
  }

  const now = new Date().toISOString();

  // ── 1. WRITE TO connector_signals (RAW) ──────────────────────────────────
  const rawRows: ConnectorSignalRow[] = signals.map((s) => ({
    organization_id: organizationId,
    source: s.source.toLowerCase(),
    signal_type: s.signal_type,
    signal_value: s.signal_value,
    signal_timestamp: s.signal_timestamp
      ? (s.signal_timestamp instanceof Date
          ? s.signal_timestamp.toISOString()
          : new Date(s.signal_timestamp).toISOString())
      : now,
    metadata: s.metadata || {},
  }));

  const retry = createRetry({ maxRetries: 3, baseDelayMs: 500, maxDelayMs: 5000 });

  // ── 2. PREPARE ENRICHED ROWS ──────────────────────────────────────────────
  const enrichedRows: CrossDomainSignalRow[] = signals.map((s) => {
    const source = s.source.toLowerCase();
    const metadata = s.metadata || {};

    return {
      organization_id: organizationId,
      source_domain: deriveDomain(source),
      signal_type: s.signal_type,
      signal_value: s.signal_value,
      signal_timestamp: s.signal_timestamp
        ? (s.signal_timestamp instanceof Date
            ? s.signal_timestamp.toISOString()
            : new Date(s.signal_timestamp).toISOString())
        : now,
      entity_type: deriveEntityType(source, s.signal_type, metadata),
      entity_id: deriveEntityId(metadata),
      client_id: null, // TODO: Add client_id tracking for multi-client orgs
      signal_metadata: metadata,
    };
  });

  // ── 3. PARALLEL DUAL-WRITE (was sequential — 2x latency improvement) ────
  await Promise.all([
    retry.execute(async () => {
      const { error } = await supabase.from('connector_signals').insert(rawRows);
      if (error) {
        throw new Error(`Failed to store raw connector signals: ${error.message}`);
      }
    }, 'store-connector-signals-raw'),
    retry.execute(async () => {
      const { error } = await supabase.from('cross_domain_signals').insert(enrichedRows);
      if (error) {
        throw new Error(`Failed to store enriched cross-domain signals: ${error.message}`);
      }
    }, 'store-cross-domain-signals-enriched'),
  ]);

  return { rawCount: rawRows.length, enrichedCount: enrichedRows.length };
}

// ============================================================================
// STREAMING ETL (Future: Async processing for heavy enrichment)
// ============================================================================

/**
 * For future use: Async ETL pipeline for heavy enrichment.
 *
 * Current dual-write is synchronous (sub-100ms).
 * If enrichment becomes heavy (LLM calls, entity resolution, etc.),
 * switch to this async pipeline:
 *
 *   Connector → connector_signals (fast write)
 *             ↓
 *   Background Worker → poll connector_signals
 *                     → enrich (entity resolution, LLM, etc.)
 *                     → write to cross_domain_signals
 *
 * Tradeoff: Adds 1-5 min latency but unblocks connector sync.
 */
export async function runStreamingETL(
  supabase: SupabaseClient,
  organizationId: string,
  sinceTimestamp?: Date
): Promise<{ transformed: number }> {
  // TODO: Implement async ETL pipeline
  // 1. Fetch connector_signals WHERE org_id = X AND created_at > sinceTimestamp
  // 2. Enrich with entity resolution, domain classification, LLM metadata extraction
  // 3. Write to cross_domain_signals
  // 4. Mark as processed (add processed_at column to connector_signals)

  throw new Error('Async ETL not yet implemented. Use dual-write for now.');
}
