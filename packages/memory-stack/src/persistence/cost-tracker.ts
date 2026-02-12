/**
 * NexusBrain Cost Tracker — Centralized LLM & AWS Cost Monitoring
 * ================================================================
 *
 * Brain Analog: The brain's metabolic monitoring system — neurons track
 * their energy consumption (glucose/ATP) and throttle activity when
 * resources are scarce. This module does the same for LLM tokens and
 * AWS compute costs.
 *
 * Every LLM API call flows through this tracker, which:
 *   1. Logs the call to `llm_cost_log` in Supabase
 *   2. Calculates estimated USD cost based on model pricing
 *   3. Checks against daily/monthly budgets
 *   4. Provides real-time cost summaries
 *
 * Usage:
 * ```typescript
 * const tracker = createCostTracker(supabase);
 * await tracker.logLLMCall({
 *   component: 'brain-amplifier',
 *   functionName: 'amplifyInsight',
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-20250514',
 *   inputTokens: 800,
 *   outputTokens: 400,
 *   durationMs: 2500,
 *   contentTitle: 'Finance cascade insight',
 *   success: true,
 * });
 *
 * const status = await tracker.getTodayCostStatus();
 * console.log(`Today: $${status.totalCost} / $${status.dailyBudget}`);
 * ```
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// MODEL PRICING (USD per 1,000 tokens)
// ============================================================================

/** Pricing table — updated regularly. Prices in USD per 1K tokens. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-3-5-haiku-20241022':    { input: 0.001,  output: 0.005 },
  'claude-3-haiku-20240307':      { input: 0.00025, output: 0.00125 },
  'claude-sonnet-4-20250514':     { input: 0.003,  output: 0.015 },
  'claude-sonnet-4-5-20250929':   { input: 0.003,  output: 0.015 },
  'claude-opus-4-20250514':       { input: 0.015,  output: 0.075 },

  // OpenAI
  'gpt-4o':                       { input: 0.0025, output: 0.01 },
  'gpt-4o-mini':                  { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo':                  { input: 0.01,   output: 0.03 },
  'gpt-3.5-turbo':                { input: 0.0005, output: 0.0015 },
};

/** Default pricing for unknown models (conservative estimate) */
const DEFAULT_PRICING = { input: 0.003, output: 0.015 };

// ============================================================================
// TYPES
// ============================================================================

export interface LLMCallLogParams {
  /** Which component made the call */
  component: 'knowledge-distiller' | 'brain-amplifier' | 'response-layer' | 'copilot' | 'edge-function' | string;
  /** Specific function that was called */
  functionName: string;
  /** LLM provider */
  provider: 'anthropic' | 'openai';
  /** Model used */
  model: string;
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens consumed */
  outputTokens: number;
  /** Duration of the call in ms */
  durationMs?: number;
  /** What was being processed */
  contentTitle?: string;
  /** Did the call succeed? */
  success?: boolean;
  /** Extra metadata */
  metadata?: Record<string, unknown>;
  /** Organization ID (defaults to core brain) */
  organizationId?: string;
}

export interface CostStatus {
  totalCost: number;
  totalCalls: number;
  dailyBudget: number;
  budgetUsedPct: number;
  topComponent: string;
  topComponentCost: number;
  isOverBudget: boolean;
  shouldHardStop: boolean;
}

export interface CostSummary {
  period: string;
  component: string;
  model: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

export interface CostReport {
  /** Date range */
  startDate: string;
  endDate: string;
  /** Total LLM cost in USD */
  totalLLMCost: number;
  /** Total AWS cost in USD */
  totalAWSCost: number;
  /** Combined total */
  totalCost: number;
  /** Breakdown by component */
  byComponent: Record<string, { calls: number; tokens: number; cost: number }>;
  /** Breakdown by model */
  byModel: Record<string, { calls: number; tokens: number; cost: number }>;
  /** Daily trend */
  dailyTrend: Array<{ date: string; llmCost: number; awsCost: number; totalCost: number }>;
  /** Budget status */
  monthlyBudget: number;
  monthlySpent: number;
  monthlyRemaining: number;
  daysRemaining: number;
  projectedMonthlyTotal: number;
}

export interface CostTracker {
  /** Log a single LLM API call */
  logLLMCall(params: LLMCallLogParams): Promise<void>;
  /** Get today's cost status with budget info */
  getTodayCostStatus(): Promise<CostStatus>;
  /** Get a cost summary for a date range */
  getCostSummary(startDate: string, endDate: string): Promise<CostSummary[]>;
  /** Generate a full cost report */
  generateCostReport(days?: number): Promise<CostReport>;
  /** Check if we should stop making LLM calls (budget exceeded) */
  shouldThrottle(): Promise<boolean>;
  /** Calculate estimated cost for tokens */
  estimateCost(model: string, inputTokens: number, outputTokens: number): number;
  /** Log an AWS cost snapshot */
  logAWSCostSnapshot(costs: {
    periodStart: string;
    periodEnd: string;
    fargate: number;
    cloudwatch: number;
    ecr: number;
    dataTransfer: number;
    codebuild: number;
    other: number;
    rawResponse?: Record<string, unknown>;
  }): Promise<void>;
}

// ============================================================================
// FACTORY
// ============================================================================

const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

/**
 * Create a centralized cost tracker.
 *
 * @param supabase - Supabase client
 * @param verbose - Enable console logging
 */
export function createCostTracker(
  supabase: SupabaseClient,
  verbose: boolean = false
): CostTracker {

  function log(msg: string) {
    if (verbose) {
      console.log(`[CostTracker] ${msg}`);
    }
  }

  /**
   * Calculate estimated cost in USD for a given model and token count.
   */
  function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
    const cost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
    return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places
  }

  /**
   * Log a single LLM API call to the database.
   * Fire-and-forget — errors are logged but don't propagate.
   */
  async function logLLMCall(params: LLMCallLogParams): Promise<void> {
    const cost = estimateCost(params.model, params.inputTokens, params.outputTokens);

    const row = {
      organization_id: params.organizationId || CORE_BRAIN_ORG_ID,
      component: params.component,
      function_name: params.functionName,
      provider: params.provider,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      estimated_cost_usd: cost,
      content_title: params.contentTitle || null,
      success: params.success ?? true,
      duration_ms: params.durationMs || 0,
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
    };

    try {
      const { error } = await supabase.from('llm_cost_log').insert(row);
      if (error) {
        // Table might not exist yet — log silently
        log(`Warning: Failed to log LLM cost: ${error.message}`);
      } else {
        log(`Logged: ${params.component}.${params.functionName} | ${params.model} | ${params.inputTokens}in/${params.outputTokens}out | $${cost.toFixed(6)}`);
      }
    } catch (err: any) {
      // Never throw from cost logging — it's non-critical
      log(`Warning: Cost logging error: ${err.message}`);
    }
  }

  /**
   * Get today's cost status with budget info.
   */
  async function getTodayCostStatus(): Promise<CostStatus> {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get today's costs
      const { data: costData } = await supabase
        .from('llm_cost_log')
        .select('component, estimated_cost_usd')
        .gte('created_at', `${today}T00:00:00Z`)
        .lte('created_at', `${today}T23:59:59Z`);

      const costs = costData || [];
      const totalCost = costs.reduce((sum: number, r: any) => sum + (r.estimated_cost_usd || 0), 0);
      const totalCalls = costs.length;

      // Find top component
      const componentCosts: Record<string, number> = {};
      for (const r of costs) {
        componentCosts[r.component] = (componentCosts[r.component] || 0) + (r.estimated_cost_usd || 0);
      }
      const topComponent = Object.entries(componentCosts).sort((a, b) => b[1] - a[1])[0];

      // Get budget config
      const { data: budgetData } = await supabase
        .from('cost_budget_config')
        .select('daily_llm_budget, hard_stop_pct, alert_threshold_pct')
        .limit(1)
        .single();

      const dailyBudget = budgetData?.daily_llm_budget || 2.00;
      const hardStopPct = budgetData?.hard_stop_pct || 100;
      const budgetUsedPct = dailyBudget > 0 ? (totalCost / dailyBudget) * 100 : 0;

      return {
        totalCost: Math.round(totalCost * 1_000_000) / 1_000_000,
        totalCalls,
        dailyBudget,
        budgetUsedPct: Math.round(budgetUsedPct * 10) / 10,
        topComponent: topComponent?.[0] || 'none',
        topComponentCost: Math.round((topComponent?.[1] || 0) * 1_000_000) / 1_000_000,
        isOverBudget: budgetUsedPct >= (budgetData?.alert_threshold_pct || 80),
        shouldHardStop: budgetUsedPct >= hardStopPct,
      };
    } catch (err: any) {
      log(`Warning: Failed to get cost status: ${err.message}`);
      return {
        totalCost: 0,
        totalCalls: 0,
        dailyBudget: 2.00,
        budgetUsedPct: 0,
        topComponent: 'unknown',
        topComponentCost: 0,
        isOverBudget: false,
        shouldHardStop: false,
      };
    }
  }

  /**
   * Get a cost summary grouped by day, component, and model.
   */
  async function getCostSummary(startDate: string, endDate: string): Promise<CostSummary[]> {
    try {
      const { data, error } = await supabase.rpc('get_cost_summary', {
        p_start_date: startDate,
        p_end_date: endDate,
      });

      if (error) {
        log(`Warning: RPC get_cost_summary failed: ${error.message}. Falling back to direct query.`);

        // Fallback: direct query
        const { data: fallbackData } = await supabase
          .from('llm_cost_log')
          .select('component, model, input_tokens, output_tokens, estimated_cost_usd, created_at')
          .gte('created_at', `${startDate}T00:00:00Z`)
          .lte('created_at', `${endDate}T23:59:59Z`)
          .order('created_at', { ascending: false });

        if (!fallbackData) return [];

        // Group manually
        const grouped: Record<string, CostSummary> = {};
        for (const r of fallbackData) {
          const date = r.created_at.split('T')[0];
          const key = `${date}|${r.component}|${r.model}`;
          if (!grouped[key]) {
            grouped[key] = {
              period: date,
              component: r.component,
              model: r.model,
              totalCalls: 0,
              totalInputTokens: 0,
              totalOutputTokens: 0,
              totalCost: 0,
            };
          }
          grouped[key].totalCalls++;
          grouped[key].totalInputTokens += r.input_tokens || 0;
          grouped[key].totalOutputTokens += r.output_tokens || 0;
          grouped[key].totalCost += r.estimated_cost_usd || 0;
        }

        return Object.values(grouped).sort((a, b) => b.period.localeCompare(a.period) || b.totalCost - a.totalCost);
      }

      return (data || []).map((r: any) => ({
        period: r.period,
        component: r.component,
        model: r.model,
        totalCalls: Number(r.total_calls),
        totalInputTokens: Number(r.total_input_tokens),
        totalOutputTokens: Number(r.total_output_tokens),
        totalCost: Number(r.total_cost),
      }));
    } catch (err: any) {
      log(`Warning: Failed to get cost summary: ${err.message}`);
      return [];
    }
  }

  /**
   * Generate a comprehensive cost report.
   */
  async function generateCostReport(days: number = 30): Promise<CostReport> {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

    const summary = await getCostSummary(startDate, endDate);

    // Aggregate by component
    const byComponent: Record<string, { calls: number; tokens: number; cost: number }> = {};
    const byModel: Record<string, { calls: number; tokens: number; cost: number }> = {};
    const dailyMap: Record<string, { llmCost: number; awsCost: number }> = {};

    let totalLLMCost = 0;

    for (const s of summary) {
      // By component
      if (!byComponent[s.component]) byComponent[s.component] = { calls: 0, tokens: 0, cost: 0 };
      byComponent[s.component].calls += s.totalCalls;
      byComponent[s.component].tokens += s.totalInputTokens + s.totalOutputTokens;
      byComponent[s.component].cost += s.totalCost;

      // By model
      if (!byModel[s.model]) byModel[s.model] = { calls: 0, tokens: 0, cost: 0 };
      byModel[s.model].calls += s.totalCalls;
      byModel[s.model].tokens += s.totalInputTokens + s.totalOutputTokens;
      byModel[s.model].cost += s.totalCost;

      // Daily
      if (!dailyMap[s.period]) dailyMap[s.period] = { llmCost: 0, awsCost: 0 };
      dailyMap[s.period].llmCost += s.totalCost;

      totalLLMCost += s.totalCost;
    }

    // Get AWS costs
    let totalAWSCost = 0;
    try {
      const { data: awsData } = await supabase
        .from('aws_cost_snapshots')
        .select('period_start, total_aws_cost')
        .gte('period_start', startDate)
        .lte('period_end', endDate);

      for (const a of awsData || []) {
        totalAWSCost += Number(a.total_aws_cost || 0);
        const dateKey = a.period_start;
        if (dailyMap[dateKey]) {
          dailyMap[dateKey].awsCost += Number(a.total_aws_cost || 0);
        }
      }
    } catch {
      // AWS cost table might not exist
    }

    // Get budget
    let monthlyBudget = 70; // default $70
    try {
      const { data: budgetData } = await supabase
        .from('cost_budget_config')
        .select('monthly_llm_budget, monthly_aws_budget')
        .limit(1)
        .single();
      if (budgetData) {
        monthlyBudget = (budgetData.monthly_llm_budget || 50) + (budgetData.monthly_aws_budget || 20);
      }
    } catch {
      // Budget table might not exist
    }

    const dailyTrend = Object.entries(dailyMap)
      .map(([date, costs]) => ({
        date,
        llmCost: Math.round(costs.llmCost * 1_000_000) / 1_000_000,
        awsCost: Math.round(costs.awsCost * 10000) / 10000,
        totalCost: Math.round((costs.llmCost + costs.awsCost) * 10000) / 10000,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Project monthly total
    const daysElapsed = Math.max(1, dailyTrend.length);
    const dailyAvg = (totalLLMCost + totalAWSCost) / daysElapsed;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - now.getDate();

    return {
      startDate,
      endDate,
      totalLLMCost: Math.round(totalLLMCost * 1_000_000) / 1_000_000,
      totalAWSCost: Math.round(totalAWSCost * 10000) / 10000,
      totalCost: Math.round((totalLLMCost + totalAWSCost) * 10000) / 10000,
      byComponent,
      byModel,
      dailyTrend,
      monthlyBudget,
      monthlySpent: Math.round((totalLLMCost + totalAWSCost) * 10000) / 10000,
      monthlyRemaining: Math.round((monthlyBudget - totalLLMCost - totalAWSCost) * 10000) / 10000,
      daysRemaining,
      projectedMonthlyTotal: Math.round(dailyAvg * daysInMonth * 10000) / 10000,
    };
  }

  /**
   * Check if we should throttle LLM calls based on budget.
   */
  async function shouldThrottle(): Promise<boolean> {
    const status = await getTodayCostStatus();
    return status.shouldHardStop;
  }

  /**
   * Log an AWS cost snapshot.
   */
  async function logAWSCostSnapshot(costs: {
    periodStart: string;
    periodEnd: string;
    fargate: number;
    cloudwatch: number;
    ecr: number;
    dataTransfer: number;
    codebuild: number;
    other: number;
    rawResponse?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const { error } = await supabase.from('aws_cost_snapshots').insert({
        period_start: costs.periodStart,
        period_end: costs.periodEnd,
        fargate_cost: costs.fargate,
        cloudwatch_cost: costs.cloudwatch,
        ecr_cost: costs.ecr,
        data_transfer_cost: costs.dataTransfer,
        codebuild_cost: costs.codebuild,
        other_cost: costs.other,
        raw_response: costs.rawResponse || {},
      });

      if (error) {
        log(`Warning: Failed to log AWS cost snapshot: ${error.message}`);
      }
    } catch (err: any) {
      log(`Warning: AWS cost snapshot error: ${err.message}`);
    }
  }

  return {
    logLLMCall,
    getTodayCostStatus,
    getCostSummary,
    generateCostReport,
    shouldThrottle,
    estimateCost,
    logAWSCostSnapshot,
  };
}
