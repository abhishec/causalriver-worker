/**
 * RevenueLeakageDetector — Daily AAA-S revenue leakage scanning
 *
 * Uses NexusBrain's cross-validation intelligence to detect
 * revenue leakage from under-billing, missed renewals, and pricing gaps.
 *
 * Schedule: Daily (6 AM)
 */

import type { NexusClient } from '@nexus-ai/client';
import type { PluginConfig } from '../config.js';

interface LeakageReport {
  ran: boolean;
  summary: string;
  findingsCount: number;
  totalLeakage: number;
}

export async function runRevenueLeakageScan(
  client: NexusClient,
  log?: (level: string, msg: string) => void,
): Promise<LeakageReport> {
  try {
    const result = await client.query(
      'Scan for revenue leakage across all active contracts. Check for: ' +
      '1. Under-billing: usage exceeding contracted tier thresholds ' +
      '2. Missed renewals: expired contracts without renewal invoices ' +
      '3. Unapplied price escalation: annual increase clauses not applied ' +
      '4. Overage gaps: usage exceeding thresholds without overage invoices ' +
      '5. Pricing errors: invoice amounts not matching contract tiers ' +
      'Return total leakage amount and top affected accounts.',
      { domain: 'finance' },
    );

    await client.ingest([{
      source_domain: 'finance',
      signal_type: 'revenue_leakage_scan',
      signal_value: 1,
      metadata: {
        scanned_by: 'openclaw-revenue-leakage-detector',
        has_findings: result.answer.toLowerCase().includes('leakage') || result.answer.toLowerCase().includes('under-bill'),
      },
    }]);

    log?.('info', 'RevenueLeakageDetector: scan completed');

    return {
      ran: true,
      summary: result.answer,
      findingsCount: 0,
      totalLeakage: 0,
    };
  } catch (err) {
    log?.('warn', `RevenueLeakageDetector: scan failed — ${err}`);
    return { ran: false, summary: '', findingsCount: 0, totalLeakage: 0 };
  }
}

export function registerRevenueLeakageDetector(
  api: { registerService(def: { id: string; start(): Promise<void> | void; stop?(): void }): void; log?(level: string, msg: string): void },
  config: PluginConfig,
): void {
  if (!config.proactive.revenueLeakageDetectorEnabled) {
    api.log?.('info', 'RevenueLeakageDetector: disabled in config');
    return;
  }

  let intervalId: ReturnType<typeof setInterval> | null = null;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  api.registerService({
    id: 'nexusbrain-revenue-leakage-detector',

    async start() {
      api.log?.('info', 'RevenueLeakageDetector: starting (daily at 6 AM)');

      const now = new Date();
      const next = new Date(now);
      next.setHours(6, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      const msUntilFirst = next.getTime() - now.getTime();

      setTimeout(async () => {
        await runRevenueLeakageScan(config.client, api.log?.bind(api));
        intervalId = setInterval(async () => {
          try {
            await runRevenueLeakageScan(config.client, api.log?.bind(api));
          } catch (err) {
            api.log?.('error', `RevenueLeakageDetector: unhandled error: ${err}`);
          }
        }, TWENTY_FOUR_HOURS);
      }, msUntilFirst);

      api.log?.('info', `RevenueLeakageDetector: next run in ${(msUntilFirst / 3600000).toFixed(1)}h`);
    },

    stop() {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    },
  });
}
