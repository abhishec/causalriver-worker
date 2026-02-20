/**
 * Cash Flow Prophet Agent — Weekly Causal Cash Flow Forecasting
 * ==============================================================
 *
 * Brain agent that generates 13-week causal cash flow forecasts.
 *
 * Uses NexusBrain's causal graph to connect cross-domain signals:
 *   - Hiring plan → salary burn → cash outflow
 *   - Deal pipeline → conversion probability → cash inflow
 *   - Seasonal patterns → customer payment delays
 *
 * Compares to last week's forecast to track forecast accuracy,
 * feeding that back as a signal for the brain to learn from.
 *
 * @packageDocumentation
 */

import { defineAgent, type AgentDefinition } from './agent-registry';
import { assembleCashFlowInputs } from '../causality/cash-flow-data-pipeline';
import {
  generateCashFlowForecast,
  compareForecastToActuals,
  type CashFlowForecast,
  type ForecastComparison,
  type WeeklyProjection,
} from '../causality/cash-flow-forecaster';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface CashFlowProphetInput {
  organizationId: string;
  forecastDate?: string;
  horizonWeeks?: number;
  /** Supabase client passed through execution context */
  supabase?: SupabaseClient;
}

export interface CashFlowProphetOutput {
  forecast: CashFlowForecast;
  priorComparison?: ForecastComparison;
  summary: string;
  recommendations: Array<{
    action: string;
    urgency: 'immediate' | 'this_week' | 'this_month';
    potentialImpact: number;
  }>;
  /** Date this forecast was generated */
  generatedAt: string;
}

// ============================================================================
// AGENT DEFINITION
// ============================================================================

export const brainCashFlowProphetAgent: AgentDefinition<
  CashFlowProphetInput,
  CashFlowProphetOutput
> = defineAgent({
  name: 'brain-cash-flow-prophet',
  description: 'Generates 13-week causal cash flow forecast with risk analysis and accuracy tracking',
  level: 'autonomous',
  version: '1.0.0',
  domains: ['statement-synthesize', 'cross-validate'],
  triggers: ['schedule:weekly_monday', 'command:cash_forecast'],
  tools: ['statement-synthesize', 'cross-validate'],
  timeoutMs: 120000,
  maxRetries: 1,

  inputSchema: {
    organizationId: 'Organization ID for data retrieval',
    forecastDate: 'Forecast reference date (default: today)',
    horizonWeeks: 'Number of weeks to forecast (default: 13)',
  },
  outputSchema: {
    forecast: '13-week cash flow projections with risk assessment',
    priorComparison: 'Accuracy comparison to previous forecast',
    summary: 'Human-readable forecast summary',
    recommendations: 'Prioritized action items based on forecast',
  },
  tags: ['accounting', 'cash-flow', 'forecasting', 'proactive'],

  execute: async (input, ctx) => {
    const { organizationId, horizonWeeks = 13 } = input;
    const supabase = input.supabase || (ctx as any).supabase;

    ctx.log(`[brain-cash-flow-prophet] Starting ${horizonWeeks}-week forecast for org ${organizationId.slice(0, 8)}`);
    ctx.reportProgress(0.1, 'Assembling financial data from all sources...');

    // ── Step 1: Assemble real data from signal system ─────────────────────
    const inputs = await assembleCashFlowInputs(supabase, organizationId);

    ctx.log(`[brain-cash-flow-prophet] Data assembled: ${inputs.bankBalances.length} bank balances, ` +
      `${inputs.receivables.length} receivables, ${inputs.payables.length} payables, ` +
      `${inputs.pipelineDeals.length} pipeline deals, ${inputs.hiringPlan.length} hires`);
    ctx.reportProgress(0.4, 'Running causal forecast engine...');

    // ── Step 2: Generate forecast ─────────────────────────────────────────
    const forecast = generateCashFlowForecast(inputs, horizonWeeks);

    ctx.reportProgress(0.7, 'Comparing to prior forecast...');

    // ── Step 3: Compare to prior forecast for accuracy tracking ───────────
    let priorComparison: ForecastComparison | undefined;
    if (inputs.historicalForecasts.length > 0) {
      const latestPrior = inputs.historicalForecasts[0];
      const priorPredictions = latestPrior.forecastData as WeeklyProjection[] | null;
      if (priorPredictions && Array.isArray(priorPredictions)) {
        // Use current bank balances as "actuals" for weeks that have passed
        const actuals = inputs.bankBalances.map((b, i) => ({
          week: i + 1,
          actual: b.balance,
        }));
        if (actuals.length > 0) {
          priorComparison = compareForecastToActuals(priorPredictions, actuals);
        }
      }
    }

    ctx.reportProgress(0.85, 'Generating recommendations...');

    // ── Step 4: Generate recommendations ──────────────────────────────────
    const recommendations = generateRecommendations(forecast, inputs);

    // ── Step 5: Store forecast in database ─────────────────────────────────
    ctx.reportProgress(0.95, 'Storing forecast...');
    try {
      await supabase.from('cash_flow_forecasts').insert({
        organization_id: organizationId,
        forecast_date: inputs.asOfDate,
        horizon_weeks: horizonWeeks,
        forecast_data: forecast.predictions,
        comparison_data: inputs.historicalForecasts[0]?.forecastData || null,
        accuracy_metrics: priorComparison || null,
        risk_summary: {
          criticalWeeks: forecast.criticalWeeks,
          risks: forecast.risks,
          totalRiskScore: forecast.risks.reduce((s, r) => s + (r.severity === 'high' ? 3 : r.severity === 'medium' ? 2 : 1), 0),
          overallConfidence: forecast.overallConfidence,
          causalNarrative: forecast.causalNarrative,
        },
      });
    } catch (err) {
      ctx.log(`[brain-cash-flow-prophet] Failed to store forecast: ${err}`);
    }

    ctx.reportProgress(1.0, 'Forecast complete');

    return {
      forecast,
      priorComparison,
      summary: forecast.causalNarrative,
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  },
});

// ============================================================================
// HELPERS
// ============================================================================

function generateRecommendations(
  forecast: CashFlowForecast,
  inputs: { receivables: Array<{ clientName: string; amount: number; daysOverdue: number; collectionProbability: number }> },
): CashFlowProphetOutput['recommendations'] {
  const recs: CashFlowProphetOutput['recommendations'] = [];

  // Critical runway warning
  if (forecast.runwayWeeks < 8) {
    recs.push({
      action: `Runway at ${forecast.runwayWeeks} weeks — activate emergency cash preservation measures`,
      urgency: 'immediate',
      potentialImpact: Math.abs(forecast.minCashPosition),
    });
  }

  // AR collection acceleration
  const overdueReceivables = inputs.receivables.filter(r => r.daysOverdue > 30);
  if (overdueReceivables.length > 0) {
    const totalOverdue = overdueReceivables.reduce((s, r) => s + r.amount, 0);
    recs.push({
      action: `Accelerate collection on ${overdueReceivables.length} accounts totaling ${formatCurrency(totalOverdue)} overdue >30 days`,
      urgency: overdueReceivables.some(r => r.amount > 50000) ? 'immediate' : 'this_week',
      potentialImpact: totalOverdue,
    });
  }

  // High-risk week warning
  if (forecast.criticalWeeks.length > 0) {
    recs.push({
      action: `Cash critical in week(s) ${forecast.criticalWeeks.join(', ')} — defer non-essential expenditure or bridge`,
      urgency: forecast.criticalWeeks[0] <= 4 ? 'immediate' : 'this_week',
      potentialImpact: Math.abs(forecast.minCashPosition),
    });
  }

  // Low-probability high-value collections
  const riskyReceivables = inputs.receivables.filter(r => r.amount > 20000 && r.collectionProbability < 0.5);
  if (riskyReceivables.length > 0) {
    const top = riskyReceivables.sort((a, b) => b.amount - a.amount)[0];
    recs.push({
      action: `${top.clientName} owes ${formatCurrency(top.amount)} with ${Math.round(top.collectionProbability * 100)}% collection probability — escalate`,
      urgency: 'this_week',
      potentialImpact: top.amount,
    });
  }

  return recs.sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency));
}

function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const prefix = amount < 0 ? '-' : '';
  if (absAmount >= 1_000_000) return `${prefix}$${(absAmount / 1_000_000).toFixed(1)}M`;
  if (absAmount >= 1_000) return `${prefix}$${(absAmount / 1_000).toFixed(0)}K`;
  return `${prefix}$${absAmount.toFixed(0)}`;
}

function urgencyRank(u: string): number {
  return u === 'immediate' ? 1 : u === 'this_week' ? 2 : 3;
}
