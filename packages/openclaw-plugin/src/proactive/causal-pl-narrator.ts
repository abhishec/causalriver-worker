/**
 * CausalPLNarrator — Month-End Causal P&L Generation
 *
 * Automatically generates a causal P&L analysis on the 3rd business day
 * of each month, comparing current month to prior month.
 *
 * Schedule: 3rd business day of each month
 */

import type { NexusClient } from '@nexus-ai/client';
import type { PluginConfig } from '../config.js';

interface CausalPLReport {
  ran: boolean;
  summary: string;
  significantVariances: number;
}

export async function runCausalPLNarration(
  client: NexusClient,
  log?: (level: string, msg: string) => void,
): Promise<CausalPLReport> {
  try {
    const result = await client.query(
      'Generate a causal P&L analysis for the most recent completed month. ' +
      'Compare to the prior month and for each significant variance, ' +
      'explain WHY it changed using causal evidence from the brain. ' +
      'Include an executive summary suitable for board presentation.',
      { domain: 'finance' },
    );

    await client.ingest([{
      source_domain: 'finance',
      signal_type: 'causal_pl_narration',
      signal_value: 1,
      metadata: {
        generated_by: 'openclaw-causal-pl-narrator',
        has_significant_variances: result.answer.toLowerCase().includes('significant'),
      },
    }]);

    log?.('info', 'CausalPLNarrator: month-end analysis generated');

    return {
      ran: true,
      summary: result.answer,
      significantVariances: 0,
    };
  } catch (err) {
    log?.('warn', `CausalPLNarrator: generation failed — ${err}`);
    return { ran: false, summary: '', significantVariances: 0 };
  }
}

export function registerCausalPLNarrator(
  api: { registerService(def: { id: string; start(): Promise<void> | void; stop?(): void }): void; log?(level: string, msg: string): void },
  config: PluginConfig,
): void {
  if (!config.proactive.causalPLNarratorEnabled) {
    api.log?.('info', 'CausalPLNarrator: disabled in config');
    return;
  }

  let intervalId: ReturnType<typeof setInterval> | null = null;

  api.registerService({
    id: 'nexusbrain-causal-pl-narrator',

    async start() {
      api.log?.('info', 'CausalPLNarrator: starting (monthly, 3rd business day)');

      // Calculate ms until 3rd business day of next month
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      let businessDays = 0;
      const target = new Date(nextMonth);
      while (businessDays < 3) {
        const day = target.getDay();
        if (day !== 0 && day !== 6) businessDays++;
        if (businessDays < 3) target.setDate(target.getDate() + 1);
      }
      target.setHours(9, 0, 0, 0);

      const msUntilFirst = Math.max(0, target.getTime() - now.getTime());

      setTimeout(async () => {
        await runCausalPLNarration(config.client, api.log?.bind(api));
        // Schedule next run ~30 days later (will recalculate exact date)
        intervalId = setInterval(async () => {
          try {
            await runCausalPLNarration(config.client, api.log?.bind(api));
          } catch (err) {
            api.log?.('error', `CausalPLNarrator: unhandled error: ${err}`);
          }
        }, 30 * 24 * 60 * 60 * 1000);
      }, msUntilFirst);

      api.log?.('info', `CausalPLNarrator: next run in ${(msUntilFirst / 3600000 / 24).toFixed(1)} days`);
    },

    stop() {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    },
  });
}
