/**
 * Bridge 4: Patterns → Agent Context Cache
 *
 * Subscribes to 'prediction' and 'relationship_update' events.
 * Maintains an in-memory cache of patterns and causal relationships
 * per organization, filterable by domain.
 *
 * Domain agents query this cache to enrich their reasoning
 * with causal context and discovered patterns.
 */

import type { CausalEvent } from '../causality/event-bus';

type EventBusInstance = {
  subscribe: (options: {
    filter: any;
    handler: (events: CausalEvent[]) => Promise<void>;
  }) => string;
};

export interface CachedPattern {
  id: string;
  domain: string;
  type: string;
  payload: Record<string, unknown>;
  confidence: number;
  discoveredAt: Date;
}

export interface CachedRelationship {
  sourceDomain: string;
  targetDomain: string;
  effectSize: number;
  pValue: number;
  fStatistic: number;
  lagDays: number;
  naturalLanguage: string;
  confidenceIntervalLower?: number;
  confidenceIntervalUpper?: number;
  sampleSize?: number;
  discoveredAt: Date;
  /** Source of this relationship: org-specific or universal core brain */
  _source?: 'org' | 'core';
}

export interface AgentContextCache {
  patterns: CachedPattern[];
  causalRelationships: CachedRelationship[];
}

/**
 * Create an agent context enricher that maintains a live cache
 * of patterns and causal relationships from the event bus.
 */
export function createAgentContextEnricher(eventBus: EventBusInstance) {
  const patternCache = new Map<string, CachedPattern[]>();
  const causalCache = new Map<string, CachedRelationship[]>();

  const MAX_PATTERNS = 100;
  const MAX_RELATIONSHIPS = 50;

  // Subscribe to pattern/prediction events
  eventBus.subscribe({
    filter: { eventTypes: ['prediction'] as any },
    handler: async (events: CausalEvent[]) => {
      for (const event of events) {
        const orgId = event.organizationId;
        if (!patternCache.has(orgId)) {
          patternCache.set(orgId, []);
        }

        const patterns = patternCache.get(orgId)!;
        patterns.push({
          id: event.eventId,
          domain: event.domain,
          type: (event.payload.type as string) || 'pattern',
          payload: event.payload,
          confidence: (event.payload.confidence as number) || 0.5,
          discoveredAt: event.timestamp,
        });

        if (patterns.length > MAX_PATTERNS) {
          patterns.splice(0, patterns.length - MAX_PATTERNS);
        }
      }
    },
  });

  // Subscribe to causal relationship events
  eventBus.subscribe({
    filter: { eventTypes: ['relationship_update'] as any },
    handler: async (events: CausalEvent[]) => {
      for (const event of events) {
        const orgId = event.organizationId;
        if (!causalCache.has(orgId)) {
          causalCache.set(orgId, []);
        }

        const payload = event.payload as any;
        const relationships = causalCache.get(orgId)!;

        const existingIdx = relationships.findIndex(
          (r) =>
            r.sourceDomain === (payload.source_domain || event.domain) &&
            r.targetDomain === (payload.target_domain || payload.target)
        );

        const newRel: CachedRelationship = {
          sourceDomain: payload.source_domain || event.domain,
          targetDomain: payload.target_domain || payload.target || '',
          effectSize: payload.effect_size || payload.weight || 0,
          pValue: payload.granger_p_value || payload.pValue || 0,
          fStatistic: payload.granger_f_statistic || payload.fStatistic || 0,
          lagDays: payload.optimal_lag_days || payload.lagDays || 0,
          naturalLanguage: payload.natural_language || payload.evidence || '',
          confidenceIntervalLower: payload.confidence_interval_lower ?? undefined,
          confidenceIntervalUpper: payload.confidence_interval_upper ?? undefined,
          sampleSize: payload.sample_size ?? undefined,
          discoveredAt: event.timestamp,
        };

        if (existingIdx >= 0) {
          relationships[existingIdx] = newRel;
        } else {
          relationships.push(newRel);
          if (relationships.length > MAX_RELATIONSHIPS) {
            relationships.splice(0, relationships.length - MAX_RELATIONSHIPS);
          }
        }
      }
    },
  });

  return {
    /**
     * Get context for a specific domain agent
     */
    getContextForAgent(
      organizationId: string,
      domain?: string
    ): AgentContextCache {
      const allPatterns = patternCache.get(organizationId) || [];
      const allRelationships = causalCache.get(organizationId) || [];

      if (!domain) {
        return {
          patterns: allPatterns,
          causalRelationships: allRelationships,
        };
      }

      return {
        patterns: allPatterns.filter(
          (p) =>
            p.domain === domain ||
            (p.payload.antecedent as string[] | undefined)?.includes(domain) ||
            (p.payload.consequent as string[] | undefined)?.includes(domain)
        ),
        causalRelationships: allRelationships.filter(
          (r) => r.sourceDomain === domain || r.targetDomain === domain
        ),
      };
    },

    /**
     * Get all cached context for an organization
     */
    getAllContext(organizationId: string): AgentContextCache {
      return {
        patterns: patternCache.get(organizationId) || [],
        causalRelationships: causalCache.get(organizationId) || [],
      };
    },

    /**
     * Clear cache for an organization
     */
    clearCache(organizationId?: string) {
      if (organizationId) {
        patternCache.delete(organizationId);
        causalCache.delete(organizationId);
      } else {
        patternCache.clear();
        causalCache.clear();
      }
    },

    /**
     * Inject federated context (core brain data) into the cache for an org.
     * Merges without duplicating existing org-specific entries.
     */
    injectFederatedContext(
      organizationId: string,
      relationships: CachedRelationship[],
      patterns: CachedPattern[]
    ): void {
      // Merge relationships (org entries take priority)
      const existingRels = causalCache.get(organizationId) || [];
      const relKeys = new Set(
        existingRels.map((r) => `${r.sourceDomain}::${r.targetDomain}`)
      );
      for (const rel of relationships) {
        const key = `${rel.sourceDomain}::${rel.targetDomain}`;
        if (!relKeys.has(key)) {
          existingRels.push({ ...rel, _source: rel._source || 'core' });
          relKeys.add(key);
        }
      }
      causalCache.set(organizationId, existingRels);

      // Merge patterns (org entries take priority)
      const existingPats = patternCache.get(organizationId) || [];
      const patKeys = new Set(
        existingPats.map(
          (p) =>
            `${p.domain}::${p.type}::${((p.payload.naturalLanguage as string) || '').substring(0, 50)}`
        )
      );
      for (const pat of patterns) {
        const key = `${pat.domain}::${pat.type}::${((pat.payload.naturalLanguage as string) || '').substring(0, 50)}`;
        if (!patKeys.has(key)) {
          existingPats.push(pat);
          patKeys.add(key);
        }
      }
      patternCache.set(organizationId, existingPats);
    },

    getStats() {
      const orgs = new Set([...patternCache.keys(), ...causalCache.keys()]);
      return {
        organizationsTracked: orgs.size,
        totalPatternsCached: Array.from(patternCache.values()).reduce(
          (sum, p) => sum + p.length,
          0
        ),
        totalRelationshipsCached: Array.from(causalCache.values()).reduce(
          (sum, r) => sum + r.length,
          0
        ),
      };
    },
  };
}
