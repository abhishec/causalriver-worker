/**
 * Supabase Repository — Centralized Persistence Layer
 *
 * Provides a clean abstraction over all Supabase table operations.
 * Instead of scattered `supabase.from('table').insert()` calls
 * throughout the codebase, all persistence goes through this repository.
 *
 * Supports:
 *   - Signal storage (cross_domain_signals)
 *   - Embedding upserts (entity_embeddings)
 *   - Organizational memory (ai_memory)
 *   - Causal relationships (causal_relationships_statistical)
 *   - Cache state persistence (embedding_cache_state)
 *   - Temporal memory persistence (temporal_memory_state)
 *   - Conversation history (conversation_log)
 *   - Activity logging (ai_agent_activity)
 *
 * @example
 * ```typescript
 * const repo = createSupabaseRepository(supabase, 'org_123');
 * await repo.insertSignals([{ source_domain: 'finance', signal_type: 'revenue', ... }]);
 * await repo.upsertMemory({ memoryType: 'insight', content: 'Churn correlates with support tickets' });
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal } from '../connectors/connector-framework';

/**
 * The core brain org ID — duplicated here to avoid circular import
 * from ../index.ts (which re-exports supabase-repository).
 */
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================================
// TYPES
// ============================================================================

export interface EmbeddingUpsertParams {
  entityType: string;
  entityId: string;
  contentText: string;
  contentHash: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  importanceScore?: number;
}

export interface MemoryUpsertParams {
  memoryType: string;
  domain?: string;
  content: string;
  importance?: number;
  metadata?: Record<string, unknown>;
}

export interface RelationshipUpsertParams {
  sourceDomain: string;
  targetDomain: string;
  effectSize: number;
  pValue: number;
  lagDays: number;
  confidence: number;
  naturalLanguage?: string;
  sampleSize?: number;
  isSignificant?: boolean;
}

export interface ActivityLogEntry {
  agentType: string;
  actionType: string;
  inputSummary?: string;
  outputSummary?: string;
  tokensUsed?: number;
  metadata?: Record<string, unknown>;
}

export interface ConversationEntry {
  conversationId: string;
  role: string;
  content: string;
  tokensUsed?: number;
  contextSnapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Central persistence interface for NexusBrain.
 * All database operations flow through this interface.
 */
export interface NexusRepository {
  // ── Signals ──────────────────────────────────────────────────────
  /** Insert signals into cross_domain_signals */
  insertSignals(signals: ConnectorSignal[]): Promise<void>;
  /** Get signals by domain with time filter */
  getSignalsByDomain(domain: string, since: Date): Promise<any[]>;
  /** Get signals for a specific entity */
  getSignalsByEntity(entityType: string, entityId: string): Promise<any[]>;

  // ── Embeddings ───────────────────────────────────────────────────
  /** Upsert an entity embedding (creates or updates by entity_type + entity_id) */
  upsertEmbedding(params: EmbeddingUpsertParams): Promise<void>;
  /** Get embedding by entity type and ID */
  getEmbeddingByEntity(entityType: string, entityId: string): Promise<any | null>;

  // ── Organizational Memory ────────────────────────────────────────
  /** Create or update an ai_memory entry */
  upsertMemory(memory: MemoryUpsertParams): Promise<void>;
  /** Get memories, optionally filtered by domain */
  getMemories(domain?: string, limit?: number): Promise<any[]>;

  // ── Causal Relationships ─────────────────────────────────────────
  /** Upsert a causal relationship */
  upsertRelationship(rel: RelationshipUpsertParams): Promise<void>;
  /** Get statistically significant relationships */
  getSignificantRelationships(minConfidence?: number): Promise<any[]>;

  // ── Cache Persistence ────────────────────────────────────────────
  /** Persist cache state (keyed by cache namespace) */
  persistCacheState(cacheKey: string, state: unknown): Promise<void>;
  /** Load previously persisted cache state */
  loadCacheState(cacheKey: string): Promise<unknown | null>;

  // ── Temporal Memory ──────────────────────────────────────────────
  /** Persist temporal memory states */
  persistTemporalMemories(memories: Array<{
    memoryId: string;
    memoryType: string;
    content: unknown;
    baseRelevance: number;
    currentRelevance: number;
    reinforcementScore: number;
    accessCount: number;
    lastAccessedAt?: Date;
  }>): Promise<void>;
  /** Load temporal memory states */
  loadTemporalMemories(): Promise<any[]>;

  // ── Conversation History ─────────────────────────────────────────
  /** Append a message to a conversation */
  appendConversation(entry: ConversationEntry): Promise<void>;
  /** Get conversation history */
  getConversation(conversationId: string, limit?: number): Promise<any[]>;

  // ── Activity Logging ─────────────────────────────────────────────
  /** Log an activity (agent action, LLM call, etc.) */
  logActivity(entry: ActivityLogEntry): Promise<void>;

  // ── Federated Queries (org + core brain) ───────────────────────
  /** Get significant relationships merged with core brain knowledge */
  getFederatedRelationships(minConfidence?: number): Promise<any[]>;
  /** Get memories merged with core brain knowledge */
  getFederatedMemories(domain?: string, limit?: number): Promise<any[]>;
  /** Get brain grammar rules merged with core brain rules */
  getFederatedRules(limit?: number): Promise<any[]>;

  // ── Organization Info ────────────────────────────────────────────
  /** Get the organization ID this repository is scoped to */
  getOrganizationId(): string;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a Supabase-backed repository for NexusBrain persistence.
 *
 * All operations are scoped to the given organization ID.
 * The repository wraps Supabase client calls into a clean interface.
 *
 * @param supabase - Supabase client instance
 * @param organizationId - Organization to scope all queries to
 */
export function createSupabaseRepository(
  supabase: SupabaseClient,
  organizationId: string
): NexusRepository {
  return {
    // ── Signals ────────────────────────────────────────────────────

    async insertSignals(signals: ConnectorSignal[]): Promise<void> {
      if (signals.length === 0) return;

      const rows = signals.map((s) => ({
        organization_id: s.organization_id || organizationId,
        source_domain: s.source_domain,
        signal_type: s.signal_type,
        signal_value: s.signal_value,
        entity_type: s.entity_type || 'unknown',
        entity_id: s.entity_id || `auto_${Date.now()}`,
        client_id: s.client_id || null,
        signal_metadata: s.metadata || {},
        created_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from('cross_domain_signals').insert(rows);
      if (error) throw new Error(`Failed to insert signals: ${error.message}`);
    },

    async getSignalsByDomain(domain: string, since: Date): Promise<any[]> {
      const { data, error } = await supabase
        .from('cross_domain_signals')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('source_domain', domain)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw new Error(`Failed to get signals: ${error.message}`);
      return data || [];
    },

    async getSignalsByEntity(entityType: string, entityId: string): Promise<any[]> {
      const { data, error } = await supabase
        .from('cross_domain_signals')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw new Error(`Failed to get signals by entity: ${error.message}`);
      return data || [];
    },

    // ── Embeddings ─────────────────────────────────────────────────

    async upsertEmbedding(params: EmbeddingUpsertParams): Promise<void> {
      const row = {
        organization_id: organizationId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        content: params.contentText,
        content_hash: params.contentHash,
        embedding: JSON.stringify(params.embedding),
        metadata: params.metadata || {},
        importance_score: params.importanceScore ?? 0.5,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('entity_embeddings')
        .upsert(row, {
          onConflict: 'organization_id,entity_type,entity_id',
        });

      if (error) throw new Error(`Failed to upsert embedding: ${error.message}`);
    },

    async getEmbeddingByEntity(entityType: string, entityId: string): Promise<any | null> {
      const { data, error } = await supabase
        .from('entity_embeddings')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to get embedding: ${error.message}`);
      }
      return data || null;
    },

    // ── Organizational Memory ──────────────────────────────────────

    async upsertMemory(memory: MemoryUpsertParams): Promise<void> {
      const row = {
        organization_id: organizationId,
        memory_type: memory.memoryType,
        domain: memory.domain || 'general',
        content: memory.content,
        importance: memory.importance ?? 0.5,
        metadata: memory.metadata || {},
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('ai_memory').insert(row);
      if (error) throw new Error(`Failed to upsert memory: ${error.message}`);
    },

    async getMemories(domain?: string, limit: number = 20): Promise<any[]> {
      let query = supabase
        .from('ai_memory')
        .select('*')
        .eq('organization_id', organizationId)
        .order('importance', { ascending: false })
        .limit(limit);

      if (domain) {
        query = query.eq('domain', domain);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Failed to get memories: ${error.message}`);
      return data || [];
    },

    // ── Causal Relationships ───────────────────────────────────────

    async upsertRelationship(rel: RelationshipUpsertParams): Promise<void> {
      const row = {
        organization_id: organizationId,
        source_domain: rel.sourceDomain,
        target_domain: rel.targetDomain,
        effect_size: rel.effectSize,
        granger_p_value: rel.pValue,
        optimal_lag_days: rel.lagDays,
        confidence_interval_lower: rel.effectSize - (rel.confidence * 0.1),
        confidence_interval_upper: rel.effectSize + (rel.confidence * 0.1),
        natural_language: rel.naturalLanguage || '',
        sample_size: rel.sampleSize || 0,
        is_significant: rel.isSignificant ?? (rel.pValue < 0.05),
        last_computed_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('causal_relationships_statistical')
        .upsert(row, {
          onConflict: 'organization_id,source_domain,target_domain',
        });

      if (error) throw new Error(`Failed to upsert relationship: ${error.message}`);
    },

    async getSignificantRelationships(minConfidence: number = 0.5): Promise<any[]> {
      const { data, error } = await supabase
        .from('causal_relationships_statistical')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_significant', true)
        .gte('effect_size', minConfidence * 0.1)
        .order('effect_size', { ascending: false });

      if (error) throw new Error(`Failed to get relationships: ${error.message}`);
      return data || [];
    },

    // ── Cache Persistence ──────────────────────────────────────────

    async persistCacheState(cacheKey: string, state: unknown): Promise<void> {
      const { error } = await supabase
        .from('embedding_cache_state')
        .upsert(
          {
            organization_id: organizationId,
            cache_key: cacheKey,
            cache_value: state,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,cache_key' }
        );

      if (error) throw new Error(`Failed to persist cache: ${error.message}`);
    },

    async loadCacheState(cacheKey: string): Promise<unknown | null> {
      const { data, error } = await supabase
        .from('embedding_cache_state')
        .select('cache_value')
        .eq('organization_id', organizationId)
        .eq('cache_key', cacheKey)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to load cache: ${error.message}`);
      }
      return data?.cache_value || null;
    },

    // ── Temporal Memory ────────────────────────────────────────────

    async persistTemporalMemories(memories): Promise<void> {
      if (memories.length === 0) return;

      const rows = memories.map((m) => ({
        organization_id: organizationId,
        memory_id: m.memoryId,
        memory_type: m.memoryType,
        content: m.content,
        base_relevance: m.baseRelevance,
        current_relevance: m.currentRelevance,
        reinforcement_score: m.reinforcementScore,
        access_count: m.accessCount,
        last_accessed_at: m.lastAccessedAt?.toISOString() || null,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('temporal_memory_state')
        .upsert(rows, { onConflict: 'organization_id,memory_id' });

      if (error) throw new Error(`Failed to persist temporal memories: ${error.message}`);
    },

    async loadTemporalMemories(): Promise<any[]> {
      const { data, error } = await supabase
        .from('temporal_memory_state')
        .select('*')
        .eq('organization_id', organizationId)
        .order('current_relevance', { ascending: false });

      if (error) throw new Error(`Failed to load temporal memories: ${error.message}`);
      return data || [];
    },

    // ── Conversation History ───────────────────────────────────────

    async appendConversation(entry: ConversationEntry): Promise<void> {
      const { error } = await supabase.from('conversation_log').insert({
        organization_id: organizationId,
        conversation_id: entry.conversationId,
        role: entry.role,
        content: entry.content,
        tokens_used: entry.tokensUsed || 0,
        context_snapshot: entry.contextSnapshot || {},
        metadata: entry.metadata || {},
        created_at: new Date().toISOString(),
      });

      if (error) throw new Error(`Failed to append conversation: ${error.message}`);
    },

    async getConversation(conversationId: string, limit: number = 50): Promise<any[]> {
      const { data, error } = await supabase
        .from('conversation_log')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) throw new Error(`Failed to get conversation: ${error.message}`);
      return data || [];
    },

    // ── Activity Logging ───────────────────────────────────────────

    async logActivity(entry: ActivityLogEntry): Promise<void> {
      const { error } = await supabase.from('ai_agent_activity').insert({
        organization_id: organizationId,
        agent_type: entry.agentType,
        action_type: entry.actionType,
        input_summary: entry.inputSummary || '',
        output_summary: entry.outputSummary || '',
        tokens_used: entry.tokensUsed || 0,
        metadata: entry.metadata || {},
        created_at: new Date().toISOString(),
      });

      if (error) throw new Error(`Failed to log activity: ${error.message}`);
    },

    // ── Federated Queries (org + core brain) ───────────────────────

    async getFederatedRelationships(minConfidence: number = 0.5): Promise<any[]> {
      const isCoreBrain = organizationId === CORE_BRAIN_ORG_ID;

      // Fetch org relationships
      const { data: orgData, error: orgError } = await supabase
        .from('causal_relationships_statistical')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_significant', true)
        .gte('effect_size', minConfidence * 0.1)
        .order('effect_size', { ascending: false })
        .limit(15);

      if (orgError) throw new Error(`Failed to get relationships: ${orgError.message}`);
      const orgRows = (orgData || []).map((r: any) => ({ ...r, _source: 'org' }));

      if (isCoreBrain) return orgRows;

      // Fetch core brain relationships
      const { data: coreData } = await supabase
        .from('causal_relationships_statistical')
        .select('*')
        .eq('organization_id', CORE_BRAIN_ORG_ID)
        .eq('is_significant', true)
        .order('effect_size', { ascending: false })
        .limit(15);

      if (!coreData || coreData.length === 0) return orgRows;

      // Dedup: org takes priority
      const orgKeys = new Set(orgRows.map((r: any) => `${r.source_domain}::${r.target_domain}`));
      const uniqueCore = coreData
        .filter((r: any) => !orgKeys.has(`${r.source_domain}::${r.target_domain}`))
        .map((r: any) => ({ ...r, _source: 'core' }));

      return [...orgRows, ...uniqueCore];
    },

    async getFederatedMemories(domain?: string, limit: number = 20): Promise<any[]> {
      const isCoreBrain = organizationId === CORE_BRAIN_ORG_ID;

      // Fetch org memories
      let orgQuery = supabase
        .from('ai_memory')
        .select('*')
        .eq('organization_id', organizationId)
        .order('importance', { ascending: false })
        .limit(limit);
      if (domain) orgQuery = orgQuery.eq('domain', domain);

      const { data: orgData, error: orgError } = await orgQuery;
      if (orgError) throw new Error(`Failed to get memories: ${orgError.message}`);
      const orgRows = (orgData || []).map((m: any) => ({ ...m, _source: 'org' }));

      if (isCoreBrain) return orgRows;

      // Fetch core brain memories
      let coreQuery = supabase
        .from('ai_memory')
        .select('*')
        .eq('organization_id', CORE_BRAIN_ORG_ID)
        .order('importance', { ascending: false })
        .limit(limit);
      if (domain) coreQuery = coreQuery.eq('domain', domain);

      const { data: coreData } = await coreQuery;
      if (!coreData || coreData.length === 0) return orgRows;

      // Dedup by domain + content prefix
      const orgKeys = new Set(orgRows.map((m: any) => `${m.domain}::${(m.content || '').substring(0, 80)}`));
      const uniqueCore = coreData
        .filter((m: any) => !orgKeys.has(`${m.domain}::${(m.content || '').substring(0, 80)}`))
        .map((m: any) => ({ ...m, _source: 'core' }));

      return [...orgRows, ...uniqueCore];
    },

    async getFederatedRules(limit: number = 20): Promise<any[]> {
      const isCoreBrain = organizationId === CORE_BRAIN_ORG_ID;

      // Fetch org rules
      const { data: orgData, error: orgError } = await supabase
        .from('brain_grammar_rules')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('confidence', { ascending: false })
        .limit(limit);

      if (orgError) throw new Error(`Failed to get rules: ${orgError.message}`);
      const orgRows = (orgData || []).map((r: any) => ({ ...r, _source: 'org' }));

      if (isCoreBrain) return orgRows;

      // Fetch core brain rules
      const { data: coreData } = await supabase
        .from('brain_grammar_rules')
        .select('*')
        .eq('organization_id', CORE_BRAIN_ORG_ID)
        .eq('is_active', true)
        .order('confidence', { ascending: false })
        .limit(limit);

      if (!coreData || coreData.length === 0) return orgRows;

      // Dedup by domain + rule_type + natural_language prefix
      const orgKeys = new Set(orgRows.map(
        (r: any) => `${r.domain}::${r.rule_type}::${(r.natural_language || '').substring(0, 50)}`
      ));
      const uniqueCore = coreData
        .filter((r: any) => !orgKeys.has(`${r.domain}::${r.rule_type}::${(r.natural_language || '').substring(0, 50)}`))
        .map((r: any) => ({ ...r, _source: 'core' }));

      return [...orgRows, ...uniqueCore];
    },

    // ── Organization Info ──────────────────────────────────────────

    getOrganizationId(): string {
      return organizationId;
    },
  };
}
