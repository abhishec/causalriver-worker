/**
 * CashFlowProphet — Weekly AAA-S causal cash flow forecasting
 *
 * Uses NexusBrain's causal graph to generate cash flow forecasts
 * that factor in cross-domain signals:
 * - hiring plan → salary burn → cash outflow
 * - deal pipeline → conversion probability → cash inflow
 * - seasonal patterns → customer payment delays
 *
 * Compares to last week's forecast to track forecast accuracy,
 * feeding that back as a signal for the brain to learn from.
 *
 * Schedule: Weekly (Monday morning)
 */

import type { NexusClient } from '@nexus-ai/client';
import type { PluginConfig } from '../config.js';

interface CashFlowReport {
  ran: boolean;
  summary: string;
  risks: string[];
}

export async function runCashFlowForecast(
  client: NexusClient,
  log?: (level: string, msg: string) => void,
): Promise<CashFlowReport> {
  try {
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

    // Extract risk mentions
    const risks: string[] = [];
    const riskMatches = result.answer.match(/(?:risk|critical|warning|concern)[:.]?\s*(.+?)(?:\n|$)/gi);
    if (riskMatches) {
      for (const match of riskMatches.slice(0, 5)) {
        risks.push(match.trim());
      }
    }

    // Ingest forecast run as a signal (for tracking forecast accuracy over time)
    await client.ingest([{
      source_domain: 'finance',
      signal_type: 'cash_flow_forecast',
      signal_value: 1,
      metadata: {
        forecast_by: 'openclaw-cash-flow-prophet',
        risk_count: risks.length,
        has_critical_weeks: result.answer.toLowerCase().includes('critical'),
      },
    }]);

    log?.('info', `CashFlowProphet: forecast generated with ${risks.length} risk(s)`);

    return {
      ran: true,
      summary: result.answer,
      risks,
    };
  } catch (err) {
    log?.('warn', `CashFlowProphet: forecast failed — ${err}`);
    return { ran: false, summary: '', risks: [] };
  }
}

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
