/**
 * Nexus Memory Stack - AI Memory Hook
 *
 * React hook for accessing AI learned patterns, insights, and predictions.
 * Provides access to persistent AI memory stored in the ai_memory table.
 *
 * CRITICAL: All queries must be organization-scoped for multi-tenant isolation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AIMemoryItem, MemoryStats, MemoryType } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface UseAIMemoryOptions {
  supabase: SupabaseClient;
  organizationId: string | null;
  entityType?: string;
  memoryType?: MemoryType;
  limit?: number;
}

export interface AIMemoryHookResult {
  // All memories
  memories: AIMemoryItem[];
  isLoading: boolean;
  error: Error | null;

  // Filtered by type
  patterns: AIMemoryItem[];
  insights: AIMemoryItem[];
  predictions: AIMemoryItem[];

  // Special filters
  highConfidence: AIMemoryItem[];

  // Stats
  stats: MemoryStats | undefined;
  statsLoading: boolean;

  // Actions
  recordAccess: (memoryId: string) => void;

  // Refresh
  refresh: () => void;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for accessing AI memory (learned patterns, insights, predictions)
 * ORGANIZATION SCOPED
 *
 * @example
 * ```typescript
 * const {
 *   memories,
 *   patterns,
 *   insights,
 *   stats,
 *   recordAccess,
 * } = useAIMemory({
 *   supabase,
 *   organizationId,
 *   memoryType: 'pattern',
 *   limit: 50,
 * });
 * ```
 */
export function useAIMemory(options: UseAIMemoryOptions): AIMemoryHookResult {
  const {
    supabase,
    organizationId,
    entityType,
    memoryType,
    limit = 50,
  } = options;

  const queryClient = useQueryClient();

  // Main memory query
  const memoryQuery = useQuery({
    queryKey: ['ai-memory', organizationId, entityType, memoryType, limit],
    queryFn: async (): Promise<AIMemoryItem[]> => {
      if (!organizationId) return [];

      let query = supabase
        .from('ai_memory')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (entityType) {
        query = query.eq('entity_type', entityType);
      }
      if (memoryType) {
        query = query.eq('memory_type', memoryType);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[useAIMemory] Access error:', error.message);
        return [];
      }

      return (data || []).map((item: any) => ({
        id: item.id,
        organization_id: item.organization_id,
        memory_type: item.memory_type,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        title: item.title,
        content: item.content || {},
        confidence: item.confidence || 0.8,
        severity: item.severity,
        domain: item.domain,
        access_count: item.access_count || 0,
        last_accessed: item.last_accessed,
        wiring_status: item.wiring_status,
        expires_at: item.expires_at,
        is_active: item.is_active,
        created_at: item.created_at,
      }));
    },
    staleTime: 60000, // 1 minute
    enabled: !!organizationId,
  });

  // Stats query
  const statsQuery = useQuery({
    queryKey: ['ai-memory-stats', organizationId],
    queryFn: async (): Promise<MemoryStats> => {
      if (!organizationId) {
        return {
          totalPatterns: 0,
          totalInsights: 0,
          totalPredictions: 0,
          avgConfidence: 0,
          recentLearnings: 0,
        };
      }

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('ai_memory')
        .select('memory_type, confidence, created_at')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (error) {
        console.warn('[useAIMemory] Stats error:', error.message);
        return {
          totalPatterns: 0,
          totalInsights: 0,
          totalPredictions: 0,
          avgConfidence: 0,
          recentLearnings: 0,
        };
      }

      const items = data || [];
      const patterns = items.filter((i: any) => i.memory_type === 'pattern');
      const insights = items.filter((i: any) => i.memory_type === 'insight');
      const predictions = items.filter((i: any) => i.memory_type === 'prediction');
      const recent = items.filter(
        (i: any) => new Date(i.created_at) >= sevenDaysAgo
      );

      const totalConfidence = items.reduce(
        (sum: number, i: any) => sum + (i.confidence || 0.8),
        0
      );

      return {
        totalPatterns: patterns.length,
        totalInsights: insights.length,
        totalPredictions: predictions.length,
        avgConfidence: items.length > 0 ? totalConfidence / items.length : 0,
        recentLearnings: recent.length,
      };
    },
    staleTime: 60000,
    enabled: !!organizationId,
  });

  // Record memory access mutation
  const recordAccess = useMutation({
    mutationFn: async (memoryId: string) => {
      const { data: current } = await supabase
        .from('ai_memory')
        .select('access_count')
        .eq('id', memoryId)
        .single();

      const newCount = (current?.access_count || 0) + 1;

      const { error } = await supabase
        .from('ai_memory')
        .update({
          access_count: newCount,
          last_accessed: new Date().toISOString(),
        })
        .eq('id', memoryId);

      if (error) throw error;
    },
    onError: (error) => {
      console.error('Failed to record memory access:', error);
    },
  });

  // Computed values
  const memories = memoryQuery.data || [];
  const patterns = memories.filter((m) => m.memory_type === 'pattern');
  const insights = memories.filter((m) => m.memory_type === 'insight');
  const predictions = memories.filter((m) => m.memory_type === 'prediction');
  const highConfidence = memories.filter((m) => m.confidence >= 0.85);

  return {
    memories,
    isLoading: memoryQuery.isLoading,
    error: memoryQuery.error,

    patterns,
    insights,
    predictions,
    highConfidence,

    stats: statsQuery.data,
    statsLoading: statsQuery.isLoading,

    recordAccess: recordAccess.mutate,

    refresh: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-memory', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['ai-memory-stats', organizationId] });
    },
  };
}

/**
 * Hook specifically for AI patterns
 */
export function useAIPatterns(options: Omit<UseAIMemoryOptions, 'memoryType'>) {
  return useAIMemory({ ...options, memoryType: 'pattern' });
}

/**
 * Hook specifically for AI predictions
 */
export function useAIPredictions(options: Omit<UseAIMemoryOptions, 'memoryType'>) {
  return useAIMemory({ ...options, memoryType: 'prediction' });
}

/**
 * Hook specifically for AI insights
 */
export function useAIInsights(options: Omit<UseAIMemoryOptions, 'memoryType'>) {
  return useAIMemory({ ...options, memoryType: 'insight' });
}
