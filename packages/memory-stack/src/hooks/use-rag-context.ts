/**
 * Nexus Memory Stack - RAG Context Hook
 *
 * Dedicated React hook for RAG (Retrieval-Augmented Generation) context.
 * Provides memory-weighted context retrieval with built-in caching.
 *
 * CRITICAL: All queries are organization-scoped for multi-tenant isolation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RAGContext, MemoryWeightedRAGContext, SearchResult } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface UseRAGContextOptions {
  supabase: SupabaseClient;
  organizationId: string | null;
  functionsUrl?: string;
  /** Enable memory weighting (default: true) */
  includeMemory?: boolean;
  /** Maximum entity results (default: 5) */
  entityLimit?: number;
  /** Maximum memory results (default: 3) */
  memoryLimit?: number;
  /** Similarity threshold (default: 0.4) */
  threshold?: number;
}

export interface RAGContextResult {
  /** Get RAG context for a query */
  getContext: (query: string) => Promise<MemoryWeightedRAGContext>;
  /** Current context (from last query) */
  context: MemoryWeightedRAGContext | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Format context for LLM prompt */
  formatForPrompt: (context: MemoryWeightedRAGContext) => string;
  /** Clear cached context */
  clearCache: () => void;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for RAG context retrieval with memory-weighting
 *
 * @example
 * ```typescript
 * const { getContext, formatForPrompt } = useRAGContext({
 *   supabase,
 *   organizationId,
 *   includeMemory: true,
 * });
 *
 * // Get context for user query
 * const context = await getContext("How is client health?");
 *
 * // Format for LLM
 * const promptContext = formatForPrompt(context);
 * ```
 */
export function useRAGContext(options: UseRAGContextOptions): RAGContextResult {
  const {
    supabase,
    organizationId,
    functionsUrl,
    includeMemory = true,
    entityLimit = 5,
    memoryLimit = 3,
    threshold = 0.4,
  } = options;

  const queryClient = useQueryClient();

  const getFunctionsUrl = () => {
    if (functionsUrl) return functionsUrl;
    const url = (supabase as any)?.supabaseUrl;
    return url ? `${url}/functions/v1` : '';
  };

  // RAG context mutation
  const contextMutation = useMutation({
    mutationFn: async (query: string): Promise<MemoryWeightedRAGContext> => {
      if (!organizationId) {
        return {
          query,
          memory_results: [],
          entity_results: [],
          context_string: '',
          memory_count: 0,
          entity_count: 0,
        };
      }

      const baseUrl = getFunctionsUrl();
      if (!baseUrl) {
        throw new Error('Functions URL not configured');
      }

      const action = includeMemory ? 'rag-context-memory' : 'rag-context';

      const response = await fetch(`${baseUrl}/semantic-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          action,
          query,
          organization_id: organizationId, // Multi-tenant isolation
          entity_limit: entityLimit,
          memory_limit: memoryLimit,
          match_threshold: threshold,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`RAG context retrieval failed: ${errorText}`);
      }

      const data = await response.json();

      // Normalize response format
      if (includeMemory) {
        return data as MemoryWeightedRAGContext;
      }

      // Convert simple RAG to memory-weighted format
      const simpleContext = data as RAGContext;
      return {
        query: simpleContext.query,
        memory_results: [],
        entity_results: simpleContext.results,
        context_string: simpleContext.context_string,
        memory_count: 0,
        entity_count: simpleContext.count,
      };
    },
  });

  /**
   * Format context for inclusion in LLM prompts
   */
  const formatForPrompt = (context: MemoryWeightedRAGContext): string => {
    const parts: string[] = [];

    // Add memory/learned patterns first (higher priority)
    if (context.memory_results.length > 0) {
      parts.push('## 🧠 Learned Patterns & Memory');
      parts.push('The following are patterns learned from historical data:');
      for (const memory of context.memory_results) {
        const confidence = memory.metadata?.confidence
          ? Math.round((memory.metadata.confidence as number) * 100)
          : 80;
        parts.push(`- 🧠 ${memory.content_text} (Confidence: ${confidence}%)`);
      }
      parts.push('');
    }

    // Add entity results
    if (context.entity_results.length > 0) {
      // Group by entity type
      const grouped: Record<string, SearchResult[]> = {};
      for (const result of context.entity_results) {
        const type = result.entity_type;
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(result);
      }

      for (const [type, results] of Object.entries(grouped)) {
        const typeName = type.charAt(0).toUpperCase() + type.slice(1);
        parts.push(`## Relevant ${typeName}s`);
        for (const result of results) {
          const relevance = Math.round(result.similarity * 100);
          parts.push(`- ${result.content_text} (Relevance: ${relevance}%)`);
        }
        parts.push('');
      }
    }

    if (parts.length === 0) {
      return 'No relevant context found.';
    }

    return parts.join('\n').trim();
  };

  return {
    getContext: contextMutation.mutateAsync,
    context: contextMutation.data || null,
    isLoading: contextMutation.isPending,
    error: contextMutation.error,
    formatForPrompt,
    clearCache: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-context', organizationId] });
    },
  };
}

/**
 * Hook for preloaded RAG context (auto-fetches on mount)
 */
export function usePreloadedRAGContext(
  options: UseRAGContextOptions & { query: string; enabled?: boolean }
) {
  const { query, enabled = true, ...restOptions } = options;
  const { organizationId, supabase, functionsUrl, includeMemory = true } = restOptions;

  return useQuery({
    queryKey: ['rag-context', organizationId, query, includeMemory],
    queryFn: async (): Promise<MemoryWeightedRAGContext> => {
      if (!organizationId || !query) {
        return {
          query: query || '',
          memory_results: [],
          entity_results: [],
          context_string: '',
          memory_count: 0,
          entity_count: 0,
        };
      }

      const baseUrl = functionsUrl || `${(supabase as any)?.supabaseUrl}/functions/v1`;
      const action = includeMemory ? 'rag-context-memory' : 'rag-context';

      const response = await fetch(`${baseUrl}/semantic-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          action,
          query,
          organization_id: organizationId,
        }),
      });

      if (!response.ok) {
        throw new Error('RAG context retrieval failed');
      }

      return response.json();
    },
    enabled: enabled && !!organizationId && query.length >= 3,
    staleTime: 60000, // 1 minute
  });
}
