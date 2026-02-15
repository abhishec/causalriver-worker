/**
 * Nexus Memory Stack - Brain Rule Evaluator
 *
 * Core evaluation logic for Brain Grammar Rules.
 * This is the runtime engine that evaluates rules against a given context.
 *
 * Features:
 * - 16 comparison operators
 * - Nested AND/OR/NOT condition groups
 * - 10 action types
 * - Execution logging for observability
 */

import type {
  ComparisonOperator,
  LogicalOperator,
  RuleCondition,
  ConditionGroup,
  RuleAction,
  BrainGrammarRule,
  EvaluationContext,
  EvaluationResult,
  AggregatedEvaluationResult,
} from '../types';

// ============================================================================
// CORE EVALUATION FUNCTIONS
// ============================================================================

/**
 * Get a nested value from an object using dot notation
 *
 * @example
 * getNestedValue({ client: { status: 'Live' } }, 'client.status') // => 'Live'
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Evaluate a single condition against context
 */
export function evaluateCondition(
  condition: RuleCondition,
  context: EvaluationContext
): boolean {
  const contextValue = getNestedValue(context as Record<string, unknown>, condition.field);
  const ruleValue = condition.value;

  switch (condition.operator) {
    case 'equals':
      return contextValue === ruleValue;

    case 'not_equals':
      return contextValue !== ruleValue;

    case 'greater_than':
      return (
        typeof contextValue === 'number' &&
        typeof ruleValue === 'number' &&
        contextValue > ruleValue
      );

    case 'less_than':
      return (
        typeof contextValue === 'number' &&
        typeof ruleValue === 'number' &&
        contextValue < ruleValue
      );

    case 'greater_than_or_equals':
      return (
        typeof contextValue === 'number' &&
        typeof ruleValue === 'number' &&
        contextValue >= ruleValue
      );

    case 'less_than_or_equals':
      return (
        typeof contextValue === 'number' &&
        typeof ruleValue === 'number' &&
        contextValue <= ruleValue
      );

    case 'in':
      return Array.isArray(ruleValue) && ruleValue.includes(contextValue as never);

    case 'not_in':
      return Array.isArray(ruleValue) && !ruleValue.includes(contextValue as never);

    case 'contains':
      return (
        typeof contextValue === 'string' &&
        typeof ruleValue === 'string' &&
        contextValue.toLowerCase().includes(ruleValue.toLowerCase())
      );

    case 'not_contains':
      return (
        typeof contextValue === 'string' &&
        typeof ruleValue === 'string' &&
        !contextValue.toLowerCase().includes(ruleValue.toLowerCase())
      );

    case 'is_null':
      return contextValue === null || contextValue === undefined;

    case 'is_not_null':
      return contextValue !== null && contextValue !== undefined;

    case 'starts_with':
      return (
        typeof contextValue === 'string' &&
        typeof ruleValue === 'string' &&
        contextValue.toLowerCase().startsWith(ruleValue.toLowerCase())
      );

    case 'ends_with':
      return (
        typeof contextValue === 'string' &&
        typeof ruleValue === 'string' &&
        contextValue.toLowerCase().endsWith(ruleValue.toLowerCase())
      );

    default:
      console.warn(`Unknown operator: ${condition.operator}`);
      return false;
  }
}

/**
 * Check if an object is a ConditionGroup
 */
function isConditionGroup(
  condition: RuleCondition | ConditionGroup
): condition is ConditionGroup {
  return 'logic' in condition && 'conditions' in condition;
}

/**
 * Evaluate a condition group (with nested conditions) against context
 */
export function evaluateConditionGroup(
  group: ConditionGroup,
  context: EvaluationContext
): boolean {
  if (!group.conditions || group.conditions.length === 0) {
    return true; // Empty conditions = always match
  }

  const results = group.conditions.map((condition) => {
    if (isConditionGroup(condition)) {
      return evaluateConditionGroup(condition, context);
    } else {
      return evaluateCondition(condition as RuleCondition, context);
    }
  });

  switch (group.logic) {
    case 'AND':
      return results.every((r) => r);
    case 'OR':
      return results.some((r) => r);
    case 'NOT':
      return !results.every((r) => r);
    default:
      return false;
  }
}

/**
 * Apply actions and return structured result
 */
export function applyActions(
  actions: RuleAction[]
): Omit<EvaluationResult, 'matched' | 'rule_id' | 'rule_title' | 'actions_applied'> {
  const result: Omit<
    EvaluationResult,
    'matched' | 'rule_id' | 'rule_title' | 'actions_applied'
  > = {
    eligibility: {},
    flags: {},
    approvals_required: [],
    exclusions: [],
    inclusions: [],
    alerts: [],
    thresholds: {},
  };

  for (const action of actions) {
    switch (action.type) {
      case 'set_eligibility':
        if (typeof action.params.field === 'string') {
          result.eligibility[action.params.field] = Boolean(action.params.value);
        }
        break;

      case 'set_flag':
        if (typeof action.params.flag === 'string') {
          result.flags[action.params.flag] = Boolean(action.params.value);
        }
        break;

      case 'require_approval':
        result.approvals_required.push({
          level: String(action.params.level || 'unknown'),
          reason: String(action.params.reason || ''),
        });
        break;

      case 'trigger_alert':
        result.alerts.push({
          severity: String(action.params.severity || 'info'),
          message: String(action.params.message || ''),
        });
        break;

      case 'exclude_from':
        if (typeof action.params.pipeline === 'string') {
          result.exclusions.push(action.params.pipeline);
        }
        break;

      case 'include_in':
        if (typeof action.params.pipeline === 'string') {
          result.inclusions.push(action.params.pipeline);
        }
        break;

      case 'set_threshold':
        if (
          typeof action.params.name === 'string' &&
          typeof action.params.value === 'number'
        ) {
          result.thresholds[action.params.name] = action.params.value;
        }
        break;

      case 'escalate':
        result.approvals_required.push({
          level: String(action.params.to || 'unknown'),
          reason: `Escalation: threshold ${action.params.threshold_days || 'N/A'} days`,
        });
        break;

      case 'set_priority':
      case 'set_status':
        if (
          typeof action.params.priority === 'string' ||
          typeof action.params.status === 'string'
        ) {
          const key = action.type === 'set_priority' ? 'priority' : 'status';
          result.flags[key] = action.params[key.replace('set_', '')] as boolean;
        }
        break;
    }
  }

  return result;
}

/**
 * Aggregate results from multiple rule evaluations
 */
export function aggregateResults(results: EvaluationResult[]): AggregatedEvaluationResult {
  const aggregated: AggregatedEvaluationResult = {
    matched_rules: results.filter((r) => r.matched),
    eligibility: {},
    flags: {},
    approvals_required: [],
    exclusions: [],
    inclusions: [],
    alerts: [],
    thresholds: {},
    rules_evaluated: results.length,
    evaluated_at: new Date().toISOString(),
  };

  // Merge all results
  for (const result of results) {
    if (!result.matched) continue;

    // Merge eligibility (false overrides true)
    for (const [key, value] of Object.entries(result.eligibility)) {
      if (aggregated.eligibility[key] === undefined) {
        aggregated.eligibility[key] = value;
      } else if (value === false) {
        aggregated.eligibility[key] = false;
      }
    }

    // Merge flags (true overrides undefined)
    for (const [key, value] of Object.entries(result.flags)) {
      if (aggregated.flags[key] === undefined || value === true) {
        aggregated.flags[key] = value;
      }
    }

    // Concatenate arrays
    aggregated.approvals_required.push(...result.approvals_required);
    aggregated.exclusions.push(...result.exclusions);
    aggregated.inclusions.push(...result.inclusions);
    aggregated.alerts.push(...result.alerts);

    // Merge thresholds (latest wins)
    Object.assign(aggregated.thresholds, result.thresholds);
  }

  // Deduplicate arrays
  aggregated.exclusions = [...new Set(aggregated.exclusions)];
  aggregated.inclusions = [...new Set(aggregated.inclusions)];

  return aggregated;
}

/**
 * Evaluate a single rule against context
 */
export function evaluateRule(
  rule: BrainGrammarRule,
  context: EvaluationContext
): EvaluationResult {
  const matched = evaluateConditionGroup(rule.when, context);
  const actionsToApply = matched ? rule.then : rule.otherwise || [];
  const actionResults = applyActions(actionsToApply);

  return {
    matched,
    rule_id: rule.id,
    rule_title: rule.title,
    actions_applied: actionsToApply,
    ...actionResults,
  };
}

// ============================================================================
// BRAIN EVALUATOR FACTORY
// ============================================================================

/**
 * Configuration for the brain evaluator
 */
export interface BrainEvaluatorConfig {
  /** Whether to track rule usage (updates access_count) */
  trackUsage?: boolean;
  /** Whether to log executions to brain_execution_log */
  logExecutions?: boolean;
  /** Caller type for logging */
  callerType?: string;
  /** Caller location for logging */
  callerLocation?: string;
}

/**
 * Create a brain evaluator instance
 *
 * @example
 * ```typescript
 * const evaluator = createBrainEvaluator({
 *   trackUsage: true,
 *   logExecutions: true,
 *   callerType: 'ui_hook',
 *   callerLocation: 'RenewalPipelinePage',
 * });
 *
 * const result = await evaluator.evaluateRules(supabase, context);
 * ```
 */
export function createBrainEvaluator(config: BrainEvaluatorConfig = {}) {
  const {
    trackUsage = true,
    logExecutions = true,
    callerType = 'unknown',
    callerLocation = 'unknown',
  } = config;

  /**
   * Log execution to brain_execution_log for observability
   */
  async function logExecution(
    supabase: any,
    params: {
      ruleIds: string[];
      matchedRuleIds: string[];
      context: EvaluationContext;
      result: AggregatedEvaluationResult;
      latencyMs: number;
    }
  ): Promise<void> {
    if (!logExecutions) return;

    try {
      await supabase.from('brain_execution_log').insert({
        rule_ids: params.ruleIds,
        matched_rule_ids: params.matchedRuleIds,
        caller_type: callerType,
        caller_location: callerLocation,
        context_snapshot: params.context,
        evaluation_result: params.result,
        latency_ms: params.latencyMs,
        rules_evaluated: params.ruleIds.length,
        rules_matched: params.matchedRuleIds.length,
      });
    } catch (err) {
      console.warn('[brain-evaluator] Failed to log execution:', err);
    }
  }

  return {
    /**
     * Evaluate a single condition
     */
    evaluateCondition,

    /**
     * Evaluate a condition group
     */
    evaluateConditionGroup,

    /**
     * Apply actions from a rule
     */
    applyActions,

    /**
     * Evaluate a single rule
     */
    evaluateRule,

    /**
     * Aggregate multiple rule results
     */
    aggregateResults,

    /**
     * Evaluate rules from database against context
     */
    evaluateRules: async (
      supabase: any,
      context: EvaluationContext,
      options?: {
        ruleTypes?: string[];
        ruleIds?: string[];
      }
    ): Promise<AggregatedEvaluationResult> => {
      const startTime = Date.now();
      const { ruleTypes, ruleIds } = options || {};

      // Fetch matching rules from ai_memory (capped for 10M scale)
      let query = supabase
        .from('ai_memory')
        .select('*')
        .eq('memory_type', 'business_rule')
        .eq('is_active', true);

      if (ruleTypes?.length) {
        query = query.in('entity_type', ruleTypes);
      }

      if (ruleIds?.length) {
        query = query.in('id', ruleIds);
      }

      // 10M scale: only evaluate top 500 rules by importance
      query = query.order('importance', { ascending: false }).limit(500);

      const { data: rules, error } = await query;

      if (error) {
        console.error('[brain-evaluator] Failed to fetch rules:', error);
        return {
          matched_rules: [],
          eligibility: {},
          flags: {},
          approvals_required: [],
          exclusions: [],
          inclusions: [],
          alerts: [],
          thresholds: {},
          rules_evaluated: 0,
          evaluated_at: new Date().toISOString(),
        };
      }

      // Evaluate each rule
      const results: EvaluationResult[] = [];
      const matchedRuleIds: string[] = [];
      const allRuleIds: string[] = [];

      for (const rule of rules || []) {
        allRuleIds.push(rule.id);

        try {
          const grammarRule = rule.content as unknown as BrainGrammarRule;

          if (!grammarRule?.when?.conditions) {
            continue;
          }

          const result = evaluateRule(
            { ...grammarRule, id: rule.id, title: rule.title },
            context
          );

          results.push(result);

          if (result.matched) {
            matchedRuleIds.push(rule.id);
          }
        } catch (err) {
          console.error(`[brain-evaluator] Error evaluating rule ${rule.id}:`, err);
        }
      }

      // Track usage for matched rules
      if (trackUsage && matchedRuleIds.length > 0) {
        try {
          const { error: trackError } = await supabase.rpc('track_rule_evaluation', {
            rule_ids: matchedRuleIds,
          });

          if (trackError) {
            // Fallback: update individually
            const now = new Date().toISOString();
            for (const ruleId of matchedRuleIds) {
              const currentRule = rules?.find((r: any) => r.id === ruleId);
              await supabase
                .from('ai_memory')
                .update({
                  access_count: (currentRule?.access_count || 0) + 1,
                  last_accessed: now,
                })
                .eq('id', ruleId);
            }
          }
        } catch (err) {
          console.warn('[brain-evaluator] Failed to track rule evaluation:', err);
        }
      }

      // Aggregate and return results
      const aggregated = aggregateResults(results);
      const latencyMs = Date.now() - startTime;

      // Log execution for observability
      await logExecution(supabase, {
        ruleIds: allRuleIds,
        matchedRuleIds,
        context,
        result: aggregated,
        latencyMs,
      });

      return aggregated;
    },

    /**
     * Quick eligibility check - returns simple boolean flags
     */
    checkEligibility: async (
      supabase: any,
      context: EvaluationContext,
      questions: string[]
    ): Promise<Record<string, boolean>> => {
      const result = await createBrainEvaluator({ ...config, trackUsage: false }).evaluateRules(
        supabase,
        context
      );

      const answers: Record<string, boolean> = {};

      for (const question of questions) {
        if (result.eligibility[question] !== undefined) {
          answers[question] = result.eligibility[question];
        } else if (result.flags[question] !== undefined) {
          answers[question] = result.flags[question];
        } else if (question.startsWith('can_') || question.startsWith('is_')) {
          const pipeline = question.replace('can_', '').replace('is_', '');
          answers[question] = !result.exclusions.includes(pipeline);
        } else {
          answers[question] = true;
        }
      }

      return answers;
    },
  };
}
