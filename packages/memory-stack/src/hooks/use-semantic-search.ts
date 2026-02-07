/**
 * Nexus Memory Stack - Semantic Search Hook
 *
 * React hook for semantic search and RAG context retrieval.
 * Provides memory-weighted search results for AI-enhanced responses.
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SearchResult, RAGContext, MemoryWeightedRAGContext } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface UseSemanticSearchOptions {
  supabase: SupabaseClient;
  organizationId: string | null;
  functionsUrl?: string;
}

export interface SearchOptions {
  query: string;
  entityTypes?: string[];
  threshold?: number;
  limit?: number;
}

export interface RAGOptions {
  query: string;
  contextLimit?: number;
  memoryLimit?: number;
  includeMemory?: boolean;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for semantic search and RAG context
 *
 * @example
 * ```typescript
 * const { search, getRAGContext, isSearching } = useSemanticSearch({
 *   supabase,
 *   organizationId,
 * });
 *
 * // Perform a search
 * const results = await search({ query: 'client payment issues' });
 *
 * // Get RAG context for AI
 * const context = await getRAGContext({ query: userQuestion, includeMemory: true });
 * ```
 */
export function useSemanticSearch(options: UseSemanticSearchOptions) {
  const { supabase, organizationId, functionsUrl } = options;

  const getFunctionsUrl = () => {
    if (functionsUrl) return functionsUrl;
    // Try to get from environment or supabase config
    const url = (supabase as any)?.supabaseUrl;
    return url ? `${url}/functions/v1` : '';
  };

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (searchOptions: SearchOptions): Promise<SearchResult[]> => {
      if (!organizationId) return [];

      const baseUrl = getFunctionsUrl();
      if (!baseUrl) {
        console.error('[useSemanticSearch] Functions URL not configured');
        return [];
      }

      const response = await fetch(`${baseUrl}/semantic-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          action: 'search',
          query: searchOptions.query,
          entity_types: searchOptions.entityTypes,
          threshold: searchOptions.threshold || 0.25,
          limit: searchOptions.limit || 10,
        }),
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      return data.results || [];
    },
  });

  // RAG context mutation
  const ragMutation = useMutation({
    mutationFn: async (ragOptions: RAGOptions): Promise<RAGContext | MemoryWeightedRAGContext> => {
      if (!organizationId) {
        return { query: ragOptions.query, results: [], context_string: '', count: 0 };
      }

      const baseUrl = getFunctionsUrl();
      if (!baseUrl) {
        console.error('[useSemanticSearch] Functions URL not configured');
        return { query: ragOptions.query, results: [], context_string: '', count: 0 };
      }

      const action = ragOptions.includeMemory ? 'rag-context-memory' : 'rag-context';

      const response = await fetch(`${baseUrl}/semantic-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          action,
          query: ragOptions.query,
          context_limit: ragOptions.contextLimit || 8,
          entity_limit: ragOptions.contextLimit || 5,
          memory_limit: ragOptions.memoryLimit || 3,
        }),
      });

      if (!response.ok) {
        throw new Error('RAG context retrieval failed');
      }

      return response.json();
    },
  });

  // Related entities mutation
  const relatedMutation = useMutation({
    mutationFn: async (options: {
      entityType: string;
      entityId: string;
      limit?: number;
    }): Promise<SearchResult[]> => {
      if (!organizationId) return [];

      const baseUrl = getFunctionsUrl();
      if (!baseUrl) return [];

      const response = await fetch(`${baseUrl}/semantic-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          action: 'related',
          entity_type: options.entityType,
          entity_id: options.entityId,
          limit: options.limit || 5,
        }),
      });

      if (!response.ok) {
        throw new Error('Related search failed');
      }

      const data = await response.json();
      return data.related || [];
    },
  });

  return {
    // Search function
    search: searchMutation.mutateAsync,
    isSearching: searchMutation.isPending,
    searchError: searchMutation.error,
    searchResults: searchMutation.data,

    // RAG context function
    getRAGContext: ragMutation.mutateAsync,
    isGettingContext: ragMutation.isPending,
    ragError: ragMutation.error,
    ragContext: ragMutation.data,

    // Related entities function
    findRelated: relatedMutation.mutateAsync,
    isFindingRelated: relatedMutation.isPending,
    relatedResults: relatedMutation.data,
  };
}

/**
 * Hook for simple search with auto-refresh
 */
export function useSearchQuery(
  options: UseSemanticSearchOptions & { query: string; enabled?: boolean }
) {
  const { supabase, organizationId, functionsUrl, query, enabled = true } = options;

  return useQuery({
    queryKey: ['semantic-search', organizationId, query],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!organizationId || !query) return [];

      const baseUrl = functionsUrl || `${(supabase as any)?.supabaseUrl}/functions/v1`;

      const response = await fetch(`${baseUrl}/semantic-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          action: 'search',
          query,
          threshold: 0.25,
          limit: 10,
        }),
      });

      if (!response.ok) return [];

      const data = await response.json();
      return data.results || [];
    },
    enabled: enabled && !!organizationId && query.length >= 3,
    staleTime: 30000,
  });
}
