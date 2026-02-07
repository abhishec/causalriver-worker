/**
 * Nexus Memory Stack - Semantic Search Tests
 *
 * Tests for the vector similarity search engine.
 * Validates factory creation, embedding generation, RPC-based search,
 * RAG context retrieval, memory-weighted context, and related entity lookup.
 */

import { describe, it, expect } from 'vitest';
import { createSemanticSearch } from '../core/search/semantic-search';
import { createMockSupabase } from './helpers/mock-supabase';

// ============================================================================
// MOCK DATA
// ============================================================================

const mockSearchResults = [
  { entity_type: 'client', entity_id: 'c1', content_text: 'Acme Corp', similarity: 0.9, metadata: {} },
  { entity_type: 'invoice', entity_id: 'i1', content_text: 'Invoice #123', similarity: 0.7, metadata: {} },
];

const mockRAGContext = [
  { entity_type: 'client', entity_id: 'c1', content: 'Client Acme', relevance: 90, metadata: {} },
  { entity_type: 'invoice', entity_id: 'i1', content: 'Invoice data', relevance: 70, metadata: {} },
];

const mockMemoryResults = [
  { entity_type: 'pattern', entity_id: 'p1', content_text: 'Late payments correlate with churn', similarity: 0.85, source_type: 'memory', metadata: { confidence: 0.9 } },
  { entity_type: 'client', entity_id: 'c1', content_text: 'Acme Corp data', similarity: 0.75, source_type: 'entity', metadata: {} },
];

describe('Semantic Search', () => {
  // ============================================================================
  // FACTORY CREATION
  // ============================================================================

  describe('createSemanticSearch', () => {
    it('should return an object with all expected methods', () => {
      const search = createSemanticSearch();

      expect(typeof search.embedQuery).toBe('function');
      expect(typeof search.search).toBe('function');
      expect(typeof search.getRAGContext).toBe('function');
      expect(typeof search.getMemoryWeightedRAGContext).toBe('function');
      expect(typeof search.searchMemory).toBe('function');
      expect(typeof search.findRelated).toBe('function');
    });
  });

  // ============================================================================
  // EMBED QUERY
  // ============================================================================

  describe('embedQuery', () => {
    it('should return an array of correct dimensions (default 384)', () => {
      const search = createSemanticSearch();
      const embedding = search.embedQuery('test query');

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(384);
      // All values should be numbers
      for (const val of embedding) {
        expect(typeof val).toBe('number');
        expect(Number.isFinite(val)).toBe(true);
      }
    });

    it('should return an array matching custom dimensions from config', () => {
      const search = createSemanticSearch({ dimensions: 128 });
      const embedding = search.embedQuery('test query');

      expect(embedding.length).toBe(128);
    });

    it('should return consistent results for the same query', () => {
      const search = createSemanticSearch();
      const embedding1 = search.embedQuery('consistent query');
      const embedding2 = search.embedQuery('consistent query');

      expect(embedding1).toEqual(embedding2);
    });
  });

  // ============================================================================
  // SEARCH
  // ============================================================================

  describe('search', () => {
    it('should call rpc and return mapped SearchResult array', async () => {
      const supabase = createMockSupabase({
        rpc_search_embeddings: mockSearchResults,
      });

      const search = createSemanticSearch();
      const results = await search.search(supabase, 'find clients');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        entity_type: 'client',
        entity_id: 'c1',
        content_text: 'Acme Corp',
        similarity: 0.9,
        metadata: {},
      });
      expect(results[1]).toEqual({
        entity_type: 'invoice',
        entity_id: 'i1',
        content_text: 'Invoice #123',
        similarity: 0.7,
        metadata: {},
      });
    });

    it('should pass filter_organization_id when organizationId is configured', async () => {
      let capturedParams: Record<string, unknown> = {};
      const supabase = {
        rpc: (name: string, params: Record<string, unknown>) => {
          capturedParams = params;
          return { data: mockSearchResults, error: null };
        },
      };

      const search = createSemanticSearch({ organizationId: 'org-123' });
      await search.search(supabase as any, 'find clients');

      expect(capturedParams.filter_organization_id).toBe('org-123');
    });

    it('should allow overriding organizationId per search call', async () => {
      let capturedParams: Record<string, unknown> = {};
      const supabase = {
        rpc: (name: string, params: Record<string, unknown>) => {
          capturedParams = params;
          return { data: mockSearchResults, error: null };
        },
      };

      const search = createSemanticSearch({ organizationId: 'org-123' });
      await search.search(supabase as any, 'find clients', { organizationId: 'org-override' });

      expect(capturedParams.filter_organization_id).toBe('org-override');
    });

    it('should return an empty array when rpc returns no results', async () => {
      const supabase = createMockSupabase({
        rpc_search_embeddings: [],
      });

      const search = createSemanticSearch();
      const results = await search.search(supabase, 'nothing here');

      expect(results).toEqual([]);
      expect(results).toHaveLength(0);
    });

    it('should throw when rpc returns an error', async () => {
      const supabase = {
        rpc: () => ({ data: null, error: new Error('Database connection failed') }),
      };

      const search = createSemanticSearch();
      await expect(search.search(supabase as any, 'query')).rejects.toThrow('Database connection failed');
    });
  });

  // ============================================================================
  // GET RAG CONTEXT
  // ============================================================================

  describe('getRAGContext', () => {
    it('should return RAGContext with query, results, context_string, and count', async () => {
      const supabase = createMockSupabase({
        rpc_get_rag_context: mockRAGContext,
      });

      const search = createSemanticSearch();
      const context = await search.getRAGContext(supabase, 'tell me about clients');

      expect(context.query).toBe('tell me about clients');
      expect(context.results).toHaveLength(2);
      expect(context.count).toBe(2);
      expect(typeof context.context_string).toBe('string');
      expect(context.context_string.length).toBeGreaterThan(0);

      // Results should be mapped with content -> content_text and relevance -> similarity
      expect(context.results[0].entity_type).toBe('client');
      expect(context.results[0].entity_id).toBe('c1');
      expect(context.results[0].content_text).toBe('Client Acme');
      expect(context.results[0].similarity).toBe(0.9); // 90 / 100
    });

    it('should group results by entity_type in context_string', async () => {
      const supabase = createMockSupabase({
        rpc_get_rag_context: mockRAGContext,
      });

      const search = createSemanticSearch();
      const context = await search.getRAGContext(supabase, 'overview');

      // Should contain grouped headers with capitalized type names
      expect(context.context_string).toContain('## Relevant Clients');
      expect(context.context_string).toContain('## Relevant Invoices');

      // Should contain individual item lines
      expect(context.context_string).toContain('- Client Acme (Relevance: 90%)');
      expect(context.context_string).toContain('- Invoice data (Relevance: 70%)');
    });

    it('should return empty context for no results', async () => {
      const supabase = createMockSupabase({
        rpc_get_rag_context: [],
      });

      const search = createSemanticSearch();
      const context = await search.getRAGContext(supabase, 'empty query');

      expect(context.results).toEqual([]);
      expect(context.count).toBe(0);
      expect(context.context_string).toBe('');
    });
  });

  // ============================================================================
  // GET MEMORY-WEIGHTED RAG CONTEXT
  // ============================================================================

  describe('getMemoryWeightedRAGContext', () => {
    it('should separate memory and entity results', async () => {
      const supabase = createMockSupabase({
        rpc_get_rag_context_with_memory: mockMemoryResults,
      });

      const search = createSemanticSearch();
      const context = await search.getMemoryWeightedRAGContext(supabase, 'churn analysis');

      expect(context.query).toBe('churn analysis');
      expect(context.memory_results).toHaveLength(1);
      expect(context.entity_results).toHaveLength(1);
      expect(context.memory_count).toBe(1);
      expect(context.entity_count).toBe(1);

      // Memory result should be the pattern
      expect(context.memory_results[0].entity_type).toBe('pattern');
      expect(context.memory_results[0].entity_id).toBe('p1');
      expect(context.memory_results[0].content_text).toBe('Late payments correlate with churn');

      // Entity result should be the client
      expect(context.entity_results[0].entity_type).toBe('client');
      expect(context.entity_results[0].entity_id).toBe('c1');
      expect(context.entity_results[0].content_text).toBe('Acme Corp data');
    });

    it('should build context_string with memory markers for memory results', async () => {
      const supabase = createMockSupabase({
        rpc_get_rag_context_with_memory: mockMemoryResults,
      });

      const search = createSemanticSearch();
      const context = await search.getMemoryWeightedRAGContext(supabase, 'churn analysis');

      // Memory section header
      expect(context.context_string).toContain('## \u{1F9E0} Learned Patterns & Memory');
      // Memory items should have brain emoji marker and confidence percentage
      expect(context.context_string).toContain('\u{1F9E0} Late payments correlate with churn (Confidence: 90%)');

      // Entity section should be present with grouped header
      expect(context.context_string).toContain('## Clients');
      expect(context.context_string).toContain('- Acme Corp data (Relevance: 75%)');
    });

    it('should handle results with only entity entries and no memory entries', async () => {
      const entityOnly = [
        { entity_type: 'client', entity_id: 'c1', content_text: 'Acme Corp', similarity: 0.8, source_type: 'entity', metadata: {} },
      ];

      const supabase = createMockSupabase({
        rpc_get_rag_context_with_memory: entityOnly,
      });

      const search = createSemanticSearch();
      const context = await search.getMemoryWeightedRAGContext(supabase, 'clients');

      expect(context.memory_results).toHaveLength(0);
      expect(context.entity_results).toHaveLength(1);
      expect(context.memory_count).toBe(0);
      expect(context.entity_count).toBe(1);
      // Should not contain memory section header
      expect(context.context_string).not.toContain('Learned Patterns & Memory');
    });
  });

  // ============================================================================
  // SEARCH MEMORY
  // ============================================================================

  describe('searchMemory', () => {
    it('should return results with confidence metadata', async () => {
      const mockMemorySearch = [
        { entity_type: 'pattern', entity_id: 'p1', content_text: 'Late payments correlate with churn', similarity: 0.85, metadata: { confidence: 0.9, access_count: 5 } },
        { entity_type: 'insight', entity_id: 'ins1', content_text: 'Quarterly revenue trends upward', similarity: 0.65, metadata: {} },
      ];

      const supabase = createMockSupabase({
        rpc_search_memory_weighted: mockMemorySearch,
      });

      const search = createSemanticSearch();
      const results = await search.searchMemory(supabase, 'payment patterns');

      expect(results).toHaveLength(2);

      // First result should preserve existing confidence
      expect(results[0].entity_type).toBe('pattern');
      expect(results[0].similarity).toBe(0.85);
      expect(results[0].metadata?.confidence).toBe(0.9);
      expect(results[0].metadata?.access_count).toBe(5);

      // Second result should get default confidence of 0.8 and access_count of 0
      expect(results[1].entity_type).toBe('insight');
      expect(results[1].similarity).toBe(0.65);
      expect(results[1].metadata?.confidence).toBe(0.8);
      expect(results[1].metadata?.access_count).toBe(0);
    });
  });

  // ============================================================================
  // FIND RELATED
  // ============================================================================

  describe('findRelated', () => {
    it('should return results excluding the source entity', async () => {
      // The mock returns the source entity plus others from search_embeddings
      const relatedResults = [
        { entity_type: 'client', entity_id: 'c1', content_text: 'Acme Corp', similarity: 1.0, metadata: {} },
        { entity_type: 'client', entity_id: 'c2', content_text: 'Beta Inc', similarity: 0.85, metadata: {} },
        { entity_type: 'invoice', entity_id: 'i1', content_text: 'Invoice #456', similarity: 0.72, metadata: {} },
      ];

      // entity_embeddings table provides the source entity embedding
      const entityEmbeddingRow = {
        embedding: '[0.1,0.2,0.3]',
        content_text: 'Acme Corp',
      };

      const supabase = createMockSupabase({
        entity_embeddings: [entityEmbeddingRow],
        rpc_search_embeddings: relatedResults,
      });

      const search = createSemanticSearch();
      const results = await search.findRelated(supabase, 'client', 'c1', { limit: 5 });

      // Source entity (client/c1) should be filtered out
      expect(results.every(r => !(r.entity_type === 'client' && r.entity_id === 'c1'))).toBe(true);
      expect(results).toHaveLength(2);
      expect(results[0].entity_id).toBe('c2');
      expect(results[1].entity_id).toBe('i1');
    });

    it('should throw when source entity embedding is not found', async () => {
      const supabase = createMockSupabase({
        entity_embeddings: [],
      });

      const search = createSemanticSearch();
      await expect(
        search.findRelated(supabase, 'client', 'nonexistent')
      ).rejects.toThrow('Entity embedding not found');
    });
  });
});
