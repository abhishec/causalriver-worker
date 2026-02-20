/**
 * CashFlowProphet — Weekly AAA-S causal cash flow forecasting
 *
 * Uses NexusBrain's causal graph to generate 13-week cash flow forecasts
 * that factor in cross-domain signals:
 * - hiring plan -> salary burn -> cash outflow
 * - deal pipeline -> conversion probability -> cash inflow
 * - seasonal patterns -> customer payment delays
 *
 * Compares to last week's forecast to track forecast accuracy,
 * feeding that back as a signal for the brain to learn from.
 *
 * Schedule: Weekly (Monday morning, 8 AM)
 */

import type { NexusClient } from '@nexus-ai/client';
import type { PluginConfig } from '../config.js';
import { assembleCashFlowInputs } from '@nexus-ai/memory-stack';
import { generateCashFlowForecast, compareForecastToActuals } from '@nexus-ai/memory-stack';
import type { CashFlowForecast, ForecastComparison, WeeklyProjection } from '@nexus-ai/memory-stack';

// ============================================================================
// TYPES
// ============================================================================

export interface CashFlowReport {
  ran: boolean;
  summary: string;
  risks: string[];
  forecast?: CashFlowForecast;
  priorComparison?: ForecastComparison;
  recommendations?: Array<{ action: string; urgency: string; potentialImpact: number }>;
}

// ============================================================================
// CORE EXECUTION
// ============================================================================

export async function runCashFlowForecast(
  client: NexusClient,
  log?: (level: string, msg: string) => void,
): Promise<CashFlowReport> {
  try {
    log?.('info', 'CashFlowProphet: assembling financial data...');

    // Get the Supabase client from NexusClient internals
    const supabase = (client as any)._supabase || (client as any).supabase;
    const orgId = (client as any)._organizationId || (client as any).organizationId;

    if (!supabase || !orgId) {
      // Fallback to brain query if no direct DB access
      return await runCashFlowForecastViaQuery(client, log);
    }

    // ── Step 1: Assemble real data ────────────────────────────────────────
    const inputs = await assembleCashFlowInputs(supabase, orgId);

    log?.('info', `CashFlowProphet: data assembled — ${inputs.receivables.length} receivables, ` +
      `${inputs.pipelineDeals.length} pipeline deals, ${inputs.hiringPlan.length} hires`);

    // ── Step 2: Generate forecast ─────────────────────────────────────────
    const forecast = generateCashFlowForecast(inputs, 13);

    // ── Step 3: Compare to prior forecast ─────────────────────────────────
    let priorComparison: ForecastComparison | undefined;
    if (inputs.historicalForecasts.length > 0) {
      const priorPredictions = inputs.historicalForecasts[0].forecastData as WeeklyProjection[] | null;
      if (priorPredictions && Array.isArray(priorPredictions)) {
        const actuals = inputs.bankBalances.map((b, i) => ({ week: i + 1, actual: b.balance }));
        if (actuals.length > 0) {
          priorComparison = compareForecastToActuals(priorPredictions, actuals);
        }
      }
    }

    // ── Step 4: Store forecast ────────────────────────────────────────────
    try {
      await supabase.from('cash_flow_forecasts').insert({
        organization_id: orgId,
        forecast_date: inputs.asOfDate,
        horizon_weeks: 13,
        forecast_data: forecast.predictions,
        comparison_data: inputs.historicalForecasts[0]?.forecastData || null,
        accuracy_metrics: priorComparison || null,
        risk_summary: {
          criticalWeeks: forecast.criticalWeeks,
          risks: forecast.risks,
          overallConfidence: forecast.overallConfidence,
          causalNarrative: forecast.causalNarrative,
        },
      });
    } catch (err) {
      log?.('warn', `CashFlowProphet: failed to store forecast: ${err}`);
    }

    // ── Step 5: Ingest signal for brain learning ──────────────────────────
    await client.ingest([{
      source_domain: 'finance',
      signal_type: 'cash_flow_forecast',
      signal_value: forecast.overallConfidence,
      metadata: {
        forecast_by: 'openclaw-cash-flow-prophet',
        risk_count: forecast.risks.length,
        has_critical_weeks: forecast.criticalWeeks.length > 0,
        runway_weeks: forecast.runwayWeeks,
        min_cash_position: forecast.minCashPosition,
        prior_accuracy_mape: priorComparison?.mape,
      },
    }]);

    log?.('info', `CashFlowProphet: forecast generated — runway ${forecast.runwayWeeks}wk, ` +
      `${forecast.risks.length} risk(s), confidence ${(forecast.overallConfidence * 100).toFixed(0)}%`);

    return {
      ran: true,
      summary: forecast.causalNarrative,
      risks: forecast.risks.map(r => `Week ${r.week}: ${r.risk}`),
      forecast,
      priorComparison,
    };
  } catch (err) {
    log?.('warn', `CashFlowProphet: forecast failed — ${err}`);
    return { ran: false, summary: '', risks: [] };
  }
}

/**
 * Fallback: query the brain directly if no Supabase access
 */
async function runCashFlowForecastViaQuery(
  client: NexusClient,
  log?: (level: string, msg: string) => void,
): Promise<CashFlowReport> {
  const result = await client.query(
    'Generate a 13-week cash flow forecast using causal signals. Include: ' +
    '1. Cash inflow projections (deal pipeline, renewals, expected payments) ' +
    '2. Cash outflow projections (payroll, vendors, infrastructure, debt service) ' +
    '3. Net cash position per week ' +
    '4. Risk factors: which deals might slip, which expenses might spike ' +
    '5. Causal evidence for each projection (not just trends — causal drivers) ' +
    '6. Comparison to last forecast if available ' +
    'Flag any weeks where cash position is projected to be critical.',
    { domain: 'finance' },
  );

  const risks: string[] = [];
  const riskMatches = result.answer.match(/(?:risk|critical|warning|concern)[:.]?\s*(.+?)(?:\n|$)/gi);
  if (riskMatches) {
    for (const match of riskMatches.slice(0, 5)) {
      risks.push(match.trim());
    }
  }

  await client.ingest([{
    source_domain: 'finance',
    signal_type: 'cash_flow_forecast',
    signal_value: 1,
    metadata: {
      forecast_by: 'openclaw-cash-flow-prophet-fallback',
      risk_count: risks.length,
      has_critical_weeks: result.answer.toLowerCase().includes('critical'),
    },
  }]);

  log?.('info', `CashFlowProphet (fallback): forecast generated with ${risks.length} risk(s)`);

  return { ran: true, summary: result.answer, risks };
}

// ============================================================================
// SERVICE REGISTRATION
// ============================================================================

export function registerCashFlowProphet(
  api: { registerService(def: { id: string; start(): Promise<void> | void; stop?(): void }): void; log?(level: string, msg: string): void },
  config: PluginConfig,
): void {
  if (!config.proactive.cashFlowProphetEnabled) {
    api.log?.('info', 'CashFlowProphet: disabled in config');
    return;
  }

  let intervalId: ReturnType<typeof setInterval> | null = null;
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

  api.registerService({
    id: 'nexusbrain-cash-flow-prophet',

    async start() {
      api.log?.('info', 'CashFlowProphet: starting (weekly, Monday 8 AM)');

      // Calculate ms until next Monday 8 AM
      const now = new Date();
      const next = new Date(now);
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
      const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? (now.getHours() < 8 ? 0 : 7) : 8 - dayOfWeek;
      next.setDate(now.getDate() + daysUntilMonday);
      next.setHours(8, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 7);
      const msUntilFirst = next.getTime() - now.getTime();

      setTimeout(async () => {
        await runCashFlowForecast(config.client, api.log?.bind(api));
        intervalId = setInterval(async () => {
          try {
            await runCashFlowForecast(config.client, api.log?.bind(api));
          } catch (err) {
            api.log?.('error', `CashFlowProphet: unhandled error: ${err}`);
          }
        }, ONE_WEEK);
      }, msUntilFirst);

      api.log?.('info', `CashFlowProphet: next run in ${(msUntilFirst / 3600000).toFixed(1)}h`);
    },

    stop() {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    },
  });
}
