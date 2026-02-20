/**
 * ConsolidationRunner — Triggers nightly brain sleep cycle
 *
 * Calls NexusBrain's cron endpoint to run:
 * - prediction_verification: Check past predictions against outcomes
 * - threshold_optimization: Tune signal thresholds using ROC analysis
 * - evidence_decay: Age out stale causal relationships
 *
 * Then generates a "What the brain learned today" report and sends
 * it to the configured admin channel.
 *
 * Schedule: Daily at configured hour (default: 2 AM)
 */

import type { NexusClient } from '@nexus-ai/client';
import type { PluginConfig } from '../config.js';

interface OpenClawApi {
  log?(level: string, message: string): void;
  registerService(def: { id: string; start(): Promise<void> | void; stop?(): Promise<void> | void }): void;
  on?(event: string, handler: (...args: unknown[]) => Promise<void> | void): void;
}

export async function runConsolidation(
  client: NexusClient,
  log?: (level: string, msg: string) => void,
): Promise<{ success: boolean; report: string }> {
  log?.('info', 'ConsolidationRunner: starting nightly consolidation cycle');
  const start = Date.now();

  try {
    // Run all maintenance tasks
    const cronResult = await client.cron([
      'prediction_verification',
      'threshold_optimization',
      'evidence_decay',
    ]);

    const duration = Date.now() - start;

    // Generate "What brain learned today" report
    const reportResult = await client.query(
      'Generate a brief "What the brain learned today" summary. Include: ' +
      '1. Number of predictions verified and accuracy rate ' +
      '2. Causal edges strengthened or weakened ' +
      '3. New patterns discovered ' +
      '4. Any anomalies detected ' +
      '5. Overall brain health assessment ' +
      'Keep it concise — this goes to the admin team.',
    );

    const report = [
      '## NexusBrain Daily Consolidation Report',
      '',
      `Duration: ${(duration / 1000).toFixed(1)}s`,
      `Organizations processed: ${cronResult.organizationsProcessed}`,
      '',
      ...cronResult.results.map(r => `- ${r.task}: ${r.status} (${r.durationMs}ms)`),
      '',
      '### What the brain learned today',
      '',
      reportResult.answer,
    ].join('\n');

    log?.('info', `ConsolidationRunner: completed in ${duration}ms`);
    return { success: true, report };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log?.('error', `ConsolidationRunner: failed — ${message}`);
    return { success: false, report: `Consolidation failed: ${message}` };
  }
}

export function registerConsolidationRunner(
  api: OpenClawApi,
  config: PluginConfig,
): void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  api.registerService({
    id: 'nexusbrain-consolidation-runner',

    async start() {
      const cronHour = config.reinforcement.consolidationCronHour;
      api.log?.('info', `ConsolidationRunner: starting (daily at ${cronHour}:00)`);

      // Calculate ms until next cron hour
      const now = new Date();
      const next = new Date(now);
      next.setHours(cronHour, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      const msUntilFirst = next.getTime() - now.getTime();

      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

      timeoutId = setTimeout(async () => {
        // Run first consolidation
        await runConsolidation(config.client, api.log?.bind(api));

        // Then every 24 hours
        intervalId = setInterval(async () => {
          try {
            await runConsolidation(config.client, api.log?.bind(api));
          } catch (err) {
            api.log?.('error', `ConsolidationRunner: unhandled error: ${err}`);
          }
        }, TWENTY_FOUR_HOURS);
      }, msUntilFirst);

      api.log?.('info', `ConsolidationRunner: next run in ${(msUntilFirst / 3600000).toFixed(1)}h`);
    },

    stop() {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      timeoutId = null;
      intervalId = null;
      api.log?.('info', 'ConsolidationRunner: stopped');
    },
  });
}
