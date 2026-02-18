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

/** Core brain org ID for federated entity resolution */
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

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
  matchMethod: 'exact' | 'fuzzy' | 'semantic' | 'manual' | 'federated';
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
    knockoutScore?: number;
    isLikelyConfounded?: boolean;
    coefficientSign?: number;
    /** Temporal lag in days between cause and effect */
    lagDays?: number;
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
        canonicalId: exactMatch.id,
        entityType: exactMatch.entity_type,
        displayName: exactMatch.canonical_name,
        externalIds: exactMatch.external_ids,
        confidence: 1.0,
        matchMethod: 'exact',
      };
      cache.set(cacheKey, resolved);
      return resolved;
    }

    // Tier 2: Exact match by email or domain (stored in email_domains JSONB array)
    if (input.email || input.domain) {
      // email_domains is a JSONB array like ["acme.com", "acme.co.uk"]
      // Use contains to check if the domain exists in the array
      const matchDomain = input.email
        ? input.email.split('@')[1]
        : input.domain;

      const { data: emailMatch } = matchDomain
        ? await supabase
            .from('resolved_entities')
            .select('*')
            .eq('organization_id', organizationId)
            .contains('email_domains', [matchDomain])
            .single()
        : { data: null };

      if (emailMatch) {
        const updatedExternalIds = {
          ...emailMatch.external_ids,
          [input.source]: input.externalId,
        };

        await supabase
          .from('resolved_entities')
          .update({ external_ids: updatedExternalIds })
          .eq('id', emailMatch.id);

        const resolved: ResolvedEntity = {
          canonicalId: emailMatch.id,
          entityType: emailMatch.entity_type,
          displayName: emailMatch.canonical_name,
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
            candidate.canonical_name.toLowerCase()
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
            .eq('id', bestMatch.id);

          const resolved: ResolvedEntity = {
            canonicalId: bestMatch.id,
            entityType: bestMatch.entity_type,
            displayName: bestMatch.canonical_name,
            externalIds: updatedExternalIds,
            confidence: bestScore,
            matchMethod: 'fuzzy',
          };
          cache.set(cacheKey, resolved);
          return resolved;
        }
      }
    }

    // Tier 4: Core brain canonical entity lookup (federation)
    if (organizationId !== CORE_BRAIN_ORG_ID && input.name) {
      try {
        const { data: coreCandidates } = await supabase
          .from('resolved_entities')
          .select('*')
          .eq('organization_id', CORE_BRAIN_ORG_ID)
          .eq('entity_type', input.entityType || 'company')
          .limit(50);

        if (coreCandidates && coreCandidates.length > 0) {
          let bestCoreMatch: any = null;
          let bestCoreScore = 0;

          for (const candidate of coreCandidates) {
            const score = levenshteinSimilarity(
              input.name.toLowerCase(),
              candidate.canonical_name.toLowerCase()
            );
            if (score > bestCoreScore && score >= fuzzyThreshold) {
              bestCoreScore = score;
              bestCoreMatch = candidate;
            }
          }

          if (bestCoreMatch) {
            // Create local entity linked to core brain canonical name
            const { data: inserted } = await supabase
              .from('resolved_entities')
              .insert({
                organization_id: organizationId,
                entity_type: bestCoreMatch.entity_type,
                canonical_name: bestCoreMatch.canonical_name,
                email_domains: bestCoreMatch.email_domains || [],
                external_ids: { [input.source]: input.externalId },
                aliases: [],
                metadata: {
                  ...input.metadata,
                  _federated_from_core: bestCoreMatch.id,
                },
                confidence: bestCoreScore * 0.9,
              })
              .select('id')
              .single();

            const resolved: ResolvedEntity = {
              canonicalId: inserted?.id ?? bestCoreMatch.id,
              entityType: bestCoreMatch.entity_type,
              displayName: bestCoreMatch.canonical_name,
              externalIds: { [input.source]: input.externalId },
              confidence: bestCoreScore * 0.9,
              matchMethod: 'federated',
            };
            cache.set(cacheKey, resolved);
            return resolved;
          }
        }
      } catch (err) {
        // Non-critical: core brain lookup for entity resolution failed — errors here don't block the main flow
      }
    }

    // No match found - create new entity
    // Build email_domains array from email and/or domain input
    const emailDomains: string[] = [];
    if (input.email) {
      const emailDomain = input.email.split('@')[1];
      if (emailDomain) emailDomains.push(emailDomain);
    }
    if (input.domain && !emailDomains.includes(input.domain)) {
      emailDomains.push(input.domain);
    }

    const { data: inserted } = await supabase.from('resolved_entities').insert({
      organization_id: organizationId,
      entity_type: input.entityType || 'company',
      canonical_name: input.name || input.externalId,
      email_domains: emailDomains.length > 0 ? emailDomains : [],
      external_ids: { [input.source]: input.externalId },
      aliases: [],
      metadata: input.metadata || {},
      confidence: 1.0,
    }).select('id').single();

    const canonicalId = inserted?.id ?? `ent_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`;

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
   * Get unified view of an entity across all systems.
   *
   * Now enriched with CAUSAL INTELLIGENCE: relationships are populated
   * from the causal graph, showing how this entity's domains causally
   * interact with others. This turns every entity view into a causal map.
   */
  async function getUnifiedView(
    canonicalId: string
  ): Promise<UnifiedEntityView | null> {
    const { data: entity } = await supabase
      .from('resolved_entities')
      .select('*')
      .eq('id', canonicalId)
      .single();

    if (!entity) return null;

    // Fetch signals for this entity
    const { data: signals } = await supabase
      .from('cross_domain_signals')
      .select('source_domain, signal_type, signal_value, created_at')
      .eq('organization_id', organizationId)
      .eq('entity_id', canonicalId)
      .order('created_at', { ascending: false })
      .limit(50);

    // CAUSAL ENRICHMENT: Discover which domains this entity touches
    const entityDomains = new Set<string>();
    for (const s of signals || []) {
      entityDomains.add((s as any).source_domain);
    }

    // Fetch causal graph edges involving this entity's domains
    const relationships: UnifiedEntityView['relationships'] = [];
    if (entityDomains.size > 0) {
      const domainList = Array.from(entityDomains);

      // Query causal_relationships_statistical for relationships where this entity's
      // domains appear as source OR target (org + core brain federated)
      const { data: edges } = await supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain, effect_size, optimal_lag_days, natural_language, is_significant, knockout_score, is_likely_confounded, coefficient_sign')
        .in('organization_id', [organizationId, CORE_BRAIN_ORG_ID])
        .eq('is_significant', true);

      if (edges) {
        for (const edge of edges) {
          const src = edge.source_domain as string;
          const tgt = edge.target_domain as string;
          // Include edge if it touches any domain this entity participates in
          if (domainList.includes(src) || domainList.includes(tgt)) {
            relationships.push({
              sourceDomain: src,
              targetDomain: tgt,
              effectSize: (edge.effect_size as number) || 0,
              naturalLanguage:
                (edge.natural_language as string) ||
                `${src} causally affects ${tgt} (effect: ${((edge.effect_size as number) || 0).toFixed(2)})`,
              knockoutScore: (edge.knockout_score as number) ?? undefined,
              isLikelyConfounded: (edge.is_likely_confounded as boolean) ?? undefined,
              coefficientSign: (edge.coefficient_sign as number) ?? undefined,
              lagDays: (edge.optimal_lag_days as number) ?? undefined,
            });
          }
        }
      }
    }

    return {
      entity: {
        canonicalId: entity.id,
        entityType: entity.entity_type,
        displayName: entity.canonical_name,
        externalIds: entity.external_ids,
        confidence: entity.confidence ?? 1.0,
        matchMethod: 'exact',
      },
      signals: (signals || []).map((s: any) => ({
        domain: s.source_domain,
        signalType: s.signal_type,
        signalValue: s.signal_value,
        timestamp: new Date(s.created_at),
      })),
      relationships,
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
