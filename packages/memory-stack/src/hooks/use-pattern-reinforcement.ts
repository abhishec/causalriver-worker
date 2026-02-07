/**
 * Nexus Memory Stack - Pattern Reinforcement Hook
 *
 * React hook for reinforcing learned patterns based on outcome feedback.
 * Automatically adjusts confidence scores when outcomes are recorded.
 *
 * CRITICAL: All operations are organization-scoped for multi-tenant isolation.
 */

import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface UsePatternReinforcementOptions {
  supabase: SupabaseClient;
  organizationId: string | null;
  /** Base confidence adjustment per feedback (default: 0.05) */
  adjustmentRate?: number;
  /** Minimum confidence threshold (default: 0.1) */
  minConfidence?: number;
  /** Maximum confidence threshold (default: 0.95) */
  maxConfidence?: number;
}

export interface OutcomeFeedback {
  /** The ID of the pattern/rule being reinforced */
  patternId: string;
  /** Type of pattern: 'brain_rule' | 'causal_chain' | 'memory_item' */
  patternType: 'brain_rule' | 'causal_chain' | 'memory_item';
  /** Whether the prediction/pattern was correct */
  wasCorrect: boolean;
  /** Optional strength of the feedback (0-1, default: 1) */
  feedbackStrength?: number;
  /** Optional context about the outcome */
  outcomeContext?: Record<string, unknown>;
  /** The entity this outcome relates to */
  entityId?: string;
  entityType?: string;
}

export interface ReinforcementResult {
  patternId: string;
  patternType: string;
  previousConfidence: number;
  newConfidence: number;
  adjustment: number;
  totalFeedbackCount: number;
}

export interface PatternReinforcementResult {
  /** Record positive outcome (increases confidence) */
  recordPositive: (patternId: string, patternType: OutcomeFeedback['patternType'], context?: Record<string, unknown>) => Promise<ReinforcementResult>;
  /** Record negative outcome (decreases confidence) */
  recordNegative: (patternId: string, patternType: OutcomeFeedback['patternType'], context?: Record<string, unknown>) => Promise<ReinforcementResult>;
  /** Record outcome with full control */
  recordOutcome: (feedback: OutcomeFeedback) => Promise<ReinforcementResult>;
  /** Batch record multiple outcomes */
  recordBatch: (feedbacks: OutcomeFeedback[]) => Promise<ReinforcementResult[]>;
  /** Get current confidence for a pattern */
  getConfidence: (patternId: string, patternType: OutcomeFeedback['patternType']) => Promise<number | null>;
  /** Reset confidence to default */
  resetConfidence: (patternId: string, patternType: OutcomeFeedback['patternType']) => Promise<void>;
  /** Loading state */
  isProcessing: boolean;
  /** Last error */
  error: Error | null;
  /** Last reinforcement result */
  lastResult: ReinforcementResult | null;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for reinforcing patterns based on outcome feedback
 *
 * @example
 * ```typescript
 * const { recordPositive, recordNegative, isProcessing } = usePatternReinforcement({
 *   supabase,
 *   organizationId,
 *   adjustmentRate: 0.05,
 * });
 *
 * // User confirms a prediction was correct
 * const result = await recordPositive('rule_123', 'brain_rule');
 * console.log(`Confidence: ${result.previousConfidence} → ${result.newConfidence}`);
 *
 * // User indicates a prediction was wrong
 * await recordNegative('chain_456', 'causal_chain', { reason: 'market_change' });
 * ```
 */
export function usePatternReinforcement(options: UsePatternReinforcementOptions): PatternReinforcementResult {
  const {
    supabase,
    organizationId,
    adjustmentRate = 0.05,
    minConfidence = 0.1,
    maxConfidence = 0.95,
  } = options;

  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<ReinforcementResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Get table name based on pattern type
  const getTableName = (patternType: OutcomeFeedback['patternType']): string => {
    switch (patternType) {
      case 'brain_rule':
        return 'brain_grammar_rules';
      case 'causal_chain':
        return 'ai_causal_chains';
      case 'memory_item':
        return 'ai_memory';
      default:
        throw new Error(`Unknown pattern type: ${patternType}`);
    }
  };

  // Get confidence column name
  const getConfidenceColumn = (patternType: OutcomeFeedback['patternType']): string => {
    switch (patternType) {
      case 'brain_rule':
        return 'confidence_score';
      case 'causal_chain':
        return 'confidence';
      case 'memory_item':
        return 'confidence';
      default:
        return 'confidence';
    }
  };

  // Calculate new confidence with bounds
  const calculateNewConfidence = (
    current: number,
    wasCorrect: boolean,
    strength: number = 1
  ): number => {
    const adjustment = adjustmentRate * strength * (wasCorrect ? 1 : -1);
    const newValue = current + adjustment;
    return Math.max(minConfidence, Math.min(maxConfidence, newValue));
  };

  // Core reinforcement mutation
  const reinforceMutation = useMutation({
    mutationFn: async (feedback: OutcomeFeedback): Promise<ReinforcementResult> => {
      if (!organizationId) {
        throw new Error('Organization ID required for pattern reinforcement');
      }

      const tableName = getTableName(feedback.patternType);
      const confidenceColumn = getConfidenceColumn(feedback.patternType);

      // Get current confidence - use * selection to avoid template literal type issues
      const { data: currentData, error: fetchError } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', feedback.patternId)
        .eq('organization_id', organizationId)
        .single();

      if (fetchError) {
        throw new Error(`Pattern not found: ${feedback.patternId}`);
      }

      // Cast to record type and extract fields
      const dataRecord = currentData as unknown as Record<string, unknown>;
      const previousConfidence = (dataRecord[confidenceColumn] as number) || 0.5;
      const currentFeedbackCount = (dataRecord.feedback_count as number) || 0;
      const feedbackStrength = feedback.feedbackStrength ?? 1;
      const newConfidence = calculateNewConfidence(previousConfidence, feedback.wasCorrect, feedbackStrength);

      // Update confidence and increment feedback count
      const updatePayload: Record<string, unknown> = {
        [confidenceColumn]: newConfidence,
        updated_at: new Date().toISOString(),
      };

      // Only include feedback_count if it exists
      if ('feedback_count' in dataRecord) {
        updatePayload.feedback_count = currentFeedbackCount + 1;
      }

      const { error: updateError } = await supabase
        .from(tableName)
        .update(updatePayload)
        .eq('id', feedback.patternId)
        .eq('organization_id', organizationId);

      if (updateError) throw updateError;

      // Record the feedback in outcome tracking
      await recordFeedbackLog(feedback, previousConfidence, newConfidence);

      return {
        patternId: feedback.patternId,
        patternType: feedback.patternType,
        previousConfidence,
        newConfidence,
        adjustment: newConfidence - previousConfidence,
        totalFeedbackCount: currentFeedbackCount + 1,
      };
    },
    onSuccess: (result) => {
      setLastResult(result);
      setError(null);
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['brain-rules', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['causal-chains', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['ai-memory', organizationId] });
    },
    onError: (err) => {
      setError(err as Error);
    },
  });

  // Record feedback to log table (for analytics)
  const recordFeedbackLog = async (
    feedback: OutcomeFeedback,
    previousConfidence: number,
    newConfidence: number
  ): Promise<void> => {
    try {
      await supabase.from('pattern_feedback_log').insert({
        organization_id: organizationId,
        pattern_id: feedback.patternId,
        pattern_type: feedback.patternType,
        was_correct: feedback.wasCorrect,
        feedback_strength: feedback.feedbackStrength ?? 1,
        previous_confidence: previousConfidence,
        new_confidence: newConfidence,
        outcome_context: feedback.outcomeContext || {},
        entity_id: feedback.entityId,
        entity_type: feedback.entityType,
        created_at: new Date().toISOString(),
      });
    } catch {
      // Log table may not exist - that's OK, it's optional
      console.debug('[usePatternReinforcement] Feedback log table not available');
    }
  };

  // Get confidence for a pattern
  const getConfidence = useCallback(async (
    patternId: string,
    patternType: OutcomeFeedback['patternType']
  ): Promise<number | null> => {
    if (!organizationId) return null;

    const tableName = getTableName(patternType);
    const confidenceColumn = getConfidenceColumn(patternType);

    const { data, error: fetchError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', patternId)
      .eq('organization_id', organizationId)
      .single();

    if (fetchError || !data) return null;
    const dataRecord = data as unknown as Record<string, unknown>;
    return dataRecord[confidenceColumn] as number;
  }, [supabase, organizationId]);

  // Reset confidence to default (0.5)
  const resetConfidence = useCallback(async (
    patternId: string,
    patternType: OutcomeFeedback['patternType']
  ): Promise<void> => {
    if (!organizationId) return;

    const tableName = getTableName(patternType);
    const confidenceColumn = getConfidenceColumn(patternType);

    await supabase
      .from(tableName)
      .update({
        [confidenceColumn]: 0.5,
        updated_at: new Date().toISOString(),
      })
      .eq('id', patternId)
      .eq('organization_id', organizationId);

    // Invalidate related queries
    queryClient.invalidateQueries({ queryKey: ['brain-rules', organizationId] });
    queryClient.invalidateQueries({ queryKey: ['causal-chains', organizationId] });
    queryClient.invalidateQueries({ queryKey: ['ai-memory', organizationId] });
  }, [supabase, organizationId, queryClient]);

  // Record positive outcome
  const recordPositive = useCallback(async (
    patternId: string,
    patternType: OutcomeFeedback['patternType'],
    context?: Record<string, unknown>
  ): Promise<ReinforcementResult> => {
    return reinforceMutation.mutateAsync({
      patternId,
      patternType,
      wasCorrect: true,
      outcomeContext: context,
    });
  }, [reinforceMutation]);

  // Record negative outcome
  const recordNegative = useCallback(async (
    patternId: string,
    patternType: OutcomeFeedback['patternType'],
    context?: Record<string, unknown>
  ): Promise<ReinforcementResult> => {
    return reinforceMutation.mutateAsync({
      patternId,
      patternType,
      wasCorrect: false,
      outcomeContext: context,
    });
  }, [reinforceMutation]);

  // Record with full control
  const recordOutcome = useCallback(async (feedback: OutcomeFeedback): Promise<ReinforcementResult> => {
    return reinforceMutation.mutateAsync(feedback);
  }, [reinforceMutation]);

  // Batch record
  const recordBatch = useCallback(async (feedbacks: OutcomeFeedback[]): Promise<ReinforcementResult[]> => {
    const results: ReinforcementResult[] = [];
    for (const feedback of feedbacks) {
      const result = await reinforceMutation.mutateAsync(feedback);
      results.push(result);
    }
    return results;
  }, [reinforceMutation]);

  return {
    recordPositive,
    recordNegative,
    recordOutcome,
    recordBatch,
    getConfidence,
    resetConfidence,
    isProcessing: reinforceMutation.isPending,
    error,
    lastResult,
  };
}

/**
 * Simplified hook for brain rule reinforcement only
 */
export function useBrainRuleReinforcement(
  supabase: SupabaseClient,
  organizationId: string | null
) {
  const reinforcement = usePatternReinforcement({
    supabase,
    organizationId,
  });

  return {
    confirmRule: (ruleId: string, context?: Record<string, unknown>) =>
      reinforcement.recordPositive(ruleId, 'brain_rule', context),
    rejectRule: (ruleId: string, context?: Record<string, unknown>) =>
      reinforcement.recordNegative(ruleId, 'brain_rule', context),
    getConfidence: (ruleId: string) =>
      reinforcement.getConfidence(ruleId, 'brain_rule'),
    isProcessing: reinforcement.isProcessing,
    error: reinforcement.error,
  };
}
