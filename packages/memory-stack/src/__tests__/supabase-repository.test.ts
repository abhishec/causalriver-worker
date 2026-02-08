/**
 * Supabase Repository Tests
 *
 * Tests the centralized persistence layer with a mock Supabase client.
 * Validates all CRUD operations: signals, embeddings, memories,
 * relationships, cache, temporal memory, conversations, activity logging.
 */

import { describe, it, expect } from 'vitest';
import { createSupabaseRepository } from '../persistence/supabase-repository';
import { createMockSupabase } from './helpers/mock-supabase';

const ORG_ID = 'org_test_123';

// ============================================================================
// FACTORY
// ============================================================================

describe('Supabase Repository', () => {
  describe('createSupabaseRepository', () => {
    it('should return an object with all expected methods', () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      expect(typeof repo.insertSignals).toBe('function');
      expect(typeof repo.getSignalsByDomain).toBe('function');
      expect(typeof repo.getSignalsByEntity).toBe('function');
      expect(typeof repo.upsertEmbedding).toBe('function');
      expect(typeof repo.getEmbeddingByEntity).toBe('function');
      expect(typeof repo.upsertMemory).toBe('function');
      expect(typeof repo.getMemories).toBe('function');
      expect(typeof repo.upsertRelationship).toBe('function');
      expect(typeof repo.getSignificantRelationships).toBe('function');
      expect(typeof repo.persistCacheState).toBe('function');
      expect(typeof repo.loadCacheState).toBe('function');
      expect(typeof repo.persistTemporalMemories).toBe('function');
      expect(typeof repo.loadTemporalMemories).toBe('function');
      expect(typeof repo.appendConversation).toBe('function');
      expect(typeof repo.getConversation).toBe('function');
      expect(typeof repo.logActivity).toBe('function');
      expect(typeof repo.getOrganizationId).toBe('function');
    });

    it('should return the correct organization ID', () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);
      expect(repo.getOrganizationId()).toBe(ORG_ID);
    });
  });

  // ============================================================================
  // SIGNALS
  // ============================================================================

  describe('Signals', () => {
    it('should insert signals into cross_domain_signals', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.insertSignals([
        {
          source_domain: 'finance',
          signal_type: 'revenue_change',
          signal_value: 0.15,
          entity_type: 'metric',
          entity_id: 'mrr',
        },
        {
          source_domain: 'support',
          signal_type: 'ticket_volume',
          signal_value: -0.3,
          entity_type: 'metric',
          entity_id: 'tickets',
        },
      ]);

      const inserted = supabase._getInserted();
      expect(inserted['cross_domain_signals']).toHaveLength(2);
      expect(inserted['cross_domain_signals'][0].source_domain).toBe('finance');
      expect(inserted['cross_domain_signals'][0].organization_id).toBe(ORG_ID);
      expect(inserted['cross_domain_signals'][1].source_domain).toBe('support');
    });

    it('should skip insert when signals array is empty', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.insertSignals([]);
      const inserted = supabase._getInserted();
      expect(inserted['cross_domain_signals']).toBeUndefined();
    });

    it('should get signals by domain', async () => {
      const mockSignals = [
        { source_domain: 'finance', signal_value: 0.5, created_at: '2025-01-01' },
      ];
      const supabase = createMockSupabase({ cross_domain_signals: mockSignals }) as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      const results = await repo.getSignalsByDomain('finance', new Date('2025-01-01'));
      expect(results).toHaveLength(1);
      expect(results[0].source_domain).toBe('finance');
    });

    it('should get signals by entity', async () => {
      const mockSignals = [
        { entity_type: 'client', entity_id: 'acme', signal_value: 0.8 },
      ];
      const supabase = createMockSupabase({ cross_domain_signals: mockSignals }) as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      const results = await repo.getSignalsByEntity('client', 'acme');
      expect(results).toHaveLength(1);
      expect(results[0].entity_id).toBe('acme');
    });
  });

  // ============================================================================
  // EMBEDDINGS
  // ============================================================================

  describe('Embeddings', () => {
    it('should upsert an embedding', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.upsertEmbedding({
        entityType: 'client',
        entityId: 'acme',
        contentText: 'Acme Corporation',
        contentHash: 'abc123',
        embedding: [0.1, 0.2, 0.3],
        importanceScore: 0.8,
      });

      const inserted = supabase._getInserted();
      expect(inserted['entity_embeddings']).toHaveLength(1);
      expect(inserted['entity_embeddings'][0].entity_type).toBe('client');
      expect(inserted['entity_embeddings'][0].organization_id).toBe(ORG_ID);
      expect(inserted['entity_embeddings'][0].importance_score).toBe(0.8);
    });

    it('should default importance_score to 0.5', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.upsertEmbedding({
        entityType: 'doc',
        entityId: 'd1',
        contentText: 'Test doc',
        contentHash: 'hash',
        embedding: [0.5],
      });

      const inserted = supabase._getInserted();
      expect(inserted['entity_embeddings'][0].importance_score).toBe(0.5);
    });

    it('should get embedding by entity', async () => {
      const mockEmb = [
        { entity_type: 'client', entity_id: 'acme', embedding: '[0.1, 0.2]' },
      ];
      const supabase = createMockSupabase({ entity_embeddings: mockEmb }) as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      const result = await repo.getEmbeddingByEntity('client', 'acme');
      expect(result).toBeTruthy();
      expect(result.entity_type).toBe('client');
    });
  });

  // ============================================================================
  // ORGANIZATIONAL MEMORY
  // ============================================================================

  describe('Organizational Memory', () => {
    it('should upsert a memory', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.upsertMemory({
        memoryType: 'insight',
        domain: 'finance',
        content: 'Late payments correlate with churn',
        importance: 0.9,
        metadata: { source: 'causal_discovery' },
      });

      const inserted = supabase._getInserted();
      expect(inserted['ai_memory']).toHaveLength(1);
      expect(inserted['ai_memory'][0].memory_type).toBe('insight');
      expect(inserted['ai_memory'][0].domain).toBe('finance');
      expect(inserted['ai_memory'][0].importance).toBe(0.9);
    });

    it('should default domain to general and importance to 0.5', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.upsertMemory({
        memoryType: 'observation',
        content: 'General observation',
      });

      const inserted = supabase._getInserted();
      expect(inserted['ai_memory'][0].domain).toBe('general');
      expect(inserted['ai_memory'][0].importance).toBe(0.5);
    });

    it('should get memories filtered by domain', async () => {
      const mockMemories = [
        { memory_type: 'insight', domain: 'finance', content: 'Finance insight', importance: 0.9 },
      ];
      const supabase = createMockSupabase({ ai_memory: mockMemories }) as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      const results = await repo.getMemories('finance', 10);
      expect(results).toHaveLength(1);
    });
  });

  // ============================================================================
  // CAUSAL RELATIONSHIPS
  // ============================================================================

  describe('Causal Relationships', () => {
    it('should upsert a causal relationship', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.upsertRelationship({
        sourceDomain: 'engineering',
        targetDomain: 'support',
        effectSize: 0.65,
        pValue: 0.01,
        lagDays: 7,
        confidence: 0.85,
        naturalLanguage: 'Engineering deploy failures increase support tickets by 65% after 7 days',
      });

      const inserted = supabase._getInserted();
      expect(inserted['causal_relationships_statistical']).toHaveLength(1);
      const row = inserted['causal_relationships_statistical'][0] as any;
      expect(row.source_domain).toBe('engineering');
      expect(row.target_domain).toBe('support');
      expect(row.effect_size).toBe(0.65);
      expect(row.is_significant).toBe(true); // p < 0.05
    });

    it('should mark non-significant when p >= 0.05', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.upsertRelationship({
        sourceDomain: 'marketing',
        targetDomain: 'finance',
        effectSize: 0.1,
        pValue: 0.08,
        lagDays: 14,
        confidence: 0.3,
      });

      const inserted = supabase._getInserted();
      const row = inserted['causal_relationships_statistical'][0] as any;
      expect(row.is_significant).toBe(false);
    });

    it('should get significant relationships', async () => {
      const mockRels = [
        { source_domain: 'engineering', target_domain: 'support', effect_size: 0.65, is_significant: true },
      ];
      const supabase = createMockSupabase({ causal_relationships_statistical: mockRels }) as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      const results = await repo.getSignificantRelationships(0.5);
      expect(results).toHaveLength(1);
    });
  });

  // ============================================================================
  // CACHE PERSISTENCE
  // ============================================================================

  describe('Cache Persistence', () => {
    it('should persist cache state', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      const cacheState = { entries: [{ key: 'a', value: [0.1, 0.2] }], maxSize: 1000 };
      await repo.persistCacheState('embedding_cache', cacheState);

      const inserted = supabase._getInserted();
      expect(inserted['embedding_cache_state']).toHaveLength(1);
      expect(inserted['embedding_cache_state'][0].cache_key).toBe('embedding_cache');
    });

    it('should load cache state', async () => {
      const mockCache = [{ cache_value: { entries: [], maxSize: 500 } }];
      const supabase = createMockSupabase({ embedding_cache_state: mockCache }) as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      const result = await repo.loadCacheState('embedding_cache');
      expect(result).toBeTruthy();
      expect((result as any).maxSize).toBe(500);
    });

    it('should return null when cache state not found', async () => {
      const supabase = createMockSupabase({ embedding_cache_state: [] }) as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      const result = await repo.loadCacheState('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // TEMPORAL MEMORY
  // ============================================================================

  describe('Temporal Memory', () => {
    it('should persist temporal memories', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.persistTemporalMemories([
        {
          memoryId: 'mem_1',
          memoryType: 'observation',
          content: { text: 'Engineering velocity dropped' },
          baseRelevance: 1.0,
          currentRelevance: 0.8,
          reinforcementScore: 2,
          accessCount: 5,
          lastAccessedAt: new Date('2025-02-01'),
        },
      ]);

      const inserted = supabase._getInserted();
      expect(inserted['temporal_memory_state']).toHaveLength(1);
      expect(inserted['temporal_memory_state'][0].memory_id).toBe('mem_1');
      expect(inserted['temporal_memory_state'][0].organization_id).toBe(ORG_ID);
    });

    it('should skip persist when array is empty', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.persistTemporalMemories([]);
      const inserted = supabase._getInserted();
      expect(inserted['temporal_memory_state']).toBeUndefined();
    });

    it('should load temporal memories', async () => {
      const mockMemories = [
        { memory_id: 'mem_1', current_relevance: 0.9, content: { text: 'Test' } },
      ];
      const supabase = createMockSupabase({ temporal_memory_state: mockMemories }) as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      const results = await repo.loadTemporalMemories();
      expect(results).toHaveLength(1);
    });
  });

  // ============================================================================
  // CONVERSATION HISTORY
  // ============================================================================

  describe('Conversation History', () => {
    it('should append a conversation message', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.appendConversation({
        conversationId: 'conv_123',
        role: 'user',
        content: 'Why is churn increasing?',
        tokensUsed: 15,
        contextSnapshot: { domain: 'cs' },
      });

      const inserted = supabase._getInserted();
      expect(inserted['conversation_log']).toHaveLength(1);
      expect(inserted['conversation_log'][0].conversation_id).toBe('conv_123');
      expect(inserted['conversation_log'][0].role).toBe('user');
      expect(inserted['conversation_log'][0].organization_id).toBe(ORG_ID);
    });

    it('should get conversation history', async () => {
      const mockConv = [
        { conversation_id: 'conv_123', role: 'user', content: 'Hello', created_at: '2025-02-01' },
        { conversation_id: 'conv_123', role: 'assistant', content: 'Hi!', created_at: '2025-02-01' },
      ];
      const supabase = createMockSupabase({ conversation_log: mockConv }) as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      const results = await repo.getConversation('conv_123');
      expect(results).toHaveLength(2);
    });
  });

  // ============================================================================
  // ACTIVITY LOGGING
  // ============================================================================

  describe('Activity Logging', () => {
    it('should log an activity', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.logActivity({
        agentType: 'llm_response_layer',
        actionType: 'query',
        inputSummary: 'Why is churn increasing?',
        outputSummary: 'Based on causal analysis...',
        tokensUsed: 450,
        metadata: { provider: 'anthropic' },
      });

      const inserted = supabase._getInserted();
      expect(inserted['ai_agent_activity']).toHaveLength(1);
      expect(inserted['ai_agent_activity'][0].agent_type).toBe('llm_response_layer');
      expect(inserted['ai_agent_activity'][0].tokens_used).toBe(450);
      expect(inserted['ai_agent_activity'][0].organization_id).toBe(ORG_ID);
    });

    it('should default optional fields', async () => {
      const supabase = createMockSupabase() as any;
      const repo = createSupabaseRepository(supabase, ORG_ID);

      await repo.logActivity({
        agentType: 'test',
        actionType: 'test_action',
      });

      const inserted = supabase._getInserted();
      expect(inserted['ai_agent_activity'][0].input_summary).toBe('');
      expect(inserted['ai_agent_activity'][0].output_summary).toBe('');
      expect(inserted['ai_agent_activity'][0].tokens_used).toBe(0);
    });
  });
});
