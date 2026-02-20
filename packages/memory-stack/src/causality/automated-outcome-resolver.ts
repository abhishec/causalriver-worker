/**
 * Automated Outcome Resolver Registry
 * ====================================
 *
 * The CRITICAL missing piece: replaces circular brain-queries with actual
 * ground-truth from source system APIs (Jira, GitHub, Xero, PagerDuty).
 *
 * Before this: OutcomeCollector asks the BRAIN "What is the current velocity?"
 *   → Brain answers from its own memory → Circular, no real learning
 *
 * After this: OutcomeCollector calls resolverRegistry.resolve(prediction)
 *   → Registry dispatches to Jira API → Real Sprint N+1 velocity returned
 *   → Brain compares prediction vs reality → ACTUAL learning happens
 *
 * Domains without an automated resolver fall through to user verification
 * (Gap 2: VerificationPromptCard).
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { jiraVelocityResolver } from './resolvers/jira-velocity-resolver.js';
import { githubMergeResolver } from './resolvers/github-merge-resolver.js';
import { xeroTransactionResolver } from './resolvers/xero-transaction-resolver.js';
import { pagerdutyIncidentResolver } from './resolvers/pagerduty-incident-resolver.js';
import { compositeHealthResolver } from './resolvers/composite-health-resolver.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ResolverResult {
  /** Measured direction: increase, decrease, or stable */
  actualDirection: 'increase' | 'decrease' | 'stable';
  /** Measured magnitude (normalized, typically -1 to 1) */
  actualMagnitude: number;
  /** Raw actual value from the source system */
  actualValue?: number;
  /** Source system that provided the ground truth */
  source: string;
  /** Confidence in the measurement (0-1). 1.0 for hard API data. */
  confidence: number;
  /** When the measurement was taken */
  measuredAt: Date;
  /** Optional metadata about the resolution */
  metadata?: Record<string, unknown>;
}

export interface PredictionContext {
  /** Prediction ID */
  predictionId: string;
  /** Organization for multi-tenant scoping */
  organizationId: string;
  /** Domain that made the prediction (e.g., "early-warning") */
  domain: string;
  /** What metric was predicted (e.g., "sprint_velocity") */
  targetMetric: string;
  /** Entity being tracked */
  entityType: string;
  entityId: string;
  /** What was predicted */
  predictedDirection: 'increase' | 'decrease' | 'stable';
  predictedMagnitude: number;
  predictedValue?: number;
  /** When the prediction was made */
  predictedAt: Date;
  /** Prediction confidence */
  confidence: number;
  /** Feature values at prediction time */
  featureSnapshot?: Record<string, number>;
}

/**
 * A resolver fetches real-world outcome data from an external system.
 */
export interface OutcomeResolver {
  /** Unique resolver identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Domains this resolver handles */
  supportedDomains: string[];
  /** Metric types this resolver can verify */
  supportedMetrics: string[];
  /** Resolve the actual outcome for a prediction */
  resolve(
    ctx: PredictionContext,
    supabase: SupabaseClient,
  ): Promise<ResolverResult | null>;
}

// ============================================================================
// RESOLVER REGISTRY
// ============================================================================

export class OutcomeResolverRegistry {
  private resolvers: Map<string, OutcomeResolver> = new Map();
  /** domain → resolver ID mapping for fast dispatch */
  private domainIndex: Map<string, string[]> = new Map();
  /** metric → resolver ID mapping */
  private metricIndex: Map<string, string[]> = new Map();

  /**
   * Register a resolver
   */
  register(resolver: OutcomeResolver): void {
    this.resolvers.set(resolver.id, resolver);

    // Index by domain
    for (const domain of resolver.supportedDomains) {
      const existing = this.domainIndex.get(domain) || [];
      if (!existing.includes(resolver.id)) {
        existing.push(resolver.id);
      }
      this.domainIndex.set(domain, existing);
    }

    // Index by metric
    for (const metric of resolver.supportedMetrics) {
      const existing = this.metricIndex.get(metric) || [];
      if (!existing.includes(resolver.id)) {
        existing.push(resolver.id);
      }
      this.metricIndex.set(metric, existing);
    }
  }

  /**
   * Find the best resolver for a prediction
   */
  getResolver(domain: string, targetMetric?: string): OutcomeResolver | null {
    // 1. Try metric-specific match first (most precise)
    if (targetMetric) {
      const metricResolverIds = this.metricIndex.get(targetMetric);
      if (metricResolverIds) {
        for (const id of metricResolverIds) {
          const resolver = this.resolvers.get(id);
          if (resolver && resolver.supportedDomains.includes(domain)) {
            return resolver;
          }
        }
        // Return first metric resolver even if domain doesn't match perfectly
        if (metricResolverIds.length > 0) {
          return this.resolvers.get(metricResolverIds[0]) || null;
        }
      }
    }

    // 2. Fall back to domain match
    const domainResolverIds = this.domainIndex.get(domain);
    if (domainResolverIds && domainResolverIds.length > 0) {
      return this.resolvers.get(domainResolverIds[0]) || null;
    }

    return null;
  }

  /**
   * Resolve the actual outcome for a prediction.
   * Returns null if no resolver exists (prediction falls through to user verification).
   */
  async resolve(
    ctx: PredictionContext,
    supabase: SupabaseClient,
  ): Promise<ResolverResult | null> {
    const resolver = this.getResolver(ctx.domain, ctx.targetMetric);
    if (!resolver) {
      return null; // No automated resolver → user verification (Gap 2)
    }

    try {
      return await resolver.resolve(ctx, supabase);
    } catch (err) {
      console.warn(
        `[OutcomeResolver] ${resolver.id} failed for prediction ${ctx.predictionId}:`,
        err instanceof Error ? err.message : err,
      );
      return null; // Resolver failed → fall through to user verification
    }
  }

  /**
   * Check if a domain has an automated resolver
   */
  hasResolver(domain: string): boolean {
    return this.domainIndex.has(domain);
  }

  /**
   * Get all registered resolver IDs
   */
  getRegisteredResolvers(): string[] {
    return Array.from(this.resolvers.keys());
  }

  /**
   * Get all domains with automated resolvers
   */
  getAutomatedDomains(): string[] {
    return Array.from(this.domainIndex.keys());
  }

  /**
   * Get domains that require user verification (no automated resolver)
   */
  getUserVerificationDomains(allDomains: string[]): string[] {
    return allDomains.filter((d) => !this.domainIndex.has(d));
  }
}

// ============================================================================
// SIGNAL-BASED FALLBACK RESOLVER
// ============================================================================

/**
 * Fallback resolver that reads from cross_domain_signals.
 * Better than asking the brain (circular), but less precise than
 * direct API calls. Used when no domain-specific resolver exists
 * but signals have been ingested from connectors.
 */
export const signalBasedResolver: OutcomeResolver = {
  id: 'signal-fallback',
  name: 'Signal-Based Fallback',
  supportedDomains: [], // Registered manually as catch-all
  supportedMetrics: [],

  async resolve(
    ctx: PredictionContext,
    supabase: SupabaseClient,
  ): Promise<ResolverResult | null> {
    // Get the most recent signals for this entity in the target domain
    const { data, error } = await supabase
      .from('cross_domain_signals')
      .select('signal_value, signal_timestamp, signal_type, metadata')
      .eq('organization_id', ctx.organizationId)
      .eq('entity_type', ctx.entityType)
      .eq('entity_id', ctx.entityId)
      .eq('signal_type', ctx.targetMetric)
      .order('signal_timestamp', { ascending: false })
      .limit(2);

    if (error || !data || data.length < 2) {
      return null;
    }

    const current = data[0].signal_value;
    const previous = data[1].signal_value;
    const change = current - previous;
    const stableThreshold = 0.05;

    const direction: 'increase' | 'decrease' | 'stable' =
      change > stableThreshold
        ? 'increase'
        : change < -stableThreshold
          ? 'decrease'
          : 'stable';

    return {
      actualDirection: direction,
      actualMagnitude: change,
      actualValue: current,
      source: 'cross_domain_signals',
      confidence: 0.7, // Lower confidence — signal data, not direct API
      measuredAt: new Date(data[0].signal_timestamp),
      metadata: {
        previousValue: previous,
        signalType: data[0].signal_type,
      },
    };
  },
};

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create and populate a resolver registry with all available resolvers.
 *
 * Registration order matters: domain-specific resolvers are registered first
 * (highest priority), signal-based fallback last (lowest priority).
 */
export function createResolverRegistry(): OutcomeResolverRegistry {
  const registry = new OutcomeResolverRegistry();

  // ── Domain-specific resolvers (highest priority: real API ground truth) ──
  registry.register(jiraVelocityResolver);       // early-warning, scope-creep, delivery-intelligence
  registry.register(githubMergeResolver);        // pr-review, dead-code-detector
  registry.register(xeroTransactionResolver);    // bookkeeper, reconciler, anomaly
  registry.register(pagerdutyIncidentResolver);  // incident-diagnosis, performance-profiler
  registry.register(compositeHealthResolver);    // delivery-intelligence, pod-match

  // ── Signal-based fallback (lowest priority: better than brain-query, worse than API) ──
  registry.register(signalBasedResolver);

  return registry;
}

// Re-export for convenience
export { OutcomeResolverRegistry as ResolverRegistry };
