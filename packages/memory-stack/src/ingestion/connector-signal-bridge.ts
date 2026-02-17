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
import type { DomainTaxonomyInstance } from '../domain-hierarchy/domain-taxonomy';
import { OUTCOME_SIGNAL_TYPES, type SignalCategory } from '../connectors/connector-framework';
import { findSemanticDomains, type SemanticDomainMatch } from '../federation/semantic-federation';

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
 * Uses the flat map as a FALLBACK. When a DomainTaxonomyInstance is provided
 * via setDomainTaxonomy(), the hierarchical taxonomy is used instead,
 * enabling channel-level, project-level, and resource-level domain routing.
 */
let _domainTaxonomy: DomainTaxonomyInstance | null = null;

/**
 * Wire the hierarchical domain taxonomy into the signal bridge.
 * Once set, all signal domain resolution flows through the taxonomy
 * instead of the flat CONNECTOR_TO_DOMAIN_MAP.
 *
 * This is THE critical wire that enables:
 *   - Slack #engineering-backend → engineering.eng-backend (not communication.slack)
 *   - PagerDuty eng-team → engineering.eng-devops (not just engineering.pagerduty)
 *   - Jira MARKETING-123 → marketing.mkt-demand (not just engineering.jira)
 */
export function setDomainTaxonomy(taxonomy: DomainTaxonomyInstance): void {
  _domainTaxonomy = taxonomy;
}

// ============================================================================
// SIGNAL INGESTION LISTENER — CTO Audit Fix: Gap #5
// ============================================================================
//
// When connectors ingest new signals, the brain should be notified so it can
// optionally trigger a cognitive cycle. Without this, the brain only processes
// signals on scheduled cycles (every N minutes), not in real-time.
//
// Usage:
//   import { onSignalsIngested } from '@nexus-ai/memory-stack';
//   onSignalsIngested(async (orgId, signalCount) => {
//     const cortex = getOrCreateCortex(orgId);
//     await cortex.runCycle(buildInputFromSignals(orgId));
//   });

/** Callback for when new signals are ingested */
export type SignalIngestedCallback = (
  organizationId: string,
  signalCount: number,
  source: string
) => void | Promise<void>;

let _signalListeners: SignalIngestedCallback[] = [];

/**
 * Register a callback that fires when new signals are ingested.
 *
 * CTO Audit Fix: Gap #5 — Enables reactive brain cycle triggering.
 *
 * @param callback - Called with (orgId, signalCount, source) after each batch of signals is stored
 * @returns Unsubscribe function
 */
export function onSignalsIngested(callback: SignalIngestedCallback): () => void {
  _signalListeners.push(callback);
  return () => {
    _signalListeners = _signalListeners.filter(cb => cb !== callback);
  };
}

/**
 * Notify all listeners that signals were ingested.
 * Called internally by storeDualWriteConnectorSignals after successful write.
 * Non-blocking — errors in listeners are caught and logged.
 */
function _notifySignalListeners(organizationId: string, signalCount: number, source: string): void {
  for (const listener of _signalListeners) {
    try {
      const result = listener(organizationId, signalCount, source);
      // If listener returns a promise, catch any rejection
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(err => {
          console.warn('[signal-bridge] Listener error:', err);
        });
      }
    } catch (err) {
      console.warn('[signal-bridge] Listener error:', err);
    }
  }
}

/**
 * Classify a signal as observation, outcome, or metric.
 *
 * EMBODIED GROUNDING: This is how the brain connects to reality.
 * Outcome signals tell the brain "this is what actually happened"
 * so predictions can be verified and RL rewards can be computed.
 *
 * Classification hierarchy:
 * 1. Explicit signal_category (if connector sets it)
 * 2. OUTCOME_SIGNAL_TYPES lookup (known outcome signal types)
 * 3. Default to 'observation' (activity signals)
 */
function classifySignalCategory(
  signalType: string,
  explicitCategory?: SignalCategory,
  metadata?: Record<string, unknown>,
): SignalCategory {
  // 1. Explicit category from connector takes precedence
  if (explicitCategory) return explicitCategory;

  // 2. Check the outcome signal type registry
  const registered = OUTCOME_SIGNAL_TYPES[signalType];
  if (registered) return registered;

  // 3. Heuristic: metadata hints
  if (metadata?.is_outcome === true) return 'outcome';
  if (metadata?.is_metric === true) return 'metric';

  // 4. Pattern matching for common outcome patterns
  if (signalType.endsWith('_success') || signalType.endsWith('_failed') ||
      signalType.endsWith('_resolved') || signalType.endsWith('_completed')) {
    return 'outcome';
  }
  if (signalType.endsWith('_rate') || signalType.endsWith('_score') ||
      signalType.endsWith('_mrr') || signalType.endsWith('_nps')) {
    return 'metric';
  }

  // 5. Default: observation (activity signal)
  return 'observation';
}

function deriveDomain(source: string, metadata?: Record<string, unknown>): string {
  // If taxonomy is wired, use hierarchical resolution
  if (_domainTaxonomy && metadata) {
    const resolved = _domainTaxonomy.resolveSignalDomain(source.toLowerCase(), metadata);
    if (resolved.confidence > 0.2) {
      return resolved.hierarchicalPath;
    }
  }
  // Fallback to flat map
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
  // Now includes:
  // - signal_category for embodied grounding (Phase 2)
  // - semantic_domains for cross-domain discovery (Semantic Federation)
  //
  // Semantic domain routing enables the brain to discover relationships that
  // string matching cannot: a "deploy_failure" signal routes to BOTH
  // "engineering" AND "customer_impact" because the embedding captures
  // the semantic overlap between deployment failures and customer experience.
  const enrichedRows: CrossDomainSignalRow[] = signals.map((s) => {
    const source = s.source.toLowerCase();
    const metadata = s.metadata || {};
    const category = classifySignalCategory(
      s.signal_type,
      (s as any).signal_category,
      metadata,
    );

    const primaryDomain = deriveDomain(source, metadata);

    // Semantic domain routing: find all semantically related domains
    // This is the brain's association cortex — signals don't just go to
    // their primary domain, they also activate semantically related domains.
    const signalText = `${source} ${s.signal_type} ${
      metadata?.description || metadata?.title || metadata?.summary || ''
    }`.trim();

    let semanticDomains: Array<{ domain: string; similarity: number }> | undefined;
    try {
      const matches = findSemanticDomains(signalText, primaryDomain);
      // Only include matches above routing threshold (default 0.65)
      // Filter out the primary domain (it's already assigned)
      const secondaryMatches = matches
        .filter(m => m.domain !== primaryDomain && !m.isPrimary)
        .slice(0, 5) // Max 5 secondary domains per signal
        .map(m => ({ domain: m.domain, similarity: Math.round(m.similarity * 100) / 100 }));

      if (secondaryMatches.length > 0) {
        semanticDomains = secondaryMatches;
      }
    } catch {
      // Semantic routing is non-critical — never block signal ingestion
    }

    return {
      organization_id: organizationId,
      source_domain: primaryDomain,
      signal_type: s.signal_type,
      signal_value: s.signal_value,
      signal_timestamp: s.signal_timestamp
        ? (s.signal_timestamp instanceof Date
            ? s.signal_timestamp.toISOString()
            : new Date(s.signal_timestamp).toISOString())
        : now,
      entity_type: deriveEntityType(source, s.signal_type, metadata),
      entity_id: deriveEntityId(metadata),
      client_id: (metadata?.client_id as string) || (metadata?.account_id as string) || null,
      signal_metadata: {
        ...metadata,
        signal_category: category,
        ...(semanticDomains ? { semantic_domains: semanticDomains } : {}),
      },
    };
  });

  // ── 3. TRANSACTIONAL DUAL-WRITE (ACID-guaranteed via RPC) ─────────────────
  //
  // Uses PostgreSQL transaction via Supabase RPC to ensure both inserts
  // succeed or both rollback. Eliminates partial-write inconsistency.
  //
  // Falls back to parallel Promise.all if RPC is not available (e.g. test env).
  //
  const result = await retry.execute(async () => {
    // Try transactional RPC first (ACID-guaranteed)
    const { data, error: rpcError } = await supabase.rpc('insert_dual_signals', {
      p_organization_id: organizationId,
      p_raw_signals: rawRows.map(r => ({
        source: r.source,
        signal_type: r.signal_type,
        signal_value: r.signal_value,
        signal_timestamp: r.signal_timestamp,
        metadata: r.metadata,
      })),
      p_enriched_signals: enrichedRows.map(r => ({
        source_domain: r.source_domain,
        signal_type: r.signal_type,
        signal_value: r.signal_value,
        signal_timestamp: r.signal_timestamp,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        client_id: r.client_id,
        signal_metadata: r.signal_metadata,
      })),
    });

    if (rpcError) {
      // If RPC function doesn't exist yet, fall back to parallel writes
      if (rpcError.message.includes('function') && rpcError.message.includes('does not exist')) {
        await Promise.all([
          (async () => {
            const { error } = await supabase.from('connector_signals').insert(rawRows);
            if (error) throw new Error(`Failed to store raw connector signals: ${error.message}`);
          })(),
          (async () => {
            const { error } = await supabase.from('cross_domain_signals').insert(enrichedRows);
            if (error) throw new Error(`Failed to store enriched cross-domain signals: ${error.message}`);
          })(),
        ]);
        return { rawCount: rawRows.length, enrichedCount: enrichedRows.length };
      }
      throw new Error(`Dual-write transaction failed: ${rpcError.message}`);
    }

    const counts = data as { raw_count: number; enriched_count: number };
    return { rawCount: counts.raw_count, enrichedCount: counts.enriched_count };
  }, 'dual-write-signals');

  // CTO Audit Fix (Gap #5): Notify listeners that new signals arrived
  // This enables reactive brain cycle triggering when connectors ingest data
  if (result.enrichedCount > 0 && _signalListeners.length > 0) {
    const source = signals[0]?.source || 'unknown';
    _notifySignalListeners(organizationId, result.enrichedCount, source);
  }

  return result;
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
  const BATCH_SIZE = 500;
  let transformed = 0;

  // 1. Fetch unprocessed connector_signals
  const since = sinceTimestamp
    ? sinceTimestamp.toISOString()
    : new Date(Date.now() - 24 * 3600000).toISOString(); // Default: last 24h

  const { data: rawSignals } = await supabase
    .from('connector_signals')
    .select('id, connector_type, signal_type, signal_value, entity_type, entity_id, metadata, created_at')
    .eq('organization_id', organizationId)
    .is('processed_at', null)          // Only unprocessed signals
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (!rawSignals?.length) {
    return { transformed: 0 };
  }

  // 2. Enrich: domain classification + entity resolution from metadata
  const enrichedSignals = rawSignals.map((raw: any) => {
    const metadata = raw.metadata ?? {};
    // Domain classification: connector_type → source_domain (hierarchical)
    const sourceDomain = metadata.source_domain
      || `${raw.connector_type}.${metadata.sub_domain || 'general'}`;

    // Client ID extraction for multi-tenant orgs
    const clientId = metadata.client_id || metadata.account_id || null;

    return {
      organization_id: organizationId,
      source_domain: sourceDomain,
      signal_type: raw.signal_type,
      signal_value: raw.signal_value,
      entity_type: raw.entity_type || raw.connector_type,
      entity_id: raw.entity_id || `${raw.connector_type}_${raw.id}`,
      client_id: clientId,
      signal_metadata: {
        ...metadata,
        etl_source: 'streaming_etl',
        raw_signal_id: raw.id,
        connector_type: raw.connector_type,
      },
      created_at: raw.created_at,
    };
  });

  // 3. Batch insert into cross_domain_signals
  for (let i = 0; i < enrichedSignals.length; i += 100) {
    const batch = enrichedSignals.slice(i, i + 100);
    const { error: insertErr } = await supabase
      .from('cross_domain_signals')
      .insert(batch);

    if (!insertErr) {
      transformed += batch.length;
    }
  }

  // 4. Mark as processed
  const processedIds = rawSignals.map((r: any) => r.id);
  await supabase
    .from('connector_signals')
    .update({ processed_at: new Date().toISOString() })
    .in('id', processedIds);

  return { transformed };
}
