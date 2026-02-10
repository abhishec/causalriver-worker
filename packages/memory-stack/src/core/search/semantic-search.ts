/**
 * Nexus Memory Stack - Semantic Search
 *
 * Vector similarity search across embedded entities.
 * Supports basic search, RAG context retrieval, and memory-weighted search.
 */

import { generateEmbedding } from '../embeddings/embedding-engine';
import { generateEmbeddingAuto, type NeuralEmbeddingConfig } from '../embeddings/embedding-router';
import type { SearchResult, RAGContext, MemoryWeightedRAGContext } from '../../types';

// ============================================================================
// SEARCH FUNCTIONS
// ============================================================================

/**
 * Configuration for semantic search
 */
/**
 * A causal edge used for causal reranking of search results.
 */
export interface CausalEdge {
  sourceDomain: string;
  targetDomain: string;
  effectSize: number;
}

/**
 * Callback to fetch causal edges for the org at query time.
 * This keeps semantic search decoupled from the DB — the caller wires it.
 */
export type CausalEdgeFetcher = () => Promise<CausalEdge[]>;

export interface SemanticSearchConfig {
  /** Default similarity threshold (0-1) */
  defaultThreshold?: number;
  /** Default result limit */
  defaultLimit?: number;
  /** Embedding dimensions */
  dimensions?: number;
  /** Organization ID for multi-tenant isolation (REQUIRED for production) */
  organizationId?: string;
  /**
   * Neural embedding configuration (optional).
   * When provided, semantic search uses real neural embeddings (OpenAI / Mixedbread)
   * instead of n-gram hashing. Falls back to n-gram if the neural API is unavailable.
   *
   * IMPORTANT: For true semantic understanding, configure this with your edge function URL.
   */
  neuralConfig?: NeuralEmbeddingConfig;
  /**
   * Causal edge fetcher for causal reranking (optional).
   * When provided, RAG results are boosted by causal proximity
   * to the query's domain. Results causally upstream/downstream
   * of the query domain get a relevance boost.
   */
  causalEdgeFetcher?: CausalEdgeFetcher;
  /**
   * How much causal proximity boosts relevance (0-1, default: 0.15).
   * A boost of 0.15 means a maximally-causal result gets up to 15%
   * added to its similarity score.
   */
  causalBoostWeight?: number;
}

/**
 * Create a semantic search engine
 *
 * IMPORTANT: For multi-tenant isolation, always provide organizationId.
 * All search operations will be scoped to the organization.
 */
export function createSemanticSearch(config: SemanticSearchConfig = {}) {
  const {
    defaultThreshold = 0.25,
    defaultLimit = 10,
    dimensions = 384,
    organizationId,
    neuralConfig,
    causalEdgeFetcher,
    causalBoostWeight = 0.15,
  } = config;

  // ---------------------------------------------------------------
  // Causal Reranking Engine
  // ---------------------------------------------------------------

  /**
   * Extract query domain from query text using keyword matching.
   * Returns the most likely domain the user is asking about.
   */
  function detectQueryDomain(query: string): string | null {
    const q = query.toLowerCase();
    const domainKeywords: Record<string, string[]> = {
      finance: ['revenue', 'mrr', 'arr', 'cash', 'payment', 'invoice', 'financial', 'finance', 'billing', 'ar ', 'dso'],
      engineering: ['deploy', 'code', 'bug', 'sprint', 'pr ', 'pull request', 'ci', 'build', 'engineering', 'technical', 'mttr'],
      customer_success: ['churn', 'nps', 'csat', 'retention', 'customer', 'onboard', 'health score', 'support', 'ticket'],
      revenue: ['pipeline', 'deal', 'sales', 'lead', 'win rate', 'quota', 'forecast', 'opportunity'],
      product: ['feature', 'roadmap', 'adoption', 'usage', 'product', 'release', 'user experience'],
      marketing: ['campaign', 'traffic', 'conversion', 'seo', 'mql', 'sql', 'cac', 'brand', 'marketing'],
      hr: ['hiring', 'attrition', 'headcount', 'employee', 'talent', 'retention rate', 'hr '],
      operations: ['ops', 'operations', 'sla', 'efficiency', 'vendor', 'cost'],
    };

    let bestDomain: string | null = null;
    let bestCount = 0;
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      let count = 0;
      for (const kw of keywords) {
        if (q.includes(kw)) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        bestDomain = domain;
      }
    }
    return bestDomain;
  }

  /**
   * Build a causal proximity map: domain → boost factor (0-1).
   * Domains causally connected to queryDomain get higher boosts.
   * Direct connections get max boost, 2-hop get half.
   */
  function buildCausalProximityMap(
    edges: CausalEdge[],
    queryDomain: string
  ): Map<string, number> {
    const proximity = new Map<string, number>();
    proximity.set(queryDomain, 1.0); // Query domain itself gets max

    // Direct neighbors (1-hop): domains causally connected
    const directNeighbors = new Set<string>();
    for (const edge of edges) {
      if (edge.sourceDomain === queryDomain) {
        const boost = Math.min(1.0, Math.abs(edge.effectSize));
        const existing = proximity.get(edge.targetDomain) || 0;
        proximity.set(edge.targetDomain, Math.max(existing, boost));
        directNeighbors.add(edge.targetDomain);
      }
      if (edge.targetDomain === queryDomain) {
        const boost = Math.min(1.0, Math.abs(edge.effectSize));
        const existing = proximity.get(edge.sourceDomain) || 0;
        proximity.set(edge.sourceDomain, Math.max(existing, boost));
        directNeighbors.add(edge.sourceDomain);
      }
    }

    // 2-hop neighbors: domains connected to direct neighbors (half weight)
    for (const neighbor of directNeighbors) {
      for (const edge of edges) {
        if (edge.sourceDomain === neighbor && !proximity.has(edge.targetDomain)) {
          const boost = Math.min(0.5, Math.abs(edge.effectSize) * 0.5);
          proximity.set(edge.targetDomain, boost);
        }
        if (edge.targetDomain === neighbor && !proximity.has(edge.sourceDomain)) {
          const boost = Math.min(0.5, Math.abs(edge.effectSize) * 0.5);
          proximity.set(edge.sourceDomain, boost);
        }
      }
    }

    return proximity;
  }

  /**
   * Apply causal reranking boost to search results.
   * Results from domains causally connected to the query domain
   * get a similarity boost proportional to causal proximity.
   */
  async function applyCausalReranking(
    results: SearchResult[],
    query: string
  ): Promise<SearchResult[]> {
    if (!causalEdgeFetcher || results.length === 0) return results;

    const queryDomain = detectQueryDomain(query);
    if (!queryDomain) return results; // Can't determine query domain

    try {
      const edges = await causalEdgeFetcher();
      if (edges.length === 0) return results;

      const proximityMap = buildCausalProximityMap(edges, queryDomain);

      // Boost results by causal proximity
      return results
        .map((r): SearchResult => {
          // Try to determine the result's domain from entity_type or metadata
          const resultDomain =
            r.metadata?.domain ||
            r.metadata?.source_domain ||
            r.entity_type ||
            '';
          const normalizedDomain = String(resultDomain).toLowerCase().replace(/[^a-z_]/g, '');

          const causalProximity = proximityMap.get(normalizedDomain) || 0;
          const boost = causalProximity * causalBoostWeight;

          return {
            entity_type: r.entity_type,
            entity_id: r.entity_id,
            content_text: r.content_text,
            similarity: Math.min(1.0, r.similarity + boost),
            metadata: {
              ...(r.metadata || { synced_at: new Date().toISOString() }),
              _causalBoost: boost > 0 ? boost : undefined,
              _causalProximity: causalProximity > 0 ? causalProximity : undefined,
            },
          };
        })
        .sort((a, b) => b.similarity - a.similarity); // Re-sort by boosted similarity
    } catch {
      // Causal reranking failure is non-fatal
      return results;
    }
  }

  /**
   * Generate a query embedding using neural (if configured) or n-gram fallback.
   * Uses generateEmbeddingAuto which tries neural first, falls back to n-gram.
   */
  async function generateQueryEmbedding(query: string): Promise<number[]> {
    if (neuralConfig?.edgeFunctionUrl) {
      const result = await generateEmbeddingAuto(query, neuralConfig, dimensions);
      return result.embedding;
    }
    // Fallback to n-gram (lightweight, always available)
    return generateEmbedding(query, dimensions);
  }

  return {
    /**
     * Generate query embedding (sync n-gram only — use embedQueryAsync for neural)
     */
    embedQuery: (query: string): number[] => {
      return generateEmbedding(query, dimensions);
    },

    /**
     * Generate query embedding with neural support (async).
     * Uses neural embeddings when configured, falls back to n-gram.
     */
    embedQueryAsync: async (query: string): Promise<number[]> => {
      return generateQueryEmbedding(query);
    },

    /**
     * Search for similar entities
     *
     * MULTI-TENANT: Results are automatically scoped to organizationId if provided in config.
     *
     * @param supabase - Supabase client
     * @param query - Search query text
     * @param options - Search options
     */
    search: async (
      supabase: any,
      query: string,
      options: {
        entityTypes?: string[];
        threshold?: number;
        limit?: number;
        /** Override organization ID for this search */
        organizationId?: string;
      } = {}
    ): Promise<SearchResult[]> => {
      const {
        entityTypes = null,
        threshold = defaultThreshold,
        limit = defaultLimit,
        organizationId: overrideOrgId,
      } = options;

      const orgId = overrideOrgId || organizationId;

      const queryEmbedding = await generateQueryEmbedding(query);

      // Use organization-scoped search if orgId is provided
      const rpcParams: Record<string, any> = {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        match_threshold: threshold,
        match_count: limit,
        filter_entity_types: entityTypes,
      };

      // Add organization_id filter for multi-tenant isolation
      if (orgId) {
        rpcParams.filter_organization_id = orgId;
      }

      const { data: results, error } = await supabase.rpc('search_embeddings', rpcParams);

      if (error) throw error;

      return (results || []).map((r: any) => ({
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        content_text: r.content_text,
        similarity: r.similarity,
        metadata: r.metadata,
      }));
    },

    /**
     * Get RAG context for AI queries
     *
     * MULTI-TENANT: Results are automatically scoped to organizationId if provided in config.
     * Returns structured context suitable for including in LLM prompts.
     */
    getRAGContext: async (
      supabase: any,
      query: string,
      options: {
        contextLimit?: number;
        /** Override organization ID for this query */
        organizationId?: string;
      } = {}
    ): Promise<RAGContext> => {
      const { contextLimit = 8, organizationId: overrideOrgId } = options;
      const orgId = overrideOrgId || organizationId;

      const queryEmbedding = await generateQueryEmbedding(query);

      const rpcParams: Record<string, any> = {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        context_limit: contextLimit,
      };

      // Add organization_id filter for multi-tenant isolation
      if (orgId) {
        rpcParams.filter_organization_id = orgId;
      }

      const { data: context, error } = await supabase.rpc('get_rag_context', rpcParams);

      if (error) throw error;

      const results = context || [];

      // Group by entity type for better organization
      const grouped: Record<string, any[]> = {};
      for (const item of results) {
        const type = item.entity_type;
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(item);
      }

      // Format as structured context string
      let contextString = '';
      for (const [type, items] of Object.entries(grouped)) {
        contextString += `\n## Relevant ${type.charAt(0).toUpperCase() + type.slice(1)}s\n`;
        for (const item of items) {
          contextString += `- ${item.content} (Relevance: ${item.relevance}%)\n`;
        }
      }

      return {
        query,
        results: results.map((r: any) => ({
          entity_type: r.entity_type,
          entity_id: r.entity_id,
          content_text: r.content,
          similarity: r.relevance / 100,
          metadata: r.metadata,
        })),
        context_string: contextString.trim(),
        count: results.length,
      };
    },

    /**
     * Get memory-weighted RAG context
     *
     * MULTI-TENANT: Results are automatically scoped to organizationId if provided in config.
     * Includes learned patterns and insights with confidence-based weighting.
     * Memory results are marked with 🧠 for citation.
     */
    getMemoryWeightedRAGContext: async (
      supabase: any,
      query: string,
      options: {
        entityLimit?: number;
        memoryLimit?: number;
        threshold?: number;
        /** Override organization ID for this query */
        organizationId?: string;
      } = {}
    ): Promise<MemoryWeightedRAGContext> => {
      const {
        entityLimit = 5,
        memoryLimit = 3,
        threshold = 0.4,
        organizationId: overrideOrgId,
      } = options;

      const orgId = overrideOrgId || organizationId;
      const queryEmbedding = await generateQueryEmbedding(query);

      const rpcParams: Record<string, any> = {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        entity_limit: entityLimit,
        memory_limit: memoryLimit,
        match_threshold: threshold,
      };

      // Add organization_id filter for multi-tenant isolation
      if (orgId) {
        rpcParams.filter_organization_id = orgId;
      }

      const { data: results, error } = await supabase.rpc('get_rag_context_with_memory', rpcParams);

      if (error) throw error;

      // Separate memory from entity results
      const memoryResults = (results || []).filter((r: any) => r.source_type === 'memory');
      const entityResults = (results || []).filter((r: any) => r.source_type === 'entity');

      // Build context string with memory citation markers
      let contextString = '';

      if (memoryResults.length > 0) {
        contextString += '\n## 🧠 Learned Patterns & Memory\n';
        for (const item of memoryResults) {
          const confidence = item.metadata?.confidence
            ? Math.round(item.metadata.confidence * 100)
            : 80;
          contextString += `- 🧠 ${item.content_text} (Confidence: ${confidence}%)\n`;
        }
      }

      if (entityResults.length > 0) {
        const grouped: Record<string, any[]> = {};
        for (const item of entityResults) {
          const type = item.entity_type;
          if (!grouped[type]) grouped[type] = [];
          grouped[type].push(item);
        }

        for (const [type, items] of Object.entries(grouped)) {
          contextString += `\n## ${type.charAt(0).toUpperCase() + type.slice(1)}s\n`;
          for (const item of items) {
            const relevance = Math.round((item.similarity || 0) * 100);
            contextString += `- ${item.content_text} (Relevance: ${relevance}%)\n`;
          }
        }
      }

      const mapResult = (r: any): SearchResult => ({
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        content_text: r.content_text,
        similarity: r.similarity || 0,
        metadata: r.metadata,
      });

      // CAUSAL RERANKING: Boost results by causal proximity to query domain
      const rerankedEntity = await applyCausalReranking(entityResults.map(mapResult), query);
      const rerankedMemory = await applyCausalReranking(memoryResults.map(mapResult), query);

      // Rebuild context string with causal-reranked order
      let causalContextString = '';
      if (rerankedMemory.length > 0) {
        causalContextString += '\n## 🧠 Learned Patterns & Memory\n';
        for (const item of rerankedMemory) {
          const confidence = item.metadata?.confidence
            ? Math.round((item.metadata.confidence as number) * 100)
            : 80;
          const causalTag = item.metadata?._causalBoost ? ' ⚡' : '';
          causalContextString += `- 🧠 ${item.content_text} (Confidence: ${confidence}%)${causalTag}\n`;
        }
      }
      if (rerankedEntity.length > 0) {
        const grouped: Record<string, SearchResult[]> = {};
        for (const item of rerankedEntity) {
          const type = item.entity_type;
          if (!grouped[type]) grouped[type] = [];
          grouped[type].push(item);
        }
        for (const [type, items] of Object.entries(grouped)) {
          causalContextString += `\n## ${type.charAt(0).toUpperCase() + type.slice(1)}s\n`;
          for (const item of items) {
            const relevance = Math.round(item.similarity * 100);
            const causalTag = item.metadata?._causalBoost ? ' ⚡' : '';
            causalContextString += `- ${item.content_text} (Relevance: ${relevance}%)${causalTag}\n`;
          }
        }
      }

      return {
        query,
        memory_results: rerankedMemory,
        entity_results: rerankedEntity,
        context_string: causalContextString.trim() || contextString.trim(),
        memory_count: rerankedMemory.length,
        entity_count: rerankedEntity.length,
      };
    },

    /**
     * Search memory specifically (patterns, insights, predictions)
     *
     * MULTI-TENANT: Results are automatically scoped to organizationId if provided in config.
     */
    searchMemory: async (
      supabase: any,
      query: string,
      options: {
        threshold?: number;
        limit?: number;
        /** Override organization ID for this search */
        organizationId?: string;
      } = {}
    ): Promise<SearchResult[]> => {
      const { threshold = 0.4, limit = 5, organizationId: overrideOrgId } = options;
      const orgId = overrideOrgId || organizationId;

      const queryEmbedding = await generateQueryEmbedding(query);

      const rpcParams: Record<string, any> = {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        match_threshold: threshold,
        match_count: limit,
      };

      // Add organization_id filter for multi-tenant isolation
      if (orgId) {
        rpcParams.filter_organization_id = orgId;
      }

      const { data: results, error } = await supabase.rpc('search_memory_weighted', rpcParams);

      if (error) throw error;

      return (results || []).map((r: any) => ({
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        content_text: r.content_text,
        similarity: r.similarity,
        metadata: {
          ...r.metadata,
          confidence: r.metadata?.confidence || 0.8,
          access_count: r.metadata?.access_count || 0,
        },
      }));
    },

    /**
     * Find entities related to a given entity
     *
     * MULTI-TENANT: Results are automatically scoped to organizationId if provided in config.
     */
    findRelated: async (
      supabase: any,
      entityType: string,
      entityId: string,
      options: {
        limit?: number;
        threshold?: number;
        /** Override organization ID for this search */
        organizationId?: string;
      } = {}
    ): Promise<SearchResult[]> => {
      const { limit = 5, threshold = 0.3, organizationId: overrideOrgId } = options;
      const orgId = overrideOrgId || organizationId;

      // Get the entity's embedding — scoped to organization
      let query = supabase
        .from('entity_embeddings')
        .select('embedding, content_text')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId);

      // Apply org filter for multi-tenant isolation
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data: entity, error: fetchError } = await query.maybeSingle();

      if (fetchError) throw fetchError;
      if (!entity) {
        throw new Error('Entity embedding not found');
      }

      // Find similar entities (excluding itself)
      const rpcParams: Record<string, any> = {
        query_embedding: entity.embedding,
        match_threshold: threshold,
        match_count: limit + 1,
        filter_entity_types: null,
      };

      // Add organization_id filter for multi-tenant isolation
      if (orgId) {
        rpcParams.filter_organization_id = orgId;
      }

      const { data: results, error } = await supabase.rpc('search_embeddings', rpcParams);

      if (error) throw error;

      // Filter out the original entity
      return (results || [])
        .filter((r: any) => !(r.entity_type === entityType && r.entity_id === entityId))
        .slice(0, limit)
        .map((r: any) => ({
          entity_type: r.entity_type,
          entity_id: r.entity_id,
          content_text: r.content_text,
          similarity: r.similarity,
          metadata: r.metadata,
        }));
    },
  };
}
