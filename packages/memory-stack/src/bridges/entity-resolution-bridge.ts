/**
 * Bridge 0: Entity Resolution
 *
 * Sits BEFORE the Signal → EventBus bridge in the pipeline.
 * For every incoming signal, resolves the entity referenced in
 * `entity_id` / `entity_type` to a canonical Nexus entity ID
 * using the 3-tier entity resolver (exact → fuzzy → federated).
 *
 * After resolution, the signal's `entity_id` is replaced with
 * the canonical UUID so that all downstream layers (causal
 * discovery, pattern learning, agent context) operate on
 * consistent identity across GitHub, Jira, Slack, Freshworks, etc.
 *
 * The raw external ID is preserved in `signal_metadata._raw_entity_id`
 * and resolution metadata is written to `signal_metadata._entity_resolution`.
 *
 * Resolution is best-effort: if resolution fails for any signal
 * the signal is passed through unchanged (non-blocking).
 *
 * NB-051: Phase 4 — Entity Resolution Bridge
 */

import {
  createEntityResolver,
  type EntityResolverConfig,
  type ResolvedEntity,
} from '../core/entity-resolver.js';
import type { BridgeSignalInput } from './signal-to-eventbus.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EntityResolutionBridgeConfig {
  /** Supabase client (service role for resolution writes) */
  supabase: any;
  /** Organisation ID — each org has an isolated entity namespace */
  organizationId: string;
  /** Fuzzy match threshold (0-1, default 0.8) */
  fuzzyThreshold?: number;
  /**
   * Enable async resolution: process signals without blocking the
   * caller. Recommended for high-throughput ingestion.
   * Default: true
   */
  asyncMode?: boolean;
  /**
   * Signals with these entity types will be skipped (e.g. raw log
   * lines that aren't company/contact entities).
   * Default: ['log_entry', 'metric', 'event']
   */
  skipEntityTypes?: string[];
}

export interface ResolutionStats {
  /** Total signals processed */
  total: number;
  /** Resolved via exact match */
  exactHits: number;
  /** Resolved via fuzzy match */
  fuzzyHits: number;
  /** Resolved via federated (core brain) match */
  federatedHits: number;
  /** New entity records created */
  newEntities: number;
  /** Signals skipped (type in skipEntityTypes) */
  skipped: number;
  /** Resolution errors (signal passed through unchanged) */
  errors: number;
  /** Average resolution time in ms */
  avgResolutionMs: number;
}

export interface EntityResolutionBridge {
  /**
   * Process an array of signals through entity resolution.
   * Returns the same signals with canonical entity IDs.
   */
  resolve(signals: BridgeSignalInput[]): Promise<BridgeSignalInput[]>;
  /**
   * Convenience: resolve a single signal.
   */
  resolveOne(signal: BridgeSignalInput): Promise<BridgeSignalInput>;
  /** Get resolution performance stats */
  getStats(): ResolutionStats;
  /** Clear in-memory resolver cache */
  clearCache(): void;
}

// ─── Default skip list ────────────────────────────────────────────────────────

const DEFAULT_SKIP_ENTITY_TYPES = new Set([
  'log_entry',
  'metric',
  'event',
  'heartbeat',
  'alert',
]);

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an entity resolution bridge.
 *
 * @example
 * ```typescript
 * const entityBridge = createEntityResolutionBridge({
 *   supabase: serviceClient,
 *   organizationId: orgId,
 * });
 *
 * // In your signal pipeline — before passing to signalBridge:
 * const resolvedSignals = await entityBridge.resolve(rawSignals);
 * signalBridge.onSignalsCollected(resolvedSignals);
 * ```
 */
export function createEntityResolutionBridge(
  config: EntityResolutionBridgeConfig
): EntityResolutionBridge {
  const {
    supabase,
    organizationId,
    fuzzyThreshold = 0.8,
    asyncMode = true,
    skipEntityTypes,
  } = config;

  const skipSet = skipEntityTypes
    ? new Set(skipEntityTypes)
    : DEFAULT_SKIP_ENTITY_TYPES;

  // Create the underlying entity resolver (3-tier: exact → fuzzy → federated)
  const resolverConfig: EntityResolverConfig = {
    supabase,
    organizationId,
    fuzzyThreshold,
  };
  const resolver = createEntityResolver(resolverConfig);

  // ─── Stats tracking ────────────────────────────────────────────────────────

  const stats: ResolutionStats = {
    total: 0,
    exactHits: 0,
    fuzzyHits: 0,
    federatedHits: 0,
    newEntities: 0,
    skipped: 0,
    errors: 0,
    avgResolutionMs: 0,
  };

  let totalResolutionMs = 0;
  let resolvedCount = 0;

  // ─── Core resolution logic ─────────────────────────────────────────────────

  /**
   * Extract entity attributes from a signal for resolution.
   * Pulls from signal_metadata fields when entity_id is ambiguous.
   */
  function extractEntityInput(signal: BridgeSignalInput): {
    source: string;
    externalId: string;
    name?: string;
    email?: string;
    domain?: string;
    entityType: string;
  } | null {
    const entityType = signal.entity_type || 'company';

    // If no entity_id, we can't resolve
    const rawId = signal.entity_id;
    if (!rawId) return null;

    // Parse source from entity_id format: "github#user_456" → source="github", id="user_456"
    // Or from source_domain: "engineering.github" → source="github"
    let source = signal.source_domain || 'unknown';
    let externalId = rawId;

    // Handle "source#entity_id" format (used by Freshworks/GitHub connectors)
    const hashIdx = rawId.indexOf('#');
    if (hashIdx !== -1) {
      source = rawId.slice(0, hashIdx);
      externalId = rawId.slice(hashIdx + 1);
    } else {
      // Infer source from source_domain (e.g. "engineering.github" → "github")
      const domainParts = source.split('.');
      source = domainParts[domainParts.length - 1] || source;
    }

    const meta = signal.signal_metadata || {};

    return {
      source,
      externalId,
      entityType,
      name: meta.name || meta.company || meta.title || meta.canonical_name || undefined,
      email: meta.email || undefined,
      domain: meta.domain || meta.email_domain || undefined,
    };
  }

  /**
   * Resolve a single signal — enrich entity_id with canonical UUID.
   * Non-throwing: on error, returns signal unchanged.
   */
  async function resolveSignal(
    signal: BridgeSignalInput
  ): Promise<BridgeSignalInput> {
    stats.total++;

    // Skip entity types that don't represent real-world entities
    if (skipSet.has(signal.entity_type || '')) {
      stats.skipped++;
      return signal;
    }

    // Also skip if there's no entity info to work with
    const entityInput = extractEntityInput(signal);
    if (!entityInput) {
      stats.skipped++;
      return signal;
    }

    const t0 = Date.now();
    try {
      const resolved: ResolvedEntity = await resolver.resolve(entityInput);

      // Track match method stats
      if (resolved.matchMethod === 'exact') {
        stats.exactHits++;
      } else if (resolved.matchMethod === 'fuzzy') {
        stats.fuzzyHits++;
      } else if (resolved.matchMethod === 'federated') {
        stats.federatedHits++;
      } else {
        // 'manual' or newly created entity
        stats.newEntities++;
      }

      // Enrich signal with resolution metadata
      const enrichedSignal: BridgeSignalInput = {
        ...signal,
        entity_id: resolved.canonicalId,
        signal_metadata: {
          ...signal.signal_metadata,
          _raw_entity_id: signal.entity_id,
          _entity_resolution: {
            canonicalId: resolved.canonicalId,
            displayName: resolved.displayName,
            entityType: resolved.entityType,
            matchMethod: resolved.matchMethod,
            confidence: resolved.confidence,
            resolvedAt: new Date().toISOString(),
          },
        },
      };

      // Update rolling average resolution time
      const elapsed = Date.now() - t0;
      totalResolutionMs += elapsed;
      resolvedCount++;
      stats.avgResolutionMs = Math.round(totalResolutionMs / resolvedCount);

      return enrichedSignal;
    } catch (err: any) {
      stats.errors++;
      // Non-blocking: log and pass signal through unchanged
      console.warn(
        `[EntityResolutionBridge] Failed to resolve entity for signal (type=${signal.signal_type}, entity=${signal.entity_id}):`,
        err?.message || err
      );
      return signal;
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async function resolve(
    signals: BridgeSignalInput[]
  ): Promise<BridgeSignalInput[]> {
    if (asyncMode) {
      // Process all signals concurrently (bounded by Supabase connection pool)
      return Promise.all(signals.map(resolveSignal));
    } else {
      // Sequential processing — lower DB pressure for large batches
      const results: BridgeSignalInput[] = [];
      for (const signal of signals) {
        results.push(await resolveSignal(signal));
      }
      return results;
    }
  }

  async function resolveOne(
    signal: BridgeSignalInput
  ): Promise<BridgeSignalInput> {
    return resolveSignal(signal);
  }

  function getStats(): ResolutionStats {
    return { ...stats };
  }

  function clearCache(): void {
    resolver.clearCache();
  }

  return {
    resolve,
    resolveOne,
    getStats,
    clearCache,
  };
}

// ─── Pipeline helper ──────────────────────────────────────────────────────────

/**
 * Wrap a signal bridge's `onSignalsCollected` handler with entity
 * resolution so callers don't need to manually thread the bridge.
 *
 * @example
 * ```typescript
 * const entityBridge = createEntityResolutionBridge({ supabase, organizationId });
 * const signalBridge = createSignalBridge(eventBus);
 *
 * // Resolved wrapper automatically runs resolution before forwarding to eventBus
 * const onSignals = withEntityResolution(entityBridge, signalBridge.onSignalsCollected);
 * collector.onSignalsCollected = onSignals;
 * ```
 */
export function withEntityResolution(
  entityBridge: EntityResolutionBridge,
  next: (signals: BridgeSignalInput[]) => void
): (signals: BridgeSignalInput[]) => void {
  return async (signals: BridgeSignalInput[]) => {
    const resolved = await entityBridge.resolve(signals);
    next(resolved);
  };
}
