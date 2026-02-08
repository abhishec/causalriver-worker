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
  } = config;

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

      return {
        query,
        memory_results: memoryResults.map(mapResult),
        entity_results: entityResults.map(mapResult),
        context_string: contextString.trim(),
        memory_count: memoryResults.length,
        entity_count: entityResults.length,
      };
    },

    /**
     * Search memory specifically (patterns, insights, predictions)
     */
    searchMemory: async (
      supabase: any,
      query: string,
      options: {
        threshold?: number;
        limit?: number;
      } = {}
    ): Promise<SearchResult[]> => {
      const { threshold = 0.4, limit = 5 } = options;

      const queryEmbedding = await generateQueryEmbedding(query);

      const { data: results, error } = await supabase.rpc('search_memory_weighted', {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        match_threshold: threshold,
        match_count: limit,
      });

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
     */
    findRelated: async (
      supabase: any,
      entityType: string,
      entityId: string,
      options: {
        limit?: number;
        threshold?: number;
      } = {}
    ): Promise<SearchResult[]> => {
      const { limit = 5, threshold = 0.3 } = options;

      // Get the entity's embedding
      const { data: entity, error: fetchError } = await supabase
        .from('entity_embeddings')
        .select('embedding, content_text')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!entity) {
        throw new Error('Entity embedding not found');
      }

      // Find similar entities (excluding itself)
      const { data: results, error } = await supabase.rpc('search_embeddings', {
        query_embedding: entity.embedding,
        match_threshold: threshold,
        match_count: limit + 1,
        filter_entity_types: null,
      });

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
