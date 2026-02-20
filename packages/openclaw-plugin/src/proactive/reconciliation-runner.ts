/**
 * ReconciliationRunner — Nightly AAA-S bank reconciliation
 *
 * Uses NexusBrain's causal intelligence to perform automated
 * bank reconciliation. Matches transactions using fuzzy matching
 * plus causal context (e.g., "this $2,400 likely matches the
 * 3 Stripe payouts from yesterday based on historical patterns").
 *
 * Schedule: Nightly (after business hours)
 */

import type { NexusClient } from '@nexus-ai/client';
import type { PluginConfig } from '../config.js';

interface ReconciliationReport {
  ran: boolean;
  summary: string;
  matchedCount: number;
  unmatchedCount: number;
}

export async function runReconciliation(
  client: NexusClient,
  log?: (level: string, msg: string) => void,
): Promise<ReconciliationReport> {
  try {
    const result = await client.query(
      'Run an automated reconciliation check for the latest period. ' +
      '1. Identify any unmatched bank transactions vs GL entries ' +
      '2. For unmatched items, use causal context and historical patterns ' +
      '   to suggest likely matches ' +
      '3. Flag any suspicious discrepancies ' +
      '4. Compute match rate (% of transactions auto-matched) ' +
      'Return a structured reconciliation summary.',
      { domain: 'finance' },
    );

    // Ingest reconciliation run as a signal
    await client.ingest([{
      source_domain: 'finance',
      signal_type: 'reconciliation_check',
      signal_value: 1,
      metadata: {
        checked_by: 'openclaw-reconciliation-runner',
        has_unmatched: result.answer.toLowerCase().includes('unmatched'),
      },
    }]);

    const hasUnmatched = result.answer.toLowerCase().includes('unmatched');

    return {
      ran: true,
      summary: result.answer,
      matchedCount: 0, // Brain will provide in answer
      unmatchedCount: hasUnmatched ? 1 : 0,
    };
  } catch (err) {
    log?.('warn', `ReconciliationRunner: check failed — ${err}`);
    return { ran: false, summary: '', matchedCount: 0, unmatchedCount: 0 };
  }
}

export function registerReconciliationRunner(
  api: { registerService(def: { id: string; start(): Promise<void> | void; stop?(): void }): void; log?(level: string, msg: string): void },
  config: PluginConfig,
): void {
  if (!config.proactive.reconciliationRunnerEnabled) {
    api.log?.('info', 'ReconciliationRunner: disabled in config');
    return;
  }

  let intervalId: ReturnType<typeof setInterval> | null = null;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  api.registerService({
    id: 'nexusbrain-reconciliation-runner',

    async start() {
      api.log?.('info', 'ReconciliationRunner: starting (nightly at 11 PM)');

      const now = new Date();
      const next = new Date(now);
      next.setHours(23, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      const msUntilFirst = next.getTime() - now.getTime();

      setTimeout(async () => {
        await runReconciliation(config.client, api.log?.bind(api));
        intervalId = setInterval(async () => {
          try {
            await runReconciliation(config.client, api.log?.bind(api));
          } catch (err) {
            api.log?.('error', `ReconciliationRunner: unhandled error: ${err}`);
          }
        }, TWENTY_FOUR_HOURS);
      }, msUntilFirst);
    },

    stop() {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    },
  });
}
