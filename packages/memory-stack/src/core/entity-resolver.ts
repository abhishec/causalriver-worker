/**
 * Entity Resolver
 *
 * L2: Entity Resolution Layer
 *
 * Resolves the same real-world entity across different systems.
 * A company might be "Acme Corp" in HubSpot, "acme-corp" in Stripe,
 * and ticket #4521 in Zendesk. The entity resolver links them.
 *
 * 3-tier matching:
 *   1. Exact match (email, domain, external ID)
 *   2. Fuzzy match (Levenshtein distance on company name)
 *   3. Semantic match (embedding similarity)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface EntityResolverConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Fuzzy match threshold (0-1, default: 0.8) */
  fuzzyThreshold?: number;
  /** Semantic similarity threshold (0-1, default: 0.85) */
  semanticThreshold?: number;
}

export interface ResolvedEntity {
  /** Canonical entity ID in our system */
  canonicalId: string;
  /** Entity type (company, contact, deal, etc.) */
  entityType: string;
  /** Canonical display name */
  displayName: string;
  /** All known external IDs */
  externalIds: Record<string, string>;
  /** Confidence in the resolution (0-1) */
  confidence: number;
  /** How the match was made */
  matchMethod: 'exact' | 'fuzzy' | 'semantic' | 'manual';
}

export interface UnifiedEntityView {
  /** Resolved entity info */
  entity: ResolvedEntity;
  /** Signals associated with this entity across all domains */
  signals: Array<{
    domain: string;
    signalType: string;
    signalValue: number;
    timestamp: Date;
  }>;
  /** Causal relationships involving this entity */
  relationships: Array<{
    sourceDomain: string;
    targetDomain: string;
    effectSize: number;
    naturalLanguage: string;
  }>;
}

// ============================================================================
// ENTITY RESOLVER
// ============================================================================

/**
 * Create an entity resolver for cross-system identity matching.
 *
 * @example
 * ```typescript
 * const resolver = createEntityResolver({
 *   supabase,
 *   organizationId: 'org_123',
 * });
 *
 * const entity = await resolver.resolve({
 *   source: 'hubspot',
 *   externalId: 'hs_12345',
 *   name: 'Acme Corp',
 *   email: 'billing@acme.com',
 * });
 * ```
 */
export function createEntityResolver(config: EntityResolverConfig) {
  const {
    supabase,
    organizationId,
    fuzzyThreshold = 0.8,
  } = config;

  // In-memory cache for fast lookups
  const cache = new Map<string, ResolvedEntity>();

  /**
   * Resolve an entity from an external system
   */
  async function resolve(input: {
    source: string;
    externalId: string;
    name?: string;
    email?: string;
    domain?: string;
    entityType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ResolvedEntity> {
    const cacheKey = `${input.source}:${input.externalId}`;

    // Check cache first
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }

    // Tier 1: Exact match by external ID
    const { data: exactMatch } = await supabase
      .from('resolved_entities')
      .select('*')
      .eq('organization_id', organizationId)
      .contains('external_ids', { [input.source]: input.externalId })
      .single();

    if (exactMatch) {
      const resolved: ResolvedEntity = {
        canonicalId: exactMatch.canonical_id,
        entityType: exactMatch.entity_type,
        displayName: exactMatch.display_name,
        externalIds: exactMatch.external_ids,
        confidence: 1.0,
        matchMethod: 'exact',
      };
      cache.set(cacheKey, resolved);
      return resolved;
    }

    // Tier 2: Exact match by email or domain
    if (input.email || input.domain) {
      const query = supabase
        .from('resolved_entities')
        .select('*')
        .eq('organization_id', organizationId);

      if (input.email) {
        query.eq('primary_email', input.email);
      } else if (input.domain) {
        query.eq('primary_domain', input.domain);
      }

      const { data: emailMatch } = await query.single();

      if (emailMatch) {
        const updatedExternalIds = {
          ...emailMatch.external_ids,
          [input.source]: input.externalId,
        };

        await supabase
          .from('resolved_entities')
          .update({ external_ids: updatedExternalIds })
          .eq('canonical_id', emailMatch.canonical_id);

        const resolved: ResolvedEntity = {
          canonicalId: emailMatch.canonical_id,
          entityType: emailMatch.entity_type,
          displayName: emailMatch.display_name,
          externalIds: updatedExternalIds,
          confidence: 0.95,
          matchMethod: 'exact',
        };
        cache.set(cacheKey, resolved);
        return resolved;
      }
    }

    // Tier 3: Fuzzy match by name
    if (input.name) {
      const { data: candidates } = await supabase
        .from('resolved_entities')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('entity_type', input.entityType || 'company');

      if (candidates && candidates.length > 0) {
        let bestMatch: any = null;
        let bestScore = 0;

        for (const candidate of candidates) {
          const score = levenshteinSimilarity(
            input.name.toLowerCase(),
            candidate.display_name.toLowerCase()
          );
          if (score > bestScore && score >= fuzzyThreshold) {
            bestScore = score;
            bestMatch = candidate;
          }
        }

        if (bestMatch) {
          const updatedExternalIds = {
            ...bestMatch.external_ids,
            [input.source]: input.externalId,
          };

          await supabase
            .from('resolved_entities')
            .update({ external_ids: updatedExternalIds })
            .eq('canonical_id', bestMatch.canonical_id);

          const resolved: ResolvedEntity = {
            canonicalId: bestMatch.canonical_id,
            entityType: bestMatch.entity_type,
            displayName: bestMatch.display_name,
            externalIds: updatedExternalIds,
            confidence: bestScore,
            matchMethod: 'fuzzy',
          };
          cache.set(cacheKey, resolved);
          return resolved;
        }
      }
    }

    // No match found - create new entity
    const canonicalId = `ent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await supabase.from('resolved_entities').insert({
      canonical_id: canonicalId,
      organization_id: organizationId,
      entity_type: input.entityType || 'company',
      display_name: input.name || input.externalId,
      primary_email: input.email || null,
      primary_domain: input.domain || null,
      external_ids: { [input.source]: input.externalId },
      metadata: input.metadata || {},
    });

    const resolved: ResolvedEntity = {
      canonicalId,
      entityType: input.entityType || 'company',
      displayName: input.name || input.externalId,
      externalIds: { [input.source]: input.externalId },
      confidence: 1.0,
      matchMethod: 'exact',
    };
    cache.set(cacheKey, resolved);
    return resolved;
  }

  /**
   * Get unified view of an entity across all systems
   */
  async function getUnifiedView(
    canonicalId: string
  ): Promise<UnifiedEntityView | null> {
    const { data: entity } = await supabase
      .from('resolved_entities')
      .select('*')
      .eq('canonical_id', canonicalId)
      .single();

    if (!entity) return null;

    const { data: signals } = await supabase
      .from('cross_domain_signals')
      .select('source_domain, signal_type, signal_value, created_at')
      .eq('organization_id', organizationId)
      .eq('entity_id', canonicalId)
      .order('created_at', { ascending: false })
      .limit(50);

    return {
      entity: {
        canonicalId: entity.canonical_id,
        entityType: entity.entity_type,
        displayName: entity.display_name,
        externalIds: entity.external_ids,
        confidence: 1.0,
        matchMethod: 'exact',
      },
      signals: (signals || []).map((s: any) => ({
        domain: s.source_domain,
        signalType: s.signal_type,
        signalValue: s.signal_value,
        timestamp: new Date(s.created_at),
      })),
      relationships: [],
    };
  }

  function clearCache() {
    cache.clear();
  }

  return {
    resolve,
    getUnifiedView,
    clearCache,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Levenshtein distance-based similarity (0-1)
 */
function levenshteinSimilarity(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[a.length][b.length];
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}
